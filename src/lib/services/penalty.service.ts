import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { Prisma } from '@prisma/client';
import {
  CreatePenaltyInput,
  UpdatePenaltyInput,
  ProcessPenaltyInput,
  PenaltyQueryParams,
} from '@/lib/validations/penalty';

export class PenaltyService {
  // ── 1. Create Penalty Record ────────────────────────────────────────────────
  static async createPenalty(input: CreatePenaltyInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để lập biên bản xử phạt.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    // Rule: Regular employee cannot create penalty
    if (!isHrOrAdmin && !isManager) {
      throw ApiError.forbidden('Chỉ Quản lý, HR hoặc Quản trị viên mới có quyền lập biên bản xử phạt.');
    }

    // Constraint: Không cho employee/bất kỳ ai tự tạo penalty cho chính mình
    if (session.employeeId && session.employeeId === input.employeeId) {
      throw ApiError.badRequest('Không được phép tự tạo quyết định xử phạt cho chính mình.');
    }

    // Target employee check
    const targetEmployee = await prisma.employee.findUnique({
      where: { id: input.employeeId, deletedAt: null },
      include: { department: true },
    });

    if (!targetEmployee) {
      throw ApiError.notFound('Không tìm thấy nhân viên được chỉ định hoặc đã bị vô hiệu hóa.');
    }

    // Manager scoping: Manager can only penalize employees in their managed departments
    if (!isHrOrAdmin && isManager) {
      if (!session.employeeId) {
        throw ApiError.forbidden('Tài khoản quản lý chưa được liên kết với hồ sơ nhân viên.');
      }

      const manager = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { managedDepartments: { select: { id: true } } },
      });

