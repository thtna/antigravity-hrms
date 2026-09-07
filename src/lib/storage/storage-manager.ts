/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — PRODUCTION STORAGE MANAGER & FACTORY
 * ==============================================================================
 *
 * Single entry point for all storage operations in Antigravity HRMS:
 * - Dynamically resolves between LocalStorageProvider (Dev/Test) and SupabaseStorageProvider (Prod)
 * - Enforces tenant isolation on all object keys before storage operations
 * - Guarantees private documents can only be accessed through verified server-side signed URLs
 */

import { logger } from '@/lib/logger';
import { StorageProvider } from './types';
import { LocalStorageProvider } from './providers/local.provider';
import { SupabaseStorageProvider } from './providers/supabase.provider';
import {
  buildTenantDocumentKey,
  buildTenantAvatarKey,
  validateTenantPath,
} from './tenant-keys';

export class StorageManager {
  private static activeProvider: StorageProvider | null = null;
  private static testProvider: StorageProvider | null = null;

  /**
   * Resolves the active StorageProvider based on runtime environment
   */
  public static getProvider(): StorageProvider {
    if (this.testProvider) {
      return this.testProvider;
    }

    if (!this.activeProvider) {
      const explicitProvider = (process.env.STORAGE_PROVIDER || '').toLowerCase();
      const isProd = process.env.NODE_ENV === 'production';
      const hasSupabaseConfig = Boolean(
        process.env.SUPABASE_URL &&
        (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
      );

      if (explicitProvider === 'supabase' || (isProd && hasSupabaseConfig)) {
        logger.info('[StorageManager] Initialized SupabaseStorageProvider for Production/Staging');
        this.activeProvider = new SupabaseStorageProvider();
      } else {
        logger.info('[StorageManager] Initialized LocalStorageProvider for Development/Testing');
        this.activeProvider = new LocalStorageProvider();
      }
    }

    return this.activeProvider;
  }

  /**
   * For testing & mocks: override active provider
   */
  public static setProviderForTesting(provider: StorageProvider | null): void {
    this.testProvider = provider;
  }

  /**
   * Resets active provider to re-evaluate environment
   */
  public static resetProvider(): void {
    this.activeProvider = null;
    this.testProvider = null;
  }

  /**
   * Upload an avatar within the tenant's isolated namespace
   */
  public static async uploadAvatar(params: {
    organizationId: string;
    userId: string;
    filename: string;
    buffer: Buffer | Uint8Array;
    contentType: string;
  }) {
    const { organizationId, userId, filename, buffer, contentType } = params;
    const provider = this.getProvider();

    const key = buildTenantAvatarKey(organizationId, filename);
    validateTenantPath(key, organizationId);

    const uploadRes = await provider.upload('avatars', key, buffer, {
      contentType,
      upsert: true,
    });

    return {
      ...uploadRes,
      key,
      organizationId,
      userId,
    };
  }

  /**
   * Upload an employee document within the tenant's isolated namespace (PRIVATE BUCKET)
   */
  public static async uploadDocument(params: {
    organizationId: string;
    employeeId: string;
    docId: string;
    extension: string;
    buffer: Buffer | Uint8Array;
    contentType: string;
  }) {
    const { organizationId, employeeId, docId, extension, buffer, contentType } = params;
    const provider = this.getProvider();

    const key = buildTenantDocumentKey(organizationId, employeeId, docId, extension);
    validateTenantPath(key, organizationId);

    const uploadRes = await provider.upload('documents', key, buffer, {
      contentType,
      upsert: true,
    });

    return {
      ...uploadRes,
      key,
      organizationId,
      employeeId,
      docId,
      storedFilename: `${docId}.${extension.replace(/^\./, '')}`,
    };
  }

  /**
   * Download a private document buffer with tenant boundary verification
   */
  public static async downloadDocument(params: {
    organizationId: string;
    employeeId: string;
    docId: string;
    extension?: string;
    storedFilename?: string;
    objectKey?: string;
  }) {
    const { organizationId, employeeId, docId, extension = 'bin', storedFilename, objectKey } = params;
    const provider = this.getProvider();

    const key = objectKey || buildTenantDocumentKey(
      organizationId,
      employeeId,
      docId,
      storedFilename ? storedFilename.split('.').pop() || extension : extension
    );

    validateTenantPath(key, organizationId);

    return provider.download('documents', key);
  }

  /**
   * Generate short-lived signed URL for a private document with tenant boundary verification
   */
  public static async getDocumentSignedUrl(params: {
    organizationId: string;
    employeeId: string;
    docId: string;
    extension?: string;
    storedFilename?: string;
    objectKey?: string;
    expiresInSeconds?: number;
    filename?: string;
  }): Promise<string> {
    const {
      organizationId,
      employeeId,
      docId,
      extension = 'bin',
      storedFilename,
      objectKey,
      expiresInSeconds = 300,
      filename,
    } = params;
    const provider = this.getProvider();

    const key = objectKey || buildTenantDocumentKey(
      organizationId,
      employeeId,
      docId,
      storedFilename ? storedFilename.split('.').pop() || extension : extension
    );

    validateTenantPath(key, organizationId);

    return provider.getSignedUrl('documents', key, {
      expiresInSeconds,
      download: filename,
    });
  }

  /**
   * Delete a document with tenant boundary verification
   */
  public static async deleteDocument(params: {
    organizationId: string;
    employeeId: string;
    docId: string;
    extension?: string;
    storedFilename?: string;
    objectKey?: string;
  }) {
    const { organizationId, employeeId, docId, extension = 'bin', storedFilename, objectKey } = params;
    const provider = this.getProvider();

    const key = objectKey || buildTenantDocumentKey(
      organizationId,
      employeeId,
      docId,
      storedFilename ? storedFilename.split('.').pop() || extension : extension
    );

    validateTenantPath(key, organizationId);

    await provider.delete('documents', key);
  }
}
