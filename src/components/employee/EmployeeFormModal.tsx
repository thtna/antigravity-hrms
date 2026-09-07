'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Loader2, Plus, Trash2, FileText, AlertCircle } from 'lucide-react';
import { EmployeeDocument } from '@/lib/validations/employee';
import { useToastHelpers } from '@/components/ui/toast';

interface OrgMeta {
  departments: { id: string; code: string; name: string }[];
  positions: { id: string; code: string; title: string; baseSalaryGrade: number }[];
  worksites: { id: string; name: string }[];
}

interface EmployeeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any | null;
  meta: OrgMeta;
}

export function EmployeeFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  meta,
}: EmployeeFormModalProps) {
  const isEdit = Boolean(initialData);
  const { error: toastError, success: toastSuccess } = useToastHelpers();

  // Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form states
  const [employeeCode, setEmployeeCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [gender, setGender] = useState('OTHER');
  const [dob, setDob] = useState('1995-01-01');
  const [identityCard, setIdentityCard] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [worksiteId, setWorksiteId] = useState('');
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [contractType, setContractType] = useState('PROBATION');
  const [contractSalary, setContractSalary] = useState<number>(15000000);
  const [hourlyRate, setHourlyRate] = useState<number>(0);
  const [insuranceSalary, setInsuranceSalary] = useState<number>(5000000);
  const [taxCode, setTaxCode] = useState('');
  const [dependentsCount, setDependentsCount] = useState<number>(0);
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);

  // Document draft inputs
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState<'CONTRACT' | 'ID_CARD' | 'RESUME' | 'CERTIFICATE' | 'OTHER'>('CONTRACT');
  const [newDocUrl, setNewDocUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toastError('Kích thước ảnh quá lớn', 'Kích thước ảnh đại diện không được vượt quá 2MB.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/uploads/avatar', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success && data.data?.avatarUrl) {
        setAvatarUrl(data.data.avatarUrl);
        toastSuccess('Ảnh đại diện', 'Đã tải ảnh đại diện thành công.');
      } else {
        toastError('Tải ảnh đại diện thất bại', data.error?.message || 'Lỗi tải ảnh');
      }
    } catch {
      toastError('Lỗi kết nối', 'Không thể kết nối khi tải ảnh đại diện.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDocFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!newDocName.trim()) {
      setNewDocName(file.name);
    }

    if (isEdit && initialData?.id) {
      setUploadingDoc(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', newDocType);
        const res = await fetch(`/api/v1/employees/${initialData.id}/documents`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.success && data.data) {
          setDocuments([...documents, data.data]);
          setNewDocName('');
          setNewDocUrl('');
          toastSuccess('Tải tài liệu thành công');
        } else {
          toastError('Tải lên tài liệu thất bại', data.error?.message || 'Lỗi tải tài liệu');
        }
      } catch {
        toastError('Lỗi kết nối', 'Không thể kết nối máy chủ khi tải tài liệu.');
      } finally {
        setUploadingDoc(false);
      }
    } else {
      setNewDocUrl(`/api/v1/employees/staged/${file.name}`);
    }
  };

  useEffect(() => {
    if (initialData) {
      setEmployeeCode(initialData.employeeCode || '');
      setFirstName(initialData.firstName || '');
      setLastName(initialData.lastName || '');
      setEmail(initialData.user?.email || '');
      setPhoneNumber(initialData.phoneNumber || '');
      setAvatarUrl(initialData.avatarUrl || '');
      setGender(initialData.gender || 'MALE');
      setDob(initialData.dob ? new Date(initialData.dob).toISOString().split('T')[0] : '1995-01-01');
      setIdentityCard(initialData.identityCard || '');
      setDepartmentId(initialData.departmentId || '');
      setPositionId(initialData.positionId || '');
      setWorksiteId(initialData.worksiteId || '');
      setHireDate(initialData.hireDate ? new Date(initialData.hireDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
      setContractType(initialData.contractType || 'PROBATION');
      setContractSalary(Number(initialData.contractSalary) || 0);
      setHourlyRate(Number(initialData.hourlyRate) || 0);
      setInsuranceSalary(Number(initialData.insuranceSalary) || 0);
      setTaxCode(initialData.taxCode || '');
      setDependentsCount(Number(initialData.dependentsCount) || 0);
      setBankAccountNo(initialData.bankAccountNo || '');
      setBankName(initialData.bankName || '');
      setStatus(initialData.status || 'ACTIVE');
      setDocuments(Array.isArray(initialData.documents) ? initialData.documents : []);
    } else {
      // Auto-suggest next employee code
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setEmployeeCode(`EMP-${randomSuffix}`);
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhoneNumber('0912345678');
      setAvatarUrl('');
      setGender('MALE');
      setDob('1995-01-01');
      setIdentityCard('');
      setDepartmentId(meta.departments[0]?.id || '');
      setPositionId(meta.positions[0]?.id || '');
      setWorksiteId(meta.worksites[0]?.id || '');
      setHireDate(new Date().toISOString().split('T')[0]);
      setContractType('PROBATION');
      setContractSalary(15000000);
      setHourlyRate(Math.round(15000000 / (22 * 8)));
      setInsuranceSalary(5000000);
      setTaxCode('');
      setDependentsCount(0);
      setBankAccountNo('');
      setBankName('Vietcombank');
      setStatus('ACTIVE');
      setDocuments([]);
    }
    setErrorMessage('');
  }, [initialData, isOpen, meta]);

  if (!isOpen) return null;

  // Auto-calculate hourly rate when base salary changes
  const handleSalaryChange = (value: number) => {
    setContractSalary(value);
    if (value > 0) {
      setHourlyRate(Math.round(value / (22 * 8)));
    }
  };

  const handleAddDocument = () => {
    if (!newDocName.trim() || !newDocUrl.trim()) return;
    const newDoc: EmployeeDocument = {
      id: crypto.randomUUID(),
      name: newDocName.trim(),
      type: newDocType,
      url: newDocUrl.trim(),
      size: 1024 * 250, // simulated size 250KB
      uploadedAt: new Date().toISOString(),
    };
    setDocuments([...documents, newDoc]);
    setNewDocName('');
    setNewDocUrl('');
  };

  const handleRemoveDocument = (id: string) => {
    setDocuments(documents.filter((d) => d.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        employeeCode,
        firstName,
        lastName,
        email,
        phoneNumber,
        avatarUrl: avatarUrl || undefined,
        gender,
        dob,
        identityCard: identityCard || undefined,
        departmentId,
        positionId,
        worksiteId: worksiteId || undefined,
        hireDate,
        contractType,
        contractSalary: Number(contractSalary),
        hourlyRate: Number(hourlyRate),
        insuranceSalary: Number(insuranceSalary),
        taxCode: taxCode || undefined,
        dependentsCount: Number(dependentsCount),
        bankAccountNo: bankAccountNo || undefined,
        bankName: bankName || undefined,
        documents,
        status,
      };

      const url = isEdit ? `/api/v1/employees/${initialData.id}` : '/api/v1/employees';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể lưu hồ sơ nhân viên.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setErrorMessage('Lỗi kết nối máy chủ. Vui lòng thử lại.');
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-form-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <Card className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden border-slate-800 bg-slate-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 p-5">
          <div>
            <h2 id="employee-form-modal-title" className="text-xl font-bold text-white">
              {isEdit ? 'Chỉnh Sửa Hồ Sơ Nhân Viên' : 'Tiếp Nhận Nhân Sự Mới'}
            </h2>
            <p className="text-xs text-slate-400">
              {isEdit ? `Cập nhật thông tin cho [${employeeCode}]` : 'Nhập đầy đủ thông tin để cấp tài khoản và lập hồ sơ nhân sự.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6 flex-1 text-sm">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Group 1: Thông tin cơ bản */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400 border-b border-slate-800 pb-1.5">
              1. Thông Tin Cơ Bản & Định Danh
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Mã Nhân Viên *</label>
                <input
                  type="text"
                  required
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Họ và Tên Đệm *</label>
                <input
                  type="text"
                  required
                  placeholder="Nguyễn Văn"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Tên Gọi *</label>
                <input
                  type="text"
                  required
                  placeholder="An"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Email Công Ty *</label>
                <input
                  type="email"
                  required
                  placeholder="nhanvien@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Số Điện Thoại *</label>
                <input
                  type="tel"
                  required
                  placeholder="0912345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Giới Tính</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="MALE">Nam</option>
                  <option value="FEMALE">Nữ</option>
                  <option value="OTHER">Khác</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Ngày Sinh</label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Số CCCD / Hộ Chiếu</label>
                <input
                  type="text"
                  placeholder="001200000001"
                  value={identityCard}
                  onChange={(e) => setIdentityCard(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Ảnh Đại Diện (Avatar)</label>
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 rounded-full border border-slate-700 bg-slate-800 overflow-hidden flex items-center justify-center text-xs font-bold text-blue-400">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span>AV</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleAvatarFileChange}
                        disabled={uploadingAvatar}
                        className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
                      />
                      {uploadingAvatar && <span className="text-xs text-blue-400 animate-pulse">Đang tải...</span>}
                    </div>
                    <input
                      type="url"
                      placeholder="Hoặc nhập URL ảnh..."
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Group 2: Cơ cấu tổ chức & Trạng thái */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 border-b border-slate-800 pb-1.5">
              2. Cơ Cấu Tổ Chức & Chức Danh
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Phòng Ban *</label>
                <select
                  required
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Chọn phòng ban --</option>
                  {meta.departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Chức Vụ *</label>
                <select
                  required
                  value={positionId}
                  onChange={(e) => {
                    setPositionId(e.target.value);
                    const sel = meta.positions.find((p) => p.id === e.target.value);
                    if (sel && sel.baseSalaryGrade && !isEdit) {
                      handleSalaryChange(sel.baseSalaryGrade);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Chọn chức vụ --</option>
                  {meta.positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Địa Điểm Làm Việc</label>
                <select
                  value={worksiteId}
                  onChange={(e) => setWorksiteId(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Chọn địa điểm --</option>
                  {meta.worksites.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Trạng Thái Công Tác</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="ACTIVE">Đang làm việc</option>
                  <option value="PROBATION">Thử việc</option>
                  <option value="ON_LEAVE">Nghỉ phép</option>
                  <option value="TERMINATED">Đã nghỉ việc</option>
                </select>
              </div>
            </div>
          </div>

          {/* Group 3: Hợp đồng & Chế độ đãi ngộ */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 border-b border-slate-800 pb-1.5">
              3. Chế Độ Lương & Hợp Đồng Lao Động
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Loại Hợp Đồng</label>
                <select
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="PROBATION">Thử việc</option>
                  <option value="FIXED_TERM">Xác định thời hạn</option>
                  <option value="INDEFINITE">Không xác định thời hạn</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Ngày Bắt Đầu</label>
                <input
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Lương Cơ Bản (VNĐ/tháng) *</label>
                <input
                  type="number"
                  min="0"
                  step="100000"
                  required
                  value={contractSalary}
                  onChange={(e) => handleSalaryChange(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Đơn Giá Giờ (Hourly Rate)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Lương Đóng BHXH</label>
                <input
                  type="number"
                  min="0"
                  step="100000"
                  value={insuranceSalary}
                  onChange={(e) => setInsuranceSalary(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Số Người Phụ Thuộc</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={dependentsCount}
                  onChange={(e) => setDependentsCount(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Số Tài Khoản Ngân Hàng</label>
                <input
                  type="text"
                  placeholder="0123456789"
                  value={bankAccountNo}
                  onChange={(e) => setBankAccountNo(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Tên Ngân Hàng</label>
                <input
                  type="text"
                  placeholder="Vietcombank / Techcombank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Group 4: Tài liệu đính kèm */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400 border-b border-slate-800 pb-1.5">
              4. Tài Liệu Đính Kèm (Hợp đồng, Bằng cấp, CCCD)
            </h3>

            {/* List existing added documents */}
            {documents.length > 0 && (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-purple-400" />
                      <span className="text-slate-200 font-medium">{doc.name}</span>
                      <Badge variant="outline" className="text-[10px]">{doc.type}</Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDocument(doc.id)}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new document row */}
            <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Chọn tệp đính kèm (PDF, DOCX, XLSX, Ảnh ≤ 10MB):</span>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                    onChange={handleDocFileSelect}
                    disabled={uploadingDoc}
                    className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                  />
                  {uploadingDoc && <span className="text-xs text-purple-400 animate-pulse">Đang tải...</span>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    placeholder="Tên tài liệu (e.g. Hợp đồng lao động 2026)"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-3">
                  <select
                    value={newDocType}
                    onChange={(e: any) => setNewDocType(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="CONTRACT">Hợp đồng</option>
                    <option value="ID_CARD">CCCD</option>
                    <option value="RESUME">CV / Sơ yếu</option>
                    <option value="CERTIFICATE">Bằng cấp</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    placeholder="Đường dẫn hoặc tệp tải lên"
                    value={newDocUrl}
                    onChange={(e) => setNewDocUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-1 flex items-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleAddDocument}
                    disabled={uploadingDoc}
                    className="w-full h-8 px-2"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="border-slate-700">
              Hủy Bỏ
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold shadow-lg shadow-blue-500/20"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...
                </span>
              ) : isEdit ? (
                'Lưu Thay Đổi'
              ) : (
                'Tạo Nhân Sự Mới'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
