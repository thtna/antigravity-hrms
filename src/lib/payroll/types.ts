import { RoundingMethod } from './decimal-math';

export type SalaryBasisMethod = 'FIXED_DAYS' | 'CALENDAR_WORKING_DAYS' | 'HOURLY';

export interface SalaryBasisConfig {
  method: SalaryBasisMethod;
  standardWorkDays: number; // e.g. 22 or 26
  standardHoursPerDay: number; // e.g. 8
  prorateUnpaidLeave: boolean;
  proratePaidLeave: boolean;
}

export interface OvertimeConfig {
  weekdayMultiplier: number; // e.g. 1.5 (150%)
  weekendMultiplier: number; // e.g. 2.0 (200%)
  holidayMultiplier: number; // e.g. 3.0 (300%)
  nightBonusRate: number; // e.g. 0.3 (+30%)
  nightOtMultiplier: number; // e.g. 2.0
}

export type InsuranceSalaryMethod = 'CONTRACT_SALARY' | 'ACTUAL_GROSS' | 'FIXED_INSURANCE_SALARY';

export interface InsuranceConfig {
  method: InsuranceSalaryMethod;
  employeeSocialRate: number; // e.g. 0.08 (8%)
  employeeHealthRate: number; // e.g. 0.015 (1.5%)
  employeeUnemploymentRate: number; // e.g. 0.01 (1%)
  employerSocialRate: number; // e.g. 0.175 (17.5%)
  employerHealthRate: number; // e.g. 0.03 (3%)
  employerUnemploymentRate: number; // e.g. 0.01 (1%)
  statutoryCap?: number | null; // e.g. 46,800,000 VND
  unemploymentCap?: number | null; // statutory cap for BHTN
  statutoryFloor?: number | null;
}

export type TaxModel = 'PROGRESSIVE' | 'FLAT' | 'EXEMPT';

export interface TaxBracket {
  bracketNumber: number;
  minAmount: number;
  maxAmount: number | null; // null represents infinity / no upper limit
  rate: number; // e.g. 0.05, 0.10, 0.15, ...
  quickDeduction: number; // e.g. 0, 250000, 750000, ...
}

export interface TaxConfig {
  model: TaxModel;
  personalRelief: number; // e.g. 11,000,000 VND
  dependentRelief: number; // e.g. 4,400,000 VND per dependent
  flatRate?: number; // e.g. 0.10 or 0.20 when model is FLAT
  brackets: TaxBracket[];
}

export type PenaltyDeductionTiming = 'PRE_TAX_GROSS_REDUCTION' | 'POST_TAX_DEDUCTION';

export interface DeductionConfig {
  unionFeeRate: number; // e.g. 0.01 (1% or 0 if exempt)
  unionFeeCap?: number | null; // e.g. 10% of base salary or fixed cap
  penaltyDeductionTiming: PenaltyDeductionTiming;
}

export interface RoundingConfig {
  method: RoundingMethod;
  unit: number; // 1, 100, 1000
}

export interface PayrollRuleConfig {
  ruleCode?: string;
  ruleName?: string;
  salaryBasis: SalaryBasisConfig;
  overtime: OvertimeConfig;
  insurance: InsuranceConfig;
  tax: TaxConfig;
  deduction: DeductionConfig;
  rounding: RoundingConfig;
}

export interface EmployeePayrollProfile {
  employeeId?: string;
  contractSalary: number;
  insuranceSalary?: number;
  dependentsCount: number;
  allowances?: number;
  taxExemptAllowances?: number; // e.g. lunch allowance up to limit, telephone, uniform
}

export interface AttendancePayrollSummary {
  actualWorkDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays?: number;
  weekdayOtHours?: number;
  weekendOtHours?: number;
  holidayOtHours?: number;
  nightHours?: number;
}

export interface BonusPenaltySummary {
  kpiBonus: number;
  otherBonuses: number;
  penalties: number;
}

export interface PayrollCalculationInput {
  employee: EmployeePayrollProfile;
  attendance: AttendancePayrollSummary;
  adjustments: BonusPenaltySummary;
  period?: string; // YYYY-MM
  ruleConfig: PayrollRuleConfig;
}

export interface TaxStepDetail {
  bracketNumber: number;
  minAmount: number;
  maxAmount: number | null;
  taxableInBracket: number;
  rate: number;
  taxAmount: number;
}

export interface InsuranceBreakdown {
  salaryBase: number;
  social: number;
  health: number;
  unemployment: number;
  totalEmployee: number;
  employerSocial: number;
  employerHealth: number;
  employerUnemployment: number;
  totalEmployer: number;
}

export interface OvertimeBreakdown {
  weekdayOt: number;
  weekendOt: number;
  holidayOt: number;
  nightBonus: number;
  totalOt: number;
}

export interface TaxBreakdown {
  taxableIncome: number;
  personalRelief: number;
  dependentsRelief: number;
  totalRelief: number;
  assessableIncome: number;
  pitTax: number;
  bracketSteps: TaxStepDetail[];
}

export interface PayrollCalculationResult {
  period?: string;
  appliedRuleCode?: string;

  // Rate metrics
  standardWorkDays: number;
  hourlyRate: number;
  dailyRate: number;

  // Earnings
  proratedBaseSalary: number;
  paidLeavePay: number;
  overtime: OvertimeBreakdown;
  bonuses: {
    kpi: number;
    other: number;
    total: number;
  };
  allowances: {
    total: number;
    taxable: number;
    nonTaxable: number;
  };

  // Intermediate Gross
  grossIncome: number;

  // Penalties
  penalties: {
    amount: number;
    timing: PenaltyDeductionTiming;
  };

  // Statutory Deductions
  insurance: InsuranceBreakdown;
  tax: TaxBreakdown;
  otherDeductions: {
    unionFee: number;
    total: number;
  };

  // Final Net & Employer Cost
  totalDeductions: number;
  netSalary: number;
  totalCompanyCost: number; // Gross + Total Employer Insurance
}
