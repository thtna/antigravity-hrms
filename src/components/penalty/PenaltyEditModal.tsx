'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';
import { PENALTY_CATEGORY_LABELS } from './PenaltyCreateModal';

export interface PenaltyItem {
  id: string;
  employeeId: string;
  type: string;
  category: string;
  amount: string | number;
  effectiveDate: string;
  period: string;
  reason: string;
  notes?: string | null;
  status: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  createdAt: string;
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { name: string };
  };
  approver?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface PenaltyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  penalty: PenaltyItem | null;
}

export function PenaltyEditModal({
  isOpen,
  onClose,
  onSuccess,
  penalty,
}: PenaltyEditModalProps) {
  const [category, setCategory] = useState('LATE');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (penalty) {
      setCategory(penalty.category);
      setAmount(String(penalty.amount));
      setPeriod(penalty.period);
      setEffectiveDate(
        penalty.effectiveDate ? new Date(penalty.effectiveDate).toISOString().slice(0, 10) : ''
      );
      setReason(penalty.reason);
      setNotes(penalty.notes || '');
      setError(null);
      setDone(false);
    }
  }, [penalty]);

  if (!isOpen || !penalty) return null;

  // Financial safety guard: if opened for non-pending, show lock notice
  const isEditable = penalty.status === 'PENDING';

  function handleClose() {
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditable || !penalty) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/penalties/${penalty.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          amount: Number(amount),
          effectiveDate: effectiveDate || undefined,
          period: period.trim(),
          reason: reason.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể cập nhật biên bản xử phạt.');
      }

      setDone(true);
      setTimeout(() => {
        setDone(false);
        onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  }

  const previewAmount = Number(amount) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <Card className="relative w-full max-w-xl border-slate-700 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2 text-red-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Chỉnh Sửa Biên Bản Xử Phạt</h2>
              <p className="text-xs text-slate-400">
                Nhân viên: {penalty.employee.lastName} {penalty.employee.firstName} (
                {penalty.employee.employeeCode})
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Financial Lock Warning if not PENDING */}
          {!isEditable && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <span className="font-bold">Khóa Kế Toán & Kiểm Toán Tài Chính: </span>
                <span>
                  Biên bản xử phạt này đã ở trạng thái <strong>{penalty.status}</strong>. Mọi sửa đổi
                  đã bị khóa nhằm bảo toàn tính toàn vẹn của bảng lương và chứng từ kiểm toán.
                </span>
              </div>
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
              <span>Biên bản xử phạt đã được cập nhật thành công và ghi nhận vào Audit Log!</span>
            </div>
          )}

          {/* Loại vi phạm */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Loại Vi Phạm Kỷ Luật
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!isEditable}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none disabled:opacity-50"
            >
              {Object.entries(PENALTY_CATEGORY_LABELS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          {/* Số tiền phạt & Kỳ khấu trừ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Mức Khấu Trừ Phạt (VND) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="50000"
                  min="10000"
                  max="1000000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isEditable}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/90 pl-3 pr-10 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none disabled:opacity-50"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">₫</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Xem trước:</span>
                <span className="font-mono font-semibold text-rose-400">
                  {formatBonusVnd(previewAmount)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Kỳ Khấu Trừ Lương <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={!isEditable}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none disabled:opacity-50"
                required
              />
            </div>
          </div>

          {/* Ngày vi phạm */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Ngày Phát Sinh Vi Phạm
            </label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              disabled={!isEditable}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Lý do phạt */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Lý Do Xử Phạt Kỷ Luật <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!isEditable}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none disabled:opacity-50"
              required
            />
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Ghi Chú Bổ Sung
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!isEditable}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Đóng
            </Button>
            {isEditable && (
              <Button
                type="submit"
                disabled={loading || done}
                className="bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-500/20"
              >
                {loading ? 'Đang Lưu...' : 'Lưu Thay Đổi (Cập Nhật Audit)'}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
