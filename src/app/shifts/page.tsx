'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShiftModal } from '@/components/shifts/ShiftModal';
import { ScheduleModal } from '@/components/shifts/ScheduleModal';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';
import { useToastHelpers } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Clock,
  Calendar,
  Plus,
  Edit,
  Trash2,
  Power,
  Moon,
  Sun,
  Repeat,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

// Pure date helpers computed outside render
function getInitialDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

const initialDates = getInitialDates();

export default function ShiftsPage() {
  const { success: toastSuccess, error: toastError } = useToastHelpers();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'SHIFTS' | 'SCHEDULES' | 'RECURRING'>('SHIFTS');

  // Shifts state
  const [shifts, setShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(true);

  // Schedules state
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);

  // Filters for schedules
  const [filterStartDate, setFilterStartDate] = useState(initialDates.startDate);
  const [filterEndDate, setFilterEndDate] = useState(initialDates.endDate);
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterEmpId, setFilterEmpId] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Organization meta for selectors
  const [departments, setDepartments] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);

  // Recurring patterns state
  const [selectedEmpForRecurring, setSelectedEmpForRecurring] = useState('');
  const [recurringPatterns, setRecurringPatterns] = useState<any[]>([]);
  const [loadingRecurring, setLoadingRecurring] = useState(false);

  // Modals state
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [editShift, setEditShift] = useState<any | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Messages
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchShifts = useCallback(async () => {
    setLoadingShifts(true);
    try {
      const res = await fetch('/api/v1/shifts?includeInactive=true');
      const data = await res.json();
      if (data.success) {
        setShifts(data.data || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách ca làm việc.');
    } finally {
      setLoadingShifts(false);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    try {
      const params = new URLSearchParams();
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      if (filterDeptId) params.set('departmentId', filterDeptId);
      if (filterEmpId) params.set('employeeId', filterEmpId);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/api/v1/schedules?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setSchedules(data.data || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách lịch làm việc.');
    } finally {
      setLoadingSchedules(false);
    }
  }, [filterStartDate, filterEndDate, filterDeptId, filterEmpId, filterStatus]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/employees?limit=100');
      const data = await res.json();
      if (data.success) {
        setEmployees(data.data || []);
      }
    } catch {
      // optional
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/departments');
      const data = await res.json();
      if (data.success) {
        setDepartments(data.data || []);
      }
    } catch {
      // optional
    }
  }, []);

  const fetchRecurringPatterns = useCallback(async (empId: string) => {
    if (!empId) {
      setRecurringPatterns([]);
      return;
    }
    setLoadingRecurring(true);
    try {
      const res = await fetch(`/api/v1/schedules/recurring?employeeId=${empId}`);
      const data = await res.json();
      if (data.success) {
        setRecurringPatterns(data.data || []);
      }
    } catch {
      setErrorMessage('Không thể tải lịch lặp tuần của nhân viên.');
    } finally {
      setLoadingRecurring(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
    fetchDepartments();
  }, [fetchShifts, fetchEmployees, fetchDepartments]);

  useEffect(() => {
    if (activeTab === 'SCHEDULES') {
      fetchSchedules();
    }
  }, [activeTab, fetchSchedules]);

  useEffect(() => {
    if (activeTab === 'RECURRING' && selectedEmpForRecurring) {
      fetchRecurringPatterns(selectedEmpForRecurring);
    }
  }, [activeTab, selectedEmpForRecurring, fetchRecurringPatterns]);

  // Actions on shifts
  const handleToggleShiftStatus = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/v1/shifts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Thất bại', data.error?.message || 'Không thể đổi trạng thái ca làm việc.');
        return;
      }
      toastSuccess('Thành công', 'Đã cập nhật trạng thái ca làm việc.');
      fetchShifts();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi mạng khi đổi trạng thái ca.');
    }
  };

  const handleDeleteShift = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Xóa ca làm việc [${name}]?`,
      description: 'Lưu ý: Nếu ca này đã được phân bổ trong lịch làm việc, hệ thống sẽ bảo toàn tính toàn vẹn và ngăn chặn xóa.',
      confirmLabel: 'Xóa ca làm việc',
      cancelLabel: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/shifts/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Thất bại', data.error?.message || 'Không thể xóa ca làm việc.');
        return;
      }
      toastSuccess('Thành công', `Đã xóa ca làm việc [${name}] thành công.`);
      fetchShifts();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi mạng khi xóa ca làm việc.');
    }
  };

  const dayOfWeekNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
              <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              PHASE 5 — WORK SHIFT & SCHEDULE ENGINE
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Quản Lý Ca Làm Việc & Lịch Phân Ca
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Hỗ trợ ca cố định, ca linh hoạt, tính toán ca đêm qua ngày chính xác và phân ca nhân viên
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
                setEditShift(null);
                setIsShiftModalOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow-lg shadow-blue-500/20"
            >
              <Plus className="h-4 w-4" />
              Tạo Ca Làm Việc
            </Button>
            <Button
              onClick={() => setIsScheduleModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
            >
              <Calendar className="h-4 w-4" />
              Phân Ca Làm Việc
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
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-slate-800 gap-4">
          <button
            onClick={() => setActiveTab('SHIFTS')}
            className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'SHIFTS'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-4 w-4" />
            Danh Mục Ca Làm Việc ({shifts.length})
          </button>
          <button
            onClick={() => setActiveTab('SCHEDULES')}
            className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'SCHEDULES'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="h-4 w-4" />
            Lịch Làm Việc Nhân Viên ({schedules.length})
          </button>
          <button
            onClick={() => setActiveTab('RECURRING')}
            className={`pb-3 px-2 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'RECURRING'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="h-4 w-4" />
            Lịch Lặp Tuần Định Kỳ
          </button>
        </div>

        {/* ── TAB 1: SHIFTS LIST ── */}
        {activeTab === 'SHIFTS' && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/80 text-xs font-semibold uppercase text-slate-400">
                  <tr>
                    <th className="px-5 py-3.5">Mã & Tên Ca</th>
                    <th className="px-5 py-3.5">Loại Ca</th>
                    <th className="px-5 py-3.5">Khung Giờ</th>
                    <th className="px-5 py-3.5">Nghỉ Giữa Ca</th>
                    <th className="px-5 py-3.5">Giờ Công Chuẩn</th>
                    <th className="px-5 py-3.5">Hiệu Lực</th>
                    <th className="px-5 py-3.5">Trạng Thái</th>
                    <th className="px-5 py-3.5 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {loadingShifts ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Đang tải dữ liệu ca làm việc...
                      </td>
                    </tr>
                  ) : shifts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Chưa có ca làm việc nào. Hãy tạo ca đầu tiên!
                      </td>
                    </tr>
                  ) : (
                    shifts.map((shift) => (
                      <tr key={shift.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="font-semibold text-white">{shift.name}</div>
                          <div className="text-xs text-blue-400 font-mono">[{shift.code}]</div>
                          {shift.description && (
                            <div className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{shift.description}</div>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant="outline" className={shift.shiftType === 'FIXED' ? 'border-blue-500/30 text-blue-300' : 'border-purple-500/30 text-purple-300'}>
                            {shift.shiftType}
                          </Badge>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 font-medium text-white">
                            <span>{shift.startTime} - {shift.endTime}</span>
                            {shift.isOvernight ? (
                              <span title="Ca đêm xuyên ngày" className="inline-flex items-center gap-0.5 text-[11px] text-purple-400 font-normal">
                                <Moon className="h-3.5 w-3.5" /> +1
                              </span>
                            ) : (
                              <Sun className="h-3.5 w-3.5 text-amber-400" />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Ân hạn: muộn {shift.gracePeriodLate}p / sớm {shift.gracePeriodEarly}p
                          </div>
                        </td>
                        <td className="px-5 py-4 text-slate-300">
                          {shift.breakMinutes} phút
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-semibold text-emerald-400">{shift.standardWorkHours}h</span>
                          <div className="text-[11px] text-slate-500">{shift.totalAssignedSchedules || 0} lịch gán</div>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-300">
                          <div>Từ: {shift.effectiveFrom}</div>
                          {shift.effectiveTo && <div>Đến: {shift.effectiveTo}</div>}
                        </td>
                        <td className="px-5 py-4">
                          {shift.isActive ? (
                            <Badge variant="success">Hoạt động</Badge>
                          ) : (
                            <Badge variant="destructive">Ngưng dùng</Badge>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditShift(shift);
                                setIsShiftModalOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                              title="Sửa ca làm việc"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleShiftStatus(shift.id, shift.isActive)}
                              className={`h-8 w-8 p-0 ${shift.isActive ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                              title={shift.isActive ? 'Ngưng hoạt động ca' : 'Kích hoạt ca'}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteShift(shift.id, shift.name)}
                              className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                              title="Xóa ca làm việc (kiểm tra toàn vẹn lịch sử)"
                            >
                              <Trash2 className="h-4 w-4" />
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
        )}

        {/* ── TAB 2: EMPLOYEE SCHEDULES ── */}
        {activeTab === 'SCHEDULES' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Từ ngày</label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Đến ngày</label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Phòng ban</label>
                <select
                  value={filterDeptId}
                  onChange={(e) => setFilterDeptId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">-- Tất cả phòng ban --</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nhân viên</label>
                <select
                  value={filterEmpId}
                  onChange={(e) => setFilterEmpId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">-- Tất cả nhân viên --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      [{emp.employeeCode || emp.code}] {emp.fullName || `${emp.lastName} ${emp.firstName}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Trạng thái lịch</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="SCHEDULED">SCHEDULED (Đã xếp ca)</option>
                  <option value="COMPLETED">COMPLETED (Đã hoàn thành)</option>
                  <option value="ABSENT">ABSENT (Vắng mặt)</option>
                  <option value="LEAVE">LEAVE (Nghỉ phép)</option>
                </select>
              </div>
            </div>

            {/* Schedule Table */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="border-b border-slate-800 bg-slate-950/80 text-xs font-semibold uppercase text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">Ngày Làm Việc</th>
                      <th className="px-5 py-3.5">Nhân Viên</th>
                      <th className="px-5 py-3.5">Phòng Ban</th>
                      <th className="px-5 py-3.5">Ca Làm Việc</th>
                      <th className="px-5 py-3.5">Khung Giờ</th>
                      <th className="px-5 py-3.5">Loại Lịch</th>
                      <th className="px-5 py-3.5">Trạng Thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loadingSchedules ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Đang tải dữ liệu phân ca...
                        </td>
                      </tr>
                    ) : schedules.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Không tìm thấy lịch làm việc nào khớp với bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      schedules.map((item) => {
                        const dateObj = new Date(item.workDate);
                        const dayName = dayOfWeekNames[dateObj.getDay()];
                        return (
                          <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-5 py-4">
                              <div className="font-semibold text-white">{item.workDate}</div>
                              <div className="text-xs text-indigo-400 font-medium">{dayName}</div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="font-medium text-white">
                                {item.employee?.fullName || `${item.employee?.lastName || ''} ${item.employee?.firstName || ''}`}
                              </div>
                              <div className="text-xs text-slate-400 font-mono">[{item.employee?.employeeCode || item.employee?.code}]</div>
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-300">
                              {item.employee?.department?.name || '—'}
                            </td>
                            <td className="px-5 py-4">
                              <div className="font-semibold text-white">{item.shift?.name}</div>
                              <div className="text-xs text-blue-400 font-mono">[{item.shift?.code}]</div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1 text-xs text-white">
                                <span>{item.shift?.startTime} - {item.shift?.endTime}</span>
                                {item.shift?.isOvernight && (
                                  <span title="Ca đêm" className="text-purple-400">🌙</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400">{item.shift?.standardWorkHours}h công</div>
                            </td>
                            <td className="px-5 py-4">
                              {item.isTemporary ? (
                                <div>
                                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                                    Tạm thời
                                  </Badge>
                                  {item.overrideReason && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">{item.overrideReason}</div>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="border-slate-700 text-slate-400">
                                  Tiêu chuẩn
                                </Badge>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {item.status === 'SCHEDULED' && <Badge variant="outline" className="border-blue-500/40 text-blue-300">Đã xếp ca</Badge>}
                              {item.status === 'COMPLETED' && <Badge variant="success">Hoàn thành</Badge>}
                              {item.status === 'ABSENT' && <Badge variant="destructive">Vắng mặt</Badge>}
                              {item.status === 'LEAVE' && <Badge variant="outline" className="border-purple-500/40 text-purple-300">Nghỉ phép</Badge>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: RECURRING SCHEDULE ── */}
        {activeTab === 'RECURRING' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Chọn Nhân Viên Để Xem Lịch Lặp Tuần
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedEmpForRecurring}
                  onChange={(e) => setSelectedEmpForRecurring(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">-- Chọn nhân viên để xem mẫu lịch định kỳ --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      [{emp.employeeCode || emp.code}] {emp.fullName || `${emp.lastName} ${emp.firstName}`}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => setIsScheduleModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Thêm Mẫu Lịch Tuần Mới
                </Button>
              </div>
            </div>

            {selectedEmpForRecurring && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-emerald-400" />
                  Mẫu Lịch Phân Ca Theo Tuần Hiện Tại
                </h3>

                {loadingRecurring ? (
                  <div className="text-center py-6 text-slate-500">Đang tải lịch lặp...</div>
                ) : recurringPatterns.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-950/40 rounded-lg border border-slate-800/80">
                    Nhân viên này chưa được thiết lập mẫu lịch lặp tuần nào.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-3">
                    {dayOfWeekNames.map((dayName, idx) => {
                      const pattern = recurringPatterns.find((p) => p.dayOfWeek === idx);
                      return (
                        <div
                          key={idx}
                          className={`rounded-xl border p-4 flex flex-col justify-between min-h-[140px] transition-colors ${
                            pattern
                              ? 'border-emerald-500/40 bg-emerald-500/5'
                              : 'border-slate-800 bg-slate-950/30'
                          }`}
                        >
                          <div>
                            <span className="text-xs font-bold text-slate-300 block">{dayName}</span>
                            {pattern ? (
                              <div className="mt-2 space-y-1">
                                <div className="text-xs font-semibold text-white">{pattern.shift?.name}</div>
                                <div className="text-[11px] text-emerald-400 font-mono">[{pattern.shift?.code}]</div>
                                <div className="text-[11px] text-slate-300">
                                  {pattern.shift?.startTime} - {pattern.shift?.endTime}
                                  {pattern.shift?.isOvernight && ' 🌙'}
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-slate-500 mt-3 italic">Nghỉ tuần</div>
                            )}
                          </div>

                          {pattern && (
                            <div className="text-[10px] text-slate-500 border-t border-slate-800/60 pt-2 mt-2">
                              Từ: {pattern.effectiveFrom}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Modal: Create/Edit Shift */}
        <ShiftModal
          isOpen={isShiftModalOpen}
          onClose={() => {
            setIsShiftModalOpen(false);
            setEditShift(null);
          }}
          onSuccess={() => {
            fetchShifts();
            setSuccessMessage(editShift ? 'Cập nhật ca làm việc thành công.' : 'Tạo ca làm việc mới thành công.');
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
          initialData={editShift}
        />

        {/* Modal: Assign Schedules */}
        <ScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          onSuccess={() => {
            fetchSchedules();
            if (selectedEmpForRecurring) fetchRecurringPatterns(selectedEmpForRecurring);
            setSuccessMessage('Phân ca làm việc thành công!');
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
          shifts={shifts}
          employees={employees}
        />
      </div>
    </AppShell>
  );
}
