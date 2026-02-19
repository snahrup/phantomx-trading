'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BacktestResult, BacktestMetrics, StrategyGoals } from '@/types/trading';
import { CheckCircle2, XCircle, RotateCcw, TrendingUp, TrendingDown, BarChart3, Calendar, Activity } from 'lucide-react';

// ---------- Helpers ----------

const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtUsd = (n: number) => `$${fmt(n)}`;
const fmtPct = (n: number) => `${fmt(n, 1)}%`;
const fmtDate = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const GLASS = 'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm';

interface BacktestResultsProps {
  result: BacktestResult;
  goals?: StrategyGoals | null;
  onOptimize?: () => void;
}

export default function BacktestResults({ result, goals, onOptimize }: BacktestResultsProps) {
  const [tab, setTab] = useState('overview');
  const { metrics, trades, equityCurve } = result;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="overview" className="flex-1 gap-1 text-xs"><BarChart3 className="w-3 h-3" />Overview</TabsTrigger>
          <TabsTrigger value="trades" className="flex-1 gap-1 text-xs"><Activity className="w-3 h-3" />Trades</TabsTrigger>
          <TabsTrigger value="monthly" className="flex-1 gap-1 text-xs"><Calendar className="w-3 h-3" />Monthly</TabsTrigger>
          <TabsTrigger value="drawdown" className="flex-1 gap-1 text-xs"><TrendingDown className="w-3 h-3" />Drawdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab metrics={metrics} equityCurve={equityCurve} goals={goals} onOptimize={onOptimize} />
        </TabsContent>
        <TabsContent value="trades">
          <TradesTab trades={trades} />
        </TabsContent>
        <TabsContent value="monthly">
          <MonthlyTab trades={trades} />
        </TabsContent>
        <TabsContent value="drawdown">
          <DrawdownTab equityCurve={equityCurve} maxDrawdownPct={metrics.maxDrawdownPercent} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ============================================================
// Overview Tab
// ============================================================

function OverviewTab({
  metrics, equityCurve, goals, onOptimize,
}: {
  metrics: BacktestMetrics;
  equityCurve: { time: number; equity: number }[];
  goals?: StrategyGoals | null;
  onOptimize?: () => void;
}) {
  const goalChecks = useMemo(() => {
    if (!goals) return [];
    return [
      { label: 'Win Rate', value: metrics.winRate * 100, target: goals.minWinRate * 100, met: metrics.winRate >= goals.minWinRate, unit: '%' },
      { label: 'Profit Factor', value: metrics.profitFactor, target: goals.minProfitFactor, met: metrics.profitFactor >= goals.minProfitFactor, unit: '' },
      { label: 'Max Drawdown', value: metrics.maxDrawdownPercent, target: goals.maxDrawdownPercent, met: metrics.maxDrawdownPercent <= goals.maxDrawdownPercent, unit: '%', invert: true },
      { label: 'Sharpe Ratio', value: metrics.sharpeRatio, target: goals.minSharpeRatio, met: metrics.sharpeRatio >= goals.minSharpeRatio, unit: '' },
    ];
  }, [metrics, goals]);

  const allGoalsMet = goalChecks.length > 0 && goalChecks.every(g => g.met);

  const metricCards: { label: string; value: string; color?: string }[] = [
    { label: 'Total P&L', value: `${fmtUsd(metrics.totalPnl)} (${fmtPct(metrics.totalPnlPercent)})`, color: metrics.totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500' },
    { label: 'Win Rate', value: fmtPct(metrics.winRate * 100), color: goalColor(goalChecks, 'Win Rate') },
    { label: 'Profit Factor', value: fmt(metrics.profitFactor), color: goalColor(goalChecks, 'Profit Factor') },
    { label: 'Max Drawdown', value: fmtPct(metrics.maxDrawdownPercent), color: goalColor(goalChecks, 'Max Drawdown') },
    { label: 'Sharpe Ratio', value: fmt(metrics.sharpeRatio), color: goalColor(goalChecks, 'Sharpe Ratio') },
    { label: 'Sortino Ratio', value: fmt(metrics.sortinoRatio) },
    { label: 'Avg Win', value: fmtUsd(metrics.avgWin), color: 'text-emerald-500' },
    { label: 'Avg Loss', value: fmtUsd(metrics.avgLoss), color: 'text-red-500' },
    { label: 'Best Trade', value: fmtUsd(metrics.bestTrade), color: 'text-emerald-500' },
    { label: 'Worst Trade', value: fmtUsd(metrics.worstTrade), color: 'text-red-500' },
    { label: 'Total Trades', value: `${metrics.totalTrades}` },
    { label: 'Buy & Hold', value: `${fmtUsd(metrics.buyAndHoldReturn)} (${fmtPct(metrics.buyAndHoldReturnPercent)})`, color: metrics.buyAndHoldReturn >= 0 ? 'text-emerald-500/70' : 'text-red-500/70' },
  ];

  return (
    <div className="space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {metricCards.map(c => (
          <div key={c.label} className={cn(GLASS, 'p-3')}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
            <p className={cn('text-sm font-bold mt-0.5', c.color || 'text-foreground')}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Goal Summary */}
      {goalChecks.length > 0 && (
        <div className={cn(GLASS, 'p-3')}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-foreground">Goal Summary</p>
            <Badge variant={allGoalsMet ? 'default' : 'secondary'} className={cn('text-[10px]', allGoalsMet && 'bg-emerald-500/20 text-emerald-500')}>
              {goalChecks.filter(g => g.met).length}/{goalChecks.length} met
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3">
            {goalChecks.map(g => (
              <div key={g.label} className="flex items-center gap-1.5 text-xs">
                {g.met ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                <span className="text-muted-foreground">{g.label}:</span>
                <span className={g.met ? 'text-emerald-500' : 'text-red-500'}>
                  {fmt(g.value, g.unit === '%' ? 1 : 2)}{g.unit}
                </span>
                <span className="text-muted-foreground/60">/ {fmt(g.target, g.unit === '%' ? 1 : 2)}{g.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Equity Curve */}
      <div className={cn(GLASS, 'p-3')}>
        <p className="text-xs font-semibold text-foreground mb-2">Equity Curve</p>
        <EquityCanvas equityCurve={equityCurve} />
      </div>

      {/* Optimize Button */}
      {onOptimize && !allGoalsMet && (
        <Button onClick={onOptimize} className="w-full gap-2" variant="outline">
          <RotateCcw className="w-3.5 h-3.5" />
          Run Optimization Loop
        </Button>
      )}
    </div>
  );
}

function goalColor(checks: { label: string; met: boolean }[], label: string) {
  const check = checks.find(c => c.label === label);
  if (!check) return undefined;
  return check.met ? 'text-emerald-500' : 'text-red-500';
}

// ============================================================
// Equity Canvas
// ============================================================

function EquityCanvas({ equityCurve }: { equityCurve: { time: number; equity: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || equityCurve.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 10, right: 10, bottom: 20, left: 50 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const equities = equityCurve.map(p => p.equity);
    const minE = Math.min(...equities) * 0.98;
    const maxE = Math.max(...equities) * 1.02;
    const rangeE = maxE - minE || 1;

    const toX = (i: number) => pad.left + (i / (equityCurve.length - 1)) * cw;
    const toY = (e: number) => pad.top + ch - ((e - minE) / rangeE) * ch;

    // Background
    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      const val = maxE - (rangeE / 4) * i;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`$${fmt(val, 0)}`, pad.left - 4, y + 3);
    }

    // Gradient fill
    const isPositive = equities[equities.length - 1] >= equities[0];
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(equities[0]));
    for (let i = 1; i < equities.length; i++) ctx.lineTo(toX(i), toY(equities[i]));
    ctx.lineTo(toX(equities.length - 1), pad.top + ch);
    ctx.lineTo(toX(0), pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(equities[0]));
    for (let i = 1; i < equities.length; i++) ctx.lineTo(toX(i), toY(equities[i]));
    ctx.strokeStyle = isPositive ? '#10b981' : '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Starting equity reference
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, toY(equities[0]));
    ctx.lineTo(w - pad.right, toY(equities[0]));
    ctx.stroke();
    ctx.setLineDash([]);

  }, [equityCurve]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: 200 }}
    />
  );
}

// ============================================================
// Trades Tab
// ============================================================

function TradesTab({ trades }: { trades: BacktestResult['trades'] }) {
  const sorted = useMemo(() => [...trades].sort((a, b) => b.entryTime - a.entryTime), [trades]);

  return (
    <div className={cn(GLASS, 'overflow-hidden')}>
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30 text-muted-foreground">
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Side</th>
              <th className="px-2 py-2 text-left">Entry</th>
              <th className="px-2 py-2 text-left">Exit</th>
              <th className="px-2 py-2 text-right">Entry $</th>
              <th className="px-2 py-2 text-right">Exit $</th>
              <th className="px-2 py-2 text-right">P&L</th>
              <th className="px-2 py-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={t.id} className="border-b border-border/10 hover:bg-muted/30">
                <td className="px-2 py-1.5 text-muted-foreground">{trades.length - i}</td>
                <td className="px-2 py-1.5">
                  <Badge variant="outline" className={cn('text-[10px]', t.side === 'long' ? 'text-emerald-500 border-emerald-500/30' : 'text-red-500 border-red-500/30')}>
                    {t.side.toUpperCase()}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{fmtDate(t.entryTime)}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{fmtDate(t.exitTime)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtUsd(t.entryPrice)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtUsd(t.exitPrice)}</td>
                <td className={cn('px-2 py-1.5 text-right font-mono font-medium', t.pnl >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                  {fmtUsd(t.pnl)} ({fmtPct(t.pnlPercent)})
                </td>
                <td className="px-2 py-1.5">
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">{t.exitReason}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Monthly Returns Tab
// ============================================================

function MonthlyTab({ trades }: { trades: BacktestResult['trades'] }) {
  const monthlyData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const t of trades) {
      const d = new Date(t.exitTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] || 0) + t.pnl;
    }

    const keys = Object.keys(byMonth).sort();
    if (keys.length === 0) return { years: [], data: byMonth };

    const startYear = parseInt(keys[0].split('-')[0]);
    const endYear = parseInt(keys[keys.length - 1].split('-')[0]);
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);

    return { years, data: byMonth };
  }, [trades]);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const maxPnl = Math.max(...Object.values(monthlyData.data).map(Math.abs), 1);

  return (
    <div className={cn(GLASS, 'p-3 overflow-x-auto')}>
      <p className="text-xs font-semibold text-foreground mb-3">Monthly Returns Heatmap</p>
      {monthlyData.years.length === 0 ? (
        <p className="text-xs text-muted-foreground">No trade data available</p>
      ) : (
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="px-1 py-1 text-left text-muted-foreground">Year</th>
              {months.map(m => <th key={m} className="px-1 py-1 text-center text-muted-foreground">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {monthlyData.years.map(year => (
              <tr key={year}>
                <td className="px-1 py-1 font-medium text-muted-foreground">{year}</td>
                {months.map((_, mi) => {
                  const key = `${year}-${String(mi + 1).padStart(2, '0')}`;
                  const val = monthlyData.data[key];
                  if (val === undefined) return <td key={key} className="px-1 py-1"><div className="w-full h-6 rounded bg-muted/20" /></td>;
                  const intensity = Math.min(Math.abs(val) / maxPnl, 1);
                  const bg = val >= 0
                    ? `rgba(16,185,129,${0.15 + intensity * 0.45})`
                    : `rgba(239,68,68,${0.15 + intensity * 0.45})`;
                  return (
                    <td key={key} className="px-1 py-1">
                      <div className="w-full h-6 rounded flex items-center justify-center font-mono" style={{ background: bg }}>
                        <span className={val >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtUsd(val)}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================
// Drawdown Tab
// ============================================================

function DrawdownTab({ equityCurve, maxDrawdownPct }: { equityCurve: { time: number; equity: number }[]; maxDrawdownPct: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawdowns = useMemo(() => {
    let peak = 0;
    return equityCurve.map(p => {
      if (p.equity > peak) peak = p.equity;
      return peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
    });
  }, [equityCurve]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawdowns.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 10, right: 10, bottom: 20, left: 50 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const maxDD = Math.max(...drawdowns, 1) * 1.1;
    const toX = (i: number) => pad.left + (i / (drawdowns.length - 1)) * cw;
    const toY = (dd: number) => pad.top + (dd / maxDD) * ch;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      const val = (maxDD / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`-${fmt(val, 1)}%`, pad.left - 4, y + 3);
    }

    // Fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, 'rgba(239,68,68,0.05)');
    grad.addColorStop(1, 'rgba(239,68,68,0.4)');

    ctx.beginPath();
    ctx.moveTo(toX(0), pad.top);
    for (let i = 0; i < drawdowns.length; i++) ctx.lineTo(toX(i), toY(drawdowns[i]));
    ctx.lineTo(toX(drawdowns.length - 1), pad.top);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(drawdowns[0]));
    for (let i = 1; i < drawdowns.length; i++) ctx.lineTo(toX(i), toY(drawdowns[i]));
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Max DD marker
    const maxDDIdx = drawdowns.indexOf(Math.max(...drawdowns));
    if (maxDDIdx >= 0) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(239,68,68,0.5)';
      ctx.beginPath();
      ctx.moveTo(pad.left, toY(drawdowns[maxDDIdx]));
      ctx.lineTo(w - pad.right, toY(drawdowns[maxDDIdx]));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Max DD: -${fmt(drawdowns[maxDDIdx], 1)}%`, pad.left + 4, toY(drawdowns[maxDDIdx]) - 4);
    }
  }, [drawdowns]);

  return (
    <div className={cn(GLASS, 'p-3')}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">Drawdown Analysis</p>
        <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">
          Max: -{fmtPct(maxDrawdownPct)}
        </Badge>
      </div>
      <canvas ref={canvasRef} className="w-full" style={{ height: 220 }} />
    </div>
  );
}
