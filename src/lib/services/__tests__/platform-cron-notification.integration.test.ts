import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import type { UserSession } from '@/types';

const io = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    organization: { count: vi.fn() },
    organizationMember: { findFirst: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    notification: {
      create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(),
      count: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(),
    },
    employee: { findFirst: vi.fn() },
    attendance: { findFirst: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    leaveRequest: { findMany: vi.fn(), count: vi.fn() },
    employeeKpiResult: { findMany: vi.fn() },
    payroll: { findFirst: vi.fn() },
  },
  sendEmail: vi.fn(), renderEmail: vi.fn(), runJob: vi.fn(), listJobs: vi.fn(),
}));

// Only I/O is replaced; authentication, authorization and query construction stay real.
vi.mock('@/lib/db/prisma', () => ({ prisma: io.db }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => io.cookies.has(name) ? { value: io.cookies.get(name) } : undefined,
    set: ({ name, value }: { name: string; value: string }) => io.cookies.set(name, value),
  }),
}));
vi.mock('@/lib/email/email.service', () => ({
  EmailService: { sendEmail: io.sendEmail, renderNotificationEmail: io.renderEmail },
}));
vi.mock('@/lib/jobs/job-runner', () => ({
  JobRunner: { runJob: io.runJob, listJobs: io.listJobs },
}));

import { POST as loginRoute } from '@/app/api/v1/auth/login/route';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { requireLivePlatformAuthority } from '@/lib/auth/platform-authority';
import { getSession, setSessionCookie, signSessionToken } from '@/lib/auth/session';
import { resetRateLimit } from '@/lib/security/rate-limit';
import { SuperAdminService } from '@/lib/services/super-admin.service';
import { DashboardService } from '@/lib/services/dashboard.service';
import { GET as listNotices, POST as publishNotice } from '@/app/api/v1/notifications/route';
import { POST as readNotice } from '@/app/api/v1/notifications/read/route';
import { POST as unreadNotice } from '@/app/api/v1/notifications/unread/route';
import { GET as unreadCount } from '@/app/api/v1/notifications/unread-count/route';
import { DELETE as deleteNotice } from '@/app/api/v1/notifications/[id]/route';
import { POST as dashboardRead } from '@/app/api/v1/dashboard/notifications/route';
import { GET as cronGet, POST as cronPost } from '@/app/api/v1/jobs/run/route';
import { middleware } from '@/middleware';

type Row = Record<string, any>;
type MemberRow = {
  userId: string; organizationId: string; role: string; isActive: boolean; isDefault?: boolean;
};
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const PASSWORD = 'Synthetic-test-password-only!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const CRON = 'synthetic-cron-only-not-a-real-secret';
const NOTICE_PATH = '/api/v1/notifications';
const CRON_PATH = '/api/v1/jobs/run';
let users: Row[];
let members: MemberRow[];
let organizations: Row[];
let notices: Row[];
let employees: Row[];

// Missing tenant filters genuinely expose the mixed A/B/NULL fixture to assertions.
// Unknown operators fail rather than silently producing already-scoped results.
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND') return expected.every((part: Row) => matches(row, part));
    if (key === 'OR') return expected.some((part: Row) => matches(row, part));
    if (expected && typeof expected === 'object') {
      if (Object.keys(expected).length === 1 && Array.isArray(expected.in)) {
        return expected.in.includes(row[key]);
      }
      if (!row[key] || typeof row[key] !== 'object') {
        throw new Error(`Unsupported synthetic predicate: ${key}`);
      }
      return matches(row[key], expected);
    }
    return row[key] === expected;
  });
}

function joinedMembers() {
  return members.map((member) => ({
    ...member,
    user: users.find((user) => user.id === member.userId),
    organization: organizations.find((org) => org.id === member.organizationId),
  }));
}

function grant(code: string, permissions: string[] = []) {
  return { role: { code, rolePermissions: permissions.map((code) => ({ permission: { code } })) } };
}

