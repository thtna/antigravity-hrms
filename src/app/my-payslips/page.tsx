'use client';

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Eye,
  Calendar,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  Building2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PayslipModal, PayslipData } from '@/components/payroll/PayslipModal';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorBanner } from '@/components/ui/error-state';
import { useToastHelpers } from '@/components/ui/toast';

interface MyPayslipSummary {
  id: string;
  periodId: string;
  periodCode: string;
  periodName: string;
  startDate: string;
  endDate: string;
  periodStatus: string;
  company: string;
  employee: {
    id: string;
    employeeCode: string;
    name: string;
    department?: string;
    position?: string;
  };
  contractSalary: number;
  standardWorkDays: number;
  actualWorkDays: number;
  otPay: number;
  totalBonuses: number;
  allowances: number;
  totalPenalties: number;
  grossIncome: number;
  totalInsurance: number;
  socialInsurance: number;
  healthInsurance: number;
  unemploymentInsurance: number;
  pitTax: number;
  totalDeductions: number;
  netSalary: number;
  paymentStatus: string;
  createdAt: string;
}

export default function MyPayslipsPage() {
  const { error: toastError } = useToastHelpers();
  const [payslips, setPayslips] = useState<MyPayslipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPayslip, setSelectedPayslip] = useState<PayslipData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchMyPayslips = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/payroll/payslips/my');
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Không thể tải danh sách phiếu lương');
      }
      setPayslips(json.data || []);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi kết nối máy chủ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyPayslips();
  }, []);

  const handleOpenDetail = async (id: string) => {
    setLoadingDetailId(id);
    try {
      const res = await fetch(`/api/v1/payroll/payslips/${id}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Lỗi tải chi tiết');
      }
      setSelectedPayslip(json.data);
      setModalOpen(true);
    } catch (err: any) {
      toastError('Không thể mở chi tiết', err.message || 'Không thể mở chi tiết phiếu lương');
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleDownloadPdf = (id: string, employeeCode: string, periodCode: string) => {
    setDownloadingId(id);
    const pdfUrl = `/api/v1/payroll/payslips/${id}/pdf`;
    const win = window.open(pdfUrl, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = pdfUrl;
      a.download = `payslip-${employeeCode}-${periodCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => setDownloadingId(null), 1000);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);

  const latestPayslip = payslips.length > 0 ? payslips[0] : null;

  return (
    <AppShell>
      <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-blue-400 font-semibold">
            <Building2 className="w-4 h-4" />
            Cổng Tự Phục Vụ Nhân Viên (Employee Self-Service)
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Phiếu Lương Của Tôi (My Payslips)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Tra cứu lịch sử thu nhập, chi tiết khấu trừ và tải file PDF chính thức có dấu xác thực.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={fetchMyPayslips}
            disabled={loading}
            variant="outline"
            className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 gap-2 text-xs sm:text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Security & Access Notice */}
      <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 flex items-start gap-3 text-xs sm:text-sm text-slate-300">
        <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Bảo mật thông tin tiền lương:</span> Bạn chỉ
          có quyền truy cập phiếu lương của chính mình. Dữ liệu được mã hóa và tạo trực tiếp từ sổ
          lương đã được phòng Kế toán & Ban Giám đốc phê duyệt.
        </div>
      </div>

      {/* Highlights / Quick Stats for Latest Period */}
      {latestPayslip && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
            <CardContent className="p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Kỳ Lương Mới Nhất ({latestPayslip.periodCode})
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2">
                {formatCurrency(latestPayslip.netSalary)}
              </div>
              <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                <span>Trạng thái chi trả:</span>
                <Badge
                  className={
                    latestPayslip.paymentStatus === 'PAID'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-600 text-white'
                  }
                >
                  {latestPayslip.paymentStatus === 'PAID' ? 'Đã Thanh Toán' : 'Chờ Thanh Toán'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
            <CardContent className="p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Tổng Thu Nhập Gộp (Gross)
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-white mt-2">
                {formatCurrency(latestPayslip.grossIncome)}
              </div>
              <div className="text-xs text-slate-400 mt-2 flex justify-between">
                <span>Công thực tế:</span>
                <span className="text-blue-400 font-semibold">
                  {latestPayslip.actualWorkDays} / {latestPayslip.standardWorkDays} ngày
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/90 shadow-xl">
            <CardContent className="p-5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Tổng Các Khoản Khấu Trừ
              </div>
              <div className="text-2xl sm:text-3xl font-bold text-red-400 mt-2">
                {formatCurrency(latestPayslip.totalDeductions)}
              </div>
              <div className="text-xs text-slate-400 mt-2 flex justify-between">
                <span>BH + Thuế TNCN:</span>
                <span className="text-slate-300 font-mono">
                  {formatCurrency(latestPayslip.totalInsurance + latestPayslip.pitTax)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <SkeletonTable rows={4} cols={8} />
      ) : error ? (
        <ErrorBanner description={error} onRetry={fetchMyPayslips} />
      ) : payslips.length === 0 ? (
        <EmptyState
          icon="money"
          title="Chưa có phiếu lương nào"
          description="Hồ sơ lương của bạn sẽ hiển thị tại đây khi phòng Nhân sự tiến hành tính toán và xuất sổ lương cho kỳ làm việc."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              Lịch Sử Các Kỳ Lương ({payslips.length})
            </h2>
          </div>

          {/* Desktop Table (hidden on small mobile, visible on sm/md/lg) */}
          <div className="hidden sm:block rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Kỳ lương</th>
                  <th className="p-4">Công thực tế</th>
                  <th className="p-4 text-right">Lương cơ bản</th>
                  <th className="p-4 text-right">Thu nhập gộp (Gross)</th>
                  <th className="p-4 text-right">Khấu trừ</th>
                  <th className="p-4 text-right">Thực lĩnh (Net)</th>
                  <th className="p-4 text-center">Trạng thái</th>
                  <th className="p-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {payslips.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-white">{p.periodCode}</div>
                      <div className="text-[11px] text-slate-400">{p.periodName}</div>
                    </td>
                    <td className="p-4 font-mono text-slate-300">
                      {p.actualWorkDays} / {p.standardWorkDays} ngày
                    </td>
                    <td className="p-4 text-right text-slate-300">
                      {formatCurrency(p.contractSalary)}
                    </td>
                    <td className="p-4 text-right font-medium text-emerald-400">
                      {formatCurrency(p.grossIncome)}
                    </td>
                    <td className="p-4 text-right text-red-400">
                      {formatCurrency(p.totalDeductions)}
                    </td>
                    <td className="p-4 text-right font-bold text-white text-sm">
                      {formatCurrency(p.netSalary)}
                    </td>
                    <td className="p-4 text-center">
                      <Badge
                        variant="outline"
                        className={
                          p.paymentStatus === 'PAID'
                            ? 'border-emerald-500/30 text-emerald-400 bg-emerald-950/20'
                            : 'border-amber-500/30 text-amber-400 bg-amber-950/20'
                        }
                      >
                        {p.paymentStatus === 'PAID' ? 'Đã Thanh Toán' : 'Chờ Thanh Toán'}
                      </Badge>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          onClick={() => handleOpenDetail(p.id)}
                          disabled={loadingDetailId === p.id}
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-950/50"
                        >
                          {loadingDetailId === p.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 mr-1" />
                          )}
                          Chi tiết
                        </Button>
                        <Button
                          onClick={() =>
                            handleDownloadPdf(p.id, p.employee.employeeCode, p.periodCode)
                          }
                          disabled={downloadingId === p.id}
                          size="sm"
                          className="h-8 px-2 bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20"
                        >
                          {downloadingId === p.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5 mr-1" />
                          )}
                          Tải PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List (visible only on screens < 640px) */}
          <div className="block sm:hidden space-y-3">
            {payslips.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 shadow-lg"
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div>
                    <div className="font-bold text-white text-base">{p.periodCode}</div>
                    <div className="text-xs text-slate-400">{p.periodName}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      p.paymentStatus === 'PAID'
                        ? 'border-emerald-500/40 text-emerald-400 bg-emerald-950/30'
                        : 'border-amber-500/40 text-amber-400 bg-amber-950/30'
                    }
                  >
                    {p.paymentStatus === 'PAID' ? 'Đã Thanh Toán' : 'Chờ Thanh Toán'}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Công thực tế:</span>
                    <span className="font-medium text-white">
                      {p.actualWorkDays} / {p.standardWorkDays} ngày
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tổng thu nhập gộp:</span>
                    <span className="font-semibold text-emerald-400">
                      {formatCurrency(p.grossIncome)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tổng khấu trừ:</span>
                    <span className="font-semibold text-red-400">
                      {formatCurrency(p.totalDeductions)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                      Thực Lĩnh (Net)
                    </div>
                    <div className="text-lg font-extrabold text-white">
                      {formatCurrency(p.netSalary)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleOpenDetail(p.id)}
                      disabled={loadingDetailId === p.id}
                      variant="outline"
                      size="sm"
                      className="border-slate-700 text-slate-200 h-8 px-2.5 text-xs"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Xem
                    </Button>
                    <Button
                      onClick={() => handleDownloadPdf(p.id, p.employee.employeeCode, p.periodCode)}
                      disabled={downloadingId === p.id}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-500 text-white h-8 px-2.5 text-xs"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal for viewing full payslip details */}
      <PayslipModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        payslip={selectedPayslip}
      />
      </div>
    </AppShell>
  );
}
