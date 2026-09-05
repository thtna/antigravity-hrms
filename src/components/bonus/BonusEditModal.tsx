'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Edit, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BONUS_CATEGORY_LABELS } from './BonusCreateModal';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

export interface BonusItem {
  id: string;
  category: string;
  amount: string | number;
  period: string;
  effectiveDate: string;
  reason: string;
  notes?: string | null;
  status: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvalNotes?: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department?: { id: string; name: string };
  };
  approver?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
  } | null;
  createdAt: string;
}

interface BonusEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  bonus: BonusItem | null;
}

export function BonusEditModal({
  isOpen,
  onClose,
  onSuccess,
  bonus,
}: BonusEditModalProps) {
  const [category, setCategory] = useState('OTHER');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (bonus) {
      setCategory(bonus.category);
      setAmount(String(bonus.amount));
      setPeriod(bonus.period);
      setReason(bonus.reason);
      setNotes(bonus.notes || '');
      setError(null);
      setDone(false);
    }
  }, [bonus]);

  if (!isOpen || !bonus) return null;

  // Financial safety guard: if somehow opened for non-pending, show notice
  const isEditable = bonus.status === 'PENDING';

  function handleClose() {
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditable || !bonus) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/bonuses/${bonus.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          amount: Number(amount),
          period: period.trim(),
          reason: reason.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể cập nhật khoản thưởng.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <Edit className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Chỉnh Sửa Khoản Thưởng Trước Phê Duyệt</h2>
              <p className="text-xs text-slate-400">
                {bonus.employee.lastName} {bonus.employee.firstName} ({bonus.employee.employeeCode})
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
              <div className="rounded-full bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <p className="text-base font-semibold text-white">
                Cập nhật khoản thưởng thành công!
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

              {!isEditable ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 p-4 text-xs text-amber-300">
                  Khoản thưởng này đã ở trạng thái <strong>{bonus.status}</strong>. Để bảo đảm tính
                  toàn vẹn tài chính, các khoản thưởng đã duyệt hoặc từ chối không thể chỉnh sửa.
                </div>
              ) : (
                <>
                  {/* Category */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Loại Hình Thưởng
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      {Object.entries(BONUS_CATEGORY_LABELS).map(([catKey, info]) => (
                        <option key={catKey} value={catKey}>
                          {info.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Amount & Period */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Số Tiền Thưởng (VND)
                      </label>
                      <input
                        type="number"
                        required
                        min={10000}
                        step={50000}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                      <p className="text-[11px] text-emerald-400 font-mono mt-1">
                        = {formatBonusVnd(Number(amount))}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Kỳ Thưởng (YYYY-MM)
                      </label>
                      <input
                        type="text"
                        required
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Lý Do Khen Thưởng
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Ghi Chú
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
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
                      disabled={loading || !reason || !amount}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5"
                    >
                      {loading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
