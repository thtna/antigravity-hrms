import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: 'Antigravity HRMS — Hệ Thống Quản Trị Nhân Sự & Chấm Công',
  description:
    'Hệ thống quản lý Nhân viên, Chấm công QR & GPS, KPI, Thưởng Phạt và Tính Lương doanh nghiệp tự động.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark h-full">
      <body className={`${inter.className} min-h-screen bg-[#070b14] text-slate-100 antialiased`}>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
