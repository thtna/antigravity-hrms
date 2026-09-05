import { z } from 'zod';

export const CreateWorksiteSchema = z.object({
  name: z.string().trim().min(2, 'Tên địa điểm làm việc phải có ít nhất 2 ký tự').max(100, 'Tên địa điểm tối đa 100 ký tự'),
  address: z.string().trim().min(3, 'Địa chỉ phải có ít nhất 3 ký tự').max(255, 'Địa chỉ tối đa 255 ký tự'),
  latitude: z.coerce
    .number()
    .min(-90, 'Vĩ độ (latitude) phải từ -90 đến 90 độ')
    .max(90, 'Vĩ độ (latitude) phải từ -90 đến 90 độ'),
  longitude: z.coerce
    .number()
    .min(-180, 'Kinh độ (longitude) phải từ -180 đến 180 độ')
    .max(180, 'Kinh độ (longitude) phải từ -180 đến 180 độ'),
  radiusMeters: z.coerce
    .number()
    .int('Bán kính phải là số nguyên')
    .min(10, 'Bán kính tối thiểu 10 mét')
    .max(5000, 'Bán kính tối đa 5000 mét')
    .default(100),
  isActive: z.boolean().default(true),
});

export type CreateWorksiteInput = z.infer<typeof CreateWorksiteSchema>;

export const UpdateWorksiteSchema = CreateWorksiteSchema.partial();

export type UpdateWorksiteInput = z.infer<typeof UpdateWorksiteSchema>;

export const WorksiteQuerySchema = z.object({
  search: z.string().trim().optional(),
  isActive: z.enum(['true', 'false', 'ALL']).default('ALL'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type WorksiteQueryParams = z.infer<typeof WorksiteQuerySchema>;
