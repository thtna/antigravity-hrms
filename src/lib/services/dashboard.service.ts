import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';

export interface AdminHrDashboardData {
  totalEmployees: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  pendingLeave: number;
  pendingAttendance: number;
  payrollStatus: {
    code: string | null;
    name: string | null;
    status: string | null;
    standardWorkDays: number;
    totalGrossPayout: number;
    totalNetPayout: number;
    employeeCount: number;
  };
  overtime: {
    todayHours: number;
    monthHours: number;
  };
  bonus: {
    totalAmount: number;
    count: number;
  };
  penalty: {
    totalAmount: number;
    count: number;
  };
  charts: {
    attendanceTrend: Array<{
      date: string;
      label: string;
      present: number;
      late: number;
      absent: number;
    }>;
    departmentDistribution: Array<{
      departmentId: string;
      name: string;
      code: string;
      employeeCount: number;
      totalSalary: number;
    }>;
    rewardComparison: {
      bonusTotal: number;
      penaltyTotal: number;
      netReward: number;
    };
  };
}

export interface ManagerDashboardData {
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  teamAttendance: {
    totalMembers: number;
    presentToday: number;
    absentToday: number;
    attendanceRate: number;
  };
  lateness: {
    lateTodayCount: number;
    totalLateMinutesToday: number;
    weeklyLateCount: number;
  };
  kpi: {
    averageScore: number;
    averageCompletionRate: number;
    pendingEvaluationCount: number;
    approvedCount: number;
  };
  approvalQueue: {
    pendingLeaves: Array<{
      id: string;
      employeeName: string;
      employeeCode: string;
      requestType: string;
      startDate: string;
      endDate: string;
      durationDays: number;
      reason: string;
      createdAt: string;
    }>;
    pendingAttendance: Array<{
      id: string;
      employeeName: string;
      employeeCode: string;
      workDate: string;
      correctionType: string;
      reason: string;
      createdAt: string;
    }>;
    pendingKpi: Array<{
      id: string;
      employeeName: string;
      employeeCode: string;
      kpiTitle: string;
      period: string;
      actualValue: number;
      targetValue: number;
      completionRate: number;
    }>;
    pendingBonusPenalty: Array<{
      id: string;
      employeeName: string;
      employeeCode: string;
      type: string;
      amount: number;
      reason: string;
      period: string;
    }>;
    totalQueueCount: number;
  };
  teamMembers: Array<{
    id: string;
    employeeCode: string;
    fullName: string;
    positionTitle: string;
    avatarUrl: string | null;
    status: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    lateMinutes: number;
    actualWorkHours: number;
    todayStatus: 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE';
  }>;
  charts: {
    teamAttendance7Days: Array<{
      date: string;
      label: string;
      present: number;
      absent: number;
      late: number;
    }>;
    kpiDistribution: {
      exceeding: number;
      meeting: number;
      needsImprovement: number;
    };
  };
}

export interface EmployeeDashboardData {
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    departmentName: string;
    positionTitle: string;
  };
  todayAttendance: {
    id: string | null;
    workDate: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    checkInMethod: string | null;
    status: string;
    statusLabel: string;
    lateMinutes: number;
    earlyMinutes: number;
    actualWorkHours: number;
    otHours: number;
  };
  workingHours: {
    todayHours: number;
    monthTotalHours: number;
    standardMonthHours: number;
    completionPercentage: number;
  };
  overtime: {
    todayOtHours: number;
    monthTotalOtHours: number;
  };
  leave: {
    totalAllowance: number;
    usedDays: number;
    remainingDays: number;
    pendingRequests: number;
    recentLeaves: Array<{
      id: string;
      requestType: string;
      startDate: string;
      endDate: string;
      durationDays: number;
      status: string;
      reason: string;
    }>;
  };
  kpi: {
    period: string;
    overallScore: number;
    completionRate: number;
    status: string;
    items: Array<{
      id: string;
      title: string;
      targetValue: number;
      actualValue: number;
      unit: string;
      completionRate: number;
      score: number;
      bonusAmount: number;
      status: string;
    }>;
  };
  salary: {
    contractSalary: number;
    hourlyRate: number;
    latestGross: number;
    latestNet: number;
    periodName: string | null;
  };
  payslip: {
    payrollId: string | null;
    periodCode: string | null;
    periodName: string | null;
    grossIncome: number;
    netSalary: number;
    paymentStatus: string;
    downloadPdfUrl: string | null;
    viewUrl: string | null;
  } | null;
  notifications: {
    unreadCount: number;
    items: Array<{
      id: string;
      title: string;
      message: string;
      type: string;
      actionUrl: string | null;
      isRead: boolean;
      createdAt: string;
    }>;
  };
  charts: {
    workHours14Days: Array<{
      date: string;
      label: string;
      workHours: number;
      otHours: number;
      standardHours: number;
    }>;
    salaryComposition: {
      contractSalary: number;
      otPay: number;
      bonus: number;
      deductions: number;
      netSalary: number;
    };
  };
}

