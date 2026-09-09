/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — LOCAL STORAGE PROVIDER (DEVELOPMENT & TESTING ONLY)
 * ==============================================================================
 *
 * Implements StorageProvider interface on local filesystem:
 * - Compatible with existing development / testing pipelines
 * - Generates secure HMAC signed URLs for private document downloads in dev
 * - Enforces path sanitization before reading/writing
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
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

export class LocalStorageProvider implements StorageProvider {
  public readonly providerName = 'local';
  private rootDir: string;
  private signSecret?: string;

  constructor(rootDir?: string, signSecret?: string) {
    this.rootDir = rootDir || process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
    this.signSecret = signSecret;
  }

  private resolveSignSecret(): string {
    if (this.signSecret && this.signSecret.trim() !== '') {
      return this.signSecret;
    }
    const secret = process.env.AUTH_SECRET?.trim() || process.env.JWT_SECRET?.trim();
    if (!secret) {
      throw ApiError.internal(
        'Cấu hình bảo mật lỗi: Yêu cầu thiết lập AUTH_SECRET để ký/xác thực URL tài liệu cục bộ.'
      );
    }
    return secret;
  }

  private resolveBucketPath(bucket: StorageBucket): string {
    return path.join(this.rootDir, bucket);
  }

  private resolveFilePath(bucket: StorageBucket, key: string): string {
    // Prevent any directory traversal escaping bucket root
    const normalizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const fullPath = path.resolve(this.resolveBucketPath(bucket), normalizedKey);
    const bucketRoot = path.resolve(this.resolveBucketPath(bucket));

    if (!fullPath.startsWith(bucketRoot)) {
      throw ApiError.badRequest('Phát hiện hành vi Path Traversal bất hợp pháp.');
    }

    return fullPath;
  }

  async upload(
    bucket: StorageBucket,
    key: string,
    buffer: Buffer | Uint8Array,
    options: UploadOptions
  ): Promise<UploadResult> {
    const filePath = this.resolveFilePath(bucket, key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);

    const publicUrl = bucket === 'avatars' ? this.getPublicUrl(bucket, key) : undefined;

    return {
      key,
      bucket,
      path: filePath,
      publicUrl,
    };
  }

  async download(bucket: StorageBucket, key: string): Promise<DownloadResult> {
    const filePath = this.resolveFilePath(bucket, key);

    try {
      const buffer = await fs.readFile(filePath);
      const stat = await fs.stat(filePath);
      return {
        buffer,
        metadata: {
          size: stat.size,
          contentType: 'application/octet-stream',
          updatedAt: stat.mtime,
        },
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw ApiError.notFound('Tệp tin không tồn tại trên hệ thống lưu trữ.');
      }
      throw err;
    }
  }

  async delete(bucket: StorageBucket, key: string): Promise<void> {
    const filePath = this.resolveFilePath(bucket, key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        logger.warn(`[LocalStorageProvider] Could not delete file: ${filePath}`, { error: String(err) });
      }
    }
  }

  async exists(bucket: StorageBucket, key: string): Promise<boolean> {
    const filePath = this.resolveFilePath(bucket, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(
    bucket: StorageBucket,
    key: string,
    options?: SignedUrlOptions
  ): Promise<string> {
    const expiresInSeconds = options?.expiresInSeconds || 300; // 5 minutes default
    const exp = Date.now() + expiresInSeconds * 1000;

    // Create HMAC-SHA256 signature
    const secret = this.resolveSignSecret();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${bucket}:${key}:${exp}`);
    const token = hmac.digest('hex');

    const downloadParam = options?.download ? `&download=${encodeURIComponent(String(options.download))}` : '';
    return `/api/v1/storage/signed?bucket=${bucket}&key=${encodeURIComponent(key)}&token=${token}&exp=${exp}${downloadParam}`;
  }

  getPublicUrl(bucket: StorageBucket, key: string): string {
    if (bucket === 'avatars') {
      return `/api/v1/avatars/${encodeURIComponent(key)}`;
    }
    // Private documents never have a public URL
    throw ApiError.forbidden('Tài liệu riêng tư (documents) không hỗ trợ Public URL.');
  }

  async getMetadata(bucket: StorageBucket, key: string): Promise<StorageMetadata | null> {
    const filePath = this.resolveFilePath(bucket, key);
    try {
      const stat = await fs.stat(filePath);
      return {
        size: stat.size,
        contentType: 'application/octet-stream',
        updatedAt: stat.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * Validates signed URL token generated by this local provider
   */
  verifySignedToken(bucket: string, key: string, token: string, exp: number): boolean {
    if (Date.now() > exp) {
      return false; // Expired
    }
    try {
      const secret = this.resolveSignSecret();
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(`${bucket}:${key}:${exp}`);
      const expected = hmac.digest('hex');

      const tokenBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(expected);
      if (tokenBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(tokenBuf, expectedBuf);
    } catch {
      return false;
    }
  }
}
