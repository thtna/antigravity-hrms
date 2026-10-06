import { describe, expect, it } from 'vitest';
import { Decimal } from 'decimal.js';
import { readFileSync } from 'node:fs';
import {
  calculateStatutoryExemptWorkIncome, classifyDaytimeOvertime, createVietnamStatutoryRule2026,
  resolvePayrollRuleForPeriod, resolveVietnam2026InsuranceForPeriod, verifyDaytimeAttendance,
} from '../vietnam-statutory-2026';
import { VIETNAM_STATUTORY_RULE_2026 } from '../default-rules';
import { PayrollRuleEngine } from '../payroll-rule-engine';
import { PayrollCalculationEngine } from '../payroll-calculation-engine';
import { Step8PayrollSchema } from '@/lib/validations/onboarding';
import { InsuranceConfigSchema, SimulatePayrollSchema } from '@/lib/validations/payroll-rule';
import { parseBusinessLocalDateTime } from '@/lib/time/business-time';
import type { MinimumWageRegion, PayrollRuleConfig, StatutoryWorkEvidence } from '../types';
import { LEGACY_CUSTOM_PAYROLL_RULE } from './fixtures/legacy-custom-rule';

const noNight: StatutoryWorkEvidence = { daytimeOnly: true };
const qualified: StatutoryWorkEvidence = { daytimeOnly: true, qualifiedDaytimeOvertime: true };
const makeRule = (period = '2026-07', region: MinimumWageRegion = 'II') => createVietnamStatutoryRule2026({ period, region });
function calculateBoth(rule: PayrollRuleConfig, options: {
  period?: string; salary?: number; insuranceSalary?: number; weekdayOtHours?: number;
  weekendOtHours?: number; holidayOtHours?: number; nightHours?: number; allowances?: number;
  exemptAllowances?: number; evidence?: StatutoryWorkEvidence;
} = {}) {
  const salary = options.salary ?? 22000000;
  const hours = {
    weekdayOtHours: options.weekdayOtHours ?? 0, weekendOtHours: options.weekendOtHours ?? 0,
    holidayOtHours: options.holidayOtHours ?? 0, nightHours: options.nightHours ?? 0,
  };
  const period = options.period ?? '2026-07';
  const evidence = options.evidence;
  const a = PayrollRuleEngine.calculate({
    ruleConfig: rule, period, statutoryWorkEvidence: evidence,
    employee: { contractSalary: salary, insuranceSalary: options.insuranceSalary, dependentsCount: 0,
      allowances: options.allowances ?? 0, taxExemptAllowances: options.exemptAllowances ?? 0 },
    attendance: { actualWorkDays: rule.salaryBasis.standardWorkDays, paidLeaveDays: 0, ...hours },
    adjustments: { kpiBonus: 0, otherBonuses: 0, penalties: 0 },
  });
  const b = PayrollCalculationEngine.calculate({
    ruleConfig: rule, period, statutoryWorkEvidence: evidence, baseSalary: salary,
    insuranceSalary: options.insuranceSalary, workDays: rule.salaryBasis.standardWorkDays,
    actualWorkDays: rule.salaryBasis.standardWorkDays, workHours: rule.salaryBasis.standardWorkDays * 8,
    overtimeHours: hours.weekdayOtHours + hours.weekendOtHours + hours.holidayOtHours,
    overtimeDetails: hours, bonus: 0, penalty: 0, allowances: options.allowances ?? 0,
    taxExemptAllowances: options.exemptAllowances ?? 0,
  });
  expect(b.tax).toBe(a.tax.pitTax);
  expect(b.insurance).toBe(a.insurance.totalEmployee);
  expect(b.statutoryExemptWorkIncome).toBe(a.tax.statutoryExemptWorkIncome);
  expect(b.netSalary).toBe(a.netSalary);
  return { a, b };
}

