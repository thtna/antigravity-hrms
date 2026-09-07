import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { POST as resetPasswordHandler } from '@/app/api/v1/auth/reset-password/route';
import { POST as loginHandler } from '@/app/api/v1/auth/login/route';
import { middleware } from '@/middleware';
import { generatePasswordResetToken } from '@/lib/auth/password-reset';
import { prisma } from '@/lib/db/prisma';

// Mock dependencies
vi.mock('@/lib/db/prisma', () => {
  const p: any = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    organization: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma: p };
});

describe('PHASE 11A.0D — FORGOT / RESET PASSWORD FLOW REGRESSION SUITE', () => {
  const testUser = {
    id: 'usr-reset-001',
    email: 'user.reset@antigravity.internal',
    passwordHash: '$2a$10$oldHashForUserResetTesting1234567890abcdefghijklm',
    isActive: true,
    deletedAt: null,
    organizationId: 'org-pending-001',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.updateMany as unknown as Mock).mockResolvedValue({ count: 1 });
  });

  // --------------------------------------------------------------------------
  // 1. Middleware Unauthenticated Access Checks (Exact Match Whitelist)
  // --------------------------------------------------------------------------
  describe('1. Middleware Public Access & Protection Boundaries', () => {
    it('allows unauthenticated POST to exact /api/v1/auth/reset-password without session cookie', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      });

      const res = await middleware(req);
      // Middleware should allow the request through (NextResponse.next())
      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('still blocks similarly prefixed routes with 401 when unauthenticated', async () => {
      const routes = [
        'http://localhost:3000/api/v1/auth/reset-password/confirm',
        'http://localhost:3000/api/v1/auth/reset-password/step2',
        'http://localhost:3000/api/v1/auth/reset-password-admin',
      ];

      for (const route of routes) {
        const req = new NextRequest(route, {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            origin: 'http://localhost:3000',
          },
        });

        const res = await middleware(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error.code).toBe('UNAUTHORIZED');
        expect(json.error.message).toBe('Yêu cầu xác thực tài khoản. Vui lòng đăng nhập.');
      }
    });

    it('allows unauthenticated GET to /reset-password without redirecting to login', async () => {
      const req = new NextRequest('http://localhost:3000/reset-password?token=test_token_value', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
    });

    it('still blocks unauthenticated requests to protected APIs with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/employees', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
      expect(json.error.message).toBe('Yêu cầu xác thực tài khoản. Vui lòng đăng nhập.');
    });

    it('still blocks unauthenticated requests to protected web pages by redirecting to login', async () => {
      const req = new NextRequest('http://localhost:3000/dashboard', {
        method: 'GET',
        headers: {
          host: 'localhost:3000',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login?redirect=%2Fdashboard');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Reset Password Route Mutation Tests (No Session Required)
  // --------------------------------------------------------------------------
  describe('2. Password Reset API Route Execution', () => {
    it('succeeds for unauthenticated user with a valid HMAC token and updates passwordHash atomically', async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(testUser);
      (prisma.user.updateMany as unknown as Mock).mockResolvedValue({ count: 1 });

      const { token } = generatePasswordResetToken(testUser);

      // Request without any session cookie or Authorization header
      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: 'BrandNewSecurePassword@2026',
        }),
      });

      const res = await resetPasswordHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.reset).toBe(true);

      // Verify atomic updateMany was executed with oldPasswordHash condition
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
      const updateCall = (prisma.user.updateMany as unknown as Mock).mock.calls[0][0];
      expect(updateCall.where.id).toBe(testUser.id);
      expect(updateCall.where.passwordHash).toBe(testUser.passwordHash);
      expect(updateCall.data.passwordHash).toBeDefined();
      expect(updateCall.data.passwordHash).not.toBe('BrandNewSecurePassword@2026'); // Must be hashed

      // Verify bcrypt can verify the new password against updated hash
      const isMatch = await bcrypt.compare('BrandNewSecurePassword@2026', updateCall.data.passwordHash);
      expect(isMatch).toBe(true);

      // Verify organization was NOT touched or activated
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('ensures only ONE succeeds when two concurrent reset requests use the same token (Race Condition Defense)', async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(testUser);

      // Simulate atomic compare-and-swap: first succeeds (count=1), second fails (count=0)
      (prisma.user.updateMany as unknown as Mock)
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      const { token } = generatePasswordResetToken(testUser);

      const req1 = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: 'FirstConcurrentPassword@2026',
        }),
      });

      const req2 = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: 'SecondConcurrentPassword@2026',
        }),
      });

      // Fire both requests simultaneously
      const [res1, res2] = await Promise.all([
        resetPasswordHandler(req1),
        resetPasswordHandler(req2),
      ]);

      const json1 = await res1.json();
      const json2 = await res2.json();

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      const successfulJson = res1.status === 200 ? json1 : json2;
      const failedJson = res1.status === 400 ? json1 : json2;

      expect(successfulJson.success).toBe(true);
      expect(successfulJson.data.reset).toBe(true);

      expect(failedJson.success).toBe(false);
      expect(failedJson.error.message).toContain('không hợp lệ hoặc đã được sử dụng');

      // Both attempted updateMany, but only one matched count === 1
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
    });

    it('rejects missing or empty token with 422', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: '',
          newPassword: 'BrandNewSecurePassword@2026',
        }),
      });

      const res = await resetPasswordHandler(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
    });

    it('rejects invalid or tampered token with 400', async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(testUser);

      const { token } = generatePasswordResetToken(testUser);
      // Tamper with the token
      const tampered = token.slice(0, -6) + 'xxxxxx';

      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: tampered,
          newPassword: 'BrandNewSecurePassword@2026',
        }),
      });

      const res = await resetPasswordHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects expired token (> 15 minutes) with 400', async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(testUser);

      const { token } = generatePasswordResetToken(testUser);

      // Fast forward time past 15 min TTL
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 16 * 60 * 1000);

      try {
        const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            newPassword: 'BrandNewSecurePassword@2026',
          }),
        });

        const res = await resetPasswordHandler(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.success).toBe(false);
        expect(json.error.message).toContain('hết hạn');
        expect(prisma.user.updateMany).not.toHaveBeenCalled();
      } finally {
        Date.now = originalNow;
      }
    });

    it('rejects token reuse once user passwordHash has changed (One-Time Token Guarantee)', async () => {
      const { token } = generatePasswordResetToken(testUser);

      // Simulate that user has already reset their password
      const userAfterFirstReset = {
        ...testUser,
        passwordHash: await bcrypt.hash('FirstResetPassword@2026', 10),
      };
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(userAfterFirstReset);

      // Try to use the original token again
      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: 'SecondAttemptPassword@2026',
        }),
      });

      const res = await resetPasswordHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('không hợp lệ hoặc đã được sử dụng');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects short passwords (< 8 characters) with 422', async () => {
      const { token } = generatePasswordResetToken(testUser);

      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: 'short',
        }),
      });

      const res = await resetPasswordHandler(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.success).toBe(false);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('does not leak user existence if token user is not found or inactive (Anti-Enumeration)', async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(null);

      const { token } = generatePasswordResetToken(testUser);

      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: 'BrandNewSecurePassword@2026',
        }),
      });

      const res = await resetPasswordHandler(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.success).toBe(false);
      // Returns generic invalid token message, does NOT say "user not found"
      expect(json.error.message).toBe('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    });

    it('allows password reset even if the user belongs to a PENDING organization, without activating it', async () => {
      const pendingOrgUser = {
        ...testUser,
        organizationId: 'org-pending-999',
      };
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue(pendingOrgUser);
      (prisma.user.updateMany as unknown as Mock).mockResolvedValue({ count: 1 });

      const { token } = generatePasswordResetToken(pendingOrgUser);

      const req = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: 'BrandNewSecurePassword@2026',
        }),
      });

      const res = await resetPasswordHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Verify organization was not activated
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 3. End-to-End Regression Flow: PENDING Owner -> Reset Password -> Login
  // --------------------------------------------------------------------------
  describe('3. End-to-End PENDING Owner: Reset Password -> Login Verification', () => {
    it('successfully resets password for PENDING owner, verifies credentials on login, returns 403 PENDING (not 400), and proves OLD password fails', async () => {
      const initialPassword = 'InitialOwnerPassword@2026';
      const initialPasswordHash = await bcrypt.hash(initialPassword, 10);
      const newPassword = 'NewlyResetOwnerPassword@2026';

      // 1. Initial State: Owner registered for a PENDING organization
      let simulatedDbUser: any = {
        id: 'usr-pending-owner-001',
        email: 'pending.owner@newcorp.vn',
        passwordHash: initialPasswordHash,
        isActive: true,
        deletedAt: null,
        employee: null,
        userRoles: [{ role: { code: 'admin', rolePermissions: [] } }],
        organizationMembers: [
          {
            id: 'member-pending-001',
            organizationId: 'org-pending-456',
            role: 'OWNER',
            isActive: true,
            isDefault: true,
            organization: {
              id: 'org-pending-456',
              name: 'Công Ty Chờ Phê Duyệt',
              slug: 'cong-ty-cho-phe-duyet',
              status: 'PENDING', // PENDING status!
            },
          },
        ],
      };

      // Mock prisma lookups to reflect current user state
      (prisma.user.findUnique as unknown as Mock).mockImplementation(async ({ where }) => {
        if (where.id && where.id === simulatedDbUser.id) {
          return simulatedDbUser;
        }
        if (where.email && where.email === simulatedDbUser.email) {
          return simulatedDbUser;
        }
        return null;
      });

      // Mock updateMany to mutate user's passwordHash atomically
      (prisma.user.updateMany as unknown as Mock).mockImplementation(async ({ where, data }) => {
        if (where.id === simulatedDbUser.id && where.passwordHash === simulatedDbUser.passwordHash) {
          simulatedDbUser = {
            ...simulatedDbUser,
            passwordHash: data.passwordHash,
            updatedAt: data.updatedAt,
          };
          return { count: 1 };
        }
        return { count: 0 };
      });

      // 2. Generate valid unauthenticated reset token for this user
      const { token } = generatePasswordResetToken({
        id: simulatedDbUser.id,
        email: simulatedDbUser.email,
        passwordHash: simulatedDbUser.passwordHash,
      });

      // 3. Reset password via unauthenticated POST /api/v1/auth/reset-password
      const resetReq = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.99',
        },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });

      const resetRes = await resetPasswordHandler(resetReq);
      const resetJson = await resetRes.json();

      expect(resetRes.status).toBe(200);
      expect(resetJson.success).toBe(true);
      expect(resetJson.data.reset).toBe(true);

      // Verify that the password hash in the database was updated to the new hash
      expect(simulatedDbUser.passwordHash).not.toBe(initialPasswordHash);
      const isNewHashValid = await bcrypt.compare(newPassword, simulatedDbUser.passwordHash);
      expect(isNewHashValid).toBe(true);

      // 4. ATTEMPT LOGIN WITH OLD PASSWORD -> MUST FAIL with 400 Bad Request
      const oldPasswordLoginReq = new NextRequest('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'pending.owner@newcorp.vn',
          password: initialPassword,
        }),
      });

      const oldLoginRes = await loginHandler(oldPasswordLoginReq);
      const oldLoginJson = await oldLoginRes.json();

      expect(oldLoginRes.status).toBe(400);
      expect(oldLoginJson.success).toBe(false);
      expect(oldLoginJson.error.code).toBe('BAD_REQUEST');
      expect(oldLoginJson.error.message).toBe('Email hoặc mật khẩu không chính xác.');

      // 5. ATTEMPT LOGIN WITH NEW PASSWORD -> MUST ACCEPT CREDENTIALS & RETURN 403 PENDING
      const newPasswordLoginReq = new NextRequest('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'pending.owner@newcorp.vn',
          password: newPassword,
        }),
      });

      const newLoginRes = await loginHandler(newPasswordLoginReq);
      const newLoginJson = await newLoginRes.json();

      // STRICT REQUIREMENT: Response is 403 PENDING, NOT 400 invalid credentials
      expect(newLoginRes.status).toBe(403);
      expect(newLoginJson.success).toBe(false);
      expect(newLoginJson.error.code).toBe('FORBIDDEN');
      expect(newLoginJson.error.message).toContain('CHỜ DUYỆT (PENDING)');
      expect(newLoginJson.error.message).toBe(
        'Tài khoản doanh nghiệp của bạn đang ở trạng thái CHỜ DUYỆT (PENDING). Vui lòng đợi quản trị viên hệ thống phê duyệt.'
      );

      // 6. Test with whitespace/untrimmed and mixed-case email -> MUST ALSO ACCEPT CREDENTIALS & RETURN 403 PENDING
      const untrimmedLoginReq = new NextRequest('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: '   Pending.Owner@Newcorp.vn   ',
          password: newPassword,
        }),
      });

      const untrimmedLoginRes = await loginHandler(untrimmedLoginReq);
      const untrimmedLoginJson = await untrimmedLoginRes.json();

      expect(untrimmedLoginRes.status).toBe(403);
      expect(untrimmedLoginJson.success).toBe(false);
      expect(untrimmedLoginJson.error.code).toBe('FORBIDDEN');
      expect(untrimmedLoginJson.error.message).toContain('CHỜ DUYỆT (PENDING)');

      // 7. Reusing the same reset token MUST FAIL (Token invalidated by passwordHash change)
      const reuseTokenReq = new NextRequest('http://localhost:3000/api/v1/auth/reset-password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.99',
        },
        body: JSON.stringify({
          token,
          newPassword: 'AnotherPassword@2026',
        }),
      });

      const reuseRes = await resetPasswordHandler(reuseTokenReq);
      const reuseJson = await reuseRes.json();

      expect(reuseRes.status).toBe(400);
      expect(reuseJson.success).toBe(false);
      expect(reuseJson.error.message).toContain('không hợp lệ hoặc đã được sử dụng');

      // 8. STRICT SECURITY REQUIREMENT: Organization was NEVER activated
      expect(simulatedDbUser.organizationMembers[0].organization.status).toBe('PENDING');
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });
});
