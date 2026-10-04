import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UserSession } from '@/types';

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGenerateQrToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/services/qr-attendance.service', () => ({
  QrAttendanceService: {
    generateQrToken: mockGenerateQrToken,
  },
}));

import { POST } from '@/app/api/v1/attendance/qr/generate/route';

function makeSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    userId: 'usr-kiosk-route',
    email: 'kiosk-route@antigravity.test',
    fullName: 'Kiosk Route User',
    roles: ['employee'],
    permissions: [],
    organizationId: 'org-kiosk-route',
    isActive: true,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost:3000/api/v1/attendance/qr/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenType: 'ANY', ...body }),
  });
}

describe('R1B QR generation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQrToken.mockResolvedValue({
      tokenId: 'token-route-test',
      code: 'route-test-code',
      qrPayload: '{}',
      qrDataUrl: 'data:image/png;base64,test',
    });
  });

  it.each([
    ['employee', ['employee'] as UserSession['roles']],
    ['manager', ['manager'] as UserSession['roles']],
    ['hr without an explicit kiosk grant', ['hr'] as UserSession['roles']],
  ])('denies %s by default', async (_label, roles) => {
    mockGetSession.mockResolvedValue(makeSession({ roles, permissions: [] }));

    const response = await POST(makeRequest());

    expect(response.status).toBe(403);
    expect(mockGenerateQrToken).not.toHaveBeenCalled();
  });

  it('allows a tenant-bound user with the explicit canonical kiosk permission', async () => {
    const session = makeSession({ permissions: ['attendance:kiosk'] });
    mockGetSession.mockResolvedValue(session);

    const response = await POST(makeRequest());

    expect(response.status).toBe(201);
    expect(mockGenerateQrToken).toHaveBeenCalledWith(
      expect.objectContaining({ tokenType: 'ANY' }),
      session
    );
  });

  it('preserves the canonical tenant admin permission bypass', async () => {
    const session = makeSession({ roles: ['admin'], permissions: [] });
    mockGetSession.mockResolvedValue(session);

    const response = await POST(makeRequest());

    expect(response.status).toBe(201);
    expect(mockGenerateQrToken).toHaveBeenCalledWith(expect.any(Object), session);
  });

  it('rejects a client organization override before QR generation', async () => {
    const session = makeSession({ permissions: ['attendance:kiosk'] });
    mockGetSession.mockResolvedValue(session);

    const response = await POST(makeRequest({ organizationId: 'org-attacker' }));

    expect(response.status).toBe(422);
    expect(mockGenerateQrToken).not.toHaveBeenCalled();
  });
});
