import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b14] px-4">
      <Card className="max-w-md border-red-500/20 bg-slate-900/60 p-6 text-center shadow-2xl">
        <CardHeader className="flex flex-col items-center space-y-3">
          <div className="rounded-full bg-red-500/10 p-4 text-red-400">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">403 — Truy Cập Bị Từ Chối</CardTitle>
          <CardDescription className="text-sm text-slate-400">
            Bạn không có đủ quyền hạn hoặc vai trò để xem trang này. Vui lòng liên hệ quản trị viên nhân sự nếu bạn tin rằng đây là một sự nhầm lẫn.
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-4 flex justify-center gap-3">
          <Link href="/">
            <Button variant="outline" className="gap-2 border-slate-700">
              <Home className="h-4 w-4" /> Trang chủ
            </Button>
          </Link>
          <Link href="/login">
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
              <ArrowLeft className="h-4 w-4" /> Đổi tài khoản
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
