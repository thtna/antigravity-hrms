import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { QrAttendanceService } from '@/lib/services/qr-attendance.service';
import { ScanQrAttendanceSchema } from '@/lib/validations/qr-attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/attendance/qr/scan
 * Scans, verifies, and executes QR attendance (Check-in or Check-out).
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(ScanQrAttendanceSchema, body);

    const result = await QrAttendanceService.scanQrAttendance(validated, session);
    return NextResponse.json(
      {
        success: true,
        data: result,
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
