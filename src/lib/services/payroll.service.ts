import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  CreatePayrollPeriodInput,
  CalculatePayrollInput,
  PayrollPeriodQueryParams,
} from '@/lib/validations/payroll';
import { PayrollCalculationEngine } from '@/lib/payroll/payroll-calculation-engine';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import { PayrollRuleConfig } from '@/lib/payroll/types';
import { PayrollWorkflowService } from './payroll-workflow.service';
import { Decimal } from 'decimal.js';

export class PayrollService {
  // ── 1. Query Periods ───────────────────────────────────────────────────────
  static async listPeriods(params: PayrollPeriodQueryParams, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để truy cập bảng lương.');
    }

    const { status, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      // PHASE 5: Tenant isolation
      organizationId: session.organizationId ?? '__no_org__',
    };
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, periods] = await Promise.all([
      prisma.payrollPeriod.count({ where }),
      prisma.payrollPeriod.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          payrollRule: {
            select: { id: true, code: true, name: true, version: true },
          },
          _count: {
            select: { payrolls: true },
          },
        },
      }),
    ]);

    return {
      data: periods,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── 2. Create Period ───────────────────────────────────────────────────────
  static async createPeriod(input: CreatePayrollPeriodInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      throw ApiError.forbidden('Chỉ Nhân sự hoặc Quản trị viên mới có quyền tạo kỳ tính lương.');
    }

    // Check code uniqueness scoped to this organization
    const existing = await prisma.payrollPeriod.findFirst({
      where: { code: input.code, organizationId: session.organizationId },
    });
    if (existing) {
      throw ApiError.conflict(`Mã kỳ tính lương "${input.code}" đã tồn tại trong tổ chức.`);
    }

    // Resolve payroll rule
    let payrollRuleId = input.payrollRuleId;
    if (!payrollRuleId) {
      const defaultRule = await prisma.payrollRule.findFirst({
        where: { isDefault: true, isActive: true },
      });
      if (defaultRule) {
        payrollRuleId = defaultRule.id;
      }
    }

    const period = await prisma.payrollPeriod.create({
      data: {
        code: input.code,
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        standardWorkDays: input.standardWorkDays,
        payrollRuleId,
        status: 'DRAFT',
        organizationId: session.organizationId!, // PHASE 5: tenant binding
      },
      include: {
        payrollRule: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'CREATE_PAYROLL_PERIOD',
        entity: 'PayrollPeriod',
        entityId: period.id,
        newValues: {
          code: period.code,
          name: period.name,
          startDate: input.startDate,
          endDate: input.endDate,
        },
      },
    });

    logger.info(`[PayrollService] Created payroll period ${period.code} by ${session.email}`);
    return period;
  }

  // ── 3. Get Period Detail With Payslips ──────────────────────────────────────
  static async getPeriodDetail(periodId: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        payrollRule: true,
        payrolls: {
          orderBy: { employee: { employeeCode: 'asc' } },
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
                position: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    });

    if (!period) {
      throw ApiError.notFound('Không tìm thấy kỳ tính lương yêu cầu.');
    }

    // PHASE 5: Tenant isolation
    if (session?.organizationId && (period as any).organizationId && (period as any).organizationId !== session.organizationId) {
      throw ApiError.notFound('Không tìm thấy kỳ tính lương yêu cầu.');
    }

    // Non-HR/Admin can only see their own payslip
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      const selfEmployee = await prisma.employee.findUnique({
        where: { userId: session.userId },
      });
      if (!selfEmployee) {
        throw ApiError.forbidden('Bạn không có quyền truy cập dữ liệu kỳ lương này.');
      }
      period.payrolls = period.payrolls.filter((p) => p.employeeId === selfEmployee.id);
    }

    return period;
  }

  // ── 4. Calculate Period Payroll (ACID Transaction) ─────────────────────────
  static async calculatePeriodPayroll(input: CalculatePayrollInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      throw ApiError.forbidden('Chỉ Nhân sự hoặc Quản trị viên mới có quyền thực hiện tính lương.');
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: input.periodId },
      include: { payrollRule: true },
    });

    if (!period || (session?.organizationId && (period as any).organizationId && (period as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy kỳ tính lương.');
    }

    // Enforce Immutability Guard: APPROVED, PAID, or CLOSED periods cannot be edited directly
    PayrollWorkflowService.assertPeriodIsMutable(period.status, period.code);
    if (period.status === 'CLOSED') {
      throw ApiError.badRequest('Kỳ tính lương đã khóa (CLOSED), không thể tính toán lại.');
    }

    // Resolve Rule Config
    let ruleConfig: PayrollRuleConfig;
    if (period.payrollRule) {
      ruleConfig = {
        ruleCode: period.payrollRule.code,
        ruleName: period.payrollRule.name,
        salaryBasis: period.payrollRule.salaryBasisConfig as any,
        overtime: period.payrollRule.overtimeConfig as any,
        insurance: period.payrollRule.insuranceConfig as any,
        tax: period.payrollRule.taxConfig as any,
        deduction: period.payrollRule.deductionConfig as any,
        rounding: period.payrollRule.roundingConfig as any,
      };
    } else {
      ruleConfig = VIETNAM_STATUTORY_RULE_2026;
    }

    // Date range boundaries
    const startRange = period.startDate;
    const endRange = period.endDate;
    const standardWorkDays = period.standardWorkDays || 22;

    // 1. Fetch eligible employees (strictly scoped to current tenant)
    const employeeWhere: any = {
      organizationId: session.organizationId ?? '__no_org__',
      hireDate: { lte: endRange },
      OR: [
        { deletedAt: null },
        { deletedAt: { gte: startRange } },
      ],
      AND: [
        {
          OR: [
            { status: { in: ['ACTIVE', 'PROBATION'] } },
            { status: 'TERMINATED', updatedAt: { gte: startRange } },
          ],
        },
      ],
    };

    if (input.departmentId) {
      employeeWhere.departmentId = input.departmentId;
    }

    const employees = await prisma.employee.findMany({
      where: employeeWhere,
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        contractSalary: true,
        hourlyRate: true,
        insuranceSalary: true,
        dependentsCount: true,
        hireDate: true,
        status: true,
      },
    });

    if (employees.length === 0) {
      throw ApiError.badRequest('Không tìm thấy nhân viên đủ điều kiện tính lương trong kỳ này.');
    }

    // Pre-calculate payslips for each employee
    const calculatedPayrolls: Array<{
      employeeId: string;
      output: ReturnType<typeof PayrollCalculationEngine.calculate>;
    }> = [];

    const employeeIds = employees.map((emp) => emp.id);
    const periodCode = period.code.slice(0, 7); // e.g. "2026-09"

    // [PHASE 25 OPTIMIZATION] Batch fetch all records concurrently before loop to eliminate 4x N+1 queries
    const [allAttendances, allApprovedLeaves, allApprovedBonusPenalties, allApprovedKpi] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          employeeId: { in: employeeIds },
          workDate: { gte: startRange, lte: endRange },
          status: { notIn: ['REJECTED', 'ABSENT'] },
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          startDate: { lte: endRange },
          endDate: { gte: startRange },
        },
        include: { leaveType: true },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          OR: [
            { period: period.code },
            { period: periodCode },
            { effectiveDate: { gte: startRange, lte: endRange } },
          ],
        },
      }),
      prisma.employeeKpiResult.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: 'APPROVED',
          period: { in: [period.code, periodCode] },
        },
      }),
    ]);

    // In-memory indexing by employeeId for microsecond lookups
    const attendanceMap = new Map<string, typeof allAttendances>();
    for (const att of allAttendances) {
      let list = attendanceMap.get(att.employeeId);
      if (!list) {
        list = [];
        attendanceMap.set(att.employeeId, list);
      }
      list.push(att);
    }

    const leaveMap = new Map<string, typeof allApprovedLeaves>();
    for (const l of allApprovedLeaves) {
      let list = leaveMap.get(l.employeeId);
      if (!list) {
        list = [];
        leaveMap.set(l.employeeId, list);
      }
      list.push(l);
    }

    const bonusPenaltyMap = new Map<string, typeof allApprovedBonusPenalties>();
    for (const bp of allApprovedBonusPenalties) {
      let list = bonusPenaltyMap.get(bp.employeeId);
      if (!list) {
        list = [];
        bonusPenaltyMap.set(bp.employeeId, list);
      }
      list.push(bp);
    }

    const kpiMap = new Map<string, typeof allApprovedKpi>();
    for (const k of allApprovedKpi) {
      let list = kpiMap.get(k.employeeId);
      if (!list) {
        list = [];
        kpiMap.set(k.employeeId, list);
      }
      list.push(k);
    }

    for (const emp of employees) {
      // a. Official Attendance records (O(1) in-memory lookup)
      const attendances = attendanceMap.get(emp.id) || [];

      let totalWorkHours = 0;
      let totalOtHours = 0;
      let weekdayOtHours = 0;
      let weekendOtHours = 0;
      const holidayOtHours = 0;
      let actualDays = 0;

      for (const att of attendances) {
        const hours = Number(att.actualWorkHours) || 0;
        const ot = Number(att.otHours) || 0;
        totalWorkHours += hours;
        totalOtHours += ot;

        // Prorated day count per shift
        if (hours >= 8) {
          actualDays += 1;
        } else if (hours >= 4) {
          actualDays += 0.5;
        } else if (hours > 0) {
          actualDays += hours / 8;
        }

        // Categorize overtime by day of week
        const dayOfWeek = new Date(att.workDate).getDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          weekendOtHours += ot;
        } else {
          weekdayOtHours += ot;
        }
      }

      // b. Approved Leaves (O(1) in-memory lookup)
      const approvedLeaves = leaveMap.get(emp.id) || [];

      let paidLeaveDays = 0;
      let unpaidLeaveDays = 0;

      for (const l of approvedLeaves) {
        const dur = Number(l.durationDays) || 1;
        if (l.leaveType && l.leaveType.isPaid) {
          paidLeaveDays += dur;
        } else {
          unpaidLeaveDays += dur;
        }
      }

      // c. Approved Bonuses and Penalties (O(1) in-memory lookup)
      const approvedBonusPenalties = bonusPenaltyMap.get(emp.id) || [];

      let totalBonusAmount = 0;
      let totalPenaltyAmount = 0;
      let kpiBonus = 0;
      let otherBonuses = 0;

      for (const item of approvedBonusPenalties) {
        const amt = Number(item.amount) || 0;
        if (item.type === 'BONUS') {
          totalBonusAmount += amt;
          if (item.category === 'KPI') {
            kpiBonus += amt;
          } else {
            otherBonuses += amt;
          }
        } else if (item.type === 'PENALTY') {
          totalPenaltyAmount += amt;
        }
      }

      // d. Approved KPI Results (O(1) in-memory lookup)
      const approvedKpi = kpiMap.get(emp.id) || [];

      for (const k of approvedKpi) {
        const amt = Number(k.bonusAmount) || 0;
        kpiBonus += amt;
        totalBonusAmount += amt;
      }

      // e. Run Deterministic Engine
      const engineOutput = PayrollCalculationEngine.calculate({
        baseSalary: Number(emp.contractSalary),
        workDays: standardWorkDays,
        actualWorkDays: actualDays,
        workHours: totalWorkHours,
        overtimeHours: totalOtHours,
        overtimeDetails: {
          weekdayOtHours,
          weekendOtHours,
          holidayOtHours,
          nightHours: 0,
        },
        paidLeaveDays,
        unpaidLeaveDays,
        bonus: totalBonusAmount,
        bonusDetails: {
          kpiBonus,
          otherBonus: otherBonuses,
        },
        penalty: totalPenaltyAmount,
        dependentsCount: emp.dependentsCount,
        insuranceSalary: Number(emp.insuranceSalary) || undefined,
        ruleConfig,
      });

      calculatedPayrolls.push({
        employeeId: emp.id,
        output: engineOutput,
      });
    }

    // ── 2. Run ACID Transaction in PostgreSQL ──────────────────────────────────
    const transactionResult = await prisma.$transaction(async (tx) => {
      // 1. Delete existing payroll records for this period if recalculating
      const existingPayrolls = await tx.payroll.findMany({
        where: { periodId: period.id },
        select: { id: true },
      });

      if (existingPayrolls.length > 0) {
        const existingIds = existingPayrolls.map((p) => p.id);
        await tx.payrollDetail.deleteMany({
          where: { payrollId: { in: existingIds } },
        });
        await tx.payroll.deleteMany({
          where: { periodId: period.id },
        });
      }

      let grandTotalGross = new Decimal(0);
      let grandTotalNet = new Decimal(0);

      // 2. Insert fresh Payroll records with details
      for (const item of calculatedPayrolls) {
        const out = item.output;
        grandTotalGross = grandTotalGross.plus(out.grossSalary);
        grandTotalNet = grandTotalNet.plus(out.netSalary);

        const createdPayroll = await tx.payroll.create({
          data: {
            periodId: period.id,
            employeeId: item.employeeId,
            contractSalary: out.baseSalary,
            actualWorkDays: out.actualWorkDays,
            paidLeaveDays: out.paidLeavePay > 0 ? 1 : 0,
            proratedSalary: out.proratedSalary,
            otPay: out.overtimePay,
            kpiBonus: out.totalBonus,
            allowances: out.allowances,
            otherBonuses: 0,
            totalPenalties: out.totalPenalty,
            grossIncome: out.grossSalary,
            socialInsurance: out.employeeSocial,
            healthInsurance: out.employeeHealth,
            unemploymentInsurance: out.employeeUnemployment,
            taxableIncome: out.taxableIncome,
            personalRelief: out.personalRelief,
            dependentsRelief: out.dependentsRelief,
            assessableIncome: out.assessableIncome,
            pitTax: out.tax,
            netSalary: out.netSalary,
            paymentStatus: 'UNPAID',
          },
        });

        // Insert line item details
        if (out.lineItems.length > 0) {
          await tx.payrollDetail.createMany({
            data: out.lineItems.map((li) => ({
              payrollId: createdPayroll.id,
              itemType: li.itemType,
              itemCode: li.itemCode,
              description: li.description,
              amount: li.amount,
            })),
          });
        }
      }

      // 3. Update PayrollPeriod totals & status
      const updatedPeriod = await tx.payrollPeriod.update({
        where: { id: period.id },
        data: {
          totalGrossPayout: grandTotalGross.toNumber(),
          totalNetPayout: grandTotalNet.toNumber(),
          status: 'CALCULATED',
        },
      });

      // 4. Record Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CALCULATE_PAYROLL',
          entity: 'PayrollPeriod',
          entityId: period.id,
          newValues: {
            totalEmployees: calculatedPayrolls.length,
            totalGrossPayout: grandTotalGross.toNumber(),
            totalNetPayout: grandTotalNet.toNumber(),
            calculatedAt: new Date().toISOString(),
          },
        },
      });

      return updatedPeriod;
    });

    logger.info(
      `[PayrollService] Payroll calculated successfully for period ${period.code}: ${calculatedPayrolls.length} employees processed.`
    );

    return {
      periodId: transactionResult.id,
      code: transactionResult.code,
      status: transactionResult.status,
      totalEmployees: calculatedPayrolls.length,
      totalGrossPayout: Number(transactionResult.totalGrossPayout),
      totalNetPayout: Number(transactionResult.totalNetPayout),
    };
  }

  // ── 5. Get Individual Payslip Detail ───────────────────────────────────────
  static async getPayslipDetail(payrollId: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const payslip = await prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        period: {
          select: {
            id: true,
            code: true,
            name: true,
            startDate: true,
            endDate: true,
            standardWorkDays: true,
            status: true,
          },
        },
        employee: {
          select: {
            id: true,
            userId: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
            bankAccountNo: true,
            bankName: true,
          },
        },
        details: {
          orderBy: { itemType: 'asc' },
        },
      },
    });

    if (!payslip) {
      throw ApiError.notFound('Không tìm thấy phiếu lương.');
    }

    // PHASE 5: Tenant isolation — verify employee belongs to session org
    if (session?.organizationId) {
      const empCheck = await prisma.employee.findUnique({
        where: { id: payslip.employeeId },
        select: { organizationId: true },
      });
      if (!empCheck || empCheck.organizationId !== session.organizationId) {
        throw ApiError.notFound('Không tìm thấy phiếu lương.');
      }
    }

    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin && payslip.employee.userId !== session.userId) {
      throw ApiError.forbidden('Bạn không có quyền truy cập phiếu lương của nhân viên khác.');
    }

    // Query official attendance for work hours & overtime hours
    let workHours = 0;
    let overtimeHours = 0;
    try {
      const attendanceSummary = await prisma.attendance.aggregate({
        where: {
          employeeId: payslip.employeeId,
          workDate: {
            gte: payslip.period.startDate,
            lte: payslip.period.endDate,
          },
          status: { notIn: ['REJECTED', 'ABSENT'] },
        },
        _sum: {
          actualWorkHours: true,
          otHours: true,
        },
      });

      workHours = Number(attendanceSummary._sum.actualWorkHours || 0);
      overtimeHours = Number(attendanceSummary._sum.otHours || 0);
    } catch {
      workHours = 0;
      overtimeHours = 0;
    }

    const actualDays = Number(payslip.actualWorkDays) || 0;
    if (workHours === 0 && actualDays > 0) {
      workHours = Math.round(actualDays * 8);
    }

    const otPay = Number(payslip.otPay) || 0;
    if (overtimeHours === 0 && otPay > 0) {
      const otDetail = payslip.details.find((d) => d.itemCode === 'OVERTIME');
      if (otDetail) {
        const match = otDetail.description.match(/(\d+(\.\d+)?)\s*giờ/);
        if (match) {
          overtimeHours = parseFloat(match[1]);
        }
      }
    }

    return {
      ...payslip,
      company: process.env.COMPANY_NAME || 'CÔNG TY CỔ PHẦN CÔNG NGHỆ ANTIGRAVITY',
      standardWorkDays: payslip.period.standardWorkDays || 22,
      workHours,
      overtimeHours,
    };
  }

  // ── 6. Close Period ────────────────────────────────────────────────────────
  static async closePeriod(periodId: string, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      throw ApiError.forbidden('Chỉ Nhân sự hoặc Quản trị viên mới có quyền khóa kỳ lương.');
    }

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });
    if (!period || (session?.organizationId && (period as any).organizationId && (period as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound('Không tìm thấy kỳ tính lương.');
    }

    const updated = await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: 'CLOSE_PAYROLL_PERIOD',
        entity: 'PayrollPeriod',
        entityId: periodId,
        newValues: { status: 'CLOSED', closedAt: new Date().toISOString() },
      },
    });

    return updated;
  }
}
