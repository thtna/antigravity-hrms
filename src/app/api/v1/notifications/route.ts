import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { NotificationService, NotificationType } from '@/lib/services/notification.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/notifications
 * Lists notifications for the authenticated user with filters and pagination
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    const isReadParam = searchParams.get('isRead');
    const isRead = isReadParam !== null ? isReadParam === 'true' : undefined;
    const type = (searchParams.get('type') as NotificationType) || undefined;
    const search = searchParams.get('search') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await NotificationService.getUserNotifications(session.userId, {
      isRead,
      type,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/notifications
 * Creates or broadcasts a notification (restricted to Admin/HR roles)
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const isAdminOrHr = session.roles.includes('admin') || session.roles.includes('hr');

    if (!isAdminOrHr) {
      throw ApiError.forbidden('Chỉ Admin hoặc HR mới có quyền tạo thông báo trực tiếp');
    }

    const body = await req.json();
    const { userId, userIds, title, message, type, actionUrl, sendEmail, emailRecipient } = body;

    if (userIds && (Array.isArray(userIds) || userIds === 'all')) {
      const count = await NotificationService.notifySystemEvent({
        userIds,
        title,
        message,
        actionUrl,
      });

      return NextResponse.json({
        success: true,
        data: { broadcastCount: count },
        message: `Đã phát thông báo thành công tới ${count} người dùng`,
      });
    }

    if (!userId) {
      throw ApiError.badRequest('userId hoặc userIds là bắt buộc');
    }

    const notification = await NotificationService.createNotification({
      userId,
      title,
      message,
      type: type || 'system_event',
      actionUrl,
      sendEmail,
      emailRecipient,
    });

    return NextResponse.json(
      {
        success: true,
        data: notification,
        message: 'Tạo thông báo thành công',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
