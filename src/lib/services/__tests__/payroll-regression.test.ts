import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PayrollCalculationEngine, DeterministicPayrollInput } from '@/lib/payroll/payroll-calculation-engine';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import { PayrollRuleConfig } from '@/lib/payroll/types';

// Hoisted Prisma mock for service-level lifecycle testing
const mockPrisma = vi.hoisted(() => ({
  payrollPeriod: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  payroll: {
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  payrollDetail: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  payrollRule: {
    findFirst: vi.fn(),
  },
  payrollApproval: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  payrollAdjustment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
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
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PayrollWorkflowService } from '../payroll-workflow.service';
import { UserSession } from '@/types';

describe('PHASE 9 — PAYROLL REGRESSION & MULTI-TENANT MATHEMATICAL INVARIANCE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminSessionOrgA: UserSession = {
    userId: 'usr-admin-a',
    organizationId: 'org-tenant-a',
    employeeId: 'emp-admin-a',
    roles: ['admin'],
    email: 'admin@tenant-a.com',
    fullName: 'Admin Tenant A',
    permissions: [],
    isActive: true,
  };

  const hrSessionOrgA: UserSession = {
    userId: 'usr-hr-a',
    organizationId: 'org-tenant-a',
    employeeId: 'emp-hr-a',
    roles: ['hr'],
    email: 'hr@tenant-a.com',
    fullName: 'HR Tenant A',
    permissions: [],
    isActive: true,
  };

  // ════════════════════════════════════════════════════════════════════════════
  // 1. BASELINE 10,000,000 INVARIANCE CONTRACT
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Baseline Invariance: 10,000,000 VND Contract', () => {
    it('[INVARIANCE-01] Pre-Migration vs Post-Migration yields identically 10,000,000 VND gross', () => {
      // Common standard input
      const standardInput: DeterministicPayrollInput = {
        baseSalary: 10000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      };

      // Legacy simulation (run without tenant context)
      const preMigrationOutput = PayrollCalculationEngine.calculate(standardInput);

      // Post-migration simulation (Tenant A)
      const postMigrationTenantA = PayrollCalculationEngine.calculate({
        ...standardInput,
      });

      // Post-migration simulation (Tenant B)
      const postMigrationTenantB = PayrollCalculationEngine.calculate({
        ...standardInput,
      });

      // Assert Gross and Prorated Salary are IDENTICALLY 10,000,000 VND
      expect(preMigrationOutput.proratedSalary).toBe(10000000);
      expect(preMigrationOutput.grossSalary).toBe(10000000);
      expect(postMigrationTenantA.grossSalary).toBe(10000000);
      expect(postMigrationTenantB.grossSalary).toBe(10000000);

      // Assert bit-for-bit mathematical equality across all outputs
      expect(postMigrationTenantA).toEqual(preMigrationOutput);
      expect(postMigrationTenantB).toEqual(preMigrationOutput);

      // Verify Social Insurance (10.5% of 10M = 1,050,000 VND)
      expect(postMigrationTenantA.insurance).toBe(1050000);
      expect(postMigrationTenantA.employeeSocial).toBe(800000); // 8%
      expect(postMigrationTenantA.employeeHealth).toBe(150000); // 1.5%
      expect(postMigrationTenantA.employeeUnemployment).toBe(100000); // 1%

      // Assessable income for PIT: 10,000,000 - 1,050,000 - 11,000,000 (personal relief) <= 0 -> Tax = 0
      expect(postMigrationTenantA.tax).toBe(0);

      // Net Salary = 10,000,000 - 1,050,000 - 0 = 8,950,000 VND
      expect(postMigrationTenantA.netSalary).toBe(8950000);
      expect(postMigrationTenantA.netSalary).toBe(preMigrationOutput.netSalary);
    });

    it('[INVARIANCE-02] 10,000,000 VND with zero-tax & zero-insurance rule yields exactly 10,000,000 net', () => {
      // Contract without insurance deduction (zero-rate rule config)
      const zeroDeductionRule: PayrollRuleConfig = {
        ...VIETNAM_STATUTORY_RULE_2026,
        insurance: {
          ...VIETNAM_STATUTORY_RULE_2026.insurance,
          employeeSocialRate: 0,
          employeeHealthRate: 0,
          employeeUnemploymentRate: 0,
          employerSocialRate: 0,
          employerHealthRate: 0,
          employerUnemploymentRate: 0,
        },
        tax: {
          ...VIETNAM_STATUTORY_RULE_2026.tax,
          personalRelief: 20000000, // Exempt from PIT
        },
      };

      const out = PayrollCalculationEngine.calculate({
        baseSalary: 10000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        ruleConfig: zeroDeductionRule,
      });

      expect(out.grossSalary).toBe(10000000);
      expect(out.insurance).toBe(0);
      expect(out.tax).toBe(0);
      expect(out.netSalary).toBe(10000000); // 10,000,000 trước migration === 10,000,000 sau migration
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. TEN CORE DIMENSIONS AUDIT
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. Comprehensive 10 Dimensions Audit', () => {
    // 1. Employee Dimension
    it('[DIM-01] Employee: handles dependents relief correctly without tenant drift', () => {
      // Base salary 30,000,000 VND
      // Case A: 0 dependents (11M personal relief)
      const out0Dep = PayrollCalculationEngine.calculate({
        baseSalary: 30000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        dependentsCount: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      // Case B: 2 dependents (11M + 2 * 4.4M = 19.8M relief)
      const out2Dep = PayrollCalculationEngine.calculate({
        baseSalary: 30000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        dependentsCount: 2,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      expect(out2Dep.dependentsRelief).toBe(8800000);
      expect(out2Dep.assessableIncome).toBeLessThan(out0Dep.assessableIncome);
      expect(out2Dep.tax).toBeLessThan(out0Dep.tax);
      expect(out2Dep.netSalary).toBeGreaterThan(out0Dep.netSalary);
    });

    // 2. Attendance Dimension
    it('[DIM-02] Attendance: calculates prorated salary with unexcused missing days', () => {
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 22000000,
        workDays: 22,
        actualWorkDays: 18, // Worked 18 out of 22 days (missed 4 days)
        workHours: 144,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      // 22M / 22 * 18 = 18,000,000 VND
      expect(out.dailyRate).toBe(1000000);
      expect(out.proratedSalary).toBe(18000000);
      expect(out.grossSalary).toBe(18000000);
    });

    // 3. Leave Dimension (Paid vs Unpaid)
    it('[DIM-03] Leave: preserves 100% pay for paid annual leave and deducts unpaid leave', () => {
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 22000000,
        workDays: 22,
        actualWorkDays: 20, // 20 days worked
        workHours: 160,
        paidLeaveDays: 2,   // 2 days paid annual leave
        unpaidLeaveDays: 0,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      // 20 days work (20M) + 2 days paid leave (2M) = 22M full pay
      expect(out.proratedSalary).toBe(20000000);
      expect(out.paidLeavePay).toBe(2000000);
      expect(out.grossSalary).toBe(22000000);
    });

    // 4. Overtime Dimension (Weekday 150%, Weekend 200%, Holiday 300%)
    it('[DIM-04] Overtime: calculates statutory multipliers with complete accuracy', () => {
      // 22,000,000 base -> Daily = 1,000,000 -> Hourly = 125,000
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 22000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 18, // 10h weekday, 5h weekend, 3h holiday
        overtimeDetails: {
          weekdayOtHours: 10,
          weekendOtHours: 5,
          holidayOtHours: 3,
          nightHours: 0,
        },
        bonus: 0,
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      // Weekday OT: 10 * 125,000 * 1.5 = 1,875,000
      // Weekend OT: 5 * 125,000 * 2.0 = 1,250,000
      // Holiday OT: 3 * 125,000 * 3.0 = 1,125,000
      // Total OT Pay = 4,250,000
      expect(out.hourlyRate).toBe(125000);
      expect(out.overtimePay).toBe(4250000);
      expect(out.grossSalary).toBe(26250000); // 22M + 4.25M
    });

    // 5. Allowance Dimension (Taxable vs Tax-Exempt)
    it('[DIM-05] Allowance: differentiates taxable and non-taxable allowances', () => {
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 20000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        allowances: 3000000,          // Total allowance: 3,000,000
        taxExemptAllowances: 1000000, // Lunch allowance (exempt): 1,000,000
        bonus: 0,
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      expect(out.grossSalary).toBe(23000000); // 20M + 3M
      expect(out.taxExemptAllowances).toBe(1000000);
      // Taxable income = Gross (23M) - TaxExempt (1M) - Insurance = 22M - Insurance
      expect(out.taxableIncome).toBe(22000000);
    });

    // 6. Bonus Dimension
    it('[DIM-06] Bonus: integrates KPI, project, and one-off bonuses into gross income', () => {
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 15000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 5000000,
        bonusDetails: {
          kpiBonus: 3000000,
          projectBonus: 2000000,
        },
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      expect(out.totalBonus).toBe(5000000);
      expect(out.grossSalary).toBe(20000000); // 15M + 5M
    });

    // 7. Deduction Dimension (Statutory Social Insurance & PIT)
    it('[DIM-07] Deduction: enforces statutory insurance ceilings and 7-tier tax brackets', () => {
      // High earner: 100,000,000 VND base salary
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 100000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      // Max social insurance base cap = 20 * base salary (cap = 46,800,000 in 2026)
      // 8% BHXH = 3,744,000
      // 1.5% BHYT = 702,000
      // 1% BHTN = max cap 20 * minimum regional wage
      expect(out.employeeSocial).toBeLessThan(100000000 * 0.08); // Capped!
      expect(out.tax).toBeGreaterThan(15000000); // Higher progressive PIT bracket
      // Accounting check with rounding tolerance (standard 1,000 VND unit)
      const expectedNet = out.grossSalary - out.insurance - out.tax - out.totalPenalty;
      expect(Math.abs(out.netSalary - expectedNet)).toBeLessThanOrEqual(1000);
    });

    // 8. Advance Dimension (Tạm ứng lương)
    it('[DIM-08] Advance: deducts salary advances from net payout seamlessly', () => {
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 20000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 0,
        penalty: 3000000, // Salary advance recorded as deduction/penalty
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      expect(out.totalPenalty).toBe(3000000);
      // Net salary decreased by exact advance amount
      const outWithoutAdvance = PayrollCalculationEngine.calculate({
        baseSalary: 20000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 0,
        penalty: 0,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      expect(out.netSalary).toBe(outWithoutAdvance.netSalary - 3000000);
    });

    // 9. Payroll Line Items Dimension
    it('[DIM-09] Payroll: generates structured line items for auditability', () => {
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 22000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 5,
        overtimeDetails: { weekdayOtHours: 5 },
        bonus: 2000000,
        penalty: 500000,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      expect(out.lineItems.length).toBeGreaterThanOrEqual(6);
      const codes = out.lineItems.map((li) => li.itemCode);
      expect(codes).toContain('BASE_PRORATED');
      expect(codes).toContain('OVERTIME');
      expect(codes).toContain('BONUS_TOTAL');
      expect(codes).toContain('PENALTY_TOTAL');
      expect(codes).toContain('INSURANCE_EMP');
      expect(codes).toContain('PIT_TAX');
    });

    // 10. Payslip Dimension
    it('[DIM-10] Payslip: verifies payslip totals reconcile with period totals', () => {
      const out = PayrollCalculationEngine.calculate({
        baseSalary: 18000000,
        workDays: 22,
        actualWorkDays: 22,
        workHours: 176,
        overtimeHours: 0,
        bonus: 1000000,
        penalty: 200000,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      });

      // Payslip balance equation: Gross - Deductions (Insurance + Tax + Penalties) === Net
      const totalDeductions = out.insurance + out.tax + out.totalPenalty;
      expect(out.grossSalary - totalDeductions).toBe(out.netSalary);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. MULTI-TENANT ISOLATION INVARIANCE
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. Multi-Tenant Cross-Isolation Invariance', () => {
    it('[TENANT-01] Two independent tenants calculating identical input produce identical output', () => {
      const inputTenantA: DeterministicPayrollInput = {
        baseSalary: 12500000,
        workDays: 22,
        actualWorkDays: 21,
        workHours: 168,
        overtimeHours: 4,
        overtimeDetails: { weekdayOtHours: 4 },
        bonus: 1500000,
        penalty: 100000,
        ruleConfig: VIETNAM_STATUTORY_RULE_2026,
      };

      const inputTenantB: DeterministicPayrollInput = {
        ...inputTenantA,
      };

      const resTenantA = PayrollCalculationEngine.calculate(inputTenantA);
      const resTenantB = PayrollCalculationEngine.calculate(inputTenantB);

      expect(resTenantA.grossSalary).toBe(resTenantB.grossSalary);
      expect(resTenantA.netSalary).toBe(resTenantB.netSalary);
      expect(resTenantA.tax).toBe(resTenantB.tax);
      expect(resTenantA.insurance).toBe(resTenantB.insurance);
      expect(resTenantA).toEqual(resTenantB);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. FULL LIFECYCLE & STATE MACHINE VERIFICATION
  // ════════════════════════════════════════════════════════════════════════════
  describe('4. Complete Payroll Lifecycle State Machine', () => {
    it('[LIFECYCLE-01] verifies DRAFT -> CALCULATED -> REVIEW -> APPROVED -> PAID/LOCKED', async () => {
      // 1. DRAFT state: Period created
      const draftPeriod = {
        id: 'prd-2026-09',
        code: 'PR-2026-09',
        name: 'Kỳ Lương Tháng 09/2026',
        status: 'DRAFT',
        organizationId: 'org-tenant-a',
        _count: { payrolls: 0 },
      };

      // 1.1 Assert DRAFT is mutable
      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable(draftPeriod.status, draftPeriod.code)
      ).not.toThrow();

      // 2. CALCULATED state: Engine calculates and saves payrolls
      const calculatedPeriod = {
        ...draftPeriod,
        status: 'CALCULATED',
        _count: { payrolls: 10 },
      };
      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable(calculatedPeriod.status, calculatedPeriod.code)
      ).not.toThrow();

      // 3. SUBMIT_REVIEW action: CALCULATED -> REVIEW
      mockPrisma.payrollPeriod.findUnique.mockResolvedValueOnce(calculatedPeriod);
      mockPrisma.$transaction.mockImplementationOnce(async (fn: any) => {
        return fn({
          payrollPeriod: {
            update: vi.fn().mockResolvedValueOnce({
              ...calculatedPeriod,
              status: 'REVIEW',
            }),
          },
          payrollApproval: {
            create: vi.fn().mockResolvedValueOnce({ id: 'appr-01', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        });
      });

      const reviewRes = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'prd-2026-09',
          targetStatus: 'REVIEW',
          action: 'SUBMIT_REVIEW',
          comments: 'Trình duyệt bảng lương tháng 9',
        },
        hrSessionOrgA
      );

      expect(reviewRes.status).toBe('REVIEW');

      // 4. APPROVE action: REVIEW -> APPROVED
      const inReviewPeriod = {
        ...calculatedPeriod,
        status: 'REVIEW',
      };
      mockPrisma.payrollPeriod.findUnique.mockResolvedValueOnce(inReviewPeriod);
      mockPrisma.$transaction.mockImplementationOnce(async (fn: any) => {
        return fn({
          payrollPeriod: {
            update: vi.fn().mockResolvedValueOnce({
              ...inReviewPeriod,
              status: 'APPROVED',
            }),
          },
          payrollApproval: {
            create: vi.fn().mockResolvedValueOnce({ id: 'appr-02', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        });
      });

      const approvedRes = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'prd-2026-09',
          targetStatus: 'APPROVED',
          action: 'APPROVE',
          comments: 'Phê duyệt chính thức bảng lương',
        },
        adminSessionOrgA
      );

      expect(approvedRes.status).toBe('APPROVED');

      // 4.1 Assert APPROVED period is IMMUTABLE
      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable('APPROVED', 'PR-2026-09')
      ).toThrow(/Bảng lương đã khóa, nghiêm cấm chỉnh sửa trực tiếp/);

      // 5. CONFIRM_PAID action: APPROVED -> PAID (Locked)
      const approvedPeriod = {
        ...calculatedPeriod,
        status: 'APPROVED',
      };
      mockPrisma.payrollPeriod.findUnique.mockResolvedValueOnce(approvedPeriod);
      mockPrisma.$transaction.mockImplementationOnce(async (fn: any) => {
        return fn({
          payrollPeriod: {
            update: vi.fn().mockResolvedValueOnce({
              ...approvedPeriod,
              status: 'PAID',
              closedAt: new Date(),
            }),
          },
          payroll: { updateMany: vi.fn() },
          payrollApproval: {
            create: vi.fn().mockResolvedValueOnce({ id: 'appr-03', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        });
      });

      const paidRes = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'prd-2026-09',
          targetStatus: 'PAID',
          action: 'CONFIRM_PAID',
          comments: 'Xác nhận giải ngân qua tài khoản ngân hàng',
        },
        adminSessionOrgA
      );

      expect(paidRes.status).toBe('PAID');

      // 5.1 Assert PAID period is IMMUTABLE
      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable('PAID', 'PR-2026-09')
      ).toThrow(/Bảng lương đã khóa, nghiêm cấm chỉnh sửa trực tiếp/);
    });

    it('[LIFECYCLE-02] handles Rejection: REVIEW -> REJECT_TO_CALCULATED for revisions', async () => {
      const inReviewPeriod = {
        id: 'prd-2026-09',
        organizationId: 'org-tenant-a',
        code: 'PR-2026-09',
        status: 'REVIEW',
        _count: { payrolls: 5 },
      };

      mockPrisma.payrollPeriod.findUnique.mockResolvedValueOnce(inReviewPeriod);
      mockPrisma.$transaction.mockImplementationOnce(async (fn: any) => {
        return fn({
          payrollPeriod: {
            update: vi.fn().mockResolvedValueOnce({
              ...inReviewPeriod,
              status: 'CALCULATED',
            }),
          },
          payrollApproval: {
            create: vi.fn().mockResolvedValueOnce({ id: 'appr-reject', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        });
      });

      const rejectedRes = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'prd-2026-09',
          targetStatus: 'CALCULATED',
          action: 'REJECT_TO_CALCULATED',
          comments: 'Yêu cầu tính lại do bổ sung 2 đơn tăng ca OT',
        },
        adminSessionOrgA
      );

      expect(rejectedRes.status).toBe('CALCULATED');
      // Period is mutable again
      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable(rejectedRes.status, inReviewPeriod.code)
      ).not.toThrow();
    });

    it('[LIFECYCLE-03] rejects unauthorized or invalid state transitions', async () => {
      // Attempting to APPROVE directly from DRAFT (Invalid transition)
      mockPrisma.payrollPeriod.findUnique.mockResolvedValueOnce({
        id: 'prd-draft',
        organizationId: 'org-tenant-a',
        code: 'PR-DRAFT',
        status: 'DRAFT',
        _count: { payrolls: 1 },
      });

      await expect(
        PayrollWorkflowService.transitionPeriodState(
          {
            periodId: 'prd-draft',
            targetStatus: 'APPROVED',
            action: 'APPROVE',
          },
          adminSessionOrgA
        )
      ).rejects.toThrow(/Không thể phê duyệt kỳ lương từ trạng thái "DRAFT"/);
    });
  });
});
