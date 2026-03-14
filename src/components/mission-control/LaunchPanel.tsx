'use client';

import { useState, useEffect } from 'react';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTradingStore } from '@/store/trading-store';
import { getAxonClient } from '@/lib/axon/client';
import TokenSelector from './TokenSelector';
import type { RiskLevel } from '@/types/mission-control';

const RISK_LEVELS: { id: RiskLevel; label: string }[] = [
  { id: 'conservative', label: 'Conservative' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'degen', label: 'Degen' },
];

const MAX_POSITIONS_OPTIONS = [1, 2, 3, 5] as const;

export default function LaunchPanel() {
  const [launching, setLaunching] = useState(false);
  const [accountBalance, setAccountBalance] = useState<number | null>(null);

  const config = useTradingStore(s => s.missionControlConfig);
  const setConfig = useTradingStore(s => s.setMissionControlConfig);
  const setExecuting = useTradingStore(s => s.setExecuting);
  const setKilled = useTradingStore(s => s.setKilled);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'account' }),
        });
        const data = await res.json();
        setAccountBalance(data.balance?.free ?? data.totalWalletBalance ?? null);
      } catch { /* silent */ }
    };
    fetchBalance();
  }, []);

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      const axon = getAxonClient();
      await axon.wakeAll();
      setKilled(false);
      setExecuting(true);
    } catch (err) {
      console.error('Launch failed:', err);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <Card className="w-full max-w-md border-border">
        <CardContent className="p-6 space-y-5">
          <h2 className="text-lg font-bold text-foreground">Launch Autonomous Trading</h2>

          {/* Risk Level */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase text-muted-foreground tracking-wider">Risk Level</label>
            <div className="flex gap-1.5">
              {RISK_LEVELS.map(r => (
                <button
                  key={r.id}
                  onClick={() => setConfig({ riskLevel: r.id })}
                  className={`px-3 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                    config.riskLevel === r.id
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Token Selector */}
          <TokenSelector
            selected={config.selectedPairs}
            onChange={(pairs) => setConfig({ selectedPairs: pairs })}
            onFilterChange={(filter) => setConfig({ pairFilter: filter })}
            activeFilter={config.pairFilter}
          />

          {/* Max Concurrent Positions */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase text-muted-foreground tracking-wider">Max Concurrent Positions</label>
            <div className="flex gap-1.5">
              {MAX_POSITIONS_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setConfig({ maxConcurrentPositions: n })}
                  className={`px-3 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                    config.maxConcurrentPositions === n
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted rounded text-sm">
            <span className="text-muted-foreground">Available Balance</span>
            <span className="text-foreground font-medium">
              {accountBalance !== null ? `$${accountBalance.toFixed(2)} USDT` : '—'}
            </span>
          </div>

          {/* Launch */}
          <Button
            onClick={handleLaunch}
            disabled={launching || config.selectedPairs.length === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3"
            size="lg"
          >
            <Rocket className="w-4 h-4 mr-2" />
            {launching ? 'Starting agents...' : 'START AUTONOMOUS TRADING'}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Kill switch is always active as safety net
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
