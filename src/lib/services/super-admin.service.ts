import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { isSuperAdmin } from '@/lib/auth/roles';

export const MAX_TENANTS = 5;

export type TenantAction = 'APPROVE' | 'REJECT' | 'SUSPEND' | 'ACTIVATE' | 'CLOSE';

export interface TenantMetrics {
  totalTenants: number;
  pending: number;
  active: number;
  suspended: number;
  rejected: number;
  closed: number;
  maxTenants: number;
  activeQuotaDisplay: string;
  canActivateMore: boolean;
}

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  taxCode: string | null;
  address: string | null;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'CLOSED';
  employeesCount: number;
  branchesCount: number;
  owner: {
    name: string;
    email: string;
    phone: string | null;
  };
}

export class SuperAdminService {
  /**
   * Helper to assert that caller is a SUPER_ADMIN
   */
  private static ensureSuperAdmin(session: UserSession) {
    if (!isSuperAdmin(session)) {
      throw ApiError.forbidden('Chỉ SUPER_ADMIN mới có quyền truy cập chức năng này.');
    }
  }

  /**
   * Aggregate high-level SaaS tenant metrics and quota usage (X / 5)
   */
  static async getTenantMetrics(session: UserSession): Promise<TenantMetrics> {
    this.ensureSuperAdmin(session);

    const [totalTenants, pending, active, suspended, rejected, closed] = await Promise.all([
      prisma.organization.count({ where: { deletedAt: null } }),
      prisma.organization.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.organization.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.organization.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      prisma.organization.count({ where: { status: 'REJECTED', deletedAt: null } }),
      prisma.organization.count({ where: { status: 'CLOSED', deletedAt: null } }),
    ]);

    return {
      totalTenants,
      pending,
      active,
      suspended,
      rejected,
      closed,
      maxTenants: MAX_TENANTS,
      activeQuotaDisplay: `${active} / ${MAX_TENANTS}`,
      canActivateMore: active < MAX_TENANTS,
    };
  }

  /**
   * List all tenants across the platform with owner information, employee count, branch count
   */
  static async listTenants(
    session: UserSession,
    filter?: { status?: string; search?: string }
  ): Promise<{ items: TenantListItem[]; metrics: TenantMetrics }> {
    this.ensureSuperAdmin(session);

    const where: any = { deletedAt: null };

    if (filter?.status && filter.status !== 'ALL') {
      where.status = filter.status;
    }

    if (filter?.search) {
      const q = filter.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [orgs, metrics] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              employees: true,
              branches: true,
            },
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  employee: {
                    select: {
                      firstName: true,
                      lastName: true,
                      phoneNumber: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.getTenantMetrics(session),
    ]);

    const items: TenantListItem[] = orgs.map((org) => {
      // Find Owner (prefer OWNER role, fallback to ADMIN, fallback to first member)
      const ownerMember =
        org.members.find((m) => m.role === 'OWNER') ||
        org.members.find((m) => m.role === 'ADMIN') ||
        org.members[0];

      let ownerName = 'Chưa có thông tin';
      let ownerEmail = org.email || 'N/A';
      let ownerPhone = org.phone || null;

      if (ownerMember?.user) {
        ownerEmail = ownerMember.user.email;
        if (ownerMember.user.employee) {
          const emp = ownerMember.user.employee;
          ownerName = `${emp.lastName} ${emp.firstName}`.trim();
          if (emp.phoneNumber) ownerPhone = emp.phoneNumber;
        } else {
          ownerName = ownerMember.user.email.split('@')[0];
        }
      }

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        email: org.email,
        phone: org.phone,
        taxCode: org.taxCode,
        address: org.address,
        createdAt: org.createdAt.toISOString(),
        approvedAt: org.approvedAt ? org.approvedAt.toISOString() : null,
        approvedBy: org.approvedBy,
        status: org.status as TenantListItem['status'],
        employeesCount: org._count?.employees || 0,
        branchesCount: org._count?.branches || 0,
        owner: {
          name: ownerName,
          email: ownerEmail,
          phone: ownerPhone,
        },
      };
    });

