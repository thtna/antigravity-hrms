'use client';

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx.confirm;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleResolve = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    setPending(null);
    resolveRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && <ConfirmDialog opts={pending} onResolve={handleResolve} />}
    </ConfirmContext.Provider>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

function ConfirmDialog({
  opts,
  onResolve,
}: {
  opts: ConfirmOptions;
  onResolve: (v: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button on open (safer default)
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Trap focus within dialog + Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onResolve(false);
      }
      if (e.key === 'Tab') {
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onResolve]);

  const variantConfirmClass = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white',
    default: 'bg-blue-600 hover:bg-blue-700 text-white',
  }[opts.variant ?? 'default'];

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      aria-modal="true"
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby={opts.description ? 'confirm-desc' : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onResolve(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'shrink-0 flex h-10 w-10 items-center justify-center rounded-full',
              opts.variant === 'danger'
                ? 'bg-rose-500/15 text-rose-400'
                : opts.variant === 'warning'
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-blue-500/15 text-blue-400'
            )}
          >
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h2 id="confirm-title" className="text-base font-semibold text-white">
              {opts.title}
            </h2>
            {opts.description && (
              <p id="confirm-desc" className="mt-1 text-sm text-slate-400 leading-relaxed">
                {opts.description}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            onClick={() => onResolve(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 border border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {opts.cancelLabel ?? 'Hủy'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onResolve(true)}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
              variantConfirmClass,
              opts.variant === 'danger' && 'focus-visible:ring-rose-500',
              opts.variant === 'warning' && 'focus-visible:ring-amber-500',
              opts.variant === 'default' && 'focus-visible:ring-blue-500'
            )}
          >
            {opts.confirmLabel ?? 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}
