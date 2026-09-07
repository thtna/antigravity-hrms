/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — PHASE 11A.0C STORAGE HARDENING TEST SUITE
 * ==============================================================================
 *
 * Mandated Verification Matrix:
 * 1. A upload A = ALLOW
 * 2. A read A = ALLOW
 * 3. A delete A = ALLOW
 * 4. A read B = DENIED
 * 5. A delete B = DENIED
 * 6. A signed URL B = DENIED
 * 7. B read A = DENIED
 * 8. Invalid MIME = DENIED
 * 9. Oversized file = DENIED
 * 10. Path traversal = DENIED
 * 11. LocalStorageProvider unit tests
 * 12. SupabaseStorageProvider unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalStorageProvider } from '../providers/local.provider';
import { SupabaseStorageProvider } from '../providers/supabase.provider';
import { StorageManager } from '../storage-manager';
import {
  buildTenantDocumentKey,
  buildTenantAvatarKey,
  validateTenantPath,
  sanitizePathSegment,
} from '../tenant-keys';
import {
  validateUploadedFile,
  sanitizeFilename,
} from '@/lib/security/upload-validator';
import { DocumentService } from '@/lib/services/document.service';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import fs from 'fs/promises';
import path from 'path';

// Mock Prisma
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

describe('PHASE 11A.0C — PRODUCTION STORAGE HARDENING & TENANT ISOLATION', () => {
  const TEST_STORAGE_DIR = path.join(process.cwd(), 'scratch', 'test_storage');
  let localProvider: LocalStorageProvider;

  const tenantASession: UserSession = {
    userId: 'usr-tenant-a-owner',
    employeeId: 'emp-tenant-a-01',
    organizationId: 'org-tenant-a',
    email: 'owner@tenant-a.com',
    fullName: 'Tenant A Owner',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const tenantBSession: UserSession = {
    userId: 'usr-tenant-b-owner',
    employeeId: 'emp-tenant-b-01',
    organizationId: 'org-tenant-b',
    email: 'owner@tenant-b.com',
    fullName: 'Tenant B Owner',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    localProvider = new LocalStorageProvider(TEST_STORAGE_DIR);
    StorageManager.setProviderForTesting(localProvider);
  });

  afterEach(async () => {
    StorageManager.resetProvider();
    // Clean test directory
    try {
      await fs.rm(TEST_STORAGE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  // --------------------------------------------------------------------------
  // 1. TENANT ISOLATION & ACCESS CONTROL MATRIX (A vs B)
  // --------------------------------------------------------------------------
  describe('Tenant Boundary & Multi-Tenant Partitioning', () => {
    it('[MATRIX-01] A upload A = ALLOW', async () => {
      const docBuffer = Buffer.from('%PDF-1.4 Tenant A confidential contract');
      const result = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-a-01',
        docId: 'doc-contract-a',
        extension: 'pdf',
        buffer: docBuffer,
        contentType: 'application/pdf',
      });

      expect(result.key).toBe('organizations/org-tenant-a/employees/emp-a-01/doc-contract-a.pdf');
      expect(result.organizationId).toBe('org-tenant-a');
      expect(await localProvider.exists('documents', result.key)).toBe(true);
    });

    it('[MATRIX-02] A read A = ALLOW', async () => {
      const docBuffer = Buffer.from('%PDF-1.4 Tenant A confidential contract');
      const uploadRes = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-a-01',
        docId: 'doc-contract-a',
        extension: 'pdf',
        buffer: docBuffer,
        contentType: 'application/pdf',
      });

      const downloaded = await StorageManager.downloadDocument({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-a-01',
        docId: 'doc-contract-a',
        objectKey: uploadRes.key,
      });

      expect(downloaded.buffer.toString()).toBe(docBuffer.toString());
    });

    it('[MATRIX-03] A delete A = ALLOW', async () => {
      const docBuffer = Buffer.from('%PDF-1.4 Tenant A temp doc');
      const uploadRes = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-a-01',
        docId: 'doc-temp-a',
        extension: 'pdf',
        buffer: docBuffer,
        contentType: 'application/pdf',
      });

      expect(await localProvider.exists('documents', uploadRes.key)).toBe(true);

      await StorageManager.deleteDocument({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-a-01',
        docId: 'doc-temp-a',
        objectKey: uploadRes.key,
      });

      expect(await localProvider.exists('documents', uploadRes.key)).toBe(false);
    });

    it('[MATRIX-04] A read B = DENIED (Throws 403 Forbidden)', async () => {
      // First, Tenant B uploads their confidential document
      const docB = Buffer.from('%PDF-1.4 Tenant B confidential payroll');
      const bRes = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-b',
        employeeId: 'emp-b-01',
        docId: 'doc-b-secret',
        extension: 'pdf',
        buffer: docB,
        contentType: 'application/pdf',
      });

      // Tenant A attempts to read Tenant B's object key using Tenant A's organization credentials
      await expect(
        StorageManager.downloadDocument({
          organizationId: 'org-tenant-a', // Attacker context
          employeeId: 'emp-b-01',
          docId: 'doc-b-secret',
          objectKey: bRes.key, // Target Tenant B key
        })
      ).rejects.toThrow(/Vi phạm phân lập khách hàng/);
    });

    it('[MATRIX-05] A delete B = DENIED (Throws 403 Forbidden)', async () => {
      const docB = Buffer.from('%PDF-1.4 Tenant B confidential file');
      const bRes = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-b',
        employeeId: 'emp-b-01',
        docId: 'doc-b-vital',
        extension: 'pdf',
        buffer: docB,
        contentType: 'application/pdf',
      });

      // Tenant A attempts to delete Tenant B's object
      await expect(
        StorageManager.deleteDocument({
          organizationId: 'org-tenant-a',
          employeeId: 'emp-b-01',
          docId: 'doc-b-vital',
          objectKey: bRes.key,
        })
      ).rejects.toThrow(/Vi phạm phân lập khách hàng/);

      // Verify file was NOT deleted
      expect(await localProvider.exists('documents', bRes.key)).toBe(true);
    });

    it('[MATRIX-06] A signed URL B = DENIED (Throws 403 Forbidden)', async () => {
      const docB = Buffer.from('%PDF-1.4 Tenant B confidential salary');
      const bRes = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-b',
        employeeId: 'emp-b-01',
        docId: 'doc-b-salary',
        extension: 'pdf',
        buffer: docB,
        contentType: 'application/pdf',
      });

      // Tenant A attempts to generate signed URL for Tenant B's object
      await expect(
        StorageManager.getDocumentSignedUrl({
          organizationId: 'org-tenant-a',
          employeeId: 'emp-b-01',
          docId: 'doc-b-salary',
          objectKey: bRes.key,
        })
      ).rejects.toThrow(/Vi phạm phân lập khách hàng/);
    });

    it('[MATRIX-07] B read A = DENIED (Throws 403 Forbidden)', async () => {
      const docA = Buffer.from('%PDF-1.4 Tenant A private contract');
      const aRes = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-a-01',
        docId: 'doc-a-contract',
        extension: 'pdf',
        buffer: docA,
        contentType: 'application/pdf',
      });

      // Tenant B attempts to read Tenant A's object
      await expect(
        StorageManager.downloadDocument({
          organizationId: 'org-tenant-b', // Attacker context
          employeeId: 'emp-a-01',
          docId: 'doc-a-contract',
          objectKey: aRes.key,
        })
      ).rejects.toThrow(/Vi phạm phân lập khách hàng/);
    });
  });

  // --------------------------------------------------------------------------
  // 2. SECURITY & VALIDATION CONSTRAINTS
  // --------------------------------------------------------------------------
  describe('File Validation, Size Limits & Path Traversal Protections', () => {
    it('[SEC-01] invalid MIME = DENIED (Magic bytes mismatch)', () => {
      // Disguised malicious executable
      const fakePdf = {
        name: 'invoice.pdf',
        size: 1024,
        type: 'application/pdf',
        buffer: Buffer.from('MZ\x90\x00\x03\x00\x00\x00fake-exe-binary'),
      };

      expect(() =>
        validateUploadedFile(fakePdf, {
          allowedExtensions: ['pdf'],
          allowedMimeTypes: ['application/pdf'],
        })
      ).toThrow(/Magic Byte|không khớp/);
    });

    it('[SEC-02] oversized file = DENIED (Exceeds size limit)', () => {
      const hugeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 MB > 10 MB limit
      const oversizedDoc = {
        name: 'massive.pdf',
        size: hugeBuffer.length,
        type: 'application/pdf',
        buffer: hugeBuffer,
      };

      expect(() =>
        validateUploadedFile(oversizedDoc, {
          maxSizeBytes: 10 * 1024 * 1024,
        })
      ).toThrow(/vượt quá giới hạn/);
    });

    it('[SEC-03] path traversal = DENIED (Blocks directory traversal patterns)', () => {
      expect(() => sanitizePathSegment('../../../etc/passwd')).toThrow(/Path Traversal/);
      expect(() => sanitizePathSegment('..\\..\\windows\\system32')).toThrow(/Path Traversal/);
      expect(() => sanitizePathSegment('%2e%2e%2fadmin')).toThrow(/Path Traversal/);
      expect(() => sanitizePathSegment('doc\0nullbyte.pdf')).toThrow(/Path Traversal/);

      expect(() =>
        validateTenantPath('organizations/org-a/../../../etc/passwd', 'org-a')
      ).toThrow(/Path Traversal/);
    });

    it('[SEC-04] sanitizeFilename strips path prefixes safely', () => {
      const clean1 = sanitizeFilename('../../malicious.pdf');
      expect(clean1).not.toContain('..');
      expect(clean1).not.toContain('/');

      const clean2 = sanitizeFilename('C:\\Windows\\System32\\payload.png');
      expect(clean2).toBe('payload.png');
    });
  });

  // --------------------------------------------------------------------------
  // 3. SIGNED URL VERIFICATION & SECURITY
  // --------------------------------------------------------------------------
  describe('Signed URL Lifecycle & Expiry', () => {
    it('[SIGN-01] generates valid HMAC signed URL with expiry for LocalStorageProvider', async () => {
      const docBuffer = Buffer.from('%PDF-1.4 test document');
      const uploadRes = await StorageManager.uploadDocument({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-01',
        docId: 'doc-sign-test',
        extension: 'pdf',
        buffer: docBuffer,
        contentType: 'application/pdf',
      });

      const signedUrl = await StorageManager.getDocumentSignedUrl({
        organizationId: 'org-tenant-a',
        employeeId: 'emp-01',
        docId: 'doc-sign-test',
        objectKey: uploadRes.key,
        expiresInSeconds: 300,
      });

      expect(signedUrl).toContain('/api/v1/storage/signed?');
      expect(signedUrl).toContain('bucket=documents');
      expect(signedUrl).toContain('token=');
      expect(signedUrl).toContain('exp=');

      // Parse and verify token using provider
      const url = new URL(signedUrl, 'http://localhost:3000');
      const token = url.searchParams.get('token') || '';
      const exp = Number(url.searchParams.get('exp'));

      expect(localProvider.verifySignedToken('documents', uploadRes.key, token, exp)).toBe(true);
    });

    it('[SIGN-02] expired token is rejected', async () => {
      const expiredTimestamp = Date.now() - 1000; // In the past
      const fakeToken = 'any-token';
      expect(
        localProvider.verifySignedToken('documents', 'some/key.pdf', fakeToken, expiredTimestamp)
      ).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 4. SUPABASE STORAGE REST API PROVIDER TESTS (MOCKED FETCH)
  // --------------------------------------------------------------------------
  describe('SupabaseStorageProvider (Vercel Compatibility)', () => {
    it('[SUPABASE-01] upload calls Supabase Storage REST API with service role key', async () => {
      const globalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"Key":"documents/org-1/doc.pdf"}'),
        json: vi.fn().mockResolvedValue({ Key: 'documents/org-1/doc.pdf' }),
      });
      vi.stubGlobal('fetch', globalFetch);

      const provider = new SupabaseStorageProvider({
        supabaseUrl: 'https://test-project.supabase.co',
        serviceRoleKey: 'test-service-role-key-256',
      });

      const buf = Buffer.from('test binary content');
      const res = await provider.upload('documents', 'organizations/org-1/doc.pdf', buf, {
        contentType: 'application/pdf',
      });

      expect(globalFetch).toHaveBeenCalledWith(
        'https://test-project.supabase.co/storage/v1/object/documents/organizations/org-1/doc.pdf',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-service-role-key-256',
            apikey: 'test-service-role-key-256',
            'Content-Type': 'application/pdf',
          }),
        })
      );
      expect(res.key).toBe('organizations/org-1/doc.pdf');

      vi.unstubAllGlobals();
    });

    it('[SUPABASE-02] getSignedUrl calls Supabase Storage sign endpoint', async () => {
      const globalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          signedURL: '/object/sign/documents/organizations/org-1/doc.pdf?token=xyz123',
        }),
      });
      vi.stubGlobal('fetch', globalFetch);

      const provider = new SupabaseStorageProvider({
        supabaseUrl: 'https://test-project.supabase.co',
        serviceRoleKey: 'test-service-role-key-256',
      });

      const signedUrl = await provider.getSignedUrl('documents', 'organizations/org-1/doc.pdf', {
        expiresInSeconds: 600,
      });

      expect(signedUrl).toBe(
        'https://test-project.supabase.co/storage/v1/object/sign/documents/organizations/org-1/doc.pdf?token=xyz123'
      );

      vi.unstubAllGlobals();
    });

    it('[SUPABASE-03] download reads from Supabase authenticated endpoint for private documents', async () => {
      const fakeData = new TextEncoder().encode('downloaded-bytes');
      const globalFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/pdf',
          'content-length': String(fakeData.byteLength),
        }),
        arrayBuffer: vi.fn().mockResolvedValue(fakeData.buffer),
      });
      vi.stubGlobal('fetch', globalFetch);

      const provider = new SupabaseStorageProvider({
        supabaseUrl: 'https://test-project.supabase.co',
        serviceRoleKey: 'test-service-role-key-256',
      });

      const res = await provider.download('documents', 'organizations/org-1/doc.pdf');
      expect(res.buffer.toString()).toBe('downloaded-bytes');

      vi.unstubAllGlobals();
    });
  });

  // --------------------------------------------------------------------------
  // 5. DOCUMENT SERVICE END-TO-END INTEGRATION
  // --------------------------------------------------------------------------
  describe('DocumentService with Tenant Storage Integration', () => {
    it('[SVC-01] uploadEmployeeDocument saves tenant-scoped metadata in employee.documents', async () => {
      const mockEmployee = {
        id: 'emp-a-01',
        employeeCode: 'EMP-001',
        userId: 'usr-a-01',
        organizationId: 'org-tenant-a',
        departmentId: 'dept-01',
        documents: [],
        deletedAt: null,
      };

      (prisma.employee.findUnique as any).mockResolvedValue(mockEmployee);
      (prisma.employee.update as any).mockImplementation((args: any) => ({
        ...mockEmployee,
        documents: args.data.documents,
      }));

      const fileInput = {
        name: 'Labor_Contract_2026.pdf',
        size: 1024,
        type: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 sample contract'),
      };

      const doc = await DocumentService.uploadEmployeeDocument(
        'emp-a-01',
        fileInput,
        'CONTRACT',
        tenantASession
      );

      expect(doc.name).toBe('Labor_Contract_2026.pdf');
      expect(doc.type).toBe('CONTRACT');
      expect(doc.objectKey).toContain('organizations/org-tenant-a/employees/emp-a-01/');
      expect(doc.storageProvider).toBe('local');
      expect(doc.organizationId).toBe('org-tenant-a');
      expect(doc.bucket).toBe('documents');
    });

    it('[SVC-02] Cross-tenant access via DocumentService is blocked (404/403)', async () => {
      // Employee belongs to Tenant B
      const mockEmployeeB = {
        id: 'emp-b-01',
        employeeCode: 'EMP-B01',
        userId: 'usr-b-01',
        organizationId: 'org-tenant-b',
        departmentId: 'dept-b',
        documents: [
          {
            id: 'doc-secret-b',
            name: 'Secret_B.pdf',
            objectKey: 'organizations/org-tenant-b/employees/emp-b-01/doc-secret-b.pdf',
          },
        ],
        deletedAt: null,
      };

      (prisma.employee.findUnique as any).mockResolvedValue(mockEmployeeB);

      // Tenant A attempts to generate signed URL for Tenant B's employee
      await expect(
        DocumentService.getEmployeeDocumentSignedUrl('emp-b-01', 'doc-secret-b', tenantASession)
      ).rejects.toThrow(/không tồn tại/); // Handled as 404 for anti-enumeration
    });
  });
});
