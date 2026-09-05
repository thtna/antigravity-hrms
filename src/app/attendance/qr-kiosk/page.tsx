'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Copy,
  Building2,
} from 'lucide-react';

export default function QrKioskPage() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [tokenType, setTokenType] = useState<'ANY' | 'CHECK_IN' | 'CHECK_OUT'>('ANY');
  const [location] = useState('Sảnh Văn Phòng Chính - Tầng 1');

  // QR token state
  const [qrData, setQrData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // 30 seconds countdown
  const DURATION = 30;
  const [countdown, setCountdown] = useState(DURATION);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Digital clock
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch new QR token
  const fetchNewToken = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await fetch('/api/v1/attendance/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenType,
          expiresInSeconds: DURATION,
          location,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setQrData(data.data);
        setCountdown(DURATION);
      } else {
        setErrorMessage(data.error?.message || 'Không thể tạo mã QR mới.');
      }
    } catch {
      setErrorMessage('Lỗi kết nối mạng khi lấy mã QR.');
    } finally {
      setLoading(false);
    }
  }, [tokenType, location]);

  // Initial fetch and rotation loop
  useEffect(() => {
    fetchNewToken();
  }, [fetchNewToken]);

  // Countdown timer effect
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchNewToken();
          return DURATION;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchNewToken]);

  const handleCopyPayload = () => {
    if (!qrData?.qrPayload) return;
    navigator.clipboard.writeText(qrData.qrPayload);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const progressPercent = Math.round((countdown / DURATION) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#030712] via-[#0b1329] to-[#030712] text-slate-100 flex flex-col justify-between px-4 py-6 sm:px-8">
      {/* Top Bar */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <Link href="/attendance">
            <Button variant="outline" size="sm" className="border-slate-800 bg-slate-900 text-slate-300 hover:text-white">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Thoát Kiosk
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                Kiosk Chấm Công Mã QR Sảnh Văn Phòng
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                  LIVE ROTATION
                </Badge>
              </h1>
              <p className="text-xs text-slate-400">{location}</p>
            </div>
          </div>
        </div>

        {/* Digital Clock */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-black font-mono tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-white">
              {currentTime ? currentTime.toLocaleTimeString('vi-VN') : '--:--:--'}
            </div>
            <div className="text-xs text-slate-400">
              {currentTime ? currentTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="my-auto py-6 flex flex-col items-center justify-center">
        <Card className="w-full max-w-xl border-slate-800/80 bg-slate-900/60 backdrop-blur-xl p-8 rounded-3xl shadow-[0_0_50px_rgba(30,58,138,0.2)] text-center space-y-6">
          {/* Mode Selector */}
          <div className="flex items-center justify-center gap-2 p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800">
            <button
              onClick={() => setTokenType('ANY')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                tokenType === 'ANY'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Vào / Ra Linh Hoạt
            </button>
            <button
              onClick={() => setTokenType('CHECK_IN')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                tokenType === 'CHECK_IN'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Chỉ Vào Ca (Check-In)
            </button>
            <button
              onClick={() => setTokenType('CHECK_OUT')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                tokenType === 'CHECK_OUT'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Chỉ Tan Ca (Check-Out)
            </button>
          </div>

          {/* QR Container */}
          <div className="relative mx-auto flex flex-col items-center">
            {/* Outer Glow Ring */}
            <div className="relative p-5 rounded-3xl bg-gradient-to-tr from-blue-600/20 via-slate-800/40 to-indigo-600/20 border-2 border-slate-800 shadow-2xl">
              {/* QR Image */}
              {qrData?.qrDataUrl ? (
                <div className="relative overflow-hidden rounded-2xl bg-white p-3 shadow-inner">
                  <Image
                    src={qrData.qrDataUrl}
                    alt="Attendance QR Code"
                    width={280}
                    height={280}
                    className="h-64 w-64 object-contain sm:h-72 sm:w-72"
                    priority
                    unoptimized
                  />
                  {/* Watermark brand */}
                  <div className="absolute inset-x-0 bottom-1 flex justify-center">
                    <span className="text-[9px] font-mono tracking-widest text-slate-700 bg-white/90 px-2 py-0.5 rounded">
                      ANTIGRAVITY SECURE QR
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-64 w-64 sm:h-72 sm:w-72 flex flex-col items-center justify-center bg-slate-950/60 rounded-2xl">
                  <RefreshCw className="h-10 w-10 animate-spin text-blue-400 mb-2" />
                  <span className="text-xs text-slate-400">Đang tạo mã QR bảo mật...</span>
                </div>
              )}
            </div>

            {/* Rotation Countdown Bar */}
            <div className="w-full max-w-[280px] sm:max-w-[320px] mt-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <RefreshCw className={`h-3.5 w-3.5 text-blue-400 ${loading ? 'animate-spin' : ''}`} />
                  Tự động xoay mã sau:
                </span>
                <span className="font-mono font-bold text-blue-400 text-sm">{countdown}s</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Anti-Replay & Security Highlights */}
          <div className="grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Anti-Replay Active
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Mỗi mã chỉ được sử dụng đúng 1 lần. Chống chụp ảnh gửi qua tin nhắn.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[11px] font-bold text-indigo-400 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                HMAC-SHA256 Signed
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Kèm chữ ký bảo mật xác thực nguồn gốc từ máy chủ Antigravity.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Test copy payload bar (Convenient for desktop testing) */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <button
              onClick={handleCopyPayload}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 font-mono"
            >
              <Copy className="h-3.5 w-3.5 text-blue-400" />
              {copySuccess ? 'Đã sao chép payload!' : 'Sao chép mã thử nghiệm (Copy Test Payload)'}
            </button>

            <Button
              variant="ghost"
              size="sm"
              onClick={fetchNewToken}
              disabled={loading}
              className="text-xs text-slate-400 hover:text-white h-7 px-2"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Đổi mã ngay
            </Button>
          </div>
        </Card>
      </main>

      {/* Footer Instructions */}
      <footer className="border-t border-slate-800/80 pt-4 text-center text-xs text-slate-500">
        Mở ứng dụng HRMS trên điện thoại của bạn ➔ Chọn mục &ldquo;Chấm Công&rdquo; ➔ Bấm &ldquo;Quét QR Chấm Công&rdquo; để xác nhận ca làm việc.
      </footer>
    </div>
  );
}
