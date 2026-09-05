'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  UserX,
} from 'lucide-react';
import { PenaltyItem } from './PenaltyEditModal';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';
import { PENALTY_CATEGORY_LABELS } from './PenaltyCreateModal';

interface PenaltyProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  penalty: PenaltyItem | null;
  currentEmployeeId?: string;
}

export function PenaltyProcessModal({
  isOpen,
  onClose,
  onSuccess,
  penalty,
  currentEmployeeId,
}: PenaltyProcessModalProps) {
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!isOpen || !penalty) return null;

  // Self-approval guard
  const isSelf = Boolean(
    currentEmployeeId && penalty.employeeId && currentEmployeeId === penalty.employeeId
  );

  function handleClose() {
    setError(null);
    setDone(false);
    setApprovalNotes('');
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!penalty) return;

    if (isSelf) {
      setError('Bạn không thể tự phê duyệt hoặc từ chối biên bản kỷ luật của chính mình.');
      return;
    }

    if (decision === 'REJECTED' && (!approvalNotes.trim() || approvalNotes.trim().length < 3)) {
      setError('Bắt buộc nhập lý do giải trình khi từ chối biên bản xử phạt (tối thiểu 3 ký tự).');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/penalties/${penalty.id}/process`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          approvalNotes: approvalNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể xử lý biên bản xử phạt.');
      }

      setDone(true);
      setTimeout(() => {
        setDone(false);
        setApprovalNotes('');
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  }

  const categoryMeta = PENALTY_CATEGORY_LABELS[penalty.category] || {
    label: penalty.category,
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`rounded-lg p-2 ${
                decision === 'APPROVED'
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-slate-700/30 text-slate-300'
              }`}
            >
              {decision === 'APPROVED' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Xét Duyệt Biên Bản Xử Phạt</h2>
              <p className="text-xs text-slate-400">
                Phê duyệt khấu trừ lương hoặc hủy bỏ biên bản kỷ luật
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Target Info Summary */}
          <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">Nhân viên vi phạm:</span>
                <p className="text-sm font-bold text-white">
                  {penalty.employee.lastName} {penalty.employee.firstName} (
                  {penalty.employee.employeeCode})
                </p>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${categoryMeta.badgeClass}`}
              >
                {categoryMeta.label.split(' (')[0]}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-700/40">
              <div>
                <span className="text-slate-400">Số tiền khấu trừ:</span>
                <p className="font-mono font-bold text-rose-400 text-sm">
                  {formatBonusVnd(Number(penalty.amount))}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Kỳ áp dụng:</span>
                <p className="font-mono text-white font-medium">{penalty.period}</p>
              </div>
            </div>

            <div className="text-xs pt-1">
              <span className="text-slate-400">Lý do xử phạt: </span>
              <span className="text-slate-200">{penalty.reason}</span>
            </div>
          </div>

          {/* Self Approval Warning */}
          {isSelf && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-xs text-red-200">
              <UserX className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>
                <strong>Cảnh Báo Chống Gian Lận: </strong>
                Biên bản xử phạt này áp dụng cho tài khoản của bạn. Hệ thống nghiêm cấm tự phê duyệt
                hoặc tự bác bỏ án kỷ luật của chính mình.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>
                Đã {decision === 'APPROVED' ? 'phê duyệt khấu trừ' : 'từ chối biên bản'} thành công!
              </span>
            </div>
          )}

          {/* Decision Buttons */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Quyết Định Xử Lý <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDecision('APPROVED')}
                disabled={isSelf}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-xs font-semibold transition-all ${
                  decision === 'APPROVED'
                    ? 'border-red-500 bg-red-950/50 text-red-300 ring-1 ring-red-500'
                    : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700'
                } disabled:opacity-50`}
              >
                <CheckCircle className="h-4 w-4" />
                Phê Duyệt Khấu Trừ
              </button>

              <button
                type="button"
                onClick={() => setDecision('REJECTED')}
                disabled={isSelf}
                className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-xs font-semibold transition-all ${
                  decision === 'REJECTED'
                    ? 'border-slate-600 bg-slate-800 text-white ring-1 ring-slate-500'
                    : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700'
                } disabled:opacity-50`}
              >
                <XCircle className="h-4 w-4" />
                Bác Bỏ / Hủy Bỏ
              </button>
            </div>
          </div>

          {/* Approval Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              {decision === 'REJECTED' ? (
                <span>
                  Lý Do Bác Bỏ / Giải Trình <span className="text-red-400">*</span>
                </span>
              ) : (
                'Ý Kiến Phê Duyệt (Tùy Chọn)'
              )}
            </label>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              disabled={isSelf}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none disabled:opacity-50"
              placeholder={
                decision === 'REJECTED'
                  ? 'Bắt buộc nhập lý do bác bỏ (ví dụ: Nhân viên có lý do chính đáng, đã nộp giấy nghỉ phép bù)...'
                  : 'Ghi chú cho phòng Kế toán / Nhân sự khi trừ lương...'
              }
              required={decision === 'REJECTED'}
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading || done || isSelf}
              className={
                decision === 'APPROVED'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-500/20'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }
            >
              {loading
                ? 'Đang Xử Lý...'
                : decision === 'APPROVED'
                ? 'Xác Nhận Phê Duyệt Phạt'
                : 'Xác Nhận Bác Bỏ'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
