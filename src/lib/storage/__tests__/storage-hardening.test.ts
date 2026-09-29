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

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { LocalStorageProvider } from '../providers/local.provider';
import { SupabaseStorageProvider } from '../providers/supabase.provider';
import { StorageManager } from '../storage-manager';
import { logger } from '@/lib/logger';
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
      findFirst: vi.fn(),
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
    (prisma.employee.findFirst as unknown as Mock).mockImplementation(async ({ where }) => {
      const employee = await (prisma.employee.findUnique as unknown as Mock)({ where: { id: where.id } });
      return employee?.organizationId === where.organizationId ? employee : null;
    });
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

    describe('SupabaseStorageProvider — Delete Observability & Idempotency', () => {
      let provider: SupabaseStorageProvider;

      beforeEach(() => {
        provider = new SupabaseStorageProvider({
          supabaseUrl: 'https://test-project.supabase.co',
          serviceRoleKey: 'test-service-role-key-256',
        });
      });

      afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      });

      it('[SUPABASE-DEL-01] DELETE 2xx success returns success and does not emit warning', async () => {
        const warnSpy = vi.spyOn(logger, 'warn');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: vi.fn().mockResolvedValue('') }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.success).toBe(true);
        expect(details.errorCode).toBe('NONE');
        expect(details.errorSignalConflict).toBe('NO');
        expect(warnSpy).not.toHaveBeenCalled();
        await expect(provider.delete('documents', 'key.pdf')).resolves.toBeUndefined();
      });

      it('[SUPABASE-DEL-02] HTTP 400 + NoSuchKey + statusCode "404" => valid idempotent success', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 400, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'NoSuchKey', statusCode: '404' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.success).toBe(true);
        expect(details.errorCode).toBe('NoSuchKey');
        expect(details.bodyStatusParseValid).toBe('YES');
        expect(details.bodyStatusCode).toBe(404);
        expect(details.errorSignalConflict).toBe('NO');
        await expect(provider.delete('documents', 'key.pdf')).resolves.toBeUndefined();
      });

      it('[SUPABASE-DEL-03] HTTP 400 alone without NoSuchKey => OTHER => failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 400, text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'Bad Request' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.success).toBe(false);
        expect(details.errorClass).toBe('OTHER');
        await expect(provider.delete('documents', 'key.pdf')).rejects.toThrow(ApiError);
      });

      it('[SUPABASE-DEL-04] NoSuchKey from message only (without code) => OTHER => failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 400, text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Object not found: NoSuchKey' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorCode).toBe('OTHER');
        expect(details.success).toBe(false);
        await expect(provider.delete('documents', 'key.pdf')).rejects.toThrow(ApiError);
      });

      it('[SUPABASE-DEL-05] HTTP 401 transport precedence throws unauthorized', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 401, text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'jwt expired' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.success).toBe(false);
        expect(details.errorClass).toBe('InvalidJWT');
        await expect(provider.delete('documents', 'key.pdf')).rejects.toThrow(ApiError);
      });

      it('[SUPABASE-DEL-06] HTTP 403 transport precedence throws forbidden', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 403, text: vi.fn().mockResolvedValue('')
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.success).toBe(false);
        expect(details.errorClass).toBe('AccessDenied');
        await expect(provider.delete('documents', 'key.pdf')).rejects.toThrow(ApiError);
      });

      it('[SUPABASE-DEL-07] Generic HTTP 500 without structured code => SERVER_ERROR => failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 500, text: vi.fn().mockResolvedValue('')
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.success).toBe(false);
        expect(details.errorClass).toBe('SERVER_ERROR');
        await expect(provider.delete('documents', 'key.pdf')).rejects.toThrow(ApiError);
      });

      it('[SUPABASE-DEL-08] DELETE HTTP 3xx redirect marks redirectDetected and throws', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 302, text: vi.fn().mockResolvedValue('')
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.redirectDetected).toBe(true);
        await expect(provider.delete('documents', 'key.pdf')).rejects.toThrow(ApiError);
      });

      it('[SUPABASE-DEL-09] DELETE network exception classifies as NETWORK_ERROR and throws', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Connection reset')));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorCode).toBe('NETWORK_ERROR');
        await expect(provider.delete('documents', 'key.pdf')).rejects.toThrow(ApiError);
      });

      it('[SUPABASE-DEL-10] body statusCode / httpStatusCode conflict prevents idempotent success', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 400, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'NoSuchKey', statusCode: 404, httpStatusCode: 400 }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.bodyStatusConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-11] no raw body or full key leakage into logger.warn on delete failure', async () => {
        const warnSpy = vi.spyOn(logger, 'warn');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 400, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'InvalidRequest', upstream_token: 'secret-token', path: '/var/obj' }))
        }));

        await provider.deleteWithDetails('documents', 'secret-contract.pdf');
        const serializedLog = JSON.stringify(warnSpy.mock.calls);
        expect(serializedLog).not.toContain('secret-token');
        expect(serializedLog).not.toContain('secret-contract.pdf');
      });

      it('[SUPABASE-DEL-12] HTTP 200 + code NoSuchKey => success false, emits sanitized warning without body/key leak', async () => {
        const warnSpy = vi.spyOn(logger, 'warn');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'NoSuchKey', raw_field: 'leak_secret' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'secret-key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          '[SupabaseStorageProvider] Storage delete failed or conflicted',
          expect.objectContaining({
            status: 200,
            errorCode: 'NoSuchKey',
            errorSignalConflict: 'YES',
            bucket: 'documents',
          })
        );
        const serializedLog = JSON.stringify(warnSpy.mock.calls);
        expect(serializedLog).not.toContain('leak_secret');
        expect(serializedLog).not.toContain('secret-key.pdf');
      });

      it('[SUPABASE-DEL-13] HTTP 200 + body statusCode 404 => conflict => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: 404 }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-14] NoSuchKey message mentioning bucket generically MUST NOT false-conflict', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 404, text: vi.fn().mockResolvedValue(JSON.stringify({
            code: 'NoSuchKey',
            statusCode: 404,
            message: 'The object in this bucket has been deleted.'
          }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('NO');
        expect(details.success).toBe(true);
      });

      it('[SUPABASE-DEL-15] NoSuchKey + explicit "bucket not found" => errorSignalConflict = YES => failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 404, text: vi.fn().mockResolvedValue(JSON.stringify({
            code: 'NoSuchKey',
            statusCode: 404,
            message: 'Error: bucket not found for object'
          }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-16] HTTP 401 + AccessDenied => errorSignalConflict = YES', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 401, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'AccessDenied' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-17] HTTP 403 + InvalidJWT => errorSignalConflict = YES', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 403, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'InvalidJWT' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-18] HTTP 500 + InvalidRequest => errorSignalConflict = YES', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 500, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'InvalidRequest' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-19] HTTP 200 + statusCode "invalid" => bodyStatusParseValid = NO => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: 'invalid' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.bodyStatusParseValid).toBe('NO');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-20] HTTP 200 + statusCode 999 => bodyStatusParseValid = NO => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: 999 }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.bodyStatusParseValid).toBe('NO');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-21] HTTP 400 + NoSuchKey with malformed body status => bodyStatusParseValid = NO => NOT idempotent success', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 400, text: vi.fn().mockResolvedValue(JSON.stringify({ code: 'NoSuchKey', statusCode: 'bad_number' }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.bodyStatusParseValid).toBe('NO');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-22] HTTP 404 + NoSuchKey + error "AccessDenied" => conflict YES => success false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 404, text: vi.fn().mockResolvedValue(JSON.stringify({
            code: 'NoSuchKey',
            statusCode: 404,
            error: 'AccessDenied'
          }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-23] HTTP 404 + NoSuchKey + error "InvalidRequest" => conflict YES => success false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 404, text: vi.fn().mockResolvedValue(JSON.stringify({
            code: 'NoSuchKey',
            statusCode: 404,
            error: 'InvalidRequest'
          }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-24] HTTP 404 + NoSuchKey + error "bucket_not_found" => conflict YES => success false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 404, text: vi.fn().mockResolvedValue(JSON.stringify({
            code: 'NoSuchKey',
            statusCode: 404,
            error: 'bucket_not_found'
          }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-25] HTTP 200 + { statusCode: null } => bodyStatusParseValid = NO => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: null }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.bodyStatusParseValid).toBe('NO');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-26] HTTP 200 + { httpStatusCode: null } => bodyStatusParseValid = NO => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ httpStatusCode: null }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.bodyStatusParseValid).toBe('NO');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-27] HTTP 400 + NoSuchKey + statusCode 404 + httpStatusCode null => bodyStatusParseValid = NO => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: false, status: 400, text: vi.fn().mockResolvedValue(JSON.stringify({
            code: 'NoSuchKey',
            statusCode: 404,
            httpStatusCode: null
          }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.bodyStatusParseValid).toBe('NO');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-28] HTTP 200 + { statusCode: 302 } => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: 302 }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-29] HTTP 200 + { statusCode: 199 } => success = false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: 199 }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('YES');
        expect(details.success).toBe(false);
      });

      it('[SUPABASE-DEL-30] HTTP 200 + { statusCode: 204 } => normal success = true', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true, status: 200, text: vi.fn().mockResolvedValue(JSON.stringify({ statusCode: 204 }))
        }));
        const details = await provider.deleteWithDetails('documents', 'key.pdf');
        expect(details.errorSignalConflict).toBe('NO');
        expect(details.bodyStatusParseValid).toBe('YES');
        expect(details.success).toBe(true);
        await expect(provider.delete('documents', 'key.pdf')).resolves.toBeUndefined();
      });
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

    it('[SVC-DEL-01] DocumentService delete blocks DB update when file storage delete throws', async () => {
      const mockEmployee = {
        id: 'emp-del-01',
        organizationId: 'org-tenant-a',
        documents: [{ id: 'doc-to-delete', name: 'Contract.pdf', storedFilename: 'doc-to-delete.pdf' }],
      };
      (prisma.employee.findUnique as any).mockResolvedValue(mockEmployee);
      const updateSpy = vi.spyOn(prisma.employee, 'update');

      const mockStorageProvider = {
        upload: vi.fn(),
        download: vi.fn(),
        delete: vi.fn().mockRejectedValue(ApiError.internal('Physical storage delete failed')),
        exists: vi.fn(),
        getSignedUrl: vi.fn(),
      };
      const getProviderSpy = vi.spyOn(StorageManager, 'getProvider').mockReturnValue(mockStorageProvider as any);

      try {
        await expect(
          DocumentService.deleteEmployeeDocument('emp-del-01', 'doc-to-delete', tenantASession)
        ).rejects.toThrow('Physical storage delete failed');

        expect(updateSpy).not.toHaveBeenCalled();
      } finally {
        updateSpy.mockRestore();
        getProviderSpy.mockRestore();
      }
    });

    it('[SVC-DEL-02] DocumentService delete permits DB metadata update when storage delete succeeds idempotently', async () => {
      const mockEmployee = {
        id: 'emp-del-02',
        organizationId: 'org-tenant-a',
        documents: [{ id: 'doc-already-gone', name: 'OldContract.pdf', storedFilename: 'doc-already-gone.pdf' }],
      };
      (prisma.employee.findUnique as any).mockResolvedValue(mockEmployee);
      const updateSpy = vi.spyOn(prisma.employee, 'update').mockResolvedValue({} as any);

      const mockStorageProvider = {
        upload: vi.fn(), download: vi.fn(), delete: vi.fn().mockResolvedValue(undefined), exists: vi.fn(), getSignedUrl: vi.fn(),
      };
      const getProviderSpy = vi.spyOn(StorageManager, 'getProvider').mockReturnValue(mockStorageProvider as any);

      try {
        const res = await DocumentService.deleteEmployeeDocument('emp-del-02', 'doc-already-gone', tenantASession);
        expect(res.success).toBe(true);
        expect(updateSpy).toHaveBeenCalled();
      } finally {
        updateSpy.mockRestore();
        getProviderSpy.mockRestore();
      }
    });
  });
});
