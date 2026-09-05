import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  CheckInInput,
  CheckOutInput,
  ManualAttendanceLogInput,
  AttendanceQueryParams,
} from '@/lib/validations/attendance';
import { Prisma } from '@prisma/client';

export interface ShiftTimeWindow {
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  breakMinutes: number;
  gracePeriodLate: number;
  gracePeriodEarly: number;
  isOvernight: boolean;
  standardWorkHours: number;
  shiftType?: string;
}

export interface AttendanceMetrics {
  totalSpanMinutes: number;
  workingMinutes: number;
  actualWorkHours: number;
  lateMinutes: number;
  earlyMinutes: number;
  otHours: number;
  status: 'ON_TIME' | 'LATE' | 'EARLY_LEAVE' | 'LATE_AND_EARLY' | 'OVERTIME' | 'IN_PROGRESS';
}

export class AttendanceService {
  /**
   * Pure calculation function for working hours, late minutes, early minutes and overtime.
   */
  static calculateAttendanceMetrics(
    checkIn: Date,
    checkOut: Date,
    shift: ShiftTimeWindow
  ): AttendanceMetrics {
    if (checkOut.getTime() <= checkIn.getTime()) {
      throw ApiError.badRequest('Thời gian check-out phải lớn hơn thời gian check-in.');
    }

    // 1. Total span between check-in and check-out
    const totalSpanMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / (1000 * 60));

    // 2. Deduct break
    const workingMinutes = Math.max(0, totalSpanMinutes - (shift.breakMinutes || 0));
    const actualWorkHours = Math.round((workingMinutes / 60) * 100) / 100;

    // Helper: Parse "HH:mm" to minutes from midnight
    const parseTime = (t: string) => {
      const parts = t.split(':').map((p) => parseInt(p, 10));
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const shiftStartMin = parseTime(shift.startTime);
    const shiftEndMin = parseTime(shift.endTime);

    // 3. Late minutes calculation
    const checkInMin = checkIn.getHours() * 60 + checkIn.getMinutes();
    const lateThreshold = shiftStartMin + (shift.gracePeriodLate || 0);
    let lateMinutes = 0;
    if (checkInMin > lateThreshold) {
      lateMinutes = checkInMin - shiftStartMin;
    }

    // 4. Early minutes calculation
    let earlyMinutes = 0;
    if (shift.isOvernight) {
      // Overnight: shift ends next calendar day
      const checkOutMin = checkOut.getHours() * 60 + checkOut.getMinutes();
      const earlyThreshold = shiftEndMin - (shift.gracePeriodEarly || 0);
      if (checkOutMin < earlyThreshold) {
        earlyMinutes = shiftEndMin - checkOutMin;
      }
    } else {
      // Standard daytime shift
      const checkOutMin = checkOut.getHours() * 60 + checkOut.getMinutes();
      const earlyThreshold = shiftEndMin - (shift.gracePeriodEarly || 0);
      if (checkOutMin < earlyThreshold) {
        earlyMinutes = shiftEndMin - checkOutMin;
      }
    }

    // 5. Overtime calculation
    const standardHours = shift.standardWorkHours || 8.0;
    let otHours = 0;
    if (actualWorkHours > standardHours) {
      otHours = Math.round((actualWorkHours - standardHours) * 100) / 100;
    }

    // 6. Daily status determination
    let status: AttendanceMetrics['status'] = 'ON_TIME';
    if (otHours > 0) {
      status = 'OVERTIME';
    } else if (lateMinutes > 0 && earlyMinutes > 0) {
      status = 'LATE_AND_EARLY';
    } else if (lateMinutes > 0) {
      status = 'LATE';
    } else if (earlyMinutes > 0) {
      status = 'EARLY_LEAVE';
    } else {
      status = 'ON_TIME';
    }

    return {
      totalSpanMinutes,
      workingMinutes,
      actualWorkHours,
      lateMinutes,
      earlyMinutes,
      otHours,
      status,
    };
  }

