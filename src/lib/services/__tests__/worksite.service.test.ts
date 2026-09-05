import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  worksite: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { WorksiteService } from '@/lib/services/worksite.service';
import { UserSession } from '@/types';

describe('PHASE 8 — WORKSITE MANAGEMENT SERVICE TEST SUITE', () => {
  const adminSession: UserSession = {
    userId: 'usr-admin',
    email: 'admin@antigravity.test',
    fullName: 'Admin System',
    roles: ['admin'],
    permissions: ['all'],
    isActive: true,
  };

  const hrSession: UserSession = {
    userId: 'usr-hr',
    email: 'hr@antigravity.test',
    fullName: 'HR Manager',
    roles: ['hr'],
    permissions: ['all'],
    isActive: true,
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp',
    email: 'emp@antigravity.test',
    fullName: 'Employee Dev',
    roles: ['employee'],
    permissions: ['view'],
    isActive: true,
  };

  const mockWorksite = {
    id: 'ws-001',
    name: 'Trụ sở chính — Antigravity Tower',
    address: 'Tầng 18, Tòa nhà Antigravity, Quận 1, TP. Hồ Chí Minh',
    latitude: new Prisma.Decimal('10.776889'),
    longitude: new Prisma.Decimal('106.700806'),
    radiusMeters: 100,
    isActive: true,
    createdAt: new Date('2026-01-01T08:00:00Z'),
    _count: { employees: 25 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Worksite Query & Retrieval', () => {
    it('should list worksites with pagination and employee count', async () => {
      mockPrisma.worksite.count.mockResolvedValue(1);
      mockPrisma.worksite.findMany.mockResolvedValue([mockWorksite]);

      const result = await WorksiteService.getWorksites({
        isActive: 'ALL',
        page: 1,
        limit: 50,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe(mockWorksite.name);
      expect(result.items[0].latitude).toBe(10.776889);
      expect(result.items[0].longitude).toBe(106.700806);
      expect(result.items[0].radiusMeters).toBe(100);
      expect(result.items[0].activeEmployeeCount).toBe(25);
      expect(result.pagination.total).toBe(1);
    });

    it('should get single worksite by ID', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue(mockWorksite);

      const result = await WorksiteService.getWorksiteById('ws-001');

      expect(result.id).toBe('ws-001');
      expect(result.name).toBe(mockWorksite.name);
      expect(result.activeEmployeeCount).toBe(25);
    });

    it('should throw 404 when worksite not found', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue(null);

      await expect(WorksiteService.getWorksiteById('ws-notfound')).rejects.toThrow(
        'Địa điểm làm việc không tồn tại.'
      );
    });
  });

  describe('2. Worksite Creation & Validation', () => {
    it('should allow HR/Admin to create a new worksite with valid coordinates and radius', async () => {
      mockPrisma.worksite.findFirst.mockResolvedValue(null); // No duplicate name
      mockPrisma.worksite.create.mockResolvedValue({
        id: 'ws-new',
        name: 'Chi Nhánh Hà Nội',
        address: '12 Tràng Tiền, Quận Hoàn Kiếm, Hà Nội',
        latitude: new Prisma.Decimal('21.028511'),
        longitude: new Prisma.Decimal('105.854167'),
        radiusMeters: 150,
        isActive: true,
        createdAt: new Date(),
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await WorksiteService.createWorksite(
        {
          name: 'Chi Nhánh Hà Nội',
          address: '12 Tràng Tiền, Quận Hoàn Kiếm, Hà Nội',
          latitude: 21.028511,
          longitude: 105.854167,
          radiusMeters: 150,
          isActive: true,
        },
        hrSession
      );

      expect(result.id).toBe('ws-new');
      expect(result.name).toBe('Chi Nhánh Hà Nội');
      expect(result.radiusMeters).toBe(150);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_WORKSITE',
            actorId: hrSession.userId,
          }),
        })
      );
    });

    it('should reject creation if duplicate worksite name exists', async () => {
      mockPrisma.worksite.findFirst.mockResolvedValue(mockWorksite);

      await expect(
        WorksiteService.createWorksite(
          {
            name: 'Trụ sở chính — Antigravity Tower',
            address: 'Anywhere',
            latitude: 10.77,
            longitude: 106.7,
            radiusMeters: 100,
            isActive: true,
          },
          adminSession
        )
      ).rejects.toThrow('đã tồn tại');
    });

    it('should reject regular employees without HR/Admin role', async () => {
      await expect(
        WorksiteService.createWorksite(
          {
            name: 'Tự Tạo',
            address: 'Hẻm 123',
            latitude: 10,
            longitude: 106,
            radiusMeters: 100,
            isActive: true,
          },
          employeeSession
        )
      ).rejects.toThrow('Bạn không có quyền quản lý địa điểm làm việc');
    });
  });

  describe('3. Worksite Update & Name Conflict Prevention', () => {
    it('should update coordinates and radius successfully', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue(mockWorksite);
      mockPrisma.worksite.update.mockResolvedValue({
        ...mockWorksite,
        radiusMeters: 200,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const updated = await WorksiteService.updateWorksite(
        'ws-001',
        { radiusMeters: 200 },
        adminSession
      );

      expect(updated.radiusMeters).toBe(200);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE_WORKSITE',
            entityId: 'ws-001',
          }),
        })
      );
    });

    it('should reject updating name to an already existing worksite name', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue(mockWorksite);
      mockPrisma.worksite.findFirst.mockResolvedValue({
        id: 'ws-other',
        name: 'Văn Phòng Khác',
      });

      await expect(
        WorksiteService.updateWorksite(
          'ws-001',
          { name: 'Văn Phòng Khác' },
          adminSession
        )
      ).rejects.toThrow('đã tồn tại');
    });
  });

  describe('4. Deletion Protection & Status Toggle', () => {
    it('should BLOCK deletion when active employees are assigned to the worksite', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue({
        ...mockWorksite,
        _count: { employees: 12 },
      });

      await expect(
        WorksiteService.deleteWorksite('ws-001', adminSession)
      ).rejects.toThrow('Không thể xóa địa điểm này vì hiện đang có 12 nhân viên');
      expect(mockPrisma.worksite.delete).not.toHaveBeenCalled();
    });

    it('should ALLOW deletion when 0 employees are assigned', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue({
        ...mockWorksite,
        _count: { employees: 0 },
      });
      mockPrisma.worksite.delete.mockResolvedValue(mockWorksite);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await WorksiteService.deleteWorksite('ws-001', adminSession);

      expect(result.success).toBe(true);
      expect(mockPrisma.worksite.delete).toHaveBeenCalledWith({ where: { id: 'ws-001' } });
    });

    it('should toggle active/inactive status', async () => {
      mockPrisma.worksite.findUnique.mockResolvedValue(mockWorksite);
      mockPrisma.worksite.update.mockResolvedValue({
        ...mockWorksite,
        isActive: false,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const toggled = await WorksiteService.toggleStatus('ws-001', hrSession);

      expect(toggled.isActive).toBe(false);
      expect(mockPrisma.worksite.update).toHaveBeenCalledWith({
        where: { id: 'ws-001' },
        data: { isActive: false },
      });
    });
  });
});