function request(path: string, body?: unknown, options: {
  method?: string; bearer?: string; cookie?: boolean; origin?: string;
} = {}) {
  const headers = new Headers({ host: 'localhost', 'content-type': 'application/json' });
  if (options.bearer !== undefined) headers.set('authorization', `Bearer ${options.bearer}`);
  if (options.origin) headers.set('origin', options.origin);
  if (options.cookie) {
    headers.set('cookie', [...io.cookies].map(([key, value]) => `${key}=${value}`).join('; '));
  }
  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function login(id: string): Promise<UserSession> {
  const user = users.find((entry) => entry.id === id)!;
  const response = await loginRoute(request('/api/v1/auth/login', { email: user.email, password: PASSWORD }));
  expect(response.status).toBe(200);
  const session = await getSession();
  expect(session?.userId).toBe(id);
  return session!;
}

async function storeSession(session: UserSession) {
  await setSessionCookie(await signSessionToken(session));
  expect(await getSession()).toMatchObject(session);
}

async function cronPipeline(req: NextRequest) {
  const response = await middleware(req);
  if (response.headers.get('x-middleware-next') !== '1') return { layer: 'middleware', response };
  if (req.nextUrl.pathname !== CRON_PATH) throw new Error('Refusing unmatched route dispatch');
  if (req.method === 'GET') return { layer: 'route', response: await cronGet() };
  if (req.method === 'POST') return { layer: 'route', response: await cronPost(req) };
  throw new Error('Unexpected test transport method');
}

function expectNoDelivery() {
  expect(io.db.notification.create).not.toHaveBeenCalled();
  expect(io.db.notification.createMany).not.toHaveBeenCalled();
  expect(io.sendEmail).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  // Vietnam is already February 1 while UTC is still January 31.
  vi.setSystemTime(new Date('2026-01-31T18:00:00.000Z'));
  vi.stubEnv('AUTH_SECRET', 'synthetic-auth-signing-key-only-at-least-32-characters');
  vi.stubEnv('CRON_SECRET', CRON);
  vi.stubEnv('AUTH_COOKIE_NAME', 'antigravity_session');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in integrated mock tests'); }));
  io.cookies.clear();
  resetRateLimit('login:127.0.0.1');
  organizations = [A, B].map((id) => ({ id, name: id, slug: id, status: 'ACTIVE', deletedAt: null, onboardingStep: 9 }));
  users = ['platform', 'shared', 'a-only', 'b-only'].map((id) => ({
    id, email: `${id}@synthetic.invalid`, passwordHash: PASSWORD_HASH,
    isActive: true, deletedAt: null, employee: null,
    userRoles: id === 'platform' ? [grant('super_admin')] : [],
  }));
  members = [
    { userId: 'shared', organizationId: A, role: 'ADMIN', isActive: true, isDefault: true },
    { userId: 'shared', organizationId: B, role: 'ADMIN', isActive: true, isDefault: false },
    { userId: 'a-only', organizationId: A, role: 'EMPLOYEE', isActive: true },
    { userId: 'b-only', organizationId: B, role: 'EMPLOYEE', isActive: true },
  ];
  notices = [A, B, null].map((organizationId, index) => ({
    id: `notice-${index}`, organizationId, userId: 'shared', isRead: false,
    title: 'Synthetic notice', message: 'Synthetic payload', type: 'system_event',
    actionUrl: null, createdAt: new Date(),
  }));
  employees = [A, B].map((organizationId) => ({
    id: `employee-${organizationId}`, organizationId, userId: 'shared',
    firstName: 'Synthetic', lastName: 'User', employeeCode: organizationId,
  }));
  io.db.user.findUnique.mockImplementation(async ({ where }) => {
    const user = users.find((row) => matches(row, where));
    return user ? { ...user, organizationMembers: joinedMembers().filter((row) => row.userId === user.id) } : null;
  });
  io.db.user.update.mockImplementation(async ({ where, data }) => {
    const user = users.find((row) => matches(row, where));
    if (!user) throw new Error('Synthetic user missing');
    return Object.assign(user, data);
  });
  io.db.auditLog.create.mockImplementation(async ({ data }) => ({ id: 'synthetic-audit', ...data }));
  io.db.organization.count.mockImplementation(async ({ where }) => organizations.filter((row) => matches(row, where)).length);
  io.db.organizationMember.findFirst.mockImplementation(async ({ where }) => joinedMembers().find((row) => matches(row, where)) ?? null);
  io.db.organizationMember.findMany.mockImplementation(async ({ where }) => joinedMembers().filter((row) => matches(row, where)));
  io.db.notification.findMany.mockImplementation(async ({ where, skip = 0, take = 100 }) =>
    notices.filter((row) => matches(row, where)).slice(skip, skip + take).map((row) => ({ ...row })));
  io.db.notification.count.mockImplementation(async ({ where }) => notices.filter((row) => matches(row, where)).length);
  io.db.notification.create.mockImplementation(async ({ data }) => {
    const row = { id: `created-${notices.length}`, createdAt: new Date(), ...data };
    notices.push(row);
    return { ...row };
  });
  io.db.notification.createMany.mockImplementation(async ({ data }) => {
    data.forEach((row: Row) => notices.push({ id: `created-${notices.length}`, createdAt: new Date(), ...row }));
    return { count: data.length };
  });
  io.db.notification.updateMany.mockImplementation(async ({ where, data }) => {
    const rows = notices.filter((row) => matches(row, where));
    rows.forEach((row) => Object.assign(row, data));
    return { count: rows.length };
  });
  io.db.notification.deleteMany.mockImplementation(async ({ where }) => {
    const rows = notices.filter((row) => matches(row, where));
    notices = notices.filter((row) => !rows.includes(row));
    return { count: rows.length };
  });
  io.db.employee.findFirst.mockImplementation(async ({ where }) => employees.find((row) => matches(row, where)) ?? null);
  io.db.attendance.findFirst.mockResolvedValue(null);
  io.db.attendance.findMany.mockResolvedValue([]);
  io.db.attendance.aggregate.mockResolvedValue({ _sum: { actualWorkHours: 0, otHours: 0 } });
  io.db.leaveRequest.findMany.mockResolvedValue([]);
  io.db.leaveRequest.count.mockResolvedValue(0);
  io.db.employeeKpiResult.findMany.mockResolvedValue([]);
  io.db.payroll.findFirst.mockResolvedValue(null);
  io.renderEmail.mockReturnValue('<p>Synthetic notice</p>');
  io.sendEmail.mockResolvedValue({ success: true });
  io.runJob.mockResolvedValue({ status: 'SUCCESS' });
});

