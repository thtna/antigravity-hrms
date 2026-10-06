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
import {
  addBusinessDays,
  formatBusinessDate,
  formatBusinessTime,
  getBusinessDateString,
  getBusinessWeekday,
  hasExplicitUtcOffset,
  parseBusinessDate,
  parseBusinessLocalDateTime,
} from '@/lib/time/business-time';

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

export type TrustedAttendanceMethod = 'WEB' | 'QR' | 'GPS' | 'BIOMETRIC';

export class AttendanceService {
  /**
   * Pure calculation function for working hours, late minutes, early minutes and overtime.
   */
  static calculateAttendanceMetrics(
    checkIn: Date,
    checkOut: Date,
    shift: ShiftTimeWindow,
    workDateInput?: string | Date
  ): AttendanceMetrics {
    if (checkOut.getTime() <= checkIn.getTime()) {
      throw ApiError.badRequest('Thời gian check-out phải lớn hơn thời gian check-in.');
    }

    // 1. Total span between check-in and check-out
    const totalSpanMinutes = Math.floor((checkOut.getTime() - checkIn.getTime()) / (1000 * 60));

    // 2. Deduct break
    const workingMinutes = Math.max(0, totalSpanMinutes - (shift.breakMinutes || 0));
    const actualWorkHours = Math.round((workingMinutes / 60) * 100) / 100;

    const workDate = workDateInput
      ? typeof workDateInput === 'string'
        ? formatBusinessDate(parseBusinessDate(workDateInput))
        : formatBusinessDate(workDateInput)
      : getBusinessDateString(checkIn);
    const shiftStart = parseBusinessLocalDateTime(workDate, shift.startTime);
    const shiftEndDate = shift.isOvernight ? addBusinessDays(workDate, 1) : workDate;
    const shiftEnd = parseBusinessLocalDateTime(shiftEndDate, shift.endTime);

    // 3. Late minutes calculation
    const lateThreshold = shiftStart.getTime() + (shift.gracePeriodLate || 0) * 60 * 1000;
    let lateMinutes = 0;
    if (checkIn.getTime() > lateThreshold) {
      lateMinutes = Math.floor((checkIn.getTime() - shiftStart.getTime()) / (60 * 1000));
    }

    // 4. Early minutes calculation
    let earlyMinutes = 0;
    const earlyThreshold = shiftEnd.getTime() - (shift.gracePeriodEarly || 0) * 60 * 1000;
    if (checkOut.getTime() < earlyThreshold) {
      earlyMinutes = Math.floor((shiftEnd.getTime() - checkOut.getTime()) / (60 * 1000));
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
  private static async resolveEmployeeId(
    session: UserSession,
    explicitEmpId: string | undefined,
    db: Prisma.TransactionClient
  ): Promise<string> {
    const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');
    if (explicitEmpId && isPrivileged) {
      const emp = await db.employee.findUnique({
        where: { id: explicitEmpId },
        select: { id: true, status: true, deletedAt: true, organizationId: true },
      });
      if (!emp || emp.deletedAt || emp.status === 'TERMINATED' || !session.organizationId || emp.organizationId !== session.organizationId) {
        throw ApiError.badRequest('Nhân viên không tồn tại hoặc đã nghỉ việc.');
      }
      return emp.id;
    }

    // Default: current user's employee record
    const emp = await db.employee.findUnique({
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

  private static parseClockMinutes(value: string): number {
    const [hourText, minuteText] = value.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw ApiError.badRequest('Gio cham cong khong hop le.');
    }
    return hour * 60 + minute;
  }

  static parseAttendanceDateTime(
    value: string,
    workDateInput: string | Date,
    shift: Pick<ShiftTimeWindow, 'startTime' | 'isOvernight'>,
    kind: 'CHECK_IN' | 'CHECK_OUT'
  ): Date {
    if (hasExplicitUtcOffset(value)) {
      return parseBusinessLocalDateTime(value);
    }

    const workDate =
      typeof workDateInput === 'string'
        ? formatBusinessDate(parseBusinessDate(workDateInput))
        : formatBusinessDate(workDateInput);
    const [providedDate, providedTime] = value.includes('T')
      ? value.split('T', 2)
      : [workDate, value];
    let localDate = formatBusinessDate(parseBusinessDate(providedDate));
    const localTime = providedTime;

    if (
      kind === 'CHECK_OUT' &&
      shift.isOvernight &&
      localDate === workDate &&
      this.parseClockMinutes(localTime) < this.parseClockMinutes(shift.startTime)
    ) {
      localDate = addBusinessDays(workDate, 1);
    }

    return parseBusinessLocalDateTime(localDate, localTime);
  }

  /**
   * Find or resolve assigned shift for an employee on a given date.
   */
  static async resolveShiftForDate(
    employeeId: string,
    workDate: Date,
    tx?: Prisma.TransactionClient,
    options: { createSchedule?: boolean } = {}
  ): Promise<{
    shift: ShiftTimeWindow;
    scheduleId?: string;
    organizationId: string;
  }> {
    const db = tx || prisma;

    // 0. Fetch verified employee
    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, organizationId: true },
    });
    if (!employee) {
      throw ApiError.notFound('Không tìm thấy nhân viên.');
    }
    const organizationId = employee.organizationId;

    // 1. Direct EmployeeSchedule for this date
    const schedule = await db.employeeSchedule.findUnique({
      where: { employeeId_workDate: { employeeId, workDate } },
      include: { shift: true },
    });

    if (schedule && schedule.shift && schedule.shift.isActive && !schedule.shift.deletedAt) {
      return {
        scheduleId: schedule.id,
        organizationId,
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
    const dayOfWeek = getBusinessWeekday(workDate);
    const recurring = await db.recurringSchedule.findFirst({
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
      const newSchedule = options.createSchedule === false
        ? null
        : await db.employeeSchedule.create({
            data: {
              organizationId,
              employeeId,
              shiftId: recurring.shift.id,
              workDate,
              status: 'SCHEDULED',
            },
          });

      return {
        scheduleId: newSchedule?.id,
        organizationId,
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

    // 3. Fallback: First active default WorkShift in employee's organization
    const defaultShift = await db.workShift.findFirst({
      where: { organizationId, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultShift) {
      // Default fallback shift 08:30 - 17:30
      return {
        organizationId,
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

    const fallbackSchedule = options.createSchedule === false
      ? null
      : await db.employeeSchedule.create({
          data: {
            organizationId,
            employeeId,
            shiftId: defaultShift.id,
            workDate,
            status: 'SCHEDULED',
          },
        });

    return {
      scheduleId: fallbackSchedule?.id,
      organizationId,
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
  static async checkIn(
    input: CheckInInput,
    session: UserSession,
    tx?: Prisma.TransactionClient,
    trustedMethod: TrustedAttendanceMethod = 'WEB'
  ) {
    const now = new Date();
    const checkInTime = input.checkInTime
      ? parseBusinessLocalDateTime(input.checkInTime)
      : now;
    const workDateStr = input.workDate
      ? formatBusinessDate(parseBusinessDate(input.workDate))
      : getBusinessDateString(checkInTime);
    const workDate = parseBusinessDate(workDateStr);

    // Prevent invalid future timestamp (allow max 5 min clock drift)
    if (checkInTime.getTime() > now.getTime() + 5 * 60 * 1000) {
      throw ApiError.badRequest('Thời gian check-in không được ở tương lai.');
    }

    const executeCheckIn = async (db: Prisma.TransactionClient) => {
      const employeeId = await this.resolveEmployeeId(session, input.employeeId, db);

      // 1. PREVENT DUPLICATE ATTENDANCE
      const existing = await db.attendance.findUnique({
        where: { employeeId_workDate: { employeeId, workDate } },
      });

      if (existing) {
        throw ApiError.conflict(`Nhân viên đã thực hiện check-in cho ngày ${workDateStr} lúc ${existing.checkInTime ? formatBusinessTime(existing.checkInTime) : 'N/A'}.`);
      }

      // 2. Resolve shift & schedule inside the same transaction client.
      const { shift, scheduleId, organizationId } = await this.resolveShiftForDate(
        employeeId,
        workDate,
        db
      );

      // 3. Compute late minutes at check-in
      const scheduledStart = parseBusinessLocalDateTime(workDateStr, shift.startTime);
      const lateThreshold = scheduledStart.getTime() + (shift.gracePeriodLate || 0) * 60 * 1000;

      let lateMinutes = 0;
      let initialStatus = 'IN_PROGRESS';
      if (checkInTime.getTime() > lateThreshold) {
        lateMinutes = Math.floor((checkInTime.getTime() - scheduledStart.getTime()) / (60 * 1000));
        initialStatus = 'LATE';
      }

      // 4. Create attendance record and audit using the same transaction client.
      const created = await db.attendance.create({
        data: {
          organizationId,
          employeeId,
          scheduleId: scheduleId || null,
          workDate,
          checkInTime,
          checkInMethod: trustedMethod,
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

      await db.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'ATTENDANCE_CHECK_IN',
          entity: 'attendance',
          entityId: created.id,
          organizationId,
          newValues: {
            employeeId,
            workDate: workDateStr,
            checkInTime: checkInTime.toISOString(),
            method: trustedMethod,
            lateMinutes,
            status: initialStatus,
          },
        },
      });

      return created;
    };

    const attendance = tx
      ? await executeCheckIn(tx)
      : await prisma.$transaction(executeCheckIn);

    logger.info('Employee checked in', {
      attendanceId: attendance.id,
      employeeId: attendance.employeeId,
      workDate: workDateStr,
      lateMinutes: attendance.lateMinutes,
      actor: session.userId,
    });

    return {
      ...attendance,
      workDate: formatBusinessDate(attendance.workDate),
      actualWorkHours: Number(attendance.actualWorkHours),
      otHours: Number(attendance.otHours),
    };
  }

  /**
   * CHECK-OUT
   */
  static async checkOut(
    input: CheckOutInput,
    session: UserSession,
    tx?: Prisma.TransactionClient,
    trustedMethod: TrustedAttendanceMethod = 'WEB'
  ) {
    const now = new Date();
    const checkOutTime = input.checkOutTime
      ? parseBusinessLocalDateTime(input.checkOutTime)
      : now;
    const organizationId = session.organizationId;

    if (!organizationId) {
      throw ApiError.forbidden('Phien dang nhap khong thuoc to chuc hop le de cham cong.');
    }

    // Prevent future check-out timestamp
    if (checkOutTime.getTime() > now.getTime() + 5 * 60 * 1000) {
      throw ApiError.badRequest('Thời gian check-out không được ở tương lai.');
    }

    const executeCheckOut = async (db: Prisma.TransactionClient) => {
      const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');
      let employee;

      if (input.employeeId && isPrivileged) {
        employee = await db.employee.findFirst({
          where: { id: input.employeeId, organizationId },
          select: { id: true, status: true, deletedAt: true },
        });
      } else {
        employee = await db.employee.findFirst({
          where: { userId: session.userId, organizationId },
          select: { id: true, status: true, deletedAt: true },
        });

        if (employee && input.employeeId && input.employeeId !== employee.id) {
          throw ApiError.forbidden('Ban khong co quyen cham cong cho nhan vien khac.');
        }
      }

      if (!employee || employee.deletedAt || employee.status === 'TERMINATED') {
        throw ApiError.notFound('Khong tim thay nhan vien hop le trong to chuc hien tai.');
      }

      const resolvedAttendance = await this.resolveCheckoutAttendance(
        organizationId,
        employee.id,
        checkOutTime,
        { attendanceId: input.attendanceId, workDate: input.workDate },
        db
      );
      const attendance = resolvedAttendance.attendance;

      if (!attendance || !attendance.checkInTime) {
        throw ApiError.notFound('Khong tim thay ban ghi cham cong hop le de check-out.');
      }

      if (attendance.checkOutTime) {
        throw ApiError.conflict('Ban ghi cham cong da duoc check-out.');
      }

      if (checkOutTime.getTime() <= attendance.checkInTime.getTime()) {
        throw ApiError.badRequest(
          `Thời gian check-out (${formatBusinessTime(checkOutTime)}) phải diễn ra sau thời gian check-in (${formatBusinessTime(attendance.checkInTime)}).`
        );
      }

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

      const metrics = this.calculateAttendanceMetrics(
        attendance.checkInTime,
        checkOutTime,
        shift,
        resolvedAttendance.workDate ?? attendance.workDate
      );
      const checkout = await db.attendance.updateMany({
        where: {
          id: attendance.id,
          organizationId,
          employeeId: employee.id,
          checkOutTime: null,
        },
        data: {
          checkOutTime,
          checkOutMethod: trustedMethod,
          checkOutLat: input.checkOutLat ? new Prisma.Decimal(input.checkOutLat) : null,
          checkOutLng: input.checkOutLng ? new Prisma.Decimal(input.checkOutLng) : null,
          earlyMinutes: metrics.earlyMinutes,
          actualWorkHours: new Prisma.Decimal(metrics.actualWorkHours),
          otHours: new Prisma.Decimal(metrics.otHours),
          status: metrics.status,
          notes: input.notes?.trim() || attendance.notes,
        },
      });

      if (checkout.count !== 1) {
        throw ApiError.conflict('Ban ghi cham cong da thay doi hoac da duoc check-out.');
      }

      if (attendance.scheduleId) {
        await db.employeeSchedule.update({
          where: { id: attendance.scheduleId },
          data: { status: 'COMPLETED' },
        });
      }

      await db.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'ATTENDANCE_CHECK_OUT',
          entity: 'attendance',
          entityId: attendance.id,
          organizationId,
          newValues: {
            checkOutTime: checkOutTime.toISOString(),
            method: trustedMethod,
            actualWorkHours: metrics.actualWorkHours,
            earlyMinutes: metrics.earlyMinutes,
            otHours: metrics.otHours,
            status: metrics.status,
          },
        },
      });

      const result = await db.attendance.findFirst({
        where: { id: attendance.id, organizationId, employeeId: employee.id },
        include: {
          employee: {
            select: { id: true, employeeCode: true, firstName: true, lastName: true },
          },
          schedule: {
            include: { shift: true },
          },
        },
      });

      if (!result) {
        throw ApiError.conflict('Khong the doc lai ban ghi cham cong sau khi check-out.');
      }

      return { result, metrics, employeeId: employee.id };
    };

    const updated = tx
      ? await executeCheckOut(tx)
      : await prisma.$transaction(executeCheckOut);

    logger.info('Employee checked out', {
      attendanceId: updated.result.id,
      employeeId: updated.employeeId,
      actualWorkHours: updated.metrics.actualWorkHours,
      otHours: updated.metrics.otHours,
      status: updated.metrics.status,
      actor: session.userId,
    });

    return {
      ...updated.result,
      workDate: formatBusinessDate(updated.result.workDate),
      actualWorkHours: Number(updated.result.actualWorkHours),
      otHours: Number(updated.result.otHours),
    };
  }

  /**
   * Resolve the exact attendance row eligible for checkout without guessing that
   * an early wall-clock hour belongs to the previous day.
   */
  static async resolveCheckoutAttendance(
    organizationId: string,
    employeeId: string,
    checkOutTime: Date,
    input: Pick<CheckOutInput, 'attendanceId' | 'workDate'> = {},
    tx?: Prisma.TransactionClient
  ) {
    const db = tx || prisma;
    const include = {
      schedule: { include: { shift: true } },
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
    } as const;

    if (input.attendanceId) {
      const attendance = await db.attendance.findFirst({
        where: { id: input.attendanceId, organizationId, employeeId },
        include,
      });
      return {
        attendance,
        workDate: attendance ? formatBusinessDate(attendance.workDate) : null,
      };
    }

    if (input.workDate) {
      const workDate = formatBusinessDate(parseBusinessDate(input.workDate));
      const attendance = await db.attendance.findFirst({
        where: {
          organizationId,
          employeeId,
          workDate: parseBusinessDate(workDate),
        },
        include,
      });
      return { attendance, workDate };
    }

    const currentWorkDate = getBusinessDateString(checkOutTime);
    const currentAttendance = await db.attendance.findFirst({
      where: {
        organizationId,
        employeeId,
        workDate: parseBusinessDate(currentWorkDate),
        checkInTime: { not: null },
        checkOutTime: null,
      },
      include,
    });
    if (currentAttendance) {
      return { attendance: currentAttendance, workDate: currentWorkDate };
    }

    const previousWorkDate = addBusinessDays(currentWorkDate, -1);
    const previousOvernightAttendance = await db.attendance.findFirst({
      where: {
        organizationId,
        employeeId,
        workDate: parseBusinessDate(previousWorkDate),
        checkInTime: { not: null },
        checkOutTime: null,
        schedule: {
          is: {
            organizationId,
            employeeId,
            workDate: parseBusinessDate(previousWorkDate),
            shift: {
              is: {
                organizationId,
                isActive: true,
                deletedAt: null,
                isOvernight: true,
              },
            },
          },
        },
      },
      include,
    });

    return {
      attendance: previousOvernightAttendance,
      workDate: previousOvernightAttendance ? previousWorkDate : currentWorkDate,
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

    const todayStr = getBusinessDateString();
    const todayDate = parseBusinessDate(todayStr);

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

    const where: Prisma.AttendanceWhereInput = {
      // PHASE 5: Tenant isolation via employee relation
      employee: { organizationId: session.organizationId ?? '__no_org__' },
    };

    if (!isPrivileged && isManager) {
      if (!session.organizationId) {
        throw ApiError.forbidden('Organization context is required.');
      }
      const managerEmployee = await prisma.employee.findUnique({
        where: { userId: session.userId, organizationId: session.organizationId },
        select: { id: true, managedDepartments: { select: { id: true } } },
      });
      if (!managerEmployee) {
        throw ApiError.forbidden('Manager employee profile is required.');
      }

      where.OR = [
        { employeeId: managerEmployee.id },
        { employee: { departmentId: { in: managerEmployee.managedDepartments.map((d) => d.id) } } },
      ];
    }

    if (targetEmployeeId) {
      where.employeeId = targetEmployeeId;
    }

    if (params.departmentId) {
      where.employee = { ...((where.employee as any) || {}), departmentId: params.departmentId };
    }

    if (params.startDate || params.endDate) {
      where.workDate = {};
      if (params.startDate) where.workDate.gte = parseBusinessDate(params.startDate);
      if (params.endDate) where.workDate.lte = parseBusinessDate(params.endDate);
    }

    if (params.status && params.status !== 'ALL') {
      where.status = params.status;
    }

    const skip = (params.page - 1) * params.limit;

    const [total, records] = await prisma.$transaction(async (tx) => {
      const total = await tx.attendance.count({ where });

      const records = await tx.attendance.findMany({
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
      });

      return [total, records] as const;
    });

    return {
      records: records.map((r) => ({
        ...r,
        workDate: formatBusinessDate(r.workDate),
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
    const record = await prisma.attendance.findFirst({
      where: { id, organizationId: session.organizationId ?? '__no_org__' },
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
    if (!isPrivileged && isManager) {
      if (!session.organizationId) {
        throw ApiError.forbidden('Organization context is required.');
      }
      const managerEmployee = await prisma.employee.findUnique({
        where: { userId: session.userId, organizationId: session.organizationId },
        select: { id: true, managedDepartments: { select: { id: true } } },
      });
      if (!managerEmployee) {
        throw ApiError.forbidden('Manager employee profile is required.');
      }

      const isOwnAttendance = record.employeeId === managerEmployee.id;
      const isManagedDepartment = managerEmployee.managedDepartments.some(
        (d) => d.id === record.employee.department?.id
      );
      if (!isOwnAttendance && !isManagedDepartment) {
        throw ApiError.forbidden('Attendance is outside your managed departments.');
      }
    } else if (!isPrivileged) {
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
      workDate: formatBusinessDate(record.workDate),
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
      select: { id: true, status: true, deletedAt: true, organizationId: true },
    });

    if (!session.organizationId || !employee || employee.deletedAt || employee.status === 'TERMINATED' || employee.organizationId !== session.organizationId) {
      throw ApiError.badRequest('Nhân viên không tồn tại, đã nghỉ việc hoặc không thuộc tổ chức hiện tại.');
    }

    const workDate = parseBusinessDate(input.workDate);

    // Resolve shift
    let shiftData = null;
    let scheduleId = undefined;

    if (input.shiftId) {
      shiftData = await prisma.workShift.findUnique({ where: { id: input.shiftId } });
      if (!shiftData || shiftData.organizationId !== employee.organizationId) {
        throw ApiError.badRequest('Ca làm việc không hợp lệ hoặc không thuộc cùng tổ chức với nhân viên.');
      }
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

    const inDate = this.parseAttendanceDateTime(
      input.checkInTime,
      input.workDate,
      shift,
      'CHECK_IN'
    );
    const outDate = this.parseAttendanceDateTime(
      input.checkOutTime,
      input.workDate,
      shift,
      'CHECK_OUT'
    );

    if (outDate.getTime() <= inDate.getTime()) {
      throw ApiError.badRequest('Thời gian check-out phải diễn ra sau thời gian check-in.');
    }

    // Calculate metrics only after overnight shift semantics are known.
    const metrics = this.calculateAttendanceMetrics(inDate, outDate, shift, input.workDate);

    // Upsert attendance record
    const result = await prisma.$transaction(async (tx) => {
      const existingAttendance = await tx.attendance.findUnique({
        where: { employeeId_workDate: { employeeId: input.employeeId, workDate } },
        select: {
          checkInTime: true,
          checkOutTime: true,
          checkInMethod: true,
          checkOutMethod: true,
        },
      });
      const checkInChanged =
        !existingAttendance?.checkInTime || existingAttendance.checkInTime.getTime() !== inDate.getTime();
      const checkOutChanged =
        !existingAttendance?.checkOutTime || existingAttendance.checkOutTime.getTime() !== outDate.getTime();
      const nextCheckInMethod = checkInChanged ? 'MANUAL' : existingAttendance?.checkInMethod ?? null;
      const nextCheckOutMethod = checkOutChanged ? 'MANUAL' : existingAttendance?.checkOutMethod ?? null;

      const record = await tx.attendance.upsert({
        where: { employeeId_workDate: { employeeId: input.employeeId, workDate } },
        create: {
          organizationId: employee.organizationId,
          employeeId: input.employeeId,
          scheduleId: scheduleId || null,
          workDate,
          checkInTime: inDate,
          checkOutTime: outDate,
          checkInMethod: nextCheckInMethod,
          checkOutMethod: nextCheckOutMethod,
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
          checkInMethod: nextCheckInMethod,
          checkOutMethod: nextCheckOutMethod,
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
          organizationId: employee.organizationId,
          oldValues: existingAttendance
            ? {
                checkInTime: existingAttendance.checkInTime?.toISOString() ?? null,
                checkOutTime: existingAttendance.checkOutTime?.toISOString() ?? null,
                checkInMethod: existingAttendance.checkInMethod,
                checkOutMethod: existingAttendance.checkOutMethod,
              }
            : undefined,
          newValues: {
            employeeId: input.employeeId,
            workDate: input.workDate,
            checkInTime: inDate.toISOString(),
            checkOutTime: outDate.toISOString(),
            checkInMethod: nextCheckInMethod,
            checkOutMethod: nextCheckOutMethod,
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
      workDate: formatBusinessDate(result.workDate),
      actualWorkHours: Number(result.actualWorkHours),
      otHours: Number(result.otHours),
    };
  }
}
