import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { Prisma } from '@prisma/client';
import {
  calculateAchievementRate,
  calculateBonusAmount,
  calculateOverallKpiScorecard,
  CalculationType,
  BonusFormula,
  KpiScorecardItemInput,
} from '@/lib/kpi/kpi-calculator';
import {
  CreateKpiDefinitionInput,
  UpdateKpiDefinitionInput,
  KpiQueryParams,
  AssignKpiInput,
  BulkAssignKpiInput,
  RecordActualValueInput,
  EvaluateKpiInput,
} from '@/lib/validations/kpi';

export class KpiService {
  // ── RBAC Helpers ───────────────────────────────────────────────────────────

  private static ensurePrivileged(session: UserSession, adminOnly = false) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để thực hiện thao tác.');
    }
    const isAdmin = session.roles.includes('admin');
    const isHr = session.roles.includes('hr');

    if (adminOnly && !isAdmin) {
      throw ApiError.forbidden('Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này.');
    }
    if (!isAdmin && !isHr) {
      throw ApiError.forbidden('Bạn không có quyền quản lý danh mục KPI (Yêu cầu quyền Admin hoặc HR).');
    }
  }

  private static async checkManagerOrHrAccess(employeeId: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để thực hiện.');
    }

    const isAdmin = session.roles.includes('admin');
    const isHr = session.roles.includes('hr');
    if (isAdmin || isHr) return;

    const isManager = session.roles.includes('manager');
    if (!isManager) {
      throw ApiError.forbidden('Bạn không có quyền đánh giá hoặc phân bổ KPI.');
    }

    // Manager cannot self-evaluate/self-assign approval
    if (session.employeeId && session.employeeId === employeeId) {
      throw ApiError.forbidden('Quản lý không được tự duyệt hoặc tự đánh giá KPI của chính mình.');
    }

    // Verify employee belongs to a department managed by this manager
    const targetEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });

    if (!targetEmployee) {
      throw ApiError.notFound('Không tìm thấy nhân viên.');
    }

    const manager = await prisma.employee.findUnique({
      where: { id: session.employeeId },
      include: { managedDepartments: { select: { id: true } } },
    });

    const managedDeptIds = manager?.managedDepartments.map((d) => d.id) || [];
    if (!managedDeptIds.includes(targetEmployee.departmentId)) {
      throw ApiError.forbidden('Bạn chỉ có quyền thao tác với nhân viên thuộc phòng ban bạn trực tiếp quản lý.');
    }
  }

  // ── 1. KPI Definition CRUD ─────────────────────────────────────────────────

  static async createKpiDefinition(input: CreateKpiDefinitionInput, session: UserSession) {
    this.ensurePrivileged(session);

    // Check duplicate code
    const existing = await prisma.kpi.findUnique({
      where: { code: input.code },
    });
    if (existing) {
      throw ApiError.conflict(`Mã KPI "${input.code}" đã tồn tại trong hệ thống.`);
    }

    if (input.departmentId) {
      const dept = await prisma.department.findUnique({
        where: { id: input.departmentId },
      });
      if (!dept) {
        throw ApiError.notFound('Phòng ban được chỉ định không tồn tại.');
      }
    }

    return prisma.$transaction(async (tx) => {
      const created = await tx.kpi.create({
        data: {
          code: input.code,
          title: input.title,
          description: input.description,
          metricType: input.metricType || 'NUMERIC',
          targetValue: new Prisma.Decimal(input.targetValue),
          unit: input.unit,
          period: input.period,
          departmentId: input.departmentId,
          calculationType: input.calculationType,
          baseBonusAmount: new Prisma.Decimal(input.baseBonusAmount),
          bonusFormula: input.bonusFormula,
          weight: new Prisma.Decimal(input.weight),
          status: 'ACTIVE',
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_KPI_DEFINITION',
          entity: 'Kpi',
          entityId: created.id,
          newValues: {
            code: created.code,
            title: created.title,
            targetValue: input.targetValue,
            unit: input.unit,
            baseBonusAmount: input.baseBonusAmount,
          },
        },
      });

      logger.info(`[KpiService] KPI Definition created: ${created.code} by ${session.email}`);
      return created;
    });
  }

  static async updateKpiDefinition(id: string, input: UpdateKpiDefinitionInput, session: UserSession) {
    this.ensurePrivileged(session);

    const existing = await prisma.kpi.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw ApiError.notFound('Chỉ số KPI không tồn tại hoặc đã bị xóa.');
    }

    if (input.code && input.code !== existing.code) {
      const duplicate = await prisma.kpi.findUnique({ where: { code: input.code } });
      if (duplicate && duplicate.id !== id) {
        throw ApiError.conflict(`Mã KPI "${input.code}" đã được sử dụng.`);
      }
    }

    return prisma.$transaction(async (tx) => {
      const data: Prisma.KpiUpdateInput = {};
      if (input.code) data.code = input.code;
      if (input.title) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.metricType) data.metricType = input.metricType;
      if (input.targetValue !== undefined) data.targetValue = new Prisma.Decimal(input.targetValue);
      if (input.unit) data.unit = input.unit;
      if (input.period) data.period = input.period;
      if (input.departmentId !== undefined) {
        data.department = input.departmentId ? { connect: { id: input.departmentId } } : { disconnect: true };
      }
      if (input.calculationType) data.calculationType = input.calculationType;
      if (input.baseBonusAmount !== undefined) data.baseBonusAmount = new Prisma.Decimal(input.baseBonusAmount);
      if (input.bonusFormula) data.bonusFormula = input.bonusFormula;
      if (input.weight !== undefined) data.weight = new Prisma.Decimal(input.weight);
      if (input.status) data.status = input.status;

      const updated = await tx.kpi.update({
        where: { id },
        data,
        include: {
          department: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_KPI_DEFINITION',
          entity: 'Kpi',
          entityId: id,
          oldValues: { title: existing.title, targetValue: Number(existing.targetValue) },
          newValues: input,
        },
      });

      return updated;
    });
  }

  static async deleteKpiDefinition(id: string, session: UserSession) {
    this.ensurePrivileged(session);

    const existing = await prisma.kpi.findUnique({
      where: { id },
      include: {
        _count: { select: { results: true } },
      },
    });

    if (!existing || existing.deletedAt) {
      throw ApiError.notFound('Chỉ số KPI không tồn tại.');
    }

    if (existing._count.results > 0) {
      // Soft-delete to preserve history
      return prisma.$transaction(async (tx) => {
        const softDeleted = await tx.kpi.update({
          where: { id },
          data: { status: 'ARCHIVED', deletedAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'SOFT_DELETE_KPI_DEFINITION',
            entity: 'Kpi',
            entityId: id,
            oldValues: { status: existing.status },
            newValues: { status: 'ARCHIVED' },
          },
        });

        return softDeleted;
      });
    }

    // Hard delete if never assigned
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.kpi.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'HARD_DELETE_KPI_DEFINITION',
          entity: 'Kpi',
          entityId: id,
          oldValues: { code: existing.code, title: existing.title },
        },
      });

      return deleted;
    });
  }

  static async getKpiDefinitions(query: KpiQueryParams) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.KpiWhereInput = {
      deletedAt: null,
    };

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }

    if (query.period) {
      where.period = query.period;
    }

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    const [total, items] = await Promise.all([
      prisma.kpi.count({ where }),
      prisma.kpi.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          department: { select: { id: true, name: true, code: true } },
          _count: { select: { results: true } },
        },
      }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── 2. Employee KPI Assignment & Evaluation ────────────────────────────────

  static async assignKpiToEmployee(input: AssignKpiInput, session: UserSession) {
    await this.checkManagerOrHrAccess(input.employeeId, session);

    const kpi = await prisma.kpi.findUnique({
      where: { id: input.kpiId },
    });
    if (!kpi || kpi.deletedAt || kpi.status !== 'ACTIVE') {
      throw ApiError.notFound('Chỉ số KPI không khả dụng hoặc đã bị ngừng hoạt động.');
    }

    // Prevent duplicate assignment in same period
    const duplicate = await prisma.employeeKpiResult.findUnique({
      where: {
        employeeId_kpiId_period: {
          employeeId: input.employeeId,
          kpiId: input.kpiId,
          period: input.period,
        },
      },
    });

    if (duplicate) {
      throw ApiError.conflict(
        `Nhân viên này đã được giao chỉ số "${kpi.title}" trong kỳ ${input.period}.`
      );
    }

    const targetValue = input.targetValue != null ? input.targetValue : Number(kpi.targetValue);
    const actualValue = input.actualValue != null ? input.actualValue : 0;

    // Use pure calculation engine
    const achievementRate = calculateAchievementRate(
      actualValue,
      targetValue,
      kpi.calculationType as CalculationType
    );
    const bonusAmount = calculateBonusAmount(
      achievementRate,
      Number(kpi.baseBonusAmount),
      kpi.bonusFormula as BonusFormula
    );
    const score = achievementRate;
    const weightedScore = Math.round(((score * Number(kpi.weight)) / 100) * 100) / 100;

    return prisma.$transaction(async (tx) => {
      const created = await tx.employeeKpiResult.create({
        data: {
          employeeId: input.employeeId,
          kpiId: input.kpiId,
          period: input.period,
          targetValue: new Prisma.Decimal(targetValue),
          actualValue: new Prisma.Decimal(actualValue),
          completionRate: new Prisma.Decimal(achievementRate),
          score: new Prisma.Decimal(score),
          weightedScore: new Prisma.Decimal(weightedScore),
          bonusAmount: new Prisma.Decimal(bonusAmount),
          managerComment: input.managerComment,
          status: 'DRAFT',
        },
        include: {
          kpi: true,
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeCode: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'ASSIGN_KPI_TO_EMPLOYEE',
          entity: 'EmployeeKpiResult',
          entityId: created.id,
          newValues: {
            employeeId: input.employeeId,
            kpiCode: kpi.code,
            period: input.period,
            targetValue,
          },
        },
      });

      logger.info(`[KpiService] KPI ${kpi.code} assigned to employee ${input.employeeId}`);
      return created;
    });
  }

  static async bulkAssignKpi(input: BulkAssignKpiInput, session: UserSession) {
    this.ensurePrivileged(session);

    const kpi = await prisma.kpi.findUnique({
      where: { id: input.kpiId },
    });
    if (!kpi || kpi.deletedAt || kpi.status !== 'ACTIVE') {
      throw ApiError.notFound('Chỉ số KPI không khả dụng.');
    }

    const targetValue = input.targetValue != null ? input.targetValue : Number(kpi.targetValue);
    const assignedResults = [];

    for (const empId of input.employeeIds) {
      // Check existing
      const existing = await prisma.employeeKpiResult.findUnique({
        where: {
          employeeId_kpiId_period: {
            employeeId: empId,
            kpiId: input.kpiId,
            period: input.period,
          },
        },
      });

      if (!existing) {
        const item = await prisma.employeeKpiResult.create({
          data: {
            employeeId: empId,
            kpiId: input.kpiId,
            period: input.period,
            targetValue: new Prisma.Decimal(targetValue),
            actualValue: new Prisma.Decimal(0),
            completionRate: new Prisma.Decimal(0),
            score: new Prisma.Decimal(0),
            weightedScore: new Prisma.Decimal(0),
            bonusAmount: new Prisma.Decimal(0),
            status: 'DRAFT',
          },
        });
        assignedResults.push(item);
      }
    }

    return {
      success: true,
      assignedCount: assignedResults.length,
      period: input.period,
    };
  }

  static async recordActualValue(
    resultId: string,
    input: RecordActualValueInput,
    session: UserSession
  ) {
    const existing = await prisma.employeeKpiResult.findUnique({
      where: { id: resultId },
      include: { kpi: true },
    });

    if (!existing) {
      throw ApiError.notFound('Không tìm thấy bản ghi KPI.');
    }

    // RBAC: Employee can record/submit their own; Manager can record for their department; HR/Admin can record for any
    const isOwner = session.employeeId === existing.employeeId;
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    if (!isOwner && !isHrOrAdmin && !isManager) {
      throw ApiError.forbidden('Bạn không có quyền cập nhật kết quả cho KPI này.');
    }

    if (existing.status === 'APPROVED') {
      throw ApiError.badRequest('KPI này đã được phê duyệt chính thức, không thể sửa đổi kết quả.');
    }

    const target = existing.targetValue != null ? Number(existing.targetValue) : Number(existing.kpi.targetValue);
    const actual = input.actualValue;

    // Use pure calculation engine
    const achievementRate = calculateAchievementRate(
      actual,
      target,
      existing.kpi.calculationType as CalculationType
    );
    const bonusAmount = calculateBonusAmount(
      achievementRate,
      Number(existing.kpi.baseBonusAmount),
      existing.kpi.bonusFormula as BonusFormula
    );
    const score = achievementRate;
    const weightedScore = Math.round(((score * Number(existing.kpi.weight)) / 100) * 100) / 100;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.employeeKpiResult.update({
        where: { id: resultId },
        data: {
          actualValue: new Prisma.Decimal(actual),
          completionRate: new Prisma.Decimal(achievementRate),
          score: new Prisma.Decimal(score),
          weightedScore: new Prisma.Decimal(weightedScore),
          bonusAmount: new Prisma.Decimal(bonusAmount),
          managerComment: input.managerComment !== undefined ? input.managerComment : existing.managerComment,
          status: isOwner ? 'SUBMITTED' : existing.status,
        },
        include: { kpi: true, employee: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'RECORD_KPI_ACTUAL_VALUE',
          entity: 'EmployeeKpiResult',
          entityId: resultId,
          oldValues: { actualValue: Number(existing.actualValue) },
          newValues: { actualValue: actual, achievementRate, bonusAmount },
        },
      });

      return updated;
    });
  }

  static async evaluateKpiAssignment(
    resultId: string,
    input: EvaluateKpiInput,
    session: UserSession
  ) {
    const existing = await prisma.employeeKpiResult.findUnique({
      where: { id: resultId },
      include: { kpi: true, employee: true },
    });

    if (!existing) {
      throw ApiError.notFound('Không tìm thấy bản ghi KPI.');
    }

    // Access check: Manager/HR/Admin with self-approval block
    await this.checkManagerOrHrAccess(existing.employeeId, session);

    const actual = input.actualValue != null ? input.actualValue : Number(existing.actualValue);
    const target = existing.targetValue != null ? Number(existing.targetValue) : Number(existing.kpi.targetValue);

    // Compute final rates & bonus via calculation engine
    const achievementRate = calculateAchievementRate(
      actual,
      target,
      existing.kpi.calculationType as CalculationType
    );
    const bonusAmount =
      input.decision === 'APPROVED'
        ? calculateBonusAmount(
            achievementRate,
            Number(existing.kpi.baseBonusAmount),
            existing.kpi.bonusFormula as BonusFormula
          )
        : 0;

    const score = achievementRate;
    const weightedScore = Math.round(((score * Number(existing.kpi.weight)) / 100) * 100) / 100;

    return prisma.$transaction(async (tx) => {
      const evaluated = await tx.employeeKpiResult.update({
        where: { id: resultId },
        data: {
          actualValue: new Prisma.Decimal(actual),
          completionRate: new Prisma.Decimal(achievementRate),
          score: new Prisma.Decimal(score),
          weightedScore: new Prisma.Decimal(weightedScore),
          bonusAmount: new Prisma.Decimal(bonusAmount),
          managerComment: input.managerComment !== undefined ? input.managerComment : existing.managerComment,
          status: input.decision,
          evaluatorId: session.employeeId || null,
          evaluatedAt: new Date(),
        },
        include: {
          kpi: true,
          employee: true,
          evaluator: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'EVALUATE_KPI_ASSIGNMENT',
          entity: 'EmployeeKpiResult',
          entityId: resultId,
          oldValues: { status: existing.status },
          newValues: {
            decision: input.decision,
            achievementRate,
            bonusAmount,
            evaluatorId: session.employeeId,
          },
        },
      });

      logger.info(
        `[KpiService] KPI ${existing.kpi.code} evaluated as ${input.decision} for employee ${existing.employeeId} by ${session.email}`
      );

      return evaluated;
    });
  }

  // ── 3. Scorecard & Aggregated Query ────────────────────────────────────────

  static async getEmployeeScorecard(
    targetEmployeeId: string | undefined,
    period: string | undefined,
    session: UserSession
  ) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const employeeId = targetEmployeeId || session.employeeId;
    if (!employeeId) {
      throw ApiError.badRequest('Không xác định được mã nhân viên.');
    }

    // RBAC: regular employee can only view own scorecard
    const isOwner = session.employeeId === employeeId;
    const isPrivileged = session.roles.includes('hr') || session.roles.includes('admin') || session.roles.includes('manager');

    if (!isOwner && !isPrivileged) {
      throw ApiError.forbidden('Bạn không có quyền xem bảng điểm KPI của nhân viên khác.');
    }

    const selectedPeriod = period || new Date().toISOString().slice(0, 7); // Default current YYYY-MM

    const [employee, results] = await Promise.all([
      prisma.employee.findUnique({
        where: { id: employeeId },
        include: { department: true, position: true },
      }),
      prisma.employeeKpiResult.findMany({
        where: {
          employeeId,
          period: selectedPeriod,
        },
        include: {
          kpi: true,
          evaluator: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!employee) {
      throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên.');
    }

    // Transform into scorecard items for calculator engine
    const scorecardInputs: KpiScorecardItemInput[] = results.map((r) => ({
      id: r.id,
      code: r.kpi.code,
      title: r.kpi.title,
      targetValue: r.targetValue != null ? Number(r.targetValue) : Number(r.kpi.targetValue),
      actualValue: r.status === 'DRAFT' && Number(r.actualValue) === 0 ? null : Number(r.actualValue),
      unit: r.kpi.unit,
      weight: Number(r.kpi.weight),
      calculationType: r.kpi.calculationType as CalculationType,
      baseBonusAmount: Number(r.kpi.baseBonusAmount),
      bonusFormula: r.kpi.bonusFormula as BonusFormula,
    }));

    // Invoke pure calculation engine for aggregated metrics
    const scorecardSummary = calculateOverallKpiScorecard(scorecardInputs);

    return {
      employee: {
        id: employee.id,
        fullName: `${employee.lastName} ${employee.firstName}`,
        employeeCode: employee.employeeCode,
        department: employee.department?.name,
        position: employee.position?.title,
      },
      period: selectedPeriod,
      scorecard: scorecardSummary,
      rawResults: results,
    };
  }

  static async getKpiDashboardSummary(session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const currentPeriod = new Date().toISOString().slice(0, 7);

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    const isManager = session.roles.includes('manager');

    const whereScope: Prisma.EmployeeKpiResultWhereInput = {
      period: currentPeriod,
    };

    if (!isHrOrAdmin && isManager && session.employeeId) {
      const manager = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: { managedDepartments: { select: { id: true } } },
      });
      const deptIds = manager?.managedDepartments.map((d) => d.id) || [];
      whereScope.employee = { departmentId: { in: deptIds } };
    } else if (!isHrOrAdmin && !isManager) {
      whereScope.employeeId = session.employeeId;
    }

    const [totalActiveKpis, totalAssigned, pendingEvaluations, approvedEvaluations] =
      await Promise.all([
        prisma.kpi.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        prisma.employeeKpiResult.count({ where: whereScope }),
        prisma.employeeKpiResult.count({ where: { ...whereScope, status: 'SUBMITTED' } }),
        prisma.employeeKpiResult.count({ where: { ...whereScope, status: 'APPROVED' } }),
      ]);

    // Calculate total approved bonus payout for current period
    const approvedResults = await prisma.employeeKpiResult.findMany({
      where: { ...whereScope, status: 'APPROVED' },
      select: { bonusAmount: true, score: true },
    });

    const totalBonusPayout = approvedResults.reduce(
      (sum, r) => sum + Number(r.bonusAmount || 0),
      0
    );

    const averageScore =
      approvedResults.length > 0
        ? Math.round(
            (approvedResults.reduce((sum, r) => sum + Number(r.score || 0), 0) /
              approvedResults.length) *
              100
          ) / 100
        : 0;

    return {
      period: currentPeriod,
      totalActiveKpis,
      totalAssigned,
      pendingEvaluations,
      approvedEvaluations,
      totalBonusPayout,
      averageScore,
    };
  }
}
