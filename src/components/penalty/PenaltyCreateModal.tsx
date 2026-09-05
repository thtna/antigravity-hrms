'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, AlertTriangle, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

export const PENALTY_CATEGORY_LABELS: Record<
  string,
  { label: string; desc: string; badgeClass: string }
> = {
  LATE: {
    label: 'Đi Muộn / Về Sớm (Late)',
    desc: 'Vi phạm quy định giờ giấc chấm công, đến muộn hoặc về sớm không phép',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  UNAUTHORIZED_LEAVE: {
    label: 'Nghỉ Không Phép (Unauthorized Leave)',
    desc: 'Tự ý nghỉ việc, không gửi đơn hoặc không được quản lý phê duyệt',
    badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  KPI_MISS: {
    label: 'Không Đạt KPI (KPI Miss)',
    desc: 'Không đạt ngưỡng chỉ số hiệu suất tối thiểu theo cam kết kỳ làm việc',
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  OTHER: {
    label: 'Vi Phạm Khác (Other)',
    desc: 'Vi phạm nội quy an toàn, bảo mật dữ liệu hoặc quy chế lao động công ty',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
};

interface EmployeeItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department?: { name: string };
}

interface PenaltyCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPeriod?: string;
  currentEmployeeId?: string; // To exclude self from target selection
}

export function PenaltyCreateModal({
  isOpen,
  onClose,
  onSuccess,
  defaultPeriod,
  currentEmployeeId,
}: PenaltyCreateModalProps) {
  const currentPeriod = defaultPeriod || new Date().toISOString().slice(0, 7);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [category, setCategory] = useState('LATE');
  const [amount, setAmount] = useState('200000');
  const [period, setPeriod] = useState(currentPeriod);
  const [effectiveDate, setEffectiveDate] = useState(todayStr);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/v1/employees?limit=100')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          // Exclude self if employeeId is known (chặn tự chọn chính mình trên giao diện)
          const filtered = currentEmployeeId
            ? json.data.filter((e: EmployeeItem) => e.id !== currentEmployeeId)
            : json.data;
          setEmployees(filtered);
          if (filtered.length > 0 && !selectedEmployeeId) {
            setSelectedEmployeeId(filtered[0].id);
          }
        }
      })
      .catch(() => {});
  }, [isOpen, currentEmployeeId, selectedEmployeeId]);

  if (!isOpen) return null;

  function handleClose() {
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Số tiền phạt phải là một số dương hợp lệ.');
      return;
    }

    if (!selectedEmployeeId) {
      setError('Vui lòng chọn nhân viên bị lập biên bản kỷ luật.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      setError('Lý do xử phạt phải có ít nhất 3 ký tự.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/v1/penalties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          category,
          amount: numAmount,
          period: period.trim(),
          effectiveDate,
          reason: reason.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể lập biên bản xử phạt.');
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

  const selectedCategoryMeta = PENALTY_CATEGORY_LABELS[category];
  const previewAmount = Number(amount) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <Card className="relative w-full max-w-xl border-slate-700 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2 text-red-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Lập Biên Bản Xử Phạt Kỷ Luật</h2>
              <p className="text-xs text-slate-400">
                Ghi nhận vi phạm, định mức khấu trừ và chuyển phê duyệt theo quy chế công ty
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Biên bản xử phạt đã được khởi tạo thành công! Đang chuyển phê duyệt...</span>
            </div>
          )}

          {/* Chọn nhân viên vi phạm */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Nhân Viên Vi Phạm <span className="text-red-400">*</span>
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
              required
            >
              <option value="" disabled>
                -- Chọn nhân viên vi phạm --
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.lastName} {emp.firstName} ({emp.employeeCode})
                  {emp.department ? ` - ${emp.department.name}` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              * Hệ thống tuân thủ quy chế: Nghiêm cấm tự lập biên bản xử phạt đối với chính bản thân.
            </p>
          </div>

          {/* Loại vi phạm */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Loại Vi Phạm Kỷ Luật <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PENALTY_CATEGORY_LABELS).map(([key, meta]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => setCategory(key)}
                  className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                    category === key
                      ? 'border-red-500 bg-red-950/40 text-white shadow-sm'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-semibold">{meta.label.split(' (')[0]}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                    {meta.desc}
                  </span>
                </button>
              ))}
            </div>
            {selectedCategoryMeta && (
              <p className="mt-1.5 text-[11px] text-red-300/80 italic">
                {selectedCategoryMeta.desc}
              </p>
            )}
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
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/90 pl-3 pr-10 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none"
                  placeholder="200000"
                  required
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">₫</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Quy đổi:</span>
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
                className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white font-mono focus:border-red-500 focus:outline-none"
                placeholder="2026-09 hoặc 2026-Q3"
                required
              />
              <span className="text-[10px] text-slate-500">Định dạng YYYY-MM hoặc YYYY-QX</span>
            </div>
          </div>

          {/* Ngày vi phạm */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Ngày Phát Sinh Vi Phạm <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
              required
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
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              placeholder="Ghi rõ hành vi vi phạm (ví dụ: Đi làm muộn 45 phút ngày 10/09, không lý do chính đáng)..."
              required
            />
          </div>

          {/* Ghi chú thêm */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Biên Bản & Ghi Chú Phụ (Tùy Chọn)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              placeholder="Mã biên bản, căn cứ nội quy lao động điều 12 khoản 3..."
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              disabled={loading}
            >
              Hủy Bỏ
            </Button>
            <Button
              type="submit"
              disabled={loading || done}
              className="bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-500/20"
            >
              {loading ? 'Đang Xử Lý...' : 'Lập Biên Bản Phạt'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
