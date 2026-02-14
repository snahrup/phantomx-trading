'use client';

import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTradingStore } from '@/store/trading-store';
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

// --- Category metadata ---

const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
  learnings:          { label: 'Learnings',       color: 'var(--cl-accent)',   icon: '\uD83E\uDDE0' }, // 🧠
  strategies:         { label: 'Strategies',      color: 'var(--cl-success)',  icon: '\uD83C\uDFAF' }, // 🎯
  patterns:           { label: 'Patterns',        color: 'var(--cl-warning)',  icon: '\uD83D\uDD0D' }, // 🔍
  'market-analysis':  { label: 'Market Analysis', color: 'var(--cl-info, var(--cl-accent))', icon: '\uD83D\uDCC8' }, // 📈
  'risk-management':  { label: 'Risk Mgmt',       color: 'var(--cl-error)',    icon: '\uD83D\uDEE1' }, // 🛡
  custom:             { label: 'Custom',           color: 'var(--cl-text-secondary)', icon: '\uD83D\uDCCC' }, // 📌
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
        strong: ({ children }) => <strong className="text-[var(--cl-text-primary)]" style={{ fontWeight: 600 }}>{children}</strong>,
        em: ({ children }) => <em className="text-[var(--cl-text-secondary)] italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-[var(--cl-text-faint)]">{children}</li>,
        code: ({ children }) => <code className="px-1 py-0.5 rounded bg-[var(--cl-fill-hover)] text-[var(--cl-accent)] font-mono text-[10px]">{children}</code>,
        h1: ({ children }) => <div className="text-[12px] font-bold text-[var(--cl-text-primary)] mb-1">{children}</div>,
        h2: ({ children }) => <div className="text-[11px] font-bold text-[var(--cl-text-primary)] mb-1">{children}</div>,
        h3: ({ children }) => <div className="text-[11px] font-semibold text-[var(--cl-text-primary)] mb-1">{children}</div>,
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

// --- Metric Card (same pattern as DashboardAnalytics) ---

function MetricCard({ label, value, subtext, color }: { label: string; value: string; subtext?: string; color?: string }) {
  return (
    <div className="glass-card p-4 flex flex-col gap-1">
      <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-xl font-bold font-mono ${color || 'text-[var(--cl-text-primary)]'}`}>{value}</div>
      {subtext && <div className="text-[10px] text-[var(--cl-text-secondary)]">{subtext}</div>}
    </div>
  );
}

// --- Category Pill ---

function CategoryPill({ category }: { category: string }) {
  const meta = CATEGORY_META[category] ?? { label: category, color: 'var(--cl-text-secondary)', icon: '\u25CF' };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border"
      style={{ borderColor: meta.color, color: meta.color, backgroundColor: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}
    >
      <span className="text-[10px]">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

// --- Source Badge ---

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    ai: 'text-[var(--cl-accent)]',
    user: 'text-[var(--cl-success)]',
    system: 'text-[var(--cl-warning)]',
  };
  return (
    <span className={`text-[8px] uppercase tracking-wider font-bold ${colors[source] ?? 'text-[var(--cl-text-secondary)]'}`}>
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
  const startAngle = Math.PI;
  const endAngle = 0;
  const sweepAngle = startAngle - (accuracy / 100) * Math.PI;

  const bgArc = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`;
  const fillEndX = cx + r * Math.cos(sweepAngle);
  const fillEndY = cy - r * Math.sin(sweepAngle);
  const largeArc = accuracy > 50 ? 1 : 0;
  const fillArc = `M${cx - r},${cy} A${r},${r} 0 ${largeArc} 1 ${fillEndX},${fillEndY}`;

  const gaugeColor = accuracy >= 70 ? 'var(--cl-success)' : accuracy >= 40 ? 'var(--cl-warning)' : 'var(--cl-error)';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <path d={bgArc} fill="none" stroke="var(--cl-border)" strokeWidth="8" strokeLinecap="round" />
        {total > 0 && <path d={fillArc} fill="none" stroke={gaugeColor} strokeWidth="8" strokeLinecap="round" />}
        <text x={cx} y={cy - 14} textAnchor="middle" className="text-xl font-bold fill-[var(--cl-text-primary)]" fontFamily="monospace">
          {total > 0 ? `${accuracy}%` : '—'}
        </text>
        <text x={cx} y={cy - 2} textAnchor="middle" className="text-[8px] fill-[var(--cl-text-secondary)]">
          accuracy
        </text>
      </svg>
    </div>
  );
}

