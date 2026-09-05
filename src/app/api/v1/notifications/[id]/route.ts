import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { NotificationService } from '@/lib/services/notification.service';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * DELETE /api/v1/notifications/[id]
 * Deletes / dismisses a specific notification for the current user
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!id) {
      throw ApiError.badRequest('id thông báo là bắt buộc');
    }

    const success = await NotificationService.deleteNotification(session.userId, id);

    if (!success) {
      throw ApiError.notFound('Không tìm thấy thông báo hoặc bạn không có quyền xóa');
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa thông báo thành công',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
