'use client';

import { useState, useCallback } from 'react';

/**
 * Standardized client-side logout hook.
 * Calls POST /api/v1/auth/logout to invalidate the session cookie and write an audit record.
 *
 * Safety invariants:
 * 1. Only redirects after confirmed successful logout response (res.ok).
 * 2. Uses window.location.replace('/login') instead of href so the authenticated page
 *    is replaced in browser history rather than retained as an immediate Back target.
 * 3. Does not redirect if the network request fails, allowing retry.
 */
export function useLogout() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || 'Đăng xuất không thành công.');
      }

      // Confirmed successful server response: overwrite history entry with /login
      window.location.replace('/login');
    } catch (err: any) {
      console.error('Logout failed:', err);
      setError(err.message || 'Lỗi kết nối khi đăng xuất.');
      setLoggingOut(false);
    }
  }, [loggingOut]);

  return { logout, loggingOut, error };
}
