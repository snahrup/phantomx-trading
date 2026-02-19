'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  TrendingUp, BarChart3, Newspaper, Link2,
  CheckCircle2, Loader2, ChevronDown, ChevronRight,
  Swords, Scale, Shield, Flame, Eye,
  Sparkles, Activity, Brain, XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Glass card styling
// ---------------------------------------------------------------------------
const GLASS = 'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm';

// ---------------------------------------------------------------------------
// Types for SSE events from the multi-agent pipeline
// ---------------------------------------------------------------------------

interface AnalystState {
  status: 'pending' | 'running' | 'complete' | 'error';
  report: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  toolResults: Array<{ tool: string; preview: string }>;
  duration: number;
  error?: string;
}

interface DebateTurn {
  speaker: string;
  round: number;
  content: string;
}

interface JudgeDecision {
  decision: string;
  content: string;
  confidence: number;
}

interface PipelineState {
  stage: 'idle' | 'analysts' | 'debate' | 'risk' | 'strategy' | 'backtest' | 'done' | 'error';
  analysts: Record<string, AnalystState>;
  debate: {
    turns: DebateTurn[];
    judge: JudgeDecision | null;
  };
  risk: {
    turns: DebateTurn[];
    judge: JudgeDecision | null;
    finalSize: string;
  };
  strategy: {
    streaming: string;
    config: unknown | null;
  };
  backtest: {
    running: boolean;
    metrics: unknown | null;
    error: string | null;
  };
  memory: {
    stored: number;
  };
  finalDecision: string | null;
  finalConfidence: number | null;
  totalDuration: number | null;
  error: string | null;
}