  /**
   * Resolve target employee ID based on session and optional input.
   */
  private static async resolveEmployeeId(session: UserSession, explicitEmpId?: string): Promise<string> {
    const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');
    if (explicitEmpId && isPrivileged) {
      const emp = await prisma.employee.findUnique({
        where: { id: explicitEmpId },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!emp || emp.deletedAt || emp.status === 'TERMINATED') {
        throw ApiError.badRequest('Nhân viên không tồn tại hoặc đã nghỉ việc.');
      }
      return emp.id;
    }

    // Default: current user's employee record
    const emp = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!emp || emp.deletedAt) {
      throw ApiError.notFound('Hồ sơ nhân viên của bạn không tồn tại trong hệ thống.');
    }
    if (emp.status === 'TERMINATED') {
      throw ApiError.forbidden('Tài khoản nhân viên của bạn đã bị ngưng hoạt động.');
    }
    return emp.id;
  }

  /**
   * Find or resolve assigned shift for an employee on a given date.
   */
  static async resolveShiftForDate(employeeId: string, workDate: Date): Promise<{
    shift: ShiftTimeWindow;
    scheduleId?: string;
  }> {
    // 1. Direct EmployeeSchedule for this date
    const schedule = await prisma.employeeSchedule.findUnique({
      where: { employeeId_workDate: { employeeId, workDate } },
      include: { shift: true },
    });

    if (schedule && schedule.shift && schedule.shift.isActive && !schedule.shift.deletedAt) {
      return {
        scheduleId: schedule.id,
        shift: {
          startTime: schedule.shift.startTime,
          endTime: schedule.shift.endTime,
          breakMinutes: schedule.shift.breakMinutes,
          gracePeriodLate: schedule.shift.gracePeriodLate,
          gracePeriodEarly: schedule.shift.gracePeriodEarly,
          isOvernight: schedule.shift.isOvernight,
          standardWorkHours: Number(schedule.shift.standardWorkHours),
          shiftType: schedule.shift.shiftType,
        },
      };
    }

    // 2. Fallback: Recurring schedule pattern for this day of week
    const dayOfWeek = workDate.getDay();
    const recurring = await prisma.recurringSchedule.findFirst({
      where: {
        employeeId,
        dayOfWeek,
        isActive: true,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
      },
      include: { shift: true },
    });

    if (recurring && recurring.shift && recurring.shift.isActive && !recurring.shift.deletedAt) {
      // Auto-create EmployeeSchedule row to link permanently
      const newSchedule = await prisma.employeeSchedule.create({
        data: {
          employeeId,
          shiftId: recurring.shift.id,
          workDate,
          status: 'SCHEDULED',
        },
      });

      return {
        scheduleId: newSchedule.id,
        shift: {
          startTime: recurring.shift.startTime,
          endTime: recurring.shift.endTime,
          breakMinutes: recurring.shift.breakMinutes,
          gracePeriodLate: recurring.shift.gracePeriodLate,
          gracePeriodEarly: recurring.shift.gracePeriodEarly,
          isOvernight: recurring.shift.isOvernight,
          standardWorkHours: Number(recurring.shift.standardWorkHours),
          shiftType: recurring.shift.shiftType,
        },
      };
    }

    // 3. Fallback: First active default WorkShift in system
    const defaultShift = await prisma.workShift.findFirst({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultShift) {
      // Default fallback shift 08:30 - 17:30
      return {
        shift: {
          startTime: '08:30',
          endTime: '17:30',
          breakMinutes: 60,
          gracePeriodLate: 15,
          gracePeriodEarly: 15,
          isOvernight: false,
          standardWorkHours: 8.0,
        },
      };
    }

    // Auto-create schedule for default shift
    const fallbackSchedule = await prisma.employeeSchedule.create({
      data: {
        employeeId,
        shiftId: defaultShift.id,
        workDate,
        status: 'SCHEDULED',
      },
    });

    return {
      scheduleId: fallbackSchedule.id,
      shift: {
        startTime: defaultShift.startTime,
        endTime: defaultShift.endTime,
        breakMinutes: defaultShift.breakMinutes,
        gracePeriodLate: defaultShift.gracePeriodLate,
        gracePeriodEarly: defaultShift.gracePeriodEarly,
        isOvernight: defaultShift.isOvernight,
        standardWorkHours: Number(defaultShift.standardWorkHours),
        shiftType: defaultShift.shiftType,
      },
    };
  }

  /**
   * CHECK-IN
   */
  static async checkIn(input: CheckInInput, session: UserSession) {
    const employeeId = await this.resolveEmployeeId(session, input.employeeId);

    const now = new Date();
    const checkInTime = input.checkInTime ? new Date(input.checkInTime) : now;
    const workDateStr = input.workDate || checkInTime.toISOString().split('T')[0];
    const workDate = new Date(workDateStr);

    // Prevent invalid future timestamp (allow max 5 min clock drift)
    if (checkInTime.getTime() > now.getTime() + 5 * 60 * 1000) {
      throw ApiError.badRequest('Thời gian check-in không được ở tương lai.');
    }

    // 1. PREVENT DUPLICATE ATTENDANCE
    const existing = await prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId, workDate } },
    });

    if (existing) {
      throw ApiError.conflict(`Nhân viên đã thực hiện check-in cho ngày ${workDateStr} lúc ${existing.checkInTime?.toLocaleTimeString('vi-VN')}.`);
    }

    // 2. Resolve shift & schedule
    const { shift, scheduleId } = await this.resolveShiftForDate(employeeId, workDate);

    // 3. Compute late minutes at check-in
    const parseTime = (t: string) => {
      const parts = t.split(':').map((p) => parseInt(p, 10));
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };
    const shiftStartMin = parseTime(shift.startTime);
    const checkInMin = checkInTime.getHours() * 60 + checkInTime.getMinutes();
    const lateThreshold = shiftStartMin + (shift.gracePeriodLate || 0);

    let lateMinutes = 0;
    let initialStatus = 'IN_PROGRESS';
    if (checkInMin > lateThreshold) {
      lateMinutes = checkInMin - shiftStartMin;
      initialStatus = 'LATE';
    }

    // 4. Create attendance record
    const attendance = await prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          employeeId,
          scheduleId: scheduleId || null,
          workDate,
          checkInTime,
          checkInMethod: input.checkInMethod || 'WEB',
          checkInLat: input.checkInLat ? new Prisma.Decimal(input.checkInLat) : null,
          checkInLng: input.checkInLng ? new Prisma.Decimal(input.checkInLng) : null,
          lateMinutes,
          earlyMinutes: 0,
          actualWorkHours: new Prisma.Decimal(0),
          otHours: new Prisma.Decimal(0),
          status: initialStatus,
          notes: input.notes?.trim() || null,
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, firstName: true, lastName: true },
          },
          schedule: {
            include: { shift: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'ATTENDANCE_CHECK_IN',
          entity: 'attendance',
          entityId: created.id,
          newValues: {
            employeeId,
            workDate: workDateStr,
            checkInTime: checkInTime.toISOString(),
            method: input.checkInMethod,
            lateMinutes,
            status: initialStatus,
          },
        },
      });

      return created;
    });

    logger.info('Employee checked in', {
      attendanceId: attendance.id,
      employeeId,
      workDate: workDateStr,
      lateMinutes,
      actor: session.userId,
    });

    return {
      ...attendance,
      workDate: attendance.workDate.toISOString().split('T')[0],
      actualWorkHours: Number(attendance.actualWorkHours),
      otHours: Number(attendance.otHours),
    };
  }

  /**
   * CHECK-OUT
   */
  static async checkOut(input: CheckOutInput, session: UserSession) {
    const employeeId = await this.resolveEmployeeId(session, input.employeeId);

    const now = new Date();
    const checkOutTime = input.checkOutTime ? new Date(input.checkOutTime) : now;
    const workDateStr = input.workDate || checkOutTime.toISOString().split('T')[0];
    const workDate = new Date(workDateStr);

    // Prevent future check-out timestamp
    if (checkOutTime.getTime() > now.getTime() + 5 * 60 * 1000) {
      throw ApiError.badRequest('Thời gian check-out không được ở tương lai.');
    }

    // 1. Find existing check-in
    let attendance = null;
    if (input.attendanceId) {
      attendance = await prisma.attendance.findUnique({
        where: { id: input.attendanceId },
        include: {
          schedule: { include: { shift: true } },
          employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        },
      });
    } else {
      attendance = await prisma.attendance.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
        include: {
          schedule: { include: { shift: true } },
          employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        },
      });
    }

    // PREVENT CHECKOUT BEFORE CHECKIN
    if (!attendance || !attendance.checkInTime) {
      throw ApiError.badRequest(
        'Không tìm thấy bản ghi check-in cho ngày làm việc này. Bạn phải thực hiện Check-in trước khi Check-out.'
      );
    }

    // Prevent duplicate checkout
    if (attendance.checkOutTime) {
      throw ApiError.badRequest(
        `Bản ghi đã được check-out vào lúc ${attendance.checkOutTime.toLocaleTimeString('vi-VN')}.`
      );
    }

    // PREVENT INVALID TIMESTAMPS
    if (checkOutTime.getTime() <= attendance.checkInTime.getTime()) {
      throw ApiError.badRequest(
        `Thời gian check-out (${checkOutTime.toLocaleTimeString('vi-VN')}) phải diễn ra sau thời gian check-in (${attendance.checkInTime.toLocaleTimeString('vi-VN')}).`
      );
    }

    // 2. Resolve shift info
    const shiftData = attendance.schedule?.shift;
    const shift: ShiftTimeWindow = shiftData
      ? {
          startTime: shiftData.startTime,
          endTime: shiftData.endTime,
          breakMinutes: shiftData.breakMinutes,
          gracePeriodLate: shiftData.gracePeriodLate,
          gracePeriodEarly: shiftData.gracePeriodEarly,
          isOvernight: shiftData.isOvernight,
          standardWorkHours: Number(shiftData.standardWorkHours),
        }
      : {
          startTime: '08:30',
          endTime: '17:30',
          breakMinutes: 60,
          gracePeriodLate: 15,
          gracePeriodEarly: 15,
          isOvernight: false,
          standardWorkHours: 8.0,
        };

    // 3. Calculate metrics
    const metrics = this.calculateAttendanceMetrics(attendance.checkInTime, checkOutTime, shift);

    // 4. Update attendance and schedule in transaction
    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOutTime,
          checkOutMethod: input.checkOutMethod || 'WEB',
          checkOutLat: input.checkOutLat ? new Prisma.Decimal(input.checkOutLat) : null,
          checkOutLng: input.checkOutLng ? new Prisma.Decimal(input.checkOutLng) : null,
          earlyMinutes: metrics.earlyMinutes,
          actualWorkHours: new Prisma.Decimal(metrics.actualWorkHours),
          otHours: new Prisma.Decimal(metrics.otHours),
          status: metrics.status,
          notes: input.notes?.trim() || attendance.notes,
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, firstName: true, lastName: true },
          },
          schedule: {
            include: { shift: true },
          },
        },
      });

      if (attendance.scheduleId) {
        await tx.employeeSchedule.update({
          where: { id: attendance.scheduleId },
          data: { status: 'COMPLETED' },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'ATTENDANCE_CHECK_OUT',
          entity: 'attendance',
          entityId: attendance.id,
          newValues: {
            checkOutTime: checkOutTime.toISOString(),
            actualWorkHours: metrics.actualWorkHours,
            earlyMinutes: metrics.earlyMinutes,
            otHours: metrics.otHours,
            status: metrics.status,
          },
        },
      });

      return res;
    });

    logger.info('Employee checked out', {
      attendanceId: updated.id,
      employeeId,
      actualWorkHours: metrics.actualWorkHours,
      otHours: metrics.otHours,
      status: metrics.status,
      actor: session.userId,
    });

    return {
      ...updated,
      workDate: updated.workDate.toISOString().split('T')[0],
      actualWorkHours: Number(updated.actualWorkHours),
      otHours: Number(updated.otHours),
    };
  }

  /**
   * Get today's attendance status of current employee for live widget.
   */
  static async getTodayStatus(session: UserSession) {
    const employee = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });

    if (!employee) {
      throw ApiError.notFound('Hồ sơ nhân viên của bạn chưa được thiết lập.');
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const todayDate = new Date(todayStr);

    const attendance = await prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate: todayDate } },
      include: {
        schedule: { include: { shift: true } },
      },
    });

    // Also get today's scheduled shift info
    const { shift } = await this.resolveShiftForDate(employee.id, todayDate);

    return {
      todayDate: todayStr,
      employee,
      shift,
      hasCheckedIn: Boolean(attendance?.checkInTime),
      hasCheckedOut: Boolean(attendance?.checkOutTime),
      checkInTime: attendance?.checkInTime || null,
      checkOutTime: attendance?.checkOutTime || null,
      status: attendance?.status || 'SCHEDULED',
      lateMinutes: attendance?.lateMinutes || 0,
      earlyMinutes: attendance?.earlyMinutes || 0,
      actualWorkHours: attendance ? Number(attendance.actualWorkHours) : 0,
      otHours: attendance ? Number(attendance.otHours) : 0,
      notes: attendance?.notes || null,
      attendanceId: attendance?.id || null,
    };
  }

  /**
   * Query attendance history with filters and RBAC.
   */
  static async queryAttendance(params: AttendanceQueryParams, session: UserSession) {
    const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    let targetEmployeeId = params.employeeId;

    if (!isPrivileged && !isManager) {
      // Normal employee: only see own attendance
      const selfEmp = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (!selfEmp) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên.');
      targetEmployeeId = selfEmp.id;
    }

    const where: Prisma.AttendanceWhereInput = {};

    if (targetEmployeeId) {
      where.employeeId = targetEmployeeId;
    }

    if (params.departmentId) {
      where.employee = { departmentId: params.departmentId };
    }

    if (params.startDate || params.endDate) {
      where.workDate = {};
      if (params.startDate) where.workDate.gte = new Date(params.startDate);
      if (params.endDate) where.workDate.lte = new Date(params.endDate);
    }

    if (params.status && params.status !== 'ALL') {
      where.status = params.status;
    }

    const skip = (params.page - 1) * params.limit;

    const [total, records] = await Promise.all([
      prisma.attendance.count({ where }),
      prisma.attendance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              department: { select: { id: true, name: true, code: true } },
              position: { select: { id: true, title: true, code: true } },
            },
          },
          schedule: {
            include: { shift: true },
          },
        },
        orderBy: [{ workDate: 'desc' }, { checkInTime: 'desc' }],
        skip,
        take: params.limit,
      }),
    ]);

    return {
      records: records.map((r) => ({
        ...r,
        workDate: r.workDate.toISOString().split('T')[0],
        actualWorkHours: Number(r.actualWorkHours),
        otHours: Number(r.otHours),
        shift: r.schedule?.shift
          ? {
              ...r.schedule.shift,
              standardWorkHours: Number(r.schedule.shift.standardWorkHours),
            }
          : null,
      })),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  /**
   * Get single attendance record by ID.
   */
  static async getAttendanceById(id: string, session: UserSession) {
    const record = await prisma.attendance.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            department: { select: { id: true, name: true, code: true } },
            position: { select: { id: true, title: true, code: true } },
          },
        },
        schedule: {
          include: { shift: true },
        },
      },
    });

    if (!record) {
      throw ApiError.notFound(`Không tìm thấy bản ghi chấm công có ID: ${id}`);
    }

    // RBAC check: employee can only view their own
    const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');
    if (!isPrivileged && !isManager) {
      const selfEmp = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (!selfEmp || selfEmp.id !== record.employeeId) {
        throw ApiError.forbidden('Bạn chỉ có quyền xem bản ghi chấm công của chính mình.');
      }
    }

    return {
      ...record,
      workDate: record.workDate.toISOString().split('T')[0],
      actualWorkHours: Number(record.actualWorkHours),
      otHours: Number(record.otHours),
      shift: record.schedule?.shift
        ? {
            ...record.schedule.shift,
            standardWorkHours: Number(record.schedule.shift.standardWorkHours),
          }
        : null,
    };
  }

  /**
   * Manual Attendance Log (HR/Admin only) — for missing punches or historical recovery.
   */
  static async manualLogAttendance(input: ManualAttendanceLogInput, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền ghi nhận công thủ công.');
    }

    const employee = await prisma.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!employee || employee.deletedAt || employee.status === 'TERMINATED') {
      throw ApiError.badRequest('Nhân viên không tồn tại hoặc đã nghỉ việc.');
    }

    const workDate = new Date(input.workDate);

    // Format checkInTime and checkOutTime
    const inDate = new Date(
      input.checkInTime.includes('T') ? input.checkInTime : `${input.workDate}T${input.checkInTime}`
    );
    const outDate = new Date(
      input.checkOutTime.includes('T') ? input.checkOutTime : `${input.workDate}T${input.checkOutTime}`
    );

    if (outDate.getTime() <= inDate.getTime()) {
      throw ApiError.badRequest('Thời gian check-out phải diễn ra sau thời gian check-in.');
    }

    // Resolve shift
    let shiftData = null;
    let scheduleId = undefined;

    if (input.shiftId) {
      shiftData = await prisma.workShift.findUnique({ where: { id: input.shiftId } });
    }

    const resolved = await this.resolveShiftForDate(input.employeeId, workDate);
    const shift = shiftData
      ? {
          startTime: shiftData.startTime,
          endTime: shiftData.endTime,
          breakMinutes: shiftData.breakMinutes,
          gracePeriodLate: shiftData.gracePeriodLate,
          gracePeriodEarly: shiftData.gracePeriodEarly,
          isOvernight: shiftData.isOvernight,
          standardWorkHours: Number(shiftData.standardWorkHours),
        }
      : resolved.shift;

    scheduleId = resolved.scheduleId;

    // Calculate metrics
    const metrics = this.calculateAttendanceMetrics(inDate, outDate, shift);

    // Upsert attendance record
    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.attendance.upsert({
        where: { employeeId_workDate: { employeeId: input.employeeId, workDate } },
        create: {
          employeeId: input.employeeId,
          scheduleId: scheduleId || null,
          workDate,
          checkInTime: inDate,
          checkOutTime: outDate,
          checkInMethod: 'MANUAL',
          checkOutMethod: 'MANUAL',
          lateMinutes: metrics.lateMinutes,
          earlyMinutes: metrics.earlyMinutes,
          actualWorkHours: new Prisma.Decimal(metrics.actualWorkHours),
          otHours: new Prisma.Decimal(metrics.otHours),
          status: metrics.status,
          notes: input.notes?.trim() || 'Ghi nhận chấm công thủ công (HR)',
        },
        update: {
          checkInTime: inDate,
          checkOutTime: outDate,
          checkInMethod: 'MANUAL',
          checkOutMethod: 'MANUAL',
          lateMinutes: metrics.lateMinutes,
          earlyMinutes: metrics.earlyMinutes,
          actualWorkHours: new Prisma.Decimal(metrics.actualWorkHours),
          otHours: new Prisma.Decimal(metrics.otHours),
          status: metrics.status,
          notes: input.notes?.trim() || 'Cập nhật chấm công thủ công (HR)',
        },
        include: {
          employee: {
            select: { id: true, employeeCode: true, firstName: true, lastName: true },
          },
          schedule: { include: { shift: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'MANUAL_ATTENDANCE_LOG',
          entity: 'attendance',
          entityId: record.id,
          newValues: {
            employeeId: input.employeeId,
            workDate: input.workDate,
            actualWorkHours: metrics.actualWorkHours,
            status: metrics.status,
            actor: session.userId,
          },
        },
      });

      return record;
    });

    logger.info('Manual attendance logged by HR', {
      attendanceId: result.id,
      employeeId: input.employeeId,
      workDate: input.workDate,
      actor: session.userId,
    });

    return {
      ...result,
      workDate: result.workDate.toISOString().split('T')[0],
      actualWorkHours: Number(result.actualWorkHours),
      otHours: Number(result.otHours),
    };
  }
}
