'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { useAxonStore } from '@/store/axon-store';
import StatusBar from './StatusBar';
import LaunchPanel from './LaunchPanel';
import AgentFeedPanel from './AgentFeedPanel';
import MiniChartStrip from './MiniChartStrip';
import type { TradeCloseEvent } from '@/types/mission-control';
import { useMissionPolling } from './useMissionPolling';
import { useAgentChartOverlays } from './useAgentChartOverlays';

// Dynamically import TradingChart to avoid SSR issues with lightweight-charts
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('@/components/chart/TradingChart'), { ssr: false });

export default function MissionControlPanel() {
  // Autonomous-mode polling: positions, account, activity feed, agent statuses
  useMissionPolling();
  // Convert agent events into chart annotations, price lines, and overlays
  useAgentChartOverlays();

  const isExecuting = useTradingStore(s => s.isExecuting);
  const isKilled = useTradingStore(s => s.isKilled);
  const isFeedCollapsed = useTradingStore(s => s.isFeedCollapsed);
  const focusedSymbol = useTradingStore(s => s.focusedPositionSymbol);
  const positions = useTradingStore(s => s.positions);
  const setFocused = useTradingStore(s => s.setFocusedPositionSymbol);
  const setSymbol = useTradingStore(s => s.setSymbol);
  const setExecuting = useTradingStore(s => s.setExecuting);
  const agentActiveSymbols = useTradingStore(s => s.agentActiveSymbols);

  const [tradeCloseEvents, setTradeCloseEvents] = useState<TradeCloseEvent[]>([]);
  const [closeFlashes, setCloseFlashes] = useState<Record<string, 'win' | 'loss'>>({});
  const reconciledRef = useRef(false);

  // Reconcile on mount — check if agents are actually running on Axon.
  // If we have active/working agents or open positions, resume the live view
  // instead of showing LaunchPanel again.
  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;

    const reconcile = async () => {
      const axon = useAxonStore.getState();

      // Fetch latest agent state from Axon
      await axon.fetchAgents();
      await axon.fetchActivity(50);

      const agents = useAxonStore.getState().agents;
      const hasActiveAgents = agents.some(
        a => a.status === 'working' || (a.status === 'idle' && (a.heartbeat_interval_s ?? 0) > 0)
      );

      // If agents are alive and we're not killed, we should be in live view
      if (hasActiveAgents && !useTradingStore.getState().isKilled) {
        // Ensure DataProvider loads OHLCV/ticker for the chart
        useTradingStore.getState().setConnected(true);
        setExecuting(true);
      }
    };

    reconcile().catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus first position if none focused, or clear if focused position disappeared
  useEffect(() => {
    if (!focusedSymbol && positions.length > 0) {
      setFocused(positions[0].symbol);
    } else if (focusedSymbol && positions.length > 0 && !positions.some(p => p.symbol === focusedSymbol)) {
      // Only switch if not an agent-active symbol
      const isAgentActive = agentActiveSymbols.some(s => s.symbol === focusedSymbol);
      if (!isAgentActive) {
        setFocused(positions[0].symbol);
      }
    } else if (focusedSymbol && positions.length === 0) {
      // Don't clear if the symbol is being actively scanned by agents
      const isAgentActive = agentActiveSymbols.some(s => s.symbol === focusedSymbol);
      if (!isAgentActive) {
        setFocused(null);
      }
    }
  }, [focusedSymbol, positions, agentActiveSymbols, setFocused]);

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
  const agentActive = agentActiveSymbols.find(s => s.symbol === focusedSymbol);

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Status Bar */}
      <StatusBar />

      {/* Main Content: Chart + Feed */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Chart Area */}
        <div className="flex-[2] flex flex-col bg-card border border-border rounded-lg p-3 min-w-0">
          {/* Chart Header — position or agent-active symbol */}
          {focusedSymbol && (
            <div className="flex items-center justify-between mb-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">
                  {focusedSymbol.replace('/USDT:USDT', '').replace('/USDT', '')}/USDT
                </span>
                {focusedPosition ? (
                  <>
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
                  </>
                ) : agentActive ? (
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                    agentActive.phase === 'pipeline'
                      ? 'text-amber-400 border-amber-500/30 animate-pulse'
                      : agentActive.phase === 'monitoring'
                      ? 'text-emerald-400 border-emerald-500/30'
                      : 'text-blue-400 border-blue-500/30'
                  }`}>
                    {agentActive.phase.toUpperCase()}
                  </span>
                ) : null}
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
