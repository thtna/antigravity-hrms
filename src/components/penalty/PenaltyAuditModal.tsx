'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import {
  X,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { PenaltyItem } from './PenaltyEditModal';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

interface AuditLogItem {
  id: string;
  action: string;
  actorId?: string | null;
  actor?: {
    id: string;
    email: string;
    employee?: { firstName: string; lastName: string } | null;
  } | null;
  oldValues?: any;
  newValues?: any;
  createdAt: string;
}

interface PenaltyAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  penalty: PenaltyItem | null;
}

export function PenaltyAuditModal({
  isOpen,
  onClose,
  penalty,
}: PenaltyAuditModalProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !penalty) return;

    setLoading(true);
    setError(null);

    fetch(`/api/v1/penalties/${penalty.id}/audit`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setLogs(json.data);
        } else {
          setError(json.error?.message || 'Không thể nạp nhật ký kiểm toán.');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Lỗi kết nối.');
      })
      .finally(() => setLoading(false));
  }, [isOpen, penalty]);

  if (!isOpen || !penalty) return null;

  function getActionLabel(action: string) {
    switch (action) {
      case 'CREATE_PENALTY_RECORD':
        return {
          label: 'Lập Biên Bản Xử Phạt',
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
        };
      case 'UPDATE_PENALTY_BEFORE_APPROVAL':
        return {
          label: 'Chỉnh Sửa Trước Duyệt',
          color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
        };
      case 'APPROVE_PENALTY':
        return {
          label: 'Phê Duyệt Khấu Trừ',
          color: 'text-red-400 bg-red-500/10 border-red-500/30',
        };
      case 'REJECT_PENALTY':
        return {
          label: 'Bác Bỏ / Hủy Bỏ Biên Bản',
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        };
      default:
        return { label: action, color: 'text-slate-400 bg-slate-800 border-slate-700' };
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <Card className="relative w-full max-w-2xl border-slate-700 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2 text-red-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Nhật Ký Kiểm Toán Kỷ Luật (Audit Trail)</h2>
              <p className="text-xs text-slate-400">
                Lịch sử bất biến ghi nhận mọi thay đổi, quyết định phê duyệt và biến động số tiền phạt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Target Info */}
          <div className="rounded-lg bg-slate-800/80 border border-slate-700/60 p-3.5 flex justify-between items-center text-xs">
            <div>
              <span className="text-slate-400">Nhân viên vi phạm: </span>
              <span className="font-semibold text-white">
                {penalty.employee.lastName} {penalty.employee.firstName} ({penalty.employee.employeeCode})
              </span>
            </div>
            <div>
              <span className="text-slate-400">Mức phạt hiện tại: </span>
              <span className="font-mono font-bold text-rose-400">
                {formatBonusVnd(Number(penalty.amount))}
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
              <Clock className="h-6 w-6 animate-spin text-slate-500" />
              <span>Đang nạp dữ liệu kiểm toán...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Chưa có bản ghi kiểm toán nào được lưu.
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
              {logs.map((log) => {
                const actionInfo = getActionLabel(log.action);
                const dateFormatted = new Date(log.createdAt).toLocaleString('vi-VN');

                return (
                  <div key={log.id} className="relative group">
                    {/* Timeline bullet */}
                    <div className="absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-slate-700 bg-slate-900 group-hover:border-red-500 transition-colors" />

                    <div className="rounded-lg border border-slate-800 bg-slate-800/50 p-3.5 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${actionInfo.color}`}
                          >
                            {actionInfo.label}
                          </span>
                          <span className="text-xs font-semibold text-white">
                            {log.actor?.employee
                              ? `${log.actor.employee.lastName} ${log.actor.employee.firstName}`
                              : log.actor?.email || 'Hệ thống'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {dateFormatted}
                        </span>
                      </div>

                      {/* Diff view if amount changed */}
                      {log.oldValues && log.newValues && log.oldValues.amount !== log.newValues.amount && (
                        <div className="rounded bg-slate-900/90 p-2 text-xs font-mono flex items-center gap-2 text-slate-300">
                          <span className="text-slate-400 line-through">
                            {formatBonusVnd(log.oldValues.amount)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-slate-500" />
                          <span className="text-rose-400 font-bold">
                            {formatBonusVnd(log.newValues.amount)}
                          </span>
                        </div>
                      )}

                      {/* Notes logged */}
                      {log.newValues?.approvalNotes && (
                        <p className="text-xs text-slate-300 italic">
                          &quot;{log.newValues.approvalNotes}&quot;
                        </p>
                      )}
                      {log.newValues?.reason && !log.oldValues?.reason && (
                        <p className="text-xs text-slate-400">
                          Lý do: {log.newValues.reason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
