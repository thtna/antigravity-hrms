'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';
import { useToastHelpers } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  CalendarDays,
  Clock,
  ArrowRightFromLine,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  User,
  XCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { LeaveRequestModal } from '@/components/leaves/LeaveRequestModal';
import { LeaveProcessModal } from '@/components/leaves/LeaveProcessModal';

// ─── Types ───────────────────────────────────────────────────────────────────
interface LeaveItem {
  id: string;
  requestType: 'LEAVE' | 'LATE_REQUEST' | 'EARLY_LEAVE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  startDate: string;
  endDate: string;
  expectedTime?: string | null;
  durationDays: number;
  reason: string;
  approvalNotes?: string | null;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { name: string } | null;
    position?: { title: string } | null;
  };
  leaveType?: { name: string } | null;
  approver?: { firstName: string; lastName: string } | null;
  approvedAt?: string | null;
  createdAt: string;
}

interface Meta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; variant: string; Icon: React.ElementType }> = {
  PENDING: { label: 'Chờ duyệt', variant: 'warning', Icon: Clock },
  APPROVED: { label: 'Đã duyệt', variant: 'success', Icon: CheckCircle2 },
  REJECTED: { label: 'Từ chối', variant: 'destructive', Icon: XCircle },
  CANCELLED: { label: 'Đã hủy', variant: 'secondary', Icon: XCircle },
};

const TYPE_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  LEAVE: { label: 'Nghỉ phép', Icon: CalendarDays, color: 'text-blue-400' },
  LATE_REQUEST: { label: 'Đi muộn', Icon: Clock, color: 'text-amber-400' },
  EARLY_LEAVE: { label: 'Về sớm', Icon: ArrowRightFromLine, color: 'text-orange-400' },
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  PENDING: 'border-amber-500/40 text-amber-300 bg-amber-500/10',
  APPROVED: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10',
  REJECTED: 'border-red-500/40 text-red-300 bg-red-500/10',
  CANCELLED: 'border-slate-500/40 text-slate-400 bg-slate-500/10',
};

