'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrencyVND, formatDateVN } from '@/lib/utils';
import { 
  Eye, 
  Edit, 
  UserX, 
  UserCheck, 
  Mail, 
  Phone, 
  Briefcase, 
  Building2, 
  Clock,
  DollarSign,
  Trash2
} from 'lucide-react';

interface EmployeeTableProps {
  employees: any[];
  loading: boolean;
  onView: (employee: any) => void;
  onEdit: (employee: any) => void;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onSoftDelete?: (id: string, name: string) => void;
}

export function EmployeeTable({
  employees,
  loading,
  onView,
  onEdit,
  onToggleStatus,
  onSoftDelete,
}: EmployeeTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Đang làm việc</Badge>;
      case 'PROBATION':
        return <Badge variant="warning">Thử việc</Badge>;
      case 'ON_LEAVE':
        return <Badge variant="default">Nghỉ phép</Badge>;
      case 'TERMINATED':
        return <Badge variant="destructive">Đã nghỉ việc</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="w-full space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-16 w-full animate-pulse rounded-xl border border-slate-800 bg-slate-900/40"
          />
        ))}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80 text-slate-400 mb-3">
          <Briefcase className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-white">Không tìm thấy nhân viên nào</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Thử thay đổi từ khóa tìm kiếm hoặc bỏ chọn bộ lọc phòng ban, trạng thái để hiển thị kết quả.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-900/30 backdrop-blur-md shadow-xl">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <tr>
            <th scope="col" className="py-3.5 px-4">Nhân viên</th>
            <th scope="col" className="py-3.5 px-4">Liên hệ</th>
            <th scope="col" className="py-3.5 px-4">Phòng ban & Chức vụ</th>
            <th scope="col" className="py-3.5 px-4">Lương & Giờ công</th>
            <th scope="col" className="py-3.5 px-4">Hợp đồng</th>
            <th scope="col" className="py-3.5 px-4">Trạng thái</th>
            <th scope="col" className="py-3.5 px-4 text-right">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {employees.map((emp) => {
            const isTerminated = emp.status === 'TERMINATED';

            return (
              <tr
                key={emp.id}
                className="hover:bg-slate-800/30 transition-colors group"
              >
                {/* 1. Avatar + Name + Code */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 rounded-full border border-blue-500/20 bg-slate-800 overflow-hidden flex items-center justify-center font-bold text-xs text-blue-400">
                      {emp.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={emp.avatarUrl}
                          alt={emp.fullName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>
                          {emp.lastName?.[0]}
                          {emp.firstName?.[0]}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-white block group-hover:text-blue-400 transition-colors">
                        {emp.fullName}
                      </span>
                      <span className="font-mono text-xs text-slate-400 font-medium">
                        {emp.employeeCode}
                      </span>
                    </div>
                  </div>
                </td>

                {/* 2. Contact */}
                <td className="py-3.5 px-4">
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Mail className="h-3 w-3 text-slate-500 shrink-0" />
                      <span className="truncate max-w-[160px]">{emp.user?.email || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Phone className="h-3 w-3 text-slate-500 shrink-0" />
                      <span>{emp.phoneNumber}</span>
                    </div>
                  </div>
                </td>

                {/* 3. Department & Position */}
                <td className="py-3.5 px-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-200 font-medium">
                      <Building2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>{emp.department?.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Briefcase className="h-3 w-3 text-slate-500 shrink-0" />
                      <span>{emp.position?.title}</span>
                    </div>
                  </div>
                </td>

                {/* 4. Compensation */}
                <td className="py-3.5 px-4">
                  <div className="space-y-0.5 font-mono text-xs">
                    <div className="font-semibold text-amber-400 flex items-center gap-1">
                      <DollarSign className="h-3 w-3 text-amber-500" />
                      <span>{formatCurrencyVND(emp.contractSalary)}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-500" />
                      <span>{formatCurrencyVND(emp.hourlyRate)}/h</span>
                    </div>
                  </div>
                </td>

                {/* 5. Contract & Hire Date */}
                <td className="py-3.5 px-4 text-xs">
                  <span className="text-slate-300 block font-medium">
                    {emp.contractType === 'PROBATION'
                      ? 'Thử việc'
                      : emp.contractType === 'FIXED_TERM'
                      ? 'Xác định thời hạn'
                      : 'Vô thời hạn'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Vào làm: {formatDateVN(emp.hireDate)}
                  </span>
                </td>

                {/* 6. Status */}
                <td className="py-3.5 px-4">
                  {getStatusBadge(emp.status)}
                </td>

                {/* 7. Actions */}
                <td className="py-3.5 px-4 text-right">
                  <div className="inline-flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onView(emp)}
                      title="Xem chi tiết hồ sơ"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-blue-400 hover:bg-slate-800"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(emp)}
                      title="Chỉnh sửa thông tin"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleStatus(emp.id, emp.status)}
                      title={isTerminated ? 'Kích hoạt lại nhân viên' : 'Đình chỉ / Vô hiệu hóa'}
                      className={`h-8 w-8 p-0 ${
                        isTerminated
                          ? 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                          : 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/10'
                      }`}
                    >
                      {isTerminated ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                    </Button>
                    {onSoftDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSoftDelete(emp.id, emp.fullName)}
                        title="Xoá mềm / Lưu trữ hồ sơ (Bảo toàn lịch sử chấm công & tính lương)"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
