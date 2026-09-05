import { z } from 'zod';

export const GenerateQrTokenSchema = z.object({
  tokenType: z.enum(['CHECK_IN', 'CHECK_OUT', 'ANY']).optional().default('ANY'),
  expiresInSeconds: z.coerce.number().min(10).max(300).optional().default(30),
  location: z.string().max(100).optional(),
});

export type GenerateQrTokenInput = z.input<typeof GenerateQrTokenSchema>;

export const ScanQrAttendanceSchema = z.object({
  qrPayload: z.string().min(1, 'Dữ liệu mã QR không được để trống.'),
  action: z.enum(['CHECK_IN', 'CHECK_OUT']).optional(),
  notes: z.string().max(255).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export type ScanQrAttendanceInput = z.infer<typeof ScanQrAttendanceSchema>;

export const QrTokenQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isUsed: z.enum(['true', 'false', 'ALL']).default('ALL'),
});

export type QrTokenQueryParams = z.infer<typeof QrTokenQuerySchema>;
