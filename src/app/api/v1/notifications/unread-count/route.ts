import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { NotificationService } from '@/lib/services/notification.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/notifications/unread-count
 * Fast endpoint returning the unread notification count for the current user
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<{ unreadCount: number }>>> {
  try {
    const session = await requireAuth();
    const unreadCount = await NotificationService.getUnreadCount(session.userId);

    return NextResponse.json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
