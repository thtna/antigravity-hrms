'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle, FileEdit, Clock, CheckCircle2 } from 'lucide-react';
import { CorrectionType } from '@/lib/validations/attendance-correction';

interface CorrectionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialAttendanceId?: string;
  initialWorkDate?: string;
  initialCorrectionType?: CorrectionType;
}

const CORRECTION_OPTIONS: { type: CorrectionType; label: string; desc: string }[] = [
  {
    type: 'FORGOT_CHECKIN',
    label: 'Quên check-in',
    desc: 'Có đi làm nhưng quên chấm công lúc vào ca',
  },
  {
    type: 'FORGOT_CHECKOUT',
    label: 'Quên check-out',
    desc: 'Đã check-in nhưng quên chấm công lúc hết giờ làm',
  },
  {
    type: 'LATE_JUSTIFICATION',
    label: 'Giải trình đi muộn',
    desc: 'Biện hộ lý do chính đáng để miễn trừ phút đi muộn',
  },
  {
    type: 'EARLY_LEAVE_JUSTIFICATION',
    label: 'Giải trình về sớm',
    desc: 'Biện hộ lý do chính đáng để miễn trừ phút về sớm',
  },
  {
    type: 'FULL_CORRECTION',
    label: 'Điều chỉnh cả ca làm việc',
    desc: 'Sai sót cả giờ vào và giờ ra cần điều chỉnh lại',
  },
  {
    type: 'OVERTIME_REQUEST',
    label: 'Đề xuất xác nhận tăng ca (OT)',
    desc: 'Yêu cầu phê duyệt số giờ tăng ca làm thêm',
  },
  {
    type: 'MISSING_ATTENDANCE',
    label: 'Bổ sung công tác / Thiếu công cả ngày',
    desc: 'Đi công tác hoặc gặp sự cố không thể chấm công cả ngày',
  },
];

export function CorrectionRequestModal({
  isOpen,
  onClose,
  onSuccess,
  initialAttendanceId,
  initialWorkDate,
  initialCorrectionType = 'FORGOT_CHECKIN',
}: CorrectionRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [correctionType, setCorrectionType] = useState<CorrectionType>(initialCorrectionType);
  const [workDate, setWorkDate] = useState(
    initialWorkDate || new Date().toISOString().split('T')[0]
  );
  const [checkInTime, setCheckInTime] = useState('08:30');
  const [checkOutTime, setCheckOutTime] = useState('17:30');
  const [overtimeMinutes, setOvertimeMinutes] = useState(60);
  const [reason, setReason] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setSuccessMessage('');
      if (initialWorkDate) setWorkDate(initialWorkDate);
      if (initialCorrectionType) setCorrectionType(initialCorrectionType);
    }
  }, [isOpen, initialWorkDate, initialCorrectionType]);

  if (!isOpen) return null;

  const showCheckIn = ['FORGOT_CHECKIN', 'FULL_CORRECTION', 'MISSING_ATTENDANCE'].includes(
    correctionType
  );
  const showCheckOut = ['FORGOT_CHECKOUT', 'FULL_CORRECTION', 'MISSING_ATTENDANCE'].includes(
    correctionType
  );
  const showOvertime = correctionType === 'OVERTIME_REQUEST';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (reason.trim().length < 10) {
      setErrorMessage('Lý do đề xuất phải có ít nhất 10 ký tự.');
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        attendanceId: initialAttendanceId || undefined,
        workDate,
        correctionType,
        reason: reason.trim(),
        evidenceUrl: evidenceUrl.trim() || undefined,
      };

      if (showCheckIn) {
        payload.requestedCheckIn = `${workDate}T${checkInTime}:00`;
      }
      if (showCheckOut) {
        payload.requestedCheckOut = `${workDate}T${checkOutTime}:00`;
      }
      if (showOvertime) {
        payload.overtimeMinutes = Number(overtimeMinutes);
      }

      const res = await fetch('/api/v1/attendance/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể tạo yêu cầu điều chỉnh.');
        setLoading(false);
        return;
      }

      setSuccessMessage('Đã gửi yêu cầu thành công! Đang chờ Quản lý/HR phê duyệt.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch {
      setErrorMessage('Lỗi kết nối máy chủ. Vui lòng thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-lg bg-slate-900 border border-slate-700/60 text-slate-100 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FileEdit className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100">
                Tạo Yêu Cầu Điều Chỉnh Chấm Công
              </h3>
              <p className="text-xs text-slate-400">
                Gửi yêu cầu giải trình hoặc bổ sung thời gian làm việc
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Correction Type */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Loại điều chỉnh / giải trình <span className="text-rose-400">*</span>
            </label>
            <select
              value={correctionType}
              onChange={(e) => setCorrectionType(e.target.value as CorrectionType)}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            >
              {CORRECTION_OPTIONS.map((opt) => (
                <option key={opt.type} value={opt.type} className="bg-slate-900 text-slate-100">
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1 italic">
              {CORRECTION_OPTIONS.find((o) => o.type === correctionType)?.desc}
            </p>
          </div>

          {/* Work Date */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Ngày làm việc <span className="text-rose-400">*</span>
            </label>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              required
            />
          </div>

          {/* Conditional Times */}
          {(showCheckIn || showCheckOut) && (
            <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-950/50 border border-slate-800 rounded-xl">
              {showCheckIn && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Giờ vào đề xuất <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="time"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>
                </div>
              )}

              {showCheckOut && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Giờ ra đề xuất <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="time"
                      value={checkOutTime}
                      onChange={(e) => setCheckOutTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Overtime Minutes */}
          {showOvertime && (
            <div className="p-3.5 bg-slate-950/50 border border-slate-800 rounded-xl">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Số phút tăng ca đề xuất <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                min="15"
                max="600"
                step="15"
                value={overtimeMinutes}
                onChange={(e) => setOvertimeMinutes(parseInt(e.target.value, 10))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tương đương: {(overtimeMinutes / 60).toFixed(1)} giờ làm việc ngoài giờ
              </p>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Lý do chi tiết <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ghi rõ lý do quên chấm công hoặc giải trình (tối thiểu 10 ký tự)..."
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              required
            />
          </div>

          {/* Evidence URL */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Link minh chứng / ảnh / vé cầu đường (tuỳ chọn)
            </label>
            <input
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-500 text-white font-medium"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Gửi Yêu Cầu
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
