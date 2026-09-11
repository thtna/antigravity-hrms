import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  payrollRule: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
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

import { PayrollRuleService } from '../payroll-rule.service';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import { UserSession } from '@/types';

const adminSession: UserSession = {
  userId: 'usr-admin',
  employeeId: 'emp-admin',
  organizationId: 'org-test-payroll-rule',
  roles: ['admin'],
  email: 'admin@test.com',
  fullName: 'Admin User',
  permissions: [],
  isActive: true,
};

const hrSession: UserSession = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  organizationId: 'org-test-payroll-rule',
  roles: ['hr'],
  email: 'hr@test.com',
  fullName: 'HR User',
  permissions: [],
  isActive: true,
};

const employeeSession: UserSession = {
  userId: 'usr-emp',
  employeeId: 'emp-001',
  organizationId: 'org-test-payroll-rule',
  roles: ['employee'],
  email: 'emp@test.com',
  fullName: 'Employee One',
  permissions: [],
  isActive: true,
};

const mockDbRule = {
  id: 'rule-001',
  organizationId: 'org-test-payroll-rule',
  code: 'RULE_VN_2026',
  name: 'Quy Chế Việt Nam 2026',
  description: 'Mô tả quy chế',
  isDefault: true,
  isActive: true,
  version: 1,
  salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis,
  overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime,
  insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance,
  taxConfig: VIETNAM_STATUTORY_RULE_2026.tax,
  deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction,
  roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null,
};

