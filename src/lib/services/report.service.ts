import { prisma } from '@/lib/db/prisma';
import { UserSession } from '@/types';
import { ApiError } from '@/lib/errors';

export type ReportType =
  | 'attendance'
  | 'late'
  | 'early_leave'
  | 'overtime'
  | 'leave'
  | 'kpi'
  | 'bonus'
  | 'penalty'
  | 'payroll';

export interface ReportQueryOptions {
  type: ReportType;
  startDate?: string;
  endDate?: string;
  departmentId?: string;
  employeeId?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
  type?: 'text' | 'number' | 'currency' | 'date' | 'time' | 'badge';
  align?: 'left' | 'center' | 'right';
}

export interface ReportSummaryItem {
  label: string;
  value: string | number;
  type?: 'text' | 'number' | 'currency';
}

export interface ReportResult {
  type: ReportType;
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: Record<string, any>[];
  summaries: ReportSummaryItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    timestamp: string;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Safe Data Extractors
// ──────────────────────────────────────────────────────────────────────────────
function safeDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val);
}

function safeTimeStr(val: any): string {
  if (!val) return '—';
  if (val instanceof Date) {
    return val.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return val;
  }
  return '—';
}

function safeEmployeeName(emp: any): string {
  if (!emp) return '—';
  if (emp.fullName) return emp.fullName;
  const combined = `${emp.lastName || ''} ${emp.firstName || ''}`.trim();
  return combined || '—';
}

export class ReportService {
  /**
   * Applies RBAC scoping to employee filtering
   */
  private static applyRbacScope(
    session: UserSession,
    requestedEmployeeId?: string,
    requestedDepartmentId?: string
  ): { targetEmployeeId?: string; targetDepartmentId?: string } {
    const isAdminOrHr = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    if (isAdminOrHr) {
      return {
        targetEmployeeId: requestedEmployeeId,
        targetDepartmentId: requestedDepartmentId,
      };
    }

    if (isManager) {
      return {
        targetEmployeeId: requestedEmployeeId,
        targetDepartmentId: session.departmentId || requestedDepartmentId,
      };
    }

    // Regular Employee: only allowed to view self
    return {
      targetEmployeeId: session.employeeId,
      targetDepartmentId: undefined,
    };
  }

