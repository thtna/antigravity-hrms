'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Clock,
  User,
  Calendar,
} from 'lucide-react';

interface CorrectionProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  correction: any;
}

export function CorrectionProcessModal({
  isOpen,
  onClose,
  onSuccess,
  correction,
}: CorrectionProcessModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');

  // Optional override times
  const [useOverride, setUseOverride] = useState(false);
  const [overrideCheckIn, setOverrideCheckIn] = useState('');
  const [overrideCheckOut, setOverrideCheckOut] = useState('');

  if (!isOpen || !correction) return null;

  const handleProcess = async (selectedDecision: 'APPROVED' | 'REJECTED') => {
    setDecision(selectedDecision);
    setLoading(true);
    setErrorMessage('');

    if (selectedDecision === 'REJECTED' && approvalNotes.trim().length < 5) {
      setErrorMessage('Vui lòng nhập lý do từ chối (tối thiểu 5 ký tự).');
      setLoading(false);
      return;
    }

    try {
      const payload: any = {
        decision: selectedDecision,
        approvalNotes: approvalNotes.trim() || undefined,
      };

      if (selectedDecision === 'APPROVED' && useOverride) {
        if (overrideCheckIn) {
          payload.overrideCheckIn = `${correction.workDate}T${overrideCheckIn}:00`;
        }
        if (overrideCheckOut) {
          payload.overrideCheckOut = `${correction.workDate}T${overrideCheckOut}:00`;
        }
      }

      const res = await fetch(`/api/v1/attendance/corrections/${correction.id}/process`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể xử lý yêu cầu.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setErrorMessage('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-lg bg-slate-900 border border-slate-700/60 text-slate-100 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div>
            <h3 className="font-semibold text-base text-slate-100">
              Xét Duyệt Điều Chỉnh Chấm Công
            </h3>
            <p className="text-xs text-slate-400">
              Yêu cầu #{correction.id?.slice(0, 8)} • {correction.correctionType}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Employee & Date info card */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-amber-400" />
                <span className="font-medium text-sm text-slate-200">
                  {correction.employee?.firstName} {correction.employee?.lastName}
                </span>
                <span className="text-xs text-slate-400">
                  ({correction.employee?.employeeCode})
                </span>
              </div>
              <span className="text-xs px-2 py-0.5 bg-slate-800 text-slate-300 rounded-md">
                {correction.employee?.department?.name || 'Chưa xếp phòng ban'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>Ngày làm việc: </span>
              <strong className="text-slate-200">{correction.workDate}</strong>
            </div>
          </div>

          {/* Requested time details */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2 text-xs">
            <div className="font-medium text-slate-300">Thông tin đề xuất:</div>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div>
                <span className="text-slate-400">Giờ vào đề xuất: </span>
                <strong className="text-amber-400">
                  {formatTime(correction.requestedCheckIn)}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Giờ ra đề xuất: </span>
                <strong className="text-amber-400">
                  {formatTime(correction.requestedCheckOut)}
                </strong>
              </div>
            </div>

            {correction.overtimeMinutes && (
              <div className="text-slate-300">
                <span className="text-slate-400">Tăng ca: </span>
                <strong className="text-emerald-400">
                  +{correction.overtimeMinutes} phút ({(correction.overtimeMinutes / 60).toFixed(1)}h)
                </strong>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800">
              <span className="text-slate-400">Lý do từ nhân viên: </span>
              <p className="mt-1 text-slate-200 italic">&ldquo;{correction.reason}&rdquo;</p>
            </div>

            {correction.evidenceUrl && (
              <div className="pt-2 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                <a
                  href={correction.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline text-xs"
                >
                  Xem liên kết minh chứng đính kèm
                </a>
              </div>
            )}
          </div>

          {/* Toggle Override Times */}
          <div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useOverride}
                onChange={(e) => setUseOverride(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
              />
              <span>Điều chỉnh lại giờ phê duyệt (ghi đè thời gian đề xuất)</span>
            </label>

            {useOverride && (
              <div className="grid grid-cols-2 gap-3 mt-2 p-3 bg-slate-950/40 border border-slate-800 rounded-xl">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Giờ vào thực duyệt</label>
                  <input
                    type="time"
                    value={overrideCheckIn}
                    onChange={(e) => setOverrideCheckIn(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Giờ ra thực duyệt</label>
                  <input
                    type="time"
                    value={overrideCheckOut}
                    onChange={(e) => setOverrideCheckOut(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Approval / Rejection Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Ghi chú xét duyệt (bắt buộc nếu từ chối)
            </label>
            <textarea
              rows={2}
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Nhập ghi chú hoặc lý do từ chối..."
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
            >
              Đóng
            </Button>
            <Button
              type="button"
              onClick={() => handleProcess('REJECTED')}
              disabled={loading}
              className="bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs flex items-center gap-1.5"
            >
              {loading && decision === 'REJECTED' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <XCircle className="w-3.5 h-3.5" />
              )}
              Từ Chối
            </Button>
            <Button
              type="button"
              onClick={() => handleProcess('APPROVED')}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5"
            >
              {loading && decision === 'APPROVED' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Phê Duyệt
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
