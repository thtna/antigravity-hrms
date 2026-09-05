import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { handleApiError } from '@/lib/errors';
import { PermissionService } from '@/lib/services/permission.service';
import { ApiResponse } from '@/types';

export async function GET(): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const session = await requireAuth();
    const roles = await PermissionService.listRolesWithPermissions(session);

    return NextResponse.json({
      success: true,
      data: roles,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
