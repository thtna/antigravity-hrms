-- ==============================================================================
-- PHASE 2: MULTI-TENANT DATABASE FOUNDATION MIGRATION (NON-DESTRUCTIVE)
-- Zero Data Loss Safe Migration
-- ==============================================================================

-- 1. Create Multi-Tenant Enums
DO $$ BEGIN
    CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'ADMIN', 'HR_MANAGER', 'MANAGER', 'EMPLOYEE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create organizations table
CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "tax_code" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");

-- 3. Seed Default Tenant (Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong)
INSERT INTO "organizations" ("id", "name", "slug", "status", "email", "phone", "address", "approved_at", "created_at", "updated_at")
VALUES (
    'org_default_tanphong',
    'Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong',
    'tan-phong',
    'ACTIVE',
    'contact@tanphong.vn',
    '02438889999',
    'Tầng 18, Tòa nhà Antigravity Center, Số 68 Cầu Giấy, Hà Nội',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- 4. Create organization_members table
CREATE TABLE IF NOT EXISTS "organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL DEFAULT 'EMPLOYEE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");
CREATE INDEX IF NOT EXISTS "organization_members_user_id_idx" ON "organization_members"("user_id");
CREATE INDEX IF NOT EXISTS "organization_members_organization_id_role_idx" ON "organization_members"("organization_id", "role");

-- 5. Create branches table
CREATE TABLE IF NOT EXISTS "branches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "branches_organization_id_code_key" ON "branches"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "branches_organization_id_idx" ON "branches"("organization_id");

-- Seed Default Branch
INSERT INTO "branches" ("id", "organization_id", "name", "code", "address", "phone", "is_active", "created_at", "updated_at")
VALUES (
    'branch_default_headquarters',
    'org_default_tanphong',
    'Trụ sở chính Hà Nội',
    'HQ-HN',
    'Tầng 18, Tòa nhà Antigravity Center, Số 68 Cầu Giấy, Hà Nội',
    '02438889999',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- 6. Link existing users to default organization with roles mapped from IAM
INSERT INTO "organization_members" ("id", "organization_id", "user_id", "role", "is_active", "created_at", "updated_at")
SELECT
    'mem_' || u."id",
    'org_default_tanphong',
    u."id",
    CASE
        WHEN EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON ur."role_id" = r."id" WHERE ur."user_id" = u."id" AND r."code" = 'admin') THEN 'OWNER'::"TenantRole"
        WHEN EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON ur."role_id" = r."id" WHERE ur."user_id" = u."id" AND r."code" = 'hr') THEN 'HR_MANAGER'::"TenantRole"
        WHEN EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON ur."role_id" = r."id" WHERE ur."user_id" = u."id" AND r."code" = 'manager') THEN 'MANAGER'::"TenantRole"
        ELSE 'EMPLOYEE'::"TenantRole"
    END,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users" u
ON CONFLICT ("organization_id", "user_id") DO NOTHING;

-- 7. Add organization_id to business models (with default 'org_default_tanphong')
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "worksites" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "worksites" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "work_shifts" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "employee_schedules" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "recurring_schedules" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;
ALTER TABLE "attendance_adjustments" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "qr_attendance_tokens" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "kpis" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "employee_kpi_results" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "employee_bonuses_penalties" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "payroll_rules" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "payroll_periods" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "payroll" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "payroll_approvals" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- 8. Migrate company_settings table to support multi-tenancy
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "id" TEXT;
UPDATE "company_settings" SET "id" = gen_random_uuid()::TEXT WHERE "id" IS NULL;
ALTER TABLE "company_settings" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "organization_id" TEXT NOT NULL DEFAULT 'org_default_tanphong';

DO $$ BEGIN
    ALTER TABLE "company_settings" DROP CONSTRAINT "company_settings_pkey";
    ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
DROP INDEX IF EXISTS "company_settings_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "company_settings_organization_id_key_key" ON "company_settings"("organization_id", "key");
CREATE INDEX IF NOT EXISTS "company_settings_organization_id_idx" ON "company_settings"("organization_id");

