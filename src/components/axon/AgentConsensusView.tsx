'use client';

import { useMemo } from 'react';
import { useAxonStore } from '@/store/axon-store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

// ---------------------------------------------------------------------------
// Research analyst IDs — match by name/role keywords
// ---------------------------------------------------------------------------

const RESEARCH_KEYWORDS = [
  'market research',
  'market_analyst',
  'on-chain',
  'onchain',
  'onchain_analyst',
  'sentiment',
  'sentiment_analyst',
  'microstructure',
  'microstructure_analyst',
];

// ---------------------------------------------------------------------------
// Signal detection
// ---------------------------------------------------------------------------

type Signal = 'bullish' | 'bearish' | 'neutral';

const BULLISH_KEYWORDS = ['bullish', 'long', 'buy', 'upward', 'breakout', 'accumulation', 'bullish divergence', 'golden cross'];
const BEARISH_KEYWORDS = ['bearish', 'short', 'sell', 'downward', 'breakdown', 'distribution', 'bearish divergence', 'death cross'];

function detectSignal(text: string): Signal {
  const lower = text.toLowerCase();
  let bullCount = 0;
  let bearCount = 0;

  for (const kw of BULLISH_KEYWORDS) {
    if (lower.includes(kw)) bullCount++;
  }
  for (const kw of BEARISH_KEYWORDS) {
    if (lower.includes(kw)) bearCount++;
  }

  if (bullCount > bearCount) return 'bullish';
  if (bearCount > bullCount) return 'bearish';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentConsensusView({ compact = false }: { compact?: boolean }) {
  const agents = useAxonStore((s) => s.agents);
  const agentEvents = useAxonStore((s) => s.agentEvents);

  const consensus = useMemo(() => {
    // Find research analyst agents
    const researchAgents = agents.filter((a) => {
      const searchStr = `${a.name} ${a.role} ${a.title}`.toLowerCase();
      return RESEARCH_KEYWORDS.some((kw) => searchStr.includes(kw));
    });

    if (researchAgents.length === 0) return null;

    // Get latest heartbeat event for each research analyst
    const heartbeatEvents = agentEvents.filter((e) => e.action === 'heartbeat');

    const signals: { agentName: string; signal: Signal; agentId: string }[] = [];

    for (const agent of researchAgents) {
      // Find the latest heartbeat event for this agent
      const latestHb = [...heartbeatEvents]
        .filter((e) => e.agent_id === agent.id)
        .pop();

      if (latestHb) {
        const detail = latestHb.detail ?? {};
        const logText = (detail.log_text as string) ?? (detail.summary as string) ?? '';
        if (logText) {
          signals.push({
            agentName: agent.name,
            signal: detectSignal(logText),
            agentId: agent.id,
          });
        }
      }
    }

    if (signals.length === 0) return null;

    const bullish = signals.filter((s) => s.signal === 'bullish').length;
    const bearish = signals.filter((s) => s.signal === 'bearish').length;
    const neutral = signals.filter((s) => s.signal === 'neutral').length;
    const total = signals.length;

    // Determine consensus
    let direction: Signal;
    let confidence: 'high' | 'medium' | 'low';

    if (bullish > bearish && bullish > neutral) {
      direction = 'bullish';
      confidence = bullish >= total * 0.75 ? 'high' : bullish > total * 0.5 ? 'medium' : 'low';
    } else if (bearish > bullish && bearish > neutral) {
      direction = 'bearish';
      confidence = bearish >= total * 0.75 ? 'high' : bearish > total * 0.5 ? 'medium' : 'low';
    } else {
      direction = 'neutral';
      confidence = 'low';
    }

    return { direction, confidence, bullish, bearish, neutral, total, signals };
  }, [agents, agentEvents]);

  // No data state
  if (!consensus) {
    if (compact) {
      return (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          <Activity className="w-3 h-3 mr-0.5" />
          No analysis
        </Badge>
      );
    }
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
        <Activity className="w-3.5 h-3.5 text-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground">No recent analysis from research team</span>
      </div>
    );
  }

  const { direction, confidence, bullish, bearish, neutral, total, signals } = consensus;

  const directionConfig = {
    bullish: { icon: TrendingUp, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', label: 'Bullish' },
    bearish: { icon: TrendingDown, color: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/5', label: 'Bearish' },
    neutral: { icon: Minus, color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/5', label: 'Neutral' },
  };

  const config = directionConfig[direction];
  const DirIcon = config.icon;

  // -----------------------------------------------------------------------
  // Compact mode — for header bars
  // -----------------------------------------------------------------------
  if (compact) {
    // Simple inline badge
    if (bullish === total || bearish === total || neutral === total) {
      return (
        <Badge variant="outline" className={cn('text-[10px]', config.color, config.border)}>
          <DirIcon className="w-3 h-3 mr-0.5" />
          {total}/{total} {config.label}
        </Badge>
      );
    }

    // Split display
    return (
      <div className="flex items-center gap-1.5">
        <Badge variant="outline" className={cn('text-[10px]', config.color, config.border)}>
          <DirIcon className="w-3 h-3 mr-0.5" />
          Consensus
        </Badge>
        <div className="flex items-center gap-1 text-[9px]">
          {bullish > 0 && <span className="text-emerald-400">{bullish}B</span>}
          {bearish > 0 && <span className="text-red-400">{bearish}S</span>}
          {neutral > 0 && <span className="text-amber-400">{neutral}N</span>}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Full mode — for sidebar / pipeline view
  // -----------------------------------------------------------------------

  const confidenceColors = {
    high: 'text-foreground',
    medium: 'text-foreground/80',
    low: 'text-muted-foreground',
  };

  // Summary text
  const isSplit = !(bullish === total || bearish === total || neutral === total);
  const summaryText = isSplit
    ? `Split: ${[
        bullish > 0 ? `${bullish} Bull` : '',
        bearish > 0 ? `${bearish} Bear` : '',
        neutral > 0 ? `${neutral} Neutral` : '',
      ].filter(Boolean).join(', ')}`
    : `${total}/${total} ${config.label} (${confidence.charAt(0).toUpperCase() + confidence.slice(1)} Confidence)`;

  return (
    <div className={cn('rounded-lg border px-3 py-2.5', config.border, config.bg)}>
      <div className="flex items-center gap-2">
        <DirIcon className={cn('w-4 h-4', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs font-semibold', confidenceColors[confidence])}>
              Research Consensus
            </span>
            <Badge variant="outline" className={cn('text-[9px] px-1 py-0', config.color, config.border)}>
              {config.label}
            </Badge>
          </div>
          <span className="text-[10px] text-muted-foreground">{summaryText}</span>
        </div>
      </div>

      {/* Individual analyst signals */}
      <div className="flex items-center gap-1.5 mt-2">
        {signals.map((s) => {
          const sConfig = directionConfig[s.signal];
          const SIcon = sConfig.icon;
          return (
            <div
              key={s.agentId}
              className={cn(
                'flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px]',
                'bg-background/50 border border-border/30',
              )}
              title={`${s.agentName}: ${s.signal}`}
            >
              <SIcon className={cn('w-2.5 h-2.5', sConfig.color)} />
              <span className="text-muted-foreground truncate max-w-[60px]">
                {s.agentName.replace(/(?:Research|Analyst)\s*/gi, '').trim() || s.agentName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