  /**
   * Main query dispatcher
   */
  static async getReport(options: ReportQueryOptions, session: UserSession): Promise<ReportResult> {
    const page = Math.max(1, options.page || 1);
    // [PHASE 25] Bound report limit strictly to 5,000 max to guarantee memory stability
    const limit = Math.max(1, Math.min(5000, options.limit || 20));
    const skip = (page - 1) * limit;

    const { targetEmployeeId, targetDepartmentId } = this.applyRbacScope(
      session,
      options.employeeId,
      options.departmentId
    );

    // PHASE 5: Tenant scope — never trust client; derive from JWT session
    const orgId = session.organizationId ?? '__no_org__';

    const now = new Date();
    const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const defaultEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const startDate = options.startDate ? new Date(options.startDate) : defaultStart;
    const endDate = options.endDate ? new Date(options.endDate) : defaultEnd;

    switch (options.type) {
      case 'attendance':
        return this.queryAttendanceReport(startDate, endDate, targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'late':
        return this.queryLateReport(startDate, endDate, targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'early_leave':
        return this.queryEarlyLeaveReport(startDate, endDate, targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'overtime':
        return this.queryOvertimeReport(startDate, endDate, targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'leave':
        return this.queryLeaveReport(startDate, endDate, targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'kpi':
        return this.queryKpiReport(targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'bonus':
        return this.queryBonusReport(startDate, endDate, targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'penalty':
        return this.queryPenaltyReport(startDate, endDate, targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      case 'payroll':
        return this.queryPayrollReport(targetDepartmentId, targetEmployeeId, options, skip, limit, page, orgId);
      default:
        throw ApiError.badRequest(`Loại báo cáo không hợp lệ: ${(options as any).type}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1. ATTENDANCE REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryAttendanceReport(
    startDate: Date,
    endDate: Date,
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      workDate: { gte: startDate, lte: endDate },
      // PHASE 5: Tenant isolation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) {
      whereClause.employee = { organizationId, departmentId };
    }
    if (options.status) {
      whereClause.status = options.status;
    }
    if (options.search) {
      whereClause.OR = [
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.attendance.count({ where: whereClause }),
      prisma.attendance.findMany({
        where: whereClause,
        include: {
          employee: {
            include: {
              department: { select: { name: true, code: true } },
              position: { select: { title: true } },
            },
          },
        },
        orderBy: options.sortBy
          ? { [options.sortBy]: options.sortOrder || 'desc' }
          : { workDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attendance.aggregate({
        where: whereClause,
        _sum: { actualWorkHours: true, otHours: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'workDate', header: 'Ngày Làm', width: 14, type: 'date', align: 'center' },
      { key: 'checkInTime', header: 'Giờ Vào', width: 12, type: 'time', align: 'center' },
      { key: 'checkOutTime', header: 'Giờ Ra', width: 12, type: 'time', align: 'center' },
      { key: 'checkInMethod', header: 'Phương Thức', width: 14, type: 'badge', align: 'center' },
      { key: 'workHours', header: 'Giờ Làm (h)', width: 14, type: 'number', align: 'right' },
      { key: 'actualWorkHours', header: 'Giờ Chuẩn (h)', width: 14, type: 'number', align: 'right' },
      { key: 'otHours', header: 'Tăng Ca (h)', width: 14, type: 'number', align: 'right' },
      { key: 'status', header: 'Trạng Thái', width: 16, type: 'badge', align: 'center' },
    ];

    const rows = records.map((r: any) => {
      const workHours = Number(r.workHours ?? r.actualWorkHours ?? 0);
      const actualWorkHours = Number(r.actualWorkHours ?? r.workHours ?? 0);
      const otHours = Number(r.otHours ?? r.overtimeHours ?? 0);
      const overtimeHours = Number(r.overtimeHours ?? r.otHours ?? 0);

      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        workDate: safeDateStr(r.workDate || r.date),
        date: safeDateStr(r.date || r.workDate),
        checkInTime: safeTimeStr(r.checkInTime || r.checkIn),
        checkOutTime: safeTimeStr(r.checkOutTime || r.checkOut),
        checkInMethod: r.checkInMethod || 'WEB',
        workHours,
        actualWorkHours,
        otHours,
        overtimeHours,
        lateMinutes: Number(r.lateMinutes || 0),
        earlyLeaveMinutes: Number(r.earlyLeaveMinutes ?? r.earlyMinutes ?? 0),
        earlyMinutes: Number(r.earlyMinutes ?? r.earlyLeaveMinutes ?? 0),
        status: r.status,
      };
    });

    const agg = aggregate as any;
    const sumWork = Number(agg?._sum?.workHours ?? agg?._sum?.actualWorkHours ?? 0);
    const sumOt = Number(agg?._sum?.overtimeHours ?? agg?._sum?.otHours ?? 0);
    const totalCount = agg?._count?.id ?? total;

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng lượt điểm danh', value: totalCount, type: 'number' },
      { label: 'Tổng giờ làm', value: Math.round(sumWork * 10) / 10, type: 'number' },
      { label: 'Tổng giờ tăng ca (OT)', value: Math.round(sumOt * 10) / 10, type: 'number' },
    ];

    return {
      type: 'attendance',
      title: 'Báo Cáo Điểm Danh Toàn Diện',
      description: 'Thống kê chi tiết giờ vào, giờ ra, số giờ làm và phương thức check-in của nhân viên.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. LATE REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryLateReport(
    startDate: Date,
    endDate: Date,
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      workDate: { gte: startDate, lte: endDate },
      lateMinutes: { gt: 0 },
      // PHASE 5: Tenant isolation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { departmentId };
    if (options.search) {
      whereClause.OR = [
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.attendance.count({ where: whereClause }),
      prisma.attendance.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
        },
        orderBy: { workDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attendance.aggregate({
        where: whereClause,
        _sum: { lateMinutes: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'workDate', header: 'Ngày Vi Phạm', width: 14, type: 'date', align: 'center' },
      { key: 'checkInTime', header: 'Giờ Check-in', width: 14, type: 'time', align: 'center' },
      { key: 'lateMinutes', header: 'Số Phút Muộn', width: 14, type: 'number', align: 'right' },
      { key: 'notes', header: 'Ghi Chú / Giải Trình', width: 28, type: 'text', align: 'left' },
    ];

    const rows = records.map((r: any) => ({
      id: r.id,
      employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
      fullName: safeEmployeeName(r.employee),
      employeeName: safeEmployeeName(r.employee),
      departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
      department: r.employee?.department?.name || r.department?.name || r.department || '—',
      workDate: safeDateStr(r.workDate || r.date),
      date: safeDateStr(r.date || r.workDate),
      checkInTime: safeTimeStr(r.checkInTime || r.checkIn),
      lateMinutes: Number(r.lateMinutes || 0),
      notes: r.notes || 'Không có giải trình',
    }));

    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const totalLate = Number(agg?._sum?.lateMinutes || 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng số lượt đi muộn', value: totalCount, type: 'number' },
      { label: 'Tổng số phút muộn', value: totalLate, type: 'number' },
      { label: 'Trung bình phút/lượt', value: totalCount > 0 ? Math.round(totalLate / totalCount) : 0, type: 'number' },
    ];

    return {
      type: 'late',
      title: 'Báo Cáo Đi Muộn (Lateness Report)',
      description: 'Tổng hợp danh sách nhân viên vi phạm quy định giờ vào ca và số phút muộn.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 3. EARLY LEAVE REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryEarlyLeaveReport(
    startDate: Date,
    endDate: Date,
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      workDate: { gte: startDate, lte: endDate },
      earlyMinutes: { gt: 0 },
      // PHASE 5: Tenant isolation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { departmentId };
    if (options.search) {
      whereClause.OR = [
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.attendance.count({ where: whereClause }),
      prisma.attendance.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
        },
        orderBy: { workDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attendance.aggregate({
        where: whereClause,
        _sum: { earlyMinutes: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'workDate', header: 'Ngày Làm', width: 14, type: 'date', align: 'center' },
      { key: 'checkOutTime', header: 'Giờ Check-out', width: 14, type: 'time', align: 'center' },
      { key: 'earlyLeaveMinutes', header: 'Số Phút Về Sớm', width: 14, type: 'number', align: 'right' },
      { key: 'notes', header: 'Ghi Chú', width: 28, type: 'text', align: 'left' },
    ];

    const rows = records.map((r: any) => {
      const earlyLeaveMinutes = Number(r.earlyLeaveMinutes ?? r.earlyMinutes ?? 0);
      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        workDate: safeDateStr(r.workDate || r.date),
        date: safeDateStr(r.date || r.workDate),
        checkOutTime: safeTimeStr(r.checkOutTime || r.checkOut),
        earlyLeaveMinutes,
        earlyMinutes: earlyLeaveMinutes,
        notes: r.notes || '—',
      };
    });

    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const totalEarly = Number(agg?._sum?.earlyLeaveMinutes ?? agg?._sum?.earlyMinutes ?? 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng số lượt về sớm', value: totalCount, type: 'number' },
      { label: 'Tổng phút về sớm', value: totalEarly, type: 'number' },
    ];

    return {
      type: 'early_leave',
      title: 'Báo Cáo Về Sớm (Early Leave Report)',
      description: 'Tổng hợp các trường hợp rời nơi làm việc trước thời gian kết thúc ca quy định.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 4. OVERTIME REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryOvertimeReport(
    startDate: Date,
    endDate: Date,
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      workDate: { gte: startDate, lte: endDate },
      otHours: { gt: 0 },
      // PHASE 5: Tenant isolation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { departmentId };
    if (options.search) {
      whereClause.OR = [
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.attendance.count({ where: whereClause }),
      prisma.attendance.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
        },
        orderBy: { workDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attendance.aggregate({
        where: whereClause,
        _sum: { otHours: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'workDate', header: 'Ngày Tăng Ca', width: 14, type: 'date', align: 'center' },
      { key: 'actualWorkHours', header: 'Giờ Làm Chuẩn', width: 14, type: 'number', align: 'right' },
      { key: 'overtimeHours', header: 'Giờ OT', width: 14, type: 'number', align: 'right' },
      { key: 'estimatedOtPay', header: 'Tiền OT Ước Tính', width: 18, type: 'currency', align: 'right' },
    ];

    const rows = records.map((r: any) => {
      const hourlyRate = Number(r.employee?.hourlyRate || 0);
      const overtimeHours = Number(r.overtimeHours ?? r.otHours ?? 0);
      const estimatedOtPay = Math.round(overtimeHours * (hourlyRate || 50000) * 1.5);

      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        workDate: safeDateStr(r.workDate || r.date),
        date: safeDateStr(r.date || r.workDate),
        actualWorkHours: Number(r.actualWorkHours ?? r.workHours ?? 0),
        workHours: Number(r.workHours ?? r.actualWorkHours ?? 0),
        otHours: overtimeHours,
        overtimeHours,
        estimatedOtPay,
      };
    });

    const totalEstimatedPay = rows.reduce((sum, r) => sum + r.estimatedOtPay, 0);
    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const totalOtHours = Number(agg?._sum?.overtimeHours ?? agg?._sum?.otHours ?? 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng số ca tăng ca', value: totalCount, type: 'number' },
      { label: 'Tổng số giờ OT', value: Math.round(totalOtHours * 10) / 10, type: 'number' },
      { label: 'Tổng chi phí OT dự kiến', value: totalEstimatedPay, type: 'currency' },
    ];

    return {
      type: 'overtime',
      title: 'Báo Cáo Tăng Ca (Overtime Report)',
      description: 'Tổng hợp số giờ làm thêm ngoài giờ và chi phí phụ cấp lương tăng ca theo luật.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. LEAVE REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryLeaveReport(
    startDate: Date,
    endDate: Date,
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      // PHASE 5: Tenant isolation
      employee: { is: { organizationId } },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { departmentId };
    if (options.status) whereClause.status = options.status;
    if (options.search) {
      whereClause.OR = [
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.leaveRequest.count({ where: whereClause }),
      prisma.leaveRequest.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
          leaveType: { select: { name: true } },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.leaveRequest.aggregate({
        where: whereClause,
        _sum: { durationDays: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'leaveType', header: 'Loại Nghỉ Phép', width: 18, type: 'text', align: 'left' },
      { key: 'startDate', header: 'Từ Ngày', width: 14, type: 'date', align: 'center' },
      { key: 'endDate', header: 'Đến Ngày', width: 14, type: 'date', align: 'center' },
      { key: 'totalDays', header: 'Số Ngày', width: 12, type: 'number', align: 'right' },
      { key: 'reason', header: 'Lý Do', width: 26, type: 'text', align: 'left' },
      { key: 'approverName', header: 'Người Duyệt', width: 20, type: 'text', align: 'left' },
      { key: 'status', header: 'Trạng Thái', width: 16, type: 'badge', align: 'center' },
    ];

    const rows = records.map((r: any) => {
      const typeStr = typeof r.leaveType === 'string' ? r.leaveType : (r.leaveType?.name || 'ANNUAL');
      const days = Number(r.totalDays ?? r.durationDays ?? 1);
      const appName = r.approver
        ? (r.approver.fullName || `${r.approver.lastName || ''} ${r.approver.firstName || ''}`.trim() || '—')
        : '—';

      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        leaveType: typeStr,
        leaveTypeName: typeStr,
        startDate: safeDateStr(r.startDate),
        endDate: safeDateStr(r.endDate),
        totalDays: days,
        durationDays: days,
        reason: r.reason || '—',
        approverName: appName,
        status: r.status,
      };
    });

    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const totalDays = Number(agg?._sum?.totalDays ?? agg?._sum?.durationDays ?? 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng số đơn phép', value: totalCount, type: 'number' },
      { label: 'Tổng ngày nghỉ', value: totalDays, type: 'number' },
    ];

    return {
      type: 'leave',
      title: 'Báo Cáo Nghỉ Phép & Ngoại Lệ',
      description: 'Tổng hợp tình hình nghỉ phép năm, nghỉ ốm, việc riêng và trạng thái xét duyệt.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 6. KPI REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryKpiReport(
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      // PHASE 5: Tenant isolation via employee relation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { organizationId, departmentId };
    if (options.status) whereClause.status = options.status;
    if (options.search) {
      whereClause.OR = [
        { kpi: { title: { contains: options.search, mode: 'insensitive' } } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.employeeKpiResult.count({ where: whereClause }),
      prisma.employeeKpiResult.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
          kpi: true,
        },
        orderBy: { period: 'desc' },
        skip,
        take: limit,
      }),
      prisma.employeeKpiResult.aggregate({
        where: whereClause,
        _avg: { completionRate: true, score: true },
        _sum: { bonusAmount: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'kpiTitle', header: 'Tiêu Chí KPI', width: 28, type: 'text', align: 'left' },
      { key: 'period', header: 'Kỳ Đánh Giá', width: 14, type: 'text', align: 'center' },
      { key: 'finalScore', header: 'Điểm Số', width: 12, type: 'number', align: 'right' },
      { key: 'grade', header: 'Xếp Loại', width: 14, type: 'badge', align: 'center' },
      { key: 'completionRate', header: '% Hoàn Thành', width: 16, type: 'number', align: 'right' },
      { key: 'bonusAmount', header: 'Thưởng KPI', width: 18, type: 'currency', align: 'right' },
      { key: 'status', header: 'Trạng Thái', width: 16, type: 'badge', align: 'center' },
    ];

    const rows = records.map((r: any) => {
      const finalScore = Number(r.finalScore ?? r.score ?? 0);
      const periodStr = typeof r.period === 'object' ? (r.period?.name || '—') : (r.period || '—');
      const titleStr = r.template?.title || r.kpi?.title || 'KPI';

      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        kpiTitle: titleStr,
        period: periodStr,
        targetValue: Number(r.targetValue || r.kpi?.targetValue || 0),
        actualValue: Number(r.actualValue || 0),
        completionRate: Number(r.completionRate || 0),
        finalScore,
        score: finalScore,
        grade: r.grade || '—',
        bonusAmount: Number(r.bonusAmount || 0),
        status: r.status || 'EVALUATED',
      };
    });

    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const avgScore = Number(agg?._avg?.finalScore ?? agg?._avg?.score ?? 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng bản đánh giá', value: totalCount, type: 'number' },
      { label: 'Điểm KPI trung bình', value: Math.round(avgScore * 10) / 10, type: 'number' },
      { label: '% Hoàn thành TB', value: Math.round(Number(agg?._avg?.completionRate || 0)), type: 'number' },
      { label: 'Tổng thưởng KPI', value: Number(agg?._sum?.bonusAmount || 0), type: 'currency' },
    ];

    return {
      type: 'kpi',
      title: 'Báo Cáo Hiệu Suất & KPI',
      description: 'Tổng hợp kết quả đánh giá KPI, mức độ hoàn thành chỉ tiêu và quỹ thưởng KPI.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 7. BONUS REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryBonusReport(
    startDate: Date,
    endDate: Date,
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      type: 'BONUS',
      effectiveDate: { gte: startDate, lte: endDate },
      // PHASE 5: Tenant isolation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { departmentId };
    if (options.status) whereClause.status = options.status;
    if (options.search) {
      whereClause.OR = [
        { reason: { contains: options.search, mode: 'insensitive' } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.employeeBonusPenalty.count({ where: whereClause }),
      prisma.employeeBonusPenalty.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { effectiveDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.employeeBonusPenalty.aggregate({
        where: whereClause,
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'category', header: 'Danh Mục', width: 16, type: 'text', align: 'center' },
      { key: 'effectiveDate', header: 'Ngày Hiệu Lực', width: 14, type: 'date', align: 'center' },
      { key: 'amount', header: 'Số Tiền Thưởng', width: 18, type: 'currency', align: 'right' },
      { key: 'reason', header: 'Lý Do Khen Thưởng', width: 30, type: 'text', align: 'left' },
      { key: 'approverName', header: 'Người Phê Duyệt', width: 20, type: 'text', align: 'left' },
      { key: 'status', header: 'Trạng Thái', width: 16, type: 'badge', align: 'center' },
    ];

    const rows = records.map((r: any) => {
      const appName = r.approver
        ? (r.approver.fullName || `${r.approver.lastName || ''} ${r.approver.firstName || ''}`.trim() || '—')
        : '—';

      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        category: r.category || r.policy?.name || 'Thưởng',
        effectiveDate: safeDateStr(r.effectiveDate),
        amount: Number(r.amount || 0),
        reason: r.reason || '—',
        approverName: appName,
        status: r.status,
      };
    });

    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const totalAmount = Number(agg?._sum?.amount || 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng lượt khen thưởng', value: totalCount, type: 'number' },
      { label: 'Tổng tiền thưởng', value: totalAmount, type: 'currency' },
    ];

    return {
      type: 'bonus',
      title: 'Báo Cáo Khen Thưởng (Bonus Report)',
      description: 'Tổng hợp danh sách các khoản khen thưởng dự án, thành tích và quyết định phê duyệt.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 8. PENALTY REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryPenaltyReport(
    startDate: Date,
    endDate: Date,
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      type: 'PENALTY',
      effectiveDate: { gte: startDate, lte: endDate },
      // PHASE 5: Tenant isolation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { departmentId };
    if (options.status) whereClause.status = options.status;
    if (options.search) {
      whereClause.OR = [
        { reason: { contains: options.search, mode: 'insensitive' } },
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.employeeBonusPenalty.count({ where: whereClause }),
      prisma.employeeBonusPenalty.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
          approver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { effectiveDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.employeeBonusPenalty.aggregate({
        where: whereClause,
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'category', header: 'Danh Mục', width: 16, type: 'text', align: 'center' },
      { key: 'effectiveDate', header: 'Ngày Hiệu Lực', width: 14, type: 'date', align: 'center' },
      { key: 'amount', header: 'Số Tiền Phạt', width: 18, type: 'currency', align: 'right' },
      { key: 'reason', header: 'Lý Do Xử Lý', width: 30, type: 'text', align: 'left' },
      { key: 'approverName', header: 'Người Xử Lý', width: 20, type: 'text', align: 'left' },
      { key: 'status', header: 'Trạng Thái', width: 16, type: 'badge', align: 'center' },
    ];

    const rows = records.map((r: any) => {
      const appName = r.approver
        ? (r.approver.fullName || `${r.approver.lastName || ''} ${r.approver.firstName || ''}`.trim() || '—')
        : '—';

      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        category: r.category || r.policy?.name || 'Kỷ luật/Phạt',
        effectiveDate: safeDateStr(r.effectiveDate),
        amount: Number(r.amount || 0),
        reason: r.reason || '—',
        approverName: appName,
        status: r.status,
      };
    });

    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const totalAmount = Number(agg?._sum?.amount || 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng lượt kỷ luật/phạt', value: totalCount, type: 'number' },
      { label: 'Tổng tiền phạt', value: totalAmount, type: 'currency' },
    ];

    return {
      type: 'penalty',
      title: 'Báo Cáo Kỷ Luật & Phạt (Penalty Report)',
      description: 'Tổng hợp các quyết định kỷ luật, phạt vi phạm nội quy và khấu trừ tài chính.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 9. PAYROLL REPORT
  // ────────────────────────────────────────────────────────────────────────────
  private static async queryPayrollReport(
    departmentId: string | undefined,
    employeeId: string | undefined,
    options: ReportQueryOptions,
    skip: number,
    limit: number,
    page: number,
    organizationId: string // PHASE 5
  ): Promise<ReportResult> {
    const whereClause: any = {
      // PHASE 5: Tenant isolation via employee relation
      employee: { organizationId },
    };

    if (employeeId) whereClause.employeeId = employeeId;
    if (departmentId) whereClause.employee = { organizationId, departmentId };
    if (options.status) whereClause.paymentStatus = options.status;
    if (options.search) {
      whereClause.OR = [
        { employee: { firstName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: options.search, mode: 'insensitive' } } },
        { employee: { employeeCode: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [total, records, aggregate] = await Promise.all([
      prisma.payroll.count({ where: whereClause }),
      prisma.payroll.findMany({
        where: whereClause,
        include: {
          employee: {
            include: { department: { select: { name: true } } },
          },
          period: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payroll.aggregate({
        where: whereClause,
        _sum: { grossIncome: true, netSalary: true, pitTax: true },
        _count: { id: true },
      }),
    ]);

    const columns: ReportColumn[] = [
      { key: 'employeeCode', header: 'Mã NV', width: 14, type: 'text', align: 'left' },
      { key: 'fullName', header: 'Họ và Tên', width: 24, type: 'text', align: 'left' },
      { key: 'departmentName', header: 'Phòng Ban', width: 20, type: 'text', align: 'left' },
      { key: 'periodName', header: 'Kỳ Lương', width: 22, type: 'text', align: 'left' },
      { key: 'contractSalary', header: 'Lương HĐ', width: 18, type: 'currency', align: 'right' },
      { key: 'actualWorkDays', header: 'Ngày Công', width: 12, type: 'number', align: 'right' },
      { key: 'grossSalary', header: 'Thu Nhập Gross', width: 18, type: 'currency', align: 'right' },
      { key: 'insurance', header: 'Bảo Hiểm', width: 16, type: 'currency', align: 'right' },
      { key: 'tax', header: 'Thuế TNCN', width: 16, type: 'currency', align: 'right' },
      { key: 'netSalary', header: 'Thực Nhận (Net)', width: 18, type: 'currency', align: 'right' },
      { key: 'paymentStatus', header: 'Trạng Thái', width: 16, type: 'badge', align: 'center' },
    ];

    const rows = records.map((r: any) => {
      const grossSalary = Number(r.grossSalary ?? r.grossIncome ?? 0);
      const netSalary = Number(r.netSalary || 0);
      const tax = Number(r.tax ?? r.pitTax ?? 0);
      const totalInsurance = Number(
        r.totalInsurance ??
        (Number(r.socialInsurance || 0) + Number(r.healthInsurance || 0) + Number(r.unemploymentInsurance || 0))
      );
      const periodName = typeof r.period === 'object' ? (r.period?.name || r.period?.code || '—') : (r.period || '—');

      return {
        id: r.id,
        employeeCode: r.employee?.employeeCode || r.employeeCode || '—',
        fullName: safeEmployeeName(r.employee),
        employeeName: safeEmployeeName(r.employee),
        departmentName: r.employee?.department?.name || r.department?.name || r.department || '—',
        department: r.employee?.department?.name || r.department?.name || r.department || '—',
        periodName,
        contractSalary: Number(r.contractSalary || 0),
        actualWorkDays: Number(r.actualWorkDays || 0),
        grossSalary,
        grossIncome: grossSalary,
        insurance: totalInsurance,
        tax,
        pitTax: tax,
        netSalary,
        status: r.status || r.paymentStatus || 'PAID',
        paymentStatus: r.paymentStatus || r.status || 'PAID',
      };
    });

    const agg = aggregate as any;
    const totalCount = agg?._count?.id ?? total;
    const sumGross = Number(agg?._sum?.grossSalary ?? agg?._sum?.grossIncome ?? 0);
    const sumNet = Number(agg?._sum?.netSalary || 0);
    const sumTax = Number(agg?._sum?.tax ?? agg?._sum?.pitTax ?? 0);

    const summaries: ReportSummaryItem[] = [
      { label: 'Tổng số bảng lương', value: totalCount, type: 'number' },
      { label: 'Tổng quỹ lương Gross', value: sumGross, type: 'currency' },
      { label: 'Tổng thực nhận', value: sumNet, type: 'currency' },
      { label: 'Tổng chi trả Net', value: sumNet, type: 'currency' },
      { label: 'Tổng thuế TNCN', value: sumTax, type: 'currency' },
    ];

    return {
      type: 'payroll',
      title: 'Báo Cáo Bảng Lương Tổng Hợp',
      description: 'Tổng hợp chi tiết thu nhập, thuế TNCN, bảo hiểm và lương thực nhận của người lao động.',
      columns,
      rows,
      summaries,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        timestamp: new Date().toISOString(),
      },
    };
  }
}
