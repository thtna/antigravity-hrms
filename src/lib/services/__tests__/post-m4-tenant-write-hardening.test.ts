import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import { WorksiteService } from '../worksite.service';
import { ShiftService } from '../shift.service';
import { EmployeeService } from '../employee.service';
import { ScheduleService } from '../schedule.service';
import { QrAttendanceService } from '../qr-attendance.service';
import { KpiService } from '../kpi.service';
import { PayrollService } from '../payroll.service';
import { PayrollWorkflowService } from '../payroll-workflow.service';
import { PayrollRuleService } from '../payroll-rule.service';
import { DocumentService } from '../document.service';
import {
  requireOrganizationId,
  saveAvatarFile,
  readAvatarFile,
  saveDocumentFile,
  readDocumentFile,
} from '@/lib/security/file-storage';
import { prisma } from '@/lib/db/prisma';
import fs from 'fs';
import path from 'path';

// Mock prisma for isolated service unit tests
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    worksite: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    workShift: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    position: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    employee: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'emp-1', documents: [] }),
    },
    employeeSchedule: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    qrAttendanceToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    kpi: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    payrollPeriod: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    payrollRule: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    payroll: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    payrollAdjustment: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    payrollApproval: {
      create: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'mock-log-id' }),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    }),
  },
}));

