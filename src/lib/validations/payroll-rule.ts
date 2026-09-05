import { z } from 'zod';

export const SalaryBasisConfigSchema = z.object({
  method: z.enum(['FIXED_DAYS', 'CALENDAR_WORKING_DAYS', 'HOURLY']).default('FIXED_DAYS'),
  standardWorkDays: z.coerce.number().positive().max(31).default(22),
  standardHoursPerDay: z.coerce.number().positive().max(24).default(8),
  prorateUnpaidLeave: z.boolean().default(true),
  proratePaidLeave: z.boolean().default(true),
});

export const OvertimeConfigSchema = z.object({
  weekdayMultiplier: z.coerce.number().positive().max(10).default(1.5),
  weekendMultiplier: z.coerce.number().positive().max(10).default(2.0),
  holidayMultiplier: z.coerce.number().positive().max(10).default(3.0),
  nightBonusRate: z.coerce.number().nonnegative().max(5).default(0.3),
  nightOtMultiplier: z.coerce.number().positive().max(10).default(2.1),
});

export const InsuranceConfigSchema = z.object({
  method: z.enum(['CONTRACT_SALARY', 'ACTUAL_GROSS', 'FIXED_INSURANCE_SALARY']).default('CONTRACT_SALARY'),
  employeeSocialRate: z.coerce.number().nonnegative().max(1).default(0.08),
  employeeHealthRate: z.coerce.number().nonnegative().max(1).default(0.015),
  employeeUnemploymentRate: z.coerce.number().nonnegative().max(1).default(0.01),
  employerSocialRate: z.coerce.number().nonnegative().max(1).default(0.175),
  employerHealthRate: z.coerce.number().nonnegative().max(1).default(0.03),
  employerUnemploymentRate: z.coerce.number().nonnegative().max(1).default(0.01),
  statutoryCap: z.coerce.number().nonnegative().optional().nullable(),
  unemploymentCap: z.coerce.number().nonnegative().optional().nullable(),
  statutoryFloor: z.coerce.number().nonnegative().optional().nullable(),
});

export const TaxBracketSchema = z.object({
  bracketNumber: z.coerce.number().int().positive(),
  minAmount: z.coerce.number().nonnegative(),
  maxAmount: z.coerce.number().positive().optional().nullable(),
  rate: z.coerce.number().nonnegative().max(1),
  quickDeduction: z.coerce.number().nonnegative().default(0),
});

export const TaxConfigSchema = z.object({
  model: z.enum(['PROGRESSIVE', 'FLAT', 'EXEMPT']).default('PROGRESSIVE'),
  personalRelief: z.coerce.number().nonnegative().default(11000000),
  dependentRelief: z.coerce.number().nonnegative().default(4400000),
  flatRate: z.coerce.number().nonnegative().max(1).optional(),
  brackets: z.array(TaxBracketSchema).default([]),
});

export const DeductionConfigSchema = z.object({
  unionFeeRate: z.coerce.number().nonnegative().max(0.2).default(0),
  unionFeeCap: z.coerce.number().nonnegative().optional().nullable(),
  penaltyDeductionTiming: z.enum(['PRE_TAX_GROSS_REDUCTION', 'POST_TAX_DEDUCTION']).default('POST_TAX_DEDUCTION'),
});

export const RoundingConfigSchema = z.object({
  method: z.enum(['ROUND_HALF_UP', 'FLOOR', 'CEIL', 'TRUNCATE']).default('ROUND_HALF_UP'),
  unit: z.coerce.number().positive().default(1000),
});

export const CreatePayrollRuleSchema = z.object({
  code: z
    .string()
    .min(3, 'Mã quy chế tối thiểu 3 ký tự')
    .max(50, 'Mã quy chế tối đa 50 ký tự')
    .regex(/^[A-Z0-9_-]+$/, 'Mã quy chế chỉ gồm chữ hoa, số, gạch dưới hoặc gạch ngang'),
  name: z.string().min(3, 'Tên quy chế tối thiểu 3 ký tự').max(150),
  description: z.string().max(1000).optional().nullable(),
  isDefault: z.boolean().default(false),
  salaryBasisConfig: SalaryBasisConfigSchema,
  overtimeConfig: OvertimeConfigSchema,
  insuranceConfig: InsuranceConfigSchema,
  taxConfig: TaxConfigSchema,
  deductionConfig: DeductionConfigSchema,
  roundingConfig: RoundingConfigSchema,
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hiệu lực phải theo định dạng YYYY-MM-DD')
    .default(() => new Date().toISOString().split('T')[0]),
  effectiveTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hết hiệu lực phải theo định dạng YYYY-MM-DD')
    .optional()
    .nullable(),
});

export const UpdatePayrollRuleSchema = CreatePayrollRuleSchema.partial().omit({ code: true });

export const SimulatePayrollSchema = z.object({
  ruleId: z.string().uuid().optional(),
  ruleConfig: CreatePayrollRuleSchema.partial().optional(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Kỳ lương định dạng YYYY-MM').optional(),
  employee: z.object({
    contractSalary: z.coerce.number().positive('Mức lương hợp đồng phải lớn hơn 0'),
    insuranceSalary: z.coerce.number().nonnegative().optional(),
    dependentsCount: z.coerce.number().int().nonnegative().default(0),
    allowances: z.coerce.number().nonnegative().default(0),
    taxExemptAllowances: z.coerce.number().nonnegative().default(0),
  }),
  attendance: z.object({
    actualWorkDays: z.coerce.number().nonnegative().default(22),
    paidLeaveDays: z.coerce.number().nonnegative().default(0),
    unpaidLeaveDays: z.coerce.number().nonnegative().default(0),
    weekdayOtHours: z.coerce.number().nonnegative().default(0),
    weekendOtHours: z.coerce.number().nonnegative().default(0),
    holidayOtHours: z.coerce.number().nonnegative().default(0),
    nightHours: z.coerce.number().nonnegative().default(0),
  }),
  adjustments: z.object({
    kpiBonus: z.coerce.number().nonnegative().default(0),
    otherBonuses: z.coerce.number().nonnegative().default(0),
    penalties: z.coerce.number().nonnegative().default(0),
  }),
});

export type CreatePayrollRuleInput = z.infer<typeof CreatePayrollRuleSchema>;
export type UpdatePayrollRuleInput = z.infer<typeof UpdatePayrollRuleSchema>;
export type SimulatePayrollInput = z.input<typeof SimulatePayrollSchema>;
export type SimulatePayrollOutput = z.infer<typeof SimulatePayrollSchema>;
