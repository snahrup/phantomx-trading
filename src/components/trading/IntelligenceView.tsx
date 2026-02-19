'use client';

import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Sun } from 'lucide-react';
import { useTradingStore } from '@/store/trading-store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { KnowledgeEntry, AgentStatus, AgentEvent, SignalSummary } from '@/types/trading';
import type { InterventionLog, InterventionSummary } from '@/lib/ai/intervention-logger';

// ============================================================================
// PhantomX — Intelligence View
// The foundation layer: knowledge base, behavioral learnings, intervention
// track record, and agent signal history. Everything the AI knows, visible.
// ============================================================================

// --- Types ---

interface KBData {
  entries: KnowledgeEntry[];
  count: number;
}

interface InterventionData {
  logs: InterventionLog[];
  stats: InterventionSummary;
}

// --- Hex color constants for JS-level color computations ---

const COLORS = {
  accent: '#AE5630',
  success: '#2D8547',
  warning: '#B8860B',
  error: '#D4183D',
  info: '#1C6BBB',
  textSecondary: '#6B6A68',
  bgSurface: 'hsl(var(--card))',
  border: 'hsl(var(--border))',
  borderSubtle: 'hsl(var(--border) / 0.5)',
} as const;

// --- Category metadata ---

const CATEGORY_META: Record<string, { label: string; color: string; tw: string; icon: string }> = {
  learnings:          { label: 'Learnings',       color: COLORS.accent,        tw: 'text-primary',        icon: '\uD83E\uDDE0' },
  strategies:         { label: 'Strategies',      color: COLORS.success,       tw: 'text-[#2D8547]',      icon: '\uD83C\uDFAF' },
  patterns:           { label: 'Patterns',        color: COLORS.warning,       tw: 'text-[#B8860B]',      icon: '\uD83D\uDD0D' },
  'market-analysis':  { label: 'Market Analysis', color: COLORS.info,          tw: 'text-[#1C6BBB]',      icon: '\uD83D\uDCC8' },
  'risk-management':  { label: 'Risk Mgmt',       color: COLORS.error,         tw: 'text-destructive',    icon: '\uD83D\uDEE1' },
  custom:             { label: 'Custom',           color: COLORS.textSecondary, tw: 'text-muted-foreground', icon: '\uD83D\uDCCC' },
};

// --- Helpers ---

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function timestampAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// --- Markdown renderer for knowledge content ---

