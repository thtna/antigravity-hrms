import React from 'react';
import { ReportsClient } from '@/components/reports/ReportsClient';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Home, LayoutDashboard, FileSpreadsheet } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

export const metadata = {
  title: 'Trung Tâm Báo Cáo & Xuất Dữ Liệu (Reporting & Export) | Antigravity HRMS',
  description:
    'Hệ thống trích xuất và báo cáo nghiệp vụ chuyên sâu: Điểm danh, Đi muộn, Về sớm, OT, Phép, KPI, Thưởng, Phạt, Bảng Lương. Xuất dữ liệu Excel (.xlsx) & PDF vector.',
};

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Home className="h-3.5 w-3.5 text-blue-400" />
              Trang Chủ
            </Link>
            <span className="text-slate-600">/</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Trung Tâm Báo Cáo & Xuất Dữ Liệu
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-800 bg-slate-900/60 text-slate-300 text-xs flex items-center gap-1.5"
              >
                <LayoutDashboard className="h-3.5 w-3.5 text-indigo-400" />
                Dashboard
              </Button>
            </Link>
            <Link href="/payroll">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-800 bg-slate-900/60 text-slate-300 text-xs"
              >
                Bảng Lương
              </Button>
            </Link>
            <Link href="/attendance">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-800 bg-slate-900/60 text-slate-300 text-xs"
              >
                Chấm Công
              </Button>
            </Link>
          </div>
        </div>

        {/* Page Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              📑
            </span>
            Trung Tâm Báo Cáo & Xuất Dữ Liệu Doanh Nghiệp
          </h1>
          <p className="text-sm text-slate-400">
            Hỗ trợ 9 danh mục báo cáo nghiệp vụ: Điểm danh, Đi muộn, Về sớm, Làm thêm giờ, Nghỉ phép, Đánh giá KPI, Khen thưởng, Kỷ luật và Bảng lương tổng hợp.
          </p>
        </div>

        {/* Interactive Reports Studio Client Component */}
        <ReportsClient />
      </div>
    </AppShell>
  );
}
