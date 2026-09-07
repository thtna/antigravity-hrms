import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { CreateDepartmentInput, UpdateDepartmentInput } from '@/lib/validations/department';

export class DepartmentService {
  /**
   * List all departments with manager details and count of employees
   */
  static async listDepartments(includeInactive = false, session?: UserSession) {
    const departments = await prisma.department.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        // PHASE 5: Tenant isolation
        ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
      },
      include: {
        manager: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phoneNumber: true,
            user: { select: { email: true } },
          },
        },
        parentDepartment: {
          select: { id: true, code: true, name: true },
        },
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
            subDepartments: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return departments.map((dept) => ({
      ...dept,
      manager: dept.manager
        ? {
            ...dept.manager,
            fullName: `${dept.manager.lastName} ${dept.manager.firstName}`.trim(),
          }
        : null,
      employeeCount: dept._count.employees,
      subDeptCount: dept._count.subDepartments,
    }));
  }

  /**
   * Get single department by ID with manager, sub-departments and employee list
   */
  static async getDepartmentById(id: string, session?: UserSession) {
    // PHASE 6: findFirst with organizationId enforces tenant isolation at DB level (IDOR fix)
    const department = await prisma.department.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
      },
      include: {
        manager: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phoneNumber: true,
            user: { select: { email: true } },
          },
        },
        parentDepartment: {
          select: { id: true, code: true, name: true },
        },
        subDepartments: {
          where: { deletedAt: null },
          select: { id: true, code: true, name: true, isActive: true },
        },
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
            position: { select: { id: true, title: true } },
            user: { select: { email: true, isActive: true } },
          },
          orderBy: { lastName: 'asc' },
        },
      },
    });

    if (!department) {
      throw ApiError.notFound(`Không tìm thấy phòng ban với ID: ${id}`);
    }

    return {
      ...department,
      manager: department.manager
        ? {
            ...department.manager,
            fullName: `${department.manager.lastName} ${department.manager.firstName}`.trim(),
          }
        : null,
      employees: department.employees.map((emp) => ({
        ...emp,
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        contractSalary: Number(emp.contractSalary),
      })),
      employeeCount: department.employees.length,
    };
  }

  /**
   * Create department with optional manager assignment
   */
  static async createDepartment(input: CreateDepartmentInput, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền tạo phòng ban.');
    }

    const upperCode = input.code.toUpperCase().trim();

    // 1. Check duplicate code scoped to the organization
    const existing = await prisma.department.findFirst({
      where: { code: upperCode, organizationId: session.organizationId },
    });
    if (existing && !existing.deletedAt) {
      throw ApiError.conflict(`Mã phòng ban [${upperCode}] đã tồn tại trong tổ chức.`);
    }

    // 2. If parentId provided, verify parent exists
    if (input.parentId) {
      const parent = await prisma.department.findUnique({
        where: { id: input.parentId },
      });
      if (!parent || parent.deletedAt) {
        throw ApiError.notFound('Phòng ban cấp trên không tồn tại.');
      }
    }

    // 3. If managerId provided, verify manager exists
    if (input.managerId) {
      const manager = await prisma.employee.findUnique({
        where: { id: input.managerId },
      });
      if (!manager || manager.deletedAt) {
        throw ApiError.notFound('Nhân sự được chỉ định làm Trưởng phòng không tồn tại.');
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const dept = await tx.department.create({
        data: {
          code: upperCode,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          parentId: input.parentId || null,
          managerId: input.managerId || null,
          isActive: input.isActive ?? true,
          organizationId: session.organizationId!, // PHASE 5: tenant binding
        },
        include: {
          manager: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          parentDepartment: {
            select: { id: true, code: true, name: true },
          },
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_DEPARTMENT',
          entity: 'departments',
          entityId: dept.id,
          newValues: {
            code: dept.code,
            name: dept.name,
            managerId: dept.managerId,
          },
        },
      });

      return dept;
    });

    logger.info('Department created', { departmentId: created.id, code: created.code, actor: session.userId });

    return created;
  }

  /**
   * Update department info & manager assignment
   */
  static async updateDepartment(id: string, input: UpdateDepartmentInput, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền cập nhật phòng ban.');
    }

    // PHASE 6: IDOR fix — organizationId in where clause prevents cross-tenant update
    const currentDept = await prisma.department.findFirst({
      where: { id, deletedAt: null, organizationId: session.organizationId ?? '__no_org__' },
    });

    if (!currentDept) {
      throw ApiError.notFound(`Không tìm thấy phòng ban với ID: ${id}`);
    }

    // Check duplicate code if changed
    if (input.code && input.code.toUpperCase().trim() !== currentDept.code) {
      const upperCode = input.code.toUpperCase().trim();
      const codeTaken = await prisma.department.findFirst({
        where: { code: upperCode },
      });
      if (codeTaken && codeTaken.id !== id) {
        throw ApiError.conflict(`Mã phòng ban [${upperCode}] đã được sử dụng.`);
      }
    }

    // Circular hierarchy prevention
    if (input.parentId && input.parentId === id) {
      throw ApiError.badRequest('Phòng ban không thể làm phòng ban cha của chính mình.');
    }

    // If managerId specified, verify manager
    if (input.managerId) {
      const manager = await prisma.employee.findUnique({
        where: { id: input.managerId },
      });
      if (!manager || manager.deletedAt) {
        throw ApiError.notFound('Nhân sự chỉ định làm Trưởng phòng không tồn tại.');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const dept = await tx.department.update({
        where: { id },
        data: {
          ...(input.code && { code: input.code.toUpperCase().trim() }),
          ...(input.name && { name: input.name.trim() }),
          ...(input.description !== undefined && { description: input.description?.trim() || null }),
          ...(input.parentId !== undefined && { parentId: input.parentId || null }),
          ...(input.managerId !== undefined && { managerId: input.managerId || null }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
        include: {
          manager: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
          parentDepartment: {
            select: { id: true, code: true, name: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_DEPARTMENT',
          entity: 'departments',
          entityId: dept.id,
          oldValues: {
            name: currentDept.name,
            managerId: currentDept.managerId,
            isActive: currentDept.isActive,
          },
          newValues: {
            name: dept.name,
            managerId: dept.managerId,
            isActive: dept.isActive,
          },
        },
      });

      return dept;
    });

    logger.info('Department updated', { departmentId: id, actor: session.userId });

    return updated;
  }

  /**
   * Toggle Department active/inactive status
   */
  static async toggleDepartmentStatus(id: string, isActive: boolean, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền bật/tắt trạng thái phòng ban.');
    }

    // PHASE 6: IDOR fix — organizationId in where clause prevents cross-tenant mutation
    const department = await prisma.department.findFirst({
      where: { id, deletedAt: null, organizationId: session.organizationId ?? '__no_org__' },
    });

    if (!department) {
      throw ApiError.notFound(`Không tìm thấy phòng ban với ID: ${id}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const dept = await tx.department.update({
        where: { id },
        data: { isActive },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: isActive ? 'ACTIVATE_DEPARTMENT' : 'DEACTIVATE_DEPARTMENT',
          entity: 'departments',
          entityId: id,
          oldValues: { isActive: department.isActive },
          newValues: { isActive },
        },
      });

      return dept;
    });

    logger.info('Department status toggled', { departmentId: id, isActive, actor: session.userId });

    return updated;
  }

  /**
   * Delete department with strict Foreign Key Integrity & Historical Preservation Check
   */
  static async deleteDepartment(id: string, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xóa phòng ban.');
    }

    // PHASE 6: IDOR fix — organizationId in where clause prevents cross-tenant delete
    const department = await prisma.department.findFirst({
      where: { id, deletedAt: null, organizationId: session.organizationId ?? '__no_org__' },
    });

    if (!department) {
      throw ApiError.notFound(`Không tìm thấy phòng ban với ID: ${id}`);
    }

    // 1. FOREIGN KEY INTEGRITY CHECK: Employees linked
    const employeeCount = await prisma.employee.count({
      where: { departmentId: id },
    });

    if (employeeCount > 0) {
      throw ApiError.badRequest(
        `Không thể xóa phòng ban [${department.name}] vì đang có ${employeeCount} nhân sự trực thuộc hoặc dữ liệu lịch sử gắn kết. Để bảo toàn lịch sử chấm công và tính lương, vui lòng điều chuyển nhân sự sang phòng ban khác hoặc sử dụng tính năng Ngưng hoạt động (Deactivate).`
      );
    }

    // 2. HIERARCHY INTEGRITY CHECK: Sub-departments linked
    const subDeptCount = await prisma.department.count({
      where: { parentId: id, deletedAt: null },
    });

    if (subDeptCount > 0) {
      throw ApiError.badRequest(
        `Không thể xóa phòng ban [${department.name}] vì đang có ${subDeptCount} phòng ban trực thuộc. Vui lòng chuyển hoặc xóa các phòng ban con trước.`
      );
    }

    // 3. Safe Soft Delete
    await prisma.$transaction(async (tx) => {
      await tx.department.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'DELETE_DEPARTMENT',
          entity: 'departments',
          entityId: id,
          oldValues: { name: department.name, code: department.code },
          newValues: { deletedAt: new Date().toISOString() },
        },
      });
    });

    logger.info('Department safely soft-deleted (integrity preserved)', {
      departmentId: id,
      code: department.code,
      actor: session.userId,
    });

    return {
      id,
      deleted: true,
      message: `Phòng ban [${department.name}] đã được xóa an toàn khỏi danh mục hoạt động.`,
    };
  }
}
