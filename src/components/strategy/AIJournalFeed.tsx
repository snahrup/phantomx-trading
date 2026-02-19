'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, type TargetAndTransition, type Transition } from 'framer-motion';
import {
  Eye, Brain, Lightbulb, ArrowUpRight, ArrowDownRight,
  Activity, AlertTriangle, BookOpen, MessageSquare, TrendingUp,
  Shield, Zap, ChevronDown, ChevronRight, Filter, Play, Square,
  DollarSign, Target, BarChart3, Clock, Star, Globe, Newspaper,
  BarChart2, Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useTradingStore } from '@/store/trading-store';
import type { AIJournalEntry, AIJournalType, JournalMood, ResearchPaperTrade } from '@/types/trading';

// =============================================================================
// Design System — Entry Archetypes
// =============================================================================

interface EntryArchetype {
  icon: typeof Eye;
  label: string;
  borderColor: string;       // CSS var or color for left accent
  bgFill: string;            // subtle background fill
  textColor: string;         // icon + badge text
  animation: {
    initial: TargetAndTransition;
    animate: TargetAndTransition;
    transition: Transition;
  };
}

const ENTRY_ARCHETYPES: Record<string, EntryArchetype> = {
  observation: {
    icon: Eye,
    label: 'Observation',
    borderColor: 'var(--cl-info-border)',
    bgFill: 'var(--cl-fill-info-subtle)',
    textColor: 'text-[var(--cl-info)]',
    animation: {
      initial: { opacity: 0, x: -8 },
      animate: { opacity: 0.92, x: 0 },
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  },
  hypothesis: {
    icon: Brain,
    label: 'Hypothesis',
    borderColor: 'var(--cl-warning-border)',
    bgFill: 'var(--cl-fill-warning-subtle)',
    textColor: 'text-[var(--cl-warning)]',
    animation: {
      initial: { opacity: 0, scale: 0.97 },
      animate: { opacity: 1, scale: 1 },
      transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
    },
  },
  trade_idea: {
    icon: Lightbulb,
    label: 'Trade Idea',
    borderColor: 'var(--cl-accent-border)',
    bgFill: 'var(--cl-fill-accent-subtle)',
    textColor: 'text-primary',
    animation: {
      initial: { opacity: 0, y: 12, scale: 0.97 },
      animate: { opacity: 1, y: 0, scale: 1 },
      transition: { type: 'spring', stiffness: 300, damping: 20 },
    },
  },
  position_open: {
    icon: ArrowUpRight,
    label: 'Position Opened',
    borderColor: 'var(--cl-success-border)',
    bgFill: 'var(--journal-trade-bg)',
    textColor: 'text-[var(--color-long)]',
    animation: {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      transition: { type: 'spring', stiffness: 400, damping: 18 },
    },
  },
  position_monitor: {
    icon: Activity,
    label: 'Monitoring',
    borderColor: 'var(--cl-info-border)',
    bgFill: 'transparent',
    textColor: 'text-[var(--cl-info)]',
    animation: {
      initial: { opacity: 0 },
      animate: { opacity: 0.85 },
      transition: { duration: 0.3 },
    },
  },
  intervention: {
    icon: AlertTriangle,
    label: 'Intervention',
    borderColor: 'var(--cl-error-border)',
    bgFill: 'var(--journal-intervention-bg)',
    textColor: 'text-[var(--cl-error)]',
    animation: {
      initial: { opacity: 0, x: -4 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.25 },
    },
  },
  exit: {
    icon: ArrowDownRight,
    label: 'Position Closed',
    borderColor: 'var(--cl-accent-border)',
    bgFill: 'transparent',
    textColor: 'text-[var(--cl-accent)]',
    animation: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
    },
  },
  retrospective: {
    icon: BookOpen,
    label: 'Retrospective',
    borderColor: 'var(--cl-accent-border)',
    bgFill: 'var(--journal-retrospective-bg)',
    textColor: 'text-[var(--cl-accent)]',
    animation: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
    },
  },
  learning: {
    icon: Star,
    label: 'Learning',
    borderColor: 'var(--cl-warning)',
    bgFill: 'var(--journal-learning-bg)',
    textColor: 'text-[var(--cl-warning)]',
    animation: {
      initial: { opacity: 0, scale: 0.95, y: 8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 },
    },
  },
  agent_discussion: {
    icon: MessageSquare,
    label: 'Agent Discussion',
    borderColor: 'var(--cl-border-hover)',
    bgFill: 'var(--cl-fill-control)',
    textColor: 'text-muted-foreground',
    animation: {
      initial: { opacity: 0, x: -6 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.3 },
    },
  },
  market_shift: {
    icon: Globe,
    label: 'Market Shift',
    borderColor: 'var(--cl-warning-border)',
    bgFill: 'var(--cl-fill-warning-subtle)',
    textColor: 'text-[var(--cl-warning)]',
    animation: {
      initial: { opacity: 0, scaleX: 0.9 },
      animate: { opacity: 1, scaleX: 1 },
      transition: { duration: 0.4 },
    },
  },
  risk_alert: {
    icon: Shield,
    label: 'Risk Alert',
    borderColor: 'var(--cl-error-border)',
    bgFill: 'var(--journal-intervention-bg)',
    textColor: 'text-[var(--cl-error)]',
    animation: {
      initial: { opacity: 0, x: -4 },
      animate: { opacity: 1, x: 0 },
      transition: { duration: 0.2 },
    },
  },
};

