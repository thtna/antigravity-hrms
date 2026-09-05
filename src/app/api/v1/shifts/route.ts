import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { ShiftService } from '@/lib/services/shift.service';
import { CreateShiftSchema } from '@/lib/validations/shift';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/shifts
 * List all work shifts. HR/Admin see inactive too.
 */
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const isPrivileged = session.roles.includes('admin') || session.roles.includes('hr');
    const { searchParams } = new URL(req.url);
    const includeInactive = isPrivileged && searchParams.get('includeInactive') === 'true';

    const shifts = await ShiftService.listShifts(includeInactive);
    return NextResponse.json({ success: true, data: shifts, meta: { total: shifts.length, timestamp: new Date().toISOString() } });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/shifts
 * Create new work shift (HR/Admin only).
 */
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const body = await req.json().catch(() => ({}));
    const parsed = await validateRequest(CreateShiftSchema, body);

    const shift = await ShiftService.createShift(parsed, session);
    return NextResponse.json(
      { success: true, data: shift, meta: { timestamp: new Date().toISOString() } },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
