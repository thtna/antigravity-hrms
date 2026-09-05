'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle, CalendarDays, Clock, CheckCircle2, LogOut, ArrowRightFromLine } from 'lucide-react';

type LeaveRequestType = 'LEAVE' | 'LATE_REQUEST' | 'EARLY_LEAVE';

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const REQUEST_TYPES: { type: LeaveRequestType; label: string; desc: string; icon: React.ElementType; color: string }[] = [
  {
    type: 'LEAVE',
    label: 'Xin Nghỉ Phép',
    desc: 'Nghỉ phép một ngày hoặc nhiều ngày liên tục',
    icon: CalendarDays,
    color: 'text-blue-400',
  },
  {
    type: 'LATE_REQUEST',
    label: 'Xin Đi Muộn',
    desc: 'Đến cơ quan muộn hơn giờ quy định trong một ngày',
    icon: Clock,
    color: 'text-amber-400',
  },
  {
    type: 'EARLY_LEAVE',
    label: 'Xin Về Sớm',
    desc: 'Rời cơ quan trước giờ kết thúc ca trong một ngày',
    icon: ArrowRightFromLine,
    color: 'text-orange-400',
  },
];

const today = () => new Date().toISOString().split('T')[0];

export function LeaveRequestModal({ isOpen, onClose, onSuccess }: LeaveRequestModalProps) {
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [requestType, setRequestType] = useState<LeaveRequestType>('LEAVE');
  const [form, setForm] = useState({
    startDate: today(),
    endDate: today(),
    expectedTime: '',
    durationDays: '1',
    reason: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Escape key handler
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const isSingleDay = requestType === 'LATE_REQUEST' || requestType === 'EARLY_LEAVE';

  function handleClose() {
    setStep('type');
    setRequestType('LEAVE');
    setForm({ startDate: today(), endDate: today(), expectedTime: '', durationDays: '1', reason: '' });
    setError(null);
    setSuccess(false);
    onClose();
  }

  function handleSelectType(type: LeaveRequestType) {
    setRequestType(type);
    setForm((prev) => ({
      ...prev,
      startDate: today(),
      endDate: today(),
      expectedTime: '',
      durationDays: type === 'LEAVE' ? '1' : '0.5',
    }));
    setStep('form');
    setError(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // Keep endDate in sync for single-day types
      if (isSingleDay && name === 'startDate') {
        next.endDate = value;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        requestType,
        startDate: form.startDate,
        endDate: isSingleDay ? form.startDate : form.endDate,
        reason: form.reason,
        durationDays: parseFloat(form.durationDays) || 1,
      };

      if (isSingleDay && form.expectedTime) {
        body.expectedTime = form.expectedTime;
      }

      const res = await fetch('/api/v1/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể gửi đơn. Vui lòng thử lại.');
      }

      setSuccess(true);
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

  const selectedTypeInfo = REQUEST_TYPES.find((t) => t.type === requestType);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-request-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    >
      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 id="leave-request-modal-title" className="text-lg font-bold text-white">
              {step === 'type' ? 'Tạo Đơn Xin Nghỉ / Ngoại Lệ' : selectedTypeInfo?.label}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'type' ? 'Chọn loại đơn phù hợp với yêu cầu của bạn' : selectedTypeInfo?.desc}
            </p>
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
          {/* Success state */}
          {success && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="rounded-full bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <p className="text-base font-semibold text-emerald-300">Gửi đơn thành công!</p>
              <p className="text-sm text-slate-400">Đơn của bạn đã được ghi nhận và đang chờ phê duyệt.</p>
            </div>
          )}

          {/* Error banner */}
          {!success && error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Type selection */}
          {!success && step === 'type' && (
            <div className="space-y-3">
              {REQUEST_TYPES.map((rt) => {
                const Icon = rt.icon;
                return (
                  <button
                    key={rt.type}
                    onClick={() => handleSelectType(rt.type)}
                    className="w-full flex items-center gap-4 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-4 text-left transition-all hover:border-blue-500/50 hover:bg-slate-800/80 group"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 group-hover:bg-slate-700 transition-colors">
                      <Icon className={`h-5 w-5 ${rt.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{rt.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{rt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Step 2: Form */}
          {!success && step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Date fields */}
              <div className={`grid gap-4 ${isSingleDay ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="text-xs font-medium text-slate-300">
                    {isSingleDay ? 'Ngày' : 'Ngày bắt đầu'}
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    value={form.startDate}
                    onChange={handleChange}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                {!isSingleDay && (
                  <div>
                    <label className="text-xs font-medium text-slate-300">Ngày kết thúc</label>
                    <input
                      type="date"
                      name="endDate"
                      value={form.endDate}
                      min={form.startDate}
                      onChange={handleChange}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>

              {/* Time + Duration row */}
              <div className="grid grid-cols-2 gap-4">
                {isSingleDay && (
                  <div>
                    <label className="text-xs font-medium text-slate-300">
                      {requestType === 'LATE_REQUEST' ? 'Giờ dự kiến đến (HH:mm)' : 'Giờ dự kiến về (HH:mm)'}
                      <span className="ml-1 text-red-400">*</span>
                    </label>
                    <input
                      type="time"
                      name="expectedTime"
                      value={form.expectedTime}
                      onChange={handleChange}
                      required={isSingleDay}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
                <div className={isSingleDay ? '' : 'col-span-2'}>
                  <label className="text-xs font-medium text-slate-300">
                    {requestType === 'LEAVE' ? 'Số ngày nghỉ' : 'Số giờ ngoại lệ (ngày)'}
                  </label>
                  <input
                    type="number"
                    name="durationDays"
                    value={form.durationDays}
                    min="0.5"
                    max="365"
                    step="0.5"
                    onChange={handleChange}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-medium text-slate-300">
                  Lý do <span className="text-red-400">*</span>
                </label>
                <textarea
                  name="reason"
                  value={form.reason}
                  onChange={handleChange}
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={3}
                  placeholder="Mô tả lý do cụ thể (tối thiểu 10 ký tự)..."
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
                <p className="mt-1 text-right text-xs text-slate-500">{form.reason.length}/1000</p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => { setStep('type'); setError(null); }}
                  disabled={loading}
                  className="text-slate-400 hover:text-white"
                >
                  ← Quay lại
                </Button>
                <Button
                  type="submit"
                  disabled={loading || form.reason.length < 10}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 min-w-[120px]"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang gửi...
                    </span>
                  ) : (
                    'Gửi Đơn'
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
