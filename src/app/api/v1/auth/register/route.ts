import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { validateRequest } from '@/lib/validations';
import { ApiError, handleApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { ApiResponse } from '@/types';

const RegisterSchema = z.object({
  companyName: z.string().min(3, 'Tên doanh nghiệp phải có ít nhất 3 ký tự'),
  taxCode: z.string().min(8, 'Mã số thuế không hợp lệ').max(20, 'Mã số thuế quá dài').optional().or(z.literal('')),
  fullName: z.string().min(2, 'Họ và tên người đại diện không được để trống'),
  email: z.string().email('Email làm việc không đúng định dạng'),
  phone: z.string().min(8, 'Số điện thoại không hợp lệ').max(20, 'Số điện thoại quá dài').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  password: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất 1 chữ cái viết hoa')
    .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 chữ số'),
});

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${base || 'corp'}-${randomSuffix}`;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<{ organizationId: string; status: string }>>> {
  try {
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateKey = `register:${ip}`;

    // Rate limiting: Max 3 registration attempts per hour per IP
    const rateCheck = checkRateLimit(rateKey, 3, 3600);
    if (!rateCheck.success) {
      throw ApiError.badRequest(
        `Quá nhiều lượt đăng ký từ địa chỉ này. Vui lòng thử lại sau ${rateCheck.resetTime} giây.`
      );
    }

    const body = await request.json().catch(() => ({}));
    const validated = await validateRequest(RegisterSchema, body);

    const email = validated.email.toLowerCase().trim();

    // 1. Check if email already registered
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw ApiError.badRequest('Email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.');
    }

    // 2. Check if tax code already exists (if provided)
    if (validated.taxCode && validated.taxCode.trim().length > 0) {
      const existingTax = await prisma.organization.findFirst({
        where: { taxCode: validated.taxCode.trim() },
      });
      if (existingTax) {
        throw ApiError.badRequest('Mã số thuế này đã được đăng ký bởi một doanh nghiệp khác.');
      }
    }

    // 3. Hash password
    const passwordHash = await hashPassword(validated.password);
    const slug = generateSlug(validated.companyName);

    // 4. Split full name into first/last name
    const parts = validated.fullName.trim().split(/\s+/);
    const firstName = parts.length > 1 ? parts.pop()! : parts[0];
    const lastName = parts.join(' ') || 'Chủ sở hữu';

    // 5. Transaction: Create Organization (PENDING), User, OrganizationMember (OWNER), Branch
    const result = await prisma.$transaction(async (tx) => {
      // 5.1 Create Organization with PENDING status
      const org = await tx.organization.create({
        data: {
          name: validated.companyName.trim(),
          slug,
          taxCode: validated.taxCode?.trim() || null,
          email,
          phone: validated.phone?.trim() || null,
          address: validated.address?.trim() || null,
          status: 'PENDING', // STRICT REQUIREMENT: PENDING by default
        },
      });

      // 5.2 Create User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          isActive: true,
        },
      });

      // 5.3 Assign System Admin Role
      const adminRole = await tx.role.findUnique({ where: { code: 'admin' } });
      if (adminRole) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: adminRole.id,
          },
        });
      }

      // 5.4 Create OrganizationMember with role OWNER
      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'OWNER',
          isActive: true,
        },
      });

      // 5.5 Audit Log (Clean workspace: 0 employees, 0 branches, 0 departments, 0 positions)

      // 5.7 Audit Log
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          actorId: user.id,
          action: 'ORGANIZATION_REGISTER',
          entity: 'organizations',
          entityId: org.id,
          ipAddress: ip,
          userAgent: request.headers.get('user-agent'),
        },
      });

      return { org, user };
    });

    logger.info('New business registered (PENDING)', {
      orgId: result.org.id,
      companyName: result.org.name,
      email,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          organizationId: result.org.id,
          status: 'PENDING',
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
