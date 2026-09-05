'use client';

import React, { useState } from 'react';

// ==============================================================================
// 1. SVG Multi-Series Bar Chart
// ==============================================================================
export interface BarSeries {
  name: string;
  color: string; // e.g. '#3b82f6'
  key: string;
}

export interface BarChartProps {
  data: Array<{
    label: string;
    [key: string]: any;
  }>;
  series: BarSeries[];
  height?: number;
  valueFormatter?: (val: number) => string;
}

export function SvgBarChart({ data, series, height = 240, valueFormatter = (v) => `${v}` }: BarChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        Chưa có dữ liệu thống kê
      </div>
    );
  }

  // Determine max value for Y-axis scaling
  let maxVal = 0;
  for (const item of data) {
    for (const s of series) {
      const v = Number(item[s.key] || 0);
      if (v > maxVal) maxVal = v;
    }
  }
  maxVal = maxVal > 0 ? Math.ceil(maxVal * 1.15) : 10;

  const padding = { top: 20, right: 20, bottom: 35, left: 45 };
  const chartWidth = 550;
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const barGroupWidth = innerWidth / data.length;
  const singleBarWidth = Math.min(22, (barGroupWidth * 0.7) / series.length);

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span>{s.name}</span>
          </div>
        ))}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${height}`}
          className="w-full overflow-visible"
          style={{ height: `${height}px` }}
        >
          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + innerHeight * (1 - ratio);
            const val = Math.round(maxVal * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray={ratio === 0 ? undefined : '3,3'}
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] select-none font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((item, idx) => {
            const groupX = padding.left + idx * barGroupWidth;
            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer transition-opacity"
              >
                {/* Subtle highlight background on hover */}
                {isHovered && (
                  <rect
                    x={groupX}
                    y={padding.top}
                    width={barGroupWidth}
                    height={innerHeight}
                    fill="rgba(255, 255, 255, 0.04)"
                    rx={4}
                  />
                )}

                {series.map((s, sIdx) => {
                  const val = Number(item[s.key] || 0);
                  const barHeight = maxVal > 0 ? (val / maxVal) * innerHeight : 0;
                  const barX = groupX + (barGroupWidth - series.length * singleBarWidth) / 2 + sIdx * singleBarWidth;
                  const barY = padding.top + (innerHeight - barHeight);

                  return (
                    <g key={s.key}>
                      <rect
                        x={barX}
                        y={barY}
                        width={singleBarWidth - 2}
                        height={Math.max(2, barHeight)}
                        fill={s.color}
                        rx={3}
                        className="transition-all duration-300 hover:brightness-125"
                      />
                    </g>
                  );
                })}

                {/* X Axis Label */}
                <text
                  x={groupX + barGroupWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  className={`text-[11px] select-none ${isHovered ? 'fill-blue-400 font-semibold' : 'fill-slate-400'}`}
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Tooltip Overlay */}
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="pointer-events-none absolute top-2 right-2 rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 text-xs shadow-xl backdrop-blur-md">
            <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 mb-1.5">
              {data[hoveredIdx].label}
            </div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}:
                </span>
                <span className="font-semibold text-white">
                  {valueFormatter(Number(data[hoveredIdx][s.key] || 0))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==============================================================================
// 2. SVG Smooth Area & Line Chart
// ==============================================================================
export interface AreaLineChartProps {
  data: Array<{
    label: string;
    value: number;
    secondaryValue?: number;
  }>;
  lineColor?: string;
  fillColor?: string;
  secondaryLineColor?: string;
  height?: number;
  valueFormatter?: (val: number) => string;
  primaryName?: string;
  secondaryName?: string;
}

export function SvgAreaLineChart({
  data,
  lineColor = '#3b82f6',
  fillColor = 'rgba(59, 130, 246, 0.15)',
  secondaryLineColor = '#10b981',
  height = 220,
  valueFormatter = (v) => `${v}`,
  primaryName = 'Giờ làm',
  secondaryName,
}: AreaLineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-slate-500">
        Chưa có dữ liệu thống kê
      </div>
    );
  }

  const maxVal = Math.max(
    ...data.map((d) => Math.max(Number(d.value || 0), Number(d.secondaryValue || 0))),
    10
  ) * 1.15;

  const padding = { top: 20, right: 20, bottom: 35, left: 40 };
  const width = 550;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const stepX = innerWidth / Math.max(1, data.length - 1);

  // Generate path points
  const points = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + innerHeight - (Number(d.value || 0) / maxVal) * innerHeight;
    return { x, y };
  });

  // SVG Area & Line Path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

  // Secondary path (if provided)
  const hasSecondary = secondaryName && data.some((d) => d.secondaryValue !== undefined);
  const secondaryPoints = hasSecondary
    ? data.map((d, i) => ({
        x: padding.left + i * stepX,
        y: padding.top + innerHeight - (Number(d.secondaryValue || 0) / maxVal) * innerHeight,
      }))
    : [];
  const secondaryPath = secondaryPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="w-full">
      {hasSecondary && (
        <div className="mb-2 flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lineColor }} />
            <span>{primaryName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: secondaryLineColor }} />
            <span>{secondaryName}</span>
          </div>
        </div>
      )}

      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" style={{ height: `${height}px` }}>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((ratio) => {
            const y = padding.top + innerHeight * (1 - ratio);
            const val = Math.round(maxVal * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeDasharray="3,3"
                />
                <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-slate-500 text-[10px] font-mono">
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGradient)" />

          {/* Main Line */}
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" />

          {/* Secondary Line */}
          {hasSecondary && (
            <path
              d={secondaryPath}
              fill="none"
              stroke={secondaryLineColor}
              strokeWidth="2"
              strokeDasharray="4,4"
              strokeLinecap="round"
            />
          )}

          {/* Interactive points */}
          {points.map((p, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {/* Vertical guide line on hover */}
                {isHovered && (
                  <line
                    x1={p.x}
                    y1={padding.top}
                    x2={p.x}
                    y2={padding.top + innerHeight}
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeDasharray="2,2"
                  />
                )}

                {/* Primary node */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 5.5 : 3.5}
                  fill="#070b14"
                  stroke={lineColor}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  className="transition-all duration-200"
                />

                {/* X Axis Label */}
                <text
                  x={p.x}
                  y={height - 10}
                  textAnchor="middle"
                  className={`text-[10px] select-none ${isHovered ? 'fill-blue-400 font-semibold' : 'fill-slate-500'}`}
                >
                  {data[idx].label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="pointer-events-none absolute top-2 right-2 rounded-lg border border-slate-700 bg-slate-900/95 p-2 text-xs shadow-xl backdrop-blur-md">
            <div className="font-semibold text-slate-200">{data[hoveredIdx].label}</div>
            <div className="flex items-center gap-2 text-blue-400 font-bold mt-0.5">
              <span>{primaryName}:</span>
              <span>{valueFormatter(Number(data[hoveredIdx].value || 0))}</span>
            </div>
            {hasSecondary && (
              <div className="flex items-center gap-2 text-emerald-400 text-[11px] mt-0.5">
                <span>{secondaryName}:</span>
                <span>{valueFormatter(Number(data[hoveredIdx].secondaryValue || 0))}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==============================================================================
// 3. SVG Circular Progress / Donut Ring
// ==============================================================================
export interface DonutProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  primaryColor?: string;
  trackColor?: string;
  centerText?: string;
  subText?: string;
}

export function SvgDonutProgress({
  percentage,
  size = 130,
  strokeWidth = 10,
  primaryColor = '#3b82f6',
  trackColor = 'rgba(255, 255, 255, 0.08)',
  centerText,
  subText,
}: DonutProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress stroke */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={primaryColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-extrabold text-white tracking-tight">
          {centerText || `${Math.round(clamped)}%`}
        </span>
        {subText && <span className="text-[10px] text-slate-400 uppercase tracking-wider">{subText}</span>}
      </div>
    </div>
  );
}
