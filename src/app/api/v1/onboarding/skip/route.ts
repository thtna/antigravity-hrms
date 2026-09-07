import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { OnboardingService } from '@/lib/services/onboarding.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));

    if (body.all) {
      const result = await OnboardingService.skipAll(session);
      return NextResponse.json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    }

    const step = Number(body.step);
    if (!step || step < 1 || step > 8) {
      throw ApiError.badRequest('Tham số bước cần bỏ qua (step) không hợp lệ.');
    }

    const result = await OnboardingService.skipStep(session, step);

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
