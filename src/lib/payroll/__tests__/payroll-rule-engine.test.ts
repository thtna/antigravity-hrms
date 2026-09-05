import { describe, it, expect } from 'vitest';
import { PayrollRuleEngine } from '../payroll-rule-engine';
import {
  VIETNAM_STATUTORY_RULE_2026,
  HOURLY_PARTTIME_RULE,
  EXPAT_FLAT_TAX_RULE,
} from '../default-rules';
import { PayrollCalculationInput, PayrollRuleConfig } from '../types';

describe('PHASE 14 — PAYROLL RULE ENGINE TEST SUITE', () => {
  // Base test input fixtures
  const standardInput: PayrollCalculationInput = {
    employee: {
      contractSalary: 20000000, // 20M VND
      dependentsCount: 0,
      allowances: 1000000, // 1M allowance
      taxExemptAllowances: 730000, // 730k lunch (tax exempt)
    },
    attendance: {
      actualWorkDays: 22,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      weekdayOtHours: 0,
      weekendOtHours: 0,
      holidayOtHours: 0,
      nightHours: 0,
    },
    adjustments: {
      kpiBonus: 0,
      otherBonuses: 0,
      penalties: 0,
    },
    period: '2026-09',
    ruleConfig: VIETNAM_STATUTORY_RULE_2026,
  };

  // ── 1. Salary Basis & Proration Tests ──────────────────────────────────────
  describe('1. Salary Basis & Proration', () => {
    it('awards full contract salary when full standard days are worked', () => {
      const res = PayrollRuleEngine.calculate(standardInput);
      expect(res.proratedBaseSalary).toBe(20000000);
      expect(res.standardWorkDays).toBe(22);
      expect(res.hourlyRate).toBeCloseTo(20000000 / (22 * 8), 2);
    });

    it('prorates exactly 50% base salary when working 11 of 22 standard days', () => {
      const input: PayrollCalculationInput = {
        ...standardInput,
        attendance: {
          ...standardInput.attendance,
          actualWorkDays: 11,
          unpaidLeaveDays: 11,
        },
      };
      const res = PayrollRuleEngine.calculate(input);
      expect(res.proratedBaseSalary).toBe(10000000);
    });

    it('considers paid leave days as full paid workdays', () => {
      const input: PayrollCalculationInput = {
        ...standardInput,
        attendance: {
          ...standardInput.attendance,
          actualWorkDays: 18,
          paidLeaveDays: 4, // 18 + 4 = 22 full days
        },
      };
      const res = PayrollRuleEngine.calculate(input);
      expect(res.proratedBaseSalary).toBe(20000000);
      expect(res.paidLeavePay).toBeCloseTo((20000000 / 22) * 4, 2);
    });

    it('calculates calendar working days when configured', () => {
      const calendarRule: PayrollRuleConfig = {
        ...VIETNAM_STATUTORY_RULE_2026,
        salaryBasis: {
          ...VIETNAM_STATUTORY_RULE_2026.salaryBasis,
          method: 'CALENDAR_WORKING_DAYS',
        },
      };
      const res = PayrollRuleEngine.calculate({
        ...standardInput,
        period: '2026-09', // Sep 2026 has 22 weekdays
        ruleConfig: calendarRule,
      });
      expect(res.standardWorkDays).toBe(22);
    });
  });

  // ── 2. Overtime & Night Shift Multipliers ──────────────────────────────────
  describe('2. Overtime & Night Shift Multipliers', () => {
    it('calculates weekday overtime at 150% rate correctly', () => {
      const input: PayrollCalculationInput = {
        ...standardInput,
        attendance: {
          ...standardInput.attendance,
          weekdayOtHours: 10,
        },
      };
      const res = PayrollRuleEngine.calculate(input);
      const expectedHourlyRate = 20000000 / (22 * 8);
      const expectedOt = expectedHourlyRate * 10 * 1.5;
      expect(res.overtime.weekdayOt).toBeCloseTo(expectedOt, 2);
      expect(res.overtime.totalOt).toBeCloseTo(expectedOt, 2);
    });

    it('calculates weekend overtime at 200% rate correctly', () => {
      const input: PayrollCalculationInput = {
        ...standardInput,
        attendance: {
          ...standardInput.attendance,
          weekendOtHours: 8,
        },
      };
      const res = PayrollRuleEngine.calculate(input);
      const expectedHourlyRate = 20000000 / (22 * 8);
      const expectedWeekendOt = expectedHourlyRate * 8 * 2.0;
      expect(res.overtime.weekendOt).toBeCloseTo(expectedWeekendOt, 2);
    });

    it('calculates holiday overtime at 300% rate correctly', () => {
      const input: PayrollCalculationInput = {
        ...standardInput,
        attendance: {
          ...standardInput.attendance,
          holidayOtHours: 8,
        },
      };
      const res = PayrollRuleEngine.calculate(input);
      const expectedHourlyRate = 20000000 / (22 * 8);
      const expectedHolidayOt = expectedHourlyRate * 8 * 3.0;
      expect(res.overtime.holidayOt).toBeCloseTo(expectedHolidayOt, 2);
    });

    it('adds night shift bonus correctly (+30%)', () => {
      const input: PayrollCalculationInput = {
        ...standardInput,
        attendance: {
          ...standardInput.attendance,
          nightHours: 10,
        },
      };
      const res = PayrollRuleEngine.calculate(input);
      const expectedHourlyRate = 20000000 / (22 * 8);
      const expectedNightBonus = expectedHourlyRate * 10 * 0.3;
      expect(res.overtime.nightBonus).toBeCloseTo(expectedNightBonus, 2);
    });
  });

  // ── 3. Insurance & Statutory Cap Tests ─────────────────────────────────────
  describe('3. Insurance & Statutory Caps', () => {
    it('calculates standard insurance rates (8% BHXH, 1.5% BHYT, 1% BHTN = 10.5%)', () => {
      const res = PayrollRuleEngine.calculate(standardInput);
      // 20,000,000 * 8% = 1,600,000
      expect(res.insurance.social).toBe(1600000);
      // 20,000,000 * 1.5% = 300,000
      expect(res.insurance.health).toBe(300000);
      // 20,000,000 * 1% = 200,000
      expect(res.insurance.unemployment).toBe(200000);
      // Total Employee = 2,100,000 (10.5%)
      expect(res.insurance.totalEmployee).toBe(2100000);

      // Employer: 17.5% + 3% + 1% = 21.5% (4,300,000)
      expect(res.insurance.employerSocial).toBe(3500000);
      expect(res.insurance.employerHealth).toBe(600000);
      expect(res.insurance.employerUnemployment).toBe(200000);
      expect(res.insurance.totalEmployer).toBe(4300000);
    });

    it('enforces statutory cap when salary exceeds statutory cap (e.g. 60M > 46.8M cap)', () => {
      const highSalaryInput: PayrollCalculationInput = {
        ...standardInput,
        employee: {
          ...standardInput.employee,
          contractSalary: 60000000,
        },
      };
      const res = PayrollRuleEngine.calculate(highSalaryInput);

      // Capped at 46,800,000
      expect(res.insurance.social).toBe(46800000 * 0.08); // 3,744,000
      expect(res.insurance.health).toBe(46800000 * 0.015); // 702,000
      // Unemployment cap 99,200,000 > 60M, so 60M * 1% = 600,000
      expect(res.insurance.unemployment).toBe(600000);
    });
  });

  // ── 4. Personal Income Tax (PIT) Progressive & Relief Tests ────────────────
  describe('4. Personal Income Tax (PIT) Progressive Engine', () => {
    it('results in 0 PIT tax when assessable income is zero or below relief threshold', () => {
      // 12M salary - 10.5% insurance (1.26M) = 10.74M < 11M personal relief -> 0 tax
      const lowSalaryInput: PayrollCalculationInput = {
        ...standardInput,
        employee: {
          ...standardInput.employee,
          contractSalary: 12000000,
          allowances: 0,
          taxExemptAllowances: 0,
        },
      };
      const res = PayrollRuleEngine.calculate(lowSalaryInput);
      expect(res.tax.assessableIncome).toBe(0);
      expect(res.tax.pitTax).toBe(0);
    });

    it('calculates Bracket 1 and 2 correctly on 7.17M assessable income', () => {
      // Gross = 20M (salary) + 1M (allowance) = 21M. Non-taxable = 730k -> Taxable = 20.27M.
      // Insurance = 2.1M. Personal relief = 11M -> Assessable = 20.27M - 2.1M - 11M = 7.17M.
      // Bracket 1 (5M @ 5%) = 250,000
      // Bracket 2 (2.17M @ 10%) = 217,000
      // Total tax = 467,000
      const res = PayrollRuleEngine.calculate(standardInput);
      expect(res.tax.assessableIncome).toBe(7170000);
      expect(res.tax.pitTax).toBe(467000);
      expect(res.tax.bracketSteps.length).toBe(2);
      expect(res.tax.bracketSteps[0].taxAmount).toBe(250000);
      expect(res.tax.bracketSteps[1].taxAmount).toBe(217000);
    });

    it('reduces assessable income and tax according to dependent relief (4.4M per dependent)', () => {
      const withDependentsInput: PayrollCalculationInput = {
        ...standardInput,
        employee: {
          ...standardInput.employee,
          dependentsCount: 2, // 2 * 4.4M = 8.8M relief
        },
      };
      const res = PayrollRuleEngine.calculate(withDependentsInput);
      // Assessable before dependents was 6.17M. Deducting 8.8M makes it 0!
      expect(res.tax.dependentsRelief).toBe(8800000);
      expect(res.tax.assessableIncome).toBe(0);
      expect(res.tax.pitTax).toBe(0);
    });

    it('calculates flat tax rate model correctly (e.g. 10% flat for part-time)', () => {
      const parttimeInput: PayrollCalculationInput = {
        employee: {
          contractSalary: 10000000,
          dependentsCount: 0,
        },
        attendance: {
          actualWorkDays: 22,
          paidLeaveDays: 0,
        },
        adjustments: {
          kpiBonus: 0,
          otherBonuses: 0,
          penalties: 0,
        },
        ruleConfig: HOURLY_PARTTIME_RULE,
      };
      const res = PayrollRuleEngine.calculate(parttimeInput);
      // Flat 10% on 10,000,000 = 1,000,000
      expect(res.tax.pitTax).toBe(1000000);
      expect(res.netSalary).toBe(9000000);
    });
  });

  // ── 5. Bonus, Penalty & Net Salary Rounding ────────────────────────────────
  describe('5. Bonus, Penalty & Net Salary Rounding', () => {
    it('integrates KPI bonus and other bonuses into gross income', () => {
      const bonusInput: PayrollCalculationInput = {
        ...standardInput,
        adjustments: {
          kpiBonus: 5000000, // 5M KPI bonus
          otherBonuses: 3000000, // 3M project bonus
          penalties: 0,
        },
      };
      const res = PayrollRuleEngine.calculate(bonusInput);
      expect(res.bonuses.total).toBe(8000000);
      // Gross = 20M + 1M (allowance) + 8M (bonus) = 29,000,000
      expect(res.grossIncome).toBe(29000000);
    });

    it('deducts penalties post-tax and rounds net salary to nearest 1,000 VND', () => {
      const penaltyInput: PayrollCalculationInput = {
        ...standardInput,
        adjustments: {
          kpiBonus: 0,
          otherBonuses: 0,
          penalties: 500000, // 500k penalty
        },
      };
      const res = PayrollRuleEngine.calculate(penaltyInput);
      expect(res.penalties.amount).toBe(500000);
      // Verify rounding to exact thousands
      expect(res.netSalary % 1000).toBe(0);
    });
  });

  // ── 6. Dynamic Configurable Rule Validation (Zero Hard-coding) ───────────
  describe('6. Zero Hard-Coding: Dynamic Rule Adaptability', () => {
    it('immediately reflects modified insurance rate (e.g. 10% instead of 8%) without engine edits', () => {
      const customRule: PayrollRuleConfig = {
        ...VIETNAM_STATUTORY_RULE_2026,
        insurance: {
          ...VIETNAM_STATUTORY_RULE_2026.insurance,
          employeeSocialRate: 0.1, // modified to 10%
        },
      };
      const res = PayrollRuleEngine.calculate({
        ...standardInput,
        ruleConfig: customRule,
      });
      // 20,000,000 * 10% = 2,000,000
      expect(res.insurance.social).toBe(2000000);
    });

    it('immediately reflects custom personal relief (e.g. 15M instead of 11M) without engine edits', () => {
      const customRule: PayrollRuleConfig = {
        ...VIETNAM_STATUTORY_RULE_2026,
        tax: {
          ...VIETNAM_STATUTORY_RULE_2026.tax,
          personalRelief: 15000000, // updated relief
        },
      };
      const res = PayrollRuleEngine.calculate({
        ...standardInput,
        ruleConfig: customRule,
      });
      expect(res.tax.personalRelief).toBe(15000000);
    });
  });
});
