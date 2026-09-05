'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AttendanceWidget } from '@/components/attendance/AttendanceWidget';
import { AttendanceDetailModal } from '@/components/attendance/AttendanceDetailModal';
import { ManualAttendanceModal } from '@/components/attendance/ManualAttendanceModal';
import { QrScannerModal } from '@/components/attendance/QrScannerModal';
import { GpsAttendanceModal } from '@/components/attendance/GpsAttendanceModal';
import { CorrectionRequestModal } from '@/components/attendance/CorrectionRequestModal';
import { CorrectionProcessModal } from '@/components/attendance/CorrectionProcessModal';
import { CorrectionAuditTrailModal } from '@/components/attendance/CorrectionAuditTrailModal';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToastHelpers } from '@/components/ui/toast';
import {
  Clock,
  Calendar,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Eye,
  TrendingUp,
  QrCode,
  Sparkles,
  Navigation,
  FileEdit,
  History,
  ShieldCheck,
  Check,
  XCircle,
  ExternalLink,
  Filter,
} from 'lucide-react';

// Pure date helper computed outside render
function getAttendanceDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1); // first day of current month
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of current month
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

const defaultDates = getAttendanceDefaultDates();

export default function AttendancePage() {
  const confirm = useConfirm();
  const toast = useToastHelpers();
  const [activeTab, setActiveTab] = useState<'MY_ATTENDANCE' | 'HR_MONITOR' | 'CORRECTIONS'>(
    'MY_ATTENDANCE'
  );

  // Filters for HR Dashboard & History
  const [filterStartDate, setFilterStartDate] = useState(defaultDates.startDate);
  const [filterEndDate, setFilterEndDate] = useState(defaultDates.endDate);
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterEmpId, setFilterEmpId] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Filters for Corrections
  const [filterCorrectionStatus, setFilterCorrectionStatus] = useState('ALL');
  const [filterCorrectionType, setFilterCorrectionType] = useState('ALL');

  // Data lists
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [correctionRecords, setCorrectionRecords] = useState<any[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadingCorrections, setLoadingCorrections] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  // Modals
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isGpsModalOpen, setIsGpsModalOpen] = useState(false);

  // Modals for Phase 9 Corrections
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionModalProps, setCorrectionModalProps] = useState<{
    initialAttendanceId?: string;
    initialWorkDate?: string;
    initialCorrectionType?: any;
  }>({});
  const [isProcessModalOpen, setIsProcessModalOpen] = useState(false);
  const [selectedCorrectionForProcess, setSelectedCorrectionForProcess] = useState<any | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedAdjustmentIdForAudit, setSelectedAdjustmentIdForAudit] = useState('');

  // Messages
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch current user
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me');
      const data = await res.json();
      if (data.success) setCurrentUser(data.data);
    } catch {}
  }, []);

  // Fetch meta (departments, employees, shifts)
  const fetchMeta = useCallback(async () => {
    try {
      const [deptRes, empRes, shiftRes] = await Promise.all([
        fetch('/api/v1/departments'),
        fetch('/api/v1/employees?limit=200'),
        fetch('/api/v1/shifts'),
      ]);
      const [deptData, empData, shiftData] = await Promise.all([
        deptRes.json(),
        empRes.json(),
        shiftRes.json(),
      ]);
      if (deptData.success) setDepartments(deptData.data || []);
      if (empData.success) setEmployees(empData.data || []);
      if (shiftData.success) setShifts(shiftData.data || []);
    } catch {
      // optional
    }
  }, []);

  // Fetch Attendance Records
  const fetchAttendanceRecords = useCallback(async () => {
    setLoadingRecords(true);
    setErrorMessage('');
    try {
      const params = new URLSearchParams();
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      if (filterDeptId) params.set('departmentId', filterDeptId);
      if (filterEmpId) params.set('employeeId', filterEmpId);
      if (filterStatus) params.set('status', filterStatus);
      params.set('limit', '100');

      const res = await fetch(`/api/v1/attendance?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setAttendanceRecords(data.data || []);
      } else {
        setErrorMessage(data.error?.message || 'Không thể tải lịch sử chấm công.');
      }
    } catch {
      setErrorMessage('Lỗi mạng khi tải dữ liệu chấm công.');
    } finally {
      setLoadingRecords(false);
    }
  }, [filterStartDate, filterEndDate, filterDeptId, filterEmpId, filterStatus]);

  // Fetch Corrections
  const fetchCorrections = useCallback(async () => {
    setLoadingCorrections(true);
    try {
      const params = new URLSearchParams();
      if (filterCorrectionStatus && filterCorrectionStatus !== 'ALL') {
        params.set('status', filterCorrectionStatus);
      }
      if (filterCorrectionType && filterCorrectionType !== 'ALL') {
        params.set('correctionType', filterCorrectionType);
      }
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      params.set('limit', '100');

      const res = await fetch(`/api/v1/attendance/corrections?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setCorrectionRecords(data.data || []);
      }
    } catch {
      // optional
    } finally {
      setLoadingCorrections(false);
    }
  }, [filterCorrectionStatus, filterCorrectionType, filterStartDate, filterEndDate]);

  useEffect(() => {
    fetchCurrentUser();
    fetchMeta();
    fetchAttendanceRecords();
  }, [fetchCurrentUser, fetchMeta, fetchAttendanceRecords]);

  useEffect(() => {
    if (activeTab === 'CORRECTIONS') {
      fetchCorrections();
    }
  }, [activeTab, fetchCorrections]);

  // Cancel correction handler
  const handleCancelCorrection = async (id: string) => {
    const ok = await confirm({
      title: 'Hủy yêu cầu giải trình',
      description: 'Bạn có chắc muốn hủy yêu cầu giải trình chấm công này không?',
      confirmLabel: 'Hủy yêu cầu',
      cancelLabel: 'Đóng',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/v1/attendance/corrections/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Nhân viên tự hủy từ giao diện' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Đã hủy yêu cầu giải trình thành công!');
        setSuccessMessage('Đã hủy yêu cầu thành công!');
        fetchCorrections();
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        const msg = data.error?.message || 'Không thể hủy yêu cầu.';
        toast.error(msg);
        setErrorMessage(msg);
      }
    } catch {
      toast.error('Lỗi kết nối khi hủy yêu cầu.');
      setErrorMessage('Lỗi kết nối khi hủy yêu cầu.');
    }
  };

  // Status badge renderer
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'ON_TIME':
        return <Badge variant="success">Đúng giờ</Badge>;
      case 'LATE':
        return <Badge variant="destructive">Đi muộn</Badge>;
      case 'EARLY_LEAVE':
        return (
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">
            Về sớm
          </Badge>
        );
      case 'LATE_AND_EARLY':
        return <Badge variant="destructive">Muộn & Sớm</Badge>;
      case 'OVERTIME':
        return (
          <Badge variant="outline" className="border-purple-500/40 text-purple-300">
            Tăng ca (OT)
          </Badge>
        );
      case 'IN_PROGRESS':
        return (
          <Badge variant="outline" className="border-blue-500/40 text-blue-300 animate-pulse">
            Đang làm
          </Badge>
        );
      case 'ABSENT':
        return <Badge variant="destructive">Vắng mặt</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Correction Status Badge
  const renderCorrectionStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse flex items-center gap-1 w-fit">
            <Clock className="w-3 h-3" /> Chờ duyệt
          </span>
        );
      case 'APPROVED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
            <Check className="w-3 h-3" /> Đã duyệt
          </span>
        );
      case 'REJECTED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" /> Từ chối
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-fit">
            Đã hủy
          </span>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderCorrectionTypeBadge = (type: string) => {
    const map: Record<string, { label: string; color: string }> = {
      FORGOT_CHECKIN: { label: 'Quên Check-in', color: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
      FORGOT_CHECKOUT: { label: 'Quên Check-out', color: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' },
      LATE_JUSTIFICATION: { label: 'Giải trình Đi muộn', color: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
      EARLY_LEAVE_JUSTIFICATION: { label: 'Giải trình Về sớm', color: 'bg-orange-500/10 text-orange-300 border-orange-500/30' },
      FULL_CORRECTION: { label: 'Điều chỉnh Ca', color: 'bg-purple-500/10 text-purple-300 border-purple-500/30' },
      OVERTIME_REQUEST: { label: 'Đề xuất Tăng ca (OT)', color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
      MISSING_ATTENDANCE: { label: 'Công tác / Thiếu công', color: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
    };
    const c = map[type] || { label: type, color: 'bg-slate-800 text-slate-300 border-slate-700' };
    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${c.color}`}>
        {c.label}
      </span>
    );
  };

  const isPrivileged =
    currentUser?.roles?.includes('admin') ||
    currentUser?.roles?.includes('hr') ||
    currentUser?.roles?.includes('manager');

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              PHASE 9 — ATTENDANCE CORRECTION & EXCEPTIONS
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Hệ Thống Chấm Công & Quản Lý Giờ Làm
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Chấm công đa phương thức (Web, QR, GPS), giải trình đi muộn/về sớm, quên bấm công, đề xuất tăng ca & quy trình phê duyệt bất biến
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/">
              <Button variant="outline" className="border-slate-700 bg-slate-900/80 text-slate-300">
                Về Trang Chủ
              </Button>
            </Link>
            <Button
              onClick={() => {
                setCorrectionModalProps({});
                setIsCorrectionModalOpen(true);
              }}
              className="bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <FileEdit className="h-4 w-4" />
              Yêu Cầu Điều Chỉnh
            </Button>
            <Link href="/attendance/qr-kiosk">
              <Button
                variant="outline"
                className="border-purple-500/40 bg-purple-950/40 text-purple-300 hover:bg-purple-900/50 flex items-center gap-1.5"
              >
                <Sparkles className="h-4 w-4 text-purple-400" />
                Kiosk QR Sảnh
              </Button>
            </Link>
            <Button
              onClick={() => setIsGpsModalOpen(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
            >
              <Navigation className="h-4 w-4" />
              Chấm Công GPS
            </Button>
            <Button
              onClick={() => setIsQrScannerOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
            >
              <QrCode className="h-4 w-4" />
              Quét QR Chấm Công
            </Button>
            <Button
              onClick={() => setIsManualModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
            >
              <PlusCircle className="h-4 w-4" />
              Bù Công (HR)
            </Button>
          </div>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <ErrorBanner
            description={errorMessage}
            onRetry={() => {
              fetchAttendanceRecords();
              fetchCorrections();
            }}
          />
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('MY_ATTENDANCE')}
            className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'MY_ATTENDANCE'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="h-4 w-4" />
            Chấm Công Của Tôi
          </button>
          <button
            onClick={() => setActiveTab('HR_MONITOR')}
            className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'HR_MONITOR'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            Giám Sát Chấm Công (HR / Quản Lý)
          </button>
          <button
            onClick={() => setActiveTab('CORRECTIONS')}
            className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'CORRECTIONS'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileEdit className="h-4 w-4" />
            Yêu Cầu & Duyệt Bù Công
            {correctionRecords.filter((r) => r.status === 'PENDING').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {correctionRecords.filter((r) => r.status === 'PENDING').length}
              </span>
            )}
          </button>
        </div>

        {/* ── TAB 1: MY ATTENDANCE ── */}
        {activeTab === 'MY_ATTENDANCE' && (
          <div className="space-y-6">
            <AttendanceWidget
              onAttendanceChanged={() => {
                fetchAttendanceRecords();
              }}
            />

            {/* Attendance Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                <div className="flex items-center gap-2 font-semibold text-slate-200 text-sm">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  Bảng Chấm Công Cá Nhân
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3">Ngày</th>
                      <th className="px-5 py-3">Ca làm việc</th>
                      <th className="px-5 py-3">Giờ vào</th>
                      <th className="px-5 py-3">Giờ ra</th>
                      <th className="px-5 py-3">Công (h)</th>
                      <th className="px-5 py-3">Tăng ca</th>
                      <th className="px-5 py-3">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadingRecords ? (
                      <tr>
                        <td colSpan={8} className="p-4">
                          <SkeletonTable rows={4} cols={8} />
                        </td>
                      </tr>
                    ) : attendanceRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          Chưa có dữ liệu chấm công cho khoảng thời gian này.
                        </td>
                      </tr>
                    ) : (
                      attendanceRecords.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-5 py-3.5 font-medium text-slate-200">
                            {item.workDate}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-xs text-slate-200">
                              {item.schedule?.shift?.name || 'Ca mặc định'}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs">
                            <div className="flex items-center gap-1">
                              <span>
                                {item.checkInTime
                                  ? new Date(item.checkInTime).toLocaleTimeString('vi-VN')
                                  : '—'}
                              </span>
                              {item.checkInMethod && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                                  {item.checkInMethod}
                                </span>
                              )}
                            </div>
                            {item.lateMinutes > 0 && (
                              <span className="text-red-400 block text-[10px]">
                                Muộn {item.lateMinutes}p
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs">
                            <div className="flex items-center gap-1">
                              <span>
                                {item.checkOutTime
                                  ? new Date(item.checkOutTime).toLocaleTimeString('vi-VN')
                                  : '—'}
                              </span>
                              {item.checkOutMethod && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                                  {item.checkOutMethod}
                                </span>
                              )}
                            </div>
                            {item.earlyMinutes > 0 && (
                              <span className="text-amber-400 block text-[10px]">
                                Sớm {item.earlyMinutes}p
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-emerald-400 font-mono">
                            {item.actualWorkHours}h
                          </td>
                          <td className="px-5 py-3.5 font-mono text-xs">
                            {item.otHours > 0 ? (
                              <span className="text-purple-400 font-bold">+{item.otHours}h</span>
                            ) : (
                              <span className="text-slate-500">0h</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">{renderStatusBadge(item.status)}</td>
                          <td className="px-5 py-3.5 text-right flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCorrectionModalProps({
                                  initialAttendanceId: item.id,
                                  initialWorkDate: item.workDate,
                                  initialCorrectionType:
                                    item.lateMinutes > 0
                                      ? 'LATE_JUSTIFICATION'
                                      : item.earlyMinutes > 0
                                      ? 'EARLY_LEAVE_JUSTIFICATION'
                                      : !item.checkOutTime
                                      ? 'FORGOT_CHECKOUT'
                                      : 'FULL_CORRECTION',
                                });
                                setIsCorrectionModalOpen(true);
                              }}
                              className="h-8 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 flex items-center gap-1"
                              title="Tạo yêu cầu giải trình / sửa công"
                            >
                              <FileEdit className="h-3.5 w-3.5" />
                              <span>Sửa công</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRecord(item);
                                setIsDetailModalOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                              title="Xem chi tiết"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: HR MONITOR ── */}
        {activeTab === 'HR_MONITOR' && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-md">
              <div className="border-b border-slate-800 px-6 py-4">
                <h3 className="font-semibold text-slate-200 text-sm">
                  Lịch Sử Chấm Công Toàn Cơ Quan
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3">Nhân viên</th>
                      <th className="px-5 py-3">Ngày</th>
                      <th className="px-5 py-3">Giờ vào</th>
                      <th className="px-5 py-3">Giờ ra</th>
                      <th className="px-5 py-3">Công (h)</th>
                      <th className="px-5 py-3">Tăng ca</th>
                      <th className="px-5 py-3">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadingRecords ? (
                      <tr>
                        <td colSpan={8} className="p-4">
                          <SkeletonTable rows={4} cols={8} />
                        </td>
                      </tr>
                    ) : attendanceRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500">
                          Không tìm thấy bản ghi chấm công.
                        </td>
                      </tr>
                    ) : (
                      attendanceRecords.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-5 py-4 font-medium text-slate-200">
                            <div>
                              {item.employee?.firstName} {item.employee?.lastName}
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.employee?.employeeCode}
                            </div>
                          </td>
                          <td className="px-5 py-4">{item.workDate}</td>
                          <td className="px-5 py-4 font-mono text-xs">
                            {item.checkInTime
                              ? new Date(item.checkInTime).toLocaleTimeString('vi-VN')
                              : '—'}
                          </td>
                          <td className="px-5 py-4 font-mono text-xs">
                            {item.checkOutTime
                              ? new Date(item.checkOutTime).toLocaleTimeString('vi-VN')
                              : '—'}
                          </td>
                          <td className="px-5 py-4 font-semibold text-emerald-400 font-mono">
                            {item.actualWorkHours}h
                          </td>
                          <td className="px-5 py-4 font-mono text-xs">
                            {item.otHours > 0 ? (
                              <span className="text-purple-400 font-bold">+{item.otHours}h</span>
                            ) : (
                              <span className="text-slate-500">0h</span>
                            )}
                          </td>
                          <td className="px-5 py-4">{renderStatusBadge(item.status)}</td>
                          <td className="px-5 py-4 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedRecord(item);
                                setIsDetailModalOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: CORRECTIONS & EXCEPTIONS (PHASE 9) ── */}
        {activeTab === 'CORRECTIONS' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  <span>Trạng thái:</span>
                </div>
                <select
                  value={filterCorrectionStatus}
                  onChange={(e) => setFilterCorrectionStatus(e.target.value)}
                  className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="PENDING">Chờ duyệt (PENDING)</option>
                  <option value="APPROVED">Đã duyệt (APPROVED)</option>
                  <option value="REJECTED">Từ chối (REJECTED)</option>
                  <option value="CANCELLED">Đã hủy (CANCELLED)</option>
                </select>

                <div className="flex items-center gap-1.5 text-xs text-slate-400 ml-2">
                  <span>Loại yêu cầu:</span>
                </div>
                <select
                  value={filterCorrectionType}
                  onChange={(e) => setFilterCorrectionType(e.target.value)}
                  className="bg-slate-950/80 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">Tất cả loại yêu cầu</option>
                  <option value="FORGOT_CHECKIN">Quên check-in</option>
                  <option value="FORGOT_CHECKOUT">Quên check-out</option>
                  <option value="LATE_JUSTIFICATION">Giải trình đi muộn</option>
                  <option value="EARLY_LEAVE_JUSTIFICATION">Giải trình về sớm</option>
                  <option value="FULL_CORRECTION">Điều chỉnh ca làm</option>
                  <option value="OVERTIME_REQUEST">Đề xuất tăng ca (OT)</option>
                  <option value="MISSING_ATTENDANCE">Công tác / Thiếu công</option>
                </select>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  setCorrectionModalProps({});
                  setIsCorrectionModalOpen(true);
                }}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs flex items-center gap-1.5"
              >
                <FileEdit className="w-3.5 h-3.5" />
                Tạo Yêu Cầu Mới
              </Button>
            </div>

            {/* Corrections Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                <div className="flex items-center gap-2 font-semibold text-slate-200 text-sm">
                  <FileEdit className="h-4 w-4 text-amber-400" />
                  Danh Sách Yêu Cầu Điều Chỉnh & Phê Duyệt Chấm Công
                </div>
                <span className="text-xs text-slate-400">
                  Tổng số: {correctionRecords.length} yêu cầu
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/40 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-5 py-3">Nhân viên</th>
                      <th className="px-5 py-3">Ngày làm việc</th>
                      <th className="px-5 py-3">Loại điều chỉnh</th>
                      <th className="px-5 py-3">Chi tiết đề xuất</th>
                      <th className="px-5 py-3">Lý do</th>
                      <th className="px-5 py-3">Trạng thái</th>
                      <th className="px-5 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadingCorrections ? (
                      <tr>
                        <td colSpan={7} className="p-4">
                          <SkeletonTable rows={4} cols={7} />
                        </td>
                      </tr>
                    ) : correctionRecords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          Chưa có yêu cầu điều chỉnh nào trong hệ thống.
                        </td>
                      </tr>
                    ) : (
                      correctionRecords.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-5 py-4 font-medium text-slate-200">
                            <div>
                              {item.employee?.firstName} {item.employee?.lastName}
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.employee?.employeeCode} •{' '}
                              {item.employee?.department?.name || 'Chưa xếp phòng'}
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono text-xs">{item.workDate}</td>
                          <td className="px-5 py-4">
                            {renderCorrectionTypeBadge(item.correctionType)}
                          </td>
                          <td className="px-5 py-4 text-xs">
                            <div className="space-y-0.5">
                              {item.requestedCheckIn && (
                                <div className="text-slate-300">
                                  Vào: <span className="font-mono text-amber-300">{new Date(item.requestedCheckIn).toLocaleTimeString('vi-VN')}</span>
                                </div>
                              )}
                              {item.requestedCheckOut && (
                                <div className="text-slate-300">
                                  Ra: <span className="font-mono text-amber-300">{new Date(item.requestedCheckOut).toLocaleTimeString('vi-VN')}</span>
                                </div>
                              )}
                              {item.overtimeMinutes && (
                                <div className="text-emerald-400 font-semibold">
                                  OT: +{item.overtimeMinutes}p ({(item.overtimeMinutes / 60).toFixed(1)}h)
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-xs max-w-xs">
                            <p className="truncate text-slate-300" title={item.reason}>
                              {item.reason}
                            </p>
                            {item.evidenceUrl && (
                              <a
                                href={item.evidenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                              >
                                <ExternalLink className="w-3 h-3" /> Minh chứng
                              </a>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {renderCorrectionStatusBadge(item.status)}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Process button for Manager/HR/Admin */}
                              {item.status === 'PENDING' && isPrivileged && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedCorrectionForProcess(item);
                                    setIsProcessModalOpen(true);
                                  }}
                                  className="h-7 px-2.5 text-xs bg-amber-600 hover:bg-amber-500 text-white"
                                >
                                  Xét Duyệt
                                </Button>
                              )}

                              {/* Cancel button if pending */}
                              {item.status === 'PENDING' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCancelCorrection(item.id)}
                                  className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                  title="Hủy yêu cầu"
                                >
                                  Hủy
                                </Button>
                              )}

                              {/* Audit trail button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedAdjustmentIdForAudit(item.id);
                                  setIsAuditModalOpen(true);
                                }}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                                title="Xem nhật ký kiểm toán (Audit Trail)"
                              >
                                <History className="w-4 h-4" />
                              </Button>
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
        )}

        {/* Modal: View Record Detail */}
        <AttendanceDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedRecord(null);
          }}
          record={selectedRecord}
        />

        {/* Modal: Manual Attendance Entry (HR) */}
        <ManualAttendanceModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          onSuccess={() => {
            fetchAttendanceRecords();
            setSuccessMessage('Đã tạo bản ghi chấm công thủ công thành công!');
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
          employees={employees}
          shifts={shifts}
        />

        {/* Modal: QR Scanner */}
        <QrScannerModal
          isOpen={isQrScannerOpen}
          onClose={() => setIsQrScannerOpen(false)}
          onSuccess={() => {
            fetchAttendanceRecords();
            setSuccessMessage('Chấm công bằng mã QR thành công!');
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
        />

        {/* Modal: GPS Attendance */}
        <GpsAttendanceModal
          isOpen={isGpsModalOpen}
          onClose={() => setIsGpsModalOpen(false)}
          onSuccess={() => {
            fetchAttendanceRecords();
            setSuccessMessage('Chấm công GPS thành công trong vùng Geofence!');
            setTimeout(() => setSuccessMessage(''), 4000);
          }}
        />

        {/* Phase 9 Modals */}
        <CorrectionRequestModal
          isOpen={isCorrectionModalOpen}
          onClose={() => setIsCorrectionModalOpen(false)}
          onSuccess={() => {
            fetchCorrections();
            fetchAttendanceRecords();
            setSuccessMessage('Đã gửi yêu cầu điều chỉnh chấm công thành công!');
            setTimeout(() => setSuccessMessage(''), 4000);
          }}
          initialAttendanceId={correctionModalProps.initialAttendanceId}
          initialWorkDate={correctionModalProps.initialWorkDate}
          initialCorrectionType={correctionModalProps.initialCorrectionType}
        />

        <CorrectionProcessModal
          isOpen={isProcessModalOpen}
          onClose={() => {
            setIsProcessModalOpen(false);
            setSelectedCorrectionForProcess(null);
          }}
          onSuccess={() => {
            fetchCorrections();
            fetchAttendanceRecords();
            setSuccessMessage('Đã xử lý yêu cầu điều chỉnh chấm công thành công!');
            setTimeout(() => setSuccessMessage(''), 4000);
          }}
          correction={selectedCorrectionForProcess}
        />

        <CorrectionAuditTrailModal
          isOpen={isAuditModalOpen}
          onClose={() => {
            setIsAuditModalOpen(false);
            setSelectedAdjustmentIdForAudit('');
          }}
          adjustmentId={selectedAdjustmentIdForAudit}
        />
      </div>
    </AppShell>
  );
}
