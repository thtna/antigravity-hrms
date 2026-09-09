import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { CreatePositionInput, UpdatePositionInput } from '@/lib/validations/position';
import { Prisma } from '@prisma/client';

export class PositionService {
  /**
   * List all positions with salary range and employee count
   */
  static async listPositions(includeInactive = false, session?: UserSession) {
    const positions = await prisma.position.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        // PHASE 5: Tenant isolation
        ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
      },
      include: {
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { title: 'asc' },
    });

    return positions.map((pos) => ({
      ...pos,
      baseSalaryGrade: Number(pos.baseSalaryGrade),
      minSalary: Number(pos.minSalary),
      maxSalary: Number(pos.maxSalary),
      employeeCount: pos._count.employees,
    }));
  }

  /**
   * Get single position with employee list
   */
  static async getPositionById(id: string, session?: UserSession) {
    // PHASE 6: IDOR fix — findFirst with organizationId enforces tenant scoping at DB level
    const position = await prisma.position.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
      },
      include: {
        employees: {
          where: { deletedAt: null },
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phoneNumber: true,
            status: true,
            hireDate: true,
            contractSalary: true,
            department: { select: { id: true, name: true } },
            user: { select: { email: true, isActive: true } },
          },
          orderBy: { lastName: 'asc' },
        },
      },
    });

    if (!position) {
      throw ApiError.notFound(`Không tìm thấy chức vụ với ID: ${id}`);
    }

    return {
      ...position,
      baseSalaryGrade: Number(position.baseSalaryGrade),
      minSalary: Number(position.minSalary),
      maxSalary: Number(position.maxSalary),
      employees: position.employees.map((emp) => ({
        ...emp,
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        contractSalary: Number(emp.contractSalary),
      })),
      employeeCount: position.employees.length,
    };
  }

  /**
   * Create position with salary range
   */
  static async createPosition(input: CreatePositionInput, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền tạo chức vụ.');
    }

    if (!session.organizationId) {
      throw ApiError.badRequest('Tổ chức (organizationId) là bắt buộc để tạo chức vụ.');
    }

    const upperCode = input.code.toUpperCase().trim();

    // Scope duplicate code check to the organization
    const existing = await prisma.position.findFirst({
      where: { code: upperCode, organizationId: session.organizationId },
    });
    if (existing && !existing.deletedAt) {
      throw ApiError.conflict(`Mã chức vụ [${upperCode}] đã tồn tại trong tổ chức.`);
    }

    const created = await prisma.$transaction(async (tx) => {
      const pos = await tx.position.create({
        data: {
          code: upperCode,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          minSalary: new Prisma.Decimal(input.minSalary),
          maxSalary: new Prisma.Decimal(input.maxSalary),
          baseSalaryGrade: new Prisma.Decimal(input.baseSalaryGrade || input.minSalary),
          isActive: input.isActive ?? true,
          organizationId: session.organizationId!, // PHASE 5: tenant binding
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_POSITION',
          entity: 'positions',
          entityId: pos.id,
          newValues: {
            code: pos.code,
            title: pos.title,
            minSalary: Number(pos.minSalary),
            maxSalary: Number(pos.maxSalary),
          },
        },
      });

      return pos;
    });

    logger.info('Position created', { positionId: created.id, code: created.code, actor: session.userId });

    return {
      ...created,
      baseSalaryGrade: Number(created.baseSalaryGrade),
      minSalary: Number(created.minSalary),
      maxSalary: Number(created.maxSalary),
    };
  }

  /**
   * Update position and salary range
   */
  static async updatePosition(id: string, input: UpdatePositionInput, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền cập nhật chức vụ.');
    }

    // PHASE 6: IDOR fix — organizationId in where clause prevents cross-tenant update
    const currentPos = await prisma.position.findFirst({
      where: { id, deletedAt: null, organizationId: session.organizationId ?? '__no_org__' },
    });

    if (!currentPos) {
      throw ApiError.notFound(`Không tìm thấy chức vụ với ID: ${id}`);
    }

    // Check duplicate code if changed
    if (input.code && input.code.toUpperCase().trim() !== currentPos.code) {
      const upperCode = input.code.toUpperCase().trim();
      const codeTaken = await prisma.position.findFirst({
        where: { code: upperCode },
      });
      if (codeTaken && codeTaken.id !== id) {
        throw ApiError.conflict(`Mã chức vụ [${upperCode}] đã được sử dụng.`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.PositionUpdateInput = {};

      if (input.code) updateData.code = input.code.toUpperCase().trim();
      if (input.title) updateData.title = input.title.trim();
      if (input.description !== undefined) updateData.description = input.description?.trim() || null;
      if (input.minSalary !== undefined) updateData.minSalary = new Prisma.Decimal(input.minSalary);
      if (input.maxSalary !== undefined) updateData.maxSalary = new Prisma.Decimal(input.maxSalary);
      if (input.baseSalaryGrade !== undefined) updateData.baseSalaryGrade = new Prisma.Decimal(input.baseSalaryGrade);
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const pos = await tx.position.update({
        where: { id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_POSITION',
          entity: 'positions',
          entityId: pos.id,
          oldValues: {
            title: currentPos.title,
            minSalary: Number(currentPos.minSalary),
            maxSalary: Number(currentPos.maxSalary),
          },
          newValues: {
            title: pos.title,
            minSalary: Number(pos.minSalary),
            maxSalary: Number(pos.maxSalary),
          },
        },
      });

      return pos;
    });

    logger.info('Position updated', { positionId: id, actor: session.userId });

    return {
      ...updated,
      baseSalaryGrade: Number(updated.baseSalaryGrade),
      minSalary: Number(updated.minSalary),
      maxSalary: Number(updated.maxSalary),
    };
  }

  /**
   * Toggle position status
   */
  static async togglePositionStatus(id: string, isActive: boolean, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền bật/tắt trạng thái chức vụ.');
    }

    // PHASE 6: IDOR fix — organizationId in where clause prevents cross-tenant mutation
    const position = await prisma.position.findFirst({
      where: { id, deletedAt: null, organizationId: session.organizationId ?? '__no_org__' },
    });

    if (!position) {
      throw ApiError.notFound(`Không tìm thấy chức vụ với ID: ${id}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const pos = await tx.position.update({
        where: { id },
        data: { isActive },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: isActive ? 'ACTIVATE_POSITION' : 'DEACTIVATE_POSITION',
          entity: 'positions',
          entityId: id,
          oldValues: { isActive: position.isActive },
          newValues: { isActive },
        },
      });

      return pos;
    });

    return updated;
  }

  /**
   * Delete position with Foreign Key Integrity Check (Preserving employee & payroll history)
   */
  static async deletePosition(id: string, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xóa chức vụ.');
    }

    // PHASE 6: IDOR fix — organizationId in where clause prevents cross-tenant delete
    const position = await prisma.position.findFirst({
      where: { id, deletedAt: null, organizationId: session.organizationId ?? '__no_org__' },
    });

    if (!position) {
      throw ApiError.notFound(`Không tìm thấy chức vụ với ID: ${id}`);
    }

    // FOREIGN KEY INTEGRITY CHECK: Employee references
    const employeeCount = await prisma.employee.count({
      where: { positionId: id },
    });

    if (employeeCount > 0) {
      throw ApiError.badRequest(
        `Không thể xóa chức vụ [${position.title}] vì đang có ${employeeCount} nhân viên hoặc dữ liệu hợp đồng lịch sử gắn liền. Hãy sử dụng tính năng Ngưng hoạt động (Deactivate) để bảo toàn dữ liệu.`
      );
    }

    // Safe Soft Delete
    await prisma.$transaction(async (tx) => {
      await tx.position.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'DELETE_POSITION',
          entity: 'positions',
          entityId: id,
          oldValues: { title: position.title, code: position.code },
          newValues: { deletedAt: new Date().toISOString() },
        },
      });
    });

    logger.info('Position safely soft-deleted (integrity preserved)', {
      positionId: id,
      code: position.code,
      actor: session.userId,
    });

    return {
      id,
      deleted: true,
      message: `Chức vụ [${position.title}] đã được xóa an toàn khỏi danh mục hoạt động.`,
    };
  }
}
