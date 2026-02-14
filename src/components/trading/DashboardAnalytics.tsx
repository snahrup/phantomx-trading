'use client';

import { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatUsd } from '@/lib/format';
import type { Trade, EquitySnapshot, AgentStatus, JournalEntry, AutopilotClosedTrade } from '@/types/trading';

// ============================================================================
// PhantomX — Dashboard Analytics
// Full-page analytics view with equity curve, PnL distribution, agent intel,
// and trade performance metrics. The window into everything the engine does.
// ============================================================================

// --- Types ---

interface RoundTrip {
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

// --- Helpers ---

function pnlColor(n: number): string {
  return n >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]';
}

function groupRoundTrips(trades: Trade[]): RoundTrip[] {
  if (!trades.length) return [];
  const bySymbol: Record<string, Trade[]> = {};
  for (const t of trades) (bySymbol[t.symbol] ??= []).push(t);

  const roundTrips: RoundTrip[] = [];
  for (const [symbol, fills] of Object.entries(bySymbol)) {
    const sorted = [...fills].sort((a, b) => a.timestamp - b.timestamp);
    let position = 0, entryAvg = 0, entryTime = 0, entryFees = 0;

    for (const fill of sorted) {
      const qty = fill.side === 'buy' ? fill.amount : -fill.amount;
      const prevPos = position;
      const fee = fill.fee?.cost ?? 0;

      if (position === 0) {
        position = qty; entryAvg = fill.price; entryTime = fill.timestamp; entryFees = fee;
      } else if (Math.sign(prevPos + qty) !== Math.sign(prevPos) || prevPos + qty === 0) {
        const closeSize = Math.min(Math.abs(qty), Math.abs(prevPos));
        const side = prevPos > 0 ? 'long' : 'short';
        const pnl = side === 'long'
          ? (fill.price - entryAvg) * closeSize
          : (entryAvg - fill.price) * closeSize;
        const totalFees = entryFees + fee;
        roundTrips.push({
          symbol, side, entryPrice: entryAvg, exitPrice: fill.price, size: closeSize,
          entryTime, exitTime: fill.timestamp, pnl: pnl - totalFees,
          pnlPercent: entryAvg > 0 ? ((fill.price - entryAvg) / entryAvg) * 100 * (side === 'long' ? 1 : -1) : 0,
          fees: totalFees, holdDuration: fill.timestamp - entryTime,
        });
        position = prevPos + qty;
        if (position !== 0) { entryAvg = fill.price; entryTime = fill.timestamp; entryFees = 0; }
      } else {
        const newTotal = Math.abs(position) * entryAvg + Math.abs(qty) * fill.price;
        position += qty;
        entryAvg = position !== 0 ? newTotal / Math.abs(position) : 0;
        entryFees += fee;
      }
    }
  }
  return roundTrips.sort((a, b) => b.exitTime - a.exitTime);
}

