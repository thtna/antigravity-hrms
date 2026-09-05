import { describe, it, expect, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../password';
import { signSessionToken, verifySessionToken } from '../session';
import { normalizeRole, hasPermission, hasAnyRole, ROLE_PERMISSIONS } from '../roles';
import { requireAuth, requireRole, requirePermission, verifyOwnershipOrAdmin } from '../guard';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';

// Mock session getter for testing guards in isolation
let mockSession: UserSession | null = null;
vi.mock('../session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../session')>();
  return {
    ...actual,
    getSession: vi.fn(async () => mockSession),
  };
});

describe('PHASE 2 — AUTHENTICATION & RBAC TEST SUITE', () => {
  const samplePassword = 'StrongPassword@2026';

  // --------------------------------------------------------------------------
  // 1. Password Hashing & Verification Tests
  // --------------------------------------------------------------------------
  describe('1. Password Hashing', () => {
    it('should securely hash password with bcrypt and verify successfully', async () => {
      const hash = await hashPassword(samplePassword);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(samplePassword);
      expect(hash.startsWith('$2')).toBe(true); // bcrypt prefix

      const isValid = await verifyPassword(samplePassword, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await hashPassword(samplePassword);
      const isInvalid = await verifyPassword('WrongPassword123', hash);
      expect(isInvalid).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. JWT Session Token Tests
  // --------------------------------------------------------------------------
  describe('2. JWT Session Tokens', () => {
    const testSession: UserSession = {
      userId: 'usr-admin-001',
      employeeId: 'emp-admin-001',
      email: 'admin@antigravity.internal',
      fullName: 'System Administrator',
      departmentId: 'dept-board',
      roles: ['admin'],
      permissions: ['*'],
      isActive: true,
    };

    it('should sign and verify valid session token', async () => {
      const token = await signSessionToken(testSession);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const verified = await verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(testSession.userId);
      expect(verified?.email).toBe(testSession.email);
      expect(verified?.roles).toContain('admin');
      expect(verified?.isActive).toBe(true);
    });

    it('should return null for tampered or invalid token', async () => {
      const token = await signSessionToken(testSession);
      const tamperedToken = token.slice(0, -5) + 'abcde';
      const verified = await verifySessionToken(tamperedToken);
      expect(verified).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 3. Role & Permission Mapping Tests
  // --------------------------------------------------------------------------
  describe('3. Role Normalization and Permissions', () => {
    it('should normalize role aliases accurately', () => {
      expect(normalizeRole('ADMIN')).toBe('admin');
      expect(normalizeRole('super_admin')).toBe('admin');
      expect(normalizeRole('HR')).toBe('hr');
      expect(normalizeRole('dept_manager')).toBe('manager');
      expect(normalizeRole('EMPLOYEE')).toBe('employee');
      expect(normalizeRole('unknown')).toBe('employee');
    });

    it('should check permissions correctly with wildcard support for admin', () => {
      const adminPerms = ROLE_PERMISSIONS['admin'];
      expect(hasPermission(adminPerms, 'employee:delete')).toBe(true);
      expect(hasPermission(adminPerms, 'any:random:permission')).toBe(true);

      const hrPerms = ROLE_PERMISSIONS['hr'];
      expect(hasPermission(hrPerms, 'employee:write')).toBe(true);
      expect(hasPermission(hrPerms, 'system:root_override')).toBe(false);

      const employeePerms = ROLE_PERMISSIONS['employee'];
      expect(hasPermission(employeePerms, 'attendance:checkin')).toBe(true);
      expect(hasPermission(employeePerms, 'employee:write')).toBe(false);
    });

    it('should check role inclusion correctly with hasAnyRole', () => {
      expect(hasAnyRole(['admin'], ['admin', 'hr'])).toBe(true);
      expect(hasAnyRole(['employee'], ['admin', 'hr'])).toBe(false);
      expect(hasAnyRole(['manager'], ['manager'])).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Unauthorized API Access Tests (requireAuth)
  // --------------------------------------------------------------------------
  describe('4. Unauthorized API Access', () => {
    it('should throw 401 Unauthorized if no active session exists', async () => {
      mockSession = null;
      await expect(requireAuth()).rejects.toThrow(ApiError);
      try {
        await requireAuth();
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(401);
        expect((err as ApiError).errorCode).toBe('UNAUTHORIZED');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 5. Inactive Account Tests
  // --------------------------------------------------------------------------
  describe('5. Inactive Account Handling', () => {
    it('should throw 403 Forbidden if user account is deactivated (isActive = false)', async () => {
      mockSession = {
        userId: 'usr-inactive-001',
        employeeId: 'emp-inactive-001',
        email: 'suspended@antigravity.internal',
        fullName: 'Suspended Employee',
        departmentId: 'dept-sales',
        roles: ['employee'],
        permissions: ['attendance:checkin'],
        isActive: false, // Inactive
      };

      await expect(requireAuth()).rejects.toThrow(ApiError);
      try {
        await requireAuth();
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(403);
        expect((err as ApiError).errorCode).toBe('FORBIDDEN');
        expect((err as ApiError).message).toContain('vô hiệu hóa');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 6. Role-Based Access Control Tests (requireRole & requirePermission)
  // --------------------------------------------------------------------------
  describe('6. Role & Permission Guards', () => {
    it('should grant access to admin regardless of specific route restrictions', async () => {
      mockSession = {
        userId: 'usr-admin-001',
        email: 'admin@antigravity.internal',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
      };

      const session = await requireRole(['hr', 'manager']);
      expect(session.userId).toBe('usr-admin-001');

      const permSession = await requirePermission('payroll:calculate');
      expect(permSession.userId).toBe('usr-admin-001');
    });

    it('should allow HR to access HR routes and reject regular Employee', async () => {
      // HR Session
      mockSession = {
        userId: 'usr-hr-001',
        email: 'hr@antigravity.internal',
        fullName: 'HR Officer',
        roles: ['hr'],
        permissions: ROLE_PERMISSIONS['hr'],
        isActive: true,
      };

      const hrAccess = await requireRole(['hr']);
      expect(hrAccess.roles).toContain('hr');

      // Regular Employee Session
      mockSession = {
        userId: 'usr-emp-001',
        email: 'emp@antigravity.internal',
        fullName: 'Regular Staff',
        roles: ['employee'],
        permissions: ROLE_PERMISSIONS['employee'],
        isActive: true,
      };

      await expect(requireRole(['hr'])).rejects.toThrow(ApiError);
      try {
        await requireRole(['hr']);
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(403);
      }
    });

    it('should reject employee without required permission', async () => {
      mockSession = {
        userId: 'usr-emp-001',
        email: 'emp@antigravity.internal',
        fullName: 'Regular Staff',
        roles: ['employee'],
        permissions: ['attendance:checkin'],
        isActive: true,
      };

      await expect(requirePermission('leave:approve')).rejects.toThrow(ApiError);
      try {
        await requirePermission('leave:approve');
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(403);
        expect((err as ApiError).errorCode).toBe('FORBIDDEN');
      }
    });
  });

  // --------------------------------------------------------------------------
  // 7. Anti-IDOR & Cross-User Access Tests (verifyOwnershipOrAdmin)
  // --------------------------------------------------------------------------
  describe('7. IDOR Prevention & Cross-User Access', () => {
    it('should allow employee to access their OWN record', async () => {
      mockSession = {
        userId: 'usr-emp-100',
        employeeId: 'emp-100',
        email: 'john@antigravity.internal',
        fullName: 'John Doe',
        roles: ['employee'],
        permissions: ['employee:read_self'],
        isActive: true,
      };

      const session = await verifyOwnershipOrAdmin('emp-100');
      expect(session.employeeId).toBe('emp-100');
    });

    it('should REJECT Employee A trying to access Employee B record (IDOR Block)', async () => {
      mockSession = {
        userId: 'usr-emp-100',
        employeeId: 'emp-100', // Employee A
        email: 'john@antigravity.internal',
        fullName: 'John Doe',
        roles: ['employee'],
        permissions: ['employee:read_self'],
        isActive: true,
      };

      // Attacking: Trying to read Employee B (emp-200)
      await expect(verifyOwnershipOrAdmin('emp-200')).rejects.toThrow(ApiError);
      try {
        await verifyOwnershipOrAdmin('emp-200');
      } catch (err) {
        expect((err as ApiError).statusCode).toBe(403);
        expect((err as ApiError).message.toLowerCase()).toContain('idor');
      }
    });

    it('should allow Admin to access any user record for system management', async () => {
      mockSession = {
        userId: 'usr-admin-001',
        employeeId: 'emp-admin-001',
        email: 'admin@antigravity.internal',
        fullName: 'Super Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
      };

      // Admin accesses Employee B
      const session = await verifyOwnershipOrAdmin('emp-200');
      expect(session.roles).toContain('admin');
    });
  });
});
