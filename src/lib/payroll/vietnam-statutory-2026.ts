import { ApiError } from '@/lib/errors';
import { Decimal } from 'decimal.js';
import {
  formatBusinessDate, getBusinessDateString,
  getBusinessTimeMinutes, getBusinessWeekday, parseBusinessLocalDateTime,
} from '@/lib/time/business-time';
import type { MinimumWageRegion, PayrollRuleConfig, StatutoryWorkEvidence } from './types';

export const VIETNAM_2026_MINIMUM_WAGES = { I: 5310000, II: 4730000, III: 4140000, IV: 3700000 } as const;
export const VIETNAM_2026_TAX = {
  model: 'PROGRESSIVE' as const,
  personalRelief: 15500000,
  dependentRelief: 6200000,
  brackets: [
    { bracketNumber: 1, minAmount: 0, maxAmount: 10000000, rate: 0.05, quickDeduction: 0 },
    { bracketNumber: 2, minAmount: 10000000, maxAmount: 30000000, rate: 0.1, quickDeduction: 500000 },
    { bracketNumber: 3, minAmount: 30000000, maxAmount: 60000000, rate: 0.2, quickDeduction: 3500000 },
    { bracketNumber: 4, minAmount: 60000000, maxAmount: 100000000, rate: 0.3, quickDeduction: 9500000 },
    { bracketNumber: 5, minAmount: 100000000, maxAmount: null, rate: 0.35, quickDeduction: 14500000 },
  ],
};
export const VIETNAM_2026_DAY_OT = { weekdayMultiplier: 1.5, weekendMultiplier: 2, holidayMultiplier: 3 } as const;

export function isVietnamStatutory2026(rule: PayrollRuleConfig): boolean {
  return rule.ruleCode?.trim().toUpperCase() === 'VN_STATUTORY_2026' || rule.insurance?.vietnam2026 !== undefined;
}

export function resolveVietnam2026InsuranceForPeriod(period: string | undefined, region: MinimumWageRegion | undefined) {
  if (!period || !/^2026-(0[1-9]|1[0-2])$/.test(period)) {
    throw ApiError.badRequest('Vietnam statutory 2026 requires a supported payroll period YYYY-MM in 2026.');
  }
  if (!region || !Object.prototype.hasOwnProperty.call(VIETNAM_2026_MINIMUM_WAGES, region)) {
    throw ApiError.badRequest('An explicit minimum wage region I, II, III or IV is required.');
  }
  const referenceAmount = Number(period.slice(5)) <= 6 ? 2340000 : 2530000;
  return {
    referenceAmount,
    statutoryFloor: referenceAmount,
    statutoryCap: referenceAmount * 20,
    unemploymentCap: VIETNAM_2026_MINIMUM_WAGES[region] * 20,
  };
}

export function resolvePayrollRuleForPeriod(rule: PayrollRuleConfig | undefined, period?: string): PayrollRuleConfig {
  if (!rule) throw ApiError.badRequest('An explicit payroll rule configuration is required.');
  if (!isVietnamStatutory2026(rule)) return rule;
  const metadata = rule.insurance.vietnam2026;
  if (metadata?.version !== 1) throw ApiError.badRequest('Vietnam statutory 2026 configuration metadata is required.');
  const insurance = resolveVietnam2026InsuranceForPeriod(period, metadata.region);
  const rateKeys = ['employeeSocialRate', 'employeeHealthRate', 'employeeUnemploymentRate',
    'employerSocialRate', 'employerHealthRate', 'employerUnemploymentRate'] as const;
  if (rateKeys.some(key => rule.insurance[key] !== VIETNAM_2026_RULE_TEMPLATE.insurance[key])) {
    throw ApiError.badRequest('Unsupported Vietnam statutory 2026 contribution rate configuration.');
  }
  for (const key of Object.keys(VIETNAM_2026_DAY_OT) as Array<keyof typeof VIETNAM_2026_DAY_OT>) {
    if (!Number.isFinite(rule.overtime[key]) || rule.overtime[key] < VIETNAM_2026_DAY_OT[key]) {
      throw ApiError.badRequest('Vietnam statutory overtime multiplier is below the legal minimum.');
    }
  }
  return { ...rule, insurance: { ...rule.insurance, ...insurance }, tax: structuredClone(VIETNAM_2026_TAX) };
}

export const VIETNAM_2026_RULE_TEMPLATE: PayrollRuleConfig = {
    ruleCode: 'VN_STATUTORY_2026',
    ruleName: 'Vietnam Statutory 2026 - Core Payroll Configuration',
    salaryBasis: { method: 'FIXED_DAYS', standardWorkDays: 22, standardHoursPerDay: 8, prorateUnpaidLeave: true, proratePaidLeave: true },
    overtime: { ...VIETNAM_2026_DAY_OT, nightBonusRate: 0.3 },
    insurance: {
      method: 'CONTRACT_SALARY', employeeSocialRate: 0.08, employeeHealthRate: 0.015, employeeUnemploymentRate: 0.01,
      employerSocialRate: 0.175, employerHealthRate: 0.03, employerUnemploymentRate: 0.01,
      vietnam2026: { version: 1 },
    },
    tax: structuredClone(VIETNAM_2026_TAX),
    deduction: { unionFeeRate: 0, unionFeeCap: null, penaltyDeductionTiming: 'POST_TAX_DEDUCTION' },
    rounding: { method: 'ROUND_HALF_UP', unit: 1000 },
};

