'use client';

import { useState, useEffect, useRef } from 'react';
import { Rocket, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTradingStore, RISK_PRESETS } from '@/store/trading-store';
import { useAxonStore } from '@/store/axon-store';
import { getAxonClient } from '@/lib/axon/client';
import TokenSelector from './TokenSelector';
import type { RiskLevel, TeamSize, ScanInterval } from '@/types/mission-control';
import type { AxonPriority } from '@/lib/axon/types';

const RISK_LEVELS: { id: RiskLevel; label: string }[] = [
  { id: 'conservative', label: 'Conservative' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'degen', label: 'Degen' },
];

const MAX_POSITIONS_OPTIONS = [1, 2, 3, 5] as const;

const TEAM_SIZE_OPTIONS: { id: TeamSize; label: string; desc: string }[] = [
  { id: 'lean', label: 'Lean', desc: '2 analysts, faster, lower cost' },
  { id: 'standard', label: 'Standard', desc: '4 analysts + full debate' },
  { id: 'full', label: 'Full', desc: '4 analysts + microstructure + on-chain' },
];

const SCAN_INTERVAL_OPTIONS: { value: ScanInterval; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
];

const RISK_PRIORITY_MAP: Record<RiskLevel, AxonPriority> = {
  conservative: 'low',
  moderate: 'medium',
  aggressive: 'high',
  degen: 'critical',
};

