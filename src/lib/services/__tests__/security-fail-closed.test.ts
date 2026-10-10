/**
 * ==============================================================================
 * SECURITY REGRESSION TEST SUITE — FAIL-CLOSED CONTRACT VERIFICATION
 * ==============================================================================
 *
 * Verifies:
 * 1. QR ATTENDANCE FAIL-CLOSED:
 *    - Production + QR_SECRET present => works as expected
 *    - Production + QR_SECRET missing => fails closed (throws configuration error)
 *    - Legacy hardcoded QR secret ('antigravity-secure-qr-secret-key-2026') is NEVER accepted
 *    - Non-production fallback to AUTH_SECRET works ONLY outside Production
 *    - Non-production without QR_SECRET and without AUTH_SECRET fails closed (zero hardcoded fallback)
 *
 * 2. CRON AUTHORIZATION FAIL-CLOSED:
 *    - Valid CRON_SECRET bearer => 200 authorized
 *    - Missing CRON_SECRET + legacy hardcoded bearer ('antigravity_cron_internal_2026') => 401 rejected
 *    - Wrong bearer secret => 401 rejected
 *    - Every JWT role, including admin/HR/super_admin, without cron bearer => 401 rejected
 *    - Only three registered jobs with strict job-specific payloads may dispatch
 *    - GET never lists or executes jobs; only exact POST skips middleware cookies
 *
 * 3. AUTH SESSION & MIDDLEWARE FAIL-CLOSED:
 *    - Production + AUTH_SECRET present => sign/verify succeeds
 *    - Production + AUTH_SECRET missing => sign fails closed
 *    - Production + AUTH_SECRET missing => verify fails closed (returns null)
 *    - Production + AUTH_SECRET missing => middleware rejects request (401 / redirect)
 *    - Token forged with old hardcoded JWT secret is NEVER accepted by middleware or session
 *
 * 4. PASSWORD RESET FAIL-CLOSED:
 *    - Production + AUTH_SECRET present => generate/verify succeeds
 *    - Production + AUTH_SECRET missing => generate fails closed (throws error)
 *    - Production + AUTH_SECRET missing => verify fails closed (returns invalid)
 *    - Token forged with old hardcoded reset secret is NEVER accepted
 *    - Non-production fallback to JWT_SECRET retained only outside Production
 *
 * 5. LOCAL STORAGE SIGNING FAIL-CLOSED:
 *    - Explicit dev/test secret => signing & verification works
 *    - Missing secret => getSignedUrl fails closed (throws error)
 *    - Missing secret => verifySignedToken fails closed (returns false)
 *    - Token forged with old hardcoded storage secret is NEVER accepted
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

// ── Mock Dependencies for Cron Route Handler ─────────────────────────────────
const mockJobRunner = vi.hoisted(() => ({
  listJobs: vi.fn(() => [
    { name: 'DAILY_ATTENDANCE_RECONCILIATION', description: 'test' },
    { name: 'NOTIFICATION_PRUNING', description: 'test' },
    { name: 'CACHE_WARMUP', description: 'test' },
  ]),
  runJob: vi.fn(async (name: string, params: any) => ({
    status: 'SUCCESS',
    jobName: name,
    params,
    durationMs: 15,
  })),
}));

const mockSessionModule = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/jobs/job-runner', () => ({
  JobRunner: mockJobRunner,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: new Proxy({}, {
    get() { throw new Error('Database access is forbidden in this isolated suite.'); },
  }),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    getSession: mockSessionModule.getSession,
  };
});

import { getQrSecret, QrAttendanceService } from '@/lib/services/qr-attendance.service';
import { GET as cronGetHandler, POST as cronPostHandler } from '@/app/api/v1/jobs/run/route';
import { signSessionToken, verifySessionToken } from '@/lib/auth/session';
import { getAuthSecretKey, getAuthSecretString } from '@/lib/auth/auth-secret';
import { middleware } from '@/middleware';
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from '@/lib/auth/password-reset';
import { LocalStorageProvider } from '@/lib/storage/providers/local.provider';
import { StorageManager } from '@/lib/storage/storage-manager';
import { readAvatarFile } from '@/lib/security/file-storage';
import { UserSession } from '@/types';

describe('SECURITY FAIL-CLOSED AUDIT & REGRESSION SUITE', () => {
  const originalEnv = { ...process.env };

  const sampleSession: UserSession = {
    userId: 'usr-sec-001',
    organizationId: 'org-sec-001',
    roles: ['admin'],
    email: 'sec-admin@antigravity.test',
    fullName: 'Security Admin',
    permissions: [],
    isActive: true,
  };

  const sampleUserReset = {
    id: 'usr-reset-001',
    email: 'user@antigravity.test',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    vi.stubGlobal('fetch', vi.fn(() => {
      throw new Error('Network access is forbidden in this isolated suite.');
    }));
  });

  afterEach(() => {
    try {
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      process.env = { ...originalEnv };
    }
  });

  // ===========================================================================
  // 1. QR ATTENDANCE FAIL-CLOSED TESTS
  // ===========================================================================
  describe('1. QR Attendance Cryptographic Secret Fail-Closed Contract', () => {
    const LEGACY_QR_SECRET = 'antigravity-secure-qr-secret-key-2026';

    it('1.1 Production + QR_SECRET present => signs and verifies successfully', () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      process.env.QR_SECRET = 'prod-dedicated-crypto-qr-secret-32chars';

      expect(getQrSecret()).toBe('prod-dedicated-crypto-qr-secret-32chars');

      const code = 'nonce-12345';
      const tokenType = 'CHECK_IN';
      const exp = Date.now() + 30000;

      const signature = QrAttendanceService.signToken(code, tokenType, exp);
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64); // SHA256 hex string

      const isValid = QrAttendanceService.verifySignature(code, tokenType, exp, signature);
      expect(isValid).toBe(true);
    });

    it('1.2 Production + QR_SECRET missing => fails closed (throws configuration error on sign, returns false on verify)', () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.QR_SECRET;
      // Even if AUTH_SECRET or JWT_SECRET is set in environment, production MUST NOT fallback
      process.env.AUTH_SECRET = 'production-auth-secret-key-32chars';
      process.env.JWT_SECRET = 'production-jwt-secret-key-32chars';

      // Secret resolver must throw configuration error
      expect(() => getQrSecret()).toThrowError(
        /QR_SECRET bắt buộc phải được thiết lập trong môi trường Production/
      );

      // signToken must fail closed by throwing
      expect(() =>
        QrAttendanceService.signToken('nonce-fail', 'CHECK_IN', Date.now() + 30000)
      ).toThrowError(/QR_SECRET bắt buộc phải được thiết lập trong môi trường Production/);

      // verifySignature must fail closed by returning false
      const isValid = QrAttendanceService.verifySignature(
        'nonce-fail',
        'CHECK_IN',
        Date.now() + 30000,
        'some-forged-signature-value'
      );
      expect(isValid).toBe(false);
    });

    it('1.3 Legacy hardcoded QR secret is NEVER accepted as fallback', () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      process.env.QR_SECRET = 'prod-dedicated-crypto-qr-secret-32chars';

      const code = 'nonce-replay-legacy';
      const tokenType = 'CHECK_IN';
      const exp = Date.now() + 30000;

      // Token forged with legacy hardcoded key
      const legacyForgedSig = crypto
        .createHmac('sha256', LEGACY_QR_SECRET)
        .update(`${code}:${tokenType}:${exp}`)
        .digest('hex');

      // Must reject verification against genuine production secret
      const isValid = QrAttendanceService.verifySignature(code, tokenType, exp, legacyForgedSig);
      expect(isValid).toBe(false);
    });

    it('1.4 Non-Production + QR_SECRET missing => falls back to AUTH_SECRET outside Production', () => {
      delete process.env.APP_ENV;
      (process.env as any).NODE_ENV = 'development';
      delete process.env.QR_SECRET;
      process.env.AUTH_SECRET = 'dev-explicit-auth-secret-key-32chars';

      expect(getQrSecret()).toBe('dev-explicit-auth-secret-key-32chars');

      const sig = QrAttendanceService.signToken('dev-code', 'ANY', 123456);
      expect(sig).toBeDefined();
      expect(QrAttendanceService.verifySignature('dev-code', 'ANY', 123456, sig)).toBe(true);
    });

    it('1.5 Non-Production + both QR_SECRET and AUTH_SECRET missing => fails closed with zero hardcoded fallback', () => {
      delete process.env.APP_ENV;
      (process.env as any).NODE_ENV = 'development';
      delete process.env.QR_SECRET;
      delete process.env.AUTH_SECRET;

      expect(() => getQrSecret()).toThrowError(
        /Cấu hình bảo mật lỗi: Yêu cầu thiết lập QR_SECRET/
      );
    });
  });

  // ===========================================================================
  // 2. CRON AUTHORIZATION FAIL-CLOSED TESTS
  // ===========================================================================
  describe('2. Cron Bearer Authorization Fail-Closed Contract', () => {
    const LEGACY_CRON_SECRET = 'antigravity_cron_internal_2026';
    const VALID_CRON_SECRET = 'prod-super-secure-cron-secret-2026-xyz';
    const endpoint = 'http://localhost:3000/api/v1/jobs/run';
    const validBody = { jobName: 'CACHE_WARMUP' };

    function request(body: unknown = validBody, authorization = `Bearer ${VALID_CRON_SECRET}`) {
      return new NextRequest(endpoint, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    async function expectDenied(req: NextRequest, status: number) {
      const res = await cronPostHandler(req);
      expect(res.status).toBe(status);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe(status === 401 ? 'UNAUTHORIZED' : 'BAD_REQUEST');
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
      expect(mockJobRunner.listJobs).not.toHaveBeenCalled();
      expect(mockSessionModule.getSession).not.toHaveBeenCalled();
      expect(JSON.stringify(json)).not.toContain(VALID_CRON_SECRET);
      return json;
    }

    beforeEach(() => { process.env.CRON_SECRET = VALID_CRON_SECRET; });

    it.each([
      ['DAILY_ATTENDANCE_RECONCILIATION', undefined],
      ['DAILY_ATTENDANCE_RECONCILIATION', { targetDate: '2024-02-29' }],
      ['DAILY_ATTENDANCE_RECONCILIATION', {
        targetDate: '2024-10-10', organizationId: '00b0afd8-1e9e-43da-8514-e2aa3483c4f2',
      }],
      ['DAILY_ATTENDANCE_RECONCILIATION', { organizationId: '00b0afd8-1e9e-43da-8514-e2aa3483c4f2' }],
      ['NOTIFICATION_PRUNING', undefined],
      ['NOTIFICATION_PRUNING', { retentionDays: 180 }],
      ['NOTIFICATION_PRUNING', { retentionDays: 90 }],
      ['CACHE_WARMUP', undefined],
      ['CACHE_WARMUP', {}],
    ])('2.1 Valid bearer dispatches %s with params %j to its mock', async (jobName, params) => {
      const res = await cronPostHandler(request({ jobName, ...(params === undefined ? {} : { params }) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.jobName).toBe(jobName);
      expect(json.meta.timestamp).toEqual(expect.any(String));
      expect(mockJobRunner.runJob).toHaveBeenCalledTimes(1);
      expect(mockJobRunner.runJob).toHaveBeenCalledWith(jobName, params ?? {});
      expect(mockSessionModule.getSession).not.toHaveBeenCalled();
    });

    it.each([
      ['2026-10-09T16:59:59Z', '2026-10-09'],
      ['2026-10-09T16:59:59Z', '2026-10-10'],
      ['2026-10-09T17:00:00Z', '2026-10-10'],
      ['2026-10-09T17:00:00Z', '2026-10-11'],
      ['2026-10-31T17:00:00Z', '2026-11-01'],
      ['2025-12-31T17:00:00Z', '2026-01-01'],
      ['2025-12-31T18:30:00Z', '2026-01-02'],
      ['2026-10-09T17:00:00Z', '2099-12-31'],
    ])('rejects same-day/future Vietnam business date %s -> %s before dispatch', async (now, targetDate) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      try {
        await expectDenied(request({ jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate } }), 400);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ['2026-10-09T16:59:59Z', '2026-10-08'],
      ['2026-10-09T17:00:00Z', '2026-10-09'],
      ['2026-10-09T18:30:00Z', '2026-10-09'],
      ['2026-10-31T17:00:00Z', '2026-10-31'],
      ['2025-12-31T17:00:00Z', '2025-12-31'],
      ['2026-10-09T17:00:00Z', '2024-02-29'],
      ['2024-02-29T17:00:00Z', '2024-02-29'],
    ])('allows strictly past Vietnam business date %s -> %s', async (now, targetDate) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      try {
        const res = await cronPostHandler(request({ jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate } }));
        expect(res.status).toBe(200);
        expect((await res.json()).success).toBe(true);
        expect(mockJobRunner.runJob).toHaveBeenCalledTimes(1);
        expect(mockJobRunner.runJob).toHaveBeenCalledWith('DAILY_ATTENDANCE_RECONCILIATION', { targetDate });
        expect(mockSessionModule.getSession).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      undefined,
      {},
      { organizationId: '00b0afd8-1e9e-43da-8514-e2aa3483c4f2' },
    ])('delegates omitted targetDate unchanged to the JobRunner yesterday default (%j)', async (params) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2025-12-31T17:00:00Z'));
      try {
        const res = await cronPostHandler(request({
          jobName: 'DAILY_ATTENDANCE_RECONCILIATION',
          ...(params === undefined ? {} : { params }),
        }));
        expect(res.status).toBe(200);
        expect((await res.json()).success).toBe(true);
        expect(mockJobRunner.runJob).toHaveBeenCalledTimes(1);
        expect(mockJobRunner.runJob).toHaveBeenCalledWith('DAILY_ATTENDANCE_RECONCILIATION', params ?? {});
        expect(mockJobRunner.runJob.mock.calls[0][1]).not.toHaveProperty('targetDate');
        expect(mockSessionModule.getSession).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it.each(['', 'Bearer invalid-cron-bearer'])(
      'requires a valid bearer even for a strictly past reconciliation date (%j)', async (authorization) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-09T17:00:00Z'));
        try {
          await expectDenied(request({
            jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate: '2026-10-09' },
          }, authorization), 401);
        } finally {
          vi.useRealTimers();
        }
      }
    );

    it('2.2 Missing CRON_SECRET in env + legacy hardcoded bearer => rejected (401 Unauthorized)', async () => {
      delete process.env.CRON_SECRET;
      const json = await expectDenied(request(validBody, `Bearer ${LEGACY_CRON_SECRET}`), 401);
      expect(json.error.message).toContain('Yêu cầu khóa xác thực tác vụ tự động');
    });

    it('2.3 Wrong bearer token => rejected (401 Unauthorized)', async () => {
      await expectDenied(request(validBody, 'Bearer wrong-unauthorized-bearer-token'), 401);
    });

    it.each<UserSession['roles'][number]>(['admin', 'hr', 'super_admin', 'manager', 'employee'])(
      '2.4/2.5 Authenticated %s with wildcard permissions cannot substitute JWT for cron bearer', async (role) => {
        process.env.AUTH_SECRET = 'isolated-cron-auth-secret-minimum-32-characters';
        const session: UserSession = {
          ...sampleSession, roles: [role], permissions: ['*'],
          organizationId: role === 'super_admin' ? null : sampleSession.organizationId,
        };
        mockSessionModule.getSession.mockResolvedValue(session);
        const token = await signSessionToken(session);
        expect((await verifySessionToken(token))?.roles).toEqual([role]);
        const req = request(validBody, '');
        req.headers.delete('authorization');
        req.headers.set('cookie', `antigravity_session=${token}`);
        await expectDenied(req, 401);
      }
    );

    it.each(['', '   ', 'invalid secret', 'invalid:secret', 'secret\nnewline', `${VALID_CRON_SECRET}\n`])(
      'rejects empty or malformed configured CRON_SECRET (%j)', async (secret) => {
        process.env.CRON_SECRET = secret;
        await expectDenied(request(), 401);
      }
    );

    it.each([
      '', VALID_CRON_SECRET, `Basic ${VALID_CRON_SECRET}`, `bearer ${VALID_CRON_SECRET}`,
      'Bearer', 'Bearer ', `Bearer  ${VALID_CRON_SECRET}`, `Bearer ${VALID_CRON_SECRET},other`,
      `Bearer ${VALID_CRON_SECRET} extra`,
    ])('rejects missing or malformed authorization (%j)', async (authorization) => {
      await expectDenied(request(validBody, authorization), 401);
    });

    it('does not authenticate from body/query/organizationId or parse an unauthorized body', async () => {
      const req = new NextRequest(`${endpoint}?CRON_SECRET=${VALID_CRON_SECRET}`, {
        method: 'POST', body: JSON.stringify({
          ...validBody, CRON_SECRET: VALID_CRON_SECRET,
          organizationId: '00b0afd8-1e9e-43da-8514-e2aa3483c4f2',
        }),
      });
      const json = vi.spyOn(req, 'json');
      await expectDenied(req, 401);
      expect(json).not.toHaveBeenCalled();
    });

    it.each([
      null, [], 'CACHE_WARMUP', {}, { jobName: 'UNKNOWN' },
      { name: 'CACHE_WARMUP' }, { ...validBody, name: 'NOTIFICATION_PRUNING' },
      { ...validBody, unknown: true }, { ...validBody, params: null },
      { ...validBody, params: [] }, { ...validBody, params: 'invalid' },
      { ...validBody, params: { organizationId: '00b0afd8-1e9e-43da-8514-e2aa3483c4f2' } },
      ...['2026-02-29', '2026-02-30', '2026-13-01', '2026-2-01', '2026-10-10\n', 'not-a-date', null, 123].map(
        (targetDate) => ({ jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { targetDate } })
      ),
      ...['', 'org-other', null, 123].map(
        (organizationId) => ({ jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { organizationId } })
      ),
      { jobName: 'DAILY_ATTENDANCE_RECONCILIATION', params: { extra: true } },
      ...[0, -1, 1, 89, 1.5, '90', null, Number.MAX_SAFE_INTEGER, 200000000].map(
        (retentionDays) => ({ jobName: 'NOTIFICATION_PRUNING', params: { retentionDays } })
      ),
      { jobName: 'NOTIFICATION_PRUNING', params: { extra: true } },
    ])('rejects invalid job-specific payload before dispatch: %j', async (body) => {
      await expectDenied(request(body), 400);
    });

    it('rejects malformed JSON before dispatch', async () => {
      const req = new NextRequest(endpoint, {
        method: 'POST', headers: { authorization: `Bearer ${VALID_CRON_SECRET}` }, body: '{',
      });
      await expectDenied(req, 400);
    });

    it('GET returns 405 without exposing a registry or executing jobs', async () => {
      const res = await cronGetHandler();
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
      expect(await res.json()).toMatchObject({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
      expect(mockJobRunner.listJobs).not.toHaveBeenCalled();
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
      expect(mockSessionModule.getSession).not.toHaveBeenCalled();
    });

    it('only exact POST skips cookies; bearer authorization is still required by the route', async () => {
      delete process.env.AUTH_SECRET;
      const req = request(validBody, '');
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
      await expectDenied(req, 401);
    });

    it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
      'middleware retains cookie authentication for %s on the same path', async (method) => {
        const res = await middleware(new NextRequest(endpoint, { method }));
        expect(res.status).toBe(401);
        expect(mockJobRunner.runJob).not.toHaveBeenCalled();
      }
    );

    it.each([
      '/api/v1/jobs', '/api/v1/jobs/run/', '/api/v1/jobs/run/extra', '/api/v1/jobs/runner',
      '/api/v1/jobs/run-other', '/api/v1/jobs/RUN', '/api/v1/employees', '/api/v1/notifications',
      '/api/v1/payroll',
    ])('middleware retains cookie authentication outside the exact POST path: %s', async (path) => {
      const res = await middleware(new NextRequest(`http://localhost:3000${path}`, { method: 'POST' }));
      expect(res.status).toBe(401);
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
    });

    it('keeps CSRF protection ahead of the exact POST exemption', async () => {
      const req = request();
      req.headers.set('host', 'localhost:3000');
      req.headers.set('origin', 'https://untrusted.invalid');
      const res = await middleware(req);
      expect(res.status).toBe(403);
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
    });

    it('preserves authenticated access to other APIs and still denies authenticated GET job execution', async () => {
      process.env.AUTH_SECRET = 'isolated-cron-auth-secret-minimum-32-characters';
      const token = await signSessionToken(sampleSession);
      for (const path of ['/api/v1/employees', '/api/v1/jobs/run']) {
        const res = await middleware(new NextRequest(`http://localhost:3000${path}`, {
          headers: { cookie: `antigravity_session=${token}` },
        }));
        expect(res.status).toBe(200);
        expect(res.headers.get('x-middleware-next')).toBe('1');
      }
      expect((await cronGetHandler()).status).toBe(405);
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
    });

    it('preserves the existing failed-job response mapping', async () => {
      mockJobRunner.runJob.mockResolvedValueOnce({
        status: 'FAILED', jobName: 'CACHE_WARMUP', params: {}, durationMs: 15,
      });
      const res = await cronPostHandler(request());
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: false, data: { status: 'FAILED' } });
      expect(mockJobRunner.runJob).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 3. AUTH SESSION & MIDDLEWARE FAIL-CLOSED TESTS
  // ===========================================================================
  describe('3. Auth Session & Middleware Fail-Closed Contract', () => {
    const LEGACY_JWT_SECRET =
      'antigravity_super_secret_jwt_key_minimum_32_characters_long_for_security';
    const VALID_AUTH_SECRET =
      'prod_auth_secret_minimum_32_characters_long_real_key';

    it('3.1 Production + AUTH_SECRET present => sign and verify succeed', async () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      process.env.AUTH_SECRET = VALID_AUTH_SECRET;

      expect(getAuthSecretString()).toBe(VALID_AUTH_SECRET);
      expect(getAuthSecretKey()).not.toBeNull();

      const token = await signSessionToken(sampleSession);
      expect(token).toBeDefined();

      const payload = await verifySessionToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(sampleSession.userId);
    });

    it('3.2 Production + AUTH_SECRET missing => signSessionToken fails closed (throws configuration error)', async () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.AUTH_SECRET;
      // Even if JWT_SECRET is in env, production MUST NOT fallback
      process.env.JWT_SECRET = 'legacy-jwt-secret-not-allowed-in-prod';

      expect(getAuthSecretString()).toBeNull();
      expect(getAuthSecretKey()).toBeNull();

      await expect(signSessionToken(sampleSession)).rejects.toThrowError(
        /AUTH_SECRET bắt buộc phải được thiết lập để ký phiên đăng nhập/
      );
    });

    it('3.3 Production + AUTH_SECRET missing => verifySessionToken fails closed (returns null)', async () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.AUTH_SECRET;

      // Any token submitted when AUTH_SECRET is missing must return null
      const result = await verifySessionToken('some.fake.token');
      expect(result).toBeNull();
    });

    it('3.4 Production + AUTH_SECRET missing => middleware rejects API request (401 Unauthorized)', async () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.AUTH_SECRET;

      const req = new NextRequest('http://localhost:3000/api/v1/employees', {
        headers: {
          cookie: 'antigravity_session=any-random-session-token',
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Cấu hình bảo mật hệ thống chưa hoàn tất');
    });

    it('3.5 Token forged with old hardcoded JWT key is rejected by middleware when AUTH_SECRET is configured', async () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      process.env.AUTH_SECRET = VALID_AUTH_SECRET;

      // Forge token using the old legacy key
      const legacyKey = new TextEncoder().encode(LEGACY_JWT_SECRET);
      const forgedToken = await new SignJWT({ ...sampleSession })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(legacyKey);

      // Session verification must reject
      const sessionResult = await verifySessionToken(forgedToken);
      expect(sessionResult).toBeNull();

      // Middleware must reject with 401
      const req = new NextRequest('http://localhost:3000/api/v1/employees', {
        headers: {
          cookie: `antigravity_session=${forgedToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(401);
    });

    it('3.6 Token forged with old hardcoded JWT key is rejected by middleware even when AUTH_SECRET is missing in production', async () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.AUTH_SECRET;

      const legacyKey = new TextEncoder().encode(LEGACY_JWT_SECRET);
      const forgedToken = await new SignJWT({ ...sampleSession })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(legacyKey);

      const req = new NextRequest('http://localhost:3000/api/v1/employees', {
        headers: {
          cookie: `antigravity_session=${forgedToken}`,
        },
      });

      const res = await middleware(req);
      expect(res.status).toBe(401);
    });
  });

  // ===========================================================================
  // 4. PASSWORD RESET FAIL-CLOSED TESTS
  // ===========================================================================
  describe('4. Password Reset Cryptographic Secret Fail-Closed Contract', () => {
    const LEGACY_RESET_SECRET = 'antigravity_dev_auth_secret_minimum_32_chars_fallback';
    const VALID_AUTH_SECRET = 'prod_auth_secret_minimum_32_characters_for_reset';

    it('4.1 Production + AUTH_SECRET present => generates and verifies reset token', () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      process.env.AUTH_SECRET = VALID_AUTH_SECRET;

      const { token } = generatePasswordResetToken(sampleUserReset);
      expect(token).toBeDefined();

      const verification = verifyPasswordResetToken(token, sampleUserReset);
      expect(verification.valid).toBe(true);
    });

    it('4.2 Production + AUTH_SECRET missing => generatePasswordResetToken fails closed', () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.AUTH_SECRET;
      // Even if JWT_SECRET is set, production must NOT use it
      process.env.JWT_SECRET = 'some-jwt-secret';

      expect(() => generatePasswordResetToken(sampleUserReset)).toThrowError(
        /AUTH_SECRET bắt buộc phải được thiết lập trong môi trường Production/
      );
    });

    it('4.3 Production + AUTH_SECRET missing => verifyPasswordResetToken fails closed', () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.AUTH_SECRET;

      const verification = verifyPasswordResetToken('dummy-token', sampleUserReset);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBeDefined();
    });

    it('4.4 Token generated with old hardcoded reset secret is NEVER accepted by genuine production system', () => {
      process.env.APP_ENV = 'production';
      (process.env as any).NODE_ENV = 'production';
      process.env.AUTH_SECRET = VALID_AUTH_SECRET;

      // Forge a token using the legacy secret
      const exp = Date.now() + 900000;
      const payload = `${sampleUserReset.id}:${sampleUserReset.email.toLowerCase()}:${exp}`;
      const legacyKey = crypto
        .createHash('sha256')
        .update(`${LEGACY_RESET_SECRET}:${sampleUserReset.id}:${sampleUserReset.passwordHash}`)
        .digest();

      const forgedSig = crypto.createHmac('sha256', legacyKey).update(payload).digest('base64url');
      const forgedToken = Buffer.from(
        JSON.stringify({ u: sampleUserReset.id, e: exp, s: forgedSig })
      ).toString('base64url');

      const verification = verifyPasswordResetToken(forgedToken, sampleUserReset);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('không hợp lệ');
    });

    it('4.5 Non-production fallback to JWT_SECRET retained outside Production', () => {
      delete process.env.APP_ENV;
      (process.env as any).NODE_ENV = 'development';
      delete process.env.AUTH_SECRET;
      process.env.JWT_SECRET = 'dev-jwt-secret-compatibility-key';

      const { token } = generatePasswordResetToken(sampleUserReset);
      expect(token).toBeDefined();

      const verification = verifyPasswordResetToken(token, sampleUserReset);
      expect(verification.valid).toBe(true);
    });

    it('4.6 Non-production with both AUTH_SECRET and JWT_SECRET missing => fails closed (zero hardcoded fallback)', () => {
      delete process.env.APP_ENV;
      (process.env as any).NODE_ENV = 'development';
      delete process.env.AUTH_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => generatePasswordResetToken(sampleUserReset)).toThrowError(
        /Cấu hình bảo mật lỗi: Yêu cầu thiết lập AUTH_SECRET/
      );
    });
  });

  // ===========================================================================
  // 5. LOCAL STORAGE SIGNING FAIL-CLOSED TESTS
  // ===========================================================================
  describe('5. Local Storage Provider Signing Fail-Closed Contract', () => {
    const LEGACY_STORAGE_SECRET = 'antigravity_storage_local_signing_secret_dev_32chars';
    const VALID_SECRET = 'dev_auth_secret_for_local_storage_signing_32chars';

    it('5.1 Explicit dev/test secret => getSignedUrl and verifySignedToken succeed', async () => {
      process.env.AUTH_SECRET = VALID_SECRET;

      const provider = new LocalStorageProvider();
      const signedUrl = await provider.getSignedUrl('documents', 'test-doc.pdf', {
        expiresInSeconds: 300,
      });

      expect(signedUrl).toContain('/api/v1/storage/signed?');
      const url = new URL(signedUrl, 'http://localhost:3000');
      const token = url.searchParams.get('token')!;
      const exp = Number(url.searchParams.get('exp')!);

      expect(token).toBeDefined();
      expect(exp).toBeGreaterThan(Date.now());

      const isValid = provider.verifySignedToken('documents', 'test-doc.pdf', token, exp);
      expect(isValid).toBe(true);
    });

    it('5.2 Missing secret => getSignedUrl fails closed (throws configuration error)', async () => {
      delete process.env.AUTH_SECRET;
      delete process.env.JWT_SECRET;

      const provider = new LocalStorageProvider();
      await expect(
        provider.getSignedUrl('documents', 'test-doc.pdf', { expiresInSeconds: 300 })
      ).rejects.toThrowError(
        /Yêu cầu thiết lập AUTH_SECRET để ký\/xác thực URL tài liệu cục bộ/
      );
    });

    it('5.3 Missing secret => verifySignedToken fails closed (returns false)', () => {
      delete process.env.AUTH_SECRET;
      delete process.env.JWT_SECRET;

      const provider = new LocalStorageProvider();
      const isValid = provider.verifySignedToken(
        'documents',
        'test-doc.pdf',
        'some-token',
        Date.now() + 300000
      );
      expect(isValid).toBe(false);
    });

    it('5.4 Token forged with old hardcoded storage key is rejected by genuine provider', () => {
      process.env.AUTH_SECRET = VALID_SECRET;
      const provider = new LocalStorageProvider();

      const exp = Date.now() + 300000;
      const forgedHmac = crypto
        .createHmac('sha256', LEGACY_STORAGE_SECRET)
        .update(`documents:test-doc.pdf:${exp}`)
        .digest('hex');

      const isValid = provider.verifySignedToken(
        'documents',
        'test-doc.pdf',
        forgedHmac,
        exp
      );
      expect(isValid).toBe(false);
    });
  });

  describe('6. Storage Routing Fail-Closed Contract', () => {
    afterEach(() => {
      StorageManager.resetProvider();
      vi.restoreAllMocks();
    });

    it('does not retry a failed tenant-scoped avatar read with a bare key', async () => {
      const download = vi.fn().mockRejectedValue(new Error('scoped read failed'));
      vi.spyOn(StorageManager, 'getProvider').mockReturnValue({ download } as any);

      await expect(readAvatarFile('avatar_user.png', 'org-sec-001')).rejects.toThrow(
        'scoped read failed'
      );

      expect(download).toHaveBeenCalledTimes(1);
      expect(download).toHaveBeenCalledWith(
        'avatars',
        'organizations/org-sec-001/avatars/avatar_user.png'
      );
      expect(download).not.toHaveBeenCalledWith('avatars', 'avatar_user.png');
    });

    it('does not provide a remote-to-local fallback for protected misconfiguration', () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        APP_ENV: 'production',
        STORAGE_PROVIDER: 'supabase',
        SUPABASE_URL: 'https://test-project.supabase.co',
      };

      expect(() => StorageManager.getProvider()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    it('rejects local storage in a protected environment', () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        APP_ENV: 'staging',
        STORAGE_PROVIDER: 'local',
      };

      expect(() => StorageManager.getProvider()).toThrow(/Local Storage/);
    });
  });
});
