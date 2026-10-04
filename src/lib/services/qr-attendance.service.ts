/**
 * PHASE 7 — QR ATTENDANCE SERVICE
 *
 * Provides:
 * 1. Cryptographic Rotating Dynamic QR Token Generation (HMAC-SHA256, Anti-Replay Nonce, Expiration)
 * 2. Kiosk Dynamic QR Payload Creation with DataURL image generation
 * 3. Strict Verification Pipeline (Authentication, Employee Status, Signature, Expiration, Anti-Replay, State)
 * 4. Atomic Check-In / Check-Out Execution with AttendanceService Integration
 */

import crypto from 'crypto';
import QRCode from 'qrcode';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { ApiError } from '@/lib/errors';
import { UserSession } from '@/types';
import { AttendanceService } from '@/lib/services/attendance.service';
import {
  formatBusinessTime,
  getBusinessDateString,
  parseBusinessDate,
} from '@/lib/time/business-time';
import {
  GenerateQrTokenInput,
  QrTokenPayload,
  QrTokenPayloadSchema,
  ScanQrAttendanceInput,
  QrTokenQueryParams,
} from '@/lib/validations/qr-attendance';

/**
 * Resolves the cryptographic secret used for signing and verifying dynamic QR tokens.
 *
 * Fail-Closed Security Requirements:
 * - Production (APP_ENV === 'production' or NODE_ENV === 'production'):
 *   QR_SECRET MUST be explicitly configured. If missing or empty, fail closed (throw configuration error).
 *   Silent fallback to JWT_SECRET or hardcoded secret is strictly forbidden.
 * - Non-Production (dev/test):
 *   Prefers explicit QR_SECRET. If missing, fallback to AUTH_SECRET is permitted ONLY outside Production.
 *   If neither is configured, fail closed. No hardcoded secret is permitted.
 */
export function getQrSecret(): string {
  const isProduction =
    process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  const qrSecret = process.env.QR_SECRET?.trim();

  if (isProduction) {
    if (!qrSecret) {
      throw ApiError.internal(
        'Cấu hình bảo mật lỗi: QR_SECRET bắt buộc phải được thiết lập trong môi trường Production.'
      );
    }
    return qrSecret;
  }

  // Non-production fallback logic:
  if (qrSecret) {
    return qrSecret;
  }

  const authSecret = process.env.AUTH_SECRET?.trim();
  if (authSecret) {
    return authSecret;
  }

  throw ApiError.internal(
    'Cấu hình bảo mật lỗi: Yêu cầu thiết lập QR_SECRET (hoặc AUTH_SECRET trong môi trường phát triển).'
  );
}

export class QrAttendanceService {
  /**
   * Centralized secret resolver for QR attendance.
   */
  static getQrSecret(): string {
    return getQrSecret();
  }

  /**
   * Cryptographically sign QR parameters using HMAC-SHA256.
   */
  static signToken(code: string, tokenType: string, exp: number): string {
    const secret = this.getQrSecret();
    return crypto
      .createHmac('sha256', secret)
      .update(`${code}:${tokenType}:${exp}`)
      .digest('hex');
  }

