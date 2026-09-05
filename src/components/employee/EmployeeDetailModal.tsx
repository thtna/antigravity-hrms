'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrencyVND, formatDateVN } from '@/lib/utils';
import { 
  X, 
  Mail, 
  Phone, 
  Building2, 
  Calendar, 
  DollarSign, 
  CreditCard, 
  FileText, 
  Shield, 
  Download
} from 'lucide-react';

interface EmployeeDetailModalProps {
  employee: any | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (employee: any) => void;
}

export function EmployeeDetailModal({
  employee,
  isOpen,
  onClose,
  onEdit,
}: EmployeeDetailModalProps) {
  if (!isOpen || !employee) return null;

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

  const documents = Array.isArray(employee.documents) ? employee.documents : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden border-slate-800 bg-slate-900 shadow-2xl flex flex-col">
        {/* Header with Avatar & Status */}
        <div className="relative bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/40 p-6 border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-center gap-5">
            {/* Avatar */}
            <div className="relative h-20 w-20 rounded-full border-2 border-blue-500/30 bg-slate-800 overflow-hidden flex items-center justify-center text-2xl font-bold text-blue-400 shrink-0 shadow-lg">
              {employee.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={employee.avatarUrl}
                  alt={employee.fullName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>
                  {employee.lastName?.[0]}
                  {employee.firstName?.[0]}
                </span>
              )}
            </div>

            <div className="text-center sm:text-left space-y-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  {employee.fullName}
                </h2>
                <Badge variant="outline" className="font-mono text-blue-400 border-blue-500/30">
                  {employee.employeeCode}
                </Badge>
                {getStatusBadge(employee.status)}
              </div>
              <p className="text-sm text-slate-400 flex items-center justify-center sm:justify-start gap-2">
                <span>{employee.position?.title || 'Chưa gán chức vụ'}</span>
                <span>•</span>
                <span>{employee.department?.name || 'Chưa gán phòng ban'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-6 text-sm">
          {/* Section 1: Thông tin liên hệ & Pháp lý */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" /> Thông Tin Cá Nhân & Liên Hệ
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                <div>
                  <span className="text-xs text-slate-500 block">Email hệ thống</span>
                  <span className="font-medium text-slate-200">{employee.user?.email || 'N/A'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-slate-500 shrink-0" />
                <div>
                  <span className="text-xs text-slate-500 block">Số điện thoại</span>
                  <span className="font-medium text-slate-200">{employee.phoneNumber || 'N/A'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
                <div>
                  <span className="text-xs text-slate-500 block">Ngày sinh</span>
                  <span className="font-medium text-slate-200">{formatDateVN(employee.dob) || 'N/A'}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CreditCard className="h-4 w-4 text-slate-500 shrink-0" />
                <div>
                  <span className="text-xs text-slate-500 block">Số CCCD / CMND</span>
                  <span className="font-medium text-slate-200 font-mono">{employee.identityCard || 'Chưa cập nhật'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Tổ chức & Hợp đồng lao động */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-400" /> Tổ Chức & Hợp Đồng
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <div>
                <span className="text-xs text-slate-500 block">Phòng ban</span>
                <span className="font-medium text-slate-200">{employee.department?.name}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Vị trí / Chức vụ</span>
                <span className="font-medium text-slate-200">{employee.position?.title}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Địa điểm làm việc</span>
                <span className="font-medium text-slate-200">{employee.worksite?.name || 'Trụ sở chính'}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Ngày bắt đầu làm việc</span>
                <span className="font-medium text-slate-200">{formatDateVN(employee.hireDate)}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Loại hợp đồng</span>
                <span className="font-medium text-slate-200">
                  {employee.contractType === 'PROBATION'
                    ? 'Thử việc'
                    : employee.contractType === 'FIXED_TERM'
                    ? 'Xác định thời hạn'
                    : 'Không xác định thời hạn'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Người phụ thuộc</span>
                <span className="font-medium text-slate-200">{employee.dependentsCount || 0} người</span>
              </div>
            </div>
          </div>

          {/* Section 3: Lương & Đãi ngộ */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-amber-400" /> Mức Lương & Tài Khoản Ngân Hàng
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
              <div>
                <span className="text-xs text-slate-500 block">Lương cơ bản (Tháng)</span>
                <span className="text-base font-bold text-amber-400 font-mono">
                  {formatCurrencyVND(employee.contractSalary)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Đơn giá giờ (Hourly Rate)</span>
                <span className="text-base font-bold text-blue-400 font-mono">
                  {formatCurrencyVND(employee.hourlyRate)}/h
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Lương đóng BHXH</span>
                <span className="font-medium text-slate-200 font-mono">
                  {formatCurrencyVND(employee.insuranceSalary || employee.contractSalary)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Mã số thuế cá nhân</span>
                <span className="font-medium text-slate-200 font-mono">
                  {employee.taxCode || 'Chưa đăng ký'}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-slate-500 block">Số tài khoản ngân hàng</span>
                <span className="font-medium text-slate-200 font-mono">
                  {employee.bankAccountNo ? `${employee.bankAccountNo} (${employee.bankName || 'Ngân hàng'})` : 'Chưa cập nhật'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Tài liệu đính kèm (Documents) */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-purple-400" /> Hồ Sơ & Tài Liệu Đính Kèm ({documents.length})
            </h3>
            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                Chưa có tài liệu đính kèm nào (Hợp đồng, CCCD, Sơ yếu lý lịch).
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc: any, index: number) => (
                  <div
                    key={doc.id || index}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-2.5 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-purple-400" />
                      <div>
                        <span className="font-medium text-slate-200 block text-xs">{doc.name}</span>
                        <span className="text-[10px] text-slate-500">
                          {doc.type} • Tải lên: {formatDateVN(doc.uploadedAt)}
                        </span>
                      </div>
                    </div>
                    {(doc.id || doc.url) && (
                      <a
                        href={doc.url?.startsWith('/api/') ? doc.url : `/api/v1/employees/${employee.id}/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1 text-slate-400 hover:text-white transition-colors"
                        title="Tải xuống tài liệu an toàn"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-800/80 bg-slate-950/40 p-4">
          <span className="text-xs text-slate-500">
            Ngày tạo: {formatDateVN(employee.createdAt)}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700">
              Đóng
            </Button>
            {onEdit && (
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(employee);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Chỉnh sửa hồ sơ
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
