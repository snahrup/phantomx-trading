'use client';

// ============================================================================
// PhantomX — 5-Wave Trading Intelligence Pipeline Showcase
// ============================================================================
// Full-page, cinematic visualization of the multi-agent trading research
// pipeline. Reads all state from the Zustand store — pipeline runs at module
// level so it survives page navigation.
// ============================================================================

import React, { useState, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTradingStore } from '@/store/trading-store';
import type { PipelineAnalystState, PipelineDebateTurn, PipelineJudgeDecision } from '@/store/trading-store';
import { runPipeline, stopPipeline } from '@/lib/pipeline-runner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  FadeIn, StaggerList, StaggerItem, AnimatedCounter,
  PulseIndicator, motion, AnimatePresence,
} from '@/components/motion';
import {
  Brain, Play, Square, TrendingUp, BarChart3, Newspaper, Link2,
  CheckCircle2, Loader2, ChevronDown, ChevronRight,
  Swords, Scale, Shield, Flame, Eye, Sparkles, XCircle,
  Activity, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

const GLASS = 'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm';

// ---------------------------------------------------------------------------
// Markdown renderer — properly formats AI-generated reports
// ---------------------------------------------------------------------------

const PipelineMarkdown = memo(function PipelineMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <div className="text-xs font-bold text-foreground mb-1 mt-2 first:mt-0">{children}</div>,
        h2: ({ children }) => <div className="text-[11px] font-bold text-foreground mb-1 mt-1.5 first:mt-0">{children}</div>,
        h3: ({ children }) => <div className="text-[11px] font-semibold text-foreground mb-0.5 mt-1 first:mt-0">{children}</div>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        code: ({ children }) => <code className="px-1 py-0.5 rounded bg-muted/50 text-primary font-mono text-[10px]">{children}</code>,
        pre: ({ children }) => <pre className="p-2 rounded bg-muted/30 overflow-x-auto mb-1 text-[10px]">{children}</pre>,
        hr: () => <hr className="my-2 border-border/50" />,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>,
        table: ({ children }) => <table className="w-full text-[10px] mb-1">{children}</table>,
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => <th className="text-left font-semibold text-foreground px-1 py-0.5 border-b border-border/50">{children}</th>,
        td: ({ children }) => <td className="px-1 py-0.5 border-b border-border/30">{children}</td>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/30 pl-2 my-1 text-muted-foreground/80">{children}</blockquote>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

// ---------------------------------------------------------------------------
// Pipeline Stage metadata
// ---------------------------------------------------------------------------

const STAGES = [
  { id: 'analysts', label: 'Analysts', icon: Activity, color: 'text-primary' },
  { id: 'debate', label: 'Debate', icon: Swords, color: 'text-amber-500' },
  { id: 'risk', label: 'Risk', icon: Shield, color: 'text-blue-500' },
  { id: 'strategy', label: 'Strategy', icon: Sparkles, color: 'text-purple-500' },
  { id: 'backtest', label: 'Backtest', icon: BarChart3, color: 'text-emerald-500' },
] as const;

const STAGE_ORDER = ['analysts', 'debate', 'risk', 'strategy', 'backtest', 'done'] as const;

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as typeof STAGE_ORDER[number]);
  return idx >= 0 ? idx : -1;
}

// ---------------------------------------------------------------------------
// Analyst metadata
// ---------------------------------------------------------------------------

const ANALYST_META: Record<string, { name: string; icon: LucideIcon; color: string; borderColor: string }> = {
  market_analyst: { name: 'Market Analyst', icon: TrendingUp, color: 'text-blue-400', borderColor: 'border-l-blue-400' },
  sentiment_analyst: { name: 'Sentiment Analyst', icon: BarChart3, color: 'text-purple-400', borderColor: 'border-l-purple-400' },
  news_analyst: { name: 'News Analyst', icon: Newspaper, color: 'text-amber-400', borderColor: 'border-l-amber-400' },
  fundamentals_analyst: { name: 'Fundamentals Analyst', icon: Link2, color: 'text-emerald-400', borderColor: 'border-l-emerald-400' },
};

