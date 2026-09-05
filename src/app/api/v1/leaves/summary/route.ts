import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { LeaveService } from '@/lib/services/leave.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/leaves/summary
 * Returns pending requests statistics for dashboard integration.
 */
export async function GET(_req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const summary = await LeaveService.getDashboardSummary(session);

    return NextResponse.json({
      success: true,
      data: summary,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
