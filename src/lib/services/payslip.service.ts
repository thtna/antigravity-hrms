import { prisma } from '@/lib/db/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UserSession } from '@/types';
import { PayslipPdfData, PayslipPdfGenerator } from '@/lib/payroll/pdf-generator';

export const COMPANY_INFO = {
  name: process.env.COMPANY_NAME || 'CÔNG TY CỔ PHẦN CÔNG NGHỆ ANTIGRAVITY',
  brandName: 'ANTIGRAVITY CORP',
  address: process.env.COMPANY_ADDRESS || 'Tầng 18, Tòa nhà Antigravity Tower, Cầu Giấy, Hà Nội',
  taxCode: process.env.COMPANY_TAX_CODE || '0109988776',
  phone: process.env.COMPANY_PHONE || '+84 (0) 24 3999 8888',
  email: process.env.COMPANY_EMAIL || 'hr@antigravity.vn',
  website: 'https://antigravity.vn',
};

export class PayslipService {
  /**
   * Retrieves full payslip report data for PDF generation or detailed display,
   * enforcing strict anti-IDOR checks: regular employees can ONLY view their own payslip.
   */
  static async getPayslipForPdf(payrollId: string, session: UserSession): Promise<PayslipPdfData> {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để truy cập phiếu lương.');
    }

