import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const attendanceMethodEnum = z.enum(['WEB', 'MANUAL', 'QR', 'GPS', 'BIOMETRIC']);
export type AttendanceMethod = z.infer<typeof attendanceMethodEnum>;

export const CheckInSchema = z.object({
  employeeId: z.string().uuid('ID nhân viên không hợp lệ').optional(),
  workDate: z.string().regex(dateRegex, 'Ngày làm việc phải có định dạng YYYY-MM-DD').optional(),
  checkInTime: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  checkInMethod: attendanceMethodEnum.default('WEB'),
  checkInLat: z.coerce.number().min(-90).max(90).optional(),
  checkInLng: z.coerce.number().min(-180).max(180).optional(),
  notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional().or(z.literal('')),
});

export type CheckInInput = z.infer<typeof CheckInSchema>;

export const CheckOutSchema = z.object({
  attendanceId: z.string().uuid('ID bản ghi chấm công không hợp lệ').optional(),
  employeeId: z.string().uuid('ID nhân viên không hợp lệ').optional(),
  workDate: z.string().regex(dateRegex, 'Ngày làm việc phải có định dạng YYYY-MM-DD').optional(),
  checkOutTime: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  checkOutMethod: attendanceMethodEnum.default('WEB'),
  checkOutLat: z.coerce.number().min(-90).max(90).optional(),
  checkOutLng: z.coerce.number().min(-180).max(180).optional(),
  notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional().or(z.literal('')),
});

export type CheckOutInput = z.infer<typeof CheckOutSchema>;

export const ManualAttendanceLogSchema = z
  .object({
    employeeId: z.string().uuid('ID nhân viên không hợp lệ'),
    workDate: z.string().regex(dateRegex, 'Ngày làm việc phải có định dạng YYYY-MM-DD'),
    checkInTime: z.string().min(1, 'Thời gian check-in không được để trống'),
    checkOutTime: z.string().min(1, 'Thời gian check-out không được để trống'),
    shiftId: z.string().uuid('ID ca làm việc không hợp lệ').optional().or(z.literal('')),
    notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      const inDate = new Date(data.checkInTime.includes('T') ? data.checkInTime : `${data.workDate}T${data.checkInTime}`);
      const outDate = new Date(data.checkOutTime.includes('T') ? data.checkOutTime : `${data.workDate}T${data.checkOutTime}`);
      return outDate.getTime() > inDate.getTime();
    },
    {
      message: 'Thời gian check-out phải diễn ra sau thời gian check-in',
      path: ['checkOutTime'],
    }
  );

export type ManualAttendanceLogInput = z.infer<typeof ManualAttendanceLogSchema>;

export const AttendanceQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  status: z
    .enum(['ALL', 'ON_TIME', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY', 'OVERTIME', 'IN_PROGRESS', 'ABSENT', 'PENDING'])
    .default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type AttendanceQueryParams = z.infer<typeof AttendanceQuerySchema>;
