'use client';

import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Calculator,
  DollarSign,
  ShieldCheck,
  TrendingUp,
  Percent,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import { PayrollRuleEngine } from '@/lib/payroll/payroll-rule-engine';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import { PayrollRuleConfig } from '@/lib/payroll/types';
import { formatVnd } from '@/lib/payroll/decimal-math';

interface PayrollSimulatorWidgetProps {
  availableRules?: any[];
  initialRuleConfig?: PayrollRuleConfig;
}

export function PayrollSimulatorWidget({
  availableRules = [],
  initialRuleConfig = VIETNAM_STATUTORY_RULE_2026,
}: PayrollSimulatorWidgetProps) {
  const [selectedRuleId, setSelectedRuleId] = useState<string>('DEFAULT');
  const [contractSalary, setContractSalary] = useState<number>(25000000); // 25M
  const [actualWorkDays, setActualWorkDays] = useState<number>(22);
  const [paidLeaveDays, setPaidLeaveDays] = useState<number>(0);
  const [dependentsCount, setDependentsCount] = useState<number>(1);
  const [allowances, setAllowances] = useState<number>(1000000);
  const [taxExemptAllowances, setTaxExemptAllowances] = useState<number>(730000);
  const [weekdayOtHours, setWeekdayOtHours] = useState<number>(4);
  const [weekendOtHours, setWeekendOtHours] = useState<number>(0);
  const [holidayOtHours, setHolidayOtHours] = useState<number>(0);
  const [kpiBonus, setKpiBonus] = useState<number>(2000000);
  const [otherBonuses, setOtherBonuses] = useState<number>(0);
  const [penalties, setPenalties] = useState<number>(0);

  // Active rule resolution
  const activeRuleConfig = useMemo<PayrollRuleConfig>(() => {
    if (selectedRuleId !== 'DEFAULT' && availableRules.length > 0) {
      const found = availableRules.find((r) => r.id === selectedRuleId);
      if (found) {
        return {
          ruleCode: found.code,
          ruleName: found.name,
          salaryBasis: found.salaryBasisConfig,
          overtime: found.overtimeConfig,
          insurance: found.insuranceConfig,
          tax: found.taxConfig,
          deduction: found.deductionConfig,
          rounding: found.roundingConfig,
        };
      }
    }
    return initialRuleConfig;
  }, [selectedRuleId, availableRules, initialRuleConfig]);

  // Real-time calculation via Pure Engine
  const result = useMemo(() => {
    return PayrollRuleEngine.calculate({
      employee: {
        contractSalary: contractSalary || 0,
        dependentsCount: dependentsCount || 0,
        allowances: allowances || 0,
        taxExemptAllowances: taxExemptAllowances || 0,
      },
      attendance: {
        actualWorkDays: actualWorkDays || 0,
        paidLeaveDays: paidLeaveDays || 0,
        weekdayOtHours: weekdayOtHours || 0,
        weekendOtHours: weekendOtHours || 0,
        holidayOtHours: holidayOtHours || 0,
      },
      adjustments: {
        kpiBonus: kpiBonus || 0,
        otherBonuses: otherBonuses || 0,
        penalties: penalties || 0,
      },
      period: new Date().toISOString().slice(0, 7),
      ruleConfig: activeRuleConfig,
    });
  }, [
    contractSalary,
    actualWorkDays,
    paidLeaveDays,
    dependentsCount,
    allowances,
    taxExemptAllowances,
    weekdayOtHours,
    weekendOtHours,
    holidayOtHours,
    kpiBonus,
    otherBonuses,
    penalties,
    activeRuleConfig,
  ]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Giả Lập Tính Lương Trực Tuyến (Payroll Rule Simulator)
              <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                Decimal-Safe
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Kiểm tra tính đúng đắn của quy chế lương với các trường hợp biên độ và thông số thực tế
            </p>
          </div>
        </div>

        {/* Rule Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Quy chế áp dụng:</span>
          <select
            value={selectedRuleId}
            onChange={(e) => setSelectedRuleId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="DEFAULT">
              {initialRuleConfig.ruleName || 'Quy Chế Mặc Định (VN Statutory 2026)'}
            </option>
            {availableRules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid: Inputs (Left) vs Output Breakdown (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Inputs (5 cols) */}
        <div className="lg:col-span-5 space-y-4 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-blue-400" />
            Thông Số Đầu Vào Thử Nghiệm
          </h3>

          {/* Lương hợp đồng */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Lương Hợp Đồng / Tháng (VND)
            </label>
            <input
              type="number"
              step="1000000"
              value={contractSalary}
              onChange={(e) => setContractSalary(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Ngày công & Phép */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Công Thực Tế (Ngày)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="31"
                value={actualWorkDays}
                onChange={(e) => setActualWorkDays(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nghỉ Phép Năm (Ngày)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="31"
                value={paidLeaveDays}
                onChange={(e) => setPaidLeaveDays(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Giờ làm thêm */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">OT Ngày (h)</label>
              <input
                type="number"
                min="0"
                value={weekdayOtHours}
                onChange={(e) => setWeekdayOtHours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">OT Tuần (h)</label>
              <input
                type="number"
                min="0"
                value={weekendOtHours}
                onChange={(e) => setWeekendOtHours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">OT Lễ (h)</label>
              <input
                type="number"
                min="0"
                value={holidayOtHours}
                onChange={(e) => setHolidayOtHours(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Phụ cấp & Miễn thuế */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tổng Phụ Cấp (VND)</label>
              <input
                type="number"
                step="100000"
                value={allowances}
                onChange={(e) => setAllowances(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">PC Miễn Thuế (VND)</label>
              <input
                type="number"
                step="100000"
                value={taxExemptAllowances}
                onChange={(e) => setTaxExemptAllowances(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Người phụ thuộc */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Số Người Phụ Thuộc (NPT)</label>
            <input
              type="number"
              min="0"
              max="10"
              value={dependentsCount}
              onChange={(e) => setDependentsCount(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Thưởng KPI & Phạt */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Thưởng KPI (VND)</label>
              <input
                type="number"
                step="500000"
                value={kpiBonus}
                onChange={(e) => setKpiBonus(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-emerald-400 font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Khấu Trừ Phạt (VND)</label>
              <input
                type="number"
                step="100000"
                value={penalties}
                onChange={(e) => setPenalties(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-rose-400 font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Right Output Breakdown (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Net Highlight Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-slate-900/80 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Lương Thực Nhận (Net Salary)
              </span>
              <div className="text-3xl lg:text-4xl font-black font-mono text-white mt-1">
                {formatVnd(result.netSalary)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Đã làm tròn theo quy chế: {activeRuleConfig.rounding.method} ({activeRuleConfig.rounding.unit} ₫)
              </p>
            </div>
            <div className="text-right sm:border-l sm:border-slate-800 sm:pl-6">
              <span className="text-xs text-slate-400">Tổng Chi Phí Doanh Nghiệp</span>
              <p className="text-lg font-bold font-mono text-blue-300 mt-0.5">
                {formatVnd(result.totalCompanyCost)}
              </p>
              <span className="text-[11px] text-slate-500">Gross + BH NSDLĐ</span>
            </div>
          </div>

          {/* Breakdown Steps Accordion / Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Thu Nhập (Earnings) */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  Thu Nhập Tổng (Gross)
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatVnd(result.grossIncome)}
                </span>
              </div>
              <div className="space-y-1 text-slate-300 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Lương cơ bản thực tế:</span>
                  <span className="font-mono">{formatVnd(result.proratedBaseSalary)}</span>
                </div>
                {result.overtime.totalOt > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tiền làm thêm (OT):</span>
                    <span className="font-mono text-amber-300">
                      +{formatVnd(result.overtime.totalOt)}
                    </span>
                  </div>
                )}
                {result.bonuses.total > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Khen thưởng (KPI/Dự án):</span>
                    <span className="font-mono text-emerald-300">
                      +{formatVnd(result.bonuses.total)}
                    </span>
                  </div>
                )}
                {result.allowances.total > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phụ cấp:</span>
                    <span className="font-mono">+{formatVnd(result.allowances.total)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                  <span>Đơn giá giờ chuẩn:</span>
                  <span className="font-mono">{formatVnd(result.hourlyRate)} / h</span>
                </div>
              </div>
            </div>

            {/* Bảo Hiểm (Insurance) */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-blue-400" />
                  Bảo Hiểm Bắt Buộc (NLĐ)
                </span>
                <span className="font-mono font-bold text-blue-400">
                  -{formatVnd(result.insurance.totalEmployee)}
                </span>
              </div>
              <div className="space-y-1 text-slate-300 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">
                    BHXH ({(activeRuleConfig.insurance.employeeSocialRate * 100).toFixed(1)}%):
                  </span>
                  <span className="font-mono">{formatVnd(result.insurance.social)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">
                    BHYT ({(activeRuleConfig.insurance.employeeHealthRate * 100).toFixed(1)}%):
                  </span>
                  <span className="font-mono">{formatVnd(result.insurance.health)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">
                    BHTN ({(activeRuleConfig.insurance.employeeUnemploymentRate * 100).toFixed(1)}%):
                  </span>
                  <span className="font-mono">{formatVnd(result.insurance.unemployment)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                  <span>NSDLĐ đóng thêm:</span>
                  <span className="font-mono">{formatVnd(result.insurance.totalEmployer)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Thuế TNCN (PIT) Details with Brackets */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Percent className="h-4 w-4 text-amber-400" />
                Thuế Thu Nhập Cá Nhân (PIT) — Mô hình {activeRuleConfig.tax.model}
              </span>
              <span className="font-mono font-bold text-amber-400 text-xs">
                -{formatVnd(result.tax.pitTax)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400">
              <div>
                <span>Thu nhập chịu thuế:</span>
                <p className="font-mono text-white font-semibold">
                  {formatVnd(result.tax.taxableIncome)}
                </p>
              </div>
              <div>
                <span>Giảm trừ bản thân:</span>
                <p className="font-mono text-white font-semibold">
                  {formatVnd(result.tax.personalRelief)}
                </p>
              </div>
              <div>
                <span>Giảm trừ {dependentsCount} NPT:</span>
                <p className="font-mono text-white font-semibold">
                  {formatVnd(result.tax.dependentsRelief)}
                </p>
              </div>
              <div>
                <span>Thu nhập tính thuế:</span>
                <p className="font-mono text-amber-300 font-bold">
                  {formatVnd(result.tax.assessableIncome)}
                </p>
              </div>
            </div>

            {/* Step by step brackets hit */}
            {result.tax.bracketSteps.length > 0 && (
              <div className="pt-2 border-t border-slate-800/60">
                <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                  Phân Bổ Bậc Thuế Lũy Tiến Từng Phần:
                </span>
                <div className="space-y-1">
                  {result.tax.bracketSteps.map((step) => (
                    <div
                      key={step.bracketNumber}
                      className="flex items-center justify-between text-[11px] bg-slate-800/40 px-2.5 py-1 rounded"
                    >
                      <span className="text-slate-300">
                        Bậc {step.bracketNumber} (Thuế suất {(step.rate * 100).toFixed(0)}% trên{' '}
                        {formatVnd(step.taxableInBracket)}):
                      </span>
                      <span className="font-mono text-amber-300">
                        {formatVnd(step.taxAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
