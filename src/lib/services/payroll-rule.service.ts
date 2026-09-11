import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  CreatePayrollRuleInput,
  UpdatePayrollRuleInput,
  SimulatePayrollInput,
  SimulatePayrollSchema,
} from '@/lib/validations/payroll-rule';
import { PayrollRuleEngine } from '@/lib/payroll/payroll-rule-engine';
import {
  VIETNAM_STATUTORY_RULE_2026,
} from '@/lib/payroll/default-rules';
import { PayrollRuleConfig } from '@/lib/payroll/types';

export class PayrollRuleService {
  // ── 1. Query Rules ─────────────────────────────────────────────────────────
  static async listRules(session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    return await prisma.payrollRule.findMany({
      where: {
        ...(session.organizationId ? { organizationId: session.organizationId } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { payrollPeriods: true } },
      },
    });
  }

  static async getRuleById(id: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const rule = await prisma.payrollRule.findUnique({
      where: { id },
      include: {
        _count: { select: { payrollPeriods: true } },
      },
    });

    if (!rule || (session?.organizationId && (rule as any).organizationId && (rule as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy quy chế tiền lương.');
    }

    return rule;
  }

  static async getDefaultRule(organizationId?: string): Promise<PayrollRuleConfig> {
    if (!organizationId) {
      throw ApiError.badRequest('Tổ chức phải cấu hình quy chế lương mặc định trước khi tính lương.');
    }

    const dbDefault = await prisma.payrollRule.findFirst({
      where: { organizationId, isDefault: true, isActive: true },
    });

    if (!dbDefault) {
      throw ApiError.badRequest('Chưa có quy chế lương mặc định được cấu hình cho tổ chức.');
    }

    return this.mapDbRuleToConfig(dbDefault);
  }

  // ── 2. Create Rule ─────────────────────────────────────────────────────────
  static async createRule(
    input: CreatePayrollRuleInput,
    session: UserSession,
    options?: { tx?: Prisma.TransactionClient; allowOwnerOnboarding?: boolean }
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isOwnerOnboarding = session.tenantRole === 'OWNER' && options?.allowOwnerOnboarding;
    if (!isHrOrAdmin && !isOwnerOnboarding) {
      throw ApiError.forbidden('Chỉ HR hoặc Quản trị viên mới có quyền tạo quy chế lương.');
    }

    const targetOrgId = session.organizationId || ((session.roles.includes('super_admin') && (input as any).organizationId) ? (input as any).organizationId : null);
    if (!targetOrgId) {
      throw ApiError.badRequest('Tổ chức (organizationId) là bắt buộc để tạo quy chế lương.');
    }

    const db = options?.tx || prisma;

    // Check duplicate rule code in organization
    const existingCode = await db.payrollRule.findFirst({
      where: {
        code: input.code,
        organizationId: targetOrgId,
      },
    });
    if (existingCode) {
      throw ApiError.conflict(`Mã quy chế lương "${input.code}" đã tồn tại trong hệ thống.`);
    }

    const executeWrites = async (tx: Prisma.TransactionClient) => {
      // If new rule is set as default, unset previous default rules within this organization
      if (input.isDefault) {
        await tx.payrollRule.updateMany({
          where: {
            isDefault: true,
            organizationId: targetOrgId,
          },
          data: { isDefault: false },
        });
      }

      const created = await tx.payrollRule.create({
        data: {
          organizationId: targetOrgId,
          code: input.code,
          name: input.name,
          description: input.description || null,
          isDefault: Boolean(input.isDefault),
          isActive: true,
          version: 1,
          salaryBasisConfig: input.salaryBasisConfig as any,
          overtimeConfig: input.overtimeConfig as any,
          insuranceConfig: input.insuranceConfig as any,
          taxConfig: input.taxConfig as any,
          deductionConfig: input.deductionConfig as any,
          roundingConfig: input.roundingConfig as any,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        },
      });

      // Immutable Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_PAYROLL_RULE',
          entity: 'PayrollRule',
          entityId: created.id,
          organizationId: targetOrgId,
          newValues: {
            code: created.code,
            name: created.name,
            version: created.version,
          },
        },
      });

      logger.info(`[PayrollRuleService] Rule ${created.code} created by ${session.email}`);

      return created;
    };

    if (options?.tx) {
      return await executeWrites(options.tx);
    }

