import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { DepartmentService } from './department.service';
import { PositionService } from './position.service';
import { ShiftService } from './shift.service';
import { EmployeeService } from './employee.service';
import { WorksiteService } from './worksite.service';
import { PayrollRuleService } from './payroll-rule.service';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import {
  Step1BusinessSchema,
  Step2BranchSchema,
  Step3DepartmentSchema,
  Step4PositionSchema,
  Step5ShiftSchema,
  Step6EmployeeSchema,
  Step7AttendanceSchema,
  Step8PayrollSchema,
} from '@/lib/validations/onboarding';
import { CreateEmployeeSchema } from '@/lib/validations/employee';

export interface OnboardingStatusResult {
  organization: {
    id: string;
    name: string;
    taxCode: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    status: string;
  };
  onboardingStep: number;
  onboardingSkipped: boolean;
  isCompleted: boolean;
  counts: {
    employees: number;
    departments: number;
    positions: number;
    branches: number;
    shifts: number;
    worksites: number;
    attendances: number;
    leaves: number;
    payrolls: number;
    kpis: number;
  };
  steps: Array<{
    step: number;
    key: string;
    name: string;
    completed: boolean;
  }>;
}

export class OnboardingService {
  /**
   * Helper to verify caller is OWNER or ADMIN of the current tenant
   */
  private static async ensureOwnerOrAdmin(session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để thực hiện thiết lập.');
    }

    const orgId = session.organizationId;
    if (!orgId || orgId === '__no_org__') {
      throw ApiError.forbidden('Không tìm thấy thông tin tổ chức của người dùng.');
    }

    const isOwner = session.tenantRole === 'OWNER';
    const isAdmin = session.roles.includes('admin');

