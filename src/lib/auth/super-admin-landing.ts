import { isSuperAdmin } from './roles';

export const SUPER_ADMIN_LANDING_PATH = '/super-admin';

type RoleBearingUser = {
  roles?: unknown[];
  needsOnboarding?: boolean;
} | null | undefined;

export function isDefaultDashboardLandingPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/dashboard';
}

export function shouldRedirectSuperAdminToPortal(
  user: RoleBearingUser,
  pathname: string
): boolean {
  return isSuperAdmin(user) && isDefaultDashboardLandingPath(pathname);
}

export function resolvePostLoginRedirect(user: RoleBearingUser, redirect: string): string {
  const hasSuperAdminRole = isSuperAdmin(user);

  if (hasSuperAdminRole && isDefaultDashboardLandingPath(redirect)) {
    return SUPER_ADMIN_LANDING_PATH;
  }

  if (!hasSuperAdminRole && user?.needsOnboarding) {
    return '/onboarding';
  }

  return redirect === '/' ? '/dashboard' : redirect;
}
