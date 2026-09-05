import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { handleApiError } from '@/lib/errors';
import { DocumentService } from '@/lib/services/document.service';
import { ApiResponse } from '@/types';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> }
): Promise<NextResponse> {
  try {
    const session = await requireAuth();
    const { id: employeeId, docId } = await context.params;

    // Strict Anti-IDOR Authorization Check performed in DocumentService
    const doc = await DocumentService.downloadEmployeeDocument(employeeId, docId, session);

    // Encode filename safely for Content-Disposition header
    const encodedFilename = encodeURIComponent(doc.filename);

    return new NextResponse(new Uint8Array(doc.buffer), {
      status: 200,
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id: employeeId, docId } = await context.params;

    const result = await DocumentService.deleteEmployeeDocument(employeeId, docId, session);

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        message: 'Xoá tài liệu thành công.',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
