import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { DashboardService } from '@/lib/services/dashboard.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/dashboard/manager
 * Provides department-scoped team metrics for Department Managers:
 * - team attendance
 * - lateness
 * - KPI team metrics
 * - approval queue (leaves, attendance corrections, KPIs, bonuses)
 * - live team member list with today's status
 * - 7-day team attendance chart
 */
export async function GET(_req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireRole(['manager', 'admin', 'hr']);
    const data = await DashboardService.getManagerDashboard(session);

    return NextResponse.json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