  /**
   * Safely verify HMAC-SHA256 signature using timing-safe comparison.
   */
  static verifySignature(code: string, tokenType: string, exp: number, signature: string): boolean {
    try {
      const expected = this.signToken(code, tokenType, exp);
      const expectedBuf = Buffer.from(expected, 'hex');
      const receivedBuf = Buffer.from(signature, 'hex');
      if (expectedBuf.length !== receivedBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  /**
   * GENERATE DYNAMIC QR TOKEN (For Kiosk Screen / Lobby Display)
   * Rotates every 15-60 seconds (default 30s) to prevent photography replay.
   */
  static async generateQrToken(input: GenerateQrTokenInput, session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để khởi tạo mã QR.');
    }

    if (!session.organizationId) {
      throw ApiError.badRequest('Tổ chức (organizationId) là bắt buộc để khởi tạo mã QR điểm danh.');
    }

    const expiresInSeconds = Number(input.expiresInSeconds) || 30;
    const code = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const tokenType = input.tokenType || 'ANY';

    const signature = this.signToken(code, tokenType, expiresAt.getTime());

    // Save token to database for anti-replay tracking
    const tokenRecord = await prisma.qrAttendanceToken.create({
      data: {
        organizationId: session.organizationId,
        code,
        tokenType,
        signature,
        location: input.location || 'Sảnh văn phòng chính',
        expiresAt,
        isUsed: false,
        createdByUserId: session.userId,
      },
    });

    const payloadObj: QrTokenPayload = {
      v: '1',
      code,
      type: tokenType,
      exp: expiresAt.getTime(),
      sig: signature,
      loc: input.location,
    };

    const qrPayload = JSON.stringify(payloadObj);

    // Generate high-resolution QR DataURL for direct frontend rendering
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 360,
      margin: 2,
      color: {
        dark: '#030712',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });

    logger.info('QR Attendance Token generated', {
      tokenId: tokenRecord.id,
      code,
      tokenType,
      expiresInSeconds,
      actor: session.userId,
    });

    return {
      tokenId: tokenRecord.id,
      code,
      tokenType,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds,
      qrPayload,
      qrDataUrl,
      location: tokenRecord.location,
    };
  }

  /**
   * SCAN & PROCESS QR ATTENDANCE
   *
   * Security & Anti-Fraud Pipeline:
   * 1. Authenticated user validation
   * 2. Active employee status validation (not terminated, not soft-deleted)
   * 3. QR Payload parsing & HMAC-SHA256 signature verification
   * 4. Expiration check (now <= expiresAt)
   * 5. Anti-Replay check (isUsed === false)
   * 6. Action matching (CHECK_IN vs CHECK_OUT)
   * 7. Attendance state verification (duplicate checkin / checkin before checkout)
   * 8. Atomic execution: marks token consumed + creates attendance record + audit log
   */
  static async scanQrAttendance(input: ScanQrAttendanceInput, session: UserSession) {
    // 1. Authenticated User Check
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Bạn cần đăng nhập để thực hiện chấm công bằng mã QR.');
    }

    if (!session.organizationId) {
      throw ApiError.forbidden('Phiên đăng nhập không thuộc tổ chức hợp lệ để chấm công bằng mã QR.');
    }
    const organizationId = session.organizationId;

    // 2. Strictly parse and authenticate the signed v1 payload. Raw codes are never accepted.
    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(input.qrPayload.trim());
    } catch {
      throw ApiError.badRequest('Mã QR có cấu trúc không hợp lệ.');
    }

