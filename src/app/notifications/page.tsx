import { Metadata } from 'next';
import Link from 'next/link';
import { NotificationsClient } from '@/components/notifications/NotificationsClient';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Trung Tâm Thông Báo (Notifications) | Antigravity HRMS',
  description: 'Quản lý thông báo nghiệp vụ in-app, cảnh báo chấm công, phê duyệt nghỉ phép, khen thưởng và lương bổng.',
};

export default function NotificationsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Trang Chủ
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white">
                Dashboard
              </Button>
            </Link>
            <Link href="/reports">
              <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white">
                Báo Cáo
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </div>

        {/* Notification Studio */}
        <NotificationsClient />
      </div>
    </AppShell>
  );
}
