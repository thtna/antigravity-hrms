'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  TrendingUp,
  Gift,
  ShieldAlert,
  Calculator,
  FileText,
  Bell,
  ChevronLeft,
  ChevronRight,
  Building2,
  Briefcase,
  type LucideIcon,
} from 'lucide-react';

// ─── Nav items ────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Tổng Quan' },
  { label: 'Nhân Sự (HR)', href: '/employees', icon: Users, group: 'Nghiệp Vụ' },
  { label: 'Phòng Ban & Chức Vụ', href: '/organization', icon: Building2, group: 'Nghiệp Vụ' },
  { label: 'Ca & Phân Ca', href: '/shifts', icon: Briefcase, group: 'Nghiệp Vụ' },
  { label: 'Chấm Công', href: '/attendance', icon: Clock, group: 'Nghiệp Vụ' },
  { label: 'Nghỉ Phép', href: '/leaves', icon: CalendarDays, group: 'Nghiệp Vụ' },
  { label: 'Hiệu Suất & KPI', href: '/kpi', icon: TrendingUp, group: 'Đánh Giá' },
  { label: 'Khen Thưởng', href: '/bonus', icon: Gift, group: 'Đánh Giá' },
  { label: 'Kỷ Luật & Phạt', href: '/penalties', icon: ShieldAlert, group: 'Đánh Giá' },
  { label: 'Bảng Lương', href: '/payroll', icon: Calculator, group: 'Tài Chính' },
  { label: 'Phiếu Lương', href: '/my-payslips', icon: FileText, group: 'Tài Chính' },
  { label: 'Báo Cáo & Export', href: '/reports', icon: FileText, group: 'Tài Chính' },
  { label: 'Thông Báo', href: '/notifications', icon: Bell, group: 'Hệ Thống' },
  { label: 'Super Admin', href: '/super-admin', icon: ShieldAlert, group: 'Hệ Thống' },
];

const GROUPS = ['Tổng Quan', 'Nghiệp Vụ', 'Đánh Giá', 'Tài Chính', 'Hệ Thống'];

// ─── Component ────────────────────────────────────────────────────────────────

interface SidebarProps {
  unreadCount?: number;
}

export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const itemsWithBadge = NAV_ITEMS.map((item) =>
    item.href === '/notifications' ? { ...item, badge: unreadCount } : item
  );

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col shrink-0 bg-slate-950/80 border-r border-slate-800/60 backdrop-blur-sm',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64'
      )}
      aria-label="Điều hướng chính"
    >
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-slate-800/60 px-4">
        {!collapsed && (
          <span className="text-sm font-bold text-white truncate">
            <span className="text-blue-400">AGY</span> HRMS
          </span>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            'ml-auto rounded-md p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
          )}
          aria-label={collapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2" aria-label="Menu chính">
        {GROUPS.map((group) => {
          const groupItems = itemsWithBadge.filter((i) => i.group === group);
          if (!groupItems.length) return null;
          return (
            <div key={group}>
              {!collapsed && (
                <p className="mb-1 mt-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600 select-none first:mt-0">
                  {group}
                </p>
              )}
              {groupItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      active
                        ? 'bg-blue-600/15 text-blue-300 border border-blue-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4.5 w-4.5 shrink-0',
                        active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                      )}
                      aria-hidden="true"
                    />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                    {!collapsed && item.badge && item.badge > 0 ? (
                      <span
                        className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white"
                        aria-label={`${item.badge} thông báo chưa đọc`}
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                    {collapsed && item.badge && item.badge > 0 ? (
                      <span
                        className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-blue-500"
                        aria-label={`${item.badge} thông báo`}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
