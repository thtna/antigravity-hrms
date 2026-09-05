'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  Calendar,
  Gift,
  ShieldAlert,
  DollarSign,
  AlertTriangle,
  Info,
  ExternalLink,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

function formatRelativeTime(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch unread count initially and periodically
  const fetchUnreadCount = async () => {
    try {
      const res = await fetch('/api/v1/notifications/unread-count');
      if (res.ok) {
        const json = await res.json();
        setUnreadCount(json.data?.unreadCount || 0);
      }
    } catch {
      // ignore in silent poll
    }
  };

  // Fetch recent notifications when dropdown opens
  const fetchRecentNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/notifications?limit=8');
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.items || []);
        setUnreadCount(json.data?.meta?.unreadCount || 0);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s poll
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchRecentNotifications();
    }
  }, [isOpen]);

  // Handle clicking outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/v1/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await fetch('/api/v1/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId: item.id }),
        });
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Failed to mark item as read:', err);
      }
    }

    if (item.actionUrl) {
      router.push(item.actionUrl);
    }
    setIsOpen(false);
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'leave_request':
      case 'leave_approval':
        return {
          icon: <Calendar className="h-4 w-4 text-emerald-400" />,
          bg: 'bg-emerald-500/10 border-emerald-500/30',
          label: 'Nghỉ phép',
        };
      case 'attendance_issue':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-rose-400" />,
          bg: 'bg-rose-500/10 border-rose-500/30',
          label: 'Chấm công',
        };
      case 'bonus':
        return {
          icon: <Gift className="h-4 w-4 text-amber-400" />,
          bg: 'bg-amber-500/10 border-amber-500/30',
          label: 'Khen thưởng',
        };
      case 'penalty':
        return {
          icon: <ShieldAlert className="h-4 w-4 text-red-400" />,
          bg: 'bg-red-500/10 border-red-500/30',
          label: 'Kỷ luật',
        };
      case 'payroll':
        return {
          icon: <DollarSign className="h-4 w-4 text-purple-400" />,
          bg: 'bg-purple-500/10 border-purple-500/30',
          label: 'Bảng lương',
        };
      default:
        return {
          icon: <Info className="h-4 w-4 text-blue-400" />,
          bg: 'bg-blue-500/10 border-blue-500/30',
          label: 'Hệ thống',
        };
    }
  };

  const displayedNotifications =
    filterTab === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 hover:text-white transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        title="Thông báo"
        aria-label="Xem thông báo"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white shadow-lg shadow-rose-600/40 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-96 max-w-[calc(100vw-24px)] rounded-2xl border border-slate-800/90 bg-slate-950/95 p-0 shadow-2xl backdrop-blur-2xl z-50 overflow-hidden text-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800/80 bg-slate-900/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white tracking-wide text-sm">Thông Báo</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30">
                  {unreadCount} mới
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition flex items-center gap-1 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Đọc tất cả
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-slate-800/80 px-4 pt-2 gap-3 bg-slate-900/20 text-xs">
            <button
              onClick={() => setFilterTab('all')}
              className={`pb-2 font-medium transition-colors border-b-2 ${
                filterTab === 'all'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Tất cả ({notifications.length})
            </button>
            <button
              onClick={() => setFilterTab('unread')}
              className={`pb-2 font-medium transition-colors border-b-2 ${
                filterTab === 'unread'
                  ? 'border-blue-500 text-blue-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Chưa đọc ({unreadCount})
            </button>
          </div>

          {/* List Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/50">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <span className="text-xs">Đang tải thông báo...</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="mx-auto w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mb-3 text-slate-500">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-300">Không có thông báo nào</p>
                <p className="text-xs text-slate-500 mt-1">
                  {filterTab === 'unread'
                    ? 'Bạn đã đọc toàn bộ thông báo gần đây!'
                    : 'Chưa có thông báo mới phát sinh.'}
                </p>
              </div>
            ) : (
              displayedNotifications.map((item) => {
                const badge = getEventBadge(item.type);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`flex items-start gap-3 p-3.5 hover:bg-slate-900/80 transition cursor-pointer group ${
                      !item.isRead ? 'bg-blue-950/15' : ''
                    }`}
                  >
                    {/* Icon */}
                    <div className={`p-2 rounded-xl border ${badge.bg} shrink-0 mt-0.5`}>
                      {badge.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-semibold text-white truncate group-hover:text-blue-400 transition">
                          {item.title}
                        </span>
                        {!item.isRead && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(item.createdAt)}
                        </span>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                          {badge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer View All Link */}
          <div className="p-2.5 border-t border-slate-800/80 bg-slate-900/40 text-center">
            <a
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition py-1"
            >
              Mở Trung Tâm Thông Báo
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
