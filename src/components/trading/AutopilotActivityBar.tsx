'use client';

import { memo } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { PulseIndicator } from '@/components/motion';

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
  const pnlColor = autopilotCumulativePnl >= 0 ? 'text-claude-green' : 'text-destructive';

  if (isKilled) {
    return (
      <div className="flex items-center gap-3 px-4 py-1.5 bg-destructive/[0.08] border-b border-destructive/30 text-[10px] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="status-dot killed" />
          <span className="font-semibold text-destructive uppercase tracking-wider">Kill Switch</span>
        </div>
        <span className="text-destructive">{killReason || 'Daily loss limit hit'}</span>
        <div className="flex-1" />
        <span className="text-muted-foreground">
          {autopilotClosedTrades.length} trades | PnL: <span className={pnlColor}>{autopilotCumulativePnl >= 0 ? '+' : ''}${autopilotCumulativePnl.toFixed(2)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1 bg-claude-green/[0.04] border-b border-claude-green/30 text-[10px] flex-shrink-0 overflow-hidden">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`status-dot ${isPaused ? 'paused' : 'live'}`} />
        <span className="font-semibold text-claude-green uppercase tracking-wider">
          {isPaused ? 'Paused' : 'Live'}
        </span>
        <span className="text-muted-foreground">
          {autopilotMode === 'portfolio' ? 'Portfolio' : 'Single'}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-border flex-shrink-0" />

      {/* Agents */}
      {agentStatuses.length > 0 && (
        <>
          <div className="flex items-center gap-1 flex-shrink-0">
            {agentStatuses.map(a => (
              <span key={a.id} className={`w-1.5 h-1.5 rounded-full ${
                a.state === 'running' ? 'bg-claude-green' :
                a.state === 'error' ? 'bg-destructive' : 'bg-muted-foreground'
              }`} />
            ))}
            <span className="text-muted-foreground">{agentsOnline}/{agentStatuses.length}</span>
          </div>
          <div className="w-px h-3 bg-border flex-shrink-0" />
        </>
      )}

      {/* Stats */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-muted-foreground">
          Trades: <span className="text-foreground font-mono">{autopilotClosedTrades.length}</span>
        </span>
        <span className="text-muted-foreground">
          PnL: <span className={`font-mono font-semibold ${pnlColor}`}>{autopilotCumulativePnl >= 0 ? '+' : ''}${autopilotCumulativePnl.toFixed(2)}</span>
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-border flex-shrink-0" />

      {/* Live status message — what the engine is doing RIGHT NOW */}
      <div className="flex-1 overflow-hidden">
        {statusMessage ? (
          <div className="flex items-center gap-1.5">
            <PulseIndicator active={true} color="bg-claude-green" size="w-1 h-1" />
            <span className="text-foreground truncate">{statusMessage}</span>
          </div>
        ) : (
          <span className="text-muted-foreground italic">Waiting for next tick...</span>
        )}
      </div>
    </div>
  );
});
