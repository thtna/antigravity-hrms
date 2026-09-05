'use client';

import React, { useState } from 'react';
import { EmployeeDashboardData } from '@/lib/services/dashboard.service';
import { StatCard } from './StatCard';
import { SvgAreaLineChart, SvgDonutProgress } from './SvgCharts';
import {
  Clock,
  CalendarCheck,
  TrendingUp,
  CreditCard,
  FileText,
  Bell,
  CheckCircle2,
  AlertCircle,
  Download,
  ExternalLink,
  MapPin,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

export interface EmployeeDashboardViewProps {
  data: EmployeeDashboardData;
  onMarkNotificationRead?: (id?: string) => Promise<void>;
}

export function EmployeeDashboardView({ data, onMarkNotificationRead }: EmployeeDashboardViewProps) {
  const [markingRead, setMarkingRead] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(val);
  };

  const handleNotificationRead = async (id?: string) => {
    if (!onMarkNotificationRead) return;
    try {
      setMarkingRead(true);
      await onMarkNotificationRead(id);
    } finally {
      setMarkingRead(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Welcome & Employee Identity Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-slate-900/40 p-6 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-0.5 text-xs font-semibold text-blue-400">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            CỔNG THÔNG TIN NHÂN VIÊN (SELF-SERVICE PORTAL)
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Xin chào, {data.employee.fullName}
          </h2>
          <p className="text-sm text-slate-400 max-w-2xl">
            Mã NV: <span className="font-mono text-blue-400">{data.employee.employeeCode}</span> • Vị trí:{' '}
            <span className="text-slate-200">{data.employee.positionTitle}</span> • Phòng ban:{' '}
            <span className="text-slate-200">{data.employee.departmentName}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/attendance"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 transition-all"
          >
            <QrCode className="h-4 w-4" />
            Chấm Công Ngay
          </Link>
          <Link
            href="/leaves"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors"
          >
            <CalendarCheck className="h-4 w-4 text-purple-400" />
            Xin Nghỉ Phép
          </Link>
        </div>
      </div>

      {/* Today's Attendance Real-time Status Card */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Điểm Danh Hôm Nay ({data.todayAttendance.workDate})
            </span>
            <div className="mt-1 text-xl font-bold text-white flex items-center gap-3">
              {data.todayAttendance.statusLabel}
              {data.todayAttendance.checkInMethod && (
                <span className="text-xs font-mono font-normal rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300">
                  Phương thức: {data.todayAttendance.checkInMethod}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2">
              <span className="text-slate-400 block text-[11px]">Giờ Check-in</span>
              <span className="font-mono text-sm font-semibold text-emerald-400">
                {data.todayAttendance.checkInTime
                  ? new Date(data.todayAttendance.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'Chưa có'}
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2">
              <span className="text-slate-400 block text-[11px]">Giờ Check-out</span>
              <span className="font-mono text-sm font-semibold text-blue-400">
                {data.todayAttendance.checkOutTime
                  ? new Date(data.todayAttendance.checkOutTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'Đang làm việc'}
              </span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2">
              <span className="text-slate-400 block text-[11px]">Đi muộn / Về sớm</span>
              <span className="font-mono text-sm font-semibold text-amber-400">
                {data.todayAttendance.lateMinutes > 0 ? `Muộn ${data.todayAttendance.lateMinutes}p` : 'Đúng giờ'}
              </span>
            </div>
          </div>
        </div>

        {/* Attendance Sub-bar with hours */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <span className="text-[11px] text-slate-400">Giờ làm hôm nay</span>
            <p className="text-base font-bold text-white font-mono">{data.todayAttendance.actualWorkHours} giờ</p>
          </div>
          <div>
            <span className="text-[11px] text-slate-400">Tăng ca hôm nay</span>
            <p className="text-base font-bold text-amber-400 font-mono">{data.todayAttendance.otHours} giờ</p>
          </div>
          <div>
            <span className="text-[11px] text-slate-400">Tích lũy tháng này</span>
            <p className="text-base font-bold text-emerald-400 font-mono">{data.workingHours.monthTotalHours} / {data.workingHours.standardMonthHours} giờ</p>
          </div>
          <div>
            <span className="text-[11px] text-slate-400">Tiến độ giờ chuẩn</span>
            <p className="text-base font-bold text-blue-400 font-mono">{data.workingHours.completionPercentage}%</p>
          </div>
        </div>
      </div>

      {/* Primary Metrics Cards: Working Hours, Overtime, Leave, KPI, Salary, Payslip */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          Chỉ Số Cá Nhân Trọng Điểm
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Working Hours & Progress Ring */}
          <div className="group relative rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 backdrop-blur-sm hover:border-blue-500/40 transition-all">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Tổng Giờ Làm Tháng</p>
                <h3 className="text-2xl font-bold tracking-tight text-white mt-1">
                  {data.workingHours.monthTotalHours}h
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Mục tiêu: {data.workingHours.standardMonthHours}h chuẩn</p>
              </div>
              <SvgDonutProgress
                percentage={data.workingHours.completionPercentage}
                size={64}
                strokeWidth={7}
                primaryColor="#3b82f6"
              />
            </div>
            <div className="mt-3 text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/80 pt-2">
              <span>Hôm nay: {data.workingHours.todayHours}h</span>
              <span className="text-blue-400 font-semibold">{data.workingHours.completionPercentage}% đạt</span>
            </div>
          </div>

          {/* 2. Overtime Hours */}
          <StatCard
            title="Tăng Ca Tháng Này"
            value={`${data.overtime.monthTotalOtHours}h`}
            subValue={`Hôm nay: ${data.overtime.todayOtHours}h`}
            icon={Clock}
            variant="amber"
            badgeText={data.overtime.monthTotalOtHours > 0 ? 'Được tính phụ cấp OT' : 'Chưa có giờ OT'}
            badgeVariant={data.overtime.monthTotalOtHours > 0 ? 'warning' : 'info'}
          />

          {/* 3. Leave Balance */}
          <StatCard
            title="Phép Năm Còn Lại"
            value={`${data.leave.remainingDays} ngày`}
            subValue={`Đã dùng: ${data.leave.usedDays} / ${data.leave.totalAllowance}`}
            icon={CalendarCheck}
            variant="purple"
            badgeText={data.leave.pendingRequests > 0 ? `${data.leave.pendingRequests} đơn đang duyệt` : 'Sẵn sàng sử dụng'}
            badgeVariant={data.leave.pendingRequests > 0 ? 'warning' : 'success'}
          />

          {/* 4. KPI Scorecard */}
          <StatCard
            title="Điểm KPI Cá Nhân"
            value={`${data.kpi.overallScore} pts`}
            subValue={`Kỳ: ${data.kpi.period}`}
            icon={TrendingUp}
            variant="emerald"
            badgeText={data.kpi.status === 'APPROVED' ? 'Đã duyệt' : data.kpi.status === 'SUBMITTED' ? 'Đã nộp chờ duyệt' : 'Đang thực hiện'}
            badgeVariant={data.kpi.status === 'APPROVED' ? 'success' : 'info'}
          />
        </div>
      </div>

      {/* Salary & Latest Payslip Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Salary & Payslip Action Card */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              Thu Nhập & Phiếu Lương Của Bạn
            </h3>
            {data.payslip && (
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                {data.payslip.paymentStatus === 'PAID' ? 'Đã thanh toán' : 'Đang xử lý'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <span className="text-[11px] text-slate-400">Lương Hợp Đồng (Gross)</span>
              <p className="text-lg font-bold text-white font-mono mt-0.5">
                {formatCurrency(data.salary.contractSalary)}
              </p>
              <span className="text-[10px] text-slate-500">Đơn giá: {formatCurrency(data.salary.hourlyRate)}/h</span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
              <span className="text-[11px] text-slate-400">Lương Thực Nhận Gần Nhất (Net)</span>
              <p className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                {formatCurrency(data.salary.latestNet)}
              </p>
              <span className="text-[10px] text-slate-500">{data.salary.periodName || 'Kỳ gần nhất'}</span>
            </div>
          </div>

          {/* Payslip Action Card */}
          {data.payslip ? (
            <div className="rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-950/30 to-indigo-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-blue-300">
                  Phiếu Lương: {data.payslip.periodName || data.payslip.periodCode}
                </div>
                <div className="text-xs text-slate-400">
                  Thực nhận: <span className="font-bold text-white font-mono">{formatCurrency(data.payslip.netSalary)}</span> (Gross: {formatCurrency(data.payslip.grossIncome)})
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href="/my-payslips"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Xem Phiếu
                </Link>
                {data.payslip.downloadPdfUrl && (
                  <a
                    href={data.payslip.downloadPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải PDF
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-center text-xs text-slate-500">
              Chưa có dữ liệu phiếu lương được phát hành cho tài khoản này
            </div>
          )}
        </div>

        {/* Right: 14-Day Work Hours Chart */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Xu Hướng Giờ Làm (14 Ngày Gần Nhất)</h3>
              <p className="text-xs text-slate-400">So sánh giờ làm thực tế và giờ chuẩn (8h/ngày)</p>
            </div>
            <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 font-mono">
              Live DB
            </span>
          </div>

          <SvgAreaLineChart
            data={data.charts.workHours14Days.map((d) => ({
              label: d.label,
              value: d.workHours,
              secondaryValue: d.otHours,
            }))}
            lineColor="#3b82f6"
            secondaryLineColor="#f59e0b"
            primaryName="Giờ làm"
            secondaryName="Tăng ca (OT)"
            height={220}
            valueFormatter={(v) => `${v}h`}
          />
        </div>
      </div>

      {/* Bottom Grid: KPI Details & Notifications Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: My KPI Details */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                Mục Tiêu & Đánh Giá KPI Cá Nhân ({data.kpi.period})
              </h3>
              <p className="text-xs text-slate-400">Tiến độ thực hiện các chỉ tiêu tháng này</p>
            </div>
            <Link href="/kpi" className="text-xs text-blue-400 hover:text-blue-300">
              Chi tiết KPI →
            </Link>
          </div>

          <div className="space-y-3">
            {data.kpi.items.map((kpi) => (
              <div
                key={kpi.id}
                className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">{kpi.title}</span>
                  <span className="font-semibold font-mono text-emerald-400">{kpi.completionRate}% hoàn thành</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Thực tế: <span className="font-mono text-white">{kpi.actualValue}</span> / Mục tiêu:{' '}
                    <span className="font-mono text-white">{kpi.targetValue}</span> ({kpi.unit})
                  </span>
                  {kpi.bonusAmount > 0 && (
                    <span className="text-amber-400 font-mono font-semibold">
                      +{formatCurrency(kpi.bonusAmount)}
                    </span>
                  )}
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(4, kpi.completionRate))}%` }}
                  />
                </div>
              </div>
            ))}

            {data.kpi.items.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500">
                Chưa có chỉ tiêu KPI nào được giao trong kỳ này
              </div>
            )}
          </div>
        </div>

        {/* Right: Notifications Feed */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-400" />
              <h3 className="text-base font-semibold text-white">Thông Báo Của Bạn</h3>
              {data.notifications.unreadCount > 0 && (
                <span className="rounded-full bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 text-[10px] font-bold">
                  {data.notifications.unreadCount} mới
                </span>
              )}
            </div>

            {data.notifications.unreadCount > 0 && (
              <button
                onClick={() => handleNotificationRead()}
                disabled={markingRead}
                className="text-[11px] text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>

          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {data.notifications.items.map((notif) => (
              <div
                key={notif.id}
                onClick={() => notif.actionUrl && (window.location.href = notif.actionUrl)}
                className={`p-3 rounded-xl border transition-colors ${
                  notif.actionUrl ? 'cursor-pointer hover:border-slate-700' : ''
                } ${
                  notif.isRead
                    ? 'border-slate-800/60 bg-slate-950/30 text-slate-400'
                    : 'border-blue-500/30 bg-blue-950/20 text-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-semibold text-white">{notif.title}</h4>
                  <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                    {new Date(notif.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{notif.message}</p>
              </div>
            ))}

            {data.notifications.items.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500">
                Bạn chưa có thông báo nào
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
