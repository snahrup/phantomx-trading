'use client';

import { memo } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatUsd } from '@/lib/format';

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

  const pnlColor = totalPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]';
  const ksColor = isKilled ? 'text-[var(--cl-error)]' : isPaused ? 'text-[var(--cl-warning)]' : isExecuting ? 'text-[var(--cl-success)]' : 'text-[var(--cl-text-secondary)]';
  const ksLabel = isKilled ? 'KILLED' : isPaused ? 'PAUSED' : isExecuting ? 'LIVE' : 'OFF';

  return (
    <div className="flex items-center gap-5 px-4 py-1.5 border-b border-[var(--cl-border-subtle)] bg-[var(--cl-bg-surface)] text-[11px] overflow-x-auto flex-shrink-0">
      {/* Balance (includes unrealized PnL) */}
      <div className="flex items-center gap-1.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#AE5630" strokeWidth="2">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <path d="M16 8h4v4h-4z" />
        </svg>
        <span className="text-[var(--cl-text-secondary)]">Balance:</span>
        <span className="font-semibold text-[var(--cl-text-primary)]">${formatUsd(totalBalance)}</span>
        {totalPnl !== 0 && (
          <span className={`text-[10px] ${pnlColor}`}>
            ({totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)})
          </span>
        )}
      </div>

      {/* Available */}
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--cl-text-secondary)]">Avail:</span>
        <span className="text-[var(--cl-text-faint)]">${formatUsd(availableBalance)}</span>
      </div>

      {/* Unrealized PnL */}
      <div className={`flex items-center gap-1.5 ${pnlColor}`}>
        {totalPnl >= 0 ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
            <polyline points="17 18 23 18 23 12" />
          </svg>
        )}
        <span className="text-[var(--cl-text-primary)]">PnL:</span>
        <span className="font-semibold">
          {totalPnl >= 0 ? '+' : ''}${formatUsd(totalPnl)}
        </span>
      </div>

      {/* Positions */}
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--cl-text-secondary)]">Pos:</span>
        <span className={positions.length > 0 ? 'text-[var(--cl-warning)] font-medium' : 'text-[var(--cl-text-faint)]'}>
          {positions.length}
        </span>
      </div>

      {/* Trades today */}
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--cl-text-secondary)]">Trades:</span>
        <span className="text-[var(--cl-text-faint)]">{totalTrades}</span>
        {winRate > 0 && (
          <>
            <span className="text-[var(--cl-text-secondary)]">WR:</span>
            <span className={winRate >= 50 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>{winRate.toFixed(0)}%</span>
          </>
        )}
      </div>

      {/* Mini Allocation Bar — Portfolio Mode */}
      {autopilotMode === 'portfolio' && positions.length > 0 && totalBalance > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--cl-text-secondary)]">Alloc:</span>
          <div className="flex h-3 w-24 rounded-sm overflow-hidden bg-[var(--cl-fill-hover)]" title="Portfolio allocation">
            {positions.map((p) => {
              const notional = Math.abs(p.size * p.markPrice);
              const pct = Math.max(1, (notional / totalBalance) * 100);
              const color = p.side === 'long' ? 'var(--cl-success)' : 'var(--cl-error)';
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
                  style={{ width: `${cashPct}%`, backgroundColor: 'var(--cl-text-secondary)' }}
                  className="h-full opacity-30"
                  title={`Cash ${cashPct.toFixed(1)}%`}
                />
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Kill Switch Status */}
      <div className={`flex items-center gap-1.5 ml-auto ${ksColor}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="uppercase text-[10px] font-semibold tracking-wider">{ksLabel}</span>
        {isKilled && killReason && (
          <span className="text-[9px] text-[var(--cl-error)] opacity-70 truncate max-w-[120px]" title={killReason}>
            ({killReason})
          </span>
        )}
      </div>
    </div>
  );
});