    if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('Chỉ Chủ sở hữu (OWNER) hoặc Quản trị viên (ADMIN) mới có quyền thực hiện thiết lập ban đầu.');
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org || org.deletedAt) {
      throw ApiError.notFound('Tổ chức không tồn tại hoặc đã bị xóa.');
    }

    return org;
  }

  /**
   * Get current onboarding status, step index, and real entity counts
   */
  static async getOnboardingStatus(session: UserSession): Promise<OnboardingStatusResult> {
    const org = await this.ensureOwnerOrAdmin(session);
    const orgId = org.id;

    const [
      employees,
      departments,
      positions,
      branches,
      shifts,
      worksites,
      attendances,
      leaves,
      payrolls,
      kpis,
    ] = await Promise.all([
      prisma.employee.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.department.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.position.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.branch.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.workShift.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.worksite.count({ where: { organizationId: orgId } }),
      prisma.attendance.count({ where: { organizationId: orgId } }),
      prisma.leaveRequest.count({ where: { employee: { organizationId: orgId } } }),
      prisma.payroll.count({ where: { organizationId: orgId } }),
      prisma.kpi.count({ where: { organizationId: orgId } }),
    ]);

    const currentStep = org.onboardingStep;
    const isCompleted = currentStep >= 9 || org.onboardingSkipped;

    return {
      organization: {
        id: org.id,
        name: org.name,
        taxCode: org.taxCode,
        email: org.email,
        phone: org.phone,
        address: org.address,
        status: org.status,
      },
      onboardingStep: currentStep,
      onboardingSkipped: org.onboardingSkipped,
      isCompleted,
      counts: {
        employees,
        departments,
        positions,
        branches,
        shifts,
        worksites,
        attendances,
        leaves,
        payrolls,
        kpis,
      },
      steps: [
        { step: 1, key: 'business', name: 'Thông tin doanh nghiệp', completed: currentStep > 1 },
        { step: 2, key: 'branch', name: 'Chi nhánh làm việc', completed: currentStep > 2 || branches > 0 },
        { step: 3, key: 'department', name: 'Phòng ban ban đầu', completed: currentStep > 3 || departments > 0 },
        { step: 4, key: 'position', name: 'Chức danh công việc', completed: currentStep > 4 || positions > 0 },
        { step: 5, key: 'shift', name: 'Ca làm việc chuẩn', completed: currentStep > 5 || shifts > 0 },
        { step: 6, key: 'employee', name: 'Hồ sơ nhân sự đầu tiên', completed: currentStep > 6 || employees > 0 },
        { step: 7, key: 'attendance', name: 'Cấu hình chấm công GPS/QR', completed: currentStep > 7 || worksites > 0 },
        { step: 8, key: 'payroll', name: 'Quy chế tính lương', completed: isCompleted },
      ],
    };
  }

  /**
   * Save and advance an individual onboarding step (1 to 8)
   */
  static async saveStep(session: UserSession, step: number, data: any) {
    const org = await this.ensureOwnerOrAdmin(session);
    const orgId = org.id;

    let result: any = null;
    let nextStep = step + 1;

    switch (step) {
      case 1: {
        // Business
        const validated = Step1BusinessSchema.parse(data);
        result = await prisma.organization.update({
          where: { id: orgId },
          data: {
            name: validated.name.trim(),
            taxCode: validated.taxCode?.trim() || null,
            email: validated.email?.trim() || null,
            phone: validated.phone?.trim() || null,
            address: validated.address?.trim() || null,
            onboardingStep: Math.max(org.onboardingStep, 2),
          },
        });
        break;
      }

      case 2: {
        // Branch
        const validated = Step2BranchSchema.parse(data);
        const upperCode = validated.code.toUpperCase().trim();

        const existing = await prisma.branch.findFirst({
          where: { organizationId: orgId, code: upperCode },
        });
        if (existing) {
          throw ApiError.conflict(`Mã chi nhánh [${upperCode}] đã tồn tại trong tổ chức.`);
        }

        result = await prisma.branch.create({
          data: {
            organizationId: orgId,
            name: validated.name.trim(),
            code: upperCode,
            address: validated.address?.trim() || null,
            phone: validated.phone?.trim() || null,
            isActive: true,
          },
        });

        await prisma.organization.update({
          where: { id: orgId },
          data: { onboardingStep: Math.max(org.onboardingStep, 3) },
        });
        break;
      }

      case 3: {
        // Department
        const validated = Step3DepartmentSchema.parse(data);
        result = await DepartmentService.createDepartment(
          {
            name: validated.name.trim(),
            code: validated.code.toUpperCase().trim(),
            description: validated.description?.trim(),
            isActive: true,
          },
          session
        );

        await prisma.organization.update({
          where: { id: orgId },
          data: { onboardingStep: Math.max(org.onboardingStep, 4) },
        });
        break;
      }

      case 4: {
        // Position
        const validated = Step4PositionSchema.parse(data);
        result = await PositionService.createPosition(
          {
            title: validated.title.trim(),
            code: validated.code.toUpperCase().trim(),
            description: validated.description?.trim(),
            baseSalaryGrade: validated.baseSalaryGrade,
            minSalary: validated.minSalary,
            maxSalary: validated.maxSalary,
            isActive: true,
          },
          session
        );

        await prisma.organization.update({
          where: { id: orgId },
          data: { onboardingStep: Math.max(org.onboardingStep, 5) },
        });
        break;
      }

      case 5: {
        // Shift
        const validated = Step5ShiftSchema.parse(data);
        result = await ShiftService.createShift(
          {
            name: validated.name.trim(),
            code: validated.code.toUpperCase().trim(),
            description: validated.description?.trim(),
            shiftType: validated.shiftType,
            startTime: validated.startTime,
            endTime: validated.endTime,
            breakMinutes: validated.breakMinutes,
            isOvernight: false,
            gracePeriodLate: validated.gracePeriodLate,
            gracePeriodEarly: validated.gracePeriodEarly,
            standardWorkHours: validated.standardWorkHours,
            effectiveFrom: validated.effectiveFrom || new Date().toISOString().slice(0, 10),
            isActive: true,
          },
          session
        );

        await prisma.organization.update({
          where: { id: orgId },
          data: { onboardingStep: Math.max(org.onboardingStep, 6) },
        });
        break;
      }

      case 6: {
        // Employee
        const validated = Step6EmployeeSchema.parse(data);

        // Auto-resolve departmentId and positionId if not provided
        let targetDeptId = validated.departmentId;
        if (!targetDeptId) {
          const firstDept = await prisma.department.findFirst({
            where: { organizationId: orgId, deletedAt: null },
          });
          if (!firstDept) {
            const fallbackDept = await prisma.department.create({
              data: {
                organizationId: orgId,
                name: 'Ban Giám Đốc',
                code: 'BGD',
              },
            });
            targetDeptId = fallbackDept.id;
          } else {
            targetDeptId = firstDept.id;
          }
        }

        let targetPosId = validated.positionId;
        if (!targetPosId) {
          const firstPos = await prisma.position.findFirst({
            where: { organizationId: orgId, deletedAt: null },
          });
          if (!firstPos) {
            const fallbackPos = await prisma.position.create({
              data: {
                organizationId: orgId,
                title: 'Giám Đốc Điều Hành',
                code: 'CEO',
                baseSalaryGrade: 15000000,
                minSalary: 15000000,
                maxSalary: 50000000,
              },
            });
            targetPosId = fallbackPos.id;
          } else {
            targetPosId = firstPos.id;
          }
        }

        const employeePayload = CreateEmployeeSchema.parse({
          firstName: validated.firstName.trim(),
          lastName: validated.lastName.trim(),
          employeeCode: validated.employeeCode.toUpperCase().trim(),
          email: validated.email.toLowerCase().trim(),
          phoneNumber: validated.phoneNumber.trim(),
          departmentId: targetDeptId,
          positionId: targetPosId,
          gender: 'OTHER',
          contractSalary: validated.contractSalary,
          hireDate: validated.hireDate || new Date().toISOString().slice(0, 10),
        });

        result = await EmployeeService.createEmployee(employeePayload, session);

        await prisma.organization.update({
          where: { id: orgId },
          data: { onboardingStep: Math.max(org.onboardingStep, 7) },
        });
        break;
      }

      case 7: {
        // Attendance Settings (Worksite)
        const validated = Step7AttendanceSchema.parse(data);
        result = await WorksiteService.createWorksite(
          {
            name: validated.name.trim(),
            address: validated.address.trim(),
            latitude: validated.latitude,
            longitude: validated.longitude,
            radiusMeters: validated.radiusMeters,
            isActive: true,
          },
          session
        );

        await prisma.organization.update({
          where: { id: orgId },
          data: { onboardingStep: Math.max(org.onboardingStep, 8) },
        });
        break;
      }

      case 8: {
        // Payroll Settings
        const validated = Step8PayrollSchema.parse(data);

        result = await PayrollRuleService.createRule(
          {
            code: validated.ruleCode.toUpperCase().trim(),
            name: validated.ruleName.trim(),
            description: 'Quy chế lương thiết lập trong quá trình khởi tạo tổ chức.',
            isDefault: true,
            salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis as any,
            overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
            insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
            taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
            deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
            roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
            effectiveFrom: '2026-01-01',
          },
          session
        );

        // Mark onboarding complete (step 9)
        nextStep = 9;
        await prisma.organization.update({
          where: { id: orgId },
          data: {
            onboardingStep: 9,
            onboardingCompletedAt: new Date(),
          },
        });
        break;
      }

      default:
        throw ApiError.badRequest(`Bước onboarding không hợp lệ: ${step}. Hỗ trợ từ bước 1 đến 8.`);
    }

    logger.info(`[OnboardingService] Step ${step} completed for tenant ${org.name} (${org.id})`);

    const status = await this.getOnboardingStatus(session);

    return {
      success: true,
      completedStep: step,
      nextStep,
      createdData: result,
      status,
    };
  }

  /**
   * Skip a single onboarding step without creating dummy data
   */
  static async skipStep(session: UserSession, step: number) {
    const org = await this.ensureOwnerOrAdmin(session);
    const orgId = org.id;

    if (step < 1 || step > 8) {
      throw ApiError.badRequest(`Bước bỏ qua không hợp lệ: ${step}.`);
    }

    const nextStep = step >= 8 ? 9 : step + 1;
    const isCompleted = nextStep >= 9;

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        onboardingStep: Math.max(org.onboardingStep, nextStep),
        ...(isCompleted ? { onboardingCompletedAt: new Date() } : {}),
      },
    });

    logger.info(`[OnboardingService] Step ${step} skipped by owner for tenant ${org.name} (${orgId})`);

    const status = await this.getOnboardingStatus(session);

    return {
      success: true,
      skippedStep: step,
      nextStep,
      status,
    };
  }

  /**
   * Skip the entire onboarding process and jump directly to dashboard
   */
  static async skipAll(session: UserSession) {
    const org = await this.ensureOwnerOrAdmin(session);
    const orgId = org.id;

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        onboardingStep: 9,
        onboardingSkipped: true,
        onboardingCompletedAt: new Date(),
      },
    });

    logger.info(`[OnboardingService] Entire onboarding skipped for tenant ${org.name} (${orgId})`);

    const status = await this.getOnboardingStatus(session);

    return {
      success: true,
      message: 'Đã bỏ qua toàn bộ thiết lập. Bạn có thể tự cấu hình bất kỳ lúc nào từ cài đặt.',
      status,
    };
  }
}
