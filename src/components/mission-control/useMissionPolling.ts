'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { useAxonStore } from '@/store/axon-store';

// ---------------------------------------------------------------------------
// Polling intervals (ms)
// ---------------------------------------------------------------------------
const POSITIONS_INTERVAL = 10_000;
const ACCOUNT_INTERVAL = 15_000;
const ACTIVITY_INTERVAL = 8_000;
const AGENT_STATUS_INTERVAL = 20_000;
const ORCHESTRATOR_INTERVAL = 10_000;
const SPARKLINE_INTERVAL = 15_000;
const SPARKLINE_STAGGER_MS = 1_000;
const MAX_SPARKLINE_SYMBOLS = 5;

/**
 * Mission Control polling hook.
 *
 * When autonomous mode is active (isExecuting && !isKilled), starts four
 * independent polling loops that keep positions, account balance, activity
 * feed, and agent statuses fresh. All intervals are ref-tracked to avoid
 * stale closures and are cleaned up on unmount or when polling stops.
 */
export function useMissionPolling() {
  const isExecuting = useTradingStore((s) => s.isExecuting);
  const isKilled = useTradingStore((s) => s.isKilled);

  const positionsRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accountRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentsRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const orchestratorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sparklineRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sparklineBusyRef = useRef(false);
  const mountedRef = useRef(true);

  const clearAll = useCallback(() => {
    if (positionsRef.current) { clearInterval(positionsRef.current); positionsRef.current = null; }
    if (accountRef.current) { clearInterval(accountRef.current); accountRef.current = null; }
    if (activityRef.current) { clearInterval(activityRef.current); activityRef.current = null; }
    if (agentsRef.current) { clearInterval(agentsRef.current); agentsRef.current = null; }
    if (orchestratorRef.current) { clearInterval(orchestratorRef.current); orchestratorRef.current = null; }
    if (sparklineRef.current) { clearInterval(sparklineRef.current); sparklineRef.current = null; }
  }, []);

  useEffect(() => {
    const shouldPoll = isExecuting && !isKilled;

    if (!shouldPoll) {
      clearAll();
      return;
    }

    // --- Fetch helpers (read store at call time to avoid stale closures) ---

    const fetchPositions = async () => {
      try {
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'positions' }),
        });
        if (!mountedRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (mountedRef.current && data.positions) {
            useTradingStore.getState().setPositions(data.positions);
          }
        }
      } catch {
        // Silently swallow — network blip, will retry next interval
      }
    };

    const fetchAccount = async () => {
      try {
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'account' }),
        });
        if (!mountedRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (!mountedRef.current) return;
          // API returns { account: { balances, totalUsdValue } }
          const value = data.account?.totalUsdValue ?? 0;
          useTradingStore.getState().setAccountValue(value);
        }
      } catch {
        // Silently swallow
      }
    };

    const fetchActivity = async () => {
      try {
        await useAxonStore.getState().fetchActivity(50);
      } catch {
        // Silently swallow
      }
    };

    const fetchAgents = async () => {
      try {
        await useAxonStore.getState().fetchAgents();
      } catch {
        // Silently swallow
      }
    };

    const fetchOrchestratorStatus = async () => {
      try {
        const res = await fetch('/api/trading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'orchestrator_status' }),
        });
        if (!mountedRef.current) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!mountedRef.current || !data.symbols) return;

        // Extract symbols with active phases (scanning, pipeline, monitoring)
        const activeSymbols: { symbol: string; phase: string }[] = [];
        for (const [sym, state] of Object.entries(data.symbols as Record<string, { phase: string }>)) {
          if (state.phase !== 'idle' && state.phase !== 'cooldown') {
            activeSymbols.push({ symbol: sym, phase: state.phase });
          }
        }

        const store = useTradingStore.getState();
        store.setAgentActiveSymbols(activeSymbols);

        // Auto-switch chart to the most interesting agent-active symbol
        // Priority: pipeline > analyzing > monitoring
        // Only auto-switch if user hasn't manually focused a position
        if (activeSymbols.length > 0 && store.positions.length === 0) {
          const pipelineSym = activeSymbols.find(s => s.phase === 'pipeline');
          const analyzingSym = activeSymbols.find(s => s.phase === 'analyzing');
          const best = pipelineSym ?? analyzingSym ?? activeSymbols[0];

          if (best && store.focusedPositionSymbol !== best.symbol) {
            store.setFocusedPositionSymbol(best.symbol);
            store.setSymbol(best.symbol);
          }
        }
      } catch {
        // Silently swallow
      }
    };

    const fetchSparklines = async () => {
      // Guard against overlapping sparkline fetches (sequential with stagger can exceed interval)
      if (sparklineBusyRef.current) return;
      sparklineBusyRef.current = true;
      try {
        const store = useTradingStore.getState();
        const positions = store.positions;
        const agentActive = store.agentActiveSymbols;

        // Deduplicate symbols — positions first, then agent-active symbols
        const seen = new Set<string>();
        const symbols: string[] = [];
        for (const p of positions) {
          if (!seen.has(p.symbol) && symbols.length < MAX_SPARKLINE_SYMBOLS) {
            seen.add(p.symbol);
            symbols.push(p.symbol);
          }
        }
        // Add agent-active symbols that don't overlap with positions
        for (const s of agentActive) {
          if (!seen.has(s.symbol) && symbols.length < MAX_SPARKLINE_SYMBOLS) {
            seen.add(s.symbol);
            symbols.push(s.symbol);
          }
        }
        if (symbols.length === 0) return;

        for (let i = 0; i < symbols.length; i++) {
          if (!mountedRef.current) return;
          const symbol = symbols[i];
          try {
            const res = await fetch('/api/phemex', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'ohlcv', symbol, timeframe: '5m', limit: 50 }),
            });
            if (!mountedRef.current) return;
            if (res.ok) {
              const data = await res.json();
              if (mountedRef.current && data.ohlcv && Array.isArray(data.ohlcv)) {
                // OHLCV comes as objects { timestamp, open, high, low, close, volume }
                const closes = data.ohlcv.map((c: { close: number } | number[]) =>
                  Array.isArray(c) ? c[4] : c.close
                );
                useTradingStore.getState().setPositionPriceHistory(symbol, closes);
              }
            }
          } catch {
            // Silently swallow — individual symbol failure shouldn't block others
          }

          // Stagger requests to avoid Phemex rate limits
          if (i < symbols.length - 1) {
            await new Promise(r => setTimeout(r, SPARKLINE_STAGGER_MS));
          }
        }
      } catch {
        // Silently swallow
      } finally {
        sparklineBusyRef.current = false;
      }
    };

    // --- Immediate fetch on start ---
    fetchPositions();
    fetchAccount();
    fetchActivity();
    fetchAgents();
    fetchOrchestratorStatus();
    fetchSparklines();

    // --- Set up intervals ---
    positionsRef.current = setInterval(fetchPositions, POSITIONS_INTERVAL);
    accountRef.current = setInterval(fetchAccount, ACCOUNT_INTERVAL);
    activityRef.current = setInterval(fetchActivity, ACTIVITY_INTERVAL);
    agentsRef.current = setInterval(fetchAgents, AGENT_STATUS_INTERVAL);
    orchestratorRef.current = setInterval(fetchOrchestratorStatus, ORCHESTRATOR_INTERVAL);
    sparklineRef.current = setInterval(fetchSparklines, SPARKLINE_INTERVAL);

    return () => {
      clearAll();
    };
  }, [isExecuting, isKilled, clearAll]);

  // Clean up on unmount (safety net)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAll();
    };
  }, [clearAll]);
}
