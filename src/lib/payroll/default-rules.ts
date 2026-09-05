import { PayrollRuleConfig } from './types';

/**
 * Vietnam Statutory Labor Code 2026 Reference Rule
 * Compliant with Law on Social Insurance, Personal Income Tax Law, and Labor Code 2019/2024.
 * Note: Configurable - can be modified or overridden without touching engine code.
 */
export const VIETNAM_STATUTORY_RULE_2026: PayrollRuleConfig = {
  ruleCode: 'VN_STATUTORY_2026',
  ruleName: 'Quy Chế Tiền Lương Luật Lao Động Việt Nam 2026',
  salaryBasis: {
    method: 'FIXED_DAYS',
    standardWorkDays: 22,
    standardHoursPerDay: 8,
    prorateUnpaidLeave: true,
    proratePaidLeave: true,
  },
  overtime: {
    weekdayMultiplier: 1.5, // 150% ngày thường
    weekendMultiplier: 2.0, // 200% ngày nghỉ hàng tuần
    holidayMultiplier: 3.0, // 300% ngày lễ, tết (chưa kể lương ngày nghỉ lễ nếu có)
    nightBonusRate: 0.3, // +30% phụ cấp làm việc ban đêm (22h - 06h)
    nightOtMultiplier: 2.1, // Làm thêm ban đêm ngày thường (150% + 30% + 20% = 200%-210%)
  },
  insurance: {
    method: 'CONTRACT_SALARY',
    employeeSocialRate: 0.08, // 8% BHXH
    employeeHealthRate: 0.015, // 1.5% BHYT
    employeeUnemploymentRate: 0.01, // 1% BHTN
    employerSocialRate: 0.175, // 17.5% BHXH người sử dụng lao động
    employerHealthRate: 0.03, // 3% BHYT người sử dụng lao động
    employerUnemploymentRate: 0.01, // 1% BHTN người sử dụng lao động
    statutoryCap: 46800000, // Trần BHXH, BHYT (20 x 2.340.000đ = 46.800.000đ)
    unemploymentCap: 99200000, // Trần BHTN Vùng 1 (20 x 4.960.000đ)
    statutoryFloor: 4960000, // Lương tối thiểu Vùng 1
  },
  tax: {
    model: 'PROGRESSIVE',
    personalRelief: 11000000, // 11.000.000 ₫/tháng cho bản thân
    dependentRelief: 4400000, // 4.400.000 ₫/tháng cho mỗi người phụ thuộc
    brackets: [
      {
        bracketNumber: 1,
        minAmount: 0,
        maxAmount: 5000000,
        rate: 0.05,
        quickDeduction: 0,
      },
      {
        bracketNumber: 2,
        minAmount: 5000000,
        maxAmount: 10000000,
        rate: 0.1,
        quickDeduction: 250000,
      },
      {
        bracketNumber: 3,
        minAmount: 10000000,
        maxAmount: 18000000,
        rate: 0.15,
        quickDeduction: 750000,
      },
      {
        bracketNumber: 4,
        minAmount: 18000000,
        maxAmount: 32000000,
        rate: 0.2,
        quickDeduction: 1650000,
      },
      {
        bracketNumber: 5,
        minAmount: 32000000,
        maxAmount: 52000000,
        rate: 0.25,
        quickDeduction: 3250000,
      },
      {
        bracketNumber: 6,
        minAmount: 52000000,
        maxAmount: 80000000,
        rate: 0.3,
        quickDeduction: 5850000,
      },
      {
        bracketNumber: 7,
        minAmount: 80000000,
        maxAmount: null,
        rate: 0.35,
        quickDeduction: 9850000,
      },
    ],
  },
  deduction: {
    unionFeeRate: 0, // Không bắt buộc mặc định
    unionFeeCap: null,
    penaltyDeductionTiming: 'POST_TAX_DEDUCTION',
  },
  rounding: {
    method: 'ROUND_HALF_UP',
    unit: 1000, // Làm tròn đến 1.000 ₫
  },
};

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
