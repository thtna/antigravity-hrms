'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KeyRound, Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.');
        setLoading(false);
        return;
      }

      setSubmitted(true);
      setLoading(false);
    } catch {
      setErrorMessage('Không thể kết nối tới máy chủ. Vui lòng thử lại sau.');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#070b14] px-4 py-12">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

      <Card className="relative z-10 w-full max-w-md border-slate-800/80 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-500 ring-1 ring-blue-500/20">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold text-white tracking-tight">
            Khôi Phục Mật Khẩu
          </CardTitle>
          <CardDescription className="text-sm text-slate-400">
            Nhập email doanh nghiệp để nhận hướng dẫn đặt lại mật khẩu
          </CardDescription>
        </CardHeader>

        <CardContent>
          {submitted ? (
            <div className="space-y-4 py-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="text-base font-semibold text-white">Yêu Cầu Đã Được Tiếp Nhận</h4>
              <p className="text-sm text-slate-300">
                Nếu địa chỉ email <span className="font-semibold text-white">{email}</span> tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến bạn.
              </p>
              <div className="pt-4">
                <Button asChild className="w-full bg-slate-800 hover:bg-slate-700 text-white">
                  <Link href="/login" className="flex items-center justify-center gap-2">
                    <ArrowLeft className="h-4 w-4" /> Trở về Đăng Nhập
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
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
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang gửi yêu cầu...
                  </span>
                ) : (
                  'Gửi Hướng Dẫn Khôi Phục'
                )}
              </Button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Trở về Đăng Nhập
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
