import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DocumentService } from '../document.service';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import * as fileStorage from '@/lib/security/file-storage';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    employee: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/security/file-storage', () => ({
  saveAvatarFile: vi.fn().mockResolvedValue('/mock/storage/avatars/avatar.png'),
  readAvatarFile: vi.fn().mockResolvedValue(Buffer.from('fake-avatar-bytes')),
  saveDocumentFile: vi.fn().mockResolvedValue({
    filePath: '/mock/storage/documents/emp-01/doc-123.pdf',
    storedFilename: 'doc-123.pdf',
  }),
  readDocumentFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock content')),
  deleteDocumentFile: vi.fn().mockResolvedValue(undefined),
  ensureStorageDirectories: vi.fn().mockResolvedValue(undefined),
}));

describe('PHASE 22 — DOCUMENT & FILE SECURITY TEST SUITE', () => {
  const adminSession: UserSession = {
    userId: 'usr-admin-01',
    employeeId: 'emp-admin-01',
    email: 'admin@antigravity.internal',
    fullName: 'Admin User',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr-01',
    employeeId: 'emp-hr-01',
    email: 'hr@antigravity.internal',
    fullName: 'HR Officer',
    roles: ['hr'],
    permissions: ['employee:write'],
    isActive: true,
  };

  const managerTechSession: UserSession = {
    userId: 'usr-mgr-tech',
    employeeId: 'emp-mgr-tech',
    departmentId: 'dept-tech',
    email: 'mgr.tech@antigravity.internal',
    fullName: 'Tech Manager',
    roles: ['manager'],
    permissions: ['employee:read_dept'],
    isActive: true,
  };

  const employeeASession: UserSession = {
    userId: 'usr-emp-a',
    employeeId: 'emp-a',
    departmentId: 'dept-tech',
    email: 'employee.a@antigravity.internal',
    fullName: 'Employee A',
    roles: ['employee'],
    permissions: ['employee:read_self'],
    isActive: true,
  };

  const employeeBSession: UserSession = {
    userId: 'usr-emp-b',
    employeeId: 'emp-b',
    departmentId: 'dept-sales',
    email: 'employee.b@antigravity.internal',
    fullName: 'Employee B',
    roles: ['employee'],
    permissions: ['employee:read_self'],
    isActive: true,
  };

  const mockEmployeeA = {
    id: 'emp-a',
    userId: 'usr-emp-a',
    employeeCode: 'EMP-A',
    departmentId: 'dept-tech',
    deletedAt: null,
    documents: [
      {
        id: 'doc-contract-a',
        name: 'HopDongLaoDong_EmpA.pdf',
        type: 'CONTRACT',
        url: '/api/v1/employees/emp-a/documents/doc-contract-a',
        storedFilename: 'doc-contract-a.pdf',
        size: 1024 * 50,
        mimeType: 'application/pdf',
        uploadedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  };

  const mockEmployeeB = {
    id: 'emp-b',
    userId: 'usr-emp-b',
    employeeCode: 'EMP-B',
    departmentId: 'dept-sales',
    deletedAt: null,
    documents: [
      {
        id: 'doc-secret-b',
        name: 'BangLuong_BaoMat_EmpB.pdf',
        type: 'CONTRACT',
        url: '/api/v1/employees/emp-b/documents/doc-secret-b',
        storedFilename: 'doc-secret-b.pdf',
        size: 1024 * 80,
        mimeType: 'application/pdf',
        uploadedAt: '2026-09-01T00:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. AVATAR UPLOAD VALIDATION & SECURITY ─────────────────────────────────
  describe('1. Avatar Upload & Image Validation', () => {
    it('should upload avatar successfully for user self', async () => {
      const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue({ id: 'emp-a', userId: 'usr-emp-a' });
      (prisma.employee.update as unknown as Mock).mockResolvedValue({});

      const result = await DocumentService.uploadAvatar(
        {
          name: 'my_avatar.png',
          size: 1024 * 50,
          type: 'image/png',
          buffer: validPngBuffer,
        },
        employeeASession
      );

      expect(result.avatarUrl).toContain('/api/v1/avatars/avatar_usr-emp-a_');
      expect(result.extension).toBe('png');
      expect(fileStorage.saveAvatarFile).toHaveBeenCalled();
    });

    it('should REJECT non-image format (e.g. PDF or EXE) for avatar', async () => {
      await expect(
        DocumentService.uploadAvatar(
          {
            name: 'malicious.exe',
            size: 1024,
            type: 'application/x-msdownload',
            buffer: Buffer.from('MZ...'),
          },
          employeeASession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should REJECT oversized avatar exceeding 2MB', async () => {
      const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      await expect(
        DocumentService.uploadAvatar(
          {
            name: 'giant_avatar.png',
            size: 3 * 1024 * 1024, // 3MB > 2MB limit
            type: 'image/png',
            buffer: validPngBuffer,
          },
          employeeASession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should BLOCK regular employee from uploading avatar for another user', async () => {
      const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      await expect(
        DocumentService.uploadAvatar(
          {
            name: 'avatar.png',
            size: 1024,
            type: 'image/png',
            buffer: validPngBuffer,
          },
          employeeASession,
          'usr-emp-b' // Trying to change Employee B's avatar
        )
      ).rejects.toThrow(ApiError);
    });
  });

  // ── 2. EMPLOYEE DOCUMENT UPLOAD & VALIDATION ────────────────────────────────
  describe('2. Employee Document Upload & Security Validation', () => {
    it('should allow Admin or Employee Self to upload valid PDF document', async () => {
      const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]); // %PDF-1.
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);
      (prisma.employee.update as unknown as Mock).mockResolvedValue({});

      const res = await DocumentService.uploadEmployeeDocument(
        'emp-a',
        {
          name: 'Official_Contract_2026.pdf',
          size: 1024 * 300,
          type: 'application/pdf',
          buffer: validPdfBuffer,
        },
        'CONTRACT',
        employeeASession
      );

      expect(res.id).toBeDefined();
      expect(res.type).toBe('CONTRACT');
      expect(res.url).toContain('/api/v1/employees/emp-a/documents/');
      expect(prisma.employee.update).toHaveBeenCalled();
    });

    it('should REJECT dangerous executable extensions (.php, .sh, .exe)', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      await expect(
        DocumentService.uploadEmployeeDocument(
          'emp-a',
          {
            name: 'webshell.php',
            size: 1024,
            type: 'application/x-php',
            buffer: Buffer.from('<?php echo "hack"; ?>'),
          },
          'OTHER',
          employeeASession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should REJECT double extension attacks like invoice.pdf.exe', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      await expect(
        DocumentService.uploadEmployeeDocument(
          'emp-a',
          {
            name: 'invoice.pdf.exe',
            size: 1024,
            type: 'application/octet-stream',
            buffer: Buffer.from('MZ...'),
          },
          'OTHER',
          employeeASession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should REJECT spoofed MIME type when magic bytes do not match', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      const fakePdfBuffer = Buffer.from([0x00, 0x11, 0x22, 0x33]); // Invalid header for PDF
      await expect(
        DocumentService.uploadEmployeeDocument(
          'emp-a',
          {
            name: 'spoofed.pdf',
            size: 1024,
            type: 'application/pdf',
            buffer: fakePdfBuffer,
          },
          'CONTRACT',
          employeeASession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should REJECT document exceeding 10MB limit', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      await expect(
        DocumentService.uploadEmployeeDocument(
          'emp-a',
          {
            name: 'massive.pdf',
            size: 12 * 1024 * 1024, // 12MB > 10MB
            type: 'application/pdf',
            buffer: validPdfBuffer,
          },
          'CONTRACT',
          employeeASession
        )
      ).rejects.toThrow(ApiError);
    });
  });

  // ── 3. PRIVATE DOCUMENT PROTECTION & DOWNLOAD AUTHORIZATION (ANTI-IDOR) ────
  describe('3. Private Document Protection & Download Authorization (Anti-IDOR)', () => {
    it('CRITICAL: should BLOCK Employee A from downloading Employee B private contract with 403 Forbidden', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeB);

      try {
        await DocumentService.downloadEmployeeDocument('emp-b', 'doc-secret-b', employeeASession);
        expect.unreachable('Should have thrown 403 Forbidden');
      } catch (error) {
        expect((error as ApiError).statusCode).toBe(403);
        expect((error as ApiError).message).toContain('Truy cập bị từ chối');
        expect((error as ApiError).message).toContain('Chặn IDOR');
      }
    });

    it('CRITICAL: should BLOCK unauthenticated request (no session) with 401 Unauthorized', async () => {
      await expect(
        DocumentService.downloadEmployeeDocument('emp-a', 'doc-contract-a', null as any)
      ).rejects.toThrow(ApiError);

      try {
        await DocumentService.downloadEmployeeDocument('emp-a', 'doc-contract-a', null as any);
      } catch (error) {
        expect((error as ApiError).statusCode).toBe(401);
      }
    });

    it('CRITICAL: should BLOCK Manager from downloading document of employee in ANOTHER department', async () => {
      // Manager is in dept-tech, Employee B is in dept-sales
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeB);

      try {
        await DocumentService.downloadEmployeeDocument('emp-b', 'doc-secret-b', managerTechSession);
        expect.unreachable('Should have thrown 403 Forbidden');
      } catch (error) {
        expect((error as ApiError).statusCode).toBe(403);
        expect((error as ApiError).message).toContain('phòng ban khác');
      }
    });

    it('SUCCESS: should ALLOW Employee A to download their OWN private document', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      const result = await DocumentService.downloadEmployeeDocument(
        'emp-a',
        'doc-contract-a',
        employeeASession
      );

      expect(result.filename).toBe('HopDongLaoDong_EmpA.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(fileStorage.readDocumentFile).toHaveBeenCalledWith('emp-a', 'doc-contract-a.pdf');
      expect(result.buffer).toBeDefined();
    });

    it('SUCCESS: should ALLOW Manager to download document of employee in their MANAGED department', async () => {
      // Manager is in dept-tech, Employee A is in dept-tech
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      const result = await DocumentService.downloadEmployeeDocument(
        'emp-a',
        'doc-contract-a',
        managerTechSession
      );

      expect(result.filename).toBe('HopDongLaoDong_EmpA.pdf');
      expect(result.mimeType).toBe('application/pdf');
    });

    it('SUCCESS: should ALLOW Admin or HR to download ANY employee private document', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeB);

      const resultAdmin = await DocumentService.downloadEmployeeDocument(
        'emp-b',
        'doc-secret-b',
        adminSession
      );
      expect(resultAdmin.filename).toBe('BangLuong_BaoMat_EmpB.pdf');

      const resultHr = await DocumentService.downloadEmployeeDocument(
        'emp-b',
        'doc-secret-b',
        hrSession
      );
      expect(resultHr.filename).toBe('BangLuong_BaoMat_EmpB.pdf');
    });

    it('should return 404 if document ID does not exist in employee records', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      await expect(
        DocumentService.downloadEmployeeDocument('emp-a', 'non-existent-doc-id', employeeASession)
      ).rejects.toThrow(ApiError);
    });
  });

  // ── 4. DOCUMENT LISTING & DELETION ─────────────────────────────────────────
  describe('4. Document Listing & Deletion Security', () => {
    it('should block Employee A from listing Employee B documents with 403 Forbidden', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeB);

      await expect(
        DocumentService.listEmployeeDocuments('emp-b', employeeASession)
      ).rejects.toThrow(ApiError);
    });

    it('should allow Employee A to list their own documents', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      const docs = await DocumentService.listEmployeeDocuments('emp-a', employeeASession);
      expect(docs.length).toBe(1);
      expect(docs[0].name).toBe('HopDongLaoDong_EmpA.pdf');
    });

    it('should allow Admin to delete document and remove physical file', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);
      (prisma.employee.update as unknown as Mock).mockResolvedValue({});

      const del = await DocumentService.deleteEmployeeDocument('emp-a', 'doc-contract-a', adminSession);
      expect(del.success).toBe(true);
      expect(fileStorage.deleteDocumentFile).toHaveBeenCalledWith('emp-a', 'doc-contract-a.pdf');
    });

    it('should block regular employee from deleting document with 403 Forbidden', async () => {
      (prisma.employee.findUnique as unknown as Mock).mockResolvedValue(mockEmployeeA);

      await expect(
        DocumentService.deleteEmployeeDocument('emp-a', 'doc-contract-a', employeeASession)
      ).rejects.toThrow(ApiError);
    });
  });
});
