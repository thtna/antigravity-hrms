'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle, Calendar, PlusCircle } from 'lucide-react';

interface ManualAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  employees: any[];
  shifts: any[];
}

export function ManualAttendanceModal({
  isOpen,
  onClose,
  onSuccess,
  employees,
  shifts,
}: ManualAttendanceModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shiftId, setShiftId] = useState('');
  const [checkInTime, setCheckInTime] = useState('08:30');
  const [checkOutTime, setCheckOutTime] = useState('17:30');
  const [notes, setNotes] = useState('Ghi nhận công thủ công (HR)');

  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        employeeId,
        workDate,
        shiftId: shiftId || undefined,
        checkInTime: `${workDate}T${checkInTime}:00`,
        checkOutTime: `${workDate}T${checkOutTime}:00`,
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/v1/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể tạo bản ghi chấm công thủ công.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setErrorMessage('Lỗi mạng hoặc hệ thống không phản hồi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-lg border-slate-800 bg-slate-900 text-slate-100 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <PlusCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Ghi Nhận Chấm Công Thủ Công</h2>
              <p className="text-xs text-slate-400">Dành cho HR / Admin khi bù công hoặc khôi phục dữ liệu chấm công</p>
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
          {/* Employee */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nhân Viên <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
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

          {/* Work Date & Shift */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                Ngày Làm Việc <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                required
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ca Làm Việc (Tùy chọn)
              </label>
              <select
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">-- Tự động theo lịch --</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Check-In Time & Check-Out Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Giờ Check-in <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                required
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Giờ Check-out <span className="text-red-400">*</span>
              </label>
              <input
                type="time"
                required
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Lý Do / Ghi Chú
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: Quên bấm vân tay, đi gặp khách hàng..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <p className="text-[11px] text-slate-400 italic">
            Hệ thống sẽ tự động tính toán giờ làm việc thực tế, thời gian đi muộn/về sớm và số giờ tăng ca (OT) theo quy định của ca làm việc.
          </p>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="border-slate-700 bg-slate-800 text-slate-300"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu Bản Ghi Chấm Công
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
