import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { handleApiError, ApiError } from '@/lib/errors';
import { DocumentService } from '@/lib/services/document.service';
import { ApiResponse } from '@/types';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id: employeeId } = await context.params;

    const documents = await DocumentService.listEmployeeDocuments(employeeId, session);

    return NextResponse.json({
      success: true,
      data: documents,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id: employeeId } = await context.params;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('type') as any) || 'OTHER';

    if (!file) {
      throw ApiError.badRequest('Vui lòng đính kèm tệp tài liệu để tải lên.');
    }

    const validTypes = ['CONTRACT', 'ID_CARD', 'RESUME', 'CERTIFICATE', 'OTHER'];
    if (!validTypes.includes(documentType)) {
      throw ApiError.badRequest(
        `Loại tài liệu không hợp lệ. Các loại hợp lệ: ${validTypes.join(', ')}`
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await DocumentService.uploadEmployeeDocument(
      employeeId,
      {
        name: file.name,
        size: file.size,
        type: file.type,
        buffer,
      },
      documentType,
      session
    );

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        message: 'Tải lên tài liệu thành công.',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
