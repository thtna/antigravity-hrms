import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, ApiError } from '@/lib/errors';
import { StorageManager } from '@/lib/storage/storage-manager';
import { LocalStorageProvider } from '@/lib/storage/providers/local.provider';
import { StorageBucket } from '@/lib/storage/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const bucket = searchParams.get('bucket') as StorageBucket;
    const key = searchParams.get('key');
    const token = searchParams.get('token');
    const exp = Number(searchParams.get('exp'));
    const downloadFilename = searchParams.get('download');

    if (!bucket || !key || !token || !exp) {
      throw ApiError.badRequest('Thiếu thông số xác thực Signed URL (bucket, key, token, exp).');
    }

    const provider = StorageManager.getProvider();

    // Verify token using LocalStorageProvider's secret
    if (provider instanceof LocalStorageProvider) {
      const isValid = provider.verifySignedToken(bucket, key, token, exp);
      if (!isValid) {
        throw ApiError.unauthorized('Signed URL không hợp lệ hoặc đã hết hạn.');
      }
    } else {
      // In production with Supabase, signed URLs hit Supabase directly.
      // If this endpoint is called, verify token against standard local secret.
      const local = new LocalStorageProvider();
      const isValid = local.verifySignedToken(bucket, key, token, exp);
      if (!isValid) {
        throw ApiError.unauthorized('Signed URL không hợp lệ hoặc đã hết hạn.');
      }
    }

    // Download file buffer
    const { buffer, metadata } = await provider.download(bucket, key);

    const filename = downloadFilename || key.split('/').pop() || 'document';
    const encodedFilename = encodeURIComponent(filename);
    const contentType = metadata?.contentType || 'application/octet-stream';

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
