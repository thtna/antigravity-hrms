import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { QrAttendanceService } from '@/lib/services/qr-attendance.service';
import { QrTokenQuerySchema } from '@/lib/validations/qr-attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/attendance/qr/history
 * Audit log of generated QR tokens (Admin / HR only).
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);
    const query = {
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      isUsed: searchParams.get('isUsed') || 'ALL',
    };
    const validated = await validateRequest(QrTokenQuerySchema, query);

    const result = await QrAttendanceService.queryTokens(validated, session);
    return NextResponse.json(
      {
        success: true,
        data: result.data,
        pagination: result.pagination,
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
