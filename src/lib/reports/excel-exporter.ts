import ExcelJS from 'exceljs';
import { ReportResult, ReportColumn } from '@/lib/services/report.service';

export interface ExcelExportOptions {
  companyName?: string;
  generatedBy?: string;
  departmentName?: string;
  filterSummary?: string;
}

export class ExcelExporter {
  /**
   * Generates a polished, enterprise-grade XLSX buffer for any ReportResult
   */
  static async generateWorkbook(
    report: ReportResult,
    options: ExcelExportOptions = {}
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Antigravity Enterprise HRMS';
    workbook.lastModifiedBy = options.generatedBy || 'Antigravity System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Sanitize sheet title (max 31 characters, remove invalid chars)
    const sheetName = (report.title || 'Bao Cao')
      .replace(/[*?:/\\\[\]]/g, '')
      .slice(0, 30);

    const worksheet = workbook.addWorksheet(sheetName, {
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
      views: [{ state: 'frozen', ySplit: 7 }], // Freeze headers above data rows
    });

    const companyName = options.companyName || 'CÔNG TY CỔ PHẦN CÔNG NGHỆ ANTIGRAVITY';
    const totalCols = Math.max(report.columns.length, 5);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. HEADER SECTION (Brand & Title)
    // ─────────────────────────────────────────────────────────────────────────
    // Row 1: Company Header
    const row1 = worksheet.addRow([companyName]);
    row1.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
    worksheet.mergeCells(1, 1, 1, totalCols);

    // Row 2: Report Title
    const row2 = worksheet.addRow([report.title.toUpperCase()]);
    row2.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    row2.alignment = { vertical: 'middle' };
    worksheet.mergeCells(2, 1, 2, totalCols);

    // Row 3: Metadata Subtitle
    const nowStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const metaParts = [
      `Thời điểm xuất: ${nowStr}`,
      `Người xuất: ${options.generatedBy || 'Hệ thống'}`,
      `Tổng số bản ghi: ${report.rows.length}`,
    ];
    if (options.departmentName) {
      metaParts.push(`Phòng ban: ${options.departmentName}`);
    }
    if (options.filterSummary) {
      metaParts.push(`Bộ lọc: ${options.filterSummary}`);
    }

    const row3 = worksheet.addRow([metaParts.join('  |  ')]);
    row3.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: 'FF64748B' } };
    worksheet.mergeCells(3, 1, 3, totalCols);

    // Row 4: Empty Separator
    worksheet.addRow([]);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. SUMMARY METRICS BLOCK (Row 5 - 6)
    // ─────────────────────────────────────────────────────────────────────────
    if (report.summaries && report.summaries.length > 0) {
      const summaryLabels = report.summaries.map((s) => s.label);
      const summaryValues = report.summaries.map((s) => {
        if (typeof s.value === 'number') {
          return s.type === 'currency'
            ? `${s.value.toLocaleString('vi-VN')} đ`
            : s.value.toLocaleString('vi-VN');
        }
        return s.value;
      });

      const summaryLabelRow = worksheet.addRow(summaryLabels);
      summaryLabelRow.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
      summaryLabelRow.alignment = { vertical: 'middle', horizontal: 'center' };

      const summaryValueRow = worksheet.addRow(summaryValues);
      summaryValueRow.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
      summaryValueRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // Style summary boxes
      for (let c = 1; c <= report.summaries.length; c++) {
        const cellLabel = summaryLabelRow.getCell(c);
        const cellValue = summaryValueRow.getCell(c);

        cellLabel.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        cellValue.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };

        const borderStyle: Partial<ExcelJS.Borders> = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
        cellLabel.border = borderStyle;
        cellValue.border = borderStyle;
      }
    } else {
      worksheet.addRow([]);
      worksheet.addRow([]);
    }

    // Row 7: Empty Separator before Table
    worksheet.addRow([]);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. TABLE HEADERS (Row 8)
    // ─────────────────────────────────────────────────────────────────────────
    const headerTitles = report.columns.map((col) => col.header);
    const headerRow = worksheet.addRow(headerTitles);
    headerRow.height = 26;

    headerRow.eachCell((cell, colNumber) => {
      const colDef = report.columns[colNumber - 1];
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' }, // Slate 900
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef?.align || (colDef?.type === 'currency' || colDef?.type === 'number' ? 'right' : 'left'),
        wrapText: true,
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF020617' } },
        bottom: { style: 'medium', color: { argb: 'FF020617' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. DATA ROWS
    // ─────────────────────────────────────────────────────────────────────────
    report.rows.forEach((row, rowIndex) => {
      const rowData = report.columns.map((col) => {
        const val = row[col.key];
        if (val === null || val === undefined) return '-';
        return val;
      });

      const excelRow = worksheet.addRow(rowData);
      excelRow.height = 20;
      const isEven = rowIndex % 2 === 0;

      excelRow.eachCell((cell, colNumber) => {
        const colDef = report.columns[colNumber - 1];
        cell.font = { name: 'Arial', size: 9.5, color: { argb: 'FF1E293B' } };

        // Zebra background
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' },
        };

        // Alignments & Number formats
        const align = colDef?.align || (colDef?.type === 'currency' || colDef?.type === 'number' ? 'right' : 'left');
        cell.alignment = {
          vertical: 'middle',
          horizontal: align,
        };

        if (colDef?.type === 'currency' && typeof cell.value === 'number') {
          cell.numFmt = '#,##0" đ"';
        } else if (colDef?.type === 'number' && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.##';
        }

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. TOTALS / SUMMARY ROW AT BOTTOM (if rows exist)
    // ─────────────────────────────────────────────────────────────────────────
    if (report.rows.length > 0) {
      const startDataRow = 9; // Table header is at 8, data starts at 9
      const endDataRow = startDataRow + report.rows.length - 1;

      const totalRowData = report.columns.map((col, idx) => {
        if (idx === 0) return 'TỔNG CỘNG';
        if (col.type === 'currency' || col.type === 'number') {
          const colLetter = worksheet.getColumn(idx + 1).letter;
          return { formula: `SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})` };
        }
        return '';
      });

      const totalRow = worksheet.addRow(totalRowData);
      totalRow.height = 24;
      totalRow.eachCell((cell, colNumber) => {
        const colDef = report.columns[colNumber - 1];
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' },
        };
        cell.alignment = {
          vertical: 'middle',
          horizontal: colDef?.align || (colDef?.type === 'currency' || colDef?.type === 'number' ? 'right' : 'left'),
        };
        if (colDef?.type === 'currency') {
          cell.numFmt = '#,##0" đ"';
        } else if (colDef?.type === 'number') {
          cell.numFmt = '#,##0.##';
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF475569' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. COLUMN WIDTH AUTO-CALCULATION
    // ─────────────────────────────────────────────────────────────────────────
    report.columns.forEach((col, idx) => {
      const excelCol = worksheet.getColumn(idx + 1);
      let maxLength = col.header.length;

      // Sample first 100 rows for performance
      const sampleLimit = Math.min(report.rows.length, 100);
      for (let r = 0; r < sampleLimit; r++) {
        const val = report.rows[r][col.key];
        if (val !== null && val !== undefined) {
          const str = String(val);
          if (str.length > maxLength) {
            maxLength = str.length;
          }
        }
      }

      // Add safety padding and bounds
      excelCol.width = Math.max(col.width || 14, Math.min(maxLength + 4, 45));
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