    const parsedPayload = QrTokenPayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      throw ApiError.badRequest('Mã QR có cấu trúc không hợp lệ.');
    }

    const { code, type: expectedType, exp: expTimestamp, sig: signature } = parsedPayload.data;
    if (!this.verifySignature(code, expectedType, expTimestamp, signature)) {
      throw ApiError.badRequest('Mã QR không hợp lệ hoặc đã bị chỉnh sửa.');
    }

    const now = new Date();
    if (now.getTime() > expTimestamp) {
      throw ApiError.badRequest('Mã QR đã hết hạn. Vui lòng quét mã mới vừa được tạo.');
    }

    // 3. All database-dependent QR work uses one transaction client.
    const result = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { userId: session.userId, organizationId },
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          status: true,
          deletedAt: true,
          organizationId: true,
        },
      });

      if (!employee || employee.deletedAt) {
        throw ApiError.notFound('Hồ sơ nhân viên của bạn không tồn tại trong hệ thống.');
      }
      if (employee.organizationId !== organizationId) {
        throw ApiError.forbidden('Hồ sơ nhân viên không thuộc tổ chức của phiên đăng nhập.');
      }
      if (employee.status !== 'ACTIVE') {
        throw ApiError.forbidden('Tài khoản nhân viên của bạn không ở trạng thái hoạt động.');
      }

      const qrToken = await tx.qrAttendanceToken.findUnique({
        where: { code, organizationId },
      });

      if (!qrToken) {
        throw ApiError.badRequest('Mã QR không tồn tại trong hệ thống hoặc không hợp lệ.');
      }
      if (qrToken.organizationId !== organizationId) {
        throw ApiError.forbidden('Mã QR này thuộc về một tổ chức khác.');
      }

      const dbExpiryTimestamp = qrToken.expiresAt.getTime();
      if (
        qrToken.code !== code ||
        qrToken.tokenType !== expectedType ||
        dbExpiryTimestamp !== expTimestamp ||
        qrToken.signature !== signature
      ) {
        throw ApiError.badRequest('Mã QR không khớp với dữ liệu đã phát hành.');
      }
      if (now.getTime() > dbExpiryTimestamp) {
        throw ApiError.badRequest('Mã QR đã hết hạn. Vui lòng quét mã mới vừa được tạo.');
      }
      if (qrToken.isUsed) {
        throw ApiError.badRequest('Mã QR này đã được sử dụng (Anti-replay). Vui lòng quét mã mới.');
      }

      const todayStr = getBusinessDateString(now);
      const todayDate = parseBusinessDate(todayStr);
      let action = input.action;
      const currentAttendance = await tx.attendance.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate: todayDate } },
      });

      if (!action) {
        if (qrToken.tokenType === 'CHECK_IN' || qrToken.tokenType === 'CHECK_OUT') {
          action = qrToken.tokenType as 'CHECK_IN' | 'CHECK_OUT';
        } else if (currentAttendance?.checkInTime && !currentAttendance.checkOutTime) {
          action = 'CHECK_OUT';
        } else if (currentAttendance?.checkInTime && currentAttendance.checkOutTime) {
          throw ApiError.conflict(
            `Ban da hoan thanh ca lam viec hom nay luc ${formatBusinessTime(currentAttendance.checkOutTime)}.`
          );
        } else {
          const checkoutCandidate = await AttendanceService.resolveCheckoutAttendance(
            organizationId,
            employee.id,
            now,
            {},
            tx
          );
          action = checkoutCandidate.attendance ? 'CHECK_OUT' : 'CHECK_IN';
        }
      }

      if (qrToken.tokenType !== 'ANY' && qrToken.tokenType !== action) {
        throw ApiError.badRequest(
          `Mã QR này chỉ dành cho thao tác ${qrToken.tokenType === 'CHECK_IN' ? 'Check-in (Vào ca)' : 'Check-out (Tan ca)'}.`
        );
      }

      if (action === 'CHECK_IN') {
        if (currentAttendance?.checkInTime) {
          throw ApiError.conflict(
            `Nhân viên đã thực hiện check-in cho ngày ${todayStr} lúc ${formatBusinessTime(currentAttendance.checkInTime)}.`
          );
        }
      }

      const consumed = await tx.qrAttendanceToken.updateMany({
        where: {
          id: qrToken.id,
          organizationId,
          isUsed: false,
          expiresAt: { gte: now },
        },
        data: {
          isUsed: true,
          usedAt: now,
          usedByEmployeeId: employee.id,
        },
      });

      if (consumed.count !== 1) {
        throw ApiError.badRequest('Mã QR đã được sử dụng, hết hạn hoặc không còn hợp lệ.');
      }

      let attendanceRecord;
      if (action === 'CHECK_IN') {
        attendanceRecord = await AttendanceService.checkIn(
          {
            employeeId: employee.id,
            workDate: todayStr,
            checkInTime: now.toISOString(),
            checkInLat: input.lat,
            checkInLng: input.lng,
            notes: input.notes ? `[QR Kiosk: ${qrToken.location || 'N/A'}] ${input.notes}` : `[QR Kiosk: ${qrToken.location || 'N/A'}]`,
          },
          session,
          tx,
          'QR'
        );
      } else {
        attendanceRecord = await AttendanceService.checkOut(
          {
            employeeId: employee.id,
            checkOutTime: now.toISOString(),
            checkOutLat: input.lat,
            checkOutLng: input.lng,
            notes: input.notes ? `[QR Kiosk: ${qrToken.location || 'N/A'}] ${input.notes}` : `[QR Kiosk: ${qrToken.location || 'N/A'}]`,
          },
          session,
          tx,
          'QR'
        );
      }

      return { attendanceRecord, employee, action, qrToken };
    });

    logger.info(`QR Attendance ${result.action} successful`, {
      employeeId: result.employee.id,
      qrTokenId: result.qrToken.id,
      action: result.action,
      attendanceId: result.attendanceRecord.id,
    });

    return {
      action: result.action,
      attendance: result.attendanceRecord,
      employee: {
        id: result.employee.id,
        employeeCode: result.employee.employeeCode,
        fullName: `${result.employee.lastName} ${result.employee.firstName}`,
      },
      scannedAt: now.toISOString(),
      location: result.qrToken.location,
    };
  }

  /**
   * Query QR Tokens History (Audit log for Admin / HR)
   */
  static async queryTokens(params: QrTokenQueryParams, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xem lịch sử mã QR.');
    }

    const where: any = { organizationId: session.organizationId ?? '__no_org__' };
    if (params.isUsed === 'true') where.isUsed = true;
    if (params.isUsed === 'false') where.isUsed = false;

    const [total, items] = await Promise.all([
      prisma.qrAttendanceToken.count({ where }),
      prisma.qrAttendanceToken.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          usedByEmployee: {
            select: {
              id: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
            },
          },
          createdByUser: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      data: items,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
}
