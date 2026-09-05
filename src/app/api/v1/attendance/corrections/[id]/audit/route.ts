import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { AttendanceCorrectionService } from '@/lib/services/attendance-correction.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/attendance/corrections/[id]/audit
 * View audit trail history for an attendance correction request.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const logs = await AttendanceCorrectionService.getCorrectionAuditTrail(id, session);

    return NextResponse.json({
      success: true,
      data: logs,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
