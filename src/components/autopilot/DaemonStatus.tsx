'use client';

import { memo, useEffect } from 'react';
import { useAxonStore, useAxonAgentSummary } from '@/store/axon-store';
import { FadeIn, PulseIndicator } from '@/components/motion';

/**
 * Daemon health indicator for the settings page.
 * Shows Axon daemon status, scheduler state, agent breakdown, and monthly cost.
 * Auto-refreshes every 30 seconds.
 */
export default memo(function DaemonStatus() {
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const schedulerRunning = useAxonStore((s) => s.schedulerRunning);
  const lastHealthCheck = useAxonStore((s) => s.lastHealthCheck);
  const monthlyCost = useAxonStore((s) => s.monthlyCostUsd);
  const agents = useAxonStore((s) => s.agents);
  const checkHealth = useAxonStore((s) => s.checkHealth);
  const fetchCompanyStatus = useAxonStore((s) => s.fetchCompanyStatus);

  const { working, idle, error } = useAxonAgentSummary();
  const totalAgents = agents.length;

  // Auto-refresh every 30s
  useEffect(() => {
    // Initial fetch
    checkHealth();
    fetchCompanyStatus();

    const interval = setInterval(() => {
      checkHealth();
      fetchCompanyStatus();
    }, 30_000);

    return () => clearInterval(interval);
  }, [checkHealth, fetchCompanyStatus]);

  const lastCheckStr = lastHealthCheck
    ? lastHealthCheck.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never';

  return (
    <FadeIn>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PulseIndicator
              active={daemonOnline}
              color={daemonOnline ? 'bg-claude-green' : 'bg-destructive'}
              size="w-2 h-2"
            />
            <span className="text-sm font-semibold">Axon Daemon</span>
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              daemonOnline
                ? 'bg-claude-green/10 text-claude-green'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
            {daemonOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* Status rows */}
        {daemonOnline ? (
          <div className="space-y-2 text-xs">
            {/* Scheduler */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scheduler</span>
              <span
                className={`font-medium ${
                  schedulerRunning ? 'text-claude-green' : 'text-amber-500'
                }`}
              >
                {schedulerRunning ? 'Running' : 'Stopped'}
              </span>
            </div>

            {/* Agent breakdown */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Agents</span>
              <span className="font-mono text-foreground">{totalAgents} total</span>
            </div>

            <div className="flex gap-3 pl-4">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-claude-green" />
                <span className="text-muted-foreground">
                  {working} <span className="text-[10px]">working</span>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                <span className="text-muted-foreground">
                  {idle} <span className="text-[10px]">idle</span>
                </span>
              </div>
              {error > 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  <span className="text-destructive">
                    {error} <span className="text-[10px]">error</span>
                  </span>
                </div>
              )}
            </div>

            {/* Monthly cost */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Monthly cost</span>
              <span className="font-mono text-foreground">${monthlyCost.toFixed(2)}</span>
            </div>

            {/* Last check */}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last check</span>
              <span className="text-muted-foreground font-mono">{lastCheckStr}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              The Axon daemon is not running. Agent heartbeats, trading pipelines, and
              autonomous operations are paused.
            </p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border">
              <svg
                className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="8" cy="8" r="6.5" />
                <path d="M8 5v3.5M8 11v.5" strokeLinecap="round" />
              </svg>
              <p className="text-[11px] text-muted-foreground">
                Start the daemon:{' '}
                <code className="text-foreground bg-muted px-1 py-0.5 rounded text-[10px]">
                  cd apps/backend && python -m company.daemon
                </code>
              </p>
            </div>

            {/* Last check */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last check</span>
              <span className="text-muted-foreground font-mono">{lastCheckStr}</span>
            </div>
          </div>
        )}
      </div>
    </FadeIn>
  );
});
