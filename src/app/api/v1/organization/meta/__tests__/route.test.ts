import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserSession } from '@/types';

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  department: {
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
  position: {
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
  worksite: {
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
  },
}));

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mockRequireAuth,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: mockPrisma,
}));

import { GET } from '@/app/api/v1/organization/meta/route';

describe('Phase 5I-B organization metadata read route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeTenantSession(): UserSession {
    return {
      userId: 'usr-meta-owner',
      email: 'owner@meta.test',
      fullName: 'Meta Owner',
      roles: ['admin'],
      permissions: [],
      organizationId: 'org-empty-meta',
      tenantRole: 'OWNER',
      isActive: true,
    };
  }

  it('returns empty metadata collections for an empty tenant without creating business rows', async () => {
    mockRequireAuth.mockResolvedValue(makeTenantSession());
    mockPrisma.department.findMany.mockResolvedValue([]);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.worksite.findMany.mockResolvedValue([]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      departments: [],
      positions: [],
      worksites: [],
    });
    expect(mockPrisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-empty-meta' } })
    );
    expect(mockPrisma.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-empty-meta' } })
    );
    expect(mockPrisma.worksite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-empty-meta', isActive: true } })
    );
    expect(mockPrisma.department.create).not.toHaveBeenCalled();
    expect(mockPrisma.department.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).not.toHaveBeenCalled();
    expect(mockPrisma.position.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.worksite.create).not.toHaveBeenCalled();
    expect(mockPrisma.worksite.createMany).not.toHaveBeenCalled();
  });
});
