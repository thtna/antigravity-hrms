import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';

const getSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session', () => ({ getSession }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { PermissionService } from '@/lib/services/permission.service';
import { POST } from '../route';

const TARGET = '00000000-0000-4000-8000-000000000002';
const assign = vi.spyOn(PermissionService, 'assignUserRoles');
const actor: UserSession = { userId: '00000000-0000-4000-8000-000000000001',
  email: 'actor@role-security.test', fullName: 'Role Actor', roles: ['admin'], permissions: ['*'],
  isActive: true, organizationId: 'tenant-a', tenantRole: 'OWNER' };

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/v1/roles/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      'x-forwarded-for': '127.0.0.1', 'user-agent': 'role-route-unit-test' }, body: JSON.stringify(body),
  });
}

describe('Tenant role assignment route containment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue(actor);
    assign.mockResolvedValue({ userId: TARGET, email: 'target@role-security.test',
      roles: ['manager'], updatedAt: '2026-10-10T00:00:00.000Z' });
  });

  it('D01 denies anonymous callers before the writer', async () => {
    getSession.mockResolvedValue(null);
    const response = await POST(request({ targetUserId: TARGET, roleCodes: ['manager'] }));
    expect(response.status).toBe(401);
    expect(assign).not.toHaveBeenCalled();
  });

  it('denies an inactive session before the writer', async () => {
    getSession.mockResolvedValue({ ...actor, isActive: false });
    const response = await POST(request({ targetUserId: TARGET, roleCodes: ['manager'] }));
    expect(response.status).toBe(403);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([[], ['owner'], ['OWNER'], ['super_admin'], ['SUPER_ADMIN'], ['superadmin'],
    ['HR_ADMIN'], ['HR_MANAGER'], ['unknown'], ['manager', 'employee'], ['manager', 'manager']]
    .map((roleCodes) => ({ roleCodes })))(
    'D10 rejects noncanonical/non-singleton grants $roleCodes without calling the writer', async ({ roleCodes }) => {
      const response = await POST(request({ targetUserId: TARGET, roleCodes }));
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe('VALIDATION_FAILED');
      expect(assign).not.toHaveBeenCalled();
    });

  it.each(['organizationId', 'tenantId', 'tenantRole', 'permissions', 'scope'])(
    'rejects unexpected client authority field %s', async (field) => {
      const response = await POST(request({ targetUserId: TARGET, roleCodes: ['manager'], [field]: 'override' }));
      expect(response.status).toBe(422);
      expect(assign).not.toHaveBeenCalled();
    });

  it.each([{ targetUserId: 'invalid', roleCodes: ['manager'] },
    { targetUserId: TARGET }, { targetUserId: TARGET, roleCodes: 'manager' },
    { targetUserId: TARGET, roleCodes: [null] }])('rejects malformed input %#', async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(422);
    expect(assign).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON without calling the writer', async () => {
    const response = await POST(new NextRequest('http://localhost/api/v1/roles/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    }));
    expect(response.status).toBe(422);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(['admin', 'hr', 'manager', 'employee'])('passes canonical %s and server session unchanged', async (code) => {
    const result = { userId: TARGET, email: 'target@role-security.test', roles: [code],
      updatedAt: '2026-10-10T00:00:00.000Z' };
    assign.mockResolvedValueOnce(result);
    const response = await POST(request({ targetUserId: TARGET, roleCodes: [code] }));
    expect(response.status).toBe(200);
    expect(assign).toHaveBeenCalledExactlyOnceWith({ targetUserId: TARGET, roleCodes: [code] }, actor,
      { ipAddress: '127.0.0.1', userAgent: 'role-route-unit-test' });
    expect(await response.json()).toEqual({ success: true, data: result,
      meta: { message: expect.any(String), timestamp: expect.any(String) } });
  });

  it.each([ApiError.forbidden('Live authority denied'), ApiError.notFound('Eligible tenant membership not found.'),
    ApiError.conflict('Membership changed')])('preserves writer denial status/code %#', async (error) => {
      assign.mockRejectedValueOnce(error);
      const response = await POST(request({ targetUserId: TARGET, roleCodes: ['manager'] }));
      expect(response.status).toBe(error.statusCode);
      expect(await response.json()).toMatchObject({ success: false, error: { code: error.errorCode } });
      expect(assign).toHaveBeenCalledTimes(1);
    });
});
