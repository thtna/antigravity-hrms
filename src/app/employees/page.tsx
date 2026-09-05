'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmployeeTable } from '@/components/employee/EmployeeTable';
import { EmployeeDetailModal } from '@/components/employee/EmployeeDetailModal';
import { EmployeeFormModal } from '@/components/employee/EmployeeFormModal';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';
import { useToastHelpers } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function EmployeesPage() {
  const { success, error: toastError } = useToastHelpers();
  const confirm = useConfirm();

  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Pagination states
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Metadata for filters & form
  const [meta, setMeta] = useState<{
    departments: { id: string; code: string; name: string }[];
    positions: { id: string; code: string; title: string; baseSalaryGrade: number }[];
    worksites: { id: string; name: string }[];
  }>({ departments: [], positions: [], worksites: [] });

  // Modal states
  const [viewEmployee, setViewEmployee] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Fetch organization metadata once
  useEffect(() => {
    fetch('/api/v1/organization/meta')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setMeta(json.data);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch employees with filters & pagination
  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (selectedDept) params.set('departmentId', selectedDept);
      if (selectedPosition) params.set('positionId', selectedPosition);
      if (selectedStatus && selectedStatus !== 'ALL') params.set('status', selectedStatus);

      const res = await fetch(`/api/v1/employees?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể tải danh sách nhân viên.');
        setLoading(false);
        return;
      }

      setEmployees(data.data || []);
      if (data.meta) {
        setTotalPages(data.meta.totalPages || 1);
        setTotalCount(data.meta.total || 0);
      }
    } catch {
      setErrorMessage('Lỗi kết nối máy chủ khi tải danh sách nhân viên.');
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchTerm, selectedDept, selectedPosition, selectedStatus]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Handle Search Input with Enter / debounce
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmployees();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedDept('');
    setSelectedPosition('');
    setSelectedStatus('ALL');
    setPage(1);
  };

  const handleOpenDetail = (emp: any) => {
    setViewEmployee(emp);
    setIsDetailOpen(true);
  };

  const handleOpenCreate = () => {
    setEditEmployee(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (emp: any) => {
    setEditEmployee(emp);
    setIsFormOpen(true);
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const isTerminated = currentStatus === 'TERMINATED';
    const nextStatus = isTerminated ? 'ACTIVE' : 'TERMINATED';

    const ok = await confirm({
      title: isTerminated ? 'Kích hoạt lại nhân viên?' : 'Đình chỉ nhân viên?',
      description: isTerminated
        ? 'Tài khoản hệ thống sẽ được mở khóa ngay lập tức.'
        : 'Tài khoản hệ thống sẽ bị khóa ngay lập tức. Nhân viên không thể đăng nhập.',
      confirmLabel: isTerminated ? 'Kích hoạt' : 'Đình chỉ',
      cancelLabel: 'Hủy',
      variant: isTerminated ? 'default' : 'warning',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/employees/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Cập nhật thất bại', data.error?.message || 'Không thể cập nhật trạng thái.');
        return;
      }
      success(isTerminated ? 'Đã kích hoạt lại' : 'Đã đình chỉ nhân viên');
      fetchEmployees();
    } catch {
      toastError('Lỗi kết nối', 'Không thể kết nối máy chủ.');
    }
  };

  const handleSoftDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Xoá mềm nhân viên [${name}]?`,
      description:
        'Hồ sơ sẽ được chuyển vào kho lưu trữ. Toàn bộ lịch sử chấm công, phép năm và dữ liệu lương sẽ được bảo toàn 100%.',
      confirmLabel: 'Xoá mềm',
      cancelLabel: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/employees/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Xoá thất bại', data.error?.message || 'Không thể xoá mềm nhân viên.');
        return;
      }
      success('Đã xoá mềm nhân viên', 'Hồ sơ đã được lưu trữ an toàn.');
      fetchEmployees();
    } catch {
      toastError('Lỗi kết nối', 'Không thể kết nối máy chủ.');
    }
  };

  return (
    <AppShell>
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Users className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
              Quản Trị Hồ Sơ Nhân Sự
            </h1>
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 font-mono">
              {totalCount} Nhân Sự
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quản lý thông tin định danh, hợp đồng lao động, mức lương, phụ cấp và hồ sơ tài liệu đính kèm.
          </p>
        </div>

        <Button
          onClick={handleOpenCreate}
          className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold shadow-lg shadow-blue-500/20 shrink-0"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Tiếp Nhận Nhân Sự Mới
        </Button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <ErrorBanner
          description={errorMessage}
          onRetry={fetchEmployees}
        />
      )}

      {/* Control Bar: Search & Filters */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Tìm theo mã NV, họ tên, email hoặc số điện thoại..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Department Filter */}
          <div className="w-full md:w-52">
            <select
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Tất cả phòng ban</option>
              {meta.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full md:w-44">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang làm việc</option>
              <option value="PROBATION">Thử việc</option>
              <option value="ON_LEAVE">Nghỉ phép</option>
              <option value="TERMINATED">Đã nghỉ việc</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" className="gap-1.5 h-10 bg-slate-800 text-slate-200">
              <Filter className="h-4 w-4" /> Lọc
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetFilters}
              title="Đặt lại bộ lọc"
              className="h-10 px-3 border-slate-800 text-slate-400 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* Main Table Component */}
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : employees.length === 0 ? (
        <EmptyState
          icon="users"
          title="Chưa có nhân sự nào"
          description="Hệ thống chưa có hồ sơ nhân sự nào phù hợp với bộ lọc hiện tại."
          actionLabel="Tiếp nhận nhân sự mới"
          onAction={handleOpenCreate}
        />
      ) : (
        <EmployeeTable
          employees={employees}
          loading={false}
          onView={handleOpenDetail}
          onEdit={handleOpenEdit}
          onToggleStatus={handleToggleStatus}
          onSoftDelete={handleSoftDelete}
        />
      )}

      {/* Pagination Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-slate-800/60 bg-slate-900/20 px-4 py-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Hiển thị</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none"
          >
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
          <span>trên tổng số <strong className="text-white font-mono">{totalCount}</strong> nhân sự</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono">
            Trang <strong className="text-white">{page}</strong> / {totalPages}
          </span>
          <div className="inline-flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 p-0 border-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 p-0 border-slate-800 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EmployeeDetailModal
        employee={viewEmployee}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onEdit={handleOpenEdit}
      />

      <EmployeeFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => {
          fetchEmployees();
        }}
        initialData={editEmployee}
        meta={meta}
      />
    </div>
    </AppShell>
  );
}
