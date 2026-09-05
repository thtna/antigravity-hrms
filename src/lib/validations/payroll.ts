import { z } from 'zod';

export const CreatePayrollPeriodSchema = z.object({
  code: z
    .string()
    .min(3, 'Mã kỳ tính lương tối thiểu 3 ký tự')
    .max(50, 'Mã kỳ tính lương tối đa 50 ký tự')
    .regex(/^[A-Z0-9_-]+$/, 'Mã kỳ tính lương chỉ gồm chữ hoa, số, dấu gạch ngang hoặc gạch dưới'),
  name: z.string().min(3, 'Tên kỳ tính lương tối thiểu 3 ký tự').max(150),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bắt đầu phải theo định dạng YYYY-MM-DD'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày kết thúc phải theo định dạng YYYY-MM-DD'),
  payrollRuleId: z.string().uuid().optional().nullable(),
  standardWorkDays: z.coerce.number().int().min(1).max(31).default(22),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  {
    message: 'Ngày kết thúc kỳ tính lương phải lớn hơn hoặc bằng ngày bắt đầu',
    path: ['endDate'],
  }
);

export const CalculatePayrollInputSchema = z.object({
  periodId: z.string().uuid('Mã định danh kỳ tính lương không hợp lệ'),
  recalculate: z.boolean().default(false),
  departmentId: z.string().uuid().optional().nullable(),
});

export const PayrollPeriodQuerySchema = z.object({
  status: z.enum(['DRAFT', 'CALCULATED', 'APPROVED', 'CLOSED']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreatePayrollPeriodInput = z.infer<typeof CreatePayrollPeriodSchema>;
export type CalculatePayrollInput = z.infer<typeof CalculatePayrollInputSchema>;
export type PayrollPeriodQueryParams = z.infer<typeof PayrollPeriodQuerySchema>;
