import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';

const hrSession: UserSession = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  roles: ['hr'],
  email: 'hr@antigravity.test',
  fullName: 'HR Specialist',
  permissions: [],
  isActive: true,
};

const employeeSession: UserSession = {
  userId: 'usr-emp',
  employeeId: 'emp-01',
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
  });

  // ── 1. Create Period ───────────────────────────────────────────────────────
  describe('1. createPeriod', () => {
    it('creates a new payroll period and records audit log', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue(null);
      mockPrisma.payrollRule.findFirst.mockResolvedValue({
        id: 'rule-default-id',
        code: 'VN_STATUTORY_2026',
        name: 'Luật Lao Động VN 2026',
      });
      mockPrisma.payrollPeriod.create.mockResolvedValue({
        id: 'period-new-id',
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
    it('executes end-to-end payroll calculation inside ACID transaction from official DB data', async () => {
      // Setup Period
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        name: 'Kỳ Lương Tháng 09/2026',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-30'),
        standardWorkDays: 22,
        status: 'DRAFT',
        payrollRule: {
          id: 'rule-01',
          code: 'VN_STATUTORY_2026',
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

      // Setup official attendance (22 days full, 4 hours OT)
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          workDate: new Date('2026-09-02'),
          actualWorkHours: 8,
          otHours: 4,
          status: 'VALID',
        },
        ...Array.from({ length: 21 }, (_, i) => ({
          workDate: new Date(`2026-09-${(i + 3).toString().padStart(2, '0')}`),
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

      const result = await PayrollService.calculatePeriodPayroll(
        { periodId: 'period-01', recalculate: true },
        hrSession
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.periodId).toBe('period-01');
      expect(result.status).toBe('CALCULATED');
      expect(result.totalEmployees).toBe(1);
      expect(result.totalGrossPayout).toBeGreaterThan(0);
      expect(result.totalNetPayout).toBeGreaterThan(0);
    });

    it('rejects calculation if period is already CLOSED', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-closed',
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
      mockPrisma.payroll.findUnique.mockResolvedValue({
        id: 'slip-01',
        periodId: 'period-01',
        employeeId: 'emp-01',
        contractSalary: 20000000,
        netSalary: 17500000,
        employee: {
          id: 'emp-01',
          userId: 'usr-emp',
          employeeCode: 'EMP-001',
        },
        period: {
          id: 'period-01',
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
    it('closes payroll period and records audit log', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        status: 'CALCULATED',
      });
      mockPrisma.payrollPeriod.update.mockResolvedValue({
        id: 'period-01',
        status: 'CLOSED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-close' });

      const res = await PayrollService.closePeriod('period-01', hrSession);
      expect(res.status).toBe('CLOSED');
      expect(mockPrisma.payrollPeriod.update).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });
});
