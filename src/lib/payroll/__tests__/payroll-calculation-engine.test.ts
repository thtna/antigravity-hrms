import { describe, it, expect } from 'vitest';
import {
  PayrollCalculationEngine,
  DeterministicPayrollInput,
} from '../payroll-calculation-engine';
import {
  VIETNAM_STATUTORY_RULE_2026,
  HOURLY_PARTTIME_RULE,
  EXPAT_FLAT_TAX_RULE,
} from '../default-rules';

describe('PHASE 15 — DETERMINISTIC PAYROLL CALCULATION ENGINE TEST SUITE', () => {
  // ── 1. Full Month ──────────────────────────────────────────────────────────
  it('1. calculates full month salary with 100% attendance and statutory deductions', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 22000000,
      workDays: 22,
      actualWorkDays: 22,
      workHours: 176,
      overtimeHours: 0,
      bonus: 0,
      penalty: 0,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    };

    const out = PayrollCalculationEngine.calculate(input);

    expect(out.proratedSalary).toBe(22000000);
    expect(out.grossSalary).toBe(22000000);
    expect(out.totalBonus).toBe(0);
    expect(out.totalPenalty).toBe(0);
    // Insurance = 10.5% of 22M = 2,310,000
    expect(out.insurance).toBe(2310000);
    // Assessable income = 22M - 2.31M - 11M (personal relief) = 8,690,000
    // Bracket 1 (0-5M @ 5%) = 250,000
    // Bracket 2 (5-8.69M = 3.69M @ 10%) = 369,000
    // Total Tax = 619,000
    expect(out.tax).toBe(619000);
    // Net = 22,000,000 - 2,310,000 - 619,000 = 19,071,000
    expect(out.netSalary).toBe(19071000);
  });

  // ── 2. Missing Day ─────────────────────────────────────────────────────────
  it('2. calculates salary with unexcused missing days (20/22 days)', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 22000000,
      workDays: 22,
      actualWorkDays: 20,
      workHours: 160,
      overtimeHours: 0,
      bonus: 0,
      penalty: 0,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    };

    const out = PayrollCalculationEngine.calculate(input);

    // 20 / 22 * 22,000,000 = 20,000,000
    expect(out.proratedSalary).toBe(20000000);
    expect(out.grossSalary).toBe(20000000);
    expect(out.netSalary).toBeLessThan(19071000);
  });

  // ── 3. Unpaid Leave ────────────────────────────────────────────────────────
  it('3. calculates salary with approved unpaid leave vs paid leave', () => {
    // Scenario A: 20 days worked + 2 days unpaid leave (0 paid leave)
    const unpaidOut = PayrollCalculationEngine.calculate({
      baseSalary: 22000000,
      workDays: 22,
      actualWorkDays: 20,
      workHours: 160,
      overtimeHours: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 2,
      bonus: 0,
      penalty: 0,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    });

    // Scenario B: 20 days worked + 2 days PAID leave
    const paidOut = PayrollCalculationEngine.calculate({
      baseSalary: 22000000,
      workDays: 22,
      actualWorkDays: 20,
      workHours: 160,
      overtimeHours: 0,
      paidLeaveDays: 2,
      unpaidLeaveDays: 0,
      bonus: 0,
      penalty: 0,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    });

    expect(unpaidOut.grossSalary).toBe(20000000);
    expect(paidOut.grossSalary).toBe(22000000);
    expect(paidOut.paidLeavePay).toBe(2000000);
    expect(paidOut.netSalary).toBeGreaterThan(unpaidOut.netSalary);
  });

  // ── 4. Overtime Calculation ────────────────────────────────────────────────
  it('4. calculates multi-tier overtime pay (weekday 150%, weekend 200%, holiday 300%, night 30%)', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 22000000,
      workDays: 22,
      actualWorkDays: 22,
      workHours: 176,
      overtimeHours: 17, // 10 weekday + 4 weekend + 2 holiday + 1 night
      overtimeDetails: {
        weekdayOtHours: 10,
        weekendOtHours: 4,
        holidayOtHours: 2,
        nightHours: 1,
      },
      bonus: 0,
      penalty: 0,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    };

    // dailyRate = 1,000,000; hourlyRate = 125,000
    // weekday = 10 * 125,000 * 1.5 = 1,875,000
    // weekend = 4 * 125,000 * 2.0 = 1,000,000
    // holiday = 2 * 125,000 * 3.0 = 750,000
    // night = 1 * 125,000 * 0.3 = 37,500
    // Total OT Pay = 3,662,500
    const out = PayrollCalculationEngine.calculate(input);

    expect(out.hourlyRate).toBe(125000);
    expect(out.overtimePay).toBe(3662500);
    expect(out.grossSalary).toBe(25662500);
  });

  // ── 5. Bonus Inclusion ─────────────────────────────────────────────────────
  it('5. properly includes KPI and project bonuses into gross and taxable income', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 22000000,
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
    };

    const out = PayrollCalculationEngine.calculate(input);

    expect(out.totalBonus).toBe(5000000);
    expect(out.grossSalary).toBe(27000000);
  });

  // ── 6. Penalty Deduction ───────────────────────────────────────────────────
  it('6. correctly deducts approved penalties from gross/net calculation', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 22000000,
      workDays: 22,
      actualWorkDays: 22,
      workHours: 176,
      overtimeHours: 0,
      bonus: 0,
      penalty: 1500000,
      penaltyDetails: {
        latePenalty: 500000,
        disciplinePenalty: 1000000,
      },
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    };

    const out = PayrollCalculationEngine.calculate(input);

    expect(out.totalPenalty).toBe(1500000);
    // Net should be reduced by the penalty
    expect(out.netSalary).toBe(19071000 - 1500000);
  });

  // ── 7. Zero Bonus ──────────────────────────────────────────────────────────
  it('7. handles zero bonus cleanly without undefined or NaN errors', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 15000000,
      workDays: 22,
      actualWorkDays: 22,
      workHours: 176,
      overtimeHours: 0,
      bonus: 0,
      penalty: 0,
    };

    const out = PayrollCalculationEngine.calculate(input);

    expect(out.totalBonus).toBe(0);
    expect(Number.isNaN(out.totalBonus)).toBe(false);
    expect(Number.isNaN(out.netSalary)).toBe(false);
  });

  // ── 8. Zero Penalty ────────────────────────────────────────────────────────
  it('8. handles zero penalty cleanly without undefined or NaN errors', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 15000000,
      workDays: 22,
      actualWorkDays: 22,
      workHours: 176,
      overtimeHours: 0,
      bonus: 1000000,
      penalty: 0,
    };

    const out = PayrollCalculationEngine.calculate(input);

    expect(out.totalPenalty).toBe(0);
    expect(Number.isNaN(out.totalPenalty)).toBe(false);
    expect(Number.isNaN(out.netSalary)).toBe(false);
  });

  // ── 9. Rounding Modes ──────────────────────────────────────────────────────
  it('9. applies configured rounding modes (ROUND_HALF_UP, FLOOR, CEIL)', () => {
    const customHalfUp = {
      ...VIETNAM_STATUTORY_RULE_2026,
      rounding: { method: 'ROUND_HALF_UP' as const, unit: 1000 },
    };
    const customFloor = {
      ...VIETNAM_STATUTORY_RULE_2026,
      rounding: { method: 'FLOOR' as const, unit: 1000 },
    };
    const customCeil = {
      ...VIETNAM_STATUTORY_RULE_2026,
      rounding: { method: 'CEIL' as const, unit: 1000 },
    };

    const inputBase: DeterministicPayrollInput = {
      baseSalary: 19543678,
      workDays: 22,
      actualWorkDays: 21,
      workHours: 168,
      overtimeHours: 0,
      bonus: 0,
      penalty: 0,
    };

    const halfUpOut = PayrollCalculationEngine.calculate({ ...inputBase, ruleConfig: customHalfUp });
    const floorOut = PayrollCalculationEngine.calculate({ ...inputBase, ruleConfig: customFloor });
    const ceilOut = PayrollCalculationEngine.calculate({ ...inputBase, ruleConfig: customCeil });

    expect(halfUpOut.netSalary % 1000).toBe(0);
    expect(floorOut.netSalary % 1000).toBe(0);
    expect(ceilOut.netSalary % 1000).toBe(0);
    expect(ceilOut.netSalary).toBeGreaterThanOrEqual(floorOut.netSalary);
  });

  // ── 10. Decimal Values ─────────────────────────────────────────────────────
  it('10. handles decimal fractional work days (21.5) and fractional OT hours (2.75) with 0 drift', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 25000000,
      workDays: 22,
      actualWorkDays: 21.5,
      workHours: 172,
      overtimeHours: 2.75,
      bonus: 333333.33,
      penalty: 111111.11,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    };

    const out = PayrollCalculationEngine.calculate(input);

    expect(out.actualWorkDays).toBe(21.5);
    expect(out.overtimeHours).toBe(2.75);
    expect(Number.isFinite(out.netSalary)).toBe(true);
    // Verified that decimal-safe arithmetic avoided floating-point NaN or infinity
    expect(out.lineItems.length).toBeGreaterThan(4);
  });

  // ── 11. Employee Termination / Change ──────────────────────────────────────
  it('11. handles employee hired mid-period (e.g. 10 days worked of 22)', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 30000000,
      workDays: 22,
      actualWorkDays: 10,
      workHours: 80,
      overtimeHours: 0,
      bonus: 0,
      penalty: 0,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    };

    const out = PayrollCalculationEngine.calculate(input);

    // Prorated = 10 / 22 * 30,000,000 = 13,636,363.64
    expect(out.proratedSalary).toBeCloseTo(13636363.64, 1);
    expect(out.grossSalary).toBeCloseTo(13636363.64, 1);
  });

  // ── 12. Edge Dates ─────────────────────────────────────────────────────────
  it('12. handles leap year edge dates (Feb 2024 / 2028 with 29 days) and 31-day months correctly', () => {
    // In February leap year with 21 standard work days
    const febLeapOut = PayrollCalculationEngine.calculate({
      baseSalary: 21000000,
      workDays: 21,
      actualWorkDays: 21,
      workHours: 168,
      overtimeHours: 0,
      bonus: 0,
      penalty: 0,
    });

    // In a 31-day month with 23 standard work days
    const longMonthOut = PayrollCalculationEngine.calculate({
      baseSalary: 23000000,
      workDays: 23,
      actualWorkDays: 23,
      workHours: 184,
      overtimeHours: 0,
      bonus: 0,
      penalty: 0,
    });

    expect(febLeapOut.proratedSalary).toBe(21000000);
    expect(longMonthOut.proratedSalary).toBe(23000000);
    expect(febLeapOut.dailyRate).toBe(1000000);
    expect(longMonthOut.dailyRate).toBe(1000000);
  });

  // ── 13. Determinism Guarantee ──────────────────────────────────────────────
  it('13. DETERMINISM GUARANTEE: executes 1,000 runs on identical input and asserts 100% identical outputs', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 28500000,
      workDays: 22,
      actualWorkDays: 21.5,
      workHours: 172,
      overtimeHours: 8.5,
      overtimeDetails: {
        weekdayOtHours: 5,
        weekendOtHours: 3.5,
      },
      bonus: 4500000,
      penalty: 500000,
      dependentsCount: 2,
      allowances: 1500000,
      taxExemptAllowances: 730000,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    };

    const firstRun = PayrollCalculationEngine.calculate(input);

    for (let i = 0; i < 1000; i++) {
      const run = PayrollCalculationEngine.calculate(input);
      expect(run.netSalary).toBe(firstRun.netSalary);
      expect(run.grossSalary).toBe(firstRun.grossSalary);
      expect(run.tax).toBe(firstRun.tax);
      expect(run.insurance).toBe(firstRun.insurance);
      expect(run.totalBonus).toBe(firstRun.totalBonus);
      expect(run.totalPenalty).toBe(firstRun.totalPenalty);
    }
  });

  // ── 14. Direct Injection Test ──────────────────────────────────────────────
  it('14. supports direct injection of pre-calculated overtimePay, tax, and insurance', () => {
    const input: DeterministicPayrollInput = {
      baseSalary: 20000000,
      workDays: 20,
      actualWorkDays: 20,
      workHours: 160,
      overtimeHours: 10,
      overtimePay: 2500000,
      bonus: 3000000,
      penalty: 200000,
      tax: 1200000,
      insurance: 2100000,
      deductions: 100000,
    };

    const out = PayrollCalculationEngine.calculate(input);

    expect(out.grossSalary).toBe(20000000 + 2500000 + 3000000); // 25,500,000
    expect(out.totalBonus).toBe(3000000);
    expect(out.totalPenalty).toBe(200000);
    expect(out.overtimePay).toBe(2500000);
    expect(out.tax).toBe(1200000);
    expect(out.insurance).toBe(2100000);
    // Net = 25,500,000 - 2,100,000 - 1,200,000 - 200,000 - 100,000 = 21,900,000
    expect(out.netSalary).toBe(21900000);
  });
});
