import React from 'react';
import { AlertTriangle, WifiOff, ShieldX, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ErrorVariant = 'default' | 'network' | 'auth' | 'notFound';

export interface ErrorStateProps {
  variant?: ErrorVariant;
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  /** Compact inline banner style */
  inline?: boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const variantConfig = {
  default: {
    icon: AlertTriangle,
    defaultTitle: 'Đã xảy ra lỗi',
    defaultDesc: 'Không thể tải dữ liệu. Vui lòng thử lại.',
    iconClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    borderClass: 'border-rose-500/30',
  },
  network: {
    icon: WifiOff,
    defaultTitle: 'Lỗi kết nối',
    defaultDesc: 'Không thể kết nối máy chủ. Kiểm tra lại đường truyền.',
    iconClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/30',
  },
  auth: {
    icon: ShieldX,
    defaultTitle: 'Không có quyền truy cập',
    defaultDesc: 'Bạn không có quyền xem nội dung này.',
    iconClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/30',
  },
  notFound: {
    icon: AlertTriangle,
    defaultTitle: 'Không tìm thấy dữ liệu',
    defaultDesc: 'Mục bạn tìm kiếm không tồn tại hoặc đã bị xóa.',
    iconClass: 'text-slate-400',
    bgClass: 'bg-slate-500/10',
    borderClass: 'border-slate-500/30',
  },
};

// ─── Inline Banner ────────────────────────────────────────────────────────────

export function ErrorBanner({
  variant = 'default',
  title,
  description,
  onRetry,
  retryLabel = 'Thử lại',
  className,
}: ErrorStateProps) {
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3',
        cfg.bgClass,
        cfg.borderClass,
        className
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cfg.iconClass)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{title ?? cfg.defaultTitle}</p>
        {(description ?? cfg.defaultDesc) && (
          <p className="mt-0.5 text-xs text-slate-400">{description ?? cfg.defaultDesc}</p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded px-2 py-1"
          aria-label={retryLabel}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

// ─── Full-page Error State ────────────────────────────────────────────────────

export function ErrorState({
  variant = 'default',
  title,
  description,
  onRetry,
  retryLabel = 'Thử lại',
  className,
}: ErrorStateProps) {
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-6',
        className
      )}
    >
      <div
        className={cn(
          'flex h-16 w-16 items-center justify-center rounded-2xl mb-4',
          cfg.bgClass
        )}
      >
        <Icon className={cn('h-8 w-8', cfg.iconClass)} aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-white">{title ?? cfg.defaultTitle}</h3>
      <p className="mt-1.5 text-sm text-slate-400 max-w-sm leading-relaxed">
        {description ?? cfg.defaultDesc}
      </p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="mt-5 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
