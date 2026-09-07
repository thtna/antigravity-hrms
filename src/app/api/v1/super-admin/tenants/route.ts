import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { SuperAdminService } from '@/lib/services/super-admin.service';
import { ApiError, handleApiError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSuperAdmin();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const data = await SuperAdminService.listTenants(session, { status, search });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
