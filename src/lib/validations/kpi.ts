import { z } from 'zod';

export const CalculationTypeEnum = z.enum([
  'HIGHER_IS_BETTER',
  'LOWER_IS_BETTER',
  'MILESTONE',
]);

export const BonusFormulaEnum = z.enum([
  'LINEAR',
  'TIERED',
  'ACCELERATOR',
  'THRESHOLD_ONLY',
]);

export const KpiUnitEnum = z.enum([
  'PERCENT',
  'VND',
  'TASKS',
  'HOURS',
  'POINTS',
  'CONTRACTS',
]);

export const KpiPeriodEnum = z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']);

export const KpiStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const KpiResultStatusEnum = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
]);

// ── 1. KPI Definition Schemas ────────────────────────────────────────────────

export const CreateKpiDefinitionSchema = z.object({
  code: z
    .string()
    .min(2, 'Mã KPI phải có tối thiểu 2 ký tự')
    .max(50, 'Mã KPI không quá 50 ký tự')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Mã KPI chỉ được chứa chữ cái, số, gạch dưới, gạch ngang và dấu chấm')
    .transform((val) => val.toUpperCase().trim()),
  title: z
    .string()
    .min(2, 'Tiêu đề KPI phải có ít nhất 2 ký tự')
    .max(200, 'Tiêu đề KPI tối đa 200 ký tự')
    .transform((val) => val.trim()),
  description: z.string().max(1000, 'Mô tả tối đa 1000 ký tự').optional().nullable(),
  metricType: z.string().default('NUMERIC'),
  targetValue: z.number().min(0, 'Giá trị mục tiêu không được âm'),
  unit: KpiUnitEnum.default('PERCENT'),
  period: KpiPeriodEnum.default('MONTHLY'),
  departmentId: z.string().uuid('ID phòng ban không hợp lệ').optional().nullable(),
  calculationType: CalculationTypeEnum.default('HIGHER_IS_BETTER'),
  baseBonusAmount: z.number().min(0, 'Mức thưởng cơ bản không được âm').default(0),
  bonusFormula: BonusFormulaEnum.default('TIERED'),
  weight: z.number().min(1, 'Trọng số tối thiểu 1').max(100, 'Trọng số tối đa 100').default(100),
});

export const UpdateKpiDefinitionSchema = CreateKpiDefinitionSchema.partial().extend({
  status: KpiStatusEnum.optional(),
});

export const KpiQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  departmentId: z.string().optional(),
  period: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
});

// ── 2. Employee KPI Assignment & Evaluation Schemas ──────────────────────────

export const AssignKpiSchema = z.object({
  kpiId: z.string().uuid('ID chỉ số KPI không hợp lệ'),
  employeeId: z.string().uuid('ID nhân viên không hợp lệ'),
  period: z
    .string()
    .min(4, 'Kỳ KPI không hợp lệ')
    .max(20, 'Kỳ KPI quá dài')
    .regex(/^(\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$/, 'Kỳ KPI phải theo định dạng YYYY-MM, YYYY-QX hoặc YYYY'),
  targetValue: z.number().min(0, 'Giá trị mục tiêu không được âm').optional(),
  actualValue: z.number().min(0, 'Giá trị thực tế không được âm').optional(),
  managerComment: z.string().max(1000).optional().nullable(),
});

export const BulkAssignKpiSchema = z.object({
  kpiId: z.string().uuid('ID chỉ số KPI không hợp lệ'),
  period: z
    .string()
    .regex(/^(\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$/, 'Kỳ KPI phải theo định dạng YYYY-MM, YYYY-QX hoặc YYYY'),
  employeeIds: z.array(z.string().uuid()).min(1, 'Cần chọn ít nhất một nhân viên'),
  targetValue: z.number().min(0).optional(),
});

export const RecordActualValueSchema = z.object({
  actualValue: z.number().min(0, 'Giá trị thực tế không được âm'),
  managerComment: z.string().max(1000, 'Nhận xét tối đa 1000 ký tự').optional().nullable(),
});

export const EvaluateKpiSchema = z.object({
  actualValue: z.number().min(0, 'Giá trị thực tế không được âm').optional(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  managerComment: z.string().max(1000, 'Nhận xét tối đa 1000 ký tự').optional().nullable(),
});

export const ScorecardQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  period: z.string().optional(),
});

export type CreateKpiDefinitionInput = z.infer<typeof CreateKpiDefinitionSchema>;
export type UpdateKpiDefinitionInput = z.infer<typeof UpdateKpiDefinitionSchema>;
export type KpiQueryParams = z.infer<typeof KpiQuerySchema>;
export type AssignKpiInput = z.infer<typeof AssignKpiSchema>;
export type BulkAssignKpiInput = z.infer<typeof BulkAssignKpiSchema>;
export type RecordActualValueInput = z.infer<typeof RecordActualValueSchema>;
export type EvaluateKpiInput = z.infer<typeof EvaluateKpiSchema>;
export type ScorecardQueryParams = z.infer<typeof ScorecardQuerySchema>;
