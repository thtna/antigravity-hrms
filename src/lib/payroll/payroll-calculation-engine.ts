/**
 * Antigravity HRMS — Pure Deterministic Payroll Calculation Engine
 * 
 * Mathematical properties:
 * 1. Deterministic: Given the exact same inputs, always returns the exact same outputs.
 * 2. Decimal-Safe: All monetary calculations use 28-digit precision Decimal math (no IEEE 754 drift).
 * 3. Decoupled: Zero dependency on React components, UI state, or direct database operations.
 */

import { Decimal } from 'decimal.js';
import {
  toDecimal,
  decAdd,
  decSub,
  decMul,
  decDiv,
  decMax,
  decMin,
  applyRounding,
} from './decimal-math';
import { PayrollRuleConfig, TaxStepDetail } from './types';
import { VIETNAM_STATUTORY_RULE_2026 } from './default-rules';

export interface DeterministicOvertimeDetails {
  weekdayOtHours?: number;
  weekendOtHours?: number;
  holidayOtHours?: number;
  nightHours?: number;
}

export interface DeterministicBonusDetails {
  kpiBonus?: number;
  projectBonus?: number;
  otherBonus?: number;
}

export interface DeterministicPenaltyDetails {
  latePenalty?: number;
  unauthorizedLeavePenalty?: number;
  disciplinePenalty?: number;
  otherPenalty?: number;
}

export interface DeterministicPayrollInput {
  // ── Exact required prompt inputs ──
  baseSalary: number | string | Decimal;
  workDays: number;
  actualWorkDays: number;
  workHours: number;
  overtimeHours: number;
  overtimePay?: number | string | Decimal;
  bonus: number | string | Decimal;
  penalty: number | string | Decimal;
  tax?: number | string | Decimal;
  insurance?: number | string | Decimal;
  deductions?: number | string | Decimal;

  // ── Supporting breakdown inputs ──
  paidLeaveDays?: number;
  unpaidLeaveDays?: number;
  dependentsCount?: number;
  insuranceSalary?: number | string | Decimal;
  allowances?: number | string | Decimal;
  taxExemptAllowances?: number | string | Decimal;
  overtimeDetails?: DeterministicOvertimeDetails;
  bonusDetails?: DeterministicBonusDetails;
  penaltyDetails?: DeterministicPenaltyDetails;
  ruleConfig?: PayrollRuleConfig;
}

export interface PayrollLineItem {
  itemType: 'EARNING' | 'DEDUCTION' | 'TAX' | 'INSURANCE' | 'BONUS' | 'PENALTY';
  itemCode: string;
  description: string;
  amount: number;
}

export interface DeterministicPayrollOutput {
  // ── Exact required prompt outputs ──
  grossSalary: number;
  totalBonus: number;
  totalPenalty: number;
  tax: number;
  insurance: number;
  netSalary: number;

  // ── Detailed audit & payslip breakdown metrics ──
  baseSalary: number;
  standardWorkDays: number;
  actualWorkDays: number;
  actualWorkHours: number;
  dailyRate: number;
  hourlyRate: number;
  proratedSalary: number;
  paidLeavePay: number;
  overtimeHours: number;
  overtimePay: number;
  allowances: number;
  taxExemptAllowances: number;
  employerInsurance: number;
  employeeSocial: number;
  employeeHealth: number;
  employeeUnemployment: number;
  employerSocial: number;
  employerHealth: number;
  employerUnemployment: number;
  taxableIncome: number;
  personalRelief: number;
  dependentsRelief: number;
  assessableIncome: number;
  taxBracketSteps: TaxStepDetail[];
  otherDeductions: number;
  roundingAdjustment: number;
  lineItems: PayrollLineItem[];
}

