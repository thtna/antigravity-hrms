'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import {
  Award,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  KpiScorecardSummary,
  formatBonusVnd,
  formatKpiUnit,
} from '@/lib/kpi/kpi-calculator';

interface KpiScorecardCardProps {
  employeeName: string;
  employeeCode: string;
  department?: string;
  period: string;
  scorecard: KpiScorecardSummary;
}

export function KpiScorecardCard({
  employeeName,
  employeeCode,
  department,
  period,
  scorecard,
}: KpiScorecardCardProps) {
  const { overallTier, weightedAverageScore, totalBonusEarned, totalBaseBonusPotential, items } =
    scorecard;

  return (
    <div className="space-y-5">
      {/* Overview Metric Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Weighted Score */}
        <Card className="border-slate-800 bg-slate-900/90 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Điểm Hiệu Suất (Weighted)</span>
            <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {weightedAverageScore}%
            </span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${overallTier.badgeClass}`}>
              {overallTier.label}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Tổng hợp trên {items.length} chỉ số được giao
          </p>
        </Card>

        {/* Total Bonus Earned */}
        <Card className="border-slate-800 bg-slate-900/90 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Tổng Tiền Thưởng Kỳ</span>
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono tracking-tight">
              {formatBonusVnd(totalBonusEarned)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Mức thưởng cơ bản kỳ: {formatBonusVnd(totalBaseBonusPotential)}
          </p>
        </Card>

        {/* Completion Count */}
        <Card className="border-slate-800 bg-slate-900/90 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Tiến Độ Đánh Giá</span>
            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white tracking-tight">
              {scorecard.completedKpiCount} / {scorecard.totalKpiCount}
            </span>
            <span className="text-xs text-slate-400">chỉ số</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {scorecard.totalKpiCount > 0
              ? `${Math.round((scorecard.completedKpiCount / scorecard.totalKpiCount) * 100)}% hoàn tất ghi nhận`
              : 'Chưa có chỉ số'}
          </p>
        </Card>

        {/* Employee Info */}
        <Card className="border-slate-800 bg-slate-900/90 p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Thông Tin Nhân Viên</span>
            <div className="p-1.5 rounded-md bg-slate-800 text-slate-400">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-sm font-bold text-white truncate">{employeeName}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{employeeCode}</p>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 truncate">
            {department || 'Nhân sự công ty'} — Kỳ {period}
          </p>
        </Card>
      </div>

      {/* Individual KPI Items Breakdown */}
      <Card className="border-slate-800 bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Chi Tiết Từng Chỉ Số KPI</h3>
            <p className="text-xs text-slate-400">Bảng theo dõi mục tiêu, tỷ lệ đạt và tiền thưởng theo trọng số</p>
          </div>
          <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2.5 py-1 rounded-md">
            Kỳ: {period}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Chưa có chỉ số KPI nào được giao trong kỳ {period}.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {items.map((kpi, idx) => {
              const pct = Math.min(kpi.achievementRate, 100);
              const isOver100 = kpi.achievementRate > 100;

              return (
                <div key={kpi.id || idx} className="p-5 hover:bg-slate-800/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-950/60 text-blue-400 border border-blue-800/40">
                          {kpi.code}
                        </span>
                        <h4 className="text-sm font-semibold text-white">{kpi.title}</h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Mục tiêu: <span className="text-slate-200 font-medium">{formatKpiUnit(kpi.targetValue, kpi.unit)}</span>
                        {' • '}
                        Thực tế: <span className="text-slate-200 font-medium">{formatKpiUnit(kpi.actualValue, kpi.unit)}</span>
                        {' • '}
                        Trọng số: <span className="text-slate-200 font-medium">{kpi.weight}%</span>
                      </p>
                    </div>

                    <div className="flex sm:flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white font-mono">
                          {kpi.achievementRate}%
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${kpi.tier.badgeClass}`}>
                          {kpi.tier.label}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-semibold text-emerald-400">
                        Thưởng: {formatBonusVnd(kpi.bonusAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        isOver100
                          ? 'bg-gradient-to-r from-blue-500 to-emerald-400'
                          : kpi.achievementRate >= 80
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
