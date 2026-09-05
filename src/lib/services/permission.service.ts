import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { AuditService } from './audit.service';

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
   * Assign roles to a user (Admin only).
   * Generates PERMISSION_CHANGE audit log.
   */
  static async assignUserRoles(
    input: AssignUserRolesInput,
    session: UserSession,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    // Privilege Escalation Prevention: Only Admin can assign/modify roles
    if (!session.roles.includes('admin')) {
      throw ApiError.forbidden('Chỉ Quản trị viên tối cao (Admin) mới có quyền gán hoặc thay đổi vai trò tài khoản.');
    }

    if (!input.roleCodes || input.roleCodes.length === 0) {
      throw ApiError.badRequest('Tài khoản phải có ít nhất một vai trò hợp lệ.');
    }

    // Target user check
    const targetUser = await prisma.user.findUnique({
      where: { id: input.targetUserId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!targetUser) {
      throw ApiError.notFound(`Không tìm thấy người dùng có ID: ${input.targetUserId}`);
    }

    // Prevent self-lockout: An admin cannot remove the 'admin' role from themselves if they are the last admin
    if (session.userId === targetUser.id && !input.roleCodes.includes('admin')) {
      const adminCount = await prisma.userRole.count({
        where: {
          role: { code: 'admin' },
          user: { isActive: true },
        },
      });
      if (adminCount <= 1) {
        throw ApiError.badRequest(
          'Không thể tự thu hồi quyền Admin của chính mình khi bạn là Quản trị viên duy nhất còn hoạt động (Chống khóa hệ thống).'
        );
      }
    }

    // Resolve target roles
    const rolesToAssign = await prisma.role.findMany({
      where: { code: { in: input.roleCodes } },
    });

    if (rolesToAssign.length !== input.roleCodes.length) {
      const foundCodes = rolesToAssign.map((r) => r.code);
      const missing = input.roleCodes.filter((c) => !foundCodes.includes(c));
      throw ApiError.badRequest(`Các vai trò sau không tồn tại: ${missing.join(', ')}`);
    }

    const oldRoles = targetUser.userRoles.map((ur) => ur.role.code);
    const newRoles = rolesToAssign.map((r) => r.code);

    // Atomic transaction for role updates
    await prisma.$transaction(async (tx) => {
      // Remove current roles
      await tx.userRole.deleteMany({
        where: { userId: targetUser.id },
      });

      // Insert new roles
      await tx.userRole.createMany({
        data: rolesToAssign.map((role) => ({
          userId: targetUser.id,
          roleId: role.id,
        })),
      });

      // Record Audit Log: 8th Critical Event PERMISSION_CHANGE
      await AuditService.logPermissionChange({
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        actorId: session.userId,
        actionType: 'ASSIGN_ROLES',
        oldRoles,
        newRoles,
        ipAddress: clientInfo?.ipAddress,
        userAgent: clientInfo?.userAgent,
        tx,
      });
    });

    logger.info(`[PermissionService] Roles updated for ${targetUser.email}`, {
      targetUserId: targetUser.id,
      oldRoles,
      newRoles,
      actor: session.userId,
    });

    return {
      userId: targetUser.id,
      email: targetUser.email,
      roles: newRoles,
      updatedAt: new Date().toISOString(),
    };
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
    if (!session.roles.includes('admin')) {
      throw ApiError.forbidden('Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa quyền hạn của vai trò.');
    }

    const role = await prisma.role.findUnique({
      where: { code: input.roleCode },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw ApiError.notFound(`Không tìm thấy vai trò: ${input.roleCode}`);
    }

    // Verify all requested permissions exist
    const permissions = await prisma.permission.findMany({
      where: { code: { in: input.permissionCodes } },
    });

    const oldPermissions = role.rolePermissions.map((rp) => rp.permission.code);
    const newPermissions = permissions.map((p) => p.code);

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: { roleId: role.id },
      });

      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((p) => ({
            roleId: role.id,
            permissionId: p.id,
          })),
        });
      }

      // Record Audit Log: PERMISSION_CHANGE
      await AuditService.logPermissionChange({
        targetUserId: role.id, // Role entity ID
        targetEmail: `Role: ${role.name} (${role.code})`,
        actorId: session.userId,
        actionType: 'UPDATE_PERMISSIONS',
        oldPermissions,
        newPermissions,
        ipAddress: clientInfo?.ipAddress,
        userAgent: clientInfo?.userAgent,
        tx,
      });
    });

    logger.info(`[PermissionService] Permissions updated for role ${role.code}`, {
      role: role.code,
      oldPermissions,
      newPermissions,
      actor: session.userId,
    });

    return {
      roleCode: role.code,
      permissions: newPermissions,
      updatedAt: new Date().toISOString(),
    };
  }
}
