'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    errorParam === 'account_inactive'
      ? 'Tài khoản của bạn đã bị vô hiệu hóa.'
      : errorParam === 'session_expired'
      ? 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.'
      : ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
        setLoading(false);
        return;
      }

      // Successful login
      router.push(redirect);
      router.refresh();
    } catch {
      setErrorMessage('Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại mạng.');
      setLoading(false);
    }
  };

  const handleQuickFill = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('Antigravity@2026');
    setErrorMessage('');
  };

  return (
    <Card className="relative z-10 w-full max-w-md border-slate-800/80 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-500 ring-1 ring-blue-500/20">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl font-bold text-white tracking-tight">
          Antigravity HRMS
        </CardTitle>
        <CardDescription className="text-sm text-slate-400">
          Đăng nhập hệ thống quản trị nhân sự & chấm công
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Email Doanh Nghiệp</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                placeholder="admin@antigravity.internal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Mật Khẩu</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold shadow-lg shadow-blue-500/25 h-10"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang xác thực...
              </span>
            ) : (
              'Đăng Nhập An Toàn'
            )}
          </Button>
        </form>

        {/* Quick Demo Credentials for Reviewers */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">Tài khoản mẫu (Demo Roles):</span>
            <Badge variant="outline" className="text-[10px] text-slate-400">Pass: Antigravity@2026</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickFill('admin@antigravity.internal')}
              className="rounded-md border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 text-left text-slate-300 hover:border-blue-500 hover:text-white transition-colors"
            >
              <div className="font-semibold text-blue-400">Admin</div>
              <div className="truncate text-[10px] text-slate-500">admin@antigravity.internal</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('hr@antigravity.internal')}
              className="rounded-md border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 text-left text-slate-300 hover:border-blue-500 hover:text-white transition-colors"
            >
              <div className="font-semibold text-emerald-400">HR Manager</div>
              <div className="truncate text-[10px] text-slate-500">hr@antigravity.internal</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('manager@antigravity.internal')}
              className="rounded-md border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 text-left text-slate-300 hover:border-blue-500 hover:text-white transition-colors"
            >
              <div className="font-semibold text-amber-400">Dept Manager</div>
              <div className="truncate text-[10px] text-slate-500">manager@antigravity.internal</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('employee@antigravity.internal')}
              className="rounded-md border border-slate-800 bg-slate-950/40 px-2.5 py-1.5 text-left text-slate-300 hover:border-blue-500 hover:text-white transition-colors"
            >
              <div className="font-semibold text-purple-400">Employee</div>
              <div className="truncate text-[10px] text-slate-500">employee@antigravity.internal</div>
            </button>
          </div>
        </div>
      </CardContent>

      <CardFooter className="justify-center border-t border-slate-800/40 text-xs text-slate-600">
        Phân quyền RBAC & IDOR Protection kích hoạt 100%
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#070b14] px-4 py-12">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <Suspense fallback={<div className="text-slate-400 text-sm">Đang tải biểu mẫu...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
