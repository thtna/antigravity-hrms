import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as logoutHandler } from '@/app/api/v1/auth/logout/route';
import {
  getSessionCookieName,
  clearSessionCookie,
  setSessionCookie,
  getSession,
  signSessionToken,
} from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { middleware } from '@/middleware';
import { UserSession } from '@/types';
import { cookies } from 'next/headers';

// Mock DB
vi.mock('@/lib/db/prisma', () => {
  return {
    prisma: {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-logout-01' }),
      },
    },
  };
});

// Mock next/headers
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => {
  return {
    cookies: vi.fn(async () => mockCookieStore),
  };
});

describe('PHASE 11A.0E — LOGOUT UX, AUDIT TRAIL & DYNAMIC AUTH_COOKIE_NAME REGRESSION TESTS', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // --------------------------------------------------------------------------
  // 1. Dynamic AUTH_COOKIE_NAME derivation (Staging vs Production)
  // --------------------------------------------------------------------------
  describe('1. Dynamic Cookie Name Derivation (STAGING: antigravity_session_staging)', () => {
    it('proves getSessionCookieName() dynamically reads process.env.AUTH_COOKIE_NAME', () => {
      process.env.AUTH_COOKIE_NAME = 'antigravity_session_staging';
      expect(getSessionCookieName()).toBe('antigravity_session_staging');

      process.env.AUTH_COOKIE_NAME = 'custom_tenant_cookie';
      expect(getSessionCookieName()).toBe('custom_tenant_cookie');

      delete process.env.AUTH_COOKIE_NAME;
      expect(getSessionCookieName()).toBe('antigravity_session');
    });

    it('proves clearSessionCookie() clears the configured AUTH_COOKIE_NAME (antigravity_session_staging)', async () => {
      process.env.AUTH_COOKIE_NAME = 'antigravity_session_staging';

      await clearSessionCookie();

      expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'antigravity_session_staging',
          value: '',
          maxAge: 0,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
        })
      );
    });

    it('proves setSessionCookie() and getSession() use the configured AUTH_COOKIE_NAME', async () => {
      process.env.AUTH_COOKIE_NAME = 'antigravity_session_staging';

      await setSessionCookie('mock.jwt.token');
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'antigravity_session_staging',
          value: 'mock.jwt.token',
        })
      );

      mockCookieStore.get.mockReturnValue({ value: undefined });
      await getSession();
      expect(mockCookieStore.get).toHaveBeenCalledWith('antigravity_session_staging');
    });

    it('proves middleware dynamically checks the configured AUTH_COOKIE_NAME (antigravity_session_staging)', async () => {
      process.env.AUTH_COOKIE_NAME = 'antigravity_session_staging';

      const validSession: UserSession = {
        userId: 'usr-staging-001',
        email: 'owner@stagingcorp.vn',
        fullName: 'Chủ Staging',
        roles: ['admin'],
        permissions: ['*'],
        organizationId: 'org-staging-01',
        tenantRole: 'OWNER',
        organizationStatus: 'ACTIVE',
        isActive: true,
      };

      const token = await signSessionToken(validSession);

      // Request with staging cookie passes
      const reqWithStagingCookie = new NextRequest('http://localhost:3000/dashboard', {
        headers: {
          cookie: `antigravity_session_staging=${token}`,
        },
      });

      const resWithStaging = await middleware(reqWithStagingCookie);
      expect(resWithStaging.status).toBe(200);

      // Request with wrong cookie name (old default) fails and redirects
      const reqWithOldCookie = new NextRequest('http://localhost:3000/dashboard', {
        headers: {
          cookie: `antigravity_session=${token}`,
        },
      });

      const resWithOld = await middleware(reqWithOldCookie);
      expect(resWithOld.status).toBe(307);
      expect(resWithOld.headers.get('location')).toContain('/login?redirect=%2Fdashboard');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Logout Endpoint & Audit Trail Preservation
  // --------------------------------------------------------------------------
  describe('2. POST /api/v1/auth/logout & Audit Trail Preservation', () => {
    it('records audit log with organizationId, IP, user-agent for tenant user and clears session', async () => {
      process.env.AUTH_COOKIE_NAME = 'antigravity_session_staging';

      const tenantSession: UserSession = {
        userId: 'usr-tenant-owner-01',
        email: 'owner@tanphong.vn',
        fullName: 'Nguyễn Văn Tân Phong',
        roles: ['admin'],
        permissions: ['*'],
        organizationId: 'org-tanphong-32b15bd9',
        tenantRole: 'OWNER',
        organizationStatus: 'ACTIVE',
        isActive: true,
      };

      const token = await signSessionToken(tenantSession);
      mockCookieStore.get.mockReturnValue({ value: token });

      const req = new NextRequest('http://localhost:3000/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '14.232.208.10',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });

      const res = await logoutHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toBe('Đăng xuất thành công.');

      // Audit log MUST preserve organizationId and actor context
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-tanphong-32b15bd9',
          actorId: 'usr-tenant-owner-01',
          action: 'LOGOUT',
          entity: 'users',
          entityId: 'usr-tenant-owner-01',
          ipAddress: '14.232.208.10',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        }),
      });

      // Cookie cleared using dynamic staging cookie name
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'antigravity_session_staging',
          value: '',
          maxAge: 0,
        })
      );
    });

    it('handles SUPER_ADMIN logout cleanly with organizationId: null without throwing', async () => {
      const superAdminSession: UserSession = {
        userId: 'usr-superadmin-01',
        email: 'superadmin@antigravity.internal',
        fullName: 'Platform Super Admin',
        roles: ['super_admin'],
        permissions: ['*'],
        organizationId: undefined, // Super Admin has no home organization
        isActive: true,
      };

      const token = await signSessionToken(superAdminSession);
      mockCookieStore.get.mockReturnValue({ value: token });

      const res = await logoutHandler();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // Audit log writes organizationId: null
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: null,
          actorId: 'usr-superadmin-01',
          action: 'LOGOUT',
        }),
      });
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '',
          maxAge: 0,
        })
      );
    });

    it('clears cookie gracefully when called with no active session', async () => {
      mockCookieStore.get.mockReturnValue({ value: undefined });

      const res = await logoutHandler();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        expect.objectContaining({
          value: '',
          maxAge: 0,
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. Post-Logout Navigation & Cache-Control Defense-in-Depth
  // --------------------------------------------------------------------------
  describe('3. Post-Logout Navigation & bfcache Defense-in-Depth', () => {
    it('redirects unauthenticated requests on protected web pages (/dashboard, /attendance) to /login', async () => {
      const dashReq = new NextRequest('http://localhost:3000/dashboard');
      const dashRes = await middleware(dashReq);
      expect(dashRes.status).toBe(307);
      expect(dashRes.headers.get('location')).toContain('/login?redirect=%2Fdashboard');

      const attReq = new NextRequest('http://localhost:3000/attendance');
      const attRes = await middleware(attReq);
      expect(attRes.status).toBe(307);
      expect(attRes.headers.get('location')).toContain('/login?redirect=%2Fattendance');
    });

    it('attaches Cache-Control: no-store, max-age=0, must-revalidate on authenticated page responses', async () => {
      const validSession: UserSession = {
        userId: 'usr-active-001',
        email: 'active@tanphong.vn',
        fullName: 'Hoàng Văn Active',
        roles: ['admin'],
        permissions: ['*'],
        organizationId: 'org-001',
        tenantRole: 'OWNER',
        organizationStatus: 'ACTIVE',
        isActive: true,
      };

      const token = await signSessionToken(validSession);

      const req = new NextRequest('http://localhost:3000/dashboard', {
        headers: {
          cookie: `antigravity_session=${token}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(200);

      const cacheControl = res.headers.get('Cache-Control');
      expect(cacheControl).toBeDefined();
      expect(cacheControl).toContain('no-store');
      expect(cacheControl).toContain('max-age=0');
      expect(cacheControl).toContain('must-revalidate');
    });
  });
});
