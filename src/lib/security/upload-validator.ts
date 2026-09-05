import { ApiError } from '@/lib/errors';

/**
 * Allowed MIME types and extensions for secure uploads
 */
export const ALLOWED_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'docx',
  'xlsx',
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Common magic byte signatures for MIME verification
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
  // ZIP-based Office OpenXML (.docx, .xlsx)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
};

export interface FileValidationOptions {
  maxSizeBytes?: number;
  allowedExtensions?: AllowedExtension[];
  allowedMimeTypes?: string[];
}

export interface FileValidationResult {
  valid: boolean;
  sanitizedFilename: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Sanitizes a filename to protect against path traversal (e.g. ../../../etc/passwd)
 * and strip control characters, null bytes, and hazardous shell characters.
 */
export function sanitizeFilename(rawFilename: string): string {
  if (!rawFilename || typeof rawFilename !== 'string') {
    return `upload_${Date.now()}`;
  }

  // Extract base filename, stripping any directory components (both / and \)
  const baseName = rawFilename.split(/[/\\]/).pop() || '';

  // Remove null bytes and path traversal patterns
  let clean = baseName.replace(/\0/g, '').replace(/\.\.+/g, '.');

  // Remove dangerous characters: <>:"|?* and control characters
  clean = clean.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();

  // If sanitized name becomes empty or only dots
  if (!clean || clean.replace(/\./g, '') === '') {
    return `upload_${Date.now()}`;
  }

  return clean;
}

/**
 * Validates a file against security constraints:
 * 1. Extension whitelisting
 * 2. MIME type whitelisting
 * 3. File size bounds
 * 4. Magic byte signature verification (when buffer is supplied)
 * 5. Path traversal defense
 */
export function validateUploadedFile(
  file: {
    name: string;
    size: number;
    type?: string;
    buffer?: Buffer | Uint8Array;
  },
  options?: FileValidationOptions
): FileValidationResult {
  const maxBytes = options?.maxSizeBytes || MAX_FILE_SIZE_BYTES;
  const allowedExts = options?.allowedExtensions || ALLOWED_EXTENSIONS;
  const allowedMimes = options?.allowedMimeTypes || ALLOWED_MIME_TYPES;

  // 1. Sanitize filename
  const sanitizedFilename = sanitizeFilename(file.name);

  // 2. Validate extension
  const extParts = sanitizedFilename.split('.');
  if (extParts.length < 2) {
    throw ApiError.badRequest('Tệp tải lên không có định dạng mở rộng (extension) hợp lệ.');
  }

  const ext = extParts.pop()!.toLowerCase() as AllowedExtension;
  if (!allowedExts.includes(ext)) {
    throw ApiError.badRequest(
      `Phần mở rộng [.${ext}] không được phép. Các định dạng được hỗ trợ: ${allowedExts.join(', ')}`
    );
  }

  // 3. Block double extension attacks (e.g. evil.php.jpg)
  const dangerousPatterns = ['php', 'exe', 'bat', 'sh', 'cmd', 'js', 'vbs', 'html', 'htm', 'cgi', 'pl', 'py'];
  for (const part of extParts) {
    if (dangerousPatterns.includes(part.toLowerCase())) {
      throw ApiError.badRequest(
        'Phát hiện tên tệp chứa định dạng thực thi nguy hiểm (Double Extension Attack Blocked).'
      );
    }
  }

  // 4. Validate file size
  if (file.size <= 0) {
    throw ApiError.badRequest('Tệp tải lên không được rỗng (0 bytes).');
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    throw ApiError.badRequest(`Kích thước tệp (${Math.round(file.size / 1024)} KB) vượt quá giới hạn cho phép (${maxMb} MB).`);
  }

  // 5. Validate MIME type
  const mimeType = file.type?.toLowerCase() || '';
  if (mimeType && !allowedMimes.includes(mimeType as any)) {
    throw ApiError.badRequest(`MIME type [${mimeType}] không được hỗ trợ hoặc bị chặn bởi chính sách bảo mật.`);
  }

  // 6. Verify Magic Bytes if buffer is available
  if (file.buffer && file.buffer.length >= 4 && mimeType) {
    const expectedSignatures = MAGIC_BYTES[mimeType];
    if (expectedSignatures) {
      const matchesAny = expectedSignatures.some((sig) => {
        if (file.buffer!.length < sig.length) return false;
        return sig.every((byte, idx) => file.buffer![idx] === byte);
      });

      if (!matchesAny) {
        throw ApiError.badRequest(
          'Nội dung tệp không khớp với định dạng MIME khai báo (Magic Byte Mismatch / Spoofing Detected).'
        );
      }
    }
  }

  return {
    valid: true,
    sanitizedFilename,
    extension: ext,
    mimeType: mimeType || 'application/octet-stream',
    sizeBytes: file.size,
  };
}
