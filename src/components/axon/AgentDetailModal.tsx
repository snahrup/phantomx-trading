'use client';

import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAxonClient } from '@/lib/axon/client';
import type {
  AxonAgent,
  AxonAgentPersona,
  AxonHeartbeatRun,
  AxonCostEntry,
} from '@/lib/axon/types';
import {
  Zap, Pause, Play, Clock, DollarSign, FileText,
  Activity, AlertTriangle, Loader2, ChevronDown, ChevronRight,
  Hash, Cpu, Wallet,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  idle:     { color: 'bg-gray-400',    label: 'Idle' },
  working:  { color: 'bg-emerald-500', label: 'Working' },
  sleeping: { color: 'bg-blue-400/60', label: 'Sleeping' },
  error:    { color: 'bg-red-500',     label: 'Error' },
  paused:   { color: 'bg-yellow-500',  label: 'Paused' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentDetailModalProps {
  agent: AxonAgent | null;
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentDetailModal({ agent, open, onClose }: AgentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'persona' | 'heartbeats' | 'costs'>('persona');
  const [persona, setPersona] = useState<AxonAgentPersona | null>(null);
  const [heartbeats, setHeartbeats] = useState<AxonHeartbeatRun[]>([]);
  const [costs, setCosts] = useState<AxonCostEntry[]>([]);
  const [loadingPersona, setLoadingPersona] = useState(false);
  const [loadingHeartbeats, setLoadingHeartbeats] = useState(false);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [heartbeatsError, setHeartbeatsError] = useState<string | null>(null);
  const [costsError, setCostsError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch persona
  // -----------------------------------------------------------------------
  const fetchPersona = useCallback(async (agentId: string) => {
    try {
      setLoadingPersona(true);
      setPersonaError(null);
      const result = await getAxonClient().getAgentPersona(agentId);
      if (result.ok) setPersona(result.data);
      else setPersonaError('Failed to load persona');
    } catch { setPersonaError('Failed to load persona — Axon not reachable'); }
    finally { setLoadingPersona(false); }
  }, []);

  // -----------------------------------------------------------------------
  // Fetch heartbeats
  // -----------------------------------------------------------------------
  const fetchHeartbeats = useCallback(async (agentId: string) => {
    try {
      setLoadingHeartbeats(true);
      setHeartbeatsError(null);
      const result = await getAxonClient().getAgentHeartbeats(agentId, 20);
      if (result.ok) setHeartbeats(result.data);
      else setHeartbeatsError('Failed to load heartbeats');
    } catch { setHeartbeatsError('Failed to load heartbeats — Axon not reachable'); }
    finally { setLoadingHeartbeats(false); }
  }, []);

  // -----------------------------------------------------------------------
  // Fetch costs
  // -----------------------------------------------------------------------
  const fetchCosts = useCallback(async (agentId: string) => {
    try {
      setLoadingCosts(true);
      setCostsError(null);
      const result = await getAxonClient().getAgentCosts(agentId);
      if (result.ok) setCosts(result.data);
      else setCostsError('Failed to load costs');
    } catch { setCostsError('Failed to load costs — Axon not reachable'); }
    finally { setLoadingCosts(false); }
  }, []);

  // -----------------------------------------------------------------------
  // Fetch data when agent changes
  // -----------------------------------------------------------------------
  const agentId = agent?.id ?? null;

  useEffect(() => {
    if (!agentId || !open) return;
    setActiveTab('persona');
    setPersona(null);
    setHeartbeats([]);
    setCosts([]);
    setPersonaError(null);
    setHeartbeatsError(null);
    setCostsError(null);
    fetchPersona(agentId);
    fetchHeartbeats(agentId);
    fetchCosts(agentId);
  }, [agentId, open, fetchPersona, fetchHeartbeats, fetchCosts]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  const wakeAgent = async () => {
    if (!agent) return;
    setActionLoading('wake');
    try {
      await getAxonClient().wakeupAgent(agent.id);
    } catch (err) { console.error('[AgentDetailModal] Wake failed:', err); }
    finally { setActionLoading(null); }
  };

  const togglePause = async () => {
    if (!agent) return;
    const action = agent.status === 'paused' ? 'resume' : 'pause';
    setActionLoading(action);
    try {
      const client = getAxonClient();
      if (action === 'pause') await client.pauseAgent(agent.id);
      else await client.resumeAgent(agent.id);
    } catch (err) { console.error('[AgentDetailModal] Pause/resume failed:', err); }
    finally { setActionLoading(null); }
  };

  if (!agent) return null;

  const statusConfig = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;

  const tabs = [
    { id: 'persona' as const, label: 'Persona', icon: FileText },
    { id: 'heartbeats' as const, label: 'Heartbeats', icon: Clock },
    { id: 'costs' as const, label: 'Costs', icon: DollarSign },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 bg-card border-border/60">
        {/* ================================================================ */}
        {/* Header */}
        {/* ================================================================ */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-3">
            {/* Status dot */}
            <span className="relative inline-flex">
              <span className={cn('w-3 h-3 rounded-full flex-shrink-0', statusConfig.color)} />
              {agent.status === 'working' && (
                <span className={cn('absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-75', statusConfig.color)} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base truncate">{agent.name}</DialogTitle>
              <DialogDescription className="text-xs truncate">
                {agent.title || agent.role}
              </DialogDescription>
            </div>
            <Badge variant="outline" className={cn(
              'text-[10px] px-2',
              agent.status === 'working' && 'border-emerald-500/40 text-emerald-400',
              agent.status === 'error' && 'border-red-500/40 text-red-400',
              agent.status === 'paused' && 'border-yellow-500/40 text-yellow-400',
              agent.status === 'sleeping' && 'border-blue-400/40 text-blue-400',
            )}>
              {statusConfig.label}
            </Badge>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={wakeAgent}
              disabled={actionLoading === 'wake'}
              className="text-xs gap-1"
            >
              {actionLoading === 'wake' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Zap className="w-3 h-3" />
              )}
              Wake Agent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={togglePause}
              disabled={actionLoading === 'pause' || actionLoading === 'resume'}
              className="text-xs gap-1"
            >
              {agent.status === 'paused' ? (
                <>
                  <Play className="w-3 h-3" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-3 h-3" />
                  Pause
                </>
              )}
            </Button>
            {agent.monthly_budget_usd != null && (
              <Badge variant="outline" className="text-[10px] ml-auto text-muted-foreground">
                <Wallet className="w-3 h-3 mr-0.5" />
                Budget: ${agent.monthly_budget_usd.toFixed(2)}/mo
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* ================================================================ */}
        {/* Tab Bar */}
        {/* ================================================================ */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-border/50">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors -mb-px border-b-2',
                  activeTab === tab.id
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ================================================================ */}
        {/* Tab Content */}
        {/* ================================================================ */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-6 min-h-[300px]">
            {activeTab === 'persona' && (
              <PersonaTab persona={persona} loading={loadingPersona} error={personaError} />
            )}
            {activeTab === 'heartbeats' && (
              <HeartbeatsTab heartbeats={heartbeats} loading={loadingHeartbeats} error={heartbeatsError} />
            )}
            {activeTab === 'costs' && (
              <CostsTab costs={costs} loading={loadingCosts} budget={agent.monthly_budget_usd} error={costsError} />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Tab: Persona (SOUL.md)
// ===========================================================================

function PersonaTab({ persona, loading, error }: { persona: AxonAgentPersona | null; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading persona...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive/80 px-2 py-1.5 rounded-md bg-destructive/5 border border-destructive/10">
        <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {error}
      </div>
    );
  }
  if (!persona || !persona.soul) {
    return <div className="text-xs text-muted-foreground">No SOUL.md found for this agent.</div>;
  }

  return (
    <div className="space-y-4">
      {persona.soul && (
        <MarkdownBlock title="SOUL.md" content={persona.soul} />
      )}
      {persona.heartbeat && (
        <MarkdownBlock title="HEARTBEAT.md" content={persona.heartbeat} />
      )}
      {persona.tools && (
        <MarkdownBlock title="TOOLS.md" content={persona.tools} />
      )}
      {persona.agents && (
        <MarkdownBlock title="AGENTS.md" content={persona.agents} />
      )}
    </div>
  );
}

// ===========================================================================
// Tab: Heartbeats
// ===========================================================================

function HeartbeatsTab({ heartbeats, loading, error }: { heartbeats: AxonHeartbeatRun[]; loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading heartbeats...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive/80 px-2 py-1.5 rounded-md bg-destructive/5 border border-destructive/10">
        <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {error}
      </div>
    );
  }
  if (heartbeats.length === 0) {
    return <div className="text-xs text-muted-foreground">No heartbeat history available.</div>;
  }

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_80px_80px_70px_60px] gap-2 px-2.5 py-1.5 text-[9px] text-muted-foreground uppercase tracking-wider">
        <span />
        <span>Time</span>
        <span>Duration</span>
        <span>Trigger</span>
        <span>Tokens</span>
        <span className="text-right">Cost</span>
      </div>
      {heartbeats.map((hb) => (
        <HeartbeatRow key={hb.id} hb={hb} />
      ))}
    </div>
  );
}

function HeartbeatRow({ hb }: { hb: AxonHeartbeatRun }) {
  const [expanded, setExpanded] = useState(false);

  const isError = hb.status === 'error' || hb.status === 'failed';
  const isComplete = hb.status === 'completed';
  const isRunning = hb.status === 'running';

  // Duration
  let durationStr = '--';
  if (hb.started_at && hb.ended_at) {
    const ms = new Date(hb.ended_at).getTime() - new Date(hb.started_at).getTime();
    durationStr = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  } else if (isRunning) {
    durationStr = 'running...';
  }

  // Trigger badge colors
  const triggerColors: Record<string, string> = {
    scheduled: 'text-blue-400 border-blue-400/30',
    manual: 'text-amber-400 border-amber-400/30',
    trading_wave: 'text-emerald-400 border-emerald-400/30',
  };

  const hasLog = !!hb.log_text;

  return (
    <div className={cn(
      'rounded-lg border text-xs',
      isError ? 'border-red-500/20 bg-red-500/[0.03]' :
      isComplete ? 'border-border/30 bg-card/30' :
      isRunning ? 'border-emerald-500/20 bg-emerald-500/[0.03]' :
      'border-border/20 bg-card/20',
    )}>
      {/* Main row */}
      <button
        onClick={() => hasLog && setExpanded(!expanded)}
        className={cn(
          'w-full grid grid-cols-[auto_1fr_80px_80px_70px_60px] gap-2 items-center px-2.5 py-2',
          hasLog && 'cursor-pointer hover:bg-muted/30 transition-colors',
        )}
        disabled={!hasLog}
      >
        {/* Expand indicator */}
        <span className="w-3 flex-shrink-0">
          {hasLog ? (
            expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />
          ) : (
            <span className={cn(
              'w-1.5 h-1.5 rounded-full inline-block',
              isError ? 'bg-red-500' : isComplete ? 'bg-emerald-500' : isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-yellow-500',
            )} />
          )}
        </span>

        {/* Time */}
        <span className="text-muted-foreground text-left">
          {hb.started_at ? new Date(hb.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '???'}
        </span>

        {/* Duration */}
        <span className="text-muted-foreground/60">{durationStr}</span>

        {/* Trigger */}
        <span>
          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', triggerColors[hb.trigger] ?? 'text-muted-foreground')}>
            {hb.trigger.replace('_', ' ')}
          </Badge>
        </span>

        {/* Tokens */}
        <span className="text-muted-foreground/60 font-mono">
          {hb.tokens_used > 0 ? hb.tokens_used.toLocaleString() : '--'}
        </span>

        {/* Cost */}
        <span className="text-right font-mono text-muted-foreground/60">
          {hb.cost_usd > 0 ? `$${hb.cost_usd.toFixed(4)}` : '--'}
        </span>
      </button>

      {/* Expanded log_text */}
      {expanded && hb.log_text && (
        <div className="px-3 pb-3 border-t border-border/20">
          <pre className="text-[11px] text-foreground/70 whitespace-pre-wrap bg-muted/20 border border-border/20 rounded-md p-3 mt-2 max-h-60 overflow-y-auto font-mono leading-relaxed">
            {hb.log_text}
          </pre>
          {hb.thinking_text && (
            <details className="mt-2">
              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                Thinking
              </summary>
              <pre className="text-[10px] text-muted-foreground/70 whitespace-pre-wrap bg-muted/10 border border-border/10 rounded-md p-2 mt-1 max-h-40 overflow-y-auto font-mono">
                {hb.thinking_text}
              </pre>
            </details>
          )}
          {hb.decisions_json && (
            <details className="mt-2">
              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                Decisions
              </summary>
              <pre className="text-[10px] text-muted-foreground/70 whitespace-pre-wrap bg-muted/10 border border-border/10 rounded-md p-2 mt-1 max-h-40 overflow-y-auto font-mono">
                {hb.decisions_json}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Tab: Costs
// ===========================================================================

function CostsTab({ costs, loading, budget, error }: { costs: AxonCostEntry[]; loading: boolean; budget: number | null; error: string | null }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading cost data...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive/80 px-2 py-1.5 rounded-md bg-destructive/5 border border-destructive/10">
        <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {error}
      </div>
    );
  }
  if (costs.length === 0) {
    return <div className="text-xs text-muted-foreground">No cost data available.</div>;
  }

  const totalCost = costs.reduce((sum, c) => sum + c.cost_usd, 0);
  const totalInputTokens = costs.reduce((sum, c) => sum + c.input_tokens, 0);
  const totalOutputTokens = costs.reduce((sum, c) => sum + c.output_tokens, 0);
  const budgetRemaining = budget != null ? budget - totalCost : null;
  const budgetPercent = budget != null && budget > 0 ? (totalCost / budget) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Total Spend</div>
          <div className="text-lg font-mono font-semibold text-foreground">${totalCost.toFixed(4)}</div>
        </div>
        {budgetRemaining != null && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Budget Remaining</div>
            <div className={cn(
              'text-lg font-mono font-semibold',
              budgetRemaining > 0 ? 'text-emerald-400' : 'text-red-400',
            )}>
              ${budgetRemaining.toFixed(2)}
            </div>
          </div>
        )}
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Input Tokens</div>
          <div className="text-sm font-mono text-foreground">{totalInputTokens.toLocaleString()}</div>
        </div>
        <div className="p-3 rounded-lg bg-muted/20 border border-border/30">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Output Tokens</div>
          <div className="text-sm font-mono text-foreground">{totalOutputTokens.toLocaleString()}</div>
        </div>
      </div>

      {/* Budget bar */}
      {budgetPercent != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Monthly Budget Usage</span>
            <span className="font-mono">{budgetPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                budgetPercent > 90 ? 'bg-red-500' : budgetPercent > 70 ? 'bg-amber-500' : 'bg-emerald-500',
              )}
              style={{ width: `${Math.min(budgetPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Cost entries table */}
      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Cost Entries ({costs.length})
        </h4>
        <div className="space-y-1">
          {costs.map((c) => (
            <div key={c.id} className="flex items-center justify-between py-1.5 px-2 text-xs border-b border-border/30 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                  <Cpu className="w-2.5 h-2.5 mr-0.5" />
                  {c.model}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground/60 font-mono">
                <span title="Input tokens" className="flex items-center gap-0.5">
                  <Hash className="w-2.5 h-2.5" />{c.input_tokens.toLocaleString()}
                </span>
                <span className="text-foreground font-semibold">${c.cost_usd.toFixed(4)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function MarkdownBlock({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h4>
      <pre className="text-xs text-foreground/80 whitespace-pre-wrap bg-muted/20 border border-border/30 rounded-lg p-3 max-h-80 overflow-y-auto font-mono leading-relaxed">
        {content}
      </pre>
    </div>
  );
}
