import { z } from 'zod';

export const CreateDepartmentSchema = z.object({
  code: z
    .string()
    .min(2, 'Mã phòng ban tối thiểu 2 ký tự')
    .max(20, 'Mã phòng ban tối đa 20 ký tự')
    .regex(/^[A-Z0-9_-]+$/i, 'Mã phòng ban chỉ gồm chữ cái, số, gạch dưới/ngang'),
  name: z.string().min(2, 'Tên phòng ban không được để trống').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  parentId: z.string().uuid().optional().or(z.literal('')),
  managerId: z.string().uuid().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = CreateDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;