      const managedDeptIds = manager?.managedDepartments.map((d) => d.id) || [];
      if (!managedDeptIds.includes(targetEmployee.departmentId)) {
        throw ApiError.forbidden(
          'Bạn chỉ có quyền lập biên bản xử phạt cho nhân viên thuộc phòng ban mình quản lý.'
        );
      }
    }

    return await prisma.$transaction(async (tx) => {
      const created = await tx.employeeBonusPenalty.create({
        data: {
          employeeId: input.employeeId,
          type: 'PENALTY',
          category: input.category,
          amount: new Prisma.Decimal(input.amount),
          effectiveDate: new Date(input.effectiveDate),
          period: input.period,
          reason: input.reason,
          notes: input.notes || null,
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
        },
      });

      // Immutable Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_PENALTY_RECORD',
          entity: 'EmployeeBonusPenalty',
          entityId: created.id,
          newValues: {
            employeeId: created.employeeId,
            category: created.category,
            amount: Number(created.amount),
            period: created.period,
            reason: created.reason,
            status: created.status,
          },
        },
      });

      logger.info(
        `[PenaltyService] Penalty ${created.id} created for ${targetEmployee.employeeCode} by ${session.email} (Amount: ${input.amount} VND)`
      );

      return created;
    });
  }

  // ── 2. Update Penalty Before Approval (Financial Lock) ──────────────────────
  static async updatePenalty(id: string, input: UpdatePenaltyInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isManager) {
      throw ApiError.forbidden('Bạn không có quyền chỉnh sửa biên bản xử phạt.');
    }

    const existing = await prisma.employeeBonusPenalty.findUnique({
      where: { id, type: 'PENALTY' },
      include: {
        employee: { select: { id: true, departmentId: true } },
      },
    });

    if (!existing) {
      throw ApiError.notFound('Không tìm thấy biên bản xử phạt.');
    }

    // Constraint: Không sửa penalty đã approved hoặc rejected (Financial Lock)
    if (existing.status !== 'PENDING') {
      throw ApiError.badRequest(
        `Biên bản xử phạt đã ở trạng thái ${existing.status}, không thể chỉnh sửa.`
      );
    }

    // Manager scoping check
    if (!isHrOrAdmin && isManager) {
      const manager = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { managedDepartments: { select: { id: true } } },
      });

      const managedDeptIds = manager?.managedDepartments.map((d) => d.id) || [];
      if (!managedDeptIds.includes(existing.employee.departmentId)) {
        throw ApiError.forbidden(
          'Bạn chỉ có thể chỉnh sửa biên bản xử phạt của nhân viên thuộc phòng ban mình quản lý.'
        );
      }
    }

    const oldValues = {
      category: existing.category,
      amount: Number(existing.amount),
      period: existing.period,
      reason: existing.reason,
      notes: existing.notes,
      effectiveDate: existing.effectiveDate.toISOString().split('T')[0],
    };

    return await prisma.$transaction(async (tx) => {
      const data: Prisma.EmployeeBonusPenaltyUpdateInput = {};
      if (input.category) data.category = input.category;
      if (input.amount !== undefined) data.amount = new Prisma.Decimal(input.amount);
      if (input.effectiveDate) data.effectiveDate = new Date(input.effectiveDate);
      if (input.period) data.period = input.period;
      if (input.reason) data.reason = input.reason;
      if (input.notes !== undefined) data.notes = input.notes || null;

      const updated = await tx.employeeBonusPenalty.update({
        where: { id },
        data,
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
        },
      });

      // Immutable Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_PENALTY_BEFORE_APPROVAL',
          entity: 'EmployeeBonusPenalty',
          entityId: id,
          oldValues,
          newValues: {
            category: updated.category,
            amount: Number(updated.amount),
            period: updated.period,
            reason: updated.reason,
            notes: updated.notes,
            effectiveDate: updated.effectiveDate.toISOString().split('T')[0],
          },
        },
      });

      logger.info(`[PenaltyService] Penalty ${id} updated by ${session.email}`);

      return updated;
    });
  }

  // ── 3. Process Penalty (Approve / Reject) ───────────────────────────────────
  static async processPenalty(id: string, input: ProcessPenaltyInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để phê duyệt xử phạt.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isManager) {
      throw ApiError.forbidden('Chỉ Quản lý, HR hoặc Admin mới có quyền phê duyệt/từ chối xử phạt.');
    }

    const existing = await prisma.employeeBonusPenalty.findUnique({
      where: { id, type: 'PENALTY' },
      include: {
        employee: { select: { id: true, departmentId: true } },
      },
    });

    if (!existing) {
      throw ApiError.notFound('Không tìm thấy biên bản xử phạt.');
    }

    if (existing.status !== 'PENDING') {
      throw ApiError.badRequest(`Biên bản xử phạt này đã ở trạng thái ${existing.status}.`);
    }

    // Self-Approval Block: Cannot approve/reject penalties applied to oneself
    if (session.employeeId && session.employeeId === existing.employeeId) {
      throw ApiError.forbidden(
        'Không được phép tự phê duyệt/từ chối biên bản xử phạt của chính mình.'
      );
    }

    // Manager scoping check
    if (!isHrOrAdmin && isManager) {
      const manager = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { managedDepartments: { select: { id: true } } },
      });

      const managedDeptIds = manager?.managedDepartments.map((d) => d.id) || [];
      if (!managedDeptIds.includes(existing.employee.departmentId)) {
        throw ApiError.forbidden(
          'Bạn chỉ có quyền phê duyệt xử phạt cho nhân viên thuộc phòng ban mình quản lý.'
        );
      }
    }

    return await prisma.$transaction(async (tx) => {
      const processed = await tx.employeeBonusPenalty.update({
        where: { id },
        data: {
          status: input.decision,
          approvedBy: session.employeeId || null,
          approvedAt: new Date(),
          approvalNotes: input.approvalNotes || null,
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
        },
      });

      // Immutable Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: input.decision === 'APPROVED' ? 'APPROVE_PENALTY' : 'REJECT_PENALTY',
          entity: 'EmployeeBonusPenalty',
          entityId: id,
          oldValues: { status: existing.status },
          newValues: {
            status: input.decision,
            approvedBy: session.employeeId,
            approvalNotes: input.approvalNotes || null,
            amount: Number(existing.amount),
          },
        },
      });

      logger.info(
        `[PenaltyService] Penalty ${id} ${input.decision} by ${session.email} (Amount: ${existing.amount} VND)`
      );

      return processed;
    });
  }

  // ── 4. Query & History ─────────────────────────────────────────────────────
  static async listPenalties(query: PenaltyQueryParams, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeBonusPenaltyWhereInput = {
      type: 'PENALTY',
    };

    // RBAC Scoping
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && isManager && session.employeeId) {
      const manager = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { managedDepartments: { select: { id: true } } },
      });
      const deptIds = manager?.managedDepartments.map((d) => d.id) || [];
      where.OR = [
        { employeeId: session.employeeId },
        { employee: { departmentId: { in: deptIds } } },
      ];
    } else if (!isHrOrAdmin && !isManager) {
      where.employeeId = session.employeeId;
    }

    // Apply filters
    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    if (query.departmentId) {
      where.employee = {
        is: {
          departmentId: query.departmentId,
        },
      };
    }

    if (query.period) {
      where.period = query.period;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    const [total, items] = await Promise.all([
      prisma.employeeBonusPenalty.count({ where }),
      prisma.employeeBonusPenalty.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true, code: true } },
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
        },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── 5. Penalty Details ─────────────────────────────────────────────────────
  static async getPenaltyById(id: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const penalty = await prisma.employeeBonusPenalty.findUnique({
      where: { id, type: 'PENALTY' },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            departmentId: true,
            department: { select: { id: true, name: true, code: true } },
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
      },
    });

    if (!penalty) {
      throw ApiError.notFound('Không tìm thấy biên bản xử phạt.');
    }

    // RBAC check
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isManager && penalty.employeeId !== session.employeeId) {
      throw ApiError.forbidden('Bạn không có quyền xem biên bản xử phạt này.');
    }

    if (!isHrOrAdmin && isManager && penalty.employeeId !== session.employeeId) {
      const manager = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { managedDepartments: { select: { id: true } } },
      });
      const deptIds = manager?.managedDepartments.map((d) => d.id) || [];
      if (!deptIds.includes(penalty.employee.departmentId)) {
        throw ApiError.forbidden('Bạn không có quyền xem biên bản xử phạt ngoài phòng ban quản lý.');
      }
    }

    return penalty;
  }

  // ── 6. Financial Audit Trail ───────────────────────────────────────────────
  static async getPenaltyAuditTrail(id: string, session: UserSession) {
    // Check permission to view penalty
    await this.getPenaltyById(id, session);

    const logs = await prisma.auditLog.findMany({
      where: {
        entity: 'EmployeeBonusPenalty',
        entityId: id,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return logs;
  }

  // ── 7. Summary & Metrics ───────────────────────────────────────────────────
  static async getPenaltyDashboardSummary(session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    const baseWhere: Prisma.EmployeeBonusPenaltyWhereInput = {
      type: 'PENALTY',
      period: currentPeriod,
    };

    if (!isHrOrAdmin && isManager && session.employeeId) {
      const manager = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { managedDepartments: { select: { id: true } } },
      });
      const deptIds = manager?.managedDepartments.map((d) => d.id) || [];
      baseWhere.OR = [
        { employeeId: session.employeeId },
        { employee: { departmentId: { in: deptIds } } },
      ];
    } else if (!isHrOrAdmin && !isManager) {
      baseWhere.employeeId = session.employeeId;
    }

    const [
      pendingCount,
      approvedPenalties,
      latePenalties,
      unauthorizedLeavePenalties,
      kpiMissPenalties,
      otherPenalties,
    ] = await Promise.all([
      prisma.employeeBonusPenalty.count({
        where: { ...baseWhere, status: 'PENDING' },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: { ...baseWhere, status: 'APPROVED' },
        select: { amount: true },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: { ...baseWhere, category: 'LATE', status: 'APPROVED' },
        select: { amount: true },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: { ...baseWhere, category: 'UNAUTHORIZED_LEAVE', status: 'APPROVED' },
        select: { amount: true },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: { ...baseWhere, category: 'KPI_MISS', status: 'APPROVED' },
        select: { amount: true },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: { ...baseWhere, category: 'OTHER', status: 'APPROVED' },
        select: { amount: true },
      }),
    ]);

    const sumAmount = (list: { amount: Prisma.Decimal }[]) =>
      list.reduce((acc, curr) => acc + Number(curr.amount), 0);

    return {
      period: currentPeriod,
      pendingCount,
      totalApprovedAmount: sumAmount(approvedPenalties),
      categories: {
        late: sumAmount(latePenalties),
        unauthorizedLeave: sumAmount(unauthorizedLeavePenalties),
        kpiMiss: sumAmount(kpiMissPenalties),
        other: sumAmount(otherPenalties),
      },
    };
  }
}
