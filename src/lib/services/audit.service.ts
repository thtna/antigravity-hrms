import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { Prisma } from '@prisma/client';

export const AUDIT_ACTIONS = {
  SALARY_MODIFICATION: 'SALARY_MODIFICATION',
  ATTENDANCE_CORRECTION: 'ATTENDANCE_CORRECTION',
  BONUS_APPROVAL: 'BONUS_APPROVAL',
  PENALTY_APPROVAL: 'PENALTY_APPROVAL',
  PAYROLL_CALCULATION: 'PAYROLL_CALCULATION',
  PAYROLL_APPROVAL: 'PAYROLL_APPROVAL',
  PAYROLL_PAYMENT: 'PAYROLL_PAYMENT',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
} as const;

export type AuditActionType =
  | (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]
  | string;

export interface LogAuditParams {
  actorId?: string | null;
  action: AuditActionType;
  entity: string;
  entityId: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  tx?: Prisma.TransactionClient;
}

export interface AuditLogQueryParams {
  action?: string;
  entity?: string;
  actorId?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class AuditService {
  /**
   * Universal method to record an immutable audit log entry.
   * Can be executed inside an existing Prisma transaction client (tx) or standalone.
   */
  static async logEvent(params: LogAuditParams) {
    const client = params.tx || prisma;

    try {
      const record = await client.auditLog.create({
        data: {
          actorId: params.actorId ?? null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          oldValues: (params.oldValues as Prisma.InputJsonValue) ?? undefined,
          newValues: (params.newValues as Prisma.InputJsonValue) ?? undefined,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
        },
      });

      logger.info(`[AuditService] Action recorded: [${params.action}] on ${params.entity}:${params.entityId}`, {
        actorId: params.actorId,
        action: params.action,
      });

      return record;
    } catch (err) {
      logger.error(`[AuditService] Failed to record audit log for action [${params.action}]`, err);
      // We do not rethrow in non-transactional paths to avoid failing business ops if logging has an issue,
      // but if in transaction, let it bubble so the caller transaction aborts.
      if (params.tx) {
        throw err;
      }
      return null;
    }
  }

  // ── 1. SALARY MODIFICATION ──────────────────────────────────────────────────
  static async logSalaryModification(params: {
    employeeId: string;
    employeeCode: string;
    actorId?: string | null;
    oldValues: {
      contractSalary?: number;
      hourlyRate?: number;
      insuranceSalary?: number;
      contractType?: string;
    };
    newValues: {
      contractSalary?: number;
      hourlyRate?: number;
      insuranceSalary?: number;
      contractType?: string;
    };
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.SALARY_MODIFICATION,
      entity: 'employees',
      entityId: params.employeeId,
      oldValues: {
        employeeCode: params.employeeCode,
        ...params.oldValues,
      },
      newValues: {
        employeeCode: params.employeeCode,
        ...params.newValues,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── 2. ATTENDANCE CORRECTION ────────────────────────────────────────────────
  static async logAttendanceCorrection(params: {
    adjustmentId: string;
    employeeId: string;
    actorId?: string | null;
    oldValues: Record<string, any>;
    newValues: Record<string, any>;
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.ATTENDANCE_CORRECTION,
      entity: 'attendance_adjustment',
      entityId: params.adjustmentId,
      oldValues: params.oldValues,
      newValues: params.newValues,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── 3. BONUS APPROVAL ───────────────────────────────────────────────────────
  static async logBonusApproval(params: {
    bonusId: string;
    employeeId: string;
    actorId?: string | null;
    oldValues: Record<string, any>;
    newValues: Record<string, any>;
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.BONUS_APPROVAL,
      entity: 'EmployeeBonusPenalty',
      entityId: params.bonusId,
      oldValues: params.oldValues,
      newValues: params.newValues,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── 4. PENALTY APPROVAL ─────────────────────────────────────────────────────
  static async logPenaltyApproval(params: {
    penaltyId: string;
    employeeId: string;
    actorId?: string | null;
    oldValues: Record<string, any>;
    newValues: Record<string, any>;
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.PENALTY_APPROVAL,
      entity: 'EmployeeBonusPenalty',
      entityId: params.penaltyId,
      oldValues: params.oldValues,
      newValues: params.newValues,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── 5. PAYROLL CALCULATION ──────────────────────────────────────────────────
  static async logPayrollCalculation(params: {
    periodId: string;
    periodCode: string;
    actorId?: string | null;
    totalEmployees: number;
    totalGrossPayout: number;
    totalNetPayout: number;
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.PAYROLL_CALCULATION,
      entity: 'PayrollPeriod',
      entityId: params.periodId,
      newValues: {
        periodCode: params.periodCode,
        totalEmployees: params.totalEmployees,
        totalGrossPayout: params.totalGrossPayout,
        totalNetPayout: params.totalNetPayout,
        calculatedAt: new Date().toISOString(),
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── 6. PAYROLL APPROVAL ─────────────────────────────────────────────────────
  static async logPayrollApproval(params: {
    periodId: string;
    periodCode: string;
    stage: string;
    actorId?: string | null;
    comments?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.PAYROLL_APPROVAL,
      entity: 'PayrollPeriod',
      entityId: params.periodId,
      oldValues: { status: 'REVIEW' },
      newValues: {
        periodCode: params.periodCode,
        status: 'APPROVED',
        stage: params.stage,
        comments: params.comments ?? null,
        approvedAt: new Date().toISOString(),
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── 7. PAYROLL PAYMENT ──────────────────────────────────────────────────────
  static async logPayrollPayment(params: {
    periodId: string;
    periodCode: string;
    actorId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.PAYROLL_PAYMENT,
      entity: 'PayrollPeriod',
      entityId: params.periodId,
      oldValues: { status: 'APPROVED' },
      newValues: {
        periodCode: params.periodCode,
        status: 'PAID',
        paidAt: new Date().toISOString(),
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── 8. PERMISSION CHANGE ────────────────────────────────────────────────────
  static async logPermissionChange(params: {
    targetUserId: string;
    targetEmail?: string;
    actorId?: string | null;
    actionType: 'ASSIGN_ROLES' | 'UPDATE_PERMISSIONS' | 'REVOKE_ROLES';
    oldRoles?: string[];
    newRoles?: string[];
    oldPermissions?: string[];
    newPermissions?: string[];
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: Prisma.TransactionClient;
  }) {
    return this.logEvent({
      actorId: params.actorId,
      action: AUDIT_ACTIONS.PERMISSION_CHANGE,
      entity: 'users',
      entityId: params.targetUserId,
      oldValues: {
        targetEmail: params.targetEmail,
        roles: params.oldRoles ?? [],
        permissions: params.oldPermissions ?? [],
      },
      newValues: {
        actionType: params.actionType,
        targetEmail: params.targetEmail,
        roles: params.newRoles ?? [],
        permissions: params.newPermissions ?? [],
        changedAt: new Date().toISOString(),
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      tx: params.tx,
    });
  }

  // ── AUDIT LOG QUERY & EXPLORATION ───────────────────────────────────────────
  static async getAuditLogs(query: AuditLogQueryParams, session: UserSession) {
    // Only Admin and HR can access audit logs (Chặn IDOR & Privilege Verification)
    const isAuthorized = session.roles.includes('admin') || session.roles.includes('hr');
    if (!isAuthorized) {
      throw ApiError.forbidden('Chỉ Quản trị viên và Nhân sự mới có quyền truy cập nhật ký kiểm toán hệ thống.');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (query.action) {
      const normalized = query.action.toUpperCase().trim();
      const ACTION_ALIASES: Record<string, string[]> = {
        SALARY_MODIFICATION: ['SALARY_MODIFICATION', 'salary modification'],
        ATTENDANCE_CORRECTION: ['ATTENDANCE_CORRECTION', 'APPROVE_ATTENDANCE_CORRECTION', 'attendance correction'],
        BONUS_APPROVAL: ['BONUS_APPROVAL', 'APPROVE_BONUS', 'bonus approval'],
        PENALTY_APPROVAL: ['PENALTY_APPROVAL', 'APPROVE_PENALTY', 'penalty approval'],
        PAYROLL_CALCULATION: ['PAYROLL_CALCULATION', 'CALCULATE_PAYROLL', 'payroll calculation'],
        PAYROLL_APPROVAL: ['PAYROLL_APPROVAL', 'PAYROLL_WORKFLOW_APPROVE', 'payroll approval'],
        PAYROLL_PAYMENT: ['PAYROLL_PAYMENT', 'PAYROLL_WORKFLOW_CONFIRM_PAID', 'payroll payment'],
        PERMISSION_CHANGE: ['PERMISSION_CHANGE', 'permission change'],
      };

      if (ACTION_ALIASES[normalized]) {
        where.action = { in: ACTION_ALIASES[normalized] };
      } else {
        where.action = query.action;
      }
    }

    if (query.entity) {
      where.entity = query.entity;
    }

    if (query.actorId) {
      where.actorId = query.actorId;
    }

    if (query.entityId) {
      where.entityId = query.entityId;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (query.search) {
      where.OR = [
        { action: { contains: query.search, mode: 'insensitive' } },
        { entity: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeCode: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      oldValues: log.oldValues,
      newValues: log.newValues,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
      actor: log.actor
        ? {
            id: log.actor.id,
            email: log.actor.email,
            name: log.actor.employee
              ? `${log.actor.employee.lastName} ${log.actor.employee.firstName}`.trim()
              : log.actor.email.split('@')[0],
            employeeCode: log.actor.employee?.employeeCode,
          }
        : null,
    }));

    return {
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
