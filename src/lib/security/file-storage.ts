/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — SECURE FILE STORAGE BRIDGE
 * ==============================================================================
 *
 * Provides backward-compatible file storage facade delegating to StorageManager:
 * - In Development & Test: Routes to LocalStorageProvider
 * - In Production & Staging: Routes to SupabaseStorageProvider (zero local disk writes)
 * - Guarantees Vercel Serverless Function compatibility
 */

import { StorageManager } from '@/lib/storage/storage-manager';

/**
 * Ensures storage directories exist
 */
export async function ensureStorageDirectories(): Promise<void> {
  return Promise.resolve();
}

/**
 * Save an avatar file buffer securely
 */
export async function saveAvatarFile(
  filename: string,
  buffer: Buffer | Uint8Array,
  organizationId?: string
): Promise<string> {
  const orgId = organizationId || 'org_default_tanphong';
  const result = await StorageManager.uploadAvatar({
    organizationId: orgId,
    userId: filename.split('_')[1] || 'user',
    filename,
    buffer,
    contentType: 'image/jpeg',
  });
  return result.path || result.key;
}

/**
 * Read an avatar file buffer
 */
export async function readAvatarFile(
  filename: string,
  organizationId?: string
): Promise<Buffer> {
  const provider = StorageManager.getProvider();
  const orgId = organizationId || 'org_default_tanphong';
  try {
    const key = `organizations/${orgId}/avatars/${filename}`;
    const res = await provider.download('avatars', key);
    return res.buffer;
  } catch {
    const res = await provider.download('avatars', filename);
    return res.buffer;
  }
}

/**
 * Save an employee document buffer in a protected document directory
 */
export async function saveDocumentFile(
  employeeId: string,
  docId: string,
  extension: string,
  buffer: Buffer | Uint8Array,
  organizationId?: string
): Promise<{ filePath: string; storedFilename: string }> {
  const orgId = organizationId || 'org_default_tanphong';
  const result = await StorageManager.uploadDocument({
    organizationId: orgId,
    employeeId,
    docId,
    extension,
    buffer,
    contentType: 'application/pdf',
  });
  return {
    filePath: result.path || result.key,
    storedFilename: result.storedFilename,
  };
}

/**
 * Read a protected employee document file buffer
 */
export async function readDocumentFile(
  employeeId: string,
  storedFilename: string,
  organizationId?: string
): Promise<Buffer> {
  const orgId = organizationId || 'org_default_tanphong';
  const docId = storedFilename.split('.')[0] || storedFilename;
  const res = await StorageManager.downloadDocument({
    organizationId: orgId,
    employeeId,
    docId,
    storedFilename,
  });
  return res.buffer;
}

/**
 * Delete a protected employee document file
 */
export async function deleteDocumentFile(
  employeeId: string,
  storedFilename: string,
  organizationId?: string
): Promise<void> {
  const orgId = organizationId || 'org_default_tanphong';
  const docId = storedFilename.split('.')[0] || storedFilename;
  await StorageManager.deleteDocument({
    organizationId: orgId,
    employeeId,
    docId,
    storedFilename,
  });
}