describe('C4R1A locked Vietnam statutory 2026 contract', () => {
  it('has exact reliefs and five progressive brackets in the canonical builder', () => {
    expect(makeRule().tax).toEqual({ model: 'PROGRESSIVE', personalRelief: 15500000, dependentRelief: 6200000, brackets: [
      { bracketNumber: 1, minAmount: 0, maxAmount: 10000000, rate: 0.05, quickDeduction: 0 },
      { bracketNumber: 2, minAmount: 10000000, maxAmount: 30000000, rate: 0.1, quickDeduction: 500000 },
      { bracketNumber: 3, minAmount: 30000000, maxAmount: 60000000, rate: 0.2, quickDeduction: 3500000 },
      { bracketNumber: 4, minAmount: 60000000, maxAmount: 100000000, rate: 0.3, quickDeduction: 9500000 },
      { bracketNumber: 5, minAmount: 100000000, maxAmount: null, rate: 0.35, quickDeduction: 14500000 },
    ] });
    const changed = makeRule(); changed.tax.brackets[0].rate = 0.99;
    expect(makeRule().tax.brackets[0].rate).toBe(0.05);
  });
  it.each([
    [9999999, 499999.95], [10000000, 500000], [10000001, 500000.1],
    [29999999, 2499999.9], [30000000, 2500000], [30000001, 2500000.2],
    [59999999, 8499999.8], [60000000, 8500000], [60000001, 8500000.3],
    [99999999, 20499999.7], [100000000, 20500000], [100000001, 20500000.35],
  ])('both engines calculate PIT boundary %s exactly', (assessable, expected) => {
    const rule = makeRule(); rule.rounding.unit = 1;
    const { a } = calculateBoth(rule, { salary: assessable + 15500000 + 265650, insuranceSalary: 2530000, evidence: noNight });
    expect(a.tax.assessableIncome).toBe(assessable);
    expect(a.tax.pitTax).toBeCloseTo(expected, 6);
  });
  it.each(['I', 'II', 'III', 'IV'] as const)('uses exact regional wages/caps and separate insurance bases in region %s', region => {
    const expected = { I: [5310000, 106200000], II: [4730000, 94600000], III: [4140000, 82800000], IV: [3700000, 74000000] }[region];
    const rule = makeRule('2026-07', region);
    expect(rule.insurance.unemploymentCap).toBe(expected[1]);
    expect(rule.insurance.unemploymentCap).toBe(expected[0] * 20);
    const { b } = calculateBoth(rule, { salary: 120000000, evidence: noNight });
    expect(b.employeeSocial).toBe(50600000 * 0.08);
    expect(b.employeeHealth).toBe(50600000 * 0.015);
    expect(b.employeeUnemployment).toBe(expected[1] * 0.01);
    expect(b.employerUnemployment).toBe(expected[1] * 0.01);
  });
  it.each(['2026-01', '2026-06', '2026-07', '2026-12'])('resolves reference/cap from actual period %s, not the saved snapshot', period => {
    const reference = period <= '2026-06' ? 2340000 : 2530000;
    const rule = makeRule('2026-01');
    const resolved = resolvePayrollRuleForPeriod(rule, period);
    expect(resolved.insurance.statutoryFloor).toBe(reference);
    expect(resolved.insurance.statutoryCap).toBe(reference * 20);
    const { b } = calculateBoth(rule, { period, salary: 120000000, evidence: noNight });
    expect(b.employeeSocial).toBe(reference * 20 * 0.08);
    expect(rule.insurance.statutoryCap).toBe(46800000);
  });
  it('preserves an explicit zero salary base and applies only the social/health floor', () => {
    const { b } = calculateBoth(makeRule(), { insuranceSalary: 0, evidence: noNight });
    expect(b.employeeSocial).toBe(2530000 * 0.08);
    expect(b.employeeHealth).toBe(2530000 * 0.015);
    expect(b.employeeUnemployment).toBe(0);
  });
  it('resolves the same configured statutory insurance method in both engines', () => {
    const rule = makeRule(); rule.insurance.method = 'ACTUAL_GROSS';
    const { b } = calculateBoth(rule, { allowances: 1000000, insuranceSalary: 0, evidence: noNight });
    expect(b.employeeSocial).toBe(23000000 * 0.08);
    expect(b.employeeUnemployment).toBe(23000000 * 0.01);
  });
  it.each(['2027-01', '2025-12', '2026-00', '2026-13', '2026-7'])('rejects unsupported/invalid period %s', period => {
    expect(() => calculateBoth(makeRule(), { period, evidence: noNight })).toThrow(/supported payroll period/);
  });
  it('rejects unresolved template/absent region and implicit rule fallback', () => {
    expect(() => resolvePayrollRuleForPeriod(VIETNAM_STATUTORY_RULE_2026, '2026-07')).toThrow(/explicit minimum wage region/);
    expect(() => resolveVietnam2026InsuranceForPeriod('2026-07', undefined)).toThrow(/region/);
    expect(() => PayrollCalculationEngine.calculate({ baseSalary: 1, workDays: 22, actualWorkDays: 22, workHours: 176, overtimeHours: 0, bonus: 0, penalty: 0 })).toThrow(/explicit payroll rule/);
    expect(() => resolvePayrollRuleForPeriod(makeRule())).toThrow(/period/);
  });
  it('calculates verified no-OT/no-night payroll with distinct ordinary exempt allowances', () => {
    const { a, b } = calculateBoth(makeRule(), { evidence: noNight, allowances: 1000000, exemptAllowances: 730000 });
    expect(a.tax.statutoryExemptWorkIncome).toBe(0);
    expect(a.tax.taxableIncome).toBe(22270000);
    expect(b.tax).toBe(223000);
  });
  it.each([
    ['weekdayOtHours', 'weekdayMultiplier', 1.5], ['weekendOtHours', 'weekendMultiplier', 2], ['holidayOtHours', 'holidayMultiplier', 3],
  ] as const)('caps verified %s exemption at legal pay and taxes the actual excess', (hoursKey, rateKey, legalRate) => {
    const rule = makeRule(); rule.overtime[rateKey] = legalRate + 1;
    const { a, b } = calculateBoth(rule, { [hoursKey]: 2, evidence: qualified, allowances: 1000000, exemptAllowances: 730000 });
    const cap = 125000 * 2 * legalRate;
    expect(a.tax.statutoryExemptWorkIncome).toBe(cap);
    expect(b.overtimePay - cap).toBe(250000);
    expect(b.taxableIncome).toBe(22000000 + 270000 + 250000);
    expect(a.allowances.nonTaxable).toBe(730000);
  });
  it.each(['weekdayMultiplier', 'weekendMultiplier', 'holidayMultiplier'] as const)('rejects below-legal %s', key => {
    const rule = makeRule(); rule.overtime[key] = 1;
    expect(() => calculateBoth(rule, { evidence: noNight })).toThrow(/legal minimum/);
  });
  it('fails closed on OT without legal qualification and night work even with a daytime assertion', () => {
    expect(() => calculateBoth(makeRule(), { weekdayOtHours: 1, evidence: noNight })).toThrow(/Insufficient verified/);
    expect(() => calculateBoth(makeRule(), { evidence: undefined })).toThrow(/Insufficient verified/);
    expect(() => calculateBoth(makeRule(), { nightHours: 1, evidence: qualified })).toThrow(/Insufficient verified/);
    expect(makeRule().overtime.nightOtMultiplier).toBeUndefined();
    expect(() => calculateStatutoryExemptWorkIncome(makeRule(), new Decimal(1), { weekdayOtHours: -1 }, qualified)).toThrow(/Insufficient/);
  });
  it('does not permit a client-supplied qualification assertion through simulation validation', () => {
    const parsed = SimulatePayrollSchema.parse({ employee: { contractSalary: 22000000 }, attendance: {}, adjustments: {}, statutoryWorkEvidence: qualified });
    expect(parsed).not.toHaveProperty('statutoryWorkEvidence');
  });
  it('preserves legacy custom calculation without region/period and without legal exemption claims', () => {
    const { b } = calculateBoth(LEGACY_CUSTOM_PAYROLL_RULE, { period: '2027-01', weekdayOtHours: 1 });
    expect(b.statutoryExemptWorkIncome).toBe(0);
    expect(resolvePayrollRuleForPeriod(LEGACY_CUSTOM_PAYROLL_RULE)).toBe(LEGACY_CUSTOM_PAYROLL_RULE);
  });
  it('requires region at Step 8 without default/inference and preserves configurable company days', () => {
    expect(Step8PayrollSchema.safeParse({ address: 'Ha Noi', standardWorkDays: 22 }).success).toBe(false);
    const parsed = Step8PayrollSchema.parse({ minimumWageRegion: 'IV', standardWorkDays: 26 });
    expect(parsed.minimumWageRegion).toBe('IV');
    expect(parsed.standardWorkDays).toBe(26);
    const rule = createVietnamStatutoryRule2026({ period: '2026-01', region: parsed.minimumWageRegion, standardWorkDays: parsed.standardWorkDays });
    expect(InsuranceConfigSchema.parse(rule.insurance)).toEqual(rule.insurance);
    const ui = readFileSync('src/app/onboarding/page.tsx', 'utf8');
    expect(ui).toContain("minimumWageRegion: ''");
    expect(ui).toContain('payload = step8Data');
    expect(ui).toContain('value={step8Data.minimumWageRegion}');
  });
});

