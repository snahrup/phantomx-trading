'use client';

import { useState } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import type { RiskLevel } from '@/types/trading';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Play, Pause, Square, Skull, Code } from 'lucide-react';

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
              <AlertTriangle className="size-5 text-destructive" />
              <span className="text-sm font-medium text-destructive">KILL SWITCH ACTIVATED</span>
            </div>
            <p className="text-xs text-foreground">{killReason ?? 'All positions closed. Strategy halted.'}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setKilled(false); }}
              className="mt-2"
            >
              Acknowledge &amp; Reset
            </Button>
          </div>
        )}

        {/* Account Summary */}
        <Card className="glass-card border-0 py-0 gap-0">
          <CardContent className="p-3">
            <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Account</h3>
            <div className="grid grid-cols-2 gap-2">
              <StatItem label="Balance" value={`$${formatUsd(accountValue)}`} />
              <StatItem
                label="PnL"
                value={`${(stats?.totalPnl ?? 0) >= 0 ? '+' : ''}$${formatUsd(stats?.totalPnl ?? 0)}`}
                className={(stats?.totalPnl ?? 0) >= 0 ? 'text-claude-green' : 'text-destructive'}
              />
              <StatItem label="Win Rate" value={`${(stats?.winRate ?? 0).toFixed(1)}%`} />
              <StatItem label="Trades" value={`${stats?.totalTrades ?? 0}`} />
              <StatItem
                label="Drawdown"
                value={`${(stats?.maxDrawdown ?? 0).toFixed(1)}%`}
                className={(stats?.maxDrawdown ?? 0) > (riskParameters.maxDrawdownPercent / 2) ? 'text-yellow-500' : ''}
              />
              <StatItem
                label="Profit Factor"
                value={stats?.profitFactor === Infinity ? '—' : `${(stats?.profitFactor ?? 0).toFixed(2)}`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Open Positions */}
        {positions.length > 0 && (
          <Card className="glass-card border-0 py-0 gap-0">
            <CardContent className="p-3">
              <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">
                Open Positions <Badge variant="secondary" className="ml-1">{positions.length}</Badge>
              </h3>
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div key={pos.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${pos.side === 'long' ? 'text-claude-green' : 'text-destructive'}`}>
                        {pos.side.toUpperCase()}
                      </span>
                      <span className="text-foreground">{pos.size}</span>
                      <span className="text-muted-foreground">@ {formatPrice(pos.entryPrice)}</span>
                    </div>
                    <span className={pos.unrealizedPnl >= 0 ? 'text-claude-green' : 'text-destructive'}>
                      {pos.unrealizedPnl >= 0 ? '+' : ''}${formatUsd(pos.unrealizedPnl)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Risk Level Selector */}
        <Card className="glass-card border-0 py-0 gap-0">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider">Risk Level</h3>
              <Button
                variant="link"
                size="sm"
                onClick={() => setShowRiskConfig(!showRiskConfig)}
                className="text-[10px] h-auto p-0"
              >
                {showRiskConfig ? 'Hide' : 'Configure'}
              </Button>
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
              <div className="space-y-2 mt-3 pt-3">
                <Separator className="mb-3" />
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
                    className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
                  />
                  <input
                    type="number"
                    placeholder="Hard ceiling ($)"
                    value={riskParameters.hardCeilingUsd ?? ''}
                    onChange={(e) => setRiskParameters({
                      ...riskParameters,
                      hardCeilingUsd: e.target.value ? Number(e.target.value) : undefined,
                    })}
                    className="flex-1 bg-muted border border-border rounded px-2 py-1 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring"
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
                    className="w-3.5 h-3.5 rounded accent-primary"
                  />
                  <span className="text-[11px] text-foreground">I accept total loss risk</span>
                </label>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Strategy Actions */}
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={() => setShowPineScriptModal(true)}
            className="w-full py-2.5 rounded-lg bg-primary/10 border-primary/30 text-primary hover:bg-primary/15 transition-colors"
          >
            <Code className="size-4 mr-1.5" />
            Generate PineScript Strategy
          </Button>

          <div className="grid grid-cols-2 gap-2">
            {!isExecuting ? (
              <Button
                variant="outline"
                onClick={handleStart}
                disabled={isKilled || !isConnected}
                className="py-2 rounded-lg bg-claude-green/10 border-claude-green/30 text-claude-green hover:bg-claude-green/15 disabled:opacity-30 transition-colors"
              >
                <Play className="size-3.5 mr-1" />
                Start Auto-Trading
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handlePauseResume}
                className={`py-2 rounded-lg transition-colors ${
                  isPaused
                    ? 'bg-claude-green/10 border-claude-green/30 text-claude-green hover:bg-claude-green/15'
                    : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/15'
                }`}
              >
                {isPaused ? <Play className="size-3.5 mr-1" /> : <Pause className="size-3.5 mr-1" />}
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
            )}

            <Button
              variant="outline"
              onClick={handleStop}
              disabled={!isExecuting}
              className="py-2 rounded-lg bg-muted border-border text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <Square className="size-3.5 mr-1" />
              Stop Strategy
            </Button>
          </div>
        </div>

        {/* PANIC BUTTON */}
        <button
          onClick={handlePanic}
          disabled={positions.length === 0 && !isExecuting}
          className="panic-button w-full disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Skull className="size-4" />
          PANIC — CLOSE EVERYTHING
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={`text-sm font-mono font-medium ${className || 'text-foreground'}`}>{value}</div>
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
        <span className="text-[11px] text-foreground">{label}</span>
        <span className="text-[11px] font-mono text-foreground">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-border rounded-full appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}
