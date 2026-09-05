'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Clock,
  Calendar,
  User,
  Briefcase,
  Building2,
  LogIn,
  LogOut,
  Moon,
  Sun,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface AttendanceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: any | null;
}

export function AttendanceDetailModal({
  isOpen,
  onClose,
  record,
}: AttendanceDetailModalProps) {
  if (!isOpen || !record) return null;

  const employee = record.employee;
  const shift = record.shift || record.schedule?.shift;

  const formatTime = (timeStr?: string | null) => {
    if (!timeStr) return '—';
    try {
      return new Date(timeStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ON_TIME':
        return <Badge variant="success">Đúng giờ</Badge>;
      case 'LATE':
        return <Badge variant="destructive">Đi muộn</Badge>;
      case 'EARLY_LEAVE':
        return <Badge variant="outline" className="border-amber-500/40 text-amber-300">Về sớm</Badge>;
      case 'LATE_AND_EARLY':
        return <Badge variant="destructive">Muộn & Sớm</Badge>;
      case 'OVERTIME':
        return <Badge variant="outline" className="border-purple-500/40 text-purple-300">Tăng ca (OT)</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="outline" className="border-blue-500/40 text-blue-300 animate-pulse">Đang làm việc</Badge>;
      case 'ABSENT':
        return <Badge variant="destructive">Vắng mặt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl border-slate-800 bg-slate-900 text-slate-100 shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Chi Tiết Bảng Công Ngày {record.workDate}
                {getStatusBadge(record.status)}
              </h2>
              <p className="text-xs text-slate-400">
                Mã bản ghi chấm công: <span className="font-mono text-slate-300">{record.id}</span>
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

        <div className="p-6 space-y-6">
          {/* Employee Header Info */}
          <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="h-12 w-12 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-lg font-bold border border-blue-500/30">
              {employee?.firstName?.charAt(0) || <User className="h-6 w-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-white flex items-center gap-2">
                {employee?.fullName || `${employee?.lastName || ''} ${employee?.firstName || ''}`}
                <span className="text-xs font-mono text-blue-400 font-normal">
                  [{employee?.employeeCode || employee?.code || 'EMP'}]
                </span>
              </div>
              <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-500" />
                  {employee?.department?.name || 'Chưa gán phòng ban'}
                </span>
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3 text-slate-500" />
                  {employee?.position?.title || 'Chưa gán chức vụ'}
                </span>
              </div>
            </div>
          </div>

          {/* Shift Schedule Reference */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                Ca làm việc áp dụng:
              </span>
              <Badge variant="outline" className="border-blue-500/30 text-blue-300 text-[10px]">
                {shift?.shiftType || 'FIXED'}
              </Badge>
            </div>
            {shift ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs text-slate-300">
                <div>
                  <span className="text-slate-500 text-[11px] block">Tên ca:</span>
                  <strong className="text-white">{shift.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Khung giờ:</span>
                  <div className="flex items-center gap-1 font-mono text-white">
                    <span>{shift.startTime} - {shift.endTime}</span>
                    {shift.isOvernight ? <Moon className="h-3 w-3 text-purple-400" /> : <Sun className="h-3 w-3 text-amber-400" />}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Nghỉ giữa ca:</span>
                  <strong className="text-white">{shift.breakMinutes || 0} phút</strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Giờ công chuẩn:</span>
                  <strong className="text-emerald-400">{shift.standardWorkHours || 8}h</strong>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">Không tìm thấy ca làm việc liên kết.</div>
            )}
          </div>

          {/* Actual Check-In / Check-Out Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Check-In Card */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <LogIn className="h-4 w-4" />
                  CHẤM CÔNG VÀO
                </span>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                  {record.checkInMethod || 'WEB'}
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="text-2xl font-black font-mono text-white">
                  {formatTime(record.checkInTime)}
                </div>
                <div className="text-xs text-slate-400">
                  {record.lateMinutes > 0 ? (
                    <span className="text-red-400 font-semibold">
                      Muộn {record.lateMinutes} phút so với giờ vào
                    </span>
                  ) : (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Đúng giờ (Trong thời gian cho phép)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Check-Out Card */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-400">
                <span className="flex items-center gap-1.5">
                  <LogOut className="h-4 w-4" />
                  CHẤM CÔNG RA
                </span>
                <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-[10px]">
                  {record.checkOutMethod || 'WEB'}
                </Badge>
              </div>

              <div className="space-y-1">
                <div className="text-2xl font-black font-mono text-white">
                  {formatTime(record.checkOutTime)}
                </div>
                <div className="text-xs text-slate-400">
                  {!record.checkOutTime ? (
                    <span className="text-amber-400 italic">Chưa thực hiện check-out</span>
                  ) : record.earlyMinutes > 0 ? (
                    <span className="text-amber-400 font-semibold">
                      Về sớm {record.earlyMinutes} phút
                    </span>
                  ) : (
                    <span className="text-blue-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Đúng giờ kết thúc ca
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Work Hours Summary Metrics */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
              Tổng Hợp Giờ Công Tính Lương
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Số Giờ Thực Tế</span>
                <span className="text-lg font-bold text-white font-mono">{record.actualWorkHours}h</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Trừ Giờ Nghỉ</span>
                <span className="text-lg font-bold text-slate-300 font-mono">{shift?.breakMinutes || 0}p</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Tăng Ca (OT)</span>
                <span className="text-lg font-bold text-purple-400 font-mono">{record.otHours || 0}h</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-[11px] text-slate-400 block">Trạng Thái Công</span>
                <span className="text-sm font-bold text-emerald-400 mt-1 block">
                  {record.actualWorkHours > 0 ? 'Hợp lệ' : 'Chưa tính'}
                </span>
              </div>
            </div>

            {/* Notes if any */}
            {record.notes && (
              <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300">
                <span className="text-slate-500 font-medium">Ghi chú: </span>
                <span>{record.notes}</span>
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-700 bg-slate-800 text-slate-300"
            >
              Đóng
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
