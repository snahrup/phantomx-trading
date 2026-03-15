'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { useAxonStore, useAxonAgentSummary, useAxonLastHeartbeat, useAxonActivePipelines } from '@/store/axon-store';
import { PulseIndicator } from '@/components/motion';

/**
 * Axon-powered activity bar — replaces the old local autopilot bar.
 * Shows real-time Axon agent status, heartbeat activity, costs, and kill switch.
 * Visible on ALL views (trading, dashboard, intelligence).
 *
 * Data source: Axon Zustand store, updated via SSE events.
 * Fallback: polling every 15s when SSE disconnects.
 */
export default memo(function AxonActivityBar() {
  const connected = useAxonStore((s) => s.connected);
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const todayCost = useAxonStore((s) => s.todayCostUsd);
  const killAll = useAxonStore((s) => s.killAll);

  const { working, idle, error } = useAxonAgentSummary();
  const lastHeartbeat = useAxonLastHeartbeat();
  const activePipelines = useAxonActivePipelines();

  const [killing, setKilling] = useState(false);
  const [killed, setKilled] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const killingRef = useRef(false);
  const killedRef = useRef(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKill = useCallback(async () => {
    if (killingRef.current || killedRef.current) return;

    // First click: show confirmation
    if (!confirmKill) {
      setConfirmKill(true);
      // Reset after 3 seconds if not confirmed
      confirmTimerRef.current = setTimeout(() => {
        setConfirmKill(false);
      }, 3000);
      return;
    }

    // Second click: actually kill
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmKill(false);
    killingRef.current = true;
    setKilling(true);
    const ok = await killAll();
    killingRef.current = false;
    setKilling(false);
    if (ok) {
      killedRef.current = true;
      setKilled(true);
    }
  }, [killAll, confirmKill]);

  // Determine overall connection state
  const isOnline = connected && daemonOnline;
  const totalAgents = working + idle + error;

  // --- Kill state ---
  if (killed) {
    return (
      <div className="flex items-center gap-3 px-4 py-1.5 bg-destructive/[0.08] border-b border-destructive/30 text-[10px] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="status-dot killed" />
          <span className="font-semibold text-destructive uppercase tracking-wider">
            Kill Switch
          </span>
        </div>
        <span className="text-destructive">
          All agents terminated via Axon kill command
        </span>
        <div className="flex-1" />
        <button
          onClick={() => { setKilled(false); killedRef.current = false; }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1 border-b text-[10px] flex-shrink-0 overflow-hidden bg-card/50 border-border/50">
      {/* Axon connection status */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isOnline ? 'bg-claude-green' : 'bg-destructive'
          }`}
        />
        <span
          className={`font-semibold uppercase tracking-wider ${
            isOnline ? 'text-claude-green' : 'text-destructive'
          }`}
        >
          Axon
        </span>
        {!isOnline && (
          <span className="text-muted-foreground">
            {!daemonOnline ? 'offline' : 'SSE disconnected'}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-border flex-shrink-0" />

      {/* Agent summary */}
      {totalAgents > 0 && (
        <>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-muted-foreground">
              <span className="text-foreground font-mono">{working}</span> working,{' '}
              <span className="font-mono">{idle}</span> idle
              {error > 0 && (
                <>
                  , <span className="text-destructive font-mono">{error}</span> err
                </>
              )}
            </span>
          </div>
          <div className="w-px h-3 bg-border flex-shrink-0" />
        </>
      )}

      {/* Last heartbeat */}
      {lastHeartbeat && (
        <>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <PulseIndicator active={true} color="bg-claude-green" size="w-1 h-1" />
            <span className="text-foreground truncate max-w-[180px]">
              {lastHeartbeat.agentName}
            </span>
            <span className="text-muted-foreground">&mdash; {lastHeartbeat.timeAgo}</span>
          </div>
          <div className="w-px h-3 bg-border flex-shrink-0" />
        </>
      )}

      {/* Today's cost */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-muted-foreground">Cost:</span>
        <span className="font-mono text-foreground">${todayCost.toFixed(2)}</span>
      </div>

      {/* Active pipelines */}
      {activePipelines > 0 && (
        <>
          <div className="w-px h-3 bg-border flex-shrink-0" />
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-muted-foreground">
              <span className="text-foreground font-mono">{activePipelines}</span>{' '}
              {activePipelines === 1 ? 'debate' : 'debates'}
            </span>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Kill switch — requires 2 clicks to activate */}
      <button
        onClick={handleKill}
        disabled={killing || !isOnline}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors flex-shrink-0 ${
          killing
            ? 'bg-destructive/20 text-destructive cursor-wait'
            : confirmKill
              ? 'bg-destructive/30 text-destructive ring-1 ring-destructive/50'
              : isOnline
                ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 active:bg-destructive/30'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
        }`}
      >
        {killing ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            Killing...
          </>
        ) : confirmKill ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            Confirm Kill?
          </>
        ) : (
          <>
            <svg
              className="w-2.5 h-2.5"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 2v6M8 14V8M3 5l5 3M13 5L8 8" />
            </svg>
            Kill All
          </>
        )}
      </button>
    </div>
  );
});
