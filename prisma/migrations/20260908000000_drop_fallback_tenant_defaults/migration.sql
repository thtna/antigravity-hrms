-- ==============================================================================
-- MIGRATION 4: DROP LEGACY FALLBACK TENANT DEFAULTS
-- Removes 'org_default_tanphong' fallback default from 22 tenant-scoped tables
-- ==============================================================================

-- AlterTable
ALTER TABLE "attendance" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "attendance_adjustments" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "company_settings" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employee_bonuses_penalties" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employee_kpi_results" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employee_schedules" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "holidays" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "kpis" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_requests" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "leave_types" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payroll" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payroll_adjustments" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payroll_approvals" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payroll_periods" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payroll_rules" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "positions" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "qr_attendance_tokens" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recurring_schedules" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "work_shifts" ALTER COLUMN "organization_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "worksites" ALTER COLUMN "organization_id" DROP DEFAULT;
