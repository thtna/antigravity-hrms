'use client';

import React from 'react';
import { AdminHrDashboardData } from '@/lib/services/dashboard.service';
import { StatCard } from './StatCard';
import { SvgBarChart } from './SvgCharts';
import {
  Users,
  UserCheck,
  UserX,
  ClockAlert,
  CalendarCheck,
  FileCheck2,
  ReceiptText,
  Clock,
  Award,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

export interface AdminHrDashboardViewProps {
  data: AdminHrDashboardData;
}

export function AdminHrDashboardView({ data }: AdminHrDashboardViewProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(val);
  };

  const attendanceSeries = [
    { name: 'Có mặt', color: '#10b981', key: 'present' },
    { name: 'Đi muộn', color: '#f59e0b', key: 'late' },
    { name: 'Vắng', color: '#ef4444', key: 'absent' },
  ];

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/40 via-slate-900/60 to-slate-900/40 p-6 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-0.5 text-xs font-semibold text-blue-400">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            ADMIN & HR MANAGEMENT SUITE
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Tổng Quan Toàn Doanh Nghiệp</h2>
          <p className="text-sm text-slate-400 max-w-2xl">
            Giám sát vận hành nhân sự, tỷ lệ chấm công thời gian thực, hàng đợi phê duyệt và ngân sách lương thưởng theo chuẩn ACID.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            href="/employees"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors shadow-lg shadow-blue-600/20"
          >
            Quản Lý Nhân Sự
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/payroll"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-colors"
          >
            Bảng Lương
          </Link>
        </div>
      </div>

      {/* Primary Metrics Grid: All 10 Required Items */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          10 Chỉ Số Nghiệp Vụ Trọng Yếu (Core Metrics)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. Total Employees */}
          <StatCard
            title="Tổng Nhân Viên"
            value={data.totalEmployees}
            subValue="hoạt động"
            icon={Users}
            variant="blue"
            badgeText="Hồ sơ hoạt động"
            badgeVariant="info"
          />

          {/* 2. Present Today */}
          <StatCard
            title="Có Mặt Hôm Nay"
            value={data.presentToday}
            subValue={`/ ${data.totalEmployees}`}
            icon={UserCheck}
            variant="emerald"
            badgeText={data.totalEmployees > 0 ? `${Math.round((data.presentToday / data.totalEmployees) * 100)}% tỷ lệ` : '0%'}
            badgeVariant="success"
          />

          {/* 3. Absent Today */}
          <StatCard
            title="Vắng Mặt Hôm Nay"
            value={data.absentToday}
            subValue="nhân viên"
            icon={UserX}
            variant="red"
            badgeText={data.absentToday === 0 ? 'Toàn bộ có mặt' : 'Cần kiểm tra'}
            badgeVariant={data.absentToday === 0 ? 'success' : 'destructive'}
          />

          {/* 4. Late Today */}
          <StatCard
            title="Đi Muộn Hôm Nay"
            value={data.lateToday}
            subValue="nhân viên"
            icon={ClockAlert}
            variant="amber"
            badgeText={data.lateToday === 0 ? 'Đúng giờ 100%' : 'Vượt giờ quy định'}
            badgeVariant={data.lateToday === 0 ? 'success' : 'warning'}
          />

          {/* 5. Pending Leave */}
          <StatCard
            title="Đơn Phép Chờ Duyệt"
            value={data.pendingLeave}
            subValue="yêu cầu"
            icon={CalendarCheck}
            variant="purple"
            badgeText={data.pendingLeave > 0 ? 'Cần phê duyệt' : 'Đã xử lý xong'}
            badgeVariant={data.pendingLeave > 0 ? 'warning' : 'success'}
          />

          {/* 6. Pending Attendance */}
          <StatCard
            title="Giải Trình Công Chờ"
            value={data.pendingAttendance}
            subValue="yêu cầu"
            icon={FileCheck2}
            variant="cyan"
            badgeText={data.pendingAttendance > 0 ? 'Hàng đợi duyệt' : 'Đã xác nhận'}
            badgeVariant={data.pendingAttendance > 0 ? 'warning' : 'success'}
          />

          {/* 7. Payroll Status */}
          <StatCard
            title="Kỳ Lương Hiện Tại"
            value={data.payrollStatus.status || 'Chưa mở'}
            subValue={data.payrollStatus.code || 'N/A'}
            icon={ReceiptText}
            variant="blue"
            badgeText={data.payrollStatus.name || 'Hệ thống tính lương'}
            badgeVariant="info"
          />

          {/* 8. Overtime Hours */}
          <StatCard
            title="Giờ Tăng Ca (OT)"
            value={`${data.overtime.todayHours}h`}
            subValue={`Tháng: ${data.overtime.monthHours}h`}
            icon={Clock}
            variant="amber"
            badgeText="Tổng giờ tăng ca"
            badgeVariant="warning"
          />

          {/* 9. Bonus */}
          <StatCard
            title="Thưởng Tháng Này"
            value={formatCurrency(data.bonus.totalAmount)}
            subValue={`${data.bonus.count} lượt`}
            icon={Award}
            variant="emerald"
            badgeText="Đã phê duyệt"
            badgeVariant="success"
          />

          {/* 10. Penalty */}
          <StatCard
            title="Kỷ Luật & Phạt"
            value={formatCurrency(data.penalty.totalAmount)}
            subValue={`${data.penalty.count} lượt`}
            icon={AlertTriangle}
            variant="red"
            badgeText="Đã áp dụng"
            badgeVariant="destructive"
          />
        </div>
      </div>

      {/* Real-Data Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 7-Day Attendance Trend Chart */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Xu Hướng Điểm Danh 7 Ngày Gần Nhất</h3>
              <p className="text-xs text-slate-400">Thống kê thực tế số lượng có mặt, đi muộn và vắng mặt</p>
            </div>
            <span className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300">
              Live DB
            </span>
          </div>

          <SvgBarChart
            data={data.charts.attendanceTrend}
            series={attendanceSeries}
            height={250}
            valueFormatter={(v) => `${v} nhân viên`}
          />
        </div>

        {/* Department Distribution Chart & Headcount */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Phân Bổ Nhân Sự & Ngân Sách Theo Phòng Ban</h3>
              <p className="text-xs text-slate-400">Quy mô nhân sự và quỹ lương cơ bản phòng ban</p>
            </div>
            <Link href="/organization" className="text-xs text-blue-400 hover:text-blue-300">
              Cơ cấu tổ chức →
            </Link>
          </div>

          <div className="space-y-4">
            {data.charts.departmentDistribution.map((dept) => {
              const percentage = data.totalEmployees > 0 ? Math.round((dept.employeeCount / data.totalEmployees) * 100) : 0;
              return (
                <div key={dept.departmentId} className="space-y-1.5 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">
                      {dept.name} <span className="font-mono text-blue-400">({dept.code})</span>
                    </span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      {formatCurrency(dept.totalSalary)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{dept.employeeCount} nhân sự</span>
                    <span>{percentage}% toàn công ty</span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.max(4, percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {data.charts.departmentDistribution.length === 0 && (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Chưa có phòng ban nào được thiết lập
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Approval & Action Shortcut Bar */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
          Lối Tắt Xử Lý Nghiệp Vụ Nhanh (Quick Actions)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Link
            href="/attendance"
            className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 text-center hover:border-blue-500/40 hover:bg-slate-900/60 transition-all group"
          >
            <Clock className="h-5 w-5 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-200">Chấm Công</span>
            <span className="text-[10px] text-slate-400 mt-0.5">QR & GPS</span>
          </Link>

          <Link
            href="/leaves"
            className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 text-center hover:border-blue-500/40 hover:bg-slate-900/60 transition-all group"
          >
            <CalendarCheck className="h-5 w-5 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-200">Duyệt Phép</span>
            <span className="text-[10px] text-amber-400 mt-0.5">{data.pendingLeave} chờ duyệt</span>
          </Link>

          <Link
            href="/shifts"
            className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 text-center hover:border-blue-500/40 hover:bg-slate-900/60 transition-all group"
          >
            <Users className="h-5 w-5 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-200">Ca & Phân Ca</span>
            <span className="text-[10px] text-slate-400 mt-0.5">Lịch làm việc</span>
          </Link>

          <Link
            href="/kpi"
            className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 text-center hover:border-blue-500/40 hover:bg-slate-900/60 transition-all group"
          >
            <Award className="h-5 w-5 text-amber-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-200">Hiệu Suất KPI</span>
            <span className="text-[10px] text-slate-400 mt-0.5">Đánh giá tháng</span>
          </Link>

          <Link
            href="/bonus"
            className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 text-center hover:border-blue-500/40 hover:bg-slate-900/60 transition-all group"
          >
            <Award className="h-5 w-5 text-yellow-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-200">Khen Thưởng</span>
            <span className="text-[10px] text-emerald-400 mt-0.5">{formatCurrency(data.bonus.totalAmount)}</span>
          </Link>

          <Link
            href="/payroll"
            className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-slate-800 bg-slate-950/40 text-center hover:border-blue-500/40 hover:bg-slate-900/60 transition-all group"
          >
            <ReceiptText className="h-5 w-5 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-semibold text-slate-200">Tính Lương</span>
            <span className="text-[10px] text-slate-400 mt-0.5">{data.payrollStatus.code || 'Kỳ lương'}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
