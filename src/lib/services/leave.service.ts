import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  CreateLeaveRequestInput,
  ProcessLeaveRequestInput,
  CancelLeaveRequestInput,
  LeaveQueryParams,
} from '@/lib/validations/leave';
import { Prisma } from '@prisma/client';

export class LeaveService {
  /**
   * Resolve employee ID for the session.
   */
  private static async resolveEmployeeId(session: UserSession, targetEmployeeId?: string): Promise<string> {
    const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');

    if (targetEmployeeId) {
      if (!isPrivileged) {
        throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền tạo đơn cho nhân viên khác.');
      }
      const target = await prisma.employee.findUnique({
        where: { id: targetEmployeeId },
        select: { id: true, status: true, deletedAt: true, organizationId: true },
      });
      if (!target || target.deletedAt || target.status === 'TERMINATED' || (session.organizationId && target.organizationId !== session.organizationId)) {
        throw ApiError.badRequest('Nhân viên không tồn tại hoặc đã nghỉ việc.');
      }
      return target.id;
    }

    if (session.employeeId) {
      return session.employeeId;
    }

    const self = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!self || self.deletedAt || self.status === 'TERMINATED') {
      throw ApiError.badRequest('Không tìm thấy thông tin nhân viên hợp lệ hoặc tài khoản đã nghỉ việc.');
    }

