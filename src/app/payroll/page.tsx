'use client';

import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Plus,
  Play,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  RefreshCw,
  Search,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { PayslipModal } from '@/components/payroll/PayslipModal';
import { PayrollWorkflowStepper } from '@/components/payroll/PayrollWorkflowStepper';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';

interface PayrollPeriodItem {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  standardWorkDays: number;
  status: string;
  totalGrossPayout: number;
  totalNetPayout: number;
  payrollRule?: { id: string; code: string; name: string };
  _count?: { payrolls: number };
}

export default function PayrollManagementPage() {
  const [periods, setPeriods] = useState<PayrollPeriodItem[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [periodDetail, setPeriodDetail] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected payslip for modal view
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [isPayslipOpen, setIsPayslipOpen] = useState<boolean>(false);

  // New period modal
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [newPeriodCode, setNewPeriodCode] = useState<string>('');
  const [newPeriodName, setNewPeriodName] = useState<string>('');
  const [newStartDate, setNewStartDate] = useState<string>('');
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [newWorkDays, setNewWorkDays] = useState<number>(22);

  const formatVnd = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);

  // 1. Fetch periods list
  const fetchPeriods = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/v1/payroll/periods');
      const json = await res.json();
      if (json.success && json.data) {
        setPeriods(json.data);
        if (json.data.length > 0 && !selectedPeriodId) {
          setSelectedPeriodId(json.data[0].id);
        }
      }
    } catch (err: any) {
      setError('Không thể tải danh sách kỳ tính lương.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch period detail with payslips
  const fetchPeriodDetail = async (id: string) => {
    if (!id) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/payroll/periods/${id}`);
      const json = await res.json();
      if (json.success) {
        setPeriodDetail(json.data);
      } else {
        setError(json.error?.message || 'Không thể tải chi tiết kỳ tính lương.');
      }
    } catch (err: any) {
      setError('Lỗi khi tải chi tiết kỳ tính lương.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeriods();
  }, []);

  useEffect(() => {
    if (selectedPeriodId) {
      fetchPeriodDetail(selectedPeriodId);
    }
  }, [selectedPeriodId]);

  // 3. Trigger Calculation in ACID Transaction
  const handleCalculatePayroll = async () => {
    if (!selectedPeriodId) return;
    try {
      setCalculating(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch('/api/v1/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId: selectedPeriodId,
          recalculate: true,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMsg(
          `Đã tính toán thành công cho ${json.data.totalEmployees} nhân sự trong transaction an toàn!`
        );
        await fetchPeriods();
        await fetchPeriodDetail(selectedPeriodId);
      } else {
        setError(json.error?.message || 'Tính lương thất bại.');
      }
    } catch (err: any) {
      setError('Lỗi kết nối khi thực thi tính toán bảng lương.');
    } finally {
      setCalculating(false);
    }
  };

  // 4. Create new period
  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      const res = await fetch('/api/v1/payroll/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newPeriodCode,
          name: newPeriodName,
          startDate: newStartDate,
          endDate: newEndDate,
          standardWorkDays: newWorkDays,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setIsCreateOpen(false);
        setNewPeriodCode('');
        setNewPeriodName('');
        await fetchPeriods();
        setSelectedPeriodId(json.data.id);
        setSuccessMsg(`Đã tạo thành công kỳ lương ${json.data.code}`);
      } else {
        setError(json.error?.message || 'Không thể tạo kỳ tính lương.');
      }
    } catch (err: any) {
      setError('Lỗi khi gửi yêu cầu tạo kỳ tính lương.');
    }
  };

  // 5. Open payslip detail modal
  const handleViewPayslip = async (payslipId: string) => {
    try {
      const res = await fetch(`/api/v1/payroll/payslips/${payslipId}`);
      const json = await res.json();
      if (json.success) {
        setSelectedPayslip(json.data);
        setIsPayslipOpen(true);
      }
    } catch (err: any) {
      setError('Không thể tải chi tiết phiếu lương.');
    }
  };

  // Filtered payslips
  const payrollsList = periodDetail?.payrolls || [];
  const filteredPayrolls = payrollsList.filter((p: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const fullName = `${p.employee.lastName} ${p.employee.firstName}`.toLowerCase();
    const code = (p.employee.employeeCode || '').toLowerCase();
    return fullName.includes(term) || code.includes(term);
  });

  // Calculate totals from payslips
  const totalGross = payrollsList.reduce((acc: number, cur: any) => acc + Number(cur.grossIncome || 0), 0);
  const totalNet = payrollsList.reduce((acc: number, cur: any) => acc + Number(cur.netSalary || 0), 0);
  const totalTax = payrollsList.reduce((acc: number, cur: any) => acc + Number(cur.pitTax || 0), 0);
  const totalIns = payrollsList.reduce(
    (acc: number, cur: any) =>
      acc +
      Number(cur.socialInsurance || 0) +
      Number(cur.healthInsurance || 0) +
      Number(cur.unemploymentInsurance || 0),
    0
  );

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              PHASE 15 — DETERMINISTIC PAYROLL CALCULATION
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <Calculator className="w-8 h-8 text-blue-400" />
              Bảng Lương & Động Cơ Tính Lương Chu Kỳ
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Thực thi trong ACID Transaction • Đọc dữ liệu chính thức từ DB • Không tính toán trên React
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a href="/payroll/rules">
              <Button variant="outline" className="border-cyan-500/40 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/50 text-xs">
                Quy Chế Tiền Lương (Rules)
              </Button>
            </a>
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Tạo Kỳ Mới
            </Button>
            <Button
              onClick={handleCalculatePayroll}
              disabled={calculating || !selectedPeriodId || periodDetail?.status === 'APPROVED' || periodDetail?.status === 'PAID' || periodDetail?.status === 'CLOSED'}
              title={
                periodDetail?.status === 'APPROVED' || periodDetail?.status === 'PAID' || periodDetail?.status === 'CLOSED'
                  ? 'Bảng lương đã duyệt hoặc chi trả, không thể tính lại trực tiếp.'
                  : undefined
              }
              className={`text-xs ${
                periodDetail?.status === 'APPROVED' || periodDetail?.status === 'PAID' || periodDetail?.status === 'CLOSED'
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20'
              }`}
            >
              {periodDetail?.status === 'APPROVED' || periodDetail?.status === 'PAID' || periodDetail?.status === 'CLOSED' ? (
                <>
                  <Lock className="w-4 h-4 mr-1.5 text-amber-400" />
                  Đã Khóa Số Liệu ({periodDetail?.status})
                </>
              ) : calculating ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                  Đang Tính Lương (Transaction)...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1.5 fill-current" />
                  Tính Lương Chu Kỳ (Run Calculation)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <ErrorBanner
            description={error}
            onRetry={fetchPeriods}
          />
        )}
        {successMsg && (
          <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 flex items-center gap-3 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Period Selector & Status Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-semibold uppercase">Chọn Kỳ Lương:</span>
            <select
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name} ({p.status})
                </option>
              ))}
            </select>
          </div>

          {periodDetail && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>Khoảng thời gian: <strong className="text-slate-200">{new Date(periodDetail.startDate).toLocaleDateString('vi-VN')} - {new Date(periodDetail.endDate).toLocaleDateString('vi-VN')}</strong></span>
              <span>•</span>
              <span>Công chuẩn: <strong className="text-slate-200">{periodDetail.standardWorkDays} ngày</strong></span>
              <span>•</span>
              <Badge
                variant="outline"
                className={
                  periodDetail.status === 'CALCULATED'
                    ? 'border-blue-500/40 text-blue-400'
                    : periodDetail.status === 'REVIEW'
                    ? 'border-amber-500/40 text-amber-400'
                    : periodDetail.status === 'APPROVED'
                    ? 'border-emerald-500/40 text-emerald-400'
                    : periodDetail.status === 'PAID'
                    ? 'border-purple-500/40 text-purple-400'
                    : 'border-slate-500/40 text-slate-400'
                }
              >
                {periodDetail.status}
              </Badge>
            </div>
          )}
        </div>

        {/* Workflow Approval Stepper Component */}
        {periodDetail && (
          <PayrollWorkflowStepper
            periodId={periodDetail.id}
            periodCode={periodDetail.code}
            currentStatus={periodDetail.status}
            employees={payrollsList.map((p: any) => ({
              id: p.employee.id,
              employeeCode: p.employee.employeeCode,
              firstName: p.employee.firstName,
              lastName: p.employee.lastName,
            }))}
            onStatusChanged={async () => {
              await fetchPeriods();
              await fetchPeriodDetail(selectedPeriodId);
            }}
          />
        )}

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
                <span>Tổng Quỹ Lương (Gross)</span>
                <DollarSign className="w-4 h-4 text-blue-400" />
              </CardDescription>
              <CardTitle className="text-lg sm:text-xl text-white font-extrabold">
                {formatVnd(totalGross)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40 border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
                <span>Tổng Thực Chi (Net Payout)</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </CardDescription>
              <CardTitle className="text-lg sm:text-xl text-emerald-400 font-extrabold">
                {formatVnd(totalNet)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
                <span>Tổng Bảo Hiểm NLĐ</span>
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
              </CardDescription>
              <CardTitle className="text-lg sm:text-xl text-indigo-300 font-extrabold">
                {formatVnd(totalIns)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
                <span>Thuế TNCN Khấu Trừ</span>
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              </CardDescription>
              <CardTitle className="text-lg sm:text-xl text-amber-300 font-extrabold">
                {formatVnd(totalTax)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs text-slate-400 flex items-center justify-between">
                <span>Số Nhân Sự Tính Lương</span>
                <Users className="w-4 h-4 text-purple-400" />
              </CardDescription>
              <CardTitle className="text-lg sm:text-xl text-white font-extrabold">
                {payrollsList.length} nhân viên
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Payslips Table */}
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                Danh Sách Phiếu Lương Nhân Viên Trong Kỳ
              </h2>
              <p className="text-xs text-slate-400">
                Toàn bộ dữ liệu được tính toán chính xác từ chấm công, nghỉ phép và thưởng phạt đã duyệt
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm mã hoặc tên nhân viên..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {loading ? (
            <SkeletonTable rows={5} cols={10} />
          ) : filteredPayrolls.length === 0 ? (
            <EmptyState
              icon="money"
              title="Chưa có bảng lương cho kỳ này"
              description="Nhấn nút 'Tính Lương Chu Kỳ (Run Calculation)' phía trên để kích hoạt động cơ tính lương trong ACID Transaction."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3">Mã NV</th>
                    <th className="p-3">Họ Tên</th>
                    <th className="p-3">Lương Cơ Bản</th>
                    <th className="p-3 text-center">Công</th>
                    <th className="p-3 text-right">Làm Thêm (OT)</th>
                    <th className="p-3 text-right">Thưởng</th>
                    <th className="p-3 text-right">Phạt</th>
                    <th className="p-3 text-right">Bảo Hiểm</th>
                    <th className="p-3 text-right">Thuế TNCN</th>
                    <th className="p-3 text-right font-bold text-emerald-400">Thực Nhận (Net)</th>
                    <th className="p-3 text-center">Hành Động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredPayrolls.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono font-semibold text-blue-300">
                        {p.employee.employeeCode}
                      </td>
                      <td className="p-3 font-medium text-white">
                        {p.employee.lastName} {p.employee.firstName}
                      </td>
                      <td className="p-3 text-slate-300">{formatVnd(Number(p.contractSalary))}</td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="border-slate-700 text-slate-300 font-mono">
                          {Number(p.actualWorkDays)}
                        </Badge>
                      </td>
                      <td className="p-3 text-right text-slate-300">{formatVnd(Number(p.otPay))}</td>
                      <td className="p-3 text-right text-amber-300 font-medium">{formatVnd(Number(p.kpiBonus))}</td>
                      <td className="p-3 text-right text-red-400">{formatVnd(Number(p.totalPenalties))}</td>
                      <td className="p-3 text-right text-slate-300">
                        {formatVnd(
                          Number(p.socialInsurance) + Number(p.healthInsurance) + Number(p.unemploymentInsurance)
                        )}
                      </td>
                      <td className="p-3 text-right text-amber-300">{formatVnd(Number(p.pitTax))}</td>
                      <td className="p-3 text-right font-bold text-emerald-400 text-sm">
                        {formatVnd(Number(p.netSalary))}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => handleViewPayslip(p.id)}
                            className="h-7 px-2.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 text-xs border border-blue-500/30"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Xem
                          </Button>
                          <a
                            href={`/api/v1/payroll/payslips/${p.id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-7 px-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 text-xs border border-emerald-500/30 rounded-md transition-colors"
                            title="Tải PDF Thật"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Payslip Modal */}
      <PayslipModal
        isOpen={isPayslipOpen}
        onClose={() => setIsPayslipOpen(false)}
        payslip={selectedPayslip}
      />

      {/* Create Period Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              Tạo Kỳ Tính Lương Mới
            </h3>
            <form onSubmit={handleCreatePeriod} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Mã kỳ tính lương (e.g. PR-2026-10)</label>
                <input
                  type="text"
                  required
                  placeholder="PR-2026-10"
                  value={newPeriodCode}
                  onChange={(e) => setNewPeriodCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Tên kỳ tính lương</label>
                <input
                  type="text"
                  required
                  placeholder="Kỳ Lương Tháng 10/2026"
                  value={newPeriodName}
                  onChange={(e) => setNewPeriodName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Ngày bắt đầu</label>
                  <input
                    type="date"
                    required
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Ngày kết thúc</label>
                  <input
                    type="date"
                    required
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Số ngày công chuẩn (e.g. 22)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={31}
                  value={newWorkDays}
                  onChange={(e) => setNewWorkDays(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Hủy
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white">
                  Tạo Kỳ
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
