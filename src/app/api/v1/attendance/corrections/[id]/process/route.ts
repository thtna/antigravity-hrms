import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { AttendanceCorrectionService } from '@/lib/services/attendance-correction.service';
import { ProcessCorrectionSchema } from '@/lib/validations/attendance-correction';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * PATCH /api/v1/attendance/corrections/[id]/process
 * Manager / HR / Admin approves or rejects an attendance correction request.
 * Applies changes to attendance with full audit trail upon approval.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(ProcessCorrectionSchema, body);

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await AttendanceCorrectionService.processCorrection(
      id,
      validated,
      session,
      { ipAddress: clientIp, userAgent }
    );

    return NextResponse.json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
