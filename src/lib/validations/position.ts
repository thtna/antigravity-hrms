import { z } from 'zod';

export const CreatePositionSchema = z
  .object({
    code: z
      .string()
      .min(2, 'Mã chức vụ tối thiểu 2 ký tự')
      .max(20, 'Mã chức vụ tối đa 20 ký tự')
      .regex(/^[A-Z0-9_-]+$/i, 'Mã chức vụ chỉ gồm chữ cái, số, gạch dưới/ngang'),
    title: z.string().min(2, 'Tên chức danh/vị trí không được để trống').max(100),
    description: z.string().max(500).optional().or(z.literal('')),
    minSalary: z.coerce.number().min(0, 'Lương tối thiểu không được âm').default(0),
    maxSalary: z.coerce.number().min(0, 'Lương tối đa không được âm').default(0),
    baseSalaryGrade: z.coerce.number().min(0, 'Mức lương chuẩn không được âm').default(0),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.maxSalary === 0 || data.maxSalary >= data.minSalary, {
    message: 'Lương tối đa (max salary) phải lớn hơn hoặc bằng lương tối thiểu (min salary)',
    path: ['maxSalary'],
  });

export type CreatePositionInput = z.infer<typeof CreatePositionSchema>;

export const UpdatePositionSchema = z
  .object({
    code: z.string().min(2).max(20).optional(),
    title: z.string().min(2).max(100).optional(),
    description: z.string().max(500).optional().or(z.literal('')),
    minSalary: z.coerce.number().min(0).optional(),
    maxSalary: z.coerce.number().min(0).optional(),
    baseSalaryGrade: z.coerce.number().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.minSalary !== undefined && data.maxSalary !== undefined && data.maxSalary > 0) {
        return data.maxSalary >= data.minSalary;
      }
      return true;
    },
    {
      message: 'Lương tối đa (max salary) phải lớn hơn hoặc bằng lương tối thiểu (min salary)',
      path: ['maxSalary'],
    }
  );

export type UpdatePositionInput = z.infer<typeof UpdatePositionSchema>;