    return { items, metrics };
  }

  /**
   * Retrieve tenant detailed record
   */
  static async getTenantById(id: string, session: UserSession) {
    this.ensureSuperAdmin(session);

    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: true,
            branches: true,
            departments: true,
            worksites: true,
          },
        },
        branches: {
          select: { id: true, name: true, code: true, isActive: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                isActive: true,
                employee: {
                  select: { firstName: true, lastName: true, phoneNumber: true },
                },
              },
            },
          },
        },
      },
    });

    if (!org || org.deletedAt) {
      throw ApiError.notFound(`Không tìm thấy tổ chức có ID: ${id}`);
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { organizationId: id, entity: 'organization' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        actor: { select: { email: true } },
      },
    });

    return {
      organization: {
        ...org,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        approvedAt: org.approvedAt?.toISOString() || null,
      },
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        actorEmail: log.actor?.email || 'Hệ thống',
        oldValues: log.oldValues,
        newValues: log.newValues,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Process lifecycle actions on a tenant:
   * APPROVE, REJECT, SUSPEND, ACTIVATE, CLOSE
   * Strict quota enforcement: Cannot activate a 6th tenant if activeCount >= MAX_TENANTS (5).
   * Every action records an immutable AuditLog.
   */
  static async processTenantAction(
    id: string,
    action: TenantAction,
    session: UserSession,
    options?: {
      reason?: string;
      clientInfo?: { ipAddress?: string; userAgent?: string };
    }
  ) {
    this.ensureSuperAdmin(session);

    const org = await prisma.organization.findUnique({
      where: { id },
    });

    if (!org || org.deletedAt) {
      throw ApiError.notFound(`Không tìm thấy tổ chức có ID: ${id}`);
    }

    const previousStatus = org.status;
    let nextStatus: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'CLOSED';
    let approvedAtDate: Date | null = null;
    let approvedByUser: string | null = null;

    switch (action) {
      case 'APPROVE': {
        if (previousStatus !== 'PENDING') {
          throw ApiError.badRequest(
            `Chỉ có thể phê duyệt tổ chức đang ở trạng thái PENDING. Trạng thái hiện tại: ${previousStatus}.`
          );
        }

        // Quota check: MAX_TENANTS = 5. Do not activate 6th tenant!
        const activeCount = await prisma.organization.count({
          where: { status: 'ACTIVE', deletedAt: null },
        });

        if (activeCount >= MAX_TENANTS) {
          throw ApiError.badRequest(
            `Không thể kích hoạt tenant thứ ${activeCount + 1}. Hệ thống đã đạt giới hạn tối đa ${MAX_TENANTS} tenants hoạt động (MAX_TENANTS = ${MAX_TENANTS}, hiện có ${activeCount}/${MAX_TENANTS}). Vui lòng nâng cấp gói hoặc tạm ngưng tenant khác.`
          );
        }

        nextStatus = 'ACTIVE';
        approvedAtDate = new Date();
        approvedByUser = session.userId;
        break;
      }

      case 'REJECT': {
        if (previousStatus !== 'PENDING') {
          throw ApiError.badRequest(
            `Chỉ có thể từ chối tổ chức đang ở trạng thái PENDING. Trạng thái hiện tại: ${previousStatus}.`
          );
        }
        nextStatus = 'REJECTED';
        break;
      }

      case 'SUSPEND': {
        if (previousStatus !== 'ACTIVE') {
          throw ApiError.badRequest(
            `Chỉ có thể tạm đình chỉ tổ chức đang hoạt động (ACTIVE). Trạng thái hiện tại: ${previousStatus}.`
          );
        }
        nextStatus = 'SUSPENDED';
        break;
      }

      case 'ACTIVATE': {
        if (previousStatus === 'ACTIVE') {
          throw ApiError.badRequest('Tổ chức này đã ở trạng thái ACTIVE.');
        }

        // Quota check: MAX_TENANTS = 5. Do not activate 6th tenant!
        const activeCount = await prisma.organization.count({
          where: { status: 'ACTIVE', deletedAt: null },
        });

        if (activeCount >= MAX_TENANTS) {
          throw ApiError.badRequest(
            `Không thể kích hoạt tenant thứ ${activeCount + 1}. Hệ thống đã đạt giới hạn tối đa ${MAX_TENANTS} tenants hoạt động (MAX_TENANTS = ${MAX_TENANTS}, hiện có ${activeCount}/${MAX_TENANTS}). Vui lòng nâng cấp gói hoặc tạm ngưng tenant khác.`
          );
        }

        nextStatus = 'ACTIVE';
        if (!org.approvedAt) {
          approvedAtDate = new Date();
          approvedByUser = session.userId;
        }
        break;
      }

      case 'CLOSE': {
        if (previousStatus === 'CLOSED') {
          throw ApiError.badRequest('Tổ chức này đã ở trạng thái CLOSED.');
        }
        nextStatus = 'CLOSED';
        break;
      }

      default:
        throw ApiError.badRequest(`Hành động không hợp lệ: ${action}`);
    }

    // Atomic transaction: Update Organization + Create Audit Log
    const result = await prisma.$transaction(async (tx) => {
      const updatedOrg = await tx.organization.update({
        where: { id },
        data: {
          status: nextStatus,
          ...(approvedAtDate ? { approvedAt: approvedAtDate } : {}),
          ...(approvedByUser ? { approvedBy: approvedByUser } : {}),
        },
      });

      // Audit Log for every action
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          actorId: session.userId,
          action: `TENANT_${action}`,
          entity: 'organization',
          entityId: org.id,
          oldValues: {
            status: previousStatus,
          },
          newValues: {
            status: nextStatus,
            action,
            reason: options?.reason || null,
          },
          ipAddress: options?.clientInfo?.ipAddress || null,
          userAgent: options?.clientInfo?.userAgent || null,
        },
      });

      return updatedOrg;
    });

    logger.info(
      `[SuperAdminService] Tenant ${org.name} (${org.slug}) status transitioned: ${previousStatus} -> ${nextStatus} by ${session.email}`
    );

    const newMetrics = await this.getTenantMetrics(session);

    return {
      organization: {
        ...result,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        approvedAt: result.approvedAt?.toISOString() || null,
      },
      metrics: newMetrics,
      message: `Thực hiện ${action} thành công cho tổ chức ${org.name}. Trạng thái hiện tại: ${nextStatus}.`,
    };
  }
}