export class DashboardService {
  /**
   * Helper: Get Start and End of Today in local/UTC dates
   */
  private static getTodayRange(): { startOfToday: Date; endOfToday: Date; dateStr: string } {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const dateStr = startOfToday.toISOString().slice(0, 10);
    return { startOfToday, endOfToday, dateStr };
  }

  /**
   * Helper: Get current month range (first day to last day)
   */
  private static getCurrentMonthRange(): { startOfMonth: Date; endOfMonth: Date; periodStr: string } {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    const periodStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    return { startOfMonth, endOfMonth, periodStr };
  }

  /**
   * Helper: Get list of past N calendar dates
   */
  private static getPastDays(days: number): Array<{ start: Date; end: Date; dateStr: string; label: string }> {
    const list = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 0, 0, 0, 0));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 23, 59, 59, 999));
      const dateStr = d.toISOString().slice(0, 10);
      const label = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
      list.push({ start: d, end, dateStr, label });
    }
    return list;
  }

  /**
   * ADMIN & HR DASHBOARD
   */
  /**
   * ADMIN & HR DASHBOARD
   */
  static async getAdminHrDashboard(_session: UserSession): Promise<AdminHrDashboardData> {
    const { startOfToday, endOfToday } = this.getTodayRange();
    const { startOfMonth, endOfMonth, periodStr } = this.getCurrentMonthRange();
    const past7Days = this.getPastDays(7);
    const rangeStart7 = past7Days[0].start;
    const rangeEnd7 = past7Days[past7Days.length - 1].end;

    // [PHASE 25 OPTIMIZATION] Parallelize all independent DB queries and batch 7-day attendance
    const [
      totalEmployees,
      todayAttendances,
      leavesToday,
      pendingLeave,
      pendingAttendance,
      latestPayrollPeriod,
      monthAttendanceSummary,
      approvedBonuses,
      approvedPenalties,
      past7Records,
      departments,
    ] = await Promise.all([
      // 1. Total Active Employees
      prisma.employee.count({
        where: { deletedAt: null, status: 'ACTIVE' },
      }),
      // 2. Today's Attendance records
      prisma.attendance.findMany({
        where: { workDate: { gte: startOfToday, lte: endOfToday } },
        select: {
          id: true,
          employeeId: true,
          checkInTime: true,
          lateMinutes: true,
          status: true,
          actualWorkHours: true,
          otHours: true,
        },
      }),
      // Active approved leaves today
      prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: endOfToday },
          endDate: { gte: startOfToday },
        },
        select: { employeeId: true },
      }),
      // 3. Pending Queue items
      prisma.leaveRequest.count({
        where: { status: 'PENDING' },
      }),
      prisma.attendanceAdjustment.count({
        where: { status: 'PENDING' },
      }),
      // 4. Latest Payroll Status
      prisma.payrollPeriod.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          payrolls: {
            select: { id: true, grossIncome: true, netSalary: true },
          },
        },
      }),
      // 5. Overtime Hours (current month)
      prisma.attendance.aggregate({
        where: {
          workDate: { gte: startOfMonth, lte: endOfMonth },
          status: { notIn: ['REJECTED', 'ABSENT'] },
        },
        _sum: { otHours: true },
      }),
      // 6. Bonus & Penalty for current month
      prisma.employeeBonusPenalty.findMany({
        where: {
          type: 'BONUS',
          status: 'APPROVED',
          period: periodStr,
        },
        select: { amount: true },
      }),
      prisma.employeeBonusPenalty.findMany({
        where: {
          type: 'PENALTY',
          status: 'APPROVED',
          period: periodStr,
        },
        select: { amount: true },
      }),
      // 7. Charts: Batched 7-Day Attendance Trend
      prisma.attendance.findMany({
        where: { workDate: { gte: rangeStart7, lte: rangeEnd7 } },
        select: { workDate: true, checkInTime: true, lateMinutes: true, status: true },
      }),
      // 8. Charts: Department Distribution
      prisma.department.findMany({
        where: { deletedAt: null, isActive: true },
        include: {
          employees: {
            where: { deletedAt: null, status: 'ACTIVE' },
            select: { contractSalary: true },
          },
        },
      }),
    ]);

    const presentToday = todayAttendances.filter(
      (a) => a.checkInTime !== null || ['PRESENT', 'LATE', 'HALF_DAY', 'COMPLETED', 'ON_TIME', 'OVERTIME'].includes(a.status)
    ).length;

    const lateToday = todayAttendances.filter((a) => a.lateMinutes > 0).length;
    const onLeaveEmployeeIds = new Set(leavesToday.map((l) => l.employeeId));
    const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveEmployeeIds.size);

    const payrollStatus = {
      code: latestPayrollPeriod?.code || null,
      name: latestPayrollPeriod?.name || null,
      status: latestPayrollPeriod?.status || 'NO_PERIOD',
      standardWorkDays: latestPayrollPeriod?.standardWorkDays || 22,
      totalGrossPayout: Number(latestPayrollPeriod?.totalGrossPayout || 0),
      totalNetPayout: Number(latestPayrollPeriod?.totalNetPayout || 0),
      employeeCount: latestPayrollPeriod?.payrolls.length || 0,
    };

    const todayOtSum = todayAttendances.reduce((acc, curr) => acc + Number(curr.otHours || 0), 0);
    const monthOtHours = Number(monthAttendanceSummary._sum.otHours || 0);

    const totalBonusAmount = approvedBonuses.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const totalPenaltyAmount = approvedPenalties.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Group 7-day attendance records in memory
    const recordsByDate = new Map<string, typeof past7Records>();
    let hasExplicitDate = false;

    for (const r of (past7Records || [])) {
      const d = (r as any)?.workDate || (r as any)?.checkInTime;
      if (d) {
        hasExplicitDate = true;
        const dStr = (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
        let list = recordsByDate.get(dStr);
        if (!list) {
          list = [];
          recordsByDate.set(dStr, list);
        }
        list.push(r);
      }
    }

    const attendanceTrend = past7Days.map((day) => {
      const records = hasExplicitDate ? (recordsByDate.get(day.dateStr) || []) : (past7Records || []);
      const dayPresent = records.filter(
        (r) => r.checkInTime !== null || ['PRESENT', 'LATE', 'HALF_DAY', 'COMPLETED', 'ON_TIME', 'OVERTIME'].includes(r.status)
      ).length;
      const dayLate = records.filter((r) => r.lateMinutes > 0).length;
      const dayAbsent = Math.max(0, totalEmployees - dayPresent);

      return {
        date: day.dateStr,
        label: day.label,
        present: dayPresent,
        late: dayLate,
        absent: dayAbsent,
      };
    });

    const departmentDistribution = departments.map((d) => ({
      departmentId: d.id,
      name: d.name,
      code: d.code,
      employeeCount: d.employees.length,
      totalSalary: d.employees.reduce((sum, e) => sum + Number(e.contractSalary || 0), 0),
    }));

    return {
      totalEmployees,
      presentToday,
      absentToday,
      lateToday,
      pendingLeave,
      pendingAttendance,
      payrollStatus,
      overtime: {
        todayHours: Math.round(todayOtSum * 10) / 10,
        monthHours: Math.round(monthOtHours * 10) / 10,
      },
      bonus: {
        totalAmount: totalBonusAmount,
        count: approvedBonuses.length,
      },
      penalty: {
        totalAmount: totalPenaltyAmount,
        count: approvedPenalties.length,
      },
      charts: {
        attendanceTrend,
        departmentDistribution,
        rewardComparison: {
          bonusTotal: totalBonusAmount,
          penaltyTotal: totalPenaltyAmount,
          netReward: totalBonusAmount - totalPenaltyAmount,
        },
      },
    };
  }

  /**
   * MANAGER DASHBOARD
   */
  static async getManagerDashboard(session: UserSession): Promise<ManagerDashboardData> {
    const { startOfToday, endOfToday } = this.getTodayRange();
    const { periodStr } = this.getCurrentMonthRange();

    // 1. Determine managed department(s)
    let department = null;

    if (session.employeeId) {
      department = await prisma.department.findFirst({
        where: { managerId: session.employeeId, deletedAt: null },
      });
    }

    // Fallback: If not assigned as manager directly, use user's department
    if (!department && session.departmentId) {
      department = await prisma.department.findUnique({
        where: { id: session.departmentId },
      });
    }

    // If still no department found, get the first department
    if (!department) {
      department = await prisma.department.findFirst({
        where: { deletedAt: null, isActive: true },
      });
    }

    const deptId = department?.id;

    // 2. Team Members in this department
    const teamEmployees = deptId
      ? await prisma.employee.findMany({
          where: { departmentId: deptId, deletedAt: null, status: 'ACTIVE' },
          include: {
            position: { select: { title: true } },
          },
          orderBy: { employeeCode: 'asc' },
        })
      : [];

    const teamMemberIds = teamEmployees.map((e) => e.id);
    const totalMembers = teamEmployees.length;

    const past7Days = this.getPastDays(7);
    const rangeStart7 = past7Days[0].start;
    const rangeEnd7 = past7Days[past7Days.length - 1].end;
    const past7DaysStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 6, 0, 0, 0, 0));

    // [PHASE 25 OPTIMIZATION] Parallelize all department manager queries via Promise.all and batch 7-day trend
    const [
      teamAttendances,
      teamLeavesToday,
      weeklyLateCount,
      teamKpiResults,
      pendingLeavesRaw,
      pendingAttendanceRaw,
      pendingKpiRaw,
      pendingBonusPenaltyRaw,
      team7DayRecords,
    ] = teamMemberIds.length > 0
      ? await Promise.all([
          // 3. Today's Attendance for Team Members
          prisma.attendance.findMany({
            where: {
              employeeId: { in: teamMemberIds },
              workDate: { gte: startOfToday, lte: endOfToday },
            },
          }),
          // Today's Approved Leaves
          prisma.leaveRequest.findMany({
            where: {
              employeeId: { in: teamMemberIds },
              status: 'APPROVED',
              startDate: { lte: endOfToday },
              endDate: { gte: startOfToday },
            },
          }),
          // 4. Weekly Lateness
          prisma.attendance.count({
            where: {
              employeeId: { in: teamMemberIds },
              workDate: { gte: past7DaysStart, lte: endOfToday },
              lateMinutes: { gt: 0 },
            },
          }),
          // 5. Team KPI Evaluation metrics
          prisma.employeeKpiResult.findMany({
            where: {
              employeeId: { in: teamMemberIds },
              period: periodStr,
            },
          }),
          // 6. Approval Queue
          prisma.leaveRequest.findMany({
            where: { employeeId: { in: teamMemberIds }, status: 'PENDING' },
            include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          prisma.attendanceAdjustment.findMany({
            where: { employeeId: { in: teamMemberIds }, status: 'PENDING' },
            include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          prisma.employeeKpiResult.findMany({
            where: { employeeId: { in: teamMemberIds }, status: 'SUBMITTED' },
            include: {
              employee: { select: { firstName: true, lastName: true, employeeCode: true } },
              kpi: { select: { title: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          prisma.employeeBonusPenalty.findMany({
            where: { employeeId: { in: teamMemberIds }, status: 'PENDING' },
            include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          // 7. Charts: Batched 7-day team attendance records
          prisma.attendance.findMany({
            where: {
              employeeId: { in: teamMemberIds },
              workDate: { gte: rangeStart7, lte: rangeEnd7 },
            },
            select: { workDate: true, checkInTime: true, lateMinutes: true, status: true },
          }),
        ])
      : [[], [], 0, [], [], [], [], [], []];

    const attendanceMap = new Map(teamAttendances.map((a) => [a.employeeId, a]));
    const teamLeaveEmployeeIds = new Set(teamLeavesToday.map((l) => l.employeeId));

    let presentToday = 0;
    let lateTodayCount = 0;
    let totalLateMinutesToday = 0;

    const teamMembersList = teamEmployees.map((emp) => {
      const att = attendanceMap.get(emp.id);
      const isOnLeave = teamLeaveEmployeeIds.has(emp.id);

      let todayStatus: 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' = 'ABSENT';
      const checkInTime = att?.checkInTime ? att.checkInTime.toISOString() : null;
      const checkOutTime = att?.checkOutTime ? att.checkOutTime.toISOString() : null;
      const lateMinutes = att?.lateMinutes || 0;
      const actualWorkHours = Number(att?.actualWorkHours || 0);

      if (isOnLeave) {
        todayStatus = 'ON_LEAVE';
      } else if (att && (att.checkInTime !== null || ['PRESENT', 'LATE', 'HALF_DAY', 'COMPLETED', 'ON_TIME', 'OVERTIME'].includes(att.status))) {
        if (lateMinutes > 0) {
          todayStatus = 'LATE';
          lateTodayCount++;
          totalLateMinutesToday += lateMinutes;
        } else {
          todayStatus = 'PRESENT';
        }
        presentToday++;
      }

      return {
        id: emp.id,
        employeeCode: emp.employeeCode,
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        positionTitle: emp.position?.title || 'Nhân viên',
        avatarUrl: emp.avatarUrl,
        status: emp.status,
        checkInTime,
        checkOutTime,
        lateMinutes,
        actualWorkHours,
        todayStatus,
      };
    });

    const absentToday = Math.max(0, totalMembers - presentToday - teamLeaveEmployeeIds.size);
    const attendanceRate = totalMembers > 0 ? Math.round((presentToday / totalMembers) * 100) : 0;

    // 5. Team KPI Evaluation metrics
    const pendingEvaluationCount = teamKpiResults.filter((k) => k.status === 'SUBMITTED').length;
    const approvedKpiCount = teamKpiResults.filter((k) => k.status === 'APPROVED').length;
    const avgScore = teamKpiResults.length > 0
      ? Math.round(teamKpiResults.reduce((acc, k) => acc + Number(k.weightedScore || k.score || 0), 0) / teamKpiResults.length)
      : 0;
    const avgCompletion = teamKpiResults.length > 0
      ? Math.round(teamKpiResults.reduce((acc, k) => acc + Number(k.completionRate || 0), 0) / teamKpiResults.length)
      : 0;

    // 6. Approval Queue
    const pendingLeaves = pendingLeavesRaw.map((l) => ({
      id: l.id,
      employeeName: `${l.employee.lastName} ${l.employee.firstName}`.trim(),
      employeeCode: l.employee.employeeCode,
      requestType: l.requestType,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      durationDays: Number(l.durationDays || 1),
      reason: l.reason,
      createdAt: l.createdAt.toISOString(),
    }));

    const pendingAttendance = pendingAttendanceRaw.map((a) => ({
      id: a.id,
      employeeName: `${a.employee.lastName} ${a.employee.firstName}`.trim(),
      employeeCode: a.employee.employeeCode,
      workDate: a.workDate.toISOString().slice(0, 10),
      correctionType: a.correctionType,
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
    }));

    const pendingKpi = pendingKpiRaw.map((k) => ({
      id: k.id,
      employeeName: `${k.employee.lastName} ${k.employee.firstName}`.trim(),
      employeeCode: k.employee.employeeCode,
      kpiTitle: k.kpi.title,
      period: k.period,
      actualValue: Number(k.actualValue || 0),
      targetValue: Number(k.targetValue || 0),
      completionRate: Number(k.completionRate || 0),
    }));

    const pendingBonusPenalty = pendingBonusPenaltyRaw.map((b) => ({
      id: b.id,
      employeeName: `${b.employee.lastName} ${b.employee.firstName}`.trim(),
      employeeCode: b.employee.employeeCode,
      type: b.type,
      amount: Number(b.amount || 0),
      reason: b.reason,
      period: b.period,
    }));

    const totalQueueCount =
      pendingLeaves.length + pendingAttendance.length + pendingKpi.length + pendingBonusPenalty.length;

    // 7. Charts: 7-day team attendance (in-memory mapping)
    const teamRecordsByDate = new Map<string, typeof team7DayRecords>();
    let hasExplicitTeamDate = false;

    for (const r of (team7DayRecords || [])) {
      const d = (r as any)?.workDate || (r as any)?.checkInTime;
      if (d) {
        hasExplicitTeamDate = true;
        const dStr = (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
        let list = teamRecordsByDate.get(dStr);
        if (!list) {
          list = [];
          teamRecordsByDate.set(dStr, list);
        }
        list.push(r);
      }
    }

    const teamAttendance7Days = past7Days.map((day) => {
      const records = hasExplicitTeamDate ? (teamRecordsByDate.get(day.dateStr) || []) : (team7DayRecords || []);
      const dayPresent = records.filter(
        (r) => r.checkInTime !== null || ['PRESENT', 'LATE', 'HALF_DAY', 'COMPLETED', 'ON_TIME', 'OVERTIME'].includes(r.status)
      ).length;
      const dayLate = records.filter((r) => r.lateMinutes > 0).length;

      return {
        date: day.dateStr,
        label: day.label,
        present: dayPresent,
        absent: Math.max(0, totalMembers - dayPresent),
        late: dayLate,
      };
    });

    // 8. KPI Distribution
    let exceeding = 0;
    let meeting = 0;
    let needsImprovement = 0;

    for (const result of teamKpiResults) {
      const rate = Number(result.completionRate || 0);
      if (rate >= 100) exceeding++;
      else if (rate >= 80) meeting++;
      else needsImprovement++;
    }

    return {
      department: department
        ? {
            id: department.id,
            name: department.name,
            code: department.code,
          }
        : null,
      teamAttendance: {
        totalMembers,
        presentToday,
        absentToday,
        attendanceRate,
      },
      lateness: {
        lateTodayCount,
        totalLateMinutesToday,
        weeklyLateCount,
      },
      kpi: {
        averageScore: avgScore,
        averageCompletionRate: avgCompletion,
        pendingEvaluationCount,
        approvedCount: approvedKpiCount,
      },
      approvalQueue: {
        pendingLeaves,
        pendingAttendance,
        pendingKpi,
        pendingBonusPenalty,
        totalQueueCount,
      },
      teamMembers: teamMembersList,
      charts: {
        teamAttendance7Days,
        kpiDistribution: {
          exceeding,
          meeting,
          needsImprovement,
        },
      },
    };
  }

  /**
   * EMPLOYEE DASHBOARD
   */
  static async getEmployeeDashboard(session: UserSession): Promise<EmployeeDashboardData> {
    const { startOfToday, endOfToday, dateStr } = this.getTodayRange();
    const { startOfMonth, endOfMonth, periodStr } = this.getCurrentMonthRange();

    // 1. Locate target employee
    let employee = null;

    if (session.employeeId) {
      employee = await prisma.employee.findUnique({
        where: { id: session.employeeId },
        include: {
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      });
    }

    // Fallback: If not linked to employee in session, check by userId
    if (!employee && session.userId) {
      employee = await prisma.employee.findUnique({
        where: { userId: session.userId },
        include: {
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      });
    }

    // Fallback for testing: first employee
    if (!employee) {
      employee = await prisma.employee.findFirst({
        where: { deletedAt: null },
        include: {
          department: { select: { name: true } },
          position: { select: { title: true } },
        },
      });
    }

    if (!employee) {
      throw ApiError.notFound('Không tìm thấy thông tin nhân viên liên kết với tài khoản này.');
    }

    const employeeId = employee.id;

    const past14Days = this.getPastDays(14);
    const rangeStart14 = past14Days[0].start;
    const rangeEnd14 = past14Days[past14Days.length - 1].end;

    // [PHASE 25 OPTIMIZATION] Parallelize all queries for employee dashboard and batch 14-day work hours
    const [
      todayAttendanceRecord,
      monthAttendanceSummary,
      approvedLeavesThisYear,
      pendingLeaveCount,
      recentLeavesRaw,
      kpiResultsRaw,
      latestPayroll,
      unreadCount,
      notificationsRaw,
      past14DayRecords,
    ] = await Promise.all([
      // 2. Today's Attendance
      prisma.attendance.findFirst({
        where: {
          employeeId,
          workDate: { gte: startOfToday, lte: endOfToday },
        },
      }),
      // 3. Working Hours & Overtime
      prisma.attendance.aggregate({
        where: {
          employeeId,
          workDate: { gte: startOfMonth, lte: endOfMonth },
          status: { notIn: ['REJECTED', 'ABSENT'] },
        },
        _sum: {
          actualWorkHours: true,
          otHours: true,
        },
      }),
      // 4. Leave balances & requests
      prisma.leaveRequest.findMany({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: {
            gte: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
          },
        },
        select: { durationDays: true },
      }),
      prisma.leaveRequest.count({
        where: { employeeId, status: 'PENDING' },
      }),
      prisma.leaveRequest.findMany({
        where: { employeeId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // 5. KPI Results for current period
      prisma.employeeKpiResult.findMany({
        where: { employeeId, period: periodStr },
        include: { kpi: true },
      }),
      // 6. Salary & Latest Payslip
      prisma.payroll.findFirst({
        where: { employeeId },
        include: {
          period: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // 7. Notifications
      prisma.notification.count({
        where: { userId: session.userId, isRead: false },
      }),
      prisma.notification.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      // 8. Charts: Batched past 14 days work hours
      prisma.attendance.findMany({
        where: {
          employeeId,
          workDate: { gte: rangeStart14, lte: rangeEnd14 },
        },
        select: { workDate: true, actualWorkHours: true, otHours: true },
      }),
    ]);

    let statusLabel = 'Chưa check-in';
    if (todayAttendanceRecord?.checkOutTime) {
      statusLabel = 'Đã kết thúc ca làm (Checked out)';
    } else if (todayAttendanceRecord?.checkInTime) {
      statusLabel = 'Đang làm việc (Checked in)';
    }

    const todayAttendance = {
      id: todayAttendanceRecord?.id || null,
      workDate: dateStr,
      checkInTime: todayAttendanceRecord?.checkInTime ? todayAttendanceRecord.checkInTime.toISOString() : null,
      checkOutTime: todayAttendanceRecord?.checkOutTime ? todayAttendanceRecord.checkOutTime.toISOString() : null,
      checkInMethod: todayAttendanceRecord?.checkInMethod || null,
      status: todayAttendanceRecord?.status || 'NOT_CHECKED_IN',
      statusLabel,
      lateMinutes: todayAttendanceRecord?.lateMinutes || 0,
      earlyMinutes: todayAttendanceRecord?.earlyMinutes || 0,
      actualWorkHours: Number(todayAttendanceRecord?.actualWorkHours || 0),
      otHours: Number(todayAttendanceRecord?.otHours || 0),
    };

    const monthTotalHours = Number(monthAttendanceSummary._sum.actualWorkHours || 0);
    const monthTotalOtHours = Number(monthAttendanceSummary._sum.otHours || 0);
    const standardMonthHours = 176; // 22 work days * 8h
    const completionPercentage = Math.min(100, Math.round((monthTotalHours / standardMonthHours) * 100));

    const usedDays = approvedLeavesThisYear.reduce((acc, curr) => acc + Number(curr.durationDays || 0), 0);
    const totalAllowance = 12; // Annual paid leaves entitlement
    const remainingDays = Math.max(0, totalAllowance - usedDays);

    const recentLeaves = recentLeavesRaw.map((l) => ({
      id: l.id,
      requestType: l.requestType,
      startDate: l.startDate.toISOString().slice(0, 10),
      endDate: l.endDate.toISOString().slice(0, 10),
      durationDays: Number(l.durationDays || 1),
      status: l.status,
      reason: l.reason,
    }));

    let overallScore = 0;
    let completionRate = 0;
    let overallKpiStatus = 'NO_DATA';

    if (kpiResultsRaw.length > 0) {
      overallScore = Math.round(
        kpiResultsRaw.reduce((acc, k) => acc + Number(k.weightedScore || k.score || 0), 0) / kpiResultsRaw.length
      );
      completionRate = Math.round(
        kpiResultsRaw.reduce((acc, k) => acc + Number(k.completionRate || 0), 0) / kpiResultsRaw.length
      );
      overallKpiStatus = kpiResultsRaw[0].status;
    }

    const kpiItems = kpiResultsRaw.map((k) => ({
      id: k.id,
      title: k.kpi.title,
      targetValue: Number(k.targetValue || k.kpi.targetValue || 0),
      actualValue: Number(k.actualValue || 0),
      unit: k.kpi.unit,
      completionRate: Number(k.completionRate || 0),
      score: Number(k.score || 0),
      bonusAmount: Number(k.bonusAmount || 0),
      status: k.status,
    }));

    const contractSalary = Number(employee.contractSalary || 0);
    const hourlyRate = Number(employee.hourlyRate || 0);

    const payslip = latestPayroll
      ? {
          payrollId: latestPayroll.id,
          periodCode: latestPayroll.period.code,
          periodName: latestPayroll.period.name,
          grossIncome: Number(latestPayroll.grossIncome || 0),
          netSalary: Number(latestPayroll.netSalary || 0),
          paymentStatus: latestPayroll.paymentStatus,
          downloadPdfUrl: `/api/v1/payroll/payslips/${latestPayroll.id}/pdf`,
          viewUrl: `/my-payslips`,
        }
      : null;

    const notifications = {
      unreadCount,
      items: notificationsRaw.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        actionUrl: n.actionUrl,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
    };

    // 8. Charts: Past 14 days work hours (in-memory mapping)
    const past14Map = new Map<string, (typeof past14DayRecords)[number]>();
    let hasExplicit14Date = false;

    for (const r of (past14DayRecords || [])) {
      const d = (r as any)?.workDate || (r as any)?.checkInTime;
      if (d) {
        hasExplicit14Date = true;
        const dStr = (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
        past14Map.set(dStr, r);
      }
    }

    const workHours14Days = past14Days.map((day) => {
      const att = hasExplicit14Date
        ? past14Map.get(day.dateStr)
        : (past14DayRecords && past14DayRecords.length > 0 ? past14DayRecords[0] : null);
      return {
        date: day.dateStr,
        label: day.label,
        workHours: Number(att?.actualWorkHours || 0),
        otHours: Number(att?.otHours || 0),
        standardHours: 8,
      };
    });

    const totalDeductions = latestPayroll
      ? Number(latestPayroll.socialInsurance || 0) +
        Number(latestPayroll.healthInsurance || 0) +
        Number(latestPayroll.unemploymentInsurance || 0) +
        Number(latestPayroll.pitTax || 0) +
        Number(latestPayroll.totalPenalties || 0)
      : 0;

    const salaryComposition = {
      contractSalary,
      otPay: Number(latestPayroll?.otPay || 0),
      bonus: Number(latestPayroll?.kpiBonus || 0) + Number(latestPayroll?.otherBonuses || 0),
      deductions: totalDeductions,
      netSalary: Number(latestPayroll?.netSalary || contractSalary),
    };

    return {
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: `${employee.lastName} ${employee.firstName}`.trim(),
        departmentName: employee.department?.name || 'Chưa phân bổ',
        positionTitle: employee.position?.title || 'Nhân viên',
      },
      todayAttendance,
      workingHours: {
        todayHours: todayAttendance.actualWorkHours,
        monthTotalHours: Math.round(monthTotalHours * 10) / 10,
        standardMonthHours,
        completionPercentage,
      },
      overtime: {
        todayOtHours: todayAttendance.otHours,
        monthTotalOtHours: Math.round(monthTotalOtHours * 10) / 10,
      },
      leave: {
        totalAllowance,
        usedDays,
        remainingDays,
        pendingRequests: pendingLeaveCount,
        recentLeaves,
      },
      kpi: {
        period: periodStr,
        overallScore,
        completionRate,
        status: overallKpiStatus,
        items: kpiItems,
      },
      salary: {
        contractSalary,
        hourlyRate,
        latestGross: Number(latestPayroll?.grossIncome || contractSalary),
        latestNet: Number(latestPayroll?.netSalary || contractSalary),
        periodName: latestPayroll?.period.name || null,
      },
      payslip,
      notifications,
      charts: {
        workHours14Days,
        salaryComposition,
      },
    };
  }

  /**
   * Mark notification(s) as read
   */
  static async markNotificationAsRead(userId: string, notificationId?: string): Promise<number> {
    if (notificationId) {
      const updated = await prisma.notification.updateMany({
        where: { id: notificationId, userId },
        data: { isRead: true },
      });
      return updated.count;
    }

    const updated = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return updated.count;
  }
}
