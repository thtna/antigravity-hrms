import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperAdminService, MAX_TENANTS } from '../super-admin.service';
import { EmployeeService } from '../employee.service';
import { DepartmentService } from '../department.service';
import { PositionService } from '../position.service';
import { WorksiteService } from '../worksite.service';
import { ShiftService } from '../shift.service';
import { AttendanceService } from '../attendance.service';
import { LeaveService } from '../leave.service';
import { BonusService } from '../bonus.service';
import { PenaltyService } from '../penalty.service';
import { KpiService } from '../kpi.service';
import { PayrollService } from '../payroll.service';
import { DocumentService } from '../document.service';
import { ReportService } from '../report.service';
import { DashboardService } from '../dashboard.service';
import { CachedLookupService, CacheManager } from '@/lib/cache/cache-manager';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';
import {
  getCurrentOrganization,
  getCurrentMembership,
  assertTenantOwnership,
  buildTenantScopedWhere,
} from '@/lib/auth/context';
import {
  requireSuperAdmin,
  requireRole,
  requireTenantScope,
  verifyOwnershipOrAdmin,
} from '@/lib/auth/guard';
import { isSuperAdmin, hasPermission } from '@/lib/auth/roles';
import { signSessionToken, verifySessionToken } from '@/lib/auth/session';
import { PayrollCalculationEngine } from '@/lib/payroll/payroll-calculation-engine';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import { UserSession } from '@/types';
import { ApiError } from '@/lib/errors';
import { Prisma } from '@prisma/client';

// ── Hoisted Mock Prisma ──────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  organizationMember: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  userRole: {
    create: vi.fn(),
  },
  role: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  branch: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  department: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  position: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  worksite: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  workShift: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  attendance: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  employeeSchedule: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  recurringSchedule: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  leaveRequest: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  kpi: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  employeeKpiResult: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  employeeBonusPenalty: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  payrollPeriod: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  payrollRule: {
    findFirst: vi.fn(),
  },
  payroll: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  payrollDetail: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  companySetting: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: mockPrisma,
  checkDatabaseConnection: vi.fn().mockResolvedValue({ healthy: true, latencyMs: 2 }),
}));

// Mock getSession for auth context
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<any>('@/lib/auth/session');
  return {
    ...actual,
    getSession: vi.fn(),
  };
});

import { getSession } from '@/lib/auth/session';

