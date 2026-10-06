import type { PayrollRuleConfig } from '../../types';

// Frozen legacy CUSTOM contract: preserves existing pre-2026 arithmetic regression assertions.
// This is deliberately NOT a Vietnam statutory rule and must never be used by production.
export const LEGACY_CUSTOM_PAYROLL_RULE: PayrollRuleConfig = {
  ruleCode: 'CUSTOM_LEGACY_REGRESSION',
  ruleName: 'Legacy custom payroll regression',
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
