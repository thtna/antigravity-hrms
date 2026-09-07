/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — PRODUCTION STORAGE ABSTRACTION TYPES
 * ==============================================================================
 */

export type StorageBucket = 'avatars' | 'documents';

export interface StorageMetadata {
  size: number;
  contentType: string;
  updatedAt?: Date;
  eTag?: string;
  [key: string]: unknown;
}

export interface UploadOptions {
  contentType: string;
  upsert?: boolean;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
  download?: boolean | string; // filename
}

export interface UploadResult {
  key: string;
  bucket: StorageBucket;
  path: string;
  publicUrl?: string;
}

export interface DownloadResult {
  buffer: Buffer;
  metadata?: StorageMetadata;
}

export interface StorageProvider {
  readonly providerName: string;

  upload(
    bucket: StorageBucket,
    key: string,
    buffer: Buffer | Uint8Array,
    options: UploadOptions
  ): Promise<UploadResult>;

  download(bucket: StorageBucket, key: string): Promise<DownloadResult>;

  delete(bucket: StorageBucket, key: string): Promise<void>;

  exists(bucket: StorageBucket, key: string): Promise<boolean>;

  getSignedUrl(
    bucket: StorageBucket,
    key: string,
    options?: SignedUrlOptions
  ): Promise<string>;

  getPublicUrl(bucket: StorageBucket, key: string): string;

  getMetadata(bucket: StorageBucket, key: string): Promise<StorageMetadata | null>;
}
