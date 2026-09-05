'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, Clock, ArrowRightFromLine, ChevronRight, Loader2, RefreshCw, InboxIcon } from 'lucide-react';
import { LeaveProcessModal } from './LeaveProcessModal';

interface PendingLeaveItem {
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

interface DashboardSummary {
  totalPending: number;
  pendingLeaves: number;
  pendingLate: number;
  pendingEarly: number;
  recentPending: PendingLeaveItem[];
}

const TYPE_CONFIG: Record<string, { label: string; Icon: React.ElementType; badgeClass: string }> = {
  LEAVE: { label: 'Nghỉ phép', Icon: CalendarDays, badgeClass: 'border-blue-500/40 text-blue-300 bg-blue-500/10' },
  LATE_REQUEST: { label: 'Đi muộn', Icon: Clock, badgeClass: 'border-amber-500/40 text-amber-300 bg-amber-500/10' },
  EARLY_LEAVE: { label: 'Về sớm', Icon: ArrowRightFromLine, badgeClass: 'border-orange-500/40 text-orange-300 bg-orange-500/10' },
};

interface PendingLeavesWidgetProps {
  /** If true, shows process (approve/reject) button — for managers/HR/admin */
  canProcess?: boolean;
  /** Href to navigate to full leaves list */
  leavesHref?: string;
}

export function PendingLeavesWidget({ canProcess = false, leavesHref = '/leaves' }: PendingLeavesWidgetProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<PendingLeaveItem | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/leaves/summary');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Không tải được dữ liệu');
      setSummary(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleProcessSuccess = () => {
    setSelectedRequest(null);
    fetchSummary();
  };

  return (
    <>
      <Card className="border-slate-800/80 bg-slate-900/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Đơn Nghỉ Phép & Ngoại Lệ</h3>
            {summary && summary.totalPending > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-red-500/20 border border-red-500/40 px-1.5 text-[10px] font-bold text-red-300">
                {summary.totalPending}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSummary}
              disabled={loading}
              className="rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
              title="Tải lại"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <a href={leavesHref} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
              Xem tất cả <ChevronRight className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Counter chips */}
        {summary && (
          <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800">
            {[
              { label: 'Nghỉ phép', count: summary.pendingLeaves, color: 'text-blue-300' },
              { label: 'Đi muộn', count: summary.pendingLate, color: 'text-amber-300' },
              { label: 'Về sớm', count: summary.pendingEarly, color: 'text-orange-300' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center py-2.5 px-3">
                <span className={`text-xl font-bold ${s.color}`}>{s.count}</span>
                <span className="text-[10px] text-slate-500">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-500/20 bg-red-950/20 px-4 py-3 text-sm text-red-400 text-center">
              {error}
            </div>
          )}

          {!loading && !error && summary?.recentPending.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-500">
              <InboxIcon className="h-8 w-8 text-slate-600" />
              <p className="text-sm">Không có đơn nào đang chờ duyệt</p>
            </div>
          )}

          {!loading && !error && summary && summary.recentPending.length > 0 && (
            <div className="space-y-2">
              {summary.recentPending.map((req) => {
                const cfg = TYPE_CONFIG[req.requestType];
                const Icon = cfg?.Icon ?? CalendarDays;
                const fullName = `${req.employee.lastName} ${req.employee.firstName}`;
                const dateStr =
                  req.startDate === req.endDate ? req.startDate : `${req.startDate} → ${req.endDate}`;

                return (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/20 px-3 py-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800">
                      <Icon className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white truncate">{fullName}</p>
                        {cfg && (
                          <span className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${cfg.badgeClass}`}>
                            {cfg.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {dateStr}
                        {req.employee.department ? ` · ${req.employee.department.name}` : ''}
                      </p>
                    </div>
                    {canProcess && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedRequest(req)}
                        className="shrink-0 border-slate-700 bg-slate-800/60 text-slate-300 hover:border-blue-500/50 hover:text-blue-300 h-7 px-2.5 text-xs"
                      >
                        Xét duyệt
                      </Button>
                    )}
                  </div>
                );
              })}

              {summary.totalPending > summary.recentPending.length && (
                <a
                  href={leavesHref}
                  className="block text-center py-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  +{summary.totalPending - summary.recentPending.length} đơn khác đang chờ...
                </a>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Process modal */}
      <LeaveProcessModal
        isOpen={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        onSuccess={handleProcessSuccess}
        request={selectedRequest}
      />
    </>
  );
}
