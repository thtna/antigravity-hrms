import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { handleApiError, ApiError } from '@/lib/errors';
import { DocumentService } from '@/lib/services/document.service';
import { ApiResponse } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const targetUserId = formData.get('targetUserId') as string | null;

    if (!file) {
      throw ApiError.badRequest('Vui lòng đính kèm tệp hình ảnh để tải lên làm ảnh đại diện.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await DocumentService.uploadAvatar(
      {
        name: file.name,
        size: file.size,
        type: file.type,
        buffer,
      },
      session,
      targetUserId || undefined
    );

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        message: 'Tải lên ảnh đại diện thành công.',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
