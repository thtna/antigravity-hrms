import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { CreateBranchInput, UpdateBranchInput } from '@/lib/validations/branch';

type BranchWithCounts = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  _count?: {
    employees?: number;
    worksites?: number;
    attendances?: number;
  };
};

export class BranchService {
  private static ensureTenantSession(session: UserSession) {
    const isPlatformSuperAdmin =
      session.roles.includes('super_admin') || session.roles.includes('SUPER_ADMIN');

    if (isPlatformSuperAdmin || !session.organizationId) {
      throw ApiError.forbidden('Yeu cau ngu canh to chuc hop le de quan ly chi nhanh.');
    }

    return session.organizationId;
  }

  private static ensureListAccess(session: UserSession) {
    const organizationId = this.ensureTenantSession(session);
    const allowedByTenantRole =
      session.tenantRole === 'OWNER' ||
      session.tenantRole === 'ADMIN' ||
      session.tenantRole === 'HR_MANAGER' ||
      session.tenantRole === 'MANAGER';
    const allowedBySystemRole =
      session.roles.includes('admin') ||
      session.roles.includes('hr') ||
      session.roles.includes('manager');

    if (!allowedByTenantRole && !allowedBySystemRole) {
      throw ApiError.forbidden('Ban khong co quyen xem danh muc chi nhanh.');
    }

    return organizationId;
  }

  private static ensureWriteAccess(session: UserSession) {
    const organizationId = this.ensureTenantSession(session);
    const allowedByTenantRole =
      session.tenantRole === 'OWNER' ||
      session.tenantRole === 'ADMIN' ||
      session.tenantRole === 'HR_MANAGER';
    const allowedBySystemRole = session.roles.includes('admin') || session.roles.includes('hr');

    if (!allowedByTenantRole && !allowedBySystemRole) {
      throw ApiError.forbidden('Ban khong co quyen thay doi danh muc chi nhanh.');
    }

    return organizationId;
  }

  private static ensureDeleteAccess(session: UserSession) {
    const organizationId = this.ensureTenantSession(session);
    const allowedByTenantRole = session.tenantRole === 'OWNER' || session.tenantRole === 'ADMIN';
    const allowedBySystemRole = session.roles.includes('admin');

    if (!allowedByTenantRole && !allowedBySystemRole) {
      throw ApiError.forbidden('Chi Chu so huu hoac Quan tri vien moi co quyen xoa chi nhanh.');
    }

    return organizationId;
  }

  private static isPrismaCode(error: unknown, code: string) {
    const err = error as { code?: string; message?: string } | null;
    return Boolean(err && (err.code === code || err.message?.includes(code)));
  }

  private static handleDuplicateCode(error: unknown, code: string): never {
    if (this.isPrismaCode(error, 'P2002')) {
      throw ApiError.conflict(
        `Ma chi nhanh [${code}] da ton tai hoac da duoc giu lai trong to chuc.`
      );
    }
    throw error;
  }

  private static handleTransactionConflict(error: unknown): never {
    if (this.isPrismaCode(error, 'P2034')) {
      throw ApiError.conflict('Du lieu chi nhanh vua thay doi. Vui long tai lai va thu lai.');
    }
    throw error;
  }

  private static serialize(branch: BranchWithCounts) {
    const employeeCount = branch._count?.employees ?? 0;
    const worksiteCount = branch._count?.worksites ?? 0;
    const attendanceCount = branch._count?.attendances ?? 0;

    return {
      id: branch.id,
      organizationId: branch.organizationId,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      phone: branch.phone,
      isActive: branch.isActive,
      createdAt: branch.createdAt.toISOString(),
      updatedAt: branch.updatedAt.toISOString(),
      employeeCount,
      worksiteCount,
      attendanceCount,
      totalReferenceCount: employeeCount + worksiteCount + attendanceCount,
    };
  }

  private static countInclude(organizationId: string) {
    return {
      _count: {
        select: {
          employees: { where: { organizationId } },
          worksites: { where: { organizationId } },
          attendances: { where: { organizationId } },
        },
      },
    };
  }