    return self.id;
  }

  /**
   * Employee creates a Leave / Late / Early Leave request.
   * Guarantees:
   * 1. Prevents overlapping leaves
   * 2. Prevents invalid dates
   * 3. Full audit logging
   */
  static async createLeaveRequest(
    input: CreateLeaveRequestInput,
    session: UserSession,
    targetEmployeeId?: string,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    const employeeId = await this.resolveEmployeeId(session, targetEmployeeId);

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // Date validation
    if (endDate.getTime() < startDate.getTime()) {
      throw ApiError.badRequest('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
    }

    // Disallow requests too far in the past (> 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    if (startDate.getTime() < thirtyDaysAgo.getTime()) {
      throw ApiError.badRequest('Không thể tạo đơn xin nghỉ phép/ngoại lệ quá 30 ngày trong quá khứ.');
    }

    // ── Prevent overlapping leaves ──────────────────────────────────────────
    if (input.requestType === 'LEAVE') {
      const overlapping = await prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          requestType: 'LEAVE',
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
      });

      if (overlapping) {
        const startStr = overlapping.startDate.toISOString().split('T')[0];
        const endStr = overlapping.endDate.toISOString().split('T')[0];
        throw ApiError.conflict(
          `Nhân viên đã có đơn xin nghỉ phép trong khoảng thời gian này (từ ${startStr} đến ${endStr}, trạng thái: ${overlapping.status}).`
        );
      }
    } else {
      // For LATE_REQUEST or EARLY_LEAVE: prevent duplicate request of same type on same date
      const existingSameType = await prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          requestType: input.requestType,
          startDate,
          status: { in: ['PENDING', 'APPROVED'] },
        },
      });

      if (existingSameType) {
        throw ApiError.conflict(
          `Đã có đơn ${input.requestType === 'LATE_REQUEST' ? 'xin đi muộn' : 'xin về sớm'} cho ngày ${input.startDate} đang chờ duyệt hoặc đã được phê duyệt.`
        );
      }
    }

    // Verify leaveTypeId if provided
    if (input.leaveTypeId) {
      const leaveType = await prisma.leaveType.findUnique({
        where: { id: input.leaveTypeId },
      });
      if (!leaveType) {
        throw ApiError.badRequest(`Không tìm thấy loại nghỉ phép có ID: ${input.leaveTypeId}`);
      }
    }

    // Atomic transaction: Create LeaveRequest + AuditLog
    const createdRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          organizationId: session.organizationId ?? '__no_org__',
          employeeId,
          leaveTypeId: input.leaveTypeId ?? null,
          requestType: input.requestType,
          startDate,
          endDate,
          expectedTime: input.expectedTime ?? null,
          durationDays: new Prisma.Decimal(input.durationDays || 1.0),
          reason: input.reason.trim(),
          status: 'PENDING',
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
          leaveType: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_LEAVE_REQUEST',
          entity: 'leave_request',
          entityId: created.id,
          newValues: {
            requestType: created.requestType,
            startDate: input.startDate,
            endDate: input.endDate,
            expectedTime: input.expectedTime ?? null,
            durationDays: input.durationDays,
            reason: input.reason,
            status: 'PENDING',
          },
          ipAddress: clientInfo?.ipAddress ?? null,
          userAgent: clientInfo?.userAgent ?? null,
        },
      });

      return created;
    });

    logger.info(
      `[LeaveService] Created ${input.requestType} request ${createdRequest.id} for employee ${employeeId}`
    );

    return {
      ...createdRequest,
      startDate: createdRequest.startDate.toISOString().split('T')[0],
      endDate: createdRequest.endDate.toISOString().split('T')[0],
      durationDays: Number(createdRequest.durationDays),
    };
  }

  /**
   * Manager / HR / Admin processes a Leave / Late / Early Leave request.
   * Enforces:
   * 1. Regular employees cannot approve (HTTP 403)
   * 2. Managers can only approve employees in their department (HTTP 403)
   * 3. Managers cannot approve their own requests (HTTP 403)
   * 4. Only PENDING requests can be processed
   */
  static async processLeaveRequest(
    id: string,
    input: ProcessLeaveRequestInput,
    session: UserSession,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isManager) {
      throw ApiError.forbidden('Chỉ Quản lý, Nhân sự hoặc Quản trị viên mới có quyền phê duyệt/từ chối đơn.');
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
        leaveType: true,
      },
    });

    if (!leaveRequest || (session?.organizationId && (leaveRequest as any).organizationId && (leaveRequest as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy đơn yêu cầu có ID: ${id}`);
    }

    if (leaveRequest.status !== 'PENDING') {
      throw ApiError.badRequest(
        `Đơn này đã được xử lý trước đó với trạng thái: ${leaveRequest.status}. Không thể xử lý lại.`
      );
    }

    // Manager department & self-approval check
    if (isManager && !isHrOrAdmin) {
      const managerEmp = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: {
          id: true,
          managedDepartments: { select: { id: true } },
        },
      });

      if (!managerEmp) {
        throw ApiError.forbidden('Tài khoản quản lý không gắn liền với hồ sơ nhân viên.');
      }

      // Cannot self-approve
      if (managerEmp.id === leaveRequest.employeeId) {
        throw ApiError.forbidden('Quản lý không thể tự phê duyệt đơn xin nghỉ phép/ngoại lệ của chính mình.');
      }

      const managedDeptIds = managerEmp.managedDepartments.map((d) => d.id);
      if (!managedDeptIds.includes(leaveRequest.employee.departmentId)) {
        throw ApiError.forbidden('Bạn không quản lý phòng ban của nhân viên gửi đơn này.');
      }
    }

    // Resolve approver employee ID
    let approverEmployeeId = session.employeeId;
    if (!approverEmployeeId) {
      const approverEmp = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      approverEmployeeId = approverEmp?.id;
    }

    const approvedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: input.decision,
          approverId: approverEmployeeId ?? null,
          approvalNotes: input.approvalNotes ?? null,
          approvedAt,
        },
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
          approver: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          leaveType: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: input.decision === 'APPROVED' ? 'APPROVE_LEAVE_REQUEST' : 'REJECT_LEAVE_REQUEST',
          entity: 'leave_request',
          entityId: id,
          oldValues: { status: 'PENDING' },
          newValues: {
            status: input.decision,
            approvalNotes: input.approvalNotes ?? null,
            approverId: approverEmployeeId ?? null,
            approvedAt: approvedAt.toISOString(),
          },
          ipAddress: clientInfo?.ipAddress ?? null,
          userAgent: clientInfo?.userAgent ?? null,
        },
      });

      return updated;
    });

    logger.info(
      `[LeaveService] Processed request ${id} by user ${session.userId} with decision ${input.decision}`
    );

    return {
      ...result,
      startDate: result.startDate.toISOString().split('T')[0],
      endDate: result.endDate.toISOString().split('T')[0],
      durationDays: Number(result.durationDays),
    };
  }

  /**
   * Employee cancels their own PENDING request.
   */
  static async cancelLeaveRequest(
    id: string,
    input: CancelLeaveRequestInput,
    session: UserSession,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!leaveRequest || (session?.organizationId && (leaveRequest as any).organizationId && (leaveRequest as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy đơn yêu cầu có ID: ${id}`);
    }

    if (leaveRequest.status !== 'PENDING') {
      throw ApiError.badRequest('Chỉ có thể hủy đơn đang ở trạng thái chờ duyệt (PENDING).');
    }

    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    if (!isHrOrAdmin) {
      const selfEmployeeId = await this.resolveEmployeeId(session);
      if (leaveRequest.employeeId !== selfEmployeeId) {
        throw ApiError.forbidden('Bạn chỉ có thể hủy đơn của chính mình.');
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          approvalNotes: input.reason ? `Nhân viên hủy: ${input.reason}` : 'Nhân viên hủy đơn',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CANCEL_LEAVE_REQUEST',
          entity: 'leave_request',
          entityId: id,
          oldValues: { status: 'PENDING' },
          newValues: { status: 'CANCELLED', reason: input.reason ?? null },
          ipAddress: clientInfo?.ipAddress ?? null,
          userAgent: clientInfo?.userAgent ?? null,
        },
      });

      return updated;
    });

    logger.info(`[LeaveService] Request ${id} cancelled by user ${session.userId}`);

    return {
      ...result,
      startDate: result.startDate.toISOString().split('T')[0],
      endDate: result.endDate.toISOString().split('T')[0],
      durationDays: Number(result.durationDays),
    };
  }

  /**
   * List Leave requests with RBAC scoping and status/type/date filtering.
   */
  static async listLeaveRequests(query: LeaveQueryParams, session: UserSession) {
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    const where: Prisma.LeaveRequestWhereInput = {
      // PHASE 5: Tenant isolation via employee relation
      employee: { is: { organizationId: session.organizationId ?? '__no_org__' } },
    };

    // RBAC scoping
    if (!isHrOrAdmin) {
      if (isManager) {
        const managerEmp = await prisma.employee.findUnique({
          where: { userId: session.userId },
          select: {
            id: true,
            managedDepartments: { select: { id: true } },
          },
        });

        const managedDeptIds = managerEmp?.managedDepartments.map((d) => d.id) || [];

        where.OR = [
          { employeeId: managerEmp?.id },
          { employee: { is: { departmentId: { in: managedDeptIds } } } },
        ];
      } else {
        const selfEmp = await prisma.employee.findUnique({
          where: { userId: session.userId },
          select: { id: true },
        });
        where.employeeId = selfEmp?.id || 'none';
      }
    }

    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.departmentId) {
      where.employee = {
        is: {
          ...where.employee?.is,
          departmentId: query.departmentId,
        },
      };
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.requestType && query.requestType !== 'ALL') {
      where.requestType = query.requestType;
    }

    if (query.startDate || query.endDate) {
      if (query.startDate && query.endDate) {
        where.startDate = { lte: new Date(query.endDate) };
        where.endDate = { gte: new Date(query.startDate) };
      } else if (query.startDate) {
        where.endDate = { gte: new Date(query.startDate) };
      } else if (query.endDate) {
        where.startDate = { lte: new Date(query.endDate) };
      }
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              department: { select: { id: true, name: true } },
              position: { select: { id: true, title: true } },
            },
          },
          approver: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          leaveType: true,
        },
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        startDate: item.startDate.toISOString().split('T')[0],
        endDate: item.endDate.toISOString().split('T')[0],
        durationDays: Number(item.durationDays),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single leave request by ID.
   */
  static async getLeaveRequestById(id: string, session: UserSession) {
    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
          },
        },
        approver: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        leaveType: true,
      },
    });

    if (!request) {
      throw ApiError.notFound(`Không tìm thấy đơn yêu cầu có ID: ${id}`);
    }

    // PHASE 5: Tenant isolation — check employee belongs to org
    if (session?.organizationId) {
      const empOrg = await prisma.employee.findUnique({
        where: { id: request.employeeId },
        select: { organizationId: true },
      });
      if (!empOrg || empOrg.organizationId !== session.organizationId) {
        throw ApiError.notFound(`Không tìm thấy đơn yêu cầu có ID: ${id}`);
      }
    }

    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin) {
      const selfEmp = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true, managedDepartments: { select: { id: true } } },
      });

      const isOwn = selfEmp?.id === request.employeeId;
      const isManagerOfDept =
        isManager && selfEmp?.managedDepartments.some((d) => d.id === request.employee.departmentId);

      if (!isOwn && !isManagerOfDept) {
        throw ApiError.forbidden('Bạn không có quyền xem đơn này.');
      }
    }

    return {
      ...request,
      startDate: request.startDate.toISOString().split('T')[0],
      endDate: request.endDate.toISOString().split('T')[0],
      durationDays: Number(request.durationDays),
    };
  }

  /**
   * Get Dashboard pending requests statistics & top pending items.
   */
  static async getDashboardSummary(session: UserSession) {
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    const baseWhere: Prisma.LeaveRequestWhereInput = {
      // PHASE 5: Tenant isolation
      employee: { is: { organizationId: session.organizationId ?? '__no_org__' } },
    };

    if (!isHrOrAdmin) {
      if (isManager) {
        const managerEmp = await prisma.employee.findUnique({
          where: { userId: session.userId },
          select: { id: true, managedDepartments: { select: { id: true } } },
        });
        const managedDeptIds = managerEmp?.managedDepartments.map((d) => d.id) || [];
        baseWhere.OR = [
          { employeeId: managerEmp?.id },
          { employee: { is: { departmentId: { in: managedDeptIds } } } },
        ];
      } else {
        const selfEmp = await prisma.employee.findUnique({
          where: { userId: session.userId },
          select: { id: true },
        });
        baseWhere.employeeId = selfEmp?.id || 'none';
      }
    }

    const pendingWhere: Prisma.LeaveRequestWhereInput = {
      ...baseWhere,
      status: 'PENDING',
    };

    const [totalPending, pendingLeaves, pendingLate, pendingEarly, recentPending] =
      await Promise.all([
        prisma.leaveRequest.count({ where: pendingWhere }),
        prisma.leaveRequest.count({ where: { ...pendingWhere, requestType: 'LEAVE' } }),
        prisma.leaveRequest.count({ where: { ...pendingWhere, requestType: 'LATE_REQUEST' } }),
        prisma.leaveRequest.count({ where: { ...pendingWhere, requestType: 'EARLY_LEAVE' } }),
        prisma.leaveRequest.findMany({
          where: pendingWhere,
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
              },
            },
            leaveType: true,
          },
        }),
      ]);

    return {
      totalPending,
      pendingLeaves,
      pendingLate,
      pendingEarly,
      recentPending: recentPending.map((r) => ({
        ...r,
        startDate: r.startDate.toISOString().split('T')[0],
        endDate: r.endDate.toISOString().split('T')[0],
        durationDays: Number(r.durationDays),
      })),
    };
  }
}