describe('C4R1A attendance evidence and holiday precedence', () => {
  const dayRecord = {
    workDate: new Date('2026-09-02T00:00:00Z'),
    checkInTime: parseBusinessLocalDateTime('2026-09-02', '08:00'),
    checkOutTime: parseBusinessLocalDateTime('2026-09-02', '17:00'),
    actualWorkHours: 8, otHours: 0,
    schedule: { shift: { isOvernight: false, startTime: '08:00', endTime: '17:00' } },
  };
  it('verifies the daytime no-OT path from actual timestamps/shift, independent of host timezone', () => {
    expect(verifyDaytimeAttendance([dayRecord])).toEqual(noNight);
  });
  it.each([
    { checkInTime: null }, { checkOutTime: null }, { otHours: 1 },
    { checkInTime: parseBusinessLocalDateTime('2026-09-02', '05:59') },
    { checkOutTime: parseBusinessLocalDateTime('2026-09-02', '22:01') },
    { checkOutTime: parseBusinessLocalDateTime('2026-09-03', '07:00') },
    { schedule: { shift: { isOvernight: true, startTime: '22:00', endTime: '06:00' } } },
  ])('rejects ambiguous/OT/night evidence %j, regardless of a downstream nightHours=0', override => {
    expect(() => verifyDaytimeAttendance([{ ...dayRecord, ...override }])).toThrow(/Insufficient verified/);
  });
  it('uses tenant holiday dates, including recurring holidays, before the weekly-rest category', () => {
    const sunday = new Date('2026-09-06T00:00:00Z');
    expect(classifyDaytimeOvertime(sunday, [{ date: sunday, isRecurring: false }])).toBe('HOLIDAY');
    expect(classifyDaytimeOvertime(sunday, [{ date: new Date('2025-09-06T00:00:00Z'), isRecurring: true }])).toBe('HOLIDAY');
    expect(classifyDaytimeOvertime(sunday, [])).toBe('WEEKLY_REST');
    expect(classifyDaytimeOvertime(new Date('2026-09-02T00:00:00Z'), [])).toBe('WEEKDAY');
  });
});
