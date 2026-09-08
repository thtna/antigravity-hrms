/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — SECURE PASSWORD RESET TOKEN SERVICE
 * ==============================================================================
 *
 * Cryptographically secure, stateless password reset token lifecycle:
 * - HMAC-SHA256 signed tokens bound to (AUTH_SECRET + user.passwordHash)
 * - Finite TTL (15 minutes / 900 seconds)
 * - Automatic one-time use: When user.passwordHash updates, all previous tokens
 *   become cryptographically invalid immediately.
 * - Zero database schema changes required.
 * - Constant-time comparison prevents timing attacks.
 */

import crypto from 'crypto';
import { ApiError } from '@/lib/errors';

export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface UserResetContext {
  id: string;
  email: string;
  passwordHash: string;
}

function getSignSecret(user: UserResetContext): Buffer {
  const authSecret =
    process.env.AUTH_SECRET ||
    process.env.JWT_SECRET ||
    'antigravity_dev_auth_secret_minimum_32_chars_fallback';
  // Derive a key uniquely coupled to this user's current password hash
  return crypto
    .createHash('sha256')
    .update(`${authSecret}:${user.id}:${user.passwordHash}`)
    .digest();
}

/**
 * Generates a cryptographically signed, expiring reset token
 */
export function generatePasswordResetToken(user: UserResetContext): {
  token: string;
  expiresAt: Date;
} {
  const exp = Date.now() + RESET_TOKEN_TTL_MS;
  const payload = `${user.id}:${user.email.toLowerCase()}:${exp}`;
  const secret = getSignSecret(user);

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const sig = hmac.digest('base64url');

  const token = Buffer.from(JSON.stringify({ u: user.id, e: exp, s: sig })).toString(
    'base64url'
  );

  return {
    token,
    expiresAt: new Date(exp),
  };
}

/**
 * Validates a reset token against the user's current state
 */
export function verifyPasswordResetToken(
  token: string,
  user: UserResetContext
): { valid: boolean; reason?: string } {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, reason: 'Token không hợp lệ.' };
    }

    const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);

    if (!parsed.u || !parsed.e || !parsed.s) {
      return { valid: false, reason: 'Định dạng token không hợp lệ.' };
    }

    if (parsed.u !== user.id) {
      return { valid: false, reason: 'Token không thuộc về tài khoản này.' };
    }

    // Check expiration
    if (Date.now() > parsed.e) {
      return { valid: false, reason: 'Liên kết đặt lại mật khẩu đã hết hạn (quá 15 phút).' };
    }

    // Check cryptographic signature with current user.passwordHash
    const payload = `${user.id}:${user.email.toLowerCase()}:${parsed.e}`;
    const secret = getSignSecret(user);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSig = hmac.digest('base64url');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(parsed.s);

    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      return {
        valid: false,
        reason:
          'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng trước đó.',
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Token không thể giải mã.' };
  }
}

/**
 * Extracts userId from token without signature verification (to look up user)
 */
export function extractUserIdFromResetToken(token: string): string | null {
  try {
    const jsonStr = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    return parsed.u || null;
  } catch {
    return null;
  }
}

/**
 * Renders Royal Luxury HTML email template for password reset
 */
export function renderPasswordResetEmail(options: {
  recipientName: string;
  resetUrl: string;
  companyName?: string;
}): string {
  const {
    recipientName,
    resetUrl,
    companyName = 'ANTIGRAVITY CORP HRMS',
  } = options;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Khôi Phục Mật Khẩu</title>
  <style>
    body { margin: 0; padding: 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F3F4F6; }
    .container { max-width: 600px; margin: 40px auto; background: #0B0F19; border: 1px solid #1F2937; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
    .header { background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%); padding: 32px 28px; text-align: left; border-bottom: 1px solid #2563EB33; }
    .logo { font-size: 18px; font-weight: 800; letter-spacing: 2px; color: #60A5FA; text-transform: uppercase; margin-bottom: 12px; }
    .badge { display: inline-block; padding: 4px 12px; font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #FBBF24; background-color: #78350F; border-radius: 9999px; text-transform: uppercase; margin-bottom: 12px; }
    .title { font-size: 22px; font-weight: 700; color: #FFFFFF; margin: 0; line-height: 1.3; }
    .content { padding: 32px 28px; }
    .greeting { font-size: 15px; color: #9CA3AF; margin-bottom: 16px; }
    .message-box { background-color: #111827; border-left: 4px solid #3B82F6; padding: 18px; border-radius: 8px; margin: 20px 0; color: #E5E7EB; line-height: 1.6; font-size: 15px; }
    .warning-box { background-color: #1c1917; border: 1px solid #78350f; padding: 14px; border-radius: 8px; margin: 20px 0; color: #fef08a; font-size: 13px; line-height: 1.5; }
    .btn-wrapper { text-align: center; margin: 32px 0 24px 0; }
    .btn { display: inline-block; background: #3b5cff; background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%); color: #ffffff !important; -webkit-text-fill-color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 16px 32px; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); }
    .footer { background: #030712; padding: 24px 28px; text-align: center; border-top: 1px solid #1F2937; font-size: 12px; color: #6B7280; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">⚡ ${companyName}</div>
      <div class="badge">BẢO MẬT TÀI KHOẢN</div>
      <h1 class="title">Yêu Cầu Đặt Lại Mật Khẩu</h1>
    </div>
    <div class="content">
      <div class="greeting">Xin chào <strong>${recipientName}</strong>,</div>
      <div class="message-box">
        Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản doanh nghiệp của bạn. Vui lòng bấm vào nút bên dưới để tiến hành thiết lập mật khẩu mới:
      </div>
      <div class="btn-wrapper" style="text-align: center; margin: 32px 0 24px 0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto; border-collapse: separate;">
          <tr>
            <td align="center" style="border-radius: 10px; background: #3b5cff; background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%);">
              <a
                href="${resetUrl}"
                class="btn"
                target="_blank"
                style="
                  display: inline-block;
                  background: #3b5cff;
                  background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%);
                  color: #ffffff !important;
                  -webkit-text-fill-color: #ffffff;
                  text-decoration: none;
                  font-weight: 700;
                  font-size: 15px;
                  padding: 16px 32px;
                  border-radius: 10px;
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                "
              >
                Đặt Lại Mật Khẩu Ngay →
              </a>
            </td>
          </tr>
        </table>
      </div>
      <div class="warning-box">
        ⚠️ <strong>Lưu ý bảo mật quan trọng:</strong><br>
        • Liên kết này chỉ có hiệu lực trong vòng <strong>15 phút</strong>.<br>
        • Liên kết chỉ sử dụng được <strong>1 lần duy nhất</strong>.<br>
        • Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email. Mật khẩu hiện tại của bạn vẫn được bảo vệ an toàn.
      </div>
    </div>
    <div class="footer">
      <p>Email này được gửi tự động từ Hệ thống Quản trị Doanh nghiệp Antigravity HRMS.</p>
      <p>&copy; ${new Date().getFullYear()} ${companyName}. Mọi quyền được bảo lưu.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