// ---------------------------------------------------------------------------
// Debate speaker metadata
// ---------------------------------------------------------------------------

const SPEAKER_META: Record<string, { icon: LucideIcon; color: string; bgColor: string; label: string }> = {
  bull: { icon: TrendingUp, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20', label: 'BULL' },
  bear: { icon: TrendingUp, color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/20', label: 'BEAR' },
  aggressive: { icon: Flame, color: 'text-orange-400', bgColor: 'bg-orange-500/10 border-orange-500/20', label: 'Aggressive' },
  conservative: { icon: Shield, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20', label: 'Conservative' },
  neutral: { icon: Eye, color: 'text-gray-400', bgColor: 'bg-gray-500/10 border-gray-500/20', label: 'Neutral' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWaveStatus(statuses: string[]): 'pending' | 'running' | 'complete' | 'error' {
  if (statuses.every(s => s === 'complete')) return 'complete';
  if (statuses.some(s => s === 'error')) return 'error';
  if (statuses.some(s => s === 'running')) return 'running';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Quick-pick symbols
// ---------------------------------------------------------------------------

const QUICK_SYMBOLS = [
  'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'DOGE/USDT:USDT',
  'WIF/USDT:USDT', 'PEPE/USDT:USDT', 'BONK/USDT:USDT', 'SUI/USDT:USDT',
  'XRP/USDT:USDT', 'AVAX/USDT:USDT', 'LINK/USDT:USDT', 'ARB/USDT:USDT',
];

function shortName(sym: string): string {
  return sym.replace('/USDT:USDT', '').replace('/USDT', '');
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PipelineShowcase() {
  // Read pipeline state from Zustand store — survives navigation
  const state = useTradingStore(s => s.pipelineState);
  const isRunning = useTradingStore(s => s.pipelineRunning);
  const pipelineSymbol = useTradingStore(s => s.pipelineSymbol);
  const storeSymbol = useTradingStore(s => s.selectedSymbol);

  // Local UI state only
  const [overrideSymbol, setOverrideSymbol] = useState<string | null>(null);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const selectedSymbol = overrideSymbol || storeSymbol;

  // The symbol shown in the header when pipeline is active
  const displaySymbol = pipelineSymbol || selectedSymbol || 'BTC/USDT:USDT';

  // -----------------------------------------------------------------------
  // Run / Stop — delegates to module-level runner
  // -----------------------------------------------------------------------
  const handleRun = useCallback(() => {
    const symbol = selectedSymbol || 'BTC/USDT:USDT';
    runPipeline(symbol);
  }, [selectedSymbol]);

  const handleStop = useCallback(() => {
    stopPipeline();
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const isIdle = state.stage === 'idle';
  const currentStageIdx = stageIndex(state.stage);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ================================================================ */}
      {/* IDLE STATE — Hero CTA */}
      {/* ================================================================ */}
      {isIdle && !isRunning && (
        <FadeIn className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
          <motion.div
            animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-6"
          >
            <Brain className="w-16 h-16 text-primary/60" />
          </motion.div>

          <h2 className="text-xl font-bold text-foreground mb-2">
            5-Wave Trading Intelligence Pipeline
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-1">
            4 Specialist Analysts &rarr; Bull/Bear Debate &rarr; Risk Tribunal &rarr; Strategy Synthesis &rarr; Walk-Forward Backtest
          </p>
          <p className="text-xs text-muted-foreground/60 mb-8">
            Powered by Claude Opus with 17 MCP tools
          </p>

          {/* Pipeline stage preview */}
          <div className="flex items-center gap-2 mb-6">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              return (
                <React.Fragment key={s.id}>
                  {i > 0 && <div className="w-6 h-px bg-border" />}
                  <div className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50',
                    'bg-card/30 text-muted-foreground text-xs',
                  )}>
                    <Icon className={cn('w-3.5 h-3.5', s.color)} />
                    <span>{s.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Symbol Picker */}
          <div className={cn(GLASS, 'p-4 mb-6 w-full max-w-lg')}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Select Symbol
              </span>
              <button
                onClick={() => setShowSymbolPicker(!showSymbolPicker)}
                className="text-[10px] text-primary hover:underline"
              >
                {showSymbolPicker ? 'Hide' : 'Show all'}
              </button>
            </div>

            {/* Currently selected */}
            <div className={cn(
              'flex items-center justify-center gap-2 px-4 py-2 rounded-lg mb-3',
              'bg-primary/10 border border-primary/20',
            )}>
              <span className="text-sm font-bold text-primary">{shortName(selectedSymbol || 'BTC/USDT:USDT')}</span>
              <span className="text-[10px] text-muted-foreground">/USDT</span>
            </div>

            {/* Quick picks */}
            <div className="flex flex-wrap gap-1.5 justify-center">
              {QUICK_SYMBOLS.map(sym => (
                <button
                  key={sym}
                  onClick={() => setOverrideSymbol(sym)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-all',
                    sym === selectedSymbol
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card/50 border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30',
                  )}
                >
                  {shortName(sym)}
                </button>
              ))}
            </div>

            {/* Expanded: text input for custom symbol */}
            {showSymbolPicker && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <input
                  type="text"
                  placeholder="Custom symbol (e.g. ACX/USDT:USDT)"
                  className={cn(
                    'w-full px-3 py-2 rounded-lg text-xs',
                    'bg-card/50 border border-border/50 text-foreground placeholder:text-muted-foreground/50',
                    'focus:outline-none focus:ring-1 focus:ring-primary/50',
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim().toUpperCase();
                      if (val) {
                        const formatted = val.includes('/') ? val : `${val}/USDT:USDT`;
                        setOverrideSymbol(formatted);
                      }
                    }
                  }}
                />
                <p className="text-[9px] text-muted-foreground mt-1">Press Enter to set. Use Phemex format: SYMBOL/USDT:USDT</p>
              </div>
            )}
          </div>

          <button
            onClick={handleRun}
            className={cn(
              'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm',
              'bg-primary text-primary-foreground',
              'hover:opacity-90 transition-opacity',
              'shadow-lg shadow-primary/20',
            )}
          >
            <Play className="w-4 h-4" />
            Run Analysis on {shortName(selectedSymbol || 'BTC/USDT:USDT')}
          </button>
        </FadeIn>
      )}

      {/* ================================================================ */}
      {/* ACTIVE / DONE STATE */}
      {/* ================================================================ */}
      {(!isIdle || isRunning) && (
        <div className="flex flex-col gap-4 p-4">
          {/* -------------------------------------------------------------- */}
          {/* Pipeline Progress Header */}
          {/* -------------------------------------------------------------- */}
          <div className={cn(GLASS, 'p-3')}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold">Pipeline: {shortName(displaySymbol)}</span>
              </div>
              <div className="flex items-center gap-2">
                {state.totalDuration && (
                  <span className="text-[10px] text-muted-foreground">
                    {(state.totalDuration / 1000).toFixed(1)}s
                  </span>
                )}
                {isRunning ? (
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    <Square className="w-3 h-3" />
                    Stop
                  </button>
                ) : state.stage === 'done' || state.stage === 'error' ? (
                  <button
                    onClick={handleRun}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    Re-run
                  </button>
                ) : null}
              </div>
            </div>

            {/* Stage progress bar */}
            <div className="flex items-center gap-1">
              {STAGES.map((s, i) => {
                const Icon = s.icon;
                const isActive = s.id === state.stage;
                const isComplete = currentStageIdx > i || state.stage === 'done';
                const isPending = currentStageIdx < i && state.stage !== 'done';

                return (
                  <React.Fragment key={s.id}>
                    {i > 0 && (
                      <div className={cn(
                        'flex-1 h-px transition-colors duration-500',
                        isComplete ? 'bg-emerald-500' : isActive ? 'bg-primary/50' : 'bg-border',
                      )} />
                    )}
                    <div className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-300',
                      isActive && 'bg-primary/15 text-primary ring-1 ring-primary/30',
                      isComplete && 'bg-emerald-500/10 text-emerald-500',
                      isPending && 'text-muted-foreground/50',
                    )}>
                      {isActive && isRunning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isComplete ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                      <span className="hidden sm:inline">{s.label}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* WAVE 1: Analyst Grid */}
          {/* -------------------------------------------------------------- */}
          <AnimatePresence>
            {(state.stage === 'analysts' || currentStageIdx > 0 || state.stage === 'done') && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <WaveHeader
                  title="Specialist Analysts"
                  subtitle="Wave 1"
                  icon={Activity}
                  status={getWaveStatus(Object.values(state.analysts).map(a => a.status))}
                />
                <StaggerList className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  {Object.entries(state.analysts).map(([key, analyst]) => {
                    const meta = ANALYST_META[key];
                    if (!meta) return null;
                    return (
                      <StaggerItem key={key}>
                        <AnalystCard analyst={analyst} meta={meta} />
                      </StaggerItem>
                    );
                  })}
                </StaggerList>
              </motion.div>
            )}
          </AnimatePresence>

          {/* -------------------------------------------------------------- */}
          {/* WAVE 2: Investment Debate Arena */}
          {/* -------------------------------------------------------------- */}
          <AnimatePresence>
            {(state.stage === 'debate' || state.debate.turns.length > 0 || state.debate.judge) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <WaveHeader
                  title="Investment Debate"
                  subtitle="Wave 2"
                  icon={Swords}
                  status={state.debate.judge ? 'complete' : state.debate.turns.length > 0 ? 'running' : 'pending'}
                />
                <DebateArena turns={state.debate.turns} judge={state.debate.judge} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* -------------------------------------------------------------- */}
          {/* WAVE 3: Risk Tribunal */}
          {/* -------------------------------------------------------------- */}
          <AnimatePresence>
            {(state.stage === 'risk' || state.risk.turns.length > 0 || state.risk.judge) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <WaveHeader
                  title="Risk Tribunal"
                  subtitle="Wave 3"
                  icon={Shield}
                  status={state.risk.judge ? 'complete' : state.risk.turns.length > 0 ? 'running' : 'pending'}
                />
                <RiskTribunal turns={state.risk.turns} judge={state.risk.judge} finalSize={state.risk.finalSize} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* -------------------------------------------------------------- */}
          {/* WAVE 4: Strategy Synthesis */}
          {/* -------------------------------------------------------------- */}
          <AnimatePresence>
            {(state.stage === 'strategy' || !!state.strategy.config || state.strategy.streaming.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <WaveHeader
                  title="Strategy Synthesis"
                  subtitle="Wave 4"
                  icon={Sparkles}
                  status={state.strategy.config ? 'complete' : 'running'}
                />
                <div className={cn(GLASS, 'mt-2 p-4 bg-[oklch(0.15_0.005_60)] border-purple-500/20')}>
                  <div className="text-xs text-muted-foreground max-h-60 overflow-y-auto leading-relaxed">
                    <PipelineMarkdown content={state.strategy.streaming || 'Synthesizing strategy...'} />
                    {!state.strategy.config && <span className="animate-pulse text-purple-400">|</span>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* -------------------------------------------------------------- */}
          {/* WAVE 5: Backtest Results */}
          {/* -------------------------------------------------------------- */}
          <AnimatePresence>
            {(state.backtest.running || !!state.backtest.metrics || !!state.backtest.error) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <WaveHeader
                  title="Walk-Forward Backtest"
                  subtitle="Wave 5"
                  icon={BarChart3}
                  status={state.backtest.metrics ? 'complete' : state.backtest.error ? 'error' : 'running'}
                />
                <div className={cn(GLASS, 'mt-2 p-4')}>
                  {state.backtest.running && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      Running walk-forward validation...
                    </div>
                  )}
                  {state.backtest.metrics != null && (
                    <BacktestMetrics metrics={state.backtest.metrics} />
                  )}
                  {state.backtest.error && (
                    <div className="flex items-center gap-2 text-xs text-destructive">
                      <XCircle className="w-3.5 h-3.5" />
                      {state.backtest.error}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* -------------------------------------------------------------- */}
          {/* FINAL DECISION HERO */}
          {/* -------------------------------------------------------------- */}
          <AnimatePresence>
            {state.finalDecision && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <FinalDecisionHero
                  decision={state.finalDecision}
                  confidence={state.finalConfidence}
                  duration={state.totalDuration}
                  memoriesStored={state.memory.stored}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* -------------------------------------------------------------- */}
          {/* ERROR STATE */}
          {/* -------------------------------------------------------------- */}
          {state.error && !state.finalDecision && (
            <div className={cn(GLASS, 'p-4 border-destructive/50')}>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">Pipeline Error</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{state.error}</p>
              <button
                onClick={handleRun}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Play className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// ---------------------------------------------------------------------------
// Wave Header
// ---------------------------------------------------------------------------

function WaveHeader({ title, subtitle, icon: Icon, status }: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  status: 'pending' | 'running' | 'complete' | 'error';
}) {
  return (
    <div className="flex items-center gap-2 mb-0">
      {status === 'running' ? (
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      ) : status === 'complete' ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      ) : status === 'error' ? (
        <XCircle className="w-4 h-4 text-destructive" />
      ) : (
        <Icon className="w-4 h-4 text-muted-foreground/50" />
      )}
      <span className="text-sm font-semibold text-foreground">{title}</span>
      <Badge variant="outline" className="text-[9px] px-1.5 py-0">{subtitle}</Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analyst Card (enhanced)
// ---------------------------------------------------------------------------

function AnalystCard({ analyst, meta }: {
  analyst: PipelineAnalystState;
  meta: { name: string; icon: LucideIcon; color: string; borderColor: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = meta.icon;

  return (
    <div className={cn(
      GLASS, 'p-3 border-l-2 transition-all duration-300',
      meta.borderColor,
      analyst.status === 'running' && 'shadow-[0_0_15px_rgba(var(--primary),0.06)]',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', meta.color)} />
          <span className="text-xs font-semibold text-foreground">{meta.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {analyst.status === 'running' && (
            <PulseIndicator active color="bg-primary" size="w-2 h-2" />
          )}
          {analyst.status === 'complete' && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">{(analyst.duration / 1000).toFixed(1)}s</span>
            </>
          )}
          {analyst.status === 'error' && (
            <XCircle className="w-3.5 h-3.5 text-destructive" />
          )}
          {analyst.status === 'pending' && (
            <span className="text-[10px] text-muted-foreground">Waiting</span>
          )}
        </div>
      </div>

      {/* Tool call badges */}
      {analyst.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {analyst.toolCalls.map((tc, i) => (
            <span key={i} className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {tc.tool.replace('get_', '').replace('_', ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Report */}
      {analyst.report && (
        <div onClick={() => setExpanded(!expanded)} className="w-full text-left cursor-pointer">
          <div className={cn(
            'text-[11px] text-muted-foreground leading-relaxed',
            !expanded && 'max-h-[54px] overflow-hidden',
          )}>
            <PipelineMarkdown content={analyst.report} />
          </div>
          {analyst.report.length > 200 && (
            <span className="text-[9px] text-primary mt-0.5 inline-flex items-center gap-0.5">
              {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
              {expanded ? 'Less' : 'More'}
            </span>
          )}
        </div>
      )}

      {/* Streaming cursor */}
      {analyst.status === 'running' && analyst.report && (
        <span className="animate-pulse text-primary text-xs">|</span>
      )}

      {/* Error */}
      {analyst.error && (
        <p className="text-[10px] text-destructive mt-1">{analyst.error}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debate Arena (Wave 2)
// ---------------------------------------------------------------------------

function DebateArena({ turns, judge }: {
  turns: PipelineDebateTurn[];
  judge: PipelineJudgeDecision | null;
}) {
  const bullTurns = turns.filter(t => t.speaker === 'bull');
  const bearTurns = turns.filter(t => t.speaker === 'bear');

  return (
    <div className="mt-2 space-y-3">
      {/* Two-column arena */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3">
        {/* Bull side */}
        <div className="space-y-2">
          {bullTurns.map((turn, i) => (
            <SpeakerCard key={`bull-${i}`} turn={turn} />
          ))}
          {bullTurns.length === 0 && turns.length > 0 && (
            <div className="text-[10px] text-muted-foreground p-2">Waiting for Bull...</div>
          )}
        </div>

        {/* VS divider */}
        <div className="hidden sm:flex flex-col items-center justify-center">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            'bg-amber-500/10 border border-amber-500/30',
          )}>
            <Swords className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-[9px] text-muted-foreground mt-1 font-bold">VS</span>
        </div>

        {/* Bear side */}
        <div className="space-y-2">
          {bearTurns.map((turn, i) => (
            <SpeakerCard key={`bear-${i}`} turn={turn} />
          ))}
          {bearTurns.length === 0 && turns.length > 0 && (
            <div className="text-[10px] text-muted-foreground p-2">Waiting for Bear...</div>
          )}
        </div>
      </div>

      {/* Judge verdict */}
      {judge && <JudgeCard judge={judge} label="Research Judge" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk Tribunal (Wave 3)
// ---------------------------------------------------------------------------

function RiskTribunal({ turns, judge, finalSize }: {
  turns: PipelineDebateTurn[];
  judge: PipelineJudgeDecision | null;
  finalSize: string;
}) {
  const aggressive = turns.filter(t => t.speaker === 'aggressive');
  const conservative = turns.filter(t => t.speaker === 'conservative');
  const neutral = turns.filter(t => t.speaker === 'neutral');

  return (
    <div className="mt-2 space-y-3">
      {/* Three-column tribunal */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          {aggressive.map((turn, i) => (
            <SpeakerCard key={`agg-${i}`} turn={turn} />
          ))}
        </div>
        <div className="space-y-2">
          {neutral.map((turn, i) => (
            <SpeakerCard key={`neu-${i}`} turn={turn} />
          ))}
        </div>
        <div className="space-y-2">
          {conservative.map((turn, i) => (
            <SpeakerCard key={`con-${i}`} turn={turn} />
          ))}
        </div>
      </div>

      {/* Risk Manager verdict */}
      {judge && <JudgeCard judge={judge} label="Risk Manager" extra={finalSize} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Speaker Card (Debate/Risk turns)
// ---------------------------------------------------------------------------

function SpeakerCard({ turn }: { turn: PipelineDebateTurn }) {
  const [expanded, setExpanded] = useState(false);
  const meta = SPEAKER_META[turn.speaker];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div className={cn('rounded-lg border p-3', meta.bgColor)}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={cn('w-3.5 h-3.5', meta.color, turn.speaker === 'bear' && 'rotate-180')} />
        <span className={cn('text-[11px] font-bold', meta.color)}>{meta.label}</span>
        {turn.round > 0 && turn.speaker !== 'aggressive' && turn.speaker !== 'conservative' && turn.speaker !== 'neutral' && (
          <span className="text-[9px] text-muted-foreground">Round {turn.round}</span>
        )}
      </div>
      <div onClick={() => setExpanded(!expanded)} className="w-full text-left cursor-pointer">
        <div className={cn(
          'text-[11px] text-muted-foreground leading-relaxed',
          !expanded && 'max-h-[72px] overflow-hidden',
        )}>
          <PipelineMarkdown content={turn.content} />
        </div>
        {turn.content.length > 300 && (
          <span className="text-[9px] text-primary inline-flex items-center gap-0.5 mt-0.5">
            {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
            {expanded ? 'Collapse' : 'Expand'}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Judge Card
// ---------------------------------------------------------------------------

function JudgeCard({ judge, label, extra }: {
  judge: PipelineJudgeDecision;
  label: string;
  extra?: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={cn(
      'rounded-xl border-2 p-4',
      judge.decision === 'BUY' ? 'border-emerald-500/40 bg-emerald-500/5' :
      judge.decision === 'SELL' ? 'border-red-500/40 bg-red-500/5' :
      'border-amber-500/40 bg-amber-500/5',
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-foreground" />
          <span className="text-xs font-semibold">{label}</span>
          <Badge className={cn(
            'text-[10px] font-bold border-0',
            judge.decision === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
            judge.decision === 'SELL' ? 'bg-red-500/20 text-red-400' :
            'bg-amber-500/20 text-amber-400',
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
        <button onClick={() => setExpanded(!expanded)} className="p-0.5">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>
      {expanded && judge.content && (
        <div className="text-[11px] text-muted-foreground leading-relaxed animate-in fade-in duration-200">
          <PipelineMarkdown content={judge.content} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backtest Metrics
// ---------------------------------------------------------------------------

function BacktestMetrics({ metrics }: { metrics: unknown }) {
  const m = metrics as Record<string, number>;
  if (!m) return null;

  const rows = [
    { label: 'Win Rate', value: m.winRate ?? 0, format: (v: number) => `${v.toFixed(1)}%`, good: (m.winRate ?? 0) >= 50 },
    { label: 'Profit Factor', value: m.profitFactor ?? 0, format: (v: number) => v.toFixed(2), good: (m.profitFactor ?? 0) >= 1.5 },
    { label: 'Sharpe', value: m.sharpeRatio ?? 0, format: (v: number) => v.toFixed(2), good: (m.sharpeRatio ?? 0) >= 1.0 },
    { label: 'Max DD', value: m.maxDrawdownPercent ?? 0, format: (v: number) => `${v.toFixed(1)}%`, good: (m.maxDrawdownPercent ?? 100) < 15 },
    { label: 'Trades', value: m.totalTrades ?? 0, format: (v: number) => v.toString(), good: true },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {rows.map(row => (
        <div key={row.label} className={cn(
          'text-center p-2 rounded-lg',
          row.good ? 'bg-emerald-500/5' : 'bg-red-500/5',
        )}>
          <p className={cn('text-sm font-mono font-bold', row.good ? 'text-emerald-400' : 'text-red-400')}>
            {row.value != null ? (
              <AnimatedCounter value={Math.round(row.value * 10)} duration={0.8} className="" />
            ) : 'N/A'}
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">{row.label}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Final Decision Hero
// ---------------------------------------------------------------------------

function FinalDecisionHero({ decision, confidence, duration, memoriesStored }: {
  decision: string;
  confidence: number | null;
  duration: number | null;
  memoriesStored: number;
}) {
  return (
    <div className={cn(
      'rounded-xl border-2 p-6 relative overflow-hidden',
      decision === 'BUY' ? 'border-emerald-500/50 bg-emerald-500/5' :
      decision === 'SELL' ? 'border-red-500/50 bg-red-500/5' :
      'border-amber-500/50 bg-amber-500/5',
    )}>
      {/* Glow effect */}
      <div className={cn(
        'absolute inset-0 opacity-[0.03]',
        decision === 'BUY' ? 'bg-emerald-500' :
        decision === 'SELL' ? 'bg-red-500' :
        'bg-amber-500',
      )} />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            className={cn(
              'text-3xl font-black tracking-tight',
              decision === 'BUY' ? 'text-emerald-400' :
              decision === 'SELL' ? 'text-red-400' :
              'text-amber-400',
            )}
          >
            {decision}
          </motion.div>

          {confidence != null && (
            <Badge variant="outline" className={cn(
              'text-sm font-semibold px-3 py-1',
              confidence >= 70 ? 'border-emerald-500/40 text-emerald-400' :
              confidence >= 40 ? 'border-amber-500/40 text-amber-400' :
              'border-red-500/40 text-red-400',
            )}>
              {confidence}% confidence
            </Badge>
          )}
        </div>

        <div className="text-right space-y-0.5">
          {duration != null && (
            <p className="text-xs text-muted-foreground">
              {(duration / 1000).toFixed(1)}s total
            </p>
          )}
          {memoriesStored > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {memoriesStored} memories stored
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
