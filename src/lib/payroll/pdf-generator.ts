import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface PayslipPdfData {
  company: {
    name: string;
    brandName?: string;
    address: string;
    taxCode: string;
    phone: string;
    email: string;
    website?: string;
  };
  employee: {
    id: string;
    code: string;
    name: string;
    department: string;
    position: string;
    bankAccount: string;
    bankName: string;
  };
  period: {
    code: string;
    name: string;
    startDate: string;
    endDate: string;
  };
  metrics: {
    workingDays: number;
    actualDays: number;
    workHours: number;
    overtimeHours: number;
  };
  earnings: {
    baseSalary: number;
    proratedSalary: number;
    overtimePay: number;
    bonuses: number;
    allowances: number;
    grossSalary: number;
  };
  deductions: {
    socialInsurance: number;
    healthInsurance: number;
    unemploymentInsurance: number;
    totalInsurance: number;
    tax: number;
    penalties: number;
    totalDeductions: number;
  };
  netSalary: number;
  paymentStatus: string;
  lineItems?: Array<{
    itemType: string;
    itemCode: string;
    description: string;
    amount: number;
  }>;
}

/**
 * Format currency VND (e.g. 25,000,000 VND)
 */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0)) + ' đ';
}

/**
 * Converts VND numerical amount into Vietnamese words
 */
export function numberToVietnameseWords(num: number): string {
  if (!num || num === 0) return 'Không đồng chẵn';
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  let n = Math.floor(Math.abs(num));
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  function readGroup(group: number, isHighest: boolean): string {
    const h = Math.floor(group / 100);
    const t = Math.floor((group % 100) / 10);
    const u = group % 10;
    let res = '';

    if (h > 0) {
      res += digits[h] + ' trăm ';
    } else if (!isHighest) {
      res += 'không trăm ';
    }

    if (t > 1) {
      res += digits[t] + ' mươi ';
      if (u === 1) res += 'mốt';
      else if (u === 5) res += 'lăm';
      else if (u > 0) res += digits[u];
    } else if (t === 1) {
      res += 'mười ';
      if (u === 5) res += 'lăm';
      else if (u > 0) res += digits[u];
    } else {
      if (u > 0) {
        if (h > 0 || !isHighest) {
          res += 'lẻ ' + digits[u];
        } else {
          res += digits[u];
        }
      }
    }

    return res.trim();
  }

  let result = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const grp = groups[i];
    if (grp > 0) {
      const isHighest = i === groups.length - 1;
      const s = readGroup(grp, isHighest);
      result += `${s} ${units[i]} `;
    }
  }

  result = result.trim();
  if (!result) return 'Không đồng chẵn';

  const capitalized = result.charAt(0).toUpperCase() + result.slice(1);
  return `${capitalized} đồng chẵn`;
}

/**
 * Resolves available TTF fonts for Vietnamese Unicode rendering in PDFKit
 */
function resolveFonts() {
  const localRegular = path.join(process.cwd(), 'public', 'fonts', 'Arial.ttf');
  const localBold = path.join(process.cwd(), 'public', 'fonts', 'Arial-Bold.ttf');
  if (fs.existsSync(localRegular) && fs.existsSync(localBold)) {
    return { regular: localRegular, bold: localBold };
  }

  const winRegular = 'C:\\Windows\\Fonts\\arial.ttf';
  const winBold = 'C:\\Windows\\Fonts\\arialbd.ttf';
  if (fs.existsSync(winRegular) && fs.existsSync(winBold)) {
    return { regular: winRegular, bold: winBold };
  }

  return null;
}

