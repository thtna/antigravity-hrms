import { z } from 'zod';

const BranchCodeSchema = z
  .string()
  .trim()
  .min(2, 'Ma chi nhanh toi thieu 2 ky tu')
  .max(20, 'Ma chi nhanh toi da 20 ky tu')
  .regex(/^[A-Z0-9_-]+$/i, 'Ma chi nhanh chi gom chu cai, so, gach duoi/ngang');

export const CreateBranchSchema = z
  .object({
    code: BranchCodeSchema,
    name: z.string().trim().min(2, 'Ten chi nhanh toi thieu 2 ky tu').max(100, 'Ten chi nhanh toi da 100 ky tu'),
    address: z.string().trim().max(255, 'Dia chi toi da 255 ky tu').optional().or(z.literal('')),
    phone: z.string().trim().max(30, 'So dien thoai toi da 30 ky tu').optional().or(z.literal('')),
    isActive: z.boolean().default(true),
  })
  .strict();

export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = z
  .object({
    code: BranchCodeSchema.optional(),
    name: z.string().trim().min(2, 'Ten chi nhanh toi thieu 2 ky tu').max(100, 'Ten chi nhanh toi da 100 ky tu').optional(),
    address: z.string().trim().max(255, 'Dia chi toi da 255 ky tu').optional().or(z.literal('')),
    phone: z.string().trim().max(30, 'So dien thoai toi da 30 ky tu').optional().or(z.literal('')),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Can cung cap it nhat mot truong can cap nhat.',
  });

export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;

export const BranchStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export type BranchStatusInput = z.infer<typeof BranchStatusSchema>;
