import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPrisma = vi.hoisted(() => ({
  employee: {
    findUnique: vi.fn(),
  },
  worksite: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  attendance: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock AttendanceService checkIn and checkOut
vi.mock('@/lib/services/attendance.service', () => ({
  AttendanceService: {
    checkIn: vi.fn(),
    checkOut: vi.fn(),
  },
}));

import { GpsAttendanceService } from '@/lib/services/gps-attendance.service';
import { AttendanceService } from '@/lib/services/attendance.service';
import {
  calculateHaversineDistanceMeters,
  validateGpsAccuracy,
  detectImpossibleTravel,
} from '@/lib/utils/geo';
import { UserSession } from '@/types';

describe('PHASE 8 — GPS ATTENDANCE SERVICE TEST SUITE', () => {
  const session: UserSession = {
    userId: 'usr-emp-01',
    email: 'dev@antigravity.test',
    fullName: 'Thành Nguyễn',
    roles: ['employee'],
    permissions: ['view'],
    isActive: true,
  };

  // Antigravity Tower HCM: 10.776889, 106.700806
  const hcmWorksite = {
    id: 'ws-hcm',
    name: 'Trụ sở Antigravity Tower HCM',
    address: 'Quận 1, TP. Hồ Chí Minh',
    latitude: new Prisma.Decimal('10.776889'),
    longitude: new Prisma.Decimal('106.700806'),
    radiusMeters: 100,
    isActive: true,
  };

  const activeEmployee = {
    id: 'emp-01',
    employeeCode: 'AG-001',
    firstName: 'Thành',
    lastName: 'Nguyễn',
    status: 'ACTIVE',
    deletedAt: null,
    worksiteId: 'ws-hcm',
    worksite: hcmWorksite,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Geodesic & Haversine Mathematics', () => {
    it('should return 0 meters for identical coordinates', () => {
      const distance = calculateHaversineDistanceMeters(10.776889, 106.700806, 10.776889, 106.700806);
      expect(distance).toBe(0);
    });

    it('should calculate accurate distance between known Ho Chi Minh City landmarks', () => {
      // Bitexco Financial Tower (10.7717, 106.7044) to Landmark 81 (10.7951, 106.7218)
      // Known geodesic distance is approximately 3.25 km (3,250 meters)
      const distance = calculateHaversineDistanceMeters(10.7717, 106.7044, 10.7951, 106.7218);
      expect(distance).toBeGreaterThan(3100);
      expect(distance).toBeLessThan(3400);
    });

    it('should accurately calculate small office boundary distances', () => {
      // Small shift in latitude (~0.00045 deg ~= 50 meters)
      const distance = calculateHaversineDistanceMeters(10.776889, 106.700806, 10.777339, 106.700806);
      expect(distance).toBeGreaterThan(45);
      expect(distance).toBeLessThan(55);
    });
  });

  describe('2. GPS Fix Accuracy Verification', () => {
    it('should accept high accuracy GPS fixes (e.g. 15 meters)', () => {
      const result = validateGpsAccuracy(15, 100);
      expect(result.isValid).toBe(true);
    });

    it('should reject inaccurate GPS fixes exceeding threshold (e.g. 180 meters)', () => {
      const result = validateGpsAccuracy(180, 100);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Độ chính xác GPS quá thấp');
    });

    it('should reject negative GPS accuracy values', () => {
      const result = validateGpsAccuracy(-5, 100);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('không hợp lệ');
    });
  });

  describe('3. GPS Proximity Verification Pre-Flight Check', () => {
    it('should report canAttend: true when user is 25m inside 100m geofence with 10m accuracy', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      // Coordinates ~25m away from worksite center
      const userLat = 10.7771;
      const userLng = 106.700806;

      const result = await GpsAttendanceService.verifyGpsProximity(
        {
          latitude: userLat,
          longitude: userLng,
          accuracy: 10,
        },
        session
      );

      expect(result.isWithinRadius).toBe(true);
      expect(result.isAccuracyValid).toBe(true);
      expect(result.canAttend).toBe(true);
      expect(result.distanceMeters).toBeLessThan(100);
      expect(result.worksite.name).toBe(hcmWorksite.name);
    });

    it('should report canAttend: false and excess meters when outside geofence', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      // Coordinates ~300m away
      const userLat = 10.7800;
      const userLng = 106.700806;

      const result = await GpsAttendanceService.verifyGpsProximity(
        {
          latitude: userLat,
          longitude: userLng,
          accuracy: 15,
        },
        session
      );

      expect(result.isWithinRadius).toBe(false);
      expect(result.canAttend).toBe(false);
      expect(result.distanceMeters).toBeGreaterThan(100);
      expect(result.excessMeters).toBeGreaterThan(0);
    });
  });

  describe('4. Server-Side GPS Check-In Execution', () => {
    it('should successfully execute GPS check-in when inside worksite radius', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findFirst.mockResolvedValue(null); // No prior action today (velocity ok)
      mockPrisma.attendance.findUnique.mockResolvedValue(null); // No checkin yet today

      vi.mocked(AttendanceService.checkIn).mockResolvedValue({
        id: 'att-gps-01',
        employeeId: 'emp-01',
        workDate: '2026-09-04',
        checkInTime: new Date(),
        checkInMethod: 'GPS',
        checkInLat: 10.7769,
        checkInLng: 106.7008,
        status: 'ON_TIME',
        actualWorkHours: 0,
        otHours: 0,
      } as any);

      const result = await GpsAttendanceService.attendWithGps(
        {
          action: 'CHECK_IN',
          latitude: 10.7769,
          longitude: 106.700806,
          accuracy: 12,
          notes: 'Vào ca sáng',
        },
        session
      );

      expect(result.action).toBe('CHECK_IN');
      expect(result.worksite.name).toBe(hcmWorksite.name);
      expect(AttendanceService.checkIn).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-01',
          checkInMethod: 'GPS',
          checkInLat: 10.7769,
          checkInLng: 106.700806,
        }),
        session
      );
    });

    it('should REJECT check-in when user is outside the allowed geofence radius', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findFirst.mockResolvedValue(null);
      mockPrisma.attendance.findUnique.mockResolvedValue(null);

      // Coordinates 500m away
      await expect(
        GpsAttendanceService.attendWithGps(
          {
            action: 'CHECK_IN',
            latitude: 10.782,
            longitude: 106.700806,
            accuracy: 15,
          },
          session
        )
      ).rejects.toThrow('Bạn đang ở ngoài khu vực làm việc');

      expect(AttendanceService.checkIn).not.toHaveBeenCalled();
    });

    it('should REJECT check-in when GPS accuracy is too low (e.g. ±200m)', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      await expect(
        GpsAttendanceService.attendWithGps(
          {
            action: 'CHECK_IN',
            latitude: 10.7769,
            longitude: 106.700806,
            accuracy: 200, // Too inaccurate
          },
          session
        )
      ).rejects.toThrow('Độ chính xác GPS quá thấp');

      expect(AttendanceService.checkIn).not.toHaveBeenCalled();
    });

    it('should REJECT check-in when worksite is inactive', async () => {
      const inactiveEmployee = {
        ...activeEmployee,
        worksite: {
          ...hcmWorksite,
          isActive: false,
        },
      };
      mockPrisma.employee.findUnique.mockResolvedValue(inactiveEmployee);

      await expect(
        GpsAttendanceService.attendWithGps(
          {
            action: 'CHECK_IN',
            latitude: 10.7769,
            longitude: 106.700806,
            accuracy: 10,
          },
          session
        )
      ).rejects.toThrow('hiện đang tạm ngưng hoạt động');
    });
  });

  describe('5. GPS Check-Out Execution', () => {
    it('should successfully execute GPS check-out when inside worksite radius', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      mockPrisma.attendance.findFirst.mockResolvedValue(null);
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-gps-01',
        employeeId: 'emp-01',
        checkInTime: new Date(Date.now() - 8 * 3600 * 1000), // Checked in 8h ago
        checkOutTime: null,
      });

      vi.mocked(AttendanceService.checkOut).mockResolvedValue({
        id: 'att-gps-01',
        employeeId: 'emp-01',
        workDate: '2026-09-04',
        checkOutTime: new Date(),
        checkOutMethod: 'GPS',
        checkOutLat: 10.7769,
        checkOutLng: 106.7008,
        status: 'ON_TIME',
        actualWorkHours: 8,
        otHours: 0,
      } as any);

      const result = await GpsAttendanceService.attendWithGps(
        {
          action: 'CHECK_OUT',
          latitude: 10.7769,
          longitude: 106.700806,
          accuracy: 10,
        },
        session
      );

      expect(result.action).toBe('CHECK_OUT');
      expect(AttendanceService.checkOut).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-01',
          checkOutMethod: 'GPS',
        }),
        session
      );
    });
  });

  describe('6. Anti-Spoofing: Impossible Travel / Velocity Anomaly Detection', () => {
    it('should calculate velocity accurately and detect impossible teleportation (> 800 km/h)', () => {
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      // Point 1: HCM (10.77, 106.70), Point 2: Hanoi (21.02, 105.85) ~ 1,150 km in 10 minutes
      const result = detectImpossibleTravel(
        10.776889,
        106.700806,
        tenMinutesAgo,
        21.028511,
        105.854167,
        now
      );

      expect(result.isImpossible).toBe(true);
      expect(result.speedKmPerHour).toBeGreaterThan(6000); // ~ 6,900 km/h
    });

    it('should ALLOW realistic commuting speed (e.g. 30 km/h over 30 minutes)', () => {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

      // Distance ~15 km in 30 minutes = 30 km/h
      const result = detectImpossibleTravel(
        10.776889,
        106.700806,
        thirtyMinutesAgo,
        10.876889,
        106.700806,
        now
      );

      expect(result.isImpossible).toBe(false);
      expect(result.speedKmPerHour).toBeLessThan(100);
    });

    it('should BLOCK GPS check-in if recent action displays impossible teleportation velocity', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      // Previous attendance was recorded in Hanoi 5 minutes ago!
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      mockPrisma.attendance.findFirst.mockResolvedValue({
        id: 'att-prev',
        checkInTime: fiveMinutesAgo,
        checkInLat: new Prisma.Decimal('21.028511'),
        checkInLng: new Prisma.Decimal('105.854167'),
      });

      // Now attempting to check in at HCM
      await expect(
        GpsAttendanceService.attendWithGps(
          {
            action: 'CHECK_IN',
            latitude: 10.7769,
            longitude: 106.700806,
            accuracy: 10,
          },
          session
        )
      ).rejects.toThrow('Phát hiện thay đổi tọa độ bất thường');
    });
  });

  describe('7. Inactive Employee Protection', () => {
    it('should BLOCK terminated employee from GPS attendance', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        ...activeEmployee,
        status: 'TERMINATED',
      });

      await expect(
        GpsAttendanceService.attendWithGps(
          {
            action: 'CHECK_IN',
            latitude: 10.7769,
            longitude: 106.700806,
            accuracy: 10,
          },
          session
        )
      ).rejects.toThrow('Tài khoản nhân viên của bạn đã bị ngưng hoạt động');
    });
  });
});
