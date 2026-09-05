'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Award,
  DollarSign,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ShieldCheck,
  Edit,
  History,
  CheckSquare,
} from 'lucide-react';
import { BonusCreateModal, BONUS_CATEGORY_LABELS } from '@/components/bonus/BonusCreateModal';
import { BonusEditModal, BonusItem } from '@/components/bonus/BonusEditModal';
import { BonusProcessModal } from '@/components/bonus/BonusProcessModal';
import { BonusAuditModal } from '@/components/bonus/BonusAuditModal';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

export default function BonusPage() {
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const [period, setPeriod] = useState(currentPeriod);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<BonusItem | null>(null);
  const [processingBonus, setProcessingBonus] = useState<BonusItem | null>(null);
  const [auditingBonus, setAuditingBonus] = useState<BonusItem | null>(null);

  // Data states
  const [bonuses, setBonuses] = useState<BonusItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Fetch Summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/bonuses/summary');
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      }
    } catch (err) {
      console.error('Error fetching bonus summary:', err);
    }
  }, []);

  // Fetch Bonuses
  const fetchBonuses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period) params.set('period', period);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      params.set('limit', '50');

      const res = await fetch(`/api/v1/bonuses?${params.toString()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setBonuses(json.data);
      }
    } catch (err) {
      console.error('Error fetching bonuses:', err);
    } finally {
      setLoading(false);
    }
  }, [period, statusFilter, categoryFilter]);

  const refreshAll = useCallback(() => {
    fetchSummary();
    fetchBonuses();
  }, [fetchSummary, fetchBonuses]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  function getStatusBadge(status: string) {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Đã Duyệt
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-red-400">
            <XCircle className="h-3 w-3" />
            Từ Chối
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

  return (
    <AppShell>
      <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <Award className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Quản Lý Khen Thưởng & Vinh Danh (Bonus System)
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quy trình tạo thưởng, chỉnh sửa trước duyệt, phê duyệt đa tầng và lưu vết kiểm toán tài chính bất biến
          </p>
        </div>

        {/* Action Buttons & Period Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
            <span className="text-slate-400">Kỳ:</span>
            <input
              type="text"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              placeholder="YYYY-MM"
              className="w-20 bg-transparent font-mono font-semibold text-white focus:outline-none"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={loading}
            className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>Đề Xuất Thưởng</span>
          </Button>
        </div>
      </div>

      {/* 5 Category Metric Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <span className="text-[11px] font-medium text-blue-400">Thưởng KPI</span>
            <div className="text-lg font-bold text-white font-mono">
              {formatBonusVnd(summary.categoryTotals?.KPI || 0)}
            </div>
            <p className="text-[10px] text-slate-500">Hiệu suất hoàn thành</p>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <span className="text-[11px] font-medium text-amber-400">Thưởng Tăng Ca</span>
            <div className="text-lg font-bold text-white font-mono">
              {formatBonusVnd(summary.categoryTotals?.OVERTIME || 0)}
            </div>
            <p className="text-[10px] text-slate-500">Làm thêm giờ & ngoài giờ</p>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <span className="text-[11px] font-medium text-emerald-400">Thưởng Dự Án</span>
            <div className="text-lg font-bold text-white font-mono">
              {formatBonusVnd(summary.categoryTotals?.PROJECT || 0)}
            </div>
            <p className="text-[10px] text-slate-500">Bàn giao & vượt tiến độ</p>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 p-3.5 space-y-1">
            <span className="text-[11px] font-medium text-purple-400">Thâm Niên / Chuyên Cần</span>
            <div className="text-lg font-bold text-white font-mono">
              {formatBonusVnd(summary.categoryTotals?.TIME || 0)}
            </div>
            <p className="text-[10px] text-slate-500">Thời gian & ngày công chuẩn</p>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 p-3.5 space-y-1 col-span-2 md:col-span-1">
            <span className="text-[11px] font-medium text-rose-400">Thưởng Khác</span>
            <div className="text-lg font-bold text-white font-mono">
              {formatBonusVnd(summary.categoryTotals?.OTHER || 0)}
            </div>
            <p className="text-[10px] text-slate-500">Sáng kiến, lễ tết, đột xuất</p>
          </Card>
        </div>
      )}

      {/* Main Table Card */}
      <Card className="border-slate-800 bg-slate-900 overflow-hidden">
        {/* Filters Header */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto text-xs">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL'
                  ? 'Tất Cả'
                  : st === 'PENDING'
                  ? 'Chờ Duyệt'
                  : st === 'APPROVED'
                  ? 'Đã Duyệt'
                  : 'Bị Từ Chối'}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Loại:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">Tất Cả Loại Thưởng</option>
              <option value="KPI">KPI</option>
              <option value="OVERTIME">Tăng Ca (Overtime)</option>
              <option value="PROJECT">Dự Án (Project)</option>
              <option value="TIME">Chuyên Cần / Thâm Niên (Time)</option>
              <option value="OTHER">Khác (Other)</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase font-mono">
              <tr>
                <th className="px-5 py-3">Nhân Viên</th>
                <th className="px-4 py-3">Phân Loại</th>
                <th className="px-4 py-3">Số Tiền (VND)</th>
                <th className="px-4 py-3">Kỳ & Lý Do</th>
                <th className="px-4 py-3">Trạng Thái</th>
                <th className="px-4 py-3">Người Duyệt</th>
                <th className="px-4 py-3 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-4">
                    <SkeletonTable rows={5} cols={7} />
                  </td>
                </tr>
              ) : bonuses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4">
                    <EmptyState
                      icon="award"
                      title="Không tìm thấy khoản thưởng nào"
                      description="Chưa có đề xuất khen thưởng nào phù hợp với bộ lọc và kỳ hiện tại."
                      actionLabel="Đề Xuất Thưởng"
                      onAction={() => setIsCreateModalOpen(true)}
                    />
                  </td>
                </tr>
              ) : (
                bonuses.map((bonus) => {
                  const catInfo = BONUS_CATEGORY_LABELS[bonus.category] || {
                    label: bonus.category,
                    badgeClass: 'bg-slate-800 text-slate-300',
                  };
                  const isPending = bonus.status === 'PENDING';

                  return (
                    <tr key={bonus.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Employee */}
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-white">
                          {bonus.employee.lastName} {bonus.employee.firstName}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {bonus.employee.employeeCode}
                          {bonus.employee.department?.name ? ` • ${bonus.employee.department.name}` : ''}
                        </p>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5">
                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${catInfo.badgeClass}`}>
                          {bonus.category}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 font-mono text-sm font-bold text-emerald-400">
                        {formatBonusVnd(Number(bonus.amount))}
                      </td>

                      {/* Reason & Period */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <span className="font-mono text-[11px] text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded mr-1.5">
                          {bonus.period}
                        </span>
                        <span className="text-slate-300 line-clamp-1">{bonus.reason}</span>
                        {bonus.approvalNotes && (
                          <p className="text-[10px] text-slate-500 italic mt-0.5">
                            Ghi chú: {bonus.approvalNotes}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">{getStatusBadge(bonus.status)}</td>

                      {/* Approver */}
                      <td className="px-4 py-3.5">
                        {bonus.approver ? (
                          <div>
                            <p className="text-slate-200 font-medium">
                              {bonus.approver.lastName} {bonus.approver.firstName}
                            </p>
                            {bonus.approvedAt && (
                              <p className="text-[10px] text-slate-500 font-mono">
                                {new Date(bonus.approvedAt).toLocaleDateString('vi-VN')}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Chưa duyệt</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit button (enabled only when PENDING) */}
                          {isPending && (
                            <button
                              onClick={() => setEditingBonus(bonus)}
                              title="Sửa trước khi duyệt"
                              className="rounded p-1 text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}

                          {/* Process button (Duyệt / Từ Chối) */}
                          {isPending && (
                            <button
                              onClick={() => setProcessingBonus(bonus)}
                              title="Xét duyệt thưởng"
                              className="rounded p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                            >
                              <CheckSquare className="h-4 w-4" />
                            </button>
                          )}

                          {/* Audit Trail button */}
                          <button
                            onClick={() => setAuditingBonus(bonus)}
                            title="Xem lịch sử kiểm toán tài chính"
                            className="rounded p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors"
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </button>
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
      <BonusCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={refreshAll}
        defaultPeriod={period}
      />

      <BonusEditModal
        isOpen={Boolean(editingBonus)}
        onClose={() => setEditingBonus(null)}
        onSuccess={refreshAll}
        bonus={editingBonus}
      />

      <BonusProcessModal
        isOpen={Boolean(processingBonus)}
        onClose={() => setProcessingBonus(null)}
        onSuccess={refreshAll}
        bonus={processingBonus}
      />

      <BonusAuditModal
        isOpen={Boolean(auditingBonus)}
        onClose={() => setAuditingBonus(null)}
        bonus={auditingBonus}
      />
      </div>
    </AppShell>
  );
}