export function createVietnamStatutoryRule2026(input: { period: string; region: MinimumWageRegion; standardWorkDays?: number }): PayrollRuleConfig {
  const resolved = resolveVietnam2026InsuranceForPeriod(input.period, input.region);
  const days = input.standardWorkDays ?? 22;
  if (!Number.isFinite(days) || days < 15 || days > 31) throw ApiError.badRequest('Invalid configured standard work days.');
  const rule = structuredClone(VIETNAM_2026_RULE_TEMPLATE);
  return {
    ...rule,
    salaryBasis: { ...rule.salaryBasis, standardWorkDays: days },
    insurance: { ...rule.insurance, ...resolved, vietnam2026: { version: 1, region: input.region } },
  };
}

export function requireStatutoryWorkEvidence(): never {
  throw ApiError.badRequest('Insufficient verified overtime/night-work classification and legal qualification evidence for Vietnam statutory 2026.');
}

export function calculateStatutoryExemptWorkIncome(
  rule: PayrollRuleConfig,
  hourlyRate: Decimal,
  hours: { weekdayOtHours?: number; weekendOtHours?: number; holidayOtHours?: number; nightHours?: number },
  evidence?: StatutoryWorkEvidence,
): Decimal {
  if (!isVietnamStatutory2026(rule)) return new Decimal(0);
  if (evidence?.daytimeOnly !== true || (hours.nightHours ?? 0) !== 0) requireStatutoryWorkEvidence();
  let exempt = new Decimal(0);
  const categories = [
    ['weekdayOtHours', 'weekdayMultiplier'], ['weekendOtHours', 'weekendMultiplier'], ['holidayOtHours', 'holidayMultiplier'],
  ] as const;
  for (const [hoursKey, rateKey] of categories) {
    const value = hours[hoursKey] ?? 0;
    if (!Number.isFinite(value) || value < 0) requireStatutoryWorkEvidence();
    if (value > 0 && evidence?.qualifiedDaytimeOvertime !== true) requireStatutoryWorkEvidence();
    const actual = hourlyRate.mul(value).mul(rule.overtime[rateKey]);
    const cap = hourlyRate.mul(value).mul(VIETNAM_2026_DAY_OT[rateKey]);
    exempt = exempt.add(Decimal.min(actual, cap));
  }
  return exempt;
}

export function classifyDaytimeOvertime(date: Date, holidays: Array<{ date: Date; isRecurring: boolean }>): 'HOLIDAY' | 'WEEKLY_REST' | 'WEEKDAY' {
  const dateString = formatBusinessDate(date);
  if (holidays.some(h => h.isRecurring
    ? formatBusinessDate(h.date).slice(5) === dateString.slice(5)
    : formatBusinessDate(h.date) === dateString)) return 'HOLIDAY';
  return [0, 6].includes(getBusinessWeekday(dateString)) ? 'WEEKLY_REST' : 'WEEKDAY';
}

export function verifyDaytimeAttendance(records: Array<{
  workDate: Date; checkInTime: Date | null; checkOutTime: Date | null; actualWorkHours: unknown; otHours: unknown;
  schedule?: { shift: { isOvernight: boolean; startTime: string; endTime: string } } | null;
}>): StatutoryWorkEvidence {
  for (const record of records) {
    const hours = Number(record.actualWorkHours);
    const ot = Number(record.otHours);
    if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(ot) || ot < 0) requireStatutoryWorkEvidence();
    // There is no persisted legal-qualification path for OT in the current application.
    if (ot > 0 || record.schedule?.shift.isOvernight) requireStatutoryWorkEvidence();
    if (record.schedule) {
      const shift = record.schedule.shift;
      const start = parseBusinessLocalDateTime(formatBusinessDate(record.workDate), shift.startTime);
      const end = parseBusinessLocalDateTime(formatBusinessDate(record.workDate), shift.endTime);
      if (end <= start || getBusinessTimeMinutes(start) < 360 || end > parseBusinessLocalDateTime(formatBusinessDate(record.workDate), '22:00')) requireStatutoryWorkEvidence();
    }
    if (hours === 0 && !record.checkInTime && !record.checkOutTime) continue;
    const start = record.checkInTime;
    const end = record.checkOutTime;
    if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) requireStatutoryWorkEvidence();
    const day = getBusinessDateString(start);
    if (getBusinessDateString(end) !== day || formatBusinessDate(record.workDate) !== day ||
        getBusinessTimeMinutes(start) < 360 || getBusinessTimeMinutes(end) > 1320 ||
        end > parseBusinessLocalDateTime(day, '22:00') || hours > (end.getTime() - start.getTime()) / 3600000) requireStatutoryWorkEvidence();
  }
  return { daytimeOnly: true };
}
