import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { NotificationService } from '@/lib/services/notification.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/notifications/unread
 * Marks a specific notification as unread for the current user
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const notificationId = body?.notificationId;

    if (!notificationId) {
      throw ApiError.badRequest('notificationId là bắt buộc');
    }

    const success = await NotificationService.markAsUnread(session.userId, notificationId);

    return NextResponse.json({
      success,
      message: success ? 'Đã chuyển trạng thái thông báo thành chưa đọc' : 'Không tìm thấy thông báo',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
