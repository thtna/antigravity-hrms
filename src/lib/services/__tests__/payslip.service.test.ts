import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  payroll: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
  },
  attendance: {
    aggregate: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PayslipService } from '../payslip.service';
import { PayslipPdfGenerator, numberToVietnameseWords } from '@/lib/payroll/pdf-generator';
import { UserSession } from '@/types';

describe('Phase 17 — Payslip Service & PDF Engine', () => {
  const employee1Session: UserSession = {
    userId: 'usr-emp-1',
    employeeId: 'emp-1',
    fullName: 'Nguyễn Văn A',
    roles: ['employee'],
    permissions: [],
    isActive: true,
    email: 'emp1@antigravity.vn',
  };

  const employee2Session: UserSession = {
    userId: 'usr-emp-2',
    employeeId: 'emp-2',
    fullName: 'Trần Thị B',
    roles: ['employee'],
    permissions: [],
    isActive: true,
    email: 'emp2@antigravity.vn',
  };

  const hrSession: UserSession = {
    userId: 'usr-hr',
    employeeId: 'emp-hr',
    fullName: 'Nhân Sự HR',
    roles: ['hr'],
    permissions: ['payroll:read', 'payroll:write'],
    isActive: true,
    email: 'hr@antigravity.vn',
  };

  const adminSession: UserSession = {
    userId: 'usr-admin',
    employeeId: 'emp-admin',
    fullName: 'Quản Trị Viên',
    roles: ['admin'],
    permissions: ['*'],
    isActive: true,
    email: 'admin@antigravity.vn',
  };

  const samplePayrollRecord = {
    id: 'pay-1',
    periodId: 'period-2026-09',
    employeeId: 'emp-1',
    contractSalary: 30000000,
    actualWorkDays: 21,
    paidLeaveDays: 1,
    proratedSalary: 28636364,
    otPay: 2556818,
    kpiBonus: 3000000,
    otherBonuses: 1000000,
    allowances: 1500000,
    totalPenalties: 500000,
    grossIncome: 36693182,
    socialInsurance: 2400000,
    healthInsurance: 450000,
    unemploymentInsurance: 300000,
    taxableIncome: 33543182,
    personalRelief: 11000000,
    dependentsRelief: 0,
    assessableIncome: 22543182,
    pitTax: 2758636,
    netSalary: 30284546,
    paymentStatus: 'PAID',
    createdAt: new Date('2026-09-30T10:00:00Z'),
    period: {
      id: 'period-2026-09',
      code: '2026-09',
      name: 'Kỳ Lương Tháng 09/2026',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      standardWorkDays: 22,
      status: 'APPROVED',
    },
    employee: {
      id: 'emp-1',
      userId: 'usr-emp-1',
      employeeCode: 'EMP001',
      firstName: 'Văn A',
      lastName: 'Nguyễn',
      bankAccountNo: '19030011223344',
      bankName: 'Techcombank',
      department: { id: 'dept-dev', name: 'Kỹ Thuật Phần Mềm' },
      position: { id: 'pos-dev', title: 'Kỹ Sư Phần Mềm Senior' },
    },
    details: [
      { itemType: 'EARNING', itemCode: 'BASE_SALARY', description: 'Lương thực tế', amount: 28636364 },
      { itemType: 'EARNING', itemCode: 'OVERTIME', description: 'Làm thêm giờ (10 giờ)', amount: 2556818 },
      { itemType: 'BONUS', itemCode: 'KPI_BONUS', description: 'Thưởng KPI tháng 9', amount: 3000000 },
      { itemType: 'DEDUCTION', itemCode: 'INSURANCE_SI', description: 'Bảo hiểm Xã hội', amount: 2400000 },
      { itemType: 'DEDUCTION', itemCode: 'PIT_TAX', description: 'Thuế TNCN', amount: 2758636 },
      { itemType: 'PENALTY', itemCode: 'LATE_ARRIVAL', description: 'Phạt đi muộn', amount: 500000 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Access Control & Anti-IDOR (Employee Chỉ Xem Của Chính Mình)', () => {
    it('allows employee to view their own payslip data', async () => {
      mockPrisma.payroll.findUnique.mockResolvedValue(samplePayrollRecord);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { actualWorkHours: 168, otHours: 10 },
      });

      const result = await PayslipService.getPayslipForPdf('pay-1', employee1Session);

      expect(result).toBeDefined();
      expect(result.employee.id).toBe('emp-1');
      expect(result.employee.code).toBe('EMP001');
      expect(result.employee.name).toBe('Nguyễn Văn A');
      expect(result.metrics.workingDays).toBe(22);
      expect(result.metrics.actualDays).toBe(21);
      expect(result.metrics.workHours).toBe(168);
      expect(result.metrics.overtimeHours).toBe(10);
      expect(result.netSalary).toBe(30284546);
      expect(result.paymentStatus).toBe('PAID');
    });

    it('blocks employee from viewing another employee payslip with 403 Forbidden', async () => {
      mockPrisma.payroll.findUnique.mockResolvedValue(samplePayrollRecord);

      await expect(
        PayslipService.getPayslipForPdf('pay-1', employee2Session)
      ).rejects.toThrow('Bạn chỉ có quyền xem và tải phiếu lương của chính mình.');
    });

    it('allows HR role to view any employee payslip', async () => {
      mockPrisma.payroll.findUnique.mockResolvedValue(samplePayrollRecord);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { actualWorkHours: 168, otHours: 10 },
      });

      const result = await PayslipService.getPayslipForPdf('pay-1', hrSession);
      expect(result.employee.id).toBe('emp-1');
      expect(result.netSalary).toBe(30284546);
    });

    it('allows Admin role to view any employee payslip', async () => {
      mockPrisma.payroll.findUnique.mockResolvedValue(samplePayrollRecord);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { actualWorkHours: 168, otHours: 10 },
      });

      const result = await PayslipService.getPayslipForPdf('pay-1', adminSession);
      expect(result.employee.id).toBe('emp-1');
      expect(result.netSalary).toBe(30284546);
    });

    it('throws 401 Unauthorized if session is invalid', async () => {
      await expect(
        PayslipService.getPayslipForPdf('pay-1', null as any)
      ).rejects.toThrow('Yêu cầu đăng nhập để truy cập phiếu lương.');
    });

    it('throws 404 NotFound if payslip does not exist', async () => {
      mockPrisma.payroll.findUnique.mockResolvedValue(null);

      await expect(
        PayslipService.getPayslipForPdf('non-existent', hrSession)
      ).rejects.toThrow('Không tìm thấy phiếu lương được yêu cầu.');
    });
  });

  describe('2. All 18 Required Fields Verification', () => {
    it('accurately compiles all 18 required fields', async () => {
      mockPrisma.payroll.findUnique.mockResolvedValue(samplePayrollRecord);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { actualWorkHours: 168, otHours: 10 },
      });

      const res = await PayslipService.getPayslipForPdf('pay-1', employee1Session);

      // 1. company
      expect(res.company).toBeDefined();
      expect(res.company.name).toContain('ANTIGRAVITY');
      expect(res.company.taxCode).toBe('0109988776');

      // 2. employee
      expect(res.employee.name).toBe('Nguyễn Văn A');

      // 3. employee code
      expect(res.employee.code).toBe('EMP001');

      // 4. period
      expect(res.period.code).toBe('2026-09');
      expect(res.period.startDate).toBe('01/09/2026');
      expect(res.period.endDate).toBe('30/09/2026');

      // 5. base salary
      expect(res.earnings.baseSalary).toBe(30000000);

      // 6. working days
      expect(res.metrics.workingDays).toBe(22);

      // 7. actual days
      expect(res.metrics.actualDays).toBe(21);

      // 8. work hours
      expect(res.metrics.workHours).toBe(168);

      // 9. overtime
      expect(res.metrics.overtimeHours).toBe(10);

      // 10. overtime pay
      expect(res.earnings.overtimePay).toBe(2556818);

      // 11. bonuses
      expect(res.earnings.bonuses).toBe(4000000); // 3000000 KPI + 1000000 other

      // 12. penalties
      expect(res.deductions.penalties).toBe(500000);

      // 13. gross
      expect(res.earnings.grossSalary).toBe(36693182);

      // 14. tax
      expect(res.deductions.tax).toBe(2758636);

      // 15. insurance
      expect(res.deductions.totalInsurance).toBe(3150000); // 2.4M + 450k + 300k
      expect(res.deductions.socialInsurance).toBe(2400000);
      expect(res.deductions.healthInsurance).toBe(450000);
      expect(res.deductions.unemploymentInsurance).toBe(300000);

      // 16. deductions
      expect(res.deductions.totalDeductions).toBe(3150000 + 2758636 + 500000);

      // 17. net salary
      expect(res.netSalary).toBe(30284546);

      // 18. payment status
      expect(res.paymentStatus).toBe('PAID');
    });
  });

  describe('3. Self-Service Portal (getMyPayslips)', () => {
    it('returns only the payslips of the logged-in employee', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        employeeCode: 'EMP001',
        firstName: 'Văn A',
        lastName: 'Nguyễn',
        department: { id: 'd1', name: 'Kỹ Thuật' },
        position: { id: 'p1', title: 'Senior Dev' },
      });

      mockPrisma.payroll.findMany.mockResolvedValue([samplePayrollRecord]);

      const myPayslips = await PayslipService.getMyPayslips(employee1Session);

      expect(myPayslips).toHaveLength(1);
      expect(myPayslips[0].id).toBe('pay-1');
      expect(myPayslips[0].periodCode).toBe('2026-09');
      expect(myPayslips[0].netSalary).toBe(30284546);
      expect(myPayslips[0].company).toContain('ANTIGRAVITY');
      expect(mockPrisma.payroll.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { employeeId: 'emp-1' },
        })
      );
    });

    it('returns empty array if user has no employee profile yet', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      const res = await PayslipService.getMyPayslips(employee1Session);
      expect(res).toEqual([]);
    });
  });

  describe('4. Real Binary PDF Generation (generatePayslipPdf)', () => {
    it('generates a real PDF binary buffer starting with %PDF-', async () => {
      mockPrisma.payroll.findUnique.mockResolvedValue(samplePayrollRecord);
      mockPrisma.attendance.aggregate.mockResolvedValue({
        _sum: { actualWorkHours: 168, otHours: 10 },
      });

      const { buffer, filename, contentType } = await PayslipService.generatePayslipPdf(
        'pay-1',
        employee1Session
      );

      expect(contentType).toBe('application/pdf');
      expect(filename).toBe('payslip-EMP001-2026-09.pdf');
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000); // Substantial PDF size

      // Verify PDF Magic Bytes: %PDF-
      const magicBytes = buffer.subarray(0, 5).toString('ascii');
      expect(magicBytes).toBe('%PDF-');
    });

    it('converts monetary amount into correct Vietnamese words', () => {
      const words1 = numberToVietnameseWords(30000000);
      expect(words1).toBe('Ba mươi triệu đồng chẵn');

      const words2 = numberToVietnameseWords(35420000);
      expect(words2).toBe('Ba mươi lăm triệu bốn trăm hai mươi nghìn đồng chẵn');

      const wordsZero = numberToVietnameseWords(0);
      expect(wordsZero).toBe('Không đồng chẵn');
    });
  });
});
