import { cn } from '@/lib/utils';

// ─── Base Skeleton ────────────────────────────────────────────────────────────

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-slate-800/70',
        className
      )}
      {...props}
    />
  );
}

// ─── Line ─────────────────────────────────────────────────────────────────────

export function SkeletonLine({ className }: { className?: string }) {
  return <Skeleton className={cn('h-4 w-full', className)} />;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' }[size];
  return <Skeleton className={cn('rounded-full shrink-0', sizeClass)} />;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3"
    >
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="w-3/5" />
          <SkeletonLine className="w-2/5 h-3" />
        </div>
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonLine key={i} className={i === rows - 1 ? 'w-3/4' : 'w-full'} />
        ))}
      </div>
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

export function SkeletonTable({
  rows = 5,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div aria-hidden="true" className="w-full overflow-hidden rounded-xl border border-slate-800/60">
      {/* Header */}
      <div className="flex gap-4 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          className="flex items-center gap-4 border-b border-slate-800/40 px-4 py-3.5 last:border-0"
        >
          <SkeletonAvatar size="sm" />
          {Array.from({ length: cols - 1 }).map((_, ci) => (
            <Skeleton
              key={ci}
              className={cn('h-3.5 flex-1', ci === cols - 2 && 'max-w-[80px]')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function SkeletonStatCard() {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <SkeletonLine className="w-2/5 h-3" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <SkeletonLine className="w-1/3 h-8" />
      <SkeletonLine className="w-1/2 h-3" />
    </div>
  );
}
