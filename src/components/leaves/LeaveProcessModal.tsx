'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle, CheckCircle2, ThumbsUp, ThumbsDown, User, Calendar, Clock } from 'lucide-react';

interface LeaveRequestSummary {
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

interface LeaveProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  request: LeaveRequestSummary | null;
}

const REQUEST_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  LEAVE: { label: 'Nghỉ Phép', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  LATE_REQUEST: { label: 'Đi Muộn', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  EARLY_LEAVE: { label: 'Về Sớm', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
};

export function LeaveProcessModal({ isOpen, onClose, onSuccess, request }: LeaveProcessModalProps) {
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Escape key handler
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading]);

  if (!isOpen || !request) return null;

  const typeInfo = REQUEST_TYPE_LABELS[request.requestType] || { label: request.requestType, color: 'text-slate-400' };

  function handleClose() {
    setDecision(null);
    setApprovalNotes('');
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision || !request) return;
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = { decision };
      if (approvalNotes.trim()) body.approvalNotes = approvalNotes.trim();

      const res = await fetch(`/api/v1/leaves/${request.id}/process`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể xử lý đơn. Vui lòng thử lại.');
      }

      setDone(true);
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
    } finally {
      setLoading(false);
    }
  }

  const fullName = request.employee
    ? `${request.employee.lastName || ''} ${request.employee.firstName || ''}`.trim() || 'Nhân viên'
    : 'Nhân viên';
  const dateLabel =
    request.startDate === request.endDate
      ? request.startDate
      : `${request.startDate} → ${request.endDate}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-process-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 id="leave-process-modal-title" className="text-lg font-bold text-white">Xét Duyệt Đơn</h2>
            <p className="text-xs text-slate-400 mt-0.5">Phê duyệt hoặc từ chối đơn xin nghỉ / ngoại lệ</p>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Success */}
          {done && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className={`rounded-full p-4 ${decision === 'APPROVED' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <CheckCircle2 className={`h-10 w-10 ${decision === 'APPROVED' ? 'text-emerald-400' : 'text-red-400'}`} />
              </div>
              <p className="text-base font-semibold text-white">
                {decision === 'APPROVED' ? 'Đơn đã được phê duyệt!' : 'Đơn đã bị từ chối!'}
              </p>
            </div>
          )}

          {/* Error */}
          {!done && error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {!done && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Request summary card */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 space-y-3">
                {/* Employee row */}
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-300">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{fullName}</p>
                    <p className="text-xs text-slate-400">
                      {request.employee.employeeCode}
                      {request.employee.department ? ` · ${request.employee.department.name}` : ''}
                      {request.employee.position ? ` · ${request.employee.position.title}` : ''}
                    </p>
                  </div>
                  <div className="ml-auto">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-700/60" />

                {/* Date / time */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{dateLabel}</span>
                  </div>
                  {request.expectedTime && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Dự kiến: {request.expectedTime}</span>
                    </div>
                  )}
                  <div className="text-slate-400">
                    <span className="font-medium text-slate-300">{request.durationDays}</span> ngày
                  </div>
                  {request.leaveType && (
                    <div className="text-slate-400">
                      Loại: <span className="text-slate-300">{request.leaveType.name}</span>
                    </div>
                  )}
                </div>

                {/* Reason */}
                <div className="rounded-lg bg-slate-900/50 px-3 py-2.5 text-xs text-slate-300 leading-relaxed">
                  <span className="text-slate-500 font-medium">Lý do: </span>
                  {request.reason}
                </div>
              </div>

              {/* Decision buttons */}
              <div>
                <p className="mb-2.5 text-xs font-medium text-slate-300">Quyết định của bạn</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVED')}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                      decision === 'APPROVED'
                        ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300 shadow-sm shadow-emerald-500/20'
                        : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400'
                    }`}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    Phê Duyệt
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision('REJECTED')}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                      decision === 'REJECTED'
                        ? 'border-red-500 bg-red-950/60 text-red-300 shadow-sm shadow-red-500/20'
                        : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-red-500/50 hover:text-red-400'
                    }`}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    Từ Chối
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-slate-300">
                  Ghi chú / Lý do từ chối
                  {decision === 'REJECTED' && <span className="ml-1 text-red-400">* (bắt buộc khi từ chối)</span>}
                </label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  required={decision === 'REJECTED'}
                  minLength={decision === 'REJECTED' ? 5 : 0}
                  rows={3}
                  placeholder={
                    decision === 'REJECTED'
                      ? 'Vui lòng nêu lý do từ chối rõ ràng...'
                      : 'Ghi chú thêm (không bắt buộc)...'
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={loading}
                  className="text-slate-400 hover:text-white"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !decision || (decision === 'REJECTED' && approvalNotes.trim().length < 5)}
                  className={`min-w-[140px] text-white shadow-lg ${
                    decision === 'REJECTED'
                      ? 'bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 shadow-red-500/20'
                      : 'bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 shadow-emerald-500/20'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang xử lý...
                    </span>
                  ) : decision === 'APPROVED' ? (
                    'Xác Nhận Phê Duyệt'
                  ) : decision === 'REJECTED' ? (
                    'Xác Nhận Từ Chối'
                  ) : (
                    'Chọn quyết định...'
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
