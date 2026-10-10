import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import type { Prisma } from '@prisma/client';
import type { UserSession } from '@/types';

// This live authority boundary must never execute in a browser.
if (typeof window !== 'undefined') {
  throw new Error('Platform authority is server-only.');
}

export function assertPlatformSession(session: UserSession): void {
  if (!session?.userId || session.isActive !== true || session.organizationId !== null ||
      !Array.isArray(session.roles) || !session.roles.includes('super_admin')) {
    throw ApiError.forbidden('Chỉ SUPER_ADMIN mới có quyền truy cập chức năng này.');
  }
}

export async function requireLivePlatformAuthority(
  session: UserSession,
  db: Pick<Prisma.TransactionClient, 'user'> = prisma
): Promise<void> {
  assertPlatformSession(session);
  const actor = await db.user.findUnique({
    where: { id: session.userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!actor || actor.id !== session.userId || actor.isActive !== true ||
      actor.deletedAt !== null || !Array.isArray(actor.userRoles) ||
      !actor.userRoles.some((grant) => grant?.role?.code === 'super_admin')) {
    throw ApiError.forbidden('Live canonical Platform authority is required.');
  }
}