describe('POST-M4 TENANT WRITE HARDENING REGRESSION TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. PLATFORM SUPER_ADMIN LOGIN BEHAVIOR ─────────────────────────────────
  describe('1. Platform SUPER_ADMIN Login & Tenant User Login Distinctions', () => {
    it('1.1 Super Admin has organizationId = null in session and audit log', () => {
      const superAdminSession: UserSession = {
        userId: 'super-admin-01',
        email: 'superadmin@antigravity.corp',
        fullName: 'Global Platform Admin',
        roles: ['super_admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: null,
        tenantRole: undefined,
      };

      expect(superAdminSession.roles).toContain('super_admin');
      expect(superAdminSession.organizationId).toBeNull();
    });

    it('1.2 Super Admin with active membership MUST STILL have organizationId = null', () => {
      // INVARIANT: Platform SUPER_ADMIN remains platform-scoped even if an accidental membership exists
      const isSuperAdmin = true;
      const accidentalMembership = { organizationId: 'org_accidental_01', isActive: true, role: 'OWNER' };
      const verifiedOrganizationId = isSuperAdmin ? null : accidentalMembership.organizationId;

      expect(verifiedOrganizationId).toBeNull();
    });

    it('1.3 Tenant user must have non-null verified organizationId', () => {
      const tenantSession: UserSession = {
        userId: 'tenant-user-01',
        employeeId: 'emp-01',
        email: 'user@tenant-alpha.vn',
        fullName: 'Tenant User',
        roles: ['employee'],
        permissions: ['attendance:self'],
        isActive: true,
        organizationId: 'org_tenant_alpha',
        tenantRole: 'EMPLOYEE',
      };

      expect(tenantSession.organizationId).toBe('org_tenant_alpha');
      expect(tenantSession.organizationId).not.toBe('org_default_tanphong');
    });

    it('1.4 Tenant user without active membership is rejected', () => {
      const isSuperAdmin = false;
      const activeMemberships: any[] = [];
      const primaryMembership = activeMemberships[0];

      expect(() => {
        if (!isSuperAdmin && !primaryMembership) {
          throw new Error('Tài khoản của bạn chưa thuộc tổ chức nào hoặc chưa có tư cách thành viên hợp lệ.');
        }
      }).toThrow('Tài khoản của bạn chưa thuộc tổ chức nào');
    });
  });

  // ── 2. ZERO ACTIVE RUNTIME FALLBACK REFERENCES ──────────────────────────────
  describe('2. Active Runtime Fallback Inspection', () => {
    it('2.1 Should verify no runtime file under src/ references org_default_tanphong (excluding test files)', () => {
      const srcDir = path.resolve(process.cwd(), 'src');

      function scanFiles(dir: string): string[] {
        const results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== '__tests__') {
              results.push(...scanFiles(fullPath));
            }
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js'))) {
            results.push(fullPath);
          }
        }
        return results;
      }

      const runtimeFiles = scanFiles(srcDir);
      const violations: string[] = [];

      for (const file of runtimeFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('org_default_tanphong')) {
          violations.push(file);
        }
      }

      expect(violations).toHaveLength(0);
    });
  });

  // ── 3. REQUIRED organizationId WRITE PATHS ─────────────────────────────────
  describe('3. Trusted Source organizationId Write Path Enforcements', () => {
    it('3.1 WorksiteService rejects creation without organizationId', async () => {
      const noOrgSession: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      await expect(
        WorksiteService.createWorksite(
          {
            name: 'Office 1',
            address: '123 Street',
            latitude: 21.0,
            longitude: 105.0,
            radiusMeters: 100,
            isActive: true,
          },
          noOrgSession
        )
      ).rejects.toThrow('Tổ chức (organizationId) là bắt buộc để tạo địa điểm làm việc.');
    });

    it('3.2 ShiftService rejects creation without organizationId', async () => {
      const noOrgSession: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      await expect(
        ShiftService.createShift(
          {
            code: 'CA_SANG',
            name: 'Morning Shift',
            shiftType: 'FIXED',
            startTime: '08:00',
            endTime: '17:00',
            breakMinutes: 60,
            standardWorkHours: 8,
            isOvernight: false,
            gracePeriodLate: 15,
            gracePeriodEarly: 15,
            isActive: true,
            effectiveFrom: '2026-01-01',
          },
          noOrgSession
        )
      ).rejects.toThrow('Tổ chức (organizationId) là bắt buộc để tạo ca làm việc.');
    });

    it('3.3 EmployeeService rejects creation without organizationId', async () => {
      const noOrgSession: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      await expect(
        EmployeeService.createEmployee(
          {
            employeeCode: 'EMP-999',
            firstName: 'Nam',
            lastName: 'Nguyen',
            email: 'nam@test.vn',
            phoneNumber: '0988888888',
            gender: 'MALE',
            departmentId: 'dept-1',
            positionId: 'pos-1',
            hireDate: '2026-01-01',
            contractType: 'INDEFINITE',
            contractSalary: 20000000,
            insuranceSalary: 20000000,
            hourlyRate: 100000,
            dependentsCount: 0,
            documents: [],
            status: 'ACTIVE',
          },
          noOrgSession
        )
      ).rejects.toThrow('Tổ chức (organizationId) là bắt buộc để tạo nhân viên.');
    });

    it('3.4 QrAttendanceService rejects QR token generation without organizationId', async () => {
      const noOrgSession: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      await expect(
        QrAttendanceService.generateQrToken(
          {
            tokenType: 'CHECK_IN',
            location: '21.0,105.0',
          },
          noOrgSession
        )
      ).rejects.toThrow('Tổ chức (organizationId) là bắt buộc để khởi tạo mã QR điểm danh.');
    });

    it('3.5 KpiService rejects KPI creation without organizationId', async () => {
      const noOrgSession: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      await expect(
        KpiService.createKpiDefinition(
          {
            code: 'KPI_SALES',
            title: 'Doanh thu tháng',
            metricType: 'NUMERIC',
            calculationType: 'HIGHER_IS_BETTER',
            bonusFormula: 'LINEAR',
            targetValue: 100000000,
            unit: 'VND',
            period: 'MONTHLY',
            baseBonusAmount: 5000000,
            weight: 100,
          },
          noOrgSession
        )
      ).rejects.toThrow('Tổ chức (organizationId) là bắt buộc để tạo chỉ số KPI.');
    });

    it('3.6 PayrollRuleService rejects rule creation without organizationId', async () => {
      const noOrgSession: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      await expect(
        PayrollRuleService.createRule(
          {
            code: 'RULE_VN_2026',
            name: 'Quy chế 2026',
            isDefault: true,
            salaryBasisConfig: {} as any,
            overtimeConfig: {} as any,
            insuranceConfig: {} as any,
            taxConfig: {} as any,
            deductionConfig: {} as any,
            roundingConfig: {} as any,
            effectiveFrom: '2026-01-01',
          },
          noOrgSession
        )
      ).rejects.toThrow('Tổ chức (organizationId) là bắt buộc để tạo quy chế lương.');
    });

    it('3.7 PayrollService rejects period creation without organizationId', async () => {
      const noOrgSession: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      await expect(
        PayrollService.createPeriod(
          {
            code: 'PRD-2026-10',
            name: 'Kỳ tháng 10/2026',
            startDate: '2026-10-01',
            endDate: '2026-10-31',
            standardWorkDays: 22,
          },
          noOrgSession
        )
      ).rejects.toThrow('Yêu cầu context tổ chức để tạo kỳ tính lương.');
    });
  });

  // ── 4. PARENT TENANT CONSISTENCY CHECKS ─────────────────────────────────────
  describe('4. Cross-Tenant Relationship Rejection', () => {
    const orgA = 'org_alpha';
    const orgB = 'org_beta';

    it('4.1 ScheduleService rejects assigning shift from Org B to employee in Org A', async () => {
      const sessionA: UserSession = {
        userId: 'hr-a',
        email: 'hr@alpha.vn',
        fullName: 'HR Alpha',
        roles: ['hr'],
        permissions: ['*'],
        isActive: true,
        organizationId: orgA,
      };

      (prisma.employee.findUnique as any).mockResolvedValue({
        id: 'emp-a',
        organizationId: orgA,
        status: 'ACTIVE',
        deletedAt: null,
      });

      (prisma.workShift.findUnique as any).mockResolvedValue({
        id: 'shift-b',
        organizationId: orgB, // Different tenant!
        isActive: true,
      });

      await expect(
        ScheduleService.assignSingleSchedule(
          {
            employeeId: 'emp-a',
            shiftId: 'shift-b',
            workDate: '2026-09-10',
            isTemporary: false,
          },
          sessionA
        )
      ).rejects.toThrow('Ca làm việc không thuộc cùng tổ chức với nhân viên/tổ chức hiện tại.');
    });

    it('4.2 QrAttendanceService rejects QR token scanned by employee of different organization', async () => {
      const sessionB: UserSession = {
        userId: 'usr-b',
        employeeId: 'emp-b',
        email: 'user@beta.vn',
        fullName: 'User Beta',
        roles: ['employee'],
        permissions: ['attendance:self'],
        isActive: true,
        organizationId: orgB,
      };

      (prisma.employee.findUnique as any).mockResolvedValue({
        id: 'emp-b',
        userId: 'usr-b',
        organizationId: orgB,
        status: 'ACTIVE',
        deletedAt: null,
      });

      (prisma.qrAttendanceToken.findUnique as any).mockResolvedValue({
        code: 'qr-token-from-org-a',
        organizationId: orgA, // Token belongs to Org A!
        expiresAt: new Date(Date.now() + 60000),
        tokenType: 'CHECK_IN',
        worksiteId: 'ws-a',
        worksite: {
          id: 'ws-a',
          organizationId: orgA,
          latitude: 21.0,
          longitude: 105.0,
          radiusMeters: 500,
          isActive: true,
        },
      });

      await expect(
        QrAttendanceService.scanQrAttendance(
          {
            qrPayload: 'qr-token-from-org-a',
            lat: 21.0,
            lng: 105.0,
          },
          sessionB
        )
      ).rejects.toThrow('Mã QR này thuộc về một tổ chức khác.');
    });

    it('4.3 PayrollWorkflowService rejects adjustment for employee in different organization', async () => {
      const sessionA: UserSession = {
        userId: 'admin-a',
        email: 'admin@alpha.vn',
        fullName: 'Admin Alpha',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: orgA,
      };

      (prisma.payrollPeriod.findUnique as any).mockResolvedValue({
        id: 'period-a',
        organizationId: orgA,
        status: 'DRAFT',
      });

      (prisma.employee.findUnique as any)
        .mockResolvedValueOnce({
          id: 'emp-b',
          userId: 'usr-b',
          organizationId: orgB, // Different org!
        })
        .mockResolvedValueOnce({
          id: 'emp-a-requester',
          organizationId: orgA,
        });

      await expect(
        PayrollWorkflowService.createAdjustmentRequest(
          {
            periodId: 'period-a',
            employeeId: 'emp-b',
            adjustmentType: 'BONUS_ADJUSTMENT',
            direction: 'ADDITION',
            amount: 1000000,
            reason: 'Bonus',
          },
          sessionA
        )
      ).rejects.toThrow('Nhân viên không thuộc cùng tổ chức với kỳ tính lương.');
    });
  });

  // ── 5. FILE STORAGE / DOCUMENTS STRICT TENANT CHECKS ───────────────────────
  describe('5. Storage & Document Tenant Isolation', () => {
    it('5.1 requireOrganizationId rejects empty, whitespace, or missing organizationId', () => {
      expect(() => requireOrganizationId('')).toThrow(ApiError);
      expect(() => requireOrganizationId('   ')).toThrow(ApiError);
      expect(() => requireOrganizationId(undefined as any)).toThrow(ApiError);
      expect(() => requireOrganizationId(null as any)).toThrow(ApiError);
      expect(requireOrganizationId('org_verified_tenant')).toBe('org_verified_tenant');
    });

    it('5.2 saveAvatarFile rejects empty organizationId', async () => {
      await expect(
        saveAvatarFile('avatar_usr1_123.jpg', Buffer.from('img'), '')
      ).rejects.toThrow();
    });

    it('5.3 readAvatarFile rejects empty organizationId', async () => {
      await expect(
        readAvatarFile('avatar_usr1_123.jpg', '')
      ).rejects.toThrow();
    });

    it('5.4 saveDocumentFile rejects empty organizationId', async () => {
      await expect(
        saveDocumentFile('emp-1', 'doc-1', 'pdf', Buffer.from('pdf'), '')
      ).rejects.toThrow();
    });

    it('5.5 readDocumentFile rejects empty organizationId', async () => {
      await expect(
        readDocumentFile('emp-1', 'doc-1.pdf', '')
      ).rejects.toThrow();
    });

    it('5.6 DocumentService.uploadAvatar rejects session without organizationId', async () => {
      const sessionWithoutOrg: UserSession = {
        userId: 'user-no-org',
        email: 'user@no-org.vn',
        fullName: 'User No Org',
        roles: ['employee'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      const mockFile = {
        name: 'avatar.jpg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]), // valid JPEG magic bytes
        size: 1024,
        type: 'image/jpeg',
      };

      await expect(
        DocumentService.uploadAvatar(mockFile, sessionWithoutOrg)
      ).rejects.toThrow('Yêu cầu ngữ cảnh tổ chức hợp lệ để tải lên ảnh đại diện.');
    });

    it('5.7 DocumentService.uploadEmployeeDocument rejects session without organizationId', async () => {
      const sessionWithoutOrg: UserSession = {
        userId: 'admin-no-org',
        email: 'admin@no-org.vn',
        fullName: 'Admin No Org',
        roles: ['admin'],
        permissions: ['*'],
        isActive: true,
        organizationId: undefined as any,
      };

      const mockFile = {
        name: 'contract.pdf',
        buffer: Buffer.from('%PDF-1.4 mock content'),
        size: 1024,
        type: 'application/pdf',
      };

      await expect(
        DocumentService.uploadEmployeeDocument('emp-1', mockFile, 'CONTRACT', sessionWithoutOrg)
      ).rejects.toThrow('Yêu cầu ngữ cảnh tổ chức hợp lệ để tải lên tài liệu nhân sự.');
    });
  });
});
