'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  Award,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  calculateAchievementRate,
  calculateBonusAmount,
  getAchievementTier,
  formatBonusVnd,
  formatKpiUnit,
  CalculationType,
  BonusFormula,
} from '@/lib/kpi/kpi-calculator';

export interface KpiAssignmentItem {
  id: string;
  period: string;
  targetValue: string | number | null;
  actualValue: string | number;
  completionRate: string | number;
  score: string | number;
  bonusAmount: string | number;
  status: string;
  managerComment?: string | null;
  kpi: {
    code: string;
    title: string;
    targetValue: string | number;
    unit: string;
    calculationType: string;
    baseBonusAmount: string | number;
    bonusFormula: string;
    weight: string | number;
  };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
  };
}

interface KpiEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  assignment: KpiAssignmentItem | null;
}

export function KpiEvaluationModal({
  isOpen,
  onClose,
  onSuccess,
  assignment,
}: KpiEvaluationModalProps) {
  const [actualInput, setActualInput] = useState(
    assignment ? String(assignment.actualValue ?? '') : ''
  );
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [managerComment, setManagerComment] = useState(
    assignment?.managerComment || ''
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Sync state when assignment changes
  React.useEffect(() => {
    if (assignment) {
      setActualInput(String(assignment.actualValue ?? ''));
      setManagerComment(assignment.managerComment || '');
      setDecision('APPROVED');
      setError(null);
      setDone(false);
    }
  }, [assignment]);

  if (!isOpen || !assignment) return null;

  const target = Number(assignment.targetValue ?? assignment.kpi.targetValue);
  const actualNum = Number(actualInput) || 0;
  const calcType = (assignment.kpi.calculationType as CalculationType) || 'HIGHER_IS_BETTER';
  const bonusForm = (assignment.kpi.bonusFormula as BonusFormula) || 'TIERED';
  const baseBonus = Number(assignment.kpi.baseBonusAmount) || 0;

  // ── Calculation Engine Invocation (Zero hard-coded formulas in UI) ──────────
  const previewRate = calculateAchievementRate(actualNum, target, calcType);
  const previewBonus =
    decision === 'APPROVED'
      ? calculateBonusAmount(previewRate, baseBonus, bonusForm)
      : 0;
  const tier = getAchievementTier(previewRate);

  function handleClose() {
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignment) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/kpi/assignments/${assignment.id}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualValue: actualNum,
          decision,
          managerComment: managerComment.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể đánh giá KPI.');
      }

      setDone(true);
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <Card className="relative w-full max-w-lg border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Đánh Giá & Phê Duyệt KPI</h2>
              <p className="text-xs text-slate-400">
                {assignment.employee.lastName} {assignment.employee.firstName} ({assignment.employee.employeeCode}) — Kỳ {assignment.period}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
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
              <p className="text-base font-semibold text-white">
                Đã {decision === 'APPROVED' ? 'phê duyệt' : 'từ chối'} đánh giá KPI!
              </p>
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

              {/* KPI Meta */}
              <div className="rounded-lg bg-slate-800/80 border border-slate-700/60 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Chỉ số:</span>
                  <span className="font-semibold text-white">
                    [{assignment.kpi.code}] {assignment.kpi.title}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Mục tiêu yêu cầu:</span>
                  <span className="font-mono text-white font-medium">
                    {formatKpiUnit(target, assignment.kpi.unit)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Chính sách thưởng:</span>
                  <span className="text-blue-400">
                    {assignment.kpi.bonusFormula} ({formatBonusVnd(baseBonus)})
                  </span>
                </div>
              </div>

              {/* Actual Value Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kết Quả Thực Tế Đạt Được ({assignment.kpi.unit})
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  value={actualInput}
                  onChange={(e) => setActualInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Live Calculator Engine Preview */}
              <div className="rounded-lg bg-gradient-to-br from-slate-800 to-slate-800/60 border border-slate-700/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <span>Tỷ lệ hoàn thành (Engine):</span>
                  </div>
                  <span className="text-lg font-bold text-white">
                    {previewRate}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Xếp loại hiệu suất:</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${tier.badgeClass}`}>
                    {tier.label}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                  <span className="text-xs font-medium text-slate-300">Tiền thưởng tính toán:</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    {formatBonusVnd(previewBonus)}
                  </span>
                </div>
              </div>

              {/* Decision Choice */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Quyết Định Đánh Giá
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDecision('APPROVED')}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                      decision === 'APPROVED'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/50'
                        : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Phê Duyệt Đạt
                  </button>

                  <button
                    type="button"
                    onClick={() => setDecision('REJECTED')}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-2.5 text-xs font-semibold transition-all ${
                      decision === 'REJECTED'
                        ? 'bg-red-600/20 border-red-500 text-red-300 shadow-md shadow-red-950/50'
                        : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <XCircle className="h-4 w-4 text-red-400" />
                    Từ Chối / Không Đạt
                  </button>
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nhận Xét Đánh Giá Của Quản Lý
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi nhận điểm mạnh, lưu ý cải thiện..."
                  value={managerComment}
                  onChange={(e) => setManagerComment(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={loading}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Hủy Bỏ
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !assignment}
                  className={
                    decision === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5'
                      : 'bg-red-600 hover:bg-red-500 text-white font-medium px-5'
                  }
                >
                  {loading ? 'Đang lưu...' : decision === 'APPROVED' ? 'Xác Nhận Duyệt KPI' : 'Xác Nhận Từ Chối'}
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