export class PayslipPdfGenerator {
  /**
   * Generates a binary A4 PDF document containing all 18 payslip fields
   */
  static async generate(data: PayslipPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4', // 595.28 x 841.89 points
          margins: { top: 36, bottom: 36, left: 40, right: 40 },
          info: {
            Title: `Phiếu Lương - ${data.employee.name} (${data.period.code})`,
            Author: data.company.name,
            Subject: 'Bảng Kê Chi Tiết Thu Nhập & Khấu Trừ Thuế - Bảo Hiểm',
            Creator: 'Antigravity HRMS Enterprise Payroll Engine',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // Setup Fonts
        const fonts = resolveFonts();
        let fontRegular = 'Helvetica';
        let fontBold = 'Helvetica-Bold';

        if (fonts) {
          doc.registerFont('CustomFont', fonts.regular);
          doc.registerFont('CustomFont-Bold', fonts.bold);
          fontRegular = 'CustomFont';
          fontBold = 'CustomFont-Bold';
        }

        const pageWidth = 595.28;
        const leftMargin = 40;
        const rightMargin = 40;
        const contentWidth = pageWidth - leftMargin - rightMargin; // 515.28

        // ─────────────────────────────────────────────────────────────────────
        // 1. COMPANY HEADER & BRANDING
        // ─────────────────────────────────────────────────────────────────────
        let y = 36;

        // Header Background bar
        doc.rect(leftMargin, y, contentWidth, 54).fill('#0f2744');

        // Company Title & Info inside header bar
        doc.font(fontBold).fontSize(13).fillColor('#ffffff')
          .text(data.company.name.toUpperCase(), leftMargin + 14, y + 10, {
            width: contentWidth - 28,
            align: 'left',
          });

        doc.font(fontRegular).fontSize(8.5).fillColor('#cbd5e1')
          .text(
            `MST: ${data.company.taxCode} | Hotline: ${data.company.phone} | Email: ${data.company.email}`,
            leftMargin + 14,
            y + 28,
            { width: contentWidth - 28, align: 'left' }
          )
          .text(data.company.address, leftMargin + 14, y + 40, {
            width: contentWidth - 28,
            align: 'left',
          });

        y += 66;

        // ─────────────────────────────────────────────────────────────────────
        // 2. DOCUMENT TITLE & PERIOD
        // ─────────────────────────────────────────────────────────────────────
        doc.font(fontBold).fontSize(16).fillColor('#0f2744')
          .text('PHIẾU LƯƠNG NHÂN VIÊN', leftMargin, y, {
            width: contentWidth,
            align: 'center',
          });
        y += 18;

        doc.font(fontRegular).fontSize(9.5).fillColor('#475569')
          .text(
            `Kỳ tính lương: Tháng ${data.period.code} (Từ ${data.period.startDate} đến ${data.period.endDate})`,
            leftMargin,
            y,
            { width: contentWidth, align: 'center' }
          );
        y += 18;

        // ─────────────────────────────────────────────────────────────────────
        // 3. EMPLOYEE INFORMATION & WORKING METRICS (Box Grid)
        // ─────────────────────────────────────────────────────────────────────
        const empBoxHeight = 62;
        doc.rect(leftMargin, y, contentWidth, empBoxHeight)
          .fillAndStroke('#f8fafc', '#cbd5e1');

        const col1X = leftMargin + 12;
        const col2X = leftMargin + (contentWidth / 2) + 6;

        // Row 1
        doc.font(fontBold).fontSize(8.5).fillColor('#64748b').text('Mã nhân viên: ', col1X, y + 8, { continued: true });
        doc.font(fontBold).fillColor('#0f2744').text(data.employee.code);

        doc.font(fontBold).fontSize(8.5).fillColor('#64748b').text('Họ và tên: ', col2X, y + 8, { continued: true });
        doc.font(fontBold).fillColor('#0f2744').text(data.employee.name);

        // Row 2
        doc.font(fontRegular).fontSize(8.5).fillColor('#64748b').text('Phòng ban: ', col1X, y + 24, { continued: true });
        doc.font(fontRegular).fillColor('#1e293b').text(data.employee.department);

        doc.font(fontRegular).fontSize(8.5).fillColor('#64748b').text('Chức vụ: ', col2X, y + 24, { continued: true });
        doc.font(fontRegular).fillColor('#1e293b').text(data.employee.position);

        // Row 3
        doc.font(fontRegular).fontSize(8.5).fillColor('#64748b').text('Tài khoản: ', col1X, y + 40, { continued: true });
        doc.font(fontRegular).fillColor('#1e293b').text(
          data.employee.bankAccount
            ? `${data.employee.bankAccount} (${data.employee.bankName || 'Ngân hàng'})`
            : 'Thanh toán tiền mặt'
        );

        doc.font(fontRegular).fontSize(8.5).fillColor('#64748b').text('Trạng thái chi trả: ', col2X, y + 40, { continued: true });
        doc.font(fontBold).fillColor(data.paymentStatus === 'PAID' ? '#15803d' : '#b45309')
          .text(data.paymentStatus === 'PAID' ? 'ĐÃ THANH TOÁN (PAID)' : 'CHỜ THANH TOÁN (UNPAID)');

        y += empBoxHeight + 10;

        // ─────────────────────────────────────────────────────────────────────
        // 4. METRICS STRIP (4 blocks)
        // ─────────────────────────────────────────────────────────────────────
        const metricBoxWidth = (contentWidth - 18) / 4;
        const metricsData = [
          { label: 'Ngày công chuẩn', value: `${data.metrics.workingDays} ngày`, color: '#0f2744' },
          { label: 'Công thực tế', value: `${data.metrics.actualDays} ngày`, color: '#0369a1' },
          { label: 'Tổng giờ làm', value: `${data.metrics.workHours} giờ`, color: '#047857' },
          { label: 'Làm thêm (OT)', value: `${data.metrics.overtimeHours} giờ`, color: '#b45309' },
        ];

        for (let i = 0; i < 4; i++) {
          const mx = leftMargin + i * (metricBoxWidth + 6);
          doc.rect(mx, y, metricBoxWidth, 34).fillAndStroke('#f1f5f9', '#e2e8f0');

          doc.font(fontRegular).fontSize(7.5).fillColor('#64748b')
            .text(metricsData[i].label, mx, y + 5, { width: metricBoxWidth, align: 'center' });
          doc.font(fontBold).fontSize(10).fillColor(metricsData[i].color)
            .text(metricsData[i].value, mx, y + 17, { width: metricBoxWidth, align: 'center' });
        }

        y += 44;

        // ─────────────────────────────────────────────────────────────────────
        // 5. FINANCIAL TABLES: EARNINGS & DEDUCTIONS (2-Column Grid)
        // ─────────────────────────────────────────────────────────────────────
        const tableColWidth = (contentWidth - 12) / 2;
        const leftColX = leftMargin;
        const rightColX = leftMargin + tableColWidth + 12;

        const tableStartY = y;

        // --- Left Table: EARNINGS (THU NHẬP) ---
        doc.rect(leftColX, y, tableColWidth, 22).fill('#1e3a8a');
        doc.font(fontBold).fontSize(9).fillColor('#ffffff')
          .text('A. CÁC KHOẢN THU NHẬP (EARNINGS)', leftColX + 8, y + 6, { width: tableColWidth - 16 });

        const earningsRows = [
          { label: '1. Lương cơ bản hợp đồng:', val: formatVND(data.earnings.baseSalary) },
          { label: '2. Lương tính theo công thực tế:', val: formatVND(data.earnings.proratedSalary) },
          { label: '3. Tiền làm thêm giờ (OT):', val: formatVND(data.earnings.overtimePay) },
          { label: '4. Thưởng hiệu suất & KPI:', val: formatVND(data.earnings.bonuses) },
          { label: '5. Phụ cấp công việc:', val: formatVND(data.earnings.allowances) },
        ];

        let ey = y + 22;
        for (let i = 0; i < earningsRows.length; i++) {
          const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(leftColX, ey, tableColWidth, 19).fillAndStroke(bg, '#e2e8f0');

          doc.font(fontRegular).fontSize(8).fillColor('#334155')
            .text(earningsRows[i].label, leftColX + 8, ey + 5, { width: tableColWidth - 90 });
          doc.font(fontBold).fontSize(8).fillColor('#0f172a')
            .text(earningsRows[i].val, leftColX + tableColWidth - 90, ey + 5, { width: 82, align: 'right' });
          ey += 19;
        }

        // Gross Subtotal
        doc.rect(leftColX, ey, tableColWidth, 22).fill('#ecfdf5');
        doc.rect(leftColX, ey, tableColWidth, 22).stroke('#10b981');
        doc.font(fontBold).fontSize(8.5).fillColor('#065f46')
          .text('TỔNG THU NHẬP GỘP (GROSS):', leftColX + 8, ey + 6, { width: tableColWidth - 95 });
        doc.font(fontBold).fontSize(9).fillColor('#047857')
          .text(formatVND(data.earnings.grossSalary), leftColX + tableColWidth - 95, ey + 6, {
            width: 87,
            align: 'right',
          });

        // --- Right Table: DEDUCTIONS (GIẢM TRỪ) ---
        doc.rect(rightColX, y, tableColWidth, 22).fill('#991b1b');
        doc.font(fontBold).fontSize(9).fillColor('#ffffff')
          .text('B. CÁC KHOẢN GIẢM TRỪ (DEDUCTIONS)', rightColX + 8, y + 6, { width: tableColWidth - 16 });

        const deductionRows = [
          { label: '1. Bảo hiểm Xã hội (8%):', val: formatVND(data.deductions.socialInsurance) },
          { label: '2. Bảo hiểm Y tế (1.5%):', val: formatVND(data.deductions.healthInsurance) },
          { label: '3. Bảo hiểm Thất nghiệp (1%):', val: formatVND(data.deductions.unemploymentInsurance) },
          { label: '4. Thuế Thu nhập Cá nhân (PIT):', val: formatVND(data.deductions.tax) },
          { label: '5. Kỷ luật, đi muộn & Phạt:', val: formatVND(data.deductions.penalties) },
        ];

        let dy = y + 22;
        for (let i = 0; i < deductionRows.length; i++) {
          const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
          doc.rect(rightColX, dy, tableColWidth, 19).fillAndStroke(bg, '#e2e8f0');

          doc.font(fontRegular).fontSize(8).fillColor('#334155')
            .text(deductionRows[i].label, rightColX + 8, dy + 5, { width: tableColWidth - 90 });
          doc.font(fontBold).fontSize(8).fillColor('#0f172a')
            .text(deductionRows[i].val, rightColX + tableColWidth - 90, dy + 5, { width: 82, align: 'right' });
          dy += 19;
        }

        // Deductions Subtotal
        doc.rect(rightColX, dy, tableColWidth, 22).fill('#fef2f2');
        doc.rect(rightColX, dy, tableColWidth, 22).stroke('#ef4444');
        doc.font(fontBold).fontSize(8.5).fillColor('#991b1b')
          .text('TỔNG GIẢM TRỪ (DEDUCTIONS):', rightColX + 8, dy + 6, { width: tableColWidth - 95 });
        doc.font(fontBold).fontSize(9).fillColor('#b91c1c')
          .text(formatVND(data.deductions.totalDeductions), rightColX + tableColWidth - 95, dy + 6, {
            width: 87,
            align: 'right',
          });

        y = Math.max(ey, dy) + 32;

        // ─────────────────────────────────────────────────────────────────────
        // 6. NET SALARY CALLOUT BANNER (Gold / Emerald Luxury Style)
        // ─────────────────────────────────────────────────────────────────────
        const netBoxHeight = 52;
        doc.rect(leftMargin, y, contentWidth, netBoxHeight)
          .fillAndStroke('#0f2744', '#1e3a8a');

        doc.font(fontBold).fontSize(10).fillColor('#fbbf24')
          .text('LƯƠNG THỰC LĨNH CHUYỂN KHOẢN (NET SALARY)', leftMargin + 14, y + 10);

        doc.font(fontBold).fontSize(18).fillColor('#ffffff')
          .text(formatVND(data.netSalary), leftMargin + contentWidth - 210, y + 8, {
            width: 196,
            align: 'right',
          });

        doc.font(fontRegular).fontSize(8.5).fillColor('#e2e8f0')
          .text(`Bằng chữ: ${numberToVietnameseWords(data.netSalary)}`, leftMargin + 14, y + 30, {
            width: contentWidth - 28,
          });

        y += netBoxHeight + 12;

        // ─────────────────────────────────────────────────────────────────────
        // 7. LINE ITEMS TABLE (If present and space permits)
        // ─────────────────────────────────────────────────────────────────────
        if (data.lineItems && data.lineItems.length > 0 && y < 650) {
          doc.font(fontBold).fontSize(8.5).fillColor('#1e293b')
            .text('BẢNG KÊ CHI TIẾT TỪNG DÒNG NGHIỆP VỤ (AUDIT ITEMS)', leftMargin, y);
          y += 14;

          // Table Header
          doc.rect(leftMargin, y, contentWidth, 16).fill('#e2e8f0');
          doc.font(fontBold).fontSize(7.5).fillColor('#475569');
          doc.text('Loại', leftMargin + 6, y + 4, { width: 50 });
          doc.text('Mã', leftMargin + 60, y + 4, { width: 80 });
          doc.text('Mô tả nghiệp vụ', leftMargin + 145, y + 4, { width: 230 });
          doc.text('Số tiền', leftMargin + contentWidth - 90, y + 4, { width: 84, align: 'right' });
          y += 16;

          // Items up to 4 to ensure everything fits on 1 page neatly
          const itemsToRender = data.lineItems.slice(0, 4);
          for (let i = 0; i < itemsToRender.length; i++) {
            const item = itemsToRender[i];
            const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
            doc.rect(leftMargin, y, contentWidth, 15).fillAndStroke(bg, '#f1f5f9');

            doc.font(fontRegular).fontSize(7.5).fillColor('#334155');
            doc.text(item.itemType, leftMargin + 6, y + 3, { width: 50 });
            doc.text(item.itemCode, leftMargin + 60, y + 3, { width: 80 });
            doc.text(item.description, leftMargin + 145, y + 3, { width: 230, ellipsis: true });
            doc.font(fontBold).fillColor(item.itemType === 'DEDUCTION' || item.itemType === 'PENALTY' ? '#dc2626' : '#16a34a');
            doc.text(formatVND(item.amount), leftMargin + contentWidth - 90, y + 3, { width: 84, align: 'right' });
            y += 15;
          }
          y += 12;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 8. SIGNATURE & VERIFICATION SECTION
        // ─────────────────────────────────────────────────────────────────────
        const sigY = Math.max(y + 8, 700);
        const sigColWidth = contentWidth / 3;

        doc.font(fontBold).fontSize(8.5).fillColor('#1e293b');
        doc.text('NGƯỜI LẬP BIỂU', leftMargin, sigY, { width: sigColWidth, align: 'center' });
        doc.text('KẾ TOÁN TRƯỞNG', leftMargin + sigColWidth, sigY, { width: sigColWidth, align: 'center' });
        doc.text('NGƯỜI NHẬN LƯƠNG', leftMargin + sigColWidth * 2, sigY, { width: sigColWidth, align: 'center' });

        doc.font(fontRegular).fontSize(7.5).fillColor('#64748b');
        doc.text('(Ký, họ tên)', leftMargin, sigY + 12, { width: sigColWidth, align: 'center' });
        doc.text('(Ký, họ tên)', leftMargin + sigColWidth, sigY + 12, { width: sigColWidth, align: 'center' });
        doc.text('(Ký xác nhận)', leftMargin + sigColWidth * 2, sigY + 12, { width: sigColWidth, align: 'center' });

        // ─────────────────────────────────────────────────────────────────────
        // 9. FOOTER & AUDIT WATERMARK
        // ─────────────────────────────────────────────────────────────────────
        doc.font(fontRegular).fontSize(7).fillColor('#94a3b8')
          .text(
            `Phiếu lương điện tử được phát hành tự động bởi Antigravity HRMS Enterprise lúc ${new Date().toISOString()}. Mọi thắc mắc xin liên hệ phòng Nhân sự.`,
            leftMargin,
            800,
            { width: contentWidth, align: 'center' }
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
