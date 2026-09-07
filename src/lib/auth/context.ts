/**
 * PHASE 6 — Hard Tenant Isolation Context
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized helpers that every business service MUST use to extract and
 * validate the current request's tenant context from the authenticated session.
 *
 * Design principles:
 *  - ALL context helpers are async server-only functions.
 *  - Missing / mismatched organizationId always results in HTTP 404 (not 403)
 *    to prevent existence leakage (IDOR prevention).
 *  - SUPER_ADMIN bypasses tenant scoping when explicitly opted in.
 *  - No client-side organizationId accepted; only the JWT-derived session value.
 */

import { getSession } from './session';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import { isSuperAdmin } from './roles';
import { prisma } from '@/lib/db/prisma';

// ─── Exported Types ───────────────────────────────────────────────────────────

export interface TenantContext {
  session: UserSession;
  organizationId: string;
  /** True when the actor is a SUPER_ADMIN (bypasses tenant rules) */
  isSuperAdmin: boolean;
}

export interface ResourceOwnershipOptions {
  /** Custom error message (defaults to generic 404) */
  errorMessage?: string;
  /** Allow SUPER_ADMIN to bypass tenant ownership check */
  allowSuperAdmin?: boolean;
}

// ─── Core Context Helpers ─────────────────────────────────────────────────────

/**
 * getCurrentUser
 * Returns the current authenticated user session.
 * Throws HTTP 401 if not authenticated, HTTP 403 if account inactive.
 */
export async function getCurrentUser(): Promise<UserSession> {
  const session = await getSession();

  if (!session) {
    throw ApiError.unauthorized('Yêu cầu xác thực tài khoản. Vui lòng đăng nhập.');
  }

  if (!session.isActive) {
    throw ApiError.forbidden(
      'Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.'
    );
  }

  return session;
}

/**
 * getCurrentOrganization
 * Returns the organization record of the authenticated user.
 * Throws if org not found or not ACTIVE (suspended/closed tenants cannot operate).
 */
export async function getCurrentOrganization() {
  const session = await getCurrentUser();

  // SUPER_ADMIN has no home org
  if (isSuperAdmin(session)) {
    throw ApiError.badRequest(
      'SUPER_ADMIN không thuộc tổ chức nào. Dùng getCurrentUser() cho Super Admin context.'
    );
  }

  const orgId = session.organizationId ?? '__no_org__';

  const org = await prisma.organization.findFirst({
    where: { id: orgId, deletedAt: null },
  });

  if (!org) {
    throw ApiError.notFound('Tổ chức không tồn tại hoặc đã bị xóa.');
  }

  if (org.status !== 'ACTIVE') {
    throw ApiError.forbidden(
      `Tổ chức đang ở trạng thái [${org.status}]. Vui lòng liên hệ SUPER_ADMIN để kích hoạt.`
    );
  }

  return org;
}

/**
 * getCurrentMembership
 * Returns the OrganizationMember record of the authenticated user within their tenant.
 * Throws if membership not found (deactivated / removed member).
 */
export async function getCurrentMembership() {
  const session = await getCurrentUser();

  const orgId = session.organizationId ?? '__no_org__';

  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: session.userId,
      organizationId: orgId,
    },
    include: {
      organization: {
        select: { id: true, name: true, status: true },
      },
    },
  });

  if (!membership) {
    throw ApiError.forbidden(
      'Bạn không còn là thành viên của tổ chức này. Vui lòng liên hệ quản trị viên.'
    );
  }

  return membership;
}

/**
 * getCurrentTenantContext
 * THE MAIN ENTRY POINT for all business services.
 *
 * Returns a TenantContext with:
 *  - session: full authenticated session
 *  - organizationId: the verified tenant scope (never null — fails-safe to '__no_org__')
 *  - isSuperAdmin: whether the actor has global bypass
 *
 * Business services MUST destructure { organizationId } from this context and
 * inject it into EVERY Prisma where clause.
 */
export async function getCurrentTenantContext(): Promise<TenantContext> {
  const session = await getCurrentUser();
  const superAdmin = isSuperAdmin(session);

  // SUPER_ADMIN context: no org scoping required
  if (superAdmin) {
    return {
      session,
      organizationId: '__super_admin__', // sentinel — SUPER_ADMIN queries don't use this
      isSuperAdmin: true,
    };
  }

  const organizationId = session.organizationId ?? '__no_org__';

  return {
    session,
    organizationId,
    isSuperAdmin: false,
  };
}

// ─── Anti-IDOR Resource Ownership Verification ───────────────────────────────

/**
 * assertTenantOwnership
 * Verifies that a fetched resource belongs to the current tenant.
 * Returns the resource if valid, throws HTTP 404 if not (prevents existence leakage).
 *
 * Usage in services:
 *   const employee = await prisma.employee.findUnique({ where: { id } });
 *   return assertTenantOwnership(employee, session, id, 'employee');
 *
 * NOTE: Prefer findFirst({ where: { id, organizationId } }) over this pattern
 * where possible — it's more efficient and prevents the extra DB round trip.
 */
export function assertTenantOwnership<T extends { organizationId: string | null }>(
  resource: T | null,
  context: { organizationId: string; isSuperAdmin: boolean },
  resourceId: string,
  resourceType = 'resource',
  options: ResourceOwnershipOptions = {}
): T {
  // Deleted / not found
  if (!resource) {
    throw ApiError.notFound(
      options.errorMessage ?? `${resourceType} không tồn tại hoặc đã bị xóa [ID: ${resourceId}].`
    );
  }

  // SUPER_ADMIN bypass
  if (options.allowSuperAdmin !== false && context.isSuperAdmin) {
    return resource;
  }

  // Tenant mismatch → 404 (not 403) to prevent existence leakage
  if (resource.organizationId !== context.organizationId) {
    throw ApiError.notFound(
      options.errorMessage ??
        `${resourceType} không tồn tại hoặc đã bị xóa [ID: ${resourceId}].`
    );
  }

  return resource;
}

/**
 * buildTenantScope
 * Produces a Prisma `where` fragment that always includes organizationId.
 * Use this as the base for every list / findFirst / count query.
 *
 * @example
 *   const where = { ...buildTenantScope(ctx), status: 'ACTIVE' };
 */
export function buildTenantScope(ctx: TenantContext): { organizationId: string } {
  if (ctx.isSuperAdmin) {
    // SUPER_ADMIN can query across tenants; caller must add their own filter
    throw new Error(
      'buildTenantScope() cannot be called from SUPER_ADMIN context. Add organizationId manually.'
    );
  }
  return { organizationId: ctx.organizationId };
}

/**
 * buildTenantScopedWhere
 * Safe version that accepts an explicit organizationId (avoids isSuperAdmin check).
 * Prefer over buildTenantScope in service methods that receive session directly.
 */
export function buildTenantScopedWhere(
  session: UserSession,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...extra,
    organizationId: session.organizationId ?? '__no_org__',
  };
}
