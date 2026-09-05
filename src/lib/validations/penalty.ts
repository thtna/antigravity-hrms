import { z } from 'zod';

export const PenaltyCategoryEnum = z.enum([
  'LATE',
  'UNAUTHORIZED_LEAVE',
  'KPI_MISS',
  'OTHER',
]);

export const PenaltyStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export const CreatePenaltySchema = z.object({
  employeeId: z.string().uuid('ID nhân viên không hợp lệ'),
  category: PenaltyCategoryEnum,
  amount: z
    .number({ message: 'Số tiền phạt phải là số hợp lệ' })
    .positive('Số tiền phạt phải lớn hơn 0')
    .max(1_000_000_000, 'Số tiền phạt tối đa 1.000.000.000 ₫'),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày vi phạm phải theo định dạng YYYY-MM-DD')
    .default(() => new Date().toISOString().split('T')[0]),
  period: z
    .string()
    .regex(/^(\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$/, 'Kỳ khấu trừ phải theo định dạng YYYY-MM, YYYY-QX hoặc YYYY'),
  reason: z
    .string()
    .min(3, 'Lý do xử phạt phải có ít nhất 3 ký tự')
    .max(500, 'Lý do xử phạt tối đa 500 ký tự')
    .transform((val) => val.trim()),
  notes: z.string().max(1000, 'Ghi chú tối đa 1000 ký tự').optional().nullable(),
});

export const UpdatePenaltySchema = z.object({
  category: PenaltyCategoryEnum.optional(),
  amount: z
    .number()
    .positive('Số tiền phạt phải lớn hơn 0')
    .max(1_000_000_000, 'Số tiền phạt tối đa 1.000.000.000 ₫')
    .optional(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày vi phạm phải theo định dạng YYYY-MM-DD')
    .optional(),
  period: z
    .string()
    .regex(/^(\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$/, 'Kỳ khấu trừ phải theo định dạng YYYY-MM, YYYY-QX hoặc YYYY')
    .optional(),
  reason: z
    .string()
    .min(3, 'Lý do xử phạt phải có ít nhất 3 ký tự')
    .max(500, 'Lý do xử phạt tối đa 500 ký tự')
    .transform((val) => val.trim())
    .optional(),
  notes: z.string().max(1000, 'Ghi chú tối đa 1000 ký tự').optional().nullable(),
});

export const ProcessPenaltySchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    approvalNotes: z.string().max(1000, 'Ghi chú tối đa 1000 ký tự').optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.decision === 'REJECTED') {
        return Boolean(data.approvalNotes && data.approvalNotes.trim().length >= 3);
      }
      return true;
    },
    {
      message: 'Bắt buộc nhập lý do từ chối (tối thiểu 3 ký tự).',
      path: ['approvalNotes'],
    }
  );

export const PenaltyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  period: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL']).default('ALL'),
});

export type CreatePenaltyInput = z.infer<typeof CreatePenaltySchema>;
export type UpdatePenaltyInput = z.infer<typeof UpdatePenaltySchema>;
export type ProcessPenaltyInput = z.infer<typeof ProcessPenaltySchema>;
export type PenaltyQueryParams = z.infer<typeof PenaltyQuerySchema>;
