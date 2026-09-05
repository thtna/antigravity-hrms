import { NextRequest, NextResponse } from 'next/server';
import { JobRunner } from '@/lib/jobs/job-runner';
import { getSession } from '@/lib/auth/session';
import { handleApiError, ApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const jobs = JobRunner.listJobs();
    return NextResponse.json({
      success: true,
      data: jobs,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    // 1. Authorize via CRON_SECRET or Admin Session
    const authHeader = request.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET || 'antigravity_cron_internal_2026';
    const isCronAuthorized = authHeader === `Bearer ${cronSecret}`;

    if (!isCronAuthorized) {
      const session = await getSession();
      const isAdmin = session && (session.roles.includes('admin') || session.roles.includes('hr'));
      if (!isAdmin) {
        throw ApiError.unauthorized('Yêu cầu khóa xác thực tác vụ tự động (CRON_SECRET) hoặc quyền Quản trị viên.');
      }
    }

    const body = await request.json().catch(() => ({}));
    const jobName = body.jobName || body.name;
    const params = body.params || {};

    if (!jobName) {
      throw ApiError.badRequest('Vui lòng cung cấp tên công việc cần chạy (jobName).');
    }

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
