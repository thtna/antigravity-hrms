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
    updateMany: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  employee: {
    findFirst: vi.fn(),
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

const mockTx = vi.hoisted(() => ({
  qrAttendanceToken: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
  },
  attendance: {
    findUnique: vi.fn(),
  },
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
  organizationId: 'org-test-qr',
  roles: ['employee' as const],
  email: 'emp@antigravity.test',
  fullName: 'Nguyễn Văn A',
  permissions: [],
  isActive: true,
};

const kioskSession = {
  ...employeeSession,
  permissions: ['attendance:kiosk'],
};

const activeEmployee = {
  id: 'emp-001',
  organizationId: 'org-test-qr',
  userId: 'usr-emp-001',
  employeeCode: 'EMP-001',
  firstName: 'Văn A',
  lastName: 'Nguyễn',
  status: 'ACTIVE',
  deletedAt: null,
};

const terminatedEmployee = {
  id: 'emp-002',
  organizationId: 'org-test-qr',
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
        kioskSession
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

    it('rejects an orgless platform SUPER_ADMIN at the service tenant boundary', async () => {
      await expect(
        QrAttendanceService.generateQrToken(
          { tokenType: 'ANY' },
          {
            ...kioskSession,
            roles: ['super_admin'],
            permissions: ['*'],
            organizationId: null,
          }
        )
      ).rejects.toThrowError(
        'Tổ chức (organizationId) là bắt buộc để khởi tạo mã QR điểm danh.'
      );
      expect(mockPrisma.qrAttendanceToken.create).not.toHaveBeenCalled();
    });

    it('uses only the authenticated session organization and ignores a client override', async () => {
      mockPrisma.qrAttendanceToken.create.mockImplementation(async ({ data }: any) => ({
        id: 'token-session-org',
        ...data,
      }));

      await QrAttendanceService.generateQrToken(
        {
          tokenType: 'ANY',
          organizationId: 'org-attacker',
        } as any,
        kioskSession
      );

      expect(mockPrisma.qrAttendanceToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: employeeSession.organizationId }),
      });
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
        organizationId: employeeSession.organizationId,
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

      mockPrisma.qrAttendanceToken.updateMany.mockResolvedValue({ count: 1 });

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_IN', exp, sig });
      const result = await QrAttendanceService.scanQrAttendance(
        { qrPayload: payload, action: 'CHECK_IN' },
        employeeSession
      );

      expect(mockPrisma.qrAttendanceToken.findUnique).toHaveBeenCalledWith({
        where: { code, organizationId: employeeSession.organizationId },
      });

      // Verify QR token was marked consumed (Anti-Replay)
      expect(mockPrisma.qrAttendanceToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'token-valid-01',
            organizationId: employeeSession.organizationId,
            isUsed: false,
          }),
          data: expect.objectContaining({ isUsed: true, usedByEmployeeId: 'emp-001' }),
        })
      );

      // Verify AttendanceService.checkIn was invoked with 'QR' method
      expect(checkInSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-001',
        }),
        employeeSession,
        mockPrisma,
        'QR'
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
        organizationId: employeeSession.organizationId,
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

      mockPrisma.qrAttendanceToken.updateMany.mockResolvedValue({ count: 1 });

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_OUT', exp, sig });
      const result = await QrAttendanceService.scanQrAttendance(
        { qrPayload: payload, action: 'CHECK_OUT' },
        employeeSession
      );

      expect(mockPrisma.qrAttendanceToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'token-valid-02',
            organizationId: employeeSession.organizationId,
            isUsed: false,
          }),
          data: expect.objectContaining({ isUsed: true, usedByEmployeeId: 'emp-001' }),
        })
      );

      expect(checkOutSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-001',
        }),
        employeeSession,
        mockPrisma,
        'QR'
      );

      expect(result.action).toBe('CHECK_OUT');
    });

    it('uses the Vietnam business date for QR check-in at a UTC date rollover', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-03T18:00:00.000Z'));
      const checkInSpy = vi.spyOn(AttendanceService, 'checkIn').mockResolvedValue({
        id: 'att-qr-rollover',
      } as any);

      try {
        mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
        const code = 'vn-rollover-checkin';
        const exp = Date.now() + 20_000;
        const sig = QrAttendanceService.signToken(code, 'CHECK_IN', exp);
        mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
          id: 'token-vn-rollover',
          organizationId: employeeSession.organizationId,
          code,
          tokenType: 'CHECK_IN',
          signature: sig,
          expiresAt: new Date(exp),
          isUsed: false,
        });
        mockPrisma.attendance.findUnique.mockResolvedValue(null);
        mockPrisma.qrAttendanceToken.updateMany.mockResolvedValue({ count: 1 });

        await QrAttendanceService.scanQrAttendance(
          {
            qrPayload: JSON.stringify({ v: '1', code, type: 'CHECK_IN', exp, sig }),
            action: 'CHECK_IN',
          },
          employeeSession
        );

        expect(checkInSpy.mock.calls[0][0]).toEqual(
          expect.objectContaining({
            workDate: '2026-09-04',
            checkInTime: '2026-09-03T18:00:00.000Z',
          })
        );
        expect(checkInSpy.mock.calls[0][3]).toBe('QR');
      } finally {
        checkInSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('uses the canonical resolver for an automatic previous-day overnight QR checkout', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      const code = 'overnight-any-checkout';
      const exp = Date.now() + 20_000;
      const sig = QrAttendanceService.signToken(code, 'ANY', exp);
      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-overnight-any',
        organizationId: employeeSession.organizationId,
        code,
        tokenType: 'ANY',
        signature: sig,
        expiresAt: new Date(exp),
        isUsed: false,
      });
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      mockPrisma.qrAttendanceToken.updateMany.mockResolvedValue({ count: 1 });
      const resolverSpy = vi.spyOn(AttendanceService, 'resolveCheckoutAttendance').mockResolvedValue({
        attendance: { id: 'att-overnight-open' },
        workDate: '2026-09-03',
      } as any);
      const checkOutSpy = vi.spyOn(AttendanceService, 'checkOut').mockResolvedValue({
        id: 'att-overnight-open',
      } as any);

      try {
        const result = await QrAttendanceService.scanQrAttendance(
          { qrPayload: JSON.stringify({ v: '1', code, type: 'ANY', exp, sig }) },
          employeeSession
        );

        expect(result.action).toBe('CHECK_OUT');
        expect(resolverSpy).toHaveBeenCalledWith(
          employeeSession.organizationId,
          activeEmployee.id,
          expect.any(Date),
          {},
          mockPrisma
        );
        expect(checkOutSpy.mock.calls[0][0]).not.toHaveProperty('workDate');
        expect(checkOutSpy.mock.calls[0][0]).toEqual(
          expect.objectContaining({ employeeId: activeEmployee.id })
        );
        expect(checkOutSpy.mock.calls[0][3]).toBe('QR');
      } finally {
        resolverSpy.mockRestore();
        checkOutSpy.mockRestore();
      }
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
        organizationId: employeeSession.organizationId,
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
        organizationId: employeeSession.organizationId,
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
        sig: '0'.repeat(64),
      });

      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: payload }, employeeSession)
      ).rejects.toThrowError('Mã QR không hợp lệ hoặc đã bị chỉnh sửa.');

      expect(mockPrisma.attendance.create).not.toHaveBeenCalled();
    });

    it('REJECTS raw QR text without attempting a database token lookup', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: 'raw-token-code-is-not-a-signed-payload' },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR có cấu trúc không hợp lệ.');

      expect(mockPrisma.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
    });

    it('REJECTS malformed JSON without falling back to raw lookup', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      await expect(
        QrAttendanceService.scanQrAttendance({ qrPayload: '{"v":"1"' }, employeeSession)
      ).rejects.toThrowError('Mã QR có cấu trúc không hợp lệ.');

      expect(mockPrisma.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
    });

    it('REJECTS a signed payload with a missing signature field', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);

      await expect(
        QrAttendanceService.scanQrAttendance(
          {
            qrPayload: JSON.stringify({
              v: '1',
              code: 'missing-signature-code',
              type: 'ANY',
              exp: Date.now() + 20000,
            }),
          },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR có cấu trúc không hợp lệ.');

      expect(mockPrisma.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
    });

    it('REJECTS an unsupported QR protocol version', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      const code = 'unsupported-version-code';
      const exp = Date.now() + 20000;
      const sig = QrAttendanceService.signToken(code, 'ANY', exp);

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: JSON.stringify({ v: '2', code, type: 'ANY', exp, sig }) },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR có cấu trúc không hợp lệ.');

      expect(mockPrisma.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['code', { code: 'tampered-code' }],
      ['type', { type: 'CHECK_OUT' }],
      ['expiry', { exp: 4102444800000 }],
    ])('REJECTS a payload with tampered %s', async (_field, tamper) => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      const code = 'signed-original-code';
      const type = 'CHECK_IN';
      const exp = Date.now() + 20000;
      const sig = QrAttendanceService.signToken(code, type, exp);
      const payload = { v: '1', code, type, exp, sig, ...tamper };

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: JSON.stringify(payload) },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR không hợp lệ hoặc đã bị chỉnh sửa.');

      expect(mockPrisma.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
    });

    it.each(['code', 'type', 'expiry', 'signature'])(
      'REJECTS a signed payload when the DB token %s does not match',
      async (mismatch) => {
        mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
        const code = 'db-cross-check-code';
        const type = 'ANY';
        const exp = Date.now() + 20000;
        const sig = QrAttendanceService.signToken(code, type, exp);
        const dbToken = {
          id: 'token-db-mismatch',
          organizationId: employeeSession.organizationId,
          code,
          tokenType: type,
          signature: sig,
          expiresAt: new Date(exp),
          isUsed: false,
        };

        if (mismatch === 'code') dbToken.code = 'different-db-code';
        if (mismatch === 'type') dbToken.tokenType = 'CHECK_OUT';
        if (mismatch === 'expiry') dbToken.expiresAt = new Date(exp + 1);
        if (mismatch === 'signature') dbToken.signature = 'f'.repeat(64);
        mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue(dbToken);

        await expect(
          QrAttendanceService.scanQrAttendance(
            { qrPayload: JSON.stringify({ v: '1', code, type, exp, sig }) },
            employeeSession
          )
        ).rejects.toThrowError('Mã QR không khớp với dữ liệu đã phát hành.');
      }
    );

    it('does not trust payload loc for tenant selection or token lookup', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(activeEmployee);
      const code = 'location-metadata-code';
      const type = 'ANY';
      const exp = Date.now() + 20000;
      const sig = QrAttendanceService.signToken(code, type, exp);
      mockPrisma.qrAttendanceToken.findUnique.mockResolvedValue({
        id: 'token-location-metadata',
        organizationId: employeeSession.organizationId,
        code,
        tokenType: type,
        signature: sig,
        location: 'Trusted DB Location',
        expiresAt: new Date(exp),
        isUsed: true,
      });

      await expect(
        QrAttendanceService.scanQrAttendance(
          {
            qrPayload: JSON.stringify({
              v: '1',
              code,
              type,
              exp,
              sig,
              loc: 'Untrusted Payload Location',
            }),
          },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR này đã được sử dụng (Anti-replay). Vui lòng quét mã mới.');

      expect(mockPrisma.qrAttendanceToken.findUnique).toHaveBeenCalledWith({
        where: { code, organizationId: employeeSession.organizationId },
      });
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
        organizationId: employeeSession.organizationId,
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
        organizationId: employeeSession.organizationId,
        code,
        tokenType: 'CHECK_OUT',
        signature: sig,
        expiresAt: new Date(exp),
        isUsed: false,
      });

      // Canonical AttendanceService resolver finds neither current nor qualifying overnight attendance.
      mockPrisma.attendance.findUnique.mockResolvedValue(null);
      vi.spyOn(AttendanceService, 'checkOut').mockRejectedValue(
        new Error('Không tìm thấy bản ghi check-in cho ngày làm việc này. Bạn phải thực hiện Check-in trước khi Check-out.')
      );

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
        organizationId: employeeSession.organizationId,
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
      vi.spyOn(AttendanceService, 'checkOut').mockRejectedValue(
        new Error('Bản ghi đã được check-out.')
      );

      const payload = JSON.stringify({ v: '1', code, type: 'CHECK_OUT', exp, sig });

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_OUT' },
          employeeSession
        )
      ).rejects.toThrowError(/Bản ghi đã được check-out/);
    });
  });

  describe('R1C anti-replay CAS and transaction propagation', () => {
    const arrangeDistinctTxScan = (
      type: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN',
      exp = Date.now() + 20000
    ) => {
      const code = `r1c-${type.toLowerCase()}-token`;
      const sig = QrAttendanceService.signToken(code, type, exp);

      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockTx));
      mockTx.employee.findUnique.mockResolvedValue(activeEmployee);
      mockTx.qrAttendanceToken.findUnique.mockResolvedValue({
        id: `token-${type.toLowerCase()}`,
        organizationId: employeeSession.organizationId,
        code,
        tokenType: type,
        signature: sig,
        location: 'Trusted DB Location',
        expiresAt: new Date(exp),
        isUsed: false,
      });
      mockTx.attendance.findUnique.mockResolvedValue(
        type === 'CHECK_IN'
          ? null
          : {
              id: 'att-open',
              employeeId: activeEmployee.id,
              checkInTime: new Date(Date.now() - 3600000),
              checkOutTime: null,
            }
      );
      mockTx.qrAttendanceToken.updateMany.mockResolvedValue({ count: 1 });

      return JSON.stringify({ v: '1', code, type, exp, sig });
    };

    it('allows CAS count 1 and passes the identical transaction client to check-in', async () => {
      const payload = arrangeDistinctTxScan();
      const checkInSpy = vi.spyOn(AttendanceService, 'checkIn').mockResolvedValue({
        id: 'att-r1c-in',
      } as any);

      await QrAttendanceService.scanQrAttendance(
        { qrPayload: payload, action: 'CHECK_IN' },
        employeeSession
      );

      expect(mockTx.qrAttendanceToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: employeeSession.organizationId,
            isUsed: false,
            expiresAt: { gte: expect.any(Date) },
          }),
        })
      );
      expect(checkInSpy).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: activeEmployee.id }),
        employeeSession,
        mockTx,
        'QR'
      );
      expect(mockPrisma.employee.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.qrAttendanceToken.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.attendance.findUnique).not.toHaveBeenCalled();
    });

    it('passes the identical transaction client to check-out', async () => {
      const payload = arrangeDistinctTxScan('CHECK_OUT');
      const checkOutSpy = vi.spyOn(AttendanceService, 'checkOut').mockResolvedValue({
        id: 'att-r1c-out',
      } as any);

      await QrAttendanceService.scanQrAttendance(
        { qrPayload: payload, action: 'CHECK_OUT' },
        employeeSession
      );

      expect(checkOutSpy).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: activeEmployee.id }),
        employeeSession,
        mockTx,
        'QR'
      );
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.attendance.findUnique).not.toHaveBeenCalled();
    });

    it('denies CAS count 0 before attendance is called', async () => {
      const payload = arrangeDistinctTxScan();
      mockTx.qrAttendanceToken.updateMany.mockResolvedValue({ count: 0 });
      const checkInSpy = vi.spyOn(AttendanceService, 'checkIn');

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_IN' },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR đã được sử dụng, hết hạn hoặc không còn hợp lệ.');

      expect(checkInSpy).not.toHaveBeenCalled();
    });

    it('allows only the first simulated consumer of the same token', async () => {
      const payload = arrangeDistinctTxScan();
      mockTx.qrAttendanceToken.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      const checkInSpy = vi.spyOn(AttendanceService, 'checkIn').mockResolvedValue({
        id: 'att-first-consumer',
      } as any);

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_IN' },
          employeeSession
        )
      ).resolves.toBeDefined();
      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_IN' },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR đã được sử dụng, hết hạn hoặc không còn hợp lệ.');

      expect(checkInSpy).toHaveBeenCalledTimes(1);
    });

    it('propagates attendance failure after a successful CAS through the outer transaction', async () => {
      const payload = arrangeDistinctTxScan();
      vi.spyOn(AttendanceService, 'checkIn').mockRejectedValue(new Error('attendance failed'));

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_IN' },
          employeeSession
        )
      ).rejects.toThrowError('attendance failed');

      expect(mockTx.qrAttendanceToken.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('denies an orgless session before opening a transaction or looking up a token', async () => {
      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: 'not-read' },
          { ...employeeSession, organizationId: null }
        )
      ).rejects.toThrowError('Phiên đăng nhập không thuộc tổ chức hợp lệ để chấm công bằng mã QR.');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
      expect(mockTx.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
    });

    it('denies a session and employee organization mismatch before token CAS', async () => {
      const payload = arrangeDistinctTxScan();
      mockTx.employee.findUnique.mockResolvedValue({
        ...activeEmployee,
        organizationId: 'org-other',
      });

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_IN' },
          employeeSession
        )
      ).rejects.toThrowError('Hồ sơ nhân viên không thuộc tổ chức của phiên đăng nhập.');

      expect(mockTx.qrAttendanceToken.findUnique).not.toHaveBeenCalled();
      expect(mockTx.qrAttendanceToken.updateMany).not.toHaveBeenCalled();
    });

    it('denies a cross-tenant token through the session-tenant-scoped lookup', async () => {
      const payload = arrangeDistinctTxScan();
      mockTx.qrAttendanceToken.findUnique.mockResolvedValue(null);

      await expect(
        QrAttendanceService.scanQrAttendance(
          { qrPayload: payload, action: 'CHECK_IN' },
          employeeSession
        )
      ).rejects.toThrowError('Mã QR không tồn tại trong hệ thống hoặc không hợp lệ.');

      expect(mockTx.qrAttendanceToken.findUnique).toHaveBeenCalledWith({
        where: expect.objectContaining({ organizationId: employeeSession.organizationId }),
      });
      expect(mockTx.qrAttendanceToken.updateMany).not.toHaveBeenCalled();
    });

    it('preserves the accepted expiry boundary with expiresAt greater than or equal to now', async () => {
      const boundary = new Date('2026-09-30T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(boundary);

      try {
        const payload = arrangeDistinctTxScan('CHECK_IN', boundary.getTime());
        vi.spyOn(AttendanceService, 'checkIn').mockResolvedValue({ id: 'att-boundary' } as any);

        await expect(
          QrAttendanceService.scanQrAttendance(
            { qrPayload: payload, action: 'CHECK_IN' },
            employeeSession
          )
        ).resolves.toBeDefined();

        expect(mockTx.qrAttendanceToken.updateMany.mock.calls[0][0].where.expiresAt).toEqual({
          gte: boundary,
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ===========================================================================
  // 5. EMPLOYEE STATUS & AUTHENTICATION
  // ===========================================================================
  describe('5. Employee Status & Authentication', () => {
    it('BLOCKS terminated or inactive employee with 403 Forbidden', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(terminatedEmployee);

      const code = 'terminated-employee-code';
      const exp = Date.now() + 20000;
      const payload = JSON.stringify({
        v: '1',
        code,
        type: 'ANY',
        exp,
        sig: QrAttendanceService.signToken(code, 'ANY', exp),
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