-- 9. Foreign Key Constraints for Business Tables
DO $$ BEGIN
    ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "positions" ADD CONSTRAINT "positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "worksites" ADD CONSTRAINT "worksites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "worksites" ADD CONSTRAINT "worksites_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "employee_schedules" ADD CONSTRAINT "employee_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "attendance_adjustments" ADD CONSTRAINT "attendance_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "qr_attendance_tokens" ADD CONSTRAINT "qr_attendance_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "kpis" ADD CONSTRAINT "kpis_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "employee_kpi_results" ADD CONSTRAINT "employee_kpi_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "employee_bonuses_penalties" ADD CONSTRAINT "employee_bonuses_penalties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "payroll" ADD CONSTRAINT "payroll_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "payroll_approvals" ADD CONSTRAINT "payroll_approvals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 10. Transform Unique Constraints from Single-Column to Tenant-Composite
DROP INDEX IF EXISTS "departments_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "departments_organization_id_code_key" ON "departments"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "departments_organization_id_idx" ON "departments"("organization_id");

DROP INDEX IF EXISTS "positions_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "positions_organization_id_code_key" ON "positions"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "positions_organization_id_idx" ON "positions"("organization_id");

DROP INDEX IF EXISTS "employees_employee_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "employees_organization_id_employee_code_key" ON "employees"("organization_id", "employee_code");

DROP INDEX IF EXISTS "employees_identity_card_key";
CREATE UNIQUE INDEX IF NOT EXISTS "employees_organization_id_identity_card_key" ON "employees"("organization_id", "identity_card");

CREATE INDEX IF NOT EXISTS "employees_organization_id_idx" ON "employees"("organization_id");
CREATE INDEX IF NOT EXISTS "employees_branch_id_idx" ON "employees"("branch_id");

DROP INDEX IF EXISTS "work_shifts_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "work_shifts_organization_id_code_key" ON "work_shifts"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "work_shifts_organization_id_idx" ON "work_shifts"("organization_id");

CREATE INDEX IF NOT EXISTS "employee_schedules_organization_id_idx" ON "employee_schedules"("organization_id");
CREATE INDEX IF NOT EXISTS "recurring_schedules_organization_id_idx" ON "recurring_schedules"("organization_id");

CREATE INDEX IF NOT EXISTS "attendance_organization_id_idx" ON "attendance"("organization_id");
CREATE INDEX IF NOT EXISTS "attendance_branch_id_idx" ON "attendance"("branch_id");

CREATE INDEX IF NOT EXISTS "attendance_adjustments_organization_id_idx" ON "attendance_adjustments"("organization_id");
CREATE INDEX IF NOT EXISTS "qr_attendance_tokens_organization_id_idx" ON "qr_attendance_tokens"("organization_id");

DROP INDEX IF EXISTS "leave_types_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "leave_types_organization_id_code_key" ON "leave_types"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "leave_types_organization_id_idx" ON "leave_types"("organization_id");

CREATE INDEX IF NOT EXISTS "leave_requests_organization_id_idx" ON "leave_requests"("organization_id");

DROP INDEX IF EXISTS "holidays_date_key";
CREATE UNIQUE INDEX IF NOT EXISTS "holidays_organization_id_date_key" ON "holidays"("organization_id", "date");
CREATE INDEX IF NOT EXISTS "holidays_organization_id_idx" ON "holidays"("organization_id");

DROP INDEX IF EXISTS "kpis_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "kpis_organization_id_code_key" ON "kpis"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "kpis_organization_id_idx" ON "kpis"("organization_id");

CREATE INDEX IF NOT EXISTS "employee_kpi_results_organization_id_idx" ON "employee_kpi_results"("organization_id");
CREATE INDEX IF NOT EXISTS "employee_bonuses_penalties_organization_id_idx" ON "employee_bonuses_penalties"("organization_id");

DROP INDEX IF EXISTS "payroll_rules_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_rules_organization_id_code_key" ON "payroll_rules"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "payroll_rules_organization_id_idx" ON "payroll_rules"("organization_id");

DROP INDEX IF EXISTS "payroll_periods_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_periods_organization_id_code_key" ON "payroll_periods"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "payroll_periods_organization_id_idx" ON "payroll_periods"("organization_id");

CREATE INDEX IF NOT EXISTS "payroll_organization_id_idx" ON "payroll"("organization_id");
CREATE INDEX IF NOT EXISTS "payroll_approvals_organization_id_idx" ON "payroll_approvals"("organization_id");
CREATE INDEX IF NOT EXISTS "payroll_adjustments_organization_id_idx" ON "payroll_adjustments"("organization_id");
CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_organization_id_user_id_idx" ON "notifications"("organization_id", "user_id");
