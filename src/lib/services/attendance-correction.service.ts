import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import {
  CreateCorrectionInput,
  ProcessCorrectionInput,
  CancelCorrectionInput,
  CorrectionQueryParams,
  CorrectionType,
} from '@/lib/validations/attendance-correction';
import { AttendanceService } from './attendance.service';
import { Prisma } from '@prisma/client';

export class AttendanceCorrectionService {
  /**
   * Resolve an employee ID for a given session.
   * If session.employeeId is provided, returns it; otherwise looks up employee by userId.
   */
  private static async resolveEmployeeId(session: UserSession, targetEmployeeId?: string): Promise<string> {
    const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');

    if (targetEmployeeId) {
      if (!isPrivileged) {
        throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền tạo yêu cầu cho nhân viên khác.');
      }
      const target = await prisma.employee.findUnique({
        where: { id: targetEmployeeId },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!target || target.deletedAt || target.status === 'TERMINATED') {
        throw ApiError.badRequest('Nhân viên không tồn tại hoặc đã nghỉ việc.');
      }
      return target.id;
    }

    if (session.employeeId) {
      return session.employeeId;
    }

    const self = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!self || self.deletedAt || self.status === 'TERMINATED') {
      throw ApiError.badRequest('Không tìm thấy thông tin nhân viên hợp lệ hoặc nhân viên đã nghỉ việc.');
    }

    return self.id;
  }

  /**
   * Employee creates an attendance correction / exception request.
   * CRITICAL GUARANTEE: Does NOT overwrite the original attendance history while in PENDING status.
   */
  static async createCorrection(
    input: CreateCorrectionInput,
    session: UserSession,
    targetEmployeeId?: string,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    const employeeId = await this.resolveEmployeeId(session, targetEmployeeId);

    // Parse and validate work date
    const workDate = new Date(input.workDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (workDate.getTime() > today.getTime()) {
      throw ApiError.badRequest('Không thể tạo yêu cầu điều chỉnh cho ngày trong tương lai.');
    }

    // Limit back-dated requests (e.g. 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    ninetyDaysAgo.setHours(0, 0, 0, 0);

    if (workDate.getTime() < ninetyDaysAgo.getTime()) {
      throw ApiError.badRequest('Không thể điều chỉnh chấm công quá 90 ngày trong quá khứ.');
    }

    // Look up existing attendance record for this work date if exists or specified
    let attendance = null;
    if (input.attendanceId) {
      attendance = await prisma.attendance.findUnique({
        where: { id: input.attendanceId },
      });
      if (!attendance) {
        throw ApiError.notFound(`Không tìm thấy bản ghi chấm công có ID: ${input.attendanceId}`);
      }
      if (attendance.employeeId !== employeeId) {
        throw ApiError.forbidden('Bản ghi chấm công không thuộc về nhân viên này.');
      }
    } else {
      attendance = await prisma.attendance.findUnique({
        where: {
          employeeId_workDate: {
            employeeId,
            workDate,
          },
        },
      });
    }

    // Precondition validation according to correctionType
    this.validatePreconditions(input.correctionType, attendance, input);

    // Prevent duplicate PENDING request for same employee, workDate and correctionType
    const existingPending = await prisma.attendanceAdjustment.findFirst({
      where: {
        employeeId,
        workDate,
        correctionType: input.correctionType,
        status: 'PENDING',
      },
    });

    if (existingPending) {
      throw ApiError.conflict(
        `Đang có một yêu cầu ${input.correctionType} ở trạng thái chờ duyệt (PENDING) cho ngày ${input.workDate}.`
      );
    }

    const requestedCheckIn = input.requestedCheckIn ? new Date(input.requestedCheckIn) : null;
    const requestedCheckOut = input.requestedCheckOut ? new Date(input.requestedCheckOut) : null;

    // Create AttendanceAdjustment in transaction with AuditLog
    const adjustment = await prisma.$transaction(async (tx) => {
      const created = await tx.attendanceAdjustment.create({
        data: {
          organizationId: session.organizationId ?? '__no_org__',
          attendanceId: attendance ? attendance.id : null,
          employeeId,
          workDate,
          correctionType: input.correctionType,
          requestedCheckIn,
          requestedCheckOut,
          overtimeMinutes: input.overtimeMinutes ?? null,
          reason: input.reason.trim(),
          evidenceUrl: input.evidenceUrl ?? null,
          status: 'PENDING',
        },
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
          attendance: true,
        },
      });

      // Write Audit Log
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CREATE_ATTENDANCE_CORRECTION',
          entity: 'attendance_adjustment',
          entityId: created.id,
          newValues: {
            correctionType: created.correctionType,
            workDate: input.workDate,
            requestedCheckIn: input.requestedCheckIn ?? null,
            requestedCheckOut: input.requestedCheckOut ?? null,
            overtimeMinutes: input.overtimeMinutes ?? null,
            reason: input.reason,
            status: 'PENDING',
          },
          ipAddress: clientInfo?.ipAddress ?? null,
          userAgent: clientInfo?.userAgent ?? null,
        },
      });