export default function LaunchPanel() {
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [accountBalance, setAccountBalance] = useState<number | null>(null);
  const mountedRef = useRef(true);

  const config = useTradingStore(s => s.missionControlConfig);
  const isExecuting = useTradingStore(s => s.isExecuting);
  const isKilled = useTradingStore(s => s.isKilled);
  const setConfig = useTradingStore(s => s.setMissionControlConfig);
  const setExecuting = useTradingStore(s => s.setExecuting);
  const setKilled = useTradingStore(s => s.setKilled);
  const setRiskParameters = useTradingStore(s => s.setRiskParameters);
  const setActiveMissionIssueId = useTradingStore(s => s.setActiveMissionIssueId);
  const setMissionStartedAt = useTradingStore(s => s.setMissionStartedAt);
  const setConnected = useTradingStore(s => s.setConnected);

  useEffect(() => {
    mountedRef.current = true;
    const fetchBalance = async () => {
      try {
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'account' }),
        });
        const data = await res.json();
        if (!mountedRef.current) return;
        // API returns { account: { balances, totalUsdValue } }
        // Find USDT free balance, or fall back to totalUsdValue
        const usdtBalance = data.account?.balances?.find(
          (b: { currency: string; free: number }) => b.currency === 'USDT'
        );
        const balance = usdtBalance?.free ?? data.account?.totalUsdValue ?? null;
        setAccountBalance(balance);
        // API responded — mark connected so DataProvider loads OHLCV/ticker for charts
        if (balance !== null) {
          setConnected(true);
        }
      } catch {
        if (!mountedRef.current) return;
        setAccountBalance(null);
      }
    };
    fetchBalance();
    return () => { mountedRef.current = false; };
  }, []);

  const handleLaunch = async () => {
    // Guard: prevent launching if no pairs selected or already active
    if (config.selectedPairs.length === 0 || isExecuting || isKilled) return;

    setLaunching(true);
    setLaunchError(null);

    // Set mission timestamp FIRST — before any async work — so the polling
    // hook's fetchActivity() filter immediately ignores old events.
    const missionTs = new Date().toISOString();
    setMissionStartedAt(missionTs);
    useAxonStore.getState().clearActivity();

    try {
      // Switch trading mode to autonomous so Axon auto-forwards Wave 5 recommendations
      await fetch('/api/trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_mode',
          mode: 'autonomous',
          reason: 'Autonomous mode activated from Mission Control launch',
        }),
      });

      // Start the mission orchestrator — continuous task recycler that keeps
      // agents scanning, researching, debating, and executing non-stop
      const orchRes = await fetch('/api/trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_orchestrator',
          selectedPairs: config.selectedPairs,
          riskLevel: config.riskLevel,
          maxConcurrentPositions: config.maxConcurrentPositions,
          profitGoal: config.profitGoal,
          startingBalance: accountBalance,
          teamSize: config.teamSize,
          scanIntervalSec: config.scanIntervalSec,
        }),
      });
      if (!orchRes.ok) {
        const orchData = await orchRes.json();
        throw new Error(orchData.error || 'Failed to start orchestrator');
      }

      const axon = getAxonClient();
      const riskPreset = RISK_PRESETS[config.riskLevel];

      // Build short symbol labels for the title (e.g. "BTC, ETH, SOL")
      const pairLabels = config.selectedPairs.map(p => p.split('/')[0]).join(', ');
      const riskLabel = config.riskLevel.charAt(0).toUpperCase() + config.riskLevel.slice(1);

      // 1. Create a trading issue on Axon with the full mission config
      const missionConfig = {
        riskLevel: config.riskLevel,
        riskParameters: riskPreset,
        selectedPairs: config.selectedPairs,
        maxConcurrentPositions: config.maxConcurrentPositions,
        profitGoal: config.profitGoal,
        startingBalance: accountBalance,
        launchedAt: new Date().toISOString(),
      };

      const issueResult = await axon.createIssue({
        title: `Trading Mission: ${pairLabels} — ${riskLabel}`,
        description: [
          `Autonomous trading mission launched from Mission Control.`,
          '',
          '```json',
          JSON.stringify(missionConfig, null, 2),
          '```',
          '',
          `**Pairs**: ${config.selectedPairs.join(', ')}`,
          `**Risk Level**: ${riskLabel}`,
          `**Max Concurrent Positions**: ${config.maxConcurrentPositions}`,
          `**Stop Loss**: ${riskPreset.stopLossPercent}%`,
          `**Take Profit**: ${riskPreset.takeProfitPercent}%`,
          `**Max Daily Loss**: ${riskPreset.maxDailyLossPercent}%`,
          `**Max Drawdown**: ${riskPreset.maxDrawdownPercent}%`,
          config.profitGoal ? `**Profit Goal**: $${config.profitGoal} USDT` : '',
          accountBalance !== null ? `**Starting Balance**: $${accountBalance.toFixed(2)} USDT` : '',
        ].filter(Boolean).join('\n'),
        issue_type: 'trading',
        priority: RISK_PRIORITY_MAP[config.riskLevel],
      });

      if (!issueResult.ok) {
        throw new Error(`Failed to create trading issue: ${issueResult.error}`);
      }

      if (!mountedRef.current) return;

      const issueId = issueResult.data.id;
      setActiveMissionIssueId(issueId);

      // Inject a launch event into the (already cleared) feed
      const axonStore = useAxonStore.getState();
      axonStore.handleActivity({
        id: `launch-${Date.now()}`,
        action: 'mission_launched',
        timestamp: new Date().toISOString(),
        detail: {
          agent_name: 'Mission Control',
          content: `Trading mission launched: ${pairLabels} — ${riskLabel} mode. ${config.maxConcurrentPositions} max positions.${config.profitGoal ? ` Target: $${config.profitGoal} profit.` : ''} Waking agents...`,
        },
      });

      // 2. Update local pipeline config with matching risk parameters
      const configRes = await fetch('/api/trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'config',
          updates: {
            riskLevel: config.riskLevel,
            maxOpenPositions: config.maxConcurrentPositions,
            maxPositionSizePercent: riskPreset.maxPositionSizePercent,
            stopLossPercent: riskPreset.stopLossPercent,
            takeProfitPercent: riskPreset.takeProfitPercent,
            maxDailyLossPercent: riskPreset.maxDailyLossPercent,
            maxDrawdownPercent: riskPreset.maxDrawdownPercent,
            trailingStopPercent: riskPreset.trailingStopPercent,
          },
        }),
      });

      if (!configRes.ok) {
        console.warn('Pipeline config update failed:', configRes.status);
      }

      if (!mountedRef.current) return;

      // Also update the store's risk parameters to stay in sync
      setRiskParameters(riskPreset);

      // 3. Wake agents so they're ready to pick up orchestrator-created issues.
      // NOTE: We do NOT set heartbeat_interval_s here. The orchestrator handles
      // targeted wakeups via wakeupAgent() when it creates analysis/monitoring
      // issues. Setting heartbeat intervals on all 13 agents caused Axon to
      // spawn a Claude terminal every ~5 seconds — all producing zero work
      // ($0.00 cost, 94 chars, no tools) because the generic heartbeat had
      // no issue context. The orchestrator is the sole work dispatcher.
      try {
        // Clear any leftover heartbeat intervals from a previous mission so
        // the scheduler doesn't re-spawn terminals for idle agents.
        const agentsResult = await axon.listAgents();
        if (agentsResult.ok) {
          const clearOps = agentsResult.data
            .filter((a: { heartbeat_interval_s: number }) => a.heartbeat_interval_s > 0)
            .map((a: { id: string }) =>
              axon.updateAgent(a.id, { heartbeat_interval_s: 0 }).catch(() => {})
            );
          if (clearOps.length > 0) await Promise.all(clearOps);
        }

        await axon.wakeAll();
        if (mountedRef.current) {
          axonStore.handleActivity({
            id: `wake-${Date.now()}`,
            action: 'agents_woken',
            timestamp: new Date().toISOString(),
            detail: {
              agent_name: 'Mission Control',
              content: `All agents woken. Orchestrator will dispatch targeted work — no background heartbeat spam.`,
            },
          });
        }
      } catch (wakeErr) {
        console.warn('Agent wake failed (agents may not be online):', wakeErr);
        if (mountedRef.current) {
          axonStore.handleActivity({
            id: `wake-err-${Date.now()}`,
            action: 'wake_failed',
            timestamp: new Date().toISOString(),
            detail: {
              agent_name: 'Mission Control',
              content: `Warning: Agent wake call failed. Axon may not be running. Agents will pick up the mission when they come online.`,
            },
          });
        }
      }

      if (!mountedRef.current) return;

      // Immediately fetch agent statuses and recent activity
      axonStore.fetchAgents().catch(() => {});
      axonStore.fetchActivity(50).catch(() => {});

      setKilled(false);
      setExecuting(true);
    } catch (err) {
      console.error('Launch failed:', err);
      if (!mountedRef.current) return;
      setLaunchError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      if (mountedRef.current) {
        setLaunching(false);
      }
    }
  };

  const canLaunch = !launching && !isExecuting && !isKilled && config.selectedPairs.length > 0;

  return (
    <div className="flex items-center justify-center h-full overflow-y-auto py-4">
      <Card className="w-full max-w-md border-border my-auto">
        <CardContent className="p-6 space-y-5">
          <h2 className="text-lg font-bold text-foreground">Launch Autonomous Trading</h2>

          {/* Profit Goal */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase text-muted-foreground tracking-wider">Profit Goal (optional)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="number"
                min={0}
                step={10}
                placeholder="e.g. 500"
                value={config.profitGoal ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfig({ profitGoal: val === '' ? null : Math.max(0, Number(val)) });
                }}
                className="w-full pl-9 pr-14 py-2 bg-muted border border-transparent rounded text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/40"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">USDT</span>
            </div>
            {config.profitGoal && accountBalance !== null && accountBalance > 0 && (
              <p className="text-xs text-muted-foreground">
                {((config.profitGoal / accountBalance) * 100).toFixed(0)}% return on ${accountBalance.toFixed(0)} balance
              </p>
            )}
          </div>

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

          {/* Agent Team Size */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase text-muted-foreground tracking-wider">Agent Team</label>
            <div className="flex gap-1.5">
              {TEAM_SIZE_OPTIONS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setConfig({ teamSize: t.id })}
                  title={t.desc}
                  className={`px-3 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                    config.teamSize === t.id
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {TEAM_SIZE_OPTIONS.find(t => t.id === config.teamSize)?.desc}
            </p>
          </div>

          {/* Scan Interval */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase text-muted-foreground tracking-wider">Scan Interval</label>
            <div className="flex gap-1.5">
              {SCAN_INTERVAL_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setConfig({ scanIntervalSec: s.value })}
                  className={`px-3 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                    config.scanIntervalSec === s.value
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
                  }`}
                >
                  {s.label}
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

          {/* Already executing warning */}
          {isExecuting && (
            <p className="text-center text-xs text-amber-400">
              A mission is already running. Use the kill switch to stop it first.
            </p>
          )}

          {/* Kill switch active warning */}
          {isKilled && (
            <p className="text-center text-xs text-red-400">
              Kill switch is active. Reset it before launching a new mission.
            </p>
          )}

          {/* Launch */}
          <Button
            onClick={handleLaunch}
            disabled={!canLaunch}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3"
            size="lg"
          >
            <Rocket className="w-4 h-4 mr-2" />
            {launching ? 'Starting agents...' : 'START AUTONOMOUS TRADING'}
          </Button>

          {launchError && (
            <p className="text-center text-xs text-red-400">{launchError}</p>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Kill switch is always active as safety net
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
