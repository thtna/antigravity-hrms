import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { ShiftService } from '@/lib/services/shift.service';
import { UpdateShiftSchema } from '@/lib/validations/shift';
import { validateRequest } from '@/lib/validations';
import { handleApiError } from '@/lib/errors';
import { ApiResponse } from '@/types';

/**
 * GET /api/v1/shifts/[id]
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await requireAuth();
    const { id } = await params;
    const shift = await ShiftService.getShiftById(id);
    return NextResponse.json({ success: true, data: shift, meta: { timestamp: new Date().toISOString() } });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/v1/shifts/[id]
 * Update shift (HR/Admin only).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = await validateRequest(UpdateShiftSchema, body);

    const shift = await ShiftService.updateShift(id, parsed, session);
    return NextResponse.json({ success: true, data: shift, meta: { timestamp: new Date().toISOString() } });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/shifts/[id]
 * Toggle shift active/inactive (HR/Admin only).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Trường isActive (boolean) là bắt buộc.' } },
        { status: 400 }
      );
    }

    const shift = await ShiftService.toggleShiftStatus(id, body.isActive, session);
    return NextResponse.json({ success: true, data: shift, meta: { timestamp: new Date().toISOString() } });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/shifts/[id]
 * Soft-delete shift if no active schedules reference it.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const result = await ShiftService.deleteShift(id, session);
    return NextResponse.json({ success: true, data: result, meta: { timestamp: new Date().toISOString() } });
  } catch (error) {
    return handleApiError(error);
  }
}
