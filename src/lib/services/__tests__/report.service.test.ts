import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attendance: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  leaveRequest: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  employeeKpiResult: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  employeeBonusPenalty: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  payroll: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  employee: {
    findMany: vi.fn(),
  },
  department: {
    findMany: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ReportService, ReportResult } from '../report.service';
import { ExcelExporter } from '@/lib/reports/excel-exporter';
import { PdfReportGenerator } from '@/lib/reports/pdf-report-generator';
import { UserSession } from '@/types';

describe('Phase 19 — Enterprise Reporting & Export System', () => {
  const adminSession: UserSession = {
    userId: 'usr-admin',
    employeeId: 'emp-admin',
    fullName: 'Quản Trị Viên',
    email: 'admin@antigravity.internal',
    roles: ['admin'],
    departmentId: 'dept-all',
    permissions: ['*'],
    isActive: true,
  };

  const managerSession: UserSession = {
    userId: 'usr-mgr',
    employeeId: 'emp-mgr',
    fullName: 'Quản Lý Kỹ Thuật',
    email: 'manager.tech@antigravity.internal',
    roles: ['manager'],
    departmentId: 'dept-tech',
    permissions: ['view:reports'],
    isActive: true,
  };

  const employeeSession: UserSession = {
    userId: 'usr-emp',
    employeeId: 'emp-dev',
    fullName: 'Nguyễn Văn Dev',
    email: 'dev.an@antigravity.internal',
    roles: ['employee'],
    departmentId: 'dept-tech',
    permissions: ['view:self_reports'],
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. ATTENDANCE REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Attendance Report (Điểm danh & Chấm công)', () => {
    it('queries attendance records with pagination, sorting, and calculates summaries', async () => {
      mockPrisma.attendance.count.mockResolvedValue(45);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { workHours: 360, lateMinutes: 120, overtimeHours: 18 },
      });
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-1',
          date: new Date('2026-03-01'),
          checkIn: new Date('2026-03-01T08:00:00Z'),
          checkOut: new Date('2026-03-01T17:30:00Z'),
          status: 'PRESENT',
          workHours: 8.5,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          overtimeHours: 0.5,
          employee: {
            employeeCode: 'EMP001',
            fullName: 'Nguyễn Văn An',
            department: { name: 'Kỹ Thuật' },
          },
          shift: { name: 'Ca Hành Chính' },
        },
      ]);

      const res = await ReportService.getReport(
        {
          type: 'attendance',
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          page: 1,
          limit: 20,
        },
        adminSession
      );

      expect(res.type).toBe('attendance');
      expect(res.meta.total).toBe(45);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].employeeCode).toBe('EMP001');
      expect(res.rows[0].workHours).toBe(8.5);
      expect(res.columns.some((c) => c.key === 'workHours')).toBe(true);
      expect(res.summaries.find((s) => s.label.includes('Tổng giờ làm'))?.value).toBe(360);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. LATE REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Late Report (Báo cáo đi muộn)', () => {
    it('filters attendance strictly by lateMinutes > 0', async () => {
      mockPrisma.attendance.count.mockResolvedValue(12);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { lateMinutes: 245 },
      });
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-late-1',
          date: new Date('2026-03-02'),
          checkIn: new Date('2026-03-02T08:35:00Z'),
          checkOut: new Date('2026-03-02T17:30:00Z'),
          status: 'LATE',
          lateMinutes: 35,
          notes: 'Kẹt xe đường Cầu Giấy',
          employee: {
            employeeCode: 'EMP002',
            fullName: 'Trần Thị Bình',
            department: { name: 'Kinh Doanh' },
          },
          shift: { name: 'Ca Hành Chính' },
        },
      ]);

      const res = await ReportService.getReport({ type: 'late' }, adminSession);

      expect(res.type).toBe('late');
      expect(res.meta.total).toBe(12);
      expect(res.rows[0].lateMinutes).toBe(35);
      expect(res.summaries.find((s) => s.label.includes('Tổng số phút'))?.value).toBe(245);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. EARLY LEAVE REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Early Leave Report (Báo cáo về sớm)', () => {
    it('filters attendance by earlyLeaveMinutes > 0', async () => {
      mockPrisma.attendance.count.mockResolvedValue(5);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { earlyLeaveMinutes: 110 },
      });
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-early-1',
          date: new Date('2026-03-03'),
          checkIn: new Date('2026-03-03T08:00:00Z'),
          checkOut: new Date('2026-03-03T16:30:00Z'),
          status: 'EARLY_LEAVE',
          earlyLeaveMinutes: 30,
          notes: 'Có việc gia đình',
          employee: {
            employeeCode: 'EMP003',
            fullName: 'Lê Hoàng Cường',
            department: { name: 'Nhân Sự' },
          },
          shift: { name: 'Ca Hành Chính' },
        },
      ]);

      const res = await ReportService.getReport({ type: 'early_leave' }, adminSession);

      expect(res.type).toBe('early_leave');
      expect(res.meta.total).toBe(5);
      expect(res.rows[0].earlyLeaveMinutes).toBe(30);
      expect(res.summaries.find((s) => s.label.includes('Tổng phút về sớm'))?.value).toBe(110);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. OVERTIME (OT) REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Overtime Report (Báo cáo làm thêm giờ)', () => {
    it('filters attendance by overtimeHours > 0 and presents OT summary', async () => {
      mockPrisma.attendance.count.mockResolvedValue(15);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { overtimeHours: 42.5 },
      });
      mockPrisma.attendance.findMany.mockResolvedValue([
        {
          id: 'att-ot-1',
          date: new Date('2026-03-04'),
          checkIn: new Date('2026-03-04T08:00:00Z'),
          checkOut: new Date('2026-03-04T20:30:00Z'),
          status: 'PRESENT',
          workHours: 11.5,
          overtimeHours: 3.5,
          employee: {
            employeeCode: 'EMP004',
            fullName: 'Phạm Đức Dũng',
            department: { name: 'Kỹ Thuật' },
          },
          shift: { name: 'Ca Hành Chính' },
        },
      ]);

      const res = await ReportService.getReport({ type: 'overtime' }, adminSession);

      expect(res.type).toBe('overtime');
      expect(res.meta.total).toBe(15);
      expect(res.rows[0].overtimeHours).toBe(3.5);
      expect(res.summaries.find((s) => s.label.includes('Tổng số giờ OT'))?.value).toBe(42.5);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. LEAVE REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Leave Report (Báo cáo nghỉ phép)', () => {
    it('queries leave requests with duration, type, and approval status', async () => {
      mockPrisma.leaveRequest.count.mockResolvedValue(8);
      mockPrisma.leaveRequest.aggregate.mockResolvedValue({
        _sum: { totalDays: 14 },
      });
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'lr-1',
          leaveType: 'ANNUAL',
          startDate: new Date('2026-03-10'),
          endDate: new Date('2026-03-12'),
          totalDays: 2.0,
          reason: 'Nghỉ mát gia đình',
          status: 'APPROVED',
          createdAt: new Date('2026-03-05'),
          employee: {
            employeeCode: 'EMP005',
            fullName: 'Vũ Thị Em',
            department: { name: 'Kế Toán' },
          },
          approver: {
            fullName: 'Trưởng Phòng Kế Toán',
          },
        },
      ]);

      const res = await ReportService.getReport({ type: 'leave' }, adminSession);

      expect(res.type).toBe('leave');
      expect(res.rows[0].leaveType).toBe('ANNUAL');
      expect(res.rows[0].totalDays).toBe(2.0);
      expect(res.rows[0].status).toBe('APPROVED');
      expect(res.summaries.find((s) => s.label.includes('Tổng ngày nghỉ'))?.value).toBe(14);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. KPI REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. KPI Report (Báo cáo hiệu suất KPI)', () => {
    it('queries employee KPI evaluation results and calculates average score', async () => {
      mockPrisma.employeeKpiResult.count.mockResolvedValue(20);
      mockPrisma.employeeKpiResult.aggregate.mockResolvedValue({
        _avg: { finalScore: 92.4 },
      });
      mockPrisma.employeeKpiResult.findMany.mockResolvedValue([
        {
          id: 'kpi-1',
          finalScore: 95.0,
          grade: 'EXCELLENT',
          feedback: 'Hoàn thành xuất sắc sprint quý 1',
          employee: {
            employeeCode: 'EMP006',
            fullName: 'Đỗ Hùng Dũng',
            department: { name: 'Kỹ Thuật' },
          },
          template: {
            code: 'KPI-ENG-Q1',
            title: 'KPI Kỹ Sư Phần Mềm Q1',
          },
          period: {
            name: 'Quý 1/2026',
          },
        },
      ]);

      const res = await ReportService.getReport({ type: 'kpi' }, adminSession);

      expect(res.type).toBe('kpi');
      expect(res.rows[0].finalScore).toBe(95.0);
      expect(res.rows[0].grade).toBe('EXCELLENT');
      expect(res.summaries.find((s) => s.label.includes('Điểm KPI trung bình'))?.value).toBe(92.4);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. BONUS REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('7. Bonus Report (Báo cáo khen thưởng)', () => {
    it('queries bonuses and sums total bonus payouts', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(10);
      mockPrisma.employeeBonusPenalty.aggregate.mockResolvedValue({
        _sum: { amount: 50000000 },
      });
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([
        {
          id: 'bonus-1',
          amount: 5000000,
          reason: 'Thưởng đóng góp tính năng Enterprise',
          effectiveDate: new Date('2026-03-15'),
          status: 'APPROVED',
          policy: { code: 'BONUS-PROJ', name: 'Thưởng Dự Án' },
          employee: {
            employeeCode: 'EMP007',
            fullName: 'Ngô Quốc Gia',
            department: { name: 'Kỹ Thuật' },
          },
        },
      ]);

      const res = await ReportService.getReport({ type: 'bonus' }, adminSession);

      expect(res.type).toBe('bonus');
      expect(res.rows[0].amount).toBe(5000000);
      expect(res.summaries.find((s) => s.label.includes('Tổng tiền thưởng'))?.value).toBe(50000000);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. PENALTY REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('8. Penalty Report (Báo cáo kỷ luật & phạt)', () => {
    it('queries penalties and sums total penalty deductions', async () => {
      mockPrisma.employeeBonusPenalty.count.mockResolvedValue(4);
      mockPrisma.employeeBonusPenalty.aggregate.mockResolvedValue({
        _sum: { amount: 800000 },
      });
      mockPrisma.employeeBonusPenalty.findMany.mockResolvedValue([
        {
          id: 'pen-1',
          amount: 200000,
          reason: 'Đi muộn quá 3 lần trong tháng',
          effectiveDate: new Date('2026-03-20'),
          status: 'APPROVED',
          policy: { code: 'PEN-LATE-3', name: 'Phạt Đi Muộn Lặp Lại' },
          employee: {
            employeeCode: 'EMP008',
            fullName: 'Hoàng Hải Hà',
            department: { name: 'Vận Hành' },
          },
        },
      ]);

      const res = await ReportService.getReport({ type: 'penalty' }, adminSession);

      expect(res.type).toBe('penalty');
      expect(res.rows[0].amount).toBe(200000);
      expect(res.summaries.find((s) => s.label.includes('Tổng tiền phạt'))?.value).toBe(800000);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. PAYROLL REPORT
  // ───────────────────────────────────────────────────────────────────────────
  describe('9. Payroll Report (Báo cáo bảng lương tổng hợp)', () => {
    it('queries payroll records and aggregates gross and net salaries', async () => {
      mockPrisma.payroll.count.mockResolvedValue(50);
      mockPrisma.payroll.aggregate.mockResolvedValue({
        _sum: {
          grossSalary: 1250000000,
          netSalary: 1050000000,
          totalInsurance: 131250000,
          tax: 68750000,
        },
      });
      mockPrisma.payroll.findMany.mockResolvedValue([
        {
          id: 'pay-1',
          grossSalary: 25000000,
          totalInsurance: 2625000,
          tax: 1375000,
          netSalary: 21000000,
          status: 'PAID',
          employee: {
            employeeCode: 'EMP009',
            fullName: 'Lý Tiểu Lan',
            department: { name: 'Kỹ Thuật' },
          },
          period: {
            code: 'PAY-2026-03',
            name: 'Kỳ Lương Tháng 03/2026',
          },
        },
      ]);

      const res = await ReportService.getReport({ type: 'payroll' }, adminSession);

      expect(res.type).toBe('payroll');
      expect(res.rows[0].grossSalary).toBe(25000000);
      expect(res.rows[0].netSalary).toBe(21000000);
      expect(res.summaries.find((s) => s.label.includes('Tổng thực nhận'))?.value).toBe(1050000000);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. RBAC DATA SCOPING
  // ───────────────────────────────────────────────────────────────────────────
  describe('10. RBAC Data Scoping Controls', () => {
    it('scopes Manager queries strictly to their assigned department', async () => {
      mockPrisma.attendance.count.mockResolvedValue(10);
      mockPrisma.attendance.aggregate.mockResolvedValue({ _sum: {} });
      mockPrisma.attendance.findMany.mockResolvedValue([]);

      await ReportService.getReport({ type: 'attendance' }, managerSession);

      expect(mockPrisma.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employee: expect.objectContaining({
              departmentId: 'dept-tech',
            }),
          }),
        })
      );
    });

    it('scopes Employee queries strictly to self employeeId', async () => {
      mockPrisma.leaveRequest.count.mockResolvedValue(2);
      mockPrisma.leaveRequest.aggregate.mockResolvedValue({ _sum: {} });
      mockPrisma.leaveRequest.findMany.mockResolvedValue([]);

      await ReportService.getReport({ type: 'leave' }, employeeSession);

      expect(mockPrisma.leaveRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: 'emp-dev',
          }),
        })
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. EXCEL EXPORT (EXCELJS REAL BINARY GENERATION)
  // ───────────────────────────────────────────────────────────────────────────
  describe('11. Excel Export (ExcelExporter)', () => {
    it('generates a valid OpenXML XLSX buffer starting with PK signature', async () => {
      const mockReportData: ReportResult = {
        type: 'attendance',
        title: 'Báo Cáo Điểm Danh & Chấm Công',
        description: 'Dữ liệu chi tiết chấm công nhân viên',
        columns: [
          { key: 'employeeCode', header: 'Mã NV', width: 14 },
          { key: 'employeeName', header: 'Họ và Tên', width: 22 },
          { key: 'department', header: 'Phòng Ban', width: 18 },
          { key: 'date', header: 'Ngày', width: 14, type: 'date' },
          { key: 'workHours', header: 'Giờ Làm', width: 12, type: 'number' },
          { key: 'status', header: 'Trạng Thái', width: 14, type: 'badge' },
        ],
        rows: [
          {
            employeeCode: 'EMP001',
            employeeName: 'Nguyễn Văn An',
            department: 'Kỹ Thuật',
            date: '2026-03-01',
            workHours: 8.5,
            status: 'PRESENT',
          },
          {
            employeeCode: 'EMP002',
            employeeName: 'Trần Thị Bình',
            department: 'Kinh Doanh',
            date: '2026-03-01',
            workHours: 7.5,
            status: 'LATE',
          },
        ],
        summaries: [
          { label: 'Tổng số bản ghi', value: 2, type: 'number' },
          { label: 'Tổng giờ làm', value: 16.0, type: 'number' },
        ],
        meta: {
          total: 2,
          page: 1,
          limit: 20,
          totalPages: 1,
          timestamp: new Date().toISOString(),
        },
      };

      const xlsxBuffer = await ExcelExporter.generateWorkbook(mockReportData, {
        companyName: 'ANTIGRAVITY CORP',
        generatedBy: 'Admin HR',
      });

      expect(Buffer.isBuffer(xlsxBuffer)).toBe(true);
      expect(xlsxBuffer.length).toBeGreaterThan(1000);

      // Verify OpenXML ZIP Signature: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
      expect(xlsxBuffer[0]).toBe(0x50);
      expect(xlsxBuffer[1]).toBe(0x4b);
      expect(xlsxBuffer[2]).toBe(0x03);
      expect(xlsxBuffer[3]).toBe(0x04);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. PDF EXPORT (PDFKIT REAL VECTOR GENERATION)
  // ───────────────────────────────────────────────────────────────────────────
  describe('12. PDF Export (PdfReportGenerator)', () => {
    it('generates a valid A4 Landscape PDF buffer starting with %PDF- header', async () => {
      const mockReportData: ReportResult = {
        type: 'payroll',
        title: 'Báo Cáo Bảng Lương Tổng Hợp',
        description: 'Chi tiết thu nhập và thuế bảo hiểm nhân viên',
        columns: [
          { key: 'employeeCode', header: 'Mã NV', width: 12 },
          { key: 'employeeName', header: 'Họ và Tên', width: 20 },
          { key: 'department', header: 'Phòng Ban', width: 16 },
          { key: 'grossSalary', header: 'Lương Tổng', width: 16, type: 'currency' },
          { key: 'tax', header: 'Thuế TNCN', width: 14, type: 'currency' },
          { key: 'netSalary', header: 'Thực Nhận', width: 16, type: 'currency' },
        ],
        rows: [
          {
            employeeCode: 'EMP001',
            employeeName: 'Nguyễn Văn An',
            department: 'Kỹ Thuật',
            grossSalary: 25000000,
            tax: 1500000,
            netSalary: 20875000,
          },
        ],
        summaries: [
          { label: 'Tổng bản ghi', value: 1, type: 'number' },
          { label: 'Tổng thực nhận', value: 20875000, type: 'currency' },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          timestamp: new Date().toISOString(),
        },
      };

      const pdfBuffer = await PdfReportGenerator.generatePdf(mockReportData, {
        companyName: 'ANTIGRAVITY CORP',
        generatedBy: 'Admin HR',
      });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(500);

      // Verify PDF header %PDF-
      const headerStr = pdfBuffer.slice(0, 5).toString('ascii');
      expect(headerStr).toBe('%PDF-');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. LARGE DATASET STRESS TEST (1,000+ ROWS)
  // ───────────────────────────────────────────────────────────────────────────
  describe('13. Large Dataset Stress Test (1,000+ rows)', () => {
    it('successfully processes and generates Excel and PDF for 1,000 records without memory failure', async () => {
      const largeRows = Array.from({ length: 1000 }, (_, i) => ({
        employeeCode: `EMP${String(i + 1).padStart(4, '0')}`,
        employeeName: `Nhân Viên Số ${i + 1}`,
        department: i % 2 === 0 ? 'Kỹ Thuật' : 'Kinh Doanh',
        date: '2026-03-01',
        workHours: 8.0,
        lateMinutes: i % 10 === 0 ? 15 : 0,
        overtimeHours: i % 5 === 0 ? 2.0 : 0.0,
        status: i % 10 === 0 ? 'LATE' : 'PRESENT',
      }));

      const largeReportData: ReportResult = {
        type: 'attendance',
        title: 'Báo Cáo Điểm Danh Lớn (1,000 Dòng)',
        description: 'Kiểm tra tải lớn 1,000 dòng dữ liệu xuất',
        columns: [
          { key: 'employeeCode', header: 'Mã NV', width: 12 },
          { key: 'employeeName', header: 'Họ Tên', width: 22 },
          { key: 'department', header: 'Phòng Ban', width: 16 },
          { key: 'date', header: 'Ngày', width: 12, type: 'date' },
          { key: 'workHours', header: 'Giờ Làm', width: 10, type: 'number' },
          { key: 'lateMinutes', header: 'Đi Muộn', width: 10, type: 'number' },
          { key: 'overtimeHours', header: 'Giờ OT', width: 10, type: 'number' },
          { key: 'status', header: 'Trạng Thái', width: 12, type: 'badge' },
        ],
        rows: largeRows,
        summaries: [
          { label: 'Tổng bản ghi', value: 1000, type: 'number' },
          { label: 'Tổng giờ làm', value: 8000, type: 'number' },
        ],
        meta: {
          total: 1000,
          page: 1,
          limit: 1000,
          totalPages: 1,
          timestamp: new Date().toISOString(),
        },
      };

      // 1. Large Excel generation test
      const t0 = Date.now();
      const xlsxBuffer = await ExcelExporter.generateWorkbook(largeReportData);
      const excelTime = Date.now() - t0;

      expect(Buffer.isBuffer(xlsxBuffer)).toBe(true);
      expect(xlsxBuffer.length).toBeGreaterThan(20000);
      expect(excelTime).toBeLessThan(10000); // Must complete in under 10 seconds

      // 2. Large PDF generation test
      const t1 = Date.now();
      const pdfBuffer = await PdfReportGenerator.generatePdf(largeReportData);
      const pdfTime = Date.now() - t1;

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(50000);
      expect(pdfBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
      expect(pdfTime).toBeLessThan(15000); // Must complete multi-page PDF in under 15 seconds
    });
  });
});
