'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Settings,
  Layers,
  Percent,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';

interface PayrollRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  ruleToEdit?: any | null;
}

export function PayrollRuleModal({
  isOpen,
  onClose,
  onSuccess,
  ruleToEdit,
}: PayrollRuleModalProps) {
  const isEditing = Boolean(ruleToEdit);
  const [activeTab, setActiveTab] = useState<'GENERAL' | 'SALARY' | 'OT' | 'INSURANCE' | 'TAX'>('GENERAL');

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));

  // Salary basis
  const [salaryMethod, setSalaryMethod] = useState<'FIXED_DAYS' | 'CALENDAR_WORKING_DAYS' | 'HOURLY'>('FIXED_DAYS');
  const [standardWorkDays, setStandardWorkDays] = useState(22);
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8);

  // Overtime
  const [weekdayMultiplier, setWeekdayMultiplier] = useState(1.5);
  const [weekendMultiplier, setWeekendMultiplier] = useState(2.0);
  const [holidayMultiplier, setHolidayMultiplier] = useState(3.0);
  const [nightBonusRate, setNightBonusRate] = useState(0.3);

  // Insurance
  const [employeeSocialRate, setEmployeeSocialRate] = useState(0.08);
  const [employeeHealthRate, setEmployeeHealthRate] = useState(0.015);
  const [employeeUnemploymentRate, setEmployeeUnemploymentRate] = useState(0.01);
  const [statutoryCap, setStatutoryCap] = useState(46800000);

  // Tax
  const [taxModel, setTaxModel] = useState<'PROGRESSIVE' | 'FLAT' | 'EXEMPT'>('PROGRESSIVE');
  const [personalRelief, setPersonalRelief] = useState(11000000);
  const [dependentRelief, setDependentRelief] = useState(4400000);
  const [flatRate, setFlatRate] = useState(0.1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (ruleToEdit) {
      setCode(ruleToEdit.code);
      setName(ruleToEdit.name);
      setDescription(ruleToEdit.description || '');
      setIsDefault(ruleToEdit.isDefault);
      setEffectiveFrom(new Date(ruleToEdit.effectiveFrom).toISOString().slice(0, 10));

      const sb = ruleToEdit.salaryBasisConfig || {};
      setSalaryMethod(sb.method || 'FIXED_DAYS');
      setStandardWorkDays(sb.standardWorkDays || 22);
      setStandardHoursPerDay(sb.standardHoursPerDay || 8);

      const ot = ruleToEdit.overtimeConfig || {};
      setWeekdayMultiplier(ot.weekdayMultiplier || 1.5);
      setWeekendMultiplier(ot.weekendMultiplier || 2.0);
      setHolidayMultiplier(ot.holidayMultiplier || 3.0);
      setNightBonusRate(ot.nightBonusRate || 0.3);

      const ins = ruleToEdit.insuranceConfig || {};
      setEmployeeSocialRate(ins.employeeSocialRate || 0.08);
      setEmployeeHealthRate(ins.employeeHealthRate || 0.015);
      setEmployeeUnemploymentRate(ins.employeeUnemploymentRate || 0.01);
      setStatutoryCap(ins.statutoryCap || 46800000);

      const tx = ruleToEdit.taxConfig || {};
      setTaxModel(tx.model || 'PROGRESSIVE');
      setPersonalRelief(tx.personalRelief || 11000000);
      setDependentRelief(tx.dependentRelief || 4400000);
      setFlatRate(tx.flatRate || 0.1);
    } else {
      // Initialize with Vietnam 2026 default template values
      setCode('RULE_CUSTOM_' + Math.floor(Math.random() * 1000));
      setName('Quy Chế Tiền Lương Mới');
      setDescription('');
      setIsDefault(false);
      setEffectiveFrom(new Date().toISOString().slice(0, 10));

      setSalaryMethod('FIXED_DAYS');
      setStandardWorkDays(22);
      setStandardHoursPerDay(8);

      setWeekdayMultiplier(1.5);
      setWeekendMultiplier(2.0);
      setHolidayMultiplier(3.0);
      setNightBonusRate(0.3);

      setEmployeeSocialRate(0.08);
      setEmployeeHealthRate(0.015);
      setEmployeeUnemploymentRate(0.01);
      setStatutoryCap(46800000);

      setTaxModel('PROGRESSIVE');
      setPersonalRelief(11000000);
      setDependentRelief(4400000);
      setFlatRate(0.1);
    }
  }, [ruleToEdit, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        isDefault,
        effectiveFrom,
        salaryBasisConfig: {
          method: salaryMethod,
          standardWorkDays: Number(standardWorkDays),
          standardHoursPerDay: Number(standardHoursPerDay),
          prorateUnpaidLeave: true,
          proratePaidLeave: true,
        },
        overtimeConfig: {
          weekdayMultiplier: Number(weekdayMultiplier),
          weekendMultiplier: Number(weekendMultiplier),
          holidayMultiplier: Number(holidayMultiplier),
          nightBonusRate: Number(nightBonusRate),
          nightOtMultiplier: 2.1,
        },
        insuranceConfig: {
          method: 'CONTRACT_SALARY',
          employeeSocialRate: Number(employeeSocialRate),
          employeeHealthRate: Number(employeeHealthRate),
          employeeUnemploymentRate: Number(employeeUnemploymentRate),
          employerSocialRate: 0.175,
          employerHealthRate: 0.03,
          employerUnemploymentRate: 0.01,
          statutoryCap: statutoryCap ? Number(statutoryCap) : null,
          unemploymentCap: 99200000,
        },
        taxConfig: {
          model: taxModel,
          personalRelief: Number(personalRelief),
          dependentRelief: Number(dependentRelief),
          flatRate: Number(flatRate),
          brackets: VIETNAM_STATUTORY_RULE_2026.tax.brackets,
        },
        deductionConfig: {
          unionFeeRate: 0,
          penaltyDeductionTiming: 'POST_TAX_DEDUCTION',
        },
        roundingConfig: {
          method: 'ROUND_HALF_UP',
          unit: 1000,
        },
      };

      const url = isEditing
        ? `/api/v1/payroll/rules/${ruleToEdit.id}`
        : '/api/v1/payroll/rules';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Không thể lưu quy chế lương.');
      }

      setDone(true);
      setTimeout(() => {
        setDone(false);
        onSuccess();
        onClose();
      }, 1000);
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
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isEditing ? `Cấu Hình Quy Chế: ${ruleToEdit.name}` : 'Tạo Quy Chế Lương Mới'}
              </h2>
              <p className="text-xs text-slate-400">
                Thiết lập linh hoạt thông số tính lương, thuế, bảo hiểm và ngày công
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2 gap-2 text-xs overflow-x-auto">
          {[
            { id: 'GENERAL', label: 'Thông Tin Chung' },
            { id: 'SALARY', label: 'Cơ Sở Lương & Công' },
            { id: 'OT', label: 'Tăng Ca (OT)' },
            { id: 'INSURANCE', label: 'Bảo Hiểm' },
            { id: 'TAX', label: 'Thuế TNCN & Giảm Trừ' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2.5 px-3 font-semibold border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Quy chế lương đã được lưu thành công vào cơ sở dữ liệu!</span>
            </div>
          )}

          {/* TAB 1: GENERAL */}
          {activeTab === 'GENERAL' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Mã Quy Chế *</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    disabled={isEditing}
                    placeholder="RULE_STANDARD_2026"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Ngày Hiệu Lực *</label>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tên Quy Chế *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Quy Chế Tiền Lương Doanh Nghiệp 2026"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Mô Tả</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  placeholder="Ghi chú phạm vi đối tượng áp dụng..."
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                />
                <label htmlFor="isDefault" className="font-semibold text-slate-300 cursor-pointer">
                  Đặt làm quy chế tiền lương mặc định của toàn hệ thống
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: SALARY BASIS */}
          {activeTab === 'SALARY' && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Phương Pháp Tính Công</label>
                <select
                  value={salaryMethod}
                  onChange={(e) => setSalaryMethod(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="FIXED_DAYS">Cố Định Số Ngày Chuẩn (ví dụ 22 hoặc 26 ngày/tháng)</option>
                  <option value="CALENDAR_WORKING_DAYS">Theo Ngày Làm Việc Thực Tế Lịch (Trừ T7, CN)</option>
                  <option value="HOURLY">Tính Theo Giờ Thực Tế (Hourly Basis)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Ngày Công Chuẩn / Tháng</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={standardWorkDays}
                    onChange={(e) => setStandardWorkDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Giờ Làm Việc Tiêu Chuẩn / Ngày</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={standardHoursPerDay}
                    onChange={(e) => setStandardHoursPerDay(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OT */}
          {activeTab === 'OT' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Hệ Số Tăng Ca Ngày Thường</label>
                  <input
                    type="number"
                    step="0.1"
                    value={weekdayMultiplier}
                    onChange={(e) => setWeekdayMultiplier(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Mặc định 1.5 (150%)</span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Hệ Số Tăng Ca Cuối Tuần</label>
                  <input
                    type="number"
                    step="0.1"
                    value={weekendMultiplier}
                    onChange={(e) => setWeekendMultiplier(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Mặc định 2.0 (200%)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Hệ Số Tăng Ca Ngày Nghỉ Lễ, Tết</label>
                  <input
                    type="number"
                    step="0.1"
                    value={holidayMultiplier}
                    onChange={(e) => setHolidayMultiplier(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Mặc định 3.0 (300%)</span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Phụ Cấp Làm Việc Ca Đêm (+%)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={nightBonusRate}
                    onChange={(e) => setNightBonusRate(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Mặc định 0.3 (+30%)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INSURANCE */}
          {activeTab === 'INSURANCE' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">BHXH NLĐ (0.08 = 8%)</label>
                  <input
                    type="number"
                    step="0.005"
                    value={employeeSocialRate}
                    onChange={(e) => setEmployeeSocialRate(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">BHYT NLĐ (0.015 = 1.5%)</label>
                  <input
                    type="number"
                    step="0.005"
                    value={employeeHealthRate}
                    onChange={(e) => setEmployeeHealthRate(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">BHTN NLĐ (0.01 = 1%)</label>
                  <input
                    type="number"
                    step="0.005"
                    value={employeeUnemploymentRate}
                    onChange={(e) => setEmployeeUnemploymentRate(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Mức Trần Đóng BHXH, BHYT (VND)</label>
                <input
                  type="number"
                  step="1000000"
                  value={statutoryCap}
                  onChange={(e) => setStatutoryCap(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500">Theo luật: 20 lần mức lương cơ sở (46.800.000 ₫)</span>
              </div>
            </div>
          )}

          {/* TAB 5: TAX */}
          {activeTab === 'TAX' && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Mô Hình Thuế Thu Nhập Cá Nhân</label>
                <select
                  value={taxModel}
                  onChange={(e) => setTaxModel(e.target.value as any)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="PROGRESSIVE">Biểu Thuế Lũy Tiến Từng Phần (7 Bậc Việt Nam)</option>
                  <option value="FLAT">Thuế Suất Phẳng (Flat Rate: 10% hoặc 20%)</option>
                  <option value="EXEMPT">Miễn Thuế TNCN (Exempt)</option>
                </select>
              </div>

              {taxModel === 'PROGRESSIVE' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Giảm Trừ Bản Thân (VND/tháng)</label>
                    <input
                      type="number"
                      step="1000000"
                      value={personalRelief}
                      onChange={(e) => setPersonalRelief(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">Mặc định 11.000.000 ₫</span>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">Giảm Trừ Mỗi NPT (VND/tháng)</label>
                    <input
                      type="number"
                      step="100000"
                      value={dependentRelief}
                      onChange={(e) => setDependentRelief(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-500">Mặc định 4.400.000 ₫</span>
                  </div>
                </div>
              )}

              {taxModel === 'FLAT' && (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Tỷ Lệ Thuế Phẳng (0.1 = 10%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={flatRate}
                    onChange={(e) => setFlatRate(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading || done}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20"
            >
              {loading ? 'Đang Lưu...' : isEditing ? 'Cập Nhật Quy Chế' : 'Tạo Quy Chế Mới'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
