'use client';

import { useTradingStore } from '@/store/trading-store';
import MiniChartCard from './MiniChartCard';

interface MiniChartStripProps {
  closeFlashes: Record<string, 'win' | 'loss'>;
}

export default function MiniChartStrip({ closeFlashes }: MiniChartStripProps) {
  const positions = useTradingStore(s => s.positions);
  const focusedSymbol = useTradingStore(s => s.focusedPositionSymbol);
  const setFocused = useTradingStore(s => s.setFocusedPositionSymbol);
  const maxPositions = useTradingStore(s => s.missionControlConfig.maxConcurrentPositions);
  const priceHistoryMap = useTradingStore(s => s.positionPriceHistory);

  const emptySlots = Math.max(0, maxPositions - positions.length);

  return (
    <div className="flex gap-2">
      {positions.map(pos => (
        <MiniChartCard
          key={pos.symbol}
          symbol={pos.symbol}
          direction={pos.side === 'long' ? 'LONG' : 'SHORT'}
          leverage={pos.leverage ?? 50}
          pnl={pos.unrealizedPnl ?? 0}
          entryPrice={pos.entryPrice ?? 0}
          priceHistory={priceHistoryMap[pos.symbol] ?? []}
          isFocused={focusedSymbol === pos.symbol}
          onClick={() => setFocused(pos.symbol)}
          closeFlash={closeFlashes[pos.symbol] ?? null}
        />
      ))}

      {Array.from({ length: emptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex-1 border border-dashed border-border rounded-lg flex items-center justify-center min-h-[72px]"
        >
          <span className="text-xs text-zinc-700">No position</span>
        </div>
      ))}
    </div>
  );
}
