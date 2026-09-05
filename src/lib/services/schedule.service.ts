import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  AssignSingleScheduleInput,
  BulkAssignScheduleInput,
  AssignRecurringPatternInput,
  ScheduleQueryParams,
} from '@/lib/validations/schedule';

export class ScheduleService {
  /**
   * Guard: Only admin, hr or manager can assign schedules.
   */
  private static requireScheduleAccess(session: UserSession) {
    const allowed = ['admin', 'hr', 'manager'];
    if (!session.roles.some((r) => allowed.includes(r))) {
      throw ApiError.forbidden('Chỉ HR, Quản trị viên hoặc Quản lý mới có quyền quản lý lịch làm việc.');
    }
  }

  /**
   * Verify shift exists and is active.
   */
  private static async requireActiveShift(shiftId: string) {
    const shift = await prisma.workShift.findUnique({ where: { id: shiftId } });
    if (!shift || shift.deletedAt || !shift.isActive) {
      throw ApiError.badRequest(`Ca làm việc [${shiftId}] không tồn tại hoặc đã bị ngưng hoạt động.`);
    }
    return shift;
  }

  /**
   * Verify employee exists and is active.
   */
  private static async requireActiveEmployee(employeeId: string) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, status: true, deletedAt: true, firstName: true, lastName: true, employeeCode: true },
    });
    if (!employee || employee.deletedAt || employee.status === 'TERMINATED') {
      throw ApiError.badRequest(`Nhân viên [${employeeId}] không tồn tại hoặc đã nghỉ việc.`);
    }
    return employee;
  }

  /**
   * Assign a single schedule entry (one employee, one date).
   */
  static async assignSingleSchedule(input: AssignSingleScheduleInput, session: UserSession) {
    this.requireScheduleAccess(session);
    await this.requireActiveEmployee(input.employeeId);
    const shift = await this.requireActiveShift(input.shiftId);

    // Check for existing schedule on the same date → upsert
    const existing = await prisma.employeeSchedule.findUnique({
      where: { employeeId_workDate: { employeeId: input.employeeId, workDate: new Date(input.workDate) } },
    });

    const workDate = new Date(input.workDate);

    const schedule = await prisma.$transaction(async (tx) => {
      let result;
      if (existing) {
        result = await tx.employeeSchedule.update({
          where: { id: existing.id },
          data: {
            shiftId: input.shiftId,
            isTemporary: input.isTemporary,
            overrideReason: input.overrideReason?.trim() || null,
            notes: input.notes?.trim() || null,
          },
          include: {
            shift: true,
            employee: {
              select: { id: true, employeeCode: true, firstName: true, lastName: true },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'UPDATE_SCHEDULE',
            entity: 'employee_schedules',
            entityId: existing.id,
            oldValues: { shiftId: existing.shiftId },
            newValues: { shiftId: input.shiftId },
          },
        });
      } else {
        result = await tx.employeeSchedule.create({
          data: {
            employeeId: input.employeeId,
            shiftId: input.shiftId,
            workDate,
            isTemporary: input.isTemporary,
            overrideReason: input.overrideReason?.trim() || null,
            notes: input.notes?.trim() || null,
          },
          include: {
            shift: true,
            employee: {
              select: { id: true, employeeCode: true, firstName: true, lastName: true },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'CREATE_SCHEDULE',
            entity: 'employee_schedules',
            entityId: result.id,
            newValues: { employeeId: input.employeeId, shiftId: input.shiftId, workDate: input.workDate },
          },
        });
      }
      return result;
    });

    logger.info('Single schedule assigned', {
      employeeId: input.employeeId,
      shiftCode: shift.code,
      workDate: input.workDate,
      actor: session.userId,
    });

    return schedule;
  }

  /**
   * Bulk assign: assign one shift to multiple employees over a date range,
   * filtered by specified days of week.
   */
  static async bulkAssignSchedule(input: BulkAssignScheduleInput, session: UserSession) {
    this.requireScheduleAccess(session);
    await this.requireActiveShift(input.shiftId);

    // Validate all employees exist
    for (const eid of input.employeeIds) {
      await this.requireActiveEmployee(eid);
    }

    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // Generate all dates in range that match daysOfWeek
    const dates: Date[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      // getDay() returns 0=Sun, 1=Mon, ... 6=Sat — matches our dayOfWeek encoding
      if (input.daysOfWeek.includes(current.getDay())) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }

    if (dates.length === 0) {
      throw ApiError.badRequest('Không có ngày nào trong khoảng thời gian khớp với các thứ đã chọn.');
    }

    let created = 0;
    let updated = 0;

    await prisma.$transaction(async (tx) => {
      for (const eid of input.employeeIds) {
        for (const date of dates) {
          const existing = await tx.employeeSchedule.findUnique({
            where: { employeeId_workDate: { employeeId: eid, workDate: date } },
          });

          if (existing) {
            await tx.employeeSchedule.update({
              where: { id: existing.id },
              data: {
                shiftId: input.shiftId,
                isTemporary: input.isTemporary,
                overrideReason: input.overrideReason?.trim() || null,
              },
            });
            updated++;
          } else {
            await tx.employeeSchedule.create({
              data: {
                employeeId: eid,
                shiftId: input.shiftId,
                workDate: date,
                isTemporary: input.isTemporary,
                overrideReason: input.overrideReason?.trim() || null,
              },
            });
            created++;
          }
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'BULK_ASSIGN_SCHEDULE',
          entity: 'employee_schedules',
          entityId: 'bulk',
          newValues: {
            employeeIds: input.employeeIds,
            shiftId: input.shiftId,
            startDate: input.startDate,
            endDate: input.endDate,
            daysOfWeek: input.daysOfWeek,
            created,
            updated,
          },
        },
      });
    });

    logger.info('Bulk schedule assigned', {
      employeeCount: input.employeeIds.length,
      dateCount: dates.length,
      created,
      updated,
      actor: session.userId,
    });

    return { created, updated, totalDates: dates.length };
  }

  /**
   * Assign a recurring weekly pattern (RecurringSchedule).
   * A recurring pattern determines which shift an employee works on which days of the week
   * within an effective date range. Used for standard work schedules.
   */
  static async assignRecurringPattern(input: AssignRecurringPatternInput, session: UserSession) {
    this.requireScheduleAccess(session);
    await this.requireActiveEmployee(input.employeeId);
    const shift = await this.requireActiveShift(input.shiftId);

    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;

    const records = await prisma.$transaction(async (tx) => {
      // Deactivate overlapping recurring patterns for same employee on same days
      await tx.recurringSchedule.updateMany({
        where: {
          employeeId: input.employeeId,
          dayOfWeek: { in: input.daysOfWeek },
          isActive: true,
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: effectiveFrom } },
          ],
        },
        data: {
          isActive: false,
          effectiveTo: effectiveFrom, // Close old pattern at start of new one
        },
      });

      // Create new recurring schedule rows (one per day of week)
      const created = await Promise.all(
        input.daysOfWeek.map((dow) =>
          tx.recurringSchedule.create({
            data: {
              employeeId: input.employeeId,
              shiftId: input.shiftId,
              dayOfWeek: dow,
              effectiveFrom,
              effectiveTo,
              isActive: true,
            },
          })
        )
      );

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'ASSIGN_RECURRING_SCHEDULE',
          entity: 'recurring_schedules',
          entityId: input.employeeId,
          newValues: {
            shiftCode: shift.code,
            daysOfWeek: input.daysOfWeek,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo,
          },
        },
      });

      return created;
    });

    logger.info('Recurring schedule pattern assigned', {
      employeeId: input.employeeId,
      shiftCode: shift.code,
      daysOfWeek: input.daysOfWeek,
      actor: session.userId,
    });

    return records;
  }

  /**
   * Query employee schedules with filters.
   */
  static async querySchedules(params: ScheduleQueryParams, session: UserSession) {
    const isEmployee =
      !session.roles.includes('admin') &&
      !session.roles.includes('hr') &&
      !session.roles.includes('manager');

    // Employee can only see their own schedule
    let targetEmployeeId = params.employeeId;
    if (isEmployee) {
      const employee = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (!employee) throw ApiError.notFound('Không tìm thấy hồ sơ nhân viên của bạn.');
      targetEmployeeId = employee.id;
    }

    const where: Record<string, unknown> = {};
    if (targetEmployeeId) where.employeeId = targetEmployeeId;
    if (params.departmentId) {
      where.employee = { departmentId: params.departmentId };
    }
    if (params.startDate || params.endDate) {
      where.workDate = {};
      if (params.startDate) (where.workDate as Record<string, unknown>).gte = new Date(params.startDate);
      if (params.endDate) (where.workDate as Record<string, unknown>).lte = new Date(params.endDate);
    }
    if (params.status && params.status !== 'ALL') {
      where.status = params.status;
    }

    const schedules = await prisma.employeeSchedule.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
          },
        },
        shift: {
          select: {
            id: true,
            code: true,
            name: true,
            startTime: true,
            endTime: true,
            breakMinutes: true,
            isOvernight: true,
            shiftType: true,
            standardWorkHours: true,
          },
        },
      },
      orderBy: [{ workDate: 'asc' }],
    });

    return schedules.map((s) => ({
      ...s,
      workDate: s.workDate.toISOString().split('T')[0],
      shift: {
        ...s.shift,
        standardWorkHours: Number(s.shift.standardWorkHours),
      },
    }));
  }

  /**
   * Get recurring patterns for a specific employee.
   */
  static async getRecurringPatterns(employeeId: string, session: UserSession) {
    const isEmployee =
      !session.roles.includes('admin') &&
      !session.roles.includes('hr') &&
      !session.roles.includes('manager');

    if (isEmployee) {
      const selfEmployee = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      if (!selfEmployee || selfEmployee.id !== employeeId) {
        throw ApiError.forbidden('Bạn chỉ có thể xem lịch làm việc của chính mình.');
      }
    }

    const patterns = await prisma.recurringSchedule.findMany({
      where: { employeeId, isActive: true },
      include: {
        shift: {
          select: {
            id: true,
            code: true,
            name: true,
            startTime: true,
            endTime: true,
            isOvernight: true,
            shiftType: true,
          },
        },
      },
      orderBy: { dayOfWeek: 'asc' },
    });

    return patterns.map((p) => ({
      ...p,
      effectiveFrom: p.effectiveFrom.toISOString().split('T')[0],
      effectiveTo: p.effectiveTo ? p.effectiveTo.toISOString().split('T')[0] : null,
    }));
  }
}
