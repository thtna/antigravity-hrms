'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  MapPin,
  Users,
  Briefcase,
  Clock,
  UserPlus,
  Navigation,
  Calculator,
  ArrowRight,
  ArrowLeft,
  FastForward,
  CheckCircle2,
  Sparkles,
  Loader2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface OnboardingStatus {
  organization: {
    id: string;
    name: string;
    taxCode: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  onboardingStep: number;
  onboardingSkipped: boolean;
  isCompleted: boolean;
  steps: Array<{
    step: number;
    key: string;
    name: string;
    completed: boolean;
  }>;
}

const STEP_DEFINITIONS = [
  {
    step: 1,
    title: 'Thông Tin Doanh Nghiệp',
    description: 'Xác nhận thông tin định danh pháp lý và liên hệ của công ty',
    icon: Building2,
  },
  {
    step: 2,
    title: 'Chi Nhánh Làm Việc',
    description: 'Thiết lập trụ sở chính hoặc chi nhánh hoạt động đầu tiên',
    icon: MapPin,
  },
  {
    step: 3,
    title: 'Cơ Cấu Phòng Ban',
    description: 'Tạo phòng ban nghiệp vụ khởi đầu (Kỹ thuật, Kinh doanh, v.v.)',
    icon: Users,
  },
  {
    step: 4,
    title: 'Chức Danh & Vị Trí',
    description: 'Định nghĩa vị trí làm việc và khung lương cơ bản',
    icon: Briefcase,
  },
  {
    step: 5,
    title: 'Ca Làm Việc Chuẩn',
    description: 'Cấu hình khung giờ làm việc và quy tắc chấm công ca',
    icon: Clock,
  },
  {
    step: 6,
    title: 'Nhân Sự Đầu Tiên',
    description: 'Tạo hồ sơ nhân viên để bắt đầu vận hành hệ thống',
    icon: UserPlus,
  },
  {
    step: 7,
    title: 'Địa Điểm Chấm Công GPS/QR',
    description: 'Cài đặt tọa độ văn phòng và bán kính cho phép chấm công',
    icon: Navigation,
  },
  {
    step: 8,
    title: 'Quy Chế Tiền Lương',
    description: 'Kích hoạt quy chuẩn tính lương theo Bộ luật Lao động Việt Nam',
    icon: Calculator,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states for all 8 steps
  const [step1Data, setStep1Data] = useState({
    name: '',
    taxCode: '',
    email: '',
    phone: '',
    address: '',
  });

  const [step2Data, setStep2Data] = useState({
    name: 'Trụ sở chính',
    code: 'HQ',
    address: '',
    phone: '',
  });

  const [step3Data, setStep3Data] = useState({
    name: 'Phòng Công Nghệ',
    code: 'TECH',
    description: 'Bộ phận phát triển sản phẩm & hạ tầng số',
  });

  const [step4Data, setStep4Data] = useState({
    title: 'Kỹ Sư Phần Mềm',
    code: 'SWE',
    description: 'Phát triển và bảo trì hệ thống phần mềm',
    baseSalaryGrade: 18000000,
    minSalary: 15000000,
    maxSalary: 35000000,
  });

  const [step5Data, setStep5Data] = useState({
    name: 'Ca Hành Chính',
    code: 'HC-01',
    description: 'Ca tiêu chuẩn 8h/ngày từ thứ Hai đến thứ Sáu',
    shiftType: 'FIXED' as const,
    startTime: '08:30',
    endTime: '17:30',
    breakMinutes: 60,
    gracePeriodLate: 15,
    gracePeriodEarly: 15,
    standardWorkHours: 8,
  });

  const [step6Data, setStep6Data] = useState({
    firstName: 'Văn A',
    lastName: 'Nguyễn',
    employeeCode: 'EMP-001',
    email: 'nhanvien@company.vn',
    phoneNumber: '0987654321',
    contractSalary: 18000000,
  });

  const [step7Data, setStep7Data] = useState({
    name: 'Văn Phòng Trụ Sở Chính',
    address: 'Hà Nội, Việt Nam',
    latitude: 21.028511,
    longitude: 105.854444,
    radiusMeters: 150,
    enableQr: true,
    enableGps: true,
  });

  const [step8Data, setStep8Data] = useState({
    ruleCode: 'VN_STATUTORY_2026',
    ruleName: 'Quy chế tiền lương Luật Lao Động 2026',
    standardWorkDays: 22,
    useStatutoryVietnam: true,
  });

  // Fetch initial onboarding status
  useEffect(() => {
    async function loadStatus() {
      try {
        setLoading(true);
        const res = await fetch('/api/v1/onboarding/status');
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || 'Không thể tải trạng thái Onboarding.');
        }

        const data: OnboardingStatus = json.data;
        setStatus(data);

        // Pre-fill Step 1 if available
        if (data.organization) {
          setStep1Data({
            name: data.organization.name || '',
            taxCode: data.organization.taxCode || '',
            email: data.organization.email || '',
            phone: data.organization.phone || '',
            address: data.organization.address || '',
          });
        }

        // Auto-navigate to current unfinished step
        const nextStep = Math.min(8, Math.max(1, data.onboardingStep === 0 ? 1 : data.onboardingStep));
        setCurrentStep(nextStep);
      } catch (err: any) {
        setError(err.message || 'Lỗi khi tải thông tin thiết lập.');
      } finally {
        setLoading(false);
      }
    }

    loadStatus();
  }, []);

  const handleSaveStep = async (step: number) => {
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    let payload: any = {};
    if (step === 1) payload = step1Data;
    else if (step === 2) payload = step2Data;
    else if (step === 3) payload = step3Data;
    else if (step === 4) payload = step4Data;
    else if (step === 5) payload = step5Data;
    else if (step === 6) payload = step6Data;
    else if (step === 7) payload = step7Data;
    else if (step === 8) payload = step8Data;

    try {
      const res = await fetch('/api/v1/onboarding/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, data: payload }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || `Lưu bước ${step} thất bại.`);
      }

      setStatus(json.data.status);
      setSuccessMessage(`Đã hoàn tất bước ${step}: ${STEP_DEFINITIONS[step - 1].title}!`);

      if (step >= 8) {
        // Finished all steps
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        setCurrentStep(step + 1);
      }
    } catch (err: any) {
      setError(err.message || 'Đã có lỗi xảy ra.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipStep = async (step: number) => {
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/onboarding/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Bỏ qua bước thất bại.');
      }

      setStatus(json.data.status);

      if (step >= 8) {
        router.push('/dashboard');
      } else {
        setCurrentStep(step + 1);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi bỏ qua bước.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipAll = async () => {
    if (!confirm('Bạn có chắc chắn muốn bỏ qua toàn bộ thiết lập và vào thẳng Dashboard?')) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/v1/onboarding/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'Bỏ qua thiết lập thất bại.');
      }

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Lỗi khi bỏ qua toàn bộ.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-400">Đang chuẩn bị không gian làm việc của bạn...</p>
        </div>
      </div>
    );
  }

  const currentDef = STEP_DEFINITIONS[currentStep - 1] || STEP_DEFINITIONS[0];
  const StepIcon = currentDef.icon;
  const progressPercent = Math.round((currentStep / 8) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070b14] via-[#0d1527] to-[#070b14] text-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              CHÀO MỪNG CHỦ SỞ HỮU (OWNER)
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Khởi Tạo Không Gian Doanh Nghiệp (Onboarding)
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Thiết lập nền tảng 8 bước cho {status?.organization.name || 'doanh nghiệp của bạn'}. Bạn có thể bỏ qua bất kỳ bước nào.
            </p>
          </div>

          <button
            onClick={handleSkipAll}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 transition-colors self-start sm:self-center"
          >
            <FastForward className="h-3.5 w-3.5" />
            Bỏ qua toàn bộ thiết lập →
          </button>
        </div>

        {/* Progress Bar & Stepper Tabs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-blue-400 font-semibold">Bước {currentStep} / 8</span>
            <span className="text-slate-400">{progressPercent}% Hoàn thành</span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Stepper Pills */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-2">
            {STEP_DEFINITIONS.map((def) => {
              const isActive = def.step === currentStep;
              const isPast = def.step < currentStep;
              const Icon = def.icon;

              return (
                <button
                  key={def.step}
                  onClick={() => setCurrentStep(def.step)}
                  className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all ${
                    isActive
                      ? 'border-blue-500 bg-blue-600/20 text-blue-300 shadow-md shadow-blue-500/10'
                      : isPast
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mb-1" />
                  <span className="text-[10px] font-medium truncate w-full">
                    {def.step}. {def.title.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Wizard Main Card */}
        <Card className="border-slate-800/80 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
          <CardHeader className="border-b border-slate-800/80 pb-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400 ring-1 ring-blue-500/30">
                <StepIcon className="h-6 w-6" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Bước {currentDef.step} trên 8
                </span>
                <CardTitle className="text-xl font-bold text-white tracking-tight sm:text-2xl">
                  {currentDef.title}
                </CardTitle>
                <CardDescription className="text-sm text-slate-400">
                  {currentDef.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-5">
            {/* STEP 1: BUSINESS */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Tên Doanh Nghiệp *</label>
                  <input
                    type="text"
                    value={step1Data.name}
                    onChange={(e) => setStep1Data({ ...step1Data, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Công ty Cổ phần Công nghệ ABC"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Mã Số Thuế</label>
                    <input
                      type="text"
                      value={step1Data.taxCode}
                      onChange={(e) => setStep1Data({ ...step1Data, taxCode: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="0101234567"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Số Điện Thoại</label>
                    <input
                      type="text"
                      value={step1Data.phone}
                      onChange={(e) => setStep1Data({ ...step1Data, phone: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="024 3999 8888"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Email Doanh Nghiệp</label>
                  <input
                    type="email"
                    value={step1Data.email}
                    onChange={(e) => setStep1Data({ ...step1Data, email: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="contact@company.com"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Địa Chỉ Trụ Sở</label>
                  <input
                    type="text"
                    value={step1Data.address}
                    onChange={(e) => setStep1Data({ ...step1Data, address: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Số 123 Đường Láng, Đống Đa, Hà Nội"
                  />
                </div>
              </div>
            )}

            {/* STEP 2: BRANCH */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Tên Chi Nhánh *</label>
                    <input
                      type="text"
                      value={step2Data.name}
                      onChange={(e) => setStep2Data({ ...step2Data, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="Trụ sở chính"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Mã Chi Nhánh *</label>
                    <input
                      type="text"
                      value={step2Data.code}
                      onChange={(e) => setStep2Data({ ...step2Data, code: e.target.value.toUpperCase() })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="HQ"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Địa Chỉ Chi Nhánh</label>
                  <input
                    type="text"
                    value={step2Data.address}
                    onChange={(e) => setStep2Data({ ...step2Data, address: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Tầng 10, Tòa nhà Landmark, Hà Nội"
                  />
                </div>
              </div>
            )}

            {/* STEP 3: DEPARTMENT */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Tên Phòng Ban *</label>
                    <input
                      type="text"
                      value={step3Data.name}
                      onChange={(e) => setStep3Data({ ...step3Data, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="Phòng Kỹ Thuật"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Mã Phòng Ban *</label>
                    <input
                      type="text"
                      value={step3Data.code}
                      onChange={(e) => setStep3Data({ ...step3Data, code: e.target.value.toUpperCase() })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="TECH"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Mô Tả Chức Năng</label>
                  <input
                    type="text"
                    value={step3Data.description}
                    onChange={(e) => setStep3Data({ ...step3Data, description: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Chịu trách nhiệm nghiên cứu và vận hành hệ thống phần mềm"
                  />
                </div>
              </div>
            )}

            {/* STEP 4: POSITION */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Tên Chức Danh / Vị Trí *</label>
                    <input
                      type="text"
                      value={step4Data.title}
                      onChange={(e) => setStep4Data({ ...step4Data, title: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="Kỹ Sư Phần Mềm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Mã Chức Danh *</label>
                    <input
                      type="text"
                      value={step4Data.code}
                      onChange={(e) => setStep4Data({ ...step4Data, code: e.target.value.toUpperCase() })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="SWE"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Lương Cơ Bản Định Ngạch (VND)</label>
                    <input
                      type="number"
                      value={step4Data.baseSalaryGrade}
                      onChange={(e) => setStep4Data({ ...step4Data, baseSalaryGrade: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Lương Tối Thiểu (VND)</label>
                    <input
                      type="number"
                      value={step4Data.minSalary}
                      onChange={(e) => setStep4Data({ ...step4Data, minSalary: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Lương Tối Đa (VND)</label>
                    <input
                      type="number"
                      value={step4Data.maxSalary}
                      onChange={(e) => setStep4Data({ ...step4Data, maxSalary: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: SHIFT */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Tên Ca Làm Việc *</label>
                    <input
                      type="text"
                      value={step5Data.name}
                      onChange={(e) => setStep5Data({ ...step5Data, name: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="Ca Hành Chính"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Mã Ca *</label>
                    <input
                      type="text"
                      value={step5Data.code}
                      onChange={(e) => setStep5Data({ ...step5Data, code: e.target.value.toUpperCase() })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="HC-01"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Giờ Bắt Đầu (HH:mm)</label>
                    <input
                      type="text"
                      value={step5Data.startTime}
                      onChange={(e) => setStep5Data({ ...step5Data, startTime: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Giờ Kết Thúc (HH:mm)</label>
                    <input
                      type="text"
                      value={step5Data.endTime}
                      onChange={(e) => setStep5Data({ ...step5Data, endTime: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Thời Gian Nghỉ (Phút)</label>
                    <input
                      type="number"
                      value={step5Data.breakMinutes}
                      onChange={(e) => setStep5Data({ ...step5Data, breakMinutes: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: EMPLOYEE */}
            {currentStep === 6 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Họ và Đệm *</label>
                    <input
                      type="text"
                      value={step6Data.lastName}
                      onChange={(e) => setStep6Data({ ...step6Data, lastName: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="Nguyễn"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Tên Nhân Viên *</label>
                    <input
                      type="text"
                      value={step6Data.firstName}
                      onChange={(e) => setStep6Data({ ...step6Data, firstName: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="Văn A"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Mã Nhân Viên *</label>
                    <input
                      type="text"
                      value={step6Data.employeeCode}
                      onChange={(e) => setStep6Data({ ...step6Data, employeeCode: e.target.value.toUpperCase() })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                      placeholder="EMP-001"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Email Làm Việc *</label>
                    <input
                      type="email"
                      value={step6Data.email}
                      onChange={(e) => setStep6Data({ ...step6Data, email: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="nhanvien@company.vn"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Số Điện Thoại *</label>
                    <input
                      type="text"
                      value={step6Data.phoneNumber}
                      onChange={(e) => setStep6Data({ ...step6Data, phoneNumber: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                      placeholder="0987654321"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Lương Hợp Đồng (VND)</label>
                    <input
                      type="number"
                      value={step6Data.contractSalary}
                      onChange={(e) => setStep6Data({ ...step6Data, contractSalary: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 7: ATTENDANCE SETTINGS */}
            {currentStep === 7 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Tên Địa Điểm Chấm Công *</label>
                  <input
                    type="text"
                    value={step7Data.name}
                    onChange={(e) => setStep7Data({ ...step7Data, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Văn Phòng Trụ Sở Chính"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Địa Chỉ *</label>
                  <input
                    type="text"
                    value={step7Data.address}
                    onChange={(e) => setStep7Data({ ...step7Data, address: e.target.value })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    placeholder="Số 123 Đường Láng, Hà Nội"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Vĩ Độ (Latitude)</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={step7Data.latitude}
                      onChange={(e) => setStep7Data({ ...step7Data, latitude: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Kinh Độ (Longitude)</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={step7Data.longitude}
                      onChange={(e) => setStep7Data({ ...step7Data, longitude: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Bán Kính Chấm Công (Mét)</label>
                    <input
                      type="number"
                      value={step7Data.radiusMeters}
                      onChange={(e) => setStep7Data({ ...step7Data, radiusMeters: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 8: PAYROLL SETTINGS */}
            {currentStep === 8 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Tên Quy Chế Tiền Lương *</label>
                    <input
                      type="text"
                      value={step8Data.ruleName}
                      onChange={(e) => setStep8Data({ ...step8Data, ruleName: e.target.value })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Mã Quy Chế *</label>
                    <input
                      type="text"
                      value={step8Data.ruleCode}
                      onChange={(e) => setStep8Data({ ...step8Data, ruleCode: e.target.value.toUpperCase() })}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white font-mono uppercase focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Số Ngày Công Chuẩn Hàng Tháng</label>
                  <input
                    type="number"
                    value={step8Data.standardWorkDays}
                    onChange={(e) => setStep8Data({ ...step8Data, standardWorkDays: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-slate-300 space-y-1.5">
                  <p className="font-semibold text-blue-400">✨ Tiêu chuẩn tuân thủ luật định tự động:</p>
                  <p>• Bảo hiểm xã hội: 8% BHXH, 1.5% BHYT, 1% BHTN</p>
                  <p>• Thuế TNCN: Lũy tiến từng phần 7 bậc (Giảm trừ bản thân 11.000.000đ, người phụ thuộc 4.400.000đ)</p>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/80 pt-6">
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentStep(currentStep - 1)}
                  disabled={submitting}
                  className="border-slate-800 bg-slate-900/60 text-slate-300 text-xs"
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Bước Trước
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleSkipStep(currentStep)}
                disabled={submitting}
                className="text-slate-400 hover:text-amber-300 hover:bg-slate-800/40 text-xs"
              >
                Bỏ qua bước này
                <FastForward className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => handleSaveStep(currentStep)}
              disabled={submitting}
              className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs px-6 py-2 shadow-lg shadow-blue-500/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang Lưu...
                </>
              ) : currentStep === 8 ? (
                <>
                  Hoàn Tất Thiết Lập & Vào Dashboard
                  <CheckCircle2 className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Lưu & Tiếp Tục
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
