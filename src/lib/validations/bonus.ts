import { z } from 'zod';

export const BonusCategoryEnum = z.enum([
  'KPI',
  'OVERTIME',
  'PROJECT',
  'TIME',
  'OTHER',
]);

export const BonusStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export const CreateBonusSchema = z.object({
  employeeId: z.string().uuid('ID nhân viên không hợp lệ'),
  category: BonusCategoryEnum.default('OTHER'),
  amount: z
    .number()
    .positive('Số tiền thưởng phải lớn hơn 0')
    .max(1_000_000_000, 'Số tiền thưởng tối đa 1.000.000.000 ₫'),
  period: z
    .string()
    .regex(/^(\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$/, 'Kỳ thưởng phải theo định dạng YYYY-MM, YYYY-QX hoặc YYYY'),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hiệu lực phải theo định dạng YYYY-MM-DD')
    .optional(),
  reason: z
    .string()
    .min(3, 'Lý do khen thưởng phải có ít nhất 3 ký tự')
    .max(500, 'Lý do khen thưởng tối đa 500 ký tự')
    .transform((val) => val.trim()),
  notes: z.string().max(1000, 'Ghi chú tối đa 1000 ký tự').optional().nullable(),
});

export const UpdateBonusSchema = z.object({
  category: BonusCategoryEnum.optional(),
  amount: z
    .number()
    .positive('Số tiền thưởng phải lớn hơn 0')
    .max(1_000_000_000, 'Số tiền thưởng tối đa 1.000.000.000 ₫')
    .optional(),
  period: z
    .string()
    .regex(/^(\d{4}-\d{2}|\d{4}-Q[1-4]|\d{4})$/, 'Kỳ thưởng phải theo định dạng YYYY-MM, YYYY-QX hoặc YYYY')
    .optional(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày hiệu lực phải theo định dạng YYYY-MM-DD')
    .optional(),
  reason: z
    .string()
    .min(3, 'Lý do khen thưởng phải có ít nhất 3 ký tự')
    .max(500, 'Lý do khen thưởng tối đa 500 ký tự')
    .transform((val) => val.trim())
    .optional(),
  notes: z.string().max(1000, 'Ghi chú tối đa 1000 ký tự').optional().nullable(),
});

export const ProcessBonusSchema = z
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

export const BonusQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  period: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL']).default('ALL'),
});

export type CreateBonusInput = z.infer<typeof CreateBonusSchema>;
export type UpdateBonusInput = z.infer<typeof UpdateBonusSchema>;
export type ProcessBonusInput = z.infer<typeof ProcessBonusSchema>;
export type BonusQueryParams = z.infer<typeof BonusQuerySchema>;
