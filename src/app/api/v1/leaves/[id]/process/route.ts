import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { LeaveService } from '@/lib/services/leave.service';
import { ProcessLeaveRequestSchema } from '@/lib/validations/leave';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * PATCH /api/v1/leaves/[id]/process
 * Manager / HR / Admin approves or rejects a leave request.
 * Enforces strict department scoping and unauthorized approval protection.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validated = await validateRequest(ProcessLeaveRequestSchema, body);

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await LeaveService.processLeaveRequest(
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
