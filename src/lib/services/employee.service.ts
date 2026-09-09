import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { hashPassword } from '@/lib/auth/password';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmployeeQueryParams,
} from '@/lib/validations/employee';
import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';
import crypto from 'crypto';

export interface CreateEmployeeOptions {
  tx?: Prisma.TransactionClient;
  passwordHash?: string;
  roleId?: string;
  allowOwnerOnboarding?: boolean;
}

export class EmployeeService {
  /**
   * List employees with searching, filtering, data scoping and pagination
   */
  static async listEmployees(params: EmployeeQueryParams, session: UserSession) {
    const { page, limit, search, departmentId, positionId, status, sortBy, sortOrder } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      // PHASE 5: Tenant isolation — always scope to the authenticated user's organization
      organizationId: session.organizationId || undefined,
    };

    // 1. Data Scoping (within tenant)
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      if (session.roles.includes('manager') && session.departmentId) {
        where.departmentId = session.departmentId;
      } else {
        // Regular employee can only see their own profile within the org
        where.id = session.employeeId || 'no-access';
      }
    }

    // 2. Department & Position filters
    if (departmentId) {
      where.departmentId = departmentId;
    }
    if (positionId) {
      where.positionId = positionId;
    }

    // 3. Status filter
    if (status && status !== 'ALL') {
      where.status = status;
    }

    // 4. Search by keyword
    if (search && search.trim() !== '') {
      const keyword = search.trim();
      where.OR = [
        { employeeCode: { contains: keyword, mode: 'insensitive' } },
        { firstName: { contains: keyword, mode: 'insensitive' } },
        { lastName: { contains: keyword, mode: 'insensitive' } },
        { phoneNumber: { contains: keyword } },
        { user: { email: { contains: keyword, mode: 'insensitive' } } },
      ];
    }

    // 5. Total count and paginated query
    const [total, rawEmployees] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          department: {
            select: { id: true, name: true, code: true },
          },
          position: {
            select: { id: true, title: true, code: true },
          },
          worksite: {
            select: { id: true, name: true },
          },
          user: {
            select: { id: true, email: true, isActive: true },
          },
        },
      }),
    ]);

    // Mask sensitive fields if non-admin/non-hr
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const employees = rawEmployees.map((emp) => {
      const base = {
        ...emp,
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        contractSalary: isHrOrAdmin ? Number(emp.contractSalary) : undefined,
        hourlyRate: isHrOrAdmin ? Number(emp.hourlyRate) : undefined,
        insuranceSalary: isHrOrAdmin ? Number(emp.insuranceSalary) : undefined,
        bankAccountNo: isHrOrAdmin ? emp.bankAccountNo : undefined,
        bankName: isHrOrAdmin ? emp.bankName : undefined,
        taxCode: isHrOrAdmin ? emp.taxCode : undefined,
        documents: (emp.documents as any) || [],
      };
      return base;
    });

    return {
      employees,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single employee by ID with IDOR / Data Scoping validation
   */
  static async getEmployeeById(id: string, session: UserSession) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        position: true,
        worksite: true,
        user: {
          select: { id: true, email: true, isActive: true, lastLoginAt: true },
        },
      },
    });

    if (!employee || employee.deletedAt) {
      throw ApiError.notFound(`Không tìm thấy nhân viên có ID: ${id}`);
    }

    // PHASE 5: Tenant isolation — employee must belong to the session's organization
    if (employee.organizationId !== session.organizationId) {
      // Return 404 to avoid leaking existence of cross-tenant records
      throw ApiError.notFound(`Không tìm thấy nhân viên có ID: ${id}`);
    }

    // IDOR check: Non-admin/HR cannot view employees outside their scope (within tenant)
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      if (session.roles.includes('manager')) {
        if (employee.departmentId !== session.departmentId) {
          throw ApiError.forbidden('Bạn chỉ có quyền xem nhân viên trong phòng ban của mình (Chặn IDOR).');
        }
      } else {
        if (employee.id !== session.employeeId && employee.userId !== session.userId) {
          throw ApiError.forbidden('Bạn chỉ có quyền xem hồ sơ cá nhân của mình (Chặn IDOR).');
        }
      }
    }

    return {
      ...employee,
      fullName: `${employee.lastName} ${employee.firstName}`.trim(),
      contractSalary: Number(employee.contractSalary),
      hourlyRate: Number(employee.hourlyRate),
      insuranceSalary: Number(employee.insuranceSalary),
      documents: (employee.documents as any) || [],
    };
  }

  /**
   * Create new employee and link with system user account
   */
  static async createEmployee(
    input: CreateEmployeeInput,
    session: UserSession,
    optionsOrTx?: CreateEmployeeOptions | Prisma.TransactionClient
  ) {
    const options: CreateEmployeeOptions =
      optionsOrTx && ('tx' in optionsOrTx || 'passwordHash' in optionsOrTx || 'roleId' in optionsOrTx || 'allowOwnerOnboarding' in optionsOrTx)
        ? (optionsOrTx as CreateEmployeeOptions)
        : optionsOrTx
        ? { tx: optionsOrTx as Prisma.TransactionClient }
        : {};

    // Only Admin or HR can create employees globally.
    // Tenant OWNER is allowed only when explicitly scoped via allowOwnerOnboarding in the onboarding flow.
    const isOwner = session.tenantRole === 'OWNER';
    const isAdminOrHr = session.roles.includes('admin') || session.roles.includes('hr');
    if (!isAdminOrHr && (!isOwner || !options.allowOwnerOnboarding)) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền thêm nhân viên mới.');
    }

    const orgId = session.organizationId || (session.roles.includes('super_admin') && (input as any).organizationId ? (input as any).organizationId : null);
    if (!orgId) {
      throw ApiError.badRequest('Tổ chức (organizationId) là bắt buộc để tạo nhân viên.');
    }
    const db = options.tx || prisma;

    // 1. Check duplicate employee code within the same organization
    const existingCode = await db.employee.findFirst({
      where: { employeeCode: input.employeeCode.toUpperCase().trim(), organizationId: orgId },
    });
    if (existingCode) {
      throw ApiError.conflict(`Mã nhân viên [${input.employeeCode}] đã tồn tại trong tổ chức.`);
    }

    // 2. Check duplicate email in users
    const existingUser = await db.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
    });
    if (existingUser) {
      throw ApiError.conflict(`Email [${input.email}] đã được đăng ký cho một tài khoản khác.`);
    }

    // 3. Check duplicate identity card if provided
    if (input.identityCard && input.identityCard.trim() !== '') {
      const existingIdCard = await db.employee.findFirst({
        where: { identityCard: input.identityCard.trim(), organizationId: orgId },
      });
      if (existingIdCard) {
        throw ApiError.conflict(`Số CCCD/Hộ chiếu [${input.identityCard}] đã tồn tại.`);
      }
    }

    // 3.1 Verify department, position, and worksite belong to this tenant (prevent cross-tenant FK injection)
    if (orgId) {
      if (input.departmentId && db.department?.findFirst) {
        const dept = await db.department.findFirst({
          where: { id: input.departmentId, organizationId: orgId, deletedAt: null },
        });
        if (!dept) {
          throw ApiError.badRequest('Phòng ban không tồn tại trong tổ chức của bạn.');
        }
      }
      if (input.positionId && db.position?.findFirst) {
        const pos = await db.position.findFirst({
          where: { id: input.positionId, organizationId: orgId, deletedAt: null },
        });
        if (!pos) {
          throw ApiError.badRequest('Chức vụ không tồn tại trong tổ chức của bạn.');
        }
      }
      if (input.worksiteId && db.worksite?.findFirst) {
        const ws = await db.worksite.findFirst({
          where: { id: input.worksiteId, organizationId: orgId },
        });
        if (!ws) {
          throw ApiError.badRequest('Địa điểm làm việc không tồn tại trong tổ chức của bạn.');
        }
      }
    }

    // 4. Look up system role outside transaction if not pre-provided
    let empRoleId = options.roleId;
    if (!empRoleId) {
      let empRole = await db.role.findUnique({ where: { code: 'employee' } });
      if (!empRole) {
        empRole = await db.role.create({
          data: {
            code: 'employee',
            name: 'Nhân viên',
            description: 'Vai trò nhân viên thông thường',
          },
        });
      }
      empRoleId = empRole.id;
    }

    // 5. Non-DB operations: default password and bcrypt hash outside transaction
    const passwordHash =
      options.passwordHash ||
      (await hashPassword(
        process.env.DEFAULT_EMPLOYEE_PASSWORD || `${crypto.randomBytes(8).toString('hex')}!Aa1`
      ));

    // Calculate hourlyRate if not specified: (contractSalary / 22 work days / 8 hours)
    const hourlyRate = input.hourlyRate > 0
      ? input.hourlyRate
      : input.contractSalary > 0
      ? Math.round(input.contractSalary / (22 * 8))
      : 0;

    // 6. Atomic write logic
    const executeWrites = async (txClient: Prisma.TransactionClient) => {
      // Create User account
      const newUser = await txClient.user.create({
        data: {
          email: input.email.toLowerCase().trim(),
          passwordHash,
          isActive: input.status === 'ACTIVE' || input.status === 'PROBATION',
          userRoles: {
            create: {
              roleId: empRoleId!,
            },
          },
        },
      });

      // Create Employee — bound to current tenant
      const employee = await txClient.employee.create({
        data: {
          userId: newUser.id,
          organizationId: orgId,
          employeeCode: input.employeeCode.toUpperCase().trim(),
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          avatarUrl: input.avatarUrl || null,
          gender: input.gender,
          dob: input.dob ? new Date(input.dob) : new Date('1995-01-01'),
          identityCard: input.identityCard?.trim() || null,
          phoneNumber: input.phoneNumber.trim(),
          departmentId: input.departmentId,
          positionId: input.positionId,
          worksiteId: input.worksiteId || null,
          hireDate: new Date(input.hireDate),
          contractType: input.contractType,
          contractSalary: new Prisma.Decimal(input.contractSalary),
          hourlyRate: new Prisma.Decimal(hourlyRate),
          insuranceSalary: new Prisma.Decimal(input.insuranceSalary),
          taxCode: input.taxCode?.trim() || null,
          dependentsCount: input.dependentsCount,
          bankAccountNo: input.bankAccountNo?.trim() || null,
          bankName: input.bankName?.trim() || null,
          documents: input.documents as unknown as Prisma.InputJsonValue,
          status: input.status,
        },
        include: {
          department: true,
          position: true,
          worksite: true,
          user: {
            select: { id: true, email: true, isActive: true },
          },
        },
      });

      // Link OrganizationMember for new user
      if ((txClient as any).organizationMember?.create) {
        await (txClient as any).organizationMember.create({
          data: {
            organizationId: orgId,
            userId: newUser.id,
            role: 'EMPLOYEE',
            isActive: true,
          },
        });
      } else if ((txClient as any).organizationMember?.upsert) {
        await (txClient as any).organizationMember.upsert({
          where: { organizationId_userId: { organizationId: orgId, userId: newUser.id } },
          create: { organizationId: orgId, userId: newUser.id, role: 'EMPLOYEE', isActive: true },
          update: { isActive: true },
        });
      }

      // Create Audit Log with organizationId for tenant isolation
      await txClient.auditLog.create({
        data: {
          organizationId: orgId,
          actorId: session.userId,
          action: 'CREATE_EMPLOYEE',
          entity: 'employees',
          entityId: employee.id,
          newValues: {
            employeeCode: employee.employeeCode,
            fullName: `${employee.lastName} ${employee.firstName}`,
            departmentId: employee.departmentId,
            positionId: employee.positionId,
          },
        },
      });

      return employee;
    };

    let createdEmployee;
    if (options.tx) {
      // Caller provided transaction client — run directly without creating a nested transaction
      createdEmployee = await executeWrites(options.tx);
    } else {
      // Standalone execution — short atomic transaction with reasonable timeout for cold starts
      createdEmployee = await prisma.$transaction(
        async (innerTx) => executeWrites(innerTx),
        {
          maxWait: 5000,
          timeout: 10000,
        }
      );
    }

    logger.info('Employee created successfully', {
      employeeId: createdEmployee.id,
      code: createdEmployee.employeeCode,
      actor: session.userId,
    });

    return {
      ...createdEmployee,
      fullName: `${createdEmployee.lastName} ${createdEmployee.firstName}`.trim(),
      contractSalary: Number(createdEmployee.contractSalary),
      hourlyRate: Number(createdEmployee.hourlyRate),
      insuranceSalary: Number(createdEmployee.insuranceSalary),
      documents: (createdEmployee.documents as any) || [],
    };
  }

  /**
   * Fields considered "salary-sensitive" — only admin or hr can modify.
   * Manager CANNOT change these even when editing their dept employees.
   */
  private static readonly SALARY_FIELDS = [
    'contractSalary',
    'hourlyRate',
    'insuranceSalary',
    'contractType',
    'taxCode',
    'bankAccountNo',
    'bankName',
  ] as const;

  /**
   * Soft-delete an employee (sets deletedAt). Never hard-deletes.
   * Preserves all payroll & attendance history.
   */
  static async softDeleteEmployee(id: string, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xoá hồ sơ nhân viên.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!employee || (session.organizationId && employee.organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy nhân viên có ID: ${id}`);
    }
    if (employee.deletedAt) {
      throw ApiError.conflict('Hồ sơ nhân viên này đã được đánh dấu xoá trước đó.');
    }

    await prisma.$transaction(async (tx) => {
      // Soft delete: set deletedAt and deactivate user account
      await tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'TERMINATED',
        },
      });

      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: false },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'SOFT_DELETE_EMPLOYEE',
          entity: 'employees',
          entityId: id,
          organizationId: employee.organizationId || session.organizationId || null,
          oldValues: { status: employee.status, deletedAt: null },
          newValues: { status: 'TERMINATED', deletedAt: new Date().toISOString() },
        },
      });
    });

    logger.info('Employee soft-deleted (data preserved)', {
      employeeId: id,
      code: employee.employeeCode,
      actor: session.userId,
    });

    return { id, softDeleted: true, message: 'Hồ sơ nhân viên đã được ẩn. Lịch sử chấm công và bảng lương vẫn được bảo toàn.' };
  }

  /**
   * Update existing employee profile.
   * - Admin / HR: full update including salary fields.
   * - Manager: update only non-salary fields within their department.
   * - Employee: cannot update (403).
   */
  static async updateEmployee(id: string, input: UpdateEmployeeInput, session: UserSession) {
    const isAdminOrHr = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    if (!isAdminOrHr && !isManager) {
      throw ApiError.forbidden('Bạn không có quyền cập nhật hồ sơ nhân viên.');
    }

    // Manager salary protection: block salary-sensitive fields
    if (isManager && !isAdminOrHr) {
      const salaryFieldsAttempted = EmployeeService.SALARY_FIELDS.filter(
        (f) => input[f as keyof UpdateEmployeeInput] !== undefined
      );
      if (salaryFieldsAttempted.length > 0) {
        throw ApiError.forbidden(
          `Manager không có quyền chỉnh sửa thông tin lương và tài chính: [${salaryFieldsAttempted.join(', ')}]. Liên hệ HR hoặc Admin.`
        );
      }
    }

    const currentEmployee = await prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!currentEmployee || currentEmployee.deletedAt || (session.organizationId && currentEmployee.organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy nhân viên có ID: ${id}`);
    }

    // Verify department, position, and worksite belong to this tenant if updated
    if (session.organizationId) {
      if (input.departmentId && input.departmentId !== currentEmployee.departmentId) {
        const dept = await prisma.department.findFirst({
          where: { id: input.departmentId, organizationId: session.organizationId, deletedAt: null },
        });
        if (!dept) {
          throw ApiError.badRequest('Phòng ban không tồn tại trong tổ chức của bạn.');
        }
      }
      if (input.positionId && input.positionId !== currentEmployee.positionId) {
        const pos = await prisma.position.findFirst({
          where: { id: input.positionId, organizationId: session.organizationId, deletedAt: null },
        });
        if (!pos) {
          throw ApiError.badRequest('Chức vụ không tồn tại trong tổ chức của bạn.');
        }
      }
      if (input.worksiteId && input.worksiteId !== currentEmployee.worksiteId) {
        const ws = await prisma.worksite.findFirst({
          where: { id: input.worksiteId, organizationId: session.organizationId },
        });
        if (!ws) {
          throw ApiError.badRequest('Địa điểm làm việc không tồn tại trong tổ chức của bạn.');
        }
      }
    }

    // Manager scope check: can only edit employees in their own department
    if (isManager && !isAdminOrHr) {
      if (currentEmployee.departmentId !== session.departmentId) {
        throw ApiError.forbidden('Manager chỉ có quyền chỉnh sửa thông tin nhân viên trong phòng ban của mình (Chặn IDOR).');
      }
    }

    // Check duplicate employee code if changed
    if (input.employeeCode && input.employeeCode.toUpperCase() !== currentEmployee.employeeCode) {
      const codeTaken = await prisma.employee.findFirst({
        where: { employeeCode: input.employeeCode.toUpperCase() },
      });
      if (codeTaken) {
        throw ApiError.conflict(`Mã nhân viên [${input.employeeCode}] đã tồn tại.`);
      }
    }

    // Check duplicate email if changed
    if (input.email && input.email.toLowerCase() !== currentEmployee.user.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: input.email.toLowerCase() },
      });
      if (emailTaken) {
        throw ApiError.conflict(`Email [${input.email}] đã được tài khoản khác sử dụng.`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Update linked user email if changed
      if (input.email && input.email.toLowerCase() !== currentEmployee.user.email) {
        await tx.user.update({
          where: { id: currentEmployee.userId },
          data: { email: input.email.toLowerCase() },
        });
      }

      const updateData: Prisma.EmployeeUpdateInput = {};

      if (input.employeeCode) updateData.employeeCode = input.employeeCode.toUpperCase();
      if (input.firstName) updateData.firstName = input.firstName.trim();
      if (input.lastName) updateData.lastName = input.lastName.trim();
      if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl || null;
      if (input.gender) updateData.gender = input.gender;
      if (input.dob) updateData.dob = new Date(input.dob);
      if (input.identityCard !== undefined) updateData.identityCard = input.identityCard || null;
      if (input.phoneNumber) updateData.phoneNumber = input.phoneNumber.trim();
      if (input.departmentId) updateData.department = { connect: { id: input.departmentId } };
      if (input.positionId) updateData.position = { connect: { id: input.positionId } };
      if (input.worksiteId !== undefined) {
        updateData.worksite = input.worksiteId ? { connect: { id: input.worksiteId } } : { disconnect: true };
      }
      if (input.hireDate) updateData.hireDate = new Date(input.hireDate);
      if (input.contractType) updateData.contractType = input.contractType;
      if (input.contractSalary !== undefined) updateData.contractSalary = new Prisma.Decimal(input.contractSalary);
      if (input.hourlyRate !== undefined) updateData.hourlyRate = new Prisma.Decimal(input.hourlyRate);
      if (input.insuranceSalary !== undefined) updateData.insuranceSalary = new Prisma.Decimal(input.insuranceSalary);
      if (input.taxCode !== undefined) updateData.taxCode = input.taxCode || null;
      if (input.dependentsCount !== undefined) updateData.dependentsCount = input.dependentsCount;
      if (input.bankAccountNo !== undefined) updateData.bankAccountNo = input.bankAccountNo || null;
      if (input.bankName !== undefined) updateData.bankName = input.bankName || null;
      if (input.documents !== undefined) updateData.documents = input.documents as unknown as Prisma.InputJsonValue;
      if (input.status) updateData.status = input.status;

      const emp = await tx.employee.update({
        where: { id },
        data: updateData,
        include: {
          department: true,
          position: true,
          worksite: true,
          user: {
            select: { id: true, email: true, isActive: true },
          },
        },
      });

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_EMPLOYEE',
          entity: 'employees',
          entityId: emp.id,
          organizationId: currentEmployee.organizationId || session.organizationId || null,
          oldValues: {
            employeeCode: currentEmployee.employeeCode,
            status: currentEmployee.status,
            departmentId: currentEmployee.departmentId,
          },
          newValues: {
            employeeCode: emp.employeeCode,
            status: emp.status,
            departmentId: emp.departmentId,
          },
        },
      });

      // 1st Critical Audit Event: SALARY_MODIFICATION
      const isSalaryChanged =
        (input.contractSalary !== undefined && Number(input.contractSalary) !== Number(currentEmployee.contractSalary)) ||
        (input.hourlyRate !== undefined && Number(input.hourlyRate) !== Number(currentEmployee.hourlyRate)) ||
        (input.insuranceSalary !== undefined && Number(input.insuranceSalary) !== Number(currentEmployee.insuranceSalary)) ||
        (input.contractType !== undefined && input.contractType !== currentEmployee.contractType);

      if (isSalaryChanged) {
        await AuditService.logSalaryModification({
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          actorId: session.userId,
          oldValues: {
            contractSalary: Number(currentEmployee.contractSalary),
            hourlyRate: Number(currentEmployee.hourlyRate),
            insuranceSalary: Number(currentEmployee.insuranceSalary),
            contractType: currentEmployee.contractType,
          },
          newValues: {
            contractSalary: Number(emp.contractSalary),
            hourlyRate: Number(emp.hourlyRate),
            insuranceSalary: Number(emp.insuranceSalary),
            contractType: emp.contractType,
          },
          tx,
        });
      }

      return emp;
    });

    logger.info('Employee updated', { employeeId: id, actor: session.userId });

    return {
      ...updated,
      fullName: `${updated.lastName} ${updated.firstName}`.trim(),
      contractSalary: Number(updated.contractSalary),
      hourlyRate: Number(updated.hourlyRate),
      insuranceSalary: Number(updated.insuranceSalary),
      documents: (updated.documents as any) || [],
    };
  }

  /**
   * Deactivate or activate employee status and sync with User account
   */
  static async toggleEmployeeStatus(
    id: string,
    newStatus: 'ACTIVE' | 'TERMINATED' | 'ON_LEAVE' | 'PROBATION',
    session: UserSession
  ) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền thay đổi trạng thái công tác.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!employee || employee.deletedAt) {
      throw ApiError.notFound(`Không tìm thấy nhân viên có ID: ${id}`);
    }

    const isDeactivated = newStatus === 'TERMINATED';

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Employee status
      const updatedEmp = await tx.employee.update({
        where: { id },
        data: { status: newStatus },
      });

      // 2. Sync linked User active status
      await tx.user.update({
        where: { id: employee.userId },
        data: { isActive: !isDeactivated },
      });

      // 3. Create Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: isDeactivated ? 'DEACTIVATE_EMPLOYEE' : 'ACTIVATE_EMPLOYEE',
          entity: 'employees',
          entityId: id,
          oldValues: { status: employee.status, userActive: employee.user.isActive },
          newValues: { status: newStatus, userActive: !isDeactivated },
        },
      });

      return updatedEmp;
    });

    logger.info('Employee status toggled', {
      employeeId: id,
      newStatus,
      userDeactivated: isDeactivated,
      actor: session.userId,
    });

    return result;
  }
}
