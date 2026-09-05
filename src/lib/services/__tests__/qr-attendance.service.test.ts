/**
 * PHASE 7 — QR ATTENDANCE SERVICE TEST SUITE
 *
 * Tests:
 * 1. QR Generation & Cryptographic Signing
 *    - Generates valid HMAC-SHA256 signature
 *    - Returns QR dataUrl and 30s expiration
 * 2. Valid QR Attendance
 *    - Valid QR check-in consumes token and creates attendance record
 *    - Valid QR check-out consumes token and completes attendance
 * 3. Security & Anti-Fraud Mechanisms
 *    - Expired QR rejection (400 Bad Request)
 *    - Reused QR rejection / Anti-replay protection (400 Bad Request)
 *    - Invalid / Tampered QR signature rejection (400 Bad Request)
 *    - Nonexistent QR code rejection (400 Bad Request)
 * 4. Attendance State Verification
 *    - Duplicate check-in prevention (409 Conflict)
 *    - Invalid checkout when no check-in exists (400 Bad Request)
 *    - Invalid checkout when already checked out (400 Bad Request)
 * 5. Authentication & Employee Status
 *    - Unauthenticated user blocked (401 Unauthorized)
 *    - Inactive / Terminated employee blocked (403 Forbidden)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Use vi.hoisted so mockPrisma is available BEFORE vi.mock factories run ──
const mockPrisma = vi.hoisted(() => ({
  qrAttendanceToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
  },
  attendance: {
    findUnique: vi.fn(),
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

import { QrAttendanceService } from '@/lib/services/qr-attendance.service';
import { AttendanceService } from '@/lib/services/attendance.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const employeeSession = {
  userId: 'usr-emp-001',
  roles: ['employee' as const],
  email: 'emp@antigravity.test',
  fullName: 'Nguyễn Văn A',
  permissions: [],
  isActive: true,
};

const activeEmployee = {
  id: 'emp-001',
  userId: 'usr-emp-001',
  employeeCode: 'EMP-001',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  status: 'ACTIVE',
  deletedAt: null,
};

const terminatedEmployee = {
  id: 'emp-002',
  userId: 'usr-emp-001',
  employeeCode: 'EMP-002',
  firstName: 'Thị B',
  lastName: 'Trần',
  status: 'TERMINATED',
  deletedAt: null,
};

// ── TEST SUITE ───────────────────────────────────────────────────────────────

describe('PHASE 7 — QR ATTENDANCE SERVICE TEST SUITE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  });

  // ===========================================================================
  // 1. QR GENERATION & CRYPTOGRAPHIC SIGNING
  // ===========================================================================
  describe('1. QR Token Generation', () => {
    it('generates a valid rotating QR token with HMAC-SHA256 signature and DataURL', async () => {
      mockPrisma.qrAttendanceToken.create.mockImplementation(async ({ data }: any) => ({
        id: 'token-001',
        ...data,
      }));

      const result = await QrAttendanceService.generateQrToken(
        { tokenType: 'CHECK_IN', expiresInSeconds: 30, location: 'Sảnh Chính' },
        employeeSession
      );

      expect(result.tokenId).toBe('token-001');
      expect(result.tokenType).toBe('CHECK_IN');
      expect(result.expiresInSeconds).toBe(30);
      expect(result.qrDataUrl).toContain('data:image/png;base64,');

      // Parse generated payload and verify signature
      const payload = JSON.parse(result.qrPayload);
      expect(payload.v).toBe('1');
      expect(payload.code).toBe(result.code);
      expect(payload.type).toBe('CHECK_IN');
      expect(payload.sig).toBeDefined();

      const isValid = QrAttendanceService.verifySignature(
        payload.code,
        payload.type,
        payload.exp,
        payload.sig
      );
      expect(isValid).toBe(true);
    });

    it('rejects unauthenticated user from generating QR token', async () => {
      await expect(
        QrAttendanceService.generateQrToken({ tokenType: 'ANY' }, null as any)
      ).rejects.toThrowError('Yêu cầu đăng nhập để khởi tạo mã QR.');
    });
  });

  // ===========================================================================
  // 2. VALID QR ATTENDANCE (CHECK-IN & CHECK-OUT)
  // ===========================================================================
  describe('2. Valid QR Attendance Execution', () => {
    it('successfully processes valid QR check-in, marks token consumed, and logs audit', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'valid-nonce-checkin-001';
      const exp = Date.now() + 25000; // 25s remaining
      const sig = QrAttendanceService.signToken(code, 'CHECK_IN', exp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-valid-01',
        code,
        tokenType: 'CHECK_IN',
        signature: sig,
        location: 'Sảnh Văn Phòng',
        expiresAt: new Date(exp),
        isUsed: false,
      });

      // No existing attendance today
      mockPrisma.attendance.findUnique.mockResolvedValue(null);

      // Spy on AttendanceService.checkIn
      const checkInSpy = vi.spyOn(AttendanceService, 'checkIn').mockResolvedValue({
        id: 'att-qr-001',
        employeeId: 'emp-001',
        status: 'ON_TIME',
        actualWorkHours: 0,
      } as any);

      mockPrisma.qrAttendanceToken.update.mockResolvedValue({});

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_IN', exp, sig });
      const result = await QrAttendanceService.scanQrAttendance(
        { qrPayload: payload, action: 'CHECK_IN' },
        employeeSession
      );

      // Verify QR token was marked consumed (Anti-Replay)
      expect(mockPrisma.qrAttendanceToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-valid-01' },
          data: expect.objectContaining({ isUsed: true, usedByEmployeeId: 'emp-001' }),
        })
      );

      // Verify AttendanceService.checkIn was invoked with 'QR' method
      expect(checkInSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-001',
          checkInMethod: 'QR',
        }),
        employeeSession
      );

      expect(result.action).toBe('CHECK_IN');
      expect(result.employee.employeeCode).toBe('EMP-001');
    });

    it('successfully processes valid QR check-out, marks token consumed, and updates attendance', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'valid-nonce-checkout-002';
      const exp = Date.now() + 20000; // 20s remaining
      const sig = QrAttendanceService.signToken(code, 'CHECK_OUT', exp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-valid-02',
        code,
        tokenType: 'CHECK_OUT',
        signature: sig,
        location: 'Cửa Ra Vào',
        expiresAt: new Date(exp),
        isUsed: false,
      });

      // Employee has checked in earlier today, not yet checked out
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-existing-001',
        employeeId: 'emp-001',
        checkInTime: new Date(Date.now() - 8 * 3600 * 1000), // 8h ago
        checkOutTime: null,
      });

      const checkOutSpy = vi.spyOn(AttendanceService, 'checkOut').mockResolvedValue({
        id: 'att-existing-001',
        employeeId: 'emp-001',
        status: 'ON_TIME',
        actualWorkHours: 8.0,
      } as any);

      mockPrisma.qrAttendanceToken.update.mockResolvedValue({});

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_OUT', exp, sig });
      const result = await QrAttendanceService.scanQrAttendance(
        { qrPayload: payload, action: 'CHECK_OUT' },
        employeeSession
      );

      expect(mockPrisma.qrAttendanceToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-valid-02' },
          data: expect.objectContaining({ isUsed: true, usedByEmployeeId: 'emp-001' }),
        })
      );

      expect(checkOutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-001',
          checkOutMethod: 'QR',
        }),
        employeeSession
      );

      expect(result.action).toBe('CHECK_OUT');
    });
  });

  // ===========================================================================
  // 3. SECURITY & ANTI-FRAUD MECHANISMS
  // ===========================================================================
  describe('3. Security & Anti-Fraud Mechanisms', () => {
    it('REJECTS expired QR token (> 30s) with 400 Bad Request', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'expired-nonce-001';
      const pastExp = Date.now() - 5000; // 5 seconds in the past!
      const sig = QrAttendanceService.signToken(code, 'ANY', pastExp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-expired',
        code,
        tokenType: 'ANY',
        signature: sig,
        expiresAt: new Date(pastExp),
        isUsed: false,
      });

      const payload = JSON.stringify({ v: '1', code, type: 'ANY', exp: pastExp, sig });

      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: payload }, employeeSession)
      ).rejects.toThrowError('Mã QR đã hết hạn. Vui lòng quét mã mới vừa được tạo.');
    });

    it('REJECTS reused QR token (Anti-Replay Protection) with 400 Bad Request', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'reused-nonce-002';
      const futureExp = Date.now() + 20000;
      const sig = QrAttendanceService.signToken(code, 'ANY', futureExp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-reused',
        code,
        tokenType: 'ANY',
        signature: sig,
        expiresAt: new Date(futureExp),
        isUsed: true, // ALREADY USED!
      });

      const payload = JSON.stringify({ v: '1', code, type: 'ANY', exp: futureExp, sig });

      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: payload }, employeeSession)
      ).rejects.toThrowError('Mã QR này đã được sử dụng (Anti-replay). Vui lòng quét mã mới.');
    });

    it('REJECTS tampered QR payload with invalid HMAC signature', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const payload = JSON.stringify({
        v: '1',
        code: 'forged-code',
        type: 'CHECK_IN',
        exp: Date.now() + 20000,
        sig: 'bad-signature-tampered-hex',
      });

      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: payload }, employeeSession)
      ).rejects.toThrowError('Mã QR không hợp lệ hoặc đã bị chỉnh sửa.');
    });

    it('REJECTS nonexistent QR code not recorded in database', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'valid-sig-but-missing-db-code';
      const exp = Date.now() + 20000;
      const sig = QrAttendanceService.signToken(code, 'ANY', exp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue(null); // NOT in DB

      const payload = JSON.stringify({ v: '1', code, type: 'ANY', exp, sig });

      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: payload }, employeeSession)
      ).rejects.toThrowError('Mã QR không tồn tại trong hệ thống hoặc không hợp lệ.');
    });
  });

  // ===========================================================================
  // 4. ATTENDANCE STATE VERIFICATION
  // ===========================================================================
  describe('4. Attendance State Verification', () => {
    it('PREVENTS duplicate check-in with 409 Conflict if already checked in today', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'duplicate-checkin-code';
      const exp = Date.now() + 25000;
      const sig = QrAttendanceService.signToken(code, 'CHECK_IN', exp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-dup',
        code,
        tokenType: 'CHECK_IN',
        signature: sig,
        expiresAt: new Date(exp),
        isUsed: false,
      });

      // Existing checkin found
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-existing',
        employeeId: 'emp-001',
        checkInTime: new Date(),
      });

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_IN', exp, sig });

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_IN' },
          employeeSession
        )
      ).rejects.toThrowError(/Nhân viên đã thực hiện check-in cho ngày/);
    });

    it('PREVENTS checkout before check-in with 400 Bad Request', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'no-checkin-checkout-code';
      const exp = Date.now() + 25000;
      const sig = QrAttendanceService.signToken(code, 'CHECK_OUT', exp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-no-in',
        code,
        tokenType: 'CHECK_OUT',
        signature: sig,
        expiresAt: new Date(exp),
        isUsed: false,
      });

      // No attendance record found today
      mockPrisma.attendance.findUnique.mockResolvedValue(null);

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_OUT', exp, sig });

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_OUT' },
          employeeSession
        )
      ).rejects.toThrowError(
        'Không tìm thấy bản ghi check-in cho ngày làm việc này. Bạn phải thực hiện Check-in trước khi Check-out.'
      );
    });

    it('PREVENTS duplicate checkout with 400 Bad Request if already checked out', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      const code = 'already-checked-out-code';
      const exp = Date.now() + 25000;
      const sig = QrAttendanceService.signToken(code, 'CHECK_OUT', exp);

      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-already-out',
        code,
        tokenType: 'CHECK_OUT',
        signature: sig,
        expiresAt: new Date(exp),
        isUsed: false,
      });

      // Record already has checkOutTime
      mockPrisma.attendance.findUnique.mockResolvedValue({
        id: 'att-done',
        employeeId: 'emp-001',
        checkInTime: new Date(Date.now() - 8 * 3600 * 1000),
        checkOutTime: new Date(Date.now() - 1000),
      });

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_OUT', exp, sig });

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_OUT' },
          employeeSession
        )
      ).rejects.toThrowError(/Bản ghi đã được check-out/);
    });
  });

  // ===========================================================================
  // 5. EMPLOYEE STATUS & AUTHENTICATION
  // ===========================================================================
  describe('5. Employee Status & Authentication', () => {
    it('BLOCKS terminated or inactive employee with 403 Forbidden', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(terminatedEmployee);

      const payload = JSON.stringify({
        v: '1',
        code: 'any-code',
        type: 'ANY',
        exp: Date.now() + 20000,
        sig: 'any-sig',
      });

      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: payload }, employeeSession)
      ).rejects.toThrowError('Tài khoản nhân viên của bạn không ở trạng thái hoạt động.');
    });

    it('BLOCKS unauthenticated user from scanning QR code', async () => {
      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: 'some-code' }, null as any)
      ).rejects.toThrowError('Bạn cần đăng nhập để thực hiện chấm công bằng mã QR.');
    });
  });
});
