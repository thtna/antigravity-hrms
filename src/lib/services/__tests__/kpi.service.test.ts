import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoist Prisma & Logger Mocks ──────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
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
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  department: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { KpiService } from '@/lib/services/kpi.service';
import { UserSession } from '@/types';

// ── Fixture Sessions ─────────────────────────────────────────────────────────

const adminSession: UserSession = {
  userId: 'usr-admin',
  employeeId: 'emp-admin',
  organizationId: 'org-test-kpi',
  roles: ['admin'],
  email: 'admin@test.com',
  fullName: 'Admin User',
  permissions: [],
  isActive: true,
};

const hrSession: UserSession = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  organizationId: 'org-test-kpi',
  roles: ['hr'],
  email: 'hr@test.com',
  fullName: 'HR User',
  permissions: [],
  isActive: true,
};

const managerSession: UserSession = {
  userId: 'usr-mgr',
  employeeId: 'emp-mgr',
  organizationId: 'org-test-kpi',
  roles: ['manager'],
  email: 'manager@test.com',
  fullName: 'Manager User',
  permissions: [],
  isActive: true,
};

const employeeSession: UserSession = {
  userId: 'usr-emp',
  employeeId: 'emp-001',
  organizationId: 'org-test-kpi',
  roles: ['employee'],
  email: 'employee@test.com',
  fullName: 'Employee One',
  permissions: [],
  isActive: true,
};

// ── Mock Data ────────────────────────────────────────────────────────────────

const mockDepartment = {
  id: 'dept-tech',
  organizationId: 'org-test-kpi',
  code: 'TECH',
  name: 'Phòng Kỹ Thuật',
};

const mockEmployee = {
  id: 'emp-001',
  organizationId: 'org-test-kpi',
  employeeCode: 'EMP001',
  firstName: 'Van A',
  lastName: 'Nguyen',
  departmentId: 'dept-tech',
  department: mockDepartment,
  position: { title: 'Lập Trình Viên' },
  managedDepartments: [],
};

