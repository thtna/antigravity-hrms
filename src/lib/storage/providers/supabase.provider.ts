/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — SUPABASE OBJECT STORAGE PROVIDER (PRODUCTION & STAGING)
 * ==============================================================================
 *
 * Implements StorageProvider using Supabase Storage REST API:
 * - Persistent across Vercel Serverless Function invocations
 * - Zero local disk writes (no EROFS or ephemeral loss on Lambda)
 * - Server-side only (SUPABASE_SERVICE_ROLE_KEY never exposed to frontend)
 * - Generates short-lived cryptographically signed URLs for private documents
 */

import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  StorageProvider,
  StorageBucket,
  UploadOptions,
  SignedUrlOptions,
  UploadResult,
  DownloadResult,
  StorageMetadata,
} from '../types';

export interface SupabaseStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export class SupabaseStorageProvider implements StorageProvider {
  public readonly providerName = 'supabase';
  private supabaseUrl: string;
  private serviceRoleKey: string;

  constructor(config?: Partial<SupabaseStorageConfig>) {
    this.supabaseUrl = (
      config?.supabaseUrl ||
      process.env.SUPABASE_URL ||
      ''
    ).replace(/\/$/, '');

    this.serviceRoleKey =
      config?.serviceRoleKey ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      '';

    if (!this.supabaseUrl || !this.serviceRoleKey) {
      logger.warn(
        '[SupabaseStorageProvider] Initialized without full credentials. Will fail at runtime if invoked.'
      );
    }
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): HeadersInit {
    return {
      Authorization: `Bearer ${this.serviceRoleKey}`,
      apikey: this.serviceRoleKey,
      ...extraHeaders,
    };
  }

  async upload(
    bucket: StorageBucket,
    key: string,
    buffer: Buffer | Uint8Array,
    options: UploadOptions
  ): Promise<UploadResult> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw ApiError.internal(
        'Supabase Storage chưa được cấu hình credentials (SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY).'
      );
    }

    const cleanKey = key.replace(/^\/+/, '');
    const url = `${this.supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(cleanKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': options.contentType || 'application/octet-stream',
        'x-upsert': options.upsert !== false ? 'true' : 'false',
      }),
      body: Buffer.from(buffer),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      logger.error(`[SupabaseStorageProvider] Upload failed: ${res.status} ${res.statusText}`, {
        bucket,
        key: cleanKey,
        error: errorText,
      });
      throw ApiError.internal(`Lỗi tải tệp tin lên Supabase Storage: ${res.statusText}`);
    }

    const publicUrl = bucket === 'avatars' ? this.getPublicUrl(bucket, cleanKey) : undefined;

    return {
      key: cleanKey,
      bucket,
      path: `${bucket}/${cleanKey}`,
      publicUrl,
    };
  }

  async download(bucket: StorageBucket, key: string): Promise<DownloadResult> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw ApiError.internal('Supabase Storage chưa được cấu hình.');
    }

    const cleanKey = key.replace(/^\/+/, '');
    const url = `${this.supabaseUrl}/storage/v1/object/authenticated/${bucket}/${encodeURI(cleanKey)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw ApiError.notFound('Tệp tin không tồn tại trên Supabase Storage.');
      }
      throw ApiError.internal(`Lỗi tải tệp tin từ Supabase Storage: ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const contentLength = Number(res.headers.get('content-length')) || buffer.length;

    return {
      buffer,
      metadata: {
        size: contentLength,
        contentType,
      },
    };
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw ApiError.internal('Supabase Storage chưa được cấu hình.');
    }

    const cleanKey = key.replace(/^\/+/, '');
    const url = `${this.supabaseUrl}/storage/v1/object/${bucket}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ prefixes: [cleanKey] }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      logger.warn(`[SupabaseStorageProvider] Delete failed for ${bucket}/${cleanKey}`, { error: err });
    }
  }

  async exists(bucket: StorageBucket, key: string): Promise<boolean> {
    if (!this.supabaseUrl || !this.serviceRoleKey) return false;

    const cleanKey = key.replace(/^\/+/, '');
    const url = `${this.supabaseUrl}/storage/v1/object/info/authenticated/${bucket}/${encodeURI(cleanKey)}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async getSignedUrl(
    bucket: StorageBucket,
    key: string,
    options?: SignedUrlOptions
  ): Promise<string> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw ApiError.internal('Supabase Storage chưa được cấu hình credentials.');
    }

    const cleanKey = key.replace(/^\/+/, '');
    const expiresIn = options?.expiresInSeconds || 300; // 5 minutes default
    const url = `${this.supabaseUrl}/storage/v1/object/sign/${bucket}/${encodeURI(cleanKey)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        expiresIn,
        ...(options?.download ? { download: options.download } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      logger.error(`[SupabaseStorageProvider] Sign URL failed: ${res.status}`, { error: err });
      throw ApiError.internal('Không thể tạo liên kết tải tài liệu an toàn (Signed URL).');
    }

    const data = (await res.json()) as { signedURL?: string };
    if (!data.signedURL) {
      throw ApiError.internal('Phản hồi từ Supabase Storage không chứa signed URL.');
    }

    // Supabase returns relative signedURL (e.g. /object/sign/...)
    return `${this.supabaseUrl}/storage/v1${data.signedURL}`;
  }

  getPublicUrl(bucket: StorageBucket, key: string): string {
    if (bucket === 'avatars') {
      const cleanKey = key.replace(/^\/+/, '');
      return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURI(cleanKey)}`;
    }
    throw ApiError.forbidden('Tài liệu nhân sự riêng tư (documents) bị cấm truy cập qua Public URL.');
  }

  async getMetadata(bucket: StorageBucket, key: string): Promise<StorageMetadata | null> {
    if (!this.supabaseUrl || !this.serviceRoleKey) return null;

    const cleanKey = key.replace(/^\/+/, '');
    const url = `${this.supabaseUrl}/storage/v1/object/info/authenticated/${bucket}/${encodeURI(cleanKey)}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as any;
      return {
        size: Number(data.size || data.contentLength || 0),
        contentType: data.mimetype || data.contentType || 'application/octet-stream',
        eTag: data.etag,
      };
    } catch {
      return null;
    }
  }
}
