/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — TENANT STORAGE KEY BUILDER & SECURITY AUDITOR
 * ==============================================================================
 *
 * Enforces strict tenant path partitioning:
 * - Documents: organizations/{organizationId}/employees/{employeeId}/{docId}.{ext}
 * - Avatars:   organizations/{organizationId}/avatars/{filename}
 *
 * Defenses:
 * - Path traversal defense (blocks .., \, null bytes, encoded dots)
 * - Safe character normalization
 * - Tenant ownership enforcement (prevents cross-tenant key forgery)
 */

import { ApiError } from '@/lib/errors';

/**
 * Sanitizes path segment against path traversal and hazardous characters
 */
export function sanitizePathSegment(segment: string): string {
  if (!segment || typeof segment !== 'string') {
    throw ApiError.badRequest('Tham số đường dẫn lưu trữ không hợp lệ.');
  }

  // Check for path traversal attempts
  const decoded = decodeURIComponent(segment);
  if (
    segment.includes('..') ||
    segment.includes('\\') ||
    decoded.includes('..') ||
    decoded.includes('\\') ||
    segment.includes('\0') ||
    decoded.includes('\0')
  ) {
    throw ApiError.badRequest('Phát hiện hành vi tấn công Path Traversal trong đường dẫn lưu trữ.');
  }

  // Allow only alphanumeric, dashes, underscores, and dots
  const clean = segment.replace(/[^a-zA-Z0-9._-]/g, '_').trim();
  if (!clean || clean.replace(/\./g, '') === '') {
    throw ApiError.badRequest('Đường dẫn lưu trữ không chứa ký tự hợp lệ.');
  }

  return clean;
}

/**
 * Builds tenant-isolated storage key for private employee documents
 */
export function buildTenantDocumentKey(
  organizationId: string,
  employeeId: string,
  docId: string,
  extension: string
): string {
  const cleanOrg = sanitizePathSegment(organizationId);
  const cleanEmp = sanitizePathSegment(employeeId);
  const cleanDoc = sanitizePathSegment(docId);
  const cleanExt = sanitizePathSegment(extension.replace(/^\./, ''));

  return `organizations/${cleanOrg}/employees/${cleanEmp}/${cleanDoc}.${cleanExt}`;
}

/**
 * Builds tenant-isolated storage key for avatars
 */
export function buildTenantAvatarKey(
  organizationId: string,
  filename: string
): string {
  const cleanOrg = sanitizePathSegment(organizationId);
  const cleanFile = sanitizePathSegment(filename);

  return `organizations/${cleanOrg}/avatars/${cleanFile}`;
}

/**
 * Validates that an object key belongs strictly to the authenticated tenant.
 * Throws ApiError.forbidden if the key points to another organization.
 */
export function validateTenantPath(key: string, expectedOrganizationId: string): void {
  if (!key || typeof key !== 'string') {
    throw ApiError.badRequest('Đường dẫn tệp tin không hợp lệ.');
  }

  // Check for traversal
  const decoded = decodeURIComponent(key);
  if (
    key.includes('..') ||
    key.includes('\\') ||
    decoded.includes('..') ||
    decoded.includes('\\') ||
    key.includes('\0') ||
    decoded.includes('\0')
  ) {
    throw ApiError.badRequest('Phát hiện hành vi Path Traversal trong đường dẫn tệp tin.');
  }

  const cleanExpectedOrg = sanitizePathSegment(expectedOrganizationId);
  const expectedPrefix = `organizations/${cleanExpectedOrg}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw ApiError.forbidden(
      'Vi phạm phân lập khách hàng (Cross-Tenant Isolation Violation): Bạn không có quyền truy cập vùng lưu trữ của tổ chức khác.'
    );
  }
}
