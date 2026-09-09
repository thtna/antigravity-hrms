import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DepartmentService } from '../department.service';
import { PositionService } from '../position.service';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    department: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    position: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (cb) => cb(prisma)),
  },
}));

describe('PHASE 4 — DEPARTMENT & POSITION SERVICE TEST SUITE', () => {
  const testOrgId = 'org-test-dept';

  const adminSession: UserSession = {
    userId: 'usr-admin',
    employeeId: 'emp-admin',
    email: 'admin@antigravity.internal',
    fullName: 'Super Admin',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
    organizationId: testOrgId,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr',
    employeeId: 'emp-hr',
    email: 'hr@antigravity.internal',
    fullName: 'HR Specialist',
    roles: ['hr'],
    permissions: ['dept:read', 'dept:write'],
    isActive: true,
    organizationId: testOrgId,
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp',
    employeeId: 'emp-user',
    email: 'user@antigravity.internal',
    fullName: 'Standard User',
    roles: ['employee'],
    permissions: [],
    isActive: true,
    organizationId: testOrgId,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.department.findFirst as unknown as Mock).mockImplementation((...args: any[]) =>
      (prisma.department.findUnique as unknown as Mock)(...args)
    );
    (prisma.position.findFirst as unknown as Mock).mockImplementation((...args: any[]) =>
      (prisma.position.findUnique as unknown as Mock)(...args)
    );
  });

  // ==========================================================================
  // 1. DEPARTMENT TESTS
  // ==========================================================================
  describe('1. Department Management', () => {
    it('should list departments with employee counts and manager details', async () => {
      const mockDepartments = [
        {
          id: 'dept-01',
          code: 'TECH',
          name: 'Phòng Công Nghệ',
          manager: {
            id: 'emp-mgr-01',
            employeeCode: 'EMP-001',
            firstName: 'A',
            lastName: 'Nguyễn',
            avatarUrl: null,
            phoneNumber: '0912345678',
            user: { email: 'manager@antigravity.internal' },
          },
          parentDepartment: null,
          _count: { employees: 12, subDepartments: 2 },
          isActive: true,
        },
      ];

      (prisma.department.findMany as unknown as Mock).mockResolvedValue(mockDepartments);

      const result = await DepartmentService.listDepartments();
      expect(result.length).toBe(1);
      expect(result[0].manager?.fullName).toBe('Nguyễn A');
      expect(result[0].employeeCount).toBe(12);
      expect(result[0].subDeptCount).toBe(2);
    });

    it('should create department and reject duplicate code', async () => {
      (prisma.department.findUnique as unknown as Mock).mockResolvedValue({ id: 'existing-dept' });

      await expect(
        DepartmentService.createDepartment(
          { code: 'TECH', name: 'Phòng Công Nghệ', isActive: true },
          hrSession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should successfully create department and write audit log', async () => {
      (prisma.department.findUnique as unknown as Mock).mockResolvedValue(null);
      (prisma.department.create as unknown as Mock).mockResolvedValue({
        id: 'dept-new',
        code: 'FINANCE',
        name: 'Phòng Tài Chính',
        managerId: null,
        isActive: true,
      });

      const dept = await DepartmentService.createDepartment(
        { code: 'FINANCE', name: 'Phòng Tài Chính', isActive: true },
        adminSession
      );

      expect(dept.id).toBe('dept-new');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should assign a manager to department during update', async () => {
      const existingDept = { id: 'dept-01', code: 'TECH', name: 'Tech Dept', managerId: null };
      const managerEmp = { id: 'emp-mgr', employeeCode: 'EMP-MGR' };

      (prisma.department.findUnique as unknown as Mock).mockResolvedValue(existingDept);
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(managerEmp);
      (prisma.department.update as unknown as Mock).mockResolvedValue({
        ...existingDept,
        managerId: 'emp-mgr',
      });

      const updated = await DepartmentService.updateDepartment(
        'dept-01',
        { managerId: 'emp-mgr' },
        adminSession
      );

      expect(updated.managerId).toBe('emp-mgr');
      expect(prisma.department.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ managerId: 'emp-mgr' }),
        })
      );
    });

    it('should toggle department active/inactive status', async () => {
      const existingDept = { id: 'dept-01', isActive: true };
      (prisma.department.findUnique as unknown as Mock).mockResolvedValue(existingDept);
      (prisma.department.update as unknown as Mock).mockResolvedValue({ id: 'dept-01', isActive: false });

      const updated = await DepartmentService.toggleDepartmentStatus('dept-01', false, hrSession);
      expect(updated.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // 2. DEPARTMENT FOREIGN KEY & HISTORICAL INTEGRITY TESTS
  // ==========================================================================
  describe('2. Department Foreign Key Integrity & Historical Preservation', () => {
    it('should PREVENT deleting department when employees exist (Historical Preservation)', async () => {
      const dept = { id: 'dept-busy', name: 'Phòng Kinh Doanh', code: 'SALES' };
      (prisma.department.findUnique as unknown as Mock).mockResolvedValue(dept);

      // 5 employees currently or historically linked
      (prisma.employee.count as unknown as Mock).mockResolvedValue(5);

      await expect(
        DepartmentService.deleteDepartment('dept-busy', adminSession)
      ).rejects.toThrow(ApiError);

      try {
        await DepartmentService.deleteDepartment('dept-busy', adminSession);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(400);
        expect((err as ApiError).message).toContain('Không thể xóa phòng ban');
        expect((err as ApiError).message).toContain('5 nhân sự');
      }
    });

    it('should PREVENT deleting department when sub-departments exist', async () => {
      const dept = { id: 'dept-parent', name: 'Khối Kỹ Thuật', code: 'ENG' };
      (prisma.department.findUnique as unknown as Mock).mockResolvedValue(dept);

      // 0 employees, but 2 sub-departments
      (prisma.employee.count as unknown as Mock).mockResolvedValue(0);
      (prisma.department.count as unknown as Mock).mockResolvedValue(2);

      await expect(
        DepartmentService.deleteDepartment('dept-parent', adminSession)
      ).rejects.toThrow(ApiError);

      try {
        await DepartmentService.deleteDepartment('dept-parent', adminSession);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(400);
        expect((err as ApiError).message).toContain('phòng ban trực thuộc');
      }
    });

    it('should ALLOW safe deletion when 0 employees and 0 sub-departments exist', async () => {
      const dept = { id: 'dept-empty', name: 'Dự Án Mới', code: 'TEMP' };
      (prisma.department.findUnique as unknown as Mock).mockResolvedValue(dept);

      (prisma.employee.count as unknown as Mock).mockResolvedValue(0);
      (prisma.department.count as unknown as Mock).mockResolvedValue(0);
      (prisma.department.update as unknown as Mock).mockResolvedValue({ ...dept, deletedAt: new Date() });

      const result = await DepartmentService.deleteDepartment('dept-empty', adminSession);
      expect(result.deleted).toBe(true);
      expect(prisma.department.update).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 3. POSITION TESTS
  // ==========================================================================
  describe('3. Position Management & Salary Range', () => {
    it('should list positions with salary range and employee count', async () => {
      const mockPositions = [
        {
          id: 'pos-01',
          code: 'DEV_SR',
          title: 'Senior Developer',
          minSalary: '20000000',
          maxSalary: '35000000',
          baseSalaryGrade: '25000000',
          isActive: true,
          _count: { employees: 6 },
        },
      ];

      (prisma.position.findMany as unknown as Mock).mockResolvedValue(mockPositions);

      const list = await PositionService.listPositions();
      expect(list.length).toBe(1);
      expect(list[0].minSalary).toBe(20000000);
      expect(list[0].maxSalary).toBe(35000000);
      expect(list[0].employeeCount).toBe(6);
    });

    it('should create position and reject duplicate code', async () => {
      (prisma.position.findUnique as unknown as Mock).mockResolvedValue({ id: 'existing-pos' });

      await expect(
        PositionService.createPosition(
          {
            code: 'DEV_SR',
            title: 'Senior Developer',
            minSalary: 20000000,
            maxSalary: 35000000,
            baseSalaryGrade: 25000000,
            isActive: true,
          },
          hrSession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should toggle position active/inactive status', async () => {
      const existingPos = { id: 'pos-01', isActive: true };
      (prisma.position.findUnique as unknown as Mock).mockResolvedValue(existingPos);
      (prisma.position.update as unknown as Mock).mockResolvedValue({ id: 'pos-01', isActive: false });

      const updated = await PositionService.togglePositionStatus('pos-01', false, hrSession);
      expect(updated.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // 4. POSITION FOREIGN KEY INTEGRITY TESTS
  // ==========================================================================
  describe('4. Position Foreign Key Integrity & Historical Preservation', () => {
    it('should PREVENT deleting position when employees hold this position (Contract Integrity)', async () => {
      const pos = { id: 'pos-held', title: 'Kỹ Sư Phần Mềm', code: 'DEV' };
      (prisma.position.findUnique as unknown as Mock).mockResolvedValue(pos);

      // 8 employees assigned to this position
      (prisma.employee.count as unknown as Mock).mockResolvedValue(8);

      await expect(
        PositionService.deletePosition('pos-held', adminSession)
      ).rejects.toThrow(ApiError);

      try {
        await PositionService.deletePosition('pos-held', adminSession);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(400);
        expect((err as ApiError).message).toContain('Không thể xóa chức vụ');
        expect((err as ApiError).message).toContain('8 nhân viên');
      }
    });

    it('should ALLOW safe deletion when 0 employees hold this position', async () => {
      const pos = { id: 'pos-empty', title: 'Thực Tập Sinh', code: 'INTERN' };
      (prisma.position.findUnique as unknown as Mock).mockResolvedValue(pos);

      (prisma.employee.count as unknown as Mock).mockResolvedValue(0);
      (prisma.position.update as unknown as Mock).mockResolvedValue({ ...pos, deletedAt: new Date() });

      const result = await PositionService.deletePosition('pos-empty', adminSession);
      expect(result.deleted).toBe(true);
      expect(prisma.position.update).toHaveBeenCalled();
    });

    it('should REJECT deletion attempt by regular employee (Role Guard)', async () => {
      await expect(
        PositionService.deletePosition('pos-any', employeeSession)
      ).rejects.toThrow(ApiError);
    });
  });
});
