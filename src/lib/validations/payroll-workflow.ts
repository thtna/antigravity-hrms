import { z } from 'zod';

export const PayrollWorkflowStatusEnum = z.enum([
  'DRAFT',
  'CALCULATED',
  'REVIEW',
  'APPROVED',
  'PAID',
]);

export const TransitionWorkflowSchema = z.object({
  periodId: z.string().uuid('Mã kỳ lương không hợp lệ'),
  targetStatus: PayrollWorkflowStatusEnum,
  action: z.enum([
    'SUBMIT_REVIEW',
    'APPROVE',
    'REJECT_TO_CALCULATED',
    'CONFIRM_PAID',
  ]),
  comments: z.string().max(1000, 'Ghi chú tối đa 1000 ký tự').optional(),
});

export const AdjustmentTypeEnum = z.enum([
  'SALARY_RETROACTIVE',
  'OT_CORRECTION',
  'BONUS_ADJUSTMENT',
  'PENALTY_REFUND',
  'DEDUCTION_CORRECTION',
  'OTHER',
]);

export const CreateAdjustmentSchema = z.object({
  periodId: z.string().uuid('Mã kỳ lương không hợp lệ'),
  payrollId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid('Mã nhân viên không hợp lệ'),
  adjustmentType: AdjustmentTypeEnum,
  direction: z.enum(['ADDITION', 'DEDUCTION']).default('ADDITION'),
  amount: z.coerce.number().positive('Số tiền điều chỉnh phải lớn hơn 0'),
  reason: z.string().min(5, 'Lý do điều chỉnh phải có ít nhất 5 ký tự').max(1000),
});

export const ProcessAdjustmentSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  approvalNotes: z.string().max(1000).optional(),
});

export type TransitionWorkflowInput = z.infer<typeof TransitionWorkflowSchema>;
export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;
export type ProcessAdjustmentInput = z.infer<typeof ProcessAdjustmentSchema>;
