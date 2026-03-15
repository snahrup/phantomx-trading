'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAxonClient } from '@/lib/axon/client';
import { useAxonStore } from '@/store/axon-store';
import type { AxonIssue, AxonIssueComment } from '@/lib/axon/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  TrendingUp, Search, Swords, Shield, CheckCircle2,
  Zap, Loader2, Clock, AlertTriangle, ChevronDown,
  ChevronRight, Brain, BarChart3,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Wave metadata
// ---------------------------------------------------------------------------

const WAVES = [
  { num: 1, label: 'Research',         icon: Search,       color: 'text-blue-400',    desc: '4 analysts examine market data' },
  { num: 2, label: 'Debate',           icon: Swords,       color: 'text-violet-400',  desc: 'Bull vs Bear + Head of Research ruling' },
  { num: 3, label: 'Risk Assessment',  icon: Shield,       color: 'text-orange-400',  desc: 'Position sizing, correlation, drawdown' },
  { num: 4, label: 'Approval',         icon: CheckCircle2, color: 'text-amber-400',   desc: 'Head of Trading + CEO sign-off' },
  { num: 5, label: 'Execution',        icon: Zap,          color: 'text-emerald-400', desc: 'Trade recommendation or live execution' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AxonTradingPipelineView() {
  const issues = useAxonStore((s) => s.issues);
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const fetchIssues = useAxonStore((s) => s.fetchIssues);

  const tradingIssues = issues
    .filter((i) => i.issue_type === 'trading')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const activeIssues = tradingIssues.filter((i) => i.status === 'in_progress' || i.status === 'todo');
  const completedIssues = tradingIssues.filter((i) => i.status === 'done' || i.status === 'blocked');

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  if (!daemonOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <TrendingUp className="w-10 h-10 text-muted-foreground/20 mb-3" strokeWidth={1} />
        <p className="text-sm text-muted-foreground">Axon Daemon Offline</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Start the daemon to view trading pipelines</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Stats Bar */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Trading Pipelines</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="outline" className="text-[10px]">{tradingIssues.length} total</Badge>
          {activeIssues.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-primary border-primary/30 animate-pulse">
              {activeIssues.length} active
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-400/30">
            {completedIssues.filter(i => i.status === 'done').length} approved
          </Badge>
          {completedIssues.filter(i => i.status === 'blocked').length > 0 && (
            <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/30">
              {completedIssues.filter(i => i.status === 'blocked').length} rejected
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tradingIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground/20 mb-3" strokeWidth={1} />
            <p className="text-sm text-foreground">No Trading Pipelines</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Create a market scan or trading issue to start the 5-wave debate pipeline.
              The team will research, debate, assess risk, approve, and recommend trades.
            </p>
          </div>
        ) : (
          tradingIssues.map((issue) => (
            <PipelineCard key={issue.id} issue={issue} />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Card (expandable)
// ---------------------------------------------------------------------------

function PipelineCard({ issue }: { issue: AxonIssue }) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<AxonIssueComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const wave = issue.current_wave ?? 0;
  const isActive = issue.status === 'in_progress' || issue.status === 'todo';
  const isRejected = issue.status === 'blocked';
  const isDone = issue.status === 'done';

  const loadComments = useCallback(async () => {
    if (comments.length > 0) return;
    setLoadingComments(true);
    const result = await getAxonClient().getIssueComments(issue.id);
    if (result.ok) setComments(result.data);
    setLoadingComments(false);
  }, [issue.id, comments.length]);

  const handleToggle = () => {
    if (!expanded) loadComments();
    setExpanded(!expanded);
  };

  return (
    <div className={cn(
      'rounded-xl border transition-colors',
      isActive ? 'border-primary/30 bg-primary/3' :
      isRejected ? 'border-red-400/20 bg-red-400/3' :
      isDone ? 'border-emerald-400/20 bg-emerald-400/3' :
      'border-border bg-card',
    )}>
      {/* Header */}
      <button onClick={handleToggle} className="w-full px-4 py-3 flex items-center gap-3 text-left">
        {isActive ? <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" /> :
         isDone ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> :
         isRejected ? <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" /> :
         <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />}

        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{issue.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {isRejected ? `Rejected at Wave ${wave}` :
             isDone ? 'Pipeline complete — recommendation ready' :
             isActive ? `Wave ${wave}/5: ${WAVES.find(w => w.num === wave)?.label ?? 'Starting'}` :
             'Queued'}
          </p>
        </div>

        {/* Wave Progress Bar */}
        <div className="flex gap-0.5 mr-2">
          {WAVES.map((w) => (
            <div
              key={w.num}
              className={cn(
                'w-4 h-1.5 rounded-full',
                w.num <= wave ? (isRejected && w.num === wave ? 'bg-red-400' : 'bg-primary') : 'bg-muted-foreground/20',
                w.num === wave && isActive && 'animate-pulse',
              )}
            />
          ))}
        </div>

        {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
      </button>

      {/* Expanded: Wave-by-wave breakdown */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/50">
          {loadingComments ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            </div>
          ) : (
            <div className="space-y-3 mt-3">
              {WAVES.map((waveMeta) => {
                const waveComments = comments.filter((c) => c.wave === waveMeta.num);
                const isCurrentWave = waveMeta.num === wave && isActive;
                const isPastWave = waveMeta.num < wave || (waveMeta.num <= wave && !isActive);
                const isFutureWave = waveMeta.num > wave;

                const WaveIcon = waveMeta.icon;

                return (
                  <div key={waveMeta.num} className={cn('rounded-lg border px-3 py-2', isFutureWave && 'opacity-40')}>
                    <div className="flex items-center gap-2 mb-1">
                      <WaveIcon className={cn('w-3 h-3', waveMeta.color)} />
                      <span className="text-[11px] font-medium text-foreground">
                        Wave {waveMeta.num}: {waveMeta.label}
                      </span>
                      {isCurrentWave && (
                        <Badge variant="outline" className="text-[8px] text-primary border-primary/30 px-1 py-0 animate-pulse">
                          Active
                        </Badge>
                      )}
                      {isPastWave && waveComments.length > 0 && (
                        <Badge variant="outline" className="text-[8px] text-emerald-400 border-emerald-400/30 px-1 py-0">
                          Done
                        </Badge>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground mb-1">{waveMeta.desc}</p>
                    {waveComments.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {waveComments.map((comment) => (
                          <div key={comment.id} className="pl-2 border-l-2 border-border">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-medium text-foreground">{comment.agent_id ? 'Agent' : 'System'}</span>
                              <Badge variant="outline" className="text-[7px] px-1 py-0">{comment.comment_type}</Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-3">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {isFutureWave && <p className="text-[9px] text-muted-foreground/60 italic">Pending</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
