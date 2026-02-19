'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
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
                // Save async -- update journal entry path when done
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
      <Card className="rounded-none border-x-0 border-t-0 py-0 gap-0 shadow-none">
        <CardHeader className="px-3 py-2 flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Autopilot</CardTitle>
            {isRunning && (
              <Badge variant="outline" className="flex items-center gap-1 px-1.5 py-0.5 bg-[#2D8547]/8 border-[#2D8547]/20 text-[#2D8547]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2D8547] animate-pulse" />
                <span className="text-[9px] font-bold">LIVE</span>
              </Badge>
            )}
            {autopilotMode === 'portfolio' && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 bg-primary/5 text-primary border-primary/20">
                PORTFOLIO
              </Badge>
            )}
          </div>
          {isRunning && (
            <span className="text-[9px] text-muted-foreground">Tick #{tickCount}</span>
          )}
        </CardHeader>
      </Card>

      <div className="flex-1 overflow-y-auto">
        {/* Controls */}
        <div className="p-3 space-y-3 border-b border-border/50">
          {/* Mode toggle */}
          {!isRunning && (
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted border border-border/50">
              <button
                onClick={() => setAutopilotMode('single')}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all',
                  autopilotMode === 'single'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-muted-foreground'
                )}
              >
                Single Symbol
              </button>
              <button
                onClick={() => setAutopilotMode('portfolio')}
                className={cn(
                  'flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all',
                  autopilotMode === 'portfolio'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-muted-foreground'
                )}
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
                <span className="text-[10px] text-muted-foreground">Scan mode</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setAutopilotScanMode('watchlist')}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] transition-colors',
                      autopilotScanMode === 'watchlist'
                        ? 'bg-primary/8 text-primary border border-primary/20'
                        : 'text-muted-foreground border border-transparent'
                    )}
                  >
                    Watchlist
                  </button>
                  <button
                    onClick={() => setAutopilotScanMode('full_scan')}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] transition-colors',
                      autopilotScanMode === 'full_scan'
                        ? 'bg-primary/8 text-primary border border-primary/20'
                        : 'text-muted-foreground border border-transparent'
                    )}
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
                      <span key={sym} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-muted border border-border/50 text-muted-foreground">
                        {shortSym(sym)}
                        <button
                          onClick={() => removeFromWatchlist(sym)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                        >
                          x
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => { setShowAddSymbol(!showAddSymbol); setSymbolSearch(''); setLeverageFilter(null); }}
                      className="px-2 py-0.5 rounded-full text-[10px] border border-dashed border-border text-muted-foreground hover:border-primary/20 hover:text-primary transition-colors"
                    >
                      + Add
                    </button>
                  </div>

                  {showAddSymbol && (
                    <div className="mt-2 rounded border border-border/50 bg-muted overflow-hidden">
                      {/* Search + leverage quick-filters */}
                      <div className="p-2 space-y-1.5 border-b border-border/50">
                        <input
                          type="text"
                          value={symbolSearch}
                          onChange={e => setSymbolSearch(e.target.value)}
                          placeholder="Search tokens..."
                          className="w-full px-2 py-1 rounded text-[10px] bg-card border border-border/50 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/20"
                          autoFocus
                        />
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] text-muted-foreground mr-1">Leverage:</span>
                          {[null, 20, 50, 75, 100].map(lev => (
                            <button
                              key={lev ?? 'all'}
                              onClick={() => setLeverageFilter(lev)}
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[9px] transition-colors',
                                leverageFilter === lev
                                  ? 'bg-primary/8 text-primary border border-primary/20'
                                  : 'text-muted-foreground border border-transparent hover:text-muted-foreground'
                              )}
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
                              className="ml-auto px-1.5 py-0.5 rounded text-[9px] text-primary border border-primary/20 hover:bg-primary/8 transition-colors"
                            >
                              + Add all ({filteredMarkets.length})
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Results list */}
                      <div className="max-h-48 overflow-y-auto p-1">
                        {marketsLoading ? (
                          <div className="p-3 text-center text-[10px] text-muted-foreground">Loading markets from Phemex...</div>
                        ) : filteredMarkets.length === 0 ? (
                          <div className="p-3 text-center text-[10px] text-muted-foreground">
                            {allMarkets.length === 0 ? 'Connect to Phemex first' : 'No matching tokens'}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-0.5">
                            {filteredMarkets.slice(0, 100).map(m => (
                              <button
                                key={m.symbol}
                                onClick={() => addToWatchlist(m.symbol)}
                                className="flex items-center justify-between px-2 py-1 rounded text-[10px] hover:bg-muted/80 transition-colors"
                              >
                                <span className="text-muted-foreground font-medium">{m.base}</span>
                                {m.maxLeverage && (
                                  <span className={cn(
                                    'text-[8px] font-mono',
                                    m.maxLeverage >= 50 ? 'text-[#B8860B]' : 'text-muted-foreground'
                                  )}>
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
                <div className="p-2 rounded bg-primary/3 border border-primary/20 text-[10px] text-primary">
                  Full scan mode -- discovers top tokens from all Phemex futures each tick
                </div>
              )}
            </div>
          )}

          {/* Start/Stop button */}
          <button
            onClick={isRunning ? handleStop : handleStart}
            disabled={!isConnected}
            className={cn(
              'w-full py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2',
              isRunning
                ? 'bg-destructive/12 border border-destructive/20 text-destructive'
                : isConnected
                  ? 'bg-[#2D8547] text-primary-foreground hover:bg-[#248A3F] shadow-lg shadow-[#2D8547]/20'
                  : 'bg-muted border border-border/50 text-muted-foreground cursor-not-allowed'
            )}
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
                <span className="text-[10px] text-muted-foreground">Heartbeat interval</span>
                <div className="flex gap-1">
                  {INTERVAL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setIntervalMs(opt.value)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] transition-colors',
                        interval === opt.value
                          ? 'bg-primary/8 text-primary border border-primary/20'
                          : 'text-muted-foreground border border-transparent'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Auto-execute trades</span>
                  <span className="text-[9px] text-muted-foreground">{autoTrade ? 'Will place real orders' : 'Advise only'}</span>
                </div>
                <Switch
                  checked={autoTrade}
                  onCheckedChange={setAutoTrade}
                />
              </div>

              {autoTrade && (
                <div className="p-2 rounded bg-destructive/8 border border-destructive/20 text-[10px] text-destructive">
                  Auto-trade is ON -- Claude will execute real trades on your account
                </div>
              )}
            </div>
          )}

          {/* Running analysis */}
          {isRunning && lastAnalysis && (
            <Card className="py-0 gap-0 shadow-none">
              <CardContent className="p-2">
                <span className="text-[9px] text-muted-foreground block mb-1">Latest analysis</span>
                <span className="text-[11px] text-foreground">{lastAnalysis}</span>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Autopilot PnL Summary */}
        {isRunning && autopilotMode === 'portfolio' && (sessionPnl || autopilotClosedTrades.length > 0) && (
          <div className="px-3 py-2 border-b border-border/50 bg-card">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Realized PnL:</span>
                  <span className={cn(
                    'font-mono font-semibold',
                    (sessionPnl?.cumulative ?? autopilotCumulativePnl) >= 0 ? 'text-[#2D8547]' : 'text-destructive'
                  )}>
                    {(sessionPnl?.cumulative ?? autopilotCumulativePnl) >= 0 ? '+' : ''}${formatUsd(sessionPnl?.cumulative ?? autopilotCumulativePnl)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Trades:</span>
                  <span className="font-mono text-muted-foreground">{sessionPnl?.tradeCount ?? autopilotClosedTrades.length}</span>
                </div>
                {(sessionPnl?.winRate ?? 0) > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">WR:</span>
                    <span className={cn(
                      'font-mono',
                      (sessionPnl?.winRate ?? 0) >= 50 ? 'text-[#2D8547]' : 'text-destructive'
                    )}>
                      {(sessionPnl?.winRate ?? 0).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
              {sessionPnl && sessionPnl.sessionStart > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Return:</span>
                  <span className={cn(
                    'font-mono font-semibold',
                    sessionPnl.currentEquity >= sessionPnl.sessionStart ? 'text-[#2D8547]' : 'text-destructive'
                  )}>
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
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-muted-foreground">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <p className="text-xs text-muted-foreground mt-3">
                {autopilotMode === 'portfolio' ? 'Portfolio autopilot inactive' : 'Autopilot inactive'}
              </p>
              <p className="text-[10px] text-muted-foreground">
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
// Portfolio Pipeline -- Per-Tick View
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
        className={cn(
          'w-full text-left rounded-lg p-2 border transition-colors hover:brightness-110',
          killEvent ? 'border-destructive/20 bg-destructive/4' :
          hasAction ? 'border-[#2D8547]/20 bg-[#2D8547]/4' :
          'border-border/50 bg-transparent'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono">#{tick}</span>
            <span className="text-[10px] text-muted-foreground truncate">
              {killEvent ? 'KILL TRIGGERED' :
               hasAction ? (analysisEvent?.data.analysis as string || 'Trade executed') :
               isHold ? 'Hold -- no action' :
               analysisEvent?.data.analysis as string || 'Processing...'}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground flex-shrink-0">{time}</span>
        </div>
      </button>
    );
  }

  // Expanded pipeline view
  return (
    <div className="rounded-lg border border-border bg-muted overflow-hidden">
      {/* Tick header */}
      <button onClick={onToggle} className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/80 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground font-mono">TICK #{tick}</span>
          {hasAction && <Badge variant="outline" className="text-[8px] px-1.5 py-0.5 bg-[#2D8547]/8 text-[#2D8547] border-[#2D8547]/20 font-bold">TRADED</Badge>}
          {isHold && <Badge variant="outline" className="text-[8px] px-1.5 py-0.5 bg-muted text-muted-foreground border-border/50">HOLD</Badge>}
        </div>
        <span className="text-[9px] text-muted-foreground">{time}</span>
      </button>

      {/* Pipeline phases */}
      <div className="px-3 pb-3 space-y-0.5">
        {/* SCAN */}
        {scanEvent && (
          <PipelineNode
            icon="radar"
            label="SCAN"
            color="text-[#1C6BBB]"
            summary={`${scanEvent.data.scannedCount ?? '?'} tokens scanned`}
            isExpanded={expandedPhase === 'scan'}
            onToggle={() => onPhaseToggle('scan')}
          >
            <div className="flex flex-wrap gap-1">
              {(scanEvent.data.tickers as Array<{ symbol: string; change: number; price: number }>)?.map(t => (
                <span key={t.symbol} className={cn(
                  'text-[9px] font-mono px-1.5 py-0.5 rounded',
                  t.change >= 0 ? 'text-[#2D8547] bg-[#2D8547]/4' : 'text-destructive bg-destructive/4'
                )}>
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
            color="text-[#B8860B]"
            summary={`Top: ${(rankEvent.data.topPicks as string[])?.join(', ') ?? '--'}`}
            isExpanded={expandedPhase === 'rank'}
            onToggle={() => onPhaseToggle('rank')}
          >
            <div className="space-y-1">
              {(rankEvent.data.rankings as Array<{ symbol: string; score: number; changePercent: number }>)?.slice(0, 8).map((r, i) => (
                <div key={r.symbol} className="flex items-center justify-between text-[9px]">
                  <span className="font-mono text-muted-foreground">
                    <span className="text-muted-foreground mr-1">#{i + 1}</span>
                    {shortSym(r.symbol)}
                  </span>
                  <div className="flex gap-2">
                    <span className={r.changePercent >= 0 ? 'text-[#2D8547]' : 'text-destructive'}>
                      {r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%
                    </span>
                    <span className="text-muted-foreground">Score: {r.score}</span>
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
            color="text-primary"
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
            color="text-[#1C6BBB]"
            summary="Extended reasoning..."
            isExpanded={expandedPhase === 'thinking'}
            onToggle={() => onPhaseToggle('thinking')}
          >
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
              {String(thinkingEvent.data.thinking)}
            </pre>
          </PipelineNode>
        )}

        {/* ANALYSIS */}
        {analysisEvent && (
          <PipelineNode
            icon="chart"
            label="ANALYSIS"
            color="text-primary"
            summary={String(analysisEvent.data.analysis || '').slice(0, 80)}
            isExpanded={expandedPhase === 'analysis'}
            onToggle={() => onPhaseToggle('analysis')}
          >
            <div className="space-y-2">
              {!!analysisEvent.data.portfolioAssessment && (
                <div>
                  <span className="text-[9px] text-muted-foreground uppercase block mb-0.5">Portfolio Assessment</span>
                  <p className="text-[10px] text-muted-foreground">{String(analysisEvent.data.portfolioAssessment)}</p>
                </div>
              )}
              {!!analysisEvent.data.reasoning && (
                <div>
                  <span className="text-[9px] text-muted-foreground uppercase block mb-0.5">Reasoning</span>
                  <p className="text-[10px] text-muted-foreground">{String(analysisEvent.data.reasoning)}</p>
                </div>
              )}
              {analysisEvent.data.confidence !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-muted-foreground">Confidence:</span>
                  <div className="flex-1 h-1.5 rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${analysisEvent.data.confidence}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-primary">{String(analysisEvent.data.confidence)}%</span>
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
            color="text-[#B8860B]"
            summary={sizingEvents.map(s => `${shortSym(String(s.data.symbol))} ${s.data.allocationPercent}%`).join(', ')}
            isExpanded={expandedPhase === 'sizing'}
            onToggle={() => onPhaseToggle('sizing')}
          >
            {sizingEvents.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[9px] font-mono">
                <span className="text-muted-foreground">{shortSym(String(s.data.symbol))}</span>
                <div className="flex gap-3">
                  <span className="text-primary">{String(s.data.allocationPercent)}% alloc</span>
                  {!!s.data.estimatedUsd && <span className="text-muted-foreground">~${formatUsd(s.data.estimatedUsd as number)}</span>}
                  {!!s.data.leverage && <span className="text-[#B8860B]">{String(s.data.leverage)}x</span>}
                  {!!s.data.adviseOnly && <span className="text-muted-foreground italic">advise only</span>}
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
              event.type === 'trade_executed' ? 'text-[#2D8547]' :
              event.type === 'trade_skipped' ? 'text-[#B8860B]' :
              event.data.action === 'hold' ? 'text-muted-foreground' :
              'text-primary'
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
            color="text-[#2D8547]"
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
          <PipelineNode key={`err-${i}`} icon="alert" label="ERROR" color="text-destructive" summary={String(e.data.error).slice(0, 80)} isExpanded={false} onToggle={() => {}} />
        ))}

        {/* KILL */}
        {killEvent && (
          <PipelineNode icon="skull" label="KILL TRIGGERED" color="text-destructive" summary={`Daily loss: ${killEvent.data.dailyLossPercent}%`} isExpanded={false} onToggle={() => {}} />
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Pipeline Node -- Single phase within a tick
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
    radar: '\u{1F4E1}', trophy: '\u{1F3C6}', wallet: '\u{1F4B0}', brain: '\u{1F4AD}', chart: '\u{1F9E0}',
    scale: '\u{1F4CA}', zap: '\u{26A1}', pause: '\u{23F8}', skip: '\u{23ED}', refresh: '\u{1F504}',
    alert: '\u{274C}', skull: '\u{1F6D1}',
  };

  return (
    <div className="relative pl-4">
      {/* Connector line */}
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border/50" />
      {/* Dot */}
      <div className={cn(
        'absolute left-[3px] top-[7px] w-[9px] h-[9px] rounded-full border-2 border-card',
        isExpanded ? 'bg-primary' : 'bg-border'
      )} />

      <button onClick={onToggle} className="w-full text-left py-1 hover:bg-muted/80 rounded-r transition-colors">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">{iconMap[icon] || '\u{2022}'}</span>
          <span className={cn('text-[9px] font-bold uppercase tracking-wider', color)}>{label}</span>
          <span className="text-[10px] text-muted-foreground truncate flex-1">{summary}</span>
        </div>
      </button>

      {isExpanded && children && (
        <div className="ml-4 mt-1 mb-2 p-2 rounded border border-border/50 bg-card">
          {children}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Allocation Bar -- Horizontal stacked bar
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
      <div className="flex h-4 rounded-full overflow-hidden border border-border/50">
        {posItems.map(p => (
          <div
            key={p.symbol}
            className={cn(
              'flex items-center justify-center text-[7px] font-bold text-white truncate',
              p.side === 'long' ? 'bg-[#2D8547]' : 'bg-destructive'
            )}
            style={{ width: `${Math.max(p.allocationPercent, 3)}%` }}
            title={`${shortSym(p.symbol)} ${p.side} ${p.allocationPercent.toFixed(1)}%`}
          >
            {p.allocationPercent >= 8 ? `${shortSym(p.symbol)} ${p.allocationPercent.toFixed(0)}%` : ''}
          </div>
        ))}
        {cash > 0 && (
          <div
            className="flex items-center justify-center text-[7px] font-bold text-muted-foreground bg-muted"
            style={{ width: `${Math.max(cash, 3)}%` }}
            title={`USDT ${cash.toFixed(1)}%`}
          >
            {cash >= 12 ? `USDT ${cash.toFixed(0)}%` : ''}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {posItems.map(p => (
          <span key={p.symbol} className={cn(
            'text-[8px] font-mono',
            p.side === 'long' ? 'text-[#2D8547]' : 'text-destructive'
          )}>
            {shortSym(p.symbol)} {p.allocationPercent.toFixed(1)}%
          </span>
        ))}
        <span className="text-[8px] font-mono text-muted-foreground">USDT {cash.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ===========================================================================
// Single Mode -- Flat event card (legacy)
// ===========================================================================

function SingleEventCard({ event }: { event: HeartbeatEvent }) {
  const [expanded, setExpanded] = useState(false);

  const icon = (() => {
    switch (event.type) {
      case 'tick_start': return '\u{23F1}';
      case 'analysis': return '\u{1F9E0}';
      case 'thinking': return '\u{1F4AD}';
      case 'action': return '\u{1F4CB}';
      case 'trade_executed': return '\u{26A1}';
      case 'trade_skipped': return '\u{23F8}';
      case 'error': return '\u{274C}';
      case 'kill_triggered': return '\u{1F6D1}';
      case 'status': return '\u{1F4E1}';
      default: return '\u{2022}';
    }
  })();

  const colorClass = (() => {
    switch (event.type) {
      case 'trade_executed': return 'border-[#2D8547]/20 bg-[#2D8547]/4';
      case 'error': return 'border-destructive/20 bg-destructive/4';
      case 'kill_triggered': return 'border-destructive/20 bg-destructive/8';
      case 'trade_skipped': return 'border-[#B8860B]/20 bg-[#B8860B]/4';
      case 'analysis': return 'border-primary/20 bg-primary/3';
      case 'thinking': return 'border-[#1C6BBB]/20 bg-[#1C6BBB]/4';
      default: return 'border-border/50 bg-transparent';
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
    <button onClick={() => setExpanded(!expanded)} className={cn('w-full text-left rounded p-2 border transition-colors hover:brightness-110', colorClass)}>
      <div className="flex items-start gap-2">
        <span className="text-[10px] leading-none mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground truncate">{summary}</span>
            <span className="text-[9px] text-muted-foreground flex-shrink-0">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-border/50">
              {event.type === 'thinking' && !!event.data.thinking ? (
                <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">{String(event.data.thinking)}</pre>
              ) : (
                <pre className="text-[9px] text-muted-foreground whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{JSON.stringify(event.data, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
