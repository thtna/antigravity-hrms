'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Loader2, AlertCircle, Clock, Moon, Sun, Calendar } from 'lucide-react';

interface ShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any | null;
}

export function ShiftModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: ShiftModalProps) {
  const isEdit = Boolean(initialData?.id);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shiftType, setShiftType] = useState<'FIXED' | 'FLEXIBLE'>('FIXED');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:30');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [isOvernight, setIsOvernight] = useState(false);
  const [gracePeriodLate, setGracePeriodLate] = useState(15);
  const [gracePeriodEarly, setGracePeriodEarly] = useState(15);
  const [standardWorkHours, setStandardWorkHours] = useState<number | ''>('');
  const [isActive, setIsActive] = useState(true);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState('');

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      setShiftType(initialData.shiftType || 'FIXED');
      setStartTime(initialData.startTime || '08:00');
      setEndTime(initialData.endTime || '17:30');
      setBreakMinutes(initialData.breakMinutes ?? 60);
      setIsOvernight(initialData.isOvernight ?? false);
      setGracePeriodLate(initialData.gracePeriodLate ?? 15);
      setGracePeriodEarly(initialData.gracePeriodEarly ?? 15);
      setStandardWorkHours(initialData.standardWorkHours ?? '');
      setIsActive(initialData.isActive ?? true);
      setEffectiveFrom(initialData.effectiveFrom || new Date().toISOString().split('T')[0]);
      setEffectiveTo(initialData.effectiveTo || '');
    } else {
      setCode('');
      setName('');
      setDescription('');
      setShiftType('FIXED');
      setStartTime('08:00');
      setEndTime('17:30');
      setBreakMinutes(60);
      setIsOvernight(false);
      setGracePeriodLate(15);
      setGracePeriodEarly(15);
      setStandardWorkHours('');
      setIsActive(true);
      setEffectiveFrom(new Date().toISOString().split('T')[0]);
      setEffectiveTo('');
    }
    setErrorMessage('');
  }, [initialData, isOpen]);

  // Live calculation of shift hours & auto-detection of overnight
  const calculation = useMemo(() => {
    try {
      const parseTime = (t: string) => {
        const parts = t.split(':').map((p) => parseInt(p, 10));
        return (parts[0] || 0) * 60 + (parts[1] || 0);
      };
      const startMin = parseTime(startTime);
      const endMin = parseTime(endTime);

      let overnight = isOvernight || endMin < startMin;
      let totalSpan = 0;
      if (endMin < startMin || overnight) {
        overnight = true;
        totalSpan = 1440 - startMin + endMin;
      } else {
        totalSpan = endMin - startMin;
      }

      const workingMin = Math.max(0, totalSpan - Number(breakMinutes || 0));
      const hours = Math.round((workingMin / 60) * 100) / 100;
      return { totalSpan, workingMin, hours, overnight };
    } catch {
      return { totalSpan: 0, workingMin: 0, hours: 0, overnight: false };
    }
  }, [startTime, endTime, breakMinutes, isOvernight]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        shiftType,
        startTime: startTime.trim(),
        endTime: endTime.trim(),
        breakMinutes: Number(breakMinutes),
        isOvernight: calculation.overnight,
        gracePeriodLate: Number(gracePeriodLate),
        gracePeriodEarly: Number(gracePeriodEarly),
        standardWorkHours: standardWorkHours !== '' ? Number(standardWorkHours) : undefined,
        isActive,
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
      };

      const url = isEdit ? `/api/v1/shifts/${initialData.id}` : '/api/v1/shifts';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || data.error || 'Có lỗi xảy ra khi lưu ca làm việc.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi mạng hoặc máy chủ không phản hồi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl border-slate-800 bg-slate-900 text-slate-100 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isEdit ? 'Cập Nhật Ca Làm Việc' : 'Tạo Ca Làm Việc Mới'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit ? `Chỉnh sửa thông số ca [${initialData?.code}]` : 'Hỗ trợ ca cố định, ca linh hoạt và ca đêm xuyên ngày'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mã ca */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Mã Ca Làm Việc <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isEdit}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: CA-SANG, CA-DEM"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none disabled:opacity-50"
              />
            </div>

            {/* Tên ca */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Tên Ca Làm Việc <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Ca Sáng Tiêu Chuẩn"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Loại ca */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Loại Ca Làm Việc
              </label>
              <select
                value={shiftType}
                onChange={(e) => setShiftType(e.target.value as any)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="FIXED">FIXED — Ca Cố Định Giờ</option>
                <option value="FLEXIBLE">FLEXIBLE — Ca Linh Hoạt Giờ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Số Giờ Công Chuẩn (Hệ số/Ngày)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="24"
                value={standardWorkHours}
                onChange={(e) => setStandardWorkHours(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={`Tự tính: ${calculation.hours}h`}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Khung giờ làm việc */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-blue-400" />
                Thời Gian Ca Làm Việc
              </span>
              {calculation.overnight ? (
                <Badge variant="outline" className="border-purple-500/40 bg-purple-500/10 text-purple-300 flex items-center gap-1">
                  <Moon className="h-3 w-3" /> Ca Đêm (Qua ngày hôm sau)
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300 flex items-center gap-1">
                  <Sun className="h-3 w-3" /> Ca Ngày (Cùng ngày)
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Giờ Vào (Bắt đầu)</label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Giờ Ra (Kết thúc)</label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nghỉ giữa ca (Phút)</label>
                <input
                  type="number"
                  min="0"
                  max="480"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Tính toán hiển thị trực tiếp */}
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-400 border-t border-slate-800/80">
              <span>Tổng thời lượng: <strong className="text-white">{Math.round((calculation.totalSpan / 60) * 10) / 10}h</strong></span>
              <span>•</span>
              <span>Trừ giờ nghỉ: <strong className="text-white">{breakMinutes} phút</strong></span>
              <span>•</span>
              <span>Giờ làm việc thực tế: <strong className="text-emerald-400 font-semibold">{calculation.hours} giờ công</strong></span>
            </div>
          </div>

          {/* Grace Periods */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ân Hạn Đến Muộn (Phút)
              </label>
              <input
                type="number"
                min="0"
                value={gracePeriodLate}
                onChange={(e) => setGracePeriodLate(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ân Hạn Về Sớm (Phút)
              </label>
              <input
                type="number"
                min="0"
                value={gracePeriodEarly}
                onChange={(e) => setGracePeriodEarly(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Ngày hiệu lực */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                Hiệu Lực Từ Ngày <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                required
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Đến Ngày (Để trống = Vô thời hạn)
              </label>
              <input
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Mô tả */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Mô Tả / Ghi Chú
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Áp dụng cho khối văn phòng / sản xuất..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Trạng thái hoạt động */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="shiftIsActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="shiftIsActive" className="text-xs font-medium text-slate-300">
              Kích hoạt sử dụng ca làm việc này ngay lập tức
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Lưu Thay Đổi' : 'Tạo Ca Làm Việc'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
