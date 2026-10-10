import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { AuditService } from './audit.service';
import { normalizeRole } from '@/lib/auth/roles';
import { Prisma, TenantRole } from '@prisma/client';
import { assertPlatformSession, requireLivePlatformAuthority } from '@/lib/auth/platform-authority';

export const ASSIGNABLE_ROLE_CODES = ['admin', 'hr', 'manager', 'employee'] as const;

const TENANT_ROLE_BY_CODE: Record<(typeof ASSIGNABLE_ROLE_CODES)[number], TenantRole> = {
  admin: TenantRole.ADMIN,
  hr: TenantRole.HR_MANAGER,
  manager: TenantRole.MANAGER,
  employee: TenantRole.EMPLOYEE,
};

function hasPlatformRole(user: { userRoles: { role: { code: string } }[] }) {
  return user.userRoles.some(({ role }) => normalizeRole(role.code) === 'super_admin');
}

async function lockUserAuthority(
  tx: Prisma.TransactionClient,
  userIds: string[],
  templateCode: string | null = null
) {
  const ids = Prisma.join([...new Set(userIds)].sort());
  // Lock parents and grants in a stable order, including absent-grant insert protection.
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "users" WHERE "id" IN (${ids}) ORDER BY "id" FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "roles"
    WHERE "id" IN (SELECT "role_id" FROM "user_roles" WHERE "user_id" IN (${ids}))
       OR "code" = ${templateCode}
    ORDER BY "id" FOR UPDATE
  `);
  await tx.$queryRaw(Prisma.sql`
    SELECT "user_id", "role_id" FROM "user_roles"
    WHERE "user_id" IN (${ids}) ORDER BY "user_id", "role_id" FOR UPDATE
  `);
}

async function authorityTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  try {
    return await prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' ||
          (error.code === 'P2010' && ['40001', '40P01'].includes(String(error.meta?.code))))) {
      throw ApiError.conflict('Authorization state changed concurrently. Please reload before retrying.');
    }
    throw error;
  }
}

export interface AssignUserRolesInput {
  targetUserId: string;
  roleCodes: string[];
}

export interface UpdateRolePermissionsInput {
  roleCode: string;
  permissionCodes: string[];
}

export class PermissionService {
  /**
   * List all roles with their assigned permissions
   */
  static async listRolesWithPermissions(session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xem danh sách phân quyền.');
    }

    const roles = await prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.rolePermissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        module: rp.permission.module,
        description: rp.permission.description,
      })),
    }));
  }

  /**
   * Assign one tenant membership role using live OWNER/ADMIN authority.
   * Legacy global grants are deliberately left untouched.
   */
  static async assignUserRoles(
    input: AssignUserRolesInput,
    session: UserSession,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    if (!session?.userId) throw ApiError.unauthorized();
    if (!session.isActive) throw ApiError.forbidden();
    const organizationId = session.organizationId;
    if (typeof organizationId !== 'string' || !organizationId.trim()) {
      throw ApiError.forbidden('An authenticated tenant context is required.');
    }
    const roleCode = input.roleCodes?.[0];
    if (!Array.isArray(input.roleCodes) || input.roleCodes.length !== 1 ||
        !ASSIGNABLE_ROLE_CODES.some((code) => code === roleCode)) {
      throw ApiError.badRequest('Exactly one canonical tenant-assignable role is required.');
    }
    const newRole = TENANT_ROLE_BY_CODE[roleCode as (typeof ASSIGNABLE_ROLE_CODES)[number]];

    const result = await authorityTransaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "organizations" WHERE "id" = ${organizationId} FOR UPDATE
      `);
      const organization = await tx.organization.findUnique({ where: { id: organizationId } });
      if (!organization || organization.status !== 'ACTIVE' || organization.deletedAt) {
        throw ApiError.forbidden('The tenant context is not active.');
      }

      await lockUserAuthority(tx, [session.userId, input.targetUserId]);
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "organization_members"
        WHERE "user_id" = ${session.userId}
           OR ("organization_id" = ${organizationId} AND "user_id" = ${input.targetUserId})
        ORDER BY "id" FOR UPDATE
      `);
      const actor = await tx.user.findUnique({
        where: { id: session.userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!actor || !actor.isActive || actor.deletedAt || hasPlatformRole(actor)) {
        throw ApiError.forbidden('Live tenant assignment authority is required.');
      }
      const memberships = await tx.organizationMember.findMany({
        where: { userId: actor.id, isActive: true },
      });
      // Existing JWTs do not prove explicit tenant selection for multi-membership actors.
      const actorMembership = memberships[0];
      if (memberships.length !== 1 || actorMembership.organizationId !== organizationId ||
          ![TenantRole.OWNER, TenantRole.ADMIN].some((role) => role === actorMembership.role)) {
        throw ApiError.forbidden('Unambiguous live OWNER or ADMIN authority is required.');
      }

      const target = await tx.organizationMember.findFirst({
        where: {
          organizationId,
          userId: input.targetUserId,
          isActive: true,
          user: { isActive: true, deletedAt: null },
        },
        include: { user: { include: { userRoles: { include: { role: true } } } } },
      });
      if (!target) throw ApiError.notFound('Eligible tenant membership not found.');
      if (hasPlatformRole(target.user) || target.role === TenantRole.OWNER ||
          (actorMembership.role === TenantRole.ADMIN &&
            (newRole === TenantRole.ADMIN ||
              (target.role === TenantRole.ADMIN && target.userId !== actor.id)))) {
        throw ApiError.forbidden('This membership role change is not permitted.');
      }

      const updated = await tx.organizationMember.updateMany({
        where: {
          id: target.id,
          organizationId,
          userId: input.targetUserId,
          isActive: true,
          role: target.role,
          updatedAt: target.updatedAt,
          user: { isActive: true, deletedAt: null },
          organization: { status: 'ACTIVE', deletedAt: null },
        },
        data: { role: newRole },
      });
      if (updated.count !== 1) {
        throw ApiError.conflict('The membership changed before the role update.');
      }
      await AuditService.logPermissionChange({
        scope: 'tenant',
        organizationId,
        membershipId: target.id,
        targetUserId: target.userId,
        targetEmail: target.user.email,
        actorId: session.userId,
        actionType: 'ASSIGN_ROLES',
        oldRoles: [target.role],
        newRoles: [newRole],
        ipAddress: clientInfo?.ipAddress,
        userAgent: clientInfo?.userAgent,
        tx,
      });
      return {
        userId: target.userId,
        email: target.user.email,
        roles: [roleCode],
        updatedAt: new Date().toISOString(),
      };
    });

    logger.info('[PermissionService] Tenant membership role updated', {
      targetUserId: result.userId,
      organizationId,
      actor: session.userId,
    });
    return result;
  }

  /**
   * Update permissions associated with a specific role.
   * Generates PERMISSION_CHANGE audit log.
   */
  static async updateRolePermissions(
    input: UpdateRolePermissionsInput,
    session: UserSession,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    assertPlatformSession(session);
    if (typeof input.roleCode !== 'string' || !input.roleCode.trim() ||
        !Array.isArray(input.permissionCodes) ||
        input.permissionCodes.some((code) => typeof code !== 'string' || !code.trim()) ||
        new Set(input.permissionCodes).size !== input.permissionCodes.length) {
      throw ApiError.badRequest('A role and distinct valid permission codes are required.');
    }

    const result = await authorityTransaction(async (tx) => {
      await lockUserAuthority(tx, [session.userId], input.roleCode);
      await requireLivePlatformAuthority(session, tx);
      const role = await tx.role.findUnique({
        where: { code: input.roleCode },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (!role) throw ApiError.notFound('Role template not found.');
      const permissions = await tx.permission.findMany({
        where: { code: { in: input.permissionCodes } },
      });
      if (permissions.length !== input.permissionCodes.length) {
        throw ApiError.badRequest('One or more permission codes do not exist.');
      }
      const oldPermissions = role.rolePermissions.map((rp) => rp.permission.code);
      const newPermissions = permissions.map((permission) => permission.code);
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        });
      }
      await AuditService.logPermissionChange({
        scope: 'platform',
        organizationId: null,
        roleId: role.id,
        roleCode: role.code,
        actorId: session.userId,
        actionType: 'UPDATE_PERMISSIONS',
        oldPermissions,
        newPermissions,
        ipAddress: clientInfo?.ipAddress,
        userAgent: clientInfo?.userAgent,
        tx,
      });
      return { roleCode: role.code, permissions: newPermissions, updatedAt: new Date().toISOString() };
    });

    logger.info('[PermissionService] Global role template permissions updated', {
      role: result.roleCode,
      actor: session.userId,
    });
    return result;
  }
}