const KBMarkdown = memo(function KBMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="text-foreground" style={{ fontWeight: 600 }}>{children}</strong>,
        em: ({ children }) => <em className="text-muted-foreground italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-muted-foreground/80">{children}</li>,
        code: ({ children }) => <code className="px-1 py-0.5 rounded bg-muted/80 text-primary font-mono text-[10px]">{children}</code>,
        h1: ({ children }) => <div className="text-[12px] font-bold text-foreground mb-1">{children}</div>,
        h2: ({ children }) => <div className="text-[11px] font-bold text-foreground mb-1">{children}</div>,
        h3: ({ children }) => <div className="text-[11px] font-semibold text-foreground mb-1">{children}</div>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

// --- Strip markdown for plain-text preview ---

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold alt
    .replace(/_(.+?)_/g, '$1')          // italic alt
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/^#{1,6}\s+/gm, '')        // headings
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Parse learning content sections ---

function parseLearningContent(content: string): { pattern?: string; evidence?: string; impact?: string; recommendation?: string } {
  const result: Record<string, string> = {};
  for (const section of ['Pattern', 'Evidence', 'Impact', 'Recommendation']) {
    const re = new RegExp(`\\*\\*${section}:\\*\\*\\s*([\\s\\S]*?)(?=\\*\\*(?:Pattern|Evidence|Impact|Recommendation):\\*\\*|$)`);
    const m = content.match(re);
    if (m) result[section.toLowerCase()] = m[1].trim();
  }
  return result;
}

// --- Metric Card ---

function MetricCard({ label, value, subtext, color }: { label: string; value: string; subtext?: string; color?: string }) {
  return (
    <Card className="py-0 gap-0 rounded-lg shadow-sm">
      <CardContent className="p-4 flex flex-col gap-1">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</div>
        <div className={`text-xl font-bold font-mono ${color || 'text-foreground'}`}>{value}</div>
        {subtext && <div className="text-[10px] text-muted-foreground">{subtext}</div>}
      </CardContent>
    </Card>
  );
}

// --- Category Pill ---

function CategoryPill({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? { label: category, color: COLORS.textSecondary, tw: 'text-muted-foreground', icon: '\u25CF' };
  return (
    <Badge
      variant="outline"
      className={`gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium`}
      style={{ borderColor: meta.color, color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
    >
      <span className="text-[10px]">{meta.icon}</span>
      {meta.label}
    </Badge>
  );
}

// --- Source Badge ---

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    ai: 'text-primary',
    user: 'text-[#2D8547]',
    system: 'text-[#B8860B]',
  };
  return (
    <span className={`text-[8px] uppercase tracking-wider font-bold ${colors[source] ?? 'text-muted-foreground'}`}>
      {source}
    </span>
  );
}

// --- Intervention Accuracy Gauge (SVG) ---

function AccuracyGauge({ accuracy, total }: { accuracy: number; total: number }) {
  const width = 120;
  const height = 70;
  const cx = width / 2;
  const cy = height - 8;
  const r = 48;
  const sweepAngle = Math.PI - (accuracy / 100) * Math.PI;

  const bgArc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
  const fillEndX = cx + r * Math.cos(sweepAngle);
  const fillEndY = cy - r * Math.sin(sweepAngle);
  const largeArc = accuracy > 50 ? 1 : 0;
  const fillArc = `M${cx - r},${cy} A${r},${r} 0 ${largeArc} 1 ${fillEndX},${fillEndY}`;

  const gaugeColor = accuracy >= 70 ? COLORS.success : accuracy >= 40 ? COLORS.warning : COLORS.error;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <path d={bgArc} fill="none" stroke="hsl(var(--border))" strokeWidth="8" strokeLinecap="round" />
        {total > 0 && <path d={fillArc} fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round" />}
        <text x={cx} y={cy - 14} textAnchor="middle" className="text-xl font-bold fill-foreground" fontFamily="monospace">
          {total > 0 ? `${accuracy}%` : '\u2014'}
        </text>
        <text x={cx} y={cy - 2} textAnchor="middle" className="text-[8px] fill-muted-foreground">
          accuracy
        </text>
      </svg>
    </div>
  );
}

// --- Pattern Distribution Bar Chart (SVG) ---

function PatternDistribution({ patterns }: { patterns: InterventionSummary['topPatterns'] }) {
  if (patterns.length === 0) {
    return <div className="text-[10px] text-muted-foreground opacity-40 text-center py-4">No pattern data yet</div>;
  }

  const maxCount = Math.max(...patterns.map(p => p.count), 1);

  return (
    <div className="space-y-1.5">
      {patterns.map(p => (
        <div key={p.tag} className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/80 w-28 truncate font-mono">{p.tag}</span>
          <div className="flex-1 h-3 bg-muted/80 rounded-full overflow-hidden flex">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(p.preventedCount / maxCount) * 100}%`, opacity: 0.9 }}
              title={`${p.preventedCount} prevented`}
            />
            <div
              className="h-full"
              style={{ width: `${((p.count - p.preventedCount) / maxCount) * 100}%`, opacity: 0.7, backgroundColor: COLORS.warning }}
              title={`${p.count - p.preventedCount} overridden`}
            />
          </div>
          <span className="text-[9px] font-mono text-muted-foreground w-8 text-right">{p.count}x</span>
        </div>
      ))}
    </div>
  );
}

// --- Knowledge Entry Card ---

function KnowledgeCard({ entry, expanded, onToggle }: { entry: KnowledgeEntry; expanded: boolean; onToggle: () => void }) {
  const stripped = stripMarkdown(entry.content);
  const preview = stripped.slice(0, 200);
  const hasMore = stripped.length > 200;

  return (
    <div
      className="px-3 py-2.5 rounded-lg border border-border/50 bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CategoryPill category={entry.category} />
            <SourceBadge source={entry.source} />
            <span className="text-[8px] text-muted-foreground">{timeAgo(entry.updated)}</span>
          </div>
          <div className="text-[12px] font-semibold text-foreground truncate">{entry.title}</div>
        </div>
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 mt-1 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </div>

      {expanded ? (
        <div className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed border-t border-border/50 pt-2">
          <KBMarkdown content={entry.content} />
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
          {preview}{hasMore ? '...' : ''}
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {entry.tags.map(tag => (
            <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground font-mono">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Intervention Timeline Item ---

function InterventionItem({ log }: { log: InterventionLog }) {
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/80 transition-colors">
      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.wasOverridden ? 'bg-[#B8860B]' : 'bg-primary'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-semibold text-foreground">
            {log.symbol?.replace('/USDT:USDT', '') || '\u2014'}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-primary font-mono">
            {log.patternTag}
          </span>
          {log.wasOverridden && (
            <Badge variant="outline" className="text-[8px] px-1 py-0.5 rounded border-[#B8860B]/20 bg-[#B8860B]/8 text-[#B8860B] font-bold uppercase">
              overridden
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {log.originalAction} &rarr; {log.finalAction}
          <span className="ml-2 text-muted-foreground">{log.confidence}% confidence</span>
        </div>
        {log.outcome && (
          <div className="text-[9px] mt-0.5">
            <span className={log.outcome.wasCorrect ? 'text-[#2D8547]' : 'text-destructive'}>
              {log.outcome.wasCorrect ? 'Correct call' : 'Wrong call'}
            </span>
            {log.outcome.pnl != null && (
              <span className="ml-1 font-mono">
                ({log.outcome.pnl >= 0 ? '+' : ''}${log.outcome.pnl.toFixed(2)})
              </span>
            )}
          </div>
        )}
      </div>
      <span className="text-[8px] text-muted-foreground flex-shrink-0">{timestampAgo(log.timestamp)}</span>
    </div>
  );
}

// --- Agent Constellation (Radar-style SVG) ---

const AGENT_POSITIONS: Record<string, { angle: number; label: string; icon: string }> = {
  sentinel:  { angle: -90,  label: 'Sentinel',  icon: '\uD83D\uDEE1' },
  technical: { angle: 0,    label: 'Technical',  icon: '\uD83D\uDCC8' },
  news:      { angle: 90,   label: 'News',       icon: '\uD83D\uDCF0' },
  macro:     { angle: 180,  label: 'Macro',      icon: '\uD83C\uDF0D' },
};

function sentimentToColor(s: string): string {
  return s === 'bullish' ? COLORS.success : s === 'bearish' ? COLORS.error : COLORS.warning;
}

function AgentConstellation({ agents, consensus, events }: { agents: AgentStatus[]; consensus: SignalSummary | null; events: AgentEvent[] }) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 130;
  const innerR = 36;
  const nodeR = 24;

  // Radar rings
  const rings = [outerR, outerR * 0.66, outerR * 0.33];

  // Consensus color
  const consColor = consensus ? sentimentToColor(consensus.consensusSentiment) : COLORS.textSecondary;
  const consConf = consensus?.consensusConfidence ?? 0;

  // Agent node positions
  const agentNodes = agents.map(agent => {
    const pos = AGENT_POSITIONS[agent.id] ?? { angle: 0, label: agent.name, icon: '\u25CF' };
    const rad = (pos.angle * Math.PI) / 180;
    const x = cx + outerR * Math.cos(rad);
    const y = cy + outerR * Math.sin(rad);
    const confidence = agent.latestSignal?.confidence ?? 0;
    const sentiment = agent.latestSignal?.sentiment ?? 'neutral';
    const color = sentimentToColor(sentiment);
    const isRunning = agent.state === 'running';

    return { agent, x, y, confidence, sentiment, color, isRunning, label: pos.label, icon: pos.icon };
  });

  return (
    <div className="flex gap-3">
      {/* SVG Constellation */}
      <div className="flex-shrink-0">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="block">
          {/* Radar rings */}
          {rings.map((r, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border) / 0.5)" strokeWidth="0.5" strokeDasharray={i > 0 ? '4 4' : 'none'} opacity={0.5} />
          ))}

          {/* Cross-hairs */}
          <line x1={cx - outerR - 10} y1={cy} x2={cx + outerR + 10} y2={cy} stroke="hsl(var(--border) / 0.5)" strokeWidth="0.5" opacity={0.3} />
          <line x1={cx} y1={cy - outerR - 10} x2={cx} y2={cy + outerR + 10} stroke="hsl(var(--border) / 0.5)" strokeWidth="0.5" opacity={0.3} />

          {/* Signal strength arcs (connection lines from agents to center) */}
          {agentNodes.map(node => {
            if (!node.isRunning || node.confidence === 0) return null;
            const strength = node.confidence / 100;
            return (
              <g key={`line-${node.agent.id}`}>
                {/* Connection line */}
                <line
                  x1={node.x} y1={node.y} x2={cx} y2={cy}
                  stroke={node.color} strokeWidth={1 + strength * 2} opacity={0.15 + strength * 0.35}
                  strokeDasharray={node.agent.latestSignal ? 'none' : '4 4'}
                />
                {/* Confidence indicator along the line */}
                <circle
                  cx={node.x + (cx - node.x) * 0.5}
                  cy={node.y + (cy - node.y) * 0.5}
                  r={3 + strength * 4}
                  fill={node.color} opacity={0.2}
                />
              </g>
            );
          })}

          {/* Center consensus hub */}
          <circle cx={cx} cy={cy} r={innerR + 4} fill={consColor} opacity={0.06} />
          <circle cx={cx} cy={cy} r={innerR} fill="hsl(var(--card))" stroke={consColor} strokeWidth="2" />
          {consensus && (
            <>
              <text x={cx} y={cy - 6} textAnchor="middle" className="text-[14px] font-bold fill-foreground" fontFamily="monospace">
                {consConf}%
              </text>
              <text x={cx} y={cy + 8} textAnchor="middle" className="text-[8px] fill-muted-foreground" fontFamily="monospace">
                {consensus.consensusSentiment.toUpperCase()}
              </text>
            </>
          )}
          {!consensus && (
            <text x={cx} y={cy + 3} textAnchor="middle" className="text-[9px] fill-muted-foreground">
              IDLE
            </text>
          )}

          {/* Agent nodes */}
          {agentNodes.map(node => {
            const stateRing = node.isRunning ? node.color : COLORS.textSecondary;
            return (
              <g key={node.agent.id}>
                {/* Glow for running agents */}
                {node.isRunning && node.confidence > 0 && (
                  <circle cx={node.x} cy={node.y} r={nodeR + 6} fill={node.color} opacity={0.08} />
                )}
                {/* Node circle */}
                <circle cx={node.x} cy={node.y} r={nodeR} fill="hsl(var(--card))" stroke={stateRing} strokeWidth="2" />
                {/* Agent icon */}
                <text x={node.x} y={node.y - 2} textAnchor="middle" className="text-[14px]" dominantBaseline="middle">
                  {node.icon}
                </text>
                {/* Label below */}
                <text x={node.x} y={node.y + nodeR + 12} textAnchor="middle" className="text-[9px] fill-muted-foreground font-semibold" fontFamily="monospace">
                  {node.label}
                </text>
                {/* Confidence badge */}
                {node.agent.latestSignal && (
                  <g>
                    <rect x={node.x + nodeR - 6} y={node.y - nodeR - 2} width={20} height={12} rx={3} fill={node.color} opacity={0.9} />
                    <text x={node.x + nodeR + 4} y={node.y - nodeR + 7} textAnchor="middle" className="text-[8px] fill-white font-bold" fontFamily="monospace">
                      {node.confidence}
                    </text>
                  </g>
                )}
                {/* Status dot */}
                <circle cx={node.x - nodeR + 4} cy={node.y - nodeR + 4} r={3} fill={stateRing} stroke="hsl(var(--card))" strokeWidth="1" />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Activity Feed + Agent Details */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {/* Agent detail cards */}
        {agentNodes.map(node => (
          <div key={node.agent.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/50 bg-muted">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: node.isRunning ? node.color : COLORS.textSecondary }} />
            <span className="text-[10px] font-semibold text-foreground w-16">{node.label}</span>
            {node.agent.latestSignal ? (
              <>
                <span className="text-[9px] font-mono w-8 text-center" style={{ color: node.color }}>
                  {node.sentiment === 'bullish' ? '\u25B2' : node.sentiment === 'bearish' ? '\u25BC' : '\u25CF'} {node.confidence}%
                </span>
                <span className="text-[9px] text-muted-foreground flex-1 truncate">{node.agent.latestSignal.summary}</span>
              </>
            ) : (
              <span className="text-[9px] text-muted-foreground opacity-40 flex-1">
                {node.isRunning ? `Tick ${node.agent.tickCount} \u2014 awaiting signal` : 'Offline'}
              </span>
            )}
            <span className="text-[8px] text-muted-foreground font-mono flex-shrink-0">{node.agent.tickCount}t</span>
          </div>
        ))}

        {/* Recent events feed */}
        {events.length > 0 && (
          <div className="mt-1">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Recent Activity</div>
            <div className="max-h-[100px] overflow-y-auto space-y-0.5">
              {events.slice(0, 12).map((evt, i) => {
                const evtColor = evt.type === 'agent_signal' ? 'text-primary'
                  : evt.type === 'agent_error' ? 'text-destructive'
                  : 'text-muted-foreground';
                const agentLabel = AGENT_POSITIONS[evt.agentId as string]?.label ?? evt.agentId;
                return (
                  <div key={`${evt.timestamp}-${i}`} className="flex items-center gap-1.5 text-[9px]">
                    <span className="text-muted-foreground font-mono w-12 flex-shrink-0">
                      {new Date(evt.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`font-medium ${evtColor}`}>{agentLabel}</span>
                    <span className="text-muted-foreground">
                      {evt.type === 'agent_signal' ? 'published signal' :
                       evt.type === 'agent_tick' ? 'tick' :
                       evt.type === 'agent_error' ? `error: ${(evt.data as Record<string, string>).error?.slice(0, 40)}` :
                       evt.type === 'agent_started' ? 'started' :
                       evt.type === 'agent_stopped' ? 'stopped' :
                       evt.type}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {agents.length === 0 && events.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-[10px] text-muted-foreground opacity-40 text-center">
              No agent data yet. Click &ldquo;Seed Demo Data&rdquo; above<br />
              or start the orchestrator from the Intel tab.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Knowledge Pipeline (SVG Data Flow Visualization) ---

function KnowledgePipeline({
  entryCount, agentsOnline, agentTotal, signalCount,
  learningCount, interventionCount, preventedCount, accuracy,
}: {
  entryCount: number; agentsOnline: number; agentTotal: number; signalCount: number;
  learningCount: number; interventionCount: number; preventedCount: number; accuracy: number;
}) {
  const stages = [
    { label: 'Market Data', value: 'Live', sub: 'Price feeds', color: COLORS.textSecondary },
    { label: 'Agents', value: `${agentsOnline}/${agentTotal}`, sub: 'Online', color: agentsOnline > 0 ? COLORS.accent : COLORS.textSecondary },
    { label: 'Signals', value: String(signalCount), sub: 'This session', color: signalCount > 0 ? COLORS.success : COLORS.textSecondary },
    { label: 'Knowledge', value: String(entryCount), sub: 'Entries', color: entryCount > 0 ? COLORS.accent : COLORS.textSecondary },
    { label: 'Learnings', value: String(learningCount), sub: 'Behavioral', color: learningCount > 0 ? COLORS.warning : COLORS.textSecondary },
    { label: 'Interventions', value: String(interventionCount), sub: `${preventedCount} saved`, color: interventionCount > 0 ? COLORS.accent : COLORS.textSecondary },
    { label: 'Accuracy', value: accuracy > 0 ? `${accuracy}%` : '\u2014', sub: 'Track record', color: accuracy >= 60 ? COLORS.success : accuracy > 0 ? COLORS.warning : COLORS.textSecondary },
  ];

  return (
    <div className="flex items-center justify-between gap-0.5 overflow-x-auto py-1">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-0.5 flex-1 min-w-0">
          <div
            className="flex flex-col items-center w-full px-2 py-2 rounded-md border bg-card transition-opacity"
            style={{ borderColor: s.color, opacity: s.value === '0' || s.value === '\u2014' ? 0.45 : 1 }}
          >
            <span className="text-[7px] text-muted-foreground font-semibold tracking-widest uppercase">{s.label}</span>
            <span className="text-[15px] font-bold font-mono leading-tight" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[7px] text-muted-foreground leading-tight">{s.sub}</span>
          </div>
          {i < stages.length - 1 && (
            <svg width="14" height="10" viewBox="0 0 14 10" className="flex-shrink-0 opacity-25">
              <line x1="0" y1="5" x2="8" y2="5" stroke={COLORS.textSecondary} strokeWidth="1" strokeDasharray="2 2" />
              <polygon points="8,2 14,5 8,8" fill={COLORS.textSecondary} />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Intelligence Briefing (Narrative Synthesis) ---

function IntelligenceBriefing({ entries, learnings, strategies, interventionStats, patterns, riskEntries }: {
  entries: KnowledgeEntry[];
  learnings: KnowledgeEntry[];
  strategies: KnowledgeEntry[];
  interventionStats: InterventionSummary;
  patterns: KnowledgeEntry[];
  riskEntries: KnowledgeEntry[];
}) {
  const parsedLearnings = useMemo(() => learnings.map(l => ({
    entry: l,
    parsed: parseLearningContent(l.content),
  })), [learnings]);

  // Match learnings to intervention records via tag overlap
  const learningImpact = useMemo(() => parsedLearnings.map(pl => {
    const match = interventionStats.topPatterns.find(tp =>
      pl.entry.tags.includes(tp.tag) || pl.parsed.pattern === tp.tag
    );
    return { ...pl, interventions: match };
  }), [parsedLearnings, interventionStats.topPatterns]);

  // Strategy cross-reference web
  const strategyWeb = useMemo(() => strategies.map(strat => ({
    strategy: strat,
    relLearnings: learnings.filter(l => l.tags.some(t => strat.tags.includes(t))),
    relPatterns: patterns.filter(p => p.tags.some(t => strat.tags.includes(t))),
    relRisks: riskEntries.filter(r => r.tags.some(t => strat.tags.includes(t))),
  })), [strategies, learnings, patterns, riskEntries]);

  // Coverage analysis
  const allCategories = Object.keys(CATEGORY_META);
  const covered = allCategories.filter(c => entries.some(e => e.category === c));
  const gaps = allCategories.filter(c => !entries.some(e => e.category === c));
  const topPattern = interventionStats.topPatterns[0];
  const hasData = entries.length > 0;

  if (!hasData) {
    return (
      <div className="text-[11px] text-muted-foreground opacity-50 text-center py-6">
        Knowledge base is empty. Start by asking the AI to analyze your trading patterns, or add entries to
        the <span className="font-mono text-primary">knowledge/</span> directory.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* -- Behavioral Profile -- */}
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          Behavioral Profile
        </div>
        <div className="text-[12px] text-muted-foreground/80 leading-[1.75]">
          {learnings.length > 0 ? (
            <>
              The behavioral monitoring system has documented{' '}
              <span className="text-primary font-semibold">{learnings.length} pattern{learnings.length !== 1 ? 's' : ''}</span>{' '}
              that the AI actively watches for during live trading sessions.
              {learningImpact.filter(li => li.interventions).length > 0 && (
                <>{' '}Of these, <span className="text-[#B8860B] font-semibold">
                  {learningImpact.filter(li => li.interventions).length}
                </span> have triggered real interventions &mdash; the system identified the pattern in your behavior and acted on it.</>
              )}
              {topPattern && (
                <>{' '}The most frequently triggered pattern is <span className="text-[#B8860B] font-semibold">{topPattern.tag}</span> with{' '}
                {topPattern.count} intervention{topPattern.count !== 1 ? 's' : ''} &mdash;{' '}
                <span className="text-primary">{topPattern.preventedCount} prevented</span>,{' '}
                <span className="text-[#B8860B]">{topPattern.count - topPattern.preventedCount} overridden</span>.</>
              )}
              {interventionStats.accuracy > 0 && (
                <>{' '}Overall intervention accuracy sits at{' '}
                <span className={`font-semibold ${interventionStats.accuracy >= 60 ? 'text-[#2D8547]' : 'text-[#B8860B]'}`}>
                  {interventionStats.accuracy}%
                </span>
                , meaning the AI&apos;s behavioral reads are{' '}
                {interventionStats.accuracy >= 70 ? 'reliably' : interventionStats.accuracy >= 50 ? 'moderately' : 'still learning to be'} correct.</>
              )}
            </>
          ) : (
            <span className="opacity-60">
              No behavioral learnings documented yet. The AI needs trading context to identify patterns.
              Use &ldquo;Generate Learnings&rdquo; from the Dashboard, or ask the AI to analyze your trading history.
            </span>
          )}
        </div>
      </div>

      {/* -- What Your Patterns Mean (Learning Impact) -- */}
      {learningImpact.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
            What Your Patterns Mean
          </div>
          <div className="space-y-2">
            {learningImpact.map(li => (
              <div key={li.entry.id} className="px-3 py-2.5 rounded-lg border border-border/50 bg-muted">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold text-foreground">{li.entry.title}</span>
                  {li.interventions && (
                    <Badge variant="outline" className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/3 text-primary border-primary/20 font-mono font-bold">
                      {li.interventions.count} intervention{li.interventions.count !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                {li.parsed.impact && (
                  <div className="text-[11px] text-muted-foreground/80 leading-relaxed mb-1">
                    <span className="text-destructive font-medium">Impact:</span> {li.parsed.impact}
                  </div>
                )}
                {li.parsed.recommendation && (
                  <div className="text-[11px] text-muted-foreground/80 leading-relaxed">
                    <span className="text-[#2D8547] font-medium">Countermeasure:</span> {li.parsed.recommendation}
                  </div>
                )}
                {li.interventions && (
                  <div className="mt-1.5 pt-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
                    System response: <span className="text-primary font-mono">{li.interventions.preventedCount}</span> prevented,{' '}
                    <span className="text-[#B8860B] font-mono">{li.interventions.count - li.interventions.preventedCount}</span> overridden by user
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -- Strategy Intelligence Web -- */}
      {strategyWeb.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2D8547]" />
            Strategy Intelligence
          </div>
          <div className="text-[12px] text-muted-foreground/80 leading-[1.7] mb-2">
            {strategies.length} documented strateg{strategies.length !== 1 ? 'ies' : 'y'} cross-referenced against{' '}
            {patterns.length} chart pattern{patterns.length !== 1 ? 's' : ''},{' '}
            {learnings.length} behavioral learning{learnings.length !== 1 ? 's' : ''}, and{' '}
            {riskEntries.length} risk framework{riskEntries.length !== 1 ? 's' : ''}.
            {strategyWeb.some(sw => sw.relLearnings.length > 0) && (
              <>{' '}Connections between strategies and behavioral risks surface automatically through shared tags &mdash;
              showing where discipline matters most.</>
            )}
          </div>
          <div className="space-y-2">
            {strategyWeb.map(sw => {
              const hasConn = sw.relLearnings.length > 0 || sw.relPatterns.length > 0 || sw.relRisks.length > 0;
              return (
                <div key={sw.strategy.id} className="px-3 py-2 rounded-lg border border-border/50 bg-muted">
                  <div className="text-[11px] font-semibold text-[#2D8547] mb-1">{sw.strategy.title}</div>
                  {hasConn ? (
                    <div className="space-y-0.5 text-[10px]">
                      {sw.relPatterns.length > 0 && (
                        <div className="text-muted-foreground/80">
                          <span className="text-primary">Validated by:</span>{' '}
                          {sw.relPatterns.map(p => p.title).join(', ')}
                        </div>
                      )}
                      {sw.relLearnings.length > 0 && (
                        <div className="text-muted-foreground/80">
                          <span className="text-[#B8860B]">Watch for:</span>{' '}
                          {sw.relLearnings.map(l => l.title).join(', ')}
                        </div>
                      )}
                      {sw.relRisks.length > 0 && (
                        <div className="text-muted-foreground/80">
                          <span className="text-destructive">Risk controls:</span>{' '}
                          {sw.relRisks.map(r => r.title).join(', ')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground opacity-50">
                      No cross-references yet &mdash; shared tags between this strategy and other entries will surface connections automatically
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -- Knowledge Coverage & Gaps -- */}
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          Knowledge Coverage
        </div>
        <div className="text-[12px] text-muted-foreground/80 leading-[1.7]">
          Covering <span className="text-foreground font-semibold">{covered.length}/{allCategories.length}</span> intelligence categories
          ({covered.map(c => CATEGORY_META[c]?.label ?? c).join(', ')}).
          {gaps.length > 0 ? (
            <>{' '}Missing coverage in{' '}
              {gaps.map((g, i) => (
                <span key={g}>
                  {i > 0 && (i === gaps.length - 1 ? ' and ' : ', ')}
                  <span className="text-destructive font-medium">{CATEGORY_META[g]?.label ?? g}</span>
                </span>
              ))}
              . Documenting observations in these areas strengthens the AI&apos;s contextual awareness and intervention accuracy.
            </>
          ) : (
            <>{' '}All categories covered &mdash; the knowledge base has a well-rounded foundation for intelligent decision support.</>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Intelligence View
// ============================================================================

export default memo(function IntelligenceView() {
  const agentStatuses = useTradingStore(s => s.agentStatuses);
  const signalConsensus = useTradingStore(s => s.signalConsensus);
  const agentEvents = useTradingStore(s => s.agentEvents);
  const setAgentStatuses = useTradingStore(s => s.setAgentStatuses);
  const setSignalConsensus = useTradingStore(s => s.setSignalConsensus);
  const setAgentSignals = useTradingStore(s => s.setAgentSignals);
  const addAgentEvent = useTradingStore(s => s.addAgentEvent);
  const setKnowledgeCount = useTradingStore(s => s.setKnowledgeCount);

  // Local data state
  const [kbData, setKbData] = useState<KBData>({ entries: [], count: 0 });
  const [interventionData, setInterventionData] = useState<InterventionData>({
    logs: [],
    stats: { totalInterventions: 0, totalPrevented: 0, totalOverridden: 0, outcomeTracked: 0, correctInterventions: 0, incorrectInterventions: 0, accuracy: 0, topPatterns: [] },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [kbRes, intRes] = await Promise.all([
        fetch('/api/knowledge'),
        fetch('/api/interventions'),
      ]);
      const [kb, int] = await Promise.all([kbRes.json(), intRes.json()]);
      setKbData(kb);
      setInterventionData(int);
      setKnowledgeCount(kb.count ?? 0);
    } catch (err) {
      console.error('[Intelligence] Data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [setKnowledgeCount]);

  // Seed demo data -- populates knowledge, interventions, and agent state
  const seedDemoData = useCallback(async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.agentData) {
        setAgentStatuses(data.agentData.statuses);
        setSignalConsensus(data.agentData.consensus);
        setAgentSignals(data.agentData.signals);
        for (const evt of data.agentData.events) {
          addAgentEvent(evt);
        }
      }
      // Re-fetch knowledge + interventions to pick up seeded data
      await fetchData();
    } catch (err) {
      console.error('[Intelligence] Seed error:', err);
    } finally {
      setIsSeeding(false);
    }
  }, [fetchData, setAgentStatuses, setSignalConsensus, setAgentSignals, addAgentEvent]);

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Computed data
  const learnings = useMemo(() => kbData.entries.filter(e => e.category === 'learnings'), [kbData.entries]);
  const strategies = useMemo(() => kbData.entries.filter(e => e.category === 'strategies'), [kbData.entries]);
  const chartPatterns = useMemo(() => kbData.entries.filter(e => e.category === 'patterns'), [kbData.entries]);
  const riskEntries = useMemo(() => kbData.entries.filter(e => e.category === 'risk-management'), [kbData.entries]);
  const signalCount = agentEvents.filter(e => e.type === 'agent_signal').length;
  const categoryCount = new Set(kbData.entries.map(e => e.category)).size;

  const toggleExpand = useCallback((id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const stats = interventionData.stats;
  const agentsOnline = agentStatuses.filter(a => a.state === 'running').length;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* --- Row 1: Intelligence Pipeline (KPI strip) --- */}
      <Card className="py-0 gap-0 rounded-xl">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
              Intelligence Pipeline
            </div>
            {agentStatuses.length === 0 && (
              <button
                onClick={seedDemoData}
                disabled={isSeeding}
                className="text-[9px] px-2.5 py-1 rounded-md border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50 font-medium uppercase tracking-wider"
              >
                {isSeeding ? 'Seeding...' : 'Seed Demo Data'}
              </button>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground/80 leading-relaxed mb-2">
            How data flows through the system. Each stage feeds the next &mdash; bright = active, dim = empty.
            Read left to right: market data feeds agents, agents produce signals, signals build knowledge, knowledge generates learnings, learnings trigger interventions.
          </div>
          <KnowledgePipeline
            entryCount={kbData.count}
            agentsOnline={agentsOnline}
            agentTotal={agentStatuses.length}
            signalCount={signalCount}
            learningCount={learnings.length}
            interventionCount={stats.totalInterventions}
            preventedCount={stats.totalPrevented}
            accuracy={stats.accuracy}
          />
        </CardContent>
      </Card>

      {/* --- Row 2: Agent Consensus Radar --- */}
      <Card className="py-0 gap-0 rounded-xl border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <Sun className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="text-[12px] font-bold text-foreground uppercase tracking-wider">
                Agent Consensus Radar
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground">
                {agentsOnline}/{agentStatuses.length} online
              </span>
              {signalConsensus && (
                <Badge
                  variant="outline"
                  className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full ${
                    signalConsensus.consensusSentiment === 'bullish' ? 'text-[#2D8547] border-[#2D8547] bg-[#2D8547]/8' :
                    signalConsensus.consensusSentiment === 'bearish' ? 'text-destructive border-destructive bg-destructive/8' :
                    'text-[#B8860B] border-[#B8860B] bg-[#B8860B]/8'
                  }`}
                >
                  {signalConsensus.consensusSentiment.toUpperCase()} {signalConsensus.consensusConfidence}%
                </Badge>
              )}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground/80 leading-relaxed mb-3">
            Four AI agents independently analyze the market and vote on direction. The center shows their combined consensus &mdash;
            green lines = bullish, red = bearish. Thicker connections = higher confidence.
            Right panel: each agent&apos;s latest signal and activity feed. When all four align, conviction is highest.
          </div>
          <AgentConstellation agents={agentStatuses} consensus={signalConsensus} events={agentEvents} />
        </CardContent>
      </Card>

      {/* --- Row 3: Learnings Ledger + Intervention Track Record --- */}
      <div className="grid grid-cols-2 gap-3">
        {/* Learnings Ledger */}
        <Card className="py-0 gap-0 rounded-xl">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Behavioral Learnings Ledger
              </span>
              <span className="text-[9px] text-muted-foreground">{learnings.length} entries</span>
            </div>
            <div className="text-[10px] text-muted-foreground/80 leading-relaxed mb-2">
              Your trading habits documented by the AI. Each card is a pattern it watches for during live trading &mdash;
              click to expand and see evidence, impact, and the recommended countermeasure.
            </div>
            <div className="max-h-[280px] overflow-y-auto space-y-1.5">
              {learnings.length > 0 ? (
                learnings.map(entry => (
                  <KnowledgeCard
                    key={entry.id}
                    entry={entry}
                    expanded={expandedEntries.has(entry.id)}
                    onToggle={() => toggleExpand(entry.id)}
                  />
                ))
              ) : (
                <div className="text-[10px] text-muted-foreground opacity-40 text-center py-8">
                  {isLoading ? 'Loading...' : 'No behavioral learnings yet. Ask the AI to "Generate Learnings" from the Dashboard view.'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Intervention Track Record */}
        <Card className="py-0 gap-0 rounded-xl">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                Intervention Track Record
              </span>
              <span className="text-[9px] text-muted-foreground">{stats.totalInterventions} total</span>
            </div>
            <div className="text-[10px] text-muted-foreground/80 leading-relaxed mb-2">
              Every time the AI caught a behavioral pattern and acted. &ldquo;Prevented&rdquo; = blocked or modified a trade.
              &ldquo;Overridden&rdquo; = you traded anyway. The gauge shows how often the AI&apos;s call was right. Bars show which patterns trigger most.
            </div>

            {stats.totalInterventions > 0 ? (
              <div className="space-y-3">
                {/* Stats row */}
                <div className="flex items-center gap-4">
                  <AccuracyGauge accuracy={stats.accuracy} total={stats.outcomeTracked} />
                  <div className="flex-1 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prevented</span>
                      <span className="font-mono text-primary">{stats.totalPrevented}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Overridden</span>
                      <span className="font-mono text-[#B8860B]">{stats.totalOverridden}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Correct</span>
                      <span className="font-mono text-[#2D8547]">{stats.correctInterventions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Incorrect</span>
                      <span className="font-mono text-destructive">{stats.incorrectInterventions}</span>
                    </div>
                  </div>
                </div>

                {/* Pattern Distribution */}
                {stats.topPatterns.length > 0 && (
                  <div>
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">Pattern Distribution</div>
                    <PatternDistribution patterns={stats.topPatterns} />
                  </div>
                )}

                {/* Recent Interventions */}
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">Recent Interventions</div>
                  <div className="max-h-[120px] overflow-y-auto space-y-0.5">
                    {interventionData.logs.slice(0, 10).map(log => (
                      <InterventionItem key={log.id} log={log} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground opacity-40 text-center py-8">
                {isLoading ? 'Loading...' : 'No behavioral interventions recorded this session. Interventions occur when autopilot detects a pattern match.'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Row 4: Intelligence Synthesis --- */}
      <Card className="py-0 gap-0 rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              Intelligence Synthesis
            </span>
            <span className="text-[9px] text-muted-foreground">
              {kbData.count} entries &middot; {categoryCount} categories
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground/80 leading-relaxed mb-3">
            The big picture &mdash; how everything connects. Strategies cross-referenced against behavioral risks, chart patterns
            validated by agent signals, risk frameworks linked to real intervention outcomes. This is the AI&apos;s narrative understanding
            of your complete trading profile, not just isolated data points.
          </div>

          {/* Narrative Briefing -- the story, not the database */}
          <IntelligenceBriefing
            entries={kbData.entries}
            learnings={learnings}
            strategies={strategies}
            interventionStats={stats}
            patterns={chartPatterns}
            riskEntries={riskEntries}
          />
        </CardContent>
      </Card>
    </div>
  );
});