describe('PHASE 14 — PAYROLL RULE SERVICE TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.payrollRule.findFirst.mockImplementation((...args: any[]) =>
      mockPrisma.payrollRule.findUnique(...args)
    );
  });

  describe('0. Read Paths Do Not Seed Rules', () => {
    it('listRules returns empty rules for an empty tenant without creating payroll rows', async () => {
      mockPrisma.payrollRule.findMany.mockResolvedValue([]);

      const rules = await PayrollRuleService.listRules(hrSession);

      expect(rules).toEqual([]);
      expect(mockPrisma.payrollRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-test-payroll-rule' },
        })
      );
      expect(mockPrisma.payrollRule.count).not.toHaveBeenCalled();
      expect(mockPrisma.payrollRule.create).not.toHaveBeenCalled();
    });

    it('getDefaultRule fails closed without a configured tenant default and does not auto-seed', async () => {
      mockPrisma.payrollRule.findFirst.mockResolvedValue(null);

      await expect(
        PayrollRuleService.getDefaultRule('org-test-payroll-rule')
      ).rejects.toThrow('Chưa có quy chế lương mặc định được cấu hình');

      expect(mockPrisma.payrollRule.count).not.toHaveBeenCalled();
      expect(mockPrisma.payrollRule.create).not.toHaveBeenCalled();
    });

    it('getDefaultRule returns an explicitly configured default rule without creating rows', async () => {
      mockPrisma.payrollRule.findFirst.mockResolvedValue(mockDbRule);

      const rule = await PayrollRuleService.getDefaultRule('org-test-payroll-rule');

      expect(rule.ruleCode).toBe('RULE_VN_2026');
      expect(rule.ruleName).toBe('Quy Chế Việt Nam 2026');
      expect(mockPrisma.payrollRule.create).not.toHaveBeenCalled();
    });
  });

  describe('1. Rule CRUD & Permissions', () => {
    it('blocks regular employees from creating a payroll rule', async () => {
      await expect(
        PayrollRuleService.createRule(
          {
            code: 'TEST_RULE',
            name: 'Quy Chế Test',
            isDefault: false,
            salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis as any,
            overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
            insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
            taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
            deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
            roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
            effectiveFrom: '2026-01-01',
          },
          employeeSession
        )
      ).rejects.toThrow('Chỉ HR hoặc Quản trị viên mới có quyền tạo quy chế lương.');
    });

    it('blocks creating a rule with duplicate code', async () => {
      mockPrisma.payrollRule.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        PayrollRuleService.createRule(
          {
            code: 'RULE_VN_2026',
            name: 'Trùng mã',
            isDefault: false,
            salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis as any,
            overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
            insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
            taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
            deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
            roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
            effectiveFrom: '2026-01-01',
          },
          hrSession
        )
      ).rejects.toThrow('đã tồn tại');
    });

    it('creates a new payroll rule and writes to AuditLog', async () => {
      mockPrisma.payrollRule.findUnique.mockResolvedValue(null);
      mockPrisma.payrollRule.create.mockResolvedValue({ ...mockDbRule, code: 'NEW_RULE' });

      const res = await PayrollRuleService.createRule(
        {
          code: 'NEW_RULE',
          name: 'Quy Chế Mới',
          isDefault: true,
          salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis as any,
          overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
          insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
          taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
          deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
          roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
          effectiveFrom: '2026-01-01',
        },
        adminSession
      );

      expect(res.code).toBe('NEW_RULE');
      expect(mockPrisma.payrollRule.create).toHaveBeenCalledOnce();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_PAYROLL_RULE',
            actorId: 'usr-admin',
          }),
        })
      );
    });

    it('updates a rule, increments version and writes old/new diff to AuditLog', async () => {
      mockPrisma.payrollRule.findUnique.mockResolvedValue({ ...mockDbRule, version: 1 });
      mockPrisma.payrollRule.update.mockResolvedValue({
        ...mockDbRule,
        version: 2,
        name: 'Tên Đã Cập Nhật',
      });

      const res = await PayrollRuleService.updateRule(
        'rule-001',
        { name: 'Tên Đã Cập Nhật' },
        hrSession
      );

      expect(res.version).toBe(2);
      expect(mockPrisma.payrollRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rule-001' },
          data: expect.objectContaining({
            version: 2,
            name: 'Tên Đã Cập Nhật',
          }),
        })
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE_PAYROLL_RULE',
            actorId: 'usr-hr',
          }),
        })
      );
    });

    it('sets default rule and unsets previous defaults', async () => {
      mockPrisma.payrollRule.findUnique.mockResolvedValue({ ...mockDbRule, id: 'rule-002' });
      mockPrisma.payrollRule.update.mockResolvedValue({
        ...mockDbRule,
        id: 'rule-002',
        isDefault: true,
      });

      const res = await PayrollRuleService.setDefaultRule('rule-002', adminSession);

      expect(mockPrisma.payrollRule.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true, organizationId: 'org-test-payroll-rule' },
        data: { isDefault: false },
      });
      expect(res.isDefault).toBe(true);
    });
  });

  describe('2. Simulation Sandbox', () => {
    it('fails closed without a selected rule or explicit simulation config and writes no audit', async () => {
      await expect(
        PayrollRuleService.simulatePayroll(
          {
            employee: {
              contractSalary: 25000000,
              dependentsCount: 1,
              allowances: 1000000,
              taxExemptAllowances: 730000,
            },
            attendance: {
              actualWorkDays: 22,
              paidLeaveDays: 0,
              unpaidLeaveDays: 0,
              weekdayOtHours: 5,
              weekendOtHours: 0,
              holidayOtHours: 0,
              nightHours: 0,
            },
            adjustments: {
              kpiBonus: 2000000,
              otherBonuses: 0,
              penalties: 0,
            },
          },
          hrSession
        )
      ).rejects.toThrow('Vui lòng chọn quy chế lương đã cấu hình');

      expect(mockPrisma.payrollRule.create).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('runs simulation with an explicitly selected payroll rule and returns complete breakdown', async () => {
      const ruleId = '00000000-0000-4000-8000-000000000001';
      mockPrisma.payrollRule.findUnique.mockResolvedValue({ ...mockDbRule, id: ruleId });

      const sim = await PayrollRuleService.simulatePayroll(
        {
          ruleId,
          employee: {
            contractSalary: 25000000,
            dependentsCount: 1,
            allowances: 1000000,
            taxExemptAllowances: 730000,
          },
          attendance: {
            actualWorkDays: 22,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
            weekdayOtHours: 5,
            weekendOtHours: 0,
            holidayOtHours: 0,
            nightHours: 0,
          },
          adjustments: {
            kpiBonus: 2000000,
            otherBonuses: 0,
            penalties: 0,
          },
        },
        hrSession
      );

      expect(sim.result).toBeDefined();
      expect(sim.result.proratedBaseSalary).toBe(25000000);
      expect(sim.result.grossIncome).toBeGreaterThan(27000000);
      expect(sim.result.netSalary).toBeGreaterThan(20000000);
      expect(sim.result.insurance.totalEmployee).toBeGreaterThan(0);
      expect(mockPrisma.payrollRule.create).not.toHaveBeenCalled();
    });

    it('runs simulation with explicit custom rule configuration without auto-seeding', async () => {
      const sim = await PayrollRuleService.simulatePayroll(
        {
          ruleConfig: {
            code: 'SIM_CUSTOM',
            name: 'Configured Simulation Rule',
            salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis as any,
            overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
            insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
            taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
            deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
            roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
          },
          employee: {
            contractSalary: 25000000,
            dependentsCount: 1,
            allowances: 1000000,
            taxExemptAllowances: 730000,
          },
          attendance: {
            actualWorkDays: 22,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
            weekdayOtHours: 5,
            weekendOtHours: 0,
            holidayOtHours: 0,
            nightHours: 0,
          },
          adjustments: {
            kpiBonus: 2000000,
            otherBonuses: 0,
            penalties: 0,
          },
        },
        hrSession
      );

      expect(sim.ruleUsed.code).toBe('SIM_CUSTOM');
      expect(sim.result).toBeDefined();
      expect(mockPrisma.payrollRule.create).not.toHaveBeenCalled();
    });
  });
});
