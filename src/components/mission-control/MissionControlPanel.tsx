'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTradingStore } from '@/store/trading-store';
import StatusBar from './StatusBar';
import LaunchPanel from './LaunchPanel';
import AgentFeedPanel from './AgentFeedPanel';
import MiniChartStrip from './MiniChartStrip';
import type { TradeCloseEvent } from '@/types/mission-control';

// Dynamically import TradingChart to avoid SSR issues with lightweight-charts
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('@/components/chart/TradingChart'), { ssr: false });

export default function MissionControlPanel() {
  const isExecuting = useTradingStore(s => s.isExecuting);
  const isKilled = useTradingStore(s => s.isKilled);
  const isFeedCollapsed = useTradingStore(s => s.isFeedCollapsed);
  const focusedSymbol = useTradingStore(s => s.focusedPositionSymbol);
  const positions = useTradingStore(s => s.positions);
  const setFocused = useTradingStore(s => s.setFocusedPositionSymbol);
  const setSymbol = useTradingStore(s => s.setSymbol);

  const [tradeCloseEvents, setTradeCloseEvents] = useState<TradeCloseEvent[]>([]);
  const [closeFlashes, setCloseFlashes] = useState<Record<string, 'win' | 'loss'>>({});

  // Auto-focus first position if none focused
  useEffect(() => {
    if (!focusedSymbol && positions.length > 0) {
      setFocused(positions[0].symbol);
    }
  }, [focusedSymbol, positions, setFocused]);

  // Sync focused symbol to the store's selectedSymbol so TradingChart renders the right chart
  useEffect(() => {
    if (focusedSymbol) {
      setSymbol(focusedSymbol);
    }
  }, [focusedSymbol, setSymbol]);

  const handleDismissClose = useCallback((id: string) => {
    setTradeCloseEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  // Show launch panel if not executing and not killed
  const showLaunchPanel = !isExecuting && !isKilled;

  if (showLaunchPanel) {
    return <LaunchPanel />;
  }

  const focusedPosition = positions.find(p => p.symbol === focusedSymbol);

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Status Bar */}
      <StatusBar />

      {/* Main Content: Chart + Feed */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Chart Area */}
        <div className="flex-[2] flex flex-col bg-card border border-border rounded-lg p-3 min-w-0">
          {/* Chart Header */}
          {focusedSymbol && focusedPosition && (
            <div className="flex items-center justify-between mb-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">
                  {focusedSymbol.replace('/USDT:USDT', '').replace('/USDT', '')}/USDT
                </span>
                <span className={`text-xs font-medium ${
                  focusedPosition.side === 'long' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {focusedPosition.side.toUpperCase()} {focusedPosition.leverage}x
                </span>
                <span className={`text-xs ${
                  (focusedPosition.unrealizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {(focusedPosition.unrealizedPnl ?? 0) >= 0 ? '+' : ''}
                  ${(focusedPosition.unrealizedPnl ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="flex-1 min-h-0">
            <TradingChart />
          </div>
        </div>

        {/* Agent Feed */}
        <div className={`${isFeedCollapsed ? 'w-8' : 'flex-1'} flex`}>
          <AgentFeedPanel
            tradeCloseEvents={tradeCloseEvents}
            onDismissClose={handleDismissClose}
          />
        </div>
      </div>

      {/* Mini Chart Strip */}
      <MiniChartStrip closeFlashes={closeFlashes} />
    </div>
  );
}
