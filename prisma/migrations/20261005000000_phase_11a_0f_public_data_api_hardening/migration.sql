-- =============================================================================
-- PHASE 11A.0F — PUBLIC DATA API / RLS HARDENING
-- =============================================================================
-- Scope:
--   - Revoke direct public business-table privileges from anon/authenticated.
--   - Prevent future Prisma/postgres-created public objects from automatically
--     granting privileges to anon/authenticated.
--   - Enable RLS on the exact 34 existing public tables.
--   - Create NO anon/authenticated policies.
--
-- Preconditions:
--   - Must run as postgres.
--   - postgres must retain BYPASSRLS.
--   - Exact current 34-table topology must match the reviewed baseline.
--   - All 34 tables must still be owned by postgres.
--   - No public RLS policies may already exist.
--
-- Explicitly OUT OF SCOPE:
--   - Production.
--   - Supabase Storage schema/policies.
--   - Data API configuration.
--   - service_role privileges.
--   - FORCE ROW LEVEL SECURITY.
--   - supabase_admin default privileges.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. FAIL-CLOSED BASELINE GUARD
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  expected_tables text[] := ARRAY[
    '_prisma_migrations',
    'attendance',
    'attendance_adjustments',
    'audit_logs',
    'branches',
    'company_settings',
    'departments',
    'employee_bonuses_penalties',
    'employee_kpi_results',
    'employee_schedules',
    'employees',
    'holidays',
    'kpis',
    'leave_requests',
    'leave_types',
    'notifications',
    'organization_members',
    'organizations',
    'payroll',
    'payroll_adjustments',
    'payroll_approvals',
    'payroll_details',
    'payroll_periods',
    'payroll_rules',
    'permissions',
    'positions',
    'qr_attendance_tokens',
    'recurring_schedules',
    'role_permissions',
    'roles',
    'user_roles',
    'users',
    'work_shifts',
    'worksites'
  ];

  actual_tables text[];
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: expected current_user=postgres, got %',
      current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'postgres'
      AND rolbypassrls = true
  ) THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: postgres no longer has BYPASSRLS';
  END IF;

  SELECT array_agg(c.relname::text ORDER BY c.relname)
  INTO actual_tables
  FROM pg_class c
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r';

  IF actual_tables IS DISTINCT FROM expected_tables THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: public table topology drift detected. actual=%',
      actual_tables;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('p', 'v', 'm', 'S', 'f')
  ) THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: unexpected public relation type detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND pg_get_userbyid(c.relowner) <> 'postgres'
  ) THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: one or more public tables are not owned by postgres';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (c.relrowsecurity = true OR c.relforcerowsecurity = true)
  ) THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: RLS baseline drift detected';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: unexpected public RLS policies already exist';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. REMOVE CLIENT-ROLE TABLE PRIVILEGES
-- ---------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON TABLE
  public."_prisma_migrations",
  public."attendance",
  public."attendance_adjustments",
  public."audit_logs",
  public."branches",
  public."company_settings",
  public."departments",
  public."employee_bonuses_penalties",
  public."employee_kpi_results",
  public."employee_schedules",
  public."employees",
  public."holidays",
  public."kpis",
  public."leave_requests",
  public."leave_types",
  public."notifications",
  public."organization_members",
  public."organizations",
  public."payroll",
  public."payroll_adjustments",
  public."payroll_approvals",
  public."payroll_details",
  public."payroll_periods",
  public."payroll_rules",
  public."permissions",
  public."positions",
  public."qr_attendance_tokens",
  public."recurring_schedules",
  public."role_permissions",
  public."roles",
  public."user_roles",
  public."users",
  public."work_shifts",
  public."worksites"
FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. HARDEN DEFAULT PRIVILEGES FOR FUTURE OBJECTS CREATED BY postgres
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL PRIVILEGES ON TABLES
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE ALL PRIVILEGES ON SEQUENCES
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA public
REVOKE EXECUTE ON FUNCTIONS
FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. ENABLE RLS ON THE EXACT REVIEWED TABLE SET
--    No permissive policies are intentionally created.
-- ---------------------------------------------------------------------------

ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."attendance_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."company_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_bonuses_penalties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_kpi_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."kpis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."leave_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."leave_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."qr_attendance_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recurring_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."work_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."worksites" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. POST-MUTATION FAIL-CLOSED ASSERTIONS
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  rls_enabled_count integer;
  client_grant_count integer;
  service_role_select_count integer;
BEGIN
  SELECT count(*)
  INTO rls_enabled_count
  FROM pg_class c
  JOIN pg_namespace n
    ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
    AND c.relforcerowsecurity = false;

  IF rls_enabled_count <> 34 THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: expected 34 RLS-enabled tables, got %',
      rls_enabled_count;
  END IF;

  SELECT count(*)
  INTO client_grant_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated');

  IF client_grant_count <> 0 THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: anon/authenticated table grants remain: %',
      client_grant_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
  ) THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: unexpected public RLS policy exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_namespace n
      ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) x
    JOIN pg_roles owner_role
      ON owner_role.oid = d.defaclrole
    JOIN pg_roles grantee_role
      ON grantee_role.oid = x.grantee
    WHERE owner_role.rolname = 'postgres'
      AND n.nspname = 'public'
      AND grantee_role.rolname IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: postgres default ACL still grants anon/authenticated';
  END IF;

  SELECT count(DISTINCT table_name)
  INTO service_role_select_count
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee = 'service_role'
    AND privilege_type = 'SELECT';

  IF service_role_select_count <> 34 THEN
    RAISE EXCEPTION
      'PHASE_11A_0F_ABORT: service_role SELECT coverage drift: %',
      service_role_select_count;
  END IF;
END
$$;

COMMIT;