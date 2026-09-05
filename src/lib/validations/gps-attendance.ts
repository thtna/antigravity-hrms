import { z } from 'zod';

export const GpsAttendanceSchema = z.object({
  action: z.enum(['CHECK_IN', 'CHECK_OUT']).optional(),
  latitude: z.coerce
    .number()
    .min(-90, 'Vĩ độ phải từ -90 đến 90 độ')
    .max(90, 'Vĩ độ phải từ -90 đến 90 độ'),
  longitude: z.coerce
    .number()
    .min(-180, 'Kinh độ phải từ -180 đến 180 độ')
    .max(180, 'Kinh độ phải từ -180 đến 180 độ'),
  accuracy: z.coerce
    .number()
    .min(0, 'Độ chính xác không thể nhỏ hơn 0m')
    .max(10000, 'Độ chính xác vượt giới hạn hợp lệ'),
  worksiteId: z.string().uuid('Mã địa điểm làm việc không hợp lệ').optional(),
  notes: z.string().trim().max(255, 'Ghi chú tối đa 255 ký tự').optional(),
});

export type GpsAttendanceInput = z.infer<typeof GpsAttendanceSchema>;

export const GpsVerifySchema = z.object({
  latitude: z.coerce
    .number()
    .min(-90, 'Vĩ độ phải từ -90 đến 90 độ')
    .max(90, 'Vĩ độ phải từ -90 đến 90 độ'),
  longitude: z.coerce
    .number()
    .min(-180, 'Kinh độ phải từ -180 đến 180 độ')
    .max(180, 'Kinh độ phải từ -180 đến 180 độ'),
  accuracy: z.coerce
    .number()
    .min(0, 'Độ chính xác không thể nhỏ hơn 0m')
    .max(10000, 'Độ chính xác vượt giới hạn hợp lệ'),
  worksiteId: z.string().uuid('Mã địa điểm làm việc không hợp lệ').optional(),
});

export type GpsVerifyInput = z.infer<typeof GpsVerifySchema>;
