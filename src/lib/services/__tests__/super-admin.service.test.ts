import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SuperAdminService, type TenantAction } from '../super-admin.service';
import { MAX_REGISTERED_TENANTS } from '@/lib/constants/tenant-quota';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
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
    organizationId: null,
    permissions: ['*'],
    isActive: true,
  };

  const superAdminCapsSession: UserSession = {
    userId: 'usr-super-caps',
    email: 'superadmin.caps@antigravity.internal',
    fullName: 'System Super Admin Caps',
    roles: ['SUPER_ADMIN'],
    organizationId: null,
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
    vi.resetAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: superAdminSession.userId, isActive: true, deletedAt: null,
      userRoles: [{ role: { code: 'super_admin' } }],
    } as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(prisma));
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.organization.count).mockResolvedValue(0);
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

    it('rejects SUPER_ADMIN (uppercase alias) without querying tenant data', async () => {
      (prisma.organization.count as any).mockResolvedValue(0);
      await expect(SuperAdminService.getTenantMetrics(superAdminCapsSession))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.organization.count).not.toHaveBeenCalled();
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
      expect(metrics.registeredQuotaDisplay).toBe('10 / 5');
      expect(metrics.canRegisterMore).toBe(false);
      expect(prisma.organization.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    });

    it('flags canRegisterMore as false when registered tenants reach 5 / 5', async () => {
      (prisma.organization.count as any).mockImplementation((args: any) => {
        if (args?.where?.status === 'ACTIVE') return Promise.resolve(5);
        return Promise.resolve(5);
      });

      const metrics = await SuperAdminService.getTenantMetrics(superAdminSession);
      expect(metrics.registeredQuotaDisplay).toBe('5 / 5');
      expect(metrics.canRegisterMore).toBe(false);
    });

    it.each([0, 4, 5, 7])('uses %i registered tenants for quota with no active tenants', async (total) => {
      (prisma.organization.count as any).mockImplementation((args: any) =>
        Promise.resolve(args?.where?.status ? 0 : total)
      );
      const metrics = await SuperAdminService.getTenantMetrics(superAdminSession);
      expect(metrics.active).toBe(0);
      expect(metrics.registeredQuotaDisplay).toBe(`${total} / ${MAX_REGISTERED_TENANTS}`);
      expect(metrics.canRegisterMore).toBe(total < MAX_REGISTERED_TENANTS);
      expect(metrics).not.toHaveProperty('activeQuotaDisplay');
      expect(metrics).not.toHaveProperty('canActivateMore');
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

  // ── 4. Lifecycle Actions For Existing Registered Tenants ────────────────────
  describe('4. Lifecycle Actions Preserve Registration Slots', () => {
    it('successfully APPROVES a PENDING organization and records the audit trail', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgPending);
      // Metrics are refreshed after the transition.
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
          where: { id: 'org-001', status: 'PENDING', updatedAt: mockOrgPending.updatedAt, deletedAt: null },
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

    it('APPROVES an existing PENDING tenant even when 5 tenants are active', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgPending);
      (prisma.organization.count as any).mockResolvedValue(5);
      (prisma.organization.update as any).mockResolvedValue({ ...mockOrgPending, status: 'ACTIVE' });
      const result = await SuperAdminService.processTenantAction('org-001', 'APPROVE', superAdminSession);
      expect(result.organization.status).toBe('ACTIVE');
      expect(prisma.organization.update).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.organization.count).toHaveBeenCalledTimes(6); // Post-action metrics only.
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

    it('successfully ACTIVATES a SUSPENDED organization and records the audit trail', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgSuspended);
      // Metrics are refreshed after the transition.
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

    it('ACTIVATES an existing SUSPENDED tenant even when 5 tenants are active', async () => {
      (prisma.organization.findUnique as any).mockResolvedValue(mockOrgSuspended);
      (prisma.organization.count as any).mockResolvedValue(5);
      (prisma.organization.update as any).mockResolvedValue({ ...mockOrgSuspended, status: 'ACTIVE' });
      const result = await SuperAdminService.processTenantAction('org-003', 'ACTIVATE', superAdminSession);
      expect(result.organization.status).toBe('ACTIVE');
      expect(prisma.organization.update).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.organization.count).toHaveBeenCalledTimes(6);
    });

    it.each([
      ['APPROVE', 'ACTIVE'], ['REJECT', 'ACTIVE'], ['SUSPEND', 'PENDING'],
      ['ACTIVATE', 'ACTIVE'], ['CLOSE', 'CLOSED'], ['INVALID', 'PENDING'],
    ])('rejects invalid %s from %s without writes or audit', async (action, status) => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({ ...mockOrgPending, status } as any);
      await expect(SuperAdminService.processTenantAction('org-001', action as TenantAction, superAdminSession))
        .rejects.toMatchObject({ statusCode: 400, errorCode: 'BAD_REQUEST' });
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
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

  describe('Live authority and lifecycle transaction boundary (mock proof only)', () => {
    it.each(['metrics', 'list', 'detail', 'action'])(
      'direct %s entry rejects a revoked grant before tenant access or writes', async (entry) => {
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
          id: superAdminSession.userId, isActive: true, deletedAt: null, userRoles: [],
        } as any);
        const calls: Record<string, () => Promise<unknown>> = {
          metrics: () => SuperAdminService.getTenantMetrics(superAdminSession),
          list: () => SuperAdminService.listTenants(superAdminSession),
          detail: () => SuperAdminService.getTenantById('org-001', superAdminSession),
          action: () => SuperAdminService.processTenantAction('org-001', 'APPROVE', superAdminSession),
        };
        await expect(calls[entry]()).rejects.toMatchObject({ statusCode: 403 });
        expect(prisma.organization.findMany).not.toHaveBeenCalled();
        expect(prisma.organization.findUnique).not.toHaveBeenCalled();
        expect(prisma.organization.count).not.toHaveBeenCalled();
        expect(prisma.organization.update).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
      });

    it('locks, validates authority, reads state, updates, audits and reads metrics inside one transaction', async () => {
      let inTransaction = false;
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        inTransaction = true;
        try { return await callback(prisma); } finally { inTransaction = false; }
      });
      (prisma.user.findUnique as unknown as Mock).mockImplementation(async () => {
        expect(inTransaction).toBe(true);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
        return { id: superAdminSession.userId, isActive: true, deletedAt: null,
          userRoles: [{ role: { code: 'super_admin' } }] } as any;
      });
      (prisma.organization.findUnique as unknown as Mock).mockImplementation(async () => {
        expect(inTransaction).toBe(true);
        expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
        return mockOrgPending as any;
      });
      vi.mocked(prisma.organization.update).mockResolvedValue({ ...mockOrgPending, status: 'ACTIVE' } as any);
      (prisma.auditLog.create as unknown as Mock).mockImplementation(async () => {
        expect(inTransaction).toBe(true);
        expect(prisma.organization.update).toHaveBeenCalledTimes(1);
        return {} as any;
      });
      (prisma.organization.count as unknown as Mock).mockImplementation(async () => {
        expect(inTransaction).toBe(true);
        expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
        return 1;
      });
      const result = await SuperAdminService.processTenantAction('org-001', 'APPROVE', superAdminSession);
      expect(result.organization.status).toBe('ACTIVE');
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
      expect(vi.mocked(prisma.$queryRaw).mock.calls.map((call: any) => call[0].text)).toEqual([
        expect.stringContaining('FROM "organizations"'), expect.stringContaining('FROM "users"'),
        expect.stringContaining('FROM "roles"'), expect.stringContaining('FROM "user_roles"'),
      ]);
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.organization.count).toHaveBeenCalledTimes(6);
    });

    it.each(['P2025', 'P2034'])('fails closed on %s without audit or automatic retry', async (code) => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrgPending as any);
      vi.mocked(prisma.organization.update).mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
        'concurrent state change', { code, clientVersion: 'test' }));
      await expect(SuperAdminService.processTenantAction('org-001', 'APPROVE', superAdminSession))
        .rejects.toMatchObject({ statusCode: 409 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it.each(['audit', 'metrics'])('does not commit the staged organization when %s fails', async (stage) => {
      let committedStatus = 'PENDING';
      let stagedStatus = committedStatus;
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const result = await callback(prisma);
        committedStatus = stagedStatus;
        return result;
      });
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrgPending as any);
      (prisma.organization.update as unknown as Mock).mockImplementation(async () => {
        stagedStatus = 'ACTIVE';
        return { ...mockOrgPending, status: stagedStatus } as any;
      });
      const error = new Error(`${stage} unavailable`);
      if (stage === 'audit') vi.mocked(prisma.auditLog.create).mockRejectedValue(error);
      else vi.mocked(prisma.organization.count).mockRejectedValue(error);
      await expect(SuperAdminService.processTenantAction('org-001', 'APPROVE', superAdminSession)).rejects.toBe(error);
      expect(stagedStatus).toBe('ACTIVE');
      expect(committedStatus).toBe('PENDING');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
