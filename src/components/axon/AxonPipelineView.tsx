'use client';

import { useEffect, useState } from 'react';
import { useAxonStore, useAxonAgentSummary, useAxonActivePipelines } from '@/store/axon-store';
import type { AxonAgent, AxonActivity } from '@/lib/axon/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import AgentDetailModal from './AgentDetailModal';
import AgentConsensusView from './AgentConsensusView';
import {
  Users, Activity, Zap, Brain, Shield, TrendingUp,
  Clock, CheckCircle2, AlertTriangle, Loader2,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Agent role grouping
// ---------------------------------------------------------------------------

const ROLE_GROUPS: { label: string; icon: typeof Users; roles: string[]; color: string }[] = [
  { label: 'Leadership', icon: Brain,       roles: ['ceo', 'head_of_trading', 'head_of_research', 'strategy_architect'], color: 'text-violet-400' },
  { label: 'Research',   icon: Activity,    roles: ['market_analyst', 'onchain_analyst', 'sentiment_analyst', 'microstructure_analyst'], color: 'text-blue-400' },
  { label: 'Trading',    icon: TrendingUp,  roles: ['execution_trader', 'risk_officer', 'portfolio_manager'], color: 'text-emerald-400' },
  { label: 'Execution',  icon: Zap,         roles: ['qa_agent', 'build_agent', 'triage_agent'], color: 'text-amber-400' },
];

function getStatusColor(status: string): string {
  switch (status) {
    case 'working': return 'bg-emerald-400';
    case 'idle': return 'bg-amber-400';
    case 'error': return 'bg-red-400';
    case 'paused': return 'bg-zinc-500';
    default: return 'bg-muted-foreground';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AxonPipelineView() {
  const agents = useAxonStore((s) => s.agents);
  const agentEvents = useAxonStore((s) => s.agentEvents);
  const issues = useAxonStore((s) => s.issues);
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const fetchAgents = useAxonStore((s) => s.fetchAgents);
  const fetchIssues = useAxonStore((s) => s.fetchIssues);
  const summary = useAxonAgentSummary();
  const activePipelines = useAxonActivePipelines();

  // Selected agent for detail modal
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  // Refresh data on mount
  useEffect(() => {
    fetchAgents();
    fetchIssues();
  }, [fetchAgents, fetchIssues]);

  if (!daemonOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Shield className="w-12 h-12 text-muted-foreground/20 mb-3" strokeWidth={1} />
        <p className="text-sm text-muted-foreground">Axon Daemon Offline</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Start the daemon to view agent intelligence</p>
      </div>
    );
  }

  // Active trading pipelines
  const tradingIssues = issues
    .filter((i) => i.issue_type === 'trading' && (i.status === 'in_progress' || i.status === 'todo'))
    .slice(0, 10);

  // Recent events (last 20)
  const recentEvents = agentEvents.slice(-20).reverse();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Axon Intelligence</h2>
            <p className="text-[10px] text-muted-foreground">22-Agent Autonomous Trading Team</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px]', summary.working > 0 ? 'text-emerald-400 border-emerald-400/30' : 'text-muted-foreground')}>
            {summary.working} working
          </Badge>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {summary.idle} idle
          </Badge>
          {summary.error > 0 && (
            <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/30">
              {summary.error} error
            </Badge>
          )}
          {activePipelines > 0 && (
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 animate-pulse">
              {activePipelines} pipeline{activePipelines > 1 ? 's' : ''} active
            </Badge>
          )}
        </div>
      </div>

      {/* Research Consensus */}
      <div className="px-4 py-2 border-b border-border/50 flex-shrink-0">
        <AgentConsensusView />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Agent Team Grid */}
        <div className="p-4 space-y-4">
          {ROLE_GROUPS.map((group) => {
            const groupAgents = agents.filter((a) =>
              group.roles.some((r) => a.role?.toLowerCase().includes(r) || a.title?.toLowerCase().includes(r))
            );
            // If no agents match by role, check by name patterns
            const fallbackAgents = groupAgents.length > 0 ? groupAgents : agents.filter((a) =>
              group.roles.some((r) => a.name?.toLowerCase().includes(r.replace('_', ' ')))
            );
            if (fallbackAgents.length === 0) return null;

            const GroupIcon = group.icon;
            return (
              <div key={group.label}>
                <div className="flex items-center gap-1.5 mb-2">
                  <GroupIcon className={cn('w-3 h-3', group.color)} />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                  <span className="text-[9px] text-muted-foreground/60">({fallbackAgents.length})</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {fallbackAgents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onClick={() => setSelectedAgentId(agent.id)} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Ungrouped agents */}
          {(() => {
            const allGroupedRoles = ROLE_GROUPS.flatMap((g) => g.roles);
            const ungrouped = agents.filter((a) =>
              !allGroupedRoles.some((r) =>
                a.role?.toLowerCase().includes(r) ||
                a.title?.toLowerCase().includes(r) ||
                a.name?.toLowerCase().includes(r.replace('_', ' '))
              )
            );
            if (ungrouped.length === 0) return null;
            return (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Other Agents</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {ungrouped.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onClick={() => setSelectedAgentId(agent.id)} />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Active Pipelines */}
        {tradingIssues.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Pipelines</span>
            </div>
            <div className="space-y-2">
              {tradingIssues.map((issue) => (
                <div key={issue.id} className="px-3 py-2 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 text-primary animate-spin" />
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{issue.title}</span>
                    <span className="text-[10px] text-primary">Wave {issue.current_wave ?? 0}/5</span>
                  </div>
                  <div className="flex gap-0.5 mt-1.5">
                    {[1, 2, 3, 4, 5].map((w) => (
                      <div
                        key={w}
                        className={cn(
                          'flex-1 h-1 rounded-full',
                          w <= (issue.current_wave ?? 0) ? 'bg-primary' : 'bg-muted-foreground/20',
                          w === (issue.current_wave ?? 0) && 'animate-pulse',
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {recentEvents.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</span>
            </div>
            <div className="space-y-1">
              {recentEvents.slice(0, 10).map((event) => {
                const detail = (event.detail ?? {}) as Record<string, unknown>;
                const agentName = detail.agent_name as string | undefined;
                const summary = (detail.summary ?? detail.decision_title) as string | undefined;

                return (
                  <div key={event.id} className="flex items-center gap-2 px-2 py-1 rounded text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                    {agentName && <span className="text-foreground font-medium">{agentName}</span>}
                    <span className="text-muted-foreground truncate flex-1">{event.action.replace(/_/g, ' ')}</span>
                    {summary && <span className="text-muted-foreground/60 truncate max-w-[200px]">{String(summary)}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Agent Detail Modal */}
      <AgentDetailModal
        agent={selectedAgent}
        open={selectedAgent !== null}
        onClose={() => setSelectedAgentId(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

function AgentCard({ agent, onClick }: { agent: AxonAgent; onClick?: () => void }) {
  return (
    <div
      className="px-2.5 py-2 rounded-lg bg-card border border-border hover:border-primary/20 transition-colors cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onClick) { e.preventDefault(); onClick(); } }}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusColor(agent.status))} />
        <span className="text-[11px] font-medium text-foreground truncate">{agent.name}</span>
      </div>
      <span className="text-[9px] text-muted-foreground mt-0.5 block truncate">
        {agent.title || agent.role}
      </span>
    </div>
  );
}
