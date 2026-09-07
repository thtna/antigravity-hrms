import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { CreateShiftInput, UpdateShiftInput } from '@/lib/validations/shift';
import { Prisma } from '@prisma/client';

export interface ShiftDurationCalculation {
  totalSpanMinutes: number;
  breakMinutes: number;
  workingMinutes: number;
  workingHours: number;
  isOvernight: boolean;
  standardWorkHours: number;
}

export class ShiftService {
  /**
   * Precise calculation of shift duration, overnight boundary, break deduction and standard work hours.
   */
  static calculateShiftHours(
    startTime: string,
    endTime: string,
    breakMinutes: number = 60,
    isOvernightInput: boolean = false,
    shiftType: string = 'FIXED',
    customStandardHours?: number
  ): ShiftDurationCalculation {
    // 1. Parse times (support "HH:mm" or "HH:mm:ss")
    const parseTime = (t: string) => {
      const parts = t.split(':').map((p) => parseInt(p, 10));
      const hours = parts[0] || 0;
      const minutes = parts[1] || 0;
      return hours * 60 + minutes;
    };

    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);

    // 2. Detect and calculate overnight shift
    let isOvernight = isOvernightInput || endMinutes < startMinutes;
    let totalSpanMinutes = 0;

    if (endMinutes < startMinutes || isOvernight) {
      isOvernight = true;
      // Crosses midnight: from startTime to 24:00 (1440 min) + from 00:00 to endTime
      totalSpanMinutes = (1440 - startMinutes) + endMinutes;
    } else {
      totalSpanMinutes = endMinutes - startMinutes;
    }

    // 3. Deduct break
    const workingMinutes = Math.max(0, totalSpanMinutes - breakMinutes);
    const calculatedHours = Math.round((workingMinutes / 60) * 100) / 100;

    // 4. Resolve standardWorkHours
    let standardWorkHours = calculatedHours;
    if (shiftType === 'FLEXIBLE') {
      standardWorkHours = customStandardHours && customStandardHours > 0 ? customStandardHours : 8.0;
    } else if (customStandardHours && customStandardHours > 0) {
      standardWorkHours = customStandardHours;
    }

