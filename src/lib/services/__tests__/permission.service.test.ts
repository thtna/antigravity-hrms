import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, TenantRole } from '@prisma/client';
import { UserSession } from '@/types';

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    organizationMember: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    userRole: { deleteMany: vi.fn(), createMany: vi.fn() },
    role: { findUnique: vi.fn() },
    permission: { findMany: vi.fn() },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: db.$transaction } }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { PermissionService } from '../permission.service';

const ORG = 'tenant-a';
const ACTOR = 'actor';
const TARGET = 'target';
const DATE = new Date('2026-10-01T00:00:00Z');

function user(id: string, roleCode = 'employee') {
  return { id, email: `${id}@role-security.test`, isActive: true, deletedAt: null as Date | null,
    userRoles: [{ role: { code: roleCode } }] };
}

function membership(id: string, userId: string, role: TenantRole, organizationId = ORG) {
  return { id, userId, organizationId, role, isActive: true, updatedAt: DATE };
}

function fixture() {
  return {
    organization: { id: ORG, status: 'ACTIVE', deletedAt: null as Date | null },
    users: [user(ACTOR, 'admin'), user(TARGET)],
    members: [membership('member-actor', ACTOR, TenantRole.OWNER),
      membership('member-target', TARGET, TenantRole.EMPLOYEE)],
    template: { id: 'role-hr', code: 'hr', name: 'HR' },
    permissions: [{ id: 'perm-read', code: 'employee:read' },
      { id: 'perm-kiosk', code: 'attendance:kiosk' }],
    templatePermissions: [{ roleId: 'role-hr', permissionId: 'perm-read' }],
    audits: [] as Record<string, any>[],
  };
}

type State = ReturnType<typeof fixture>;
let committed: State;
let pending: State | undefined;
let commits: number;

function transactionState() {
  if (!pending) throw new Error('Database operation outside transaction');
  return pending;
}

function session(overrides: Partial<UserSession> = {}): UserSession {
  return { userId: ACTOR, email: 'actor@role-security.test', fullName: 'Role Actor',
    roles: ['admin'], permissions: ['*'], isActive: true, organizationId: ORG, ...overrides };
}

function assign(roleCodes = ['manager'], actor = session(), targetUserId = TARGET) {
  return PermissionService.assignUserRoles({ targetUserId, roleCodes }, actor);
}

function platformSession() {
  return session({ organizationId: null, roles: ['super_admin'] });
}

function setPlatform(code = 'super_admin') {
  committed.users[0].userRoles = [{ role: { code } }];
}

function setAdmin() {
  committed.members[0].role = TenantRole.ADMIN;
  committed.users.push(user('owner'));
  committed.members.push(membership('member-owner', 'owner', TenantRole.OWNER));
}