function calculateDailyPnl(roundTrips: RoundTrip[]): DailyPnl[] {
  const byDate: Record<string, DailyPnl> = {};
  for (const rt of roundTrips) {
    const date = new Date(rt.exitTime).toLocaleDateString();
    if (!byDate[date]) byDate[date] = { date, pnl: 0, trades: 0, wins: 0, losses: 0 };
    byDate[date].pnl += rt.pnl;
    byDate[date].trades++;
    if (rt.pnl >= 0) byDate[date].wins++; else byDate[date].losses++;
  }
  return Object.values(byDate).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// SVG path builder for area chart
function buildAreaPath(points: { x: number; y: number }[], width: number, height: number): { line: string; area: string } {
  if (points.length < 2) return { line: '', area: '' };
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;
  return { line, area };
}

// --- Metric Card ---

function MetricCard({ label, value, subtext, color }: { label: string; value: string; subtext?: string; color?: string }) {
  return (
    <div className="glass-card p-4 flex flex-col gap-1">
      <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-xl font-bold font-mono ${color || 'text-[var(--cl-text-primary)]'}`}>{value}</div>
      {subtext && <div className="text-[10px] text-[var(--cl-text-secondary)]">{subtext}</div>}
    </div>
  );
}

// --- Equity Curve Chart (SVG) ---

function EquityCurve({ snapshots, autopilotTrades }: { snapshots: EquitySnapshot[]; autopilotTrades: AutopilotClosedTrade[] }) {
  const width = 600;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 20, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Combine equity snapshots + build cumulative autopilot PnL
  const data = useMemo(() => {
    if (snapshots.length >= 2) return snapshots;
    // Fallback: reconstruct from autopilot closed trades
    if (autopilotTrades.length >= 2) {
      let cumPnl = 0;
      return autopilotTrades
        .sort((a, b) => a.closedAt - b.closedAt)
        .map(t => {
          cumPnl += t.realizedPnl;
          return { timestamp: t.closedAt, equity: cumPnl, unrealizedPnl: 0, positionCount: 0 };
        });
    }
    return [];
  }, [snapshots, autopilotTrades]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-[var(--cl-text-secondary)] opacity-40">
        Equity data will appear after a few polling cycles
      </div>
    );
  }

  const minEq = Math.min(...data.map(d => d.equity));
  const maxEq = Math.max(...data.map(d => d.equity));
  const range = maxEq - minEq || 1;
  const minT = data[0].timestamp;
  const maxT = data[data.length - 1].timestamp;
  const tRange = maxT - minT || 1;

  const points = data.map(d => ({
    x: padding.left + ((d.timestamp - minT) / tRange) * chartW,
    y: padding.top + chartH - ((d.equity - minEq) / range) * chartH,
  }));

  const { line, area } = buildAreaPath(points, width, height);
  const isPositive = data[data.length - 1].equity >= data[0].equity;
  const strokeColor = isPositive ? 'var(--cl-success)' : 'var(--cl-error)';
  const fillColor = isPositive ? 'var(--cl-success)' : 'var(--cl-error)';

  // Y-axis labels
  const yLabels = [minEq, minEq + range * 0.5, maxEq].map(v => ({
    label: `$${formatUsd(v)}`,
    y: padding.top + chartH - ((v - minEq) / range) * chartH,
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yLabels.map((yl, i) => (
        <g key={i}>
          <line x1={padding.left} y1={yl.y} x2={width - padding.right} y2={yl.y}
            stroke="var(--cl-border-subtle)" strokeWidth="0.5" strokeDasharray="4 4" />
          <text x={padding.left - 4} y={yl.y + 3} textAnchor="end"
            className="text-[8px] fill-[var(--cl-text-secondary)]" fontFamily="monospace">{yl.label}</text>
        </g>
      ))}
      {/* Area fill */}
      <path d={area} fill={fillColor} opacity="0.08" />
      {/* Line */}
      <path d={line} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Endpoint dot */}
      {points.length > 0 && (
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="3"
          fill={strokeColor} stroke="var(--cl-bg-surface)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

// --- Daily PnL Bar Chart (SVG) ---

function DailyPnlChart({ dailyPnl }: { dailyPnl: DailyPnl[] }) {
  const width = 500;
  const height = 160;
  const padding = { top: 10, right: 10, bottom: 28, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const days = useMemo(() => dailyPnl.slice(0, 21).reverse(), [dailyPnl]);

  if (days.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[11px] text-[var(--cl-text-secondary)] opacity-40">
        No daily PnL data yet
      </div>
    );
  }

  const maxAbs = Math.max(...days.map(d => Math.abs(d.pnl)), 1);
  const barW = Math.max(chartW / days.length - 2, 4);
  const zeroY = padding.top + chartH / 2;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {/* Zero line */}
      <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY}
        stroke="var(--cl-border)" strokeWidth="0.5" />
      {/* Bars */}
      {days.map((day, i) => {
        const barH = (Math.abs(day.pnl) / maxAbs) * (chartH / 2);
        const x = padding.left + (i / days.length) * chartW + 1;
        const y = day.pnl >= 0 ? zeroY - barH : zeroY;
        const fill = day.pnl >= 0 ? 'var(--cl-success)' : 'var(--cl-error)';
        return (
          <g key={day.date}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill={fill} opacity="0.7" rx="1" />
            {/* Date label — show every 3rd or if < 10 days */}
            {(days.length <= 10 || i % 3 === 0) && (
              <text x={x + barW / 2} y={height - 4} textAnchor="middle"
                className="text-[7px] fill-[var(--cl-text-secondary)]" fontFamily="monospace">
                {new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </text>
            )}
          </g>
        );
      })}
      {/* Y-axis labels */}
      <text x={padding.left - 4} y={padding.top + 8} textAnchor="end"
        className="text-[8px] fill-[var(--cl-text-secondary)]" fontFamily="monospace">+${formatUsd(maxAbs)}</text>
      <text x={padding.left - 4} y={zeroY + 3} textAnchor="end"
        className="text-[8px] fill-[var(--cl-text-secondary)]" fontFamily="monospace">$0</text>
      <text x={padding.left - 4} y={height - padding.bottom + 4} textAnchor="end"
        className="text-[8px] fill-[var(--cl-text-secondary)]" fontFamily="monospace">-${formatUsd(maxAbs)}</text>
    </svg>
  );
}

// --- Agent Status Card ---

function AgentCard({ agent }: { agent: AgentStatus }) {
  const stateColor: Record<string, string> = {
    running: 'var(--cl-success)',
    idle: 'var(--cl-warning)',
    error: 'var(--cl-error)',
    stopped: 'var(--cl-text-secondary)',
  };
  const sentimentIcon: Record<string, string> = {
    bullish: '\u25B2', // ▲
    bearish: '\u25BC', // ▼
    neutral: '\u25CF', // ●
  };
  const sentimentColor: Record<string, string> = {
    bullish: 'text-[var(--cl-success)]',
    bearish: 'text-[var(--cl-error)]',
    neutral: 'text-[var(--cl-warning)]',
  };

  return (
    <div className="glass-card p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stateColor[agent.state] }} />
          <span className="text-[11px] font-semibold text-[var(--cl-text-primary)]">{agent.name}</span>
        </div>
        <span className="text-[9px] text-[var(--cl-text-secondary)] font-mono">{agent.tickCount} ticks</span>
      </div>
      {agent.latestSignal ? (
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${sentimentColor[agent.latestSignal.sentiment]}`}>
            {sentimentIcon[agent.latestSignal.sentiment]}
          </span>
          <span className="text-[10px] text-[var(--cl-text-faint)] flex-1 line-clamp-2">
            {agent.latestSignal.summary}
          </span>
          <span className="text-[9px] font-mono text-[var(--cl-accent)]">
            {agent.latestSignal.confidence}%
          </span>
        </div>
      ) : (
        <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40">Awaiting first signal...</div>
      )}
    </div>
  );
}

