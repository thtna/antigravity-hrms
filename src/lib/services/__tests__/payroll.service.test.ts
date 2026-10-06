import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  payrollPeriod: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  payrollRule: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  employee: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  attendance: {
    findMany: vi.fn(),
  },
  holiday: { findMany: vi.fn() },
  leaveRequest: {
    findMany: vi.fn(),
  },
  employeeBonusPenalty: {
    findMany: vi.fn(),
  },
  employeeKpiResult: {
    findMany: vi.fn(),
  },
  payroll: {
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  payrollDetail: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
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

import { PayrollService } from '../payroll.service';
import { UserSession } from '@/types';
import { LEGACY_CUSTOM_PAYROLL_RULE as VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/__tests__/fixtures/legacy-custom-rule';
import { PayrollCalculationEngine } from '@/lib/payroll/payroll-calculation-engine';
import { createVietnamStatutoryRule2026 } from '@/lib/payroll/vietnam-statutory-2026';
import { parseBusinessLocalDateTime } from '@/lib/time/business-time';

const hrSession: UserSession = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  organizationId: 'org-test-payroll',
  roles: ['hr'],
  email: 'hr@antigravity.test',
  fullName: 'HR Specialist',
  permissions: [],
  isActive: true,
};

const employeeSession: UserSession = {
  userId: 'usr-emp',
  employeeId: 'emp-01',
  organizationId: 'org-test-payroll',
  roles: ['employee'],
  email: 'emp@antigravity.test',
  fullName: 'Regular Employee',
  permissions: [],
  isActive: true,
};

describe('PHASE 15 — PAYROLL SERVICE TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.payrollPeriod.findFirst.mockImplementation((...args: any[]) =>
      mockPrisma.payrollPeriod.findUnique(...args)
    );
    mockPrisma.payroll.findFirst.mockImplementation(async ({ where }) => {
      const payroll = await mockPrisma.payroll.findUnique({ where: { id: where.id } });
      return payroll?.organizationId === where.organizationId ? payroll : null;
    });
  });

  // ── 1. Create Period ───────────────────────────────────────────────────────
  describe('1. createPeriod', () => {
    it('creates a new payroll period and records audit log', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue(null);
      mockPrisma.payrollRule.findFirst.mockResolvedValue({
        id: 'rule-default-id',
        organizationId: 'org-test-payroll',
        code: 'VN_STATUTORY_2026',
        name: 'Luật Lao Động VN 2026',
      });
      mockPrisma.payrollPeriod.create.mockResolvedValue({
        id: 'period-new-id',
        organizationId: 'org-test-payroll',
        code: 'PR-2026-09',
        name: 'Kỳ Lương Tháng 09/2026',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        standardWorkDays: 22,
        status: 'DRAFT',
      });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-01' });

      const res = await PayrollService.createPeriod(
        {
          code: 'PR-2026-09',
          name: 'Kỳ Lương Tháng 09/2026',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          standardWorkDays: 22,
        },
        hrSession
      );

      expect(res.code).toBe('PR-2026-09');
      expect(mockPrisma.payrollPeriod.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
      const createData = mockPrisma.payrollPeriod.create.mock.calls[0][0].data;
      expect(createData.startDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(createData.endDate.toISOString()).toBe('2026-09-30T00:00:00.000Z');
    });

    it('rejects impossible payroll period dates instead of normalizing them', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue(null);
      mockPrisma.payrollRule.findFirst.mockResolvedValue(null);

      await expect(PayrollService.createPeriod({
        code: 'PR-INVALID',
        name: 'Invalid period',
        startDate: '2026-02-30',
        endDate: '2026-03-31',
        standardWorkDays: 22,
      }, hrSession)).rejects.toThrow(/khong ton tai/i);
      expect(mockPrisma.payrollPeriod.create).not.toHaveBeenCalled();
    });

    it('rejects creation if employee has no HR/Admin permissions', async () => {
      await expect(
        PayrollService.createPeriod(
          {
            code: 'PR-2026-09',
            name: 'Kỳ Lương Tháng 09/2026',
            startDate: '2026-09-01',
            endDate: '2026-09-30',
            standardWorkDays: 22,
          },
          employeeSession
        )
      ).rejects.toThrow(/Chỉ Nhân sự hoặc Quản trị viên/);
    });
  });

  // ── 2. Calculate Period Payroll (ACID Transaction) ─────────────────────────
  describe('2. calculatePeriodPayroll', () => {
    it.each(['hr', 'admin'] as const)('%s executes end-to-end payroll calculation inside ACID transaction from official DB data', async (role) => {
      // Setup Period
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        organizationId: 'org-test-payroll',
        code: 'PR-2026-09',
        name: 'Kỳ Lương Tháng 09/2026',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        standardWorkDays: 22,
        status: 'DRAFT',
        payrollRule: {
          id: 'rule-01',
          organizationId: 'org-test-payroll',
          code: VIETNAM_STATUTORY_RULE_2026.ruleCode,
          name: 'Quy Chế Tiền Lương 2026',
          salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis,
          overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime,
          insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance,
          taxConfig: VIETNAM_STATUTORY_RULE_2026.tax,
          deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction,
          roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding,
        },
      });

      // Setup eligible employee
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-01',
          organizationId: 'org-test-payroll',
          employeeCode: 'EMP-001',
          firstName: 'Văn A',
          lastName: 'Nguyễn',
          contractSalary: 22000000,
          hourlyRate: 125000,
          insuranceSalary: 22000000,
          dependentsCount: 1,
          hireDate: new Date('2024-01-01'),
          status: 'ACTIVE',
        },
      ]);

      // Setup official attendance (22 days full, weekday and weekend OT)
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          employeeId: 'emp-01',
          workDate: new Date('2026-09-02'),
          actualWorkHours: 8,
          otHours: 4,
          status: 'VALID',
        },
        {
          employeeId: 'emp-01',
          workDate: new Date('2026-09-05'),
          actualWorkHours: 8,
          otHours: 2,
          status: 'VALID',
        },
        {
          employeeId: 'emp-01',
          workDate: new Date('2026-09-06'),
          actualWorkHours: 8,
          otHours: 3,
          status: 'VALID',
        },
        ...Array.from({ length: 19 }, (_, i) => ({
          employeeId: 'emp-01',
          workDate: new Date(`2026-09-${(i + 7).toString().padStart(2, '0')}`),
          actualWorkHours: 8,
          otHours: 0,
          status: 'VALID',
        })),
      ]);

      // Setup official approved leaves (0 leave)
      mockPrisma.leaveRequest.findMany.mockResolvedValue([]);

      // Setup official approved bonus & penalty
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([
        {
          id: 'bonus-01',
          type: 'BONUS',
          category: 'PROJECT',
          amount: 2000000,
          status: 'APPROVED',
        },
        {
          id: 'penalty-01',
          type: 'PENALTY',
          category: 'LATE',
          amount: 200000,
          status: 'APPROVED',
        },
      ]);

      // Setup official approved KPI result
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([
        {
          bonusAmount: 1500000,
          status: 'APPROVED',
        },
      ]);

      // Mock transaction callback
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const txMock = {
          payroll: {
            findMany: vi.fn().mockResolvedValue([]),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({ id: 'payroll-emp-01' }),
          },
          payrollDetail: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 6 }),
          },
          payrollPeriod: {
            update: vi.fn().mockResolvedValue({
              id: 'period-01',
              code: 'PR-2026-09',
              status: 'CALCULATED',
              totalGrossPayout: 26250000,
              totalNetPayout: 22500000,
            }),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({ id: 'audit-calc-01' }),
          },
        };
        return await callback(txMock);
      });

      const calculateSpy = vi.spyOn(PayrollCalculationEngine, 'calculate');
      const result = await PayrollService.calculatePeriodPayroll(
        { periodId: 'period-01', recalculate: true },
        { ...hrSession, roles: [role] }
      );

      expect(mockPrisma.payrollPeriod.findFirst).toHaveBeenCalledWith({
        where: { id: 'period-01', organizationId: hrSession.organizationId },
        include: { payrollRule: true },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.periodId).toBe('period-01');
      expect(result.status).toBe('CALCULATED');
      expect(result.totalEmployees).toBe(1);
      expect(result.totalGrossPayout).toBeGreaterThan(0);
      expect(result.totalNetPayout).toBeGreaterThan(0);
      expect(calculateSpy).toHaveBeenCalledWith(expect.objectContaining({
        overtimeDetails: expect.objectContaining({
          weekdayOtHours: 4,
          weekendOtHours: 5,
        }),
      }));
      calculateSpy.mockRestore();
    });

    it('rejects calculation if period is already CLOSED', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-closed',
        organizationId: 'org-test-payroll',
        code: 'PR-2026-08',
        status: 'CLOSED',
      });

      await expect(
        PayrollService.calculatePeriodPayroll(
          { periodId: 'period-closed', recalculate: false },
          hrSession
        )
      ).rejects.toThrow(/đã khóa \(CLOSED\)/);
    });
  });

  // ── 3. Get Payslip Detail ──────────────────────────────────────────────────
  describe('3. getPayslipDetail', () => {
    it('returns payslip with line items and enforces RBAC', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-01', organizationId: 'org-test-payroll' });
      mockPrisma.payroll.findUnique.mockResolvedValue({
        id: 'slip-01',
        organizationId: 'org-test-payroll',
        periodId: 'period-01',
        employeeId: 'emp-01',
        contractSalary: 20000000,
        netSalary: 17500000,
        employee: {
          id: 'emp-01',
          organizationId: 'org-test-payroll',
          userId: 'usr-emp',
          employeeCode: 'EMP-001',
        },
        period: {
          id: 'period-01',
          organizationId: 'org-test-payroll',
          code: 'PR-2026-09',
        },
        details: [
          { itemType: 'EARNING', itemCode: 'BASE_PRORATED', amount: 20000000 },
          { itemType: 'INSURANCE', itemCode: 'INSURANCE_EMP', amount: 2100000 },
        ],
      });

      // Employee viewing their own payslip
      const slip = await PayrollService.getPayslipDetail('slip-01', employeeSession);
      expect(slip.id).toBe('slip-01');
      expect(slip.details.length).toBe(2);

      // Other employee viewing someone else's payslip -> Forbidden
      const otherEmployeeSession: UserSession = {
        userId: 'usr-other',
        employeeId: 'emp-other',
        organizationId: 'org-test-payroll',
        roles: ['employee'],
        email: 'other@antigravity.test',
        fullName: 'Other Emp',
        permissions: [],
        isActive: true,
      };

      await expect(
        PayrollService.getPayslipDetail('slip-01', otherEmployeeSession)
      ).rejects.toThrow(/không có quyền truy cập/);
    });
  });

  // ── 4. Close Period ────────────────────────────────────────────────────────
  describe('4. closePeriod', () => {
    it.each(['hr', 'admin'] as const)('%s closes payroll period and records audit log', async (role) => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        organizationId: 'org-test-payroll',
        status: 'CALCULATED',
      });
      mockPrisma.payrollPeriod.update.mockResolvedValue({
        id: 'period-01',
        status: 'CLOSED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-close' });

      const res = await PayrollService.closePeriod('period-01', { ...hrSession, roles: [role] });
      expect(res.status).toBe('CLOSED');
      expect(mockPrisma.payrollPeriod.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'period-01', organizationId: hrSession.organizationId },
      }));
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });
});

