'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Clock,
  AlertTriangle,
  LogOut,
  Flame,
  Calendar,
  Award,
  Gift,
  ShieldAlert,
  DollarSign,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building,
  User,
  ShieldCheck,
  CheckCircle2,
  Download,
  Loader2,
} from 'lucide-react';
import { ReportType, ReportResult, ReportColumn } from '@/lib/services/report.service';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastHelpers } from '@/components/ui/toast';

interface DepartmentMeta {
  id: string;
  code: string;
  name: string;
}

interface EmployeeMeta {
  id: string;
  employeeCode: string;
  fullName: string;
  departmentId: string | null;
}

const REPORT_TABS: Array<{
  id: ReportType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = [
  { id: 'attendance', label: 'Điểm Danh & Công', icon: Clock, color: 'text-blue-400' },
  { id: 'late', label: 'Đi Muộn', icon: AlertTriangle, color: 'text-amber-400' },
  { id: 'early_leave', label: 'Về Sớm', icon: LogOut, color: 'text-orange-400' },
  { id: 'overtime', label: 'Làm Thêm (OT)', icon: Flame, color: 'text-rose-400' },
  { id: 'leave', label: 'Nghỉ Phép', icon: Calendar, color: 'text-indigo-400' },
  { id: 'kpi', label: 'Đánh Giá KPI', icon: Award, color: 'text-purple-400' },
  { id: 'bonus', label: 'Khen Thưởng', icon: Gift, color: 'text-emerald-400' },
  { id: 'penalty', label: 'Kỷ Luật & Phạt', icon: ShieldAlert, color: 'text-red-400' },
  { id: 'payroll', label: 'Bảng Lương Tổng Hợp', icon: DollarSign, color: 'text-teal-400' },
];

export function ReportsClient() {
  const { error: toastError, success: toastSuccess } = useToastHelpers();
  const [selectedType, setSelectedType] = useState<ReportType>('attendance');

  // Filters state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);

  // Data & Metadata
  const [departments, setDepartments] = useState<DepartmentMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeMeta[]>([]);
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Metadata (Departments & Employees)
  useEffect(() => {
    async function loadMeta() {
      try {
        const res = await fetch('/api/v1/reports/meta');
        const json = await res.json();
        if (json.success && json.data) {
          setDepartments(json.data.departments || []);
          setEmployees(json.data.employees || []);
        }
      } catch (err) {
        console.error('Lỗi tải danh mục phòng ban/nhân viên:', err);
      }
    }
    loadMeta();
  }, []);

  // 2. Fetch Report Data
  const fetchReport = useCallback(
    async (targetPage = page) => {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          type: selectedType,
          page: targetPage.toString(),
          limit: limit.toString(),
        });

        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (departmentId) params.set('departmentId', departmentId);
        if (employeeId) params.set('employeeId', employeeId);
        if (status) params.set('status', status);
        if (search) params.set('search', search.trim());
        if (sortBy) {
          params.set('sortBy', sortBy);
          params.set('sortOrder', sortOrder);
        }

        const res = await fetch(`/api/v1/reports?${params.toString()}`);
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || 'Không thể tải báo cáo');
        }

        setReportResult(json.data);
        setPage(targetPage);
      } catch (err: any) {
        setError(err.message || 'Đã có lỗi xảy ra khi truy vấn báo cáo');
      } finally {
        setLoading(false);
      }
    },
    [selectedType, startDate, endDate, departmentId, employeeId, status, search, sortBy, sortOrder, limit, page]
  );

  // Trigger report fetch when filters change (reset page to 1 when changing type or filters)
  useEffect(() => {
    setPage(1);
    fetchReport(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, departmentId, employeeId, status, limit]);

  // Handle Sort Toggle
  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('desc');
    }
  };

  // Preset Date Range Helpers
  const handleDatePreset = (preset: 'today' | 'this_week' | 'this_month' | 'last_month') => {
    const now = new Date();
    const toDateString = (d: Date) => d.toISOString().slice(0, 10);

    if (preset === 'today') {
      const todayStr = toDateString(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'this_week') {
      const start = new Date(now);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      setStartDate(toDateString(start));
      setEndDate(toDateString(now));
    } else if (preset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toDateString(start));
      setEndDate(toDateString(now));
    } else if (preset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(toDateString(start));
      setEndDate(toDateString(end));
    }
  };

  // Handle File Download (Excel / PDF)
  const handleExport = async (format: 'excel' | 'pdf') => {
    try {
      if (format === 'excel') setExportingExcel(true);
      else setExportingPdf(true);

      const params = new URLSearchParams({
        type: selectedType,
        format,
        limit: '10000', // Load comprehensive data for export
      });

      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (departmentId) params.set('departmentId', departmentId);
      if (employeeId) params.set('employeeId', employeeId);
      if (status) params.set('status', status);
      if (search) params.set('search', search.trim());
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortOrder);
      }

      const res = await fetch(`/api/v1/reports/export?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message || `Lỗi xuất báo cáo ${format.toUpperCase()}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      a.download = `BaoCao_${selectedType.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toastSuccess('Xuất tệp', 'Bắt đầu tải xuống tệp báo cáo.');
    } catch (err: any) {
      toastError('Lỗi xuất tệp', err.message || 'Không thể tải tệp xuất.');
    } finally {
      if (format === 'excel') setExportingExcel(false);
      else setExportingPdf(false);
    }
  };

  // Quick Login Handler for Unauthenticated Users
  const handleQuickLogin = async (email: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Antigravity@2026' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Đăng nhập thất bại.');
      }
      // Re-fetch report
      await fetchReport(1);
    } catch (err: any) {
      setError(err.message || 'Lỗi đăng nhập');
    } finally {
      setLoading(false);
    }
  };

  const isAuthError =
    error &&
    (error.toLowerCase().includes('đăng nhập') ||
      error.toLowerCase().includes('xác thực') ||
      error.toLowerCase().includes('unauthorized'));

  if (isAuthError) {
    return (
      <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-900/90 p-8 text-center space-y-6 backdrop-blur-md shadow-2xl">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-inner">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-0.5 text-xs font-semibold text-blue-400">
            YÊU CẦU XÁC THỰC TÀI KHOẢN
          </div>
          <h3 className="text-2xl font-bold tracking-tight text-white">
            Hệ Thống Báo Cáo Antigravity HRMS Enterprise
          </h3>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Hệ thống báo cáo yêu cầu đăng nhập theo vai trò để đảm bảo phân quyền dữ liệu. Bạn có thể chọn đăng nhập nhanh 1-click với các tài khoản mẫu bên dưới:
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto pt-2">
          <div
            onClick={() => handleQuickLogin('admin@antigravity.internal')}
            className="group relative flex flex-col items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-center hover:border-blue-500/60 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-blue-500/10"
          >
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                Toàn Quyền Doanh Nghiệp
              </span>
              <h4 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                Admin / HR Quản Trị
              </h4>
              <p className="text-xs text-slate-400">admin@antigravity.internal</p>
            </div>
            <Button size="sm" className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs">
              Vào Với Vai Trò Admin
            </Button>
          </div>

          <div
            onClick={() => handleQuickLogin('manager.tech@antigravity.internal')}
            className="group relative flex flex-col items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-center hover:border-indigo-500/60 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-indigo-500/10"
          >
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300">
                Quản Lý Bộ Phận
              </span>
              <h4 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">
                Manager Kỹ Thuật
              </h4>
              <p className="text-xs text-slate-400">manager.tech@antigravity.internal</p>
            </div>
            <Button size="sm" className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs">
              Vào Với Vai Trò Manager
            </Button>
          </div>

          <div
            onClick={() => handleQuickLogin('dev.an@antigravity.internal')}
            className="group relative flex flex-col items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-center hover:border-emerald-500/60 hover:bg-slate-900/90 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-emerald-500/10"
          >
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                Cá Nhân
              </span>
              <h4 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                Nhân Viên Lập Trình
              </h4>
              <p className="text-xs text-slate-400">dev.an@antigravity.internal</p>
            </div>
            <Button size="sm" className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs">
              Vào Với Vai Trò Employee
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render Status Badge
  const renderBadge = (value: any) => {
    const s = String(value || '').toUpperCase();
    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';

    if (['PRESENT', 'APPROVED', 'PAID', 'EXCELLENT', 'HOAN_THANH', 'CO_MAT'].includes(s)) {
      colorClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    } else if (['LATE', 'EARLY_LEAVE', 'PENDING', 'GOOD', 'CHO_DUYET'].includes(s)) {
      colorClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    } else if (['ABSENT', 'REJECTED', 'PENALTY', 'CRITICAL', 'TU_CHOI', 'VI_PHAM'].includes(s)) {
      colorClass = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    } else if (['OVERTIME', 'BONUS', 'DRAFT'].includes(s)) {
      colorClass = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${colorClass}`}>
        {value}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP BAR: REPORT TABS (9 REPORT TYPES)                             */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-2 backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = selectedType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedType(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-white' : tab.color}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 2. FILTER & ACTION BAR                                                */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-md shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-bold text-white uppercase tracking-wider">
              Bộ Lọc Dữ Liệu
            </span>
            <div className="flex items-center gap-1 ml-3">
              <button
                onClick={() => handleDatePreset('today')}
                className="px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Hôm nay
              </button>
              <button
                onClick={() => handleDatePreset('this_week')}
                className="px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Tuần này
              </button>
              <button
                onClick={() => handleDatePreset('this_month')}
                className="px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Tháng này
              </button>
              <button
                onClick={() => handleDatePreset('last_month')}
                className="px-2 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Tháng trước
              </button>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleExport('excel')}
              disabled={exportingExcel || loading}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              {exportingExcel ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              <span>Xuất Excel (.xlsx)</span>
            </Button>

            <Button
              onClick={() => handleExport('pdf')}
              disabled={exportingPdf || loading}
              size="sm"
              className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
            >
              {exportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              <span>Xuất PDF (.pdf)</span>
            </Button>

            <Button
              onClick={() => fetchReport(page)}
              disabled={loading}
              variant="outline"
              size="sm"
              className="border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </Button>
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          {/* Date Start */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Từ Ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Date End */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Đến Ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Department */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Phòng Ban</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Employee */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Nhân Viên</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">Tất cả nhân viên</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Trạng Thái</label>
            <input
              type="text"
              placeholder="VD: APPROVED, PENDING..."
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Search Query */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-400">Tìm Kiếm</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tên, mã, ghi chú..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchReport(1)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 3. SUMMARY METRICS CARDS                                             */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      {reportResult && reportResult.summaries && reportResult.summaries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {reportResult.summaries.map((sum, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-sm shadow-md"
            >
              <div className="text-[11px] font-medium text-slate-400">{sum.label}</div>
              <div className="text-lg font-bold text-white mt-1">
                {typeof sum.value === 'number'
                  ? sum.type === 'currency'
                    ? `${sum.value.toLocaleString('vi-VN')} đ`
                    : sum.value.toLocaleString('vi-VN')
                  : sum.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────────── */}
      {/* 4. MAIN DATA TABLE                                                   */}
      {/* ───────────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md shadow-xl overflow-hidden">
        {/* Table Header / Title */}
        <div className="border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">
              {reportResult?.title || 'Báo Cáo Nghiệp Vụ'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {reportResult?.description || 'Dữ liệu được trích xuất trực tiếp từ cơ sở dữ liệu PostgreSQL'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Hiển thị:</span>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none"
            >
              <option value="10">10 dòng</option>
              <option value="20">20 dòng</option>
              <option value="50">50 dòng</option>
              <option value="100">100 dòng</option>
            </select>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80">
                {reportResult?.columns.map((col) => {
                  const isSorted = sortBy === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-4 py-3 font-semibold text-slate-300 cursor-pointer hover:bg-slate-800/50 transition-colors ${
                        col.align === 'right' || col.type === 'currency' || col.type === 'number'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      <div
                        className={`inline-flex items-center gap-1.5 ${
                          col.align === 'right' || col.type === 'currency' || col.type === 'number'
                            ? 'justify-end'
                            : col.align === 'center'
                            ? 'justify-center'
                            : 'justify-start'
                        }`}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-blue-400" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-blue-400" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-600 opacity-60" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td
                    colSpan={reportResult?.columns.length || 6}
                    className="p-4"
                  >
                    <SkeletonTable rows={5} cols={reportResult?.columns.length || 6} />
                  </td>
                </tr>
              ) : !reportResult?.rows || reportResult.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={reportResult?.columns.length || 6}
                    className="p-4"
                  >
                    <EmptyState
                      icon="chart"
                      title="Không tìm thấy bản ghi nào phù hợp"
                      description="Thử điều chỉnh khoảng ngày, bộ lọc phòng ban hoặc từ khóa tìm kiếm."
                    />
                  </td>
                </tr>
              ) : (
                reportResult.rows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    {reportResult.columns.map((col) => {
                      const val = row[col.key];
                      const align =
                        col.align ||
                        (col.type === 'currency' || col.type === 'number'
                          ? 'right'
                          : col.type === 'badge' || col.type === 'date' || col.type === 'time'
                          ? 'center'
                          : 'left');

                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-2.5 text-slate-200 whitespace-nowrap ${
                            align === 'right'
                              ? 'text-right'
                              : align === 'center'
                              ? 'text-center'
                              : 'text-left'
                          }`}
                        >
                          {col.type === 'badge' ? (
                            renderBadge(val)
                          ) : col.type === 'currency' && typeof val === 'number' ? (
                            <span className="font-semibold text-emerald-400">
                              {val.toLocaleString('vi-VN')} đ
                            </span>
                          ) : col.type === 'number' && typeof val === 'number' ? (
                            <span>{val.toLocaleString('vi-VN')}</span>
                          ) : (
                            <span>{val !== null && val !== undefined ? String(val) : '-'}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ───────────────────────────────────────────────────────────────── */}
        {/* 5. PAGINATION BAR                                                 */}
        {/* ───────────────────────────────────────────────────────────────── */}
        {reportResult && reportResult.meta && (
          <div className="border-t border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div>
              Trang <span className="font-semibold text-white">{reportResult.meta.page}</span> /{' '}
              <span className="font-semibold text-white">{Math.max(1, reportResult.meta.totalPages)}</span>{' '}
              — Tổng cộng <span className="font-semibold text-blue-400">{reportResult.meta.total}</span> bản ghi
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={reportResult.meta.page <= 1 || loading}
                onClick={() => fetchReport(reportResult.meta.page - 1)}
                className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-7 px-2.5"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Trước
              </Button>

              <span className="px-2 text-xs font-semibold text-white">
                {reportResult.meta.page}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={
                  reportResult.meta.page >= reportResult.meta.totalPages || loading
                }
                onClick={() => fetchReport(reportResult.meta.page + 1)}
                className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs h-7 px-2.5"
              >
                Sau
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
