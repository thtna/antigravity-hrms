import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const localOrOffsetDatetimeRegex =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const manualAttendanceTimeRegex =
  /^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?|\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)$/;
export const CheckInSchema = z
  .object({
    employeeId: z.string().uuid('ID nhân viên không hợp lệ').optional(),
    workDate: z.string().regex(dateRegex, 'Ngày làm việc phải có định dạng YYYY-MM-DD').optional(),
    checkInTime: z.string().regex(localOrOffsetDatetimeRegex, 'Thời gian check-in không hợp lệ').optional(),
    checkInLat: z.coerce.number().min(-90).max(90).optional(),
    checkInLng: z.coerce.number().min(-180).max(180).optional(),
    notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional().or(z.literal('')),
  })
  .strip();

export type CheckInInput = z.infer<typeof CheckInSchema>;

export const CheckOutSchema = z
  .object({
    attendanceId: z.string().uuid('ID bản ghi chấm công không hợp lệ').optional(),
    employeeId: z.string().uuid('ID nhân viên không hợp lệ').optional(),
    workDate: z.string().regex(dateRegex, 'Ngày làm việc phải có định dạng YYYY-MM-DD').optional(),
    checkOutTime: z.string().regex(localOrOffsetDatetimeRegex, 'Thời gian check-out không hợp lệ').optional(),
    checkOutLat: z.coerce.number().min(-90).max(90).optional(),
    checkOutLng: z.coerce.number().min(-180).max(180).optional(),
    notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional().or(z.literal('')),
  })
  .strip();

export type CheckOutInput = z.infer<typeof CheckOutSchema>;

export const ManualAttendanceLogSchema = z.object({
  employeeId: z.string().uuid('ID nhân viên không hợp lệ'),
  workDate: z.string().regex(dateRegex, 'Ngày làm việc phải có định dạng YYYY-MM-DD'),
  checkInTime: z
    .string()
    .min(1, 'Thời gian check-in không được để trống')
    .regex(manualAttendanceTimeRegex, 'Thời gian check-in không hợp lệ'),
  checkOutTime: z
    .string()
    .min(1, 'Thời gian check-out không được để trống')
    .regex(manualAttendanceTimeRegex, 'Thời gian check-out không hợp lệ'),
  shiftId: z.string().uuid('ID ca làm việc không hợp lệ').optional().or(z.literal('')),
  notes: z.string().max(500, 'Ghi chú tối đa 500 ký tự').optional().or(z.literal('')),
});

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
