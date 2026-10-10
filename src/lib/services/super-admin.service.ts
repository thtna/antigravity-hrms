import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { assertPlatformSession, requireLivePlatformAuthority } from '@/lib/auth/platform-authority';
import { Prisma } from '@prisma/client';
import { MAX_REGISTERED_TENANTS } from '@/lib/constants/tenant-quota';

export type TenantAction = 'APPROVE' | 'REJECT' | 'SUSPEND' | 'ACTIVATE' | 'CLOSE';

export interface TenantMetrics {
  totalTenants: number;
  pending: number;
  active: number;
  suspended: number;
  rejected: number;
  closed: number;
  maxTenants: number;
  registeredQuotaDisplay: string;
  canRegisterMore: boolean;
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
   * Aggregate high-level SaaS tenant metrics and quota usage (X / 5)
   */
  static async getTenantMetrics(session: UserSession): Promise<TenantMetrics> {
    await requireLivePlatformAuthority(session);
    return this.readTenantMetrics(prisma);
  }

  private static async readTenantMetrics(db: Pick<Prisma.TransactionClient, 'organization'>): Promise<TenantMetrics> {
    const [totalTenants, pending, active, suspended, rejected, closed] = await Promise.all([
      db.organization.count({ where: { deletedAt: null } }),
      db.organization.count({ where: { status: 'PENDING', deletedAt: null } }),
      db.organization.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      db.organization.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      db.organization.count({ where: { status: 'REJECTED', deletedAt: null } }),
      db.organization.count({ where: { status: 'CLOSED', deletedAt: null } }),
    ]);

    return {
      totalTenants,
      pending,
      active,
      suspended,
      rejected,
      closed,
      maxTenants: MAX_REGISTERED_TENANTS,
      registeredQuotaDisplay: `${totalTenants} / ${MAX_REGISTERED_TENANTS}`,
      canRegisterMore: totalTenants < MAX_REGISTERED_TENANTS,
    };
  }

  /**
   * List all tenants across the platform with owner information, employee count, branch count
   */
  static async listTenants(
    session: UserSession,
    filter?: { status?: string; search?: string }
  ): Promise<{ items: TenantListItem[]; metrics: TenantMetrics }> {
    await requireLivePlatformAuthority(session);

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
      this.readTenantMetrics(prisma),
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
    await requireLivePlatformAuthority(session);

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
   * Existing tenants already consume registration slots; status changes do not allocate slots.
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
    assertPlatformSession(session);
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Match the tenant writer lock order: organization, actor, roles, grants.
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "organizations" WHERE "id" = ${id} FOR UPDATE
        `);
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "users" WHERE "id" = ${session.userId} FOR UPDATE
        `);
        await tx.$queryRaw(Prisma.sql`
          SELECT "id" FROM "roles"
          WHERE "id" IN (SELECT "role_id" FROM "user_roles" WHERE "user_id" = ${session.userId})
          ORDER BY "id" FOR UPDATE
        `);
        await tx.$queryRaw(Prisma.sql`
          SELECT "user_id", "role_id" FROM "user_roles"
          WHERE "user_id" = ${session.userId} ORDER BY "user_id", "role_id" FOR UPDATE
        `);
        await requireLivePlatformAuthority(session, tx);

        const org = await tx.organization.findUnique({
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

        const updatedOrg = await tx.organization.update({
          where: { id, status: previousStatus, updatedAt: org.updatedAt, deletedAt: null },
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

        // Complete reads and serialization before commit; no fallible DB work after it.
        const metrics = await this.readTenantMetrics(tx);
        return {
          organization: {
            ...updatedOrg,
            createdAt: updatedOrg.createdAt.toISOString(),
            updatedAt: updatedOrg.updatedAt.toISOString(),
            approvedAt: updatedOrg.approvedAt?.toISOString() || null,
          },
          metrics,
          message: `Thực hiện ${action} thành công cho tổ chức ${org.name}. Trạng thái hiện tại: ${nextStatus}.`,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2025' || error.code === 'P2034' ||
            (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) {
        throw ApiError.conflict('Tenant or authority state changed concurrently. Please reload before retrying.');
      }
      throw error;
    }

    logger.info(
      `[SuperAdminService] Tenant ${result.organization.name} (${result.organization.slug}) transitioned via ${action} by ${session.email}`
    );

    return result;
  }
}
