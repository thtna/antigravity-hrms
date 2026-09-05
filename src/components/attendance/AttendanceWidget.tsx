'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Briefcase,
  Moon,
  Sun,
  Timer,
} from 'lucide-react';

interface AttendanceWidgetProps {
  onAttendanceChanged?: () => void;
}

export function AttendanceWidget({ onAttendanceChanged }: AttendanceWidgetProps) {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateString, setCurrentDateString] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [todayData, setTodayData] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('vi-VN', { hour12: false }));
      setCurrentDateString(
        now.toLocaleDateString('vi-VN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch today status
  const fetchTodayStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/attendance/today');
      const data = await res.json();
      if (data.success) {
        setTodayData(data.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayStatus();
  }, [fetchTodayStatus]);

  // Handle Check-in
  const handleCheckIn = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/attendance/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkInMethod: 'WEB',
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'error', text: data.error?.message || 'Check-in thất bại.' });
        return;
      }

      setMessage({ type: 'success', text: 'Chấm công vào (Check-in) thành công!' });
      setNotes('');
      fetchTodayStatus();
      onAttendanceChanged?.();
    } catch {
      setMessage({ type: 'error', text: 'Lỗi mạng khi thực hiện check-in.' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Check-out
  const handleCheckOut = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/attendance/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkOutMethod: 'WEB',
          notes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMessage({ type: 'error', text: data.error?.message || 'Check-out thất bại.' });
        return;
      }

      setMessage({
        type: 'success',
        text: `Chấm công ra (Check-out) thành công! Tổng giờ công: ${data.data.actualWorkHours}h.`,
      });
      setNotes('');
      fetchTodayStatus();
      onAttendanceChanged?.();
    } catch {
      setMessage({ type: 'error', text: 'Lỗi mạng khi thực hiện check-out.' });
    } finally {
      setActionLoading(false);
    }
  };

  const hasCheckedIn = Boolean(todayData?.hasCheckedIn);
  const hasCheckedOut = Boolean(todayData?.hasCheckedOut);
  const isWorking = hasCheckedIn && !hasCheckedOut;

  return (
    <Card className="border-slate-800 bg-gradient-to-br from-slate-900/90 via-slate-900/50 to-slate-950 p-6 shadow-xl relative overflow-hidden">
      {/* Background Accent Glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Left Side: Live Digital Clock & Date */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            ĐỒNG HỒ CHẤM CÔNG THỜI GIAN THỰC
          </div>

          <div className="font-mono text-4xl sm:text-5xl font-black tracking-tight text-white flex items-center gap-3">
            <Clock className="h-8 w-8 text-blue-400 shrink-0" />
            <span>{currentTime || '--:--:--'}</span>
          </div>

          <p className="text-xs text-slate-400 capitalize flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            {currentDateString}
          </p>
        </div>

        {/* Center: Today's Shift Details */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 min-w-[240px] space-y-2 text-xs">
          <div className="text-slate-400 font-semibold flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-blue-400" />
            Ca làm việc hôm nay:
          </div>
          {todayData?.shift ? (
            <div className="space-y-1">
              <div className="font-bold text-white text-sm">
                {todayData.shift.name || 'Ca Tiêu Chuẩn'}
              </div>
              <div className="text-slate-300 flex items-center gap-1.5 font-mono">
                <span>{todayData.shift.startTime} - {todayData.shift.endTime}</span>
                {todayData.shift.isOvernight ? (
                  <span title="Ca đêm" className="text-purple-400 flex items-center gap-0.5">
                    <Moon className="h-3 w-3" /> +1
                  </span>
                ) : (
                  <Sun className="h-3 w-3 text-amber-400" />
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                Nghỉ: {todayData.shift.breakMinutes || 0}p • Giờ chuẩn: {todayData.shift.standardWorkHours || 8}h
              </div>
            </div>
          ) : (
            <div className="text-slate-500 italic">Đang tải thông tin ca...</div>
          )}
        </div>

        {/* Right Side: Status Badge & Action Buttons */}
        <div className="w-full md:w-auto flex flex-col items-stretch md:items-end gap-3">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Trạng thái:</span>
            {!hasCheckedIn ? (
              <Badge variant="outline" className="border-slate-700 text-slate-400">
                Chưa Check-in
              </Badge>
            ) : isWorking ? (
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center gap-1 animate-pulse">
                <Timer className="h-3 w-3" /> Đang Làm Việc
              </Badge>
            ) : (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Đã Hoàn Thành
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
            {!hasCheckedIn ? (
              <Button
                onClick={handleCheckIn}
                disabled={loading || actionLoading}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 px-6 py-2.5"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                Chấm Công Vào (Check-in)
              </Button>
            ) : isWorking ? (
              <Button
                onClick={handleCheckOut}
                disabled={loading || actionLoading}
                className="w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 px-6 py-2.5"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Chấm Công Ra (Check-out)
              </Button>
            ) : (
              <div className="text-xs text-slate-400 text-center sm:text-right">
                Hôm nay đã chấm công đầy đủ.<br />
                <span className="text-emerald-400 font-semibold">{todayData.actualWorkHours} giờ công</span>
                {todayData.otHours > 0 && <span className="text-purple-400 ml-1">(+{todayData.otHours}h OT)</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timestamp Details & Quick Notes Input */}
      {hasCheckedIn && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
          <div>
            <span className="text-slate-500">Giờ vào: </span>
            <strong className="text-white">
              {todayData.checkInTime ? new Date(todayData.checkInTime).toLocaleTimeString('vi-VN') : '—'}
            </strong>
            {todayData.lateMinutes > 0 && (
              <span className="text-red-400 ml-1">(Muộn {todayData.lateMinutes}p)</span>
            )}
          </div>
          <div>
            <span className="text-slate-500">Giờ ra: </span>
            <strong className="text-white">
              {todayData.checkOutTime ? new Date(todayData.checkOutTime).toLocaleTimeString('vi-VN') : 'Chưa ra'}
            </strong>
            {todayData.earlyMinutes > 0 && (
              <span className="text-amber-400 ml-1">(Sớm {todayData.earlyMinutes}p)</span>
            )}
          </div>
          <div>
            <span className="text-slate-500">Giờ làm thực tế: </span>
            <strong className="text-emerald-400">
              {todayData.actualWorkHours}h
            </strong>
            {todayData.otHours > 0 && (
              <strong className="text-purple-400 ml-1">+{todayData.otHours}h OT</strong>
            )}
          </div>
        </div>
      )}

      {/* Quick Notes Input (Optional) */}
      {!hasCheckedOut && (
        <div className="mt-3">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ghi chú khi chấm công (nếu có: đi công tác, tăng ca đột xuất...)"
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {/* Alert Message */}
      {message && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-lg border p-2.5 text-xs ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}
    </Card>
  );
}
