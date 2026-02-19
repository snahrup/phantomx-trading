'use client';

import { memo } from 'react';
import { Wallet, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { useTradingStore } from '@/store/trading-store';
import { formatUsd } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

// PERF-04/05: Wrap in React.memo to prevent re-renders from parent
export default memo(function PortfolioBar() {
  // PERF-03: Granular selectors to avoid re-rendering on unrelated state changes
  const isConnected = useTradingStore(s => s.isConnected);
  const balances = useTradingStore(s => s.balances);
  const accountValue = useTradingStore(s => s.accountValue);
  const positions = useTradingStore(s => s.positions);
  const recentTrades = useTradingStore(s => s.recentTrades);
  const isExecuting = useTradingStore(s => s.isExecuting);
  const isPaused = useTradingStore(s => s.isPaused);
  const isKilled = useTradingStore(s => s.isKilled);
  const killReason = useTradingStore(s => s.killReason);
  const stats = useTradingStore(s => s.stats);
  const autopilotMode = useTradingStore(s => s.autopilotMode);

  if (!isConnected) return null;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTrades = recentTrades.filter(t => t.timestamp >= todayStart.getTime());
  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const mainBalance = balances.find(b => b.currency === 'USDT');
  const availableBalance = mainBalance?.free ?? 0;
  const totalBalance = accountValue || (mainBalance?.total ?? 0);

  const winRate = stats?.winRate ?? 0;
  const totalTrades = stats?.totalTrades ?? todayTrades.length;

  const pnlColor = totalPnl >= 0 ? 'text-claude-green' : 'text-destructive';
  const ksColor = isKilled ? 'text-destructive' : isPaused ? 'text-yellow-500' : isExecuting ? 'text-claude-green' : 'text-muted-foreground';
  const ksLabel = isKilled ? 'KILLED' : isPaused ? 'PAUSED' : isExecuting ? 'LIVE' : 'OFF';
  const ksBadgeVariant = isKilled ? 'destructive' as const : 'outline' as const;

  return (
    <div className="flex items-center gap-5 px-4 py-1.5 border-b border-border bg-card text-[11px] overflow-x-auto flex-shrink-0">
      {/* Balance (includes unrealized PnL) */}
      <div className="flex items-center gap-1.5">
        <Wallet className="size-3 text-claude-orange" />
        <span className="text-muted-foreground">Balance:</span>
        <span className="font-semibold text-foreground">${formatUsd(totalBalance)}</span>
        {totalPnl !== 0 && (
          <span className={`text-[10px] ${pnlColor}`}>
            ({totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)})
          </span>
        )}
      </div>

      {/* Available */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Avail:</span>
        <span className="text-foreground">${formatUsd(availableBalance)}</span>
      </div>

      {/* Unrealized PnL */}
      <div className={`flex items-center gap-1.5 ${pnlColor}`}>
        {totalPnl >= 0 ? (
          <TrendingUp className="size-3" />
        ) : (
          <TrendingDown className="size-3" />
        )}
        <span className="text-foreground">PnL:</span>
        <span className="font-semibold">
          {totalPnl >= 0 ? '+' : ''}${formatUsd(totalPnl)}
        </span>
      </div>

      {/* Positions */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Pos:</span>
        <span className={positions.length > 0 ? 'text-yellow-500 font-medium' : 'text-foreground'}>
          {positions.length}
        </span>
      </div>

      {/* Trades today */}
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Trades:</span>
        <span className="text-foreground">{totalTrades}</span>
        {winRate > 0 && (
          <>
            <span className="text-muted-foreground">WR:</span>
            <span className={winRate >= 50 ? 'text-claude-green' : 'text-destructive'}>{winRate.toFixed(0)}%</span>
          </>
        )}
      </div>

      {/* Mini Allocation Bar — Portfolio Mode */}
      {autopilotMode === 'portfolio' && positions.length > 0 && totalBalance > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Alloc:</span>
          <div className="flex h-3 w-24 rounded-sm overflow-hidden bg-muted" title="Portfolio allocation">
            {positions.map((p) => {
              const notional = Math.abs(p.size * p.markPrice);
              const pct = Math.max(1, (notional / totalBalance) * 100);
              const color = p.side === 'long'
                ? 'oklch(0.58 0.1 145)'   /* claude-green */
                : 'oklch(0.52 0.17 28)';  /* destructive  */
              const base = p.symbol.replace(/\/USDT:USDT$/, '').replace(/\/USD:USD$/, '');
              return (
                <div
                  key={p.id}
                  style={{ width: `${pct}%`, backgroundColor: color }}
                  className="h-full opacity-70 hover:opacity-100 transition-opacity"
                  title={`${base} ${p.side} ${pct.toFixed(1)}%`}
                />
              );
            })}
            {/* Cash remainder */}
            {(() => {
              const usedPct = positions.reduce((s, p) => s + Math.abs(p.size * p.markPrice) / totalBalance * 100, 0);
              const cashPct = Math.max(0, 100 - usedPct);
              return cashPct > 0 ? (
                <div
                  style={{ width: `${cashPct}%` }}
                  className="h-full bg-muted-foreground opacity-30"
                  title={`Cash ${cashPct.toFixed(1)}%`}
                />
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Kill Switch Status */}
      <div className={`flex items-center gap-1.5 ml-auto ${ksColor}`}>
        <Zap className="size-3" />
        <Badge variant={ksBadgeVariant} className={`uppercase text-[10px] px-1.5 py-0 font-semibold tracking-wider ${ksColor}`}>
          {ksLabel}
        </Badge>
        {isKilled && killReason && (
          <span className="text-[9px] text-destructive opacity-70 truncate max-w-[120px]" title={killReason}>
            ({killReason})
          </span>
        )}
      </div>
    </div>
  );
});
