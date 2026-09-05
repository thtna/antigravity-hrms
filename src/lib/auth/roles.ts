import { RoleCode } from '@/types';

/**
 * Role Definitions and Default Permissions
 */
export const ROLE_PERMISSIONS: Record<RoleCode, string[]> = {
  admin: [
    '*', // Full system access
    'user:manage',
    'role:manage',
    'employee:read',
    'employee:write',
    'employee:delete',
    'dept:read',
    'dept:write',
    'shift:manage',
    'attendance:manage',
    'attendance:checkin',
    'leave:manage',
    'leave:approve',
    'kpi:manage',
    'reward:manage',
    'payroll:manage',
    'payroll:calculate',
    'payroll:approve',
    'audit:read',
    'settings:manage',
  ],
  hr: [
    'employee:read',
    'employee:write',
    'dept:read',
    'dept:write',
    'shift:manage',
    'attendance:read',
    'attendance:adjust',
    'attendance:checkin',
    'leave:read',
    'leave:approve',
    'leave:manage',
    'kpi:manage',
    'reward:read',
    'reward:write',
    'reward:approve',
    'payroll:read',
    'payroll:approve_hr',
    'report:read',
  ],
  manager: [
    'employee:read_dept',
    'dept:read',
    'schedule:read_dept',
    'schedule:assign_dept',
    'attendance:read_dept',
    'attendance:adjust_review',
    'attendance:checkin',
    'leave:read_dept',
    'leave:approve_dept',
    'kpi:assign_dept',
    'kpi:evaluate',
    'reward:read_dept',
    'reward:create',
    'report:read_dept',
  ],
  employee: [
    'employee:read_self',
    'schedule:read_self',
    'schedule:swap_request',
    'attendance:checkin',
    'attendance:read_self',
    'attendance:adjust_request',
    'leave:request',
    'leave:read_self',
    'kpi:self_review',
    'kpi:read_self',
    'payroll:view_self',
  ],
};

/**
 * Normalizes input role string to canonical RoleCode
 */
export function normalizeRole(role: string): RoleCode {
  const normalized = role.toLowerCase().trim();
  if (normalized === 'admin' || normalized === 'super_admin') return 'admin';
  if (normalized === 'hr' || normalized === 'hr_admin') return 'hr';
  if (normalized === 'manager' || normalized === 'dept_manager' || normalized === 'department_manager') return 'manager';
  return 'employee';
}

/**
 * Checks if a set of user permissions satisfies a required permission
 */
export function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  if (userPermissions.includes('*')) return true;
  return userPermissions.includes(requiredPermission);
}

/**
 * Checks if a user has any of the allowed roles
 */
export function hasAnyRole(userRoles: RoleCode[], allowedRoles: RoleCode[]): boolean {
  return userRoles.some((role) => allowedRoles.includes(role));
}
