'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App-level Runtime Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#070b14] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-slate-800 bg-slate-900/90 backdrop-blur-xl p-8 text-center shadow-2xl shadow-black/80">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h2 className="text-xl font-bold text-white tracking-tight">
          Đã có lỗi xảy ra khi tải trang
        </h2>

        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          {error.message || 'Hệ thống gặp sự cố ngoài dự kiến trong quá trình xử lý giao diện.'}
        </p>

        {error.digest && (
          <p className="mt-2 text-xs font-mono text-slate-500 bg-slate-950/60 rounded-md py-1 px-2 inline-block">
            Mã lỗi: {error.digest}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            onClick={() => reset()}
            className="bg-blue-600 hover:bg-blue-500 text-white gap-2 shadow-lg shadow-blue-600/20"
          >
            <RotateCcw className="h-4 w-4" />
            Thử Tải Lại
          </Button>

          <Link href="/dashboard">
            <Button
              variant="outline"
              className="border-slate-700 bg-slate-800/60 text-slate-300 hover:text-white gap-2"
            >
              <Home className="h-4 w-4" />
              Về Dashboard
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
