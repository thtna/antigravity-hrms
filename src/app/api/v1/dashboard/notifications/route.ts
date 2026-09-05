import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { DashboardService } from '@/lib/services/dashboard.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/dashboard/notifications
 * Mark one or all notifications as read for current user
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const notificationId = body?.notificationId;

    const count = await DashboardService.markNotificationAsRead(session.userId, notificationId);

    return NextResponse.json({
      success: true,
      data: {
        markedCount: count,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
