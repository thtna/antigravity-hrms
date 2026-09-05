import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { DocumentService } from '@/lib/services/document.service';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ filename: string }> }
): Promise<NextResponse> {
  try {
    const { filename } = await context.params;
    const { buffer, mimeType } = await DocumentService.getAvatarBuffer(filename);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
