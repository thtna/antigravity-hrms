'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AdminHrDashboardView } from './AdminHrDashboardView';
import { ManagerDashboardView } from './ManagerDashboardView';
import { EmployeeDashboardView } from './EmployeeDashboardView';
import { Button } from '@/components/ui/button';
import { RoleCode } from '@/types';
import { SkeletonStatCard, SkeletonCard } from '@/components/ui/skeleton';
import {
  RotateCcw,
  ShieldCheck,
  Users,
  User,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';

export function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentRole, setCurrentRole] = useState<'admin' | 'manager' | 'employee'>('admin');
  const [availableRoles, setAvailableRoles] = useState<RoleCode[]>(['employee']);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);

  const fetchDashboard = useCallback(async (role?: string, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const url = role ? `/api/v1/dashboard?role=${role}` : `/api/v1/dashboard`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Không thể tải dữ liệu dashboard.');
      }

      setCurrentRole(json.data.currentRole);
      setAvailableRoles(json.data.availableRoles || ['employee']);
      setSessionUser(json.data.sessionUser);
      setDashboardData(json.data.payload);
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra khi tải dữ liệu.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleSwitchRole = (role: 'admin' | 'manager' | 'employee') => {
    setCurrentRole(role);
    fetchDashboard(role);
  };

  const handleMarkNotificationRead = async (notificationId?: string) => {
    try {
      await fetch('/api/v1/dashboard/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });
      // Refresh current view without showing full screen loader
      await fetchDashboard(currentRole, true);
    } catch (e) {
      console.error('Lỗi khi đánh dấu thông báo:', e);
    }
  };

  const handleQuickLogin = async (email: string) => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password: 'Antigravity@2026',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Đăng nhập thất bại.');
      }
      // Re-fetch dashboard once session cookie is set
      await fetchDashboard(undefined, false);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi đăng nhập nhanh.');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2.5 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          <span>Đang đồng bộ số liệu thời gian thực...</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
          <SkeletonStatCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard rows={5} />
          <SkeletonCard rows={5} />
        </div>
      </div>
    );
  }

  const isAuthError = error && (
    error.toLowerCase().includes('đăng nhập') ||
    error.toLowerCase().includes('xác thực') ||
    error.toLowerCase().includes('unauthorized')
  );

  if (isAuthError) {
    return (
      <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-900/90 p-8 text-center space-y-6 backdrop-blur-md shadow-2xl">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10 text-blue-400 shadow-inner">
          <ShieldCheck className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-0.5 text-xs font-semibold text-blue-400">
            YÊU CẦU XÁC THỰC TÀI KHOẢN
          </div>
          <h3 className="text-2xl font-bold tracking-tight text-white">
            Trải Nghiệm Bảng Điều Khiển Antigravity HRMS
          </h3>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Hệ thống quản trị thời gian thực yêu cầu đăng nhập theo vai trò. Bạn có thể chọn đăng nhập nhanh 1-click với các tài khoản mẫu bên dưới để trải nghiệm ngay:
          </p>
        </div>

        {/* 1-Click Quick Demo Login Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 max-w-2xl mx-auto pt-2">
          <button
            onClick={() => handleQuickLogin('admin@antigravity.internal')}
            disabled={refreshing}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-blue-500/40 bg-blue-950/30 hover:bg-blue-900/50 text-center transition-all group shadow-lg shadow-blue-950/40 disabled:opacity-50"
          >
            <ShieldCheck className="h-6 w-6 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">1-Click Đăng Nhập Admin</span>
            <span className="text-[10px] text-blue-300/80 font-mono mt-0.5">admin@antigravity.internal</span>
            <span className="mt-2 text-[10px] rounded-full bg-blue-500/20 text-blue-300 px-2 py-0.5 font-semibold">
              Toàn quyền hệ thống
            </span>
          </button>

          <button
            onClick={() => handleQuickLogin('manager.tech@antigravity.internal')}
            disabled={refreshing}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/30 hover:bg-indigo-900/50 text-center transition-all group shadow-lg shadow-indigo-950/40 disabled:opacity-50"
          >
            <Users className="h-6 w-6 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">1-Click Đăng Nhập Manager</span>
            <span className="text-[10px] text-indigo-300/80 font-mono mt-0.5">manager.tech@antigravity.internal</span>
            <span className="mt-2 text-[10px] rounded-full bg-indigo-500/20 text-indigo-300 px-2 py-0.5 font-semibold">
              Quản lý phòng TECH
            </span>
          </button>

          <button
            onClick={() => handleQuickLogin('dev.an@antigravity.internal')}
            disabled={refreshing}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/50 text-center transition-all group shadow-lg shadow-emerald-950/40 disabled:opacity-50"
          >
            <User className="h-6 w-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">1-Click Đăng Nhập Employee</span>
            <span className="text-[10px] text-emerald-300/80 font-mono mt-0.5">dev.an@antigravity.internal</span>
            <span className="mt-2 text-[10px] rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 font-semibold">
              Nhân viên lập trình
            </span>
          </button>
        </div>

        <div className="pt-2 text-xs text-slate-500">
          Hoặc bạn có thể truy cập trang{' '}
          <a href="/login" className="text-blue-400 underline hover:text-blue-300 font-semibold">
            Đăng Nhập Chuẩn
          </a>{' '}
          để nhập thông tin thủ công.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-8 text-center space-y-4">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white">Không Thể Tải Dashboard</h3>
          <p className="text-sm text-red-300 max-w-md mx-auto">{error}</p>
        </div>
        <Button
          onClick={() => fetchDashboard(currentRole)}
          className="bg-red-600 hover:bg-red-500 text-white"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Thử Lại
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Controls Bar: Role Switcher & Live Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        {/* Role Switcher Tabs (Visible for Admin/HR & Managers) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            Góc nhìn:
          </span>

          {availableRoles.includes('admin') && (
            <button
              onClick={() => handleSwitchRole('admin')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                currentRole === 'admin'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 ring-1 ring-blue-400'
                  : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Quản Trị (Admin / HR)
            </button>
          )}

          {availableRoles.includes('manager') && (
            <button
              onClick={() => handleSwitchRole('manager')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
                currentRole === 'manager'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 ring-1 ring-indigo-400'
                  : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Quản Lý (Manager)
            </button>
          )}

          <button
            onClick={() => handleSwitchRole('employee')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              currentRole === 'employee'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 ring-1 ring-emerald-400'
                : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            Cá Nhân (Employee)
          </button>
        </div>

        {/* User Info & Refresh Button */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          {sessionUser && (
            <div className="text-right hidden sm:block">
              <span className="text-xs font-semibold text-white block">{sessionUser.fullName}</span>
              <span className="text-[10px] text-slate-400 font-mono">{sessionUser.email}</span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboard(currentRole, true)}
            disabled={refreshing}
            className="border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white text-xs"
          >
            <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            Làm Mới
          </Button>
        </div>
      </div>

      {/* Render Active Role View */}
      {currentRole === 'admin' && dashboardData && (
        <AdminHrDashboardView data={dashboardData} />
      )}

      {currentRole === 'manager' && dashboardData && (
        <ManagerDashboardView data={dashboardData} />
      )}

      {currentRole === 'employee' && dashboardData && (
        <EmployeeDashboardView
          data={dashboardData}
          onMarkNotificationRead={handleMarkNotificationRead}
        />
      )}
    </div>
  );
}
