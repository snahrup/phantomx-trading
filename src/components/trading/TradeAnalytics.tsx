'use client';

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import type { Position, Trade } from '@/types/trading';

// --- Types ---

interface RoundTripTrade {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  entryTime: number;
  exitTime: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  holdDuration: number;
}

interface DailyPnl {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

type AnalyticsTab = 'positions' | 'history' | 'stats';

// --- Helpers ---

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

function pnlColor(n: number): string {
  return n >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]';
}

function pnlBg(n: number): string {
  return n >= 0 ? 'bg-[var(--cl-fill-success-subtle)]' : 'bg-[var(--cl-fill-error-subtle)]';
}

// Group fills into round-trip trades
function groupRoundTrips(trades: Trade[]): RoundTripTrade[] {
  if (!trades.length) return [];

  // Group by symbol
  const bySymbol: Record<string, Trade[]> = {};
  for (const t of trades) {
    (bySymbol[t.symbol] ??= []).push(t);
  }

  const roundTrips: RoundTripTrade[] = [];

  for (const [symbol, fills] of Object.entries(bySymbol)) {
    // Sort by timestamp
    const sorted = [...fills].sort((a, b) => a.timestamp - b.timestamp);

    let position = 0; // positive = long, negative = short
    let entryAvg = 0;
    let entryTime = 0;
    let entryFees = 0;

    for (const fill of sorted) {
      const qty = fill.side === 'buy' ? fill.amount : -fill.amount;
      const prevPos = position;
      const fee = fill.fee?.cost ?? 0;

      if (position === 0) {
        // Opening new position
        position = qty;
        entryAvg = fill.price;
        entryTime = fill.timestamp;
        entryFees = fee;
      } else if (Math.sign(prevPos + qty) !== Math.sign(prevPos) || prevPos + qty === 0) {
        // Position is closing (flipping or going to zero)
        const closeSize = Math.min(Math.abs(qty), Math.abs(prevPos));
        const side = prevPos > 0 ? 'long' : 'short';
        const pnl = side === 'long'
          ? (fill.price - entryAvg) * closeSize
          : (entryAvg - fill.price) * closeSize;
        const totalFees = entryFees + fee;

        roundTrips.push({
          symbol,
          side,
          entryPrice: entryAvg,
          exitPrice: fill.price,
          size: closeSize,
          entryTime,
          exitTime: fill.timestamp,
          pnl: pnl - totalFees,
          pnlPercent: entryAvg > 0 ? ((fill.price - entryAvg) / entryAvg) * 100 * (side === 'long' ? 1 : -1) : 0,
          fees: totalFees,
          holdDuration: fill.timestamp - entryTime,
        });

        position = prevPos + qty;
        if (position !== 0) {
          entryAvg = fill.price;
          entryTime = fill.timestamp;
          entryFees = 0;
        }
      } else {
        // Adding to position — update average
        const newTotal = Math.abs(position) * entryAvg + Math.abs(qty) * fill.price;
        position += qty;
        entryAvg = position !== 0 ? newTotal / Math.abs(position) : 0;
        entryFees += fee;
      }
    }
  }

  return roundTrips.sort((a, b) => b.exitTime - a.exitTime);
}

