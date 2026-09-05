'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle } from 'lucide-react';

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any | null;
  departments: any[];
  employees: any[];
}

export function DepartmentModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  departments,
  employees,
}: DepartmentModalProps) {
  const isEdit = Boolean(initialData?.id);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setName(initialData.name || '');
      setDescription(initialData.description || '');
      setParentId(initialData.parentId || '');
      setManagerId(initialData.managerId || '');
      setIsActive(initialData.isActive ?? true);
    } else {
      setCode('');
      setName('');
      setDescription('');
      setParentId('');
      setManagerId('');
      setIsActive(true);
    }
    setErrorMessage('');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const payload = {
        code,
        name,
        description: description || undefined,
        parentId: parentId || undefined,
        managerId: managerId || undefined,
        isActive,
      };

      const url = isEdit ? `/api/v1/departments/${initialData.id}` : '/api/v1/departments';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể lưu phòng ban.');
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setErrorMessage('Lỗi kết nối mạng.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="relative w-full max-w-lg border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col text-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 p-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEdit ? 'Chỉnh Sửa Phòng Ban' : 'Thành Lập Phòng Ban Mới'}
            </h2>
            <p className="text-xs text-slate-400">
              Quản lý cơ cấu phân cấp tổ chức và phân quyền Trưởng phòng.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Mã Phòng Ban *</label>
              <input
                type="text"
                required
                placeholder="TECH"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Tên Phòng Ban *</label>
              <input
                type="text"
                required
                placeholder="Phòng Công Nghệ & Kỹ Thuật"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Mô Tả / Chức Năng</label>
            <textarea
              rows={2}
              placeholder="Chịu trách nhiệm phát triển hạ tầng, bảo mật và ứng dụng số..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Bổ Nhiệm Trưởng Phòng (Manager)</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none text-xs"
            >
              <option value="">-- Chưa bổ nhiệm Trưởng phòng --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName || `${emp.lastName} ${emp.firstName}`} ({emp.employeeCode})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Nhân sự được bổ nhiệm sẽ tự động sở hữu thẩm quyền duyệt giải trình công, phân ca và đánh giá KPI của phòng ban.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Phòng Ban Cấp Trên (Hierarchy)</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 focus:border-blue-500 focus:outline-none text-xs"
            >
              <option value="">-- Là phòng ban độc lập / cấp cao nhất --</option>
              {departments
                .filter((d) => d.id !== initialData?.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="deptIsActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-0"
            />
            <label htmlFor="deptIsActive" className="text-xs text-slate-300">
              Trạng thái hoạt động (Đang vận hành)
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading} className="border-slate-700">
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold"
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang lưu...
                </span>
              ) : isEdit ? (
                'Lưu Cập Nhật'
              ) : (
                'Tạo Phòng Ban'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
