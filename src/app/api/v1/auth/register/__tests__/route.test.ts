import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { POST } from '../route';
import { MAX_REGISTERED_TENANTS } from '@/lib/constants/tenant-quota';
import { logger } from '@/lib/logger';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  outerCount: vi.fn(),
  userLookup: vi.fn(),
  taxLookup: vi.fn(),
  tx: {
    organization: { count: vi.fn(), create: vi.fn() },
    user: { create: vi.fn() },
    role: { findUnique: vi.fn() },
    userRole: { create: vi.fn() },
    organizationMember: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $transaction: mocks.transaction,
  organization: { count: mocks.outerCount, findFirst: mocks.taxLookup },
  user: { findUnique: mocks.userLookup },
} }));
vi.mock('@/lib/auth/password', () => ({ hashPassword: vi.fn(async () => 'test-only-hash') }));
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: vi.fn(() => ({ success: true })) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function request(email = 'owner@example.test') {
  return new NextRequest('http://localhost/api/v1/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: 'Quota Test Tenant', fullName: 'Test Owner',
      email, password: 'TestOnlyPassword1',
    }),
  });
}

function expectNoCreates() {
  for (const model of ['organization', 'user', 'userRole', 'organizationMember', 'auditLog'] as const) {
    expect(mocks.tx[model].create).not.toHaveBeenCalled();
  }
}

function serializationConflict() {
  return new Prisma.PrismaClientKnownRequestError('Test-only serialization conflict', {
    code: 'P2034', clientVersion: Prisma.prismaVersion.client,
  });
}

describe('Registered tenant quota: real registration handler with local Prisma mocks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userLookup.mockResolvedValue(null);
    mocks.taxLookup.mockResolvedValue(null);
    mocks.tx.organization.count.mockResolvedValue(4);
    mocks.tx.organization.create.mockResolvedValue({ id: 'test-org', name: 'Quota Test Tenant', status: 'PENDING' });
    mocks.tx.user.create.mockResolvedValue({ id: 'test-owner' });
    mocks.tx.role.findUnique.mockResolvedValue({ id: 'test-admin-role' });
    mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
  });

  it('permits the fifth registration and keeps all writes after the transaction-scoped count', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ success: true, data: { organizationId: 'test-org', status: 'PENDING' } });
    expect(mocks.transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(mocks.outerCount).not.toHaveBeenCalled();
    expect(mocks.tx.organization.count).toHaveBeenCalledExactlyOnceWith({ where: { deletedAt: null } });
    expect(mocks.tx.organization.create.mock.invocationCallOrder[0])
      .toBeGreaterThan(mocks.tx.organization.count.mock.invocationCallOrder[0]);
    for (const model of ['organization', 'user', 'userRole', 'organizationMember', 'auditLog'] as const) {
      expect(mocks.tx[model].create).toHaveBeenCalledTimes(1);
    }
    expect(mocks.tx.organization.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }));
    expect(mocks.tx.organizationMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: 'test-org', userId: 'test-owner', role: 'OWNER' }),
    }));
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: 'test-org', action: 'ORGANIZATION_REGISTER', actorId: 'test-owner' }),
    }));
  });

  it.each([5, 6, 10])('rejects registration at %i registered tenants without any creation', async (count) => {
    mocks.tx.organization.count.mockResolvedValue(count);
    const response = await POST(request());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, error: { code: 'BAD_REQUEST' } });
    expect(body.error.message).toContain(`${count}/${MAX_REGISTERED_TENANTS}`);
    expectNoCreates();
    expect(logger.info).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED'])
    ('counts non-soft-deleted %s organizations toward the full quota', async (status) => {
      const organizations = Array.from({ length: 5 }, () => ({ status, deletedAt: null }));
      mocks.tx.organization.count.mockImplementation(async ({ where }) => {
        expect(where).toEqual({ deletedAt: null });
        return organizations.filter((org) => org.deletedAt === where.deletedAt).length;
      });
      expect((await POST(request())).status).toBe(400);
      expectNoCreates();
    });

  it('excludes only soft-deleted organizations, not a status', async () => {
    const organizations = [
      ...['PENDING', 'SUSPENDED', 'REJECTED', 'CLOSED'].map((status) => ({ status, deletedAt: null })),
      { status: 'ACTIVE', deletedAt: new Date() },
    ];
    mocks.tx.organization.count.mockImplementation(async ({ where }) => {
      expect(where).toEqual({ deletedAt: null });
      return organizations.filter((org) => org.deletedAt === where.deletedAt).length;
    });
    expect((await POST(request())).status).toBe(201);
    expect(mocks.tx.organization.create).toHaveBeenCalledTimes(1);
  });

  it('fails safely on a serialization conflict before the callback with no retry or writes', async () => {
    mocks.transaction.mockRejectedValue(serializationConflict());
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'CONFLICT' } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expectNoCreates();
  });

  it('does not report success if Serializable commit fails after provisional writes', async () => {
    mocks.transaction.mockImplementation(async (callback) => {
      await callback(mocks.tx);
      throw serializationConflict();
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it('handles two last-slot requests when the mocked Serializable database aborts one commit', async () => {
    // This exercises conflict handling, not a substitute for live database concurrency testing.
    let attempts = 0;
    let committed = 0;
    mocks.transaction.mockImplementation(async (callback, options) => {
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const attempt = ++attempts;
      const result = await callback(mocks.tx);
      if (attempt === 2) throw serializationConflict();
      committed++;
      return result;
    });
    const responses = await Promise.all([POST(request('first@example.test')), POST(request('second@example.test'))]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(committed).toBe(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