describe('FINAL RED-TEAM PRODUCTION PREFLIGHT VERIFICATION', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CacheManager.getInstance().clear();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. AUTHENTICATION / SESSION & INVALIDATION
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 1: Authentication & Session Lifecycle', () => {
    it('1.1: Denies protected access with 403 when Tenant A is SUSPENDED, even with valid JWT', async () => {
      const userASession: UserSession = {
        userId: 'user-a',
        email: 'admin@abccoffee.vn',
        fullName: 'Admin ABC',
        organizationId: 'tenant-a-id',
        organizationStatus: 'ACTIVE', // Old cached status in JWT
        tenantRole: 'ADMIN',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
      };

      vi.mocked(getSession).mockResolvedValue(userASession);

      // Super admin suspended Tenant A in DB
      mockPrisma.organization.findFirst.mockResolvedValue({
        id: 'tenant-a-id',
        name: 'ABC Coffee',
        status: 'SUSPENDED',
        deletedAt: null,
      });

      await expect(getCurrentOrganization()).rejects.toThrow(ApiError);
      try {
        await getCurrentOrganization();
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.message).toContain('SUSPENDED');
      }
    });

    it('1.2: Denies access with 403 when user membership in organization is removed', async () => {
      const userASession: UserSession = {
        userId: 'user-a',
        email: 'employee@abccoffee.vn',
        fullName: 'Employee ABC',
        organizationId: 'tenant-a-id',
        organizationStatus: 'ACTIVE',
        tenantRole: 'EMPLOYEE',
        roles: ['employee'],
        permissions: ['employee:read_self'],
        isActive: true,
      };

      vi.mocked(getSession).mockResolvedValue(userASession);

      // Membership deleted from database
      mockPrisma.organizationMember.findFirst.mockResolvedValue(null);

      await expect(getCurrentMembership()).rejects.toThrow(ApiError);
      try {
        await getCurrentMembership();
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.message).toContain('không còn là thành viên');
      }
    });

    it('1.3: Demoted user (OWNER -> EMPLOYEE) cannot execute admin/owner operations', async () => {
      const demotedSession: UserSession = {
        userId: 'user-a',
        email: 'former-owner@abccoffee.vn',
        fullName: 'Demoted User',
        organizationId: 'tenant-a-id',
        tenantRole: 'EMPLOYEE',
        roles: ['employee'],
        permissions: ['employee:read_self'],
        isActive: true,
      };

      // Attempt admin operation: create Employee
      await expect(
        EmployeeService.createEmployee({
          employeeCode: 'EMP001',
          firstName: 'An',
          lastName: 'Nguyen',
          email: 'an@abccoffee.vn',
          phoneNumber: '0901234567',
          gender: 'MALE',
          departmentId: 'dept-1',
          positionId: 'pos-1',
          contractSalary: 10000000,
          hourlyRate: 0,
          insuranceSalary: 5000000,
          dependentsCount: 0,
          status: 'ACTIVE',
          documents: [],
          contractType: 'PROBATION',
          hireDate: '2026-09-01',
        }, demotedSession)
      ).rejects.toThrow(ApiError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. TENANT ISOLATION RED TEAM (A -> B = DENIED, B -> A = DENIED)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 2 & 3: Tenant Isolation & IDOR Audit Matrix', () => {
    const sessionA: UserSession = {
      userId: 'user-a-admin',
      email: 'owner@abccoffee.vn',
      fullName: 'Owner A',
      organizationId: 'tenant-a-id',
      organizationStatus: 'ACTIVE',
      tenantRole: 'ADMIN',
      roles: ['admin'],
      permissions: ['*'],
      isActive: true,
    };

    const sessionB: UserSession = {
      userId: 'user-b-admin',
      email: 'owner@xyzrest.vn',
      fullName: 'Owner B',
      organizationId: 'tenant-b-id',
      organizationStatus: 'ACTIVE',
      tenantRole: 'ADMIN',
      roles: ['admin'],
      permissions: ['*'],
      isActive: true,
    };

    it('2.1 Employee: Tenant A cannot read, update, or delete Employee of Tenant B', async () => {
      // Mock employee belonging to Tenant B
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-b-001',
        organizationId: 'tenant-b-id',
        employeeCode: 'B001',
        firstName: 'Bình',
        lastName: 'Trần',
        contractSalary: new Prisma.Decimal(12000000),
        hourlyRate: new Prisma.Decimal(0),
        insuranceSalary: new Prisma.Decimal(6000000),
        documents: [],
        deletedAt: null,
      });

      // Tenant A read B -> DENIED (404 Not Found)
      await expect(EmployeeService.getEmployeeById('emp-b-001', sessionA)).rejects.toThrow(ApiError);
      // Tenant A update B -> DENIED
      await expect(EmployeeService.updateEmployee('emp-b-001', { firstName: 'Hacked' }, sessionA)).rejects.toThrow(ApiError);
      // Tenant A delete B -> DENIED
      await expect(EmployeeService.softDeleteEmployee('emp-b-001', sessionA)).rejects.toThrow(ApiError);

      // Reverse check: Tenant B accessing Tenant B's own employee -> ALLOWED
      const selfEmp = await EmployeeService.getEmployeeById('emp-b-001', sessionB);
      expect(selfEmp.id).toBe('emp-b-001');
    });

    it('2.2 Department: Tenant A cannot read, update, or delete Department of Tenant B', async () => {
      mockPrisma.department.findFirst.mockResolvedValue(null); // findFirst with orgId filter returns null

      await expect(DepartmentService.getDepartmentById('dept-b', sessionA)).rejects.toThrow(ApiError);
      await expect(DepartmentService.updateDepartment('dept-b', { name: 'Compromised' }, sessionA)).rejects.toThrow(ApiError);
      await expect(DepartmentService.deleteDepartment('dept-b', sessionA)).rejects.toThrow(ApiError);
    });

    it('2.3 Position: Tenant A cannot read, update, or delete Position of Tenant B', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(null);

      await expect(PositionService.getPositionById('pos-b', sessionA)).rejects.toThrow(ApiError);
      await expect(PositionService.updatePosition('pos-b', { title: 'Compromised' }, sessionA)).rejects.toThrow(ApiError);
      await expect(PositionService.deletePosition('pos-b', sessionA)).rejects.toThrow(ApiError);
    });

    it('2.4 Worksite: Tenant A cannot read, update, or delete Worksite of Tenant B', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue({
        id: 'ws-b',
        name: 'XYZ Chi nhánh 1',
        organizationId: 'tenant-b-id',
        latitude: new Prisma.Decimal(10.7),
        longitude: new Prisma.Decimal(106.6),
        radiusMeters: 200,
        isActive: true,
        createdAt: new Date(),
        _count: { employees: 0 },
      });

      await expect(WorksiteService.getWorksiteById('ws-b', sessionA)).rejects.toThrow(ApiError);
      await expect(WorksiteService.updateWorksite('ws-b', { name: 'Compromised' }, sessionA)).rejects.toThrow(ApiError);
      await expect(WorksiteService.deleteWorksite('ws-b', sessionA)).rejects.toThrow(ApiError);
    });

    it('2.5 Shift: Tenant A cannot read, update, or delete WorkShift of Tenant B', async () => {
      mockPrisma.workShift.findUnique.mockResolvedValue({
        id: 'shift-b',
        code: 'SHIFT_B',
        name: 'Ca tối XYZ',
        organizationId: 'tenant-b-id',
        startTime: '14:00',
        endTime: '22:00',
        breakMinutes: 30,
        standardWorkHours: new Prisma.Decimal(7.5),
        effectiveFrom: new Date(),
        effectiveTo: null,
        deletedAt: null,
        _count: { schedules: 0, recurringSchedules: 0 },
      });

      await expect(ShiftService.getShiftById('shift-b', sessionA)).rejects.toThrow(ApiError);
      await expect(ShiftService.updateShift('shift-b', { name: 'Compromised' }, sessionA)).rejects.toThrow(ApiError);
      await expect(ShiftService.deleteShift('shift-b', sessionA)).rejects.toThrow(ApiError);
    });

    it('2.6 Attendance: Tenant A cannot view Attendance record of Tenant B', async () => {
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-b-001',
        employeeId: 'emp-b-001',
        workDate: new Date('2026-09-01'),
        actualWorkHours: new Prisma.Decimal(8),
        otHours: new Prisma.Decimal(0),
      });

      mockPrisma.employee.findUnique.mockResolvedValue({
        organizationId: 'tenant-b-id', // Belongs to Tenant B
      });

      await expect(AttendanceService.getAttendanceById('att-b-001', sessionA)).rejects.toThrow(ApiError);
    });

    it('2.7 Payroll & Payslip: Tenant A cannot view payslip or calculate period of Tenant B', async () => {
      // Payslip check
      mockPrisma.payroll.findUnique.mockResolvedValue({
        id: 'payslip-b-001',
        employeeId: 'emp-b-001',
        employee: { userId: 'user-b-employee' },
        period: {
          id: 'period-b',
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-30'),
        },
        details: [],
      });

      mockPrisma.employee.findUnique.mockResolvedValue({
        organizationId: 'tenant-b-id',
      });

      await expect(PayrollService.getPayslipDetail('payslip-b-001', sessionA)).rejects.toThrow(ApiError);

      // Payroll calculation check on Tenant B's period
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-b-001',
        code: '2026-09-XYZ',
        status: 'DRAFT',
        organizationId: 'tenant-b-id', // Tenant B
      });

      await expect(
        PayrollService.calculatePeriodPayroll({ periodId: 'period-b-001', recalculate: true }, sessionA)
      ).rejects.toThrow(ApiError);
    });

    it('2.8 Leave, Bonus, Penalty, KPI: Cross-tenant operations are strictly DENIED', async () => {
      // Leave cancel cross-tenant
      mockPrisma.leaveRequest.findUnique.mockResolvedValue({
        id: 'leave-b-001',
        organizationId: 'tenant-b-id',
        status: 'PENDING',
      });
      await expect(LeaveService.cancelLeaveRequest('leave-b-001', { reason: 'test' }, sessionA)).rejects.toThrow(ApiError);

      // Bonus update cross-tenant
      mockPrisma.employeeBonusPenalty.findUnique.mockResolvedValue({
        id: 'bonus-b-001',
        organizationId: 'tenant-b-id',
        status: 'PENDING',
      });
      await expect(BonusService.updateBonus('bonus-b-001', { amount: 500000 }, sessionA)).rejects.toThrow(ApiError);

      // Penalty update cross-tenant
      await expect(PenaltyService.updatePenalty('pen-b-001', { amount: 200000 }, sessionA)).rejects.toThrow(ApiError);

      // KPI update cross-tenant
      mockPrisma.kpi.findUnique.mockResolvedValue({
        id: 'kpi-b-001',
        organizationId: 'tenant-b-id',
        deletedAt: null,
      });
      await expect(KpiService.updateKpiDefinition('kpi-b-001', { title: 'Compromised' }, sessionA)).rejects.toThrow(ApiError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. MASS ASSIGNMENT / PRIVILEGE ESCALATION
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 4 & 14: Mass Assignment & Privilege Escalation', () => {
    it('4.1: Server binds organizationId strictly to authenticated session, ignoring client input', async () => {
      const tenantSession: UserSession = {
        userId: 'user-a',
        email: 'user@abccoffee.vn',
        fullName: 'User A',
        organizationId: 'tenant-a-id',
        tenantRole: 'ADMIN',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
      };

      const scoped = buildTenantScopedWhere(tenantSession, {
        organizationId: 'malicious-injected-tenant-b-id', // Attacker attempt
        status: 'ACTIVE',
      });

      // Server overrides with session.organizationId
      expect(scoped.organizationId).toBe('tenant-a-id');
    });

    it('4.2: Regular tenant user cannot execute super admin actions or bypass super admin guard', async () => {
      const regularAdmin: UserSession = {
        userId: 'user-a',
        email: 'admin@abccoffee.vn',
        fullName: 'Admin A',
        organizationId: 'tenant-a-id',
        tenantRole: 'ADMIN',
        roles: ['admin'], // Tenant admin, NOT SUPER_ADMIN
        permissions: ['*'],
        isActive: true,
      };

      vi.mocked(getSession).mockResolvedValue(regularAdmin);

      // Guard check
      await expect(requireSuperAdmin()).rejects.toThrow(ApiError);
      try {
        await requireSuperAdmin();
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
      }

      // Service check
      await expect(
        SuperAdminService.processTenantAction('tenant-b-id', 'SUSPEND', regularAdmin)
      ).rejects.toThrow(ApiError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 6. ORGANIZATION / BRANCH INTEGRITY (CROSS-TENANT FOREIGN KEYS)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 6: Foreign Key Integrity & Cross-Tenant Binding Prevention', () => {
    const sessionA: UserSession = {
      userId: 'admin-a',
      email: 'admin@abccoffee.vn',
      fullName: 'Admin A',
      organizationId: 'tenant-a-id',
      tenantRole: 'ADMIN',
      roles: ['admin'],
      permissions: ['*'],
      isActive: true,
    };

    it('6.1: Cannot create Employee in Tenant A linked to Department of Tenant B', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Department belongs to Tenant B
      mockPrisma.department.findFirst.mockImplementation(({ where }: any) => {
        if (where.organizationId === 'tenant-a-id' && where.id === 'dept-of-tenant-b') {
          return Promise.resolve(null); // Not in Tenant A
        }
        return Promise.resolve(null);
      });

      await expect(
        EmployeeService.createEmployee({
          employeeCode: 'A002',
          firstName: 'Bảo',
          lastName: 'Lê',
          email: 'bao@abccoffee.vn',
          phoneNumber: '0912345678',
          gender: 'MALE',
          departmentId: 'dept-of-tenant-b', // Cross-tenant injection attempt
          positionId: 'pos-a',
          contractSalary: 8000000,
          hourlyRate: 0,
          insuranceSalary: 4000000,
          dependentsCount: 0,
          status: 'ACTIVE',
          documents: [],
          contractType: 'PROBATION',
          hireDate: '2026-09-01',
        }, sessionA)
      ).rejects.toThrow(ApiError);
    });

    it('6.2: Cannot record Attendance in Tenant A for an Employee belonging to Tenant B', async () => {
      // Mock employee belonging to Tenant B
      mockPrisma.employee.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'emp-of-tenant-b') {
          return Promise.resolve({
            id: 'emp-of-tenant-b',
            organizationId: 'tenant-b-id', // Tenant B
            status: 'ACTIVE',
            deletedAt: null,
          });
        }
        return Promise.resolve(null);
      });

      await expect(
        AttendanceService.checkIn({
          employeeId: 'emp-of-tenant-b', // Cross-tenant employee attendance injection
          checkInMethod: 'WEB',
        }, sessionA)
      ).rejects.toThrow(ApiError);
    });

    it('6.3: Cannot create Bonus or Penalty in Tenant A targeting Employee of Tenant B', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-of-tenant-b',
        organizationId: 'tenant-b-id', // Cross-tenant
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(
        BonusService.createBonus({
          employeeId: 'emp-of-tenant-b',
          category: 'KPI',
          amount: 1000000,
          period: '2026-09',
          reason: 'Xuat sac',
        }, sessionA)
      ).rejects.toThrow(ApiError);

      await expect(
        PenaltyService.createPenalty({
          employeeId: 'emp-of-tenant-b',
          category: 'LATE',
          amount: 200000,
          period: '2026-09',
          effectiveDate: '2026-09-01',
          reason: 'Di muon',
        }, sessionA)
      ).rejects.toThrow(ApiError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 8. FILE SECURITY
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 8: File Security & Anti-IDOR Document Download', () => {
    const sessionA: UserSession = {
      userId: 'user-a',
      email: 'user-a@abccoffee.vn',
      fullName: 'User A',
      organizationId: 'tenant-a-id',
      tenantRole: 'ADMIN',
      roles: ['admin'],
      permissions: ['*'],
      isActive: true,
    };

    it('8.1: Tenant A admin cannot download documents belonging to an Employee of Tenant B', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-b-001',
        organizationId: 'tenant-b-id', // Tenant B
        userId: 'user-b',
        employeeCode: 'B001',
        departmentId: 'dept-b',
        documents: [
          { id: 'doc-secret-b', name: 'HopDongLaoDong.pdf', storedFilename: 'doc-secret-b.pdf' },
        ],
        deletedAt: null,
      });

      await expect(
        DocumentService.downloadEmployeeDocument('emp-b-001', 'doc-secret-b', sessionA)
      ).rejects.toThrow(ApiError);

      try {
        await DocumentService.downloadEmployeeDocument('emp-b-001', 'doc-secret-b', sessionA);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });

    it('8.2: Tenant A admin cannot delete documents belonging to an Employee of Tenant B', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-b-001',
        organizationId: 'tenant-b-id',
        userId: 'user-b',
        deletedAt: null,
      });

      await expect(
        DocumentService.deleteEmployeeDocument('emp-b-001', 'doc-secret-b', sessionA)
      ).rejects.toThrow(ApiError);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 9. CACHE / DATA BLEED
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 9: Cache Partitioning & Bleed Prevention', () => {
    it('9.1: CachedLookupService isolates cache entries per tenant using partitioned keys', async () => {
      mockPrisma.worksite.findMany
        .mockResolvedValueOnce([{ id: 'ws-a', name: 'ABC Coffee HQ' }])
        .mockResolvedValueOnce([{ id: 'ws-b', name: 'XYZ Restaurant HQ' }]);

      const worksitesA = await CachedLookupService.getActiveWorksites('tenant-a-id');
      const worksitesB = await CachedLookupService.getActiveWorksites('tenant-b-id');

      expect(worksitesA[0].name).toBe('ABC Coffee HQ');
      expect(worksitesB[0].name).toBe('XYZ Restaurant HQ');

      // Subsequent call for Tenant A returns cached A, never B
      const cachedA = await CachedLookupService.getActiveWorksites('tenant-a-id');
      expect(cachedA[0].name).toBe('ABC Coffee HQ');
    });

    it('9.2: CompanySetting cache keys are strictly scoped to organizationId', async () => {
      mockPrisma.companySetting.findFirst
        .mockResolvedValueOnce({ key: 'COMPANY_NAME', value: 'ABC Coffee Joint Stock' })
        .mockResolvedValueOnce({ key: 'COMPANY_NAME', value: 'XYZ Restaurant Co., Ltd' });

      const settingA = await CachedLookupService.getCompanySetting('COMPANY_NAME', 'tenant-a-id');
      const settingB = await CachedLookupService.getCompanySetting('COMPANY_NAME', 'tenant-b-id');

      expect(settingA).toBe('ABC Coffee Joint Stock');
      expect(settingB).toBe('XYZ Restaurant Co., Ltd');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 10. RATE LIMIT / ABUSE PROTECTION
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 10: Rate Limiting & Abuse Protection', () => {
    it('10.1: Blocks brute force login attempts (> 5 attempts per minute per IP)', () => {
      const ip = '192.168.1.100';
      const key = `login:${ip}`;
      resetRateLimit(key);

      // First 5 attempts allowed
      for (let i = 0; i < 5; i++) {
        const check = checkRateLimit(key, 5, 60);
        expect(check.success).toBe(true);
      }

      // 6th attempt blocked
      const blocked = checkRateLimit(key, 5, 60);
      expect(blocked.success).toBe(false);
      expect(blocked.resetTime).toBeGreaterThan(0);
    });

    it('10.2: Blocks spam tenant registrations (> 3 per hour)', () => {
      const key = 'register:10.0.0.1';
      resetRateLimit(key);

      for (let i = 0; i < 3; i++) {
        expect(checkRateLimit(key, 3, 3600).success).toBe(true);
      }

      expect(checkRateLimit(key, 3, 3600).success).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 13. MAX TENANT QUOTA ENFORCEMENT
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 13: Max Tenant Quota (MAX_TENANTS = 5)', () => {
    const superAdminSession: UserSession = {
      userId: 'super-admin-root',
      email: 'root@antigravity.internal',
      fullName: 'Super Admin',
      roles: ['super_admin'],
      permissions: ['*'],
      isActive: true,
    };

    it('13.1: Allows activation for tenants 1 through 5 when activeCount < 5', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'tenant-5-id',
        status: 'PENDING',
        deletedAt: null,
      });

      // Currently 4 active tenants
      mockPrisma.organization.count.mockResolvedValue(4);
      mockPrisma.organization.update.mockResolvedValue({
        id: 'tenant-5-id',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        approvedAt: new Date(),
      });

      const res = await SuperAdminService.processTenantAction(
        'tenant-5-id',
        'APPROVE',
        superAdminSession
      );

      expect(res.organization.status).toBe('ACTIVE');
    });

    it('13.2: Strictly BLOCKS 6th tenant activation with 400 Bad Request when activeCount == 5', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'tenant-6-id',
        status: 'PENDING',
        deletedAt: null,
      });

      // Already 5 active tenants
      mockPrisma.organization.count.mockResolvedValue(5);

      await expect(
        SuperAdminService.processTenantAction('tenant-6-id', 'APPROVE', superAdminSession)
      ).rejects.toThrow(ApiError);

      try {
        await SuperAdminService.processTenantAction('tenant-6-id', 'APPROVE', superAdminSession);
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain('giới hạn tối đa 5 tenants');
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 16. PAYROLL REGRESSION (10,000,000 VND Baseline)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Pillar 16: Payroll Regression & Mathematical Invariants', () => {
    it('16.1: Deterministic baseline 10,000,000 VND yields exact statutory net salary', () => {
      const BASELINE = 10000000;
      const WORK_DAYS = 22;

      const res = PayrollCalculationEngine.calculate({
        baseSalary: BASELINE,
        workDays: WORK_DAYS,
        actualWorkDays: WORK_DAYS,
        workHours: WORK_DAYS * 8,
        overtimeHours: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        bonus: 0,
        penalty: 0,
        dependentsCount: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      // Statutory deductions in Vietnam:
      // BHXH: 8% of 10,000,000 = 800,000
      // BHYT: 1.5% of 10,000,000 = 150,000
      // BHTN: 1% of 10,000,000 = 100,000
      // Total insurance: 1,050,000
      // Taxable income: 10,000,000 - 1,050,000 = 8,950,000
      // Personal relief: 11,000,000 (exceeds taxable income) -> PIT = 0
      // Net salary = 10,000,000 - 1,050,000 = 8,950,000
      expect(res.grossSalary).toBe(10000000);
      expect(res.employeeSocial).toBe(800000);
      expect(res.employeeHealth).toBe(150000);
      expect(res.employeeUnemployment).toBe(100000);
      expect(res.insurance).toBe(1050000);
      expect(res.tax).toBe(0);
      expect(res.netSalary).toBe(8950000);
    });
  });
});
