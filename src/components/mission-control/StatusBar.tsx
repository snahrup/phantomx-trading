'use client';

import { useState } from 'react';
import { Pause, Play, Skull, Activity, Wallet, TrendingUp, Users } from 'lucide-react';
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
  const [pausing, setPausing] = useState(false);

  const isExecuting = useTradingStore(s => s.isExecuting);
  const isKilled = useTradingStore(s => s.isKilled);
  const isPaused = useTradingStore(s => s.isPaused);
  const setExecuting = useTradingStore(s => s.setExecuting);
  const setKilled = useTradingStore(s => s.setKilled);
  const setPausedStore = useTradingStore(s => s.setPaused);
  const accountValue = useTradingStore(s => s.accountValue);
  const positions = useTradingStore(s => s.positions);
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
    const axon = getAxonClient();
    try {
      if (isPaused) {
        await axon.resumeAll();
        setPausedStore(false);
      } else {
        await axon.pauseAll();
        setPausedStore(true);
      }
    } finally {
      setPausing(false);
    }
  };

  const handleKill = async () => {
    setKilling(true);
    const axon = getAxonClient();
    try {
      await axon.killAll();
      for (const pos of positions) {
        await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'close_position', symbol: pos.symbol }),
        });
      }
      await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_all' }),
      });
      setKilled(true);
      setExecuting(false);
      setPausedStore(false);
    } finally {
      setKilling(false);
      setKillConfirmOpen(false);
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
            ${accountValue?.toFixed(2) ?? '—'} USDT
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
        </div>

        <div className="flex items-center gap-2">
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
              {isPaused ? 'RESUME' : 'PAUSE'}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillConfirmOpen(false)}>Cancel</Button>
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
