'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Building,
  CreditCard,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  FileSpreadsheet,
  Download,
  Clock,
  Briefcase,
  ShieldCheck,
  Building2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PayslipDetailItem {
  id?: string;
  itemType: string;
  itemCode: string;
  description: string;
  amount: number;
}

export interface PayslipData {
  id: string;
  periodId: string;
  company?: string;
  contractSalary: number;
  standardWorkDays?: number;
  actualWorkDays: number;
  workHours?: number;
  overtimeHours?: number;
  paidLeaveDays: number;
  proratedSalary: number;
  otPay: number;
  kpiBonus: number;
  allowances: number;
  otherBonuses: number;
  totalPenalties: number;
  grossIncome: number;
  socialInsurance: number;
  healthInsurance: number;
  unemploymentInsurance: number;
  taxableIncome: number;
  personalRelief: number;
  dependentsRelief: number;
  assessableIncome: number;
  pitTax: number;
  netSalary: number;
  paymentStatus: string;
  period?: {
    id: string;
    code: string;
    name: string;
    startDate: string;
    endDate: string;
    standardWorkDays?: number;
  };
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { name: string };
    position?: { title: string };
    bankAccountNo?: string;
    bankName?: string;
  };
  details?: PayslipDetailItem[];
}

interface PayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  payslip: PayslipData | null;
}