async function denied(operation: Promise<unknown>, before: State, statusCode = 403) {
  await expect(operation).rejects.toMatchObject({ statusCode });
  expect(committed).toEqual(before);
  expect(commits).toBe(0);
  expect(db.tx.auditLog.create).not.toHaveBeenCalled();
  expect(db.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  expect(db.tx.rolePermission.createMany).not.toHaveBeenCalled();
}

describe('Role writer containment (mock transaction contract, not PostgreSQL proof)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    committed = fixture();
    pending = undefined;
    commits = 0;
    // Stage writes in memory and publish only on callback success. No real locks or DB are simulated.
    db.$transaction.mockImplementation(async (callback) => {
      pending = structuredClone(committed);
      try {
        const result = await callback(db.tx);
        committed = pending!;
        commits++;
        return result;
      } finally {
        pending = undefined;
      }
    });
    db.tx.$queryRaw.mockImplementation(async () => { transactionState(); return []; });
    db.tx.organization.findUnique.mockImplementation(async ({ where }) => {
      const row = transactionState().organization;
      return row.id === where.id ? structuredClone(row) : null;
    });
    db.tx.user.findUnique.mockImplementation(async ({ where }) =>
      structuredClone(transactionState().users.find((row) => row.id === where.id) ?? null));
    db.tx.organizationMember.findMany.mockImplementation(async ({ where }) =>
      structuredClone(transactionState().members.filter((row) =>
        row.userId === where.userId && row.isActive === where.isActive)));
    db.tx.organizationMember.findFirst.mockImplementation(async ({ where }) => {
      const state = transactionState();
      const row = state.members.find((member) => member.organizationId === where.organizationId &&
        member.userId === where.userId && member.isActive === where.isActive);
      const target = state.users.find((item) => item.id === row?.userId);
      return row && target?.isActive && target.deletedAt === null
        ? structuredClone({ ...row, user: target }) : null;
    });
    db.tx.organizationMember.updateMany.mockImplementation(async ({ where, data }) => {
      const state = transactionState();
      const row = state.members.find((member) => member.id === where.id &&
        member.organizationId === where.organizationId && member.userId === where.userId &&
        member.role === where.role && member.isActive === where.isActive &&
        member.updatedAt.getTime() === where.updatedAt.getTime());
      const target = state.users.find((item) => item.id === row?.userId);
      if (!row || !target?.isActive || target.deletedAt ||
          state.organization.status !== 'ACTIVE' || state.organization.deletedAt) return { count: 0 };
      row.role = data.role;
      row.updatedAt = new Date('2026-10-10T00:00:00Z');
      return { count: 1 };
    });
    db.tx.role.findUnique.mockImplementation(async ({ where }) => {
      const state = transactionState();
      return where.code === state.template.code ? {
        ...state.template,
        rolePermissions: state.templatePermissions.map((grant) => ({
          permission: state.permissions.find((permission) => permission.id === grant.permissionId),
        })),
      } : null;
    });
    db.tx.permission.findMany.mockImplementation(async ({ where }) =>
      transactionState().permissions.filter((permission) => where.code.in.includes(permission.code)));
    db.tx.rolePermission.deleteMany.mockImplementation(async () => {
      const state = transactionState();
      const count = state.templatePermissions.length;
      state.templatePermissions = [];
      return { count };
    });
    db.tx.rolePermission.createMany.mockImplementation(async ({ data }) => {
      transactionState().templatePermissions.push(...data);
      return { count: data.length };
    });
    db.tx.auditLog.create.mockImplementation(async ({ data }) => {
      transactionState().audits.push(structuredClone(data));
      return { id: 'audit-created', ...data };
    });
  });

  afterEach(() => {
    expect(db.tx.userRole.deleteMany).not.toHaveBeenCalled();
    expect(db.tx.userRole.createMany).not.toHaveBeenCalled();
  });

  it('D01 denies missing actor identity', async () => {
    await denied(PermissionService.assignUserRoles({ targetUserId: TARGET, roleCodes: ['manager'] },
      undefined as unknown as UserSession), structuredClone(committed), 401);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each([TenantRole.EMPLOYEE, TenantRole.HR_MANAGER, TenantRole.MANAGER])(
    'D02/D03/D12 denies live %s despite stale JWT admin and wildcard', async (role) => {
      committed.members[0].role = role;
      await denied(assign(), structuredClone(committed));
      expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
    });

  it.each([undefined, null, '', '   '])('D04 denies missing tenant context %s', async (organizationId) => {
    await denied(assign(['manager'], session({ organizationId })), structuredClone(committed));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['foreign', 'unknown'])('D05 gives the same non-authorizing response for %s target', async (kind) => {
    if (kind === 'foreign') committed.members[1].organizationId = 'tenant-b';
    else committed.users = committed.users.filter((row) => row.id !== TARGET);
    await expect(assign()).rejects.toMatchObject({
      statusCode: 404, errorCode: 'NOT_FOUND', message: 'Eligible tenant membership not found.',
    });
    expect(commits).toBe(0);
    expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
    expect(db.tx.auditLog.create).not.toHaveBeenCalled();
    expect(db.tx.organizationMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, userId: TARGET, isActive: true,
        user: { isActive: true, deletedAt: null } },
    }));
  });

  it.each(['actor-inactive', 'actor-deleted', 'actor-missing', 'actor-membership-inactive',
    'target-inactive', 'target-deleted', 'target-membership-inactive'])(
    'D06 denies %s', async (kind) => {
      if (kind === 'actor-inactive') committed.users[0].isActive = false;
      if (kind === 'actor-deleted') committed.users[0].deletedAt = DATE;
      if (kind === 'actor-missing') committed.users.shift();
      if (kind === 'actor-membership-inactive') committed.members[0].isActive = false;
      if (kind === 'target-inactive') committed.users[1].isActive = false;
      if (kind === 'target-deleted') committed.users[1].deletedAt = DATE;
      if (kind === 'target-membership-inactive') committed.members[1].isActive = false;
      await denied(assign(), structuredClone(committed), kind.startsWith('target') ? 404 : 403);
      expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
    });

  it.each(['PENDING', 'REJECTED', 'SUSPENDED', 'CLOSED', 'deleted', 'missing'])(
    'D07 denies %s organization', async (kind) => {
      if (kind === 'deleted') committed.organization.deletedAt = DATE;
      else if (kind === 'missing') committed.organization.id = 'missing';
      else committed.organization.status = kind;
      await denied(assign(), structuredClone(committed));
      expect(db.tx.user.findUnique).not.toHaveBeenCalled();
    });

  it('D08 denies ambiguous actor even when JWT tenantRole claims OWNER', async () => {
    committed.members.push(membership('actor-b', ACTOR, TenantRole.OWNER, 'tenant-b'));
    await denied(assign(['manager'], session({ tenantRole: 'OWNER' })), structuredClone(committed));
    expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
  });

  it('D08 denies JWT organization not matching the sole live membership', async () => {
    committed.members[0].organizationId = 'tenant-b';
    await denied(assign(), structuredClone(committed));
  });

  it.each(['super_admin', 'SUPER_ADMIN', 'superadmin', ' SuperAdmin '])(
    'D09 protects platform target alias %s', async (code) => {
      committed.users[1].userRoles = [{ role: { code } }];
      await denied(assign(), structuredClone(committed));
      expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
    });

  it('separates live platform actor from tenant OWNER despite an admin JWT', async () => {
    setPlatform();
    await denied(assign(), structuredClone(committed));
  });

  it.each([[], ['owner'], ['OWNER'], ['super_admin'], ['SUPER_ADMIN'], ['superadmin'],
    ['HR_ADMIN'], ['unknown'], ['manager', 'employee'], ['manager', 'manager']].map((roleCodes) => ({ roleCodes })))(
    'D10 rejects forbidden or non-singleton grants $roleCodes in the service', async ({ roleCodes }) => {
      await denied(assign(roleCodes), structuredClone(committed), 400);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

  it('D12 denies removed actor membership without trusting JWT tenantRole', async () => {
    committed.members.shift();
    await denied(assign(['manager'], session({ tenantRole: 'OWNER' })), structuredClone(committed));
  });

  it.each([TenantRole.OWNER, TenantRole.ADMIN])('D13 ADMIN cannot modify another %s', async (role) => {
    setAdmin();
    committed.members[1].role = role;
    await denied(assign(), structuredClone(committed));
    expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
  });

  it('D13 OWNER cannot demote self or transfer OWNER via this writer', async () => {
    await denied(assign(['employee'], session(), ACTOR), structuredClone(committed));
    expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
  });

  it('D13 ADMIN cannot grant ADMIN even to self', async () => {
    setAdmin();
    await denied(assign(['admin'], session(), ACTOR), structuredClone(committed));
  });

  it.each([0, 2])('D14 fails closed on conditional update count %s (unit contract only)', async (count) => {
    db.tx.organizationMember.updateMany.mockResolvedValueOnce({ count });
    await denied(assign(), structuredClone(committed), 409);
  });

  it.each([
    ['P2034', undefined], ['P2010', { code: '40001' }], ['P2010', { code: '40P01' }],
  ] as const)('D14 returns conflict for %s without automatic retry (unit contract only)', async (code, meta) => {
    db.tx.$queryRaw.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('concurrent invalidation', {
      code, clientVersion: '6.19.3', meta,
    }));
    await denied(assign(), structuredClone(committed), 409);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
  });

  it('D14 commit-time invalidation rejects staged write and audit without retry (unit contract only)', async () => {
    const before = structuredClone(committed);
    db.$transaction.mockImplementationOnce(async (callback) => {
      pending = structuredClone(committed);
      try {
        await callback(db.tx);
        throw new Prisma.PrismaClientKnownRequestError('serialization rejected at commit', {
          code: 'P2034', clientVersion: '6.19.3',
        });
      } finally {
        pending = undefined;
      }
    });
    await expect(assign()).rejects.toMatchObject({ statusCode: 409, errorCode: 'CONFLICT' });
    expect(db.tx.organizationMember.updateMany).toHaveBeenCalledTimes(1);
    expect(db.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(commits).toBe(0);
    expect(committed).toEqual(before);
  });

  it.each([['admin', TenantRole.ADMIN], ['hr', TenantRole.HR_MANAGER],
    ['manager', TenantRole.MANAGER], ['employee', TenantRole.EMPLOYEE]])(
    'A01 live OWNER assigns %s while stale JWT employee does not restrict live authority', async (code, role) => {
      const oldUsers = structuredClone(committed.users);
      const result = await assign([code], session({ roles: ['employee'], permissions: [] }));
      expect(result).toEqual({ userId: TARGET, email: 'target@role-security.test',
        roles: [code], updatedAt: expect.any(String) });
      expect(Number.isNaN(Date.parse(result.updatedAt))).toBe(false);
      expect(committed.members[1].role).toBe(role);
      expect(committed.members[0].role).toBe('OWNER');
      expect(committed.users).toEqual(oldUsers);
      expect(commits).toBe(1);
      expect(committed.audits).toEqual([expect.objectContaining({
        organizationId: ORG, actorId: ACTOR, entity: 'organization_members', entityId: 'member-target',
        action: 'PERMISSION_CHANGE', oldValues: expect.objectContaining({ targetUserId: TARGET, roles: ['EMPLOYEE'] }),
        newValues: expect.objectContaining({ roles: [role] }),
      })]);
      expect(db.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
      expect(db.tx.rolePermission.createMany).not.toHaveBeenCalled();
    });

  it.each([['hr', TenantRole.HR_MANAGER], ['manager', TenantRole.MANAGER], ['employee', TenantRole.EMPLOYEE]])(
    'A01 live ADMIN assigns %s', async (code, role) => {
      setAdmin();
      await assign([code]);
      expect(committed.members[1].role).toBe(role);
      expect(committed.audits).toHaveLength(1);
      expect(commits).toBe(1);
    });

  it('allows ADMIN self-demotion while preserving OWNER and legacy admin grants', async () => {
    setAdmin();
    const oldUsers = structuredClone(committed.users);
    await assign(['employee'], session(), ACTOR);
    expect(committed.members[0].role).toBe('EMPLOYEE');
    expect(committed.members.find((row) => row.userId === 'owner')?.role).toBe('OWNER');
    expect(committed.users).toEqual(oldUsers);
    expect(committed.audits[0].entityId).toBe('member-actor');
  });

  it('A02 updates only target membership A, not B or legacy custom grants', async () => {
    committed.members.push(membership('target-b', TARGET, TenantRole.ADMIN, 'tenant-b'));
    committed.users[1].userRoles.push({ role: { code: 'HR_ADMIN' } });
    const oldUsers = structuredClone(committed.users);
    const other = structuredClone(committed.members[2]);
    const oldTemplates = structuredClone(committed.templatePermissions);
    await assign();
    expect(committed.members[1].role).toBe('MANAGER');
    expect(committed.members[2]).toEqual(other);
    expect(committed.users).toEqual(oldUsers);
    expect(committed.templatePermissions).toEqual(oldTemplates);
    expect(committed.audits).toHaveLength(1);
    expect(committed.audits[0].organizationId).toBe(ORG);
  });

  it('uses scoped conditional writes and ordered parameterized locks in a serializable transaction', async () => {
    await assign();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    const queries = db.tx.$queryRaw.mock.calls.map(([sql]) => sql as Prisma.Sql);
    expect(queries).toHaveLength(5);
    expect(queries.every((sql) => sql.text.includes('FOR UPDATE'))).toBe(true);
    expect(queries[0].values).toEqual([ORG]);
    expect(queries[1].text).toContain('ORDER BY "id"');
    expect(queries[1].values).toEqual([ACTOR, TARGET]);
    expect(queries[4].values).toEqual([ACTOR, ORG, TARGET]);
    expect(db.tx.$queryRaw.mock.invocationCallOrder[4]).toBeLessThan(db.tx.user.findUnique.mock.invocationCallOrder[0]);
    expect(db.tx.organizationMember.updateMany).toHaveBeenCalledWith({
      where: { id: 'member-target', organizationId: ORG, userId: TARGET, isActive: true,
        role: 'EMPLOYEE', updatedAt: DATE, user: { isActive: true, deletedAt: null },
        organization: { status: 'ACTIVE', deletedAt: null } },
      data: { role: 'MANAGER' },
    });
  });

  it('audit rejection prevents mock transaction completion and committed membership changes', async () => {
    const before = structuredClone(committed);
    const error = new Error('audit unavailable');
    db.tx.auditLog.create.mockRejectedValueOnce(error);
    await expect(assign()).rejects.toBe(error);
    expect(db.tx.organizationMember.updateMany).toHaveBeenCalledTimes(1);
    expect(db.tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(commits).toBe(0);
    expect(committed).toEqual(before);
  });

  it.each([session(), session({ organizationId: null }), platformSession(),
    session({ roles: ['super_admin'] }), session({ organizationId: '', roles: ['super_admin'] })])(
    'D11 denies tenant/wildcard/org-bound or stale platform template authority %#', async (actor) => {
      await denied(PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes: [] }, actor),
        structuredClone(committed));
    });

  it.each(['inactive', 'deleted', 'missing'])('D11 rejects %s live platform account', async (kind) => {
    setPlatform();
    if (kind === 'inactive') committed.users[0].isActive = false;
    if (kind === 'deleted') committed.users[0].deletedAt = DATE;
    if (kind === 'missing') committed.users.shift();
    await denied(PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes: [] }, platformSession()),
      structuredClone(committed));
  });

  it('A03 exact canonical live platform actor can change global template, not memberships or UserRole', async () => {
      setPlatform();
      const before = structuredClone(committed);
      const result = await PermissionService.updateRolePermissions({ roleCode: 'hr',
        permissionCodes: ['attendance:kiosk'] }, platformSession());
      expect(result).toEqual({ roleCode: 'hr', permissions: ['attendance:kiosk'], updatedAt: expect.any(String) });
      expect(committed.templatePermissions).toEqual([{ roleId: 'role-hr', permissionId: 'perm-kiosk' }]);
      expect(committed.users).toEqual(before.users);
      expect(committed.members).toEqual(before.members);
      expect(db.tx.organizationMember.updateMany).not.toHaveBeenCalled();
      expect(committed.audits).toEqual([expect.objectContaining({ organizationId: null,
        actorId: ACTOR, entity: 'roles', entityId: 'role-hr', action: 'PERMISSION_CHANGE',
        oldValues: expect.objectContaining({ roleCode: 'hr', permissions: ['employee:read'] }),
        newValues: expect.objectContaining({ permissions: ['attendance:kiosk'] }),
      })]);
    });

  it.each(['SUPER_ADMIN', 'superadmin', ' SuperAdmin ', ' super_admin '])(
    'denies noncanonical live Platform alias %s without mutation or audit', async (code) => {
      setPlatform(code);
      await denied(PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes: [] },
        platformSession()), structuredClone(committed));
      expect(db.tx.$queryRaw).toHaveBeenCalledTimes(3);
    });

  it.each(['SUPER_ADMIN', 'superadmin', ' super_admin '])(
    'denies noncanonical JWT alias %s before starting a template transaction', async (code) => {
      setPlatform();
      await denied(PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes: [] },
        session({ organizationId: null, roles: [code] as UserSession['roles'] })), structuredClone(committed));
      expect(db.$transaction).not.toHaveBeenCalled();
    });

  it('denies undefined Platform context rather than accepting it as null', async () => {
    setPlatform();
    await denied(PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes: [] },
      session({ organizationId: undefined, roles: ['super_admin'] })), structuredClone(committed));
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('preserves explicit empty global permission-list semantics for live platform authority', async () => {
    setPlatform();
    await PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes: [] }, platformSession());
    expect(committed.templatePermissions).toEqual([]);
    expect(db.tx.rolePermission.createMany).not.toHaveBeenCalled();
    expect(committed.audits).toHaveLength(1);
  });

  it.each([['unknown'], ['attendance:kiosk', 'unknown'], ['attendance:kiosk', 'attendance:kiosk']]
    .map((permissionCodes) => ({ permissionCodes })))(
    'rejects unknown/duplicate permission codes without partial template changes $permissionCodes', async ({ permissionCodes }) => {
      setPlatform();
      await denied(PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes },
        platformSession()), structuredClone(committed), 400);
    });

  it('rejects unknown role template without mutation or audit', async () => {
    setPlatform();
    await denied(PermissionService.updateRolePermissions({ roleCode: 'unknown', permissionCodes: [] },
      platformSession()), structuredClone(committed), 404);
  });

  it('global template audit rejection aborts mock transaction completion', async () => {
    setPlatform();
    const before = structuredClone(committed);
    const error = new Error('audit unavailable');
    db.tx.auditLog.create.mockRejectedValueOnce(error);
    await expect(PermissionService.updateRolePermissions({ roleCode: 'hr', permissionCodes: ['attendance:kiosk'] },
      platformSession())).rejects.toBe(error);
    expect(db.tx.rolePermission.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.tx.rolePermission.createMany).toHaveBeenCalledTimes(1);
    expect(commits).toBe(0);
    expect(committed).toEqual(before);
  });
});
