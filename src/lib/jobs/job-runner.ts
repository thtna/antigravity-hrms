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
 * Reconciles scheduled roster against check-in records for a target date (default: yesterday).
 * If an employee was scheduled to work but had no check-in and no approved leave,
 * automatically records ABSENT to ensure KPI and payroll accuracy.
 */
JobRunner.register(
  'DAILY_ATTENDANCE_RECONCILIATION',
  'Tự động đối soát ca làm việc và ghi nhận vắng mặt không phép (ABSENT) cho các ca không có check-in',
  async (params?: { targetDate?: string }) => {
    const now = new Date();
    // Default to yesterday
    const target = params?.targetDate
      ? new Date(params.targetDate)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

    const dayStart = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 23, 59, 59, 999));

    // 1. Fetch all schedules for target date
    const schedules = await prisma.employeeSchedule.findMany({
      where: {
        workDate: { gte: dayStart, lte: dayEnd },
        status: 'SCHEDULED',
      },
      select: {
        id: true,
        employeeId: true,
        workDate: true,
      },
    });

    if (schedules.length === 0) {
      return { reconciledDate: dayStart.toISOString().slice(0, 10), processed: 0, markedAbsent: 0 };
    }

    const scheduledEmployeeIds = schedules.map((s) => s.employeeId);

    // 2. Fetch attendance & approved leaves concurrently
    const [existingAttendances, approvedLeaves] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          employeeId: { in: scheduledEmployeeIds },
          workDate: { gte: dayStart, lte: dayEnd },
        },
        select: { employeeId: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          employeeId: { in: scheduledEmployeeIds },
          status: 'APPROVED',
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart },
        },
        select: { employeeId: true },
      }),
    ]);

    const attendedSet = new Set(existingAttendances.map((a) => a.employeeId));
    const onLeaveSet = new Set(approvedLeaves.map((l) => l.employeeId));

    let markedAbsentCount = 0;

    for (const sch of schedules) {
      if (!attendedSet.has(sch.employeeId) && !onLeaveSet.has(sch.employeeId)) {
        // Auto-create ABSENT record
        await prisma.attendance.upsert({
          where: {
            employeeId_workDate: {
              employeeId: sch.employeeId,
              workDate: sch.workDate,
            },
          },
          update: {
            status: 'ABSENT',
            actualWorkHours: 0,
            lateMinutes: 0,
            earlyMinutes: 0,
            notes: 'Hệ thống tự động ghi nhận vắng mặt không phép (Attendance Reconciliation Job)',
          },
          create: {
            employeeId: sch.employeeId,
            scheduleId: sch.id,
            workDate: sch.workDate,
            status: 'ABSENT',
            actualWorkHours: 0,
            lateMinutes: 0,
            earlyMinutes: 0,
            notes: 'Hệ thống tự động ghi nhận vắng mặt không phép (Attendance Reconciliation Job)',
          },
        });
        markedAbsentCount++;
      }
    }

    return {
      reconciledDate: dayStart.toISOString().slice(0, 10),
      totalScheduled: schedules.length,
      alreadyAttended: attendedSet.size,
      onApprovedLeave: onLeaveSet.size,
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
