'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyVND } from '@/lib/utils';
import { DepartmentModal } from '@/components/organization/DepartmentModal';
import { DepartmentEmployeesModal } from '@/components/organization/DepartmentEmployeesModal';
import { BranchModal } from '@/components/organization/BranchModal';
import { PositionModal } from '@/components/organization/PositionModal';
import { WorksiteModal } from '@/components/organization/WorksiteModal';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';
import { useToastHelpers } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { 
  Building2, 
  Briefcase, 
  GitBranch,
  Plus, 
  Users, 
  Edit, 
  Trash2, 
  Power, 
  Crown, 
  AlertCircle,
  MapPin,
  Navigation,
  Radio,
  ExternalLink
} from 'lucide-react';

export default function OrganizationPage() {
  const { success: toastSuccess, error: toastError } = useToastHelpers();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'BRANCHES' | 'DEPARTMENTS' | 'POSITIONS' | 'WORKSITES'>('BRANCHES');

  // State data
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [worksites, setWorksites] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Modals state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<any | null>(null);

  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editDept, setEditDept] = useState<any | null>(null);

  const [isPosModalOpen, setIsPosModalOpen] = useState(false);
  const [editPos, setEditPos] = useState<any | null>(null);

  const [isWorksiteModalOpen, setIsWorksiteModalOpen] = useState(false);
  const [editWorksite, setEditWorksite] = useState<any | null>(null);

  const [selectedDeptForEmployees, setSelectedDeptForEmployees] = useState<string | null>(null);
  const [isDeptEmpModalOpen, setIsDeptEmpModalOpen] = useState(false);

  const canMutateBranches =
    currentUser?.roles?.includes('admin') || currentUser?.roles?.includes('hr');
  const canDeleteBranches = currentUser?.roles?.includes('admin');

  // Fetch current user for UI-level RBAC hints
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me');
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.data || null);
      }
    } catch {
      // Server-side authorization remains authoritative.
    }
  }, []);

  // Fetch branches
  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/branches?includeInactive=true');
      const data = await res.json();
      if (data.success) {
        setBranches(data.data || []);
      } else if (res.status !== 403) {
        setErrorMessage(data.error?.message || 'Khong the tai danh sach chi nhanh.');
      }
    } catch {
      setErrorMessage('Khong the tai danh sach chi nhanh.');
    }
  }, []);

  // Fetch departments
  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/departments?includeInactive=true');
      const data = await res.json();
      if (data.success) {
        setDepartments(data.data || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách phòng ban.');
    }
  }, []);

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/positions?includeInactive=true');
      const data = await res.json();
      if (data.success) {
        setPositions(data.data || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách chức vụ.');
    }
  }, []);

  // Fetch worksites
  const fetchWorksites = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/worksites?isActive=ALL&limit=100');
      const data = await res.json();
      if (data.success) {
        setWorksites(data.data || []);
      }
    } catch {
      setErrorMessage('Không thể tải danh sách địa điểm làm việc.');
    }
  }, []);

  // Fetch employees for manager selector
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

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCurrentUser(), fetchBranches(), fetchDepartments(), fetchPositions(), fetchWorksites(), fetchEmployees()]).finally(() => {
      setLoading(false);
    });
  }, [fetchCurrentUser, fetchBranches, fetchDepartments, fetchPositions, fetchWorksites, fetchEmployees]);

  // Handle Toggle Branch Status
  const handleToggleBranchStatus = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/v1/branches/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('That bai', data.error?.message || 'Khong the doi trang thai chi nhanh.');
        return;
      }
      toastSuccess('Thanh cong', 'Da cap nhat trang thai chi nhanh.');
      fetchBranches();
    } catch {
      toastError('Loi ket noi', 'Loi ket noi mang.');
    }
  };

  // Handle Delete Branch
  const handleDeleteBranch = async (branch: any) => {
    const ok = await confirm({
      title: `Xoa chi nhanh [${branch.name}]?`,
      description: `He thong se chan xoa neu chi nhanh con lien ket nhan su, dia diem lam viec hoac cham cong. Ma chi nhanh [${branch.code}] van duoc giu lai sau khi xoa mem.`,
      confirmLabel: 'Xoa chi nhanh',
      cancelLabel: 'Huy',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/branches/${branch.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Xoa that bai', data.error?.message || 'Khong the xoa chi nhanh.');
        return;
      }
      toastSuccess('Da xoa', data.data?.message || 'Da xoa mem chi nhanh thanh cong.');
      fetchBranches();
    } catch {
      toastError('Loi ket noi', 'Loi ket noi mang.');
    }
  };

  // Handle Toggle Department Status
  const handleToggleDeptStatus = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/v1/departments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Thất bại', data.error?.message || 'Không thể đổi trạng thái phòng ban.');
        return;
      }
      toastSuccess('Thành công', 'Đã cập nhật trạng thái phòng ban.');
      fetchDepartments();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi kết nối mạng.');
    }
  };

  // Handle Delete Department
  const handleDeleteDept = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Xóa phòng ban [${name}]?`,
      description: 'Hệ thống sẽ kiểm tra toàn vẹn dữ liệu: Nếu đang có nhân sự hoặc phòng ban con, việc xóa sẽ bị chặn để bảo toàn dữ liệu lịch sử.',
      confirmLabel: 'Xóa phòng ban',
      cancelLabel: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/departments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Xóa thất bại', data.error?.message || 'Không thể xóa phòng ban.');
        return;
      }
      toastSuccess('Đã xóa', data.data?.message || 'Đã xóa phòng ban thành công.');
      fetchDepartments();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi kết nối mạng.');
    }
  };

  // Handle Toggle Position Status
  const handleTogglePosStatus = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/v1/positions/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Thất bại', data.error?.message || 'Không thể đổi trạng thái chức vụ.');
        return;
      }
      toastSuccess('Thành công', 'Đã cập nhật trạng thái chức vụ.');
      fetchPositions();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi kết nối mạng.');
    }
  };

  // Handle Delete Position
  const handleDeletePos = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Xóa chức vụ [${title}]?`,
      description: 'Hệ thống sẽ kiểm tra toàn vẹn dữ liệu: Nếu đang có nhân sự đảm nhiệm, việc xóa sẽ bị chặn để bảo toàn dữ liệu lịch sử hợp đồng.',
      confirmLabel: 'Xóa chức vụ',
      cancelLabel: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/positions/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Xóa thất bại', data.error?.message || 'Không thể xóa chức vụ.');
        return;
      }
      toastSuccess('Đã xóa', data.data?.message || 'Đã xóa chức vụ thành công.');
      fetchPositions();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi kết nối mạng.');
    }
  };

  // Handle Toggle Worksite Status
  const handleToggleWorksiteStatus = async (id: string) => {
    try {
      const worksite = worksites.find((w) => w.id === id);
      if (!worksite) return;

      const res = await fetch(`/api/v1/worksites/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !worksite.isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Thất bại', data.error?.message || 'Không thể đổi trạng thái địa điểm.');
        return;
      }
      toastSuccess('Thành công', 'Đã cập nhật trạng thái địa điểm.');
      fetchWorksites();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi kết nối mạng.');
    }
  };

  // Handle Delete Worksite
  const handleDeleteWorksite = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Xóa địa điểm làm việc [${name}]?`,
      description: 'Hệ thống sẽ kiểm tra: Nếu đang có nhân sự được phân công làm việc tại đây, việc xóa sẽ bị chặn để bảo toàn dữ liệu.',
      confirmLabel: 'Xóa địa điểm',
      cancelLabel: 'Hủy',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/v1/worksites/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError('Xóa thất bại', data.error?.message || 'Không thể xóa địa điểm làm việc.');
        return;
      }
      toastSuccess('Đã xóa', data.data?.message || 'Đã xóa địa điểm làm việc thành công.');
      fetchWorksites();
    } catch {
      toastError('Lỗi kết nối', 'Lỗi kết nối mạng.');
    }
  };

  const handleOpenDeptEmployees = (deptId: string) => {
    setSelectedDeptForEmployees(deptId);
    setIsDeptEmpModalOpen(true);
  };

  return (
    <AppShell>
      <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Building2 className="h-6 w-6" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">
              Cơ Cấu Tổ Chức & Chức Danh (Org Master)
            </h1>
            <Badge variant="outline" className="border-blue-500/30 text-blue-400 font-mono">
              {branches.length} Chi Nhanh • {departments.length} Phòng Ban • {positions.length} Chức Vụ • {worksites.length} Địa Điểm GPS
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Quan ly chi nhanh, sơ đồ tổ chức phòng ban, định biên chức danh và cấu hình địa điểm làm việc chấm công Geofence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === 'BRANCHES' ? (
            canMutateBranches && (
              <Button
                onClick={() => {
                  setEditBranch(null);
                  setIsBranchModalOpen(true);
                }}
                className="gap-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 font-semibold shadow-lg shadow-sky-500/20"
              >
                <Plus className="h-4 w-4" /> Tao Chi Nhanh Moi
              </Button>
            )
          ) : activeTab === 'DEPARTMENTS' ? (
            <Button
              onClick={() => {
                setEditDept(null);
                setIsDeptModalOpen(true);
              }}
              className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold shadow-lg shadow-blue-500/20"
            >
              <Plus className="h-4 w-4" /> Thành Lập Phòng Ban Mới
            </Button>
          ) : activeTab === 'POSITIONS' ? (
            <Button
              onClick={() => {
                setEditPos(null);
                setIsPosModalOpen(true);
              }}
              className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-semibold shadow-lg shadow-emerald-500/20"
            >
              <Plus className="h-4 w-4" /> Thiết Lập Chức Vụ Mới
            </Button>
          ) : (
            <Button
              onClick={() => {
                setEditWorksite(null);
                setIsWorksiteModalOpen(true);
              }}
              className="gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-semibold shadow-lg shadow-cyan-500/20"
            >
              <Plus className="h-4 w-4" /> Thêm Địa Điểm Mới
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('BRANCHES')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'BRANCHES'
              ? 'border-sky-500 text-sky-400 bg-sky-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          <span>Chi Nhanh ({branches.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('DEPARTMENTS')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'DEPARTMENTS'
              ? 'border-blue-500 text-blue-400 bg-blue-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Cơ Cấu Phòng Ban ({departments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('POSITIONS')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'POSITIONS'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Briefcase className="h-4 w-4" />
          <span>Ngạch Bậc & Khung Lương Chức Vụ ({positions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('WORKSITES')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'WORKSITES'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <MapPin className="h-4 w-4" />
          <span>Địa Điểm Chấm Công GPS ({worksites.length})</span>
        </button>
      </div>

      {/* TAB 0: BRANCHES */}
      {activeTab === 'BRANCHES' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-900/30 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4">Ma CN</th>
                  <th className="py-3.5 px-4">Ten Chi Nhanh</th>
                  <th className="py-3.5 px-4">Dia Chi / Lien He</th>
                  <th className="py-3.5 px-4">Nhan Su</th>
                  <th className="py-3.5 px-4">Dia Diem / Cham Cong</th>
                  <th className="py-3.5 px-4">Trang Thai</th>
                  <th className="py-3.5 px-4 text-right">Thao Tac</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      Dang tai danh muc chi nhanh...
                    </td>
                  </tr>
                ) : branches.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        compact
                        icon={GitBranch}
                        title="Chua co chi nhanh"
                        description="Tao chi nhanh dau tien de gan nhan su, dia diem lam viec va cham cong theo pham vi chi nhanh."
                        actionLabel={canMutateBranches ? 'Tao chi nhanh' : undefined}
                        onAction={
                          canMutateBranches
                            ? () => {
                                setEditBranch(null);
                                setIsBranchModalOpen(true);
                              }
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  branches.map((branch) => (
                    <tr key={branch.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-sky-400 text-xs">
                        {branch.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                            <GitBranch className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-white block">{branch.name}</span>
                            <span className="text-[11px] text-slate-500">
                              Ma duy nhat trong to chuc
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="max-w-sm">
                          {branch.address ? (
                            <span className="block truncate text-slate-300" title={branch.address}>
                              {branch.address}
                            </span>
                          ) : (
                            <span className="block text-slate-500 italic">Chua co dia chi</span>
                          )}
                          {branch.phone ? (
                            <span className="block font-mono text-[11px] text-slate-400 mt-0.5">
                              {branch.phone}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant="secondary" className="font-mono">
                          {branch.employeeCount ?? 0} nhan su
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 text-xs text-slate-300">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                            {branch.worksiteCount ?? 0} dia diem
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-indigo-400" />
                            {branch.attendanceCount ?? 0} ban ghi cham cong
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge
                          variant={branch.isActive ? 'success' : 'outline'}
                          className={branch.isActive ? '' : 'border-slate-700 bg-slate-800 text-slate-400'}
                        >
                          {branch.isActive ? 'Hoat dong' : 'Ngung hoat dong'}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {canMutateBranches && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditBranch(branch);
                                  setIsBranchModalOpen(true);
                                }}
                                title="Chinh sua chi nhanh"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-sky-400"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleBranchStatus(branch.id, branch.isActive)}
                                title={branch.isActive ? 'Ngung hoat dong' : 'Kich hoat lai'}
                                className={`h-8 w-8 p-0 ${
                                  branch.isActive ? 'text-slate-400 hover:text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {canDeleteBranches && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteBranch(branch)}
                              title="Xoa mem chi nhanh (Kiem tra tham chieu)"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {!canMutateBranches && !canDeleteBranches && (
                            <span className="text-xs text-slate-500">Chi xem</span>
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
      )}

      {/* TAB 1: DEPARTMENTS */}
      {activeTab === 'DEPARTMENTS' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-900/30 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4">Mã PB</th>
                  <th className="py-3.5 px-4">Tên Phòng Ban</th>
                  <th className="py-3.5 px-4">Trưởng Phòng (Manager)</th>
                  <th className="py-3.5 px-4">Quy Mô Nhân Sự</th>
                  <th className="py-3.5 px-4">Cấp Trực Thuộc</th>
                  <th className="py-3.5 px-4">Trạng Thái</th>
                  <th className="py-3.5 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      Đang tải danh mục phòng ban...
                    </td>
                  </tr>
                ) : departments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                      Chưa có phòng ban nào được thiết lập.
                    </td>
                  </tr>
                ) : (
                  departments.map((dept) => (
                    <tr key={dept.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-400 text-xs">
                        {dept.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div>
                          <span className="font-semibold text-white block">{dept.name}</span>
                          {dept.description && (
                            <span className="text-[11px] text-slate-400 line-clamp-1">{dept.description}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {dept.manager ? (
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[10px] font-bold text-amber-400">
                              <Crown className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <span className="font-medium text-slate-200 block text-xs">
                                {dept.manager.fullName}
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">
                                {dept.manager.employeeCode}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Chưa bổ nhiệm</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleOpenDeptEmployees(dept.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-950 text-xs font-semibold text-blue-400 hover:border-blue-500/40 transition-colors"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>{dept.employeeCount} nhân sự</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        {dept.parentDepartment ? (
                          <span className="text-slate-300 font-medium">
                            {dept.parentDepartment.name}
                          </span>
                        ) : (
                          <span className="text-slate-500">Cấp cao nhất</span>
                        )}
                        {dept.subDeptCount > 0 && (
                          <span className="block text-[10px] text-indigo-400 mt-0.5">
                            +{dept.subDeptCount} phòng ban con
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant={dept.isActive ? 'success' : 'outline'}>
                          {dept.isActive ? 'Hoạt động' : 'Ngưng hoạt động'}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDeptEmployees(dept.id)}
                            title="Xem nhân viên thuộc phòng ban"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditDept(dept);
                              setIsDeptModalOpen(true);
                            }}
                            title="Chỉnh sửa thông tin"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-400"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleDeptStatus(dept.id, dept.isActive)}
                            title={dept.isActive ? 'Ngưng hoạt động' : 'Kích hoạt lại'}
                            className={`h-8 w-8 p-0 ${
                              dept.isActive ? 'text-slate-400 hover:text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDept(dept.id, dept.name)}
                            title="Xóa phòng ban (Kiểm tra toàn vẹn)"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
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

      {/* TAB 2: POSITIONS */}
      {activeTab === 'POSITIONS' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-900/30 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4">Mã Vị Trí</th>
                  <th className="py-3.5 px-4">Tên Chức Danh / Vị Trí</th>
                  <th className="py-3.5 px-4">Khung Lương Vị Trí (Min - Max)</th>
                  <th className="py-3.5 px-4">Mức Chuẩn (Grade)</th>
                  <th className="py-3.5 px-4">Nhân Sự Đảm Nhiệm</th>
                  <th className="py-3.5 px-4">Trạng Thái</th>
                  <th className="py-3.5 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-400">
                      Đang tải danh mục chức vụ...
                    </td>
                  </tr>
                ) : positions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                      Chưa có chức vụ nào được thiết lập.
                    </td>
                  </tr>
                ) : (
                  positions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-xs">
                        {pos.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div>
                          <span className="font-semibold text-white block">{pos.title}</span>
                          {pos.description && (
                            <span className="text-[11px] text-slate-400 line-clamp-1">{pos.description}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                          <span className="text-slate-400">{formatCurrencyVND(pos.minSalary)}</span>
                          <span>—</span>
                          <span className="text-emerald-400">{formatCurrencyVND(pos.maxSalary)}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-amber-400">
                        {formatCurrencyVND(pos.baseSalaryGrade)}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant="secondary" className="font-mono">
                          {pos.employeeCount} nhân sự
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant={pos.isActive ? 'success' : 'outline'}>
                          {pos.isActive ? 'Đang tuyển/bố trí' : 'Ngưng tuyển'}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditPos(pos);
                              setIsPosModalOpen(true);
                            }}
                            title="Chỉnh sửa chức vụ"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-400"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleTogglePosStatus(pos.id, pos.isActive)}
                            title={pos.isActive ? 'Ngưng hoạt động' : 'Kích hoạt lại'}
                            className={`h-8 w-8 p-0 ${
                              pos.isActive ? 'text-slate-400 hover:text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePos(pos.id, pos.title)}
                            title="Xóa chức vụ (Kiểm tra toàn vẹn)"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
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

      {/* TAB 3: WORKSITES */}
      {activeTab === 'WORKSITES' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-900/30 backdrop-blur-md shadow-xl">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4">Tên Địa Điểm</th>
                  <th className="py-3.5 px-4">Địa Chỉ Chi Tiết</th>
                  <th className="py-3.5 px-4">Tọa Độ GPS (WGS84)</th>
                  <th className="py-3.5 px-4">Bán Kính Geofence</th>
                  <th className="py-3.5 px-4">Nhân Sự Gán</th>
                  <th className="py-3.5 px-4">Trạng Thái</th>
                  <th className="py-3.5 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {worksites.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-500">
                      Chưa có địa điểm làm việc nào được thiết lập. Hãy thêm địa điểm đầu tiên để kích hoạt chấm công GPS.
                    </td>
                  </tr>
                ) : (
                  worksites.map((ws) => (
                    <tr key={ws.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-white">{ws.name}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-300 max-w-xs truncate" title={ws.address}>
                        {ws.address}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs text-cyan-300">
                          <span>
                            {ws.latitude.toFixed(4)}, {ws.longitude.toFixed(4)}
                          </span>
                          <a
                            href={`https://maps.google.com/?q=${ws.latitude},${ws.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-500 hover:text-cyan-400 p-0.5"
                            title="Xem trên Google Maps"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 bg-cyan-500/10 font-mono text-xs">
                          {ws.radiusMeters} mét
                        </Badge>
                      </td>

                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          {ws.activeEmployeeCount ?? 0} người
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={
                            ws.isActive
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border-slate-700 bg-slate-800 text-slate-400'
                          }
                        >
                          {ws.isActive ? 'Đang Hoạt Động' : 'Tạm Ngưng'}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditWorksite(ws);
                              setIsWorksiteModalOpen(true);
                            }}
                            title="Chỉnh sửa địa điểm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleWorksiteStatus(ws.id)}
                            title={ws.isActive ? 'Ngưng hoạt động' : 'Kích hoạt lại'}
                            className={`h-8 w-8 p-0 ${
                              ws.isActive ? 'text-emerald-400 hover:text-amber-400' : 'text-slate-500 hover:text-emerald-400'
                            }`}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteWorksite(ws.id, ws.name)}
                            title="Xóa địa điểm (Kiểm tra toàn vẹn)"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400"
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

      {/* Modals */}
      <BranchModal
        isOpen={isBranchModalOpen}
        onClose={() => setIsBranchModalOpen(false)}
        onSuccess={() => fetchBranches()}
        initialData={editBranch}
      />

      <DepartmentModal
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        onSuccess={() => fetchDepartments()}
        initialData={editDept}
        departments={departments}
        employees={employees}
      />

      <DepartmentEmployeesModal
        departmentId={selectedDeptForEmployees}
        isOpen={isDeptEmpModalOpen}
        onClose={() => setIsDeptEmpModalOpen(false)}
      />

      <PositionModal
        isOpen={isPosModalOpen}
        onClose={() => setIsPosModalOpen(false)}
        onSuccess={() => fetchPositions()}
        initialData={editPos}
      />

      <WorksiteModal
        isOpen={isWorksiteModalOpen}
        onClose={() => setIsWorksiteModalOpen(false)}
        onSuccess={() => fetchWorksites()}
        initialData={editWorksite}
      />
      </div>
    </AppShell>
  );
}
