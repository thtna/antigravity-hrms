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
 *    - Authenticated admin session invocation => 200 authorized
 *    - Authenticated non-admin employee invocation without cron bearer => 401 rejected
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
  listJobs: vi.fn(() => [{ name: 'cleanup-tokens', description: 'test' }]),
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

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();
  return {
    ...actual,
    getSession: mockSessionModule.getSession,
  };
});

import { getQrSecret, QrAttendanceService } from '@/lib/services/qr-attendance.service';
import { POST as cronPostHandler } from '@/app/api/v1/jobs/run/route';
import { signSessionToken, verifySessionToken } from '@/lib/auth/session';
import { getAuthSecretKey, getAuthSecretString } from '@/lib/auth/auth-secret';
import { middleware } from '@/middleware';
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from '@/lib/auth/password-reset';
import { LocalStorageProvider } from '@/lib/storage/providers/local.provider';
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
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

    it('2.1 Valid CRON_SECRET bearer => authorized (200 OK)', async () => {
      process.env.CRON_SECRET = VALID_CRON_SECRET;

      const req = new NextRequest('http://localhost:3000/api/v1/jobs/run', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${VALID_CRON_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jobName: 'cleanup-expired-tokens' }),
      });

      const res = await cronPostHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockJobRunner.runJob).toHaveBeenCalledWith('cleanup-expired-tokens', {});
    });

    it('2.2 Missing CRON_SECRET in env + legacy hardcoded bearer => rejected (401 Unauthorized)', async () => {
      delete process.env.CRON_SECRET;
      mockSessionModule.getSession.mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/jobs/run', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${LEGACY_CRON_SECRET}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jobName: 'cleanup-expired-tokens' }),
      });

      const res = await cronPostHandler(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toContain('Yêu cầu khóa xác thực tác vụ tự động');
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
    });

    it('2.3 Wrong bearer token => rejected (401 Unauthorized)', async () => {
      process.env.CRON_SECRET = VALID_CRON_SECRET;
      mockSessionModule.getSession.mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/v1/jobs/run', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-unauthorized-bearer-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jobName: 'cleanup-expired-tokens' }),
      });

      const res = await cronPostHandler(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
    });

    it('2.4 Authenticated admin flow remains functional without cron bearer (200 OK)', async () => {
      process.env.CRON_SECRET = VALID_CRON_SECRET;
      // Simulated admin session
      mockSessionModule.getSession.mockResolvedValue({
        userId: 'usr-admin-01',
        organizationId: 'org-test-01',
        roles: ['admin'],
        email: 'admin@antigravity.internal',
        fullName: 'Admin User',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/jobs/run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jobName: 'recalculate-leave-balances' }),
      });

      const res = await cronPostHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(mockJobRunner.runJob).toHaveBeenCalledWith('recalculate-leave-balances', {});
    });

    it('2.5 Authenticated non-admin employee flow without cron bearer => rejected (401 Unauthorized)', async () => {
      process.env.CRON_SECRET = VALID_CRON_SECRET;
      mockSessionModule.getSession.mockResolvedValue({
        userId: 'usr-emp-01',
        organizationId: 'org-test-01',
        roles: ['employee'],
        email: 'employee@antigravity.internal',
        fullName: 'Employee User',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/jobs/run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ jobName: 'recalculate-leave-balances' }),
      });

      const res = await cronPostHandler(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(mockJobRunner.runJob).not.toHaveBeenCalled();
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
});