describe('G06 payroll write tenant authorization', () => {
  const period = {
    id: 'period-01', organizationId: hrSession.organizationId, code: '2026-09',
    status: 'DRAFT', startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: new Date('2026-09-30T00:00:00.000Z'), standardWorkDays: 22,
  };
  const operations = [
    { name: 'calculatePeriodPayroll', run: (session: UserSession) => PayrollService.calculatePeriodPayroll({ periodId: period.id, recalculate: true }, session) },
    { name: 'closePeriod', run: (session: UserSession) => PayrollService.closePeriod(period.id, session) },
  ];

  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.payrollPeriod.findFirst.mockResolvedValue(period);
    vi.spyOn(PayrollCalculationEngine, 'calculate');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const expectNoEffects = () => {
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.employee.findMany).not.toHaveBeenCalled();
    expect(PayrollCalculationEngine.calculate).not.toHaveBeenCalled();
    expect(mockPrisma.payrollPeriod.update).not.toHaveBeenCalled();
    expect(mockPrisma.payroll.create).not.toHaveBeenCalled();
    expect(mockPrisma.payroll.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.payrollDetail.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.payrollDetail.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  };

  describe.each(operations)('$name', ({ run }) => {
    it.each([undefined, null, '', '   '])('rejects missing organization context %s before lookup/calculation', async (organizationId) => {
      await expect(run({ ...hrSession, organizationId })).rejects.toMatchObject({ statusCode: 403 });
      expect(mockPrisma.payrollPeriod.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.payrollPeriod.findUnique).not.toHaveBeenCalled();
      expectNoEffects();
    });

    it('rejects a foreign period through tenant-scoped lookup', async () => {
      const foreignPeriod = { ...period, organizationId: 'org-other' };
      mockPrisma.payrollPeriod.findFirst.mockImplementation(async ({ where }) =>
        foreignPeriod.organizationId === where.organizationId ? foreignPeriod : null
      );
      await expect(run(hrSession)).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.payrollPeriod.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: period.id, organizationId: hrSession.organizationId },
      }));
      expectNoEffects();
    });

    it.each(['org-other', null, undefined])('rejects mismatched period ownership %s without effects', async (organizationId) => {
      mockPrisma.payrollPeriod.findFirst.mockResolvedValue({ ...period, organizationId });
      await expect(run(hrSession)).rejects.toMatchObject({ statusCode: 404 });
      expectNoEffects();
    });

    it('preserves the employee role denial', async () => {
      await expect(run(employeeSession)).rejects.toMatchObject({ statusCode: 403 });
      expectNoEffects();
    });
  });
});

