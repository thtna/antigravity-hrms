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

import { createHash } from 'crypto';
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

export type SanitizedStorageErrorCode =
  | 'NONE'
  | 'NoSuchKey'
  | 'NoSuchBucket'
  | 'InvalidRequest'
  | 'AccessDenied'
  | 'InvalidJWT'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'OTHER'
  | 'UNPROVEN';

export type SanitizedStorageErrorClass = SanitizedStorageErrorCode;

export interface StorageDeleteResult {
  attempted: boolean;
  httpStatus: number;
  responseOk: boolean;
  redirectDetected: boolean;
  errorCode: SanitizedStorageErrorCode;
  errorClass: SanitizedStorageErrorClass;
  bodyStatusCode: number | null;
  bodyHttpStatusCode: number | null;
  bodyStatusConflict: 'YES' | 'NO' | 'UNPROVEN';
  bodyStatusParseValid: 'YES' | 'NO' | 'UNPROVEN';
  errorSignalConflict: 'YES' | 'NO' | 'UNPROVEN';
  success: boolean;
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

  private parseStrictHttpStatus(
    json: any,
    prop: string
  ): { present: boolean; valid: boolean; value: number | null } {
    if (!json || typeof json !== 'object' || !Object.prototype.hasOwnProperty.call(json, prop)) {
      return { present: false, valid: false, value: null };
    }
    const val = json[prop];
    if (val === null || val === undefined || typeof val === 'boolean') {
      return { present: true, valid: false, value: null };
    }
    if (typeof val === 'string' && val.trim() === '') {
      return { present: true, valid: false, value: null };
    }
    const parsed = Number(val);
    if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) {
      return { present: true, valid: true, value: parsed };
    }
    return { present: true, valid: false, value: null };
  }

  private classifyDeleteResponse(
    status: number,
    redirectDetected: boolean,
    json: any
  ): Omit<StorageDeleteResult, 'attempted' | 'httpStatus' | 'responseOk' | 'redirectDetected'> {
    if (redirectDetected) {
      return {
        errorCode: 'OTHER',
        errorClass: 'OTHER',
        bodyStatusCode: null,
        bodyHttpStatusCode: null,
        bodyStatusConflict: 'UNPROVEN',
        bodyStatusParseValid: 'UNPROVEN',
        errorSignalConflict: 'UNPROVEN',
        success: false,
      };
    }

    const rawCode = typeof json?.code === 'string' ? json.code : '';
    const parsedStatus = this.parseStrictHttpStatus(json, 'statusCode');
    const parsedHttp = this.parseStrictHttpStatus(json, 'httpStatusCode');

    const rawStatusCode = parsedStatus.value;
    const rawHttpCode = parsedHttp.value;

    let bodyStatusParseValid: 'YES' | 'NO' | 'UNPROVEN' = 'UNPROVEN';
    if (!parsedStatus.present && !parsedHttp.present) {
      bodyStatusParseValid = 'UNPROVEN';
    } else if (
      (parsedStatus.present && !parsedStatus.valid) ||
      (parsedHttp.present && !parsedHttp.valid)
    ) {
      bodyStatusParseValid = 'NO';
    } else {
      bodyStatusParseValid = 'YES';
    }

    let bodyStatusConflict: 'YES' | 'NO' | 'UNPROVEN' = 'UNPROVEN';
    if (rawStatusCode !== null && rawHttpCode !== null) {
      bodyStatusConflict = rawStatusCode === rawHttpCode ? 'NO' : 'YES';
    } else if (rawStatusCode !== null || rawHttpCode !== null) {
      bodyStatusConflict = 'NO';
    }

    let errorCode: SanitizedStorageErrorCode = 'NONE';
    let errorClass: SanitizedStorageErrorClass = 'NONE';

    if (rawCode === 'NoSuchKey') {
      errorCode = 'NoSuchKey';
      errorClass = 'NoSuchKey';
    } else if (rawCode === 'NoSuchBucket') {
      errorCode = 'NoSuchBucket';
      errorClass = 'NoSuchBucket';
    } else if (rawCode === 'InvalidRequest') {
      errorCode = 'InvalidRequest';
      errorClass = 'InvalidRequest';
    } else if (rawCode === 'AccessDenied') {
      errorCode = 'AccessDenied';
      errorClass = 'AccessDenied';
    } else if (rawCode === 'InvalidJWT') {
      errorCode = 'InvalidJWT';
      errorClass = 'InvalidJWT';
    } else if (rawCode) {
      errorCode = 'OTHER';
      errorClass = 'OTHER';
    } else if (status === 401) {
      errorCode = 'OTHER';
      errorClass = 'InvalidJWT';
    } else if (status === 403) {
      errorCode = 'OTHER';
      errorClass = 'AccessDenied';
    } else if (status >= 500) {
      errorCode = 'OTHER';
      errorClass = 'SERVER_ERROR';
    } else if (status >= 400 && status < 500) {
      errorCode = 'OTHER';
      errorClass = 'OTHER';
    }

    let errorSignalConflict: 'YES' | 'NO' | 'UNPROVEN' = 'NO';

    if (status === 401) {
      if (
        errorCode === 'AccessDenied' ||
        errorCode === 'NoSuchKey' ||
        errorCode === 'NoSuchBucket' ||
        errorCode === 'InvalidRequest'
      ) {
        errorSignalConflict = 'YES';
      }
    }

    if (status === 403) {
      if (
        errorCode === 'InvalidJWT' ||
        errorCode === 'NoSuchKey' ||
        errorCode === 'NoSuchBucket' ||
        errorCode === 'InvalidRequest'
      ) {
        errorSignalConflict = 'YES';
      }
    }

    if (status >= 500) {
      if (
        errorCode === 'NoSuchKey' ||
        errorCode === 'NoSuchBucket' ||
        errorCode === 'InvalidRequest' ||
        errorCode === 'AccessDenied' ||
        errorCode === 'InvalidJWT'
      ) {
        errorSignalConflict = 'YES';
      }
    }

    if (status >= 200 && status < 300) {
      if (errorCode !== 'NONE') errorSignalConflict = 'YES';
      if (rawStatusCode !== null && (rawStatusCode < 200 || rawStatusCode >= 300)) {
        errorSignalConflict = 'YES';
      }
      if (rawHttpCode !== null && (rawHttpCode < 200 || rawHttpCode >= 300)) {
        errorSignalConflict = 'YES';
      }
    }

    const rawMsg = typeof json?.message === 'string' ? json.message.toLowerCase() : '';
    const rawError = typeof json?.error === 'string' ? json.error.toLowerCase() : '';
    const textToScan = `${rawMsg} ${rawError}`;

    const hasBucketConflict =
      rawCode.toLowerCase() === 'nosuchbucket' ||
      textToScan.includes('nosuchbucket') ||
      textToScan.includes('bucket not found') ||
      textToScan.includes('bucket_not_found');

    const hasAuthConflict =
      rawCode.toLowerCase() === 'accessdenied' ||
      rawCode.toLowerCase() === 'invalidjwt' ||
      textToScan.includes('invalidjwt') ||
      textToScan.includes('invalid_jwt') ||
      textToScan.includes('accessdenied') ||
      textToScan.includes('access denied') ||
      textToScan.includes('unauthorized') ||
      textToScan.includes('forbidden');

    const hasInvalidReqConflict =
      rawCode.toLowerCase() === 'invalidrequest' ||
      textToScan.includes('invalidrequest') ||
      textToScan.includes('invalid request');

    if (errorCode === 'NoSuchKey' && (hasBucketConflict || hasAuthConflict || hasInvalidReqConflict)) {
      errorSignalConflict = 'YES';
    }

    const isNormalBodyStatus =
      (rawStatusCode === null || (rawStatusCode >= 200 && rawStatusCode <= 299)) &&
      (rawHttpCode === null || (rawHttpCode >= 200 && rawHttpCode <= 299));

    const isTransportAbsenceStatus = status === 400 || status === 404;
    const isExactNoSuchKey = rawCode === 'NoSuchKey' && errorCode === 'NoSuchKey';
    const has404BodyStatus = rawStatusCode === 404 || rawHttpCode === 404;
    const noStatusConflict = bodyStatusConflict !== 'YES';
    const noSignalConflict = errorSignalConflict === 'NO';

    const isIdempotentAbsent =
      isTransportAbsenceStatus &&
      isExactNoSuchKey &&
      has404BodyStatus &&
      bodyStatusParseValid === 'YES' &&
      noStatusConflict &&
      noSignalConflict &&
      !redirectDetected;

    const isNormalSuccess =
      status >= 200 &&
      status < 300 &&
      !redirectDetected &&
      noSignalConflict &&
      noStatusConflict &&
      bodyStatusParseValid !== 'NO' &&
      isNormalBodyStatus &&
      errorCode === 'NONE';

    return {
      errorCode,
      errorClass,
      bodyStatusCode: rawStatusCode,
      bodyHttpStatusCode: rawHttpCode,
      bodyStatusConflict,
      bodyStatusParseValid,
      errorSignalConflict,
      success: isIdempotentAbsent || isNormalSuccess,
    };
  }

  async deleteWithDetails(bucket: StorageBucket, key: string): Promise<StorageDeleteResult> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw ApiError.internal('Supabase Storage chưa được cấu hình.');
    }

    const cleanKey = key.replace(/^\/+/, '');
    const url = `${this.supabaseUrl}/storage/v1/object/${bucket}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ prefixes: [cleanKey] }),
        redirect: 'manual',
      });
    } catch {
      return {
        attempted: true,
        httpStatus: 0,
        responseOk: false,
        redirectDetected: false,
        errorCode: 'NETWORK_ERROR',
        errorClass: 'NETWORK_ERROR',
        bodyStatusCode: null,
        bodyHttpStatusCode: null,
        bodyStatusConflict: 'UNPROVEN',
        bodyStatusParseValid: 'UNPROVEN',
        errorSignalConflict: 'UNPROVEN',
        success: false,
      };
    }

    const redirectDetected = (res.status >= 300 && res.status < 400) || (res as any).type === 'opaqueredirect';

    let parsedJson: any = null;
    try {
      const text = await res.text();
      if (text && text.trim().length > 0) {
        parsedJson = JSON.parse(text);
      }
    } catch {
      parsedJson = null;
    }

    const classification = this.classifyDeleteResponse(res.status, redirectDetected, parsedJson);

    if (!classification.success) {
      const keyHash = createHash('sha256').update(cleanKey).digest('hex').slice(0, 8);
      logger.warn('[SupabaseStorageProvider] Storage delete failed or conflicted', {
        status: res.status,
        errorCode: classification.errorCode,
        errorClass: classification.errorClass,
        errorSignalConflict: classification.errorSignalConflict,
        bucket,
        keyHash,
      });
    }

    return {
      attempted: true,
      httpStatus: res.status,
      responseOk: res.ok,
      redirectDetected,
      ...classification,
    };
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    const details = await this.deleteWithDetails(bucket, key);

    if (!details.success) {
      if (details.httpStatus === 401) {
        throw ApiError.unauthorized('Xác thực Supabase Storage không hợp lệ.');
      }
      if (details.httpStatus === 403) {
        throw ApiError.forbidden('Không có quyền xoá tệp tin trên Supabase Storage.');
      }
      if (details.httpStatus >= 500) {
        throw ApiError.internal('Lỗi máy chủ Supabase Storage.');
      }
      if (details.redirectDetected) {
        throw ApiError.internal('Phát hiện chuyển hướng không hợp lệ từ Supabase Storage.');
      }
      if (details.errorClass === 'NETWORK_ERROR') {
        throw ApiError.internal('Lỗi kết nối mạng đến Supabase Storage.');
      }

      if (details.errorClass === 'InvalidJWT') {
        throw ApiError.unauthorized('Xác thực Supabase Storage không hợp lệ.');
      }
      if (details.errorClass === 'AccessDenied') {
        throw ApiError.forbidden('Không có quyền xoá tệp tin trên Supabase Storage.');
      }

      throw ApiError.internal(
        `Lỗi xoá tệp tin từ Supabase Storage (Status: ${details.httpStatus}, Code: ${details.errorCode}, Class: ${details.errorClass})`
      );
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
