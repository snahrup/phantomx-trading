// src/components/mission-control/TradeCloseCard.tsx
'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { TradeCloseEvent } from '@/types/mission-control';

interface TradeCloseCardProps {
  event: TradeCloseEvent;
  onDismiss: () => void;
}

export default function TradeCloseCard({ event, onDismiss }: TradeCloseCardProps) {
  // Auto-dismiss after 30 seconds
  useEffect(() => {
    const timer = setTimeout(onDismiss, 30_000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const borderColor = event.isWin ? 'border-emerald-500/50' : 'border-red-500/50';
  const bgColor = event.isWin ? 'bg-emerald-500/5' : 'bg-red-500/5';
  const pnlColor = event.isWin ? 'text-emerald-400' : 'text-red-400';
  const icon = event.isWin ? '✓' : '✗';
  const label = event.isWin ? 'WIN' : 'LOSS';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      className={`border ${borderColor} ${bgColor} rounded-lg p-3 mb-2`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`font-bold text-sm ${pnlColor}`}>{icon} {label}</span>
        <span className={`text-lg font-bold ${pnlColor}`}>
          {event.pnl >= 0 ? '+' : ''}${event.pnl.toFixed(2)}
        </span>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>{event.symbol} {event.direction} {event.leverage}x</div>
        <div>Entry: {event.entryPrice} → Exit: {event.exitPrice}</div>
        <div>Duration: {event.duration} · R:R: {event.rrAchieved.toFixed(1)}:1</div>
        <div>Strategy: {event.strategy}</div>
      </div>
    </motion.div>
  );
}
