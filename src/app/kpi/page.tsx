'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Target,
  Award,
  Plus,
  UserPlus,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Eye,
  Edit3,
} from 'lucide-react';
import { KpiDefinitionModal } from '@/components/kpi/KpiDefinitionModal';
import { KpiAssignmentModal } from '@/components/kpi/KpiAssignmentModal';
import {
  KpiEvaluationModal,
  KpiAssignmentItem,
} from '@/components/kpi/KpiEvaluationModal';
import { KpiScorecardCard } from '@/components/kpi/KpiScorecardCard';
import {
  formatBonusVnd,
  formatKpiUnit,
  getAchievementTier,
} from '@/lib/kpi/kpi-calculator';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonTable, SkeletonCard, SkeletonStatCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastHelpers } from '@/components/ui/toast';

export default function KpiPage() {
  const currentPeriod = new Date().toISOString().slice(0, 7);

  const [activeTab, setActiveTab] = useState<'scorecard' | 'assignments' | 'definitions'>('scorecard');
  const [period, setPeriod] = useState(currentPeriod);

  // Modals state
  const [isDefModalOpen, setIsDefModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [evaluatingAssignment, setEvaluatingAssignment] = useState<KpiAssignmentItem | null>(null);

  // Data states
  const [scorecardData, setScorecardData] = useState<any>(null);
  const [assignments, setAssignments] = useState<KpiAssignmentItem[]>([]);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch Scorecard
  const fetchScorecard = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/kpi/scorecard?period=${period}`);
      const json = await res.json();
      if (json.success) {
        setScorecardData(json.data);
      }
    } catch (err) {
      console.error('Error fetching scorecard:', err);
    }
  }, [period]);

  // Fetch Definitions
  const fetchDefinitions = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/kpi/definitions?limit=50&status=ACTIVE');
      const json = await res.json();
      if (json.success && json.data) {
        setDefinitions(json.data);
      }
    } catch (err) {
      console.error('Error fetching definitions:', err);
    }
  }, []);

  // Fetch Summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/kpi/summary');
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, []);

  // Refresh active tab data
  const refreshData = useCallback(() => {
    setLoading(true);
    Promise.all([fetchScorecard(), fetchDefinitions(), fetchSummary()]).finally(() => {
      setLoading(false);
    });
  }, [fetchScorecard, fetchDefinitions, fetchSummary]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                <Target className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Quản Trị Chỉ Số Hiệu Suất & Thưởng KPI
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Engine tính toán hiệu suất cốt lõi, xếp loại phân tầng và tính thưởng tự động
            </p>
          </div>

          {/* Action Buttons & Period Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
              <span className="text-slate-400">Kỳ:</span>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="YYYY-MM"
                className="w-20 bg-transparent font-mono font-semibold text-white focus:outline-none"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={loading}
              className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              size="sm"
              onClick={() => setIsAssignModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              <span>Giao KPI</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setIsDefModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo Chỉ Số</span>
            </Button>
          </div>
        </div>

        {/* Summary KPI Counters */}
        {loading && !summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </div>
        ) : summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400">Điểm Đánh Giá Trung Bình</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {summary.averageScore}%
                </span>
                <span className="text-xs text-emerald-400 font-medium">Toàn công ty</span>
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400">Tổng Thưởng Đã Duyệt</span>
              <div className="mt-1">
                <span className="text-2xl font-bold text-emerald-400 font-mono tracking-tight">
                  {formatBonusVnd(summary.totalBonusPayout)}
                </span>
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400">Chỉ Số Được Giao Kỳ</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tracking-tight">
                  {summary.totalAssigned}
                </span>
                <span className="text-xs text-slate-400">bản ghi</span>
              </div>
            </Card>

            <Card className="border-slate-800 bg-slate-900/60 p-4">
              <span className="text-xs text-slate-400">Chờ Đánh Giá / Phê Duyệt</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-400 tracking-tight">
                  {summary.pendingEvaluations}
                </span>
                <span className="text-xs text-slate-400">chờ xử lý</span>
              </div>
            </Card>
          </div>
        ) : null}

        {/* Tabs Header */}
        <div className="flex border-b border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab('scorecard')}
            className={`pb-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'scorecard'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Bảng Điểm Cá Nhân (My Scorecard)
          </button>

          <button
            onClick={() => setActiveTab('definitions')}
            className={`pb-3 text-sm font-semibold transition-colors relative ${
              activeTab === 'definitions'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Thư Viện Chỉ Số KPI ({definitions.length})
          </button>
        </div>

        {/* Tab 1: My Scorecard */}
        {activeTab === 'scorecard' && (
          <div>
            {loading && !scorecardData ? (
              <SkeletonCard rows={5} />
            ) : scorecardData ? (
              <KpiScorecardCard
                employeeName={scorecardData.employee.fullName}
                employeeCode={scorecardData.employee.employeeCode}
                department={scorecardData.employee.department}
                period={scorecardData.period}
                scorecard={scorecardData.scorecard}
              />
            ) : (
              <EmptyState
                icon={Target}
                title="Chưa có dữ liệu bảng điểm KPI"
                description={`Không có dữ liệu đánh giá KPI cá nhân trong kỳ ${period}.`}
              />
            )}
          </div>
        )}

        {/* Tab 2: KPI Library (Definitions) */}
        {activeTab === 'definitions' && (
          <Card className="border-slate-800 bg-slate-900 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Tìm mã hoặc tên chỉ số KPI..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <span className="text-xs text-slate-400">
                Tổng cộng {definitions.length} chỉ số chuẩn
              </span>
            </div>

            {loading && definitions.length === 0 ? (
              <div className="p-4">
                <SkeletonTable cols={6} rows={5} />
              </div>
            ) : (
              (() => {
                const filtered = definitions.filter((d) =>
                  searchTerm
                    ? d.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      d.title.toLowerCase().includes(searchTerm.toLowerCase())
                    : true
                );

                if (filtered.length === 0) {
                  return (
                    <div className="p-6">
                      <EmptyState
                        icon={Target}
                        title="Không tìm thấy chỉ số KPI"
                        description={
                          searchTerm
                            ? `Không có chỉ số nào khớp với từ khóa "${searchTerm}".`
                            : 'Chưa có chỉ số KPI nào trong hệ thống.'
                        }
                        actionLabel="Tạo chỉ số mới"
                        onAction={() => setIsDefModalOpen(true)}
                      />
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400 uppercase font-mono">
                        <tr>
                          <th className="px-5 py-3">Mã & Tiêu Đề</th>
                          <th className="px-4 py-3">Mục Tiêu Chuẩn</th>
                          <th className="px-4 py-3">Kiểu Đo Lường</th>
                          <th className="px-4 py-3">Công Thức Thưởng</th>
                          <th className="px-4 py-3">Mức Thưởng Cơ Bản</th>
                          <th className="px-4 py-3">Trạng Thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 text-slate-300">
                        {filtered.map((kpi) => (
                          <tr key={kpi.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold px-2 py-0.5 rounded bg-blue-950/70 text-blue-400 border border-blue-800/40">
                                  {kpi.code}
                                </span>
                                <span className="font-medium text-white">{kpi.title}</span>
                              </div>
                              {kpi.description && (
                                <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                                  {kpi.description}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3.5 font-mono text-white">
                              {formatKpiUnit(Number(kpi.targetValue), kpi.unit)}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
                                {kpi.calculationType}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="text-blue-400 font-medium font-mono text-[11px]">
                                {kpi.bonusFormula}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-emerald-400 font-medium">
                              {formatBonusVnd(Number(kpi.baseBonusAmount))}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                                {kpi.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </Card>
        )}

        {/* Modals */}
        <KpiDefinitionModal
          isOpen={isDefModalOpen}
          onClose={() => setIsDefModalOpen(false)}
          onSuccess={refreshData}
        />

        <KpiAssignmentModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          onSuccess={refreshData}
          defaultPeriod={period}
        />

        <KpiEvaluationModal
          isOpen={Boolean(evaluatingAssignment)}
          onClose={() => setEvaluatingAssignment(null)}
          onSuccess={refreshData}
          assignment={evaluatingAssignment}
        />
      </div>
    </AppShell>
  );
}
