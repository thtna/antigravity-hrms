import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { PenaltyService } from '@/lib/services/penalty.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<unknown>>> {
  try {
    const session = await requireAuth();
    const summary = await PenaltyService.getPenaltyDashboardSummary(session);

    return NextResponse.json({
      success: true,
      data: summary,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