    return {
      totalSpanMinutes,
      breakMinutes,
      workingMinutes,
      workingHours: calculatedHours,
      isOvernight,
      standardWorkHours,
    };
  }

  /**
   * List all work shifts
   */
  static async listShifts(includeInactive = false, session?: UserSession) {
    const shifts = await prisma.workShift.findMany({
      where: {
        deletedAt: null,
        ...(includeInactive ? {} : { isActive: true }),
        ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
      },
      include: {
        _count: {
          select: {
            schedules: true,
            recurringSchedules: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return shifts.map((shift) => ({
      ...shift,
      standardWorkHours: Number(shift.standardWorkHours),
      effectiveFrom: shift.effectiveFrom.toISOString().split('T')[0],
      effectiveTo: shift.effectiveTo ? shift.effectiveTo.toISOString().split('T')[0] : null,
      totalAssignedSchedules: shift._count.schedules + shift._count.recurringSchedules,
    }));
  }

  /**
   * Get single shift by ID
   */
  static async getShiftById(id: string, session?: UserSession) {
    const shift = await prisma.workShift.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            schedules: true,
            recurringSchedules: true,
          },
        },
      },
    });

    if (!shift || shift.deletedAt || (session?.organizationId && (shift as any).organizationId && (shift as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy ca làm việc với ID: ${id}`);
    }

    return {
      ...shift,
      standardWorkHours: Number(shift.standardWorkHours),
      effectiveFrom: shift.effectiveFrom.toISOString().split('T')[0],
      effectiveTo: shift.effectiveTo ? shift.effectiveTo.toISOString().split('T')[0] : null,
      totalAssignedSchedules: shift._count.schedules + shift._count.recurringSchedules,
    };
  }

  /**
   * Create a new work shift
   */
  static async createShift(input: CreateShiftInput, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền tạo ca làm việc.');
    }

    const upperCode = input.code.toUpperCase().trim();

    const existing = await prisma.workShift.findFirst({
      where: {
        code: upperCode,
        ...(session.organizationId ? { organizationId: session.organizationId } : {}),
      },
    });
    if (existing && !existing.deletedAt) {
      throw ApiError.conflict(`Mã ca làm việc [${upperCode}] đã tồn tại trong hệ thống.`);
    }

    // Calculate work hours & check overnight
    const duration = this.calculateShiftHours(
      input.startTime,
      input.endTime,
      input.breakMinutes,
      input.isOvernight,
      input.shiftType,
      input.standardWorkHours
    );

    const created = await prisma.$transaction(async (tx) => {
      const shift = await tx.workShift.create({
        data: {
          code: upperCode,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          shiftType: input.shiftType,
          startTime: input.startTime.trim(),
          endTime: input.endTime.trim(),
          breakMinutes: input.breakMinutes,
          isOvernight: duration.isOvernight,
          gracePeriodLate: input.gracePeriodLate,
          gracePeriodEarly: input.gracePeriodEarly,
          standardWorkHours: new Prisma.Decimal(duration.standardWorkHours),
          isActive: input.isActive ?? true,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
          ...(session.organizationId ? { organizationId: session.organizationId } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_SHIFT',
          entity: 'work_shifts',
          entityId: shift.id,
          newValues: {
            code: shift.code,
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            isOvernight: shift.isOvernight,
            standardWorkHours: duration.standardWorkHours,
          },
        },
      });

      return shift;
    });

    logger.info('Work shift created', { shiftId: created.id, code: created.code, actor: session.userId });

    return {
      ...created,
      standardWorkHours: Number(created.standardWorkHours),
      effectiveFrom: created.effectiveFrom.toISOString().split('T')[0],
      effectiveTo: created.effectiveTo ? created.effectiveTo.toISOString().split('T')[0] : null,
      workingMinutes: duration.workingMinutes,
    };
  }

  /**
   * Update work shift
   */
  static async updateShift(id: string, input: UpdateShiftInput, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền cập nhật ca làm việc.');
    }

    const currentShift = await prisma.workShift.findUnique({
      where: { id },
    });

    if (!currentShift || currentShift.deletedAt || (session?.organizationId && (currentShift as any).organizationId && (currentShift as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy ca làm việc với ID: ${id}`);
    }

    // Check duplicate code
    if (input.code && input.code.toUpperCase().trim() !== currentShift.code) {
      const upperCode = input.code.toUpperCase().trim();
      const codeTaken = await prisma.workShift.findFirst({
        where: {
          code: upperCode,
          ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
        },
      });
      if (codeTaken && codeTaken.id !== id) {
        throw ApiError.conflict(`Mã ca làm việc [${upperCode}] đã được sử dụng.`);
      }
    }

    const startTime = input.startTime ?? currentShift.startTime;
    const endTime = input.endTime ?? currentShift.endTime;
    const breakMinutes = input.breakMinutes ?? currentShift.breakMinutes;
    const shiftType = input.shiftType ?? currentShift.shiftType;
    const customHours = input.standardWorkHours ?? Number(currentShift.standardWorkHours);
    const isOvernightPref = input.isOvernight ?? currentShift.isOvernight;

    const duration = this.calculateShiftHours(
      startTime,
      endTime,
      breakMinutes,
      isOvernightPref,
      shiftType,
      customHours
    );

    const updated = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.WorkShiftUpdateInput = {};

      if (input.code) updateData.code = input.code.toUpperCase().trim();
      if (input.name) updateData.name = input.name.trim();
      if (input.description !== undefined) updateData.description = input.description?.trim() || null;
      if (input.shiftType) updateData.shiftType = input.shiftType;
      if (input.startTime) updateData.startTime = input.startTime.trim();
      if (input.endTime) updateData.endTime = input.endTime.trim();
      if (input.breakMinutes !== undefined) updateData.breakMinutes = input.breakMinutes;
      updateData.isOvernight = duration.isOvernight;
      if (input.gracePeriodLate !== undefined) updateData.gracePeriodLate = input.gracePeriodLate;
      if (input.gracePeriodEarly !== undefined) updateData.gracePeriodEarly = input.gracePeriodEarly;
      updateData.standardWorkHours = new Prisma.Decimal(duration.standardWorkHours);
      if (input.isActive !== undefined) updateData.isActive = input.isActive;
      if (input.effectiveFrom) updateData.effectiveFrom = new Date(input.effectiveFrom);
      if (input.effectiveTo !== undefined) {
        updateData.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
      }

      const shift = await tx.workShift.update({
        where: { id },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'UPDATE_SHIFT',
          entity: 'work_shifts',
          entityId: shift.id,
          oldValues: {
            name: currentShift.name,
            startTime: currentShift.startTime,
            endTime: currentShift.endTime,
          },
          newValues: {
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
          },
        },
      });

      return shift;
    });

    return {
      ...updated,
      standardWorkHours: Number(updated.standardWorkHours),
      effectiveFrom: updated.effectiveFrom.toISOString().split('T')[0],
      effectiveTo: updated.effectiveTo ? updated.effectiveTo.toISOString().split('T')[0] : null,
      workingMinutes: duration.workingMinutes,
    };
  }

  /**
   * Toggle shift active/inactive status
   */
  static async toggleShiftStatus(id: string, isActive: boolean, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền bật/tắt trạng thái ca làm việc.');
    }

    const shift = await prisma.workShift.findUnique({
      where: { id },
    });

    if (!shift || shift.deletedAt || (session?.organizationId && (shift as any).organizationId && (shift as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy ca làm việc với ID: ${id}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.workShift.update({
        where: { id },
        data: { isActive },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: isActive ? 'ACTIVATE_SHIFT' : 'DEACTIVATE_SHIFT',
          entity: 'work_shifts',
          entityId: id,
          oldValues: { isActive: shift.isActive },
          newValues: { isActive },
        },
      });

      return res;
    });

    return updated;
  }

  /**
   * Delete shift with Foreign Key Integrity Check (Preserving schedule & attendance history)
   */
  static async deleteShift(id: string, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xóa ca làm việc.');
    }

    const shift = await prisma.workShift.findUnique({
      where: { id },
    });

    if (!shift || shift.deletedAt || (session?.organizationId && (shift as any).organizationId && (shift as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy ca làm việc với ID: ${id}`);
    }

    // FOREIGN KEY INTEGRITY CHECK: Schedules referencing this shift
    const scheduleCount = await prisma.employeeSchedule.count({
      where: { shiftId: id },
    });
    const recurringCount = await prisma.recurringSchedule.count({
      where: { shiftId: id },
    });

    const totalReferences = scheduleCount + recurringCount;

    if (totalReferences > 0) {
      throw ApiError.badRequest(
        `Không thể xóa ca làm việc [${shift.name}] vì đang được phân bổ trong ${totalReferences} lịch làm việc/lịch lặp tuần của nhân viên. Hãy sử dụng tính năng Ngưng hoạt động (Deactivate) để bảo toàn lịch sử ca và chấm công.`
      );
    }

    // Safe Soft Delete
    await prisma.$transaction(async (tx) => {
      await tx.workShift.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'DELETE_SHIFT',
          entity: 'work_shifts',
          entityId: id,
          oldValues: { code: shift.code, name: shift.name },
          newValues: { deletedAt: new Date().toISOString() },
        },
      });
    });

    logger.info('Shift safely soft-deleted', { shiftId: id, code: shift.code, actor: session.userId });

    return {
      id,
      deleted: true,
      message: `Ca làm việc [${shift.name}] đã được xóa an toàn khỏi danh mục hoạt động.`,
    };
  }
}
