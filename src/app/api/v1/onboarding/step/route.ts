import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { OnboardingService } from '@/lib/services/onboarding.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));

    const step = Number(body.step);
    if (!step || step < 1 || step > 8) {
      throw ApiError.badRequest('Tham số bước (step) không hợp lệ (yêu cầu từ 1 đến 8).');
    }

    const result = await OnboardingService.saveStep(session, step, body.data || {});

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