// --- Pattern Distribution Bar Chart (SVG) ---

function PatternDistribution({ patterns }: { patterns: InterventionSummary['topPatterns'] }) {
  if (patterns.length === 0) {
    return <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40 text-center py-4">No pattern data yet</div>;
  }

  const maxCount = Math.max(...patterns.map(p => p.count), 1);

  return (
    <div className="space-y-1.5">
      {patterns.map(p => (
        <div key={p.tag} className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--cl-text-faint)] w-28 truncate font-mono">{p.tag}</span>
          <div className="flex-1 h-3 bg-[var(--cl-fill-hover)] rounded-full overflow-hidden flex">
            <div
              className="h-full rounded-full bg-[var(--cl-accent)]"
              style={{ width: `${(p.preventedCount / maxCount) * 100}%`, opacity: 0.9 }}
              title={`${p.preventedCount} prevented`}
            />
            <div
              className="h-full bg-[var(--cl-warning)]"
              style={{ width: `${((p.count - p.preventedCount) / maxCount) * 100}%`, opacity: 0.7 }}
              title={`${p.count - p.preventedCount} overridden`}
            />
          </div>
          <span className="text-[9px] font-mono text-[var(--cl-text-secondary)] w-8 text-right">{p.count}x</span>
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
      className="px-3 py-2.5 rounded-lg border border-[var(--cl-border-subtle)] bg-[var(--cl-fill-control)] hover:bg-[var(--cl-fill-hover)] transition-colors cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CategoryPill category={entry.category} />
            <SourceBadge source={entry.source} />
            <span className="text-[8px] text-[var(--cl-text-secondary)]">{timeAgo(entry.updated)}</span>
          </div>
          <div className="text-[12px] font-semibold text-[var(--cl-text-primary)] truncate">{entry.title}</div>
        </div>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cl-text-secondary)" strokeWidth="2"
          className={`flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded ? (
        <div className="mt-2 text-[11px] text-[var(--cl-text-faint)] leading-relaxed border-t border-[var(--cl-border-subtle)] pt-2">
          <KBMarkdown content={entry.content} />
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-[var(--cl-text-secondary)] line-clamp-2">
          {preview}{hasMore ? '...' : ''}
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {entry.tags.map(tag => (
            <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--cl-fill-hover)] text-[var(--cl-text-secondary)] font-mono">
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
    <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--cl-fill-hover)] transition-colors">
      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${log.wasOverridden ? 'bg-[var(--cl-warning)]' : 'bg-[var(--cl-accent)]'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-semibold text-[var(--cl-text-primary)]">
            {log.symbol?.replace('/USDT:USDT', '') || '—'}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--cl-fill-control)] text-[var(--cl-accent)] font-mono">
            {log.patternTag}
          </span>
          {log.wasOverridden && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--cl-fill-warning)] text-[var(--cl-warning)] font-bold uppercase">
              overridden
            </span>
          )}
        </div>
        <div className="text-[10px] text-[var(--cl-text-secondary)] mt-0.5">
          {log.originalAction} → {log.finalAction}
          <span className="ml-2 text-[var(--cl-text-secondary)]">{log.confidence}% confidence</span>
        </div>
        {log.outcome && (
          <div className="text-[9px] mt-0.5">
            <span className={log.outcome.wasCorrect ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
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
      <span className="text-[8px] text-[var(--cl-text-secondary)] flex-shrink-0">{timestampAgo(log.timestamp)}</span>
    </div>
  );
}

// --- Agent Constellation (Radar-style SVG) ---

const AGENT_POSITIONS: Record<string, { angle: number; label: string; icon: string }> = {
  sentinel:  { angle: -90,  label: 'Sentinel',  icon: '\uD83D\uDEE1' },  // top — 🛡
  technical: { angle: 0,    label: 'Technical',  icon: '\uD83D\uDCC8' },  // right — 📈
  news:      { angle: 90,   label: 'News',       icon: '\uD83D\uDCF0' },  // bottom — 📰
  macro:     { angle: 180,  label: 'Macro',      icon: '\uD83C\uDF0D' },  // left — 🌍
};

function sentimentToColor(s: string): string {
  return s === 'bullish' ? 'var(--cl-success)' : s === 'bearish' ? 'var(--cl-error)' : 'var(--cl-warning)';
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
  const consColor = consensus ? sentimentToColor(consensus.consensusSentiment) : 'var(--cl-text-secondary)';
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
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke="var(--cl-border-subtle)" strokeWidth="0.5" strokeDasharray={i > 0 ? '4 4' : 'none'} opacity={0.5} />
          ))}

          {/* Cross-hairs */}
          <line x1={cx - outerR - 10} y1={cy} x2={cx + outerR + 10} y2={cy} stroke="var(--cl-border-subtle)" strokeWidth="0.5" opacity={0.3} />
          <line x1={cx} y1={cy - outerR - 10} x2={cx} y2={cy + outerR + 10} stroke="var(--cl-border-subtle)" strokeWidth="0.5" opacity={0.3} />

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
          <circle cx={cx} cy={cy} r={innerR} fill="var(--cl-bg-surface)" stroke={consColor} strokeWidth="2" />
          {consensus && (
            <>
              <text x={cx} y={cy - 6} textAnchor="middle" className="text-[14px] font-bold fill-[var(--cl-text-primary)]" fontFamily="monospace">
                {consConf}%
              </text>
              <text x={cx} y={cy + 8} textAnchor="middle" className="text-[8px] fill-[var(--cl-text-secondary)]" fontFamily="monospace">
                {consensus.consensusSentiment.toUpperCase()}
              </text>
            </>
          )}
          {!consensus && (
            <text x={cx} y={cy + 3} textAnchor="middle" className="text-[9px] fill-[var(--cl-text-secondary)]">
              IDLE
            </text>
          )}

          {/* Agent nodes */}
          {agentNodes.map(node => {
            const stateRing = node.isRunning ? node.color : 'var(--cl-text-secondary)';
            return (
              <g key={node.agent.id}>
                {/* Glow for running agents */}
                {node.isRunning && node.confidence > 0 && (
                  <circle cx={node.x} cy={node.y} r={nodeR + 6} fill={node.color} opacity={0.08} />
                )}
                {/* Node circle */}
                <circle cx={node.x} cy={node.y} r={nodeR} fill="var(--cl-bg-surface)" stroke={stateRing} strokeWidth="2" />
                {/* Agent icon */}
                <text x={node.x} y={node.y - 2} textAnchor="middle" className="text-[14px]" dominantBaseline="middle">
                  {node.icon}
                </text>
                {/* Label below */}
                <text x={node.x} y={node.y + nodeR + 12} textAnchor="middle" className="text-[9px] fill-[var(--cl-text-secondary)] font-semibold" fontFamily="monospace">
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
                <circle cx={node.x - nodeR + 4} cy={node.y - nodeR + 4} r={3} fill={stateRing} stroke="var(--cl-bg-surface)" strokeWidth="1" />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Activity Feed + Agent Details */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {/* Agent detail cards */}
        {agentNodes.map(node => (
          <div key={node.agent.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-[var(--cl-border-subtle)] bg-[var(--cl-fill-control)]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: node.isRunning ? node.color : 'var(--cl-text-secondary)' }} />
            <span className="text-[10px] font-semibold text-[var(--cl-text-primary)] w-16">{node.label}</span>
            {node.agent.latestSignal ? (
              <>
                <span className="text-[9px] font-mono w-8 text-center" style={{ color: node.color }}>
                  {node.sentiment === 'bullish' ? '\u25B2' : node.sentiment === 'bearish' ? '\u25BC' : '\u25CF'} {node.confidence}%
                </span>
                <span className="text-[9px] text-[var(--cl-text-secondary)] flex-1 truncate">{node.agent.latestSignal.summary}</span>
              </>
            ) : (
              <span className="text-[9px] text-[var(--cl-text-secondary)] opacity-40 flex-1">
                {node.isRunning ? `Tick ${node.agent.tickCount} — awaiting signal` : 'Offline'}
              </span>
            )}
            <span className="text-[8px] text-[var(--cl-text-secondary)] font-mono flex-shrink-0">{node.agent.tickCount}t</span>
          </div>
        ))}

        {/* Recent events feed */}
        {events.length > 0 && (
          <div className="mt-1">
            <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-1">Recent Activity</div>
            <div className="max-h-[100px] overflow-y-auto space-y-0.5">
              {events.slice(0, 12).map((evt, i) => {
                const evtColor = evt.type === 'agent_signal' ? 'text-[var(--cl-accent)]'
                  : evt.type === 'agent_error' ? 'text-[var(--cl-error)]'
                  : 'text-[var(--cl-text-secondary)]';
                const agentLabel = AGENT_POSITIONS[evt.agentId as string]?.label ?? evt.agentId;
                return (
                  <div key={`${evt.timestamp}-${i}`} className="flex items-center gap-1.5 text-[9px]">
                    <span className="text-[var(--cl-text-secondary)] font-mono w-12 flex-shrink-0">
                      {new Date(evt.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`font-medium ${evtColor}`}>{agentLabel}</span>
                    <span className="text-[var(--cl-text-secondary)]">
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
            <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40 text-center">
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
    { label: 'Market Data', value: 'Live', sub: 'Price feeds', color: 'var(--cl-text-secondary)' },
    { label: 'Agents', value: `${agentsOnline}/${agentTotal}`, sub: 'Online', color: agentsOnline > 0 ? 'var(--cl-accent)' : 'var(--cl-text-secondary)' },
    { label: 'Signals', value: String(signalCount), sub: 'This session', color: signalCount > 0 ? 'var(--cl-success)' : 'var(--cl-text-secondary)' },
    { label: 'Knowledge', value: String(entryCount), sub: 'Entries', color: entryCount > 0 ? 'var(--cl-accent)' : 'var(--cl-text-secondary)' },
    { label: 'Learnings', value: String(learningCount), sub: 'Behavioral', color: learningCount > 0 ? 'var(--cl-warning)' : 'var(--cl-text-secondary)' },
    { label: 'Interventions', value: String(interventionCount), sub: `${preventedCount} saved`, color: interventionCount > 0 ? 'var(--cl-accent)' : 'var(--cl-text-secondary)' },
    { label: 'Accuracy', value: accuracy > 0 ? `${accuracy}%` : '\u2014', sub: 'Track record', color: accuracy >= 60 ? 'var(--cl-success)' : accuracy > 0 ? 'var(--cl-warning)' : 'var(--cl-text-secondary)' },
  ];

  return (
    <div className="flex items-center justify-between gap-0.5 overflow-x-auto py-1">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-0.5 flex-1 min-w-0">
          <div
            className="flex flex-col items-center w-full px-2 py-2 rounded-md border bg-[var(--cl-bg-surface)] transition-opacity"
            style={{ borderColor: s.color, opacity: s.value === '0' || s.value === '\u2014' ? 0.45 : 1 }}
          >
            <span className="text-[7px] text-[var(--cl-text-secondary)] font-semibold tracking-widest uppercase">{s.label}</span>
            <span className="text-[15px] font-bold font-mono leading-tight" style={{ color: s.color }}>{s.value}</span>
            <span className="text-[7px] text-[var(--cl-text-secondary)] leading-tight">{s.sub}</span>
          </div>
          {i < stages.length - 1 && (
            <svg width="14" height="10" viewBox="0 0 14 10" className="flex-shrink-0 opacity-25">
              <line x1="0" y1="5" x2="8" y2="5" stroke="var(--cl-text-secondary)" strokeWidth="1" strokeDasharray="2 2" />
              <polygon points="8,2 14,5 8,8" fill="var(--cl-text-secondary)" />
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
      <div className="text-[11px] text-[var(--cl-text-secondary)] opacity-50 text-center py-6">
        Knowledge base is empty. Start by asking the AI to analyze your trading patterns, or add entries to
        the <span className="font-mono text-[var(--cl-accent)]">knowledge/</span> directory.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Behavioral Profile ── */}
      <div>
        <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-accent)]" />
          Behavioral Profile
        </div>
        <div className="text-[12px] text-[var(--cl-text-faint)] leading-[1.75]">
          {learnings.length > 0 ? (
            <>
              The behavioral monitoring system has documented{' '}
              <span className="text-[var(--cl-accent)] font-semibold">{learnings.length} pattern{learnings.length !== 1 ? 's' : ''}</span>{' '}
              that the AI actively watches for during live trading sessions.
              {learningImpact.filter(li => li.interventions).length > 0 && (
                <>{' '}Of these, <span className="text-[var(--cl-warning)] font-semibold">
                  {learningImpact.filter(li => li.interventions).length}
                </span> have triggered real interventions &mdash; the system identified the pattern in your behavior and acted on it.</>
              )}
              {topPattern && (
                <>{' '}The most frequently triggered pattern is <span className="text-[var(--cl-warning)] font-semibold">{topPattern.tag}</span> with{' '}
                {topPattern.count} intervention{topPattern.count !== 1 ? 's' : ''} &mdash;{' '}
                <span className="text-[var(--cl-accent)]">{topPattern.preventedCount} prevented</span>,{' '}
                <span className="text-[var(--cl-warning)]">{topPattern.count - topPattern.preventedCount} overridden</span>.</>
              )}
              {interventionStats.accuracy > 0 && (
                <>{' '}Overall intervention accuracy sits at{' '}
                <span className={`font-semibold ${interventionStats.accuracy >= 60 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-warning)]'}`}>
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

      {/* ── What Your Patterns Mean (Learning Impact) ── */}
      {learningImpact.length > 0 && (
        <div>
          <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-warning)]" />
            What Your Patterns Mean
          </div>
          <div className="space-y-2">
            {learningImpact.map(li => (
              <div key={li.entry.id} className="px-3 py-2.5 rounded-lg border border-[var(--cl-border-subtle)] bg-[var(--cl-fill-control)]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold text-[var(--cl-text-primary)]">{li.entry.title}</span>
                  {li.interventions && (
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-[var(--cl-fill-accent-subtle)] text-[var(--cl-accent)] font-mono font-bold">
                      {li.interventions.count} intervention{li.interventions.count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {li.parsed.impact && (
                  <div className="text-[11px] text-[var(--cl-text-faint)] leading-relaxed mb-1">
                    <span className="text-[var(--cl-error)] font-medium">Impact:</span> {li.parsed.impact}
                  </div>
                )}
                {li.parsed.recommendation && (
                  <div className="text-[11px] text-[var(--cl-text-faint)] leading-relaxed">
                    <span className="text-[var(--cl-success)] font-medium">Countermeasure:</span> {li.parsed.recommendation}
                  </div>
                )}
                {li.interventions && (
                  <div className="mt-1.5 pt-1.5 border-t border-[var(--cl-border-subtle)] text-[10px] text-[var(--cl-text-secondary)]">
                    System response: <span className="text-[var(--cl-accent)] font-mono">{li.interventions.preventedCount}</span> prevented,{' '}
                    <span className="text-[var(--cl-warning)] font-mono">{li.interventions.count - li.interventions.preventedCount}</span> overridden by user
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Strategy Intelligence Web ── */}
      {strategyWeb.length > 0 && (
        <div>
          <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-success)]" />
            Strategy Intelligence
          </div>
          <div className="text-[12px] text-[var(--cl-text-faint)] leading-[1.7] mb-2">
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
                <div key={sw.strategy.id} className="px-3 py-2 rounded-lg border border-[var(--cl-border-subtle)] bg-[var(--cl-fill-control)]">
                  <div className="text-[11px] font-semibold text-[var(--cl-success)] mb-1">{sw.strategy.title}</div>
                  {hasConn ? (
                    <div className="space-y-0.5 text-[10px]">
                      {sw.relPatterns.length > 0 && (
                        <div className="text-[var(--cl-text-faint)]">
                          <span className="text-[var(--cl-accent)]">Validated by:</span>{' '}
                          {sw.relPatterns.map(p => p.title).join(', ')}
                        </div>
                      )}
                      {sw.relLearnings.length > 0 && (
                        <div className="text-[var(--cl-text-faint)]">
                          <span className="text-[var(--cl-warning)]">Watch for:</span>{' '}
                          {sw.relLearnings.map(l => l.title).join(', ')}
                        </div>
                      )}
                      {sw.relRisks.length > 0 && (
                        <div className="text-[var(--cl-text-faint)]">
                          <span className="text-[var(--cl-error)]">Risk controls:</span>{' '}
                          {sw.relRisks.map(r => r.title).join(', ')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-50">
                      No cross-references yet &mdash; shared tags between this strategy and other entries will surface connections automatically
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Knowledge Coverage & Gaps ── */}
      <div>
        <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2 font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-text-secondary)]" />
          Knowledge Coverage
        </div>
        <div className="text-[12px] text-[var(--cl-text-faint)] leading-[1.7]">
          Covering <span className="text-[var(--cl-text-primary)] font-semibold">{covered.length}/{allCategories.length}</span> intelligence categories
          ({covered.map(c => CATEGORY_META[c]?.label ?? c).join(', ')}).
          {gaps.length > 0 ? (
            <>{' '}Missing coverage in{' '}
              {gaps.map((g, i) => (
                <span key={g}>
                  {i > 0 && (i === gaps.length - 1 ? ' and ' : ', ')}
                  <span className="text-[var(--cl-error)] font-medium">{CATEGORY_META[g]?.label ?? g}</span>
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
  const viewMode = useTradingStore(s => s.viewMode);
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

  // Seed demo data — populates knowledge, interventions, and agent state
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

  // Fetch on mount and when switching to this view
  useEffect(() => {
    if (viewMode === 'intelligence') {
      fetchData();
    }
  }, [viewMode, fetchData]);

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
      <div className="glass-card p-3">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">
            Intelligence Pipeline
          </div>
          {agentStatuses.length === 0 && (
            <button
              onClick={seedDemoData}
              disabled={isSeeding}
              className="text-[9px] px-2.5 py-1 rounded-md border border-[var(--cl-accent)] text-[var(--cl-accent)] hover:bg-[var(--cl-accent)] hover:text-white transition-colors disabled:opacity-50 font-medium uppercase tracking-wider"
            >
              {isSeeding ? 'Seeding...' : 'Seed Demo Data'}
            </button>
          )}
        </div>
        <div className="text-[10px] text-[var(--cl-text-faint)] leading-relaxed mb-2">
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
      </div>

      {/* --- Row 2: Agent Consensus Radar --- */}
      <div className="glass-card p-4 border-[var(--cl-accent-border)] border">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[var(--cl-accent)] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </div>
            <span className="text-[12px] font-bold text-[var(--cl-text-primary)] uppercase tracking-wider">
              Agent Consensus Radar
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--cl-text-secondary)]">
              {agentsOnline}/{agentStatuses.length} online
            </span>
            {signalConsensus && (
              <span className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                signalConsensus.consensusSentiment === 'bullish' ? 'text-[var(--cl-success)] border-[var(--cl-success)] bg-[rgba(0,210,106,0.08)]' :
                signalConsensus.consensusSentiment === 'bearish' ? 'text-[var(--cl-error)] border-[var(--cl-error)] bg-[rgba(224,85,85,0.08)]' :
                'text-[var(--cl-warning)] border-[var(--cl-warning)] bg-[rgba(255,193,7,0.08)]'
              }`}>
                {signalConsensus.consensusSentiment.toUpperCase()} {signalConsensus.consensusConfidence}%
              </span>
            )}
          </div>
        </div>
        <div className="text-[10px] text-[var(--cl-text-faint)] leading-relaxed mb-3">
          Four AI agents independently analyze the market and vote on direction. The center shows their combined consensus &mdash;
          green lines = bullish, red = bearish. Thicker connections = higher confidence.
          Right panel: each agent&apos;s latest signal and activity feed. When all four align, conviction is highest.
        </div>
        <AgentConstellation agents={agentStatuses} consensus={signalConsensus} events={agentEvents} />
      </div>

      {/* --- Row 3: Learnings Ledger + Intervention Track Record --- */}
      <div className="grid grid-cols-2 gap-3">
        {/* Learnings Ledger */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">
              Behavioral Learnings Ledger
            </span>
            <span className="text-[9px] text-[var(--cl-text-secondary)]">{learnings.length} entries</span>
          </div>
          <div className="text-[10px] text-[var(--cl-text-faint)] leading-relaxed mb-2">
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
              <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40 text-center py-8">
                {isLoading ? 'Loading...' : 'No behavioral learnings yet. Ask the AI to "Generate Learnings" from the Dashboard view.'}
              </div>
            )}
          </div>
        </div>

        {/* Intervention Track Record */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">
              Intervention Track Record
            </span>
            <span className="text-[9px] text-[var(--cl-text-secondary)]">{stats.totalInterventions} total</span>
          </div>
          <div className="text-[10px] text-[var(--cl-text-faint)] leading-relaxed mb-2">
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
                    <span className="text-[var(--cl-text-secondary)]">Prevented</span>
                    <span className="font-mono text-[var(--cl-accent)]">{stats.totalPrevented}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--cl-text-secondary)]">Overridden</span>
                    <span className="font-mono text-[var(--cl-warning)]">{stats.totalOverridden}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--cl-text-secondary)]">Correct</span>
                    <span className="font-mono text-[var(--cl-success)]">{stats.correctInterventions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--cl-text-secondary)]">Incorrect</span>
                    <span className="font-mono text-[var(--cl-error)]">{stats.incorrectInterventions}</span>
                  </div>
                </div>
              </div>

              {/* Pattern Distribution */}
              {stats.topPatterns.length > 0 && (
                <div>
                  <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-1.5">Pattern Distribution</div>
                  <PatternDistribution patterns={stats.topPatterns} />
                </div>
              )}

              {/* Recent Interventions */}
              <div>
                <div className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-1.5">Recent Interventions</div>
                <div className="max-h-[120px] overflow-y-auto space-y-0.5">
                  {interventionData.logs.slice(0, 10).map(log => (
                    <InterventionItem key={log.id} log={log} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-[var(--cl-text-secondary)] opacity-40 text-center py-8">
              {isLoading ? 'Loading...' : 'No behavioral interventions recorded this session. Interventions occur when autopilot detects a pattern match.'}
            </div>
          )}
        </div>
      </div>

      {/* --- Row 4: Intelligence Synthesis --- */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-medium">
            Intelligence Synthesis
          </span>
          <span className="text-[9px] text-[var(--cl-text-secondary)]">
            {kbData.count} entries &middot; {categoryCount} categories
          </span>
        </div>
        <div className="text-[10px] text-[var(--cl-text-faint)] leading-relaxed mb-3">
          The big picture &mdash; how everything connects. Strategies cross-referenced against behavioral risks, chart patterns
          validated by agent signals, risk frameworks linked to real intervention outcomes. This is the AI&apos;s narrative understanding
          of your complete trading profile, not just isolated data points.
        </div>

        {/* Narrative Briefing — the story, not the database */}
        <IntelligenceBriefing
          entries={kbData.entries}
          learnings={learnings}
          strategies={strategies}
          interventionStats={stats}
          patterns={chartPatterns}
          riskEntries={riskEntries}
        />
      </div>
    </div>
  );
});
