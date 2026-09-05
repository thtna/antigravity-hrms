'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  Target,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import {
  CalculationType,
  BonusFormula,
  KpiUnit,
  KpiPeriod,
} from '@/lib/kpi/kpi-calculator';

interface KpiDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function KpiDefinitionModal({
  isOpen,
  onClose,
  onSuccess,
}: KpiDefinitionModalProps) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetValue, setTargetValue] = useState('100');
  const [unit, setUnit] = useState<KpiUnit>('PERCENT');
  const [period, setPeriod] = useState<KpiPeriod>('MONTHLY');
  const [calculationType, setCalculationType] = useState<CalculationType>('HIGHER_IS_BETTER');
  const [baseBonusAmount, setBaseBonusAmount] = useState('5000000');
  const [bonusFormula, setBonusFormula] = useState<BonusFormula>('TIERED');
  const [weight, setWeight] = useState('100');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  function handleClose() {
    setCode('');
    setTitle('');
    setDescription('');
    setTargetValue('100');
    setUnit('PERCENT');
    setPeriod('MONTHLY');
    setCalculationType('HIGHER_IS_BETTER');
    setBaseBonusAmount('5000000');
    setBonusFormula('TIERED');
    setWeight('100');
    setError(null);
    setDone(false);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/kpi/definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          title: title.trim(),
          description: description.trim() || undefined,
          targetValue: Number(targetValue),
          unit,
          period,
          calculationType,
          baseBonusAmount: Number(baseBonusAmount),
          bonusFormula,
          weight: Number(weight),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể tạo chỉ số KPI.');
      }

      setDone(true);
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <Card className="relative w-full max-w-2xl border-slate-700 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tạo Định Nghĩa Chỉ Số KPI Mới</h2>
              <p className="text-xs text-slate-400">Thiết lập mục tiêu chuẩn, đơn vị đo lường và chính sách thưởng</p>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {done && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="rounded-full bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              </div>
              <p className="text-base font-semibold text-white">Chỉ số KPI đã được tạo thành công!</p>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Code */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Mã KPI (Unique Code) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: SALES_REV_M"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white font-mono placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Tiêu Đề KPI <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Doanh Số Bán Hàng Cá Nhân"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Mô Tả Mục Tiêu</label>
                <textarea
                  rows={2}
                  placeholder="Diễn giải chi tiết cách tính và tiêu chí hoàn thành..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>

              {/* Target & Unit */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Giá Trị Mục Tiêu <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step="any"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Đơn Vị Đo Lường</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as KpiUnit)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="PERCENT">% (Phần trăm)</option>
                    <option value="VND">VND (Việt Nam Đồng)</option>
                    <option value="TASKS">Công việc (Tasks)</option>
                    <option value="HOURS">Giờ (Hours)</option>
                    <option value="POINTS">Điểm (Points)</option>
                    <option value="CONTRACTS">Hợp đồng (Contracts)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Chu Kỳ Đánh Giá</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as KpiPeriod)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="MONTHLY">Hàng Tháng (Monthly)</option>
                    <option value="QUARTERLY">Hàng Quý (Quarterly)</option>
                    <option value="YEARLY">Hàng Năm (Yearly)</option>
                  </select>
                </div>
              </div>

              {/* Calculation Type & Formula */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                    Kiểu Đo Lường
                    <span title="HIGHER_IS_BETTER: càng cao càng tốt; LOWER_IS_BETTER: càng thấp càng tốt (lỗi, thời gian xử lý); MILESTONE: đạt mốc nhị phân">
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 cursor-pointer" />
                    </span>
                  </label>
                  <select
                    value={calculationType}
                    onChange={(e) => setCalculationType(e.target.value as CalculationType)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="HIGHER_IS_BETTER">Càng cao càng tốt (Higher is Better)</option>
                    <option value="LOWER_IS_BETTER">Càng thấp càng tốt (Lower is Better)</option>
                    <option value="MILESTONE">Theo mốc nhị phân (Milestone 0/100%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                    Công Thức Tính Thưởng
                    <span title="TIERED: Bậc thang; LINEAR: Tuyến tính theo tỷ lệ; ACCELERATOR: Tăng tốc vượt mục tiêu; THRESHOLD_ONLY: Chỉ thưởng khi đạt >=100%">
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 cursor-pointer" />
                    </span>
                  </label>
                  <select
                    value={bonusFormula}
                    onChange={(e) => setBonusFormula(e.target.value as BonusFormula)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="TIERED">Bậc thang (Tiered Policy)</option>
                    <option value="LINEAR">Tuyến tính (Linear with 80% threshold)</option>
                    <option value="ACCELERATOR">Đòn bẩy vượt mục tiêu (Accelerator 1.5x)</option>
                    <option value="THRESHOLD_ONLY">Tất cả hoặc không (Threshold Only)</option>
                  </select>
                </div>
              </div>

              {/* Bonus Amount & Weight */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Mức Thưởng Cơ Bản (100% Target)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      step="100000"
                      value={baseBonusAmount}
                      onChange={(e) => setBaseBonusAmount(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2 text-xs text-slate-400">₫ VND</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Trọng Số Mặc Định (Weight)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
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
                  disabled={loading || !code || !title}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5"
                >
                  {loading ? 'Đang lưu...' : 'Lưu Chỉ Số KPI'}
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
