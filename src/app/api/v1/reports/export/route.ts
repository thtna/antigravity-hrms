import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { ReportService, ReportType, ReportQueryOptions } from '@/lib/services/report.service';
import { ExcelExporter } from '@/lib/reports/excel-exporter';
import { PdfReportGenerator } from '@/lib/reports/pdf-report-generator';
import { handleApiError, ApiError } from '@/lib/errors';

const VALID_REPORT_TYPES: ReportType[] = [
  'attendance',
  'late',
  'early_leave',
  'overtime',
  'leave',
  'kpi',
  'bonus',
  'penalty',
  'payroll',
];

/**
 * GET /api/v1/reports/export
 * Exports report in binary OpenXML Excel (.xlsx) or A4 Landscape Vector PDF (.pdf) format
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get('type') as ReportType;
    if (!type || !VALID_REPORT_TYPES.includes(type)) {
      throw ApiError.badRequest(
        `Loại báo cáo '${type}' không hợp lệ. Các loại hỗ trợ: ${VALID_REPORT_TYPES.join(', ')}`
      );
    }

    const format = (searchParams.get('format') || 'excel').toLowerCase();
    if (format !== 'excel' && format !== 'xlsx' && format !== 'pdf') {
      throw ApiError.badRequest("Định dạng xuất phải là 'excel' hoặc 'pdf'");
    }

    // When exporting, load up to 10,000 records so entire dataset is included
    const options: ReportQueryOptions = {
      type,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      departmentId: searchParams.get('departmentId') || undefined,
      employeeId: searchParams.get('employeeId') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
      page: 1,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 10000,
    };

    const reportResult = await ReportService.getReport(options, session);

    const filterParts: string[] = [];
    if (options.startDate && options.endDate) {
      filterParts.push(`Từ ${options.startDate} đến ${options.endDate}`);
    } else if (options.startDate) {
      filterParts.push(`Từ ${options.startDate}`);
    } else if (options.endDate) {
      filterParts.push(`Đến ${options.endDate}`);
    }
    if (options.status) filterParts.push(`Trạng thái: ${options.status}`);
    if (options.search) filterParts.push(`Tìm kiếm: "${options.search}"`);

    const exportOptions = {
      companyName: 'CÔNG TY CỔ PHẦN CÔNG NGHỆ ANTIGRAVITY',
      generatedBy: session.email || 'Admin',
      filterSummary: filterParts.length > 0 ? filterParts.join(', ') : 'Toàn bộ dữ liệu',
    };

    const timestamp = new Date().toISOString().slice(0, 10);
    const sanitizedTitle = type.toUpperCase();

    if (format === 'pdf') {
      const pdfBuffer = await PdfReportGenerator.generatePdf(reportResult, exportOptions);
      const filename = `BaoCao_${sanitizedTitle}_${timestamp}.pdf`;

      return new NextResponse(pdfBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': pdfBuffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } else {
      const xlsxBuffer = await ExcelExporter.generateWorkbook(reportResult, exportOptions);
      const filename = `BaoCao_${sanitizedTitle}_${timestamp}.xlsx`;

      return new NextResponse(xlsxBuffer as any, {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': xlsxBuffer.length.toString(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