// =============================================================================
// Agent Avatars — Distinct identity per agent
// =============================================================================

const AGENT_CONFIG: Record<string, { icon: typeof Brain; color: string; label: string }> = {
  'research-engine': { icon: Brain, color: 'var(--agent-research)', label: 'Research' },
  sentinel: { icon: Shield, color: 'var(--agent-sentinel)', label: 'Sentinel' },
  macro: { icon: Globe, color: 'var(--agent-macro)', label: 'Macro' },
  technical: { icon: BarChart2, color: 'var(--agent-technical)', label: 'Technical' },
  news: { icon: Newspaper, color: 'var(--agent-news)', label: 'News' },
};

function AgentAvatar({ agent, size = 24 }: { agent: string; size?: number }) {
  const config = AGENT_CONFIG[agent] ?? AGENT_CONFIG['research-engine'];
  const Icon = config.icon;
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklch, ${config.color}, transparent 85%)`,
        color: config.color,
      }}
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
    </div>
  );
}

// =============================================================================
// Mood Orb — Per-entry mood micro-expression
// =============================================================================

const MOOD_COLORS: Record<JournalMood, string> = {
  confident: 'var(--mood-confident)',
  cautious: 'var(--mood-cautious)',
  curious: 'var(--mood-curious)',
  concerned: 'var(--mood-concerned)',
  excited: 'var(--mood-excited)',
  frustrated: 'var(--mood-frustrated)',
  reflective: 'var(--mood-reflective)',
  neutral: 'var(--mood-neutral)',
};

const MOOD_LABELS: Record<JournalMood, string> = {
  confident: 'Confident',
  cautious: 'Cautious',
  curious: 'Curious',
  concerned: 'Concerned',
  excited: 'Excited',
  frustrated: 'Frustrated',
  reflective: 'Reflective',
  neutral: 'Neutral',
};

const MOOD_ANIMATIONS: Record<JournalMood, { scale?: number[]; opacity: number[] }> = {
  confident: { scale: [1, 1.15, 1], opacity: [0.9, 1, 0.9] },
  cautious: { scale: [1, 1.05, 1], opacity: [0.6, 0.9, 0.6] },
  curious: { scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] },
  concerned: { scale: [1, 1.1, 1], opacity: [0.7, 1, 0.7] },
  excited: { scale: [1, 1.2, 1], opacity: [0.9, 1, 0.9] },
  frustrated: { scale: [1, 1.1, 0.95, 1.05, 1], opacity: [0.8, 1, 0.7, 0.9, 0.8] },
  reflective: { scale: [1, 1.03, 1], opacity: [0.5, 0.75, 0.5] },
  neutral: { opacity: [0.4, 0.6, 0.4] },
};

function MoodOrb({ mood, size = 8 }: { mood: JournalMood; size?: number }) {
  return (
    <div className="relative group" title={MOOD_LABELS[mood]}>
      <motion.div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: MOOD_COLORS[mood],
        }}
        animate={MOOD_ANIMATIONS[mood]}
        transition={{ duration: mood === 'excited' ? 1.2 : 2.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Glow ring for intense moods */}
      {['confident', 'excited', 'frustrated'].includes(mood) && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: MOOD_COLORS[mood],
            filter: 'blur(3px)',
          }}
          animate={{ opacity: [0.2, 0.4, 0.2], scale: [1, 1.8, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Mood Bar — Left-edge consciousness visualization
// =============================================================================

function MoodBar({ mood }: { mood: JournalMood }) {
  const animName = `mood-${mood}`;
  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
      style={{ animation: `${animName} ${mood === 'excited' ? '1.5s' : mood === 'frustrated' ? '1.8s' : '3s'} ease-in-out infinite` }}
    />
  );
}

// =============================================================================
// Time Gap — Shows silence between entry clusters
// =============================================================================

function TimeGap({ minutes }: { minutes: number }) {
  if (minutes < 5) return null;

  const label = minutes < 60
    ? `${minutes}m of observation`
    : minutes < 1440
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m of observation`
      : `${Math.floor(minutes / 1440)}d of observation`;

  return (
    <div className="flex items-center gap-3 py-2 px-4">
      <div className="flex-1 border-t border-dashed border-[var(--cl-border-subtle)]" />
      <span className="text-[9px] text-[var(--cl-text-faint)] whitespace-nowrap tracking-wide uppercase">
        {label}
      </span>
      <div className="flex-1 border-t border-dashed border-[var(--cl-border-subtle)]" />
    </div>
  );
}

