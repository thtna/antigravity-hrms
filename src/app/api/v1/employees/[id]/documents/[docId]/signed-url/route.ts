import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { handleApiError } from '@/lib/errors';
import { DocumentService } from '@/lib/services/document.service';
import { ApiResponse } from '@/types';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> }
): Promise<NextResponse<ApiResponse<{ signedUrl: string; expiresInSeconds: number; filename: string }>>> {
  try {
    const session = await requireAuth();
    const { id: employeeId, docId } = await context.params;

    const searchParams = request.nextUrl.searchParams;
    const requestedExpires = Number(searchParams.get('expiresIn')) || 300;
    // Cap expiration between 60s and 3600s
    const expiresInSeconds = Math.min(Math.max(requestedExpires, 60), 3600);

    const result = await DocumentService.getEmployeeDocumentSignedUrl(
      employeeId,
      docId,
      session,
      expiresInSeconds
    );

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
