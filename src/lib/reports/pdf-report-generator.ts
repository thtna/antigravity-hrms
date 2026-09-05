import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { ReportResult, ReportColumn } from '@/lib/services/report.service';

export interface PdfReportOptions {
  companyName?: string;
  generatedBy?: string;
  departmentName?: string;
  filterSummary?: string;
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

/**
 * Strips Vietnamese diacritics for safe standard PDF font rendering if TrueType font is unavailable
 */
function stripDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export class PdfReportGenerator {
  /**
   * Generates a high-fidelity A4 Landscape PDF buffer for any ReportResult
   */
  static async generatePdf(
    report: ReportResult,
    options: PdfReportOptions = {}
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape', // 841.89 x 595.28 points
          margins: { top: 36, bottom: 40, left: 36, right: 36 },
          bufferPages: true,
          info: {
            Title: report.title,
            Author: options.companyName || 'Antigravity Enterprise HRMS',
            Subject: report.description,
            Creator: 'Antigravity Report Studio',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // Font Setup
        const fonts = resolveFonts();
        let fontRegular = 'Helvetica';
        let fontBold = 'Helvetica-Bold';
        const hasUnicodeFont = !!fonts;

        if (fonts) {
          doc.registerFont('CustomFont', fonts.regular);
          doc.registerFont('CustomFont-Bold', fonts.bold);
          fontRegular = 'CustomFont';
          fontBold = 'CustomFont-Bold';
        }

        const safeText = (text: string | number | null | undefined): string => {
          if (text === null || text === undefined) return '-';
          const s = String(text);
          return hasUnicodeFont ? s : stripDiacritics(s);
        };

        const pageWidth = 841.89;
        const pageHeight = 595.28;
        const leftMargin = 36;
        const rightMargin = 36;
        const contentWidth = pageWidth - leftMargin - rightMargin; // 769.89
        const maxY = pageHeight - 55; // bottom margin threshold

        // ─────────────────────────────────────────────────────────────────────
        // 1. HEADER SECTION (Brand & Title)
        // ─────────────────────────────────────────────────────────────────────
        const drawHeader = () => {
          const companyName = options.companyName || 'CÔNG TY CỔ PHẦN CÔNG NGHỆ ANTIGRAVITY';
          doc
            .font(fontBold)
            .fontSize(11)
            .fillColor('#1E3A8A')
            .text(safeText(companyName), leftMargin, 32);

          doc
            .font(fontBold)
            .fontSize(16)
            .fillColor('#0F172A')
            .text(safeText(report.title.toUpperCase()), leftMargin, 48);

          const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          const metaString = [
            `Ngày xuất: ${nowStr}`,
            `Người tạo: ${options.generatedBy || 'Hệ thống'}`,
            `Tổng số bản ghi: ${report.rows.length}`,
            options.departmentName ? `Phòng ban: ${options.departmentName}` : '',
            options.filterSummary ? `Bộ lọc: ${options.filterSummary}` : '',
          ]
            .filter(Boolean)
            .join('  |  ');

          doc
            .font(fontRegular)
            .fontSize(8.5)
            .fillColor('#64748B')
            .text(safeText(metaString), leftMargin, 70);

          // Divider Line
          doc
            .strokeColor('#CBD5E1')
            .lineWidth(0.75)
            .moveTo(leftMargin, 86)
            .lineTo(pageWidth - rightMargin, 86)
            .stroke();
        };

        drawHeader();

        // ─────────────────────────────────────────────────────────────────────
        // 2. SUMMARY METRICS CARDS (if any)
        // ─────────────────────────────────────────────────────────────────────
        let currentY = 96;
        if (report.summaries && report.summaries.length > 0) {
          const cardCount = Math.min(report.summaries.length, 6);
          const gap = 8;
          const cardWidth = (contentWidth - gap * (cardCount - 1)) / cardCount;
          const cardHeight = 36;

          report.summaries.slice(0, 6).forEach((sum, idx) => {
            const cardX = leftMargin + idx * (cardWidth + gap);

            // Card background
            doc
              .rect(cardX, currentY, cardWidth, cardHeight)
              .fillColor('#F1F5F9')
              .fill()
              .strokeColor('#CBD5E1')
              .lineWidth(0.5)
              .stroke();

            // Label
            doc
              .font(fontRegular)
              .fontSize(7.5)
              .fillColor('#475569')
              .text(safeText(sum.label), cardX + 6, currentY + 5, {
                width: cardWidth - 12,
                ellipsis: true,
              });

            // Value
            let valStr = String(sum.value);
            if (typeof sum.value === 'number') {
              valStr =
                sum.type === 'currency'
                  ? `${sum.value.toLocaleString('vi-VN')} đ`
                  : sum.value.toLocaleString('vi-VN');
            }

            doc
              .font(fontBold)
              .fontSize(9.5)
              .fillColor('#0F172A')
              .text(safeText(valStr), cardX + 6, currentY + 18, {
                width: cardWidth - 12,
                ellipsis: true,
              });
          });

          currentY += cardHeight + 14;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. COLUMN WIDTHS CALCULATION
        // ─────────────────────────────────────────────────────────────────────
        const columns = report.columns;
        const totalDefinedWidth = columns.reduce((acc, col) => acc + (col.width || 15), 0);
        const colWidths = columns.map((col) => {
          const proportion = (col.width || 15) / totalDefinedWidth;
          return Math.floor(proportion * contentWidth);
        });

        // Ensure total matches contentWidth exactly
        const widthSum = colWidths.reduce((a, b) => a + b, 0);
        if (colWidths.length > 0) {
          colWidths[colWidths.length - 1] += contentWidth - widthSum;
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. TABLE HEADER DRAWER
        // ─────────────────────────────────────────────────────────────────────
        const rowHeight = 18;
        const headerHeight = 22;

        const drawTableHeader = (y: number) => {
          // Header background
          doc
            .rect(leftMargin, y, contentWidth, headerHeight)
            .fillColor('#0F172A')
            .fill();

          let x = leftMargin;
          columns.forEach((col, idx) => {
            const w = colWidths[idx];
            const align =
              col.align || (col.type === 'currency' || col.type === 'number' ? 'right' : 'left');

            doc
              .font(fontBold)
              .fontSize(8.5)
              .fillColor('#FFFFFF')
              .text(safeText(col.header), x + 4, y + 6, {
                width: w - 8,
                align: align as any,
                ellipsis: true,
              });

            x += w;
          });
        };

        drawTableHeader(currentY);
        currentY += headerHeight;

        // ─────────────────────────────────────────────────────────────────────
        // 5. DATA ROWS RENDERING
        // ─────────────────────────────────────────────────────────────────────
        report.rows.forEach((row, rowIndex) => {
          // Check for page overflow
          if (currentY + rowHeight > maxY) {
            doc.addPage();
            drawHeader();
            currentY = 100;
            drawTableHeader(currentY);
            currentY += headerHeight;
          }

          const isEven = rowIndex % 2 === 0;

          // Row background
          doc
            .rect(leftMargin, currentY, contentWidth, rowHeight)
            .fillColor(isEven ? '#FFFFFF' : '#F8FAFC')
            .fill();

          // Border bottom
          doc
            .strokeColor('#E2E8F0')
            .lineWidth(0.5)
            .moveTo(leftMargin, currentY + rowHeight)
            .lineTo(pageWidth - rightMargin, currentY + rowHeight)
            .stroke();

          // Cell contents
          let x = leftMargin;
          columns.forEach((col, colIdx) => {
            const w = colWidths[colIdx];
            const val = row[col.key];
            const align =
              col.align || (col.type === 'currency' || col.type === 'number' ? 'right' : 'left');

            let formattedVal = safeText(val);
            if (col.type === 'currency' && typeof val === 'number') {
              formattedVal = `${val.toLocaleString('vi-VN')} đ`;
            } else if (col.type === 'number' && typeof val === 'number') {
              formattedVal = val.toLocaleString('vi-VN');
            }

            doc
              .font(fontRegular)
              .fontSize(8)
              .fillColor('#1E293B')
              .text(formattedVal, x + 4, currentY + 5, {
                width: w - 8,
                align: align as any,
                ellipsis: true,
              });

            x += w;
          });

          currentY += rowHeight;
        });

        // ─────────────────────────────────────────────────────────────────────
        // 6. TOTAL FOOTER ROW IN TABLE (if rows exist)
        // ─────────────────────────────────────────────────────────────────────
        if (report.rows.length > 0) {
          if (currentY + rowHeight > maxY) {
            doc.addPage();
            drawHeader();
            currentY = 100;
          }

          doc
            .rect(leftMargin, currentY, contentWidth, rowHeight + 2)
            .fillColor('#E2E8F0')
            .fill()
            .strokeColor('#94A3B8')
            .lineWidth(0.75)
            .moveTo(leftMargin, currentY)
            .lineTo(pageWidth - rightMargin, currentY)
            .stroke()
            .moveTo(leftMargin, currentY + rowHeight + 2)
            .lineTo(pageWidth - rightMargin, currentY + rowHeight + 2)
            .stroke();

          let x = leftMargin;
          columns.forEach((col, colIdx) => {
            const w = colWidths[colIdx];
            const align =
              col.align || (col.type === 'currency' || col.type === 'number' ? 'right' : 'left');

            if (colIdx === 0) {
              doc
                .font(fontBold)
                .fontSize(8.5)
                .fillColor('#0F172A')
                .text(safeText('TỔNG CỘNG'), x + 4, currentY + 5, {
                  width: w - 8,
                  align: 'left',
                });
            } else if (col.type === 'currency' || col.type === 'number') {
              const sum = report.rows.reduce((acc, r) => {
                const val = Number(r[col.key]);
                return isNaN(val) ? acc : acc + val;
              }, 0);

              const formattedSum =
                col.type === 'currency'
                  ? `${sum.toLocaleString('vi-VN')} đ`
                  : sum.toLocaleString('vi-VN');

              doc
                .font(fontBold)
                .fontSize(8.5)
                .fillColor('#0F172A')
                .text(safeText(formattedSum), x + 4, currentY + 5, {
                  width: w - 8,
                  align: align as any,
                  ellipsis: true,
                });
            }

            x += w;
          });
        }

        // Apply page numbers to all buffered pages before closing document
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
          doc.switchToPage(i);
          const footerY = 595.28 - 28;
          doc
            .font(fontRegular)
            .fontSize(7.5)
            .fillColor('#64748B')
            .text(
              safeText(
                `Hệ thống Báo cáo Antigravity HRMS Enterprise  |  Tài liệu nội bộ bảo mật  |  Trang ${i + 1} / ${range.count}`
              ),
              36,
              footerY,
              { width: 841.89 - 72, align: 'center' }
            );
        }
        doc.flushPages();

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
