'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Loader2, AlertCircle } from 'lucide-react';

interface PositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any | null;
}

export function PositionModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: PositionModalProps) {
  const isEdit = Boolean(initialData?.id);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [minSalary, setMinSalary] = useState<number>(10000000);
  const [maxSalary, setMaxSalary] = useState<number>(25000000);
  const [baseSalaryGrade, setBaseSalaryGrade] = useState<number>(15000000);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || '');
      setTitle(initialData.title || '');
      setDescription(initialData.description || '');
      setMinSalary(Number(initialData.minSalary) || 0);
      setMaxSalary(Number(initialData.maxSalary) || 0);
      setBaseSalaryGrade(Number(initialData.baseSalaryGrade) || 0);
      setIsActive(initialData.isActive ?? true);
    } else {
      setCode('');
      setTitle('');
      setDescription('');
      setMinSalary(10000000);
      setMaxSalary(25000000);
      setBaseSalaryGrade(15000000);
      setIsActive(true);
    }
    setErrorMessage('');
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    if (maxSalary > 0 && maxSalary < minSalary) {
      setErrorMessage('Lương tối đa (Max Salary) phải lớn hơn hoặc bằng Lương tối thiểu (Min Salary).');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        code,
        title,
        description: description || undefined,
        minSalary: Number(minSalary),
        maxSalary: Number(maxSalary),
        baseSalaryGrade: Number(baseSalaryGrade),
        isActive,
      };

      const url = isEdit ? `/api/v1/positions/${initialData.id}` : '/api/v1/positions';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể lưu chức vụ.');
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
              {isEdit ? 'Chỉnh Sửa Chức Vụ' : 'Thiết Lập Chức Vụ Mới'}
            </h2>
            <p className="text-xs text-slate-400">
              Quy định ngạch bậc chuyên môn và khung lương chuẩn (Salary Range).
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
              <label className="text-xs font-medium text-slate-300 block mb-1">Mã Chức Vụ *</label>
              <input
                type="text"
                required
                placeholder="DEV_SR"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Tên Chức Danh *</label>
              <input
                type="text"
                required
                placeholder="Senior Software Engineer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">Mô Tả Tiêu Chuẩn / Yêu Cầu</label>
            <textarea
              rows={2}
              placeholder="Yêu cầu tối thiểu 3 năm kinh nghiệm, phụ trách thiết kế module..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-white focus:border-blue-500 focus:outline-none text-xs"
            />
          </div>

          {/* Salary Range */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5 space-y-3">
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Khung Lương Vị Trí (Salary Range VNĐ)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Lương Tối Thiểu (Min)</label>
                <input
                  type="number"
                  min="0"
                  step="500000"
                  required
                  value={minSalary}
                  onChange={(e) => setMinSalary(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Mức Chuẩn (Grade)</label>
                <input
                  type="number"
                  min="0"
                  step="500000"
                  required
                  value={baseSalaryGrade}
                  onChange={(e) => setBaseSalaryGrade(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Lương Tối Đa (Max)</label>
                <input
                  type="number"
                  min="0"
                  step="500000"
                  required
                  value={maxSalary}
                  onChange={(e) => setMaxSalary(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Khung lương dùng để kiểm soát chính sách đãi ngộ khi tuyển dụng hoặc nâng bậc lương định kỳ.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="posIsActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-0"
            />
            <label htmlFor="posIsActive" className="text-xs text-slate-300">
              Trạng thái hoạt động (Được phép phân bổ nhân sự)
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
                'Tạo Chức Vụ'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
