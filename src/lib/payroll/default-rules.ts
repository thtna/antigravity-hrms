import { PayrollRuleConfig } from './types';

/** Unresolved template only. Calculation requires explicit region, period and work evidence. */
export { VIETNAM_2026_RULE_TEMPLATE as VIETNAM_STATUTORY_RULE_2026 } from './vietnam-statutory-2026';

/**
 * Hourly Part-Time / Freelancer Rule Template
 */
export const HOURLY_PARTTIME_RULE: PayrollRuleConfig = {
  ruleCode: 'HOURLY_PARTTIME',
  ruleName: 'Quy Chế Nhân Sự Bán Thời Gian / Theo Giờ',
  salaryBasis: {
    method: 'HOURLY',
    standardWorkDays: 22,
    standardHoursPerDay: 8,
    prorateUnpaidLeave: false,
    proratePaidLeave: false,
  },
  overtime: {
    weekdayMultiplier: 1.0,
    weekendMultiplier: 1.5,
    holidayMultiplier: 2.0,
    nightBonusRate: 0.2,
    nightOtMultiplier: 1.5,
  },
  insurance: {
    method: 'FIXED_INSURANCE_SALARY',
    employeeSocialRate: 0,
    employeeHealthRate: 0,
    employeeUnemploymentRate: 0,
    employerSocialRate: 0,
    employerHealthRate: 0,
    employerUnemploymentRate: 0,
    statutoryCap: null,
    unemploymentCap: null,
  },
  tax: {
    model: 'FLAT',
    personalRelief: 0,
    dependentRelief: 0,
    flatRate: 0.1, // Khấu trừ 10% tại nguồn
    brackets: [],
  },
  deduction: {
    unionFeeRate: 0,
    penaltyDeductionTiming: 'POST_TAX_DEDUCTION',
  },
  rounding: {
    method: 'ROUND_HALF_UP',
    unit: 1000,
  },
};

/**
 * Expatriate / Non-Resident Flat Tax Rule Template
 */
export const EXPAT_FLAT_TAX_RULE: PayrollRuleConfig = {
  ruleCode: 'EXPAT_NON_RESIDENT',
  ruleName: 'Quy Chế Chuyên Gia Nước Ngoài (Không Cư Trú)',
  salaryBasis: {
    method: 'FIXED_DAYS',
    standardWorkDays: 22,
    standardHoursPerDay: 8,
    prorateUnpaidLeave: true,
    proratePaidLeave: true,
  },
  overtime: {
    weekdayMultiplier: 1.5,
    weekendMultiplier: 2.0,
    holidayMultiplier: 3.0,
    nightBonusRate: 0.3,
    nightOtMultiplier: 2.0,
  },
  insurance: {
    method: 'CONTRACT_SALARY',
    employeeSocialRate: 0.08,
    employeeHealthRate: 0.015,
    employeeUnemploymentRate: 0, // Chuyên gia nước ngoài thường không đóng BHTN
    employerSocialRate: 0.175,
    employerHealthRate: 0.03,
    employerUnemploymentRate: 0,
    statutoryCap: 46800000,
    unemploymentCap: null,
  },
  tax: {
    model: 'FLAT',
    personalRelief: 0,
    dependentRelief: 0,
    flatRate: 0.2, // 20% toàn bộ thu nhập chịu thuế
    brackets: [],
  },
  deduction: {
    unionFeeRate: 0,
    penaltyDeductionTiming: 'POST_TAX_DEDUCTION',
  },
  rounding: {
    method: 'ROUND_HALF_UP',
    unit: 1000,
  },
};
