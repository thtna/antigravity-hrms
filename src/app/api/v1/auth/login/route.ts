import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { signSessionToken, setSessionCookie } from '@/lib/auth/session';
import { normalizeRole, ROLE_PERMISSIONS } from '@/lib/auth/roles';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';
import { validateRequest } from '@/lib/validations';
import { ApiError, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ApiResponse, RoleCode, SanitizedUser, UserSession } from '@/types';

const LoginSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<SanitizedUser>>> {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateKey = `login:${ip}`;

    // 1. Rate Limiting: Max 5 attempts per minute per IP
    const rateCheck = checkRateLimit(rateKey, 5, 60);
    if (!rateCheck.success) {
      logger.warn('Login rate limit exceeded', { ip, resetTime: rateCheck.resetTime });
      throw ApiError.badRequest(
        `Quá nhiều lần thử đăng nhập không thành công. Vui lòng thử lại sau ${rateCheck.resetTime} giây.`
      );
    }

    // 2. Validate input schema
    const body = await request.json().catch(() => ({}));
    const { email, password } = await validateRequest(LoginSchema, body);

    // 3. Find user in database
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        employee: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        organizationMembers: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      logger.warn('Login attempt with non-existent email', { email, ip });
      throw ApiError.badRequest('Email hoặc mật khẩu không chính xác.');
    }

    // 4. Verify password hash
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      logger.warn('Login failed: invalid password', { email, ip });
      throw ApiError.badRequest('Email hoặc mật khẩu không chính xác.');
    }

    // 5. Check account active status
    if (!user.isActive) {
      logger.warn('Login attempt for inactive user', { email, userId: user.id });
      throw ApiError.forbidden('Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.');
    }

    // 6. Check Organization Membership & Organization Status (PENDING must not enter dashboard)
    const primaryMembership = user.organizationMembers?.find((m: any) => m.isDefault) || user.organizationMembers?.[0];
    if (primaryMembership) {
      const orgStatus = primaryMembership.organization?.status;
      if (orgStatus === 'PENDING') {
        logger.warn('Login blocked: organization pending approval', { email, orgId: primaryMembership.organizationId });
        throw ApiError.forbidden('Tài khoản doanh nghiệp của bạn đang ở trạng thái CHỜ DUYỆT (PENDING). Vui lòng đợi quản trị viên hệ thống phê duyệt.');
      }
      if (orgStatus === 'REJECTED') {
        throw ApiError.forbidden('Hồ sơ doanh nghiệp của bạn đã bị TỪ CHỐI (REJECTED). Vui lòng liên hệ quản trị viên.');
      }
      if (orgStatus === 'SUSPENDED') {
        throw ApiError.forbidden('Doanh nghiệp của bạn hiện đang bị TẠM KHÓA (SUSPENDED).');
      }
      if (orgStatus === 'CLOSED') {
        throw ApiError.forbidden('Doanh nghiệp của bạn đã ĐÓNG CỬA (CLOSED).');
      }
      if (!primaryMembership.isActive) {
        throw ApiError.forbidden('Tư cách thành viên của bạn trong tổ chức này đã bị vô hiệu hóa.');
      }
    }

    // 7. Reset rate limit counter on success
    resetRateLimit(rateKey);

    // 8. Aggregate roles and permissions
    const rawRoles = user.userRoles ? user.userRoles.map((ur) => ur.role.code) : [];
    const tenantRole = primaryMembership?.role;
    if (tenantRole === 'OWNER' || tenantRole === 'ADMIN') {
      if (!rawRoles.includes('admin')) rawRoles.push('admin');
    } else if (tenantRole === 'HR_MANAGER') {
      if (!rawRoles.includes('hr')) rawRoles.push('hr');
    } else if (tenantRole === 'MANAGER') {
      if (!rawRoles.includes('manager')) rawRoles.push('manager');
    }

    const roles: RoleCode[] = rawRoles.length > 0 
      ? rawRoles.map(normalizeRole) 
      : ['employee'];

    const permissionSet = new Set<string>();
    // Collect DB-assigned permissions
    if (user.userRoles) {
      user.userRoles.forEach((ur) => {
        ur.role?.rolePermissions?.forEach((rp) => {
          permissionSet.add(rp.permission.code);
        });
      });
    }
    // Collect role-default permissions
    roles.forEach((r) => {
      ROLE_PERMISSIONS[r]?.forEach((p) => permissionSet.add(p));
    });

    const permissions = Array.from(permissionSet);

    // 9. Construct user session with strict server-side tenant authority
    // 9. Construct user session with strict server-side tenant authority
    const fullName = user.employee 
      ? `${user.employee.lastName} ${user.employee.firstName}`.trim() 
      : user.email.split('@')[0];

    const onboardingStep = Number((primaryMembership?.organization as any)?.onboardingStep ?? 0);
    const onboardingSkipped = Boolean((primaryMembership?.organization as any)?.onboardingSkipped);
    const isOwner = primaryMembership?.role === 'OWNER';
    const needsOnboarding = isOwner && onboardingStep < 9 && !onboardingSkipped;

    const sessionPayload: UserSession = {
      userId: user.id,
      employeeId: user.employee?.id,
      email: user.email,
      fullName,
      departmentId: user.employee?.departmentId || null,
      roles,
      permissions,
      isActive: user.isActive,
      organizationId: primaryMembership?.organizationId,
      organizationSlug: primaryMembership?.organization?.slug,
      organizationName: primaryMembership?.organization?.name,
      organizationStatus: primaryMembership?.organization?.status,
      tenantRole: primaryMembership?.role,
      onboardingStep,
      needsOnboarding,
    };

    // 10. Sign JWT and set HttpOnly cookie
    const token = await signSessionToken(sessionPayload);
    await setSessionCookie(token);

    // 11. Update last login timestamp asynchronously
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }).catch((err) => logger.error('Failed to update lastLoginAt', err));

    // 12. Create Audit Log
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: 'LOGIN',
        entity: 'users',
        entityId: user.id,
        ipAddress: ip,
        userAgent: request.headers.get('user-agent'),
        organizationId: primaryMembership?.organizationId || 'org_default_tanphong',
      },
    }).catch((err) => logger.error('Failed to create audit log for login', err));

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      roles,
      organizationId: primaryMembership?.organizationId,
      needsOnboarding,
    });

    // 13. Return sanitized response (NEVER return passwordHash)
    const sanitizedUser: SanitizedUser = {
      id: user.id,
      email: user.email,
      fullName,
      isActive: user.isActive,
      employeeId: user.employee?.id,
      departmentId: user.employee?.departmentId || null,
      roles,
      permissions,
      lastLoginAt: user.lastLoginAt,
      organizationId: primaryMembership?.organizationId,
      organizationSlug: primaryMembership?.organization?.slug,
      organizationName: primaryMembership?.organization?.name,
      organizationStatus: primaryMembership?.organization?.status,
      tenantRole: primaryMembership?.role,
      onboardingStep,
      needsOnboarding,
    };

    return NextResponse.json({
      success: true,
      data: sanitizedUser,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
