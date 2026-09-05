'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, DollarSign, AlertCircle, CheckCircle2, Award } from 'lucide-react';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

export const BONUS_CATEGORY_LABELS: Record<
  string,
  { label: string; desc: string; badgeClass: string }
> = {
  KPI: {
    label: 'Thưởng Hiệu Suất (KPI)',
    desc: 'Thưởng hoàn thành hoặc vượt chỉ số KPI được giao',
    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  OVERTIME: {
    label: 'Thưởng Tăng Ca (Overtime)',
    desc: 'Thưởng làm thêm giờ, trực đêm, làm ngày lễ',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  PROJECT: {
    label: 'Thưởng Dự Án (Project)',
    desc: 'Thưởng bàn giao mốc dự án, hoàn thành sớm tiến độ',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  TIME: {
    label: 'Thưởng Thâm Niên / Chuyên Cần (Time)',
    desc: 'Thưởng gắn bó lâu năm, đi làm đủ công, không đi muộn',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
  OTHER: {
    label: 'Thưởng Khác (Other)',
    desc: 'Thưởng sáng kiến đột xuất, thưởng vinh danh, thưởng lễ tết',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
};

interface EmployeeItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department?: { name: string };
}

interface BonusCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPeriod?: string;
}

export function BonusCreateModal({
  isOpen,
  onClose,
  onSuccess,
  defaultPeriod,
}: BonusCreateModalProps) {
  const currentPeriod = defaultPeriod || new Date().toISOString().slice(0, 7);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [category, setCategory] = useState('PROJECT');
  const [amount, setAmount] = useState('3000000');
  const [period, setPeriod] = useState(currentPeriod);
  const [effectiveDate, setEffectiveDate] = useState(todayStr);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoadingEmployees(true);
    fetch('/api/v1/employees?limit=100')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setEmployees(json.data);
          if (json.data.length > 0) {
            setSelectedEmployeeId(json.data[0].id);
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Không thể tải danh sách nhân viên.');
      })
      .finally(() => setLoadingEmployees(false));
  }, [isOpen]);

  if (!isOpen) return null;

  function handleClose() {
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId || !reason || !amount) return;

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/bonuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          category,
          amount: Number(amount),
          period: period.trim(),
          effectiveDate,
          reason: reason.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể tạo đề xuất khen thưởng.');
      }

      setDone(true);
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <Card className="relative w-full max-w-xl border-slate-700 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tạo Đề Xuất Khen Thưởng</h2>
              <p className="text-xs text-slate-400">Ghi nhận thành tích, phê duyệt và lập hồ sơ tài chính</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
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
                Đã tạo đề xuất khen thưởng thành công!
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

              {/* Employee Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nhân Viên Được Khen Thưởng <span className="text-red-400">*</span>
                </label>
                {loadingEmployees ? (
                  <div className="text-xs text-slate-400">Đang tải danh sách nhân viên...</div>
                ) : (
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.lastName} {emp.firstName} ({emp.employeeCode})
                        {emp.department?.name ? ` — ${emp.department.name}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Loại Hình Thưởng <span className="text-red-400">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none font-medium"
                >
                  {Object.entries(BONUS_CATEGORY_LABELS).map(([catKey, info]) => (
                    <option key={catKey} value={catKey}>
                      {info.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  {BONUS_CATEGORY_LABELS[category]?.desc}
                </p>
              </div>

              {/* Amount & Period */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Số Tiền Thưởng (VND) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={10000}
                      step={50000}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400">₫ VND</span>
                  </div>
                  <p className="text-[11px] text-emerald-400 font-mono mt-1">
                    = {formatBonusVnd(Number(amount))}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Kỳ Thưởng (YYYY-MM) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 2026-09"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Effective Date */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Ngày Hiệu Lực
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Lý Do Khen Thưởng <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ghi nhận thành tích, lý do chi tiết..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Ghi Chú Bổ Sung
                </label>
                <input
                  type="text"
                  placeholder="Thông tin nội bộ hoặc quyết định khen thưởng..."
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
                  disabled={submitting}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Hủy Bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !selectedEmployeeId || !reason || !amount}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5"
                >
                  {submitting ? 'Đang gửi...' : 'Tạo Đề Xuất Thưởng'}
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
