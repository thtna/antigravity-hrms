'use client';

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function LeavesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Leaves Page Error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center p-8 min-h-[400px]">
      <Card className="max-w-md w-full border-slate-800 bg-slate-900/80 backdrop-blur-xl p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <h3 className="text-lg font-semibold text-white">
          Không thể tải dữ liệu Nghỉ Phép
        </h3>

        <p className="mt-1.5 text-sm text-slate-400">
          {error.message || 'Đã xảy ra lỗi khi nạp danh sách đơn xin nghỉ phép & ngoại lệ.'}
        </p>

        <Button
          onClick={() => reset()}
          className="mt-5 bg-blue-600 hover:bg-blue-500 text-white gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Tải Lại Trang
        </Button>
      </Card>
    </div>
  );
}
