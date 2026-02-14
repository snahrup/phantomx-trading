'use client';

import { memo } from 'react';
import { useTradingStore } from '@/store/trading-store';

/**
 * Persistent activity bar shown when autopilot is running.
 * Displays real-time status messages so users ALWAYS know what the engine is doing.
 * Visible on ALL views — trading, dashboard, intelligence.
 */
export default memo(function AutopilotActivityBar() {
  const isExecuting = useTradingStore(s => s.isExecuting);
  const isPaused = useTradingStore(s => s.isPaused);
  const isKilled = useTradingStore(s => s.isKilled);
  const killReason = useTradingStore(s => s.killReason);
  const autopilotMode = useTradingStore(s => s.autopilotMode);
  const agentStatuses = useTradingStore(s => s.agentStatuses);
  const autopilotClosedTrades = useTradingStore(s => s.autopilotClosedTrades);
  const autopilotCumulativePnl = useTradingStore(s => s.autopilotCumulativePnl);
  const statusMessage = useTradingStore(s => s.autopilotStatusMessage);

  // Only show when autopilot is running (or was killed)
  if (!isExecuting && !isKilled) return null;

  const agentsOnline = agentStatuses.filter(a => a.state === 'running').length;
  const pnlColor = autopilotCumulativePnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]';

  if (isKilled) {
    return (
      <div className="flex items-center gap-3 px-4 py-1.5 bg-[rgba(224,85,85,0.08)] border-b border-[var(--cl-error-border)] text-[10px] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="status-dot killed" />
          <span className="font-semibold text-[var(--cl-error)] uppercase tracking-wider">Kill Switch</span>
        </div>
        <span className="text-[var(--cl-error)]">{killReason || 'Daily loss limit hit'}</span>
        <div className="flex-1" />
        <span className="text-[var(--cl-text-secondary)]">
          {autopilotClosedTrades.length} trades | PnL: <span className={pnlColor}>{autopilotCumulativePnl >= 0 ? '+' : ''}${autopilotCumulativePnl.toFixed(2)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1 bg-[rgba(0,210,106,0.04)] border-b border-[var(--cl-success-border)] text-[10px] flex-shrink-0 overflow-hidden">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`status-dot ${isPaused ? 'paused' : 'live'}`} />
        <span className="font-semibold text-[var(--cl-success)] uppercase tracking-wider">
          {isPaused ? 'Paused' : 'Live'}
        </span>
        <span className="text-[var(--cl-text-secondary)]">
          {autopilotMode === 'portfolio' ? 'Portfolio' : 'Single'}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-[var(--cl-border)] flex-shrink-0" />

      {/* Agents */}
      {agentStatuses.length > 0 && (
        <>
          <div className="flex items-center gap-1 flex-shrink-0">
            {agentStatuses.map(a => (
              <span key={a.id} className="w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: a.state === 'running' ? 'var(--cl-success)' :
                  a.state === 'error' ? 'var(--cl-error)' : 'var(--cl-text-secondary)',
              }} />
            ))}
            <span className="text-[var(--cl-text-secondary)]">{agentsOnline}/{agentStatuses.length}</span>
          </div>
          <div className="w-px h-3 bg-[var(--cl-border)] flex-shrink-0" />
        </>
      )}

      {/* Stats */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[var(--cl-text-secondary)]">
          Trades: <span className="text-[var(--cl-text-faint)] font-mono">{autopilotClosedTrades.length}</span>
        </span>
        <span className="text-[var(--cl-text-secondary)]">
          PnL: <span className={`font-mono font-semibold ${pnlColor}`}>{autopilotCumulativePnl >= 0 ? '+' : ''}${autopilotCumulativePnl.toFixed(2)}</span>
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-[var(--cl-border)] flex-shrink-0" />

      {/* Live status message — what the engine is doing RIGHT NOW */}
      <div className="flex-1 overflow-hidden">
        {statusMessage ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1 h-1 rounded-full bg-[var(--cl-success)] animate-pulse flex-shrink-0" />
            <span className="text-[var(--cl-text-faint)] truncate">{statusMessage}</span>
          </div>
        ) : (
          <span className="text-[var(--cl-text-secondary)] italic">Waiting for next tick...</span>
        )}
      </div>
    </div>
  );
});
