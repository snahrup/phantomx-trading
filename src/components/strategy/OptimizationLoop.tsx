'use client';

import { useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTradingStore } from '@/store/trading-store';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { OptimizationIteration, StrategyConfig } from '@/types/trading';
import {
  ArrowRight, CheckCircle2, XCircle, TrendingUp, TrendingDown,
  RotateCcw, Loader2, Sparkles,
} from 'lucide-react';

const GLASS = 'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm';
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const fmtPct = (n: number) => `${fmt(n, 1)}%`;

interface OptimizationLoopProps {
  onComplete?: (finalConfig: StrategyConfig) => void;
  isRunning: boolean;
}

export default function OptimizationLoop({ onComplete, isRunning }: OptimizationLoopProps) {
  const iterations = useTradingStore(s => s.optimizationIterations);
  const goals = useTradingStore(s => s.strategyGoals);

  const maxIter = goals?.maxOptimizationIterations || 10;
  const progress = (iterations.length / maxIter) * 100;
  const latest = iterations[iterations.length - 1];
  const allGoalsMet = latest?.metricsVsGoals.every(m => m.met) ?? false;

  // Fire onComplete when all goals are met
  useEffect(() => {
    if (allGoalsMet && latest && onComplete) {
      onComplete(latest.strategyConfig);
    }
  }, [allGoalsMet, latest, onComplete]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header */}
      <div className={cn(GLASS, 'p-4')}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <RotateCcw className={cn('w-4 h-4', isRunning && 'animate-spin text-primary')} />
            <p className="text-sm font-semibold text-foreground">
              {isRunning
                ? `Running iteration ${iterations.length + 1} of ${maxIter}`
                : allGoalsMet
                  ? 'All goals met!'
                  : iterations.length > 0
                    ? `${iterations.length} iterations complete`
                    : 'Optimization Loop'
              }
            </p>
          </div>
          {allGoalsMet && (
            <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px]">
              <Sparkles className="w-3 h-3 mr-1" /> Converged
            </Badge>
          )}
        </div>
        <Progress value={Math.min(progress, 100)} className="h-1.5" />
        {iterations.length === 0 && isRunning && (
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Starting optimization...
          </div>
        )}
      </div>

      {/* Iteration Cards */}
      <AnimatePresence>
        {[...iterations].reverse().map((iter, revIdx) => {
          const prev = iter.iteration > 1 ? iterations[iter.iteration - 2] : null;
          const goalsMet = iter.metricsVsGoals.filter(m => m.met).length;
          const goalsTotal = iter.metricsVsGoals.length;

          return (
            <motion.div
              key={iter.iteration}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: revIdx * 0.05 }}
              className={cn(GLASS, 'p-4')}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">Iteration #{iter.iteration}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(iter.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    goalsMet === goalsTotal ? 'text-emerald-500 border-emerald-500/30' :
                    goalsMet > 0 ? 'text-yellow-500 border-yellow-500/30' :
                    'text-red-500 border-red-500/30',
                  )}
                >
                  {goalsMet}/{goalsTotal} goals met
                </Badge>
              </div>

              {/* Changes */}
              {iter.changes.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Changes</p>
                  {iter.changes.map((change, ci) => (
                    <div key={ci} className="text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] font-mono">{change.field}</Badge>
                        <span className="text-muted-foreground font-mono">{String(change.oldValue)}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-foreground font-mono font-medium">{String(change.newValue)}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 italic mt-0.5 ml-1">{change.reasoning}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Metrics Comparison */}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {iter.metricsVsGoals.map(mvg => {
                  const prevIter = prev?.metricsVsGoals.find(m => m.metric === mvg.metric);
                  const prevVal = prevIter?.value;
                  const isDD = mvg.metric.toLowerCase().includes('drawdown');
                  const improved = prevVal !== undefined
                    ? isDD ? mvg.value < prevVal : mvg.value > prevVal
                    : false;
                  const regressed = prevVal !== undefined
                    ? isDD ? mvg.value > prevVal : mvg.value < prevVal
                    : false;

                  return (
                    <div key={mvg.metric} className="flex items-center gap-1 text-[11px]">
                      {mvg.met ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500" />
                      )}
                      <span className="text-muted-foreground">{mvg.metric}:</span>
                      <span className={cn('font-mono font-medium',
                        mvg.met ? 'text-emerald-500' : 'text-foreground',
                      )}>
                        {formatMetricValue(mvg.metric, mvg.value)}
                      </span>
                      {prevVal !== undefined && (
                        <span className={cn('text-[10px] flex items-center',
                          improved ? 'text-emerald-500' : regressed ? 'text-red-500' : 'text-muted-foreground',
                        )}>
                          {improved ? <TrendingUp className="w-2.5 h-2.5" /> : regressed ? <TrendingDown className="w-2.5 h-2.5" /> : null}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Convergence Chart */}
      {iterations.length >= 2 && (
        <div className={cn(GLASS, 'p-3')}>
          <p className="text-xs font-semibold text-foreground mb-2">Convergence</p>
          <ConvergenceChart iterations={iterations} />
        </div>
      )}
    </motion.div>
  );
}

function formatMetricValue(metric: string, value: number): string {
  const lower = metric.toLowerCase();
  if (lower.includes('rate') || lower.includes('drawdown')) return fmtPct(value * 100);
  return fmt(value);
}

// ---------- Convergence Chart ----------

function ConvergenceChart({ iterations }: { iterations: OptimizationIteration[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const metricNames = useMemo(() => {
    if (iterations.length === 0) return [];
    return iterations[0].metricsVsGoals.map(m => m.metric);
  }, [iterations]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || iterations.length < 2 || metricNames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 10, right: 10, bottom: 20, left: 10 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

    // For each metric, normalize to 0-1 range
    metricNames.forEach((name, mi) => {
      const values = iterations.map(iter => {
        const m = iter.metricsVsGoals.find(mv => mv.metric === name);
        return m?.value ?? 0;
      });
      const goals = iterations.map(iter => {
        const m = iter.metricsVsGoals.find(mv => mv.metric === name);
        return m?.goal ?? 0;
      });

      const all = [...values, ...goals];
      const min = Math.min(...all) * 0.9;
      const max = Math.max(...all) * 1.1;
      const range = max - min || 1;

      const toX = (i: number) => pad.left + (i / (iterations.length - 1)) * cw;
      const toY = (v: number) => pad.top + ch - ((v - min) / range) * ch;

      const color = colors[mi % colors.length];

      // Goal line (dashed)
      const goalVal = goals[0];
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = color + '40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, toY(goalVal));
      ctx.lineTo(w - pad.right, toY(goalVal));
      ctx.stroke();
      ctx.setLineDash([]);

      // Value line
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(values[0]));
      for (let i = 1; i < values.length; i++) ctx.lineTo(toX(i), toY(values[i]));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Dots
      for (let i = 0; i < values.length; i++) {
        ctx.beginPath();
        ctx.arc(toX(i), toY(values[i]), 2.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    });

    // Legend
    const legendY = h - 8;
    let legendX = pad.left;
    metricNames.forEach((name, mi) => {
      const color = colors[mi % colors.length];
      ctx.fillStyle = color;
      ctx.fillRect(legendX, legendY - 4, 8, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(name, legendX + 10, legendY);
      legendX += ctx.measureText(name).width + 20;
    });
  }, [iterations, metricNames]);

  return <canvas ref={canvasRef} className="w-full" style={{ height: 160 }} />;
}
