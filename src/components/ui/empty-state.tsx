import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Inbox,
  SearchX,
  FileX2,
  Users,
  Bell,
  Calendar,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

// ─── Preset icons ─────────────────────────────────────────────────────────────

const presetIcons: Record<string, LucideIcon> = {
  inbox: Inbox,
  search: SearchX,
  file: FileX2,
  users: Users,
  bell: Bell,
  calendar: Calendar,
  list: ClipboardList,
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Icon — pass a Lucide component or a preset key */
  icon?: LucideIcon | keyof typeof presetIcons;
  title: string;
  description?: string;
  /** CTA button label */
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  /** Compact variant for use inside table cells or small panels */
  compact?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  compact = false,
}: EmptyStateProps) {
  let IconComponent: LucideIcon = Inbox;
  if (typeof icon === 'string') {
    IconComponent = presetIcons[icon] ?? Inbox;
  } else if (icon) {
    IconComponent = icon;
  }

  return (
    <div
      role="status"
      aria-label={title}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 px-4' : 'py-16 px-6',
        className
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl bg-slate-800/50 text-slate-500',
          compact ? 'h-12 w-12 mb-3' : 'h-16 w-16 mb-4'
        )}
      >
        <IconComponent className={compact ? 'h-6 w-6' : 'h-8 w-8'} aria-hidden="true" />
      </div>

      <h3
        className={cn(
          'font-semibold text-slate-300',
          compact ? 'text-sm' : 'text-base'
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            'mt-1.5 text-slate-500 leading-relaxed max-w-sm',
            compact ? 'text-xs' : 'text-sm'
          )}
        >
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          size={compact ? 'sm' : 'default'}
          className="mt-5 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