export function PayslipModal({ isOpen, onClose, payslip }: PayslipModalProps) {
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !payslip) return null;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);

  const totalInsurance =
    Number(payslip.socialInsurance || 0) +
    Number(payslip.healthInsurance || 0) +
    Number(payslip.unemploymentInsurance || 0);

  const totalBonuses = Number(payslip.kpiBonus || 0) + Number(payslip.otherBonuses || 0);
  const totalPenalties = Number(payslip.totalPenalties || 0);
  const totalDeductions = totalInsurance + Number(payslip.pitTax || 0) + totalPenalties;

  const workingDays =
    payslip.standardWorkDays || payslip.period?.standardWorkDays || 22;
  const actualDays = Number(payslip.actualWorkDays) || 0;
  const workHours = payslip.workHours ?? Math.round(actualDays * 8);
  const overtimeHours = payslip.overtimeHours ?? 0;
  const companyName = payslip.company || 'CÔNG TY CỔ PHẦN CÔNG NGHỆ ANTIGRAVITY';

  const handleDownloadPdf = () => {
    setDownloading(true);
    const pdfUrl = `/api/v1/payroll/payslips/${payslip.id}/pdf`;
    const win = window.open(pdfUrl, '_blank');
    if (!win) {
      // If popup blocked, use anchor click
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `payslip-${payslip.employee.employeeCode}-${payslip.period?.code || 'payroll'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => setDownloading(false), 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl p-4 sm:p-6 md:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
        {/* Company Header & Top Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400 font-medium">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                {companyName}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white flex flex-wrap items-center gap-2 mt-0.5">
                Phiếu Lương Chi Tiết (Payslip)
                <Badge variant="outline" className="text-blue-400 border-blue-500/30 font-mono">
                  {payslip.period?.code || 'Kỳ Lương'}
                </Badge>
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 gap-1.5 text-xs sm:text-sm"
              size="sm"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {downloading ? 'Đang tạo PDF...' : 'Tải PDF Thật'}
            </Button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Employee Info Header */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950/60 text-sm">
          <div className="flex items-center gap-2.5">
            <User className="w-4 h-4 text-blue-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400">Nhân viên</div>
              <div className="font-semibold text-white">
                {payslip.employee.lastName} {payslip.employee.firstName}
              </div>
              <div className="text-xs font-mono text-blue-300">
                Mã: {payslip.employee.employeeCode}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Building className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400">Phòng ban & Chức vụ</div>
              <div className="font-medium text-slate-200">
                {payslip.employee.department?.name || 'Văn phòng'}
              </div>
              <div className="text-xs text-slate-400">
                {payslip.employee.position?.title || 'Nhân viên'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs text-slate-400">Tài khoản thanh toán</div>
              <div className="font-medium text-slate-200 truncate max-w-[200px]">
                {payslip.employee.bankAccountNo
                  ? `${payslip.employee.bankAccountNo} (${payslip.employee.bankName || 'Ngân hàng'})`
                  : 'Tiền mặt'}
              </div>
              <Badge
                variant="outline"
                className={`mt-1 text-[10px] ${
                  payslip.paymentStatus === 'PAID'
                    ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/20'
                    : 'border-amber-500/40 text-amber-400 bg-amber-950/20'
                }`}
              >
                {payslip.paymentStatus === 'PAID' ? 'Đã Thanh Toán' : 'Chờ Thanh Toán'}
              </Badge>
            </div>
          </div>
        </div>

        {/* 4 Working & Attendance Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 text-center">
            <div className="text-xs text-slate-400">Ngày công chuẩn</div>
            <div className="text-base sm:text-lg font-bold text-white mt-0.5">
              {workingDays} ngày
            </div>
          </div>
          <div className="p-3 rounded-xl border border-blue-900/30 bg-blue-950/20 text-center">
            <div className="text-xs text-blue-300">Công thực tế</div>
            <div className="text-base sm:text-lg font-bold text-blue-400 mt-0.5">
              {actualDays} ngày
            </div>
          </div>
          <div className="p-3 rounded-xl border border-emerald-900/30 bg-emerald-950/20 text-center">
            <div className="text-xs text-emerald-300 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> Tổng giờ làm
            </div>
            <div className="text-base sm:text-lg font-bold text-emerald-400 mt-0.5">
              {workHours} giờ
            </div>
          </div>
          <div className="p-3 rounded-xl border border-amber-900/30 bg-amber-950/20 text-center">
            <div className="text-xs text-amber-300">Làm thêm (OT)</div>
            <div className="text-base sm:text-lg font-bold text-amber-400 mt-0.5">
              {overtimeHours} giờ
            </div>
          </div>
        </div>

        {/* Two-Column Breakdown: Thu Nhập (Earnings) vs Các Khoản Giảm Trừ (Deductions) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Earnings Column */}
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-800/30 pb-2">
              <h3 className="text-xs sm:text-sm font-bold text-emerald-400 flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4" />
                CÁC KHOẢN THU NHẬP (EARNINGS)
              </h3>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                Công: {actualDays} ngày
              </Badge>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Lương hợp đồng cơ bản:</span>
                <span className="font-medium text-slate-200">
                  {formatCurrency(Number(payslip.contractSalary))}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Lương theo công thực tế:</span>
                <span className="font-medium text-white">
                  {formatCurrency(Number(payslip.proratedSalary))}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Làm thêm giờ (Overtime pay):</span>
                <span className="font-medium text-emerald-300">
                  {formatCurrency(Number(payslip.otPay))}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Tiền thưởng (Bonuses):</span>
                <span className="font-medium text-amber-300">
                  {formatCurrency(totalBonuses)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Phụ cấp công việc:</span>
                <span className="font-medium text-slate-200">
                  {formatCurrency(Number(payslip.allowances))}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-emerald-800/30 flex justify-between items-center text-xs sm:text-sm font-bold">
              <span className="text-emerald-300">TỔNG THU NHẬP GỘP (GROSS):</span>
              <span className="text-sm sm:text-base text-emerald-400">
                {formatCurrency(Number(payslip.grossIncome))}
              </span>
            </div>
          </div>

          {/* Deductions Column */}
          <div className="rounded-xl border border-red-900/40 bg-red-950/10 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-red-800/30 pb-2">
              <h3 className="text-xs sm:text-sm font-bold text-red-400 flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4" />
                CÁC KHOẢN KHẤU TRỪ (DEDUCTIONS)
              </h3>
              <Badge variant="outline" className="border-red-500/30 text-red-400 text-xs">
                BH & Thuế & Phạt
              </Badge>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Bảo hiểm Xã hội (BHXH 8%):</span>
                <span className="font-medium text-slate-200">
                  {formatCurrency(Number(payslip.socialInsurance))}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Bảo hiểm Y tế (BHYT 1.5%):</span>
                <span className="font-medium text-slate-200">
                  {formatCurrency(Number(payslip.healthInsurance))}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Bảo hiểm Thất nghiệp (BHTN 1%):</span>
                <span className="font-medium text-slate-200">
                  {formatCurrency(Number(payslip.unemploymentInsurance))}
                </span>
              </div>
              <div className="flex justify-between text-slate-300 border-t border-red-900/20 pt-1">
                <span className="text-red-300">Tổng bảo hiểm (Insurance):</span>
                <span className="font-semibold text-red-300">
                  {formatCurrency(totalInsurance)}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Thuế TNCN (Tax):</span>
                <span className="font-medium text-amber-300">
                  {formatCurrency(Number(payslip.pitTax))}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Kỷ luật & Phạt (Penalties):</span>
                <span className="font-medium text-red-400">
                  {formatCurrency(totalPenalties)}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-red-800/30 flex justify-between items-center text-xs sm:text-sm font-bold">
              <span className="text-red-300">TỔNG KHẤU TRỪ (DEDUCTIONS):</span>
              <span className="text-sm sm:text-base text-red-400">
                {formatCurrency(totalDeductions)}
              </span>
            </div>
          </div>
        </div>

        {/* Final Net Salary Banner */}
        <div className="rounded-2xl border-2 border-emerald-500/60 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-emerald-400">
              LƯƠNG THỰC LĨNH CHUYỂN KHOẢN (NET SALARY)
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
              {formatCurrency(Number(payslip.netSalary))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Xuất PDF Phiếu Lương
            </Button>
            <Badge className="bg-slate-800 text-slate-200 border border-slate-700 py-1.5 px-3">
              {payslip.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Chờ thanh toán'}
            </Badge>
          </div>
        </div>

        {/* Line Items Audit Table if available */}
        {payslip.details && payslip.details.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs sm:text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              Bảng Kê Chi Tiết Từng Dòng Nghiệp Vụ (Line Items Audit)
            </h4>
            <div className="rounded-xl border border-slate-800 overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[500px]">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Loại</th>
                    <th className="p-3">Mã</th>
                    <th className="p-3">Mô tả nghiệp vụ</th>
                    <th className="p-3 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {payslip.details.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={
                            item.itemType === 'EARNING' || item.itemType === 'BONUS'
                              ? 'border-emerald-500/30 text-emerald-400'
                              : 'border-red-500/30 text-red-400'
                          }
                        >
                          {item.itemType}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{item.itemCode}</td>
                      <td className="p-3 text-slate-200">{item.description}</td>
                      <td className="p-3 text-right font-medium text-white">
                        {formatCurrency(Number(item.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800 text-xs text-slate-400">
          <div>
            Mã tra cứu hệ thống: <span className="font-mono text-slate-300">{payslip.id}</span>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={onClose}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Đóng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
