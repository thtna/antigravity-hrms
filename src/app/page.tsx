import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PendingLeavesWidget } from '@/components/leaves/PendingLeavesWidget';
import { DashboardClient } from '@/components/dashboard/DashboardClient';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { 
  ShieldCheck, 
  Database, 
  Layers, 
  Server, 
  Clock, 
  Users, 
  Calculator, 
  TrendingUp, 
  Award,
  CheckCircle2
} from 'lucide-react';

export default function Home() {
  const foundations = [
    {
      title: 'Next.js 16 + TypeScript',
      description: 'App Router hiện đại, Strict TypeScript, Server Components & Route Handlers.',
      icon: Server,
      status: 'Active',
    },
    {
      title: 'PostgreSQL 16 + Prisma ORM',
      description: '26 bảng thực thể quan hệ 3NF, Compound Indexes, Cascade/Restrict rules chặt chẽ.',
      icon: Database,
      status: 'Ready',
    },
    {
      title: 'Tailwind CSS & shadcn/ui',
      description: 'Hệ thống thiết kế Royal Luxury Dark/Light mode, Glassmorphism, Micro-animations.',
      icon: Layers,
      status: 'Styled',
    },
    {
      title: 'Docker & Docker Compose',
      description: 'Container hóa toàn diện: Next.js multi-stage build, PostgreSQL & Redis.',
      icon: ShieldCheck,
      status: 'Configured',
    },
    {
      title: 'Validation Foundation (Zod)',
      description: 'Kiểm soát chặt chẽ biên độ dữ liệu tại trust boundaries, an toàn 100%.',
      icon: CheckCircle2,
      status: 'Verified',
    },
    {
      title: 'Logging & Error Handling',
      description: 'Structured JSON Logger, Custom ApiError, Format Envelope chuẩn RESTful.',
      icon: Clock,
      status: 'Operational',
    },
  ];

  const upcomingModules = [
    { title: 'Quản Trị Nhân Sự (HR)', icon: Users, phase: 'Phase 3' },
    { title: 'Chấm Công QR & GPS', icon: Clock, phase: 'Phase 5' },
    { title: 'Đánh Giá Mục Tiêu KPI', icon: TrendingUp, phase: 'Phase 7' },
    { title: 'Động Cơ Tính Lương (Payroll)', icon: Calculator, phase: 'Phase 8' },
    { title: 'Thưởng Phạt & Vinh Danh', icon: Award, phase: 'Phase 8' },
    { title: 'Bảo Mật & Kiểm Toán (RBAC)', icon: ShieldCheck, phase: 'Phase 2' },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#070b14] via-[#0d1527] to-[#070b14] px-6 py-12 lg:px-16">
      <div className="mx-auto max-w-7xl space-y-12">
        {/* Top Header */}
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              ANTIGRAVITY MASTER PROJECT — PRODUCTION LIVE
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Hệ Thống Quản Trị Nhân Sự & Chấm Công
            </h1>
            <p className="mt-2 text-base text-slate-400 max-w-2xl">
              Nền tảng kiến trúc doanh nghiệp chuẩn Modular Monolith — Không mock dữ liệu, không giao diện giả, độ chính xác tuyệt đối.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <NotificationBell />
            <a href="/notifications">
              <Button variant="outline" className="border-blue-500/40 bg-blue-950/40 text-blue-300 hover:bg-blue-900/50">
                🔔 Thông Báo
              </Button>
            </a>
            <a href="/login">
              <Button variant="outline" className="border-slate-700 bg-slate-900/80 text-slate-300">
                Đăng Nhập
              </Button>
            </a>
            <a href="/attendance">
              <Button variant="outline" className="border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50">
                Chấm Công (Attendance)
              </Button>
            </a>
            <a href="/organization">
              <Button variant="outline" className="border-blue-500/40 bg-blue-950/40 text-blue-300 hover:bg-blue-900/50">
                Phòng Ban & Chức Vụ
              </Button>
            </a>
            <a href="/shifts">
              <Button variant="outline" className="border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50">
                Ca & Phân Ca
              </Button>
            </a>
            <a href="/leaves">
              <Button variant="outline" className="border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50">
                Nghỉ Phép & Ngoại Lệ
              </Button>
            </a>
            <a href="/kpi">
              <Button variant="outline" className="border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50">
                Hiệu Suất & KPI
              </Button>
            </a>
            <a href="/bonus">
              <Button variant="outline" className="border-yellow-500/40 bg-yellow-950/40 text-yellow-300 hover:bg-yellow-900/50">
                Khen Thưởng (Bonus)
              </Button>
            </a>
            <a href="/penalties">
              <Button variant="outline" className="border-red-500/40 bg-red-950/40 text-red-300 hover:bg-red-900/50">
                Kỷ Luật & Phạt (Penalties)
              </Button>
            </a>
            <a href="/payroll/rules">
              <Button variant="outline" className="border-cyan-500/40 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50">
                Quy Chế Lương (Rules)
              </Button>
            </a>
            <a href="/payroll">
              <Button variant="outline" className="border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50">
                Bảng Lương (Payroll)
              </Button>
            </a>
            <a href="/my-payslips">
              <Button variant="outline" className="border-purple-500/40 bg-purple-950/40 text-purple-300 hover:bg-purple-900/50">
                Phiếu Lương (Payslip)
              </Button>
            </a>
            <a href="/reports">
              <Button variant="outline" className="border-blue-500/50 bg-blue-950/40 text-blue-300 hover:bg-blue-900/50 font-semibold shadow-md shadow-blue-500/10">
                📑 Báo Cáo (Reports & Export)
              </Button>
            </a>
            <a href="/employees">
              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 text-white">
                Quản Lý Nhân Sự (HR)
              </Button>
            </a>
          </div>
        </div>

        {/* Real-time Role-Based Dashboard Section (Phase 18) */}
        <div className="rounded-2xl border border-blue-500/20 bg-slate-900/30 p-6 backdrop-blur-md">
          <DashboardClient />
        </div>

        {/* Foundation Grid */}
        <div>
          <h2 className="text-xl font-semibold text-white tracking-tight mb-4 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
            Nền Móng Kỹ Thuật Dự Án (Foundation Stack)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {foundations.map((item, index) => {
              const Icon = item.icon;
              return (
                <Card key={index} className="border-slate-800/80 bg-slate-900/40 hover:border-blue-500/40 transition-all duration-300 group">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="success">{item.status}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    <CardTitle className="text-base text-white group-hover:text-blue-300 transition-colors">
                      {item.title}
                    </CardTitle>
                    <CardDescription className="text-sm text-slate-400 leading-relaxed">
                      {item.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Upcoming Functional Pillars */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Các Trụ Cột Nghiệp Vụ Tiếp Theo</h2>
              <p className="text-sm text-slate-400">Được triển khai tuần tự theo đúng kỷ luật Phase-Gate.</p>
            </div>
            <Badge variant="outline" className="border-blue-500/30 text-blue-400">
              Phase 2 → Phase 10
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {upcomingModules.map((mod, idx) => {
              const ModIcon = mod.icon;
              return (
                <div key={idx} className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-800/60 bg-slate-950/40 text-center hover:border-slate-700 transition-colors">
                  <div className="p-3 rounded-full bg-slate-800/50 text-slate-300 mb-3">
                    <ModIcon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-200">{mod.title}</span>
                  <span className="text-[10px] text-blue-400 mt-1">{mod.phase}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leave Pending Widget */}
        <PendingLeavesWidget canProcess leavesHref="/leaves" />

        {/* Footer info */}
        <div className="pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div>ANTIGRAVITY MASTER PROJECT © 2026. Enterprise Production Standard.</div>
          <div className="flex gap-4">
            <span>Modular Monolith</span>
            <span>•</span>
            <span>Zero Mocks</span>
            <span>•</span>
            <span>Full ACID Compliance</span>
          </div>
        </div>
      </div>
    </main>
  );
}
