import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { QrAttendanceService } from '@/lib/services/qr-attendance.service';
import { GenerateQrTokenSchema } from '@/lib/validations/qr-attendance';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * POST /api/v1/attendance/qr/generate
 * Generates a dynamic cryptographic QR token for lobby kiosk or office screen.
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(GenerateQrTokenSchema, body);

    const token = await QrAttendanceService.generateQrToken(validated, session);
    return NextResponse.json(
      {
        success: true,
        data: token,
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
