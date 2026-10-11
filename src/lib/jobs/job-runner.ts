/**
 * ==============================================================================
 * ANTIGRAVITY HRMS — PRODUCTION BACKGROUND JOB ENGINE
 * ==============================================================================
 *
 * Provides a resilient background job execution pipeline for enterprise HRMS:
 * - Attendance Roster Reconciliation (auto-marking unexcused absences)
 * - Notification Archival & Pruning
 * - Cache Warming & Health Checks
 * - Execution telemetry and error containment
 */

import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { CachedLookupService } from '@/lib/cache/cache-manager';
import {
  getScheduledShiftWindow,
  getAttendanceUniqueConflict,
  RECONCILIATION_ABSENT_ACTION,
  RECONCILIATION_ABSENT_NOTES,
} from '@/lib/services/attendance.service';
import {
  addBusinessDays,
  formatBusinessDate,
  getBusinessDateString,
  parseBusinessDate,
} from '@/lib/time/business-time';

export interface JobExecutionResult {
  jobName: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  executedAt: string;
  details?: Record<string, any>;
  error?: string;
}

export type JobHandler = (params?: Record<string, any>) => Promise<Record<string, any>>;

export class JobRunner {
  private static registeredJobs = new Map<string, { description: string; handler: JobHandler }>();

  /**
   * Register a job definition
   */
  public static register(name: string, description: string, handler: JobHandler): void {
    this.registeredJobs.set(name, { description, handler });
  }

  /**
   * List all registered job names and descriptions
   */
  public static listJobs(): Array<{ name: string; description: string }> {
    return Array.from(this.registeredJobs.entries()).map(([name, item]) => ({
      name,
      description: item.description,
    }));
  }