// ─── Helper ──────────────────────────────────────────────────────────────────
function formatDate(str: string) {
  return new Date(str).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Main Page ───────────────────────────────────────────────────────────────
function LeavesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { success, error: toastError } = useToastHelpers();
  const confirm = useConfirm();

  const [items, setItems] = useState<LeaveItem[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [status, setStatus] = useState(searchParams.get('status') || 'ALL');
  const [requestType, setRequestType] = useState(searchParams.get('requestType') || 'ALL');
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(Number(searchParams.get('page') || '1'));

  // Modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [processingItem, setProcessingItem] = useState<LeaveItem | null>(null);

  // Cancel modal state
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (requestType !== 'ALL') params.set('requestType', requestType);
      params.set('page', String(page));
      params.set('limit', '20');

      const res = await fetch(`/api/v1/leaves?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Không tải được danh sách đơn.');
      setItems(data.data.items);
      setMeta(data.data.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }, [status, requestType, page]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  async function handleCancel(id: string) {
    const ok = await confirm({
      title: 'Hủy đơn ngoại lệ',
      description: 'Bạn có chắc chắn muốn hủy đơn này không? Thao tác này không thể hoàn tác.',
      confirmLabel: 'Hủy đơn',
      cancelLabel: 'Đóng',
      variant: 'danger',
    });
    if (!ok) return;

    setCancelLoading(true);
    setCancelingId(id);
    try {
      const res = await fetch(`/api/v1/leaves/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Nhân viên tự hủy' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Không thể hủy đơn.');
      success('Đã hủy đơn', 'Đơn của bạn đã được hủy thành công.');
      fetchLeaves();
    } catch (err) {
      toastError('Lỗi hủy đơn', err instanceof Error ? err.message : 'Không thể hủy đơn.');
    } finally {
      setCancelLoading(false);
      setCancelingId(null);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-blue-400" />
              Quản Lý Nghỉ Phép & Ngoại Lệ
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Xem, tạo và xét duyệt các đơn xin nghỉ phép, đi muộn, về sớm.
            </p>
          </div>
          <Button
            onClick={() => setShowRequestModal(true)}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 gap-2"
          >
            <Plus className="h-4 w-4" />
            Tạo Đơn Mới
          </Button>
        </div>

        {/* Filters */}
        <Card className="border-slate-800/80 bg-slate-900/40 px-5 py-4">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Status filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-slate-400">Trạng thái:</span>
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatus(s); setPage(1); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    status === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {s === 'ALL' ? 'Tất cả' : STATUS_CONFIG[s]?.label || s}
                </button>
              ))}
            </div>

            {/* Separator */}
            <div className="h-5 w-px bg-slate-700" />

            {/* Type filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Loại:</span>
              {['ALL', 'LEAVE', 'LATE_REQUEST', 'EARLY_LEAVE'].map((t) => (
                <button
                  key={t}
                  onClick={() => { setRequestType(t); setPage(1); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    requestType === t
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {t === 'ALL' ? 'Tất cả' : TYPE_CONFIG[t]?.label || t}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchLeaves()}
              disabled={loading}
              className="ml-auto rounded-lg p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
              title="Tải lại"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <ErrorBanner
            title="Lỗi tải dữ liệu"
            description={error}
            onRetry={fetchLeaves}
          />
        )}

        {/* List */}
        {loading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Không có đơn nào"
            description="Chưa có đơn xin nghỉ phép, đi muộn hoặc về sớm nào phù hợp bộ lọc."
            actionLabel="Tạo Đơn Mới"
            onAction={() => setShowRequestModal(true)}
          />
        ) : (
          <Card className="border-slate-800/80 bg-slate-900/30 overflow-hidden">
            <div className="divide-y divide-slate-800/60">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr_auto] gap-4 px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <span>Nhân viên</span>
                <span>Loại đơn</span>
                <span>Thời gian</span>
                <span>Số ngày</span>
                <span>Trạng thái</span>
                <span>Hành động</span>
              </div>

              {items.map((item) => {
                const typeCfg = TYPE_CONFIG[item.requestType];
                const statusCfg = STATUS_CONFIG[item.status];
                const TypeIcon = typeCfg?.Icon ?? CalendarDays;
                const fullName = `${item.employee.lastName} ${item.employee.firstName}`;
                const dateStr =
                  item.startDate === item.endDate
                    ? formatDate(item.startDate)
                    : `${formatDate(item.startDate)} → ${formatDate(item.endDate)}`;

                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr_auto] gap-3 md:gap-4 px-5 py-4 hover:bg-slate-800/20 transition-colors"
                  >
                    {/* Employee */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-400">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{fullName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.employee.employeeCode}
                          {item.employee.department ? ` · ${item.employee.department.name}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Type */}
                    <div className="flex items-center gap-2">
                      <TypeIcon className={`h-4 w-4 shrink-0 ${typeCfg?.color ?? 'text-slate-400'}`} />
                      <span className="text-sm text-slate-300">{typeCfg?.label ?? item.requestType}</span>
                    </div>

                    {/* Date */}
                    <div className="flex flex-col justify-center">
                      <span className="text-sm text-slate-300">{dateStr}</span>
                      {item.expectedTime && (
                        <span className="text-xs text-slate-500">{item.expectedTime}</span>
                      )}
                    </div>

                    {/* Duration */}
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-white">{item.durationDays}</span>
                      <span className="ml-1 text-xs text-slate-500">ngày</span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[item.status]}`}
                      >
                        {statusCfg?.label ?? item.status}
                      </span>
                      {item.approver && item.status !== 'PENDING' && (
                        <span className="text-xs text-slate-500 hidden lg:inline">
                          bởi {item.approver.lastName} {item.approver.firstName}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {item.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setProcessingItem(item)}
                            className="border-slate-700 bg-slate-800/60 text-slate-300 hover:border-blue-500/50 hover:text-blue-300 h-7 px-2.5 text-xs"
                          >
                            Duyệt
                          </Button>
                          <button
                            onClick={() => handleCancel(item.id)}
                            disabled={cancelLoading && cancelingId === item.id}
                            className="rounded p-1 text-slate-500 hover:text-red-400 transition-colors"
                            title="Hủy đơn"
                          >
                            {cancelLoading && cancelingId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>
              Hiển thị {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} / {meta.total} đơn
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-1.5 disabled:opacity-40 hover:bg-slate-700 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2">Trang {meta.page}/{meta.totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages || loading}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-1.5 disabled:opacity-40 hover:bg-slate-700 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <LeaveRequestModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        onSuccess={() => { setShowRequestModal(false); fetchLeaves(); }}
      />

      <LeaveProcessModal
        isOpen={!!processingItem}
        onClose={() => setProcessingItem(null)}
        onSuccess={() => { setProcessingItem(null); fetchLeaves(); }}
        request={processingItem}
      />
    </AppShell>
  );
}

export default function LeavesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    }>
      <LeavesContent />
    </Suspense>
  );
}
