import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { JobRunner } from '@/lib/jobs/job-runner';
import { handleApiError, ApiError } from '@/lib/errors';
import { getBusinessDateString, parseBusinessDate } from '@/lib/time/business-time';
import { ApiResponse } from '@/types';

const JobRequestSchema = z.discriminatedUnion('jobName', [
  z.object({
    jobName: z.literal('DAILY_ATTENDANCE_RECONCILIATION'),
    params: z.object({
      targetDate: z.string().length(10).refine((value) => {
        try {
          parseBusinessDate(value);
          return value < getBusinessDateString();
        } catch {
          return false;
        }
      }).optional(),
      organizationId: z.string().uuid().optional(),
    }).strict().default({}),
  }).strict(),
  z.object({
    jobName: z.literal('NOTIFICATION_PRUNING'),
    params: z.object({
      retentionDays: z.number().int().min(90).refine((days) => {
        const milliseconds = days * 24 * 60 * 60 * 1000;
        return Number.isSafeInteger(milliseconds) &&
          Number.isFinite(new Date(Date.now() - milliseconds).getTime());
      }).optional(),
    }).strict().default({}),
  }).strict(),
  z.object({
    jobName: z.literal('CACHE_WARMUP'),
    params: z.object({}).strict().default({}),
  }).strict(),
]);

export async function GET(): Promise<NextResponse<ApiResponse>> {
  return NextResponse.json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' },
    meta: { timestamp: new Date().toISOString() },
  }, { status: 405, headers: { Allow: 'POST' } });
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const bearer = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/.exec(
      request.headers.get('authorization') || ''
    );
    // Compare fixed-length digests without disclosing the configured secret.
    if (!cronSecret || cronSecret.trim() !== cronSecret ||
      !/^[A-Za-z0-9._~+\/-]+=*$/.test(cronSecret) || !bearer ||
      !timingSafeEqual(
        createHash('sha256').update(cronSecret).digest(),
        createHash('sha256').update(bearer[1]).digest()
      )) {
      throw ApiError.unauthorized('Yêu cầu khóa xác thực tác vụ tự động (CRON_SECRET).');
    }

    const body = await request.json().catch(() => {
      throw ApiError.badRequest('Invalid job request JSON.');
    });
    const parsed = JobRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid job name or parameters.');
    }
    const { jobName, params } = parsed.data;
    const result = await JobRunner.runJob(jobName, params);

    return NextResponse.json({
      success: result.status === 'SUCCESS',
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
