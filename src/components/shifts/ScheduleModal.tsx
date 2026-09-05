'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle, Calendar, Users, Repeat, CheckSquare } from 'lucide-react';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  shifts: any[];
  employees: any[];
}

// Pure date helpers computed outside render
function getScheduleDefaultDates() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString().split('T')[0];
  return { today, nextWeek };
}

const defaultDates = getScheduleDefaultDates();

export function ScheduleModal({
  isOpen,
  onClose,
  onSuccess,
  shifts,
  employees,
}: ScheduleModalProps) {
  const [activeMode, setActiveMode] = useState<'SINGLE' | 'BULK' | 'RECURRING'>('SINGLE');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Single mode state
  const [singleEmployeeId, setSingleEmployeeId] = useState('');
  const [singleShiftId, setSingleShiftId] = useState('');
  const [singleWorkDate, setSingleWorkDate] = useState(defaultDates.today);
  const [singleIsTemp, setSingleIsTemp] = useState(false);
  const [singleReason, setSingleReason] = useState('');
  const [singleNotes, setSingleNotes] = useState('');

  // Bulk mode state
  const [bulkEmployeeIds, setBulkEmployeeIds] = useState<string[]>([]);
  const [bulkShiftId, setBulkShiftId] = useState('');
  const [bulkStartDate, setBulkStartDate] = useState(defaultDates.today);
  const [bulkEndDate, setBulkEndDate] = useState(defaultDates.nextWeek);
  const [bulkDaysOfWeek, setBulkDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [bulkIsTemp, setBulkIsTemp] = useState(false);
  const [bulkReason, setBulkReason] = useState('');

  // Recurring mode state
  const [recEmployeeId, setRecEmployeeId] = useState('');
  const [recShiftId, setRecShiftId] = useState('');
  const [recDaysOfWeek, setRecDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [recEffectiveFrom, setRecEffectiveFrom] = useState(defaultDates.today);
  const [recEffectiveTo, setRecEffectiveTo] = useState('');

  if (!isOpen) return null;

  const dayLabels = [
    { value: 1, label: 'Thứ 2' },
    { value: 2, label: 'Thứ 3' },
    { value: 3, label: 'Thứ 4' },
    { value: 4, label: 'Thứ 5' },
    { value: 5, label: 'Thứ 6' },
    { value: 6, label: 'Thứ 7' },
    { value: 0, label: 'Chủ Nhật' },
  ];

  const toggleDay = (day: number, currentDays: number[], setter: (days: number[]) => void) => {
    if (currentDays.includes(day)) {
      setter(currentDays.filter((d) => d !== day));
    } else {
      setter([...currentDays, day]);
    }
  };

  const handleSelectAllEmployees = () => {
    if (bulkEmployeeIds.length === employees.length) {
      setBulkEmployeeIds([]);
    } else {
      setBulkEmployeeIds(employees.map((e) => e.id));
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        type: 'single',
        employeeId: singleEmployeeId,
        shiftId: singleShiftId,
        workDate: singleWorkDate,
        isTemporary: singleIsTemp,
        overrideReason: singleReason.trim() || undefined,
        notes: singleNotes.trim() || undefined,
      };

      const res = await fetch('/api/v1/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || data.error || 'Không thể phân ca làm việc.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi mạng hoặc hệ thống.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkEmployeeIds.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 nhân viên.');
      return;
    }
    if (bulkDaysOfWeek.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 thứ trong tuần.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        type: 'bulk',
        employeeIds: bulkEmployeeIds,
        shiftId: bulkShiftId,
        startDate: bulkStartDate,
        endDate: bulkEndDate,
        daysOfWeek: bulkDaysOfWeek,
        isTemporary: bulkIsTemp,
        overrideReason: bulkReason.trim() || undefined,
      };

      const res = await fetch('/api/v1/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || data.error || 'Không thể phân ca hàng loạt.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi mạng hoặc hệ thống.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecurringSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recDaysOfWeek.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 thứ trong tuần.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        employeeId: recEmployeeId,
        shiftId: recShiftId,
        daysOfWeek: recDaysOfWeek,
        effectiveFrom: recEffectiveFrom,
        effectiveTo: recEffectiveTo || undefined,
      };

      const res = await fetch('/api/v1/schedules/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || data.error || 'Không thể thiết lập lịch lặp tuần.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Lỗi mạng hoặc hệ thống.');
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
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Phân Ca & Lịch Làm Việc</h2>
              <p className="text-xs text-slate-400">
                Xếp lịch làm việc theo ngày, hàng loạt hoặc thiết lập lịch lặp tuần định kỳ
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

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => { setActiveMode('SINGLE'); setErrorMessage(''); }}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeMode === 'SINGLE'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Theo Ngày (Đơn lẻ / Tạm thời)
          </button>
          <button
            type="button"
            onClick={() => { setActiveMode('BULK'); setErrorMessage(''); }}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeMode === 'BULK'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Hàng Loạt (Nhiều Nhân Viên)
          </button>
          <button
            type="button"
            onClick={() => { setActiveMode('RECURRING'); setErrorMessage(''); }}
            className={`pb-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
              activeMode === 'RECURRING'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            <Repeat className="h-3.5 w-3.5" />
            Lịch Lặp Tuần Định Kỳ
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ── MODE 1: SINGLE SCHEDULE ── */}
        {activeMode === 'SINGLE' && (
          <form onSubmit={handleSingleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nhân Viên <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={singleEmployeeId}
                  onChange={(e) => setSingleEmployeeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      [{emp.employeeCode || emp.code}] {emp.fullName || `${emp.lastName} ${emp.firstName}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ca Làm Việc <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={singleShiftId}
                  onChange={(e) => setSingleShiftId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Chọn ca làm việc --</option>
                  {shifts.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.code}] {s.name} ({s.startTime} - {s.endTime} {s.isOvernight ? '🌙' : ''})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ngày Làm Việc <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                required
                value={singleWorkDate}
                onChange={(e) => setSingleWorkDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="singleIsTemp"
                  checked={singleIsTemp}
                  onChange={(e) => setSingleIsTemp(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="singleIsTemp" className="text-xs font-semibold text-amber-300">
                  Lịch đổi ca tạm thời (Temporary Override)
                </label>
              </div>
              {singleIsTemp && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Lý do đổi ca tạm thời <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={singleReason}
                    onChange={(e) => setSingleReason(e.target.value)}
                    placeholder="VD: Trực thay đồng nghiệp, tăng ca dự án..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Ghi Chú</label>
              <input
                type="text"
                value={singleNotes}
                onChange={(e) => setSingleNotes(e.target.value)}
                placeholder="Ghi chú thêm nếu có..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="border-slate-700 bg-slate-800 text-slate-300">
                Hủy
              </Button>
              <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500 text-white">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Phân Ca Ngay
              </Button>
            </div>
          </form>
        )}

        {/* ── MODE 2: BULK ASSIGN ── */}
        {activeMode === 'BULK' && (
          <form onSubmit={handleBulkSubmit} className="p-6 space-y-4">
            {/* Multi Employee Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">
                  Chọn Nhân Viên ({bulkEmployeeIds.length}/{employees.length} đã chọn) <span className="text-red-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleSelectAllEmployees}
                  className="text-[11px] text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <CheckSquare className="h-3 w-3" />
                  {bulkEmployeeIds.length === employees.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-2 space-y-1">
                {employees.map((emp) => {
                  const isChecked = bulkEmployeeIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-900 cursor-pointer text-xs text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setBulkEmployeeIds(bulkEmployeeIds.filter((id) => id !== emp.id));
                          } else {
                            setBulkEmployeeIds([...bulkEmployeeIds, emp.id]);
                          }
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900 text-indigo-600"
                      />
                      <span>[{emp.employeeCode || emp.code}]</span>
                      <span className="font-medium text-white">{emp.fullName || `${emp.lastName} ${emp.firstName}`}</span>
                      {emp.department && (
                        <span className="text-[10px] text-slate-500 ml-auto">{emp.department.name}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Shift */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ca Làm Việc Cần Gán <span className="text-red-400">*</span>
              </label>
              <select
                required
                value={bulkShiftId}
                onChange={(e) => setBulkShiftId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">-- Chọn ca làm việc --</option>
                {shifts.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name} ({s.startTime} - {s.endTime} {s.isOvernight ? '🌙' : ''})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Từ Ngày <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Đến Ngày <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={bulkEndDate}
                  onChange={(e) => setBulkEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Days of Week */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Áp Dụng Cho Các Thứ Trong Tuần <span className="text-red-400">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {dayLabels.map((day) => {
                  const selected = bulkDaysOfWeek.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value, bulkDaysOfWeek, setBulkDaysOfWeek)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Temporary Override */}
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bulkIsTemp"
                  checked={bulkIsTemp}
                  onChange={(e) => setBulkIsTemp(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="bulkIsTemp" className="text-xs text-slate-300">
                  Đánh dấu là lịch đổi ca tạm thời
                </label>
              </div>
              {bulkIsTemp && (
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Lý do đổi ca tạm thời
                  </label>
                  <input
                    type="text"
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    placeholder="VD: Điều động mùa cao điểm..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="border-slate-700 bg-slate-800 text-slate-300">
                Hủy
              </Button>
              <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xác Nhận Phân Ca Hàng Loạt
              </Button>
            </div>
          </form>
        )}

        {/* ── MODE 3: RECURRING SCHEDULE ── */}
        {activeMode === 'RECURRING' && (
          <form onSubmit={handleRecurringSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nhân Viên <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={recEmployeeId}
                  onChange={(e) => setRecEmployeeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      [{emp.employeeCode || emp.code}] {emp.fullName || `${emp.lastName} ${emp.firstName}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ca Làm Việc Tiêu Chuẩn <span className="text-red-400">*</span>
                </label>
                <select
                  required
                  value={recShiftId}
                  onChange={(e) => setRecShiftId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Chọn ca làm việc --</option>
                  {shifts.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.code}] {s.name} ({s.startTime} - {s.endTime} {s.isOvernight ? '🌙' : ''})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Days of Week */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Các Ngày Trong Tuần Làm Ca Này <span className="text-red-400">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {dayLabels.map((day) => {
                  const selected = recDaysOfWeek.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value, recDaysOfWeek, setRecDaysOfWeek)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Effective Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Bắt Đầu Hiệu Lực Từ <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={recEffectiveFrom}
                  onChange={(e) => setRecEffectiveFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Đến Ngày (Để trống = Lặp vĩnh viễn)
                </label>
                <input
                  type="date"
                  value={recEffectiveTo}
                  onChange={(e) => setRecEffectiveTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400 italic">
              Lưu ý: Hệ thống sẽ tự động cập nhật và đóng các mẫu lịch lặp cũ trùng lặp của nhân viên này trên các ngày đã chọn để đảm bảo tính toàn vẹn dữ liệu.
            </p>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="border-slate-700 bg-slate-800 text-slate-300">
                Hủy
              </Button>
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu Lịch Lặp Tuần
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
