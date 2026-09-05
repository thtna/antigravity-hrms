import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { LeaveService } from '@/lib/services/leave.service';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/leaves/[id]
 * Get detail of a leave request.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const record = await LeaveService.getLeaveRequestById(id, session);

    return NextResponse.json({
      success: true,
      data: record,
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
