'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';
import { useToastHelpers } from '@/components/ui/toast';
import {
  ShieldAlert,
  Building2,
  Users,
  GitFork,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Eye,
  Check,
  X,
  Pause,
  Play,
  Archive,
  RefreshCw,
  SlidersHorizontal,
  Mail,
  Phone,
  Calendar,
  Lock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { TenantListItem, TenantMetrics, MAX_TENANTS } from '@/lib/services/super-admin.service';

export default function SuperAdminPage() {
  const { success: toastSuccess, error: toastError } = useToastHelpers();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [metrics, setMetrics] = useState<TenantMetrics | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action Confirmation Modal
  const [actionTenant, setActionTenant] = useState<TenantListItem | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | 'SUSPEND' | 'ACTIVATE' | 'CLOSE' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);

  const fetchTenants = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage('');

      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/v1/super-admin/tenants?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || 'Không thể tải danh sách tenants.');
      }

      setTenants(json.data.items || []);
      setMetrics(json.data.metrics || null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Đã có lỗi xảy ra khi truy vấn dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  // Open View Detail Modal
  const handleOpenDetail = async (tenant: TenantListItem) => {
    try {
      setIsViewModalOpen(true);
      setDetailLoading(true);
      const res = await fetch(`/api/v1/super-admin/tenants/${tenant.id}`);
      const json = await res.json();
      if (json.success) {
        setSelectedTenant(json.data);
      } else {
        toastError(json?.error?.message || 'Lỗi tải chi tiết tổ chức.');
      }
    } catch {
      toastError('Không thể kết nối tới máy chủ.');
    } finally {
      setDetailLoading(false);
    }
  };

  // Open Action Modal
  const handleOpenAction = (tenant: TenantListItem, action: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'ACTIVATE' | 'CLOSE') => {
    // Quota warning check on client
    if ((action === 'APPROVE' || action === 'ACTIVATE') && metrics && metrics.active >= MAX_TENANTS) {
      toastError(`Không thể ${action}: Đã đạt giới hạn tối đa ${MAX_TENANTS} tenants hoạt động (${metrics.activeQuotaDisplay})!`);
      return;
    }

    setActionTenant(tenant);
    setActionType(action);
    setActionReason('');
  };

  // Submit Action
  const handleConfirmAction = async () => {
    if (!actionTenant || !actionType) return;

    try {
      setIsActionSubmitting(true);
      const res = await fetch(`/api/v1/super-admin/tenants/${actionTenant.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: actionType,
          reason: actionReason.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message || `Thao tác ${actionType} thất bại.`);
      }

      toastSuccess(json.data.message || `Đã chuyển trạng thái tổ chức thành công.`);
      setActionTenant(null);
      setActionType(null);
      await fetchTenants();
    } catch (err: any) {
      toastError(err.message || 'Lỗi xử lý yêu cầu.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ACTIVE
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            PENDING
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            SUSPENDED
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            REJECTED
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700/30 text-slate-400 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            CLOSED
          </span>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActionLabel = (act: string | null) => {
    switch (act) {
      case 'APPROVE':
        return 'Phê duyệt (APPROVE)';
      case 'REJECT':
        return 'Từ chối (REJECT)';
      case 'SUSPEND':
        return 'Tạm đình chỉ (SUSPEND)';
      case 'ACTIVATE':
        return 'Kích hoạt lại (ACTIVATE)';
      case 'CLOSE':
        return 'Đóng tổ chức (CLOSE)';
      default:
        return '';
    }
  };

  const quotaPercent = metrics ? Math.min(100, Math.round((metrics.active / MAX_TENANTS) * 100)) : 0;
  const isQuotaFull = metrics ? metrics.active >= MAX_TENANTS : false;

  return (
    <AppShell
      header={
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/10 border border-indigo-500/30 text-indigo-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">Cổng Quản Trị Tối Cao (Super Admin)</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-red-500/20 text-red-400 border border-red-500/30 tracking-wider">
                  SUPER_ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Quản lý các tổ chức khách hàng (Tenants), phê duyệt hồ sơ và kiểm soát giới hạn tài nguyên SaaS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTenants}
              disabled={loading}
              className="border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Error Banner */}
        {errorMessage && (
          <ErrorBanner
            title="Đã có lỗi xảy ra"
            description={errorMessage}
            onRetry={fetchTenants}
          />
        )}

        {/* Quota Alert Banner if Full */}
        {isQuotaFull && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300">
              <span className="font-bold">Đã đạt giới hạn tối đa {MAX_TENANTS} tenants hoạt động ({metrics?.activeQuotaDisplay}): </span>
              Hệ thống nghiêm ngặt chặn kích hoạt thêm tenant thứ 6 để đảm bảo giới hạn tài nguyên và tính ổn định. Để kích hoạt thêm, vui lòng tạm đình chỉ hoặc đóng bớt một tổ chức đang chạy.
            </div>
          </div>
        )}

        {/* ── 1. Top Metrics Cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Active Quota Card */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 p-4 rounded-xl glass-panel border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-950 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Hạn Mức Hoạt Động (Quota)</span>
              <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-mono text-xs">
                MAX = {MAX_TENANTS}
              </Badge>
            </div>
            <div className="my-2 flex items-baseline justify-between">
              <span className="text-3xl font-black text-white font-mono tracking-tight">
                {metrics?.activeQuotaDisplay || `0 / ${MAX_TENANTS}`}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {isQuotaFull ? 'Hết quota khả dụng' : `Còn trống ${MAX_TENANTS - (metrics?.active || 0)} slot`}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isQuotaFull ? 'bg-red-500' : quotaPercent > 60 ? 'bg-amber-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
          </div>

          {/* Total Tenants */}
          <div className="p-4 rounded-xl glass-panel border border-slate-800 bg-slate-900/40 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>Total Tenants</span>
              <Building2 className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-white font-mono">
              {metrics?.totalTenants ?? 0}
            </div>
            <span className="text-[11px] text-slate-500">Tất cả tổ chức đã đăng ký</span>
          </div>

          {/* Pending */}
          <div className="p-4 rounded-xl glass-panel border border-amber-500/30 bg-amber-950/20 flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-400 text-xs">
              <span>Pending</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-300 font-mono">
              {metrics?.pending ?? 0}
            </div>
            <span className="text-[11px] text-amber-500/80">Chờ Super Admin duyệt</span>
          </div>

          {/* Active */}
          <div className="p-4 rounded-xl glass-panel border border-emerald-500/30 bg-emerald-950/20 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-400 text-xs">
              <span>Active</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-300 font-mono">
              {metrics?.active ?? 0}
            </div>
            <span className="text-[11px] text-emerald-500/80">Đang hoạt động</span>
          </div>

          {/* Suspended & Rejected */}
          <div className="p-4 rounded-xl glass-panel border border-slate-800 bg-slate-900/40 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs">
              <span className="text-orange-400">Suspended</span>
              <span className="text-rose-400">Rejected</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between font-mono">
              <span className="text-2xl font-bold text-orange-400">{metrics?.suspended ?? 0}</span>
              <span className="text-slate-600">/</span>
              <span className="text-2xl font-bold text-rose-400">{metrics?.rejected ?? 0}</span>
            </div>
            <span className="text-[11px] text-slate-500">Tạm đình chỉ / Đã từ chối</span>
          </div>
        </div>

        {/* ── 2. Filters & Search Bar ───────────────────────────────────────── */}
        <div className="p-4 rounded-xl glass-panel border border-slate-800/80 bg-slate-900/30 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                    : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50'
                }`}
              >
                {st === 'ALL' ? 'Tất cả' : st}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, slug, email, sđt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* ── 3. Tenants Table ──────────────────────────────────────────────── */}
        <div className="rounded-xl glass-panel border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Tổ Chức (Organization)</th>
                  <th className="py-3 px-4">Chủ Sở Hữu (Owner)</th>
                  <th className="py-3 px-4">Liên Hệ (Email / Phone)</th>
                  <th className="py-3 px-4">Ngày Đăng Ký</th>
                  <th className="py-3 px-4">Trạng Thái</th>
                  <th className="py-3 px-4 text-center">Nhân Sự</th>
                  <th className="py-3 px-4 text-center">Chi Nhánh</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-4">
                      <SkeletonTable rows={5} cols={8} />
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12">
                      <EmptyState
                        title="Không có tổ chức nào"
                        description={
                          searchQuery || statusFilter !== 'ALL'
                            ? 'Không tìm thấy tổ chức phù hợp với bộ lọc hiện tại.'
                            : 'Chưa có tổ chức nào đăng ký trên nền tảng.'
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                      {/* Org Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-100 text-sm">{t.name}</div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5">
                          <span className="font-mono bg-slate-800/60 px-1.5 py-0.5 rounded text-slate-300">
                            /{t.slug}
                          </span>
                          {t.taxCode && <span>• MST: {t.taxCode}</span>}
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-200">{t.owner.name}</div>
                        <div className="text-slate-400 text-[11px]">{t.owner.email}</div>
                        {t.owner.phone && (
                          <div className="text-slate-500 text-[10px]">{t.owner.phone}</div>
                        )}
                      </td>

                      {/* Contact */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{t.email || 'N/A'}</span>
                        </div>
                        {t.phone && (
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5">
                            <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{t.phone}</span>
                          </div>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4 text-slate-300">
                        {new Date(t.createdAt).toLocaleDateString('vi-VN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })}
                        <div className="text-[10px] text-slate-500">
                          {new Date(t.createdAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{getStatusBadge(t.status)}</td>

                      {/* Employees */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 font-mono">
                          <Users className="w-3 h-3 text-slate-400" />
                          {t.employeesCount}
                        </span>
                      </td>

                      {/* Branches */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 font-mono">
                          <GitFork className="w-3 h-3 text-slate-400" />
                          {t.branchesCount}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* VIEW Action */}
                          <button
                            title="Xem chi tiết"
                            onClick={() => handleOpenDetail(t)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* APPROVE (PENDING only) */}
                          {t.status === 'PENDING' && (
                            <button
                              title={isQuotaFull ? `Không thể duyệt (Đã đạt tối đa ${MAX_TENANTS} tenants active)` : 'Phê duyệt tổ chức'}
                              disabled={isQuotaFull}
                              onClick={() => handleOpenAction(t, 'APPROVE')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isQuotaFull
                                  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40'
                              }`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}

                          {/* REJECT (PENDING only) */}
                          {t.status === 'PENDING' && (
                            <button
                              title="Từ chối tổ chức"
                              onClick={() => handleOpenAction(t, 'REJECT')}
                              className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/40 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}

                          {/* SUSPEND (ACTIVE only) */}
                          {t.status === 'ACTIVE' && (
                            <button
                              title="Tạm đình chỉ hoạt động"
                              onClick={() => handleOpenAction(t, 'SUSPEND')}
                              className="p-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/40 transition-colors"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}

                          {/* ACTIVATE (SUSPENDED only) */}
                          {t.status === 'SUSPENDED' && (
                            <button
                              title={isQuotaFull ? `Không thể kích hoạt (Đã đạt tối đa ${MAX_TENANTS} active)` : 'Kích hoạt lại'}
                              disabled={isQuotaFull}
                              onClick={() => handleOpenAction(t, 'ACTIVATE')}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isQuotaFull
                                  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40'
                              }`}
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}

                          {/* CLOSE (For non-CLOSED) */}
                          {t.status !== 'CLOSED' && (
                            <button
                              title="Đóng / Ngừng vĩnh viễn"
                              onClick={() => handleOpenAction(t, 'CLOSE')}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition-colors"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── 4. View Detail Modal ──────────────────────────────────────────── */}
      {isViewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-200 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Chi Tiết Tổ Chức Khách Hàng</h3>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading || !selectedTenant ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-400" />
                Đang tải dữ liệu chi tiết...
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400">Tên tổ chức:</span>
                    <div className="font-bold text-white text-sm">{selectedTenant.organization.name}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Tenant Slug:</span>
                    <div className="font-mono text-blue-400">/{selectedTenant.organization.slug}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Trạng thái:</span>
                    <div className="mt-1">{getStatusBadge(selectedTenant.organization.status)}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Mã số thuế:</span>
                    <div className="font-mono text-slate-200">{selectedTenant.organization.taxCode || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Email:</span>
                    <div className="text-slate-200">{selectedTenant.organization.email || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Số điện thoại:</span>
                    <div className="text-slate-200">{selectedTenant.organization.phone || 'N/A'}</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">Địa chỉ:</span>
                    <div className="text-slate-200">{selectedTenant.organization.address || 'N/A'}</div>
                  </div>
                </div>

                {/* Resource Stats */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase">Nhân viên</div>
                    <div className="text-base font-bold text-white font-mono">
                      {selectedTenant.organization._count?.employees || 0}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase">Chi nhánh</div>
                    <div className="text-base font-bold text-white font-mono">
                      {selectedTenant.organization._count?.branches || 0}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase">Phòng ban</div>
                    <div className="text-base font-bold text-white font-mono">
                      {selectedTenant.organization._count?.departments || 0}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-800">
                    <div className="text-slate-400 text-[10px] uppercase">Địa điểm</div>
                    <div className="text-base font-bold text-white font-mono">
                      {selectedTenant.organization._count?.worksites || 0}
                    </div>
                  </div>
                </div>

                {/* Audit Trail */}
                <div>
                  <h4 className="font-semibold text-slate-300 text-xs mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    Lịch sử Audit Trail (Super Admin Actions)
                  </h4>
                  <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-950/60 max-h-40 overflow-y-auto">
                    {selectedTenant.auditLogs.length === 0 ? (
                      <div className="p-3 text-center text-slate-500 text-[11px]">Chưa có ghi nhận audit log nào.</div>
                    ) : (
                      <div className="divide-y divide-slate-800/60 text-[11px]">
                        {selectedTenant.auditLogs.map((log: any) => (
                          <div key={log.id} className="p-2.5 flex items-center justify-between">
                            <div>
                              <span className="font-semibold text-blue-400 font-mono">{log.action}</span>
                              <span className="text-slate-400 ml-2">bởi {log.actorEmail}</span>
                              {log.newValues?.reason && (
                                <div className="text-slate-400 italic text-[10px]">Lý do: {log.newValues.reason}</div>
                              )}
                            </div>
                            <span className="text-slate-500 text-[10px]">
                              {new Date(log.createdAt).toLocaleString('vi-VN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsViewModalOpen(false)}
                className="border-slate-800 bg-slate-800/60 hover:bg-slate-800 text-slate-300"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Action Confirmation Modal ──────────────────────────────────── */}
      {actionTenant && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  actionType === 'APPROVE' || actionType === 'ACTIVATE'
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                    : actionType === 'REJECT' || actionType === 'CLOSE'
                    ? 'bg-rose-500/20 border-rose-500/30 text-rose-400'
                    : 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Xác nhận: {getActionLabel(actionType)}</h3>
                <p className="text-xs text-slate-400">{actionTenant.name}</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <p>
                Bạn đang thực hiện thao tác <span className="font-bold text-white">{actionType}</span> trên tổ chức{' '}
                <span className="font-semibold text-blue-400">{actionTenant.name}</span> (ID: {actionTenant.id}).
              </p>
              {(actionType === 'APPROVE' || actionType === 'ACTIVATE') && (
                <p className="text-indigo-300 text-[11px]">
                  📌 Hạn mức hiện tại: {metrics?.activeQuotaDisplay}. Sau khi duyệt, số tenant hoạt động sẽ tăng lên 1 (tối đa {MAX_TENANTS}).
                </p>
              )}
              <p className="text-slate-400 text-[11px]">
                Hệ thống sẽ tự động ghi vết hành động này vào Audit Trail để phục vụ kiểm toán bảo mật.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Lý do / Ghi chú xử lý (Tùy chọn):
              </label>
              <textarea
                rows={3}
                placeholder="Nhập lý do phê duyệt, từ chối hoặc tạm ngưng..."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionTenant(null);
                  setActionType(null);
                }}
                disabled={isActionSubmitting}
                className="border-slate-800 bg-slate-800/60 hover:bg-slate-800 text-slate-300"
              >
                Hủy bỏ
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmAction}
                disabled={isActionSubmitting}
                className={`font-semibold text-white ${
                  actionType === 'APPROVE' || actionType === 'ACTIVATE'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : actionType === 'REJECT' || actionType === 'CLOSE'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-orange-600 hover:bg-orange-500'
                }`}
              >
                {isActionSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Đang xử lý...
                  </>
                ) : (
                  'Xác nhận'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
