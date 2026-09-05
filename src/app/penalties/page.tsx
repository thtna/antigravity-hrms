'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ShieldAlert,
  AlertTriangle,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingDown,
  History,
  Edit,
  CheckSquare,
  Lock,
} from 'lucide-react';
import { PenaltyCreateModal, PENALTY_CATEGORY_LABELS } from '@/components/penalty/PenaltyCreateModal';
import { PenaltyEditModal, PenaltyItem } from '@/components/penalty/PenaltyEditModal';
import { PenaltyProcessModal } from '@/components/penalty/PenaltyProcessModal';
import { PenaltyAuditModal } from '@/components/penalty/PenaltyAuditModal';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

export default function PenaltiesPage() {
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const [period, setPeriod] = useState(currentPeriod);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPenalty, setEditingPenalty] = useState<PenaltyItem | null>(null);
  const [processingPenalty, setProcessingPenalty] = useState<PenaltyItem | null>(null);
  const [auditingPenalty, setAuditingPenalty] = useState<PenaltyItem | null>(null);

  // User session state
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | undefined>();
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Data states
  const [penalties, setPenalties] = useState<PenaltyItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Fetch Current User
  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setCurrentEmployeeId(json.data.employeeId || json.data.employee?.id);
          setUserRoles(json.data.roles || []);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/penalties/summary');
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      }
    } catch (err) {
      console.error('Error fetching penalty summary:', err);
    }
  }, []);

  // Fetch Penalties
  const fetchPenalties = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period) params.set('period', period);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      params.set('limit', '50');

      const res = await fetch(`/api/v1/penalties?${params.toString()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPenalties(json.data);
      }
    } catch (err) {
      console.error('Error fetching penalties:', err);
    } finally {
      setLoading(false);
    }
  }, [period, statusFilter, categoryFilter]);

  const refreshAll = useCallback(() => {
    fetchSummary();
    fetchPenalties();
  }, [fetchSummary, fetchPenalties]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  function getStatusBadge(status: string) {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-400">
            <CheckCircle2 className="h-3 w-3" />
            Đã Khấu Trừ
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
            <XCircle className="h-3 w-3" />
            Đã Bác Bỏ
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
            <Clock className="h-3 w-3" />
            Chờ Duyệt
          </span>
        );
    }
  }

  const canManage =
    userRoles.includes('manager') || userRoles.includes('hr') || userRoles.includes('admin');

  return (
    <AppShell>
      <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-red-500/10 p-2 text-red-400">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Quản Lý Kỷ Luật & Khấu Trừ Phạt (Penalty System)
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            Quy trình lập biên bản kỷ luật, khóa tài chính sau phê duyệt, chống tự phạt/tự duyệt và
            lưu vết kiểm toán bất biến
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={refreshAll}
            className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Làm Mới
          </Button>

          {canManage && (
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-500/20"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Lập Biên Bản Phạt
            </Button>
          )}
        </div>
      </div>

      {/* 4 Category Metric Cards + Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* LATE */}
        <Card className="border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Đi Muộn / Về Sớm</span>
            <div className="rounded bg-amber-500/10 p-1.5 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-lg lg:text-xl font-bold font-mono text-amber-400">
            {formatBonusVnd(summary?.categories?.late || 0)}
          </p>
          <span className="text-[10px] text-slate-500">Vi phạm giờ giấc chấm công</span>
        </Card>

        {/* UNAUTHORIZED_LEAVE */}
        <Card className="border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Nghỉ Không Phép</span>
            <div className="rounded bg-rose-500/10 p-1.5 text-rose-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-lg lg:text-xl font-bold font-mono text-rose-400">
            {formatBonusVnd(summary?.categories?.unauthorizedLeave || 0)}
          </p>
          <span className="text-[10px] text-slate-500">Tự ý bỏ ca không xin phép</span>
        </Card>

        {/* KPI_MISS */}
        <Card className="border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Không Đạt KPI</span>
            <div className="rounded bg-orange-500/10 p-1.5 text-orange-400">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-lg lg:text-xl font-bold font-mono text-orange-400">
            {formatBonusVnd(summary?.categories?.kpiMiss || 0)}
          </p>
          <span className="text-[10px] text-slate-500">Dưới ngưỡng cam kết tối thiểu</span>
        </Card>

        {/* OTHER */}
        <Card className="border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Kỷ Luật Khác</span>
            <div className="rounded bg-red-500/10 p-1.5 text-red-400">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-lg lg:text-xl font-bold font-mono text-red-400">
            {formatBonusVnd(summary?.categories?.other || 0)}
          </p>
          <span className="text-[10px] text-slate-500">Quy chế nội quy, bảo mật</span>
        </Card>
      </div>

      {/* Summary Highlight Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-center sm:text-left">
            <span className="text-xs text-slate-400">Tổng Tiền Khấu Trừ Đã Phê Duyệt ({period}):</span>
            <p className="text-xl font-black font-mono text-rose-400">
              {formatBonusVnd(summary?.totalApprovedAmount || 0)}
            </p>
          </div>
          <div className="h-8 w-px bg-slate-800 hidden sm:block" />
          <div>
            <span className="text-xs text-slate-400">Biên Bản Đang Chờ Xét Duyệt:</span>
            <p className="text-lg font-bold text-amber-400">
              {summary?.pendingCount || 0} hồ sơ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Kỳ tra cứu:</span>
          <input
            type="text"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-28 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white font-mono focus:border-red-500 focus:outline-none"
            placeholder="YYYY-MM"
          />
        </div>
      </div>

      {/* Filter Tabs & Selectors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
        {/* Status Tabs */}
        <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/80 p-1 text-xs">
          {[
            { id: 'ALL', label: 'Tất Cả' },
            { id: 'PENDING', label: 'Chờ Duyệt' },
            { id: 'APPROVED', label: 'Đã Khấu Trừ' },
            { id: 'REJECTED', label: 'Đã Bác Bỏ' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 font-medium transition-all ${
                statusFilter === tab.id
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Loại vi phạm:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-red-500 focus:outline-none"
          >
            <option value="ALL">-- Tất Cả Loại Vi Phạm --</option>
            {Object.entries(PENALTY_CATEGORY_LABELS).map(([k, meta]) => (
              <option key={k} value={k}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <Card className="border-slate-800 bg-slate-900/40 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Nhân Viên Vi Phạm</th>
                <th className="px-4 py-3.5">Loại Kỷ Luật</th>
                <th className="px-4 py-3.5">Ngày Vi Phạm</th>
                <th className="px-4 py-3.5">Kỳ Khấu Trừ</th>
                <th className="px-4 py-3.5">Mức Phạt (VND)</th>
                <th className="px-4 py-3.5">Lý Do / Hành Vi</th>
                <th className="px-4 py-3.5">Trạng Thái</th>
                <th className="px-4 py-3.5">Người Xét Duyệt</th>
                <th className="px-4 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-4">
                    <SkeletonTable rows={5} cols={9} />
                  </td>
                </tr>
              ) : penalties.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4">
                    <EmptyState
                      icon="shield"
                      title="Không có biên bản kỷ luật nào"
                      description="Không có biên bản kỷ luật nào phù hợp với bộ lọc hiện tại."
                      actionLabel={canManage ? 'Lập Biên Bản Mới' : undefined}
                      onAction={canManage ? () => setIsCreateModalOpen(true) : undefined}
                    />
                  </td>
                </tr>
              ) : (
                penalties.map((pen) => {
                  const catMeta = PENALTY_CATEGORY_LABELS[pen.category] || {
                    label: pen.category,
                    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
                  };
                  const isPending = pen.status === 'PENDING';
                  const dateStr = pen.effectiveDate
                    ? new Date(pen.effectiveDate).toLocaleDateString('vi-VN')
                    : '—';

                  return (
                    <tr
                      key={pen.id}
                      className="hover:bg-slate-800/30 transition-colors group"
                    >
                      {/* Nhân viên */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-white">
                          {pen.employee.lastName} {pen.employee.firstName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {pen.employee.employeeCode}
                          {pen.employee.department ? ` • ${pen.employee.department.name}` : ''}
                        </div>
                      </td>

                      {/* Loại kỷ luật */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${catMeta.badgeClass}`}
                        >
                          {catMeta.label.split(' (')[0]}
                        </span>
                      </td>

                      {/* Ngày vi phạm */}
                      <td className="px-4 py-3.5 font-mono text-slate-300">{dateStr}</td>

                      {/* Kỳ */}
                      <td className="px-4 py-3.5 font-mono text-slate-300">{pen.period}</td>

                      {/* Số tiền phạt */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono font-bold text-rose-400 text-sm">
                          -{formatBonusVnd(Number(pen.amount))}
                        </span>
                      </td>

                      {/* Lý do */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className="truncate text-slate-300" title={pen.reason}>
                          {pen.reason}
                        </p>
                        {pen.notes && (
                          <p className="text-[10px] text-slate-500 truncate" title={pen.notes}>
                            Ghi chú: {pen.notes}
                          </p>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3.5">{getStatusBadge(pen.status)}</td>

                      {/* Người duyệt */}
                      <td className="px-4 py-3.5 text-slate-400">
                        {pen.approver ? (
                          <div>
                            <span className="text-white font-medium">
                              {pen.approver.lastName} {pen.approver.firstName}
                            </span>
                            {pen.approvedAt && (
                              <p className="text-[10px] text-slate-500">
                                {new Date(pen.approvedAt).toLocaleDateString('vi-VN')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 italic">—</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Xem Audit Log */}
                          <button
                            onClick={() => setAuditingPenalty(pen)}
                            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Xem nhật ký kiểm toán tài chính"
                          >
                            <History className="h-4 w-4" />
                          </button>

                          {/* Sửa trước duyệt (khóa nếu không PENDING) */}
                          {canManage && (
                            <button
                              onClick={() => setEditingPenalty(pen)}
                              disabled={!isPending}
                              className={`p-1.5 rounded-md transition-colors ${
                                isPending
                                  ? 'hover:bg-slate-800 text-blue-400 hover:text-blue-300'
                                  : 'text-slate-700 cursor-not-allowed'
                              }`}
                              title={
                                isPending
                                  ? 'Chỉnh sửa trước khi phê duyệt'
                                  : 'Đã khóa: Không thể sửa hồ sơ đã duyệt/từ chối'
                              }
                            >
                              {isPending ? <Edit className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </button>
                          )}

                          {/* Xét duyệt (Chỉ hiển thị khi PENDING) */}
                          {canManage && isPending && (
                            <button
                              onClick={() => setProcessingPenalty(pen)}
                              className="p-1.5 rounded-md hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                              title="Xét duyệt / Phê duyệt khấu trừ"
                            >
                              <CheckSquare className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modals */}
      <PenaltyCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={refreshAll}
        defaultPeriod={period}
        currentEmployeeId={currentEmployeeId}
      />

      <PenaltyEditModal
        isOpen={Boolean(editingPenalty)}
        onClose={() => setEditingPenalty(null)}
        onSuccess={refreshAll}
        penalty={editingPenalty}
      />

      <PenaltyProcessModal
        isOpen={Boolean(processingPenalty)}
        onClose={() => setProcessingPenalty(null)}
        onSuccess={refreshAll}
        penalty={processingPenalty}
        currentEmployeeId={currentEmployeeId}
      />

      <PenaltyAuditModal
        isOpen={Boolean(auditingPenalty)}
        onClose={() => setAuditingPenalty(null)}
        penalty={auditingPenalty}
      />
      </div>
    </AppShell>
  );
}
