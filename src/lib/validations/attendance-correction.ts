import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoDatetimeRegex = /^\d{4}-\d{2}-\d{2}T/;

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

export const CorrectionTypeEnum = z.enum([
  'FORGOT_CHECKIN',    // nhân viên quên check-in
  'FORGOT_CHECKOUT',   // check-in rồi nhưng quên check-out
  'LATE_JUSTIFICATION', // biện hộ đi muộn
  'EARLY_LEAVE_JUSTIFICATION', // biện hộ về sớm
  'FULL_CORRECTION',   // điều chỉnh cả check-in và check-out
  'OVERTIME_REQUEST',  // yêu cầu công nhận tăng ca
  'MISSING_ATTENDANCE', // toàn bộ bản ghi thiếu (không có attendance record cho ngày đó)
]);

export type CorrectionType = z.infer<typeof CorrectionTypeEnum>;

export const CorrectionStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export type CorrectionStatus = z.infer<typeof CorrectionStatusEnum>;

// ── Schema: Employee tạo correction request ──────────────────────────────────
export const CreateCorrectionSchema = z
  .object({
    attendanceId: z.preprocess(
      emptyToUndefined,
      z.string().uuid('ID chấm công không hợp lệ').optional()
    ),
    workDate: z
      .string()
      .regex(dateRegex, 'Ngày làm việc phải có định dạng YYYY-MM-DD'),
    correctionType: CorrectionTypeEnum,
    requestedCheckIn: z.preprocess(
      emptyToUndefined,
      z.string().regex(isoDatetimeRegex, 'Thời gian check-in phải là ISO datetime').optional()
    ),
    requestedCheckOut: z.preprocess(
      emptyToUndefined,
      z.string().regex(isoDatetimeRegex, 'Thời gian check-out phải là ISO datetime').optional()
    ),
    overtimeMinutes: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(0).max(600).optional()
    ),
    reason: z.string().min(10, 'Lý do phải có ít nhất 10 ký tự').max(1000),
    evidenceUrl: z.preprocess(
      emptyToUndefined,
      z.string().url('URL bằng chứng không hợp lệ').optional()
    ),
  })
  .superRefine((data, ctx) => {
    const requiresCheckIn = [
      'FORGOT_CHECKIN',
      'FULL_CORRECTION',
      'MISSING_ATTENDANCE',
    ].includes(data.correctionType);

    const requiresCheckOut = [
      'FORGOT_CHECKOUT',
      'FULL_CORRECTION',
      'MISSING_ATTENDANCE',
    ].includes(data.correctionType);

    if (requiresCheckIn && !data.requestedCheckIn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Thời gian check-in đề xuất là bắt buộc cho loại yêu cầu này',
        path: ['requestedCheckIn'],
      });
    }

    if (requiresCheckOut && !data.requestedCheckOut) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Thời gian check-out đề xuất là bắt buộc cho loại yêu cầu này',
        path: ['requestedCheckOut'],
      });
    }

    if (data.correctionType === 'OVERTIME_REQUEST' && !data.overtimeMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Số phút tăng ca là bắt buộc cho yêu cầu tăng ca',
        path: ['overtimeMinutes'],
      });
    }

    // Validate check-in before check-out
    if (data.requestedCheckIn && data.requestedCheckOut) {
      const inDate = new Date(data.requestedCheckIn);
      const outDate = new Date(data.requestedCheckOut);
      if (outDate.getTime() <= inDate.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Thời gian check-out phải sau thời gian check-in',
          path: ['requestedCheckOut'],
        });
      }
    }
  });

export type CreateCorrectionInput = z.infer<typeof CreateCorrectionSchema>;

// ── Schema: Manager/HR/Admin xử lý request ───────────────────────────────────
export const ProcessCorrectionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  approvalNotes: z.preprocess(
    emptyToUndefined,
    z.string().min(5, 'Ghi chú phê duyệt phải có ít nhất 5 ký tự').max(2000).optional()
  ),
  overrideCheckIn: z.preprocess(
    emptyToUndefined,
    z.string().regex(isoDatetimeRegex).optional()
  ),
  overrideCheckOut: z.preprocess(
    emptyToUndefined,
    z.string().regex(isoDatetimeRegex).optional()
  ),
});

export type ProcessCorrectionInput = z.infer<typeof ProcessCorrectionSchema>;

// ── Schema: Cancel (employee cancels own pending request) ─────────────────────
export const CancelCorrectionSchema = z.object({
  reason: z.preprocess(emptyToUndefined, z.string().max(500).optional()),
});

export type CancelCorrectionInput = z.infer<typeof CancelCorrectionSchema>;

// ── Schema: Query params for listing corrections ──────────────────────────────
export const CorrectionQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  status: CorrectionStatusEnum.or(z.literal('ALL')).default('ALL'),
  correctionType: CorrectionTypeEnum.optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CorrectionQueryParams = z.infer<typeof CorrectionQuerySchema>;
