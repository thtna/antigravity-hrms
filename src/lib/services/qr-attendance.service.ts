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
  GenerateQrTokenInput,
  ScanQrAttendanceInput,
  QrTokenQueryParams,
} from '@/lib/validations/qr-attendance';

const QR_SECRET = process.env.QR_SECRET || process.env.JWT_SECRET || 'antigravity-secure-qr-secret-key-2026';

export interface QrTokenPayload {
  v: string;         // Protocol version
  code: string;      // Nonce / Unique code
  type: string;      // CHECK_IN | CHECK_OUT | ANY
  exp: number;       // Expiration timestamp in ms
  sig: string;       // HMAC-SHA256 signature
  loc?: string;      // Optional location tag
}

export class QrAttendanceService {
  /**
   * Cryptographically sign QR parameters using HMAC-SHA256.
   */
  static signToken(code: string, tokenType: string, exp: number): string {
    return crypto
      .createHmac('sha256', QR_SECRET)
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

    const expiresInSeconds = Number(input.expiresInSeconds) || 30;
    const code = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const tokenType = input.tokenType || 'ANY';

    const signature = this.signToken(code, tokenType, expiresAt.getTime());

    // Save token to database for anti-replay tracking
    const tokenRecord = await prisma.qrAttendanceToken.create({
      data: {
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

    // 2. Active Employee Status Check
    const employee = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        status: true,
        deletedAt: true,
      },
    });

    if (!employee || employee.deletedAt) {
      throw ApiError.notFound('Hồ sơ nhân viên của bạn không tồn tại trong hệ thống.');
    }

    if (employee.status !== 'ACTIVE') {
      throw ApiError.forbidden('Tài khoản nhân viên của bạn không ở trạng thái hoạt động.');
    }

    // 3. Parse QR Payload
    let code = input.qrPayload.trim();
    let expectedType = 'ANY';
    let expTimestamp: number | null = null;
    let signature = '';

    if (code.startsWith('{') && code.endsWith('}')) {
      try {
        const parsed: QrTokenPayload = JSON.parse(code);
        if (!parsed.code || !parsed.sig || !parsed.exp) {
          throw new Error('Payload structure missing fields');
        }
        code = parsed.code;
        expectedType = parsed.type || 'ANY';
        expTimestamp = parsed.exp;
        signature = parsed.sig;

        // Verify cryptographic signature
        const isValidSig = this.verifySignature(code, expectedType, expTimestamp, signature);
        if (!isValidSig) {
          throw ApiError.badRequest('Mã QR không hợp lệ hoặc đã bị chỉnh sửa.');
        }
      } catch (err: any) {
        if (err instanceof ApiError) throw err;
        throw ApiError.badRequest('Mã QR có cấu trúc không hợp lệ.');
      }
    }

    // 4. Database Token Lookup
    const qrToken = await prisma.qrAttendanceToken.findUnique({
      where: { code },
    });

    if (!qrToken) {
      throw ApiError.badRequest('Mã QR không tồn tại trong hệ thống hoặc không hợp lệ.');
    }

    const now = new Date();

    // 5. Expiration Check
    if (now.getTime() > qrToken.expiresAt.getTime()) {
      throw ApiError.badRequest('Mã QR đã hết hạn. Vui lòng quét mã mới vừa được tạo.');
    }

    // 6. Anti-Replay Protection (Zero-Reuse)
    if (qrToken.isUsed) {
      throw ApiError.badRequest('Mã QR này đã được sử dụng (Anti-replay). Vui lòng quét mã mới.');
    }

    // 7. Resolve Action (CHECK_IN or CHECK_OUT)
    const todayStr = now.toISOString().split('T')[0];
    const todayDate = new Date(todayStr);

    let action = input.action;

    // If action not specified by scanner, auto-detect based on token or today's attendance state
    if (!action) {
      if (qrToken.tokenType === 'CHECK_IN' || qrToken.tokenType === 'CHECK_OUT') {
        action = qrToken.tokenType as 'CHECK_IN' | 'CHECK_OUT';
      } else {
        // Query today's attendance
        const existing = await prisma.attendance.findUnique({
          where: { employeeId_workDate: { employeeId: employee.id, workDate: todayDate } },
        });

        if (!existing || !existing.checkInTime) {
          action = 'CHECK_IN';
        } else {
          action = 'CHECK_OUT';
        }
      }
    }

    // Validate action compatibility with restricted token
    if (qrToken.tokenType !== 'ANY' && qrToken.tokenType !== action) {
      throw ApiError.badRequest(
        `Mã QR này chỉ dành cho thao tác ${qrToken.tokenType === 'CHECK_IN' ? 'Check-in (Vào ca)' : 'Check-out (Tan ca)'}.`
      );
    }

    // 8. Pre-validate Attendance State Before Consuming Token
    if (action === 'CHECK_IN') {
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate: todayDate } },
      });
      if (existing && existing.checkInTime) {
        throw ApiError.conflict(
          `Nhân viên đã thực hiện check-in cho ngày ${todayStr} lúc ${existing.checkInTime.toLocaleTimeString('vi-VN')}.`
        );
      }
    } else {
      // CHECK_OUT
      const existing = await prisma.attendance.findUnique({
        where: { employeeId_workDate: { employeeId: employee.id, workDate: todayDate } },
      });
      if (!existing || !existing.checkInTime) {
        throw ApiError.badRequest(
          'Không tìm thấy bản ghi check-in cho ngày làm việc này. Bạn phải thực hiện Check-in trước khi Check-out.'
        );
      }
      if (existing.checkOutTime) {
        throw ApiError.badRequest(
          `Bản ghi đã được check-out lúc ${existing.checkOutTime.toLocaleTimeString('vi-VN')}.`
        );
      }
    }

    // 9. Atomic Execution: Consume QR token & Perform Attendance
    const result = await prisma.$transaction(async (tx) => {
      // Consume token (Anti-Replay mark)
      await tx.qrAttendanceToken.update({
        where: { id: qrToken.id },
        data: {
          isUsed: true,
          usedAt: now,
          usedByEmployeeId: employee.id,
        },
      });

      let attendanceRecord;

      if (action === 'CHECK_IN') {
        attendanceRecord = await AttendanceService.checkIn(
          {
            employeeId: employee.id,
            workDate: todayStr,
            checkInTime: now.toISOString(),
            checkInMethod: 'QR',
            checkInLat: input.lat,
            checkInLng: input.lng,
            notes: input.notes ? `[QR Kiosk: ${qrToken.location || 'N/A'}] ${input.notes}` : `[QR Kiosk: ${qrToken.location || 'N/A'}]`,
          },
          session
        );
      } else {
        attendanceRecord = await AttendanceService.checkOut(
          {
            employeeId: employee.id,
            workDate: todayStr,
            checkOutTime: now.toISOString(),
            checkOutMethod: 'QR',
            checkOutLat: input.lat,
            checkOutLng: input.lng,
            notes: input.notes ? `[QR Kiosk: ${qrToken.location || 'N/A'}] ${input.notes}` : `[QR Kiosk: ${qrToken.location || 'N/A'}]`,
          },
          session
        );
      }

      return attendanceRecord;
    });

    logger.info(`QR Attendance ${action} successful`, {
      employeeId: employee.id,
      qrTokenId: qrToken.id,
      action,
      attendanceId: result.id,
    });

    return {
      action,
      attendance: result,
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        fullName: `${employee.lastName} ${employee.firstName}`,
      },
      scannedAt: now.toISOString(),
      location: qrToken.location,
    };
  }

  /**
   * Query QR Tokens History (Audit log for Admin / HR)
   */
  static async queryTokens(params: QrTokenQueryParams, session: UserSession) {
    if (!session.roles.includes('admin') && !session.roles.includes('hr')) {
      throw ApiError.forbidden('Chỉ Quản trị viên hoặc Nhân sự mới có quyền xem lịch sử mã QR.');
    }

    const where: any = {};
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
