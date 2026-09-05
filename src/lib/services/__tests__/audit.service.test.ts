import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AuditService, AUDIT_ACTIONS } from '../audit.service';
import { PermissionService } from '../permission.service';
import { validateUploadedFile, sanitizeFilename } from '@/lib/security/upload-validator';
import {
  escapeHtml,
  stripDangerousTags,
  maskIdentityCard,
  maskBankAccount,
  maskPhoneNumber,
} from '@/lib/security/sanitizer';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';
import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    userRole: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    rolePermission: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(prisma)),
  },
}));

describe('PHASE 21 — AUDIT & SECURITY HARDENING TEST SUITE', () => {
  const adminSession: UserSession = {
    userId: 'usr-admin-01',
    email: 'admin@antigravity.internal',
    fullName: 'System Admin',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr-01',
    email: 'hr@antigravity.internal',
    fullName: 'HR Officer',
    roles: ['hr'],
    permissions: ['audit:read'],
    isActive: true,
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp-01',
    email: 'employee@antigravity.internal',
    fullName: 'Regular Staff',
    roles: ['employee'],
    permissions: [],
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. AUDIT LOGGING: 8 CRITICAL EVENTS ────────────────────────────────────
  describe('1. Audit Logging — 8 Critical Business Events', () => {
    it('1.1 should record SALARY_MODIFICATION with before & after diffs', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-salary-1' });

      await AuditService.logSalaryModification({
        employeeId: 'emp-101',
        employeeCode: 'EMP-101',
        actorId: 'usr-admin-01',
        oldValues: { contractSalary: 20000000, hourlyRate: 113636 },
        newValues: { contractSalary: 25000000, hourlyRate: 142045 },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.SALARY_MODIFICATION,
          entity: 'employees',
          entityId: 'emp-101',
          oldValues: expect.objectContaining({ contractSalary: 20000000 }),
          newValues: expect.objectContaining({ contractSalary: 25000000 }),
          ipAddress: '10.0.0.1',
        }),
      });
    });

    it('1.2 should record ATTENDANCE_CORRECTION on adjustment approval', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-att-1' });

      await AuditService.logAttendanceCorrection({
        adjustmentId: 'adj-01',
        employeeId: 'emp-101',
        actorId: 'usr-hr-01',
        oldValues: { status: 'PENDING', checkInTime: '08:45:00' },
        newValues: { status: 'APPROVED', checkInTime: '08:00:00' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.ATTENDANCE_CORRECTION,
          entity: 'attendance_adjustment',
          entityId: 'adj-01',
        }),
      });
    });

    it('1.3 should record BONUS_APPROVAL with financial details', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-bonus-1' });

      await AuditService.logBonusApproval({
        bonusId: 'bon-01',
        employeeId: 'emp-101',
        actorId: 'usr-admin-01',
        oldValues: { status: 'PENDING' },
        newValues: { status: 'APPROVED', amount: 5000000, category: 'KPI' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.BONUS_APPROVAL,
          entity: 'EmployeeBonusPenalty',
          entityId: 'bon-01',
        }),
      });
    });

    it('1.4 should record PENALTY_APPROVAL with deduction details', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-pen-1' });

      await AuditService.logPenaltyApproval({
        penaltyId: 'pen-01',
        employeeId: 'emp-101',
        actorId: 'usr-admin-01',
        oldValues: { status: 'PENDING' },
        newValues: { status: 'APPROVED', amount: 500000, reason: 'Late arrival' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.PENALTY_APPROVAL,
          entity: 'EmployeeBonusPenalty',
          entityId: 'pen-01',
        }),
      });
    });

    it('1.5 should record PAYROLL_CALCULATION with payout statistics', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-pay-calc-1' });

      await AuditService.logPayrollCalculation({
        periodId: 'prd-2026-09',
        periodCode: 'PAY-2026-09',
        actorId: 'usr-hr-01',
        totalEmployees: 50,
        totalGrossPayout: 1000000000,
        totalNetPayout: 850000000,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.PAYROLL_CALCULATION,
          entity: 'PayrollPeriod',
          entityId: 'prd-2026-09',
          newValues: expect.objectContaining({
            totalEmployees: 50,
            totalGrossPayout: 1000000000,
          }),
        }),
      });
    });

    it('1.6 should record PAYROLL_APPROVAL on period approval', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-pay-app-1' });

      await AuditService.logPayrollApproval({
        periodId: 'prd-2026-09',
        periodCode: 'PAY-2026-09',
        stage: 'REVIEW_TO_APPROVED',
        actorId: 'usr-admin-01',
        comments: 'Bảng lương đã đối soát chính xác.',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.PAYROLL_APPROVAL,
          entity: 'PayrollPeriod',
          entityId: 'prd-2026-09',
          oldValues: { status: 'REVIEW' },
          newValues: expect.objectContaining({ status: 'APPROVED' }),
        }),
      });
    });

    it('1.7 should record PAYROLL_PAYMENT on bank disbursement confirmation', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-pay-paid-1' });

      await AuditService.logPayrollPayment({
        periodId: 'prd-2026-09',
        periodCode: 'PAY-2026-09',
        actorId: 'usr-hr-01',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.PAYROLL_PAYMENT,
          entity: 'PayrollPeriod',
          entityId: 'prd-2026-09',
          newValues: expect.objectContaining({ status: 'PAID' }),
        }),
      });
    });

    it('1.8 should record PERMISSION_CHANGE on role modification', async () => {
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-perm-1' });

      await AuditService.logPermissionChange({
        targetUserId: 'usr-target-01',
        targetEmail: 'target@antigravity.internal',
        actorId: 'usr-admin-01',
        actionType: 'ASSIGN_ROLES',
        oldRoles: ['employee'],
        newRoles: ['employee', 'manager'],
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: AUDIT_ACTIONS.PERMISSION_CHANGE,
          entity: 'users',
          entityId: 'usr-target-01',
          oldValues: expect.objectContaining({ roles: ['employee'] }),
          newValues: expect.objectContaining({ roles: ['employee', 'manager'] }),
        }),
      });
    });
  });

  // ── 2. AUDIT LOG EXPLORATION & RBAC ACCESS ─────────────────────────────────
  describe('2. Audit Log Exploration & RBAC Security', () => {
    it('should reject employee from accessing audit logs with 403 Forbidden', async () => {
      await expect(AuditService.getAuditLogs({}, employeeSession)).rejects.toThrow(ApiError);
    });

    it('should allow Admin or HR to query audit logs with pagination and action aliases', async () => {
      (prisma.auditLog.count as unknown as Mock).mockResolvedValue(1);
      (prisma.auditLog.findMany as unknown as Mock).mockResolvedValue([
        {
          id: 'log-01',
          action: 'SALARY_MODIFICATION',
          entity: 'employees',
          entityId: 'emp-01',
          oldValues: { contractSalary: 20000000 },
          newValues: { contractSalary: 25000000 },
          createdAt: new Date(),
          actor: {
            id: 'usr-admin-01',
            email: 'admin@antigravity.internal',
            employee: { firstName: 'Admin', lastName: 'System', employeeCode: 'ADM-01' },
          },
        },
      ]);

      const result = await AuditService.getAuditLogs(
        { action: 'salary modification', page: 1, limit: 10 },
        adminSession
      );

      expect(result.data.length).toBe(1);
      expect(result.pagination.total).toBe(1);
      expect(result.data[0].action).toBe('SALARY_MODIFICATION');
      expect(result.data[0].actor?.name).toBe('System Admin');
    });
  });

  // ── 3. PERMISSION SERVICE & PRIVILEGE ESCALATION ────────────────────────────
  describe('3. PermissionService & Anti-Privilege Escalation', () => {
    it('should block non-admin users from assigning roles', async () => {
      await expect(
        PermissionService.assignUserRoles(
          { targetUserId: 'usr-02', roleCodes: ['admin'] },
          hrSession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should block admin from removing admin role from themselves if sole active admin', async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue({
        id: 'usr-admin-01',
        email: 'admin@antigravity.internal',
        userRoles: [{ role: { code: 'admin' } }],
      });
      (prisma.userRole.count as unknown as Mock).mockResolvedValue(1); // Sole admin

      await expect(
        PermissionService.assignUserRoles(
          { targetUserId: 'usr-admin-01', roleCodes: ['employee'] }, // Attempting self-demotion
          adminSession
        )
      ).rejects.toThrow(ApiError);
    });

    it('should allow admin to assign roles to user and generate audit log', async () => {
      (prisma.user.findUnique as unknown as Mock).mockResolvedValue({
        id: 'usr-target-02',
        email: 'staff@antigravity.internal',
        userRoles: [{ role: { code: 'employee' } }],
      });
      (prisma.role.findMany as unknown as Mock).mockResolvedValue([
        { id: 'r-hr', code: 'hr' },
      ]);
      (prisma.userRole.deleteMany as unknown as Mock).mockResolvedValue({ count: 1 });
      (prisma.userRole.createMany as unknown as Mock).mockResolvedValue({ count: 1 });
      (prisma.auditLog.create as unknown as Mock).mockResolvedValue({ id: 'log-perm-assign' });

      const res = await PermissionService.assignUserRoles(
        { targetUserId: 'usr-target-02', roleCodes: ['hr'] },
        adminSession
      );

      expect(res.userId).toBe('usr-target-02');
      expect(res.roles).toEqual(['hr']);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ── 4. SECURE FILE UPLOAD VALIDATOR ─────────────────────────────────────────
  describe('4. Secure File Upload Validator & Path Traversal', () => {
    it('should sanitize directory traversal patterns and null bytes from filenames', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('..\\..\\windows\\system32\\calc.exe')).toBe('calc.exe');
      expect(sanitizeFilename('evil\0name.pdf')).toBe('evilname.pdf');
    });

    it('should accept valid PDF file within bounds', () => {
      const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
      const result = validateUploadedFile({
        name: 'contract_2026.pdf',
        size: 1024 * 100, // 100 KB
        type: 'application/pdf',
        buffer: validPdfBuffer,
      });

      expect(result.valid).toBe(true);
      expect(result.extension).toBe('pdf');
      expect(result.sanitizedFilename).toBe('contract_2026.pdf');
    });

    it('should reject dangerous file extension like .exe or .sh with 400 Bad Request', () => {
      expect(() =>
        validateUploadedFile({
          name: 'malware.exe',
          size: 1024,
          type: 'application/octet-stream',
        })
      ).toThrow(ApiError);
    });

    it('should reject double extension attack e.g. payload.php.jpg', () => {
      expect(() =>
        validateUploadedFile({
          name: 'payload.php.jpg',
          size: 1024,
          type: 'image/jpeg',
        })
      ).toThrow(ApiError);
    });

    it('should reject oversized file exceeding limit', () => {
      expect(() =>
        validateUploadedFile(
          {
            name: 'giant.pdf',
            size: 10 * 1024 * 1024, // 10 MB
            type: 'application/pdf',
          },
          { maxSizeBytes: 5 * 1024 * 1024 }
        )
      ).toThrow(ApiError);
    });

    it('should reject spoofed MIME type when magic bytes do not match', () => {
      const fakePdfBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]); // Not %PDF
      expect(() =>
        validateUploadedFile({
          name: 'fake.pdf',
          size: 1024,
          type: 'application/pdf',
          buffer: fakePdfBuffer,
        })
      ).toThrow(ApiError);
    });
  });

  // ── 5. SANITIZER & PII MASKING ──────────────────────────────────────────────
  describe('5. Sanitizer Utilities & PII Masking', () => {
    it('should escape HTML tags to prevent XSS attacks', () => {
      const malicious = '<script>alert("XSS")</script>';
      expect(escapeHtml(malicious)).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should strip script tags and javascript: pseudo-protocols', () => {
      const raw = 'Hello <script>fetch("evil.com")</script><a href="javascript:alert(1)">Click</a>';
      expect(stripDangerousTags(raw)).toBe('Hello <a href="alert(1)">Click</a>');
    });

    it('should mask Citizen Identity Card (CCCD) preserving only prefix & suffix', () => {
      expect(maskIdentityCard('001234567890')).toBe('001******890');
      expect(maskIdentityCard('123456')).toBe('******');
      expect(maskIdentityCard(null)).toBe('');
    });

    it('should mask Bank Account Number preserving only last 4 digits', () => {
      expect(maskBankAccount('19034567890123')).toBe('**********0123');
      expect(maskBankAccount('1234')).toBe('****');
      expect(maskBankAccount(null)).toBe('');
    });

    it('should mask Phone Number preserving prefix and suffix', () => {
      expect(maskPhoneNumber('0901234567')).toBe('090*****67');
      expect(maskPhoneNumber(null)).toBe('');
    });
  });

  // ── 6. RATE LIMITING ────────────────────────────────────────────────────────
  describe('6. Rate Limiting Protection', () => {
    it('should enforce maximum attempts and block subsequent requests', () => {
      const testKey = 'test-client-ip-42';
      resetRateLimit(testKey);

      // Consume 3 allowed tokens (limit: 3)
      expect(checkRateLimit(testKey, 3, 60).success).toBe(true);
      expect(checkRateLimit(testKey, 3, 60).success).toBe(true);
      expect(checkRateLimit(testKey, 3, 60).success).toBe(true);

      // 4th request must fail
      const blocked = checkRateLimit(testKey, 3, 60);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);

      // Reset works
      resetRateLimit(testKey);
      expect(checkRateLimit(testKey, 3, 60).success).toBe(true);
    });
  });
});
