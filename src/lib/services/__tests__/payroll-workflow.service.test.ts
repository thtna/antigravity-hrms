import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  payrollPeriod: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  payroll: {
    updateMany: vi.fn(),
  },
  payrollApproval: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  payrollAdjustment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PayrollWorkflowService } from '../payroll-workflow.service';
import { UserSession } from '@/types';

const adminSession: UserSession = {
  userId: 'usr-admin',
  employeeId: 'emp-admin',
  roles: ['admin'],
  email: 'admin@antigravity.test',
  fullName: 'Admin User',
  permissions: [],
  isActive: true,
};

const managerSession: UserSession = {
  userId: 'usr-mgr',
  employeeId: 'emp-mgr',
  roles: ['manager'],
  email: 'manager@antigravity.test',
  fullName: 'Department Manager',
  permissions: [],
  isActive: true,
};

const hrSession: UserSession = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  roles: ['hr'],
  email: 'hr@antigravity.test',
  fullName: 'HR Specialist',
  permissions: [],
  isActive: true,
};

const employeeSession: UserSession = {
  userId: 'usr-emp',
  employeeId: 'emp-01',
  roles: ['employee'],
  email: 'emp@antigravity.test',
  fullName: 'Regular Employee',
  permissions: [],
  isActive: true,
};

