import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { hashPassword } from '@/lib/auth/password';
import crypto from 'crypto';
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

/**
 * Deterministic canonical comparison for Step 8 Payroll Rule idempotency.
 * Verifies exact match on normalized code, normalized name, standardWorkDays,
 * and material generated configuration fields. Zero fuzzy matching.
 */
function isPayrollRuleMatching(
  existingRule: {
    code: string;
    name: string;
    salaryBasisConfig?: any;
    overtimeConfig?: any;
    insuranceConfig?: any;
    taxConfig?: any;
    deductionConfig?: any;
    roundingConfig?: any;
    [key: string]: any;
  },
  validated: {
    ruleCode: string;
    ruleName: string;
    standardWorkDays: number;
    useStatutoryVietnam: boolean;
  }
): boolean {
  // 1. Normalized Code Match
  if (existingRule.code.toUpperCase().trim() !== validated.ruleCode.toUpperCase().trim()) {
    return false;
  }

  // 2. Normalized Name Match
  if (existingRule.name.trim() !== validated.ruleName.trim()) {
    return false;
  }

  // 3. Material Submitted Configuration: standardWorkDays
  const existingWorkDays = (existingRule.salaryBasisConfig as any)?.standardWorkDays;
  if (existingWorkDays !== undefined && Number(existingWorkDays) !== Number(validated.standardWorkDays)) {
    return false;
  }

  // 4. Material Generated Configuration: Statutory Vietnam Labor Code Config
  if (validated.useStatutoryVietnam) {
    const sb = existingRule.salaryBasisConfig as any;
    if (sb && sb.method !== VIETNAM_STATUTORY_RULE_2026.salaryBasis.method) return false;
    if (
      sb &&
      sb.standardHoursPerDay !== undefined &&
      Number(sb.standardHoursPerDay) !== Number(VIETNAM_STATUTORY_RULE_2026.salaryBasis.standardHoursPerDay)
    ) {
      return false;
    }

    const ot = existingRule.overtimeConfig as any;
    if (ot && Number(ot.weekdayMultiplier) !== Number(VIETNAM_STATUTORY_RULE_2026.overtime.weekdayMultiplier)) return false;
    if (ot && Number(ot.weekendMultiplier) !== Number(VIETNAM_STATUTORY_RULE_2026.overtime.weekendMultiplier)) return false;
    if (ot && Number(ot.holidayMultiplier) !== Number(VIETNAM_STATUTORY_RULE_2026.overtime.holidayMultiplier)) return false;

    const ins = existingRule.insuranceConfig as any;
    if (ins && ins.method !== VIETNAM_STATUTORY_RULE_2026.insurance.method) return false;
    if (ins && Number(ins.employeeSocialRate) !== Number(VIETNAM_STATUTORY_RULE_2026.insurance.employeeSocialRate)) return false;
    if (ins && Number(ins.employeeHealthRate) !== Number(VIETNAM_STATUTORY_RULE_2026.insurance.employeeHealthRate)) return false;
    if (ins && Number(ins.employeeUnemploymentRate) !== Number(VIETNAM_STATUTORY_RULE_2026.insurance.employeeUnemploymentRate)) return false;

    const tax = existingRule.taxConfig as any;
    if (tax && tax.model !== VIETNAM_STATUTORY_RULE_2026.tax.model) return false;
    if (tax && Number(tax.personalRelief) !== Number(VIETNAM_STATUTORY_RULE_2026.tax.personalRelief)) return false;
    if (tax && Number(tax.dependentRelief) !== Number(VIETNAM_STATUTORY_RULE_2026.tax.dependentRelief)) return false;
  }

  return true;
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
        const normalizedCode = validated.employeeCode.toUpperCase().trim();
        const normalizedEmail = validated.email.toLowerCase().trim();

        // 1. Precise Idempotent Retry Inspection (Requirement 6):
        // Only treat as retry if existing employee belongs to this organization AND identity fully matches
        const existingByCode = await prisma.employee.findFirst({
          where: {
            organizationId: orgId,
            employeeCode: normalizedCode,
            deletedAt: null,
          },
          include: {
            department: true,
            position: true,
            worksite: true,
            user: { select: { id: true, email: true, isActive: true } },
          },
        });

        const existingByUser = prisma.user?.findUnique
          ? await prisma.user.findUnique({
              where: { email: normalizedEmail },
              include: {
                employee: {
                  include: {
                    department: true,
                    position: true,
                    worksite: true,
                    user: { select: { id: true, email: true, isActive: true } },
                  },
                },
              },
            })
          : null;

        const isExactMatch =
          existingByCode &&
          existingByUser &&
          existingByUser.employee &&
          existingByCode.id === existingByUser.employee.id &&
          existingByCode.organizationId === orgId &&
          existingByUser.employee.organizationId === orgId &&
          existingByCode.firstName.trim().toLowerCase() === validated.firstName.trim().toLowerCase() &&
          existingByCode.lastName.trim().toLowerCase() === validated.lastName.trim().toLowerCase();

        if (isExactMatch) {
          // Verified idempotent retry — advance step to 7 without duplicating employee (only if current step < 7)
          const freshOrg = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { onboardingStep: true },
          });

          if (freshOrg && freshOrg.onboardingStep < 7) {
            await prisma.organization.update({
              where: { id: orgId },
              data: { onboardingStep: 7 },
            });
          }

          result = {
            ...existingByCode,
            fullName: `${existingByCode.lastName} ${existingByCode.firstName}`.trim(),
            contractSalary: Number(existingByCode.contractSalary),
            hourlyRate: Number(existingByCode.hourlyRate),
            insuranceSalary: Number(existingByCode.insuranceSalary),
            documents: (existingByCode.documents as any) || [],
          };
          break;
        }

        // If employeeCode or email collides with a DIFFERENT record/identity:
        // Do NOT advance step. Throw conflict (409) with explicit message.
        if (existingByCode) {
          throw ApiError.conflict(`Mã nhân viên [${normalizedCode}] đã tồn tại trong tổ chức.`);
        }
        if (existingByUser) {
          throw ApiError.conflict(`Email [${normalizedEmail}] đã được đăng ký cho một tài khoản khác.`);
        }

        if (!validated.departmentId || !validated.positionId) {
          throw ApiError.badRequest(
            'Vui lòng chọn phòng ban và chức vụ đã được cấu hình trong tổ chức trước khi tạo nhân sự đầu tiên.'
          );
        }

        const employeePayload = CreateEmployeeSchema.parse({
          firstName: validated.firstName.trim(),
          lastName: validated.lastName.trim(),
          employeeCode: normalizedCode,
          email: normalizedEmail,
          phoneNumber: validated.phoneNumber.trim(),
          departmentId: validated.departmentId,
          positionId: validated.positionId,
          gender: 'OTHER',
          contractSalary: validated.contractSalary,
          hireDate: validated.hireDate || new Date().toISOString().slice(0, 10),
        });

        // 3. Pre-lookup system role outside transaction (Requirement 4)
        let empRole = prisma.role?.findUnique ? await prisma.role.findUnique({ where: { code: 'employee' } }) : null;
        if (!empRole) {
          if (prisma.role?.create) {
            empRole = await prisma.role.create({
              data: {
                code: 'employee',
                name: 'Nhân viên',
                description: 'Vai trò nhân viên thông thường',
              },
            });
          } else {
            empRole = { id: 'role-employee-default' } as any;
          }
        }

        // 4. Pre-compute password hash outside transaction (Requirement 3: no CPU work in tx)
        const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || `${crypto.randomBytes(8).toString('hex')}!Aa1`;
        const passwordHash = await hashPassword(defaultPassword);

        // 5. Short, atomic transaction containing ONLY database operations (Requirement 3)
        try {
          result = await prisma.$transaction(
            async (tx) => {
              const emp = await EmployeeService.createEmployee(employeePayload, session, {
                tx,
                passwordHash,
                roleId: empRole?.id,
                allowOwnerOnboarding: true,
              });

              // Fresh check inside transaction: only advance if current onboardingStep < 7 (never revert if already >= 7)
              const latestOrg = await tx.organization.findUnique({
                where: { id: orgId },
                select: { onboardingStep: true },
              });

              if (latestOrg && latestOrg.onboardingStep < 7) {
                await tx.organization.update({
                  where: { id: orgId },
                  data: { onboardingStep: 7 },
                });
              }

              return emp;
            },
            {
              maxWait: 5000,
              timeout: 10000,
            }
          );
        } catch (err: any) {
          const isP2002 =
            err.code === 'P2002' ||
            err?.message?.includes('P2002') ||
            err?.message?.includes('Unique constraint failed') ||
            (err?.statusCode === 409 && (err?.message?.includes('đã tồn tại') || err?.message?.includes('đã được đăng ký')));

          if (isP2002) {
            // Concurrent race condition: another request just inserted the record!
            // Re-fetch existing employee by organizationId + employeeCode / email
            const [racingByCode, racingByUser] = await Promise.all([
              prisma.employee.findFirst({
                where: { organizationId: orgId, employeeCode: normalizedCode, deletedAt: null },
                include: { user: true },
              }),
              prisma.user.findUnique({
                where: { email: normalizedEmail },
                include: { employee: true },
              }),
            ]);

            const isRacingExactMatch =
              racingByCode &&
              racingByUser &&
              racingByUser.employee &&
              racingByCode.id === racingByUser.employee.id &&
              racingByCode.organizationId === orgId &&
              racingByUser.employee.organizationId === orgId &&
              racingByCode.firstName.trim().toLowerCase() === validated.firstName.trim().toLowerCase() &&
              racingByCode.lastName.trim().toLowerCase() === validated.lastName.trim().toLowerCase();

            if (isRacingExactMatch) {
              // Exact same identity was inserted concurrently => idempotent success!
              const freshOrg = await prisma.organization.findUnique({
                where: { id: orgId },
                select: { onboardingStep: true },
              });

              if (freshOrg && freshOrg.onboardingStep < 7) {
                await prisma.organization.update({
                  where: { id: orgId },
                  data: { onboardingStep: 7 },
                });
              }

              result = {
                ...racingByCode,
                fullName: `${racingByCode.lastName} ${racingByCode.firstName}`.trim(),
                contractSalary: Number(racingByCode.contractSalary),
                hourlyRate: Number(racingByCode.hourlyRate),
                insuranceSalary: Number(racingByCode.insuranceSalary),
                documents: (racingByCode.documents as any) || [],
              };
              break;
            }

            // If collision was with a different identity / user:
            if (racingByCode) {
              throw ApiError.conflict(`Mã nhân viên [${normalizedCode}] đã tồn tại trong tổ chức.`);
            }
            if (racingByUser) {
              throw ApiError.conflict(`Email [${normalizedEmail}] đã được đăng ký cho một tài khoản khác.`);
            }
            throw ApiError.conflict('Xung đột dữ liệu nhân viên trong quá trình xử lý đồng thời.');
          }

          // Other errors rethrow
          throw err;
        }

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
        const normalizedRuleCode = validated.ruleCode.toUpperCase().trim();
        nextStep = 9;

        // 1. Tenant-scoped idempotency pre-check
        const existingOrgRule = await prisma.payrollRule.findFirst({
          where: { organizationId: orgId, code: normalizedRuleCode },
        });

        if (existingOrgRule) {
          const isMatch = isPayrollRuleMatching(existingOrgRule, validated);
          if (isMatch) {
            // Verified idempotent retry / recovery!
            // Preserve existing completion state if already >= 9 or completedAt exists
            const freshOrg = await prisma.organization.findUnique({
              where: { id: orgId },
              select: { onboardingStep: true, onboardingCompletedAt: true },
            });

            if (freshOrg) {
              const needsStepUpdate = freshOrg.onboardingStep < 9;
              const needsTimestampUpdate = !freshOrg.onboardingCompletedAt;

              if (needsStepUpdate || needsTimestampUpdate) {
                await prisma.organization.update({
                  where: { id: orgId },
                  data: {
                    ...(needsStepUpdate ? { onboardingStep: 9 } : {}),
                    ...(needsTimestampUpdate ? { onboardingCompletedAt: new Date() } : {}),
                  },
                });
              }
            }

            result = existingOrgRule;
            break;
          }

          // Same tenant, same code, but materially different configuration/identity
          throw ApiError.conflict(
            `Mã quy chế lương "${normalizedRuleCode}" đã tồn tại trong tổ chức với cấu hình khác.`
          );
        }

        // 2. Atomic transaction: create rule + complete organization in ONE transaction
        const payrollPayload = {
          code: normalizedRuleCode,
          name: validated.ruleName.trim(),
          description: 'Quy chế lương thiết lập trong quá trình khởi tạo tổ chức.',
          isDefault: true,
          salaryBasisConfig: {
            ...VIETNAM_STATUTORY_RULE_2026.salaryBasis,
            standardWorkDays: validated.standardWorkDays,
          } as any,
          overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
          insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
          taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
          deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
          roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
          effectiveFrom: '2026-01-01',
        };

        try {
          result = await prisma.$transaction(
            async (tx) => {
              const createdRule = await PayrollRuleService.createRule(payrollPayload, session, {
                tx,
                allowOwnerOnboarding: true,
              });

              const freshOrg = await tx.organization.findUnique({
                where: { id: orgId },
                select: { onboardingStep: true, onboardingCompletedAt: true },
              });

              if (freshOrg) {
                const needsStepUpdate = freshOrg.onboardingStep < 9;
                const needsTimestampUpdate = !freshOrg.onboardingCompletedAt;

                if (needsStepUpdate || needsTimestampUpdate) {
                  await tx.organization.update({
                    where: { id: orgId },
                    data: {
                      ...(needsStepUpdate ? { onboardingStep: 9 } : {}),
                      ...(needsTimestampUpdate ? { onboardingCompletedAt: new Date() } : {}),
                    },
                  });
                }
              }

              return createdRule;
            },
            {
              maxWait: 5000,
              timeout: 10000,
            }
          );
        } catch (err: any) {
          const isP2002 =
            err?.code === 'P2002' ||
            err?.message?.includes('P2002') ||
            err?.message?.includes('Unique constraint failed') ||
            (err?.statusCode === 409 && err?.message?.includes('đã tồn tại'));

          if (isP2002) {
            // Concurrent race condition: another request just inserted the rule
            const racingRule = await prisma.payrollRule.findFirst({
              where: { organizationId: orgId, code: normalizedRuleCode },
            });

            if (racingRule && isPayrollRuleMatching(racingRule, validated)) {
              const freshOrg = await prisma.organization.findUnique({
                where: { id: orgId },
                select: { onboardingStep: true, onboardingCompletedAt: true },
              });

              if (freshOrg) {
                const needsStepUpdate = freshOrg.onboardingStep < 9;
                const needsTimestampUpdate = !freshOrg.onboardingCompletedAt;

                if (needsStepUpdate || needsTimestampUpdate) {
                  await prisma.organization.update({
                    where: { id: orgId },
                    data: {
                      ...(needsStepUpdate ? { onboardingStep: 9 } : {}),
                      ...(needsTimestampUpdate ? { onboardingCompletedAt: new Date() } : {}),
                    },
                  });
                }
              }

              result = racingRule;
              break;
            }

            if (racingRule) {
              throw ApiError.conflict(
                `Mã quy chế lương "${normalizedRuleCode}" đã tồn tại trong tổ chức với cấu hình khác.`
              );
            }

            throw ApiError.conflict('Xung đột dữ liệu quy chế lương trong quá trình xử lý đồng thời.');
          }

          throw err;
        }

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
