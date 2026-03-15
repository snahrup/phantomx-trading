'use client';

import { useState, useRef, useEffect } from 'react';
import { Pause, Play, Skull, Activity, Wallet, TrendingUp, Users, RotateCcw, Target } from 'lucide-react';
import { useTradingStore } from '@/store/trading-store';
import { useAxonStore } from '@/store/axon-store';
import { Button } from '@/components/ui/button';
import { getAxonClient } from '@/lib/axon/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function StatusBar() {
  const [killConfirmOpen, setKillConfirmOpen] = useState(false);
  const [killing, setKilling] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const isExecuting = useTradingStore(s => s.isExecuting);
  const isKilled = useTradingStore(s => s.isKilled);
  const isPaused = useTradingStore(s => s.isPaused);
  const setExecuting = useTradingStore(s => s.setExecuting);
  const setKilled = useTradingStore(s => s.setKilled);
  const setPausedStore = useTradingStore(s => s.setPaused);
  const accountValue = useTradingStore(s => s.accountValue);
  const positions = useTradingStore(s => s.positions);
  const profitGoal = useTradingStore(s => s.missionControlConfig.profitGoal);
  const reconnecting = useAxonStore(s => s.reconnecting);
  const agents = useAxonStore(s => s.agents);

  const activeAgents = agents.filter(a => a.status === 'working').length;
  const totalPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
  const pnlPct = accountValue > 0 ? (totalPnl / accountValue) * 100 : 0;

  const mode = isKilled ? 'KILLED' : isPaused ? 'PAUSED' : isExecuting ? 'AUTONOMOUS' : 'IDLE';
  const modeColor = {
    KILLED: 'text-red-500',
    PAUSED: 'text-amber-400',
    AUTONOMOUS: 'text-emerald-400',
    IDLE: 'text-zinc-500',
  }[mode];

  const handlePause = async () => {
    setPausing(true);
    setPauseError(null);
    try {
      const axon = getAxonClient();
      if (isPaused) {
        await axon.resumeAll();
        if (mountedRef.current) setPausedStore(false);
      } else {
        await axon.pauseAll();
        if (mountedRef.current) setPausedStore(true);
      }
    } catch (err) {
      console.error('Pause/resume failed:', err);
      if (mountedRef.current) {
        setPauseError(err instanceof Error ? err.message : 'Pause/resume failed');
      }
    } finally {
      if (mountedRef.current) setPausing(false);
    }
  };

  const handleKill = async () => {
    setKilling(true);
    setKillError(null);
    try {
      const axon = getAxonClient();

      // 1. Kill all agents on Axon
      await axon.killAll();

      // 2. Activate the server-side kill switch
      try {
        await fetch('/api/trading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'kill_switch', command: 'activate', reason: 'Emergency kill from Mission Control' }),
        });
      } catch (ksErr) {
        console.warn('Kill switch activation failed (continuing with position close):', ksErr);
      }

      // 3. Close all open positions — snapshot current positions to avoid stale reads
      const currentPositions = useTradingStore.getState().positions;
      const closeErrors: string[] = [];
      for (const pos of currentPositions) {
        try {
          await fetch('/api/phemex', {
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
        } catch (err) {
          closeErrors.push(`${pos.symbol}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 4. Cancel all open orders — must specify symbol per Phemex API requirement
      const cancelSymbols = new Set(currentPositions.map(p => p.symbol));
      for (const sym of cancelSymbols) {
        try {
          await fetch('/api/phemex', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cancel_all', symbol: sym }),
          });
        } catch (cancelErr) {
          console.warn(`Cancel all orders failed for ${sym}:`, cancelErr);
        }
      }

      // 5. Stop the mission orchestrator (task recycler)
      try {
        await fetch('/api/trading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop_orchestrator' }),
        });
      } catch (orchErr) {
        console.warn('Orchestrator stop failed:', orchErr);
      }

      // 6. Revert trading mode to manual so Axon stops auto-executing
      try {
        await fetch('/api/trading', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'set_mode',
            mode: 'manual',
            reason: 'Reverted to manual mode via kill switch from Mission Control',
          }),
        });
      } catch (modeErr) {
        console.warn('Trading mode revert failed:', modeErr);
      }

      if (!mountedRef.current) return;

      setKilled(true);
      setExecuting(false);
      setPausedStore(false);

      if (closeErrors.length > 0) {
        setKillError(`Kill completed but ${closeErrors.length} position(s) failed to close: ${closeErrors.join('; ')}`);
      }
    } catch (err) {
      console.error('Kill failed:', err);
      if (mountedRef.current) {
        setKillError(err instanceof Error ? err.message : 'Kill failed');
      }
    } finally {
      if (mountedRef.current) {
        setKilling(false);
        setKillConfirmOpen(false);
      }
    }
  };

  return (
    <>
      <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-2">
        <div className="flex items-center gap-4 text-sm">
          <span className={`font-bold flex items-center gap-1.5 ${modeColor}`}>
            <span className="inline-block w-2 h-2 rounded-full bg-current" />
            {mode}
          </span>

          {reconnecting && (
            <span className="text-amber-400 text-xs animate-pulse">Reconnecting...</span>
          )}

          <span className="text-border">|</span>

          <span className="flex items-center gap-1 text-foreground">
            <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
            {accountValue > 0 ? `$${accountValue.toFixed(2)} USDT` : '—'}
          </span>

          <span className={`flex items-center gap-1 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            <TrendingUp className="w-3.5 h-3.5" />
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
          </span>

          <span className="text-border">|</span>

          <span className="flex items-center gap-1 text-muted-foreground">
            <Activity className="w-3.5 h-3.5" />
            {positions.length} positions
          </span>

          <span className="text-border">|</span>

          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            {activeAgents} agents active
          </span>

          {profitGoal && profitGoal > 0 && (
            <>
              <span className="text-border">|</span>
              <span className={`flex items-center gap-1 ${
                totalPnl >= profitGoal ? 'text-emerald-400 font-bold' : 'text-muted-foreground'
              }`}>
                <Target className="w-3.5 h-3.5" />
                ${totalPnl.toFixed(2)} / ${profitGoal.toFixed(0)} goal
                {totalPnl > 0 && totalPnl < profitGoal && (
                  <span className="text-xs ml-0.5">({((totalPnl / profitGoal) * 100).toFixed(0)}%)</span>
                )}
                {totalPnl >= profitGoal && <span className="text-xs ml-0.5">REACHED</span>}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pauseError && (
            <span className="text-red-400 text-xs">{pauseError}</span>
          )}

          {isExecuting && !isKilled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePause}
              disabled={pausing}
              className={isPaused
                ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
              }
            >
              {isPaused ? <Play className="w-3.5 h-3.5 mr-1" /> : <Pause className="w-3.5 h-3.5 mr-1" />}
              {pausing ? '...' : isPaused ? 'RESUME' : 'PAUSE'}
            </Button>
          )}

          {isExecuting && !isKilled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setKillConfirmOpen(true)}
              disabled={killing}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Skull className="w-3.5 h-3.5 mr-1" />
              KILL
            </Button>
          )}

          {isKilled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setKilled(false);
                setExecuting(false);
              }}
              className="border-zinc-500/30 text-zinc-300 hover:bg-zinc-500/10"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              NEW MISSION
            </Button>
          )}
        </div>
      </div>

      <Dialog open={killConfirmOpen} onOpenChange={setKillConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emergency Kill Switch</DialogTitle>
            <DialogDescription>
              This will immediately close ALL open positions at market price and stop all agent activity.
              This action cannot be undone. Are you sure?
            </DialogDescription>
          </DialogHeader>

          {killError && (
            <p className="text-sm text-red-400 px-1">{killError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setKillConfirmOpen(false)} disabled={killing}>Cancel</Button>
            <Button
              onClick={handleKill}
              className="bg-red-600 hover:bg-red-700"
              disabled={killing}
            >
              {killing ? 'Closing positions...' : 'KILL — Close Everything'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
