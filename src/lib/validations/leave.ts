import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const LeaveRequestTypeEnum = z.enum([
  'LEAVE',         // Đơn xin nghỉ phép (nghỉ ngày/nhiều ngày)
  'LATE_REQUEST',  // Đơn xin đi muộn
  'EARLY_LEAVE',   // Đơn xin về sớm
]);

export type LeaveRequestType = z.infer<typeof LeaveRequestTypeEnum>;

export const LeaveStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export type LeaveStatus = z.infer<typeof LeaveStatusEnum>;

// ── Schema: Tạo đơn xin nghỉ / xin đi muộn / xin về sớm ───────────────────────
export const CreateLeaveRequestSchema = z
  .object({
    requestType: LeaveRequestTypeEnum.default('LEAVE'),
    leaveTypeId: z.preprocess(
      emptyToUndefined,
      z.string().uuid('ID loại nghỉ phép không hợp lệ').optional()
    ),
    startDate: z
      .string()
      .regex(dateRegex, 'Ngày bắt đầu phải có định dạng YYYY-MM-DD'),
    endDate: z
      .string()
      .regex(dateRegex, 'Ngày kết thúc phải có định dạng YYYY-MM-DD'),
    expectedTime: z.preprocess(
      emptyToUndefined,
      z.string().regex(timeRegex, 'Thời gian dự kiến phải có định dạng HH:mm (00:00 - 23:59)').optional()
    ),
    durationDays: z.preprocess(
      emptyToUndefined,
      z.coerce.number().min(0.5, 'Thời gian nghỉ tối thiểu là 0.5 ngày').max(365).default(1.0)
    ),
    reason: z
      .string()
      .min(10, 'Lý do phải có ít nhất 10 ký tự')
      .max(1000, 'Lý do không được vượt quá 1000 ký tự'),
  })
  .superRefine((data, ctx) => {
    // 1. Kiểm tra thứ tự ngày
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    if (end.getTime() < start.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Ngày kết thúc không được nhỏ hơn ngày bắt đầu',
        path: ['endDate'],
      });
    }

    // 2. Với đơn xin đi muộn và về sớm: phải diễn ra trong 1 ngày duy nhất
    if (data.requestType === 'LATE_REQUEST' || data.requestType === 'EARLY_LEAVE') {
      if (data.startDate !== data.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Đơn xin đi muộn hoặc về sớm chỉ áp dụng trong một ngày làm việc duy nhất',
          path: ['endDate'],
        });
      }

      if (!data.expectedTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            data.requestType === 'LATE_REQUEST'
              ? 'Thời gian dự kiến đến cơ quan là bắt buộc'
              : 'Thời gian dự kiến rời cơ quan là bắt buộc',
          path: ['expectedTime'],
        });
      }
    }
  });

export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>;

// ── Schema: Manager / HR / Admin xét duyệt đơn ────────────────────────────────
export const ProcessLeaveRequestSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    approvalNotes: z.preprocess(
      emptyToUndefined,
      z.string().max(2000, 'Ghi chú phê duyệt không được quá 2000 ký tự').optional()
    ),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'REJECTED' && (!data.approvalNotes || data.approvalNotes.trim().length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Lý do từ chối phải có ít nhất 5 ký tự',
        path: ['approvalNotes'],
      });
    }
  });

export type ProcessLeaveRequestInput = z.infer<typeof ProcessLeaveRequestSchema>;

// ── Schema: Nhân viên hủy đơn đang chờ duyệt ─────────────────────────────────
export const CancelLeaveRequestSchema = z.object({
  reason: z.preprocess(
    emptyToUndefined,
    z.string().max(500, 'Lý do hủy không được quá 500 ký tự').optional()
  ),
});

export type CancelLeaveRequestInput = z.infer<typeof CancelLeaveRequestSchema>;

// ── Schema: Bộ lọc truy vấn danh sách đơn ────────────────────────────────────
export const LeaveQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: LeaveStatusEnum.or(z.literal('ALL')).default('ALL'),
  requestType: LeaveRequestTypeEnum.or(z.literal('ALL')).default('ALL'),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type LeaveQueryParams = z.infer<typeof LeaveQuerySchema>;
