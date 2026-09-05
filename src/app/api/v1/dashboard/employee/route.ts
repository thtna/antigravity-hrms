import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { DashboardService } from '@/lib/services/dashboard.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/dashboard/employee
 * Provides self-service personal metrics for the logged-in Employee:
 * - today's attendance
 * - working hours (today + month to date)
 * - overtime (today + month)
 * - leave balance & recent requests
 * - KPI scorecard for current period
 * - salary & contract rates
 * - payslip with link to PDF
 * - unread notifications & feed
 * - 14-day work hours trend chart
 */
export async function GET(_req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const data = await DashboardService.getEmployeeDashboard(session);

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
