import React from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  /** Mobile card label (defaults to same as label) */
  mobileLabel?: string;
  render: (row: T) => React.ReactNode;
  /** If true, show this field as the card's primary header on mobile */
  mobileHeader?: boolean;
  /** Hide on mobile card view */
  mobileHidden?: boolean;
  /** Tailwind width class for desktop (e.g. 'w-32' or 'w-1/5') */
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  className?: string;
  /** Breakpoint in px below which we switch to card view. Default 768 */
  breakpoint?: number;
  stickyHeader?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  className,
  stickyHeader = false,
}: ResponsiveTableProps<T>) {
  return (
    <div className={cn('w-full', className)}>
      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800/60">
        <table className="w-full text-sm" role="table">
          <thead className={cn('bg-slate-900/80', stickyHeader && 'sticky top-0 z-10')}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    !col.align && 'text-left',
                    col.width
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-slate-800/40 last:border-0 transition-colors',
                  onRowClick &&
                    'cursor-pointer hover:bg-slate-800/40 focus-visible:bg-slate-800/40'
                )}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                role={onRowClick ? 'button' : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-3.5 text-slate-200',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right'
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list (hidden on desktop) ── */}
      <div className="md:hidden space-y-3">
        {rows.map((row) => {
          const headerCol = columns.find((c) => c.mobileHeader) ?? columns[0];
          const bodyColumns = columns.filter((c) => !c.mobileHeader && !c.mobileHidden);

          return (
            <div
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              role={onRowClick ? 'button' : undefined}
              className={cn(
                'rounded-xl border border-slate-800/60 bg-slate-900/40 p-4',
                onRowClick &&
                  'cursor-pointer hover:border-slate-700 hover:bg-slate-800/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
              )}
            >
              {/* Card header */}
              <div className="mb-3 font-semibold text-white text-sm">
                {headerCol.render(row)}
              </div>

              {/* Card fields */}
              <div className="space-y-2">
                {bodyColumns.map((col) => (
                  <div key={col.key} className="flex items-start justify-between gap-2 text-xs">
                    <span className="shrink-0 text-slate-500 min-w-[90px]">
                      {col.mobileLabel ?? col.label}
                    </span>
                    <span className="text-slate-300 text-right">{col.render(row)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
