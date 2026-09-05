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
import {
  PayrollCalculationInput,
  PayrollCalculationResult,
  TaxStepDetail,
} from './types';

export class PayrollRuleEngine {
  /**
   * Evaluates employee payroll using the provided rule configuration and inputs.
   * Completely decoupled and deterministic: no hardcoded rates or side effects.
   */
  static calculate(input: PayrollCalculationInput): PayrollCalculationResult {
    const { employee, attendance, adjustments, ruleConfig } = input;
    const { salaryBasis, overtime, insurance, tax, deduction, rounding } = ruleConfig;

    // ── 1. Salary Basis & Standard Metrics ───────────────────────────────────
    const standardWorkDays =
      salaryBasis.method === 'FIXED_DAYS' || salaryBasis.method === 'HOURLY'
        ? toDecimal(salaryBasis.standardWorkDays || 22)
        : toDecimal(this.getCalendarWorkingDays(input.period));

    const standardHoursPerDay = toDecimal(salaryBasis.standardHoursPerDay || 8);
    const contractSalary = toDecimal(employee.contractSalary);

    // Daily & Hourly rate
    const dailyRate = decDiv(contractSalary, standardWorkDays);
    const hourlyRate = decDiv(dailyRate, standardHoursPerDay);

    // ── 2. Base Salary Proration ─────────────────────────────────────────────
    let proratedBaseSalary = toDecimal(0);
    let paidLeavePay = toDecimal(0);

    if (salaryBasis.method === 'HOURLY') {
      const hoursWorked = decMul(
        toDecimal(attendance.actualWorkDays),
        standardHoursPerDay
      );
      proratedBaseSalary = decMul(hourlyRate, hoursWorked);
    } else {
      const workedDays = toDecimal(attendance.actualWorkDays);
      const paidLeaveDays = salaryBasis.proratePaidLeave
        ? toDecimal(attendance.paidLeaveDays)
        : toDecimal(0);

      const actualWorkPay = decMul(dailyRate, workedDays);
      paidLeavePay = decMul(dailyRate, paidLeaveDays);
      proratedBaseSalary = decAdd(actualWorkPay, paidLeavePay);

      // If worked + paid leave >= standardWorkDays and no unpaid leave, ensure full contract salary
      const totalPaidDays = decAdd(workedDays, paidLeaveDays);
      if (
        totalPaidDays.greaterThanOrEqualTo(standardWorkDays) &&
        (!attendance.unpaidLeaveDays || attendance.unpaidLeaveDays === 0)
      ) {
        proratedBaseSalary = contractSalary;
      }
    }

    // ── 3. Overtime Calculations ────────────────────────────────────────────
    const weekdayHours = toDecimal(attendance.weekdayOtHours || 0);
    const weekendHours = toDecimal(attendance.weekendOtHours || 0);
    const holidayHours = toDecimal(attendance.holidayOtHours || 0);
    const nightHours = toDecimal(attendance.nightHours || 0);

    const weekdayOt = decMul(hourlyRate, decMul(weekdayHours, overtime.weekdayMultiplier));
    const weekendOt = decMul(hourlyRate, decMul(weekendHours, overtime.weekendMultiplier));
    const holidayOt = decMul(hourlyRate, decMul(holidayHours, overtime.holidayMultiplier));
    const nightBonus = decMul(hourlyRate, decMul(nightHours, overtime.nightBonusRate));
    const totalOt = decAdd(decAdd(decAdd(weekdayOt, weekendOt), holidayOt), nightBonus);

    // ── 4. Bonuses & Allowances ──────────────────────────────────────────────
    const kpiBonus = toDecimal(adjustments.kpiBonus || 0);
    const otherBonuses = toDecimal(adjustments.otherBonuses || 0);
    const totalBonuses = decAdd(kpiBonus, otherBonuses);

    const totalAllowances = toDecimal(employee.allowances || 0);
    const nonTaxableAllowances = toDecimal(employee.taxExemptAllowances || 0);
    const taxableAllowances = decMax(0, decSub(totalAllowances, nonTaxableAllowances));

    // ── 5. Gross Income Calculation ──────────────────────────────────────────
    let grossIncome = decAdd(
      decAdd(decAdd(proratedBaseSalary, totalOt), totalBonuses),
      totalAllowances
    );

    const penaltiesAmount = toDecimal(adjustments.penalties || 0);
    if (deduction.penaltyDeductionTiming === 'PRE_TAX_GROSS_REDUCTION') {
      grossIncome = decMax(0, decSub(grossIncome, penaltiesAmount));
    }

    // ── 6. Insurance Calculations ────────────────────────────────────────────
    let insuranceBase = toDecimal(0);
    if (insurance.method === 'CONTRACT_SALARY') {
      insuranceBase = toDecimal(employee.insuranceSalary || employee.contractSalary);
    } else if (insurance.method === 'ACTUAL_GROSS') {
      insuranceBase = grossIncome;
    } else if (insurance.method === 'FIXED_INSURANCE_SALARY') {
      insuranceBase = toDecimal(employee.insuranceSalary || 0);
    }

    // Apply statutory floor if specified
    if (insurance.statutoryFloor) {
      insuranceBase = decMax(insuranceBase, insurance.statutoryFloor);
    }

    // Apply statutory caps
    const socialBase = insurance.statutoryCap
      ? decMin(insuranceBase, insurance.statutoryCap)
      : insuranceBase;
    const healthBase = insurance.statutoryCap
      ? decMin(insuranceBase, insurance.statutoryCap)
      : insuranceBase;
    const unemploymentBase = insurance.unemploymentCap
      ? decMin(insuranceBase, insurance.unemploymentCap)
      : insuranceBase;

    // Employee contributions
    const empSocial = decMul(socialBase, insurance.employeeSocialRate);
    const empHealth = decMul(healthBase, insurance.employeeHealthRate);
    const empUnemployment = decMul(unemploymentBase, insurance.employeeUnemploymentRate);
    const totalEmpInsurance = decAdd(decAdd(empSocial, empHealth), empUnemployment);

    // Employer contributions
    const erSocial = decMul(socialBase, insurance.employerSocialRate);
    const erHealth = decMul(healthBase, insurance.employerHealthRate);
    const erUnemployment = decMul(unemploymentBase, insurance.employerUnemploymentRate);
    const totalErInsurance = decAdd(decAdd(erSocial, erHealth), erUnemployment);

    // ── 7. Personal Income Tax (PIT) ─────────────────────────────────────────
    // Thu nhập chịu thuế = Tổng thu nhập - Các khoản phụ cấp miễn thuế
    const taxableIncome = decMax(0, decSub(grossIncome, nonTaxableAllowances));

    // Giảm trừ gia cảnh
    const personalRelief = toDecimal(tax.personalRelief || 0);
    const dependentsRelief = decMul(
      toDecimal(employee.dependentsCount || 0),
      toDecimal(tax.dependentRelief || 0)
    );
    const totalRelief = decAdd(personalRelief, dependentsRelief);

    // Thu nhập tính thuế = Thu nhập chịu thuế - Bảo hiểm bắt buộc - Giảm trừ gia cảnh
    const assessableIncome = decMax(
      0,
      decSub(taxableIncome, decAdd(totalEmpInsurance, totalRelief))
    );

    let pitTax = toDecimal(0);
    const bracketSteps: TaxStepDetail[] = [];

    if (tax.model === 'FLAT') {
      const flatRate = toDecimal(tax.flatRate || 0.1);
      pitTax = decMul(taxableIncome, flatRate);
    } else if (tax.model === 'PROGRESSIVE' && assessableIncome.greaterThan(0)) {
      // Progressive Bracket Engine
      for (const b of tax.brackets) {
        const min = toDecimal(b.minAmount);
        const max = b.maxAmount !== null ? toDecimal(b.maxAmount) : null;
        const rate = toDecimal(b.rate);

        if (assessableIncome.greaterThan(min)) {
          const taxableInBracket =
            max !== null
              ? decMin(assessableIncome, max).minus(min)
              : assessableIncome.minus(min);

          const stepTax = decMul(taxableInBracket, rate);
          pitTax = decAdd(pitTax, stepTax);

          bracketSteps.push({
            bracketNumber: b.bracketNumber,
            minAmount: min.toNumber(),
            maxAmount: max ? max.toNumber() : null,
            taxableInBracket: taxableInBracket.toNumber(),
            rate: rate.toNumber(),
            taxAmount: stepTax.toNumber(),
          });
        }
      }
    }

    // ── 8. Other Deductions (Union Fee, etc.) ─────────────────────────────────
    let unionFee = toDecimal(0);
    if (deduction.unionFeeRate && deduction.unionFeeRate > 0) {
      unionFee = decMul(proratedBaseSalary, deduction.unionFeeRate);
      if (deduction.unionFeeCap) {
        unionFee = decMin(unionFee, deduction.unionFeeCap);
      }
    }
    const totalOtherDeductions = unionFee;

    // ── 9. Net Salary & Rounding ─────────────────────────────────────────────
    let totalDeductions = decAdd(
      decAdd(totalEmpInsurance, pitTax),
      totalOtherDeductions
    );

    if (deduction.penaltyDeductionTiming === 'POST_TAX_DEDUCTION') {
      totalDeductions = decAdd(totalDeductions, penaltiesAmount);
    }

    const unroundedNet = decMax(0, decSub(grossIncome, totalDeductions));
    const netSalary = applyRounding(unroundedNet, rounding.method, rounding.unit);

    // Total cost to employer = Gross + Employer Insurance
    const totalCompanyCost = decAdd(grossIncome, totalErInsurance);

    return {
      period: input.period,
      appliedRuleCode: ruleConfig.ruleCode,

      standardWorkDays: standardWorkDays.toNumber(),
      hourlyRate: hourlyRate.toNumber(),
      dailyRate: dailyRate.toNumber(),

      proratedBaseSalary: proratedBaseSalary.toNumber(),
      paidLeavePay: paidLeavePay.toNumber(),
      overtime: {
        weekdayOt: weekdayOt.toNumber(),
        weekendOt: weekendOt.toNumber(),
        holidayOt: holidayOt.toNumber(),
        nightBonus: nightBonus.toNumber(),
        totalOt: totalOt.toNumber(),
      },
      bonuses: {
        kpi: kpiBonus.toNumber(),
        other: otherBonuses.toNumber(),
        total: totalBonuses.toNumber(),
      },
      allowances: {
        total: totalAllowances.toNumber(),
        taxable: taxableAllowances.toNumber(),
        nonTaxable: nonTaxableAllowances.toNumber(),
      },

      grossIncome: grossIncome.toNumber(),

      penalties: {
        amount: penaltiesAmount.toNumber(),
        timing: deduction.penaltyDeductionTiming,
      },

      insurance: {
        salaryBase: insuranceBase.toNumber(),
        social: empSocial.toNumber(),
        health: empHealth.toNumber(),
        unemployment: empUnemployment.toNumber(),
        totalEmployee: totalEmpInsurance.toNumber(),
        employerSocial: erSocial.toNumber(),
        employerHealth: erHealth.toNumber(),
        employerUnemployment: erUnemployment.toNumber(),
        totalEmployer: totalErInsurance.toNumber(),
      },

      tax: {
        taxableIncome: taxableIncome.toNumber(),
        personalRelief: personalRelief.toNumber(),
        dependentsRelief: dependentsRelief.toNumber(),
        totalRelief: totalRelief.toNumber(),
        assessableIncome: assessableIncome.toNumber(),
        pitTax: pitTax.toNumber(),
        bracketSteps,
      },

      otherDeductions: {
        unionFee: unionFee.toNumber(),
        total: totalOtherDeductions.toNumber(),
      },

      totalDeductions: totalDeductions.toNumber(),
      netSalary: netSalary.toNumber(),
      totalCompanyCost: totalCompanyCost.toNumber(),
    };
  }

  /**
   * Helper to count working days (Mon-Fri) in a given month (YYYY-MM).
   * Defaults to 22 if invalid or missing period.
   */
  private static getCalendarWorkingDays(period?: string): number {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return 22;
    }
    const [year, month] = period.split('-').map(Number);
    const totalDays = new Date(year, month, 0).getDate();
    let workingDays = 0;

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay();
      // Monday = 1 ... Friday = 5
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;
      }
    }

    return workingDays || 22;
  }
}
