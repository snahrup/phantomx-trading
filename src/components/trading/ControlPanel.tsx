'use client';

import { useState } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import type { RiskLevel } from '@/types/trading';

export default function ControlPanel() {
  const {
    isConnected, isExecuting, isPaused, isKilled, killReason,
    selectedSymbol, riskParameters, accountValue, positions,
    stats,
    setExecuting, setPaused, setKilled,
    setRiskLevel, setRiskParameters,
    setShowPineScriptModal,
  } = useTradingStore();

  const [showRiskConfig, setShowRiskConfig] = useState(false);

  const handlePanic = async () => {
    if (!confirm('PANIC: This will close ALL positions and cancel ALL orders immediately. Are you sure?')) return;

    try {
      await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'panic', symbol: selectedSymbol }),
      });
      setKilled(true, 'manual_panic');
      setExecuting(false);
    } catch (err) {
      console.error('Panic button error:', err);
    }
  };

  const handleStart = async () => {
    try {
      await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', symbol: selectedSymbol, risk: riskParameters }),
      });
      setExecuting(true);
      setPaused(false);
    } catch (err) {
      console.error('Start error:', err);
    }
  };

  const handlePauseResume = async () => {
    try {
      await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: isPaused ? 'resume' : 'pause' }),
      });
      setPaused(!isPaused);
    } catch (err) {
      console.error('Pause/resume error:', err);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      setExecuting(false);
      setPaused(false);
    } catch (err) {
      console.error('Stop error:', err);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header">
        <span>Controls</span>
        <div className="flex items-center gap-2">
          <span className={`status-dot ${
            isKilled ? 'killed' : isExecuting ? 'live' : isPaused ? 'paused' : 'disconnected'
          }`} />
          <span className="text-[10px]">
            {isKilled ? 'KILLED' : isExecuting ? 'LIVE' : isPaused ? 'PAUSED' : 'IDLE'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Kill Banner */}
        {isKilled && (
          <div className="kill-banner">
            <div className="flex items-center gap-2 mb-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-sm font-medium text-[var(--cl-error)]">KILL SWITCH ACTIVATED</span>
            </div>
            <p className="text-xs text-[var(--cl-text-faint)]">{killReason ?? 'All positions closed. Strategy halted.'}</p>
            <button
              onClick={() => { setKilled(false); }}
              className="mt-2 px-3 py-1 rounded text-xs bg-[var(--cl-fill-hover)] hover:bg-[var(--cl-fill-active)] transition-colors"
            >
              Acknowledge & Reset
            </button>
          </div>
        )}

        {/* Account Summary */}
        <div className="glass-card p-3">
          <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">Account</h3>
          <div className="grid grid-cols-2 gap-2">
            <StatItem label="Balance" value={`$${formatUsd(accountValue)}`} />
            <StatItem
              label="PnL"
              value={`${(stats?.totalPnl ?? 0) >= 0 ? '+' : ''}$${formatUsd(stats?.totalPnl ?? 0)}`}
              className={(stats?.totalPnl ?? 0) >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}
            />
            <StatItem label="Win Rate" value={`${(stats?.winRate ?? 0).toFixed(1)}%`} />
            <StatItem label="Trades" value={`${stats?.totalTrades ?? 0}`} />
            <StatItem
              label="Drawdown"
              value={`${(stats?.maxDrawdown ?? 0).toFixed(1)}%`}
              className={(stats?.maxDrawdown ?? 0) > (riskParameters.maxDrawdownPercent / 2) ? 'text-[var(--cl-warning)]' : ''}
            />
            <StatItem
              label="Profit Factor"
              value={stats?.profitFactor === Infinity ? '—' : `${(stats?.profitFactor ?? 0).toFixed(2)}`}
            />
          </div>
        </div>

        {/* Open Positions */}
        {positions.length > 0 && (
          <div className="glass-card p-3">
            <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">
              Open Positions ({positions.length})
            </h3>
            <div className="space-y-2">
              {positions.map((pos) => (
                <div key={pos.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${pos.side === 'long' ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                      {pos.side.toUpperCase()}
                    </span>
                    <span className="text-[var(--cl-text-faint)]">{pos.size}</span>
                    <span className="text-[var(--cl-text-secondary)]">@ {formatPrice(pos.entryPrice)}</span>
                  </div>
                  <span className={pos.unrealizedPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                    {pos.unrealizedPnl >= 0 ? '+' : ''}${formatUsd(pos.unrealizedPnl)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk Level Selector */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider">Risk Level</h3>
            <button
              onClick={() => setShowRiskConfig(!showRiskConfig)}
              className="text-[10px] text-[var(--cl-accent)] hover:underline"
            >
              {showRiskConfig ? 'Hide' : 'Configure'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {(['conservative', 'moderate', 'aggressive', 'degen'] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setRiskLevel(level)}
                className={`risk-badge ${level} text-center cursor-pointer transition-all ${
                  riskParameters.level === level
                    ? 'ring-1 ring-current scale-105'
                    : 'opacity-50 hover:opacity-75'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {showRiskConfig && (
            <div className="space-y-2 mt-3 pt-3 border-t border-[var(--cl-border-subtle)]">
              <RiskSlider
                label="Position Size"
                value={riskParameters.maxPositionSizePercent}
                unit="%"
                min={1} max={50} step={1}
                onChange={(v) => setRiskParameters({ ...riskParameters, maxPositionSizePercent: v })}
              />
              <RiskSlider
                label="Stop Loss"
                value={riskParameters.stopLossPercent}
                unit="%"
                min={0.5} max={20} step={0.5}
                onChange={(v) => setRiskParameters({ ...riskParameters, stopLossPercent: v })}
              />
              <RiskSlider
                label="Take Profit"
                value={riskParameters.takeProfitPercent}
                unit="%"
                min={1} max={50} step={0.5}
                onChange={(v) => setRiskParameters({ ...riskParameters, takeProfitPercent: v })}
              />
              <RiskSlider
                label="Max Drawdown"
                value={riskParameters.maxDrawdownPercent}
                unit="%"
                min={1} max={75} step={1}
                onChange={(v) => setRiskParameters({ ...riskParameters, maxDrawdownPercent: v })}
              />
              <RiskSlider
                label="Daily Loss Cap"
                value={riskParameters.maxDailyLossPercent}
                unit="%"
                min={1} max={50} step={1}
                onChange={(v) => setRiskParameters({ ...riskParameters, maxDailyLossPercent: v })}
              />

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  placeholder="Hard floor ($)"
                  value={riskParameters.hardFloorUsd ?? ''}
                  onChange={(e) => setRiskParameters({
                    ...riskParameters,
                    hardFloorUsd: e.target.value ? Number(e.target.value) : undefined,
                  })}
                  className="flex-1 bg-[var(--cl-fill-control)] border border-[var(--cl-border)] rounded px-2 py-1 text-xs text-[var(--cl-text-primary)] placeholder-[var(--cl-text-secondary)] focus:outline-none focus:border-[var(--cl-accent-border)]"
                />
                <input
                  type="number"
                  placeholder="Hard ceiling ($)"
                  value={riskParameters.hardCeilingUsd ?? ''}
                  onChange={(e) => setRiskParameters({
                    ...riskParameters,
                    hardCeilingUsd: e.target.value ? Number(e.target.value) : undefined,
                  })}
                  className="flex-1 bg-[var(--cl-fill-control)] border border-[var(--cl-border)] rounded px-2 py-1 text-xs text-[var(--cl-text-primary)] placeholder-[var(--cl-text-secondary)] focus:outline-none focus:border-[var(--cl-accent-border)]"
                />
              </div>

              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={riskParameters.allowLossOfEntireAmount}
                  onChange={(e) => setRiskParameters({
                    ...riskParameters,
                    allowLossOfEntireAmount: e.target.checked,
                  })}
                  className="w-3.5 h-3.5 rounded accent-[#AE5630]"
                />
                <span className="text-[11px] text-[var(--cl-text-faint)]">I accept total loss risk</span>
              </label>
            </div>
          )}
        </div>

        {/* Strategy Actions */}
        <div className="space-y-2">
          <button
            onClick={() => setShowPineScriptModal(true)}
            className="w-full py-2.5 rounded-lg bg-[var(--cl-fill-accent)] border border-[var(--cl-accent-border)] text-[var(--cl-accent)] text-sm font-medium hover:bg-[var(--cl-fill-accent-hover)] transition-colors"
          >
            Generate PineScript Strategy
          </button>

          <div className="grid grid-cols-2 gap-2">
            {!isExecuting ? (
              <button
                onClick={handleStart}
                disabled={isKilled || !isConnected}
                className="py-2 rounded-lg bg-[var(--cl-fill-success)] border border-[var(--cl-success-border)] text-[var(--cl-success)] text-xs font-medium hover:bg-[var(--cl-fill-success-hover)] disabled:opacity-30 transition-colors"
              >
                Start Auto-Trading
              </button>
            ) : (
              <button
                onClick={handlePauseResume}
                className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                  isPaused
                    ? 'bg-[var(--cl-fill-success)] border border-[var(--cl-success-border)] text-[var(--cl-success)] hover:bg-[var(--cl-fill-success-hover)]'
                    : 'bg-[var(--cl-fill-warning)] border border-[var(--cl-warning-border)] text-[var(--cl-warning)] hover:bg-[var(--cl-fill-warning-hover)]'
                }`}
              >
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            )}

            <button
              onClick={handleStop}
              disabled={!isExecuting}
              className="py-2 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-[var(--cl-text-faint)] text-xs font-medium hover:bg-[var(--cl-fill-hover)] disabled:opacity-30 transition-colors"
            >
              Stop Strategy
            </button>
          </div>
        </div>

        {/* PANIC BUTTON */}
        <button
          onClick={handlePanic}
          disabled={positions.length === 0 && !isExecuting}
          className="panic-button w-full disabled:opacity-30 disabled:cursor-not-allowed"
        >
          PANIC — CLOSE EVERYTHING
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase">{label}</div>
      <div className={`text-sm font-mono font-medium ${className || 'text-[var(--cl-text-primary)]'}`}>{value}</div>
    </div>
  );
}

function RiskSlider({
  label, value, unit, min, max, step, onChange,
}: {
  label: string; value: number; unit: string;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-[var(--cl-text-faint)]">{label}</span>
        <span className="text-[11px] font-mono text-[var(--cl-text-primary)]">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-[var(--cl-border)] rounded-full appearance-none cursor-pointer accent-[#AE5630]"
      />
    </div>
  );
}
