import { getSession } from './session';
import { ApiError } from '@/lib/errors';
import { RoleCode, UserSession } from '@/types';
import { hasPermission, hasAnyRole } from './roles';

/**
 * Server-Side Guard: Ensures request is from an authenticated and active user
 */
export async function requireAuth(): Promise<UserSession> {
  const session = await getSession();

  if (!session) {
    throw ApiError.unauthorized('Yêu cầu xác thực tài khoản. Vui lòng đăng nhập.');
  }

  if (!session.isActive) {
    throw ApiError.forbidden('Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.');
  }

  return session;
}

/**
 * Server-Side Guard: Ensures authenticated user holds at least one of the allowed roles
 */
export async function requireRole(allowedRoles: RoleCode[]): Promise<UserSession> {
  const session = await requireAuth();

  // Admin always has global bypass
  if (session.roles.includes('admin')) {
    return session;
  }

  if (!hasAnyRole(session.roles, allowedRoles)) {
    throw ApiError.forbidden(
      `Bạn không có quyền truy cập chức năng này. Yêu cầu một trong các vai trò: ${allowedRoles.join(', ')}`
    );
  }

  return session;
}

/**
 * Server-Side Guard: Ensures user has a specific atomic permission
 */
export async function requirePermission(permission: string): Promise<UserSession> {
  const session = await requireAuth();

  if (session.roles.includes('admin')) {
    return session;
  }

  if (!hasPermission(session.permissions, permission)) {
    throw ApiError.forbidden(`Thao tác bị từ chối: Thiếu quyền hạn [${permission}]`);
  }

  return session;
}

/**
 * Anti-IDOR (Insecure Direct Object Reference) Protection Guard
 * Ensures a user can only access their own resources, unless they are Admin/HR
 */
export async function verifyOwnershipOrAdmin(
  targetOwnerId: string,
  errorMessage = 'Truy cập bị từ chối: Bạn không thể xem hoặc chỉnh sửa dữ liệu của người dùng khác (Chặn IDOR - Cross-User Access Blocked).'
): Promise<UserSession> {
  const session = await requireAuth();

  // Admins and HR have authorized system-wide access
  if (session.roles.includes('admin') || session.roles.includes('hr')) {
    return session;
  }

  // Check against either employeeId or userId
  const isOwner =
    session.employeeId === targetOwnerId || session.userId === targetOwnerId;

  if (!isOwner) {
    throw ApiError.forbidden(errorMessage);
  }

  return session;
}

/**
 * Generates Prisma where clause to enforce Data Scoping (Global / Department / Self)
 */
export function applyDataScope(session: UserSession) {
  if (session.roles.includes('admin') || session.roles.includes('hr')) {
    return {}; // Global scope: unrestricted
  }

  if (session.roles.includes('manager') && session.departmentId) {
    return {
      departmentId: session.departmentId, // Department scope
    };
  }

  // Default: Employee Self scope
  return {
    id: session.employeeId || session.userId,
  };
}
