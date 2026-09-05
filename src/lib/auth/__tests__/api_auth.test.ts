import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginHandler } from '@/app/api/v1/auth/login/route';
import { GET as meHandler } from '@/app/api/v1/auth/me/route';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/prisma';

// Mock dependencies
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    setSessionCookie: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn(),
  };
});

describe('PHASE 2 — AUTHENTICATION API ROUTE TESTS', () => {
  const testPassword = 'Password@123';
  let hashedPassword: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    hashedPassword = await hashPassword(testPassword);
  });

  // --------------------------------------------------------------------------
  // 1. Valid Login Route Test
  // --------------------------------------------------------------------------
  it('POST /api/v1/auth/login - should authenticate successfully and never return password_hash', async () => {
    const mockDbUser = {
      id: 'usr-001',
      email: 'admin@antigravity.internal',
      passwordHash: hashedPassword,
      isActive: true,
      lastLoginAt: null,
      employee: {
        id: 'emp-001',
        firstName: 'Văn A',
        lastName: 'Nguyễn',
        departmentId: 'dept-01',
      },
      userRoles: [
        {
          role: {
            code: 'admin',
            rolePermissions: [],
          },
        },
      ],
    };

    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(mockDbUser);

    const req = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@antigravity.internal',
        password: testPassword,
      }),
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.email).toBe('admin@antigravity.internal');
    expect(json.data.fullName).toBe('Nguyễn Văn A');
    expect(json.data.roles).toContain('admin');
    // SECURITY CHECK: passwordHash must NOT be returned to client
    expect(json.data.passwordHash).toBeUndefined();
    expect(json.data.password_hash).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // 2. Invalid Login: Bad Password
  // --------------------------------------------------------------------------
  it('POST /api/v1/auth/login - should reject invalid password with 400 Bad Request', async () => {
    const mockDbUser = {
      id: 'usr-001',
      email: 'user@antigravity.internal',
      passwordHash: hashedPassword,
      isActive: true,
      employee: null,
      userRoles: [],
    };

    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(mockDbUser);

    const req = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'user@antigravity.internal',
        password: 'WrongPassword!',
      }),
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('Email hoặc mật khẩu không chính xác');
  });

  // --------------------------------------------------------------------------
  // 3. Invalid Login: Non-existent User
  // --------------------------------------------------------------------------
  it('POST /api/v1/auth/login - should reject non-existent user with 400 Bad Request', async () => {
    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(null);

    const req = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'ghost@antigravity.internal',
        password: 'AnyPassword@123',
      }),
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('Email hoặc mật khẩu không chính xác');
  });

  // --------------------------------------------------------------------------
  // 4. Inactive Account Login Rejection
  // --------------------------------------------------------------------------
  it('POST /api/v1/auth/login - should reject inactive user with 403 Forbidden', async () => {
    const mockInactiveUser = {
      id: 'usr-deactivated',
      email: 'fired@antigravity.internal',
      passwordHash: hashedPassword,
      isActive: false, // Inactive account
      employee: null,
      userRoles: [],
    };

    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(mockInactiveUser);

    const req = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'fired@antigravity.internal',
        password: testPassword,
      }),
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toContain('vô hiệu hóa');
  });

  // --------------------------------------------------------------------------
  // 5. GET /api/v1/auth/me - Unauthorized when no session
  // --------------------------------------------------------------------------
  it('GET /api/v1/auth/me - should reject unauthenticated request with 401', async () => {
    const { getSession } = await import('@/lib/auth/session');
    (getSession as unknown as Mock).mockResolvedValue(null);

    const res = await meHandler();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });
});
