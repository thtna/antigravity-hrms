import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { Prisma } from '@prisma/client';
import {
  CreateWorksiteInput,
  UpdateWorksiteInput,
  WorksiteQueryParams,
} from '@/lib/validations/worksite';

export class WorksiteService {
  /**
   * Ensure the calling user has HR or Admin privileges.
   */
  private static ensurePrivileged(session: UserSession, adminOnly = false) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để thực hiện thao tác.');
    }
    const isAdmin = session.roles.includes('admin');
    const isHr = session.roles.includes('hr');
    if (adminOnly && !isAdmin) {
      throw ApiError.forbidden('Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này.');
    }
    if (!isAdmin && !isHr) {
      throw ApiError.forbidden('Bạn không có quyền quản lý địa điểm làm việc (Yêu cầu quyền Admin hoặc HR).');
    }
  }

  /**
   * Retrieve list of worksites with search, status filtering, and assigned employee counts.
   */
  static async getWorksites(query: WorksiteQueryParams, session?: UserSession) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const where: Prisma.WorksiteWhereInput = {
      // PHASE 5: Tenant isolation
      ...(session ? { organizationId: session.organizationId ?? '__no_org__' } : {}),
    };

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.isActive !== 'ALL') {
      where.isActive = query.isActive === 'true';
    }

    const [total, items] = await Promise.all([
      prisma.worksite.count({ where }),
      prisma.worksite.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        include: {
          _count: {
            select: {
              employees: {
                where: { deletedAt: null, status: 'ACTIVE' },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: items.map((w) => ({
        id: w.id,
        name: w.name,
        address: w.address,
        latitude: Number(w.latitude),
        longitude: Number(w.longitude),
        radiusMeters: w.radiusMeters,
        isActive: w.isActive,
        createdAt: w.createdAt.toISOString(),
        activeEmployeeCount: w._count.employees,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single worksite by ID.
   */
  static async getWorksiteById(id: string, session?: UserSession) {
    const worksite = await prisma.worksite.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: {
              where: { deletedAt: null, status: 'ACTIVE' },
            },
          },
        },
      },
    });

    if (!worksite || (session?.organizationId && (worksite as any).organizationId && (worksite as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Địa điểm làm việc không tồn tại.');
    }

    return {
      id: worksite.id,
      name: worksite.name,
      address: worksite.address,
      latitude: Number(worksite.latitude),
      longitude: Number(worksite.longitude),
      radiusMeters: worksite.radiusMeters,
      isActive: worksite.isActive,
      createdAt: worksite.createdAt.toISOString(),
      activeEmployeeCount: worksite._count.employees,
    };
  }

  /**
   * Create a new worksite.
   */
  static async createWorksite(input: CreateWorksiteInput, session: UserSession) {
    this.ensurePrivileged(session);

    const targetOrgId = session.organizationId || ((session.roles.includes('super_admin') && (input as any).organizationId) ? (input as any).organizationId : null);
    if (!targetOrgId) {
      throw ApiError.badRequest('Tổ chức (organizationId) là bắt buộc để tạo địa điểm làm việc.');
    }

    // Check duplicate name scoped to organization
    const existing = await prisma.worksite.findFirst({
      where: {
        name: { equals: input.name.trim(), mode: 'insensitive' },
        organizationId: targetOrgId,
      },
    });

    if (existing) {
      throw ApiError.conflict(`Địa điểm làm việc với tên "${input.name.trim()}" đã tồn tại.`);
    }

    const created = await prisma.worksite.create({
      data: {
        organizationId: targetOrgId,
        name: input.name.trim(),
        address: input.address.trim(),
        latitude: new Prisma.Decimal(input.latitude),
        longitude: new Prisma.Decimal(input.longitude),
        radiusMeters: input.radiusMeters,
        isActive: input.isActive ?? true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'CREATE_WORKSITE',
        entity: 'worksite',
        entityId: created.id,
        organizationId: targetOrgId,
        newValues: {
          name: created.name,
          address: created.address,
          latitude: Number(created.latitude),
          longitude: Number(created.longitude),
          radiusMeters: created.radiusMeters,
          isActive: created.isActive,
        },
      },
    });

    logger.info('Worksite created', {
      worksiteId: created.id,
      name: created.name,
      actor: session.userId,
    });

    return {
      id: created.id,
      name: created.name,
      address: created.address,
      latitude: Number(created.latitude),
      longitude: Number(created.longitude),
      radiusMeters: created.radiusMeters,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      activeEmployeeCount: 0,
    };
  }

  /**
   * Update an existing worksite.
   */
  static async updateWorksite(id: string, input: UpdateWorksiteInput, session: UserSession) {
    this.ensurePrivileged(session);

    const worksite = await prisma.worksite.findUnique({
      where: { id },
    });

    if (!worksite || (session?.organizationId && (worksite as any).organizationId && (worksite as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Địa điểm làm việc không tồn tại.');
    }

    // Name uniqueness check if changing name
    if (input.name && input.name.trim().toLowerCase() !== worksite.name.toLowerCase()) {
      const duplicate = await prisma.worksite.findFirst({
        where: {
          name: { equals: input.name.trim(), mode: 'insensitive' },
          id: { not: id },
          ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
        },
      });
      if (duplicate) {
        throw ApiError.conflict(`Địa điểm làm việc với tên "${input.name.trim()}" đã tồn tại.`);
      }
    }

    const updateData: Prisma.WorksiteUpdateInput = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.address !== undefined) updateData.address = input.address.trim();
    if (input.latitude !== undefined) updateData.latitude = new Prisma.Decimal(input.latitude);
    if (input.longitude !== undefined) updateData.longitude = new Prisma.Decimal(input.longitude);
    if (input.radiusMeters !== undefined) updateData.radiusMeters = input.radiusMeters;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const updated = await prisma.worksite.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            employees: {
              where: { deletedAt: null, status: 'ACTIVE' },
            },
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'UPDATE_WORKSITE',
        entity: 'worksite',
        entityId: updated.id,
        organizationId: worksite.organizationId || session.organizationId || null,
        oldValues: {
          name: worksite.name,
          address: worksite.address,
          latitude: Number(worksite.latitude),
          longitude: Number(worksite.longitude),
          radiusMeters: worksite.radiusMeters,
          isActive: worksite.isActive,
        },
        newValues: {
          name: updated.name,
          address: updated.address,
          latitude: Number(updated.latitude),
          longitude: Number(updated.longitude),
          radiusMeters: updated.radiusMeters,
          isActive: updated.isActive,
        },
      },
    });

    logger.info('Worksite updated', {
      worksiteId: updated.id,
      actor: session.userId,
    });

    return {
      id: updated.id,
      name: updated.name,
      address: updated.address,
      latitude: Number(updated.latitude),
      longitude: Number(updated.longitude),
      radiusMeters: updated.radiusMeters,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      activeEmployeeCount: updated._count.employees,
    };
  }

  /**
   * Delete or safe-deactivate a worksite.
   * If any active employees are assigned, block deletion with a clear actionable message.
   */
  static async deleteWorksite(id: string, session: UserSession) {
    this.ensurePrivileged(session, true); // Admin only

    const worksite = await prisma.worksite.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            employees: {
              where: { deletedAt: null, status: 'ACTIVE' },
            },
          },
        },
      },
    });

    if (!worksite || (session?.organizationId && (worksite as any).organizationId && (worksite as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Địa điểm làm việc không tồn tại.');
    }

    if (worksite._count.employees > 0) {
      throw ApiError.badRequest(
        `Không thể xóa địa điểm này vì hiện đang có ${worksite._count.employees} nhân viên đang làm việc tại đây. Vui lòng chuyển nhân sự sang địa điểm khác hoặc chuyển trạng thái thành "Ngưng hoạt động".`
      );
    }

    await prisma.worksite.delete({
      where: { id },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'DELETE_WORKSITE',
        entity: 'worksite',
        entityId: id,
        organizationId: worksite.organizationId || session.organizationId || null,
        oldValues: {
          name: worksite.name,
          address: worksite.address,
        },
      },
    });

    logger.info('Worksite deleted', { worksiteId: id, actor: session.userId });

    return { success: true, message: `Đã xóa địa điểm làm việc "${worksite.name}".` };
  }

  /**
   * Toggle active/inactive status.
   */
  static async toggleStatus(id: string, session: UserSession) {
    this.ensurePrivileged(session);

    const worksite = await prisma.worksite.findUnique({
      where: { id },
    });

    if (!worksite || (session?.organizationId && (worksite as any).organizationId && (worksite as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Địa điểm làm việc không tồn tại.');
    }

    const updated = await prisma.worksite.update({
      where: { id },
      data: { isActive: !worksite.isActive },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'TOGGLE_WORKSITE_STATUS',
        entity: 'worksite',
        entityId: id,
        newValues: { isActive: updated.isActive },
      },
    });

    logger.info('Worksite status toggled', {
      worksiteId: id,
      newStatus: updated.isActive,
      actor: session.userId,
    });

    return {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
    };
  }
}