// --- Symbol Performance ---

function SymbolPerformance({ roundTrips }: { roundTrips: RoundTrip[] }) {
  const bySymbol = useMemo(() => {
    const map: Record<string, { pnl: number; count: number; wins: number }> = {};
    for (const rt of roundTrips) {
      const sym = rt.symbol.replace('/USDT:USDT', '');
      if (!map[sym]) map[sym] = { pnl: 0, count: 0, wins: 0 };
      map[sym].pnl += rt.pnl;
      map[sym].count++;
      if (rt.pnl >= 0) map[sym].wins++;
    }
    return Object.entries(map).sort((a, b) => b[1].pnl - a[1].pnl);
  }, [roundTrips]);

  if (bySymbol.length === 0) return null;

  const maxPnl = Math.max(...bySymbol.map(([, d]) => Math.abs(d.pnl)), 1);

  return (
    <div className="space-y-1.5">
      {bySymbol.slice(0, 8).map(([sym, data]) => (
        <div key={sym} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)]">
          <span className="text-[11px] font-semibold text-[var(--cl-text-primary)] w-14">{sym}</span>
          <div className="flex-1 h-2 bg-[var(--cl-fill-hover)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${data.pnl >= 0 ? 'bg-[var(--cl-success)]' : 'bg-[var(--cl-error)]'}`}
              style={{ width: `${(Math.abs(data.pnl) / maxPnl) * 100}%`, opacity: 0.7 }}
            />
          </div>
          <span className={`text-[10px] font-mono font-semibold w-16 text-right ${pnlColor(data.pnl)}`}>
            {data.pnl >= 0 ? '+' : ''}${formatUsd(data.pnl)}
          </span>
          <span className="text-[9px] text-[var(--cl-text-secondary)] w-20 text-right">
            {data.count}T &middot; {Math.round((data.wins / data.count) * 100)}% WR
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Recent Journal Feed ---

function JournalFeed({ entries }: { entries: JournalEntry[] }) {
  const recent = useMemo(() => entries.slice(-8).reverse(), [entries]);

  if (recent.length === 0) {
    return <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40 text-center py-4">No journal entries yet</div>;
  }

  const typeIcons: Record<string, string> = {
    scan: '\uD83D\uDD0D',      // 🔍
    analysis: '\uD83E\uDDE0',   // 🧠
    decision: '\u26A1',          // ⚡
    trade: '\uD83D\uDCB0',      // 💰
    close: '\u2705',             // ✅
    skip: '\u23ED',              // ⏭
    kill: '\uD83D\uDED1',       // 🛑
    session_start: '\uD83D\uDE80', // 🚀
    session_end: '\uD83C\uDFC1',   // 🏁
    summary: '\uD83D\uDCCB',      // 📋
  };

  return (
    <div className="space-y-1">
      {recent.map(entry => (
        <div key={entry.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--cl-fill-hover)] transition-colors">
          <span className="text-sm flex-shrink-0 mt-0.5">{typeIcons[entry.type] || '\u25CF'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[var(--cl-text-faint)] line-clamp-2">{entry.reason}</div>
            <div className="flex items-center gap-2 mt-0.5">
              {entry.symbol && <span className="text-[9px] font-mono text-[var(--cl-accent)]">{entry.symbol.replace('/USDT:USDT', '')}</span>}
              {entry.pnl !== undefined && entry.pnl !== null && (
                <span className={`text-[9px] font-mono font-semibold ${pnlColor(entry.pnl)}`}>
                  {entry.pnl >= 0 ? '+' : ''}${formatUsd(entry.pnl)}
                </span>
              )}
              <span className="text-[8px] text-[var(--cl-text-secondary)]">
                {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export default memo(function DashboardAnalytics() {
  const isConnected = useTradingStore(s => s.isConnected);
  const positions = useTradingStore(s => s.positions);
  const accountValue = useTradingStore(s => s.accountValue);
  const agentStatuses = useTradingStore(s => s.agentStatuses);
  const signalConsensus = useTradingStore(s => s.signalConsensus);
  const journalEntries = useTradingStore(s => s.journalEntries);
  const equitySnapshots = useTradingStore(s => s.equitySnapshots);
  const autopilotClosedTrades = useTradingStore(s => s.autopilotClosedTrades);
  const autopilotCumulativePnl = useTradingStore(s => s.autopilotCumulativePnl);
  const selectedSymbol = useTradingStore(s => s.selectedSymbol);
  const isKilled = useTradingStore(s => s.isKilled);
  const isExecuting = useTradingStore(s => s.isExecuting);
  const isPaused = useTradingStore(s => s.isPaused);

  // Local trade history state (same as TradeAnalytics)
  const [roundTrips, setRoundTrips] = useState<RoundTrip[]>([]);
  const [dailyPnl, setDailyPnl] = useState<DailyPnl[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Fetch trade history
  const fetchTradeHistory = useCallback(async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      const posSymbols = positions.map(p => p.symbol);
      const symbols = [...new Set([selectedSymbol, ...posSymbols])];

      const closedRes = await fetch('/api/phemex', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'closed_orders', symbol: selectedSymbol, limit: 50 }),
      });
      const closedData = await closedRes.json();
      if (closedData.orders) {
        for (const o of closedData.orders) {
          if (o.symbol && !symbols.includes(o.symbol)) symbols.push(o.symbol);
        }
      }

      const tradeResults = await Promise.allSettled(
        symbols.map(sym =>
          fetch('/api/phemex', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'trades', symbol: sym, limit: 100 }),
          }).then(res => res.json())
        )
      );
      const allFills: Trade[] = [];
      for (const result of tradeResults) {
        if (result.status === 'fulfilled' && result.value.trades) allFills.push(...result.value.trades);
      }

      const seen = new Set<string>();
      const deduped = allFills.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });

      const rts = groupRoundTrips(deduped);
      setRoundTrips(rts);
      setDailyPnl(calculateDailyPnl(rts));
    } catch (err) {
      console.error('Dashboard trade history fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, positions, selectedSymbol]);

  useEffect(() => {
    if (isConnected && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchTradeHistory();
    }
  }, [isConnected, fetchTradeHistory]);

  // Computed stats — prefer autopilot tracked trades when available (more accurate: has leverage,
  // tracks in real-time, no partial-history issues). Fall back to exchange round-trip fills otherwise.
  const stats = useMemo(() => {
    const useAutopilot = autopilotClosedTrades.length > 0;

    if (useAutopilot) {
      const wins = autopilotClosedTrades.filter(t => t.realizedPnl >= 0);
      const losses = autopilotClosedTrades.filter(t => t.realizedPnl < 0);
      const totalPnl = autopilotCumulativePnl;
      const winRate = autopilotClosedTrades.length > 0 ? (wins.length / autopilotClosedTrades.length) * 100 : 0;
      const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.realizedPnl, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.realizedPnl, 0) / losses.length : 0;
      const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0;
      const totalFees = roundTrips.reduce((s, r) => s + r.fees, 0); // fees still from exchange
      const avgHold = autopilotClosedTrades.length > 0
        ? autopilotClosedTrades.reduce((s, t) => s + t.holdDuration, 0) / autopilotClosedTrades.length : 0;

      // Today's PnL from autopilot trades
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayTrades = autopilotClosedTrades.filter(t => t.closedAt >= todayStart.getTime());
      const todayPnl = todayTrades.reduce((s, t) => s + t.realizedPnl, 0);

      return { totalPnl, wins: wins.length, losses: losses.length, winRate, avgWin, avgLoss, profitFactor, totalFees, avgHold, todayPnl, todayTrades: todayTrades.length };
    }

    // Fallback: exchange round-trip fills
    const totalPnl = roundTrips.reduce((s, r) => s + r.pnl, 0);
    const wins = roundTrips.filter(r => r.pnl >= 0);
    const losses = roundTrips.filter(r => r.pnl < 0);
    const winRate = roundTrips.length > 0 ? (wins.length / roundTrips.length) * 100 : 0;
    const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + r.pnl, 0) / losses.length : 0;
    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length) / Math.abs(avgLoss * losses.length) : 0;
    const totalFees = roundTrips.reduce((s, r) => s + r.fees, 0);
    const avgHold = roundTrips.length > 0 ? roundTrips.reduce((s, r) => s + r.holdDuration, 0) / roundTrips.length : 0;

    const todayStr = new Date().toLocaleDateString();
    const todayData = dailyPnl.find(d => d.date === todayStr);
    const todayPnl = todayData?.pnl ?? 0;
    const todayTrades = todayData?.trades ?? 0;

    return { totalPnl, wins: wins.length, losses: losses.length, winRate, avgWin, avgLoss, profitFactor, totalFees, avgHold, todayPnl, todayTrades };
  }, [roundTrips, dailyPnl, autopilotClosedTrades, autopilotCumulativePnl]);

  const realizedPnl = stats.totalPnl;

  // Unrealized PnL
  const unrealizedPnl = useMemo(() => positions.reduce((s, p) => s + p.unrealizedPnl, 0), [positions]);

  // Agent summary
  const agentsOnline = agentStatuses.filter(a => a.state === 'running').length;
  const consensusSentiment = signalConsensus?.consensusSentiment || 'neutral';
  const consensusConfidence = signalConsensus?.consensusConfidence || 0;

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center opacity-30">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--cl-accent)" strokeWidth="1" className="mx-auto mb-4">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" /><line x1="13" y1="15" x2="17" y2="15" />
            <line x1="13" y1="12" x2="17" y2="12" />
          </svg>
          <p className="text-sm text-[var(--cl-text-secondary)]">Connect to Phemex to view analytics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* --- Row 1: Key Metrics --- */}
      <div className="grid grid-cols-6 gap-3">
        <MetricCard
          label="Account Equity"
          value={`$${formatUsd(accountValue)}`}
          subtext={`${positions.length} position${positions.length !== 1 ? 's' : ''} open`}
        />
        <MetricCard
          label="Unrealized PnL"
          value={`${unrealizedPnl >= 0 ? '+' : ''}$${formatUsd(unrealizedPnl)}`}
          color={pnlColor(unrealizedPnl)}
        />
        <MetricCard
          label="Today's PnL"
          value={`${stats.todayPnl >= 0 ? '+' : ''}$${formatUsd(stats.todayPnl)}`}
          subtext={`${stats.todayTrades} trades today`}
          color={pnlColor(stats.todayPnl)}
        />
        <MetricCard
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
          subtext={`${stats.wins}W / ${stats.losses}L of ${roundTrips.length}`}
          color={stats.winRate >= 50 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}
        />
        <MetricCard
          label="Profit Factor"
          value={stats.profitFactor.toFixed(2)}
          subtext={`Avg W: $${formatUsd(stats.avgWin)} / L: $${formatUsd(Math.abs(stats.avgLoss))}`}
          color={stats.profitFactor >= 1 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}
        />
        <MetricCard
          label="Agents Online"
          value={`${agentsOnline}/${agentStatuses.length}`}
          subtext={`Consensus: ${consensusSentiment} (${consensusConfidence}%)`}
          color={agentsOnline === agentStatuses.length && agentsOnline > 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-warning)]'}
        />
      </div>

      {/* --- Row 2: Status Banner --- */}
      <div className={`flex items-center justify-between px-4 py-2 rounded-lg border ${
        isKilled
          ? 'bg-[var(--cl-fill-error)] border-[var(--cl-error-border)]'
          : isExecuting
            ? isPaused
              ? 'bg-[var(--cl-fill-warning)] border-[var(--cl-warning-border)]'
              : 'bg-[var(--cl-fill-success-subtle)] border-[var(--cl-success-border)]'
            : 'bg-[var(--cl-fill-control)] border-[var(--cl-border)]'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`status-dot ${isKilled ? 'killed' : isExecuting ? (isPaused ? 'paused' : 'live') : 'disconnected'}`} />
          <span className="text-[12px] font-semibold text-[var(--cl-text-primary)]">
            {isKilled ? 'KILL SWITCH ACTIVATED' : isExecuting ? (isPaused ? 'AUTOPILOT PAUSED' : 'AUTOPILOT ACTIVE') : 'MANUAL MODE'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-[var(--cl-text-secondary)]">
            Realized: <span className={`font-mono font-semibold ${pnlColor(realizedPnl)}`}>
              {realizedPnl >= 0 ? '+' : ''}${formatUsd(realizedPnl)}
            </span>
          </span>
          <span className="text-[var(--cl-text-secondary)]">
            Fees: <span className="font-mono text-[var(--cl-warning)]">${formatUsd(stats.totalFees)}</span>
          </span>
          {autopilotClosedTrades.length > 0 && (
            <span className="text-[var(--cl-text-secondary)]">
              Autopilot: <span className="font-mono text-[var(--cl-accent)]">{autopilotClosedTrades.length} trades</span>
            </span>
          )}
        </div>
      </div>

      {/* --- Row 3: Charts --- */}
      <div className="grid grid-cols-2 gap-3">
        {/* Equity Curve */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">Equity Curve</span>
            <span className="text-[9px] text-[var(--cl-text-secondary)]">
              {equitySnapshots.length} snapshots
            </span>
          </div>
          <div className="h-[180px]">
            <EquityCurve snapshots={equitySnapshots} autopilotTrades={autopilotClosedTrades} />
          </div>
        </div>

        {/* Daily PnL Distribution */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">Daily P&L</span>
            <span className="text-[9px] text-[var(--cl-text-secondary)]">
              Last {Math.min(dailyPnl.length, 21)} days
            </span>
          </div>
          <div className="h-[180px]">
            <DailyPnlChart dailyPnl={dailyPnl} />
          </div>
        </div>
      </div>

      {/* --- Row 4: Agent Intelligence + Symbol Performance --- */}
      <div className="grid grid-cols-2 gap-3">
        {/* Agent Grid */}
        <div className="glass-card p-3">
          <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium mb-2">
            Agent Intelligence Network
          </div>
          {agentStatuses.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {agentStatuses.map(agent => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40 text-center py-6">
              Start agents from the Intel tab to see signals here
            </div>
          )}
        </div>

        {/* Symbol Performance */}
        <div className="glass-card p-3">
          <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium mb-2">
            Symbol Performance
          </div>
          {roundTrips.length > 0 ? (
            <SymbolPerformance roundTrips={roundTrips} />
          ) : (
            <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40 text-center py-6">
              {isLoading ? 'Loading trade history...' : 'No round-trip trades yet'}
            </div>
          )}
        </div>
      </div>

      {/* --- Row 5: Journal Feed + Trade Summary --- */}
      <div className="grid grid-cols-2 gap-3">
        {/* Recent Journal */}
        <div className="glass-card p-3">
          <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium mb-2">
            Decision Log
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            <JournalFeed entries={journalEntries} />
          </div>
        </div>

        {/* Trade Performance Summary */}
        <div className="glass-card p-3">
          <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium mb-3">
            Performance Summary
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Total Trades</span>
              <span className="font-mono text-[var(--cl-text-primary)]">{roundTrips.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Autopilot Trades</span>
              <span className="font-mono text-[var(--cl-accent)]">{autopilotClosedTrades.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Realized PnL</span>
              <span className={`font-mono font-semibold ${pnlColor(stats.totalPnl)}`}>
                {stats.totalPnl >= 0 ? '+' : ''}${formatUsd(stats.totalPnl)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Autopilot PnL</span>
              <span className={`font-mono font-semibold ${pnlColor(autopilotCumulativePnl)}`}>
                {autopilotCumulativePnl >= 0 ? '+' : ''}${formatUsd(autopilotCumulativePnl)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Best Trade</span>
              <span className="font-mono text-[var(--cl-success)]">
                {roundTrips.length > 0 ? `+$${formatUsd(Math.max(...roundTrips.map(r => r.pnl)))}` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Worst Trade</span>
              <span className="font-mono text-[var(--cl-error)]">
                {roundTrips.length > 0 ? `-$${formatUsd(Math.abs(Math.min(...roundTrips.map(r => r.pnl))))}` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Total Fees</span>
              <span className="font-mono text-[var(--cl-warning)]">${formatUsd(stats.totalFees)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Avg Hold Time</span>
              <span className="font-mono text-[var(--cl-text-faint)]">
                {stats.avgHold > 0
                  ? stats.avgHold < 3600000
                    ? `${Math.round(stats.avgHold / 60000)}m`
                    : `${(stats.avgHold / 3600000).toFixed(1)}h`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Symbols Traded</span>
              <span className="font-mono text-[var(--cl-text-primary)]">
                {new Set(roundTrips.map(r => r.symbol)).size}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--cl-text-secondary)]">Journal Entries</span>
              <span className="font-mono text-[var(--cl-text-primary)]">{journalEntries.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
