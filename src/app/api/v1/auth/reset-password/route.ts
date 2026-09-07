import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { validateRequest } from '@/lib/validations';
import { ApiError, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ApiResponse } from '@/types';
import {
  verifyPasswordResetToken,
  extractUserIdFromResetToken,
} from '@/lib/auth/password-reset';

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Mã khôi phục không được để trống'),
  newPassword: z.string().min(8, 'Mật khẩu phải có tối thiểu 8 ký tự'),
});

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ reset: boolean }>>> {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateKey = `reset_password:${ip}`;

    const rateCheck = checkRateLimit(rateKey, 5, 300);
    if (!rateCheck.success) {
      throw ApiError.badRequest(
        `Quá nhiều lần thử đặt lại mật khẩu. Vui lòng đợi ${rateCheck.resetTime} giây.`
      );
    }

    const body = await request.json().catch(() => ({}));
    const validated = await validateRequest(ResetPasswordSchema, body);
    const { token, newPassword } = validated;

    const userId = extractUserIdFromResetToken(token);
    if (!userId) {
      throw ApiError.badRequest(
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw ApiError.badRequest(
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'
      );
    }

    const oldPasswordHash = user.passwordHash;

    // Verify cryptographic signature and expiration bound to current passwordHash
    const verification = verifyPasswordResetToken(token, {
      id: user.id,
      email: user.email,
      passwordHash: oldPasswordHash,
    });

    if (!verification.valid) {
      throw ApiError.badRequest(
        verification.reason ||
          'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.'
      );
    }

    // Hash new password securely with bcrypt
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Atomic update: only update if passwordHash hasn't changed since validation (race-condition guard)
    const result = await prisma.user.updateMany({
      where: {
        id: user.id,
        passwordHash: oldPasswordHash,
      },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      logger.warn('Password reset race condition or token reuse detected', {
        userId: user.id,
      });
      throw ApiError.badRequest(
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.'
      );
    }

    logger.info('Password reset successfully completed for user', {
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      data: { reset: true },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
