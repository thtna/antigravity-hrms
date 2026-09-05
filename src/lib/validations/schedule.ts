import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const AssignSingleScheduleSchema = z.object({
  employeeId: z.string().uuid('ID nhân viên không hợp lệ'),
  shiftId: z.string().uuid('ID ca làm việc không hợp lệ'),
  workDate: z.string().regex(dateRegex, 'Ngày làm việc định dạng YYYY-MM-DD'),
  isTemporary: z.boolean().default(false),
  overrideReason: z.string().max(255).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export type AssignSingleScheduleInput = z.infer<typeof AssignSingleScheduleSchema>;

export const BulkAssignScheduleSchema = z
  .object({
    employeeIds: z.array(z.string().uuid()).min(1, 'Phải chọn ít nhất 1 nhân viên'),
    shiftId: z.string().uuid('ID ca làm việc không hợp lệ'),
    startDate: z.string().regex(dateRegex, 'Ngày bắt đầu định dạng YYYY-MM-DD'),
    endDate: z.string().regex(dateRegex, 'Ngày kết thúc định dạng YYYY-MM-DD'),
    daysOfWeek: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, 'Phải chọn ít nhất 1 thứ trong tuần (0=CN, 1=T2... 6=T7)'),
    isTemporary: z.boolean().default(false),
    overrideReason: z.string().max(255).optional().or(z.literal('')),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu',
    path: ['endDate'],
  });

export type BulkAssignScheduleInput = z.infer<typeof BulkAssignScheduleSchema>;

export const AssignRecurringPatternSchema = z
  .object({
    employeeId: z.string().uuid('ID nhân viên không hợp lệ'),
    shiftId: z.string().uuid('ID ca làm việc không hợp lệ'),
    daysOfWeek: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, 'Chọn ít nhất 1 thứ trong tuần'),
    effectiveFrom: z.string().regex(dateRegex, 'Ngày bắt đầu định dạng YYYY-MM-DD'),
    effectiveTo: z.string().regex(dateRegex, 'Ngày kết thúc định dạng YYYY-MM-DD').optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      if (data.effectiveTo && data.effectiveTo !== '') {
        return new Date(data.effectiveTo) >= new Date(data.effectiveFrom);
      }
      return true;
    },
    {
      message: 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu hiệu lực',
      path: ['effectiveTo'],
    }
  );

export type AssignRecurringPatternInput = z.infer<typeof AssignRecurringPatternSchema>;

export const ScheduleQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  status: z.enum(['ALL', 'SCHEDULED', 'COMPLETED', 'ABSENT', 'LEAVE']).default('ALL'),
});

export type ScheduleQueryParams = z.infer<typeof ScheduleQuerySchema>;
