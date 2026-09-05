import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { NotificationService } from '@/lib/services/notification.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/notifications/read
 * Marks a single notification or all notifications as read for current user
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const notificationId = body?.notificationId;

    const count = await NotificationService.markAsRead(session.userId, notificationId);

    return NextResponse.json({
      success: true,
      data: { updatedCount: count },
      message: notificationId
        ? 'Đã đánh dấu thông báo là đã đọc'
        : `Đã đánh dấu tất cả ${count} thông báo là đã đọc`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
