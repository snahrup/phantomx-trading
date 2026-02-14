'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import type { JournalEntry, JournalEntryType } from '@/types/trading';

interface HeartbeatEvent {
  type: string;
  tick?: number;
  phase?: string;
  data: Record<string, unknown>;
  timestamp: number;
}

const INTERVAL_OPTIONS = [
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: '2m', value: 120000 },
  { label: '5m', value: 300000 },
];

interface MarketInfo {
  symbol: string;
  base: string;
  maxLeverage: number | null;
}

function shortSym(symbol: string): string {
  return symbol.replace('/USDT:USDT', '').replace('/USDT', '');
}

// Convert SSE events to journal entries
function eventToJournal(event: HeartbeatEvent): JournalEntry | null {
  const store = useTradingStore.getState();
  const tick = (event.tick ?? (event.data.tick as number)) ?? 0;
  const d = event.data;

  // Build portfolio state from store at this moment
  const equity = store.accountValue || 0;
  const positions = store.positions || [];
  const totalNotional = positions.reduce((s, p) => s + Math.abs(p.size * p.markPrice), 0);
  const cashPercent = equity > 0 ? Math.max(0, ((equity - totalNotional) / equity) * 100) : 100;
  const dailyPnl = store.autopilotCumulativePnl || 0;
  const startEquity = store.autopilotSessionStartEquity || equity;
  const dailyPnlPercent = startEquity > 0 ? (dailyPnl / startEquity) * 100 : 0;

  const portfolioState = { equity, cashPercent, positionCount: positions.length, dailyPnl, dailyPnlPercent };

  let type: JournalEntryType | null = null;
  let symbol = (d.symbol as string) ?? undefined;
  let action = (d.action as string) ?? undefined;
  let reason = '';
  let confidence: number | undefined;
  let price: number | undefined;
  let pnl: number | undefined;
  let pnlPercent: number | undefined;
  let indicators: Record<string, number | string> | undefined;

  switch (event.type) {
    case 'analysis':
      type = 'analysis';
      reason = String(d.analysis ?? d.reasoning ?? 'Market analyzed');
      confidence = (d.confidence as number) ?? undefined;
      break;

    case 'action':
      if (d.action === 'hold') return null; // Skip holds
      type = 'decision';
      reason = String(d.reason ?? d.reasoning ?? `Decided to ${d.action}`);
      confidence = (d.confidence as number) ?? undefined;
      price = (d.entryPrice as number) ?? (d.price as number) ?? undefined;
      break;

    case 'trade_executed':
      type = 'trade';
      reason = String(d.reason ?? `Executed ${d.side ?? d.action} ${shortSym(symbol ?? '')} @ $${d.price}`);
      price = (d.price as number) ?? (d.fillPrice as number) ?? undefined;
      confidence = (d.confidence as number) ?? undefined;
      action = (d.side as string) ?? action;
      break;

    case 'trade_skipped':
      type = 'skip';
      reason = String(d.reason ?? 'Trade skipped due to constraints');
      confidence = (d.confidence as number) ?? undefined;
      break;

    case 'kill_triggered':
      type = 'kill';
      reason = String(d.reason ?? `Kill switch: ${d.dailyLossPercent ?? '?'}% daily loss (limit: ${d.limit ?? '?'}%)`);
      break;

    case 'portfolio_update': {
      // Check for new closed trades
      const recentCloses = (d.recentClosedTrades as Array<Record<string, unknown>>) ?? [];
      if (recentCloses.length > 0) {
        const latest = recentCloses[recentCloses.length - 1];
        type = 'close';
        symbol = (latest.symbol as string) ?? symbol;
        action = 'close';
        pnl = (latest.realizedPnl as number) ?? 0;
        pnlPercent = (latest.realizedPnlPercent as number) ?? 0;
        reason = String(latest.reason ?? `Closed ${shortSym(symbol ?? '')} for $${pnl.toFixed(2)}`);
        price = (latest.exitPrice as number) ?? undefined;
        break;
      }
      return null; // Skip portfolio updates without new closes
    }

    default:
      return null;
  }

  if (!type) return null;

  return {
    id: `j-${tick}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: event.timestamp || Date.now(),
    tick,
    type,
    symbol,
    action,
    reason,
    confidence,
    price,
    pnl,
    pnlPercent,
    indicators,
    portfolioState,
  };
}

export default function HeartbeatPanel() {
  const {
    isConnected, selectedSymbol, riskParameters,
    autopilotMode, setAutopilotMode,
    watchlist, addToWatchlist, removeFromWatchlist,
    autopilotScanMode, setAutopilotScanMode,
    autopilotClosedTrades, autopilotCumulativePnl,
    autopilotSessionStartEquity,
  } = useTradingStore();

  const riskLevel = riskParameters?.level ?? 'moderate';
  const [isRunning, setIsRunning] = useState(false);
  const [interval, setIntervalMs] = useState(60000);
  const [autoTrade, setAutoTrade] = useState(false);
  const [events, setEvents] = useState<HeartbeatEvent[]>([]);
  const [expandedTick, setExpandedTick] = useState<number | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [tickCount, setTickCount] = useState(0);
  const [lastAnalysis, setLastAnalysis] = useState('');
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [allMarkets, setAllMarkets] = useState<MarketInfo[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [leverageFilter, setLeverageFilter] = useState<number | null>(null);
  const [sessionPnl, setSessionPnl] = useState<{ cumulative: number; tradeCount: number; winRate: number; sessionStart: number; currentEquity: number } | null>(null);
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Fetch all available markets when the add-symbol panel opens
  useEffect(() => {
    if (!showAddSymbol || allMarkets.length > 0 || marketsLoading) return;
    setMarketsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'markets' }),
        });
        const data = await res.json();
        if (data.markets) setAllMarkets(data.markets);
      } catch { /* ignore */ }
      setMarketsLoading(false);
    })();
  }, [showAddSymbol, allMarkets.length, marketsLoading]);

  // Filtered markets for the picker
  const filteredMarkets = useMemo(() => {
    let list = allMarkets.filter(m => !watchlist.includes(m.symbol));
    if (leverageFilter) {
      list = list.filter(m => m.maxLeverage !== null && m.maxLeverage >= leverageFilter);
    }
    if (symbolSearch.trim()) {
      const q = symbolSearch.trim().toUpperCase();
      list = list.filter(m => m.base.toUpperCase().includes(q) || m.symbol.toUpperCase().includes(q));
    }
    return list;
  }, [allMarkets, watchlist, leverageFilter, symbolSearch]);

  // Check server-side engine status on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        });
        const data = await res.json();
        if (data.isRunning) {
          setIsRunning(true);
          if (data.status?.tickCount) setTickCount(data.status.tickCount);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // Auto-scroll
  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  // SSE connection
  useEffect(() => {
    if (!isRunning) return;

    const sse = new EventSource('/api/heartbeat');
    sseRef.current = sse;

    sse.onmessage = (e) => {
      try {
        const event: HeartbeatEvent = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-200), event]);

        if (event.type === 'tick_start') {
          const tick = (event.tick ?? event.data.tick) as number;
          setTickCount(tick ?? 0);
          setExpandedTick(tick);
        }
        if (event.type === 'analysis') {
          setLastAnalysis(String(event.data.analysis || '').slice(0, 120));
        }
        if (event.type === 'portfolio_update' && event.data.cumulativeRealizedPnl !== undefined) {
          setSessionPnl({
            cumulative: event.data.cumulativeRealizedPnl as number,
            tradeCount: (event.data.closedTradeCount as number) ?? 0,
            winRate: (event.data.winRate as number) ?? 0,
            sessionStart: (event.data.sessionStartEquity as number) ?? 0,
            currentEquity: (event.data.totalEquity as number) ?? 0,
          });
        }
        if (event.type === 'status' && event.data.status === 'stopped') {
          setIsRunning(false);
        }

        // --- Journal capture ---
        const journalEntry = eventToJournal(event);
        if (journalEntry) {
          const store = useTradingStore.getState();
          store.addJournalEntry(journalEntry);

          // Attempt chart snapshot for significant events
          if (journalEntry.type === 'trade' || journalEntry.type === 'close' || journalEntry.type === 'kill') {
            const captureChart = (window as unknown as Record<string, unknown>).__phantomx_captureChart as (() => string | null) | undefined;
            if (captureChart) {
              const img = captureChart();
              if (img) {
                // Save async — update journal entry path when done
                fetch('/api/journal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'save_snapshot', imageBase64: img, entryId: journalEntry.id }),
                })
                  .then(r => r.json())
                  .then(data => {
                    if (data.path) {
                      // Update the entry with the snapshot path
                      const currentStore = useTradingStore.getState();
                      const updated = currentStore.journalEntries.map(e =>
                        e.id === journalEntry.id ? { ...e, chartSnapshotPath: data.path } : e
                      );
                      useTradingStore.setState({ journalEntries: updated });
                    }
                  })
                  .catch(() => {}); // Non-critical
              }
            }
          }
        }
      } catch { /* ignore */ }
    };

    sse.onerror = () => {};

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [isRunning]);

  // Group events by tick for portfolio pipeline view
  const tickGroups = useMemo(() => {
    const groups = new Map<number, HeartbeatEvent[]>();
    for (const event of events) {
      const tick = event.tick ?? (event.data.tick as number) ?? 0;
      if (!groups.has(tick)) groups.set(tick, []);
      groups.get(tick)!.push(event);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  }, [events]);

  const handleStart = useCallback(async () => {
    if (!isConnected) return;
    setEvents([]);

    const payload: Record<string, unknown> = {
      action: 'start',
      intervalMs: interval,
      riskLevel,
      enableAutoTrade: autoTrade,
      maxDailyLossPercent: riskLevel === 'degen' ? 15 : riskLevel === 'aggressive' ? 10 : 5,
      stopAfterKill: true,
    };

    if (autopilotMode === 'portfolio') {
      payload.mode = 'portfolio';
      payload.symbols = watchlist;
      payload.scanMode = autopilotScanMode;
      payload.maxPerTokenAllocation = riskLevel === 'degen' ? 40 : riskLevel === 'aggressive' ? 25 : 15;
      payload.maxTotalExposure = riskLevel === 'degen' ? 90 : riskLevel === 'aggressive' ? 80 : 60;
      payload.maxOpenPositions = riskLevel === 'degen' ? 8 : riskLevel === 'aggressive' ? 5 : 3;
      payload.minCashReserve = riskLevel === 'degen' ? 10 : riskLevel === 'aggressive' ? 20 : 40;
    } else {
      payload.mode = 'single';
      payload.symbol = selectedSymbol;
      payload.maxPositionPercent = riskLevel === 'degen' ? 15 : riskLevel === 'aggressive' ? 10 : 5;
    }

    const res = await fetch('/api/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) setIsRunning(true);
  }, [isConnected, interval, selectedSymbol, riskLevel, autoTrade, autopilotMode, watchlist, autopilotScanMode]);

  const handleStop = useCallback(async () => {
    await fetch('/api/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    setIsRunning(false);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Autopilot</span>
          {isRunning && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--cl-fill-success)] border border-[var(--cl-success-border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-success)] animate-pulse" />
              <span className="text-[9px] text-[var(--cl-success)] font-bold">LIVE</span>
            </span>
          )}
          {autopilotMode === 'portfolio' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--cl-fill-accent)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]">
              PORTFOLIO
            </span>
          )}
        </div>
        {isRunning && (
          <span className="text-[9px] text-[var(--cl-text-secondary)]">Tick #{tickCount}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Controls */}
        <div className="p-3 space-y-3 border-b border-[var(--cl-border-subtle)]">
          {/* Mode toggle */}
          {!isRunning && (
            <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)]">
              <button
                onClick={() => setAutopilotMode('single')}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                  autopilotMode === 'single'
                    ? 'bg-[var(--cl-bg-surface)] text-[var(--cl-text-primary)] shadow-sm'
                    : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
                }`}
              >
                Single Symbol
              </button>
              <button
                onClick={() => setAutopilotMode('portfolio')}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all ${
                  autopilotMode === 'portfolio'
                    ? 'bg-[var(--cl-bg-surface)] text-[var(--cl-accent)] shadow-sm'
                    : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
                }`}
              >
                Portfolio Manager
              </button>
            </div>
          )}

          {/* Watchlist editor (portfolio mode only) */}
          {!isRunning && autopilotMode === 'portfolio' && (
            <div className="space-y-2">
              {/* Scan mode toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--cl-text-secondary)]">Scan mode</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setAutopilotScanMode('watchlist')}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      autopilotScanMode === 'watchlist'
                        ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                        : 'text-[var(--cl-text-secondary)] border border-transparent'
                    }`}
                  >
                    Watchlist
                  </button>
                  <button
                    onClick={() => setAutopilotScanMode('full_scan')}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      autopilotScanMode === 'full_scan'
                        ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                        : 'text-[var(--cl-text-secondary)] border border-transparent'
                    }`}
                  >
                    Full Scan
                  </button>
                </div>
              </div>

              {/* Watchlist chips */}
              {autopilotScanMode === 'watchlist' && (
                <div>
                  <div className="flex flex-wrap gap-1">
                    {watchlist.map(sym => (
                      <span key={sym} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)] text-[var(--cl-text-faint)]">
                        {shortSym(sym)}
                        <button
                          onClick={() => removeFromWatchlist(sym)}
                          className="text-[var(--cl-text-secondary)] hover:text-[var(--cl-error)] transition-colors ml-0.5"
                        >
                          x
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => { setShowAddSymbol(!showAddSymbol); setSymbolSearch(''); setLeverageFilter(null); }}
                      className="px-2 py-0.5 rounded-full text-[10px] border border-dashed border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:border-[var(--cl-accent-border)] hover:text-[var(--cl-accent)] transition-colors"
                    >
                      + Add
                    </button>
                  </div>

                  {showAddSymbol && (
                    <div className="mt-2 rounded border border-[var(--cl-border-subtle)] bg-[var(--cl-fill-control)] overflow-hidden">
                      {/* Search + leverage quick-filters */}
                      <div className="p-2 space-y-1.5 border-b border-[var(--cl-border-subtle)]">
                        <input
                          type="text"
                          value={symbolSearch}
                          onChange={e => setSymbolSearch(e.target.value)}
                          placeholder="Search tokens..."
                          className="w-full px-2 py-1 rounded text-[10px] bg-[var(--cl-bg-surface)] border border-[var(--cl-border-subtle)] text-[var(--cl-text-primary)] placeholder:text-[var(--cl-text-secondary)] outline-none focus:border-[var(--cl-accent-border)]"
                          autoFocus
                        />
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] text-[var(--cl-text-secondary)] mr-1">Leverage:</span>
                          {[null, 20, 50, 75, 100].map(lev => (
                            <button
                              key={lev ?? 'all'}
                              onClick={() => setLeverageFilter(lev)}
                              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                                leverageFilter === lev
                                  ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                                  : 'text-[var(--cl-text-secondary)] border border-transparent hover:text-[var(--cl-text-faint)]'
                              }`}
                            >
                              {lev ? `${lev}x+` : 'All'}
                            </button>
                          ))}
                          {filteredMarkets.length > 0 && (
                            <button
                              onClick={() => {
                                for (const m of filteredMarkets) addToWatchlist(m.symbol);
                                setShowAddSymbol(false);
                              }}
                              className="ml-auto px-1.5 py-0.5 rounded text-[9px] text-[var(--cl-accent)] border border-[var(--cl-accent-border)] hover:bg-[var(--cl-accent-soft)] transition-colors"
                            >
                              + Add all ({filteredMarkets.length})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Results list */}
                      <div className="max-h-48 overflow-y-auto p-1">
                        {marketsLoading ? (
                          <div className="p-3 text-center text-[10px] text-[var(--cl-text-secondary)]">Loading markets from Phemex...</div>
                        ) : filteredMarkets.length === 0 ? (
                          <div className="p-3 text-center text-[10px] text-[var(--cl-text-secondary)]">
                            {allMarkets.length === 0 ? 'Connect to Phemex first' : 'No matching tokens'}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-0.5">
                            {filteredMarkets.slice(0, 100).map(m => (
                              <button
                                key={m.symbol}
                                onClick={() => addToWatchlist(m.symbol)}
                                className="flex items-center justify-between px-2 py-1 rounded text-[10px] hover:bg-[var(--cl-fill-hover)] transition-colors"
                              >
                                <span className="text-[var(--cl-text-faint)] font-medium">{m.base}</span>
                                {m.maxLeverage && (
                                  <span className={`text-[8px] font-mono ${
                                    m.maxLeverage >= 50 ? 'text-[var(--cl-warning)]' : 'text-[var(--cl-text-secondary)]'
                                  }`}>
                                    {m.maxLeverage}x
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {autopilotScanMode === 'full_scan' && (
                <div className="p-2 rounded bg-[var(--cl-fill-accent-subtle)] border border-[var(--cl-accent-border)] text-[10px] text-[var(--cl-accent)]">
                  Full scan mode — discovers top tokens from all Phemex futures each tick
                </div>
              )}
            </div>
          )}

          {/* Start/Stop button */}
          <button
            onClick={isRunning ? handleStop : handleStart}
            disabled={!isConnected}
            className={`w-full py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${
              isRunning
                ? 'bg-[var(--cl-fill-error-hover)] border border-[var(--cl-error-border)] text-[var(--cl-error)]'
                : isConnected
                  ? 'bg-[var(--cl-success)] text-[var(--cl-text-inverse)] hover:bg-[var(--cl-success-hover)] shadow-lg shadow-[var(--cl-success-border)]'
                  : 'bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)] text-[var(--cl-text-secondary)] cursor-not-allowed'
            }`}
          >
            {isRunning ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
                Stop Autopilot
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                {autopilotMode === 'portfolio' ? 'Start Portfolio Autopilot' : 'Start Autopilot'}
              </>
            )}
          </button>

          {/* Settings (when not running) */}
          {!isRunning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--cl-text-secondary)]">Heartbeat interval</span>
                <div className="flex gap-1">
                  {INTERVAL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setIntervalMs(opt.value)}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        interval === opt.value
                          ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                          : 'text-[var(--cl-text-secondary)] border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--cl-text-secondary)] block">Auto-execute trades</span>
                  <span className="text-[9px] text-[var(--cl-text-secondary)]">{autoTrade ? 'Will place real orders' : 'Advise only'}</span>
                </div>
                <button
                  onClick={() => setAutoTrade(!autoTrade)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${autoTrade ? 'bg-[var(--cl-accent)]' : 'bg-[var(--cl-border)]'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${autoTrade ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>

              {autoTrade && (
                <div className="p-2 rounded bg-[var(--cl-fill-error)] border border-[var(--cl-error-border)] text-[10px] text-[var(--cl-error)]">
                  Auto-trade is ON — Claude will execute real trades on your account
                </div>
              )}
            </div>
          )}

          {/* Running analysis */}
          {isRunning && lastAnalysis && (
            <div className="glass-card p-2">
              <span className="text-[9px] text-[var(--cl-text-secondary)] block mb-1">Latest analysis</span>
              <span className="text-[11px] text-[var(--cl-text-primary)]">{lastAnalysis}</span>
            </div>
          )}
        </div>

        {/* Autopilot PnL Summary */}
        {isRunning && autopilotMode === 'portfolio' && (sessionPnl || autopilotClosedTrades.length > 0) && (
          <div className="px-3 py-2 border-b border-[var(--cl-border-subtle)] bg-[var(--cl-bg-surface)]">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--cl-text-secondary)]">Realized PnL:</span>
                  <span className={`font-mono font-semibold ${
                    (sessionPnl?.cumulative ?? autopilotCumulativePnl) >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'
                  }`}>
                    {(sessionPnl?.cumulative ?? autopilotCumulativePnl) >= 0 ? '+' : ''}${formatUsd(sessionPnl?.cumulative ?? autopilotCumulativePnl)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--cl-text-secondary)]">Trades:</span>
                  <span className="font-mono text-[var(--cl-text-faint)]">{sessionPnl?.tradeCount ?? autopilotClosedTrades.length}</span>
                </div>
                {(sessionPnl?.winRate ?? 0) > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--cl-text-secondary)]">WR:</span>
                    <span className={`font-mono ${(sessionPnl?.winRate ?? 0) >= 50 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                      {(sessionPnl?.winRate ?? 0).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
              {sessionPnl && sessionPnl.sessionStart > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[var(--cl-text-secondary)]">Return:</span>
                  <span className={`font-mono font-semibold ${
                    sessionPnl.currentEquity >= sessionPnl.sessionStart ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'
                  }`}>
                    {((sessionPnl.currentEquity - sessionPnl.sessionStart) / sessionPnl.sessionStart * 100) >= 0 ? '+' : ''}
                    {((sessionPnl.currentEquity - sessionPnl.sessionStart) / sessionPnl.sessionStart * 100).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Decision Pipeline / Event Feed */}
        <div className="p-2 space-y-1.5">
          {events.length === 0 && !isRunning && (
            <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--cl-text-secondary)" strokeWidth="1">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <p className="text-xs text-[var(--cl-text-secondary)] mt-3">
                {autopilotMode === 'portfolio' ? 'Portfolio autopilot inactive' : 'Autopilot inactive'}
              </p>
              <p className="text-[10px] text-[var(--cl-text-secondary)]">
                {autopilotMode === 'portfolio'
                  ? 'Claude will scan your watchlist and manage your entire portfolio'
                  : 'Claude will monitor and trade your selected symbol'}
              </p>
            </div>
          )}

          {/* Portfolio mode: Pipeline view grouped by tick */}
          {autopilotMode === 'portfolio' && tickGroups.map(([tick, tickEvents]) => (
            <TickPipeline
              key={tick}
              tick={tick}
              events={tickEvents}
              isExpanded={expandedTick === tick}
              expandedPhase={expandedTick === tick ? expandedPhase : null}
              onToggle={() => setExpandedTick(expandedTick === tick ? null : tick)}
              onPhaseToggle={(phase) => setExpandedPhase(expandedPhase === phase ? null : phase)}
            />
          ))}

          {/* Single mode: Flat event feed */}
          {autopilotMode === 'single' && events.map((event, i) => (
            <SingleEventCard key={`${event.timestamp}-${i}`} event={event} />
          ))}

          <div ref={eventsEndRef} />
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Portfolio Pipeline — Per-Tick View
// ===========================================================================

function TickPipeline({
  tick, events, isExpanded, expandedPhase, onToggle, onPhaseToggle,
}: {
  tick: number;
  events: HeartbeatEvent[];
  isExpanded: boolean;
  expandedPhase: string | null;
  onToggle: () => void;
  onPhaseToggle: (phase: string) => void;
}) {
  const scanEvent = events.find(e => e.type === 'scanning');
  const rankEvent = events.find(e => e.type === 'ranking');
  const analysisEvent = events.find(e => e.type === 'analysis');
  const thinkingEvent = events.find(e => e.type === 'thinking');
  const portfolioEvents = events.filter(e => e.type === 'portfolio_update');
  const actionEvents = events.filter(e => e.type === 'action' || e.type === 'trade_executed' || e.type === 'trade_skipped');
  const sizingEvents = events.filter(e => e.type === 'sizing');
  const errorEvents = events.filter(e => e.type === 'error');
  const killEvent = events.find(e => e.type === 'kill_triggered');
  const tickStart = events.find(e => e.type === 'tick_start');

  const time = tickStart ? new Date(tickStart.timestamp).toLocaleTimeString() : '';
  const hasAction = actionEvents.some(e => e.type === 'trade_executed' || (e.type === 'action' && e.data.action !== 'hold'));
  const isHold = actionEvents.length > 0 && actionEvents.every(e => e.data.action === 'hold' || e.type === 'trade_skipped');

  // Collapsed one-liner
  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className={`w-full text-left rounded-lg p-2 border transition-colors ${
          killEvent ? 'border-[var(--cl-error-border)] bg-[var(--cl-fill-error-subtle)]' :
          hasAction ? 'border-[var(--cl-success-border)] bg-[var(--cl-fill-success-subtle)]' :
          'border-[var(--cl-border-subtle)] bg-transparent'
        } hover:brightness-110`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--cl-text-secondary)] font-mono">#{tick}</span>
            <span className="text-[10px] text-[var(--cl-text-faint)] truncate">
              {killEvent ? 'KILL TRIGGERED' :
               hasAction ? (analysisEvent?.data.analysis as string || 'Trade executed') :
               isHold ? 'Hold — no action' :
               analysisEvent?.data.analysis as string || 'Processing...'}
            </span>
          </div>
          <span className="text-[9px] text-[var(--cl-text-secondary)] flex-shrink-0">{time}</span>
        </div>
      </button>
    );
  }

  // Expanded pipeline view
  return (
    <div className="rounded-lg border border-[var(--cl-border)] bg-[var(--cl-fill-control)] overflow-hidden">
      {/* Tick header */}
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--cl-fill-hover)] transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--cl-text-primary)] font-mono">TICK #{tick}</span>
          {hasAction && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--cl-fill-success)] text-[var(--cl-success)] font-bold">TRADED</span>}
          {isHold && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--cl-fill-control)] text-[var(--cl-text-secondary)] border border-[var(--cl-border-subtle)]">HOLD</span>}
        </div>
        <span className="text-[9px] text-[var(--cl-text-secondary)]">{time}</span>
      </button>

      {/* Pipeline phases */}
      <div className="px-3 pb-3 space-y-0.5">
        {/* SCAN */}
        {scanEvent && (
          <PipelineNode
            icon="radar"
            label="SCAN"
            color="text-[var(--cl-info)]"
            summary={`${scanEvent.data.scannedCount ?? '?'} tokens scanned`}
            isExpanded={expandedPhase === 'scan'}
            onToggle={() => onPhaseToggle('scan')}
          >
            <div className="flex flex-wrap gap-1">
              {(scanEvent.data.tickers as Array<{ symbol: string; change: number; price: number }>)?.map(t => (
                <span key={t.symbol} className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                  t.change >= 0 ? 'text-[var(--cl-success)] bg-[var(--cl-fill-success-subtle)]' : 'text-[var(--cl-error)] bg-[var(--cl-fill-error-subtle)]'
                }`}>
                  {t.symbol} {t.change >= 0 ? '+' : ''}{t.change.toFixed(1)}%
                </span>
              ))}
            </div>
          </PipelineNode>
        )}

        {/* RANKING */}
        {rankEvent && (
          <PipelineNode
            icon="trophy"
            label="RANKING"
            color="text-[var(--cl-warning)]"
            summary={`Top: ${(rankEvent.data.topPicks as string[])?.join(', ') ?? '—'}`}
            isExpanded={expandedPhase === 'rank'}
            onToggle={() => onPhaseToggle('rank')}
          >
            <div className="space-y-1">
              {(rankEvent.data.rankings as Array<{ symbol: string; score: number; changePercent: number }>)?.slice(0, 8).map((r, i) => (
                <div key={r.symbol} className="flex items-center justify-between text-[9px]">
                  <span className="font-mono text-[var(--cl-text-faint)]">
                    <span className="text-[var(--cl-text-secondary)] mr-1">#{i + 1}</span>
                    {shortSym(r.symbol)}
                  </span>
                  <div className="flex gap-2">
                    <span className={r.changePercent >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                      {r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%
                    </span>
                    <span className="text-[var(--cl-text-secondary)]">Score: {r.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </PipelineNode>
        )}

        {/* PORTFOLIO STATE */}
        {portfolioEvents.length > 0 && (
          <PipelineNode
            icon="wallet"
            label="PORTFOLIO"
            color="text-[var(--cl-accent)]"
            summary={(() => {
              const pe = portfolioEvents[0];
              return `$${formatUsd(pe.data.totalEquity as number)} | ${(pe.data.cashPercent as number)?.toFixed(0)}% cash | ${(pe.data.dailyPnlPercent as number) >= 0 ? '+' : ''}${(pe.data.dailyPnlPercent as number)?.toFixed(2)}% today`;
            })()}
            isExpanded={expandedPhase === 'portfolio'}
            onToggle={() => onPhaseToggle('portfolio')}
          >
            {/* Allocation bar */}
            <AllocationBar positions={portfolioEvents[0].data.positions as Array<{ symbol: string; side: string; allocationPercent: number }>} cashPercent={portfolioEvents[0].data.cashPercent as number} />
          </PipelineNode>
        )}

        {/* THINKING */}
        {thinkingEvent && (
          <PipelineNode
            icon="brain"
            label="THINKING"
            color="text-[var(--cl-info)]"
            summary="Extended reasoning..."
            isExpanded={expandedPhase === 'thinking'}
            onToggle={() => onPhaseToggle('thinking')}
          >
            <pre className="text-[10px] text-[var(--cl-text-faint)] whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
              {String(thinkingEvent.data.thinking)}
            </pre>
          </PipelineNode>
        )}

        {/* ANALYSIS */}
        {analysisEvent && (
          <PipelineNode
            icon="chart"
            label="ANALYSIS"
            color="text-[var(--cl-accent)]"
            summary={String(analysisEvent.data.analysis || '').slice(0, 80)}
            isExpanded={expandedPhase === 'analysis'}
            onToggle={() => onPhaseToggle('analysis')}
          >
            <div className="space-y-2">
              {!!analysisEvent.data.portfolioAssessment && (
                <div>
                  <span className="text-[9px] text-[var(--cl-text-secondary)] uppercase block mb-0.5">Portfolio Assessment</span>
                  <p className="text-[10px] text-[var(--cl-text-faint)]">{String(analysisEvent.data.portfolioAssessment)}</p>
                </div>
              )}
              {!!analysisEvent.data.reasoning && (
                <div>
                  <span className="text-[9px] text-[var(--cl-text-secondary)] uppercase block mb-0.5">Reasoning</span>
                  <p className="text-[10px] text-[var(--cl-text-faint)]">{String(analysisEvent.data.reasoning)}</p>
                </div>
              )}
              {analysisEvent.data.confidence !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[var(--cl-text-secondary)]">Confidence:</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--cl-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--cl-accent)] transition-all"
                      style={{ width: `${analysisEvent.data.confidence}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-[var(--cl-accent)]">{String(analysisEvent.data.confidence)}%</span>
                </div>
              )}
            </div>
          </PipelineNode>
        )}

        {/* SIZING */}
        {sizingEvents.length > 0 && (
          <PipelineNode
            icon="scale"
            label="SIZING"
            color="text-[var(--cl-warning)]"
            summary={sizingEvents.map(s => `${shortSym(String(s.data.symbol))} ${s.data.allocationPercent}%`).join(', ')}
            isExpanded={expandedPhase === 'sizing'}
            onToggle={() => onPhaseToggle('sizing')}
          >
            {sizingEvents.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[9px] font-mono">
                <span className="text-[var(--cl-text-faint)]">{shortSym(String(s.data.symbol))}</span>
                <div className="flex gap-3">
                  <span className="text-[var(--cl-accent)]">{String(s.data.allocationPercent)}% alloc</span>
                  {!!s.data.estimatedUsd && <span className="text-[var(--cl-text-secondary)]">~${formatUsd(s.data.estimatedUsd as number)}</span>}
                  {!!s.data.leverage && <span className="text-[var(--cl-warning)]">{String(s.data.leverage)}x</span>}
                  {!!s.data.adviseOnly && <span className="text-[var(--cl-text-secondary)] italic">advise only</span>}
                </div>
              </div>
            ))}
          </PipelineNode>
        )}

        {/* ACTIONS */}
        {actionEvents.map((event, i) => (
          <PipelineNode
            key={i}
            icon={event.type === 'trade_executed' ? 'zap' : event.data.action === 'hold' ? 'pause' : 'skip'}
            label={event.type === 'trade_executed' ? 'EXECUTED' : event.data.action === 'hold' ? 'HOLD' : 'SKIPPED'}
            color={
              event.type === 'trade_executed' ? 'text-[var(--cl-success)]' :
              event.type === 'trade_skipped' ? 'text-[var(--cl-warning)]' :
              event.data.action === 'hold' ? 'text-[var(--cl-text-secondary)]' :
              'text-[var(--cl-accent)]'
            }
            summary={(() => {
              const d = event.data;
              if (event.type === 'trade_executed') {
                const pnlStr = d.realizedPnl !== undefined
                  ? ` | PnL: ${(d.realizedPnl as number) >= 0 ? '+' : ''}$${formatUsd(d.realizedPnl as number)}`
                  : '';
                const cumulStr = d.cumulativePnl !== undefined
                  ? ` (Cumul: ${(d.cumulativePnl as number) >= 0 ? '+' : ''}$${formatUsd(d.cumulativePnl as number)})`
                  : '';
                return `${String(d.action).toUpperCase()} ${shortSym(String(d.symbol))} ${d.amount ? `${Number(d.amount).toFixed(4)}` : ''} @ ${d.price ? formatPrice(Number(d.price)) : '?'}${pnlStr}${cumulStr}`;
              }
              if (d.action === 'hold') return String(d.reason || 'No clear setup');
              return `${String(d.action).toUpperCase()} ${shortSym(String(d.symbol || ''))}: ${d.reason ?? ''}`;
            })()}
            isExpanded={false}
            onToggle={() => {}}
          />
        ))}

        {/* PORTFOLIO UPDATE (after execution) */}
        {portfolioEvents.length > 1 && (
          <PipelineNode
            icon="refresh"
            label="UPDATED"
            color="text-[var(--cl-success)]"
            summary={(() => {
              const pe = portfolioEvents[portfolioEvents.length - 1];
              const cPnl = pe.data.cumulativeRealizedPnl as number | undefined;
              const returnPct = pe.data.totalReturnPercent as number | undefined;
              const base = `$${formatUsd(pe.data.totalEquity as number)} | ${(pe.data.dailyPnlPercent as number) >= 0 ? '+' : ''}${(pe.data.dailyPnlPercent as number)?.toFixed(2)}% today`;
              const pnlPart = cPnl !== undefined && cPnl !== 0
                ? ` | Realized: ${cPnl >= 0 ? '+' : ''}$${formatUsd(cPnl)}`
                : '';
              const retPart = returnPct !== undefined
                ? ` | Session: ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`
                : '';
              return base + pnlPart + retPart;
            })()}
            isExpanded={expandedPhase === 'update'}
            onToggle={() => onPhaseToggle('update')}
          >
            <AllocationBar positions={portfolioEvents[portfolioEvents.length - 1].data.positions as Array<{ symbol: string; side: string; allocationPercent: number }>} cashPercent={portfolioEvents[portfolioEvents.length - 1].data.cashPercent as number} />
          </PipelineNode>
        )}

        {/* ERRORS */}
        {errorEvents.map((e, i) => (
          <PipelineNode key={`err-${i}`} icon="alert" label="ERROR" color="text-[var(--cl-error)]" summary={String(e.data.error).slice(0, 80)} isExpanded={false} onToggle={() => {}} />
        ))}

        {/* KILL */}
        {killEvent && (
          <PipelineNode icon="skull" label="KILL TRIGGERED" color="text-[var(--cl-error)]" summary={`Daily loss: ${killEvent.data.dailyLossPercent}%`} isExpanded={false} onToggle={() => {}} />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Pipeline Node — Single phase within a tick
// ===========================================================================

function PipelineNode({
  icon, label, color, summary, isExpanded, onToggle, children,
}: {
  icon: string;
  label: string;
  color: string;
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const iconMap: Record<string, string> = {
    radar: '📡', trophy: '🏆', wallet: '💰', brain: '💭', chart: '🧠',
    scale: '📊', zap: '⚡', pause: '⏸', skip: '⏭', refresh: '🔄',
    alert: '❌', skull: '🛑',
  };

  return (
    <div className="relative pl-4">
      {/* Connector line */}
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-[var(--cl-border-subtle)]" />
      {/* Dot */}
      <div className={`absolute left-[3px] top-[7px] w-[9px] h-[9px] rounded-full border-2 border-[var(--cl-bg-surface)] ${
        isExpanded ? 'bg-[var(--cl-accent)]' : 'bg-[var(--cl-border)]'
      }`} />

      <button onClick={onToggle} className="w-full text-left py-1 hover:bg-[var(--cl-fill-hover)] rounded-r transition-colors">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">{iconMap[icon] || '•'}</span>
          <span className={`text-[9px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
          <span className="text-[10px] text-[var(--cl-text-faint)] truncate flex-1">{summary}</span>
        </div>
      </button>

      {isExpanded && children && (
        <div className="ml-4 mt-1 mb-2 p-2 rounded border border-[var(--cl-border-subtle)] bg-[var(--cl-bg-surface)]">
          {children}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Allocation Bar — Horizontal stacked bar
// ===========================================================================

function AllocationBar({
  positions, cashPercent,
}: {
  positions?: Array<{ symbol: string; side: string; allocationPercent: number }>;
  cashPercent?: number;
}) {
  if (!positions && cashPercent === undefined) return null;

  const posItems = positions ?? [];
  const cash = cashPercent ?? (100 - posItems.reduce((s, p) => s + p.allocationPercent, 0));

  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden border border-[var(--cl-border-subtle)]">
        {posItems.map(p => (
          <div
            key={p.symbol}
            className={`flex items-center justify-center text-[7px] font-bold text-white truncate ${
              p.side === 'long' ? 'bg-[var(--cl-success)]' : 'bg-[var(--cl-error)]'
            }`}
            style={{ width: `${Math.max(p.allocationPercent, 3)}%` }}
            title={`${shortSym(p.symbol)} ${p.side} ${p.allocationPercent.toFixed(1)}%`}
          >
            {p.allocationPercent >= 8 ? `${shortSym(p.symbol)} ${p.allocationPercent.toFixed(0)}%` : ''}
          </div>
        ))}
        {cash > 0 && (
          <div
            className="flex items-center justify-center text-[7px] font-bold text-[var(--cl-text-secondary)] bg-[var(--cl-fill-control)]"
            style={{ width: `${Math.max(cash, 3)}%` }}
            title={`USDT ${cash.toFixed(1)}%`}
          >
            {cash >= 12 ? `USDT ${cash.toFixed(0)}%` : ''}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {posItems.map(p => (
          <span key={p.symbol} className={`text-[8px] font-mono ${p.side === 'long' ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
            {shortSym(p.symbol)} {p.allocationPercent.toFixed(1)}%
          </span>
        ))}
        <span className="text-[8px] font-mono text-[var(--cl-text-secondary)]">USDT {cash.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ===========================================================================
// Single Mode — Flat event card (legacy)
// ===========================================================================

function SingleEventCard({ event }: { event: HeartbeatEvent }) {
  const [expanded, setExpanded] = useState(false);

  const icon = (() => {
    switch (event.type) {
      case 'tick_start': return '⏱';
      case 'analysis': return '🧠';
      case 'thinking': return '💭';
      case 'action': return '📋';
      case 'trade_executed': return '⚡';
      case 'trade_skipped': return '⏸';
      case 'error': return '❌';
      case 'kill_triggered': return '🛑';
      case 'status': return '📡';
      default: return '•';
    }
  })();

  const color = (() => {
    switch (event.type) {
      case 'trade_executed': return 'border-[var(--cl-success-border)] bg-[var(--cl-fill-success-subtle)]';
      case 'error': return 'border-[var(--cl-error-border)] bg-[var(--cl-fill-error-subtle)]';
      case 'kill_triggered': return 'border-[var(--cl-error-border)] bg-[var(--cl-fill-error)]';
      case 'trade_skipped': return 'border-[var(--cl-warning-border)] bg-[var(--cl-fill-warning-subtle)]';
      case 'analysis': return 'border-[var(--cl-accent-border)] bg-[var(--cl-fill-accent-subtle)]';
      case 'thinking': return 'border-[var(--cl-info-border)] bg-[var(--cl-fill-info-subtle)]';
      default: return 'border-[var(--cl-border-subtle)] bg-transparent';
    }
  })();

  const summary = (() => {
    const d = event.data;
    switch (event.type) {
      case 'tick_start': return `Tick #${d.tick}`;
      case 'analysis': return String(d.analysis || '').slice(0, 80);
      case 'thinking': return 'Extended reasoning...';
      case 'action': return `${String(d.action).toUpperCase()}: ${d.reason ?? ''} (${d.confidence ?? '?'}%)`;
      case 'trade_executed': return `${String(d.action).toUpperCase()} ${d.amount ? Number(d.amount).toFixed(4) : ''} @ ${d.price ? formatPrice(Number(d.price)) : '?'}`;
      case 'trade_skipped': return `Skipped ${d.action}: ${d.reason}`;
      case 'error': return `Error: ${String(d.error).slice(0, 60)}`;
      case 'kill_triggered': return `KILL: ${d.reason} (${d.dailyLossPercent}% loss)`;
      case 'status': return `${d.status ?? (d.isRunning ? 'Running' : 'Stopped')}`;
      default: return JSON.stringify(d).slice(0, 80);
    }
  })();

  return (
    <button onClick={() => setExpanded(!expanded)} className={`w-full text-left rounded p-2 border transition-colors ${color} hover:brightness-110`}>
      <div className="flex items-start gap-2">
        <span className="text-[10px] leading-none mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-[var(--cl-text-faint)] truncate">{summary}</span>
            <span className="text-[9px] text-[var(--cl-text-secondary)] flex-shrink-0">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-[var(--cl-border-subtle)]">
              {event.type === 'thinking' && !!event.data.thinking ? (
                <pre className="text-[10px] text-[var(--cl-text-faint)] whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">{String(event.data.thinking)}</pre>
              ) : (
                <pre className="text-[9px] text-[var(--cl-text-secondary)] whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{JSON.stringify(event.data, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
