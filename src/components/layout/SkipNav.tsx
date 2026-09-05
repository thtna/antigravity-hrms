import React from 'react';

export function SkipNav() {
  return (
    <a
      href="#main-content"
      className="
        fixed left-4 top-4 z-[10000]
        -translate-y-20 focus:translate-y-0
        rounded-lg bg-blue-600 px-4 py-2
        text-sm font-semibold text-white shadow-lg
        transition-transform duration-150
        focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950
      "
    >
      Bỏ qua điều hướng
    </a>
  );
}
