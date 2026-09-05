import React from 'react';
import { DashboardClient } from '@/components/dashboard/DashboardClient';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Home } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

export const metadata = {
  title: 'Bảng Điều Khiển Nghiệp Vụ (Dashboard) | Antigravity HRMS',
  description: 'Bảng điều khiển theo vai trò: Admin, HR, Manager và Employee với số liệu trực tiếp từ cơ sở dữ liệu.',
};

export default function DashboardPage() {
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
            <span className="text-xs font-semibold text-slate-200">Dashboard</span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/attendance">
              <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900/60 text-slate-300 text-xs">
                Chấm Công
              </Button>
            </Link>
            <Link href="/payroll">
              <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900/60 text-slate-300 text-xs">
                Bảng Lương
              </Button>
            </Link>
          </div>
        </div>

        {/* Client Dashboard Component */}
        <DashboardClient />
      </div>
    </AppShell>
  );
}
