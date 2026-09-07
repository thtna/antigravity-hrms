import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { Prisma } from '@prisma/client';
import {
  CreateBonusInput,
  UpdateBonusInput,
  ProcessBonusInput,
  BonusQueryParams,
} from '@/lib/validations/bonus';

export class BonusService {
  // ── Access Verification Helpers ────────────────────────────────────────────

  private static async checkManagerOrHrAccess(
    targetEmployeeId: string,
    session: UserSession,
    allowSelf = false
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để thực hiện thao tác.');
    }

    const isAdmin = session.roles.includes('admin');
    const isHr = session.roles.includes('hr');
    if (isAdmin || isHr) return;

    const isManager = session.roles.includes('manager');
    if (!isManager) {
      throw ApiError.forbidden('Bạn không có quyền quản lý hoặc xét duyệt khoản thưởng.');
    }

    // Manager cannot self-approve / self-process
    if (!allowSelf && session.employeeId && session.employeeId === targetEmployeeId) {
      throw ApiError.forbidden('Quản lý không được tự duyệt hoặc xử lý khoản thưởng của chính mình.');
    }

    // Verify target employee belongs to a managed department
    const targetEmployee = await prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      select: { departmentId: true },
    });

    if (!targetEmployee) {
      throw ApiError.notFound('Không tìm thấy thông tin nhân viên.');
    }

    const manager = await prisma.employee.findUnique({
      where: { id: session.employeeId },
      include: { managedDepartments: { select: { id: true } } },
    });

    const managedDeptIds = manager?.managedDepartments.map((d) => d.id) || [];
    if (!managedDeptIds.includes(targetEmployee.departmentId)) {
      throw ApiError.forbidden(
        'Bạn chỉ có quyền thao tác với nhân viên thuộc phòng ban bạn trực tiếp quản lý.'
      );
    }
  }

  // ── 1. Create Bonus ────────────────────────────────────────────────────────

  static async createBonus(input: CreateBonusInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    // Check permissions: Manager can propose for managed dept; HR/Admin for anyone
    await this.checkManagerOrHrAccess(input.employeeId, session, true);

    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      include: { department: true },
    });

    if (!employee || employee.deletedAt || employee.status !== 'ACTIVE' || (session.organizationId && employee.organizationId !== session.organizationId)) {
      throw ApiError.notFound('Nhân viên không tồn tại hoặc đã nghỉ việc.');
    }

    const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();

    return prisma.$transaction(async (tx) => {
      const created = await tx.employeeBonusPenalty.create({
        data: {
          organizationId: session.organizationId ?? '__no_org__',
          employeeId: input.employeeId,
          type: 'BONUS',
          category: input.category,
          amount: new Prisma.Decimal(input.amount),
          period: input.period,
          effectiveDate,
          reason: input.reason,
          notes: input.notes,
          status: 'PENDING',
        },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      });

      // Financial Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_BONUS_PROPOSAL',
          entity: 'EmployeeBonusPenalty',
          entityId: created.id,
          newValues: {
            employeeId: input.employeeId,
            category: input.category,
            amount: input.amount,
            period: input.period,
            reason: input.reason,
            status: 'PENDING',
          },
        },
      });

      logger.info(
        `[BonusService] Bonus proposed for ${employee.employeeCode}: ${input.amount} VND (${input.category}) by ${session.email}`
      );

      return created;
    });
  }

  // ── 2. Edit Trước Approval (Edit Before Approval) ───────────────────────────

  static async updateBonus(id: string, input: UpdateBonusInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const existing = await prisma.employeeBonusPenalty.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!existing || (session?.organizationId && existing.organizationId && existing.organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy hồ sơ khen thưởng.');
    }

    // Strict Financial Integrity: Lock edits if not PENDING
    if (existing.status !== 'PENDING') {
      throw ApiError.badRequest(
        `Khoản thưởng này đã được xử lý (${existing.status}), không thể chỉnh sửa để đảm bảo tính toàn vẹn tài chính.`
      );
    }

    await this.checkManagerOrHrAccess(existing.employeeId, session, true);

    return prisma.$transaction(async (tx) => {
      const data: Prisma.EmployeeBonusPenaltyUpdateInput = {};
      if (input.category) data.category = input.category;
      if (input.amount !== undefined) data.amount = new Prisma.Decimal(input.amount);
      if (input.period) data.period = input.period;
      if (input.effectiveDate) data.effectiveDate = new Date(input.effectiveDate);
      if (input.reason) data.reason = input.reason;
      if (input.notes !== undefined) data.notes = input.notes;

      const updated = await tx.employeeBonusPenalty.update({
        where: { id },
        data,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      });

      // Immutable Financial Audit Log tracking old & new values
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_BONUS_BEFORE_APPROVAL',
          entity: 'EmployeeBonusPenalty',
          entityId: id,
          oldValues: {
            amount: Number(existing.amount),
            category: existing.category,
            reason: existing.reason,
          },
          newValues: {
            amount: input.amount ?? Number(existing.amount),
            category: input.category ?? existing.category,
            reason: input.reason ?? existing.reason,
          },
        },
      });

      logger.info(`[BonusService] Bonus ${id} updated before approval by ${session.email}`);
      return updated;
    });
  }

  // ── 3. Process (Approve / Reject) ──────────────────────────────────────────

  static async processBonus(id: string, input: ProcessBonusInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const existing = await prisma.employeeBonusPenalty.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!existing || (session?.organizationId && existing.organizationId && existing.organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy khoản thưởng.');
    }

    if (existing.status !== 'PENDING') {
      throw ApiError.badRequest(
        `Khoản thưởng này đã ở trạng thái ${existing.status}, không thể xử lý lại.`
      );
    }

    // Access check: blocks manager from approving their own bonus!
    await this.checkManagerOrHrAccess(existing.employeeId, session, false);

    return prisma.$transaction(async (tx) => {
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
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          approver: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      });

      // Financial Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: input.decision === 'APPROVED' ? 'APPROVE_BONUS' : 'REJECT_BONUS',
          entity: 'EmployeeBonusPenalty',
          entityId: id,
          oldValues: { status: 'PENDING' },
          newValues: {
            status: input.decision,
            approvedBy: session.employeeId,
            approvalNotes: input.approvalNotes,
            amount: Number(existing.amount),
          },
        },
      });

      logger.info(
        `[BonusService] Bonus ${id} ${input.decision} by ${session.email} (Amount: ${existing.amount} VND)`
      );

      return processed;
    });
  }

  // ── 4. Query & History ─────────────────────────────────────────────────────

  static async listBonuses(query: BonusQueryParams, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeBonusPenaltyWhereInput = {
      type: 'BONUS',
      // PHASE 5: Tenant isolation via employee relation
      employee: { organizationId: session.organizationId ?? '__no_org__' },
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
        ...((where.employee as any) || {}),
        departmentId: query.departmentId,
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
        orderBy: [{ createdAt: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
              department: { select: { id: true, name: true } },
            },
          },
          approver: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getBonusById(id: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const bonus = await prisma.employeeBonusPenalty.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department: { select: { id: true, name: true } },
          },
        },
        approver: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    });

    if (!bonus) {
      throw ApiError.notFound('Không tìm thấy thông tin khoản thưởng.');
    }

    // PHASE 5: Tenant isolation
    if (session?.organizationId) {
      const empOrg = await prisma.employee.findUnique({
        where: { id: bonus.employeeId },
        select: { organizationId: true },
      });
      if (!empOrg || empOrg.organizationId !== session.organizationId) {
        throw ApiError.notFound('Không tìm thấy thông tin khoản thưởng.');
      }
    }

    // RBAC check
    const isOwner = session.employeeId === bonus.employeeId;
    const isPrivileged =
      session.roles.includes('hr') || session.roles.includes('admin') || session.roles.includes('manager');

    if (!isOwner && !isPrivileged) {
      throw ApiError.forbidden('Bạn không có quyền xem khoản thưởng này.');
    }

    return bonus;
  }

  // ── 5. Financial Audit Trail ───────────────────────────────────────────────

  static async getBonusAuditTrail(id: string, session: UserSession) {
    // Check permission to view bonus
    await this.getBonusById(id, session);

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

  // ── 6. Summary & Metrics ───────────────────────────────────────────────────

  static async getBonusDashboardSummary(session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    const baseWhere: Prisma.EmployeeBonusPenaltyWhereInput = {
      type: 'BONUS',
      period: currentPeriod,
      organizationId: session.organizationId ?? '__no_org__',
      employee: { organizationId: session.organizationId ?? '__no_org__' },
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

    const [pendingCount, approvedCount, approvedRecords] = await Promise.all([
      prisma.employeeBonusPenalty.count({
        where: { ...baseWhere, status: 'PENDING' },
      }),
      prisma.employeeBonusPenalty.count({
        where: { ...baseWhere, status: 'APPROVED' },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: { ...baseWhere, status: 'APPROVED' },
        select: { category: true, amount: true },
      }),
    ]);

    let totalApprovedAmount = 0;
    const categoryTotals: Record<string, number> = {
      KPI: 0,
      OVERTIME: 0,
      PROJECT: 0,
      TIME: 0,
      OTHER: 0,
    };

    for (const record of approvedRecords) {
      const amt = Number(record.amount);
      totalApprovedAmount += amt;
      if (categoryTotals[record.category] !== undefined) {
        categoryTotals[record.category] += amt;
      } else {
        categoryTotals[record.category] = amt;
      }
    }

    return {
      period: currentPeriod,
      totalApprovedAmount,
      pendingCount,
      approvedCount,
      categoryTotals,
    };
  }
}