  static async listBranches(includeInactive = false, session: UserSession) {
    const organizationId = this.ensureListAccess(session);

    const branches = await prisma.branch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: this.countInclude(organizationId),
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return branches.map((branch) => this.serialize(branch as BranchWithCounts));
  }

  static async getBranchById(id: string, session: UserSession) {
    const organizationId = this.ensureListAccess(session);

    const branch = await prisma.branch.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: this.countInclude(organizationId),
    });

    if (!branch) {
      throw ApiError.notFound('Chi nhanh khong ton tai.');
    }

    return this.serialize(branch as BranchWithCounts);
  }

  static async createBranch(input: CreateBranchInput, session: UserSession) {
    const organizationId = this.ensureWriteAccess(session);
    const upperCode = input.code.toUpperCase().trim();

    try {
      const created = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.branch.findFirst({
            where: { organizationId, code: upperCode },
          });

          if (existing) {
            throw ApiError.conflict(
              `Ma chi nhanh [${upperCode}] da ton tai hoac da duoc giu lai trong to chuc.`
            );
          }

          const branch = await tx.branch.create({
            data: {
              organizationId,
              code: upperCode,
              name: input.name.trim(),
              address: input.address?.trim() || null,
              phone: input.phone?.trim() || null,
              isActive: input.isActive ?? true,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: session.userId,
              organizationId,
              action: 'CREATE_BRANCH',
              entity: 'branches',
              entityId: branch.id,
              newValues: {
                code: branch.code,
                name: branch.name,
                address: branch.address,
                phone: branch.phone,
                isActive: branch.isActive,
              },
            },
          });

          return branch;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      logger.info('Branch created', { branchId: created.id, code: created.code, actor: session.userId });
      return this.serialize(created as BranchWithCounts);
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        return this.handleDuplicateCode(error, upperCode);
      }
      return this.handleTransactionConflict(error);
    }
  }

  static async updateBranch(id: string, input: UpdateBranchInput, session: UserSession) {
    const organizationId = this.ensureWriteAccess(session);

    try {
      const updated = await prisma.$transaction(
        async (tx) => {
          const current = await tx.branch.findFirst({
            where: { id, organizationId, deletedAt: null },
          });

          if (!current) {
            throw ApiError.notFound('Chi nhanh khong ton tai.');
          }

          const updateData: Prisma.BranchUpdateInput = {};

          if (input.code !== undefined) {
            const upperCode = input.code.toUpperCase().trim();
            if (upperCode !== current.code) {
              const codeTaken = await tx.branch.findFirst({
                where: { organizationId, code: upperCode },
              });
              if (codeTaken && codeTaken.id !== id) {
                throw ApiError.conflict(
                  `Ma chi nhanh [${upperCode}] da ton tai hoac da duoc giu lai trong to chuc.`
                );
              }
            }
            updateData.code = upperCode;
          }

          if (input.name !== undefined) updateData.name = input.name.trim();
          if (input.address !== undefined) updateData.address = input.address?.trim() || null;
          if (input.phone !== undefined) updateData.phone = input.phone?.trim() || null;

          const branch = await tx.branch.update({
            where: { id },
            data: updateData,
          });

          await tx.auditLog.create({
            data: {
              actorId: session.userId,
              organizationId,
              action: 'UPDATE_BRANCH',
              entity: 'branches',
              entityId: branch.id,
              oldValues: {
                code: current.code,
                name: current.name,
                address: current.address,
                phone: current.phone,
              },
              newValues: {
                code: branch.code,
                name: branch.name,
                address: branch.address,
                phone: branch.phone,
              },
            },
          });

          return branch;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      logger.info('Branch updated', { branchId: id, actor: session.userId });
      return this.serialize(updated as BranchWithCounts);
    } catch (error) {
      if (this.isPrismaCode(error, 'P2002')) {
        return this.handleDuplicateCode(error, input.code?.toUpperCase().trim() || 'UNKNOWN');
      }
      return this.handleTransactionConflict(error);
    }
  }

  static async toggleBranchStatus(id: string, isActive: boolean, session: UserSession) {
    const organizationId = this.ensureWriteAccess(session);

    try {
      const updated = await prisma.$transaction(
        async (tx) => {
          const branch = await tx.branch.findFirst({
            where: { id, organizationId, deletedAt: null },
          });

          if (!branch) {
            throw ApiError.notFound('Chi nhanh khong ton tai.');
          }

          if (!isActive && branch.isActive) {
            const remainingActiveCount = await tx.branch.count({
              where: {
                organizationId,
                deletedAt: null,
                isActive: true,
                id: { not: id },
              },
            });

            if (remainingActiveCount === 0) {
              throw ApiError.badRequest('Khong the ngung hoat dong chi nhanh dang hoat dong cuoi cung cua to chuc.');
            }
          }

          const nextBranch = await tx.branch.update({
            where: { id },
            data: { isActive },
          });

          await tx.auditLog.create({
            data: {
              actorId: session.userId,
              organizationId,
              action: isActive ? 'ACTIVATE_BRANCH' : 'DEACTIVATE_BRANCH',
              entity: 'branches',
              entityId: id,
              oldValues: { isActive: branch.isActive },
              newValues: { isActive },
            },
          });

          return nextBranch;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      logger.info('Branch status toggled', { branchId: id, isActive, actor: session.userId });
      return this.serialize(updated as BranchWithCounts);
    } catch (error) {
      return this.handleTransactionConflict(error);
    }
  }

  static async deleteBranch(id: string, session: UserSession) {
    const organizationId = this.ensureDeleteAccess(session);

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const branch = await tx.branch.findFirst({
            where: { id, organizationId, deletedAt: null },
          });

          if (!branch) {
            throw ApiError.notFound('Chi nhanh khong ton tai hoac da duoc xoa.');
          }

          const [employeeCount, worksiteCount, attendanceCount, remainingActiveCount] = await Promise.all([
            tx.employee.count({ where: { organizationId, branchId: id } }),
            tx.worksite.count({ where: { organizationId, branchId: id } }),
            tx.attendance.count({ where: { organizationId, branchId: id } }),
            tx.branch.count({
              where: {
                organizationId,
                deletedAt: null,
                isActive: true,
                id: { not: id },
              },
            }),
          ]);

          if (employeeCount > 0) {
            throw ApiError.badRequest(
              `Khong the xoa chi nhanh [${branch.name}] vi dang co ${employeeCount} nhan su hoac du lieu lich su lien ket.`
            );
          }

          if (worksiteCount > 0) {
            throw ApiError.badRequest(
              `Khong the xoa chi nhanh [${branch.name}] vi dang co ${worksiteCount} dia diem lam viec lien ket.`
            );
          }

          if (attendanceCount > 0) {
            throw ApiError.badRequest(
              `Khong the xoa chi nhanh [${branch.name}] vi dang co ${attendanceCount} ban ghi cham cong lich su lien ket.`
            );
          }

          if (remainingActiveCount === 0) {
            throw ApiError.badRequest('Khong the xoa chi nhanh neu to chuc se khong con chi nhanh dang hoat dong.');
          }

          const deletedAt = new Date();

          await tx.branch.update({
            where: { id },
            data: {
              deletedAt,
              isActive: false,
            },
          });

          await tx.auditLog.create({
            data: {
              actorId: session.userId,
              organizationId,
              action: 'DELETE_BRANCH',
              entity: 'branches',
              entityId: id,
              oldValues: {
                code: branch.code,
                name: branch.name,
                isActive: branch.isActive,
              },
              newValues: { deletedAt: deletedAt.toISOString(), isActive: false },
            },
          });

          return {
            id,
            deleted: true,
            message: `Chi nhanh [${branch.name}] da duoc xoa mem. Ma chi nhanh [${branch.code}] van duoc giu lai.`,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      logger.info('Branch safely soft-deleted', { branchId: id, actor: session.userId });
      return result;
    } catch (error) {
      return this.handleTransactionConflict(error);
    }
  }
}
