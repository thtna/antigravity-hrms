'use client';

import React, { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (opts: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

// Convenience shortcuts
export function useToastHelpers() {
  const { toast } = useToast();
  return {
    success: (title: string, description?: string) =>
      toast({ variant: 'success', title, description }),
    error: (title: string, description?: string) =>
      toast({ variant: 'error', title, description }),
    warning: (title: string, description?: string) =>
      toast({ variant: 'warning', title, description }),
    info: (title: string, description?: string) =>
      toast({ variant: 'info', title, description }),
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ variant, title, description, duration = 4000 }: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, variant, title, description, duration }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

const variantConfig: Record<
  ToastVariant,
  { icon: React.ElementType; border: string; iconClass: string; bg: string }
> = {
  success: {
    icon: CheckCircle2,
    border: 'border-emerald-500/40',
    iconClass: 'text-emerald-400',
    bg: 'bg-emerald-950/80',
  },
  error: {
    icon: XCircle,
    border: 'border-rose-500/40',
    iconClass: 'text-rose-400',
    bg: 'bg-rose-950/80',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-amber-500/40',
    iconClass: 'text-amber-400',
    bg: 'bg-amber-950/80',
  },
  info: {
    icon: Info,
    border: 'border-blue-500/40',
    iconClass: 'text-blue-400',
    bg: 'bg-blue-950/80',
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const cfg = variantConfig[toast.variant];
  const Icon = cfg.icon;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'flex items-start gap-3 rounded-xl border backdrop-blur-md px-4 py-3 shadow-lg',
        'transition-all duration-300 ease-out',
        cfg.border,
        cfg.bg,
        visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cfg.iconClass)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs text-slate-300 leading-relaxed">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Đóng thông báo"
        className="shrink-0 text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-label="Thông báo"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
