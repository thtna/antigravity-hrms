import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const ShiftBaseSchema = z.object({
  code: z
    .string()
    .min(2, 'Mã ca tối thiểu 2 ký tự')
    .max(20, 'Mã ca tối đa 20 ký tự')
    .regex(/^[A-Z0-9_-]+$/i, 'Mã ca chỉ gồm chữ cái, số, gạch dưới/ngang'),
  name: z.string().min(2, 'Tên ca làm việc không được để trống').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  shiftType: z.enum(['FIXED', 'FLEXIBLE']).default('FIXED'),
  startTime: z.string().regex(timeRegex, 'Giờ bắt đầu phải có định dạng HH:mm (ví dụ 08:30)'),
  endTime: z.string().regex(timeRegex, 'Giờ kết thúc phải có định dạng HH:mm (ví dụ 17:30)'),
  breakMinutes: z.coerce.number().int().min(0, 'Thời gian nghỉ không được âm').default(60),
  isOvernight: z.boolean().default(false),
  gracePeriodLate: z.coerce.number().int().min(0).default(15),
  gracePeriodEarly: z.coerce.number().int().min(0).default(15),
  standardWorkHours: z.coerce.number().min(0).max(24).optional(),
  isActive: z.boolean().default(true),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bắt đầu hiệu lực YYYY-MM-DD').default(() => new Date().toISOString().split('T')[0]),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày kết thúc hiệu lực YYYY-MM-DD').optional().or(z.literal('')),
});

export const CreateShiftSchema = ShiftBaseSchema.refine(
  (data) => {
    if (data.effectiveTo && data.effectiveTo !== '') {
      return new Date(data.effectiveTo) >= new Date(data.effectiveFrom);
    }
    return true;
  },
  {
    message: 'Ngày kết thúc hiệu lực (effectiveTo) phải sau hoặc bằng ngày bắt đầu (effectiveFrom)',
    path: ['effectiveTo'],
  }
);

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;

export const UpdateShiftSchema = ShiftBaseSchema.partial().refine(
  (data) => {
    if (data.effectiveTo && data.effectiveTo !== '' && data.effectiveFrom) {
      return new Date(data.effectiveTo) >= new Date(data.effectiveFrom);
    }
    return true;
  },
  {
    message: 'Ngày kết thúc hiệu lực (effectiveTo) phải sau hoặc bằng ngày bắt đầu (effectiveFrom)',
    path: ['effectiveTo'],
  }
);

export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;