const mockKpi = {
  id: 'kpi-001',
  organizationId: 'org-test-kpi',
  code: 'SALES_REV_M',
  title: 'Doanh Thu Tháng',
  description: 'Chỉ tiêu doanh thu bán hàng hàng tháng',
  metricType: 'NUMERIC',
  targetValue: '100000000',
  unit: 'VND',
  period: 'MONTHLY',
  departmentId: 'dept-tech',
  calculationType: 'HIGHER_IS_BETTER',
  baseBonusAmount: '5000000',
  bonusFormula: 'TIERED',
  weight: '100',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockResult = {
  id: 'res-001',
  organizationId: 'org-test-kpi',
  employeeId: 'emp-001',
  kpiId: 'kpi-001',
  period: '2026-09',
  targetValue: '100000000',
  actualValue: '120000000',
  completionRate: '120',
  score: '120',
  weightedScore: '120',
  bonusAmount: '6500000',
  managerComment: 'Xuất sắc',
  status: 'DRAFT',
  evaluatorId: null,
  evaluatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  kpi: mockKpi,
  employee: mockEmployee,
};

function setupTransaction() {
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PHASE 11 — KPI Engine: KpiService Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
    mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
    mockPrisma.employee.findFirst.mockImplementation(async ({ where }) => {
      const employee = await mockPrisma.employee.findUnique({ where: { id: where.id } });
      return employee?.organizationId === where.organizationId ? employee : null;
    });
    mockPrisma.kpi.findFirst.mockImplementation((...args: any[]) =>
      mockPrisma.kpi.findUnique(...args)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. KPI Definition CRUD ───────────────────────────────────────────────

  describe('1. KpiService.createKpiDefinition', () => {
    it('allows HR to create a valid KPI definition', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue(null); // no duplicate
      mockPrisma.department.findUnique.mockResolvedValue(mockDepartment);
      mockPrisma.kpi.create.mockResolvedValue({ ...mockKpi });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await KpiService.createKpiDefinition(
        {
          code: 'SALES_REV_M',
          title: 'Doanh Thu Tháng',
          targetValue: 100_000_000,
          unit: 'VND',
          period: 'MONTHLY',
          departmentId: 'dept-tech',
          calculationType: 'HIGHER_IS_BETTER',
          baseBonusAmount: 5_000_000,
          bonusFormula: 'TIERED',
          weight: 100,
          metricType: 'NUMERIC',
        },
        hrSession
      );

      expect(mockPrisma.kpi.create).toHaveBeenCalledOnce();
      expect(result.code).toBe('SALES_REV_M');
    });

    it('rejects duplicate KPI code with 409 Conflict', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue(mockKpi);

      await expect(
        KpiService.createKpiDefinition(
          {
            code: 'SALES_REV_M',
            title: 'Doanh Thu Mới',
            targetValue: 50_000_000,
            unit: 'VND',
            period: 'MONTHLY',
            calculationType: 'HIGHER_IS_BETTER',
            baseBonusAmount: 0,
            bonusFormula: 'TIERED',
            weight: 100,
            metricType: 'NUMERIC',
          },
          adminSession
        )
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('blocks regular employee from creating KPI definition (403)', async () => {
      await expect(
        KpiService.createKpiDefinition(
          {
            code: 'EMP_KPI',
            title: 'KPI',
            targetValue: 10,
            unit: 'TASKS',
            period: 'MONTHLY',
            calculationType: 'HIGHER_IS_BETTER',
            baseBonusAmount: 0,
            bonusFormula: 'TIERED',
            weight: 100,
            metricType: 'NUMERIC',
          },
          employeeSession
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('2. KpiService.updateKpiDefinition', () => {
    it.each([
      { role: 'admin', session: adminSession },
      { role: 'hr', session: hrSession },
    ])('allows $role to use a code that exists only in another tenant', async ({ session }) => {
      const code = 'SHARED_KPI_CODE';
      const foreignKpi = { ...mockKpi, id: 'kpi-foreign', organizationId: 'org-foreign', code };
      mockPrisma.kpi.findUnique.mockResolvedValue(mockKpi);
      mockPrisma.kpi.findFirst.mockImplementation(async ({ where }: {
        where: { code: string; organizationId?: string };
      }) => (
        foreignKpi.code === where.code &&
        (!where.organizationId || foreignKpi.organizationId === where.organizationId)
          ? foreignKpi
          : null
      ));
      mockPrisma.kpi.update.mockResolvedValue({ ...mockKpi, code });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const updated = await KpiService.updateKpiDefinition(mockKpi.id, { code }, session);

      expect(mockPrisma.kpi.findFirst).toHaveBeenCalledExactlyOnceWith({
        where: { code, organizationId: session.organizationId },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(mockPrisma.kpi.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: mockKpi.id },
        data: { code },
      }));
      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();
      expect(updated.code).toBe(code);
    });

    it.each([
      { role: 'admin', session: adminSession },
      { role: 'hr', session: hrSession },
    ])('rejects $role updating to a duplicate code in the same tenant without side effects', async ({ session }) => {
      const code = 'DUPLICATE_KPI_CODE';
      mockPrisma.kpi.findUnique.mockResolvedValue(mockKpi);
      mockPrisma.kpi.findFirst.mockResolvedValue({ ...mockKpi, id: 'kpi-other', code });

      await expect(
        KpiService.updateKpiDefinition(mockKpi.id, { code }, session)
      ).rejects.toMatchObject({ statusCode: 409, errorCode: 'CONFLICT' });

      expect(mockPrisma.kpi.findFirst).toHaveBeenCalledExactlyOnceWith({
        where: { code, organizationId: session.organizationId },
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.kpi.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('does not perform a duplicate lookup when the code is unchanged', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue(mockKpi);
      mockPrisma.kpi.update.mockResolvedValue(mockKpi);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const updated = await KpiService.updateKpiDefinition(
        mockKpi.id,
        { code: mockKpi.code },
        adminSession
      );

      expect(mockPrisma.kpi.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.kpi.update).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce();
      expect(updated.code).toBe(mockKpi.code);
    });

    it('updates KPI fields and creates audit log', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue(mockKpi);
      mockPrisma.kpi.update.mockResolvedValue({
        ...mockKpi,
        title: 'Doanh Thu Nâng Cao',
        targetValue: '150000000',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const updated = await KpiService.updateKpiDefinition(
        'kpi-001',
        { title: 'Doanh Thu Nâng Cao', targetValue: 150_000_000 },
        adminSession
      );

      expect(mockPrisma.kpi.update).toHaveBeenCalledOnce();
      expect(updated.title).toBe('Doanh Thu Nâng Cao');
    });

    it('throws 404 when updating non-existent KPI', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue(null);

      await expect(
        KpiService.updateKpiDefinition('kpi-none', { title: 'Test' }, hrSession)
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('3. KpiService.deleteKpiDefinition', () => {
    it('soft-deletes KPI if it has existing assignments', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue({
        ...mockKpi,
        _count: { results: 5 },
      });
      mockPrisma.kpi.update.mockResolvedValue({ ...mockKpi, status: 'ARCHIVED' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await KpiService.deleteKpiDefinition('kpi-001', adminSession);
      expect(mockPrisma.kpi.update).toHaveBeenCalledOnce();
      expect(result.status).toBe('ARCHIVED');
    });

    it('hard-deletes KPI if it has zero assignments', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue({
        ...mockKpi,
        _count: { results: 0 },
      });
      mockPrisma.kpi.delete.mockResolvedValue({ ...mockKpi });
      mockPrisma.auditLog.create.mockResolvedValue({});

      await KpiService.deleteKpiDefinition('kpi-001', adminSession);
      expect(mockPrisma.kpi.delete).toHaveBeenCalledOnce();
    });
  });

  // ── 2. KPI Assignment & RBAC ─────────────────────────────────────────────

  describe('4. KpiService.assignKpiToEmployee', () => {
    it('HR can assign KPI to employee with auto-calculated rates', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue(mockKpi);
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue(null); // not duplicate
      mockPrisma.employeeKpiResult.create.mockResolvedValue({ ...mockResult });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const res = await KpiService.assignKpiToEmployee(
        {
          kpiId: 'kpi-001',
          employeeId: 'emp-001',
          period: '2026-09',
          targetValue: 100_000_000,
        },
        hrSession
      );

      expect(mockPrisma.employeeKpiResult.create).toHaveBeenCalledOnce();
      expect(res.period).toBe('2026-09');
    });

    it('prevents duplicate assignment of same KPI in same period (409)', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue(mockKpi);
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue(mockResult); // duplicate exists

      await expect(
        KpiService.assignKpiToEmployee(
          {
            kpiId: 'kpi-001',
            employeeId: 'emp-001',
            period: '2026-09',
          },
          hrSession
        )
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('prevents manager from self-assigning/self-evaluating (403)', async () => {
      await expect(
        KpiService.assignKpiToEmployee(
          {
            kpiId: 'kpi-001',
            employeeId: 'emp-mgr', // same as manager's employeeId
            period: '2026-09',
          },
          managerSession
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('blocks manager from assigning to employee in unmanaged department (403)', async () => {
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce({ departmentId: 'dept-other', organizationId: 'org-test-kpi' }) // target employee
        .mockResolvedValueOnce({ managedDepartments: [{ id: 'dept-tech' }], organizationId: 'org-test-kpi' }); // manager managed depts

      await expect(
        KpiService.assignKpiToEmployee(
          {
            kpiId: 'kpi-001',
            employeeId: 'emp-002',
            period: '2026-09',
          },
          managerSession
        )
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ── 3. Recording Actual Value & Evaluation ────────────────────────────────

  describe('5. KpiService.recordActualValue', () => {
    it('employee can record actual value and updates status to SUBMITTED', async () => {
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({
        ...mockResult,
        status: 'DRAFT',
      });
      mockPrisma.employeeKpiResult.update.mockResolvedValue({
        ...mockResult,
        actualValue: '110000000',
        completionRate: '110',
        status: 'SUBMITTED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const updated = await KpiService.recordActualValue(
        'res-001',
        { actualValue: 110_000_000, managerComment: 'Cập nhật số liệu' },
        employeeSession
      );

      expect(mockPrisma.employeeKpiResult.update).toHaveBeenCalledOnce();
      expect(updated.status).toBe('SUBMITTED');
    });

    it('blocks modification of already APPROVED KPI (400)', async () => {
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({
        ...mockResult,
        status: 'APPROVED',
      });

      await expect(
        KpiService.recordActualValue('res-001', { actualValue: 100 }, employeeSession)
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('6. KpiService.evaluateKpiAssignment', () => {
    it('HR approves KPI evaluation and calculates official bonus amount', async () => {
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({
        ...mockResult,
        status: 'SUBMITTED',
      });
      // 120% achievement with TIERED formula on 5M base bonus -> 130% = 6.5M
      mockPrisma.employeeKpiResult.update.mockResolvedValue({
        ...mockResult,
        status: 'APPROVED',
        completionRate: '120',
        bonusAmount: '6500000',
        evaluatorId: 'emp-hr',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const approved = await KpiService.evaluateKpiAssignment(
        'res-001',
        { decision: 'APPROVED', actualValue: 120_000_000 },
        hrSession
      );

      expect(mockPrisma.employeeKpiResult.update).toHaveBeenCalledOnce();
      expect(approved.status).toBe('APPROVED');
      expect(Number(approved.bonusAmount)).toBe(6_500_000);
    });

    it('HR rejects KPI evaluation with 0 bonus', async () => {
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({ ...mockResult });
      mockPrisma.employeeKpiResult.update.mockResolvedValue({
        ...mockResult,
        status: 'REJECTED',
        bonusAmount: '0',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const rejected = await KpiService.evaluateKpiAssignment(
        'res-001',
        { decision: 'REJECTED', managerComment: 'Không đạt tiêu chí kiểm định' },
        hrSession
      );

      expect(rejected.status).toBe('REJECTED');
      expect(Number(rejected.bonusAmount)).toBe(0);
    });

    it('blocks regular employee from evaluating (403)', async () => {
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({ ...mockResult });

      await expect(
        KpiService.evaluateKpiAssignment('res-001', { decision: 'APPROVED' }, employeeSession)
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  // ── 4. Scorecard & Aggregated Metrics ─────────────────────────────────────

  describe('7. KpiService.getEmployeeScorecard', () => {
    it('returns employee scorecard with aggregated weighted metrics', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([
        {
          ...mockResult,
          actualValue: '120000000',
          kpi: mockKpi,
        },
      ]);

      const scorecardData = await KpiService.getEmployeeScorecard(
        'emp-001',
        '2026-09',
        employeeSession
      );

      expect(scorecardData.period).toBe('2026-09');
      expect(scorecardData.scorecard.totalKpiCount).toBe(1);
      expect(scorecardData.scorecard.weightedAverageScore).toBe(120);
      expect(scorecardData.scorecard.totalBonusEarned).toBe(6_500_000);
      expect(scorecardData.scorecard.overallTier.tier).toBe('EXCELLENT');
    });

    it('blocks employee from viewing other employee scorecard (403)', async () => {
      await expect(
        KpiService.getEmployeeScorecard('emp-other', '2026-09', employeeSession)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('allows HR to view any employee scorecard', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([]);

      const data = await KpiService.getEmployeeScorecard('emp-001', '2026-09', hrSession);
      expect(data.employee.fullName).toBe('Nguyen Van A');
    });

    it('defaults the scorecard to the Vietnam business month after UTC rollover', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-30T18:00:00.000Z'));
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([]);

      const data = await KpiService.getEmployeeScorecard('emp-001', undefined, hrSession);

      expect(data.period).toBe('2026-10');
      expect(mockPrisma.employeeKpiResult.findMany.mock.calls[0][0].where.period).toBe(
        '2026-10'
      );
    });
  });

  describe('8. KpiService.getKpiDashboardSummary', () => {
    it('returns correct counts and bonus payout', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-12-31T18:00:00.000Z'));
      mockPrisma.kpi.count.mockResolvedValue(8);
      mockPrisma.employeeKpiResult.count
        .mockResolvedValueOnce(25) // totalAssigned
        .mockResolvedValueOnce(5)  // pendingEvaluations
        .mockResolvedValueOnce(18); // approvedEvaluations

      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([
        { bonusAmount: '6500000', score: '120' },
        { bonusAmount: '3500000', score: '100' },
      ]);

      const summary = await KpiService.getKpiDashboardSummary(hrSession);

      expect(summary.totalActiveKpis).toBe(8);
      expect(summary.totalAssigned).toBe(25);
      expect(summary.pendingEvaluations).toBe(5);
      expect(summary.approvedEvaluations).toBe(18);
      expect(summary.totalBonusPayout).toBe(10_000_000);
      expect(summary.averageScore).toBe(110);
      expect(summary.period).toBe('2026-01');
      expect(mockPrisma.employeeKpiResult.count.mock.calls[0][0].where.period).toBe(
        '2026-01'
      );
    });
  });

  describe('9. R7-B & R7-B1A Regression: Tenant Isolation and Scoping Invariants', () => {
    it('update definition with missing organization fails closed', async () => {
      const hrNoOrg = { ...hrSession, organizationId: undefined };
      mockPrisma.kpi.findUnique.mockResolvedValue({
        id: 'kpi-001',
        organizationId: 'org-test-kpi',
        deletedAt: null,
      });

      await expect(
        KpiService.updateKpiDefinition('kpi-001', { title: 'Updated' }, hrNoOrg)
      ).rejects.toThrow('Chỉ số KPI không tồn tại hoặc đã bị xóa.');
    });

    it('update definition cannot connect a department from another organization', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue({
        id: 'kpi-001',
        organizationId: 'org-test-kpi',
        deletedAt: null,
      });
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 'dept-foreign',
        organizationId: 'org-foreign',
      });

      await expect(
        KpiService.updateKpiDefinition('kpi-001', { departmentId: 'dept-foreign' }, hrSession)
      ).rejects.toThrow('Phòng ban được chỉ định không tồn tại hoặc không thuộc tổ chức hiện tại.');
    });

    it('delete definition with missing organization fails closed', async () => {
      const hrNoOrg = { ...hrSession, organizationId: undefined };
      mockPrisma.kpi.findUnique.mockResolvedValue({
        id: 'kpi-001',
        organizationId: 'org-test-kpi',
        deletedAt: null,
        _count: { results: 0 },
      });

      await expect(
        KpiService.deleteKpiDefinition('kpi-001', hrNoOrg)
      ).rejects.toThrow('Chỉ số KPI không tồn tại.');
    });

    it('recordActualValue with missing organization fails closed', async () => {
      const empNoOrg = { ...employeeSession, organizationId: undefined };
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({
        id: 'res-001',
        employeeId: 'emp-001',
        organizationId: 'org-test-kpi',
        status: 'DRAFT',
      });

      await expect(
        KpiService.recordActualValue('res-001', { actualValue: 100 }, empNoOrg)
      ).rejects.toThrow('Không tìm thấy bản ghi KPI.');
    });

    it('manager cannot recordActualValue for employee outside managed department', async () => {
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({
        id: 'res-001',
        employeeId: 'emp-sales',
        organizationId: 'org-test-kpi',
        status: 'DRAFT',
        employee: {
          id: 'emp-sales',
          departmentId: 'dept-sales',
        },
      });
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-mgr',
        managedDepartments: [{ id: 'dept-eng' }],
      });

      await expect(
        KpiService.recordActualValue('res-001', { actualValue: 100 }, managerSession)
      ).rejects.toThrow('Bạn chỉ có quyền cập nhật KPI cho nhân viên thuộc phòng ban bạn trực tiếp quản lý.');
    });

    it('evaluate assignment with missing organization fails closed', async () => {
      const hrNoOrg = { ...hrSession, organizationId: undefined };
      mockPrisma.employeeKpiResult.findUnique.mockResolvedValue({
        id: 'res-001',
        employeeId: 'emp-001',
        organizationId: 'org-test-kpi',
        status: 'SUBMITTED',
        employee: mockEmployee,
      });

      await expect(
        KpiService.evaluateKpiAssignment('res-001', { decision: 'APPROVED' }, hrNoOrg)
      ).rejects.toThrow('Không tìm thấy bản ghi KPI.');
    });

    it('manager cannot read cross-department scorecard outside managed departments', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        ...mockEmployee,
        id: 'emp-sales',
        departmentId: 'dept-sales',
      });
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([]);
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-mgr',
        managedDepartments: [{ id: 'dept-eng' }],
      });

      await expect(
        KpiService.getEmployeeScorecard('emp-sales', '2026-10', managerSession)
      ).rejects.toThrow('Bạn chỉ có quyền xem bảng điểm KPI của nhân viên thuộc phòng ban bạn trực tiếp quản lý.');
    });

    it('dashboard non-HR/Admin without session.employeeId fails closed', async () => {
      const empNoId = { ...employeeSession, employeeId: undefined };
      await expect(
        KpiService.getKpiDashboardSummary(empNoId)
      ).rejects.toThrow('Tài khoản chưa được liên kết với hồ sơ nhân viên.');
    });

    it('assignKpiToEmployee with missing organization fails closed', async () => {
      const hrNoOrg = { ...hrSession, organizationId: undefined };
      mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);

      await expect(
        KpiService.assignKpiToEmployee(
          { employeeId: 'emp-001', kpiId: 'kpi-001', period: '2026-10', targetValue: 100 },
          hrNoOrg
        )
      ).rejects.toThrow('Nhân viên không tồn tại, đã nghỉ việc hoặc không thuộc tổ chức hiện tại.');
    });

    it('assignKpiToEmployee rejects KPI/employee tenant mismatch', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        ...mockEmployee,
        organizationId: 'org-test-kpi',
      });
      mockPrisma.kpi.findUnique.mockResolvedValue({
        id: 'kpi-foreign',
        organizationId: 'org-foreign',
        deletedAt: null,
        status: 'ACTIVE',
      });

      await expect(
        KpiService.assignKpiToEmployee(
          { employeeId: 'emp-001', kpiId: 'kpi-foreign', period: '2026-10', targetValue: 100 },
          hrSession
        )
      ).rejects.toThrow('Chỉ số KPI không thuộc cùng tổ chức với nhân viên.');
    });

    it('bulkAssignKpi with missing organization fails closed', async () => {
      const hrNoOrg = { ...hrSession, organizationId: undefined };
      mockPrisma.kpi.findUnique.mockResolvedValue({
        id: 'kpi-001',
        organizationId: 'org-test-kpi',
        deletedAt: null,
        status: 'ACTIVE',
      });

      await expect(
        KpiService.bulkAssignKpi(
          { kpiId: 'kpi-001', employeeIds: ['emp-001'], period: '2026-10' },
          hrNoOrg
        )
      ).rejects.toThrow('Chỉ số KPI không khả dụng hoặc không thuộc tổ chức hiện tại.');
    });

    it('bulk assignment cannot escape KPI organization boundary', async () => {
      mockPrisma.kpi.findUnique.mockResolvedValue({
        id: 'kpi-001',
        organizationId: 'org-test-kpi',
        deletedAt: null,
        status: 'ACTIVE',
      });
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: 'emp-001', organizationId: 'org-test-kpi' },
      ]);

      await expect(
        KpiService.bulkAssignKpi(
          { kpiId: 'kpi-001', employeeIds: ['emp-001', 'emp-foreign'], period: '2026-10' },
          hrSession
        )
      ).rejects.toThrow('Một hoặc nhiều nhân viên không hợp lệ hoặc không thuộc cùng tổ chức với chỉ số KPI.');

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-test-kpi',
            id: { in: ['emp-001', 'emp-foreign'] },
          }),
        })
      );
    });
  });
});