  /**
   * Execute a registered job by name with execution tracking and error shielding
   */
  public static async runJob(
    name: string,
    params?: Record<string, any>
  ): Promise<JobExecutionResult> {
    const job = this.registeredJobs.get(name);
    if (!job) {
      throw new Error(`Công việc nền '${name}' không tồn tại trong hệ thống.`);
    }

    const start = Date.now();
    const executedAt = new Date().toISOString();

    logger.info(`[JobRunner] Bắt đầu thực thi background job: ${name}`, { params });

    try {
      const details = await job.handler(params);
      const durationMs = Date.now() - start;

      logger.info(`[JobRunner] Background job '${name}' hoàn tất thành công trong ${durationMs}ms`, details);

      return {
        jobName: name,
        status: 'SUCCESS',
        durationMs,
        executedAt,
        details,
      };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      const errorMsg = err?.message || String(err);

      logger.error(`[JobRunner] Background job '${name}' thất bại sau ${durationMs}ms: ${errorMsg}`, { err });

      return {
        jobName: name,
        status: 'FAILED',
        durationMs,
        executedAt,
        error: errorMsg,
      };
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Core Enterprise Production Background Jobs
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 1. DAILY ATTENDANCE RECONCILIATION JOB
 * Reconciles an explicit target date, or yesterday plus an overnight lookback in automatic mode.
 * If an employee was scheduled to work but had no check-in and no approved leave,
 * automatically records ABSENT to ensure KPI and payroll accuracy.
 */
JobRunner.register(
  'DAILY_ATTENDANCE_RECONCILIATION',
  'Tự động đối soát ca làm việc và ghi nhận vắng mặt không phép (ABSENT) cho các ca không có check-in',
  async (params?: { targetDate?: string; organizationId?: string }) => {
    const now = new Date();
    const requestedDate = params?.targetDate;
    const targetDate = requestedDate !== undefined
      ? formatBusinessDate(parseBusinessDate(requestedDate))
      : addBusinessDays(getBusinessDateString(now), -1);
    const targetDateCarrier = parseBusinessDate(targetDate);
    if (targetDate > getBusinessDateString(now)) throw new Error('Future reconciliation date is not allowed.');
    const firstWorkDate = requestedDate !== undefined
      ? targetDateCarrier
      : parseBusinessDate(addBusinessDays(targetDate, -1));

    // Only automatic runs revisit overnight shifts skipped just after midnight.
    const schedules = await prisma.employeeSchedule.findMany({
      where: {
        workDate: requestedDate !== undefined
          ? targetDateCarrier
          : { gte: firstWorkDate, lte: targetDateCarrier },
        status: 'SCHEDULED',
        ...(params?.organizationId ? { organizationId: params.organizationId } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
        organizationId: true,
      },
    });

    if (schedules.length === 0) {
      return { reconciledDate: targetDate, processed: 0, markedAbsent: 0 };
    }

    let alreadyAttended = 0;
    let onApprovedLeave = 0;
    let notEnded = 0;
    let markedAbsentCount = 0;

    for (const sch of schedules) {
      if (!sch.organizationId || (params?.organizationId && sch.organizationId !== params.organizationId) ||
          sch.workDate < firstWorkDate || sch.workDate > targetDateCarrier) {
        throw new Error('Invalid reconciliation schedule scope.');
      }
      let insertAttempted = false;
      let insertCompleted = false;
      try {
        const outcome = await prisma.$transaction(async (tx) => {
          // Freeze the scheduled window and tenant ownership until the create/audit commits.
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT s.id FROM employee_schedules s
            JOIN work_shifts sh ON sh.id = s.shift_id
            JOIN employees e ON e.id = s.employee_id
            WHERE s.id = ${sch.id} AND s.organization_id = ${sch.organizationId}
              AND sh.organization_id = ${sch.organizationId} AND e.organization_id = ${sch.organizationId}
            FOR SHARE OF s, sh, e
          `;
          if (locked.length !== 1) return 'SKIPPED';
          const current = await tx.employeeSchedule.findFirst({
            where: {
              id: sch.id, organizationId: sch.organizationId, employeeId: sch.employeeId,
              workDate: sch.workDate, status: 'SCHEDULED',
              employee: { organizationId: sch.organizationId, deletedAt: null, status: { not: 'TERMINATED' } },
              shift: { organizationId: sch.organizationId, isActive: true, deletedAt: null },
            },
            include: { shift: true },
          });
          if (!current) return 'SKIPPED';
          const workDate = formatBusinessDate(current.workDate);
          let end: Date;
          try {
            ({ end } = getScheduledShiftWindow(workDate, current.shift));
          } catch (error) {
            logger.error('Reconciliation rejected invalid shift configuration', {
              scheduleId: sch.id, organizationId: sch.organizationId, workDate,
            });
            throw error;
          }
          if (now.getTime() < end.getTime()) return 'NOT_ENDED';

          const existing = await tx.attendance.findUnique({
            where: {
              employeeId_workDate: { employeeId: sch.employeeId, workDate: sch.workDate },
              organizationId: sch.organizationId,
            },
            select: { id: true },
          });
          if (existing) return 'ATTENDED';
          const leave = await tx.leaveRequest.findFirst({
            where: {
              organizationId: sch.organizationId, employeeId: sch.employeeId, status: 'APPROVED',
              startDate: { lte: sch.workDate }, endDate: { gte: sch.workDate },
            },
            select: { id: true },
          });
          if (leave) return 'LEAVE';

          insertAttempted = true;
          const attendance = await tx.attendance.create({
            data: {
              organizationId: sch.organizationId, employeeId: sch.employeeId,
              scheduleId: sch.id, workDate: sch.workDate, status: 'ABSENT',
              actualWorkHours: 0, otHours: 0, lateMinutes: 0, earlyMinutes: 0,
              notes: RECONCILIATION_ABSENT_NOTES,
            },
          });
          insertCompleted = true;
          await tx.auditLog.create({
            data: {
              actorId: null, organizationId: sch.organizationId,
              action: RECONCILIATION_ABSENT_ACTION, entity: 'attendance', entityId: attendance.id,
              newValues: {
                version: 1, employeeId: sch.employeeId, scheduleId: sch.id,
                workDate, shiftEnd: end.toISOString(),
              },
            },
          });
          return 'CREATED';
        });
        if (outcome === 'CREATED') markedAbsentCount++;
        if (outcome === 'ATTENDED') alreadyAttended++;
        if (outcome === 'LEAVE') onApprovedLeave++;
        if (outcome === 'NOT_ENDED') notEnded++;
      } catch (error) {
        // Catch outside the aborted transaction; audit failures must never look like duplicate attendance.
        const conflict = getAttendanceUniqueConflict(error);
        if (!insertAttempted || insertCompleted || !conflict) throw error;
        const winner = await prisma.attendance.findFirst({
          where: {
            organizationId: sch.organizationId, employeeId: sch.employeeId, workDate: sch.workDate,
            ...(conflict === 'schedule' ? { scheduleId: sch.id } : {}),
          },
          select: { id: true },
        });
        if (!winner) throw error;
        alreadyAttended++;
      }
    }

    return {
      reconciledDate: targetDate,
      totalScheduled: schedules.length,
      alreadyAttended,
      onApprovedLeave,
      notEnded,
      markedAbsent: markedAbsentCount,
    };
  }
);

/**
 * 2. NOTIFICATION PRUNING JOB
 * Cleans up read notifications older than 90 days
 */
JobRunner.register(
  'NOTIFICATION_PRUNING',
  'Dọn dẹp các thông báo đã đọc cũ hơn 90 ngày nhằm tối ưu dung lượng cơ sở dữ liệu',
  async (params?: { retentionDays?: number }) => {
    const days = params?.retentionDays || 90;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await prisma.notification.deleteMany({
      where: {
        isRead: true,
        createdAt: { lt: cutoffDate },
      },
    });

    return {
      retentionDays: days,
      cutoffDate: cutoffDate.toISOString(),
      prunedCount: result.count,
    };
  }
);

/**
 * 3. CACHE WARMUP & HEALTH CHECK JOB
 * Pre-warms hot reference data into memory and verifies database connectivity
 */
JobRunner.register(
  'CACHE_WARMUP',
  'Nạp trước dữ liệu tham chiếu (Worksites, Payroll Rules) vào bộ nhớ đệm tốc độ cao',
  async () => {
    const [worksites, defaultRule] = await Promise.all([
      CachedLookupService.getActiveWorksites(),
      CachedLookupService.getDefaultPayrollRule(),
    ]);

    return {
      worksitesCached: worksites.length,
      defaultRuleCached: defaultRule ? defaultRule.name : 'NONE',
    };
  }
);
