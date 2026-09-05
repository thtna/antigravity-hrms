import { NextRequest, NextResponse } from 'next/server';
import { verifyOwnershipOrAdmin } from '@/lib/auth/guard';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ownerId: string }> }
): Promise<NextResponse<ApiResponse<{ message: string; accessibleOwnerId: string }>>> {
  try {
    const { ownerId } = await params;

    const session = await verifyOwnershipOrAdmin(
      ownerId,
      'Truy cập bị từ chối: Phát hiện nỗ lực truy cập tài nguyên của người dùng khác (Chặn IDOR).'
    );

    return NextResponse.json({
      success: true,
      data: {
        message: 'Truy cập hợp lệ: Bạn là chủ sở hữu tài nguyên hoặc có quyền quản trị tối cao.',
        accessibleOwnerId: ownerId,
        validatedUserId: session.userId,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