describe('C4R1A statutory payroll evidence before persistence', () => {
  const rule = createVietnamStatutoryRule2026({ period: '2026-01', region: 'IV' });
  const employee = {
    id: 'emp-safe', organizationId: hrSession.organizationId, employeeCode: 'SAFE',
    contractSalary: 22000000, insuranceSalary: 22000000, dependentsCount: 0,
  };
  const period = {
    id: 'statutory-period', organizationId: hrSession.organizationId, code: 'PR-2026-09', status: 'DRAFT',
    startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z'), standardWorkDays: 22,
    payrollRule: {
      code: rule.ruleCode, name: rule.ruleName, salaryBasisConfig: rule.salaryBasis,
      overtimeConfig: rule.overtime, insuranceConfig: rule.insurance, taxConfig: rule.tax,
      deductionConfig: rule.deduction, roundingConfig: rule.rounding,
    },
  };
  const daytime = {
    employeeId: employee.id, organizationId: hrSession.organizationId, workDate: new Date('2026-09-02T00:00:00Z'),
    checkInTime: parseBusinessLocalDateTime('2026-09-02', '08:00'),
    checkOutTime: parseBusinessLocalDateTime('2026-09-02', '17:00'),
    actualWorkHours: 8, otHours: 0,
    schedule: { shift: { isOvernight: false, startTime: '08:00', endTime: '17:00' } },
  };
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.payrollPeriod.findFirst.mockResolvedValue(period);
    mockPrisma.employee.findMany.mockResolvedValue([employee]);
    mockPrisma.attendance.findMany.mockResolvedValue([daytime]);
    mockPrisma.holiday.findMany.mockResolvedValue([{ date: daytime.workDate, isRecurring: false }]);
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);
    mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([]);
    mockPrisma.employeeKpiResult.findMany.mockResolvedValue([]);
    mockPrisma.payroll.findMany.mockResolvedValue([]);
    mockPrisma.payroll.create.mockResolvedValue({ id: 'new-payroll' });
    mockPrisma.payrollPeriod.update.mockImplementation(async ({ data }) => ({ ...period, ...data }));
    mockPrisma.$transaction.mockImplementation(async cb => cb(mockPrisma));
  });
  it('calculates verified daytime/no-OT payroll and queries tenant-scoped holiday evidence', async () => {
    const result = await PayrollService.calculatePeriodPayroll({ periodId: period.id, recalculate: true }, hrSession);
    expect(result.status).toBe('CALCULATED');
    expect(mockPrisma.payroll.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.holiday.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: hrSession.organizationId }),
    }));
    expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: hrSession.organizationId }),
      include: { schedule: { include: { shift: true } } },
    }));
  });
  it.each([
    { otHours: 1 },
    { checkInTime: null },
    { checkOutTime: parseBusinessLocalDateTime('2026-09-02', '22:30') },
    { schedule: { shift: { isOvernight: true, startTime: '22:00', endTime: '06:00' } } },
  ])('rejects insufficient evidence %j before deleting or replacing ANY payroll rows', async override => {
    mockPrisma.employee.findMany.mockResolvedValue([employee, { ...employee, id: 'emp-ambiguous' }]);
    mockPrisma.attendance.findMany.mockResolvedValue([daytime, { ...daytime, ...override, employeeId: 'emp-ambiguous' }]);
    await expect(PayrollService.calculatePeriodPayroll({ periodId: period.id, recalculate: true }, hrSession))
      .rejects.toMatchObject({ statusCode: 400, errorCode: 'BAD_REQUEST' });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.payroll.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.payroll.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.payrollDetail.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.payroll.create).not.toHaveBeenCalled();
    expect(mockPrisma.payrollDetail.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.payrollPeriod.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