function initialPipelineState(): PipelineState {
  return {
    stage: 'idle',
    analysts: {
      market_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
      sentiment_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
      news_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
      fundamentals_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
    },
    debate: { turns: [], judge: null },
    risk: { turns: [], judge: null, finalSize: '' },
    strategy: { streaming: '', config: null },
    backtest: { running: false, metrics: null, error: null },
    memory: { stored: 0 },
    finalDecision: null,
    finalConfidence: null,
    totalDuration: null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Analyst metadata
// ---------------------------------------------------------------------------

const ANALYST_META: Record<string, { name: string; icon: LucideIcon; color: string }> = {
  market_analyst: { name: 'Market', icon: TrendingUp, color: 'text-blue-400' },
  sentiment_analyst: { name: 'Sentiment', icon: BarChart3, color: 'text-purple-400' },
  news_analyst: { name: 'News', icon: Newspaper, color: 'text-amber-400' },
  fundamentals_analyst: { name: 'Fundamentals', icon: Link2, color: 'text-emerald-400' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ResearchPipelineHandle {
  handleEvent: (data: Record<string, unknown>) => void;
  reset: () => void;
}

interface ResearchPipelineProps {
  onComplete?: () => void;
  eventSource?: EventSource | null;
  onRegister?: (handle: ResearchPipelineHandle) => void;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function ResearchPipeline({ onComplete, eventSource, onRegister }: ResearchPipelineProps): React.JSX.Element {
  const [state, setState] = useState<PipelineState>(initialPipelineState);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['analysts', 'debate']));

  // Process SSE events
  const processEvent = useCallback((data: Record<string, unknown>) => {
    setState(prev => {
      const next = { ...prev };
      const type = data.type as string;

      switch (type) {
        case 'pipeline_start':
          next.stage = 'analysts';
          next.analysts = { ...initialPipelineState().analysts };
          break;

        // --- Wave 1: Analysts ---
        case 'analyst_start': {
          const agent = data.agent as string;
          if (next.analysts[agent]) {
            next.analysts = { ...next.analysts, [agent]: { ...next.analysts[agent], status: 'running' } };
          }
          next.stage = 'analysts';
          break;
        }
        case 'analyst_tool_call': {
          const agent = data.agent as string;
          if (next.analysts[agent]) {
            const a = { ...next.analysts[agent] };
            a.toolCalls = [...a.toolCalls, { tool: data.tool as string, input: data.input }];
            next.analysts = { ...next.analysts, [agent]: a };
          }
          break;
        }
        case 'analyst_tool_result': {
          const agent = data.agent as string;
          if (next.analysts[agent]) {
            const a = { ...next.analysts[agent] };
            a.toolResults = [...a.toolResults, { tool: data.tool as string, preview: data.preview as string }];
            next.analysts = { ...next.analysts, [agent]: a };
          }
          break;
        }
        case 'analyst_stream': {
          const agent = data.agent as string;
          if (next.analysts[agent]) {
            const a = { ...next.analysts[agent] };
            a.report += data.content as string;
            next.analysts = { ...next.analysts, [agent]: a };
          }
          break;
        }
        case 'analyst_complete': {
          const agent = data.agent as string;
          if (next.analysts[agent]) {
            next.analysts = {
              ...next.analysts,
              [agent]: {
                ...next.analysts[agent],
                status: 'complete',
                report: data.report as string,
                duration: data.duration as number,
              },
            };
          }
          break;
        }
        case 'analyst_error': {
          const agent = data.agent as string;
          if (next.analysts[agent]) {
            next.analysts = {
              ...next.analysts,
              [agent]: { ...next.analysts[agent], status: 'error', error: data.error as string },
            };
          }
          break;
        }

        // --- Wave 2: Investment Debate ---
        case 'debate_start':
          next.stage = 'debate';
          next.debate = { turns: [], judge: null };
          break;
        case 'debate_turn':
          next.debate = {
            ...next.debate,
            turns: [...next.debate.turns, {
              speaker: data.speaker as string,
              round: data.round as number,
              content: data.content as string,
            }],
          };
          break;
        case 'debate_stream': {
          const turns = [...next.debate.turns];
          const speaker = data.speaker as string;
          const round = data.round as number;
          const existing = turns.findIndex(t => t.speaker === speaker && t.round === round);
          if (existing >= 0) {
            turns[existing] = { ...turns[existing], content: turns[existing].content + (data.content as string) };
          } else {
            turns.push({ speaker, round, content: data.content as string });
          }
          next.debate = { ...next.debate, turns };
          break;
        }
        case 'debate_judge':
          next.debate = {
            ...next.debate,
            judge: {
              decision: data.decision as string,
              content: data.plan as string,
              confidence: data.confidence as number,
            },
          };
          break;
        case 'debate_judge_stream': {
          const judge = next.debate.judge
            ? { ...next.debate.judge, content: next.debate.judge.content + (data.content as string) }
            : { decision: '', content: data.content as string, confidence: 0 };
          next.debate = { ...next.debate, judge };
          break;
        }

        // --- Wave 3: Risk Debate ---
        case 'risk_debate_start':
          next.stage = 'risk';
          next.risk = { turns: [], judge: null, finalSize: '' };
          break;
        case 'risk_turn':
          next.risk = {
            ...next.risk,
            turns: [...next.risk.turns, {
              speaker: data.speaker as string,
              round: 1,
              content: data.content as string,
            }],
          };
          break;
        case 'risk_stream': {
          const turns = [...next.risk.turns];
          const speaker = data.speaker as string;
          const existing = turns.findIndex(t => t.speaker === speaker);
          if (existing >= 0) {
            turns[existing] = { ...turns[existing], content: turns[existing].content + (data.content as string) };
          } else {
            turns.push({ speaker, round: 1, content: data.content as string });
          }
          next.risk = { ...next.risk, turns };
          break;
        }
        case 'risk_judge':
          next.risk = {
            ...next.risk,
            judge: {
              decision: data.decision as string,
              content: data.adjustments as string,
              confidence: 0,
            },
            finalSize: data.finalSize as string,
          };
          break;
        case 'risk_judge_stream': {
          const judge = next.risk.judge
            ? { ...next.risk.judge, content: next.risk.judge.content + (data.content as string) }
            : { decision: '', content: data.content as string, confidence: 0 };
          next.risk = { ...next.risk, judge };
          break;
        }

        // --- Wave 4: Strategy ---
        case 'strategy_start':
          next.stage = 'strategy';
          break;
        case 'strategy_stream':
          next.strategy = { ...next.strategy, streaming: next.strategy.streaming + (data.content as string) };
          break;
        case 'strategy_complete':
          next.strategy = { ...next.strategy, config: data.config };
          break;

        // --- Wave 5: Backtest + Memory ---
        case 'backtest_start':
          next.stage = 'backtest';
          next.backtest = { running: true, metrics: null, error: null };
          break;
        case 'backtest_complete':
          next.backtest = { running: false, metrics: data.metrics, error: null };
          break;
        case 'backtest_error':
          next.backtest = { running: false, metrics: null, error: data.error as string };
          break;
        case 'memory_stored':
          next.memory = { stored: data.count as number };
          break;

        // --- Final ---
        case 'pipeline_complete':
          next.stage = 'done';
          next.finalDecision = data.decision as string;
          next.finalConfidence = data.confidence as number;
          next.totalDuration = data.duration as number;
          break;
        case 'pipeline_error':
          next.stage = 'error';
          next.error = data.error as string;
          break;
        case 'done':
          next.stage = 'done';
          break;
      }

      return next;
    });
  }, []);

  // Wire up EventSource
  useEffect(() => {
    if (!eventSource) return;

    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        processEvent(data);
      } catch {
        // ignore malformed events
      }
    };

    eventSource.addEventListener('message', handler);
    return () => eventSource.removeEventListener('message', handler);
  }, [eventSource, processEvent]);

  // Expose handle to parent via callback
  useEffect(() => {
    if (onRegister) {
      onRegister({
        handleEvent: processEvent,
        reset: () => setState(initialPipelineState()),
      });
    }
  }, [onRegister, processEvent]);

  // Notify parent on completion
  useEffect(() => {
    if (state.stage === 'done' && onComplete) onComplete();
  }, [state.stage, onComplete]);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isIdle = state.stage === 'idle';

  if (isIdle) {
    return (
      <div className={cn(GLASS, 'p-6 text-center')}>
        <Brain className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Multi-Agent Research Pipeline
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          4 analysts + Bull/Bear debate + Risk assessment + Strategy synthesis
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-in fade-in duration-300">
      {/* ================================================================ */}
      {/* WAVE 1: ANALYSTS */}
      {/* ================================================================ */}
      <CollapsibleSection
        id="analysts"
        title="Specialist Analysts"
        subtitle="Wave 1"
        icon={Activity}
        expanded={expandedSections.has('analysts')}
        onToggle={() => toggleSection('analysts')}
        status={getWaveStatus(Object.values(state.analysts).map(a => a.status))}
      >
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(state.analysts).map(([key, analyst]) => {
            const meta = ANALYST_META[key];
            if (!meta) return null;
            return (
              <AnalystCard key={key} analyst={analyst} meta={meta} />
            );
          })}
        </div>
      </CollapsibleSection>

      {/* ================================================================ */}
      {/* WAVE 2: INVESTMENT DEBATE */}
      {/* ================================================================ */}
      {(state.stage === 'debate' || state.debate.turns.length > 0 || state.debate.judge) && (
        <CollapsibleSection
          id="debate"
          title="Investment Debate"
          subtitle="Wave 2"
          icon={Swords}
          expanded={expandedSections.has('debate')}
          onToggle={() => toggleSection('debate')}
          status={state.debate.judge ? 'complete' : state.debate.turns.length > 0 ? 'running' : 'pending'}
        >
          <div className="space-y-2">
            {state.debate.turns.map((turn, i) => (
              <DebateTurnCard
                key={`${turn.speaker}-${turn.round}-${i}`}
                turn={turn}
                type="investment"
              />
            ))}
            {state.debate.judge && (
              <JudgeCard judge={state.debate.judge} label="Research Judge" />
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ================================================================ */}
      {/* WAVE 3: RISK DEBATE */}
      {/* ================================================================ */}
      {(state.stage === 'risk' || state.risk.turns.length > 0 || state.risk.judge) && (
        <CollapsibleSection
          id="risk"
          title="Risk Assessment"
          subtitle="Wave 3"
          icon={Shield}
          expanded={expandedSections.has('risk')}
          onToggle={() => toggleSection('risk')}
          status={state.risk.judge ? 'complete' : state.risk.turns.length > 0 ? 'running' : 'pending'}
        >
          <div className="space-y-2">
            {state.risk.turns.map((turn, i) => (
              <DebateTurnCard key={`${turn.speaker}-${i}`} turn={turn} type="risk" />
            ))}
            {state.risk.judge && (
              <JudgeCard judge={state.risk.judge} label="Risk Manager" extra={state.risk.finalSize} />
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ================================================================ */}
      {/* WAVE 4: STRATEGY */}
      {/* ================================================================ */}
      {(state.stage === 'strategy' || !!state.strategy.config) && (
        <CollapsibleSection
          id="strategy"
          title="Strategy Synthesis"
          subtitle="Wave 4"
          icon={Sparkles}
          expanded={expandedSections.has('strategy')}
          onToggle={() => toggleSection('strategy')}
          status={state.strategy.config ? 'complete' : 'running'}
        >
          <div className="text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
            {state.strategy.streaming || 'Synthesizing strategy...'}
            {!state.strategy.config && <span className="animate-pulse text-primary">|</span>}
          </div>
        </CollapsibleSection>
      )}

      {/* ================================================================ */}
      {/* WAVE 5: BACKTEST */}
      {/* ================================================================ */}
      {(state.backtest.running || !!state.backtest.metrics || !!state.backtest.error) && (
        <div className={cn(GLASS, 'p-3')}>
          <div className="flex items-center gap-2 mb-2">
            {state.backtest.running ? (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
            ) : state.backtest.error ? (
              <XCircle className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )}
            <span className="text-xs font-medium">Walk-Forward Backtest</span>
          </div>
          {state.backtest.metrics != null && (
            <BacktestMetricsDisplay metrics={state.backtest.metrics} />
          )}
          {state.backtest.error && (
            <p className="text-xs text-destructive">{state.backtest.error}</p>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* FINAL DECISION */}
      {/* ================================================================ */}
      {state.finalDecision && (
        <div
          className={cn(
            'rounded-xl border-2 p-4 animate-in fade-in zoom-in-95 duration-300',
            state.finalDecision === 'BUY'
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : state.finalDecision === 'SELL'
              ? 'border-red-500/50 bg-red-500/5'
              : 'border-yellow-500/50 bg-yellow-500/5',
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'text-2xl font-black',
                state.finalDecision === 'BUY' ? 'text-emerald-400' :
                state.finalDecision === 'SELL' ? 'text-red-400' : 'text-yellow-400',
              )}>
                {state.finalDecision}
              </div>
              {state.finalConfidence != null && (
                <Badge variant="outline" className={cn(
                  'text-xs',
                  state.finalConfidence >= 70 ? 'border-emerald-500/30 text-emerald-400' :
                  state.finalConfidence >= 40 ? 'border-yellow-500/30 text-yellow-400' :
                  'border-red-500/30 text-red-400',
                )}>
                  {state.finalConfidence}% confidence
                </Badge>
              )}
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {state.totalDuration && (
                <p>{(state.totalDuration / 1000).toFixed(1)}s total</p>
              )}
              {state.memory.stored > 0 && (
                <p className="text-[10px]">{state.memory.stored} memories stored</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {state.error && (
        <div className={cn(GLASS, 'p-3 border-destructive/50')}>
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="text-xs font-medium text-destructive">Pipeline Error</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{state.error}</p>
        </div>
      )}
    </div>
  );
}

export default ResearchPipeline;

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  id, title, subtitle, icon: Icon, expanded, onToggle, status, children,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  expanded: boolean;
  onToggle: () => void;
  status: 'pending' | 'running' | 'complete' | 'error';
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={cn(
      GLASS,
      status === 'running' && 'border-primary/40 shadow-[0_0_15px_rgba(var(--primary),0.08)]',
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3"
      >
        <div className="flex items-center gap-2">
          {status === 'running' ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : status === 'complete' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : status === 'error' ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : (
            <Icon className="w-4 h-4 text-muted-foreground/50" />
          )}
          <span className="text-xs font-semibold">{title}</span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0">{subtitle}</Badge>
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="px-3 pb-3">{children}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analyst Card
// ---------------------------------------------------------------------------

function AnalystCard({
  analyst, meta,
}: {
  analyst: AnalystState;
  meta: { name: string; icon: LucideIcon; color: string };
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const Icon = meta.icon;

  return (
    <div className={cn(
      'rounded-lg border border-border/30 p-2.5',
      analyst.status === 'running' && 'border-primary/30 bg-primary/5',
      analyst.status === 'complete' && 'bg-card/30',
      analyst.status === 'error' && 'border-destructive/30 bg-destructive/5',
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('w-3 h-3', meta.color)} />
          <span className="text-[11px] font-medium">{meta.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {analyst.status === 'running' && (
            <Loader2 className="w-3 h-3 text-primary animate-spin" />
          )}
          {analyst.status === 'complete' && (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              <span className="text-[9px] text-muted-foreground">{(analyst.duration / 1000).toFixed(1)}s</span>
            </>
          )}
          {analyst.status === 'error' && (
            <XCircle className="w-3 h-3 text-destructive" />
          )}
        </div>
      </div>

      {/* Tool call chips */}
      {analyst.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {analyst.toolCalls.map((tc, i) => (
            <span key={i} className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
              {tc.tool}
            </span>
          ))}
        </div>
      )}

      {/* Report preview/full */}
      {analyst.report && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left mt-1.5"
        >
          <p className={cn(
            'text-[10px] text-muted-foreground',
            !expanded && 'line-clamp-2',
          )}>
            {analyst.report}
          </p>
          {analyst.report.length > 200 && (
            <span className="text-[9px] text-primary mt-0.5 inline-block">
              {expanded ? 'Show less' : 'Show more'}
            </span>
          )}
        </button>
      )}

      {/* Streaming indicator */}
      {analyst.status === 'running' && analyst.report && (
        <span className="animate-pulse text-primary text-xs">|</span>
      )}

      {analyst.error && (
        <p className="text-[10px] text-destructive mt-1">{analyst.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debate Turn Card
// ---------------------------------------------------------------------------

const SPEAKER_META: Record<string, { icon: LucideIcon; color: string; bgColor: string; label: string }> = {
  bull: { icon: TrendingUp, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20', label: 'BULL' },
  bear: { icon: TrendingUp, color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20', label: 'BEAR' },
  aggressive: { icon: Flame, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20', label: 'Aggressive' },
  conservative: { icon: Shield, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', label: 'Conservative' },
  neutral: { icon: Eye, color: 'text-gray-400', bgColor: 'bg-gray-500/10 border-gray-500/20', label: 'Neutral' },
};

function DebateTurnCard({ turn, type }: { turn: DebateTurn; type: 'investment' | 'risk' }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const meta = SPEAKER_META[turn.speaker];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div className={cn('rounded-lg border p-2.5', meta.bgColor)}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('w-3 h-3', meta.color, turn.speaker === 'bear' && 'rotate-180')} />
          <span className={cn('text-[11px] font-semibold', meta.color)}>
            {meta.label}
          </span>
          {type === 'investment' && (
            <span className="text-[9px] text-muted-foreground">Round {turn.round}</span>
          )}
        </div>
      </div>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <p className={cn(
          'text-[11px] text-muted-foreground leading-relaxed',
          !expanded && 'line-clamp-3',
        )}>
          {turn.content}
        </p>
        {turn.content.length > 300 && (
          <span className="text-[9px] text-primary">{expanded ? 'Collapse' : 'Expand'}</span>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Judge Card
// ---------------------------------------------------------------------------

function JudgeCard({ judge, label, extra }: { judge: JudgeDecision; label: string; extra?: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={cn(
      'rounded-lg border-2 p-3',
      judge.decision === 'BUY' ? 'border-emerald-500/40 bg-emerald-500/5' :
      judge.decision === 'SELL' ? 'border-red-500/40 bg-red-500/5' :
      'border-yellow-500/40 bg-yellow-500/5',
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-foreground" />
          <span className="text-xs font-semibold">{label}</span>
          <Badge className={cn(
            'text-[10px] font-bold',
            judge.decision === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
            judge.decision === 'SELL' ? 'bg-red-500/20 text-red-400' :
            'bg-yellow-500/20 text-yellow-400',
          )}>
            {judge.decision}
          </Badge>
          {judge.confidence > 0 && (
            <span className="text-[10px] text-muted-foreground">{judge.confidence}%</span>
          )}
          {extra && (
            <span className="text-[10px] font-mono text-foreground">{extra}</span>
          )}
        </div>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </button>
      </div>
      {expanded && (
        <div className="animate-in fade-in duration-200">
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {judge.content}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backtest Metrics Display
// ---------------------------------------------------------------------------

function BacktestMetricsDisplay({ metrics }: { metrics: unknown }): React.JSX.Element | null {
  const m = metrics as Record<string, number>;
  if (!m) return null;

  const rows = [
    { label: 'Win Rate', value: m.winRate != null ? `${m.winRate.toFixed(1)}%` : 'N/A', good: (m.winRate ?? 0) >= 50 },
    { label: 'Profit Factor', value: m.profitFactor?.toFixed(2) ?? 'N/A', good: (m.profitFactor ?? 0) >= 1.5 },
    { label: 'Sharpe', value: m.sharpeRatio?.toFixed(2) ?? 'N/A', good: (m.sharpeRatio ?? 0) >= 1.0 },
    { label: 'Max DD', value: m.maxDrawdownPercent != null ? `${m.maxDrawdownPercent.toFixed(1)}%` : 'N/A', good: (m.maxDrawdownPercent ?? 100) < 15 },
    { label: 'Trades', value: m.totalTrades?.toString() ?? '0', good: true },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {rows.map(row => (
        <div key={row.label} className="text-center">
          <p className={cn('text-xs font-mono font-semibold', row.good ? 'text-emerald-400' : 'text-red-400')}>
            {row.value}
          </p>
          <p className="text-[9px] text-muted-foreground">{row.label}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWaveStatus(statuses: string[]): 'pending' | 'running' | 'complete' | 'error' {
  if (statuses.every(s => s === 'complete')) return 'complete';
  if (statuses.some(s => s === 'error')) return 'error';
  if (statuses.some(s => s === 'running')) return 'running';
  return 'pending';
}