    return await prisma.$transaction(executeWrites, {
      maxWait: 5000,
      timeout: 10000,
    });
  }

  // ── 3. Update Rule ─────────────────────────────────────────────────────────
  static async updateRule(
    id: string,
    input: UpdatePayrollRuleInput,
    session: UserSession
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      throw ApiError.forbidden('Chỉ HR hoặc Quản trị viên mới có quyền sửa đổi quy chế lương.');
    }

    const existing = await prisma.payrollRule.findUnique({
      where: { id },
    });
    if (!existing || (session?.organizationId && (existing as any).organizationId && (existing as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy quy chế tiền lương cần sửa.');
    }

    return await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.payrollRule.updateMany({
          where: { isDefault: true, id: { not: id }, organizationId: existing.organizationId },
          data: { isDefault: false },
        });
      }

      const data: any = {
        version: existing.version + 1,
      };

      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) data.description = input.description;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      if (input.salaryBasisConfig) data.salaryBasisConfig = input.salaryBasisConfig;
      if (input.overtimeConfig) data.overtimeConfig = input.overtimeConfig;
      if (input.insuranceConfig) data.insuranceConfig = input.insuranceConfig;
      if (input.taxConfig) data.taxConfig = input.taxConfig;
      if (input.deductionConfig) data.deductionConfig = input.deductionConfig;
      if (input.roundingConfig) data.roundingConfig = input.roundingConfig;
      if (input.effectiveFrom) data.effectiveFrom = new Date(input.effectiveFrom);
      if (input.effectiveTo !== undefined) {
        data.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
      }

      const updated = await tx.payrollRule.update({
        where: { id },
        data,
      });

      // Immutable Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_PAYROLL_RULE',
          entity: 'PayrollRule',
          entityId: id,
          organizationId: existing.organizationId,
          oldValues: {
            version: existing.version,
            isDefault: existing.isDefault,
            name: existing.name,
          },
          newValues: {
            version: updated.version,
            isDefault: updated.isDefault,
            name: updated.name,
          },
        },
      });

      logger.info(
        `[PayrollRuleService] Rule ${updated.code} updated to v${updated.version} by ${session.email}`
      );

      return updated;
    });
  }

  // ── 4. Set Default Rule ───────────────────────────────────────────────────
  static async setDefaultRule(id: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      throw ApiError.forbidden('Chỉ HR hoặc Quản trị viên mới có quyền thiết lập quy chế mặc định.');
    }

    const rule = await prisma.payrollRule.findUnique({ where: { id } });
    if (!rule || (session?.organizationId && (rule as any).organizationId && (rule as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy quy chế tiền lương.');
    }

    return await prisma.$transaction(async (tx) => {
      await tx.payrollRule.updateMany({
        where: { isDefault: true, organizationId: rule.organizationId },
        data: { isDefault: false },
      });

      const updated = await tx.payrollRule.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'SET_DEFAULT_PAYROLL_RULE',
          entity: 'PayrollRule',
          entityId: id,
          organizationId: rule.organizationId,
          newValues: { code: updated.code, isDefault: true },
        },
      });

      return updated;
    });
  }

  // ── 5. Simulate Payroll Execution ──────────────────────────────────────────
  static async simulatePayroll(input: SimulatePayrollInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để chạy mô phỏng tính lương.');
    }

    const parsed = SimulatePayrollSchema.parse(input);
    let ruleConfig: PayrollRuleConfig;

    if (parsed.ruleId) {
      const dbRule = await prisma.payrollRule.findUnique({
        where: { id: parsed.ruleId },
      });
      if (
        !dbRule ||
        (session.organizationId && (dbRule as any).organizationId && (dbRule as any).organizationId !== session.organizationId)
      ) {
        throw ApiError.notFound('Không tìm thấy quy chế lương được chọn.');
      }
      ruleConfig = this.mapDbRuleToConfig(dbRule);
    } else if (parsed.ruleConfig && parsed.ruleConfig.salaryBasisConfig) {
      ruleConfig = {
        ruleCode: parsed.ruleConfig.code || 'SIMULATED_CUSTOM_RULE',
        ruleName: parsed.ruleConfig.name || 'Quy Chế Tùy Chỉnh Giả Lập',
        salaryBasis: parsed.ruleConfig.salaryBasisConfig as any,
        overtime: parsed.ruleConfig.overtimeConfig as any,
        insurance: parsed.ruleConfig.insuranceConfig as any,
        tax: parsed.ruleConfig.taxConfig as any,
        deduction: parsed.ruleConfig.deductionConfig as any,
        rounding: parsed.ruleConfig.roundingConfig as any,
      };
    } else {
      throw ApiError.badRequest(
        'Vui lòng chọn quy chế lương đã cấu hình hoặc cung cấp cấu hình mô phỏng rõ ràng.'
      );
    }

    const calculationResult = PayrollRuleEngine.calculate({
      employee: parsed.employee,
      attendance: parsed.attendance,
      adjustments: parsed.adjustments,
      period: parsed.period || new Date().toISOString().slice(0, 7),
      ruleConfig,
    });

    // Audit Simulation
    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'SIMULATE_PAYROLL',
        entity: 'PayrollRule',
        entityId: parsed.ruleId || 'DYNAMIC_CONFIG',
        organizationId: session.organizationId || null,
        newValues: {
          grossSalary: (calculationResult as any).grossSalary,
          netSalary: (calculationResult as any).netSalary,
          totalCost: (calculationResult as any).employerTotalCost,
          ruleCode: ruleConfig.ruleCode,
        },
      },
    });

    return {
      simulationTimestamp: new Date().toISOString(),
      ruleUsed: {
        code: ruleConfig.ruleCode,
        name: ruleConfig.ruleName,
      },
      result: calculationResult,
    };
  }

  // ── Helper ────────────────────────────────────────────────────────────────
  private static mapDbRuleToConfig(dbRule: any): PayrollRuleConfig {
    return {
      ruleCode: dbRule.code,
      ruleName: dbRule.name,
      salaryBasis: dbRule.salaryBasisConfig,
      overtime: dbRule.overtimeConfig,
      insurance: dbRule.insuranceConfig,
      tax: dbRule.taxConfig,
      deduction: dbRule.deductionConfig,
      rounding: dbRule.roundingConfig,
    };
  }
}
