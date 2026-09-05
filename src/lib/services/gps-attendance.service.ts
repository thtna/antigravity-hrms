import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { AttendanceService } from '@/lib/services/attendance.service';
import {
  calculateHaversineDistanceMeters,
  checkGeofenceProximity,
  validateGpsAccuracy,
  detectImpossibleTravel,
} from '@/lib/utils/geo';
import { GpsAttendanceInput, GpsVerifyInput } from '@/lib/validations/gps-attendance';

export interface GpsVerificationResult {
  worksite: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  distanceMeters: number;
  allowedRadiusMeters: number;
  isWithinRadius: boolean;
  excessMeters: number;
  accuracyMeters: number;
  isAccuracyValid: boolean;
  accuracyReason?: string;
  canAttend: boolean;
}

export class GpsAttendanceService {
  /**
   * Resolve calling employee record and verify active status.
   */
  private static async resolveEmployee(session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để chấm công GPS.');
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        status: true,
        deletedAt: true,
        worksiteId: true,
        worksite: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
            radiusMeters: true,
            isActive: true,
          },
        },
      },
    });

    if (!employee || employee.deletedAt) {
      throw ApiError.notFound('Hồ sơ nhân viên của bạn không tồn tại trong hệ thống.');
    }

    if (employee.status === 'TERMINATED') {
      throw ApiError.forbidden('Tài khoản nhân viên của bạn đã bị ngưng hoạt động.');
    }

    return employee;
  }

  /**
   * Resolve target worksite for the employee:
   * 1. If preferredWorksiteId is given, verify it exists and is active.
   * 2. If employee has assigned worksite, use it.
   * 3. Fallback: Find the closest active worksite from all active worksites.
   */
  private static async resolveTargetWorksite(
    employee: Awaited<ReturnType<typeof GpsAttendanceService.resolveEmployee>>,
    userLat: number,
    userLng: number,
    preferredWorksiteId?: string
  ) {
    // 1. Explicit preferred worksite requested
    if (preferredWorksiteId) {
      const worksite = await prisma.worksite.findUnique({
        where: { id: preferredWorksiteId },
      });
      if (!worksite) {
        throw ApiError.notFound('Địa điểm làm việc được chỉ định không tồn tại.');
      }
      if (!worksite.isActive) {
        throw ApiError.badRequest(`Địa điểm làm việc "${worksite.name}" hiện đang tạm ngưng hoạt động.`);
      }
      return worksite;
    }

    // 2. Employee has an assigned worksite
    if (employee.worksiteId && employee.worksite) {
      if (!employee.worksite.isActive) {
        throw ApiError.badRequest(
          `Địa điểm làm việc được phân công "${employee.worksite.name}" hiện đang tạm ngưng hoạt động. Vui lòng liên hệ phòng Nhân sự.`
        );
      }
      return employee.worksite;
    }

    // 3. Find closest active worksite among all active worksites
    const activeWorksites = await prisma.worksite.findMany({
      where: { isActive: true },
    });

    if (activeWorksites.length === 0) {
      throw ApiError.badRequest('Hệ thống chưa có địa điểm làm việc nào đang hoạt động.');
    }

    // Sort by geodesic distance to user
    let closestWorksite = activeWorksites[0];
    let minDistance = calculateHaversineDistanceMeters(
      userLat,
      userLng,
      Number(closestWorksite.latitude),
      Number(closestWorksite.longitude)
    );

    for (let i = 1; i < activeWorksites.length; i++) {
      const ws = activeWorksites[i];
      const d = calculateHaversineDistanceMeters(
        userLat,
        userLng,
        Number(ws.latitude),
        Number(ws.longitude)
      );
      if (d < minDistance) {
        minDistance = d;
        closestWorksite = ws;
      }
    }

    return closestWorksite;
  }

  /**
   * VERIFY GPS PROXIMITY & WORKSPACE ELIGIBILITY (Pre-flight check for UI radar/status)
   */
  static async verifyGpsProximity(
    input: GpsVerifyInput,
    session: UserSession
  ): Promise<GpsVerificationResult> {
    const employee = await this.resolveEmployee(session);
    const worksite = await this.resolveTargetWorksite(
      employee,
      input.latitude,
      input.longitude,
      input.worksiteId
    );

    const wsLat = Number(worksite.latitude);
    const wsLng = Number(worksite.longitude);
    const wsRadius = worksite.radiusMeters;

    const geofence = checkGeofenceProximity(
      input.latitude,
      input.longitude,
      wsLat,
      wsLng,
      wsRadius
    );

    const accuracyVal = validateGpsAccuracy(input.accuracy, wsRadius);

    const canAttend = geofence.isWithinRadius && accuracyVal.isValid;

    return {
      worksite: {
        id: worksite.id,
        name: worksite.name,
        address: worksite.address,
        latitude: wsLat,
        longitude: wsLng,
        radiusMeters: wsRadius,
      },
      distanceMeters: geofence.distanceMeters,
      allowedRadiusMeters: wsRadius,
      isWithinRadius: geofence.isWithinRadius,
      excessMeters: geofence.excessMeters,
      accuracyMeters: input.accuracy,
      isAccuracyValid: accuracyVal.isValid,
      accuracyReason: accuracyVal.reason,
      canAttend,
    };
  }

  /**
   * Check for impossible travel velocity jumps against recent attendance actions.
   */
  private static async checkVelocityAnomaly(
    employeeId: string,
    currentLat: number,
    currentLng: number,
    now: Date
  ) {
    // Look up today's or previous recent attendance with coordinates
    const recentAttendance = await prisma.attendance.findFirst({
      where: {
        employeeId,
        OR: [
          { checkOutLat: { not: null } },
          { checkInLat: { not: null } },
        ],
      },
      orderBy: { workDate: 'desc' },
    });

    if (!recentAttendance) return;

    // Pick the most recent coordinate & timestamp
    let lastLat: number | null = null;
    let lastLng: number | null = null;
    let lastTime: Date | null = null;

    if (recentAttendance.checkOutTime && recentAttendance.checkOutLat && recentAttendance.checkOutLng) {
      lastLat = Number(recentAttendance.checkOutLat);
      lastLng = Number(recentAttendance.checkOutLng);
      lastTime = recentAttendance.checkOutTime;
    } else if (recentAttendance.checkInTime && recentAttendance.checkInLat && recentAttendance.checkInLng) {
      lastLat = Number(recentAttendance.checkInLat);
      lastLng = Number(recentAttendance.checkInLng);
      lastTime = recentAttendance.checkInTime;
    }

    if (lastLat !== null && lastLng !== null && lastTime !== null) {
      const travel = detectImpossibleTravel(
        lastLat,
        lastLng,
        lastTime,
        currentLat,
        currentLng,
        now,
        800 // max 800 km/h
      );

      if (travel.isImpossible) {
        logger.warn('GPS velocity jump / spoofing anomaly detected', {
          employeeId,
          lastLat,
          lastLng,
          currentLat,
          currentLng,
          elapsedHours: travel.elapsedHours,
          speedKmPerHour: travel.speedKmPerHour,
        });

        throw ApiError.badRequest(
          `Phát hiện thay đổi tọa độ bất thường với vận tốc phi thực tế (${travel.speedKmPerHour} km/h qua ${travel.distanceKm} km). Thao tác chấm công bị từ chối để bảo mật.`
        );
      }
    }
  }

  /**
   * EXECUTE GPS ATTENDANCE (Check-In or Check-Out)
   */
  static async attendWithGps(input: GpsAttendanceInput, session: UserSession) {
    const employee = await this.resolveEmployee(session);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const todayDate = new Date(todayStr);

    // 1. Resolve Worksite
    const worksite = await this.resolveTargetWorksite(
      employee,
      input.latitude,
      input.longitude,
      input.worksiteId
    );

    const wsLat = Number(worksite.latitude);
    const wsLng = Number(worksite.longitude);
    const wsRadius = worksite.radiusMeters;

    // 2. Strict Server-Side Accuracy Validation
    const accuracyCheck = validateGpsAccuracy(input.accuracy, wsRadius);
    if (!accuracyCheck.isValid) {
      throw ApiError.badRequest(accuracyCheck.reason || 'Độ chính xác GPS không đạt tiêu chuẩn.');
    }

    // 3. Strict Server-Side Geofence Validation
    const geofence = checkGeofenceProximity(
      input.latitude,
      input.longitude,
      wsLat,
      wsLng,
      wsRadius
    );

    if (!geofence.isWithinRadius) {
      throw ApiError.badRequest(
        `Bạn đang ở ngoài khu vực làm việc của "${worksite.name}". Khoảng cách hiện tại: ${Math.round(geofence.distanceMeters)}m, bán kính cho phép: ${wsRadius}m (vượt quá ${Math.round(geofence.excessMeters)}m).`
      );
    }

    // 4. Anti-Spoofing: Velocity Anomaly Check
    await this.checkVelocityAnomaly(employee.id, input.latitude, input.longitude, now);

    // 5. Determine Action (CHECK_IN or CHECK_OUT)
    let action = input.action;
    const existingAttendance = await prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate: todayDate } },
    });

    if (!action) {
      if (!existingAttendance || !existingAttendance.checkInTime) {
        action = 'CHECK_IN';
      } else if (!existingAttendance.checkOutTime) {
        action = 'CHECK_OUT';
      } else {
        throw ApiError.conflict(
          `Bạn đã hoàn thành cả Check-in (${existingAttendance.checkInTime.toLocaleTimeString('vi-VN')}) và Check-out (${existingAttendance.checkOutTime.toLocaleTimeString('vi-VN')}) hôm nay.`
        );
      }
    }

    // 6. Execute Atomic Attendance via AttendanceService
    const noteSuffix = `[GPS: ${worksite.name}, d=${Math.round(geofence.distanceMeters)}m, acc=±${Math.round(input.accuracy)}m]`;
    const formattedNotes = input.notes ? `${noteSuffix} ${input.notes}` : noteSuffix;

    let attendanceRecord;

    if (action === 'CHECK_IN') {
      attendanceRecord = await AttendanceService.checkIn(
        {
          employeeId: employee.id,
          workDate: todayStr,
          checkInTime: now.toISOString(),
          checkInMethod: 'GPS',
          checkInLat: input.latitude,
          checkInLng: input.longitude,
          notes: formattedNotes,
        },
        session
      );
    } else {
      attendanceRecord = await AttendanceService.checkOut(
        {
          employeeId: employee.id,
          workDate: todayStr,
          checkOutTime: now.toISOString(),
          checkOutMethod: 'GPS',
          checkOutLat: input.latitude,
          checkOutLng: input.longitude,
          notes: formattedNotes,
        },
        session
      );
    }

    logger.info('GPS attendance processed successfully', {
      action,
      employeeId: employee.id,
      worksiteId: worksite.id,
      distanceMeters: geofence.distanceMeters,
      accuracyMeters: input.accuracy,
      actor: session.userId,
    });

    return {
      action,
      worksite: {
        id: worksite.id,
        name: worksite.name,
        address: worksite.address,
      },
      distanceMeters: geofence.distanceMeters,
      accuracyMeters: input.accuracy,
      attendance: attendanceRecord,
    };
  }
}
