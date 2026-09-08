'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Calculator,
  Bell,
  Menu,
  X,
  Building2,
  TrendingUp,
  Gift,
  ShieldAlert,
  FileText,
  Briefcase,
  LogOut,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { useLogout } from '@/lib/auth/use-logout';

interface MobileNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Bottom tab items (5 max for ergonomics)
const BOTTOM_TABS: MobileNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Nhân Sự', href: '/employees', icon: Users },
  { label: 'Chấm Công', href: '/attendance', icon: Clock },
  { label: 'Nghỉ Phép', href: '/leaves', icon: CalendarDays },
  { label: 'Menu', href: '#', icon: Menu },
];

// Full drawer menu
const DRAWER_ITEMS: MobileNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Nhân Sự (HR)', href: '/employees', icon: Users },
  { label: 'Phòng Ban', href: '/organization', icon: Building2 },
  { label: 'Ca & Phân Ca', href: '/shifts', icon: Briefcase },
  { label: 'Chấm Công', href: '/attendance', icon: Clock },
  { label: 'Nghỉ Phép', href: '/leaves', icon: CalendarDays },
  { label: 'Hiệu Suất KPI', href: '/kpi', icon: TrendingUp },
  { label: 'Khen Thưởng', href: '/bonus', icon: Gift },
  { label: 'Kỷ Luật', href: '/penalties', icon: ShieldAlert },
  { label: 'Bảng Lương', href: '/payroll', icon: Calculator },
  { label: 'Phiếu Lương', href: '/my-payslips', icon: FileText },
  { label: 'Báo Cáo', href: '/reports', icon: FileText },
  { label: 'Thông Báo', href: '/notifications', icon: Bell },
];

interface MobileNavProps {
  unreadCount?: number;
}

export function MobileNav({ unreadCount = 0 }: MobileNavProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { logout, loggingOut } = useLogout();

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const isActive = (href: string) => {
    if (href === '#' || href === '/dashboard') return pathname === href.replace('#', '/dashboard');
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 border-t border-slate-800/60 backdrop-blur-md"
        aria-label="Điều hướng di động"
      >
        <div className="flex">
          {BOTTOM_TABS.map((item) => {
            const Icon = item.icon;
            const isMenu = item.href === '#';
            const active = !isMenu && isActive(item.href);

            if (isMenu) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="Mở menu"
                  className={cn(
                    'flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[10px] font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:bg-slate-800/60',
                    'text-slate-500 hover:text-slate-300'
                  )}
                >
                  <div className="relative">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span>{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[10px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:bg-slate-800/60',
                  active ? 'text-blue-400 font-semibold' : 'text-slate-500 hover:text-slate-300'
                )}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {item.href === '/notifications' && unreadCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-500"
                      aria-label={`${unreadCount} thông báo`}
                    />
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Slide-in Drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu điều hướng">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-950 border-r border-slate-800/60 overflow-y-auto flex flex-col">
            {/* Drawer header */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800/60">
              <span className="font-bold text-white">
                <span className="text-blue-400">AGY</span> HRMS
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Đóng menu"
                className="rounded-md p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 py-4 px-3 space-y-1">
              {DRAWER_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      active
                        ? 'bg-blue-600/15 text-blue-300 border border-blue-500/25'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    {item.label}
                    {item.href === '/notifications' && unreadCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Drawer Footer / Logout */}
            <div className="border-t border-slate-800/60 p-4 mt-auto">
              <button
                type="button"
                onClick={logout}
                disabled={loggingOut}
                className="flex items-center justify-center gap-2.5 w-full rounded-xl py-3 px-4 text-sm font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
              >
                {loggingOut ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <LogOut className="h-4.5 w-4.5" />
                )}
                <span>{loggingOut ? 'Đang đăng xuất...' : 'Đăng Xuất'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
