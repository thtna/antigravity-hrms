'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, History, Clock, ShieldCheck, User } from 'lucide-react';

interface CorrectionAuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  adjustmentId: string;
}

export function CorrectionAuditTrailModal({
  isOpen,
  onClose,
  adjustmentId,
}: CorrectionAuditTrailModalProps) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState('');

  const fetchAuditLogs = useCallback(async () => {
    if (!adjustmentId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/attendance/corrections/${adjustmentId}/audit`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Không thể tải lịch sử kiểm toán.');
        return;
      }
      setLogs(data.data || []);
    } catch {
      setError('Lỗi kết nối khi tải lịch sử kiểm toán.');
    } finally {
      setLoading(false);
    }
  }, [adjustmentId]);

  useEffect(() => {
    if (isOpen && adjustmentId) {
      fetchAuditLogs();
    }
  }, [isOpen, adjustmentId, fetchAuditLogs]);

  if (!isOpen) return null;

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE_ATTENDANCE_CORRECTION':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Tạo yêu cầu
          </span>
        );
      case 'APPROVE_ATTENDANCE_CORRECTION':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Phê duyệt & Áp dụng
          </span>
        );
      case 'REJECT_ATTENDANCE_CORRECTION':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Từ chối
          </span>
        );
      case 'CANCEL_ATTENDANCE_CORRECTION':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
            Nhân viên hủy
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300">
            {action}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl bg-slate-900 border border-slate-700/60 text-slate-100 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100">
                Nhật Ký Kiểm Toán (Audit Trail)
              </h3>
              <p className="text-xs text-slate-400">
                Lịch sử bất biến và bảo toàn dữ liệu gốc cho yêu cầu #{adjustmentId.slice(0, 8)}
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

        {/* Timeline Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Chưa có bản ghi kiểm toán nào cho yêu cầu này.
            </div>
          )}

          {!loading && logs.length > 0 && (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {logs.map((log) => {
                const actorName =
                  log.actor?.employee
                    ? `${log.actor.employee.firstName} ${log.actor.employee.lastName}`
                    : log.actor?.email || 'Hệ thống';

                return (
                  <div key={log.id} className="relative group">
                    <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-slate-900 ring-4 ring-slate-900 group-hover:scale-125 transition" />

                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {getActionBadge(log.action)}
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(log.createdAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-300">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{actorName}</span>
                        </div>
                      </div>

                      {/* Snapshots / details */}
                      {log.oldValues && (
                        <div className="text-[11px] p-2 bg-slate-900/80 rounded-lg border border-slate-800 text-slate-400">
                          <strong className="text-slate-300 block mb-1">Dữ liệu trước thay đổi:</strong>
                          <pre className="overflow-x-auto text-[10px] text-slate-400 whitespace-pre-wrap">
                            {JSON.stringify(log.oldValues, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.newValues && (
                        <div className="text-[11px] p-2 bg-slate-900/80 rounded-lg border border-slate-800 text-slate-400">
                          <strong className="text-emerald-400 block mb-1">Dữ liệu sau thay đổi:</strong>
                          <pre className="overflow-x-auto text-[10px] text-slate-300 whitespace-pre-wrap">
                            {JSON.stringify(log.newValues, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.ipAddress && (
                        <div className="text-[10px] text-slate-500 pt-1 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>IP: {log.ipAddress}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-800 bg-slate-950/40 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
          >
            Đóng
          </Button>
        </div>
      </Card>
    </div>
  );
}
