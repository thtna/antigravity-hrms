'use client';

import React from 'react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { SkipNav } from './SkipNav';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  /** Unread notification count for nav badges */
  unreadCount?: number;
  /** Extra classes on main content area */
  className?: string;
  /** Page header content (breadcrumb, title, actions) */
  header?: React.ReactNode;
}

export function AppShell({
  children,
  unreadCount = 0,
  className,
  header,
}: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#070b14]">
      {/* Skip Nav */}
      <SkipNav />

      {/* Desktop Sidebar */}
      <Sidebar unreadCount={unreadCount} />

      {/* Content area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile only branding + notification) */}
        <header className="lg:hidden flex h-14 items-center justify-between border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-sm px-4">
          <span className="font-bold text-sm text-white">
            <span className="text-blue-400">AGY</span> HRMS
          </span>
          {/* Slot for notification bell or user menu */}
          <div id="mobile-header-actions" />
        </header>

        {/* Optional page header */}
        {header && (
          <div className="border-b border-slate-800/40 bg-slate-900/30 px-4 py-3 lg:px-6">
            {header}
          </div>
        )}

        {/* Main scrollable area */}
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            'flex-1 overflow-y-auto',
            // Padding bottom for mobile nav bar
            'pb-20 lg:pb-0',
            'px-4 py-4 lg:px-6 lg:py-6',
            'focus:outline-none',
            className
          )}
        >
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav unreadCount={unreadCount} />
    </div>
  );
}
