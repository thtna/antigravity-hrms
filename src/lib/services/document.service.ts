import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession, EmployeeDocumentItem } from '@/types';
import {
  validateUploadedFile,
  sanitizeFilename,
} from '@/lib/security/upload-validator';
import {
  saveAvatarFile,
  readAvatarFile,
  saveDocumentFile,
  readDocumentFile,
  deleteDocumentFile,
} from '@/lib/security/file-storage';
import { StorageManager } from '@/lib/storage/storage-manager';
import { buildTenantDocumentKey } from '@/lib/storage/tenant-keys';
import path from 'path';
import crypto from 'crypto';

export const AVATAR_ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadFileInput {
  name: string;
  size: number;
  type?: string;
  buffer: Buffer | Uint8Array;
}

export class DocumentService {
  /**
   * Upload user or employee avatar.
   * Access: User can upload own avatar, or HR/Admin for anyone.
   */
  static async uploadAvatar(
    file: UploadFileInput,
    session: UserSession,
    targetUserId?: string
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để tải lên ảnh đại diện.');
    }

    const userId = targetUserId || session.userId;
    const isSelf = session.userId === userId;
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');

    if (!isSelf && !isHrOrAdmin) {
      throw ApiError.forbidden('Bạn không có quyền thay đổi ảnh đại diện của người dùng khác.');
    }

    // Validate avatar file (Images only, max 2MB, magic byte checked)
    const validation = validateUploadedFile(file, {
      maxSizeBytes: AVATAR_MAX_BYTES,
      allowedExtensions: [...AVATAR_ALLOWED_EXTENSIONS],
    });

    // Generate safe filename: avatar_<userId>_<timestamp>.<ext>
    const safeFilename = `avatar_${userId}_${Date.now()}.${validation.extension}`;
    const orgId = session.organizationId || 'org_default_tanphong';

    await saveAvatarFile(safeFilename, file.buffer, orgId);

    const avatarUrl = `/api/v1/avatars/${safeFilename}`;

    // Update Employee record if exists
    const employee = await prisma.employee.findUnique({
      where: { userId },
    });

