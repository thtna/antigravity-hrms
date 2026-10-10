import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserSession } from '@/types';
import { POST } from '../route';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  db: {
    user: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(), $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/auth/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.db }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const session: UserSession = { userId: 'platform', email: 'platform@example.test', fullName: 'Platform',
  roles: ['super_admin'], permissions: ['*'], organizationId: null, isActive: true };
const actor = { id: session.userId, isActive: true, deletedAt: null,
  userRoles: [{ role: { code: 'super_admin' } }] };
const date = new Date('2026-10-01T00:00:00Z');
const tenant = { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a', status: 'PENDING',
  deletedAt: null, approvedAt: null, createdAt: date, updatedAt: date };
function request() {
  return POST(new NextRequest('http://localhost/api/v1/super-admin/tenants/tenant-a/action', {
    method: 'POST', body: JSON.stringify({ action: 'APPROVE', reason: 'mock UAT' }),
  }), { params: Promise.resolve({ id: tenant.id }) });
}

describe('Platform lifecycle route with real guard/service and mocked database only', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue(session);
    mocks.db.user.findUnique.mockResolvedValue(actor);
    mocks.db.organization.findUnique.mockResolvedValue(tenant);
    mocks.db.organization.update.mockResolvedValue({ ...tenant, status: 'ACTIVE' });
    mocks.db.organization.count.mockResolvedValue(1);
    mocks.db.$queryRaw.mockResolvedValue([]);
    mocks.db.$transaction.mockImplementation(async (callback) => callback(mocks.db));
    mocks.db.auditLog.create.mockResolvedValue({});
  });

  it.each(['OWNER', 'ADMIN'])('denies tenant %s with JWT wildcard', async (tenantRole) => {
    mocks.getSession.mockResolvedValue({ ...session, roles: ['admin'], organizationId: tenant.id, tenantRole });
    expect((await request()).status).toBe(403);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.db.organization.update).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(['SUPER_ADMIN', 'superadmin', ' super_admin '])('denies alias-only live role %s', async (code) => {
    mocks.db.user.findUnique.mockResolvedValue({ ...actor, userRoles: [{ role: { code } }] });
    expect((await request()).status).toBe(403);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.db.organization.update).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });

  it('denies an organization-bound Platform JWT', async () => {
    mocks.getSession.mockResolvedValue({ ...session, organizationId: tenant.id });
    expect((await request()).status).toBe(403);
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it('revalidates a grant revoked after route guard but before lifecycle mutation', async () => {
    mocks.db.user.findUnique.mockResolvedValueOnce(actor).mockResolvedValueOnce({ ...actor, userRoles: [] });
    expect((await request()).status).toBe(403);
    expect(mocks.db.user.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.db.organization.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.organization.update).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows exact canonical authority and preserves response, tenant filters and atomic audit', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: {
      organization: { id: tenant.id, status: 'ACTIVE' }, metrics: { maxTenants: 5 },
    } });
    expect(mocks.db.user.findUnique).toHaveBeenCalledTimes(2);
    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(mocks.db.organization.update).toHaveBeenCalledWith({
      where: { id: tenant.id, status: 'PENDING', updatedAt: date, deletedAt: null },
      data: { status: 'ACTIVE', approvedAt: expect.any(Date), approvedBy: session.userId },
    });
    expect(mocks.db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: tenant.id, actorId: session.userId, action: 'TENANT_APPROVE' }),
    }));
    expect(mocks.db.organization.update).toHaveBeenCalledTimes(1);
    expect(mocks.db.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
