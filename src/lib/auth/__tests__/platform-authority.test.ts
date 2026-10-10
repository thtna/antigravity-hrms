import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { UserSession } from '@/types';
import { requireLivePlatformAuthority } from '../platform-authority';
import { requireSuperAdmin } from '../guard';

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), getSession: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock('../session', () => ({ getSession: mocks.getSession }));

const session: UserSession = {
  userId: 'platform-actor', email: 'platform@example.test', fullName: 'Platform',
  roles: ['super_admin'], permissions: ['*'], isActive: true, organizationId: null,
};
const actor = () => ({
  id: session.userId, isActive: true, deletedAt: null,
  userRoles: [{ role: { code: 'super_admin' } }],
});

describe('live canonical Platform authority', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue(actor());
    mocks.getSession.mockResolvedValue(session);
  });

  it('requires live canonical authority even with a signed Platform claim', async () => {
    await expect(requireSuperAdmin()).resolves.toEqual(session);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: session.userId },
      include: { userRoles: { include: { role: true } } } });
  });

  it.each(['SUPER_ADMIN', 'superadmin', ' super_admin ', 'admin', 'employee'])(
    'denies a live noncanonical grant %s despite canonical JWT', async (code) => {
      mocks.findUnique.mockResolvedValue({ ...actor(), userRoles: [{ role: { code } }] });
      await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
    });

  it.each([undefined, '', 'tenant-a'])('denies non-null organization context %s', async (organizationId) => {
    mocks.getSession.mockResolvedValue({ ...session, organizationId });
    await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each(['SUPER_ADMIN', 'superadmin', ' super_admin ', 'admin', 'hr', 'employee'])(
    'denies noncanonical JWT role %s even with wildcard permissions', async (role) => {
      mocks.getSession.mockResolvedValue({ ...session, roles: [role], tenantRole: 'OWNER' });
      await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

  it.each([
    ['revoked', { ...actor(), userRoles: [] }],
    ['inactive', { ...actor(), isActive: false }],
    ['deleted', { ...actor(), deletedAt: new Date() }],
    ['different identity', { ...actor(), id: 'another-user' }],
    ['ambiguous deletion state', { ...actor(), deletedAt: undefined }],
    ['missing grants', { ...actor(), userRoles: undefined }],
    ['missing user', null],
  ])('denies %s live authority', async (_, liveActor) => {
    mocks.findUnique.mockResolvedValue(liveActor);
    await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
  });

  it('uses the supplied transaction client, not the global client', async () => {
    const findUnique = vi.fn().mockResolvedValue(actor());
    const tx = { user: { findUnique } } as unknown as Pick<Prisma.TransactionClient, 'user'>;
    await requireLivePlatformAuthority(session, tx);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed on an unavailable live authority source', async () => {
    const error = new Error('authority unavailable');
    mocks.findUnique.mockRejectedValue(error);
    await expect(requireSuperAdmin()).rejects.toBe(error);
  });

  it('still rejects an unauthenticated request before any DB lookup', async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