    if (employee) {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { avatarUrl },
      });
    }

    logger.info(`[DocumentService] Avatar uploaded for user ${userId}`, {
      filename: safeFilename,
      size: validation.sizeBytes,
    });

    return {
      avatarUrl,
      filename: safeFilename,
      size: validation.sizeBytes,
      extension: validation.extension,
    };
  }

  /**
   * Serve avatar buffer
   */
  static async getAvatarBuffer(filename: string, organizationId?: string) {
    // Sanitize filename against directory traversal
    const safeName = sanitizeFilename(filename);
    const ext = path.extname(safeName).toLowerCase().replace('.', '');
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };

    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    const buffer = await readAvatarFile(safeName, organizationId);

    return { buffer, mimeType };
  }

  /**
   * Upload private employee document (Contract, ID Card, CV, Certificate).
   * Access: Admin/HR, Department Manager (within dept), or Employee (self).
   */
  static async uploadEmployeeDocument(
    employeeId: string,
    file: UploadFileInput,
    documentType: 'CONTRACT' | 'ID_CARD' | 'RESUME' | 'CERTIFICATE' | 'OTHER',
    session: UserSession
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để tải lên tài liệu.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { department: true },
    });

    if (!employee || employee.deletedAt || (session.organizationId && employee.organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy nhân viên có ID: ${employeeId}`);
    }

    // Permission Verification
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isSelf = session.employeeId === employee.id || session.userId === employee.userId;
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isSelf) {
      if (isManager) {
        if (employee.departmentId !== session.departmentId) {
          throw ApiError.forbidden('Bạn không thể tải lên tài liệu cho nhân viên thuộc phòng ban khác.');
        }
      } else {
        throw ApiError.forbidden('Bạn không có quyền tải lên tài liệu cho hồ sơ nhân viên này.');
      }
    }

    // Validate uploaded file (Max 10MB, extension whitelist, magic bytes, path traversal sanitization)
    const validation = validateUploadedFile(file, {
      maxSizeBytes: DOCUMENT_MAX_BYTES,
    });

    const docId = crypto.randomUUID();
    const orgId = employee.organizationId || session.organizationId || 'org_default_tanphong';

    const { storedFilename } = await saveDocumentFile(
      employeeId,
      docId,
      validation.extension,
      file.buffer,
      orgId
    );

    const objectKey = buildTenantDocumentKey(orgId, employeeId, docId, validation.extension);

    // Construct private document record with rich storage metadata
    const downloadUrl = `/api/v1/employees/${employeeId}/documents/${docId}`;
    const newDoc: EmployeeDocumentItem & {
      storedFilename: string;
      mimeType: string;
      objectKey: string;
      bucket: string;
      storageProvider: string;
      organizationId: string;
    } = {
      id: docId,
      name: validation.sanitizedFilename,
      type: documentType,
      url: downloadUrl,
      size: validation.sizeBytes,
      storedFilename,
      objectKey,
      bucket: 'documents',
      storageProvider: StorageManager.getProvider().providerName,
      organizationId: orgId,
      mimeType: validation.mimeType,
      uploadedAt: new Date().toISOString(),
    };

    // Update Employee document JSON array
    const existingDocs = (employee.documents as any) || [];
    const updatedDocs = [...existingDocs, newDoc];

    await prisma.employee.update({
      where: { id: employeeId },
      data: { documents: updatedDocs },
    });

    logger.info(`[DocumentService] Document [${docId}] (${documentType}) uploaded for employee ${employee.employeeCode}`, {
      key: objectKey,
    });

    return newDoc;
  }

  /**
   * Download / View a private employee document.
   * STRICT AUTHORIZATION ENFORCEMENT (Anti-IDOR):
   * - Admin & HR: Can access all documents within tenant.
   * - Manager: Can ONLY access documents of employees in their own department.
   * - Employee: Can ONLY access their OWN documents.
   * - Cross-access attempt -> 403 Forbidden!
   */
  static async downloadEmployeeDocument(
    employeeId: string,
    docId: string,
    session: UserSession
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu xác thực tài khoản. Vui lòng đăng nhập để tải tài liệu.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        userId: true,
        employeeCode: true,
        departmentId: true,
        documents: true,
        deletedAt: true,
        organizationId: true,
      },
    });

    if (!employee || employee.deletedAt || (session.organizationId && employee.organizationId !== session.organizationId)) {
      throw ApiError.notFound('Hồ sơ nhân viên không tồn tại hoặc đã bị xoá.');
    }

    // Authorization & IDOR Check
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isSelf = session.employeeId === employee.id || session.userId === employee.userId;
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isSelf) {
      if (isManager) {
        if (employee.departmentId !== session.departmentId) {
          throw ApiError.forbidden(
            'Bạn không có quyền tải tài liệu của nhân viên thuộc phòng ban khác (Chặn IDOR).'
          );
        }
      } else {
        throw ApiError.forbidden(
          'Truy cập bị từ chối: Bạn không có quyền truy cập hoặc tải tài liệu nội bộ của nhân viên khác (Chặn IDOR).'
        );
      }
    }

    // Locate document in metadata
    const docs = (employee.documents as any) || [];
    const targetDoc = docs.find((d: any) => d.id === docId);

    if (!targetDoc) {
      throw ApiError.notFound('Không tìm thấy tài liệu yêu cầu.');
    }

    const orgId = employee.organizationId || session.organizationId || 'org_default_tanphong';
    const ext = targetDoc.name ? targetDoc.name.split('.').pop() || 'bin' : 'bin';
    const storedFilename = targetDoc.storedFilename || `${docId}.${ext}`;

    const buffer = await readDocumentFile(employeeId, storedFilename);

    return {
      buffer,
      filename: targetDoc.name || `document_${docId}.${ext}`,
      mimeType: targetDoc.mimeType || 'application/octet-stream',
      size: targetDoc.size || buffer.length,
      type: targetDoc.type,
    };
  }

  /**
   * Generate short-lived signed URL for an authorized user to access a private document
   */
  static async getEmployeeDocumentSignedUrl(
    employeeId: string,
    docId: string,
    session: UserSession,
    expiresInSeconds: number = 300
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu xác thực tài khoản.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        userId: true,
        employeeCode: true,
        departmentId: true,
        documents: true,
        deletedAt: true,
        organizationId: true,
      },
    });

    if (!employee || employee.deletedAt || (session.organizationId && employee.organizationId !== session.organizationId)) {
      throw ApiError.notFound('Hồ sơ nhân viên không tồn tại hoặc đã bị xoá.');
    }

    // Authorization & IDOR Check
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isSelf = session.employeeId === employee.id || session.userId === employee.userId;
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isSelf) {
      if (isManager) {
        if (employee.departmentId !== session.departmentId) {
          throw ApiError.forbidden(
            'Bạn không có quyền tải tài liệu của nhân viên thuộc phòng ban khác (Chặn IDOR).'
          );
        }
      } else {
        throw ApiError.forbidden(
          'Truy cập bị từ chối: Bạn không có quyền truy cập hoặc tạo Signed URL cho tài liệu nhân viên khác (Chặn IDOR).'
        );
      }
    }

    const docs = (employee.documents as any) || [];
    const targetDoc = docs.find((d: any) => d.id === docId);

    if (!targetDoc) {
      throw ApiError.notFound('Không tìm thấy tài liệu yêu cầu.');
    }

    const orgId = employee.organizationId || session.organizationId || 'org_default_tanphong';
    const ext = targetDoc.name ? targetDoc.name.split('.').pop() || 'bin' : 'bin';
    const storedFilename = targetDoc.storedFilename || `${docId}.${ext}`;
    const objectKey = targetDoc.objectKey;

    const signedUrl = await StorageManager.getDocumentSignedUrl({
      organizationId: orgId,
      employeeId,
      docId,
      storedFilename,
      objectKey,
      expiresInSeconds,
      filename: targetDoc.name,
    });

    return {
      signedUrl,
      expiresInSeconds,
      filename: targetDoc.name || `document_${docId}.${ext}`,
      docId,
    };
  }

  /**
   * List employee documents with IDOR authorization checking
   */
  static async listEmployeeDocuments(employeeId: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        userId: true,
        employeeCode: true,
        departmentId: true,
        documents: true,
        deletedAt: true,
        organizationId: true,
      },
    });

    if (!employee || employee.deletedAt || (session.organizationId && employee.organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy nhân viên.');
    }

    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isSelf = session.employeeId === employee.id || session.userId === employee.userId;
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isSelf) {
      if (isManager) {
        if (employee.departmentId !== session.departmentId) {
          throw ApiError.forbidden('Bạn không có quyền xem tài liệu của nhân viên phòng ban khác.');
        }
      } else {
        throw ApiError.forbidden('Bạn không có quyền xem tài liệu của nhân viên khác (Chặn IDOR).');
      }
    }

    const docs = (employee.documents as any) || [];
    // Ensure all documents have proper secure download URLs and signed URL endpoints
    return docs.map((d: any) => ({
      ...d,
      url: `/api/v1/employees/${employeeId}/documents/${d.id}`,
      signedUrlEndpoint: `/api/v1/employees/${employeeId}/documents/${d.id}/signed-url`,
    }));
  }

  /**
   * Delete employee document
   */
  static async deleteEmployeeDocument(
    employeeId: string,
    docId: string,
    session: UserSession
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        documents: true,
        deletedAt: true,
        organizationId: true,
      },
    });

    if (!employee || employee.deletedAt || (session.organizationId && employee.organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy nhân viên.');
    }

    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    if (!isHrOrAdmin) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xoá tài liệu nhân viên.');
    }

    const docs = (employee.documents as any) || [];
    const targetDoc = docs.find((d: any) => d.id === docId);

    if (!targetDoc) {
      throw ApiError.notFound('Không tìm thấy tài liệu cần xoá.');
    }

    const orgId = employee.organizationId || session.organizationId || 'org_default_tanphong';
    const ext = targetDoc.name ? targetDoc.name.split('.').pop() || 'bin' : 'bin';
    const storedFilename = targetDoc.storedFilename || `${docId}.${ext}`;

    // Delete object through file-storage bridge
    await deleteDocumentFile(employeeId, storedFilename);

    // Update DB
    const updatedDocs = docs.filter((d: any) => d.id !== docId);
    await prisma.employee.update({
      where: { id: employeeId },
      data: { documents: updatedDocs },
    });

    logger.info(`[DocumentService] Deleted document ${docId} for employee ${employeeId}`);

    return { success: true, deletedDocId: docId };
  }
}
