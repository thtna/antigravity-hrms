'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Award,
} from 'lucide-react';
import { BonusItem } from './BonusEditModal';
import { BONUS_CATEGORY_LABELS } from './BonusCreateModal';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

interface BonusProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bonus: BonusItem | null;
}

export function BonusProcessModal({
  isOpen,
  onClose,
  onSuccess,
  bonus,
}: BonusProcessModalProps) {
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!isOpen || !bonus) return null;

  const categoryInfo = BONUS_CATEGORY_LABELS[bonus.category] || {
    label: bonus.category,
    badgeClass: 'bg-slate-800 text-slate-300',
  };

  function handleClose() {
    setError(null);
    setApprovalNotes('');
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bonus) return;

    if (decision === 'REJECTED' && (!approvalNotes || approvalNotes.trim().length < 3)) {
      setError('Bắt buộc nhập lý do từ chối (tối thiểu 3 ký tự).');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/bonuses/${bonus.id}/process`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          approvalNotes: approvalNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể xử lý khoản thưởng.');
      }

      setDone(true);
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Xét Duyệt Khen Thưởng</h2>
              <p className="text-xs text-slate-400">
                Phê duyệt hoặc từ chối đề xuất thưởng tài chính
              </p>
            </div>
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
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {done && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div
                className={`rounded-full p-4 ${
                  decision === 'APPROVED' ? 'bg-emerald-500/10' : 'bg-red-500/10'
                }`}
              >
                {decision === 'APPROVED' ? (
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                ) : (
                  <XCircle className="h-10 w-10 text-red-400" />
                )}
              </div>
              <p className="text-base font-semibold text-white">
                {decision === 'APPROVED' ? 'Đã phê duyệt khoản thưởng!' : 'Đã từ chối khoản thưởng!'}
              </p>
            </div>
          )}

          {!done && (
            <>
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Summary of Bonus */}
              <div className="rounded-lg bg-slate-800/80 border border-slate-700/60 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Nhân viên:</span>
                  <span className="font-semibold text-white">
                    {bonus.employee.lastName} {bonus.employee.firstName} ({bonus.employee.employeeCode})
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Loại hình:</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${categoryInfo.badgeClass}`}>
                    {categoryInfo.label}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Kỳ thưởng:</span>
                  <span className="font-mono text-white font-medium">{bonus.period}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Lý do:</span>
                  <span className="text-slate-300 text-right max-w-[280px] line-clamp-2">
                    {bonus.reason}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-700/60">
                  <span className="text-slate-400 font-medium">Số tiền thưởng:</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    {formatBonusVnd(Number(bonus.amount))}
                  </span>
                </div>
              </div>

              {/* Decision */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Quyết Định Duyệt
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVED')}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                      decision === 'APPROVED'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50'
                        : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Đồng Ý Phê Duyệt
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecision('REJECTED')}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                      decision === 'REJECTED'
                        ? 'bg-red-600/20 border-red-500 text-red-300 shadow-md shadow-red-950/50'
                        : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <XCircle className="h-4 w-4 text-red-400" />
                    Từ Chối
                  </button>
                </div>
              </div>

              {/* Approval Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Ý Kiến Phê Duyệt / Lý Do Từ Chối {decision === 'REJECTED' && <span className="text-red-400">*</span>}
                </label>
                <textarea
                  rows={2}
                  required={decision === 'REJECTED'}
                  placeholder={
                    decision === 'REJECTED'
                      ? 'Bắt buộc ghi rõ lý do từ chối...'
                      : 'Ghi chú phê duyệt (tùy chọn)...'
                  }
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={loading}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Hủy Bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !bonus}
                  className={
                    decision === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5'
                      : 'bg-red-600 hover:bg-red-500 text-white font-medium px-5'
                  }
                >
                  {loading ? 'Đang xử lý...' : decision === 'APPROVED' ? 'Xác Nhận Phê Duyệt' : 'Xác Nhận Từ Chối'}
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
