import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  TransitionWorkflowInput,
  CreateAdjustmentInput,
  ProcessAdjustmentInput,
} from '@/lib/validations/payroll-workflow';

export class PayrollWorkflowService {
  // ── 1. Immutability Guard ──────────────────────────────────────────────────
  /**
   * Asserts that a period is mutable.
   * Throws ApiError if the period is APPROVED or PAID.
   */
  static assertPeriodIsMutable(periodStatus: string, periodCode: string) {
    if (periodStatus === 'APPROVED' || periodStatus === 'PAID') {
      throw ApiError.badRequest(
        `Kỳ tính lương "${periodCode}" đang ở trạng thái "${periodStatus}". Bảng lương đã khóa, nghiêm cấm chỉnh sửa trực tiếp. Vui lòng tạo đề xuất điều chỉnh (Adjustment/Revision).`
      );
    }
  }

  // ── 2. Transition Workflow State Machine ───────────────────────────────────
  static async transitionPeriodState(input: TransitionWorkflowInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const { periodId, targetStatus, action, comments } = input;
    const userRoles = session.roles || [];

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        _count: { select: { payrolls: true } },
      },
    });

    if (!period) {
      throw ApiError.notFound('Không tìm thấy kỳ tính lương.');
    }

    const currentStatus = period.status;

    // ── State Machine Validation & RBAC Guard ──
    switch (action) {
      case 'SUBMIT_REVIEW': {
        // CALCULATED -> REVIEW
        if (currentStatus !== 'CALCULATED') {
          throw ApiError.badRequest(
            `Không thể trình duyệt kỳ lương từ trạng thái "${currentStatus}". Trạng thái yêu cầu: CALCULATED.`
          );
        }
        if (period._count.payrolls === 0) {
          throw ApiError.badRequest('Kỳ tính lương chưa có bảng tính nhân sự nào, không thể trình duyệt.');
        }
        const isHrOrAdmin = userRoles.includes('hr') || userRoles.includes('admin');
        if (!isHrOrAdmin) {
          throw ApiError.forbidden('Chỉ Nhân sự (HR) hoặc Quản trị viên mới có quyền trình duyệt bảng lương.');
        }
        if (targetStatus !== 'REVIEW') {
          throw ApiError.badRequest('Trạng thái đích không hợp lệ cho hành động SUBMIT_REVIEW (yêu cầu REVIEW).');
        }
        break;
      }

      case 'APPROVE': {
        // REVIEW -> APPROVED
        if (currentStatus !== 'REVIEW') {
          throw ApiError.badRequest(
            `Không thể phê duyệt kỳ lương từ trạng thái "${currentStatus}". Trạng thái yêu cầu: REVIEW.`
          );
        }
        const isApproverRole = userRoles.includes('admin') || userRoles.includes('manager');
        if (!isApproverRole) {
          throw ApiError.forbidden(
            'Chỉ Quản trị viên hoặc Quản lý cấp cao mới có thẩm quyền phê duyệt chốt bảng lương.'
          );
        }
        if (targetStatus !== 'APPROVED') {
          throw ApiError.badRequest('Trạng thái đích không hợp lệ cho hành động APPROVE (yêu cầu APPROVED).');
        }
        break;
      }

      case 'REJECT_TO_CALCULATED': {
        // REVIEW -> CALCULATED
        if (currentStatus !== 'REVIEW') {
          throw ApiError.badRequest(
            `Không thể trả về kỳ lương từ trạng thái "${currentStatus}". Trạng thái yêu cầu: REVIEW.`
          );
        }
        const canReject =
          userRoles.includes('admin') || userRoles.includes('manager') || userRoles.includes('hr');
        if (!canReject) {
          throw ApiError.forbidden('Bạn không có quyền yêu cầu rà soát hoặc tính lại bảng lương.');
        }
        if (targetStatus !== 'CALCULATED') {
          throw ApiError.badRequest(
            'Trạng thái đích không hợp lệ cho hành động REJECT_TO_CALCULATED (yêu cầu CALCULATED).'
          );
        }
        break;
      }

      case 'CONFIRM_PAID': {
        // APPROVED -> PAID
        if (currentStatus !== 'APPROVED') {
          throw ApiError.badRequest(
            `Không thể xác nhận chi trả từ trạng thái "${currentStatus}". Bảng lương phải được APPROVED trước khi chi trả.`
          );
        }
        const canDisburse = userRoles.includes('admin') || userRoles.includes('hr');
        if (!canDisburse) {
          throw ApiError.forbidden('Chỉ Ban Quản trị hoặc Bộ phận Tài chính/HR mới có quyền xác nhận chi trả lương.');
        }
        if (targetStatus !== 'PAID') {
          throw ApiError.badRequest('Trạng thái đích không hợp lệ cho hành động CONFIRM_PAID (yêu cầu PAID).');
        }
        break;
      }

      default:
        throw ApiError.badRequest(`Hành động quy trình không xác định: ${action}`);
    }

    // ── Execute Transition in ACID Transaction ──
    const result = await prisma.$transaction(async (tx) => {
      // 1. Update PayrollPeriod status
      const updatedPeriod = await tx.payrollPeriod.update({
        where: { id: period.id },
        data: {
          status: targetStatus,
          closedAt: targetStatus === 'PAID' ? new Date() : undefined,
        },
      });

      // 2. If transitioning to PAID, mark all payslips as PAID
      if (targetStatus === 'PAID') {
        await tx.payroll.updateMany({
          where: { periodId: period.id },
          data: { paymentStatus: 'PAID' },
        });
      }

      // 3. Write Approval History
      const approval = await tx.payrollApproval.create({
        data: {
          periodId: period.id,
          stage: `${currentStatus}_TO_${targetStatus}`,
          reviewerId: session.employeeId || null,
          actorEmail: session.email,
          decision: action,
          comments: comments || null,
        },
      });

      // 4. Record Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: `PAYROLL_WORKFLOW_${action}`,
          entity: 'PayrollPeriod',
          entityId: period.id,
          oldValues: { status: currentStatus },
          newValues: {
            status: targetStatus,
            action,
            comments: comments || null,
            actorEmail: session.email,
          },
        },
      });

      return { updatedPeriod, approval };
    });

    logger.info(
      `[PayrollWorkflowService] Period ${period.code} transitioned from ${currentStatus} to ${targetStatus} by ${session.email} (Action: ${action})`
    );

    return {
      periodId: result.updatedPeriod.id,
      code: result.updatedPeriod.code,
      previousStatus: currentStatus,
      status: result.updatedPeriod.status,
      actionTaken: action,
      approvalId: result.approval.id,
      actionAt: result.approval.actionAt,
    };
  }

  // ── 3. Adjustment / Revision Workflow ──────────────────────────────────────
  static async createAdjustmentRequest(input: CreateAdjustmentInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: input.periodId },
    });
    if (!period) {
      throw ApiError.notFound('Không tìm thấy kỳ tính lương.');
    }

    // Verify target employee exists
    const emp = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, userId: true },
    });
    if (!emp) {
      throw ApiError.notFound('Không tìm thấy nhân viên được yêu cầu điều chỉnh.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isSelf = emp.userId === session.userId;

    if (!isHrOrAdmin && !isSelf) {
      throw ApiError.forbidden('Bạn chỉ có thể tạo yêu cầu điều chỉnh lương cho chính mình.');
    }

    // Resolve requester employee id
    const requesterEmployee = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (!requesterEmployee) {
      throw ApiError.badRequest('Tài khoản của bạn không gắn với thông tin nhân sự hợp lệ.');
    }

    const adjustment = await prisma.payrollAdjustment.create({
      data: {
        periodId: input.periodId,
        payrollId: input.payrollId || null,
        employeeId: input.employeeId,
        requesterId: requesterEmployee.id,
        adjustmentType: input.adjustmentType,
        direction: input.direction,
        amount: input.amount,
        reason: input.reason,
        status: 'PENDING',
      },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
        requester: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'CREATE_PAYROLL_ADJUSTMENT',
        entity: 'PayrollAdjustment',
        entityId: adjustment.id,
        newValues: {
          periodId: input.periodId,
          employeeId: input.employeeId,
          amount: input.amount,
          direction: input.direction,
          reason: input.reason,
        },
      },
    });

    logger.info(
      `[PayrollWorkflowService] Created adjustment ${adjustment.id} for employee ${adjustment.employee.employeeCode} by ${session.email}`
    );

    return adjustment;
  }

  static async processAdjustmentRequest(
    adjustmentId: string,
    input: ProcessAdjustmentInput,
    session: UserSession
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      throw ApiError.forbidden('Chỉ Nhân sự (HR) hoặc Quản trị viên mới có quyền phê duyệt điều chỉnh bảng lương.');
    }

    const adjustment = await prisma.payrollAdjustment.findUnique({
      where: { id: adjustmentId },
      include: { period: true },
    });

    if (!adjustment) {
      throw ApiError.notFound('Không tìm thấy yêu cầu điều chỉnh lương.');
    }

    if (adjustment.status !== 'PENDING') {
      throw ApiError.badRequest(`Yêu cầu điều chỉnh đã ở trạng thái "${adjustment.status}", không thể xử lý lại.`);
    }

    const approverEmployee = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });

    const newStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const updated = await prisma.payrollAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: newStatus,
        approverId: approverEmployee?.id || null,
        approvalNotes: input.approvalNotes || null,
        approvedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: `PROCESS_PAYROLL_ADJUSTMENT_${input.decision}`,
        entity: 'PayrollAdjustment',
        entityId: adjustmentId,
        oldValues: { status: 'PENDING' },
        newValues: {
          status: newStatus,
          decision: input.decision,
          approvalNotes: input.approvalNotes,
          actor: session.email,
        },
      },
    });

    logger.info(
      `[PayrollWorkflowService] Adjustment ${adjustmentId} ${newStatus} by ${session.email}`
    );

    return updated;
  }

  // ── 4. Query Approval History & Adjustments ────────────────────────────────
  static async getApprovalHistory(periodId: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    return await prisma.payrollApproval.findMany({
      where: { periodId },
      orderBy: { actionAt: 'desc' },
      include: {
        reviewer: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            position: { select: { title: true } },
          },
        },
      },
    });
  }

  static async listAdjustments(periodId: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    return await prisma.payrollAdjustment.findMany({
      where: { periodId },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
        requester: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
        approver: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
    });
  }
}