afterEach(() => {
  try {
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(io.listJobs).not.toHaveBeenCalled();
  } finally {
    io.cookies.clear();
    resetRateLimit('login:127.0.0.1');
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

describe('R1 login/session/live authority integrated with tenant boundaries', () => {
  it('canonical Platform login passes live guard/direct service but not tenant notifications', async () => {
    const session = await login('platform');
    expect(session.organizationId).toBeNull();
    expect(session.roles).toContain('super_admin');
    await expect(requireLivePlatformAuthority(session)).resolves.toBeUndefined();
    await expect(requireSuperAdmin()).resolves.toMatchObject({ userId: 'platform' });
    await expect(SuperAdminService.getTenantMetrics(session)).resolves.toMatchObject({ totalTenants: 2 });
    expect((await listNotices(request(NOTICE_PATH))).status).toBe(403);
    expect((await publishNotice(request(NOTICE_PATH, { userIds: 'all', title: 'Test', message: 'Test' }))).status).toBe(403);
    expectNoDelivery();
  });

  it.each(['SUPER_ADMIN', 'superadmin'])('raw alias %s logs into tenant only, with no Platform default wildcard', async (alias) => {
    members[0].role = 'EMPLOYEE';
    users[1].userRoles = [grant(alias)];
    const session = await login('shared');
    expect(session.organizationId).toBe(A);
    expect(session.roles).not.toContain('super_admin');
    expect(session.permissions).not.toContain('*');
    expect((await listNotices(request(NOTICE_PATH))).status).toBe(200);
    await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
    await expect(SuperAdminService.getTenantMetrics(session)).rejects.toMatchObject({ statusCode: 403 });
    expect(io.db.organization.count).not.toHaveBeenCalled();
  });

  it('explicit legacy wildcard survives login but cannot substitute for canonical live authority', async () => {
    members[0].role = 'EMPLOYEE';
    users[1].userRoles = [grant('SUPER_ADMIN', ['*'])];
    const session = await login('shared');
    expect(session.permissions).toContain('*');
    expect((await listNotices(request(NOTICE_PATH))).status).toBe(200);
    const forged = { ...session, organizationId: null, roles: ['super_admin'] as UserSession['roles'] };
    await storeSession(forged);
    await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
    await expect(SuperAdminService.getTenantMetrics(forged)).rejects.toMatchObject({ statusCode: 403 });
    expect(io.db.organization.count).not.toHaveBeenCalled();
  });

  it('canonical live grant cannot authorize a tenant-context JWT', async () => {
    const session = await login('platform');
    const tenantClaim = { ...session, organizationId: A };
    await storeSession(tenantClaim);
    await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
    await expect(SuperAdminService.getTenantMetrics(tenantClaim)).rejects.toMatchObject({ statusCode: 403 });
    expect(io.db.organization.count).not.toHaveBeenCalled();
  });

  it.each(['revoked', 'inactive', 'deleted', 'alias'])('JWT issued before %s loses live Platform authority', async (change) => {
    const session = await login('platform');
    if (change === 'revoked') users[0].userRoles = [];
    if (change === 'inactive') users[0].isActive = false;
    if (change === 'deleted') users[0].deletedAt = new Date();
    if (change === 'alias') users[0].userRoles = [grant('SUPER_ADMIN')];
    expect((await getSession())?.roles).toContain('super_admin');
    await expect(requireSuperAdmin()).rejects.toMatchObject({ statusCode: 403 });
    await expect(SuperAdminService.getTenantMetrics(session)).rejects.toMatchObject({ statusCode: 403 });
    expect(io.db.organization.count).not.toHaveBeenCalled();
  });

  it.each(['inactive', 'deleted'])('login denies %s actor before JWT creation', async (change) => {
    if (change === 'inactive') users[0].isActive = false;
    else users[0].deletedAt = new Date();
    const response = await loginRoute(request('/api/v1/auth/login', { email: users[0].email, password: PASSWORD }));
    expect(response.status).toBe(403);
    expect(await getSession()).toBeNull();
    expect(io.db.user.update).not.toHaveBeenCalled();
    expect(io.db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('R2 actual middleware -> CRON route -> mocked execution', () => {
  it.each([
    { jobName: 'CACHE_WARMUP', params: {} },
    { jobName: 'NOTIFICATION_PRUNING', params: { retentionDays: 90 } },
    { jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate: '2026-01-31', organizationId: A } },
  ])('dispatches valid $jobName without a cookie', async (body) => {
    const result = await cronPipeline(request(CRON_PATH, body, { bearer: CRON }));
    expect(result.layer).toBe('route');
    expect(result.response.status).toBe(200);
    expect(io.cookies.size).toBe(0);
    expect(io.runJob).toHaveBeenCalledExactlyOnceWith(body.jobName, body.params);
  });

  it.each([undefined, 'wrong-synthetic-secret'])('missing/wrong bearer %s fails at route after cookie exemption', async (bearer) => {
    const result = await cronPipeline(request(CRON_PATH, { jobName: 'CACHE_WARMUP' }, { bearer }));
    expect(result.layer).toBe('route');
    expect(result.response.status).toBe(401);
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'HR_MANAGER'])('real tenant %s login JWT cannot replace CRON bearer', async (role) => {
    members[0].role = role;
    const session = await login('shared');
    expect(session.roles).toContain(role === 'ADMIN' ? 'admin' : 'hr');
    const result = await cronPipeline(request(CRON_PATH, { jobName: 'CACHE_WARMUP' }, { cookie: true }));
    expect(result.layer).toBe('route');
    expect(result.response.status).toBe(401);
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it('foreign Origin is denied before valid bearer can reach the route', async () => {
    const result = await cronPipeline(request(CRON_PATH, { jobName: 'CACHE_WARMUP' }, {
      bearer: CRON, origin: 'https://foreign.synthetic.invalid',
    }));
    expect(result.layer).toBe('middleware');
    expect(result.response.status).toBe(403);
    expect((await result.response.json()).error.message).toContain('CSRF');
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it.each(['/api/v1/jobs/run/', '/api/v1/jobs/run/extra', '/api/v1/jobs/runner'])('no cookie exemption for %s', async (path) => {
    const response = await middleware(request(path, { jobName: 'CACHE_WARMUP' }, { bearer: CRON }));
    expect(response.status).toBe(401);
    expect(response.headers.get('x-middleware-next')).not.toBe('1');
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it.each([false, true])('GET cookie=%s returns the correct middleware/route outcome, never registry', async (cookie) => {
    if (cookie) await login('shared');
    const result = await cronPipeline(request(CRON_PATH, undefined, { cookie, bearer: CRON }));
    expect(result.layer).toBe(cookie ? 'route' : 'middleware');
    expect(result.response.status).toBe(cookie ? 405 : 401);
    if (cookie) expect(result.response.headers.get('allow')).toBe('POST');
    const body = await result.response.json();
    expect(body.success).toBe(false);
    expect(body).not.toHaveProperty('data');
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it.each(['2026-02-01', '2026-02-02'])('rejects Vietnam today/future %s despite January UTC date', async (targetDate) => {
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-01-31');
    const result = await cronPipeline(request(CRON_PATH, {
      jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate },
    }, { bearer: CRON }));
    expect(result.response.status).toBe(400);
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it('omitted targetDate remains absent rather than being fabricated by the route', async () => {
    const result = await cronPipeline(request(CRON_PATH, { jobName: 'DAILY_ATTENDANCE_RECONCILIATION' }, { bearer: CRON }));
    expect(result.response.status).toBe(200);
    expect(io.runJob).toHaveBeenCalledExactlyOnceWith('DAILY_ATTENDANCE_RECONCILIATION', {});
  });

  it.each([1, 89])('retentionDays=%s cannot prune earlier than 90 days', async (retentionDays) => {
    const result = await cronPipeline(request(CRON_PATH, { jobName: 'NOTIFICATION_PRUNING', params: { retentionDays } }, { bearer: CRON }));
    expect(result.response.status).toBe(400);
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it.each([
    { jobName: 'UNKNOWN' },
    { jobName: 'CACHE_WARMUP', params: { organizationId: A } },
    { jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate: '2026-02-30' } },
    { jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate: '2026-1-1' } },
    { jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { organizationId: 'not-a-uuid' } },
    { jobName: 'NOTIFICATION_PRUNING', params: { retentionDays: '90' } },
    { jobName: 'CACHE_WARMUP', unexpected: true },
    null,
  ])('unknown/malformed payload %# never dispatches', async (body) => {
    const result = await cronPipeline(request(CRON_PATH, body, { bearer: CRON }));
    expect(result.response.status).toBe(400);
    expect(io.runJob).not.toHaveBeenCalled();
  });

  it('malformed JSON is rejected at the authenticated CRON route', async () => {
    const req = new NextRequest(`http://localhost${CRON_PATH}`, {
      method: 'POST', headers: { host: 'localhost', authorization: `Bearer ${CRON}`, 'content-type': 'application/json' }, body: '{',
    });
    const result = await cronPipeline(req);
    expect(result.layer).toBe('route');
    expect(result.response.status).toBe(400);
    expect(io.runJob).not.toHaveBeenCalled();
  });
});

describe('R3 shared-user persistence, live membership and dashboard integration', () => {
  it('the same signed identity switches A/B without leaking A or legacy NULL via API/dashboard', async () => {
    const session = await login('shared');
    for (const [organizationId, id] of [[A, 'notice-0'], [B, 'notice-1'], [A, 'notice-0']]) {
      await storeSession({ ...session, organizationId });
      const response = await listNotices(request(`${NOTICE_PATH}?organizationId=${organizationId === A ? B : A}`));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data.items.map((row: Row) => row.id)).toEqual([id]);
      expect(body.data.meta).toMatchObject({ total: 1, unreadCount: 1 });
      const badge = await unreadCount(request(`${NOTICE_PATH}/unread-count`));
      expect((await badge.json()).data.unreadCount).toBe(1);
      const active = (await getSession())!;
      const dashboard = await DashboardService.getEmployeeDashboard(active);
      expect(dashboard.notifications.items.map((row) => row.id)).toEqual([id]);
      expect(dashboard.notifications.unreadCount).toBe(1);
    }
    expect(notices).toHaveLength(3);
    expect(notices.every((row) => row.isRead === false)).toBe(true);
  });

  it('B read/unread/delete and dashboard read cannot change A or legacy NULL', async () => {
    const session = await login('shared');
    await storeSession({ ...session, organizationId: B });
    for (const id of ['notice-0', 'notice-2']) {
      const original = notices.map((row) => ({ ...row }));
      const read = await readNotice(request(`${NOTICE_PATH}/read`, { notificationId: id }));
      expect((await read.json()).data.updatedCount).toBe(0);
      const unread = await unreadNotice(request(`${NOTICE_PATH}/unread`, { notificationId: id }));
      expect((await unread.json()).success).toBe(false);
      const dashboard = await dashboardRead(request('/api/v1/dashboard/notifications', { notificationId: id }));
      expect((await dashboard.json()).data.markedCount).toBe(0);
      const deleted = await deleteNotice(request(`${NOTICE_PATH}/${id}`, undefined, { method: 'DELETE' }), { params: Promise.resolve({ id }) });
      expect(deleted.status).toBe(404);
      expect(notices).toEqual(original);
    }
    const read = await readNotice(request(`${NOTICE_PATH}/read`, { notificationId: 'notice-1' }));
    expect((await read.json()).data.updatedCount).toBe(1);
    const unread = await unreadNotice(request(`${NOTICE_PATH}/unread`, { notificationId: 'notice-1' }));
    expect((await unread.json()).success).toBe(true);
    const deleted = await deleteNotice(request(`${NOTICE_PATH}/notice-1`, undefined, { method: 'DELETE' }), { params: Promise.resolve({ id: 'notice-1' }) });
    expect(deleted.status).toBe(200);
    expect(notices.map((row) => row.id)).toEqual(['notice-0', 'notice-2']);
  });

  it.each(['api', 'dashboard'])('%s mark-all changes only current B, not A/NULL or another user', async (boundary) => {
    const session = await login('shared');
    await storeSession({ ...session, organizationId: B });
    notices.push({ ...notices[1], id: 'other-user', userId: 'b-only' });
    const response = boundary === 'api'
      ? await readNotice(request(`${NOTICE_PATH}/read`, {}))
      : await dashboardRead(request('/api/v1/dashboard/notifications', {}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[boundary === 'api' ? 'updatedCount' : 'markedCount']).toBe(1);
    expect(notices.filter((row) => row.isRead).map((row) => row.id)).toEqual(['notice-1']);
  });

  it('broadcast all uses live tenant recipients and ignores forged client organization', async () => {
    await login('shared');
    const response = await publishNotice(request(NOTICE_PATH, { userIds: 'all', organizationId: B, title: 'Test', message: 'Test' }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.broadcastCount).toBe(2);
    const created = notices.slice(3);
    expect(created.map((row) => row.userId).sort()).toEqual(['a-only', 'shared']);
    expect(created.every((row) => row.organizationId === A)).toBe(true);
    expect(io.sendEmail).not.toHaveBeenCalled();
  });

  it('foreign recipient in an array rejects the entire broadcast', async () => {
    await login('shared');
    const response = await publishNotice(request(NOTICE_PATH, { userIds: ['a-only', 'b-only'], title: 'Test', message: 'Test' }));
    expect(response.status).toBe(403);
    expectNoDelivery();
    expect(notices).toHaveLength(3);
  });

  it.each(['revoked', 'demoted', 'inactive-user', 'deleted-user', 'inactive-org'])('stale Admin JWT after %s cannot broadcast or insert', async (change) => {
    const session = await login('shared');
    expect(session.roles).toContain('admin');
    if (change === 'revoked') members[0].isActive = false;
    if (change === 'demoted') members[0].role = 'EMPLOYEE';
    if (change === 'inactive-user') users[1].isActive = false;
    if (change === 'deleted-user') users[1].deletedAt = new Date();
    if (change === 'inactive-org') organizations[0].status = 'SUSPENDED';
    for (const recipient of [{ userIds: 'all' }, { userId: 'a-only', sendEmail: true }]) {
      const response = await publishNotice(request(NOTICE_PATH, { ...recipient, title: 'Test', message: 'Test' }));
      expect(response.status).toBe(403);
    }
    expectNoDelivery();
    expect(notices).toHaveLength(3);
  });

  it('revoked membership also blocks API/dashboard reads before notification queries', async () => {
    const session = await login('shared');
    members[0].isActive = false;
    expect((await listNotices(request(NOTICE_PATH))).status).toBe(403);
    await expect(DashboardService.getEmployeeDashboard(session)).rejects.toMatchObject({ statusCode: 403 });
    expect(io.db.notification.findMany).not.toHaveBeenCalled();
    expect(io.db.notification.count).not.toHaveBeenCalled();
  });

  it('email mismatch rejects before insert/render/send', async () => {
    await login('shared');
    const response = await publishNotice(request(NOTICE_PATH, {
      userId: 'a-only', title: 'Test', message: 'Test', sendEmail: true, emailRecipient: 'outside@synthetic.invalid',
    }));
    expect(response.status).toBe(400);
    expectNoDelivery();
    expect(io.renderEmail).not.toHaveBeenCalled();
    expect(notices).toHaveLength(3);
  });

  it('single recipient uses authoritative email and tenant, not client organization', async () => {
    await login('shared');
    const response = await publishNotice(request(NOTICE_PATH, {
      userId: 'a-only', organizationId: B, title: 'Test', message: 'Test', sendEmail: true,
      emailRecipient: ' A-ONLY@SYNTHETIC.INVALID ',
    }));
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({ organizationId: A, userId: 'a-only' });
    expect(io.sendEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ to: 'a-only@synthetic.invalid' }));
    expect(notices.slice(3)).toHaveLength(1);
  });
});
