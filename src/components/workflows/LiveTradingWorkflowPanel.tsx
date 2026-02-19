'use client';

import { useTradingStore } from '@/store/trading-store';
import { WorkflowPanelShell } from './WorkflowPanelShell';
import { EventFeed } from './shared/EventFeed';
import { WorkflowKPIStrip, type KPIItem } from './shared/WorkflowKPIStrip';
import { ReasoningChain } from './shared/ReasoningChain';
import type { WorkflowState, LiveWorkflowMetrics, OrchestratorEvent } from '@/types/trading';

interface LiveTradingWorkflowPanelProps {
  state: WorkflowState & { metrics: LiveWorkflowMetrics };
  events: OrchestratorEvent[];
  onToggle: (enabled: boolean) => void;
}

export function LiveTradingWorkflowPanel({
  state,
  events,
  onToggle,
}: LiveTradingWorkflowPanelProps) {
  const positions = useTradingStore(s => s.positions);
  const autopilotClosedTrades = useTradingStore(s => s.autopilotClosedTrades);
  const autopilotCumulativePnl = useTradingStore(s => s.autopilotCumulativePnl);

  const kpis: KPIItem[] = [
    { label: 'Mode', value: state.metrics.mode || 'off' },
    { label: 'Ticks', value: state.metrics.tickCount },
    { label: 'Open Pos', value: state.metrics.openPositions || positions.length },
    {
      label: 'Daily PnL',
      value: `${state.metrics.dailyPnlPercent >= 0 ? '+' : ''}${state.metrics.dailyPnlPercent.toFixed(2)}%`,
      color: state.metrics.dailyPnlPercent >= 0 ? 'success' : 'danger',
    },
    {
      label: 'Strategies',
      value: state.metrics.strategiesDeployed,
      color: state.metrics.strategiesDeployed > 0 ? 'success' : 'default',
    },
  ];

  if (state.metrics.isKilled) {
    kpis.push({ label: 'KILLED', value: 'YES', color: 'danger' });
  }

  return (
    <WorkflowPanelShell
      title="Live Trading"
      icon={<span>&#x26A1;</span>}
      enabled={state.enabled}
      status={state.status}
      objective={state.currentObjective}
      onToggle={onToggle}
    >
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* KPIs */}
        <WorkflowKPIStrip items={kpis} />

        {/* Kill Warning */}
        {state.metrics.isKilled && (
          <div className="px-3 py-2 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-xs text-[var(--danger)]">
            Kill switch triggered. Daily loss limit exceeded. Engine stopped.
          </div>
        )}

        {/* Open Positions */}
        {positions.length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
              Open Positions
            </h4>
            <div className="space-y-1">
              {positions.map((pos) => (
                <div key={pos.symbol} className="flex items-center justify-between py-1.5 px-2 rounded bg-white/5 text-xs">
                  <span className="font-semibold">{pos.symbol}</span>
                  <span className={pos.side === 'long' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                    {pos.side}
                  </span>
                  <span className="tabular-nums">${pos.entryPrice?.toFixed(2)}</span>
                  <span className={`tabular-nums font-semibold ${(pos.unrealizedPnl || 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {(pos.unrealizedPnl || 0) >= 0 ? '+' : ''}${(pos.unrealizedPnl || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Reasoning Chain */}
        <ReasoningChain events={events} />

        {/* Cumulative PnL */}
        {autopilotClosedTrades.length > 0 && (
          <div className="flex items-center justify-between px-2 py-1.5 rounded bg-white/5">
            <span className="text-[10px] uppercase text-[var(--text-muted)]">Session PnL</span>
            <span className={`text-sm font-bold tabular-nums ${autopilotCumulativePnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {autopilotCumulativePnl >= 0 ? '+' : ''}${autopilotCumulativePnl.toFixed(2)}
            </span>
          </div>
        )}

        {/* Recent Closed Trades */}
        {autopilotClosedTrades.length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
              Recent Trades ({autopilotClosedTrades.length})
            </h4>
            <div className="space-y-1">
              {autopilotClosedTrades.slice(-5).reverse().map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1 px-2 rounded bg-white/5 text-xs">
                  <span className="font-semibold">{t.symbol}</span>
                  <span className={`tabular-nums ${t.realizedPnl >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {t.realizedPnl >= 0 ? '+' : ''}${t.realizedPnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event Feed */}
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
            Event Feed
          </h4>
          <EventFeed events={events} maxHeight="200px" />
        </div>
      </div>
    </WorkflowPanelShell>
  );
}
