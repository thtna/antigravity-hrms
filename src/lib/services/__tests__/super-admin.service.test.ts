import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperAdminService, MAX_TENANTS } from '../super-admin.service';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (cb) => cb(prisma)),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('PHASE 5 — SUPER ADMIN SERVICE TEST SUITE', () => {
  const superAdminSession: UserSession = {
    userId: 'usr-super',
    email: 'superadmin@antigravity.internal',
    fullName: 'System Super Admin',
    roles: ['super_admin'],
    permissions: ['*'],
    isActive: true,
  };

  const superAdminCapsSession: UserSession = {
    userId: 'usr-super-caps',
    email: 'superadmin.caps@antigravity.internal',
    fullName: 'System Super Admin Caps',
    roles: ['SUPER_ADMIN'],
    permissions: ['*'],
    isActive: true,
  };

  const regularAdminSession: UserSession = {
    userId: 'usr-admin',
    employeeId: 'emp-admin',
    email: 'tenant.admin@company.com',
    fullName: 'Tenant Admin',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp',
    employeeId: 'emp-01',
    email: 'employee@company.com',
    fullName: 'Regular Employee',
    roles: ['employee'],
    permissions: [],
    isActive: true,
  };

  const mockOrgPending = {
    id: 'org-001',
    name: 'Công ty Cổ phần Alpha',
    slug: 'alpha-corp',
    status: 'PENDING',
    email: 'contact@alpha.vn',
    phone: '0901234567',
    taxCode: '0109998881',
    address: '123 Đường Láng, Hà Nội',
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
    deletedAt: null,
    _count: { employees: 12, branches: 2 },
    members: [
      {
        role: 'OWNER',
        user: {
          id: 'usr-alpha-owner',
          email: 'owner@alpha.vn',
          employee: { firstName: 'Văn A', lastName: 'Nguyễn', phoneNumber: '0901234567' },
        },
      },
    ],
  };

  const mockOrgActive = {
    ...mockOrgPending,
    id: 'org-002',
    name: 'Công ty TNHH Beta',
    slug: 'beta-corp',
    status: 'ACTIVE',
    approvedAt: new Date('2026-09-02T10:00:00Z'),
    approvedBy: 'usr-super',
  };

  const mockOrgSuspended = {
    ...mockOrgPending,
    id: 'org-003',
    name: 'Công ty Cổ phần Gamma',
    slug: 'gamma-corp',
    status: 'SUSPENDED',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Access Control (SUPER_ADMIN Only) ───────────────────────────────────
  describe('1. Role-Based Access Control (SUPER_ADMIN Only)', () => {
    it('rejects regular Admin from accessing getTenantMetrics with 403 Forbidden', async () => {
      await expect(SuperAdminService.getTenantMetrics(regularAdminSession)).rejects.toThrow(ApiError);
      try {
        await SuperAdminService.getTenantMetrics(regularAdminSession);
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
        expect(err.message).toContain('Chỉ SUPER_ADMIN mới có quyền');
      }
    });

    it('rejects Employee from calling listTenants with 403 Forbidden', async () => {
      await expect(SuperAdminService.listTenants(employeeSession)).rejects.toThrow(ApiError);
      try {
        await SuperAdminService.listTenants(employeeSession);
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
      }
    });

    it('rejects regular Admin from performing tenant actions with 403 Forbidden', async () => {
      await expect(
        SuperAdminService.processTenantAction('org-001', 'APPROVE', regularAdminSession)
      ).rejects.toThrow(ApiError);
    });

    it('allows SUPER_ADMIN (lowercase super_admin) to access', async () => {
      (prisma.organization.count as any).mockResolvedValue(0);
      const metrics = await SuperAdminService.getTenantMetrics(superAdminSession);
      expect(metrics.maxTenants).toBe(5);
    });

    it('allows SUPER_ADMIN (uppercase SUPER_ADMIN) to access', async () => {
      (prisma.organization.count as any).mockResolvedValue(0);
      const metrics = await SuperAdminService.getTenantMetrics(superAdminCapsSession);
      expect(metrics.maxTenants).toBe(5);
    });
  });

  // ── 2. Metrics & Quota (X / 5) ──────────────────────────────────────────────
  describe('2. Metrics & Quota Calculation', () => {
    it('accurately computes Total, Pending, Active, Suspended, Rejected, and X / 5 Quota', async () => {
      (prisma.organization.count as any).mockImplementation((args: any) => {
        if (!args?.where?.status) return Promise.resolve(10); // total
        if (args.where.status === 'PENDING') return Promise.resolve(3);
        if (args.where.status === 'ACTIVE') return Promise.resolve(4);
        if (args.where.status === 'SUSPENDED') return Promise.resolve(1);
        if (args.where.status === 'REJECTED') return Promise.resolve(1);
        if (args.where.status === 'CLOSED') return Promise.resolve(1);
        return Promise.resolve(0);
      });

      const metrics = await SuperAdminService.getTenantMetrics(superAdminSession);

      expect(metrics.totalTenants).toBe(10);
      expect(metrics.pending).toBe(3);
      expect(metrics.active).toBe(4);
      expect(metrics.suspended).toBe(1);
      expect(metrics.rejected).toBe(1);
      expect(metrics.closed).toBe(1);
      expect(metrics.maxTenants).toBe(5);
      expect(metrics.activeQuotaDisplay).toBe('4 / 5');
      expect(metrics.canActivateMore).toBe(true);
    });

    it('flags canActivateMore as false when active tenants reach 5 / 5', async () => {
      (prisma.organization.count as any).mockImplementation((args: any) => {
        if (args?.where?.status === 'ACTIVE') return Promise.resolve(5);
        return Promise.resolve(5);
      });

      const metrics = await SuperAdminService.getTenantMetrics(superAdminSession);
      expect(metrics.activeQuotaDisplay).toBe('5 / 5');
      expect(metrics.canActivateMore).toBe(false);
    });
  });

  // ── 3. List Tenants ────────────────────────────────────────────────────────
  describe('3. List Tenants With Details', () => {
    it('returns formatted tenant list with owner, employees count, and branches count', async () => {
      (prisma.organization.findMany as any).mockResolvedValue([mockOrgPending]);
      (prisma.organization.count as any).mockResolvedValue(1);

      const result = await SuperAdminService.listTenants(superAdminSession);

      expect(result.items).toHaveLength(1);
      const item = result.items[0];
      expect(item.id).toBe('org-001');
      expect(item.name).toBe('Công ty Cổ phần Alpha');
      expect(item.slug).toBe('alpha-corp');
      expect(item.status).toBe('PENDING');
      expect(item.employeesCount).toBe(12);
      expect(item.branchesCount).toBe(2);
      expect(item.owner.name).toBe('Nguyễn Văn A');
      expect(item.owner.email).toBe('owner@alpha.vn');
      expect(item.owner.phone).toBe('0901234567');
    });

    it('passes search query and status filter to Prisma query', async () => {
      (prisma.organization.findMany as any).mockResolvedValue([]);
      (prisma.organization.count as any).mockResolvedValue(0);

      await SuperAdminService.listTenants(superAdminSession, {
        status: 'ACTIVE',
        search: 'alpha',
      });

      expect(prisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            OR: expect.any(Array),
          }),
        })
      );
    });
  });

  // ── 4. Lifecycle Actions & Strict Quota Enforcement ─────────────────────────
  describe('4. Lifecycle Actions & MAX_TENANTS = 5 Quota Enforcement', () => {
    it('successfully APPROVES a PENDING organization when active count is under limit (e.g. 3)', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgPending);
      // Active count is 3 (< 5)
      (prisma.organization.count as any).mockResolvedValue(3);
      (prisma.organization.update as any).mockResolvedValue({
        ...mockOrgPending,
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedBy: superAdminSession.userId,
      });

      const res = await SuperAdminService.processTenantAction(
        'org-001',
        'APPROVE',
        superAdminSession,
        { reason: 'Đủ điều kiện hồ sơ doanh nghiệp' }
      );

      expect(res.organization.status).toBe('ACTIVE');
      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-001' },
          data: expect.objectContaining({
            status: 'ACTIVE',
            approvedBy: superAdminSession.userId,
          }),
        })
      );

      // Audit Log recorded
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-001',
            actorId: superAdminSession.userId,
            action: 'TENANT_APPROVE',
            oldValues: { status: 'PENDING' },
            newValues: expect.objectContaining({ status: 'ACTIVE', reason: 'Đủ điều kiện hồ sơ doanh nghiệp' }),
          }),
        })
      );
    });

    it('BLOCKS APPROVE when 5 active tenants already exist (MAX_TENANTS = 5) — CANNOT activate 6th tenant', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgPending);
      // Active count is already 5!
      (prisma.organization.count as any).mockResolvedValue(5);

      await expect(
        SuperAdminService.processTenantAction('org-001', 'APPROVE', superAdminSession)
      ).rejects.toThrow(ApiError);

      try {
        await SuperAdminService.processTenantAction('org-001', 'APPROVE', superAdminSession);
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain('Không thể kích hoạt tenant thứ 6');
        expect(err.message).toContain('MAX_TENANTS = 5');
      }

      // Organization update must NOT have been called
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('rejects APPROVE if organization is not in PENDING status', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgActive);

      await expect(
        SuperAdminService.processTenantAction('org-002', 'APPROVE', superAdminSession)
      ).rejects.toThrow(ApiError);
    });

    it('successfully REJECTS a PENDING organization and logs audit trail', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgPending);
      (prisma.organization.update as any).mockResolvedValue({
        ...mockOrgPending,
        status: 'REJECTED',
      });

      const res = await SuperAdminService.processTenantAction(
        'org-001',
        'REJECT',
        superAdminSession,
        { reason: 'Mã số thuế không hợp lệ' }
      );

      expect(res.organization.status).toBe('REJECTED');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TENANT_REJECT',
            oldValues: { status: 'PENDING' },
            newValues: expect.objectContaining({ status: 'REJECTED' }),
          }),
        })
      );
    });

    it('successfully SUSPENDS an ACTIVE organization and logs audit trail', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgActive);
      (prisma.organization.update as any).mockResolvedValue({
        ...mockOrgActive,
        status: 'SUSPENDED',
      });

      const res = await SuperAdminService.processTenantAction(
        'org-002',
        'SUSPEND',
        superAdminSession,
        { reason: 'Quá hạn thanh toán phí dịch vụ' }
      );

      expect(res.organization.status).toBe('SUSPENDED');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TENANT_SUSPEND',
            oldValues: { status: 'ACTIVE' },
            newValues: expect.objectContaining({ status: 'SUSPENDED' }),
          }),
        })
      );
    });

    it('rejects SUSPEND if organization is not ACTIVE', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgPending);

      await expect(
        SuperAdminService.processTenantAction('org-001', 'SUSPEND', superAdminSession)
      ).rejects.toThrow(ApiError);
    });

    it('successfully ACTIVATES a SUSPENDED organization when active quota is available', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgSuspended);
      // Active count is 2 (< 5)
      (prisma.organization.count as any).mockResolvedValue(2);
      (prisma.organization.update as any).mockResolvedValue({
        ...mockOrgSuspended,
        status: 'ACTIVE',
      });

      const res = await SuperAdminService.processTenantAction(
        'org-003',
        'ACTIVATE',
        superAdminSession,
        { reason: 'Đã hoàn tất thanh toán phí duy trì' }
      );

      expect(res.organization.status).toBe('ACTIVE');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TENANT_ACTIVATE',
            oldValues: { status: 'SUSPENDED' },
            newValues: expect.objectContaining({ status: 'ACTIVE' }),
          }),
        })
      );
    });

    it('BLOCKS ACTIVATE when active tenants count is already 5 (MAX_TENANTS = 5)', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgSuspended);
      // Active count is already 5!
      (prisma.organization.count as any).mockResolvedValue(5);

      await expect(
        SuperAdminService.processTenantAction('org-003', 'ACTIVATE', superAdminSession)
      ).rejects.toThrow(ApiError);
      try {
        await SuperAdminService.processTenantAction('org-003', 'ACTIVATE', superAdminSession);
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toContain('Không thể kích hoạt tenant thứ 6');
      }
    });

    it('successfully CLOSES an organization permanently and logs audit trail', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgActive);
      (prisma.organization.update as any).mockResolvedValue({
        ...mockOrgActive,
        status: 'CLOSED',
      });

      const res = await SuperAdminService.processTenantAction(
        'org-002',
        'CLOSE',
        superAdminSession,
        { reason: 'Tổ chức chấm dứt hoạt động kinh doanh' }
      );

      expect(res.organization.status).toBe('CLOSED');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'TENANT_CLOSE',
            newValues: expect.objectContaining({ status: 'CLOSED' }),
          }),
        })
      );
    });
  });

  // ── 5. Get Tenant By ID & Audit Logs ───────────────────────────────────────
  describe('5. Get Tenant By ID', () => {
    it('throws 404 for non-existent tenant ID', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(null);

      await expect(
        SuperAdminService.getTenantById('non-existent-id', superAdminSession)
      ).rejects.toThrow(ApiError);
      try {
        await SuperAdminService.getTenantById('non-existent-id', superAdminSession);
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
      }
    });

    it('returns tenant details with associated audit logs', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgActive);
      (prisma.auditLog.findMany as any).mockResolvedValue([
        {
          id: 'log-1',
          action: 'TENANT_APPROVE',
          actor: { email: 'superadmin@antigravity.internal' },
          oldValues: { status: 'PENDING' },
          newValues: { status: 'ACTIVE' },
          createdAt: new Date(),
        },
      ]);

      const res = await SuperAdminService.getTenantById('org-002', superAdminSession);

      expect(res.organization.id).toBe('org-002');
      expect(res.auditLogs).toHaveLength(1);
      expect(res.auditLogs[0].action).toBe('TENANT_APPROVE');
      expect(res.auditLogs[0].actorEmail).toBe('superadmin@antigravity.internal');
    });
  });
});
