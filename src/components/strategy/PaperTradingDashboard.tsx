'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type {
  PaperTradingState,
  ResearchPaperTrade,
  AIJournalEntry,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// SVG Equity Curve
// ---------------------------------------------------------------------------
function EquityCurve({
  trades,
  startingBalance,
}: {
  trades: ResearchPaperTrade[];
  startingBalance: number;
}) {
  const closedTrades = trades
    .filter(t => t.status === 'closed' && t.exitTimestamp)
    .sort((a, b) => (a.exitTimestamp ?? 0) - (b.exitTimestamp ?? 0));

  if (closedTrades.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
        Need at least 2 closed trades to draw equity curve
      </div>
    );
  }

  // Build equity points
  const points: { x: number; y: number; trade: ResearchPaperTrade }[] = [];
  let equity = startingBalance;

  // Start point
  points.push({ x: 0, y: equity, trade: closedTrades[0] });

  closedTrades.forEach((t, i) => {
    equity += t.realizedPnl ?? 0;
    points.push({ x: i + 1, y: equity, trade: t });
  });

  const minY = Math.min(...points.map(p => p.y)) * 0.995;
  const maxY = Math.max(...points.map(p => p.y)) * 1.005;
  const rangeY = maxY - minY || 1;
  const maxX = points.length - 1 || 1;

  const W = 600;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 24, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const toSvg = (x: number, y: number) => ({
    sx: PAD.left + (x / maxX) * plotW,
    sy: PAD.top + (1 - (y - minY) / rangeY) * plotH,
  });

  // Build path
  const pathParts = points.map((p, i) => {
    const { sx, sy } = toSvg(p.x, p.y);
    return `${i === 0 ? 'M' : 'L'} ${sx.toFixed(1)} ${sy.toFixed(1)}`;
  });
  const linePath = pathParts.join(' ');

  // Fill area
  const first = toSvg(0, points[0].y);
  const last = toSvg(maxX, points[points.length - 1].y);
  const fillPath = `${linePath} L ${last.sx.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L ${first.sx.toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`;

  // Starting balance line
  const blY = toSvg(0, startingBalance).sy;

  // Color based on performance
  const finalEquity = points[points.length - 1].y;
  const isPositive = finalEquity >= startingBalance;
  const lineColor = isPositive ? '#5FB87A' : '#E05555';
  const fillColor = isPositive ? 'rgba(95, 184, 122, 0.1)' : 'rgba(224, 85, 85, 0.1)';

  // Y axis labels
  const yLabels = [minY, minY + rangeY * 0.25, minY + rangeY * 0.5, minY + rangeY * 0.75, maxY];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yLabels.map((val, i) => {
        const { sy } = toSvg(0, val);
        return (
          <g key={i}>
            <line
              x1={PAD.left} y1={sy} x2={W - PAD.right} y2={sy}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1"
            />
            <text x={PAD.left - 4} y={sy + 3} textAnchor="end"
              className="fill-zinc-600" fontSize="9" fontFamily="monospace">
              ${(val / 1000).toFixed(1)}k
            </text>
          </g>
        );
      })}

      {/* Starting balance reference line */}
      <line
        x1={PAD.left} y1={blY} x2={W - PAD.right} y2={blY}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 3"
      />

      {/* Fill area */}
      <path d={fillPath} fill={fillColor} />

      {/* Equity line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Trade dots */}
      {points.slice(1).map((p, i) => {
        const { sx, sy } = toSvg(p.x, p.y);
        const pnl = p.trade.realizedPnl ?? 0;
        return (
          <circle
            key={i}
            cx={sx} cy={sy} r="3"
            fill={pnl >= 0 ? '#5FB87A' : '#E05555'}
            stroke="#1A1A1F" strokeWidth="1"
          />
        );
      })}

      {/* X axis label */}
      <text x={W / 2} y={H - 2} textAnchor="middle"
        className="fill-zinc-600" fontSize="9">
        {closedTrades.length} trades
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stats Grid
// ---------------------------------------------------------------------------
function StatsGrid({ state }: { state: PaperTradingState }) {
  const metrics = [
    {
      label: 'Equity',
      value: `$${state.currentEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      color: state.currentEquity >= state.virtualBalance ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Total P&L',
      value: `${state.totalPnl >= 0 ? '+' : ''}$${state.totalPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      color: state.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Win Rate',
      value: state.totalTrades > 0
        ? `${((state.winCount / state.totalTrades) * 100).toFixed(1)}%`
        : '—',
      color: state.totalTrades > 0 && state.winCount / state.totalTrades >= 0.5
        ? 'text-emerald-400' : 'text-zinc-400',
    },
    {
      label: 'Profit Factor',
      value: state.profitFactor > 0 ? state.profitFactor.toFixed(2) : '—',
      color: state.profitFactor >= 1.5 ? 'text-emerald-400'
        : state.profitFactor >= 1.0 ? 'text-amber-400' : 'text-red-400',
    },
    {
      label: 'Sharpe',
      value: state.sharpeRatio !== 0 ? state.sharpeRatio.toFixed(2) : '—',
      color: state.sharpeRatio >= 1.0 ? 'text-emerald-400' : 'text-zinc-400',
    },
    {
      label: 'Max DD',
      value: `${state.maxDrawdownPercent.toFixed(1)}%`,
      color: state.maxDrawdownPercent <= 10 ? 'text-emerald-400'
        : state.maxDrawdownPercent <= 20 ? 'text-amber-400' : 'text-red-400',
    },
    {
      label: 'Trades',
      value: `${state.totalTrades} (${state.winCount}W / ${state.lossCount}L)`,
      color: 'text-zinc-300',
    },
    {
      label: 'Avg W / Avg L',
      value: state.avgWin > 0 || state.avgLoss > 0
        ? `$${state.avgWin.toFixed(0)} / $${Math.abs(state.avgLoss).toFixed(0)}`
        : '—',
      color: 'text-zinc-300',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {metrics.map(m => (
        <div key={m.label} className="p-2 rounded-md bg-white/[0.02] border border-white/5">
          <p className="text-[10px] text-zinc-500 uppercase">{m.label}</p>
          <p className={`text-sm font-semibold tabular-nums ${m.color}`}>{m.value}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open Positions
// ---------------------------------------------------------------------------
function OpenPositions({ trades }: { trades: ResearchPaperTrade[] }) {
  if (trades.length === 0) {
    return <p className="text-xs text-zinc-500 italic py-4 text-center">No open positions</p>;
  }

  return (
    <div className="space-y-2">
      {trades.map(trade => {
        const isLong = trade.direction === 'long';
        const pnlColor = trade.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400';
        const dirColor = isLong ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          : 'text-red-400 border-red-500/30 bg-red-500/10';

        return (
          <div key={trade.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] uppercase ${dirColor}`}>
                  {trade.direction}
                </Badge>
                <span className="text-sm font-medium text-zinc-200">
                  {trade.symbol.replace('/USDT:USDT', '')}
                </span>
                <span className="text-xs text-zinc-500">{trade.leverage}x</span>
              </div>
              <div className="text-right">
                <span className={`text-sm font-semibold tabular-nums ${pnlColor}`}>
                  {trade.unrealizedPnl >= 0 ? '+' : ''}${trade.unrealizedPnl.toFixed(2)}
                </span>
                <span className={`text-xs ml-1 ${pnlColor}`}>
                  ({trade.unrealizedPnlPercent >= 0 ? '+' : ''}{trade.unrealizedPnlPercent.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-[11px] text-zinc-500">
              <span>Entry <span className="text-zinc-300 font-mono">${trade.entryPrice.toLocaleString()}</span></span>
              <span>Current <span className="text-zinc-300 font-mono">${trade.currentPrice.toLocaleString()}</span></span>
              <span>SL <span className="text-red-400 font-mono">${trade.stopLoss.toLocaleString()}</span></span>
              <span>TP <span className="text-emerald-400 font-mono">${trade.takeProfit.toLocaleString()}</span></span>
              <span>Size <span className="text-zinc-300">${trade.positionSizeUsd.toLocaleString()}</span></span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-[10px] text-zinc-600">
              <span>MFE: <span className="text-emerald-500">${trade.maxFavorableExcursion.toFixed(2)}</span></span>
              <span>MAE: <span className="text-red-500">${trade.maxAdverseExcursion.toFixed(2)}</span></span>
              <span>Open {formatDuration(Date.now() - trade.entryTimestamp)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Closed Trade History Table
// ---------------------------------------------------------------------------
function TradeHistory({ trades }: { trades: ResearchPaperTrade[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const closedTrades = trades
    .filter(t => t.status === 'closed')
    .sort((a, b) => (b.exitTimestamp ?? 0) - (a.exitTimestamp ?? 0));

  if (closedTrades.length === 0) {
    return <p className="text-xs text-zinc-500 italic py-4 text-center">No closed trades yet</p>;
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="grid grid-cols-[80px_60px_80px_80px_70px_70px_60px_1fr] gap-2 px-2 text-[10px] text-zinc-500 uppercase">
        <span>Symbol</span>
        <span>Dir</span>
        <span>Entry</span>
        <span>Exit</span>
        <span className="text-right">P&L</span>
        <span className="text-right">P&L %</span>
        <span className="text-right">Hold</span>
        <span className="text-right">Exit Reason</span>
      </div>

      {closedTrades.map(trade => {
        const pnl = trade.realizedPnl ?? 0;
        const pnlPct = trade.realizedPnlPercent ?? 0;
        const pnlColor = pnl >= 0 ? 'text-emerald-400' : 'text-red-400';
        const holdTime = trade.exitTimestamp && trade.entryTimestamp
          ? trade.exitTimestamp - trade.entryTimestamp : 0;
        const isExpanded = expandedId === trade.id;

        return (
          <Collapsible key={trade.id} open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : trade.id)}>
            <CollapsibleTrigger asChild>
              <button className={`w-full grid grid-cols-[80px_60px_80px_80px_70px_70px_60px_1fr] gap-2 px-2 py-1.5 rounded text-xs hover:bg-white/[0.03] transition-colors ${
                isExpanded ? 'bg-white/[0.03]' : ''
              }`}>
                <span className="text-zinc-200 font-medium truncate">
                  {trade.symbol.replace('/USDT:USDT', '')}
                </span>
                <Badge variant="outline" className={`text-[9px] px-1 py-0 uppercase ${
                  trade.direction === 'long'
                    ? 'border-emerald-500/30 text-emerald-400'
                    : 'border-red-500/30 text-red-400'
                }`}>
                  {trade.direction}
                </Badge>
                <span className="text-zinc-400 font-mono">${trade.entryPrice.toLocaleString()}</span>
                <span className="text-zinc-400 font-mono">${(trade.exitPrice ?? 0).toLocaleString()}</span>
                <span className={`text-right font-mono font-medium ${pnlColor}`}>
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </span>
                <span className={`text-right font-mono ${pnlColor}`}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                </span>
                <span className="text-right text-zinc-500">{formatDuration(holdTime)}</span>
                <span className="text-right text-zinc-500 truncate">
                  {(trade.exitReason ?? 'unknown').replace(/_/g, ' ')}
                </span>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="px-2 pb-2 pt-1 ml-2 border-l border-white/5 space-y-2">
                <div className="grid grid-cols-4 gap-3 text-[11px]">
                  <div>
                    <span className="text-zinc-500">Size</span>
                    <p className="text-zinc-300">${trade.positionSizeUsd.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Leverage</span>
                    <p className="text-zinc-300">{trade.leverage}x</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">MFE (best)</span>
                    <p className="text-emerald-400">${trade.maxFavorableExcursion.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">MAE (worst)</span>
                    <p className="text-red-400">${trade.maxAdverseExcursion.toFixed(2)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <span className="text-zinc-500">SL</span>
                    <p className="text-red-400 font-mono">${trade.stopLoss.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">TP</span>
                    <p className="text-emerald-400 font-mono">${trade.takeProfit.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Thesis</span>
                    <p className="text-zinc-300 truncate">{trade.thesisId}</p>
                  </div>
                </div>
                {/* Money left on table indicator */}
                {trade.maxFavorableExcursion > 0 && pnl < trade.maxFavorableExcursion && (
                  <div className="text-[10px] text-amber-400/80 bg-amber-500/5 rounded px-2 py-1">
                    Left ${(trade.maxFavorableExcursion - pnl).toFixed(2)} on the table
                    (MFE was ${trade.maxFavorableExcursion.toFixed(2)} vs realized ${pnl.toFixed(2)})
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thesis Performance
// ---------------------------------------------------------------------------
function ThesisPerformance({ trades }: { trades: ResearchPaperTrade[] }) {
  const closedTrades = trades.filter(t => t.status === 'closed');

  if (closedTrades.length === 0) {
    return <p className="text-xs text-zinc-500 italic py-4 text-center">No completed trades to analyze</p>;
  }

  // Group by thesisId
  const byThesis = new Map<string, ResearchPaperTrade[]>();
  for (const t of closedTrades) {
    const existing = byThesis.get(t.thesisId) ?? [];
    existing.push(t);
    byThesis.set(t.thesisId, existing);
  }

  const thesisStats = Array.from(byThesis.entries()).map(([thesisId, thesisTrades]) => {
    const wins = thesisTrades.filter(t => (t.realizedPnl ?? 0) > 0).length;
    const totalPnl = thesisTrades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
    const avgPnl = totalPnl / thesisTrades.length;

    return {
      thesisId,
      trades: thesisTrades.length,
      wins,
      winRate: (wins / thesisTrades.length) * 100,
      totalPnl,
      avgPnl,
      symbol: thesisTrades[0].symbol,
      direction: thesisTrades[0].direction,
    };
  }).sort((a, b) => b.totalPnl - a.totalPnl);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_60px_50px_70px_70px_70px] gap-2 px-2 text-[10px] text-zinc-500 uppercase">
        <span>Thesis</span>
        <span>Symbol</span>
        <span>Trades</span>
        <span className="text-right">Win Rate</span>
        <span className="text-right">Avg P&L</span>
        <span className="text-right">Total P&L</span>
      </div>

      {thesisStats.map(ts => (
        <div key={ts.thesisId}
          className="grid grid-cols-[1fr_60px_50px_70px_70px_70px] gap-2 px-2 py-1.5 rounded text-xs hover:bg-white/[0.03]">
          <span className="text-zinc-400 truncate font-mono text-[10px]">{ts.thesisId}</span>
          <div className="flex items-center gap-1">
            <span className="text-zinc-200">{ts.symbol.replace('/USDT:USDT', '')}</span>
            <Badge variant="outline" className={`text-[8px] px-0.5 py-0 uppercase ${
              ts.direction === 'long' ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'
            }`}>
              {ts.direction.charAt(0)}
            </Badge>
          </div>
          <span className="text-zinc-400">{ts.trades}</span>
          <span className={`text-right ${ts.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
            {ts.winRate.toFixed(0)}%
          </span>
          <span className={`text-right font-mono ${ts.avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {ts.avgPnl >= 0 ? '+' : ''}${ts.avgPnl.toFixed(0)}
          </span>
          <span className={`text-right font-mono font-medium ${ts.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {ts.totalPnl >= 0 ? '+' : ''}${ts.totalPnl.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function PaperTradingDashboard() {
  const [state, setState] = useState<PaperTradingState | null>(null);
  const [journal, setJournal] = useState<AIJournalEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'theses' | 'journal'>('overview');
  const eventSourceRef = useRef<EventSource | null>(null);

  // SSE connection
  useEffect(() => {
    const es = new EventSource('/api/paper-trading');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'init' || data.type === 'stats_update') {
          if (data.state) setState(data.state);
          if (data.journal) setJournal(prev => {
            const ids = new Set(prev.map(e => e.id));
            const newEntries = (data.journal as AIJournalEntry[]).filter(e => !ids.has(e.id));
            return [...prev, ...newEntries].slice(-200);
          });
        } else if (data.type === 'journal' && data.data) {
          setJournal(prev => [...prev, data.data as AIJournalEntry].slice(-200));
        } else if (data.type === 'trade_open' || data.type === 'trade_close' || data.type === 'trade_update') {
          // Refresh state on trade events
          fetchState();
        }
      } catch { /* ignore */ }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, tradesRes] = await Promise.all([
        fetch('/api/paper-trading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        }),
        fetch('/api/paper-trading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'trades' }),
        }),
      ]);
      const stateData = await stateRes.json();
      if (stateData.state) setState(stateData.state);
    } catch { /* ignore */ }
  }, []);

  const handleStart = async () => {
    const res = await fetch('/api/paper-trading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', virtualBalance: 100_000 }),
    });
    const data = await res.json();
    if (data.state) setState(data.state);
  };

  const handleStop = async () => {
    await fetch('/api/paper-trading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    setState(null);
  };

  const isActive = state?.isActive ?? false;
  const allTrades = state ? [...state.openTrades, ...state.closedTrades] : [];

  const TABS = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'trades' as const, label: `Trades (${state?.totalTrades ?? 0})` },
    { id: 'theses' as const, label: 'Thesis Performance' },
    { id: 'journal' as const, label: `Journal (${journal.length})` },
  ];

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Status bar */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/10">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${
            isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
          }`} />
          <div>
            <span className="text-sm font-medium text-zinc-200">
              Paper Trading {isActive ? 'Active' : 'Idle'}
            </span>
            {state && (
              <p className="text-[11px] text-zinc-500">
                ${state.currentEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })} equity
                {' · '}{state.totalTrades} trades
                {' · '}{state.openTrades.length} open
                {state.startedAt && (
                  <span className="ml-2">Running since {new Date(state.startedAt).toLocaleTimeString()}</span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!isActive && (
            <Button size="sm" onClick={handleStart} className="bg-[#AE5630] hover:bg-[#8B4526] text-white">
              Start Paper Trading
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="outline" onClick={handleStop}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10">
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* If no state yet, show prompt */}
      {!state && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-zinc-400 text-sm">Paper trading engine is not running</p>
            <p className="text-zinc-600 text-xs mt-1">
              Start the Research Engine first — paper trading auto-starts alongside it.
              <br />
              Or start it independently above.
            </p>
          </div>
        </div>
      )}

      {state && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-white/5 pb-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors ${
                  activeTab === tab.id
                    ? 'text-[#AE5630] bg-[#AE5630]/10 border-b-2 border-[#AE5630]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <StatsGrid state={state} />

                  {/* Equity Curve */}
                  <Card className="bg-white/[0.02] border-white/10">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardTitle className="text-xs font-semibold text-zinc-400 uppercase">
                        Equity Curve
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <EquityCurve trades={allTrades} startingBalance={state.virtualBalance} />
                    </CardContent>
                  </Card>

                  {/* Open Positions */}
                  <Card className="bg-white/[0.02] border-white/10">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardTitle className="text-xs font-semibold text-zinc-400 uppercase flex items-center gap-2">
                        Open Positions
                        {state.openTrades.length > 0 && (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                            {state.openTrades.length}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <OpenPositions trades={state.openTrades} />
                    </CardContent>
                  </Card>

                  {/* Recent Closed */}
                  <Card className="bg-white/[0.02] border-white/10">
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardTitle className="text-xs font-semibold text-zinc-400 uppercase">
                        Recent Closed Trades
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3">
                      <TradeHistory trades={state.closedTrades.slice(-10)} />
                    </CardContent>
                  </Card>
                </div>
              )}

              {activeTab === 'trades' && (
                <Card className="bg-white/[0.02] border-white/10">
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-semibold text-zinc-400 uppercase flex items-center justify-between">
                      <span>All Closed Trades</span>
                      <span className="text-zinc-500 normal-case font-normal">
                        {state.closedTrades.length} total · Click row for details
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <TradeHistory trades={state.closedTrades} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'theses' && (
                <Card className="bg-white/[0.02] border-white/10">
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-semibold text-zinc-400 uppercase">
                      Thesis Performance — Which Research Theses Made Money?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <ThesisPerformance trades={allTrades} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'journal' && (
                <Card className="bg-white/[0.02] border-white/10">
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-semibold text-zinc-400 uppercase">
                      AI Trading Journal — Internal Monologue
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <div className="space-y-2">
                      {journal.length === 0 && (
                        <p className="text-xs text-zinc-500 italic py-4 text-center">
                          No journal entries yet. The AI will start journaling when it processes research theses.
                        </p>
                      )}
                      {journal.slice().reverse().map(entry => (
                        <JournalEntryCard key={entry.id} entry={entry} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Journal Entry Card (for the journal tab)
// ---------------------------------------------------------------------------
function JournalEntryCard({ entry }: { entry: AIJournalEntry }) {
  const [isOpen, setIsOpen] = useState(false);

  const moodColor: Record<string, string> = {
    confident: 'bg-emerald-400',
    cautious: 'bg-amber-400',
    curious: 'bg-blue-400',
    concerned: 'bg-orange-400',
    excited: 'bg-pink-400',
    frustrated: 'bg-red-400',
    reflective: 'bg-purple-400',
    neutral: 'bg-zinc-400',
  };

  const typeColor: Record<string, string> = {
    observation: 'border-blue-500/30 text-blue-400',
    hypothesis: 'border-amber-500/30 text-amber-400',
    trade_idea: 'border-purple-500/30 text-purple-400',
    position_open: 'border-emerald-500/30 text-emerald-400',
    position_monitor: 'border-cyan-500/30 text-cyan-400',
    intervention: 'border-orange-500/30 text-orange-400',
    exit: 'border-red-500/30 text-red-400',
    retrospective: 'border-violet-500/30 text-violet-400',
    learning: 'border-emerald-500/30 text-emerald-400',
    agent_discussion: 'border-zinc-500/30 text-zinc-400',
    market_shift: 'border-amber-500/30 text-amber-400',
    risk_alert: 'border-red-500/30 text-red-400',
  };

  const ago = formatDuration(Date.now() - entry.timestamp);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left p-2 rounded-md hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${moodColor[entry.mood] ?? 'bg-zinc-400'}`} />
            <Badge variant="outline" className={`text-[9px] px-1 py-0 ${typeColor[entry.type] ?? 'border-white/10 text-zinc-400'}`}>
              {entry.type.replace(/_/g, ' ')}
            </Badge>
            {entry.symbol && (
              <span className="text-[10px] text-zinc-500">{entry.symbol.replace('/USDT:USDT', '')}</span>
            )}
            <span className="text-xs text-zinc-300 truncate flex-1">{entry.title}</span>
            <span className="text-[10px] text-zinc-600 shrink-0">{ago}</span>
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-2 pb-2 ml-4 text-xs text-zinc-400 space-y-1">
          <p className="leading-relaxed">{entry.content}</p>
          {entry.thinking && (
            <details className="text-[11px] text-zinc-500">
              <summary className="cursor-pointer hover:text-zinc-300">Reasoning</summary>
              <p className="mt-1 pl-2 border-l border-white/5">{entry.thinking}</p>
            </details>
          )}
          <div className="flex items-center gap-2 text-[10px] text-zinc-600">
            <span>Confidence: {entry.confidence}%</span>
            <span>Mood: {entry.mood}</span>
            {entry.tags.length > 0 && (
              <span>Tags: {entry.tags.join(', ')}</span>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
