'use client';

import { useTradingStore } from '@/store/trading-store';
import { WorkflowPanelShell } from './WorkflowPanelShell';
import { EventFeed } from './shared/EventFeed';
import { WorkflowKPIStrip, type KPIItem } from './shared/WorkflowKPIStrip';
import { MiniEquityCurve } from './shared/MiniEquityCurve';
import type { WorkflowState, PaperWorkflowMetrics, OrchestratorEvent } from '@/types/trading';

interface PaperTradingWorkflowPanelProps {
  state: WorkflowState & { metrics: PaperWorkflowMetrics };
  events: OrchestratorEvent[];
  onToggle: (enabled: boolean) => void;
}

export function PaperTradingWorkflowPanel({
  state,
  events,
  onToggle,
}: PaperTradingWorkflowPanelProps) {
  const paperTradingState = useTradingStore(s => s.paperTradingState);
  const paperTrades = useTradingStore(s => s.paperTrades);
  const aiJournal = useTradingStore(s => s.aiJournal);

  const equity = state.metrics.currentEquity;
  const startingBalance = 100_000;
  const pnlPercent = ((equity - startingBalance) / startingBalance * 100);

  const kpis: KPIItem[] = [
    { label: 'Equity', value: `$${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: equity >= startingBalance ? 'success' : 'danger' },
    { label: 'WR', value: `${(state.metrics.winRate * 100).toFixed(1)}%`, color: state.metrics.winRate >= 0.55 ? 'success' : state.metrics.winRate >= 0.45 ? 'warning' : 'danger' },
    { label: 'PF', value: state.metrics.profitFactor.toFixed(2), color: state.metrics.profitFactor >= 1.3 ? 'success' : 'warning' },
    { label: 'Open', value: state.metrics.openTrades },
    { label: 'Validated', value: state.metrics.thesesValidated, color: 'success' },
  ];

  // Build equity curve from closed trades
  const equityPoints: number[] = [startingBalance];
  let running = startingBalance;
  const closedTrades = paperTrades.filter(t => t.status === 'closed');
  for (const t of closedTrades.slice(-50)) {
    running += t.realizedPnl || 0;
    equityPoints.push(running);
  }

  const recentJournal = aiJournal.slice(-5);

  return (
    <WorkflowPanelShell
      title="Paper Trading"
      icon={<span>&#x1F4B0;</span>}
      enabled={state.enabled}
      status={state.status}
      objective={state.currentObjective}
      onToggle={onToggle}
    >
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* KPIs */}
        <WorkflowKPIStrip items={kpis} />

        {/* Equity Curve */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase">Session PnL</div>
            <div className={`text-sm font-bold tabular-nums ${pnlPercent >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
            </div>
          </div>
          <MiniEquityCurve values={equityPoints} width={140} height={40} />
        </div>

        {/* Open Trades */}
        {paperTrades.filter(t => t.status === 'open').length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
              Open Trades
            </h4>
            <div className="space-y-1">
              {paperTrades.filter(t => t.status === 'open').slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1 px-2 rounded bg-white/5 text-xs">
                  <span className="font-semibold">{t.symbol}</span>
                  <span className={t.direction === 'long' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                    {t.direction}
                  </span>
                  <span className="tabular-nums">{t.entryPrice.toFixed(2)}</span>
                  <span className={`tabular-nums ${(t.unrealizedPnlPercent || 0) >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                    {(t.unrealizedPnlPercent || 0) >= 0 ? '+' : ''}{(t.unrealizedPnlPercent || 0).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Journal */}
        {recentJournal.length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
              AI Journal
            </h4>
            <div className="space-y-1.5">
              {recentJournal.map((entry) => (
                <div key={entry.id} className="py-1.5 px-2 rounded bg-white/5 text-[11px] text-[var(--text)] leading-snug">
                  <span className="text-[9px] text-[var(--text-muted)] block mb-0.5">
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <p className="line-clamp-3">{entry.content || entry.title}</p>
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
