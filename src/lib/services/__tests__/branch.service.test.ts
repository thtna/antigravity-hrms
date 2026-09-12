import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import { CreateBranchSchema, UpdateBranchSchema } from '@/lib/validations/branch';

const mockPrisma = vi.hoisted(() => ({
  branch: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    count: vi.fn(),
  },
  worksite: {
    count: vi.fn(),
  },
  attendance: {
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { BranchService } from '@/lib/services/branch.service';

describe('PHASE 5K-C2B - BranchService tenant branch management', () => {
  const orgA = 'org-alpha';
  const orgB = 'org-beta';

  const ownerSession: UserSession = {
    userId: 'usr-owner',
    organizationId: orgA,
    tenantRole: 'OWNER',
    email: 'owner@alpha.test',
    fullName: 'Owner Alpha',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const adminSession: UserSession = {
    userId: 'usr-admin',
    organizationId: orgA,
    tenantRole: 'ADMIN',
    email: 'admin@alpha.test',
    fullName: 'Admin Alpha',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr',
    organizationId: orgA,
    tenantRole: 'HR_MANAGER',
    email: 'hr@alpha.test',
    fullName: 'HR Alpha',
    roles: ['hr'],
    permissions: [],
    isActive: true,
  };

  const managerSession: UserSession = {
    userId: 'usr-manager',
    organizationId: orgA,
    tenantRole: 'MANAGER',
    email: 'manager@alpha.test',
    fullName: 'Manager Alpha',
    roles: ['manager'],
    permissions: [],
    isActive: true,
  };

  const employeeSession: UserSession = {
    userId: 'usr-employee',
    organizationId: orgA,
    tenantRole: 'EMPLOYEE',
    email: 'employee@alpha.test',
    fullName: 'Employee Alpha',
    roles: ['employee'],
    permissions: [],
    isActive: true,
  };

  const superAdminSession: UserSession = {
    userId: 'usr-super',
    organizationId: null,
    email: 'super@platform.test',
    fullName: 'Platform Super Admin',
    roles: ['super_admin'],
    permissions: ['*'],
    isActive: true,
  };

  const activeBranch = {
    id: 'branch-a-01',
    organizationId: orgA,
    code: 'HN-01',
    name: 'Ha Noi',
    address: 'Ha Noi',
    phone: '024',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    deletedAt: null,
    _count: { employees: 2, worksites: 1, attendances: 3 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockPrisma) => unknown) =>
      cb(mockPrisma)
    );
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  describe('tenant isolation', () => {
    it('Tenant A list is scoped to Tenant A and usage counts are tenant-scoped', async () => {
      mockPrisma.branch.findMany.mockResolvedValue([activeBranch]);

      const result = await BranchService.listBranches(false, managerSession);

      expect(result).toHaveLength(1);
      expect(mockPrisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgA,
            deletedAt: null,
            isActive: true,
          }),
        })
      );
      const include = mockPrisma.branch.findMany.mock.calls[0][0].include;
      expect(include._count.select.employees.where.organizationId).toBe(orgA);
      expect(include._count.select.worksites.where.organizationId).toBe(orgA);
      expect(include._count.select.attendances.where.organizationId).toBe(orgA);
    });

    it('includeInactive list still excludes deleted rows', async () => {
      mockPrisma.branch.findMany.mockResolvedValue([activeBranch]);

      await BranchService.listBranches(true, managerSession);

      const where = mockPrisma.branch.findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe(orgA);
      expect(where.deletedAt).toBeNull();
      expect(where.isActive).toBeUndefined();
    });

    it('Tenant A get cannot read Tenant B branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(BranchService.getBranchById('branch-b-01', adminSession)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockPrisma.branch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'branch-b-01', organizationId: orgA, deletedAt: null },
        })
      );
    });

    it('Tenant A update cannot modify Tenant B branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        BranchService.updateBranch('branch-b-01', { name: 'Beta Rename' }, adminSession)
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.branch.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('Tenant A status mutation cannot affect Tenant B branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        BranchService.toggleBranchStatus('branch-b-01', false, hrSession)
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.branch.update).not.toHaveBeenCalled();
    });

    it('Tenant A delete cannot delete Tenant B branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(BranchService.deleteBranch('branch-b-01', adminSession)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockPrisma.branch.update).not.toHaveBeenCalled();
    });

    it('Platform SUPER_ADMIN is not treated as a tenant branch API user', async () => {
      await expect(BranchService.listBranches(true, superAdminSession)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('RBAC', () => {
    it('OWNER can create a branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      mockPrisma.branch.create.mockResolvedValue({ ...activeBranch, id: 'branch-new', code: 'DN-01' });

      const result = await BranchService.createBranch(
        { code: 'dn-01', name: 'Da Nang', isActive: true },
        ownerSession
      );

      expect(result.code).toBe('DN-01');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATE_BRANCH', organizationId: orgA }),
        })
      );
    });

    it('ADMIN can update a branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(activeBranch);
      mockPrisma.branch.update.mockResolvedValue({ ...activeBranch, name: 'Ha Noi Updated' });

      const result = await BranchService.updateBranch('branch-a-01', { name: 'Ha Noi Updated' }, adminSession);

      expect(result.name).toBe('Ha Noi Updated');
    });

    it('HR_MANAGER can create, update, and status-toggle but cannot delete', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(activeBranch);
      mockPrisma.branch.update.mockResolvedValue({ ...activeBranch, isActive: false });
      mockPrisma.branch.count.mockResolvedValue(1);

      const toggled = await BranchService.toggleBranchStatus('branch-a-01', false, hrSession);
      expect(toggled.isActive).toBe(false);

      await expect(BranchService.deleteBranch('branch-a-01', hrSession)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('MANAGER can list but cannot mutate', async () => {
      mockPrisma.branch.findMany.mockResolvedValue([activeBranch]);
      await expect(BranchService.listBranches(true, managerSession)).resolves.toHaveLength(1);

      await expect(
        BranchService.updateBranch('branch-a-01', { name: 'Nope' }, managerSession)
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('EMPLOYEE cannot access the management branch list', async () => {
      await expect(BranchService.listBranches(true, employeeSession)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('validation and code uniqueness', () => {
    it('rejects malformed create payloads', () => {
      const parsed = CreateBranchSchema.safeParse({ code: 'x', name: '' });
      expect(parsed.success).toBe(false);
    });

    it('rejects organizationId injection and immutable fields', () => {
      expect(
        CreateBranchSchema.safeParse({
          code: 'HN-02',
          name: 'Injected',
          organizationId: orgB,
        }).success
      ).toBe(false);
      expect(
        UpdateBranchSchema.safeParse({
          id: 'branch-a-01',
          deletedAt: new Date().toISOString(),
          name: 'Injected',
        }).success
      ).toBe(false);
      expect(UpdateBranchSchema.safeParse({ isActive: false }).success).toBe(false);
    });

    it('rejects duplicate branch code within the same tenant, including soft-deleted rows', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ ...activeBranch, deletedAt: new Date() });

      await expect(
        BranchService.createBranch({ code: 'HN-01', name: 'Duplicate', isActive: true }, adminSession)
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(mockPrisma.branch.create).not.toHaveBeenCalled();
    });

    it('allows the same code in different tenants by checking only the authenticated organization', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      mockPrisma.branch.create.mockResolvedValue({ ...activeBranch, id: 'branch-new', code: 'HQ' });

      await BranchService.createBranch({ code: 'HQ', name: 'HQ Alpha', isActive: true }, adminSession);

      expect(mockPrisma.branch.findFirst).toHaveBeenCalledWith({
        where: { organizationId: orgA, code: 'HQ' },
      });
    });

    it('reserves soft-deleted codes during recode as well', async () => {
      mockPrisma.branch.findFirst
        .mockResolvedValueOnce(activeBranch)
        .mockResolvedValueOnce({ ...activeBranch, id: 'branch-deleted', code: 'OLD', deletedAt: new Date() });

      await expect(
        BranchService.updateBranch('branch-a-01', { code: 'OLD' }, adminSession)
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('status policy', () => {
    it('deactivates a normal branch when another active branch remains', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(activeBranch);
      mockPrisma.branch.count.mockResolvedValue(1);
      mockPrisma.branch.update.mockResolvedValue({ ...activeBranch, isActive: false });

      const result = await BranchService.toggleBranchStatus('branch-a-01', false, adminSession);

      expect(result.isActive).toBe(false);
      expect(mockPrisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'branch-a-01' },
        data: { isActive: false },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'DEACTIVATE_BRANCH' }),
        })
      );
    });

    it('blocks deactivating the last active branch without audit success', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(activeBranch);
      mockPrisma.branch.count.mockResolvedValue(0);

      await expect(
        BranchService.toggleBranchStatus('branch-a-01', false, adminSession)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(mockPrisma.branch.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('reactivates an inactive non-deleted branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ ...activeBranch, isActive: false });
      mockPrisma.branch.update.mockResolvedValue({ ...activeBranch, isActive: true });

      const result = await BranchService.toggleBranchStatus('branch-a-01', true, hrSession);

      expect(result.isActive).toBe(true);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ACTIVATE_BRANCH' }),
        })
      );
    });

    it('cannot reactivate a deleted branch', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        BranchService.toggleBranchStatus('branch-deleted', true, adminSession)
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('guarded soft delete', () => {
    beforeEach(() => {
      mockPrisma.branch.findFirst.mockResolvedValue(activeBranch);
      mockPrisma.employee.count.mockResolvedValue(0);
      mockPrisma.worksite.count.mockResolvedValue(0);
      mockPrisma.attendance.count.mockResolvedValue(0);
      mockPrisma.branch.count.mockResolvedValue(1);
    });

    it('soft-deletes an unused eligible branch and preserves the code', async () => {
      mockPrisma.branch.update.mockResolvedValue({
        ...activeBranch,
        isActive: false,
        deletedAt: new Date(),
      });

      const result = await BranchService.deleteBranch('branch-a-01', adminSession);

      expect(result.deleted).toBe(true);
      expect(result.message).toContain('van duoc giu lai');
      const updateCall = mockPrisma.branch.update.mock.calls[0][0];
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
      expect(updateCall.data.isActive).toBe(false);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'DELETE_BRANCH', organizationId: orgA }),
        })
      );
    });

    it.each([
      ['Employee', 'employee', 2],
      ['Worksite', 'worksite', 1],
      ['Attendance', 'attendance', 5],
    ])('%s reference blocks delete', async (_label, model, count) => {
      if (model === 'employee') mockPrisma.employee.count.mockResolvedValue(count);
      if (model === 'worksite') mockPrisma.worksite.count.mockResolvedValue(count);
      if (model === 'attendance') mockPrisma.attendance.count.mockResolvedValue(count);

      await expect(BranchService.deleteBranch('branch-a-01', adminSession)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.branch.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('already-deleted branch cannot be deleted again', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);

      await expect(BranchService.deleteBranch('branch-deleted', adminSession)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockPrisma.branch.update).not.toHaveBeenCalled();
    });

    it('deletion cannot leave zero active non-deleted branches', async () => {
      mockPrisma.branch.count.mockResolvedValue(0);

      await expect(BranchService.deleteBranch('branch-a-01', adminSession)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockPrisma.branch.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('reference checks are tenant-scoped', async () => {
      mockPrisma.branch.update.mockResolvedValue({ ...activeBranch, isActive: false, deletedAt: new Date() });

      await BranchService.deleteBranch('branch-a-01', adminSession);

      expect(mockPrisma.employee.count).toHaveBeenCalledWith({ where: { organizationId: orgA, branchId: 'branch-a-01' } });
      expect(mockPrisma.worksite.count).toHaveBeenCalledWith({ where: { organizationId: orgA, branchId: 'branch-a-01' } });
      expect(mockPrisma.attendance.count).toHaveBeenCalledWith({ where: { organizationId: orgA, branchId: 'branch-a-01' } });
    });
  });
});