// =============================================================================
// Now Indicator — Live breathing dot showing current activity
// =============================================================================

function NowIndicator({ isActive, openPositions }: { isActive: boolean; openPositions: number }) {
  if (!isActive) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg mx-2 mb-2"
      style={{ background: 'var(--cl-fill-accent-subtle)' }}
    >
      <motion.div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: 'var(--cl-accent)' }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="shimmer-text text-[11px] font-medium">
        {openPositions > 0
          ? `Monitoring ${openPositions} position${openPositions > 1 ? 's' : ''}... next think cycle soon`
          : 'Scanning markets... processing signals'}
      </span>
    </motion.div>
  );
}

// =============================================================================
// Confidence Bar — Animated
// =============================================================================

function ConfidenceIndicator({ value }: { value: number }) {
  const color = value >= 75 ? 'var(--color-long)' : value >= 50 ? 'var(--cl-warning)' : 'var(--cl-error)';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--cl-fill-control)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
        />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground">{value}%</span>
    </div>
  );
}

// =============================================================================
// Journal Entry Cards — Type-specific visual treatments
// =============================================================================

function JournalEntryCard({ entry, isReply }: { entry: AIJournalEntry; isReply?: boolean }) {
  const [showThinking, setShowThinking] = useState(false);
  const archetype = ENTRY_ARCHETYPES[entry.type] ?? ENTRY_ARCHETYPES.observation;
  const Icon = archetype.icon;
  const timeAgo = getTimeAgo(entry.timestamp);
  const isLearning = entry.type === 'learning';
  const isRetrospective = entry.type === 'retrospective';

  return (
    <motion.div
      initial={archetype.animation.initial}
      animate={archetype.animation.animate}
      transition={archetype.animation.transition}
      className={`group relative ${isReply ? 'ml-8' : ''}`}
    >
      {/* Reply thread connector */}
      {isReply && <div className="thread-connector" style={{ top: -8 }} />}

      <div
        className={`
          relative rounded-lg transition-all duration-200
          hover:shadow-[var(--cl-shadow-card)]
          ${isLearning ? 'mx-0 p-0' : 'mx-2'}
        `}
        style={{
          background: archetype.bgFill,
        }}
      >
        {/* Left accent border */}
        <div
          className={`absolute left-0 top-2 bottom-2 rounded-full ${isLearning ? 'w-[3px]' : 'w-[2px]'}`}
          style={{
            background: isLearning
              ? 'linear-gradient(180deg, var(--cl-warning), var(--cl-accent))'
              : archetype.borderColor,
          }}
        />

        <div className={`${isLearning ? 'p-4 pl-5' : 'px-3 py-2.5 pl-4'}`}>
          {/* Header Row */}
          <div className="flex items-center gap-2 mb-1.5">
            <AgentAvatar agent={entry.agent} size={isLearning ? 28 : 22} />

            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: archetype.borderColor.replace('-border', '').includes('var') ? undefined : archetype.borderColor }}
              >
                {archetype.label}
              </span>
              <MoodOrb mood={entry.mood} size={6} />
              {entry.confidence !== undefined && (
                <ConfidenceIndicator value={entry.confidence} />
              )}
            </div>

            {entry.symbol && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 font-mono border-[var(--cl-border)]"
              >
                {entry.symbol.split('/')[0]}
              </Badge>
            )}

            <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
              {timeAgo}
            </span>
          </div>

          {/* Title — Learning gets bigger treatment */}
          <p className={`font-medium leading-tight ${isLearning ? 'text-sm mb-2' : 'text-[13px] mb-1'}`}>
            {isLearning && (
              <Star className="inline w-3.5 h-3.5 mr-1 -mt-0.5" style={{ color: 'var(--cl-warning)' }} />
            )}
            {entry.title}
          </p>

          {/* Content */}
          <div className={`text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap ${isLearning ? 'text-[12.5px] leading-[1.7]' : ''}`}>
            {entry.content}
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2">
              {entry.tags.map(tag => (
                <span
                  key={tag}
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    background: 'var(--cl-fill-control)',
                    color: 'var(--cl-text-muted)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* P&L inline for exit/retrospective */}
          {(entry.type === 'exit' || isRetrospective) && entry.data && (
            <PnLInline data={entry.data} />
          )}

          {/* Thinking / Chain of Thought */}
          {entry.thinking && (
            <div className="mt-2">
              <button
                onClick={() => setShowThinking(!showThinking)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Brain className="w-3 h-3" />
                <span>{showThinking ? 'Hide' : 'Show'} reasoning</span>
                <ChevronRight
                  className="w-3 h-3 transition-transform"
                  style={{ transform: showThinking ? 'rotate(90deg)' : 'rotate(0deg)' }}
                />
              </button>
              <AnimatePresence>
                {showThinking && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <div
                      className="mt-1.5 p-2.5 rounded text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap"
                      style={{
                        background: 'var(--cl-fill-control)',
                        borderLeft: '2px solid var(--cl-accent-border)',
                      }}
                    >
                      {entry.thinking}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Related entries reference */}
          {entry.relatedEntryIds && entry.relatedEntryIds.length > 0 && (
            <div className="flex items-center gap-1 mt-2 text-[9px] text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              <span>References {entry.relatedEntryIds.length} previous {entry.relatedEntryIds.length === 1 ? 'entry' : 'entries'}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// P&L inline display for exits/retrospectives
function PnLInline({ data }: { data: Record<string, unknown> }) {
  const pnl = data.realizedPnl as number | undefined;
  const pnlPct = data.realizedPnlPercent as number | undefined;
  if (pnl === undefined) return null;

  const isWin = pnl > 0;
  return (
    <div
      className="inline-flex items-center gap-2 mt-2 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold"
      style={{
        background: isWin ? 'var(--cl-fill-success-subtle)' : 'var(--cl-fill-error-subtle)',
        color: isWin ? 'var(--color-profit)' : 'var(--color-loss)',
      }}
    >
      <span>{isWin ? '+' : ''}{typeof pnl === 'number' ? `$${pnl.toFixed(2)}` : pnl}</span>
      {pnlPct !== undefined && (
        <span className="opacity-70">({isWin ? '+' : ''}{pnlPct.toFixed(1)}%)</span>
      )}
    </div>
  );
}

// =============================================================================
// Paper Trade Card — Open/closed position summary
// =============================================================================

function PaperTradeCard({ trade }: { trade: ResearchPaperTrade }) {
  const isOpen = trade.status === 'open';
  const pnl = trade.realizedPnl ?? trade.unrealizedPnl;
  const pnlPct = trade.realizedPnlPercent ?? trade.unrealizedPnlPercent;
  const isWin = pnl > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg overflow-hidden"
      style={{
        background: 'var(--cl-fill-control)',
        border: `1px solid ${isOpen ? 'var(--cl-info-border)' : isWin ? 'var(--cl-success-border)' : 'var(--cl-error-border)'}`,
      }}
    >
      <div className="px-3 py-2 flex items-center gap-3">
        {/* Status dot */}
        <div className="relative shrink-0">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: isOpen ? 'var(--cl-info)' : isWin ? 'var(--color-profit)' : 'var(--color-loss)' }}
          />
          {isOpen && (
            <motion.div
              className="absolute inset-0 w-2.5 h-2.5 rounded-full"
              style={{ background: 'var(--cl-info)' }}
              animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </div>

        {/* Trade info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge
              className="text-[9px] px-1.5 py-0 rounded-sm font-mono"
              style={{
                background: trade.direction === 'long' ? 'var(--cl-fill-success)' : 'var(--cl-fill-error)',
                color: trade.direction === 'long' ? 'var(--color-long)' : 'var(--color-short)',
                border: 'none',
              }}
            >
              {trade.direction.toUpperCase()}
            </Badge>
            <span className="text-xs font-semibold">{trade.symbol.split('/')[0]}</span>
            <span className="text-[9px] text-muted-foreground font-mono">{trade.leverage}x</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[9px] text-muted-foreground font-mono">
            <span>Entry ${trade.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            {trade.exitPrice && <span>Exit ${trade.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>}
            <span>SL ${trade.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span>TP ${trade.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* P&L */}
        <div className="text-right shrink-0">
          <p
            className="text-xs font-mono font-bold"
            style={{ color: isWin ? 'var(--color-profit)' : 'var(--color-loss)' }}
          >
            {pnl > 0 ? '+' : ''}${pnl.toFixed(2)}
          </p>
          <p
            className="text-[9px] font-mono"
            style={{ color: isWin ? 'var(--color-profit)' : 'var(--color-loss)', opacity: 0.7 }}
          >
            {pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* MFE/MAE bar for closed trades */}
      {!isOpen && trade.maxFavorableExcursion > 0 && (
        <div className="px-3 pb-1.5 flex items-center gap-2 text-[8px] text-muted-foreground font-mono">
          <span>MFE +{trade.maxFavorableExcursion.toFixed(1)}%</span>
          <span>MAE -{trade.maxAdverseExcursion.toFixed(1)}%</span>
          {trade.exitReason && (
            <span className="ml-auto px-1.5 py-0.5 rounded" style={{ background: 'var(--cl-fill-control)' }}>
              {trade.exitReason.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// Stats Bar — Key metrics at a glance
// =============================================================================

function PaperTradingStats() {
  const state = useTradingStore(s => s.paperTradingState);
  if (!state) return null;

  const winRate = state.totalTrades > 0
    ? ((state.winCount / state.totalTrades) * 100).toFixed(1)
    : '0.0';
  const equityDelta = ((state.currentEquity - state.virtualBalance) / state.virtualBalance * 100);

  const stats = [
    {
      icon: DollarSign,
      label: 'Equity',
      value: `$${state.currentEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      delta: `${equityDelta >= 0 ? '+' : ''}${equityDelta.toFixed(1)}%`,
      positive: equityDelta >= 0,
    },
    {
      icon: Target,
      label: 'Win Rate',
      value: `${winRate}%`,
      delta: `${state.winCount}W / ${state.lossCount}L`,
      positive: parseFloat(winRate) > 50,
    },
    {
      icon: BarChart3,
      label: 'PF',
      value: state.profitFactor === Infinity ? '∞' : state.profitFactor.toFixed(2),
      delta: '',
      positive: state.profitFactor > 1,
    },
    {
      icon: Clock,
      label: 'Max DD',
      value: `${state.maxDrawdownPercent.toFixed(1)}%`,
      delta: '',
      positive: state.maxDrawdownPercent < 15,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-1.5 px-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-md px-2 py-1.5"
          style={{ background: 'var(--cl-fill-control)' }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <s.icon className="w-2.5 h-2.5 text-muted-foreground" />
            <span className="text-[8px] text-muted-foreground uppercase tracking-wider font-medium">{s.label}</span>
          </div>
          <p
            className="text-[13px] font-mono font-bold leading-tight"
            style={{ color: s.positive ? 'var(--color-profit)' : 'var(--color-loss)' }}
          >
            {s.value}
          </p>
          {s.delta && (
            <p className="text-[8px] text-muted-foreground font-mono">{s.delta}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type FilterType = 'all' | AIJournalType;

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'trade_idea', label: 'Ideas' },
  { value: 'position_open', label: 'Opens' },
  { value: 'exit', label: 'Exits' },
  { value: 'retrospective', label: 'Retros' },
  { value: 'learning', label: 'Lessons' },
  { value: 'observation', label: 'Obs' },
  { value: 'hypothesis', label: 'Hypo' },
  { value: 'risk_alert', label: 'Alerts' },
  { value: 'agent_discussion', label: 'Agents' },
];

export default function AIJournalFeed() {
  const journal = useTradingStore(s => s.aiJournal);
  const paperState = useTradingStore(s => s.paperTradingState);
  const paperTrades = useTradingStore(s => s.paperTrades);
  const setAIJournal = useTradingStore(s => s.setAIJournal);
  const setPaperTradingState = useTradingStore(s => s.setPaperTradingState);
  const addAIJournalEntry = useTradingStore(s => s.addAIJournalEntry);

  const [filter, setFilter] = useState<FilterType>('all');
  const [showPositions, setShowPositions] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // SSE connection for real-time updates
  useEffect(() => {
    const sse = new EventSource('/api/paper-trading');
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'init') {
          if (data.state) setPaperTradingState(data.state);
          if (data.recentJournal?.length > 0) setAIJournal(data.recentJournal);
        } else if (data.type === 'journal') {
          addAIJournalEntry(data.data);
        } else if (data.type === 'stats_update') {
          setPaperTradingState(data.data);
        }
      } catch {
        // Parse error
      }
    };

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [setAIJournal, setPaperTradingState, addAIJournalEntry]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (isNearBottom) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
      }
    }
  }, [journal.length]);

  // Start/stop paper trading
  const handleToggle = useCallback(async () => {
    try {
      const action = paperState?.isActive ? 'stop' : 'start';
      await fetch('/api/paper-trading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
    } catch {
      // Error
    }
  }, [paperState?.isActive]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    const entries = filter === 'all' ? journal : journal.filter(e => e.type === filter);
    return entries;
  }, [journal, filter]);

  // Group entries with time gaps
  const entriesWithGaps = useMemo(() => {
    const result: Array<{ type: 'entry'; entry: AIJournalEntry; isReply: boolean } | { type: 'gap'; minutes: number }> = [];

    for (let i = 0; i < filteredEntries.length; i++) {
      // Insert time gap if > 5 min since last entry
      if (i > 0) {
        const gap = (filteredEntries[i].timestamp - filteredEntries[i - 1].timestamp) / 60000;
        if (gap >= 5) {
          result.push({ type: 'gap', minutes: Math.round(gap) });
        }
      }

      const isReply = !!filteredEntries[i].replyTo;
      result.push({ type: 'entry', entry: filteredEntries[i], isReply });
    }
    return result;
  }, [filteredEntries]);

  // Current mood (from most recent entry)
  const currentMood = journal.length > 0 ? journal[journal.length - 1].mood : 'neutral' as JournalMood;

  // Positions
  const openTrades = paperTrades.filter(t => t.status === 'open');
  const recentClosed = paperTrades.filter(t => t.status === 'closed').slice(-3);

  return (
    <div className="flex flex-col h-full relative">
      {/* Global mood bar on left edge */}
      <MoodBar mood={currentMood} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Brain className="w-4 h-4 text-primary" />
            {paperState?.isActive && (
              <motion.div
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ background: 'var(--color-profit)' }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-none">AI Internal Monologue</h3>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {paperState?.isActive
                ? `${MOOD_LABELS[currentMood]} · ${journal.length} thoughts`
                : 'Paper trading engine idle'}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={paperState?.isActive ? 'destructive' : 'default'}
          className="h-7 text-[11px] gap-1 px-3"
          onClick={handleToggle}
        >
          {paperState?.isActive
            ? <><Square className="w-3 h-3" /> Stop</>
            : <><Play className="w-3 h-3" /> Start</>}
        </Button>
      </div>

      {/* Stats */}
      {paperState && paperState.totalTrades > 0 && <PaperTradingStats />}

      {/* Open Positions */}
      {openTrades.length > 0 && (
        <div className="px-3 pt-2">
          <button
            className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors mb-1.5 uppercase tracking-wider"
            onClick={() => setShowPositions(!showPositions)}
          >
            <Radio className="w-3 h-3" style={{ color: 'var(--cl-info)' }} />
            Open Positions ({openTrades.length})
            <ChevronDown
              className="w-3 h-3 transition-transform"
              style={{ transform: showPositions ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            />
          </button>
          <AnimatePresence>
            {showPositions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-1.5"
              >
                {openTrades.map(trade => (
                  <PaperTradeCard key={trade.id} trade={trade} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1.5 overflow-x-auto scrollbar-none">
        <Filter className="w-3 h-3 text-muted-foreground shrink-0 mr-0.5" />
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap transition-all duration-150 ${
              filter === f.value
                ? 'font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            style={filter === f.value ? {
              background: 'var(--cl-fill-accent)',
              color: 'var(--cl-accent)',
            } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Separator className="opacity-50" />

      {/* Journal Feed */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="py-2 space-y-1">
          {/* Now indicator at top when active */}
          <NowIndicator isActive={!!paperState?.isActive} openPositions={openTrades.length} />

          <AnimatePresence mode="popLayout">
            {entriesWithGaps.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 text-center px-8"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'var(--cl-fill-accent-subtle)' }}
                >
                  <Brain className="w-6 h-6" style={{ color: 'var(--cl-accent)', opacity: 0.4 }} />
                </div>
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  {paperState?.isActive
                    ? 'Waiting for first think cycle...'
                    : 'Start paper trading to observe the AI\'s internal monologue'}
                </p>
              </motion.div>
            ) : (
              entriesWithGaps.map((item, i) =>
                item.type === 'gap' ? (
                  <TimeGap key={`gap-${i}`} minutes={item.minutes} />
                ) : (
                  <JournalEntryCard
                    key={item.entry.id}
                    entry={item.entry}
                    isReply={item.isReply}
                  />
                )
              )
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Recent Closed Trades */}
      {recentClosed.length > 0 && (
        <div className="px-3 pb-2 pt-1 space-y-1.5 border-t" style={{ borderColor: 'var(--cl-border-subtle)' }}>
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Closes</p>
          {recentClosed.map(trade => (
            <PaperTradeCard key={trade.id} trade={trade} />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
