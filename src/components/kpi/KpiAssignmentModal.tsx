'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatBonusVnd } from '@/lib/kpi/kpi-calculator';

interface KpiDefinitionItem {
  id: string;
  code: string;
  title: string;
  targetValue: string | number;
  unit: string;
  baseBonusAmount: string | number;
}

interface EmployeeItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department?: { name: string };
}

interface KpiAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultPeriod?: string;
}

export function KpiAssignmentModal({
  isOpen,
  onClose,
  onSuccess,
  defaultPeriod,
}: KpiAssignmentModalProps) {
  const currentPeriod = defaultPeriod || new Date().toISOString().slice(0, 7);

  const [kpis, setKpis] = useState<KpiDefinitionItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [selectedKpiId, setSelectedKpiId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [period, setPeriod] = useState(currentPeriod);
  const [customTarget, setCustomTarget] = useState('');
  const [comment, setComment] = useState('');

  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setLoadingData(true);
    setError(null);

    Promise.all([
      fetch('/api/v1/kpi/definitions?limit=100&status=ACTIVE').then((r) => r.json()),
      fetch('/api/v1/employees?limit=100').then((r) => r.json()),
    ])
      .then(([kpiRes, empRes]) => {
        if (kpiRes.success && Array.isArray(kpiRes.data)) {
          setKpis(kpiRes.data);
          if (kpiRes.data.length > 0) {
            setSelectedKpiId(kpiRes.data[0].id);
            setCustomTarget(String(kpiRes.data[0].targetValue));
          }
        }
        if (empRes.success && Array.isArray(empRes.data)) {
          setEmployees(empRes.data);
          if (empRes.data.length > 0) {
            setSelectedEmployeeId(empRes.data[0].id);
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu.');
      })
      .finally(() => setLoadingData(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedKpi = kpis.find((k) => k.id === selectedKpiId);

  function handleKpiChange(id: string) {
    setSelectedKpiId(id);
    const k = kpis.find((item) => item.id === id);
    if (k) {
      setCustomTarget(String(k.targetValue));
    }
  }

  function handleClose() {
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedKpiId || !selectedEmployeeId || !period) return;

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/kpi/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpiId: selectedKpiId,
          employeeId: selectedEmployeeId,
          period: period.trim(),
          targetValue: customTarget ? Number(customTarget) : undefined,
          managerComment: comment.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể giao KPI.');
      }

      setDone(true);
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Giao KPI Cho Nhân Viên</h2>
              <p className="text-xs text-slate-400">Phân bổ chỉ tiêu hiệu suất và mức thưởng theo kỳ</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {done && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="rounded-full bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <p className="text-base font-semibold text-white">Giao chỉ số KPI thành công!</p>
            </div>
          )}

          {!done && (
            <>
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {loadingData ? (
                <div className="py-8 text-center text-sm text-slate-400">Đang tải dữ liệu...</div>
              ) : (
                <>
                  {/* Select Employee */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nhân Viên Nhận KPI <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.lastName} {emp.firstName} ({emp.employeeCode})
                          {emp.department?.name ? ` — ${emp.department.name}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select KPI */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Chỉ Số KPI <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={selectedKpiId}
                      onChange={(e) => handleKpiChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    >
                      {kpis.map((k) => (
                        <option key={k.id} value={k.id}>
                          [{k.code}] {k.title} (Target: {k.targetValue} {k.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Period & Target */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Kỳ Đánh Giá (YYYY-MM) <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="VD: 2026-09"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Mục Tiêu Riêng ({selectedKpi?.unit || 'Target'})
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={customTarget}
                        onChange={(e) => setCustomTarget(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Potential Bonus preview */}
                  {selectedKpi && (
                    <div className="rounded-lg bg-blue-950/40 border border-blue-500/20 p-3 text-xs text-blue-300 flex justify-between items-center">
                      <span>Mức thưởng tiềm năng khi đạt 100%:</span>
                      <span className="font-semibold text-white">
                        {formatBonusVnd(Number(selectedKpi.baseBonusAmount))}
                      </span>
                    </div>
                  )}

                  {/* Comment */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Ghi Chú / Chỉ Đạo Cụ Thể
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Lưu ý của quản lý khi giao chỉ số..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClose}
                      disabled={submitting}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      Hủy Bỏ
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting || !selectedKpiId || !selectedEmployeeId}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5"
                    >
                      {submitting ? 'Đang giao...' : 'Xác Nhận Giao KPI'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
