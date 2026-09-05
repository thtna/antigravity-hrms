'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  Send,
  Lock,
  History,
  ShieldCheck,
  RotateCcw,
  DollarSign,
  PlusCircle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PayrollWorkflowStepperProps {
  periodId: string;
  periodCode: string;
  currentStatus: string;
  onStatusChanged: () => void;
  employees?: Array<{ id: string; employeeCode: string; firstName: string; lastName: string }>;
}

const STAGES = [
  { key: 'DRAFT', label: '1. Khởi Tạo (Draft)', desc: 'Tạo kỳ lương' },
  { key: 'CALCULATED', label: '2. Đã Tính Toán (Calculated)', desc: 'Chạy Engine' },
  { key: 'REVIEW', label: '3. Chờ Thẩm Định (Review)', desc: 'Trình quản lý' },
  { key: 'APPROVED', label: '4. Đã Phê Duyệt (Approved)', desc: 'Khóa số liệu' },
  { key: 'PAID', label: '5. Đã Chi Trả (Paid)', desc: 'Hoàn tất chi tiền' },
];

export function PayrollWorkflowStepper({
  periodId,
  periodCode,
  currentStatus,
  onStatusChanged,
  employees = [],
}: PayrollWorkflowStepperProps) {
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState<string>('');
  const [activeModal, setActiveModal] = useState<'NONE' | 'HISTORY' | 'ADJUSTMENT' | 'COMMENT'>('NONE');
  const [pendingAction, setPendingAction] = useState<{ action: string; targetStatus: string; title: string } | null>(null);

  // History state
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Adjustment state
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>('');
  const [adjType, setAdjType] = useState<string>('OT_CORRECTION');
  const [adjDirection, setAdjDirection] = useState<'ADDITION' | 'DEDUCTION'>('ADDITION');
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjReason, setAdjReason] = useState<string>('');

  const currentIdx = STAGES.findIndex((s) => s.key === currentStatus);

  // Fetch History
  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch(`/api/v1/payroll/workflow/history/${periodId}`);
      const json = await res.json();
      if (json.success) {
        setHistoryList(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const openHistoryModal = () => {
    setActiveModal('HISTORY');
    fetchHistory();
  };

  // Trigger State Transition
  const executeTransition = async (action: string, targetStatus: string, comments?: string) => {
    try {
      setLoadingAction(true);
      setError(null);
      const res = await fetch('/api/v1/payroll/workflow/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId,
          targetStatus,
          action,
          comments: comments || undefined,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setActiveModal('NONE');
        setCommentInput('');
        setPendingAction(null);
        onStatusChanged();
      } else {
        setError(json.error?.message || 'Chuyển trạng thái thất bại.');
      }
    } catch {
      setError('Lỗi kết nối khi chuyển trạng thái quy trình.');
    } finally {
      setLoadingAction(false);
    }
  };

  // Submit Adjustment Request
  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoadingAction(true);
      setError(null);
      const res = await fetch('/api/v1/payroll/workflow/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodId,
          employeeId: targetEmployeeId,
          adjustmentType: adjType,
          direction: adjDirection,
          amount: adjAmount,
          reason: adjReason,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setActiveModal('NONE');
        setTargetEmployeeId('');
        setAdjAmount(0);
        setAdjReason('');
        onStatusChanged();
      } else {
        setError(json.error?.message || 'Không thể tạo yêu cầu điều chỉnh.');
      }
    } catch {
      setError('Lỗi khi gửi đề xuất điều chỉnh.');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
      {/* Stepper Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-blue-400" />
            Quy Trình Phê Duyệt & Vòng Đời Bảng Lương
          </h3>
          <p className="text-xs text-slate-400">
            Trạng thái hiện tại: <strong className="text-blue-400 uppercase font-mono">{currentStatus}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={openHistoryModal}
            className="border-slate-700 bg-slate-800 text-slate-300 text-xs h-8"
          >
            <History className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Lịch Sử Phê Duyệt
          </Button>

          {(currentStatus === 'APPROVED' || currentStatus === 'PAID') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveModal('ADJUSTMENT')}
              className="border-amber-500/30 bg-amber-950/20 text-amber-300 text-xs h-8 hover:bg-amber-900/30"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1 text-amber-400" />
              Đề Xuất Điều Chỉnh
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-red-500/40 bg-red-950/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Visual Progress Steps */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        {STAGES.map((s, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div
              key={s.key}
              className={`p-3 rounded-xl border transition-all ${
                isCurrent
                  ? 'border-blue-500 bg-blue-950/40 text-white shadow-md shadow-blue-500/10'
                  : isDone
                  ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-300'
                  : 'border-slate-800 bg-slate-950/40 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold">{s.label}</span>
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isCurrent ? (
                  <Clock className="w-4 h-4 text-blue-400 animate-spin" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-700" />
                )}
              </div>
              <div className="text-[11px] opacity-80">{s.desc}</div>
            </div>
          );
        })}
      </div>

      {/* Contextual Action Bar based on State */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          {currentStatus === 'CALCULATED' && (
            <span>Bảng lương đã được tính toán xong. Nhân sự kiểm tra và trình duyệt cho Ban Giám Đốc.</span>
          )}
          {currentStatus === 'REVIEW' && (
            <span className="text-amber-300 font-medium flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              Đang chờ Cấp Quản Lý / Ban Giám Đốc phê duyệt chốt bảng lương.
            </span>
          )}
          {currentStatus === 'APPROVED' && (
            <span className="text-emerald-300 font-medium flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-emerald-400" />
              Bảng lương ĐÃ PHÊ DUYỆT (Khóa bất biến). Sẵn sàng chuyển tiền chi trả.
            </span>
          )}
          {currentStatus === 'PAID' && (
            <span className="text-purple-300 font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              Bảng lương ĐÃ CHI TRẢ TOÀN BỘ. Bất biến vĩnh viễn theo chuẩn kế toán.
            </span>
          )}
          {currentStatus === 'DRAFT' && (
            <span>Kỳ lương mới khởi tạo. Vui lòng bấm &quot;Tính Lương Chu Kỳ&quot; để bắt đầu.</span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {currentStatus === 'CALCULATED' && (
            <Button
              size="sm"
              disabled={loadingAction}
              onClick={() => {
                setPendingAction({
                  action: 'SUBMIT_REVIEW',
                  targetStatus: 'REVIEW',
                  title: 'Trình Duyệt Bảng Lương Lên Cấp Quản Lý',
                });
                setActiveModal('COMMENT');
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8"
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              Trình Duyệt (Submit Review)
            </Button>
          )}

          {currentStatus === 'REVIEW' && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={loadingAction}
                onClick={() => {
                  setPendingAction({
                    action: 'REJECT_TO_CALCULATED',
                    targetStatus: 'CALCULATED',
                    title: 'Yêu Cầu Rà Soát / Tính Lại Bảng Lương',
                  });
                  setActiveModal('COMMENT');
                }}
                className="border-red-500/40 bg-red-950/20 text-red-300 text-xs h-8 hover:bg-red-900/40"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                Yêu Cầu Tính Lại (Reject)
              </Button>
              <Button
                size="sm"
                disabled={loadingAction}
                onClick={() => {
                  setPendingAction({
                    action: 'APPROVE',
                    targetStatus: 'APPROVED',
                    title: 'Phê Duyệt Chốt Bảng Lương Kỳ Này',
                  });
                  setActiveModal('COMMENT');
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Phê Duyệt Chốt (Approve)
              </Button>
            </>
          )}

          {currentStatus === 'APPROVED' && (
            <Button
              size="sm"
              disabled={loadingAction}
              onClick={() => {
                setPendingAction({
                  action: 'CONFIRM_PAID',
                  targetStatus: 'PAID',
                  title: 'Xác Nhận Đã Chi Trả Tiền Lương',
                });
                setActiveModal('COMMENT');
              }}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs h-8"
            >
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              Xác Nhận Chi Trả (Confirm Paid)
            </Button>
          )}
        </div>
      </div>

      {/* Confirmation & Comment Modal */}
      {activeModal === 'COMMENT' && pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-blue-400" />
              {pendingAction.title}
            </h3>
            <p className="text-xs text-slate-400">
              Kỳ lương: <strong className="text-white">{periodCode}</strong>
            </p>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ghi chú phê duyệt / giải trình:</label>
              <textarea
                rows={3}
                placeholder="Nhập ý kiến chỉ đạo hoặc ghi chú lưu vết kiểm toán..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveModal('NONE');
                  setPendingAction(null);
                }}
                className="border-slate-700 text-slate-300 text-xs"
              >
                Hủy
              </Button>
              <Button
                size="sm"
                disabled={loadingAction}
                onClick={() =>
                  executeTransition(pendingAction.action, pendingAction.targetStatus, commentInput)
                }
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
              >
                {loadingAction ? 'Đang xử lý...' : 'Xác Nhận Chuyển'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Approval History Modal */}
      {activeModal === 'HISTORY' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                Lịch Sử Phê Duyệt & Kiểm Toán ({periodCode})
              </h3>
              <button
                onClick={() => setActiveModal('NONE')}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="text-center py-8 text-xs text-slate-400">Đang tải lịch sử...</div>
            ) : historyList.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Chưa có bản ghi phê duyệt nào được ghi nhận cho kỳ này.
              </div>
            ) : (
              <div className="space-y-3">
                {historyList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <Badge
                        variant="outline"
                        className={
                          item.decision === 'APPROVE' || item.decision === 'CONFIRM_PAID'
                            ? 'border-emerald-500/30 text-emerald-400'
                            : item.decision === 'REJECT_TO_CALCULATED'
                            ? 'border-red-500/30 text-red-400'
                            : 'border-blue-500/30 text-blue-400'
                        }
                      >
                        {item.decision}
                      </Badge>
                      <span className="text-slate-500 text-[11px]">
                        {new Date(item.actionAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <div className="text-slate-300">
                      Giai đoạn: <span className="font-mono text-slate-200">{item.stage}</span>
                    </div>
                    <div className="text-slate-400">
                      Người thực hiện: <span className="text-white">{item.actorEmail || 'Hệ thống'}</span>
                      {item.reviewer && ` (${item.reviewer.lastName} ${item.reviewer.firstName})`}
                    </div>
                    {item.comments && (
                      <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px] italic">
                        &quot;{item.comments}&quot;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Adjustment Request Modal */}
      {activeModal === 'ADJUSTMENT' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-amber-400" />
                Đề Xuất Điều Chỉnh / Hồi Tố
              </h3>
              <button
                onClick={() => setActiveModal('NONE')}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdjustment} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nhân viên cần điều chỉnh:</label>
                <select
                  required
                  value={targetEmployeeId}
                  onChange={(e) => setTargetEmployeeId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                >
                  <option value="">-- Chọn nhân viên --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employeeCode} — {emp.lastName} {emp.firstName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Loại điều chỉnh:</label>
                  <select
                    value={adjType}
                    onChange={(e) => setAdjType(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                  >
                    <option value="OT_CORRECTION">Bổ sung giờ OT</option>
                    <option value="BONUS_ADJUSTMENT">Điều chỉnh thưởng</option>
                    <option value="PENALTY_REFUND">Hoàn phạt sai</option>
                    <option value="SALARY_RETROACTIVE">Truy lĩnh lương</option>
                    <option value="DEDUCTION_CORRECTION">Khấu trừ khác</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Chiều phát sinh:</label>
                  <select
                    value={adjDirection}
                    onChange={(e) => setAdjDirection(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                  >
                    <option value="ADDITION">Truy lĩnh (Cộng tiền)</option>
                    <option value="DEDUCTION">Truy thu (Trừ tiền)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Số tiền điều chỉnh (VNĐ):</label>
                <input
                  type="number"
                  required
                  min={1000}
                  step={1000}
                  value={adjAmount || ''}
                  onChange={(e) => setAdjAmount(Number(e.target.value))}
                  placeholder="e.g. 500000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Lý do & căn cứ điều chỉnh:</label>
                <textarea
                  required
                  rows={3}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Ghi rõ lý do sai sót, biên bản hoặc căn cứ xác nhận..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2.5 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveModal('NONE')}
                  className="border-slate-700 text-slate-300 text-xs"
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={loadingAction}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs"
                >
                  {loadingAction ? 'Đang gửi...' : 'Gửi Đề Xuất'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
