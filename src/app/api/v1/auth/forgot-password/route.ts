import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { validateRequest } from '@/lib/validations';
import { ApiError, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ApiResponse } from '@/types';
import { generatePasswordResetToken, renderPasswordResetEmail } from '@/lib/auth/password-reset';
import { EmailService } from '@/lib/email/email.service';

const ForgotPasswordSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
});

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<{ sent: boolean }>>> {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateKey = `forgot_password:${ip}`;

    const rateCheck = checkRateLimit(rateKey, 3, 300);
    if (!rateCheck.success) {
      throw ApiError.badRequest(`Vui lòng đợi ${rateCheck.resetTime} giây trước khi gửi lại yêu cầu.`);
    }

    const body = await request.json().catch(() => ({}));
    const validated = await validateRequest(ForgotPasswordSchema, body);
    const email = validated.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user && user.isActive && !user.deletedAt) {
      const { token } = generatePasswordResetToken({
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
      });

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

      const html = renderPasswordResetEmail({
        recipientName: user.email.split('@')[0],
        resetUrl,
      });

      await EmailService.sendEmail({
        to: user.email,
        subject: 'Khôi Phục Mật Khẩu — Antigravity HRMS',
        html,
        text: `Vui lòng truy cập liên kết sau để đặt lại mật khẩu của bạn (có hiệu lực trong 15 phút): ${resetUrl}`,
      });

      logger.info('Password reset email dispatched for user', { userId: user.id });
    } else {
      logger.info('Password reset requested for non-existent or inactive user', { email });
    }

    // Always return success to prevent user enumeration attacks
    return NextResponse.json({
      success: true,
      data: { sent: true },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
