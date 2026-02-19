'use client';

import { cn } from '@/lib/utils';

interface MiniEquityCurveProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function MiniEquityCurve({ values, width = 200, height = 48, className }: MiniEquityCurveProps) {
  if (values.length < 2) {
    return (
      <div className={cn('flex items-center justify-center text-[10px] text-[var(--text-muted)]', className)} style={{ width, height }}>
        Collecting data...
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = height * 0.1;
  const usableH = height - padY * 2;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = padY + usableH - ((v - min) / range) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isPositive = values[values.length - 1] >= values[0];
  const strokeColor = isPositive ? 'var(--success)' : 'var(--danger)';

  // Create fill gradient path
  const fillPoints = [
    `0,${height}`,
    ...points,
    `${width},${height}`,
  ].join(' ');

  return (
    <svg
      width={width}
      height={height}
      className={cn('flex-shrink-0', className)}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={`eq-grad-${isPositive ? 'up' : 'dn'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#eq-grad-${isPositive ? 'up' : 'dn'})`}
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
