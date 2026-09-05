import path from 'path';
import fs from 'fs/promises';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
const AVATAR_DIR = path.join(STORAGE_ROOT, 'avatars');
const DOCUMENT_DIR = path.join(STORAGE_ROOT, 'documents');

/**
 * Ensures storage directories exist
 */
export async function ensureStorageDirectories(): Promise<void> {
  try {
    await fs.mkdir(AVATAR_DIR, { recursive: true });
    await fs.mkdir(DOCUMENT_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create storage directories', error);
  }
}

/**
 * Save an avatar file buffer securely
 */
export async function saveAvatarFile(
  filename: string,
  buffer: Buffer | Uint8Array
): Promise<string> {
  await ensureStorageDirectories();
  const filePath = path.join(AVATAR_DIR, filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Read an avatar file buffer
 */
export async function readAvatarFile(filename: string): Promise<Buffer> {
  const filePath = path.join(AVATAR_DIR, filename);
  try {
    return await fs.readFile(filePath);
  } catch {
    throw ApiError.notFound('Ảnh đại diện không tồn tại.');
  }
}

/**
 * Save an employee document buffer in a protected employee directory
 */
export async function saveDocumentFile(
  employeeId: string,
  docId: string,
  extension: string,
  buffer: Buffer | Uint8Array
): Promise<{ filePath: string; storedFilename: string }> {
  await ensureStorageDirectories();
  const employeeDocDir = path.join(DOCUMENT_DIR, employeeId);
  await fs.mkdir(employeeDocDir, { recursive: true });

  const storedFilename = `${docId}.${extension}`;
  const filePath = path.join(employeeDocDir, storedFilename);
  await fs.writeFile(filePath, buffer);

  return { filePath, storedFilename };
}

/**
 * Read a protected employee document file buffer
 */
export async function readDocumentFile(
  employeeId: string,
  storedFilename: string
): Promise<Buffer> {
  const filePath = path.join(DOCUMENT_DIR, employeeId, storedFilename);
  try {
    return await fs.readFile(filePath);
  } catch {
    throw ApiError.notFound('Tài liệu không tồn tại trên hệ thống lưu trữ.');
  }
}

/**
 * Delete a protected employee document file
 */
export async function deleteDocumentFile(
  employeeId: string,
  storedFilename: string
): Promise<void> {
  const filePath = path.join(DOCUMENT_DIR, employeeId, storedFilename);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    logger.warn(`Could not delete physical file ${filePath}`, { error: String(error) });
  }
}
