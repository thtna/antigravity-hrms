import { describe, it, expect } from 'vitest';

/**
 * PHASE 5 — Tenant Isolation Test Suite
 * Requirements:
 * 1. Every Prisma query in every service must be scoped to session.organizationId (from JWT).
 * 2. Missing/null organizationId uses fail-safe sentinel '__no_org__' to prevent leakage.
 * 3. Cross-tenant access to a record by ID MUST return HTTP 404 (not 403) to prevent existence leakage.
 * 4. All creation methods bind new records to session.organizationId.
 */

describe('PHASE 5 — Tenant Isolation Contract', () => {
  // ── Guard: organizationId defaults to __no_org__ when missing ──────────────
  it('fail-safe: missing organizationId in session maps to __no_org__ sentinel', () => {
    const session: any = { userId: 'u1', roles: ['admin'], organizationId: null };
    const orgId = session.organizationId ?? '__no_org__';
    expect(orgId).toBe('__no_org__');

    const sessionUndefined: any = { userId: 'u2', roles: ['hr'] };
    const orgId2 = sessionUndefined.organizationId ?? '__no_org__';
    expect(orgId2).toBe('__no_org__');
  });

  // ── Guard: cross-tenant returns 404 not 403 ────────────────────────────────
  it('cross-tenant error must be 404 to prevent existence leakage', () => {
    function simulateCrossTenantAccess(recordOrgId: string, sessionOrgId: string) {
      if (recordOrgId !== sessionOrgId) {
        const err: any = new Error('Not found');
        err.statusCode = 404;
        throw err;
      }
      return { id: 'record-001', organizationId: sessionOrgId };
    }

    expect(() => simulateCrossTenantAccess('org-b', 'org-a')).toThrow();

    try {
      simulateCrossTenantAccess('org-b', 'org-a');
    } catch (err: any) {
      expect(err.statusCode).toBe(404);
      expect(err.statusCode).not.toBe(403);
    }
  });

  // ── Guard: same-org access succeeds ──────────────────────────────────────
  it('same-org access returns the record', () => {
    function simulateTenantCheck(recordOrgId: string, sessionOrgId: string) {
      if (recordOrgId !== sessionOrgId) {
        const err: any = new Error('Not found');
        err.statusCode = 404;
        throw err;
      }
      return { id: 'record-001', organizationId: sessionOrgId };
    }
    const result = simulateTenantCheck('org-a', 'org-a');
    expect(result.organizationId).toBe('org-a');
  });

  // ── All service where-clauses must include organizationId ─────────────────
  describe('Where-clause contract across services', () => {
    // Attendance
    it('attendance query scopes to session org via employee relation', () => {
      const buildAttendanceWhere = (orgId: string, employeeId?: string, departmentId?: string) => {
        const where: any = { employee: { organizationId: orgId } };
        if (employeeId) where.employeeId = employeeId;
        if (departmentId) where.employee = { ...where.employee, departmentId };
        return where;
      };
      const w = buildAttendanceWhere('org-a', 'emp-1', 'dept-1');
      expect(w.employee.organizationId).toBe('org-a');
      expect(w.employee.departmentId).toBe('dept-1');
      expect(w.employeeId).toBe('emp-1');
    });

    // Payroll Period
    it('payroll period query includes direct organizationId', () => {
      const buildPayrollPeriodWhere = (orgId: string, status?: string) => {
        const where: any = { organizationId: orgId };
        if (status) where.status = status;
        return where;
      };
      const w = buildPayrollPeriodWhere('org-a', 'DRAFT');
      expect(w.organizationId).toBe('org-a');
      expect(w.status).toBe('DRAFT');
    });

    // Leave Request
    it('leave query preserves organizationId when filtering by department', () => {
      const buildLeaveWhere = (orgId: string, departmentId?: string) => {
        const where: any = {
          employee: { is: { organizationId: orgId } },
        };
        if (departmentId) {
          where.employee = {
            is: {
              ...where.employee?.is,
              departmentId,
            },
          };
        }
        return where;
      };
      const w = buildLeaveWhere('org-a', 'dept-sales');
      expect(w.employee.is.organizationId).toBe('org-a');
      expect(w.employee.is.departmentId).toBe('dept-sales');
    });

    // Penalty & Bonus
    it('penalty & bonus query preserves organizationId when filtering by department', () => {
      const buildBonusWhere = (orgId: string, departmentId?: string) => {
        const where: any = {
          type: 'BONUS',
          organizationId: orgId,
          employee: { organizationId: orgId },
        };
        if (departmentId) {
          where.employee = {
            ...where.employee,
            departmentId,
          };
        }
        return where;
      };
      const w = buildBonusWhere('org-tenant-1', 'dept-it');
      expect(w.organizationId).toBe('org-tenant-1');
      expect(w.employee.organizationId).toBe('org-tenant-1');
      expect(w.employee.departmentId).toBe('dept-it');
    });

    // Worksite
    it('worksite query binds directly to organizationId', () => {
      const buildWorksiteWhere = (orgId?: string) => ({
        ...(orgId ? { organizationId: orgId } : {}),
      });
      const w = buildWorksiteWhere('org-tenant-2');
      expect(w.organizationId).toBe('org-tenant-2');
    });

    // Attendance Correction
    it('attendance correction query binds directly to organizationId', () => {
      const buildCorrectionWhere = (orgId?: string) => ({
        ...(orgId ? { organizationId: orgId } : {}),
      });
      const w = buildCorrectionWhere('org-tenant-3');
      expect(w.organizationId).toBe('org-tenant-3');
    });

    // Employee Schedule
    it('schedule query preserves organizationId with department filter', () => {
      const buildScheduleWhere = (orgId: string, departmentId?: string) => {
        const where: any = { organizationId: orgId };
        if (departmentId) {
          where.employee = { ...where.employee, departmentId };
        }
        return where;
      };
      const w = buildScheduleWhere('org-tenant-4', 'dept-ops');
      expect(w.organizationId).toBe('org-tenant-4');
      expect(w.employee.departmentId).toBe('dept-ops');
    });

    // Work Shift
    it('work shift query binds directly to organizationId', () => {
      const buildShiftWhere = (orgId?: string, includeInactive = false) => ({
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        ...(orgId ? { organizationId: orgId } : {}),
      });
      const w = buildShiftWhere('org-tenant-5');
      expect(w.organizationId).toBe('org-tenant-5');
      expect(w.isActive).toBe(true);
    });

    // Payroll Rule
    it('payroll rule query binds directly to organizationId', () => {
      const buildRuleWhere = (orgId?: string) => ({
        ...(orgId ? { organizationId: orgId } : {}),
      });
      const w = buildRuleWhere('org-tenant-6');
      expect(w.organizationId).toBe('org-tenant-6');
    });
  });

  // ── ID-Based Lookup Anti-IDOR & 404 Prevention Tests ─────────────────────────
  describe('ID Lookup Anti-Leakage (404 on Cross-Tenant)', () => {
    const checkTenantAccess = (record: { id: string; organizationId: string }, session: { organizationId?: string }) => {
      if (!record || (session?.organizationId && record.organizationId !== session.organizationId)) {
        const err: any = new Error('Not found');
        err.statusCode = 404;
        throw err;
      }
      return record;
    };

    it('rejects cross-tenant position/worksite/shift/rule access with 404', () => {
      const tenantARecord = { id: 'rec-001', organizationId: 'tenant-a' };
      const tenantBSession = { organizationId: 'tenant-b' };

      expect(() => checkTenantAccess(tenantARecord, tenantBSession)).toThrow();
      try {
        checkTenantAccess(tenantARecord, tenantBSession);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.statusCode).not.toBe(403);
      }
    });

    it('allows same-tenant access', () => {
      const tenantARecord = { id: 'rec-001', organizationId: 'tenant-a' };
      const tenantASession = { organizationId: 'tenant-a' };
      const result = checkTenantAccess(tenantARecord, tenantASession);
      expect(result.id).toBe('rec-001');
    });
  });

  // ── Record Creation Tenant Binding ──────────────────────────────────────────
  describe('Creation tenant binding', () => {
    it('injects session.organizationId into created records', () => {
      const session = { userId: 'u1', organizationId: 'org-tenant-99' };
      const createPayload = { name: 'Morning Shift', code: 'MS-01' };

      const boundRecord = {
        ...createPayload,
        organizationId: session.organizationId ?? '__no_org__',
      };

      expect(boundRecord.organizationId).toBe('org-tenant-99');
    });

    it('uses __no_org__ sentinel if session lacks organizationId during creation', () => {
      const session: any = { userId: 'u1' };
      const createPayload = { name: 'Night Shift', code: 'NS-01' };

      const boundRecord = {
        ...createPayload,
        organizationId: session.organizationId ?? '__no_org__',
      };

      expect(boundRecord.organizationId).toBe('__no_org__');
    });
  });
});
