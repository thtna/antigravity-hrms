import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { SuperAdminService, TenantAction } from '@/lib/services/super-admin.service';
import { ApiError, handleApiError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSuperAdmin();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { action, reason } = body;

    if (!action || !['APPROVE', 'REJECT', 'SUSPEND', 'ACTIVATE', 'CLOSE'].includes(action)) {
      throw ApiError.badRequest('Hành động không hợp lệ. Cho phép: APPROVE, REJECT, SUSPEND, ACTIVATE, CLOSE.');
    }

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await SuperAdminService.processTenantAction(
      id,
      action as TenantAction,
      session,
      {
        reason,
        clientInfo: { ipAddress, userAgent },
      }
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
