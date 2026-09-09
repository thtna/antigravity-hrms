import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { signSessionToken } from '@/lib/auth/session';
import {
  SUPER_ADMIN_LANDING_PATH,
  resolvePostLoginRedirect,
} from '@/lib/auth/super-admin-landing';
import { UserSession } from '@/types';

describe('Phase 2 — SUPER_ADMIN landing redirects', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.AUTH_SECRET = 'phase-2-super-admin-landing-auth-secret-32chars';
    process.env.AUTH_COOKIE_NAME = 'antigravity_session';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function makeSession(overrides: Partial<UserSession>): UserSession {
    return {
      userId: 'usr-test',
      email: 'user@antigravity.test',
      fullName: 'Test User',
      roles: ['employee'],
      permissions: [],
      organizationId: 'org-test-001',
      organizationStatus: 'ACTIVE',
      isActive: true,
      ...overrides,
    };
  }

  async function requestWithSession(pathname: string, session: UserSession) {
    const token = await signSessionToken(session);
    const req = new NextRequest(`http://localhost:3000${pathname}`, {
      headers: {
        cookie: `antigravity_session=${token}`,
      },
    });

    return middleware(req);
  }

  describe('login redirect resolution', () => {
    it('routes a SUPER_ADMIN default / target to /super-admin', () => {
      const redirect = resolvePostLoginRedirect(
        makeSession({ roles: ['super_admin'], organizationId: null }),
        '/'
      );

      expect(redirect).toBe(SUPER_ADMIN_LANDING_PATH);
    });

    it('routes a SUPER_ADMIN /dashboard target to /super-admin', () => {
      const redirect = resolvePostLoginRedirect(
        makeSession({ roles: ['super_admin'], organizationId: null }),
        '/dashboard'
      );

      expect(redirect).toBe(SUPER_ADMIN_LANDING_PATH);
    });

    it('keeps a SUPER_ADMIN with organizationId = null valid', () => {
      expect(() =>
        resolvePostLoginRedirect(
          makeSession({ roles: ['super_admin'], organizationId: null }),
          '/'
        )
      ).not.toThrow();
    });

    it('does not send SUPER_ADMIN through tenant onboarding because organizationId is null', () => {
      const redirect = resolvePostLoginRedirect(
        makeSession({
          roles: ['super_admin'],
          organizationId: null,
          needsOnboarding: true,
        }),
        '/'
      );

      expect(redirect).toBe(SUPER_ADMIN_LANDING_PATH);
    });

    it.each([
      ['admin' as const],
      ['hr' as const],
      ['manager' as const],
      ['employee' as const],
    ])('preserves normal %s login default landing behavior', (role) => {
      const redirect = resolvePostLoginRedirect(makeSession({ roles: [role] }), '/');

      expect(redirect).toBe('/dashboard');
    });

    it('preserves tenant owner onboarding behavior', () => {
      const redirect = resolvePostLoginRedirect(
        makeSession({
          roles: ['admin'],
          tenantRole: 'OWNER',
          needsOnboarding: true,
        }),
        '/'
      );

      expect(redirect).toBe('/onboarding');
    });
  });

  describe('middleware defense-in-depth', () => {
    it('redirects authenticated SUPER_ADMIN from /dashboard to /super-admin', async () => {
      const res = await requestWithSession(
        '/dashboard',
        makeSession({ roles: ['super_admin'], organizationId: null })
      );

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/super-admin');
    });

    it('redirects authenticated SUPER_ADMIN from / to /super-admin while root stays public otherwise', async () => {
      const res = await requestWithSession(
        '/',
        makeSession({ roles: ['super_admin'], organizationId: null })
      );

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('http://localhost:3000/super-admin');

      const publicRootRes = await middleware(new NextRequest('http://localhost:3000/'));
      expect(publicRootRes.status).toBe(200);
      expect(publicRootRes.headers.get('location')).toBeNull();
    });

    it('allows authenticated SUPER_ADMIN to request /super-admin without a redirect loop', async () => {
      const res = await requestWithSession(
        '/super-admin',
        makeSession({ roles: ['super_admin'], organizationId: null })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('does not redirect ordinary tenant users to /super-admin', async () => {
      const res = await requestWithSession(
        '/dashboard',
        makeSession({ roles: ['admin'], tenantRole: 'OWNER' })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('keeps normal tenant organization status validation intact', async () => {
      const res = await requestWithSession(
        '/dashboard',
        makeSession({
          roles: ['employee'],
          organizationStatus: 'PENDING',
        })
      );

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toContain('/login?error=org_pending');
    });
  });
});
