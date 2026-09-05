'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  CheckCircle2,
  Star,
  Settings,
  Clock,
  Layers,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import { PayrollSimulatorWidget } from '@/components/payroll/PayrollSimulatorWidget';
import { PayrollRuleModal } from '@/components/payroll/PayrollRuleModal';
import { VIETNAM_STATUTORY_RULE_2026 } from '@/lib/payroll/default-rules';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToastHelpers } from '@/components/ui/toast';

export default function PayrollRulesPage() {
  const toast = useToastHelpers();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/payroll/rules');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRules(json.data);
      }
    } catch (err) {
      console.error('Error fetching payroll rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleSetDefault(id: string) {
    try {
      const res = await fetch(`/api/v1/payroll/rules/${id}/default`, {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('Đã thiết lập quy chế mặc định thành công');
        fetchRules();
      } else {
        toast.error('Không thể cập nhật quy chế mặc định');
      }
    } catch (err) {
      console.error('Failed to set default rule:', err);
      toast.error('Đã xảy ra lỗi khi cập nhật quy chế mặc định');
    }
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Động Cơ Quy Chế Tiền Lương (Payroll Rule Engine)
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-400 max-w-3xl">
              Cấu hình linh hoạt mức thuế, tỷ lệ bảo hiểm, hệ số làm thêm giờ và phương pháp tính công.
              Không gán cứng thông số pháp lý vào mã nguồn.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={fetchRules}
              disabled={loading}
              className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Làm Mới
            </Button>

            <Button
              onClick={() => {
                setEditingRule(null);
                setModalOpen(true);
              }}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Tạo Quy Chế Mới
            </Button>
          </div>
        </div>

        {/* Simulator Sandbox Section */}
        <PayrollSimulatorWidget availableRules={rules} initialRuleConfig={VIETNAM_STATUTORY_RULE_2026} />

        {/* Rules Management Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-400" />
                Danh Sách Quy Chế Tiền Lương Trong Hệ Thống
              </h2>
              <p className="text-xs text-slate-400">
                Các bộ quy tắc tính lương đang lưu trữ, có phiên bản và lịch sử kiểm toán tài chính
              </p>
            </div>
          </div>

          {loading && rules.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SkeletonCard rows={4} />
              <SkeletonCard rows={4} />
              <SkeletonCard rows={4} />
            </div>
          ) : rules.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="Chưa có quy chế tiền lương"
              description="Hệ thống chưa có bộ quy tắc tính lương nào. Tạo quy chế đầu tiên để bắt đầu tính lương chuẩn xác."
              actionLabel="Tạo Quy Chế Mới"
              onAction={() => {
                setEditingRule(null);
                setModalOpen(true);
              }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map((rule) => {
                const isDef = rule.isDefault;
                const sb = rule.salaryBasisConfig || {};
                const ins = rule.insuranceConfig || {};
                const tx = rule.taxConfig || {};

                return (
                  <Card
                    key={rule.id}
                    className={`p-5 space-y-4 relative overflow-hidden transition-all border ${
                      isDef
                        ? 'border-emerald-500/40 bg-emerald-950/20 shadow-lg shadow-emerald-950/20'
                        : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    {isDef && (
                      <div className="absolute top-0 right-0 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase px-3 py-0.5 rounded-bl-lg flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        Mặc Định
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                          {rule.code}
                        </span>
                        <span className="text-[10px] text-slate-500">v{rule.version}</span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1.5 line-clamp-1">
                        {rule.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {rule.description || 'Không có mô tả chi tiết.'}
                      </p>
                    </div>

                    {/* Spec badges */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-500">Ngày công chuẩn:</span>
                        <p className="font-semibold text-white">
                          {sb.standardWorkDays || 22} ngày ({sb.method || 'FIXED'})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">BHXH NLĐ:</span>
                        <p className="font-semibold text-white">
                          {((ins.employeeSocialRate || 0) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Mô hình thuế:</span>
                        <p className="font-semibold text-amber-300">{tx.model || 'PROGRESSIVE'}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Giảm trừ bản thân:</span>
                        <p className="font-semibold text-white font-mono">
                          {((tx.personalRelief || 0) / 1000000).toFixed(0)}M ₫
                        </p>
                      </div>
                    </div>

                    {/* Footer buttons */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                      <span className="text-[10px] text-slate-500 font-mono">
                        Áp dụng: {new Date(rule.effectiveFrom).toLocaleDateString('vi-VN')}
                      </span>

                      <div className="flex items-center gap-2">
                        {!isDef && (
                          <button
                            onClick={() => handleSetDefault(rule.id)}
                            className="text-[11px] text-slate-400 hover:text-emerald-400 underline font-medium"
                          >
                            Đặt Mặc Định
                          </button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingRule(rule);
                            setModalOpen(true);
                          }}
                          className="h-7 text-xs border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                          <Settings className="h-3 w-3 mr-1" />
                          Cấu Hình
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Cấu Hình */}
        <PayrollRuleModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={fetchRules}
          ruleToEdit={editingRule}
        />
      </div>
    </AppShell>
  );
}
