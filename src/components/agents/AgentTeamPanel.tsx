'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FadeIn, StaggerList, StaggerItem, HoverCard,
} from '@/components/motion';
import AgentStatusDot from './AgentStatusDot';
import AgentDetailModal from './AgentDetailModal';
import { getAxonClient } from '@/lib/axon/client';
import type { AxonAgent, AxonAgentSchedule } from '@/lib/axon/types';
import {
  RefreshCw, Users, Crown, Search, BarChart3, Wrench,
  Zap, AlertTriangle, Clock, Play, Calendar, ListOrdered,
  ChevronRight, Timer, CircleDot,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 15_000;

type ViewMode = 'teams' | 'schedule';

// ---------------------------------------------------------------------------
// Team definitions
// ---------------------------------------------------------------------------

interface TeamDef {
  name: string;
  keywords: string[];
  color: string;
  bgColor: string;
  headerBg: string;
  textColor: string;
  icon: typeof Crown;
}

const TEAMS: TeamDef[] = [
  {
    name: 'Leadership',
    keywords: ['CEO', 'Head of Research', 'Head of Trading'],
    color: 'border-amber-500/40',
    bgColor: 'bg-amber-500/[0.03]',
    headerBg: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    icon: Crown,
  },
  {
    name: 'Research',
    keywords: ['Scanner Monitor', 'Market Research', 'On-Chain', 'Sentiment', 'Microstructure'],
    color: 'border-cyan-500/40',
    bgColor: 'bg-cyan-500/[0.03]',
    headerBg: 'bg-cyan-500/10',
    textColor: 'text-cyan-400',
    icon: Search,
  },
  {
    name: 'Trading',
    keywords: ['Strategy Architect', 'Risk Officer', 'Execution Trader', 'Trade Analyst', 'Portfolio Manager', 'Backtester'],
    color: 'border-emerald-500/40',
    bgColor: 'bg-emerald-500/[0.03]',
    headerBg: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    icon: BarChart3,
  },
  {
    name: 'Operations',
    keywords: ['Meta-Strategist', 'Founding Engineer', 'Dashboard Engineer', 'UI Designer', 'UX Researcher', 'Head of QA', 'QA Engineer', 'Fix Tracker'],
    color: 'border-violet-500/40',
    bgColor: 'bg-violet-500/[0.03]',
    headerBg: 'bg-violet-500/10',
    textColor: 'text-violet-400',
    icon: Wrench,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyAgent(agent: AxonAgentSchedule): string {
  const n = agent.name.toLowerCase() + ' ' + (agent.role ?? '').toLowerCase() + ' ' + (agent.title ?? '').toLowerCase();
  for (const team of TEAMS) {
    for (const kw of team.keywords) {
      if (n.includes(kw.toLowerCase())) return team.name;
    }
  }
  return 'Operations';
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds <= 0) return 'OVERDUE';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function priorityColor(p: string): string {
  switch (p) {
    case 'critical': return 'text-red-400 bg-red-400/10 border-red-400/30';
    case 'high': return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
    case 'medium': return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
    default: return 'text-muted-foreground bg-muted border-border';
  }
}

function runStatusColor(status: string | undefined): string {
  switch (status) {
    case 'completed': return 'text-emerald-400';
    case 'failed': case 'error': return 'text-red-400';
    case 'running': return 'text-amber-400';
    case 'skipped': return 'text-muted-foreground';
    default: return 'text-muted-foreground';
  }
}

function teamStatusSummary(agents: AxonAgentSchedule[]): { working: number; error: number; total: number } {
  return {
    working: agents.filter(a => a.status === 'working').length,
    error: agents.filter(a => a.status === 'error').length,
    total: agents.length,
  };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AgentTeamPanel() {
  const [agents, setAgents] = useState<AxonAgentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('schedule');
  const [wakingId, setWakingId] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch agents (using schedule endpoint for enriched data)
  // -----------------------------------------------------------------------
  const fetchAgents = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const result = await getAxonClient().getAgentSchedule();
      if (!result.ok) throw new Error(result.error);
      setAgents(Array.isArray(result.data) ? result.data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agents');
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(() => fetchAgents(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  // -----------------------------------------------------------------------
  // Wake single agent
  // -----------------------------------------------------------------------
  const handleWakeAgent = useCallback(async (agentId: string) => {
    setWakingId(agentId);
    try {
      await getAxonClient().wakeupAgent(agentId);
      // Refresh after a brief delay to let the backend process
      setTimeout(() => fetchAgents(), 1500);
    } finally {
      setTimeout(() => setWakingId(null), 2000);
    }
  }, [fetchAgents]);

  // -----------------------------------------------------------------------
  // Grouped by team (for Teams view)
  // -----------------------------------------------------------------------
  const teamGroups = useMemo(
    () => TEAMS.map(team => ({
      def: team,
      agents: agents.filter(a => classifyAgent(a) === team.name),
    })),
    [agents],
  );

  // -----------------------------------------------------------------------
  // Overall stats
  // -----------------------------------------------------------------------
  const totalWorking = agents.filter(a => a.status === 'working').length;
  const totalErrors = agents.filter(a => a.status === 'error').length;
  const totalOverdue = agents.filter(a => a.is_overdue && a.status !== 'paused' && a.status !== 'error').length;
  const totalWithWork = agents.filter(a => a.assigned_issues.length > 0).length;

  // Selected agent for modal
  const selectedAgent: AxonAgent | null = agents.find(a => a.id === selectedAgentId) ?? null;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <FadeIn className="flex flex-col gap-5">
      {/* ================================================================ */}
      {/* TOP BAR: Stats + View Toggle + Refresh */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {agents.length} Agents
            </span>
          </div>

          {/* Status pills */}
          <div className="flex items-center gap-1.5">
            {totalWorking > 0 && (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                <Zap className="w-3 h-3 mr-0.5" />
                {totalWorking} working
              </Badge>
            )}
            {totalErrors > 0 && (
              <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">
                <AlertTriangle className="w-3 h-3 mr-0.5" />
                {totalErrors} err
              </Badge>
            )}
            {totalOverdue > 0 && (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                <Timer className="w-3 h-3 mr-0.5" />
                {totalOverdue} overdue
              </Badge>
            )}
            {totalWithWork > 0 && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {totalWithWork} with work
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border/50 bg-card/60 p-0.5">
            <button
              onClick={() => setViewMode('schedule')}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors',
                viewMode === 'schedule'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Calendar className="w-3 h-3 inline mr-1" />
              Schedule
            </button>
            <button
              onClick={() => setViewMode('teams')}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors',
                viewMode === 'teams'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ListOrdered className="w-3 h-3 inline mr-1" />
              Teams
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => fetchAgents(true)}
            disabled={refreshing}
            title="Refresh agent status"
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* ERROR STATE */}
      {/* ================================================================ */}
      {error && !loading && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Failed to reach Axon daemon: {error}</span>
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => fetchAgents(true)}>
            Retry
          </Button>
        </div>
      )}

      {/* ================================================================ */}
      {/* LOADING SKELETON */}
      {/* ================================================================ */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border/50 bg-card/30 p-4 animate-pulse">
              <div className="h-4 w-24 bg-muted rounded mb-4" />
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map(j => (
                  <div key={j} className="h-20 bg-muted/50 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================ */}
      {/* SCHEDULE VIEW — flat list sorted by next due */}
      {/* ================================================================ */}
      {!loading && viewMode === 'schedule' && (
        <div className="flex flex-col gap-2">
          {agents.map(agent => (
            <ScheduleRow
              key={agent.id}
              agent={agent}
              waking={wakingId === agent.id}
              onWake={() => handleWakeAgent(agent.id)}
              onClick={() => setSelectedAgentId(agent.id)}
            />
          ))}
          {agents.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">No agents found</div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* TEAMS VIEW — grouped cards */}
      {/* ================================================================ */}
      {!loading && viewMode === 'teams' && (
        <StaggerList className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {teamGroups.map(({ def, agents: teamAgents }) => {
            const summary = teamStatusSummary(teamAgents);
            const Icon = def.icon;

            return (
              <StaggerItem key={def.name}>
                <div className={cn(
                  'rounded-xl border backdrop-blur-sm overflow-hidden',
                  def.color,
                  def.bgColor,
                )}>
                  {/* Team Header */}
                  <div className={cn('px-4 py-3 flex items-center justify-between', def.headerBg)}>
                    <div className="flex items-center gap-2">
                      <Icon className={cn('w-4 h-4', def.textColor)} />
                      <span className={cn('text-xs font-bold uppercase tracking-wider', def.textColor)}>
                        {def.name}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-current/20">
                        {teamAgents.length}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {summary.working > 0 && (
                        <span className="text-emerald-400">{summary.working} active</span>
                      )}
                      {summary.error > 0 && (
                        <span className="text-red-400">{summary.error} err</span>
                      )}
                    </div>
                  </div>

                  {/* Agent Grid */}
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3 gap-2">
                    {teamAgents.length === 0 && (
                      <div className="col-span-full text-xs text-muted-foreground py-4 text-center">
                        No agents matched to this team
                      </div>
                    )}
                    {teamAgents.map(agent => (
                      <TeamAgentCard
                        key={agent.id}
                        agent={agent}
                        teamColor={def.textColor}
                        waking={wakingId === agent.id}
                        onWake={() => handleWakeAgent(agent.id)}
                        onClick={() => setSelectedAgentId(agent.id)}
                      />
                    ))}
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerList>
      )}

      {/* ================================================================ */}
      {/* DETAIL MODAL */}
      {/* ================================================================ */}
      <AgentDetailModal
        agent={selectedAgent}
        open={selectedAgent !== null}
        onClose={() => setSelectedAgentId(null)}
      />
    </FadeIn>
  );
}

// ---------------------------------------------------------------------------
// Schedule Row — full-width row for the schedule view
// ---------------------------------------------------------------------------

function ScheduleRow({
  agent,
  waking,
  onWake,
  onClick,
}: {
  agent: AxonAgentSchedule;
  waking: boolean;
  onWake: () => void;
  onClick: () => void;
}) {
  const isPaused = agent.status === 'paused';
  const isError = agent.status === 'error';
  const isWorking = agent.status === 'working';
  const countdown = formatCountdown(agent.time_until_due_s);
  const hasWork = agent.assigned_issues.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border bg-card/60 px-4 py-3 transition-colors',
        'hover:border-border/80 cursor-pointer',
        agent.is_overdue && !isError && !isPaused && 'border-amber-500/40 bg-amber-500/[0.03]',
        isError && 'border-red-500/30 bg-red-500/[0.02]',
        isWorking && 'border-emerald-500/30 bg-emerald-500/[0.02]',
        !agent.is_overdue && !isError && !isWorking && 'border-border/40',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div className="flex items-center gap-4">
        {/* Status + Name */}
        <div className="flex items-center gap-2 min-w-0 w-48 shrink-0">
          <AgentStatusDot status={agent.status} size="sm" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-foreground truncate">{agent.name}</div>
            <div className="text-[9px] text-muted-foreground truncate">{agent.role || agent.title}</div>
          </div>
        </div>

        {/* Next Due countdown */}
        <div className="flex items-center gap-1.5 w-24 shrink-0">
          <Clock className={cn(
            'w-3 h-3',
            agent.is_overdue ? 'text-amber-400' : 'text-muted-foreground',
          )} />
          <span className={cn(
            'text-[10px] font-mono',
            agent.is_overdue && !isError && !isPaused ? 'text-amber-400 font-semibold' : 'text-muted-foreground',
            isPaused && 'text-muted-foreground/50',
          )}>
            {isPaused ? 'paused' : isError ? 'error' : countdown}
          </span>
        </div>

        {/* Last run status */}
        <div className="flex items-center gap-1.5 w-24 shrink-0">
          <CircleDot className={cn('w-3 h-3', runStatusColor(agent.last_run?.status))} />
          <span className={cn('text-[10px]', runStatusColor(agent.last_run?.status))}>
            {agent.last_run ? agent.last_run.status : 'no runs'}
          </span>
        </div>

        {/* Last heartbeat */}
        <div className="text-[10px] text-muted-foreground w-20 shrink-0 font-mono">
          {relativeTime(agent.last_heartbeat_at)}
        </div>

        {/* Runs in 24h */}
        <div className="text-[10px] text-muted-foreground w-16 shrink-0">
          {agent.runs_24h} run{agent.runs_24h !== 1 ? 's' : ''}/24h
        </div>

        {/* Assigned work queue */}
        <div className="flex-1 min-w-0">
          {hasWork ? (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="text-[9px] text-muted-foreground shrink-0">Queue:</span>
              {agent.assigned_issues.slice(0, 3).map((issue) => (
                <Badge
                  key={issue.id}
                  variant="outline"
                  className={cn('text-[8px] px-1.5 py-0 h-4 shrink-0 border', priorityColor(issue.priority))}
                >
                  {issue.title.length > 30 ? issue.title.slice(0, 30) + '…' : issue.title}
                </Badge>
              ))}
              {agent.assigned_issues.length > 3 && (
                <span className="text-[9px] text-muted-foreground">+{agent.assigned_issues.length - 3}</span>
              )}
            </div>
          ) : (
            <span className="text-[9px] text-muted-foreground/50 italic">no assigned work</span>
          )}
        </div>

        {/* Run Now button */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onWake(); }}
          disabled={waking || isWorking}
          title="Run this agent now"
        >
          <Play className={cn('w-3.5 h-3.5', waking && 'animate-pulse text-emerald-400')} />
        </Button>
      </div>

      {/* Expandable: last run log preview */}
      {agent.last_run?.log_preview && (
        <div className="mt-2 pl-8 flex items-start gap-1.5">
          <ChevronRight className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-[9px] text-muted-foreground/70 line-clamp-1 font-mono">
            {agent.last_run.log_preview}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Agent Card — compact card for the teams grid view
// ---------------------------------------------------------------------------

function TeamAgentCard({
  agent,
  teamColor,
  waking,
  onWake,
  onClick,
}: {
  agent: AxonAgentSchedule;
  teamColor: string;
  waking: boolean;
  onWake: () => void;
  onClick: () => void;
}) {
  const countdown = formatCountdown(agent.time_until_due_s);
  const hasWork = agent.assigned_issues.length > 0;

  return (
    <HoverCard
      className={cn(
        'rounded-lg border border-border/40 bg-card/60 p-2.5 cursor-pointer',
        'hover:border-border/80 transition-colors',
        agent.status === 'error' && 'border-red-500/30',
        agent.is_overdue && agent.status !== 'error' && agent.status !== 'paused' && 'border-amber-500/30',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      {/* Top row: name + status dot + run now */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <AgentStatusDot status={agent.status} size="sm" />
          <span className="text-[11px] font-semibold text-foreground truncate">
            {agent.name}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-5 w-5 -mr-1"
          onClick={(e) => { e.stopPropagation(); onWake(); }}
          disabled={waking || agent.status === 'working'}
          title="Run now"
        >
          <Play className={cn('w-2.5 h-2.5', waking && 'animate-pulse text-emerald-400')} />
        </Button>
      </div>

      {/* Role subtitle */}
      <div className="text-[9px] text-muted-foreground truncate mb-1.5">
        {agent.role || agent.title || 'Agent'}
      </div>

      {/* Next due / status */}
      <div className="flex items-center gap-1 mb-1">
        <Clock className={cn(
          'w-2.5 h-2.5',
          agent.is_overdue && agent.status !== 'error' && agent.status !== 'paused'
            ? 'text-amber-400' : 'text-muted-foreground/60',
        )} />
        <span className={cn(
          'text-[9px] font-mono',
          agent.is_overdue && agent.status !== 'error' && agent.status !== 'paused'
            ? 'text-amber-400' : 'text-muted-foreground/60',
        )}>
          {agent.status === 'paused' ? 'paused' : agent.status === 'error' ? 'error' : countdown}
        </span>
        {agent.last_run && (
          <span className={cn('text-[8px] ml-auto', runStatusColor(agent.last_run.status))}>
            {agent.last_run.status}
          </span>
        )}
      </div>

      {/* Assigned work */}
      {hasWork && (
        <div className="text-[8px] text-foreground/70 line-clamp-1 mb-1">
          → {agent.assigned_issues[0].title}
          {agent.assigned_issues.length > 1 && (
            <span className="text-muted-foreground"> +{agent.assigned_issues.length - 1}</span>
          )}
        </div>
      )}

      {/* Bottom row: heartbeat + runs */}
      <div className="flex items-center justify-between text-[8px] text-muted-foreground mt-auto">
        <span>{relativeTime(agent.last_heartbeat_at)}</span>
        <span className={teamColor}>{agent.runs_24h} runs</span>
      </div>
    </HoverCard>
  );
}