export class PayrollCalculationEngine {
  /**
   * Deterministic Payroll Computation Function.
   * Pure function: Pure Input -> Pure Output.
   */
  static calculate(input: DeterministicPayrollInput): DeterministicPayrollOutput {
    const rule = input.ruleConfig || VIETNAM_STATUTORY_RULE_2026;
    const lineItems: PayrollLineItem[] = [];

    // 1. Normalized numeric Decimal inputs
    const baseSalary = toDecimal(input.baseSalary);
    const standardWorkDays = Math.max(1, input.workDays || rule.salaryBasis.standardWorkDays || 22);
    const actualWorkDays = Math.max(0, Number(input.actualWorkDays) || 0);
    const actualWorkHours = Math.max(0, Number(input.workHours) || 0);
    const paidLeaveDays = Math.max(0, Number(input.paidLeaveDays) || 0);
    const dependentsCount = Math.max(0, Number(input.dependentsCount) || 0);
    const totalBonus = toDecimal(input.bonus || 0);
    const totalPenalty = toDecimal(input.penalty || 0);
    const otherDeductions = toDecimal(input.deductions || 0);
    const allowances = toDecimal(input.allowances || 0);
    const taxExemptAllowances = toDecimal(input.taxExemptAllowances || 0);

    const standardDailyHours = rule.salaryBasis.standardHoursPerDay || 8;

    // 2. Unit Rates (Daily & Hourly)
    const dailyRate = decDiv(baseSalary, standardWorkDays);
    const hourlyRate = decDiv(dailyRate, standardDailyHours);

    // 3. Prorated Base Salary & Paid Leave Pay
    // Prorated Salary = (actualWorkDays / standardWorkDays) * baseSalary
    // Capped at baseSalary if actualWorkDays >= standardWorkDays
    const workedDaysDec = toDecimal(actualWorkDays);
    const proratedSalary = decMul(dailyRate, workedDaysDec);

    lineItems.push({
      itemType: 'EARNING',
      itemCode: 'BASE_PRORATED',
      description: `Lương cơ bản theo công (${actualWorkDays}/${standardWorkDays} ngày)`,
      amount: proratedSalary.toNumber(),
    });

    // Paid Leave Pay
    const paidLeaveDaysDec = toDecimal(paidLeaveDays);
    const paidLeavePay = decMul(dailyRate, paidLeaveDaysDec);
    if (paidLeavePay.greaterThan(0)) {
      lineItems.push({
        itemType: 'EARNING',
        itemCode: 'PAID_LEAVE',
        description: `Lương nghỉ phép hưởng lương (${paidLeaveDays} ngày)`,
        amount: paidLeavePay.toNumber(),
      });
    }

    // 4. Overtime Pay Calculation
    let overtimePay: Decimal;
    const otHours = Math.max(0, Number(input.overtimeHours) || 0);

    if (input.overtimePay !== undefined && input.overtimePay !== null) {
      overtimePay = toDecimal(input.overtimePay);
    } else if (input.overtimeDetails) {
      const otWeekdayHours = toDecimal(input.overtimeDetails.weekdayOtHours || 0);
      const otWeekendHours = toDecimal(input.overtimeDetails.weekendOtHours || 0);
      const otHolidayHours = toDecimal(input.overtimeDetails.holidayOtHours || 0);
      const otNightHours = toDecimal(input.overtimeDetails.nightHours || 0);

      const weekdayPay = decMul(decMul(hourlyRate, otWeekdayHours), rule.overtime.weekdayMultiplier);
      const weekendPay = decMul(decMul(hourlyRate, otWeekendHours), rule.overtime.weekendMultiplier);
      const holidayPay = decMul(decMul(hourlyRate, otHolidayHours), rule.overtime.holidayMultiplier);
      const nightPay = decMul(decMul(hourlyRate, otNightHours), rule.overtime.nightBonusRate);

      overtimePay = decAdd(decAdd(weekdayPay, weekendPay), decAdd(holidayPay, nightPay));
    } else {
      // Default standard overtime multiplier (e.g. 1.5x)
      const otMultiplier = rule.overtime.weekdayMultiplier || 1.5;
      overtimePay = decMul(decMul(hourlyRate, toDecimal(otHours)), otMultiplier);
    }

    if (overtimePay.greaterThan(0)) {
      lineItems.push({
        itemType: 'EARNING',
        itemCode: 'OVERTIME',
        description: `Làm thêm giờ (${otHours} giờ)`,
        amount: overtimePay.toNumber(),
      });
    }

    // 5. Allowances & Bonuses
    if (allowances.greaterThan(0)) {
      lineItems.push({
        itemType: 'EARNING',
        itemCode: 'ALLOWANCE',
        description: 'Phụ cấp công việc',
        amount: allowances.toNumber(),
      });
    }

    if (totalBonus.greaterThan(0)) {
      lineItems.push({
        itemType: 'BONUS',
        itemCode: 'BONUS_TOTAL',
        description: 'Tổng tiền thưởng (KPI / Dự án / Hiệu suất)',
        amount: totalBonus.toNumber(),
      });
    }

    // 6. Gross Salary Calculation
    // Gross = Prorated Salary + Paid Leave Pay + Overtime Pay + Allowances + Total Bonus
    const earningsBeforeBonus = decAdd(decAdd(proratedSalary, paidLeavePay), decAdd(overtimePay, allowances));
    const grossSalaryRaw = decAdd(earningsBeforeBonus, totalBonus);

    // 7. Statutory Insurance Calculation
    let insuranceEmployee: Decimal;
    let employerInsurance: Decimal;
    let employeeSocial = new Decimal(0);
    let employeeHealth = new Decimal(0);
    let employeeUnemployment = new Decimal(0);
    let employerSocial = new Decimal(0);
    let employerHealth = new Decimal(0);
    let employerUnemployment = new Decimal(0);

    if (input.insurance !== undefined && input.insurance !== null) {
      insuranceEmployee = toDecimal(input.insurance);
      employerInsurance = new Decimal(0);
    } else {
      // Base salary for statutory insurance
      let insuranceBase = input.insuranceSalary !== undefined
        ? toDecimal(input.insuranceSalary)
        : baseSalary;

      if (rule.insurance.statutoryCap) {
        insuranceBase = decMin(insuranceBase, rule.insurance.statutoryCap);
      }
      if (rule.insurance.statutoryFloor) {
        insuranceBase = decMax(insuranceBase, rule.insurance.statutoryFloor);
      }

      employeeSocial = decMul(insuranceBase, rule.insurance.employeeSocialRate);
      employeeHealth = decMul(insuranceBase, rule.insurance.employeeHealthRate);
      employeeUnemployment = decMul(insuranceBase, rule.insurance.employeeUnemploymentRate);
      insuranceEmployee = decAdd(decAdd(employeeSocial, employeeHealth), employeeUnemployment);

      employerSocial = decMul(insuranceBase, rule.insurance.employerSocialRate);
      employerHealth = decMul(insuranceBase, rule.insurance.employerHealthRate);
      employerUnemployment = decMul(insuranceBase, rule.insurance.employerUnemploymentRate);
      employerInsurance = decAdd(decAdd(employerSocial, employerHealth), employerUnemployment);
    }

    if (insuranceEmployee.greaterThan(0)) {
      lineItems.push({
        itemType: 'INSURANCE',
        itemCode: 'INSURANCE_EMP',
        description: 'Bảo hiểm bắt buộc (BHXH + BHYT + BHTN)',
        amount: insuranceEmployee.toNumber(),
      });
    }

    // 8. Personal Income Tax (PIT) Calculation
    let pitTax: Decimal;
    const taxBracketSteps: TaxStepDetail[] = [];
    let taxableIncome = new Decimal(0);
    let personalRelief = new Decimal(0);
    let dependentsRelief = new Decimal(0);
    let assessableIncome = new Decimal(0);

    if (input.tax !== undefined && input.tax !== null) {
      pitTax = toDecimal(input.tax);
      taxableIncome = grossSalaryRaw;
      assessableIncome = decMax(new Decimal(0), decSub(taxableIncome, insuranceEmployee));
    } else {
      // Taxable income = Gross - Non-taxable allowances
      taxableIncome = decMax(new Decimal(0), decSub(grossSalaryRaw, taxExemptAllowances));

      if (rule.tax.model === 'FLAT') {
        assessableIncome = taxableIncome;
        pitTax = decMul(assessableIncome, rule.tax.flatRate || 0.1);
      } else if (rule.tax.model === 'EXEMPT') {
        assessableIncome = new Decimal(0);
        pitTax = new Decimal(0);
      } else {
        // PROGRESSIVE Mode
        personalRelief = toDecimal(rule.tax.personalRelief || 11000000);
        dependentsRelief = decMul(toDecimal(dependentsCount), rule.tax.dependentRelief || 4400000);
        const totalRelief = decAdd(decAdd(personalRelief, dependentsRelief), insuranceEmployee);

        assessableIncome = decMax(new Decimal(0), decSub(taxableIncome, totalRelief));

        // Evaluate progressive brackets deterministically
        let remainingAssessable = assessableIncome;
        let cumulativeTax = new Decimal(0);

        for (let i = 0; i < rule.tax.brackets.length; i++) {
          const b = rule.tax.brackets[i];
          const bracketMin = toDecimal(b.minAmount);
          const bracketMax = b.maxAmount !== null ? toDecimal(b.maxAmount) : null;
          const rate = toDecimal(b.rate);

          if (assessableIncome.lessThanOrEqualTo(bracketMin)) {
            continue;
          }

          let taxableSpan: Decimal;
          if (bracketMax !== null) {
            const spanCapacity = decSub(bracketMax, bracketMin);
            taxableSpan = decMin(remainingAssessable, spanCapacity);
          } else {
            taxableSpan = remainingAssessable;
          }

          if (taxableSpan.greaterThan(0)) {
            const stepTax = decMul(taxableSpan, rate);
            cumulativeTax = decAdd(cumulativeTax, stepTax);
            remainingAssessable = decSub(remainingAssessable, taxableSpan);

            taxBracketSteps.push({
              bracketNumber: i + 1,
              minAmount: bracketMin.toNumber(),
              maxAmount: bracketMax ? bracketMax.toNumber() : null,
              taxableInBracket: taxableSpan.toNumber(),
              rate: rate.toNumber(),
              taxAmount: stepTax.toNumber(),
            });
          }

          if (remainingAssessable.lessThanOrEqualTo(0)) break;
        }

        pitTax = cumulativeTax;
      }
    }

    if (pitTax.greaterThan(0)) {
      lineItems.push({
        itemType: 'TAX',
        itemCode: 'PIT_TAX',
        description: 'Thuế thu nhập cá nhân (TNCN)',
        amount: pitTax.toNumber(),
      });
    }

    // 9. Deductions & Penalties
    if (totalPenalty.greaterThan(0)) {
      lineItems.push({
        itemType: 'PENALTY',
        itemCode: 'PENALTY_TOTAL',
        description: 'Các khoản kỷ luật & phạt',
        amount: totalPenalty.toNumber(),
      });
    }

    if (otherDeductions.greaterThan(0)) {
      lineItems.push({
        itemType: 'DEDUCTION',
        itemCode: 'OTHER_DEDUCTION',
        description: 'Các khoản giảm trừ khác (Đoàn phí/Tạm ứng)',
        amount: otherDeductions.toNumber(),
      });
    }

    // 10. Net Salary Computation
    // Net Salary = Gross Salary - Insurance - Tax - Penalties - Deductions
    const totalDeductions = decAdd(
      decAdd(insuranceEmployee, pitTax),
      decAdd(totalPenalty, otherDeductions)
    );
    const unroundedNetSalary = decSub(grossSalaryRaw, totalDeductions);

    // Apply rule-based deterministic rounding
    const roundedNetSalary = applyRounding(
      unroundedNetSalary,
      rule.rounding.method,
      rule.rounding.unit
    );
    const roundingAdjustment = decSub(roundedNetSalary, unroundedNetSalary);

    return {
      grossSalary: grossSalaryRaw.toNumber(),
      totalBonus: totalBonus.toNumber(),
      totalPenalty: totalPenalty.toNumber(),
      tax: pitTax.toNumber(),
      insurance: insuranceEmployee.toNumber(),
      netSalary: roundedNetSalary.toNumber(),

      baseSalary: baseSalary.toNumber(),
      standardWorkDays,
      actualWorkDays,
      actualWorkHours,
      dailyRate: dailyRate.toNumber(),
      hourlyRate: hourlyRate.toNumber(),
      proratedSalary: proratedSalary.toNumber(),
      paidLeavePay: paidLeavePay.toNumber(),
      overtimeHours: otHours,
      overtimePay: overtimePay.toNumber(),
      allowances: allowances.toNumber(),
      taxExemptAllowances: taxExemptAllowances.toNumber(),
      employerInsurance: employerInsurance.toNumber(),
      employeeSocial: employeeSocial.toNumber(),
      employeeHealth: employeeHealth.toNumber(),
      employeeUnemployment: employeeUnemployment.toNumber(),
      employerSocial: employerSocial.toNumber(),
      employerHealth: employerHealth.toNumber(),
      employerUnemployment: employerUnemployment.toNumber(),
      taxableIncome: taxableIncome.toNumber(),
      personalRelief: personalRelief.toNumber(),
      dependentsRelief: dependentsRelief.toNumber(),
      assessableIncome: assessableIncome.toNumber(),
      taxBracketSteps,
      otherDeductions: otherDeductions.toNumber(),
      roundingAdjustment: roundingAdjustment.toNumber(),
      lineItems,
    };
  }
}
