'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrencyVND } from '@/lib/utils';
import { X, Users, Mail, Phone, Briefcase, Crown, Loader2 } from 'lucide-react';

interface DepartmentEmployeesModalProps {
  departmentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DepartmentEmployeesModal({
  departmentId,
  isOpen,
  onClose,
}: DepartmentEmployeesModalProps) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (departmentId && isOpen) {
      setLoading(true);
      fetch(`/api/v1/departments/${departmentId}/employees`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setData(json.data);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setData(null);
    }
  }, [departmentId, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="relative max-h-[85vh] w-full max-w-3xl overflow-hidden border-slate-800 bg-slate-900 shadow-2xl flex flex-col text-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/70 p-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
                <Users className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                {data?.departmentName || 'Nhân sự phòng ban'}
              </h2>
              <Badge variant="outline" className="font-mono text-blue-400 border-blue-500/30">
                {data?.departmentCode}
              </Badge>
              <Badge variant="secondary">
                {data?.employeeCount || 0} Nhân sự
              </Badge>
            </div>

            {data?.manager && (
              <p className="text-xs text-amber-400 mt-1 flex items-center gap-1.5">
                <Crown className="h-3.5 w-3.5" />
                <span>Trưởng phòng: <strong>{data.manager.fullName}</strong> ({data.manager.employeeCode})</span>
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 flex-1 space-y-3">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="text-xs">Đang tải danh sách nhân viên trực thuộc...</span>
            </div>
          ) : !data?.employees || data.employees.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs rounded-xl border border-dashed border-slate-800">
              Phòng ban hiện chưa có nhân sự nào trực thuộc.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden">
              {data.employees.map((emp: any) => (
                <div
                  key={emp.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 hover:bg-slate-900/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0">
                      {emp.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={emp.avatarUrl}
                          alt={emp.fullName}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <span>
                          {emp.lastName?.[0]}
                          {emp.firstName?.[0]}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{emp.fullName}</span>
                        <span className="font-mono text-[11px] text-slate-400 font-medium">
                          {emp.employeeCode}
                        </span>
                        {emp.id === data.manager?.id && (
                          <Badge variant="warning" className="text-[10px] py-0 px-1">
                            Trưởng phòng
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3 text-slate-500" />
                          {emp.position?.title || 'Chưa gán'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-slate-500" />
                          {emp.user?.email || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-500" />
                          {emp.phoneNumber}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono text-xs font-semibold text-amber-400 block">
                      {formatCurrencyVND(emp.contractSalary)}
                    </span>
                    <Badge
                      variant={
                        emp.status === 'ACTIVE'
                          ? 'success'
                          : emp.status === 'PROBATION'
                          ? 'warning'
                          : 'outline'
                      }
                      className="text-[10px] mt-0.5"
                    >
                      {emp.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-800 bg-slate-950/60 p-3.5">
          <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700 text-xs">
            Đóng
          </Button>
        </div>
      </Card>
    </div>
  );
}