      return created;
    });

    logger.info(
      `[AttendanceCorrection] Created request ${adjustment.id} for employee ${employeeId} (${input.correctionType})`
    );

    return adjustment;
  }

  /**
   * Validate business rules & preconditions based on correction type.
   */
  private static validatePreconditions(
    type: CorrectionType,
    attendance: any | null,
    input: CreateCorrectionInput
  ) {
    switch (type) {
      case 'FORGOT_CHECKOUT': {
        if (!attendance) {
          throw ApiError.badRequest('Không tìm thấy bản ghi chấm công ngày này để bổ sung check-out.');
        }
        if (!attendance.checkInTime) {
          throw ApiError.badRequest('Bản ghi chấm công chưa có giờ check-in, vui lòng chọn loại điều chỉnh đầy đủ.');
        }
        if (attendance.checkOutTime) {
          throw ApiError.badRequest('Ngày làm việc này đã có giờ check-out, vui lòng chọn loại điều chỉnh khác.');
        }
        break;
      }
      case 'FORGOT_CHECKIN': {
        // Either no attendance record, or attendance has checkOut but no checkIn, or missing check-in
        if (attendance && attendance.checkInTime && !input.requestedCheckOut) {
          throw ApiError.badRequest('Ngày làm việc này đã có giờ check-in.');
        }
        break;
      }
      case 'LATE_JUSTIFICATION': {
        if (!attendance) {
          throw ApiError.badRequest('Không tìm thấy bản ghi chấm công ngày này để giải trình đi muộn.');
        }
        if (attendance.lateMinutes <= 0) {
          throw ApiError.badRequest('Bản ghi chấm công ngày này không ghi nhận đi muộn (lateMinutes = 0).');
        }
        break;
      }
      case 'EARLY_LEAVE_JUSTIFICATION': {
        if (!attendance) {
          throw ApiError.badRequest('Không tìm thấy bản ghi chấm công ngày này để giải trình về sớm.');
        }
        if (attendance.earlyMinutes <= 0) {
          throw ApiError.badRequest('Bản ghi chấm công ngày này không ghi nhận về sớm (earlyMinutes = 0).');
        }
        break;
      }
      case 'OVERTIME_REQUEST': {
        if (!attendance) {
          throw ApiError.badRequest('Không tìm thấy bản ghi chấm công ngày này để yêu cầu tăng ca.');
        }
        if (!input.overtimeMinutes || input.overtimeMinutes <= 0) {
          throw ApiError.badRequest('Số phút tăng ca đề xuất phải lớn hơn 0.');
        }
        break;
      }
      case 'MISSING_ATTENDANCE': {
        if (attendance && attendance.status !== 'ABSENT' && attendance.actualWorkHours > 0) {
          throw ApiError.badRequest(
            'Ngày làm việc này đã có bản ghi chấm công hợp lệ. Vui lòng chọn loại điều chỉnh (FULL_CORRECTION).'
          );
        }
        break;
      }
      case 'FULL_CORRECTION':
      default:
        // No specific restriction, can adjust any day
        break;
    }
  }

  /**
   * Manager / HR / Admin processes an attendance correction request.
   * Handles approval or rejection with full RBAC enforcement and immutable audit trail.
   */
  static async processCorrection(
    id: string,
    input: ProcessCorrectionInput,
    session: UserSession,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    // 1. Permission checks
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin && !isManager) {
      throw ApiError.forbidden('Chỉ Quản lý, Nhân sự hoặc Quản trị viên mới có quyền phê duyệt/từ chối yêu cầu.');
    }

    // 2. Fetch correction request
    const correction = await prisma.attendanceAdjustment.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
        attendance: true,
      },
    });

    if (!correction || (session?.organizationId && (correction as any).organizationId && (correction as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy yêu cầu điều chỉnh có ID: ${id}`);
    }

    if (correction.status !== 'PENDING') {
      throw ApiError.badRequest(
        `Yêu cầu này đã được xử lý trước đó với trạng thái: ${correction.status}. Không thể xử lý lại.`
      );
    }

    // Manager can only approve employees in their managed departments
    if (isManager && !isHrOrAdmin) {
      // Find manager employee record
      const managerEmployee = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: {
          id: true,
          managedDepartments: { select: { id: true } },
        },
      });

      if (!managerEmployee) {
        throw ApiError.forbidden('Tài khoản quản lý không gắn liền với hồ sơ nhân viên.');
      }

      // Cannot approve own request
      if (managerEmployee.id === correction.employeeId) {
        throw ApiError.forbidden('Quản lý không thể tự phê duyệt yêu cầu điều chỉnh chấm công của chính mình.');
      }

      const managedDeptIds = managerEmployee.managedDepartments.map((d) => d.id);
      if (!managedDeptIds.includes(correction.employee.departmentId)) {
        throw ApiError.forbidden('Bạn không quản lý phòng ban của nhân viên này.');
      }
    }

    // Resolve approver employee ID
    let approverEmployeeId = session.employeeId;
    if (!approverEmployeeId) {
      const approverEmp = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true },
      });
      approverEmployeeId = approverEmp?.id;
    }

    const processedAt = new Date();
    const overrideCheckIn = input.overrideCheckIn ? new Date(input.overrideCheckIn) : null;
    const overrideCheckOut = input.overrideCheckOut ? new Date(input.overrideCheckOut) : null;

    if (overrideCheckIn && overrideCheckOut && overrideCheckOut.getTime() <= overrideCheckIn.getTime()) {
      throw ApiError.badRequest('Thời gian check-out điều chỉnh phải lớn hơn thời gian check-in điều chỉnh.');
    }

    // Process inside atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // If REJECTED: simply update adjustment status and record audit log. Original attendance is completely untouched!
      if (input.decision === 'REJECTED') {
        const updated = await tx.attendanceAdjustment.update({
          where: { id },
          data: {
            status: 'REJECTED',
            approverId: approverEmployeeId ?? null,
            approvalNotes: input.approvalNotes ?? null,
            processedAt,
          },
          include: {
            employee: true,
            approver: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'REJECT_ATTENDANCE_CORRECTION',
            entity: 'attendance_adjustment',
            entityId: id,
            oldValues: { status: 'PENDING' },
            newValues: {
              status: 'REJECTED',
              approvalNotes: input.approvalNotes ?? null,
              approverId: approverEmployeeId ?? null,
              processedAt: processedAt.toISOString(),
            },
            ipAddress: clientInfo?.ipAddress ?? null,
            userAgent: clientInfo?.userAgent ?? null,
          },
        });

        return updated;
      }

      // If APPROVED: Apply changes to attendance with strict audit logging of old vs new values
      const effectiveCheckIn = overrideCheckIn || correction.requestedCheckIn;
      const effectiveCheckOut = overrideCheckOut || correction.requestedCheckOut;

      // Apply to attendance table
      const { updatedAttendance, oldSnapshot, newSnapshot } = await this.applyApprovedCorrection(
        tx,
        correction,
        effectiveCheckIn,
        effectiveCheckOut,
        input
      );

      const updated = await tx.attendanceAdjustment.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approverId: approverEmployeeId ?? null,
          approvalNotes: input.approvalNotes ?? null,
          overrideCheckIn,
          overrideCheckOut,
          processedAt,
          attendanceId: updatedAttendance.id,
        },
        include: {
          employee: true,
          approver: true,
          attendance: true,
        },
      });

      // Create detailed audit log capturing old attendance state and new attendance state
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'APPROVE_ATTENDANCE_CORRECTION',
          entity: 'attendance_adjustment',
          entityId: id,
          oldValues: {
            adjustmentStatus: 'PENDING',
            attendance: oldSnapshot,
          },
          newValues: {
            adjustmentStatus: 'APPROVED',
            approvalNotes: input.approvalNotes ?? null,
            approverId: approverEmployeeId ?? null,
            overrideCheckIn: input.overrideCheckIn ?? null,
            overrideCheckOut: input.overrideCheckOut ?? null,
            attendance: newSnapshot,
          },
          ipAddress: clientInfo?.ipAddress ?? null,
          userAgent: clientInfo?.userAgent ?? null,
        },
      });

      return updated;
    });

    logger.info(
      `[AttendanceCorrection] Processed request ${id} by user ${session.userId} with decision ${input.decision}`
    );

    return result;
  }

  /**
   * Apply approved adjustment to Attendance record inside transaction.
   * Preserves full history by snapshotting old state.
   */
  private static async applyApprovedCorrection(
    tx: Prisma.TransactionClient,
    correction: any,
    effectiveCheckIn: Date | null,
    effectiveCheckOut: Date | null,
    processInput: ProcessCorrectionInput
  ) {
    const employeeId = correction.employeeId;
    const workDate = correction.workDate;

    // Resolve current attendance if any
    const existing = await tx.attendance.findUnique({
      where: {
        employeeId_workDate: {
          employeeId,
          workDate,
        },
      },
    });

    const oldSnapshot = existing
      ? {
          id: existing.id,
          checkInTime: existing.checkInTime?.toISOString() ?? null,
          checkOutTime: existing.checkOutTime?.toISOString() ?? null,
          checkInMethod: existing.checkInMethod,
          checkOutMethod: existing.checkOutMethod,
          lateMinutes: existing.lateMinutes,
          earlyMinutes: existing.earlyMinutes,
          actualWorkHours: Number(existing.actualWorkHours),
          otHours: Number(existing.otHours),
          status: existing.status,
          notes: existing.notes,
        }
      : null;

    // Resolve shift schedule for this date
    const resolvedShift = await AttendanceService.resolveShiftForDate(employeeId, workDate);

    // Prepare target check-in and check-out
    const finalCheckIn = effectiveCheckIn || (existing ? existing.checkInTime : null);
    const finalCheckOut = effectiveCheckOut || (existing ? existing.checkOutTime : null);

    let lateMinutes = existing?.lateMinutes ?? 0;
    let earlyMinutes = existing?.earlyMinutes ?? 0;
    let actualWorkHours = existing ? Number(existing.actualWorkHours) : 0;
    let otHours = existing ? Number(existing.otHours) : 0;
    let status = existing?.status ?? 'ON_TIME';
    let notes = existing?.notes ?? '';

    // Calculate metrics if both check-in and check-out are present
    if (finalCheckIn && finalCheckOut) {
      const metrics = AttendanceService.calculateAttendanceMetrics(
        finalCheckIn,
        finalCheckOut,
        resolvedShift.shift
      );
      lateMinutes = metrics.lateMinutes;
      earlyMinutes = metrics.earlyMinutes;
      actualWorkHours = metrics.actualWorkHours;
      otHours = metrics.otHours;
      status = metrics.status;
    }

    // Special type-specific rules:
    if (correction.correctionType === 'LATE_JUSTIFICATION') {
      // Late arrival was justified and approved -> excuse late minutes
      lateMinutes = 0;
      if (status === 'LATE') status = 'ON_TIME';
      if (status === 'LATE_AND_EARLY') status = 'EARLY_LEAVE';
      notes = `${notes} [Đi muộn đã được duyệt giải trình]`.trim();
    } else if (correction.correctionType === 'EARLY_LEAVE_JUSTIFICATION') {
      // Early departure was justified and approved -> excuse early minutes
      earlyMinutes = 0;
      if (status === 'EARLY_LEAVE') status = 'ON_TIME';
      if (status === 'LATE_AND_EARLY') status = 'LATE';
      notes = `${notes} [Về sớm đã được duyệt giải trình]`.trim();
    } else if (correction.correctionType === 'OVERTIME_REQUEST') {
      // Overtime explicitly approved
      const addOtHours = Number((correction.overtimeMinutes / 60).toFixed(2));
      otHours = Number((otHours + addOtHours).toFixed(2));
      if (status !== 'LATE' && status !== 'EARLY_LEAVE') {
        status = 'OVERTIME';
      }
      notes = `${notes} [Duyệt tăng ca +${correction.overtimeMinutes}p]`.trim();
    } else {
      notes = `${notes} [Đã điều chỉnh theo yêu cầu #${correction.id.slice(0, 8)}]`.trim();
    }

    if (processInput.approvalNotes) {
      notes = `${notes} (Phê duyệt: ${processInput.approvalNotes})`.trim();
    }

    const updatedAttendance = await tx.attendance.upsert({
      where: {
        employeeId_workDate: {
          employeeId,
          workDate,
        },
      },
      create: {
        employeeId,
        scheduleId: resolvedShift.scheduleId || null,
        workDate,
        checkInTime: finalCheckIn,
        checkOutTime: finalCheckOut,
        checkInMethod: 'CORRECTED',
        checkOutMethod: 'CORRECTED',
        lateMinutes,
        earlyMinutes,
        actualWorkHours: new Prisma.Decimal(actualWorkHours),
        otHours: new Prisma.Decimal(otHours),
        status,
        notes,
      },
      update: {
        scheduleId: resolvedShift.scheduleId || existing?.scheduleId || null,
        checkInTime: finalCheckIn,
        checkOutTime: finalCheckOut,
        checkInMethod: finalCheckIn ? 'CORRECTED' : existing?.checkInMethod,
        checkOutMethod: finalCheckOut ? 'CORRECTED' : existing?.checkOutMethod,
        lateMinutes,
        earlyMinutes,
        actualWorkHours: new Prisma.Decimal(actualWorkHours),
        otHours: new Prisma.Decimal(otHours),
        status,
        notes,
      },
    });

    const newSnapshot = {
      id: updatedAttendance.id,
      checkInTime: updatedAttendance.checkInTime?.toISOString() ?? null,
      checkOutTime: updatedAttendance.checkOutTime?.toISOString() ?? null,
      checkInMethod: updatedAttendance.checkInMethod,
      checkOutMethod: updatedAttendance.checkOutMethod,
      lateMinutes: updatedAttendance.lateMinutes,
      earlyMinutes: updatedAttendance.earlyMinutes,
      actualWorkHours: Number(updatedAttendance.actualWorkHours),
      otHours: Number(updatedAttendance.otHours),
      status: updatedAttendance.status,
      notes: updatedAttendance.notes,
    };

    return { updatedAttendance, oldSnapshot, newSnapshot };
  }

  /**
   * Cancel an existing pending correction request (Employee cancels their own).
   */
  static async cancelCorrection(
    id: string,
    input: CancelCorrectionInput,
    session: UserSession,
    clientInfo?: { ipAddress?: string; userAgent?: string }
  ) {
    const correction = await prisma.attendanceAdjustment.findUnique({
      where: { id },
    });

    if (!correction || (session?.organizationId && (correction as any).organizationId && (correction as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy yêu cầu điều chỉnh có ID: ${id}`);
    }

    if (correction.status !== 'PENDING') {
      throw ApiError.badRequest('Chỉ có thể hủy yêu cầu đang ở trạng thái chờ duyệt (PENDING).');
    }

    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    if (!isHrOrAdmin) {
      const selfEmployeeId = await this.resolveEmployeeId(session);
      if (correction.employeeId !== selfEmployeeId) {
        throw ApiError.forbidden('Bạn chỉ có thể hủy yêu cầu của chính mình.');
      }
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const updated = await tx.attendanceAdjustment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          approvalNotes: input.reason ? `Nhân viên hủy: ${input.reason}` : 'Nhân viên hủy yêu cầu',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'CANCEL_ATTENDANCE_CORRECTION',
          entity: 'attendance_adjustment',
          entityId: id,
          oldValues: { status: 'PENDING' },
          newValues: { status: 'CANCELLED', reason: input.reason ?? null },
          ipAddress: clientInfo?.ipAddress ?? null,
          userAgent: clientInfo?.userAgent ?? null,
        },
      });

      return updated;
    });

    logger.info(`[AttendanceCorrection] Request ${id} cancelled by user ${session.userId}`);
    return cancelled;
  }

  /**
   * List corrections with RBAC scoping and rich filtering.
   */
  static async listCorrections(query: CorrectionQueryParams, session: UserSession) {
    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    const where: Prisma.AttendanceAdjustmentWhereInput = {
      ...(session?.organizationId ? { organizationId: session.organizationId } : {}),
    };

    // RBAC scoping
    if (!isHrOrAdmin) {
      if (isManager) {
        const managerEmp = await prisma.employee.findUnique({
          where: { userId: session.userId },
          select: {
            id: true,
            managedDepartments: { select: { id: true } },
          },
        });

        const managedDeptIds = managerEmp?.managedDepartments.map((d) => d.id) || [];

        // Manager sees their managed dept employees + their own requests
        where.OR = [
          { employeeId: managerEmp?.id },
          { employee: { is: { departmentId: { in: managedDeptIds } } } },
        ];
      } else {
        // Regular employee sees only own requests
        const selfEmp = await prisma.employee.findUnique({
          where: { userId: session.userId },
          select: { id: true },
        });
        where.employeeId = selfEmp?.id || 'none';
      }
    }

    // Explicit employee filter
    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    // Department filter
    if (query.departmentId) {
      where.employee = {
        is: {
          departmentId: query.departmentId,
        },
      };
    }

    // Status filter
    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    // Correction type filter
    if (query.correctionType) {
      where.correctionType = query.correctionType;
    }

    // Date range filter
    if (query.startDate || query.endDate) {
      where.workDate = {};
      if (query.startDate) where.workDate.gte = new Date(query.startDate);
      if (query.endDate) where.workDate.lte = new Date(query.endDate);
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      prisma.attendanceAdjustment.count({ where }),
      prisma.attendanceAdjustment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          employee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              department: { select: { id: true, name: true } },
              position: { select: { id: true, title: true } },
            },
          },
          approver: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          attendance: {
            select: {
              id: true,
              checkInTime: true,
              checkOutTime: true,
              lateMinutes: true,
              earlyMinutes: true,
              actualWorkHours: true,
              otHours: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        workDate: item.workDate.toISOString().split('T')[0],
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single correction by ID with security checks.
   */
  static async getCorrectionById(id: string, session: UserSession) {
    const correction = await prisma.attendanceAdjustment.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
          },
        },
        approver: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
        attendance: true,
      },
    });

    if (!correction || (session?.organizationId && (correction as any).organizationId && (correction as any).organizationId !== session.organizationId)) {
      throw ApiError.notFound(`Không tìm thấy yêu cầu điều chỉnh có ID: ${id}`);
    }

    const isHrOrAdmin = session.roles.includes('admin') || session.roles.includes('hr');
    const isManager = session.roles.includes('manager');

    if (!isHrOrAdmin) {
      const selfEmp = await prisma.employee.findUnique({
        where: { userId: session.userId },
        select: { id: true, managedDepartments: { select: { id: true } } },
      });

      const isOwn = selfEmp?.id === correction.employeeId;
      const isManagerOfDept =
        isManager && selfEmp?.managedDepartments.some((d) => d.id === correction.employee.departmentId);

      if (!isOwn && !isManagerOfDept) {
        throw ApiError.forbidden('Bạn không có quyền xem yêu cầu điều chỉnh này.');
      }
    }

    return {
      ...correction,
      workDate: correction.workDate.toISOString().split('T')[0],
      attendance: correction.attendance
        ? {
            ...correction.attendance,
            actualWorkHours: Number(correction.attendance.actualWorkHours),
            otHours: Number(correction.attendance.otHours),
          }
        : null,
    };
  }

  /**
   * Get Audit Trail for an attendance adjustment request.
   */
  static async getCorrectionAuditTrail(id: string, session: UserSession) {
    // Only Manager, HR, Admin or the owning Employee can view audit trail
    await this.getCorrectionById(id, session);

    const logs = await prisma.auditLog.findMany({
      where: {
        entity: 'attendance_adjustment',
        entityId: id,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            employee: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return logs;
  }
}
