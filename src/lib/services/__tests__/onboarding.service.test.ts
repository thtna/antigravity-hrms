import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingService } from '../onboarding.service';
import { UserSession } from '@/types';
import { ApiError } from '@/lib/errors';

const mockPrisma = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  branch: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  department: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  position: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  workShift: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  worksite: {
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  attendance: {
    count: vi.fn(),
  },
  leaveRequest: {
    count: vi.fn(),
  },
  payroll: {
    count: vi.fn(),
  },
  kpi: {
    count: vi.fn(),
  },
  payrollRule: {
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn().mockResolvedValue({}),
  },
  $transaction: vi.fn(async (cb) => cb(mockPrisma)),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock sub-services used in steps
vi.mock('../department.service', () => ({
  DepartmentService: {
    createDepartment: vi.fn().mockResolvedValue({
      id: 'dept-01',
      code: 'TECH',
      name: 'Phòng Kỹ Thuật',
    }),
  },
}));

vi.mock('../position.service', () => ({
  PositionService: {
    createPosition: vi.fn().mockResolvedValue({
      id: 'pos-01',
      code: 'SWE',
      title: 'Kỹ Sư Phần Mềm',
    }),
  },
}));

vi.mock('../shift.service', () => ({
  ShiftService: {
    createShift: vi.fn().mockResolvedValue({
      id: 'shift-01',
      code: 'HC-01',
      name: 'Ca Hành Chính',
    }),
  },
}));

vi.mock('../employee.service', () => ({
  EmployeeService: {
    createEmployee: vi.fn().mockResolvedValue({
      id: 'emp-01',
      employeeCode: 'EMP-001',
      firstName: 'Văn A',
      lastName: 'Nguyễn',
    }),
  },
}));

vi.mock('../worksite.service', () => ({
  WorksiteService: {
    createWorksite: vi.fn().mockResolvedValue({
      id: 'ws-01',
      name: 'Văn Phòng Trụ Sở Chính',
    }),
  },
}));

vi.mock('../payroll-rule.service', () => ({
  PayrollRuleService: {
    createRule: vi.fn().mockResolvedValue({
      id: 'rule-01',
      code: 'VN_STATUTORY_2026',
      name: 'Quy chế tiền lương Việt Nam 2026',
    }),
  },
}));

describe('PHASE 7 — EMPTY TENANT & ONBOARDING SERVICE TEST SUITE', () => {
  const ownerSession: UserSession = {
    userId: 'usr-owner-01',
    email: 'owner@vietcorp.vn',
    fullName: 'Chủ Doanh Nghiệp',
    roles: ['admin'],
    tenantRole: 'OWNER',
    organizationId: 'org-fresh-01',
    organizationName: 'VietCorp',
    isActive: true,
    permissions: ['*'],
  };

  const adminSession: UserSession = {
    userId: 'usr-admin-01',
    email: 'admin@vietcorp.vn',
    fullName: 'Quản Trị Viên',
    roles: ['admin'],
    tenantRole: 'ADMIN',
    organizationId: 'org-fresh-01',
    organizationName: 'VietCorp',
    isActive: true,
    permissions: ['*'],
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp-01',
    email: 'emp@vietcorp.vn',
    fullName: 'Nhân Viên',
    roles: ['employee'],
    tenantRole: 'EMPLOYEE',
    organizationId: 'org-fresh-01',
    organizationName: 'VietCorp',
    isActive: true,
    permissions: [],
  };

  const mockFreshOrg = {
    id: 'org-fresh-01',
    name: 'VietCorp JSC',
    slug: 'vietcorp-jsc',
    status: 'ACTIVE',
    taxCode: '0109999999',
    email: 'owner@vietcorp.vn',
    phone: '0901234567',
    address: '123 Đường Láng, Hà Nội',
    onboardingStep: 0,
    onboardingSkipped: false,
    onboardingCompletedAt: null,
    deletedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.organization.findUnique.mockResolvedValue(mockFreshOrg);
    mockPrisma.organization.update.mockImplementation(async ({ data }) => ({
      ...mockFreshOrg,
      ...data,
    }));

    // Zero data mocks
    mockPrisma.employee.count.mockResolvedValue(0);
    mockPrisma.department.count.mockResolvedValue(0);
    mockPrisma.position.count.mockResolvedValue(0);
    mockPrisma.branch.count.mockResolvedValue(0);
    mockPrisma.workShift.count.mockResolvedValue(0);
    mockPrisma.worksite.count.mockResolvedValue(0);
    mockPrisma.attendance.count.mockResolvedValue(0);
    mockPrisma.leaveRequest.count.mockResolvedValue(0);
    mockPrisma.payroll.count.mockResolvedValue(0);
    mockPrisma.kpi.count.mockResolvedValue(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. EMPTY TENANT CONTRACT
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Zero Fake Data Contract [EMPTY-01]', () => {
    it('should confirm that a freshly approved tenant has 0 business data across all entities', async () => {
      const status = await OnboardingService.getOnboardingStatus(ownerSession);

      expect(status.counts.employees).toBe(0);
      expect(status.counts.departments).toBe(0);
      expect(status.counts.positions).toBe(0);
      expect(status.counts.branches).toBe(0);
      expect(status.counts.shifts).toBe(0);
      expect(status.counts.worksites).toBe(0);
      expect(status.counts.attendances).toBe(0);
      expect(status.counts.leaves).toBe(0);
      expect(status.counts.payrolls).toBe(0);
      expect(status.counts.kpis).toBe(0);

      expect(status.onboardingStep).toBe(0);
      expect(status.onboardingSkipped).toBe(false);
      expect(status.isCompleted).toBe(false);
      expect(status.steps).toHaveLength(8);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. ONBOARDING STEP-BY-STEP FLOW
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Onboarding 8-Step Execution Flow', () => {
    it('Step 1 (Business): should update organization details and advance to step 2', async () => {
      const result = await OnboardingService.saveStep(ownerSession, 1, {
        name: 'VietCorp Technology Group',
        taxCode: '0108888888',
        email: 'contact@vietcorp.vn',
        phone: '024 3999 8888',
        address: 'Tầng 12, Tòa nhà Keangnam, Hà Nội',
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(1);
      expect(result.nextStep).toBe(2);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({
            name: 'VietCorp Technology Group',
            taxCode: '0108888888',
            onboardingStep: 2,
          }),
        })
      );
    });

    it('Step 2 (Branch): should create first branch and advance to step 3', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue(null);
      mockPrisma.branch.create.mockResolvedValue({
        id: 'branch-hq',
        name: 'Trụ sở chính',
        code: 'HQ',
      });

      const result = await OnboardingService.saveStep(ownerSession, 2, {
        name: 'Trụ sở chính',
        code: 'HQ',
        address: 'Hà Nội',
        phone: '0901234567',
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(2);
      expect(result.nextStep).toBe(3);
      expect(mockPrisma.branch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-fresh-01',
            name: 'Trụ sở chính',
            code: 'HQ',
          }),
        })
      );
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({ onboardingStep: 3 }),
        })
      );
    });

    it('Step 2 (Branch): should reject duplicate branch code within the tenant', async () => {
      mockPrisma.branch.findFirst.mockResolvedValue({ id: 'branch-old', code: 'HQ' });

      await expect(
        OnboardingService.saveStep(ownerSession, 2, {
          name: 'Trụ sở chính mới',
          code: 'HQ',
        })
      ).rejects.toThrow(ApiError);
    });

    it('Step 3 (Department): should create department and advance to step 4', async () => {
      const result = await OnboardingService.saveStep(ownerSession, 3, {
        name: 'Phòng Kỹ Thuật',
        code: 'TECH',
        description: 'Bộ phận phát triển sản phẩm',
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(3);
      expect(result.nextStep).toBe(4);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({ onboardingStep: 4 }),
        })
      );
    });

    it('Step 4 (Position): should create position and advance to step 5', async () => {
      const result = await OnboardingService.saveStep(ownerSession, 4, {
        title: 'Kỹ Sư Phần Mềm',
        code: 'SWE',
        baseSalaryGrade: 20000000,
        minSalary: 15000000,
        maxSalary: 35000000,
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(4);
      expect(result.nextStep).toBe(5);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({ onboardingStep: 5 }),
        })
      );
    });

    it('Step 5 (Shift): should create shift and advance to step 6', async () => {
      const result = await OnboardingService.saveStep(ownerSession, 5, {
        name: 'Ca Hành Chính',
        code: 'HC-01',
        shiftType: 'FIXED',
        startTime: '08:00',
        endTime: '17:00',
        breakMinutes: 60,
        standardWorkHours: 8,
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(5);
      expect(result.nextStep).toBe(6);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({ onboardingStep: 6 }),
        })
      );
    });

    it('Step 6 (Employee): should create first employee and advance to step 7', async () => {
      mockPrisma.department.findFirst.mockResolvedValue({ id: 'dept-01' });
      mockPrisma.position.findFirst.mockResolvedValue({ id: 'pos-01' });

      const result = await OnboardingService.saveStep(ownerSession, 6, {
        firstName: 'Văn A',
        lastName: 'Nguyễn',
        employeeCode: 'EMP-001',
        email: 'staff01@vietcorp.vn',
        phoneNumber: '0912345678',
        contractSalary: 20000000,
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(6);
      expect(result.nextStep).toBe(7);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({ onboardingStep: 7 }),
        })
      );
    });

    it('Step 7 (Attendance Settings): should create worksite and advance to step 8', async () => {
      const result = await OnboardingService.saveStep(ownerSession, 7, {
        name: 'Văn Phòng Trụ Sở Chính',
        address: 'Hà Nội',
        latitude: 21.028511,
        longitude: 105.854444,
        radiusMeters: 150,
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(7);
      expect(result.nextStep).toBe(8);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({ onboardingStep: 8 }),
        })
      );
    });

    it('Step 8 (Payroll Settings): should create statutory rule and complete onboarding (step 9)', async () => {
      const result = await OnboardingService.saveStep(ownerSession, 8, {
        ruleCode: 'VN_STATUTORY_2026',
        ruleName: 'Quy chế tiền lương Việt Nam 2026',
        standardWorkDays: 22,
        useStatutoryVietnam: true,
      });

      expect(result.success).toBe(true);
      expect(result.completedStep).toBe(8);
      expect(result.nextStep).toBe(9);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({
            onboardingStep: 9,
            onboardingCompletedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. SKIP STEP & SKIP ALL GUARANTEE
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Skip Functionality (Zero Dummy Data on Skip)', () => {
    it('should skip a single step without creating any entity and advance step counter', async () => {
      const result = await OnboardingService.skipStep(ownerSession, 3);

      expect(result.success).toBe(true);
      expect(result.skippedStep).toBe(3);
      expect(result.nextStep).toBe(4);
      expect(mockPrisma.department.create).not.toHaveBeenCalled();
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({ onboardingStep: 4 }),
        })
      );
    });

    it('should mark onboarding complete when skipping step 8', async () => {
      const result = await OnboardingService.skipStep(ownerSession, 8);

      expect(result.success).toBe(true);
      expect(result.skippedStep).toBe(8);
      expect(result.nextStep).toBe(9);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({
            onboardingStep: 9,
            onboardingCompletedAt: expect.any(Date),
          }),
        })
      );
    });

    it('should skip all steps immediately and set onboardingSkipped=true', async () => {
      const result = await OnboardingService.skipAll(ownerSession);

      expect(result.success).toBe(true);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'org-fresh-01' },
          data: expect.objectContaining({
            onboardingStep: 9,
            onboardingSkipped: true,
            onboardingCompletedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. SECURITY & TENANT ISOLATION
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Security & Role Permissions', () => {
    it('should reject non-owner and non-admin employee from accessing onboarding (HTTP 403)', async () => {
      await expect(OnboardingService.getOnboardingStatus(employeeSession)).rejects.toThrow(ApiError);
      await expect(OnboardingService.saveStep(employeeSession, 1, {})).rejects.toThrow(ApiError);
      await expect(OnboardingService.skipStep(employeeSession, 1)).rejects.toThrow(ApiError);
    });

    it('should reject unauthenticated request without session (HTTP 401)', async () => {
      await expect(OnboardingService.getOnboardingStatus({} as any)).rejects.toThrow(ApiError);
    });

    it('should allow ADMIN role of the tenant to perform onboarding actions', async () => {
      const status = await OnboardingService.getOnboardingStatus(adminSession);
      expect(status.organization.id).toBe('org-fresh-01');
    });

    it('should throw 404 if organization does not exist or is soft-deleted', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);
      await expect(OnboardingService.getOnboardingStatus(ownerSession)).rejects.toThrow(ApiError);
    });
  });
});
