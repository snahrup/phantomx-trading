// src/components/mission-control/MiniChartCard.tsx
'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface MiniChartCardProps {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  pnl: number;
  entryPrice: number;
  priceHistory: number[];
  isFocused: boolean;
  onClick: () => void;
  closeFlash?: 'win' | 'loss' | null;
}

export default function MiniChartCard({
  symbol, direction, leverage, pnl, entryPrice,
  priceHistory, isFocused, onClick, closeFlash,
}: MiniChartCardProps) {
  const displayName = symbol.replace('/USDT:USDT', '').replace('/USDT', '');
  const safePnl = Number.isFinite(pnl) ? pnl : 0;
  const pnlColor = safePnl >= 0 ? 'text-emerald-400' : 'text-red-400';
  const lineColor = safePnl >= 0 ? '#34d399' : '#f87171';

  const sparkline = useMemo(() => {
    if (priceHistory.length < 2) return '';
    const min = Math.min(...priceHistory);
    const max = Math.max(...priceHistory);
    const range = max - min || 1;
    const w = 200;
    const h = 30;
    const divisor = priceHistory.length - 1;
    return priceHistory
      .map((p, i) => `${(i / divisor) * w},${h - ((p - min) / range) * h}`)
      .join(' ');
  }, [priceHistory]);

  const entryX = useMemo(() => {
    if (priceHistory.length < 2) return null;
    if (!entryPrice || entryPrice <= 0) return null;
    const idx = priceHistory.findIndex(p => Math.abs(p - entryPrice) / entryPrice < 0.001);
    if (idx < 0) return null;
    return (idx / (priceHistory.length - 1)) * 200;
  }, [priceHistory, entryPrice]);

  const flashBg = closeFlash === 'win'
    ? 'bg-emerald-500/20 border-emerald-500'
    : closeFlash === 'loss'
    ? 'bg-red-500/20 border-red-500'
    : isFocused
    ? 'bg-card border-blue-500'
    : 'bg-card border-border';

  return (
    <motion.div
      onClick={onClick}
      className={`flex-1 border rounded-lg p-2 cursor-pointer transition-colors relative ${flashBg}`}
      animate={closeFlash ? { opacity: [1, 0.5, 1, 0.5, 1] } : {}}
      transition={closeFlash ? { duration: 3, times: [0, 0.25, 0.5, 0.75, 1] } : {}}
    >
      {isFocused && (
        <span className="absolute top-1 right-1.5 bg-blue-500 text-white text-[7px] px-1 py-0.5 rounded font-bold">
          FOCUSED
        </span>
      )}

      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-bold text-foreground">{displayName}</span>
        <span className={`text-xs font-medium ${pnlColor}`}>
          {safePnl >= 0 ? '+' : ''}${safePnl.toFixed(2)}
        </span>
      </div>

      <div className="text-[10px] text-muted-foreground mb-1">
        {direction} {leverage}x · {entryPrice.toFixed(entryPrice < 1 ? 6 : 2)}
      </div>

      <svg viewBox="0 0 200 30" className="w-full h-6">
        {sparkline && (
          <polyline points={sparkline} fill="none" stroke={lineColor} strokeWidth="1.5" />
        )}
        {entryX !== null && (
          <line
            x1={entryX} y1={0} x2={entryX} y2={30}
            stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="2,2" opacity={0.6}
          />
        )}
      </svg>
    </motion.div>
  );
}
