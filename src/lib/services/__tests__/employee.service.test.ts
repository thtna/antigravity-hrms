import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { EmployeeService } from '../employee.service';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import { CreateEmployeeInput } from '@/lib/validations/employee';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    employee: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (cb) => cb(prisma)),
  },
}));

describe('PHASE 3 — EMPLOYEE MANAGEMENT SERVICE TEST SUITE', () => {
  const adminSession: UserSession = {
    userId: 'usr-admin',
    employeeId: 'emp-admin',
    email: 'admin@antigravity.internal',
    fullName: 'Admin User',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr',
    employeeId: 'emp-hr',
    email: 'hr@antigravity.internal',
    fullName: 'HR Officer',
    roles: ['hr'],
    permissions: ['employee:read', 'employee:write'],
    isActive: true,
  };

  const managerSession: UserSession = {
    userId: 'usr-mgr',
    employeeId: 'emp-mgr',
    email: 'manager@antigravity.internal',
    fullName: 'Dept Manager',
    departmentId: 'dept-engineering',
    roles: ['manager'],
    permissions: ['employee:read_dept'],
    isActive: true,
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp',
    employeeId: 'emp-target',
    email: 'employee@antigravity.internal',
    fullName: 'Regular Employee',
    departmentId: 'dept-sales',
    roles: ['employee'],
    permissions: ['employee:read_self'],
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.employee.findFirst as unknown as Mock).mockImplementation((...args: any[]) =>
      (prisma.employee.findUnique as unknown as Mock)(...args)
    );
  });

  // --------------------------------------------------------------------------
  // 1. listEmployees Tests
  // --------------------------------------------------------------------------
  describe('1. listEmployees with Search, Filters & Data Scoping', () => {
    it('should return paginated list of employees for Admin', async () => {
      const mockList = [
        {
          id: 'emp-01',
          employeeCode: 'EMP-001',
          firstName: 'An',
          lastName: 'Nguyễn',
          contractSalary: '20000000',
          hourlyRate: '113636',
          insuranceSalary: '5000000',
          documents: [],
          status: 'ACTIVE',
          department: { id: 'dept-01', code: 'TECH', name: 'Công nghệ' },
          position: { id: 'pos-01', code: 'DEV', title: 'Developer', baseSalaryGrade: '20000000' },
          worksite: { id: 'ws-01', name: 'Trụ sở chính' },
          user: { id: 'usr-01', email: 'an@antigravity.internal', isActive: true },
        },
      ];

      (prisma.employee.count as unknown as Mock).mockResolvedValue(1);
      (prisma.employee.findMany as unknown as Mock).mockResolvedValue(mockList);

      const result = await EmployeeService.listEmployees(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        adminSession
      );

      expect(result.employees.length).toBe(1);
      expect(result.employees[0].fullName).toBe('Nguyễn An');
      expect(result.employees[0].contractSalary).toBe(20000000);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should scope search to department for Manager session', async () => {
      (prisma.employee.count as unknown as Mock).mockResolvedValue(0);
      (prisma.employee.findMany as unknown as Mock).mockResolvedValue([]);

      await EmployeeService.listEmployees(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        managerSession
      );

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            departmentId: 'dept-engineering',
          }),
        })
      );
    });

    it('should apply search across code, name, phone, email', async () => {
      (prisma.employee.count as unknown as Mock).mockResolvedValue(0);
      (prisma.employee.findMany as unknown as Mock).mockResolvedValue([]);

      await EmployeeService.listEmployees(
        {
          page: 1,
          limit: 10,
          search: 'Nguyễn',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        adminSession
      );

      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ lastName: { contains: 'Nguyễn', mode: 'insensitive' } }),
            ]),
          }),
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. getEmployeeById Tests
  // --------------------------------------------------------------------------
  describe('2. getEmployeeById & IDOR Prevention', () => {
    it('should return employee detail for Admin', async () => {
      const mockEmp = {
        id: 'emp-target',
        employeeCode: 'EMP-999',
        firstName: 'Bình',
        lastName: 'Trần',
        departmentId: 'dept-sales',
        contractSalary: '15000000',
        hourlyRate: '85227',
        insuranceSalary: '5000000',
        documents: [{ id: 'doc-1', name: 'CV.pdf', url: 'http://example.com' }],
        deletedAt: null,
      };

      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmp);

      const res = await EmployeeService.getEmployeeById('emp-target', adminSession);
      expect(res.fullName).toBe('Trần Bình');
      expect(res.documents.length).toBe(1);
    });

    it('should block employee trying to view another employee profile (IDOR Block)', async () => {
      const otherEmployee = {
        id: 'emp-other-person',
        userId: 'usr-other',
        employeeCode: 'EMP-777',
        departmentId: 'dept-finance',
        deletedAt: null,
      };

      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(otherEmployee);

      await expect(
        EmployeeService.getEmployeeById('emp-other-person', employeeSession)
      ).rejects.toThrow(ApiError);
    });
  });

  // --------------------------------------------------------------------------
  // 3. createEmployee Tests
  // --------------------------------------------------------------------------
  describe('3. createEmployee Validation & Execution', () => {
    const validInput: CreateEmployeeInput = {
      employeeCode: 'EMP-2026',
      firstName: 'Cường',
      lastName: 'Lê',
      email: 'cuong.le@antigravity.internal',
      phoneNumber: '0987654321',
      gender: 'MALE',
      departmentId: 'dept-tech',
      positionId: 'pos-dev',
      hireDate: '2026-09-01',
      contractType: 'FIXED_TERM',
      contractSalary: 18000000,
      hourlyRate: 102273,
      insuranceSalary: 5000000,
      dependentsCount: 1,
      status: 'ACTIVE',
      documents: [],
    };

    it('should reject non-admin/HR when attempting to create employee', async () => {
      await expect(
        EmployeeService.createEmployee(validInput, employeeSession)
      ).rejects.toThrow(ApiError);
    });

    it('should reject duplicate employeeCode with 409 Conflict', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue({ id: 'existing-emp' });

      await expect(
        EmployeeService.createEmployee(validInput, hrSession)
      ).rejects.toThrow(ApiError);
    });

    it('should successfully create employee with user account and audit log', async () => {
      // 1. Unique code
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(null);
      // 2. Unique email
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(null);
      // 3. Role
      (prisma.role.findUnique as unknown as Mock).mockResolvedValue({ id: 'role-emp-id' });
      // 4. User creation
      (prisma.user.create as unknown as Mock).mockResolvedValue({ id: 'new-user-id' });
      // 5. Employee creation
      const createdEmp = {
        id: 'new-emp-id',
        employeeCode: 'EMP-2026',
        firstName: 'Cường',
        lastName: 'Lê',
        contractSalary: '18000000',
        hourlyRate: '102273',
        insuranceSalary: '5000000',
        documents: [],
      };
      (prisma.employee.create as unknown as Mock).mockResolvedValue(createdEmp);

      const result = await EmployeeService.createEmployee(validInput, hrSession);
      expect(result.id).toBe('new-emp-id');
      expect(result.fullName).toBe('Lê Cường');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 4. toggleEmployeeStatus Tests
  // --------------------------------------------------------------------------
  describe('4. toggleEmployeeStatus & User Account Sync', () => {
    it('should deactivate employee and deactivate linked User account when TERMINATED', async () => {
      const mockEmp = {
        id: 'emp-01',
        userId: 'usr-01',
        status: 'ACTIVE',
        deletedAt: null,
        user: { isActive: true },
      };

      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmp);
      (prisma.employee.update as unknown as Mock).mockResolvedValue({
        ...mockEmp,
        status: 'TERMINATED',
      });

      const updated = await EmployeeService.toggleEmployeeStatus('emp-01', 'TERMINATED', adminSession);

      expect(updated.status).toBe('TERMINATED');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-01' },
          data: { isActive: false },
        })
      );
    });

    it('should re-activate employee and activate linked User account when set to ACTIVE', async () => {
      const mockEmp = {
        id: 'emp-01',
        userId: 'usr-01',
        status: 'TERMINATED',
        deletedAt: null,
        user: { isActive: false },
      };

      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmp);
      (prisma.employee.update as unknown as Mock).mockResolvedValue({
        ...mockEmp,
        status: 'ACTIVE',
      });

      const updated = await EmployeeService.toggleEmployeeStatus('emp-01', 'ACTIVE', hrSession);

      expect(updated.status).toBe('ACTIVE');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-01' },
          data: { isActive: true },
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 5. Manager Salary Protection & Department Scoping
  // --------------------------------------------------------------------------
  describe('5. Manager Salary Protection & Department Scoping', () => {
    const mockDeptEmp = {
      id: 'emp-dept-01',
      employeeCode: 'EMP-DEPT-01',
      userId: 'usr-dept-01',
      firstName: 'Đức',
      lastName: 'Hoàng',
      departmentId: 'dept-engineering', // same as managerSession
      contractSalary: '20000000',
      hourlyRate: '113636',
      insuranceSalary: '5000000',
      status: 'ACTIVE',
      deletedAt: null,
      user: { email: 'duc.hoang@antigravity.internal' },
    };

    it('should REJECT Manager attempting to change contractSalary (Salary Protection)', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockDeptEmp);

      await expect(
        EmployeeService.updateEmployee(
          'emp-dept-01',
          { contractSalary: 25000000 },
          managerSession
        )
      ).rejects.toThrow(ApiError);

      try {
        await EmployeeService.updateEmployee(
          'emp-dept-01',
          { contractSalary: 25000000 },
          managerSession
        );
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(403);
        expect((err as ApiError).message).toContain('Manager không có quyền chỉnh sửa thông tin lương');
      }
    });

    it('should REJECT Manager attempting to change hourlyRate or bank info', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockDeptEmp);

      await expect(
        EmployeeService.updateEmployee(
          'emp-dept-01',
          { hourlyRate: 150000 },
          managerSession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should REJECT Manager attempting to edit employee in another department', async () => {
      const otherDeptEmp = {
        ...mockDeptEmp,
        id: 'emp-sales-01',
        departmentId: 'dept-sales', // different dept
      };
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(otherDeptEmp);

      await expect(
        EmployeeService.updateEmployee(
          'emp-sales-01',
          { phoneNumber: '0912345678' },
          managerSession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should ALLOW Manager to update non-salary fields within their department', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockDeptEmp);
      (prisma.employee.update as unknown as Mock).mockResolvedValue({
        ...mockDeptEmp,
        phoneNumber: '0988776655',
        documents: [],
      });

      const updated = await EmployeeService.updateEmployee(
        'emp-dept-01',
        { phoneNumber: '0988776655' },
        managerSession
      );

      expect(updated.id).toBe('emp-dept-01');
      expect(prisma.employee.update).toHaveBeenCalled();
    });

    it('should ALLOW Admin/HR to update salary fields', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockDeptEmp);
      (prisma.employee.update as unknown as Mock).mockResolvedValue({
        ...mockDeptEmp,
        contractSalary: '25000000',
        hourlyRate: '142045',
        documents: [],
      });

      const updated = await EmployeeService.updateEmployee(
        'emp-dept-01',
        { contractSalary: 25000000, hourlyRate: 142045 },
        hrSession
      );

      expect(updated.id).toBe('emp-dept-01');
      expect(updated.contractSalary).toBe(25000000);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Soft Delete Preservation (Never Delete Payroll/Attendance History)
  // --------------------------------------------------------------------------
  describe('6. Soft Delete Preservation (Payroll & Attendance Integrity)', () => {
    it('should soft-delete employee by setting deletedAt and deactivating user without deleting history', async () => {
      const activeEmp = {
        id: 'emp-preserve-01',
        employeeCode: 'EMP-PRESERVE',
        userId: 'usr-preserve-01',
        status: 'ACTIVE',
        deletedAt: null,
        user: { isActive: true },
      };

      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(activeEmp);
      (prisma.employee.update as unknown as Mock).mockResolvedValue({
        ...activeEmp,
        deletedAt: new Date(),
        status: 'TERMINATED',
      });

      const res = await EmployeeService.softDeleteEmployee('emp-preserve-01', adminSession);

      expect(res.softDeleted).toBe(true);
      expect(res.message).toContain('bảo toàn');

      // Verify soft delete updated deletedAt instead of hard deleting
      expect(prisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-preserve-01' },
          data: expect.objectContaining({
            status: 'TERMINATED',
            deletedAt: expect.any(Date),
          }),
        })
      );

      // Verify user deactivated
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-preserve-01' },
          data: { isActive: false },
        })
      );

      // Verify audit log created
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SOFT_DELETE_EMPLOYEE',
            entityId: 'emp-preserve-01',
          }),
        })
      );
    });

    it('should REJECT soft delete if employee is already deleted', async () => {
      const alreadyDeletedEmp = {
        id: 'emp-deleted',
        deletedAt: new Date(),
      };
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(alreadyDeletedEmp);

      await expect(
        EmployeeService.softDeleteEmployee('emp-deleted', adminSession)
      ).rejects.toThrow(ApiError);
    });

    it('should REJECT soft delete by non-admin/HR', async () => {
      await expect(
        EmployeeService.softDeleteEmployee('emp-preserve-01', employeeSession)
      ).rejects.toThrow(ApiError);
    });
  });
});

