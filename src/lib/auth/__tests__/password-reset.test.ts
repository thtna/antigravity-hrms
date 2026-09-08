import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  extractUserIdFromResetToken,
  renderPasswordResetEmail,
  RESET_TOKEN_TTL_MS,
} from '../password-reset';

describe('PHASE 11A.0D — PASSWORD RESET CRYPTOGRAPHIC SECURITY', () => {
  const mockUser = {
    id: 'usr-test-alice',
    email: 'alice@antigravity.internal',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuv1234567890abcdef',
  };

  it('1. generates a valid cryptographically signed reset token', () => {
    const { token, expiresAt } = generatePasswordResetToken(mockUser);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS);

    // Extract user ID without verifying signature
    const userId = extractUserIdFromResetToken(token);
    expect(userId).toBe(mockUser.id);

    // Verify token with matching user
    const result = verifyPasswordResetToken(token, mockUser);
    expect(result.valid).toBe(true);
  });

  it('2. rejects token if user password has changed (ONE-TIME USE GUARANTEE)', async () => {
    const { token } = generatePasswordResetToken(mockUser);

    // User is verified before password change
    expect(verifyPasswordResetToken(token, mockUser).valid).toBe(true);

    // User changes password (new hash)
    const updatedUser = {
      ...mockUser,
      passwordHash: await bcrypt.hash('NewPassword@2026', 10),
    };

    // Old token MUST now fail validation immediately
    const verifyAfterChange = verifyPasswordResetToken(token, updatedUser);
    expect(verifyAfterChange.valid).toBe(false);
    expect(verifyAfterChange.reason).toContain('không hợp lệ hoặc đã được sử dụng');
  });

  it('3. rejects token after expiration time (FINITE TTL)', () => {
    const { token } = generatePasswordResetToken(mockUser);

    // Advance time by 16 minutes (TTL is 15 minutes)
    const originalDateNow = Date.now;
    Date.now = vi.fn(() => originalDateNow() + 16 * 60 * 1000);

    try {
      const result = verifyPasswordResetToken(token, mockUser);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('hết hạn');
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('4. rejects tampered token (SIGNATURE FORGERY DEFENSE)', () => {
    const { token } = generatePasswordResetToken(mockUser);
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));

    // Tamper with expiration
    decoded.e = decoded.e + 100000;
    const tamperedToken = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    const result = verifyPasswordResetToken(tamperedToken, mockUser);
    expect(result.valid).toBe(false);
  });

  it('5. rejects token presented for a different user', () => {
    const { token } = generatePasswordResetToken(mockUser);

    const otherUser = {
      id: 'usr-test-bob',
      email: 'bob@antigravity.internal',
      passwordHash: mockUser.passwordHash,
    };

    const result = verifyPasswordResetToken(token, otherUser);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('không thuộc về tài khoản này');
  });

  it('6. renders royal luxury reset email with no plaintext secrets', () => {
    const html = renderPasswordResetEmail({
      recipientName: 'Alice',
      resetUrl: 'https://staging.antigravity.internal/reset-password?token=safe_token',
      companyName: 'Antigravity SaaS',
    });

    expect(html).toContain('Yêu Cầu Đặt Lại Mật Khẩu');
    expect(html).toContain('https://staging.antigravity.internal/reset-password?token=safe_token');
    expect(html).toContain('15 phút');

    // Never contain secret keywords
    expect(html).not.toContain('DATABASE_URL');
    expect(html).not.toContain('AUTH_SECRET');
    expect(html).not.toContain('passwordHash');
    expect(html).not.toContain('service_role');
  });

  it('7. renders high-contrast email CTA button with explicit white text and email-safe table wrapper', () => {
    const html = renderPasswordResetEmail({
      recipientName: 'Alice',
      resetUrl: 'https://staging.antigravity.internal/reset-password?token=safe_token',
      companyName: 'Antigravity SaaS',
    });

    // 1. Explicit pure white text styling with high specificity for Gmail/Outlook
    expect(html).toContain('color: #ffffff !important;');
    expect(html).toContain('-webkit-text-fill-color: #ffffff;');
    expect(html).toContain('text-decoration: none;');
    expect(html).toContain('font-weight: 700;');

    // 2. Blue/purple button background preserved
    expect(html).toContain('background: #3b5cff;');
    expect(html).toContain('linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)');

    // 3. Table-based email button wrapper for email client compatibility
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('Đặt Lại Mật Khẩu Ngay →');
  });
});
