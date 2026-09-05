'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  Check,
  RotateCcw,
  Trash2,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  Gift,
  ShieldAlert,
  DollarSign,
  Info,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToastHelpers } from '@/components/ui/toast';

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

export function NotificationsClient() {
  const confirm = useConfirm();
  const toast = useToastHelpers();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [isReadFilter, setIsReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
      });

      if (search.trim()) params.append('search', search.trim());
      if (selectedType !== 'all') params.append('type', selectedType);
      if (isReadFilter === 'unread') params.append('isRead', 'false');
      if (isReadFilter === 'read') params.append('isRead', 'true');

      const res = await fetch(`/api/v1/notifications?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.items || []);
        setTotalCount(json.data?.meta?.total || 0);
        setUnreadCount(json.data?.meta?.unreadCount || 0);
        setTotalPages(json.data?.meta?.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [page, selectedType, isReadFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchNotifications();
  };

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
        toast.success('Đã đánh dấu tất cả là đã đọc');
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      toast.error('Không thể đánh dấu tất cả đã đọc');
    }
  };

  const handleToggleReadStatus = async (item: NotificationItem) => {
    setActionLoadingId(item.id);
    try {
      const endpoint = item.isRead ? '/api/v1/notifications/unread' : '/api/v1/notifications/read';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: item.id }),
      });

      if (res.ok) {
        const newReadStatus = !item.isRead;
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: newReadStatus } : n))
        );
        setUnreadCount((prev) => (newReadStatus ? Math.max(0, prev - 1) : prev + 1));
      }
    } catch (err) {
      console.error('Failed to toggle read status:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Xóa thông báo',
      description: 'Bạn có chắc chắn muốn xóa thông báo này? Thao tác này không thể hoàn tác.',
      confirmLabel: 'Xóa',
      cancelLabel: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/v1/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const deleted = notifications.find((n) => n.id === id);
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setTotalCount((prev) => Math.max(0, prev - 1));
        if (deleted && !deleted.isRead) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
        toast.success('Đã xóa thông báo');
      } else {
        toast.error('Không thể xóa thông báo');
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
      toast.error('Lỗi khi xóa thông báo');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'leave_request':
        return {
          icon: <Calendar className="h-4 w-4 text-blue-400" />,
          bg: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
          label: 'Đơn Xin Nghỉ Phép',
        };
      case 'leave_approval':
        return {
          icon: <Calendar className="h-4 w-4 text-emerald-400" />,
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
          label: 'Kết Quả Nghỉ Phép',
        };
      case 'attendance_issue':
        return {
          icon: <AlertTriangle className="h-4 w-4 text-rose-400" />,
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
          label: 'Vấn Đề Chấm Công',
        };
      case 'bonus':
        return {
          icon: <Gift className="h-4 w-4 text-amber-400" />,
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
          label: 'Khen Thưởng',
        };
      case 'penalty':
        return {
          icon: <ShieldAlert className="h-4 w-4 text-red-400" />,
          bg: 'bg-red-500/10 border-red-500/30 text-red-300',
          label: 'Kỷ Luật & Phạt',
        };
      case 'payroll':
        return {
          icon: <DollarSign className="h-4 w-4 text-purple-400" />,
          bg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
          label: 'Bảng Lương / Phiếu Lương',
        };
      default:
        return {
          icon: <Info className="h-4 w-4 text-sky-400" />,
          bg: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
          label: 'Sự Kiện Hệ Thống',
        };
    }
  };

  const typeTabs = [
    { id: 'all', label: 'Tất cả' },
    { id: 'leave_request', label: 'Đơn xin phép' },
    { id: 'leave_approval', label: 'Duyệt phép' },
    { id: 'attendance_issue', label: 'Chấm công' },
    { id: 'bonus', label: 'Khen thưởng' },
    { id: 'penalty', label: 'Kỷ luật/Phạt' },
    { id: 'payroll', label: 'Bảng lương' },
    { id: 'system_event', label: 'Hệ thống' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header & Metric Counters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Bell className="h-6 w-6" />
            </span>
            Trung Tâm Thông Báo (Notification Center)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Theo dõi toàn bộ thông báo in-app, cảnh báo chấm công, phê duyệt nghỉ phép, khen thưởng và lương bổng.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Làm mới
          </Button>

          {unreadCount > 0 && (
            <Button
              size="sm"
              onClick={handleMarkAllAsRead}
              className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
            >
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Đánh dấu tất cả đã đọc
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/30 backdrop-blur">
          <div className="text-xs text-slate-400 font-medium">Tổng Thông Báo</div>
          <div className="text-2xl font-bold text-white mt-1">{totalCount}</div>
        </div>
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/10 backdrop-blur">
          <div className="text-xs text-rose-400 font-medium">Chưa Đọc</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{unreadCount}</div>
        </div>
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 backdrop-blur">
          <div className="text-xs text-emerald-400 font-medium">Đã Đọc</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{Math.max(0, totalCount - unreadCount)}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4 backdrop-blur">
        {/* Type Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {typeTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setSelectedType(tab.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition shrink-0 ${
                selectedType === tab.id
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Tìm kiếm theo tiêu đề hoặc nội dung thông báo..."
              className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-500 text-xs h-9 w-full"
            />
          </form>

          <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => {
                setIsReadFilter('all');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                isReadFilter === 'all'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => {
                setIsReadFilter('unread');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                isReadFilter === 'unread'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Chưa đọc
            </button>
            <button
              onClick={() => {
                setIsReadFilter('read');
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                isReadFilter === 'read'
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Đã đọc
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Không tìm thấy thông báo nào"
            description="Bạn không có thông báo nào phù hợp với bộ lọc hiện tại. Hãy thử thay đổi loại sự kiện hoặc từ khóa tìm kiếm."
          />
        ) : (
          notifications.map((item) => {
            const badge = getEventBadge(item.type);
            const isActing = actionLoadingId === item.id;

            return (
              <div
                key={item.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border transition-all duration-200 ${
                  !item.isRead
                    ? 'bg-gradient-to-r from-blue-950/20 to-slate-900/50 border-blue-500/30 shadow-md shadow-blue-950/20'
                    : 'bg-slate-900/30 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Left info */}
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className={`p-2.5 rounded-xl border ${badge.bg} shrink-0 mt-0.5`}>
                    {badge.icon}
                  </div>

                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {item.title}
                      </span>
                      {!item.isRead && (
                        <span className="rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
                          Mới
                        </span>
                      )}
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                      {item.message}
                    </p>

                    <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(item.createdAt).toLocaleString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action buttons */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {item.actionUrl && (
                    <a href={item.actionUrl}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-blue-500/30 bg-blue-950/30 text-blue-300 hover:bg-blue-900/40"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Xem mục
                      </Button>
                    </a>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isActing}
                    onClick={() => handleToggleReadStatus(item)}
                    className={`h-8 px-2.5 text-xs ${
                      item.isRead
                        ? 'text-slate-400 hover:text-white'
                        : 'text-blue-400 hover:text-blue-300'
                    }`}
                    title={item.isRead ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}
                  >
                    {item.isRead ? (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    {item.isRead ? 'Chưa đọc' : 'Đã đọc'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isActing}
                    onClick={() => handleDelete(item.id)}
                    className="h-8 w-8 p-0 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                    title="Xóa thông báo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-2 text-xs text-slate-400">
          <div>
            Trang <strong className="text-white">{page}</strong> trên <strong className="text-white">{totalPages}</strong> ({totalCount} thông báo)
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 text-xs border-slate-800 bg-slate-900"
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 text-xs border-slate-800 bg-slate-900"
            >
              Sau
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
