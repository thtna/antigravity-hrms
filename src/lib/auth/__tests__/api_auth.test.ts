import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginHandler } from '@/app/api/v1/auth/login/route';
import { POST as registerHandler } from '@/app/api/v1/auth/register/route';
import { GET as meHandler } from '@/app/api/v1/auth/me/route';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/prisma';

// Mock dependencies
vi.mock('@/lib/db/prisma', () => {
  const p: any = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    organization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    role: {
      findUnique: vi.fn(),
    },
    userRole: {
      create: vi.fn(),
    },
    organizationMember: {
      create: vi.fn(),
    },
    branch: {
      create: vi.fn(),
    },
    employee: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (cb: any) => cb({
      organization: {
        create: vi.fn().mockResolvedValue({ id: 'org-reg-001', name: 'Công ty ABC', slug: 'cong-ty-abc-1234', status: 'PENDING' }),
      },
      user: {
        create: vi.fn().mockResolvedValue({ id: 'usr-reg-001', email: 'owner@abc.vn' }),
      },
      role: {
        findUnique: vi.fn().mockResolvedValue({ id: 'role-admin', code: 'admin' }),
      },
      userRole: {
        create: vi.fn().mockResolvedValue({}),
      },
      organizationMember: {
        create: vi.fn().mockResolvedValue({ id: 'member-001', role: 'OWNER' }),
      },
      branch: {
        create: vi.fn().mockResolvedValue({ id: 'branch-001', code: 'HQ' }),
      },
      employee: {
        create: vi.fn().mockResolvedValue({ id: 'emp-001' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    })),
  };
  return { prisma: p };
});

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

  // --------------------------------------------------------------------------
  // 6. Organization Status Guard: PENDING Rejection
  // --------------------------------------------------------------------------
  it('POST /api/v1/auth/login - should reject user if organization status is PENDING with 403 Forbidden', async () => {
    const mockPendingUser = {
      id: 'usr-pending-01',
      email: 'pending.owner@newcorp.vn',
      passwordHash: hashedPassword,
      isActive: true,
      employee: null,
      userRoles: [{ role: { code: 'admin', rolePermissions: [] } }],
      organizationMembers: [
        {
          id: 'member-001',
          organizationId: 'org-pending-123',
          role: 'OWNER',
          isDefault: true,
          isActive: true,
          organization: {
            id: 'org-pending-123',
            name: 'Công ty Chờ Duyệt',
            slug: 'cho-duyet',
            status: 'PENDING', // PENDING status!
          },
        },
      ],
    };

    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(mockPendingUser);

    const req = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'pending.owner@newcorp.vn',
        password: testPassword,
      }),
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toContain('PENDING');
  });

  // --------------------------------------------------------------------------
  // 7. Organization Status Guard: ACTIVE Success with Tenant Context
  // --------------------------------------------------------------------------
  it('POST /api/v1/auth/login - should authenticate and attach organizationId and tenantRole when organization is ACTIVE', async () => {
    const mockActiveUser = {
      id: 'usr-active-01',
      email: 'owner@realcorp.vn',
      passwordHash: hashedPassword,
      isActive: true,
      employee: {
        id: 'emp-real-001',
        firstName: 'Thành',
        lastName: 'Lê',
        departmentId: null,
      },
      userRoles: [],
      organizationMembers: [
        {
          id: 'member-002',
          organizationId: 'org-real-456',
          role: 'OWNER',
          isDefault: true,
          isActive: true,
          organization: {
            id: 'org-real-456',
            name: 'Công ty Cổ phần Real Corp',
            slug: 'real-corp',
            status: 'ACTIVE',
          },
        },
      ],
    };

    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(mockActiveUser);

    const req = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'owner@realcorp.vn',
        password: testPassword,
      }),
    });

    const res = await loginHandler(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.organizationId).toBe('org-real-456');
    expect(json.data.organizationName).toBe('Công ty Cổ phần Real Corp');
    expect(json.data.tenantRole).toBe('OWNER');
    expect(json.data.roles).toContain('admin');
  });

  // --------------------------------------------------------------------------
  // 8. Business Registration: POST /api/v1/auth/register
  // --------------------------------------------------------------------------
  it('POST /api/v1/auth/register - should create organization with status PENDING and user as OWNER', async () => {
    (prisma.user.findUnique as unknown as Mock).mockResolvedValue(null); // No duplicate user
    (prisma.organization.findFirst as unknown as Mock).mockResolvedValue(null); // No duplicate tax code

    const req = new NextRequest('http://localhost:3000/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        companyName: 'Công ty Công nghệ Toàn Cầu',
        taxCode: '0109998888',
        fullName: 'Nguyễn Văn Toàn',
        email: 'ceo@toancau.vn',
        phone: '0988776655',
        password: 'Password@2026',
      }),
    });

    const res = await registerHandler(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('PENDING');
  });
});
