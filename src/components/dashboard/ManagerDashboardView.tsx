'use client';

import React, { useState } from 'react';
import { ManagerDashboardData } from '@/lib/services/dashboard.service';
import { StatCard } from './StatCard';
import { SvgBarChart } from './SvgCharts';
import {
  Users,
  UserCheck,
  ClockAlert,
  TrendingUp,
  Inbox,
  CheckCircle2,
  CalendarCheck,
  FileCheck2,
  Award,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

export interface ManagerDashboardViewProps {
  data: ManagerDashboardData;
}

export function ManagerDashboardView({ data }: ManagerDashboardViewProps) {
  const [activeQueueTab, setActiveQueueTab] = useState<'leaves' | 'attendance' | 'kpi' | 'bonus'>('leaves');

  const attendanceSeries = [
    { name: 'Có mặt', color: '#10b981', key: 'present' },
    { name: 'Đi muộn', color: '#f59e0b', key: 'late' },
    { name: 'Vắng', color: '#ef4444', key: 'absent' },
  ];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-slate-900/40 p-6 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-xs font-semibold text-indigo-400">
            <Users className="h-3.5 w-3.5 text-indigo-400" />
            {data.department ? `BỘ PHẬN: ${data.department.name} (${data.department.code})` : 'QUẢN LÝ ĐỘI NGŨ (TEAM MANAGER)'}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Quản Trị Vận Hành & Phê Duyệt Đội Ngũ</h2>
          <p className="text-sm text-slate-400 max-w-2xl">
            Theo dõi quân số hiện diện, xử lý kịp thời các trường hợp đi muộn, đánh giá tiến độ mục tiêu KPI và phê duyệt các yêu cầu chờ.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-center">
            <span className="block text-[10px] text-slate-400 uppercase tracking-wider">Hàng đợi duyệt</span>
            <span className="text-lg font-bold text-amber-400">{data.approvalQueue.totalQueueCount} yêu cầu</span>
          </span>
        </div>
      </div>

      {/* Primary Metrics: Team Attendance, Lateness, KPI, Approval Queue */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          Chỉ Số Đội Ngũ Thời Gian Thực
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Team Attendance */}
          <StatCard
            title="Điểm Danh Đội Ngũ"
            value={`${data.teamAttendance.presentToday}/${data.teamAttendance.totalMembers}`}
            subValue={`${data.teamAttendance.attendanceRate}% có mặt`}
            icon={UserCheck}
            variant="emerald"
            badgeText={data.teamAttendance.absentToday > 0 ? `${data.teamAttendance.absentToday} vắng mặt` : '100% hiện diện'}
            badgeVariant={data.teamAttendance.absentToday > 0 ? 'warning' : 'success'}
          />

          {/* 2. Lateness */}
          <StatCard
            title="Đi Muộn Hôm Nay"
            value={data.lateness.lateTodayCount}
            subValue={`Tổng: ${data.lateness.totalLateMinutesToday} phút`}
            icon={ClockAlert}
            variant="amber"
            badgeText={`Tuần này: ${data.lateness.weeklyLateCount} lượt`}
            badgeVariant={data.lateness.lateTodayCount > 0 ? 'warning' : 'success'}
          />

          {/* 3. KPI Score */}
          <StatCard
            title="Điểm KPI Trung Bình"
            value={`${data.kpi.averageScore} pts`}
            subValue={`Đạt ${data.kpi.averageCompletionRate}% target`}
            icon={TrendingUp}
            variant="blue"
            badgeText={`${data.kpi.pendingEvaluationCount} bài chờ chấm`}
            badgeVariant={data.kpi.pendingEvaluationCount > 0 ? 'warning' : 'info'}
          />

          {/* 4. Approval Queue */}
          <StatCard
            title="Hàng Đợi Chờ Duyệt"
            value={data.approvalQueue.totalQueueCount}
            subValue="yêu cầu chờ xử lý"
            icon={Inbox}
            variant="purple"
            badgeText={data.approvalQueue.totalQueueCount > 0 ? 'Cần phê duyệt ngay' : 'Không có tồn đọng'}
            badgeVariant={data.approvalQueue.totalQueueCount > 0 ? 'warning' : 'success'}
          />
        </div>
      </div>

      {/* Chart & Live Team Presence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 7-Day Team Attendance Trend */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Xu Hướng Điểm Danh Của Team (7 Ngày)</h3>
              <p className="text-xs text-slate-400">Tỷ lệ có mặt, đi muộn và vắng mặt trong bộ phận</p>
            </div>
            <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 font-mono">
              Live Team
            </span>
          </div>

          <SvgBarChart
            data={data.charts.teamAttendance7Days}
            series={attendanceSeries}
            height={240}
            valueFormatter={(v) => `${v} người`}
          />
        </div>

        {/* Right: Live Today's Team Presence Status Table */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-white">Trạng Thái Thành Viên Hôm Nay</h3>
              <p className="text-xs text-slate-400">{data.teamMembers.length} thành viên trực thuộc</p>
            </div>
            <Link href="/attendance" className="text-xs text-indigo-400 hover:text-indigo-300">
              Chi tiết công →
            </Link>
          </div>

          <div className="overflow-x-auto max-h-[250px] overflow-y-auto pr-1">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-900/90 text-slate-400 border-b border-slate-800 backdrop-blur-sm">
                <tr>
                  <th className="pb-2 font-medium">Nhân viên</th>
                  <th className="pb-2 font-medium">Chức danh</th>
                  <th className="pb-2 font-medium">Check-in</th>
                  <th className="pb-2 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.teamMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5">
                      <div className="font-semibold text-white">{member.fullName}</div>
                      <div className="font-mono text-[10px] text-slate-400">{member.employeeCode}</div>
                    </td>
                    <td className="py-2.5 text-slate-300">{member.positionTitle}</td>
                    <td className="py-2.5 font-mono text-slate-300">
                      {member.checkInTime ? new Date(member.checkInTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {member.lateMinutes > 0 && (
                        <span className="ml-1.5 text-[10px] text-amber-400 font-sans">
                          (+{member.lateMinutes}p)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {member.todayStatus === 'PRESENT' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Có mặt
                        </span>
                      )}
                      {member.todayStatus === 'LATE' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                          <ClockAlert className="h-3 w-3" />
                          Đi muộn
                        </span>
                      )}
                      {member.todayStatus === 'ON_LEAVE' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                          <CalendarCheck className="h-3 w-3" />
                          Nghỉ phép
                        </span>
                      )}
                      {member.todayStatus === 'ABSENT' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                          <AlertCircle className="h-3 w-3" />
                          Chưa đến
                        </span>
                      )}
                    </td>
                  </tr>
                ))}

                {data.teamMembers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500">
                      Chưa có nhân viên nào trong bộ phận này
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Interactive Approval Queue */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Inbox className="h-4 w-4 text-purple-400" />
              Hàng Đợi Phê Duyệt Của Quản Lý (Approval Queue)
            </h3>
            <p className="text-xs text-slate-400">
              Xem và điều hướng nhanh đến các yêu cầu từ nhân viên trong phòng ban
            </p>
          </div>

          {/* Queue Tabs */}
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              onClick={() => setActiveQueueTab('leaves')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activeQueueTab === 'leaves' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Đơn phép ({data.approvalQueue.pendingLeaves.length})
            </button>
            <button
              onClick={() => setActiveQueueTab('attendance')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activeQueueTab === 'attendance' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Giải trình công ({data.approvalQueue.pendingAttendance.length})
            </button>
            <button
              onClick={() => setActiveQueueTab('kpi')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activeQueueTab === 'kpi' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Đánh giá KPI ({data.approvalQueue.pendingKpi.length})
            </button>
            <button
              onClick={() => setActiveQueueTab('bonus')}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                activeQueueTab === 'bonus' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Thưởng/Phạt ({data.approvalQueue.pendingBonusPenalty.length})
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-3 pt-2">
          {activeQueueTab === 'leaves' && (
            <div className="space-y-2.5">
              {data.approvalQueue.pendingLeaves.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 hover:border-purple-500/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{req.employeeName}</span>
                      <span className="font-mono text-[10px] text-slate-400">({req.employeeCode})</span>
                      <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400 border border-purple-500/20">
                        {req.durationDays} ngày phép ({req.startDate} → {req.endDate})
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 italic">&ldquo;{req.reason}&rdquo;</p>
                  </div>

                  <Link
                    href="/leaves"
                    className="inline-flex items-center gap-1.5 self-end sm:self-center rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                  >
                    Xem & Duyệt
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}

              {data.approvalQueue.pendingLeaves.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-500">
                  Không có đơn xin nghỉ phép nào đang chờ duyệt
                </div>
              )}
            </div>
          )}

          {activeQueueTab === 'attendance' && (
            <div className="space-y-2.5">
              {data.approvalQueue.pendingAttendance.map((adj) => (
                <div
                  key={adj.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 hover:border-cyan-500/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{adj.employeeName}</span>
                      <span className="font-mono text-[10px] text-slate-400">({adj.employeeCode})</span>
                      <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-400 border border-cyan-500/20">
                        Ngày {adj.workDate} • {adj.correctionType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 italic">&ldquo;{adj.reason}&rdquo;</p>
                  </div>

                  <Link
                    href="/attendance"
                    className="inline-flex items-center gap-1.5 self-end sm:self-center rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                  >
                    Xem & Xử Lý
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}

              {data.approvalQueue.pendingAttendance.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-500">
                  Không có giải trình công nào đang chờ duyệt
                </div>
              )}
            </div>
          )}

          {activeQueueTab === 'kpi' && (
            <div className="space-y-2.5">
              {data.approvalQueue.pendingKpi.map((kpi) => (
                <div
                  key={kpi.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 hover:border-amber-500/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{kpi.employeeName}</span>
                      <span className="font-mono text-[10px] text-slate-400">({kpi.employeeCode})</span>
                      <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20">
                        Kỳ {kpi.period} • Đạt {kpi.completionRate}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Mục tiêu: <span className="font-semibold">{kpi.kpiTitle}</span> (Thực tế: {kpi.actualValue}/{kpi.targetValue})
                    </p>
                  </div>

                  <Link
                    href="/kpi"
                    className="inline-flex items-center gap-1.5 self-end sm:self-center rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                  >
                    Chấm Điểm
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}

              {data.approvalQueue.pendingKpi.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-500">
                  Không có đánh giá KPI nào đang chờ chấm
                </div>
              )}
            </div>
          )}

          {activeQueueTab === 'bonus' && (
            <div className="space-y-2.5">
              {data.approvalQueue.pendingBonusPenalty.map((bp) => (
                <div
                  key={bp.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 hover:border-emerald-500/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{bp.employeeName}</span>
                      <span className="font-mono text-[10px] text-slate-400">({bp.employeeCode})</span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                          bp.type === 'BONUS'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {bp.type === 'BONUS' ? 'Đề xuất thưởng' : 'Đề xuất kỷ luật'}: {new Intl.NumberFormat('vi-VN').format(bp.amount)} đ
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 italic">&ldquo;{bp.reason}&rdquo;</p>
                  </div>

                  <Link
                    href={bp.type === 'BONUS' ? '/bonus' : '/penalties'}
                    className="inline-flex items-center gap-1.5 self-end sm:self-center rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors border border-slate-700"
                  >
                    Xem Chi Tiết
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}

              {data.approvalQueue.pendingBonusPenalty.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-500">
                  Không có đề xuất khen thưởng hoặc kỷ luật nào đang chờ
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
