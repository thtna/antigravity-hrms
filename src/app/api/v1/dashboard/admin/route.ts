import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guard';
import { DashboardService } from '@/lib/services/dashboard.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/dashboard/admin
 * Provides comprehensive organizational metrics for Admin & HR:
 * - total employees
 * - present today
 * - absent today
 * - late today
 * - pending leave
 * - pending attendance
 * - payroll status
 * - overtime hours
 * - approved bonus & penalty
 * - 7-day attendance & department distribution charts
 */
export async function GET(_req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireRole(['admin', 'hr']);
    const data = await DashboardService.getAdminHrDashboard(session);

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
