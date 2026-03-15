'use client';

import { useTradingStore } from '@/store/trading-store';
import MiniChartCard from './MiniChartCard';

const PHASE_LABELS: Record<string, string> = {
  analyzing: 'ANALYZING',
  pipeline: 'PIPELINE',
  monitoring: 'MONITORING',
};

const PHASE_COLORS: Record<string, string> = {
  analyzing: 'text-blue-400 border-blue-500/30',
  pipeline: 'text-amber-400 border-amber-500/30 animate-pulse',
  monitoring: 'text-emerald-400 border-emerald-500/30',
};

interface MiniChartStripProps {
  closeFlashes: Record<string, 'win' | 'loss'>;
}

export default function MiniChartStrip({ closeFlashes }: MiniChartStripProps) {
  const positions = useTradingStore(s => s.positions);
  const focusedSymbol = useTradingStore(s => s.focusedPositionSymbol);
  const setFocused = useTradingStore(s => s.setFocusedPositionSymbol);
  const setSymbol = useTradingStore(s => s.setSymbol);
  const maxPositions = useTradingStore(s => s.missionControlConfig.maxConcurrentPositions);
  const priceHistoryMap = useTradingStore(s => s.positionPriceHistory);
  const agentActiveSymbols = useTradingStore(s => s.agentActiveSymbols);

  // Show positions first, then fill remaining slots with agent-active symbols
  const positionSymbols = new Set(positions.map(p => p.symbol));
  const agentSlots = agentActiveSymbols
    .filter(s => !positionSymbols.has(s.symbol))
    .slice(0, Math.max(0, maxPositions - positions.length));
  const totalEmptySlots = Math.max(0, maxPositions - positions.length - agentSlots.length);

  const handleAgentSlotClick = (symbol: string) => {
    setFocused(symbol);
    setSymbol(symbol);
  };

  return (
    <div className="flex gap-2">
      {/* Open position cards */}
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

      {/* Agent-active symbol cards (scanning/pipeline) */}
      {agentSlots.map(({ symbol, phase }) => {
        const base = symbol.split('/')[0];
        const phaseColor = PHASE_COLORS[phase] ?? 'text-zinc-400 border-zinc-500/30';
        const isFocused = focusedSymbol === symbol;
        return (
          <div
            key={`agent-${symbol}`}
            onClick={() => handleAgentSlotClick(symbol)}
            className={`flex-1 border rounded-lg px-3 py-2 min-h-[72px] cursor-pointer transition-colors ${
              isFocused
                ? 'border-blue-500/50 bg-blue-500/5'
                : 'border-border hover:border-border/80 bg-card'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">{base}/USDT</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${phaseColor}`}>
                {PHASE_LABELS[phase] ?? phase.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Agents analyzing...
            </div>
          </div>
        );
      })}

      {/* Empty slots */}
      {Array.from({ length: totalEmptySlots }).map((_, i) => (
        <div
          key={`empty-${i}`}
          className="flex-1 border border-dashed border-border rounded-lg flex items-center justify-center min-h-[72px]"
        >
          <span className="text-xs text-muted-foreground">Waiting for agent</span>
        </div>
      ))}
    </div>
  );
}