describe('PHASE 16 — PAYROLL WORKFLOW & APPROVAL SERVICE TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Immutability Guard ──────────────────────────────────────────────────
  describe('1. assertPeriodIsMutable', () => {
    it('throws ApiError when period is APPROVED or PAID', () => {
      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable('APPROVED', 'PR-2026-09')
      ).toThrow(/nghiêm cấm chỉnh sửa trực tiếp/);

      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable('PAID', 'PR-2026-09')
      ).toThrow(/nghiêm cấm chỉnh sửa trực tiếp/);
    });

    it('passes cleanly when period is DRAFT or CALCULATED', () => {
      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable('DRAFT', 'PR-2026-09')
      ).not.toThrow();

      expect(() =>
        PayrollWorkflowService.assertPeriodIsMutable('CALCULATED', 'PR-2026-09')
      ).not.toThrow();
    });
  });

  // ── 2. State Machine Transitions ───────────────────────────────────────────
  describe('2. transitionPeriodState (State Machine & RBAC)', () => {
    it('CALCULATED -> REVIEW: allows HR/Admin to submit calculated period for review', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        status: 'CALCULATED',
        _count: { payrolls: 25 },
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          payrollPeriod: {
            update: vi.fn().mockResolvedValue({ id: 'period-01', status: 'REVIEW', code: 'PR-2026-09' }),
          },
          payroll: { updateMany: vi.fn() },
          payrollApproval: {
            create: vi.fn().mockResolvedValue({ id: 'appr-01', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        };
        return await cb(tx);
      });

      const res = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'period-01',
          targetStatus: 'REVIEW',
          action: 'SUBMIT_REVIEW',
          comments: 'Kính gửi Ban Giám đốc phê duyệt bảng lương tháng 9.',
        },
        hrSession
      );

      expect(res.status).toBe('REVIEW');
      expect(res.actionTaken).toBe('SUBMIT_REVIEW');
    });

    it('rejects SUBMIT_REVIEW if user is only regular employee', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        status: 'CALCULATED',
        _count: { payrolls: 10 },
      });

      await expect(
        PayrollWorkflowService.transitionPeriodState(
          {
            periodId: 'period-01',
            targetStatus: 'REVIEW',
            action: 'SUBMIT_REVIEW',
          },
          employeeSession
        )
      ).rejects.toThrow(/Chỉ Nhân sự \(HR\) hoặc Quản trị viên/);
    });

    it('REVIEW -> APPROVED: allows Manager or Admin to approve period', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        status: 'REVIEW',
        _count: { payrolls: 25 },
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          payrollPeriod: {
            update: vi.fn().mockResolvedValue({ id: 'period-01', status: 'APPROVED', code: 'PR-2026-09' }),
          },
          payroll: { updateMany: vi.fn() },
          payrollApproval: {
            create: vi.fn().mockResolvedValue({ id: 'appr-02', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        };
        return await cb(tx);
      });

      const res = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'period-01',
          targetStatus: 'APPROVED',
          action: 'APPROVE',
          comments: 'Đã thẩm định, số liệu chính xác. Phê duyệt chốt bảng lương.',
        },
        managerSession
      );

      expect(res.status).toBe('APPROVED');
    });

    it('REVIEW -> CALCULATED: allows rejecting review back to CALCULATED with reason', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        status: 'REVIEW',
        _count: { payrolls: 25 },
      });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          payrollPeriod: {
            update: vi.fn().mockResolvedValue({ id: 'period-01', status: 'CALCULATED', code: 'PR-2026-09' }),
          },
          payroll: { updateMany: vi.fn() },
          payrollApproval: {
            create: vi.fn().mockResolvedValue({ id: 'appr-03', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        };
        return await cb(tx);
      });

      const res = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'period-01',
          targetStatus: 'CALCULATED',
          action: 'REJECT_TO_CALCULATED',
          comments: 'Thiếu tính công ca đêm của xưởng 2, yêu cầu tính lại.',
        },
        managerSession
      );

      expect(res.status).toBe('CALCULATED');
    });

    it('APPROVED -> PAID: dispatches payment and marks all payslips as PAID', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        status: 'APPROVED',
        _count: { payrolls: 25 },
      });

      const mockPayrollUpdateMany = vi.fn().mockResolvedValue({ count: 25 });

      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const tx = {
          payrollPeriod: {
            update: vi.fn().mockResolvedValue({ id: 'period-01', status: 'PAID', code: 'PR-2026-09' }),
          },
          payroll: { updateMany: mockPayrollUpdateMany },
          payrollApproval: {
            create: vi.fn().mockResolvedValue({ id: 'appr-04', actionAt: new Date() }),
          },
          auditLog: { create: vi.fn() },
        };
        return await cb(tx);
      });

      const res = await PayrollWorkflowService.transitionPeriodState(
        {
          periodId: 'period-01',
          targetStatus: 'PAID',
          action: 'CONFIRM_PAID',
          comments: 'Đã hoàn tất lệnh chi lương qua ngân hàng Vietcombank.',
        },
        hrSession
      );

      expect(res.status).toBe('PAID');
      expect(mockPayrollUpdateMany).toHaveBeenCalledWith({
        where: { periodId: 'period-01' },
        data: { paymentStatus: 'PAID' },
      });
    });

    it('rejects illegal transition skipping (e.g. DRAFT -> PAID directly)', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        status: 'DRAFT',
        _count: { payrolls: 0 },
      });

      await expect(
        PayrollWorkflowService.transitionPeriodState(
          {
            periodId: 'period-01',
            targetStatus: 'PAID',
            action: 'CONFIRM_PAID',
          },
          adminSession
        )
      ).rejects.toThrow(/Bảng lương phải được APPROVED trước khi chi trả/);
    });
  });

  // ── 3. Adjustment / Revision Workflow ──────────────────────────────────────
  describe('3. Adjustment / Revision Workflow', () => {
    it('creates adjustment request on finalized payroll with audit log', async () => {
      mockPrisma.payrollPeriod.findUnique.mockResolvedValue({
        id: 'period-01',
        code: 'PR-2026-09',
        status: 'APPROVED',
      });
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce({ id: 'emp-01', userId: 'usr-emp' }) // target employee
        .mockResolvedValueOnce({ id: 'emp-hr' }); // requester employee

      mockPrisma.payrollAdjustment.create.mockResolvedValue({
        id: 'adj-01',
        employeeId: 'emp-01',
        amount: 1500000,
        status: 'PENDING',
        employee: { employeeCode: 'EMP-001' },
      });

      const adj = await PayrollWorkflowService.createAdjustmentRequest(
        {
          periodId: 'period-01',
          employeeId: 'emp-01',
          adjustmentType: 'OT_CORRECTION',
          direction: 'ADDITION',
          amount: 1500000,
          reason: 'Bổ sung 10 giờ làm thêm ngày 15/09 do máy chấm công hỏng',
        },
        hrSession
      );

      expect(adj.id).toBe('adj-01');
      expect(mockPrisma.payrollAdjustment.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('processes and approves adjustment request', async () => {
      mockPrisma.payrollAdjustment.findUnique.mockResolvedValue({
        id: 'adj-01',
        status: 'PENDING',
        amount: 1500000,
      });
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 'emp-admin' });
      mockPrisma.payrollAdjustment.update.mockResolvedValue({
        id: 'adj-01',
        status: 'APPROVED',
        approverId: 'emp-admin',
      });

      const res = await PayrollWorkflowService.processAdjustmentRequest(
        'adj-01',
        {
          decision: 'APPROVE',
          approvalNotes: 'Đã đối soát camera xưởng, đồng ý phê duyệt truy lĩnh.',
        },
        adminSession
      );

      expect(res.status).toBe('APPROVED');
      expect(mockPrisma.payrollAdjustment.update).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('rejects processing if adjustment is already approved or rejected', async () => {
      mockPrisma.payrollAdjustment.findUnique.mockResolvedValue({
        id: 'adj-01',
        status: 'APPROVED',
      });

      await expect(
        PayrollWorkflowService.processAdjustmentRequest(
          'adj-01',
          { decision: 'REJECT' },
          hrSession
        )
      ).rejects.toThrow(/không thể xử lý lại/);
    });
  });

  // ── 4. History Queries ─────────────────────────────────────────────────────
  describe('4. getApprovalHistory & listAdjustments', () => {
    it('returns approval history ordered by date', async () => {
      mockPrisma.payrollApproval.findMany.mockResolvedValue([
        { id: 'appr-01', stage: 'REVIEW_TO_APPROVED', decision: 'APPROVE' },
        { id: 'appr-00', stage: 'CALCULATED_TO_REVIEW', decision: 'SUBMIT_REVIEW' },
      ]);

      const history = await PayrollWorkflowService.getApprovalHistory('period-01', hrSession);
      expect(history.length).toBe(2);
      expect(mockPrisma.payrollApproval.findMany).toHaveBeenCalledWith({
        where: { periodId: 'period-01' },
        orderBy: { actionAt: 'desc' },
        include: expect.any(Object),
      });
    });
  });
});
