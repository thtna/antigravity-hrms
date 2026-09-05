'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  variant?: 'blue' | 'emerald' | 'amber' | 'purple' | 'red' | 'cyan' | 'slate';
  badgeText?: string;
  badgeVariant?: 'success' | 'warning' | 'destructive' | 'outline' | 'info';
  onClick?: () => void;
  className?: string;
}

const variantStyles = {
  blue: {
    iconBg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    glow: 'group-hover:border-blue-500/40 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]',
  },
  emerald: {
    iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    glow: 'group-hover:border-emerald-500/40 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]',
  },
  amber: {
    iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    glow: 'group-hover:border-amber-500/40 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]',
  },
  purple: {
    iconBg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    glow: 'group-hover:border-purple-500/40 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]',
  },
  red: {
    iconBg: 'bg-red-500/10 text-red-400 border-red-500/20',
    glow: 'group-hover:border-red-500/40 group-hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]',
  },
  cyan: {
    iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    glow: 'group-hover:border-cyan-500/40 group-hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]',
  },
  slate: {
    iconBg: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    glow: 'group-hover:border-slate-500/40 group-hover:shadow-[0_0_20px_rgba(148,163,184,0.1)]',
  },
};

export function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  variant = 'blue',
  badgeText,
  badgeVariant = 'info',
  onClick,
  className = '',
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 transition-all duration-300 backdrop-blur-sm ${
        onClick ? 'cursor-pointer' : ''
      } ${styles.glow} ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold tracking-tight text-white">{value}</h3>
            {subValue && <span className="text-xs text-slate-400">{subValue}</span>}
          </div>
        </div>

        <div className={`rounded-lg border p-2.5 transition-colors ${styles.iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {badgeText && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
              badgeVariant === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : badgeVariant === 'warning'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : badgeVariant === 'destructive'
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}
          >
            {badgeText}
          </span>
        </div>
      )}
    </div>
  );
}