    const payroll = await prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        period: true,
        employee: {
          include: {
            department: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
          },
        },
        details: {
          orderBy: { itemType: 'asc' },
        },
      },
    });

    if (!payroll) {
      throw ApiError.notFound('Không tìm thấy phiếu lương được yêu cầu.');
    }

    // ── Strict RBAC & Anti-IDOR Guard ──────────────────────────────────────────
    const isHrOrAdmin = session.roles.includes('hr') || session.roles.includes('admin');
    if (!isHrOrAdmin) {
      if (payroll.employee.userId !== session.userId) {
        logger.warn(
          `[PayslipService] Security violation: User ${session.userId} attempted to access payslip ${payrollId} belonging to user ${payroll.employee.userId}`
        );
        throw ApiError.forbidden('Bạn chỉ có quyền xem và tải phiếu lương của chính mình.');
      }
    }

    // ── Working & Attendance metrics from official database ──────────────────
    let workHours = 0;
    let overtimeHours = 0;

    try {
      const attendanceSummary = await prisma.attendance.aggregate({
        where: {
          employeeId: payroll.employeeId,
          workDate: {
            gte: payroll.period.startDate,
            lte: payroll.period.endDate,
          },
          status: { notIn: ['REJECTED', 'ABSENT'] },
        },
        _sum: {
          actualWorkHours: true,
          otHours: true,
        },
      });

      workHours = Number(attendanceSummary._sum.actualWorkHours || 0);
      overtimeHours = Number(attendanceSummary._sum.otHours || 0);
    } catch {
      // Fallback if attendance aggregation fails
      workHours = 0;
      overtimeHours = 0;
    }

    const actualDays = Number(payroll.actualWorkDays) || 0;
    if (workHours === 0 && actualDays > 0) {
      workHours = Math.round(actualDays * 8);
    }

    // Overtime hours fallback from line item if attendance ot is 0 but otPay > 0
    const otPay = Number(payroll.otPay) || 0;
    if (overtimeHours === 0 && otPay > 0) {
      const otDetail = payroll.details.find((d) => d.itemCode === 'OVERTIME');
      if (otDetail) {
        const match = otDetail.description.match(/(\d+(\.\d+)?)\s*giờ/);
        if (match) {
          overtimeHours = parseFloat(match[1]);
        }
      }
    }

    const socialInsurance = Number(payroll.socialInsurance) || 0;
    const healthInsurance = Number(payroll.healthInsurance) || 0;
    const unemploymentInsurance = Number(payroll.unemploymentInsurance) || 0;
    const totalInsurance = socialInsurance + healthInsurance + unemploymentInsurance;

    const pitTax = Number(payroll.pitTax) || 0;
    const totalPenalties = Number(payroll.totalPenalties) || 0;
    const totalDeductions = totalInsurance + pitTax + totalPenalties;

    const kpiBonus = Number(payroll.kpiBonus) || 0;
    const otherBonuses = Number(payroll.otherBonuses) || 0;
    const totalBonuses = kpiBonus + otherBonuses;

    const formatDate = (d: Date | string) => {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1)
        .toString()
        .padStart(2, '0')}/${dt.getFullYear()}`;
    };

    return {
      company: COMPANY_INFO,
      employee: {
        id: payroll.employee.id,
        code: payroll.employee.employeeCode,
        name: `${payroll.employee.lastName} ${payroll.employee.firstName}`.trim(),
        department: payroll.employee.department?.name || 'Văn phòng Trung tâm',
        position: payroll.employee.position?.title || 'Nhân viên',
        bankAccount: payroll.employee.bankAccountNo || '',
        bankName: payroll.employee.bankName || '',
      },
      period: {
        code: payroll.period.code,
        name: payroll.period.name,
        startDate: formatDate(payroll.period.startDate),
        endDate: formatDate(payroll.period.endDate),
      },
      metrics: {
        workingDays: payroll.period.standardWorkDays || 22,
        actualDays,
        workHours,
        overtimeHours,
      },
      earnings: {
        baseSalary: Number(payroll.contractSalary) || 0,
        proratedSalary: Number(payroll.proratedSalary) || 0,
        overtimePay: otPay,
        bonuses: totalBonuses,
        allowances: Number(payroll.allowances) || 0,
        grossSalary: Number(payroll.grossIncome) || 0,
      },
      deductions: {
        socialInsurance,
        healthInsurance,
        unemploymentInsurance,
        totalInsurance,
        tax: pitTax,
        penalties: totalPenalties,
        totalDeductions,
      },
      netSalary: Number(payroll.netSalary) || 0,
      paymentStatus: payroll.paymentStatus || 'UNPAID',
      lineItems: payroll.details.map((d) => ({
        itemType: d.itemType,
        itemCode: d.itemCode,
        description: d.description,
        amount: Number(d.amount),
      })),
    };
  }

  /**
   * Returns all historical payslips for the authenticated employee (Self-Service)
   */
  static async getMyPayslips(session: UserSession) {
    if (!session || !session.userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập.');
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: session.userId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { id: true, name: true } },
        position: { select: { id: true, title: true } },
      },
    });

    if (!employee) {
      return [];
    }

    const payrolls = await prisma.payroll.findMany({
      where: { employeeId: employee.id },
      orderBy: { period: { startDate: 'desc' } },
      include: {
        period: {
          select: {
            id: true,
            code: true,
            name: true,
            startDate: true,
            endDate: true,
            standardWorkDays: true,
            status: true,
          },
        },
      },
    });

    return payrolls.map((p) => {
      const social = Number(p.socialInsurance) || 0;
      const health = Number(p.healthInsurance) || 0;
      const unemp = Number(p.unemploymentInsurance) || 0;
      const totalInsurance = social + health + unemp;
      const pitTax = Number(p.pitTax) || 0;
      const penalties = Number(p.totalPenalties) || 0;
      const totalDeductions = totalInsurance + pitTax + penalties;

      return {
        id: p.id,
        periodId: p.periodId,
        periodCode: p.period.code,
        periodName: p.period.name,
        startDate: p.period.startDate,
        endDate: p.period.endDate,
        periodStatus: p.period.status,
        company: COMPANY_INFO.name,
        employee: {
          id: employee.id,
          employeeCode: employee.employeeCode,
          name: `${employee.lastName} ${employee.firstName}`.trim(),
          department: employee.department?.name,
          position: employee.position?.title,
        },
        contractSalary: Number(p.contractSalary),
        standardWorkDays: p.period.standardWorkDays || 22,
        actualWorkDays: Number(p.actualWorkDays),
        otPay: Number(p.otPay),
        kpiBonus: Number(p.kpiBonus),
        otherBonuses: Number(p.otherBonuses),
        totalBonuses: Number(p.kpiBonus) + Number(p.otherBonuses),
        allowances: Number(p.allowances),
        totalPenalties: penalties,
        grossIncome: Number(p.grossIncome),
        totalInsurance,
        socialInsurance: social,
        healthInsurance: health,
        unemploymentInsurance: unemp,
        pitTax,
        totalDeductions,
        netSalary: Number(p.netSalary),
        paymentStatus: p.paymentStatus,
        createdAt: p.createdAt,
      };
    });
  }

  /**
   * Generates a real PDF binary buffer for download/streaming
   */
  static async generatePayslipPdf(payrollId: string, session: UserSession) {
    const reportData = await this.getPayslipForPdf(payrollId, session);
    const pdfBuffer = await PayslipPdfGenerator.generate(reportData);

    const safeEmployeeCode = reportData.employee.code.replace(/[^a-zA-Z0-9_-]/g, '');
    const safePeriodCode = reportData.period.code.replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `payslip-${safeEmployeeCode}-${safePeriodCode}.pdf`;

    return {
      buffer: pdfBuffer,
      filename,
      contentType: 'application/pdf',
      data: reportData,
    };
  }
}