function calculateDailyPnl(roundTrips: RoundTripTrade[]): DailyPnl[] {
  const byDate: Record<string, DailyPnl> = {};

  for (const rt of roundTrips) {
    const date = new Date(rt.exitTime).toLocaleDateString();
    if (!byDate[date]) {
      byDate[date] = { date, pnl: 0, trades: 0, wins: 0, losses: 0 };
    }
    byDate[date].pnl += rt.pnl;
    byDate[date].trades++;
    if (rt.pnl >= 0) byDate[date].wins++;
    else byDate[date].losses++;
  }

  return Object.values(byDate).sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// --- Component ---

// PERF-04/05: Wrap in React.memo
export default memo(function TradeAnalytics() {
  // PERF-03: Granular selectors
  const isConnected = useTradingStore(s => s.isConnected);
  const positions = useTradingStore(s => s.positions);
  const selectedSymbol = useTradingStore(s => s.selectedSymbol);
  const [tab, setTab] = useState<AnalyticsTab>('positions');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [roundTrips, setRoundTrips] = useState<RoundTripTrade[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [aiClosingPositionId, setAiClosingPositionId] = useState<string | null>(null);
  const [aiCloseResult, setAiCloseResult] = useState<{ price: number; reasoning: string } | null>(null);
  const fetchedRef = useRef(false);

  // Fetch trade history across known symbols
  const fetchTradeHistory = useCallback(async () => {
    if (!isConnected) return;
    setIsLoading(true);

    try {
      // Get symbols from positions + the selected symbol + common ones we've traded
      const posSymbols = positions.map(p => p.symbol);
      const symbols = [...new Set([selectedSymbol, ...posSymbols])];

      // Also fetch closed orders to find additional symbols
      const closedRes = await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'closed_orders', symbol: selectedSymbol, limit: 50 }),
      });
      const closedData = await closedRes.json();
      if (closedData.orders) {
        for (const o of closedData.orders) {
          if (o.symbol && !symbols.includes(o.symbol)) symbols.push(o.symbol);
        }
      }

      // Fetch trades for all symbols in parallel (PERF-08)
      const tradeResults = await Promise.allSettled(
        symbols.map(sym =>
          fetch('/api/phemex', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'trades', symbol: sym, limit: 100 }),
          }).then(res => res.json())
        )
      );
      const allFills: Trade[] = [];
      for (const result of tradeResults) {
        if (result.status === 'fulfilled' && result.value.trades) {
          allFills.push(...result.value.trades);
        }
      }

      // Deduplicate by trade ID
      const seen = new Set<string>();
      const deduped = allFills.filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      setAllTrades(deduped);
      const rts = groupRoundTrips(deduped);
      setRoundTrips(rts);
      setDailyPnl(calculateDailyPnl(rts));
    } catch (err) {
      console.error('Trade history fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, positions, selectedSymbol]);

  // Fetch on mount, but only once
  useEffect(() => {
    if (isConnected && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchTradeHistory();
    }
  }, [isConnected, fetchTradeHistory]);

  // Market close handler
  const handleMarketClose = useCallback(async (pos: Position) => {
    setClosingPositionId(pos.id);
    try {
      const res = await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_position',
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          type: 'market',
        }),
      });
      const data = await res.json();
      if (!data.success) {
        console.error('Market close failed:', data.error);
      }
    } catch (err) {
      console.error('Market close error:', err);
    } finally {
      setClosingPositionId(null);
    }
  }, []);

  // AI close handler
  const handleAiClose = useCallback(async (pos: Position) => {
    setAiClosingPositionId(pos.id);
    setAiCloseResult(null);
    try {
      const res = await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai_close',
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          entryPrice: pos.entryPrice,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAiCloseResult({ price: data.aiPrice, reasoning: data.aiReasoning });
      } else {
        console.error('AI close failed:', data.error);
      }
    } catch (err) {
      console.error('AI close error:', err);
    } finally {
      setAiClosingPositionId(null);
    }
  }, []);

  // Memoized stats calculations (PERF-07: avoid recomputing on every render)
  const stats = useMemo(() => {
    const totalRealizedPnl = roundTrips.reduce((s, r) => s + r.pnl, 0);
    const wins = roundTrips.filter(r => r.pnl >= 0);
    const losses = roundTrips.filter(r => r.pnl < 0);
    const winRate = roundTrips.length > 0 ? (wins.length / roundTrips.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + r.pnl, 0) / losses.length : 0;
    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0;
    const totalFees = roundTrips.reduce((s, r) => s + r.fees, 0);
    return { totalRealizedPnl, wins, losses, winRate, avgWin, avgLoss, profitFactor, totalFees };
  }, [roundTrips]);

  const { totalRealizedPnl, wins, losses, winRate, avgWin, avgLoss, profitFactor, totalFees } = stats;

  // Memoize unrealized PnL to avoid computing 3x inline (PERF-13)
  const totalUnrealizedPnl = useMemo(
    () => positions.reduce((s, p) => s + p.unrealizedPnl, 0),
    [positions]
  );

  if (!isConnected) return null;

  return (
    <div className={`border-t border-[var(--cl-border)] bg-[var(--cl-bg-sidebar)] flex-shrink-0 transition-all ${isCollapsed ? 'h-8' : 'h-[260px]'}`}>
      {/* Tab bar + collapse toggle */}
      <div className="h-8 flex items-center border-b border-[var(--cl-border-subtle)] px-2 gap-1">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)] transition-colors"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {(['positions', 'history', 'stats'] as AnalyticsTab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); if (isCollapsed) setIsCollapsed(false); }}
            className={`px-3 py-1 text-[10px] font-medium rounded transition-colors ${
              tab === t
                ? 'text-[var(--cl-accent)] bg-[var(--cl-fill-accent-subtle)]'
                : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
            }`}
          >
            {t === 'positions' ? `Positions (${positions.length})` : t === 'history' ? `History (${roundTrips.length})` : 'Stats'}
          </button>
        ))}

        <div className="flex-1" />

        {tab === 'history' && (
          <button
            onClick={() => { fetchedRef.current = false; fetchTradeHistory(); }}
            disabled={isLoading}
            className="text-[9px] text-[var(--cl-text-secondary)] hover:text-[var(--cl-accent)] transition-colors px-2"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        )}

        {/* Quick stats in tab bar */}
        {positions.length > 0 && (
          <div className="flex items-center gap-3 text-[10px]">
            <span className={pnlColor(totalUnrealizedPnl)}>
              uPnL: {totalUnrealizedPnl >= 0 ? '+' : ''}${formatUsd(totalUnrealizedPnl)}
            </span>
          </div>
        )}
      </div>

      {/* Panel content */}
      {!isCollapsed && (
        <div className="h-[calc(100%-32px)] overflow-hidden">
          {/* --- Positions Tab --- */}
          {tab === 'positions' && (
            <div className="h-full overflow-y-auto">
              {positions.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[11px] text-[var(--cl-text-secondary)] opacity-40">
                  No open positions
                </div>
              ) : (
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-[var(--cl-bg-sidebar)]">
                    <tr className="text-[var(--cl-text-secondary)] text-left border-b border-[var(--cl-border-subtle)]">
                      <th className="py-1.5 px-2 font-medium">Symbol</th>
                      <th className="py-1.5 px-2 font-medium">Side</th>
                      <th className="py-1.5 px-2 font-medium text-right">Size</th>
                      <th className="py-1.5 px-2 font-medium text-right">Entry</th>
                      <th className="py-1.5 px-2 font-medium text-right">Mark</th>
                      <th className="py-1.5 px-2 font-medium text-right">Liq</th>
                      <th className="py-1.5 px-2 font-medium text-center">Lev</th>
                      <th className="py-1.5 px-2 font-medium text-right">uPnL</th>
                      <th className="py-1.5 px-2 font-medium text-right">rPnL</th>
                      <th className="py-1.5 px-2 font-medium text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => {
                      const pnlPct = pos.entryPrice > 0
                        ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'long' ? 1 : -1)
                        : 0;
                      return (
                        <tr key={pos.id} className="border-b border-[var(--cl-border-subtle)] hover:bg-[var(--cl-fill-hover)] transition-colors">
                          <td className="py-2 px-2 font-medium text-[var(--cl-text-primary)]">
                            {pos.symbol.replace('/USDT:USDT', '')}
                          </td>
                          <td className="py-2 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                              pos.side === 'long'
                                ? 'text-[var(--cl-success)] bg-[var(--cl-fill-success-subtle)]'
                                : 'text-[var(--cl-error)] bg-[var(--cl-fill-error-subtle)]'
                            }`}>
                              {pos.side}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right text-[var(--cl-text-faint)] font-mono">{pos.size.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right text-[var(--cl-text-faint)] font-mono">{formatPrice(pos.entryPrice)}</td>
                          <td className="py-2 px-2 text-right text-[var(--cl-text-primary)] font-mono">{formatPrice(pos.markPrice)}</td>
                          <td className="py-2 px-2 text-right text-[var(--cl-text-secondary)] font-mono">{pos.liquidationPrice ? formatPrice(pos.liquidationPrice) : '—'}</td>
                          <td className="py-2 px-2 text-center text-[var(--cl-warning)] font-mono">{pos.leverage}x</td>
                          <td className={`py-2 px-2 text-right font-mono font-semibold ${pnlColor(pos.unrealizedPnl)}`}>
                            <div>{pos.unrealizedPnl >= 0 ? '+' : ''}${formatUsd(pos.unrealizedPnl)}</div>
                            <div className="text-[8px] opacity-70">{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%</div>
                          </td>
                          <td className={`py-2 px-2 text-right font-mono ${pnlColor(pos.realizedPnl)}`}>
                            ${formatUsd(pos.realizedPnl)}
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-center gap-1">
                              {/* Market Close */}
                              <button
                                onClick={() => handleMarketClose(pos)}
                                disabled={closingPositionId === pos.id}
                                className="px-2 py-1 rounded text-[9px] font-medium bg-[var(--cl-fill-error)] border border-[var(--cl-error-border)] text-[var(--cl-error)] hover:bg-[var(--cl-fill-error-hover)] transition-colors disabled:opacity-50"
                                title="Close at market price"
                              >
                                {closingPositionId === pos.id ? (
                                  <span className="animate-pulse">Closing...</span>
                                ) : (
                                  'Market'
                                )}
                              </button>
                              {/* AI Close */}
                              <button
                                onClick={() => handleAiClose(pos)}
                                disabled={aiClosingPositionId === pos.id}
                                className="px-2 py-1 rounded text-[9px] font-medium bg-[var(--cl-fill-accent)] border border-[var(--cl-accent-border)] text-[var(--cl-accent)] hover:bg-[var(--cl-fill-accent-hover)] transition-colors disabled:opacity-50"
                                title="AI-optimized limit close"
                              >
                                {aiClosingPositionId === pos.id ? (
                                  <span className="flex items-center gap-1">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                                    </svg>
                                    AI...
                                  </span>
                                ) : (
                                  'AI Limit'
                                )}
                              </button>
                            </div>
                            {/* AI Close result */}
                            {aiCloseResult && aiClosingPositionId === null && (
                              <div className="mt-1 text-[8px] text-[var(--cl-accent)] text-center">
                                Limit @ ${aiCloseResult.price}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* --- History Tab --- */}
          {tab === 'history' && (
            <div className="h-full overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-2 text-[11px] text-[var(--cl-text-secondary)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Loading trade history...
                  </div>
                </div>
              ) : roundTrips.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[11px] text-[var(--cl-text-secondary)] opacity-40">
                  No completed round-trip trades found
                </div>
              ) : (
                <div className="space-y-0">
                  {/* Daily P&L summary cards */}
                  {dailyPnl.length > 0 && (
                    <div className="px-2 py-1.5 flex gap-2 overflow-x-auto border-b border-[var(--cl-border-subtle)]">
                      {dailyPnl.slice(0, 7).map(day => (
                        <div
                          key={day.date}
                          className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg border ${
                            day.pnl >= 0
                              ? 'border-[var(--cl-success-border)] bg-[var(--cl-fill-success-subtle)]'
                              : 'border-[var(--cl-error-border)] bg-[var(--cl-fill-error-subtle)]'
                          }`}
                        >
                          <div className="text-[8px] text-[var(--cl-text-secondary)]">{day.date}</div>
                          <div className={`text-[11px] font-semibold font-mono ${pnlColor(day.pnl)}`}>
                            {day.pnl >= 0 ? '+' : ''}${formatUsd(day.pnl)}
                          </div>
                          <div className="text-[8px] text-[var(--cl-text-secondary)]">
                            {day.trades} trades • {day.wins}W/{day.losses}L
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Round-trip trade list */}
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-[var(--cl-bg-sidebar)]">
                      <tr className="text-[var(--cl-text-secondary)] text-left border-b border-[var(--cl-border-subtle)]">
                        <th className="py-1.5 px-2 font-medium">Symbol</th>
                        <th className="py-1.5 px-2 font-medium">Side</th>
                        <th className="py-1.5 px-2 font-medium text-right">Entry</th>
                        <th className="py-1.5 px-2 font-medium text-right">Exit</th>
                        <th className="py-1.5 px-2 font-medium text-right">Size</th>
                        <th className="py-1.5 px-2 font-medium text-right">P&L</th>
                        <th className="py-1.5 px-2 font-medium text-right">%</th>
                        <th className="py-1.5 px-2 font-medium text-right">Fees</th>
                        <th className="py-1.5 px-2 font-medium text-right">Duration</th>
                        <th className="py-1.5 px-2 font-medium text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roundTrips.map((rt, i) => (
                        <tr key={`${rt.symbol}-${rt.exitTime}-${i}`} className={`border-b border-[var(--cl-border-subtle)] hover:bg-[var(--cl-fill-hover)] transition-colors ${pnlBg(rt.pnl)}`}>
                          <td className="py-1.5 px-2 font-medium text-[var(--cl-text-primary)]">
                            {rt.symbol.replace('/USDT:USDT', '')}
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={`text-[9px] font-semibold uppercase ${
                              rt.side === 'long' ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'
                            }`}>
                              {rt.side}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-[var(--cl-text-faint)]">{formatPrice(rt.entryPrice)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-[var(--cl-text-primary)]">{formatPrice(rt.exitPrice)}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-[var(--cl-text-faint)]">{rt.size.toLocaleString()}</td>
                          <td className={`py-1.5 px-2 text-right font-mono font-semibold ${pnlColor(rt.pnl)}`}>
                            {rt.pnl >= 0 ? '+' : ''}${formatUsd(rt.pnl)}
                          </td>
                          <td className={`py-1.5 px-2 text-right font-mono ${pnlColor(rt.pnlPercent)}`}>
                            {rt.pnlPercent >= 0 ? '+' : ''}{rt.pnlPercent.toFixed(2)}%
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-[var(--cl-text-secondary)]">${formatUsd(rt.fees)}</td>
                          <td className="py-1.5 px-2 text-right text-[var(--cl-text-secondary)]">{formatDuration(rt.holdDuration)}</td>
                          <td className="py-1.5 px-2 text-right text-[var(--cl-text-secondary)]">
                            {new Date(rt.exitTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* --- Stats Tab --- */}
          {tab === 'stats' && (
            <div className="h-full overflow-y-auto p-3">
              <div className="grid grid-cols-4 gap-3">
                {/* Total P&L */}
                <div className="glass-card p-3">
                  <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-1">Realized P&L</div>
                  <div className={`text-lg font-bold font-mono ${pnlColor(totalRealizedPnl)}`}>
                    {totalRealizedPnl >= 0 ? '+' : ''}${formatUsd(totalRealizedPnl)}
                  </div>
                </div>

                {/* Win Rate */}
                <div className="glass-card p-3">
                  <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-1">Win Rate</div>
                  <div className={`text-lg font-bold font-mono ${winRate >= 50 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                    {winRate.toFixed(1)}%
                  </div>
                  <div className="text-[9px] text-[var(--cl-text-secondary)] mt-0.5">
                    {wins.length}W / {losses.length}L of {roundTrips.length}
                  </div>
                </div>

                {/* Profit Factor */}
                <div className="glass-card p-3">
                  <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-1">Profit Factor</div>
                  <div className={`text-lg font-bold font-mono ${profitFactor >= 1 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                    {profitFactor.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-[var(--cl-text-secondary)] mt-0.5">
                    Avg W: ${formatUsd(avgWin)} / Avg L: ${formatUsd(Math.abs(avgLoss))}
                  </div>
                </div>

                {/* Fees */}
                <div className="glass-card p-3">
                  <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-1">Total Fees</div>
                  <div className="text-lg font-bold font-mono text-[var(--cl-warning)]">
                    ${formatUsd(totalFees)}
                  </div>
                  <div className="text-[9px] text-[var(--cl-text-secondary)] mt-0.5">
                    {allTrades.length} fills total
                  </div>
                </div>
              </div>

              {/* Daily P&L bars */}
              {dailyPnl.length > 0 && (
                <div className="mt-3">
                  <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">Daily P&L</div>
                  <div className="flex items-end gap-1 h-16">
                    {(() => {
                      const days14 = dailyPnl.slice(0, 14);
                      const maxPnl = Math.max(...days14.map(d => Math.abs(d.pnl)));
                      return days14.reverse().map(day => {
                      const barHeight = maxPnl > 0 ? (Math.abs(day.pnl) / maxPnl) * 100 : 0;
                      return (
                        <div
                          key={day.date}
                          className="flex-1 flex flex-col items-center justify-end"
                          title={`${day.date}: ${day.pnl >= 0 ? '+' : ''}$${formatUsd(day.pnl)}`}
                        >
                          <div
                            className={`w-full rounded-t transition-all ${
                              day.pnl >= 0 ? 'bg-[var(--cl-success)]' : 'bg-[var(--cl-error)]'
                            }`}
                            style={{ height: `${Math.max(barHeight, 4)}%`, minHeight: '2px', opacity: 0.7 }}
                          />
                          <div className="text-[7px] text-[var(--cl-text-secondary)] mt-0.5 truncate w-full text-center">
                            {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                      );
                    });
                    })()}
                  </div>
                </div>
              )}

              {/* Round-trip summary by symbol */}
              {roundTrips.length > 0 && (
                <div className="mt-3">
                  <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">By Symbol</div>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(
                      roundTrips.reduce<Record<string, { pnl: number; count: number; wins: number }>>((acc, rt) => {
                        const sym = rt.symbol.replace('/USDT:USDT', '');
                        if (!acc[sym]) acc[sym] = { pnl: 0, count: 0, wins: 0 };
                        acc[sym].pnl += rt.pnl;
                        acc[sym].count++;
                        if (rt.pnl >= 0) acc[sym].wins++;
                        return acc;
                      }, {})
                    ).map(([sym, data]) => (
                      <div key={sym} className="flex items-center justify-between px-2 py-1.5 rounded border border-[var(--cl-border-subtle)] bg-[var(--cl-fill-control)]">
                        <span className="text-[10px] font-medium text-[var(--cl-text-primary)]">{sym}</span>
                        <div className="text-right">
                          <div className={`text-[10px] font-mono font-semibold ${pnlColor(data.pnl)}`}>
                            {data.pnl >= 0 ? '+' : ''}${formatUsd(data.pnl)}
                          </div>
                          <div className="text-[8px] text-[var(--cl-text-secondary)]">
                            {data.count} trades • {((data.wins / data.count) * 100).toFixed(0)}% WR
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
