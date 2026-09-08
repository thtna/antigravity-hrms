import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { OnboardingService } from '@/lib/services/onboarding.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse, UserSession } from '@/types';
import { signSessionToken, setSessionCookie } from '@/lib/auth/session';

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));

    const step = Number(body.step);
    if (!step || step < 1 || step > 8) {
      throw ApiError.badRequest('Tham số bước (step) không hợp lệ (yêu cầu từ 1 đến 8).');
    }

    const result = await OnboardingService.saveStep(session, step, body.data || {});

    // Synchronize session cookie with latest onboarding progress
    try {
      const updatedStep = Math.max(session.onboardingStep ?? 0, result.nextStep);
      const isCompleted = updatedStep >= 9 || Boolean(result.status?.isCompleted);
      const refreshedSession: UserSession = {
        ...session,
        onboardingStep: updatedStep,
        needsOnboarding: !isCompleted,
      };
      const token = await signSessionToken(refreshedSession);
      await setSessionCookie(token);
    } catch {
      // Cookie update failure in detached context should not fail API response
    }

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
