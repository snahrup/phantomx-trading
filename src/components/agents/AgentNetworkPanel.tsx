'use client';

import { useEffect, useCallback } from 'react';
import { useTradingStore } from '@/store/trading-store';
import type { AgentStatus, AgentSentiment } from '@/types/trading';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FadeIn, ConfidenceBar } from '@/components/motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers — return Tailwind class names (NOT CSS variable strings)
// ---------------------------------------------------------------------------

/** Returns a Tailwind text-color class for the given sentiment. */
function sentimentTextClass(sentiment: AgentSentiment | undefined): string {
  if (!sentiment) return 'text-muted-foreground';
  switch (sentiment) {
    case 'bullish': return 'text-claude-green';
    case 'bearish': return 'text-destructive';
    default: return 'text-muted-foreground';
  }
}

/**
 * For SVG inline fill/stroke that cannot use className, resolve to an
 * `hsl(var(--...))` / oklch reference so the value is theme-aware.
 */
function sentimentSvgColor(sentiment: AgentSentiment | undefined): string {
  if (!sentiment) return 'oklch(var(--muted-foreground))';
  switch (sentiment) {
    case 'bullish': return 'oklch(0.58 0.1 145)'; // --claude-green
    case 'bearish': return 'oklch(var(--destructive))';
    default: return 'oklch(var(--muted-foreground))';
  }
}

interface StateIndicator {
  /** SVG-safe color string */
  svgColor: string;
  /** Tailwind className for non-SVG contexts */
  className: string;
  label: string;
}

function stateIndicator(state: string): StateIndicator {
  switch (state) {
    case 'running':
      return { svgColor: 'oklch(0.58 0.1 145)', className: 'bg-claude-green', label: 'Running' };
    case 'error':
      return { svgColor: 'oklch(var(--destructive))', className: 'bg-destructive', label: 'Error' };
    case 'idle':
      return { svgColor: 'oklch(0.72 0.12 80)', className: 'bg-yellow-500', label: 'Idle' };
    default:
      return { svgColor: 'oklch(var(--muted-foreground))', className: 'bg-muted-foreground', label: 'Stopped' };
  }
}

// Network graph layout — hub-spoke around Commander center
const AGENTS = [
  { id: 'sentinel', name: 'Sentinel', desc: 'Fear & Greed, Trending', gx: 180, gy: 35 },
  { id: 'macro',    name: 'Macro',    desc: 'Global Market, BTC Dom', gx: 320, gy: 120 },
  { id: 'technical',name: 'Technical',desc: 'SMA, RSI, MACD, BB',     gx: 180, gy: 205 },
  { id: 'news',     name: 'News',     desc: 'CryptoPanic Headlines',  gx: 40,  gy: 120 },
] as const;

const CMD = { x: 180, y: 120 };

// ---------------------------------------------------------------------------
// Network Graph (SVG)
// ---------------------------------------------------------------------------

function NetworkGraph({ agents, isExecuting }: { agents: Map<string, AgentStatus>; isExecuting: boolean }) {
  return (
    <svg viewBox="0 0 360 240" className="w-full" style={{ minHeight: '180px' }}>
      <defs>
        <filter id="agent-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Connection lines from each agent to Commander */}
      {AGENTS.map(agent => {
        const status = agents.get(agent.id);
        const isActive = status?.state === 'running';
        return (
          <g key={`conn-${agent.id}`}>
            <line
              x1={agent.gx} y1={agent.gy} x2={CMD.x} y2={CMD.y}
              className={isActive ? 'stroke-primary' : 'stroke-border'}
              strokeWidth={isActive ? 1.5 : 0.5}
              strokeDasharray={isActive ? 'none' : '4 4'}
              opacity={isActive ? 0.5 : 0.15}
            />
            {/* Animated signal dot flowing to Commander */}
            {isActive && status?.latestSignal && (
              <circle r="3" fill={sentimentSvgColor(status.latestSignal.sentiment)}
                filter="url(#agent-glow)" opacity="0.9">
                <animateMotion dur="2.5s" repeatCount="indefinite"
                  path={`M ${agent.gx} ${agent.gy} L ${CMD.x} ${CMD.y}`} />
              </circle>
            )}
          </g>
        );
      })}

      {/* Commander node — center hub */}
      <g>
        <circle cx={CMD.x} cy={CMD.y} r="30"
          className={cn(
            'fill-card',
            isExecuting ? 'stroke-primary' : 'stroke-border',
          )}
          strokeWidth={isExecuting ? 2 : 1} />
        {isExecuting && (
          <circle cx={CMD.x} cy={CMD.y} r="30"
            className="fill-none stroke-primary" strokeWidth="1" opacity="0.5">
            <animate attributeName="r" values="30;38;30" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
          </circle>
        )}
        <text x={CMD.x} y={CMD.y - 5} textAnchor="middle"
          className="fill-primary" fontSize="10" fontWeight="600">Commander</text>
        <text x={CMD.x} y={CMD.y + 8} textAnchor="middle"
          className="fill-muted-foreground" fontSize="8">
          {isExecuting ? 'Active' : 'Standby'}
        </text>
      </g>

      {/* Agent nodes */}
      {AGENTS.map(agent => {
        const status = agents.get(agent.id);
        const isActive = status?.state === 'running';
        const sentiment = status?.latestSignal?.sentiment;
        const confidence = status?.latestSignal?.confidence;
        const si = stateIndicator(status?.state ?? 'stopped');

        return (
          <g key={agent.id}>
            {/* Outer sentiment ring */}
            <circle cx={agent.gx} cy={agent.gy} r="22"
              fill="none"
              stroke={isActive && sentiment ? sentimentSvgColor(sentiment) : undefined}
              className={!(isActive && sentiment) ? 'stroke-border' : undefined}
              strokeWidth={isActive ? 2 : 0.5}
              opacity={isActive ? 0.8 : 0.2} />
            {/* Inner circle */}
            <circle cx={agent.gx} cy={agent.gy} r="18"
              className="fill-card stroke-border" strokeWidth="1" />
            {/* Name */}
            <text x={agent.gx} y={agent.gy - 2} textAnchor="middle"
              fontSize="9" fontWeight="600"
              className={isActive ? 'fill-foreground' : 'fill-muted-foreground'}>
              {agent.name.length > 7 ? agent.name.slice(0, 6) : agent.name}
            </text>
            {/* Confidence or descriptor */}
            <text x={agent.gx} y={agent.gy + 9} textAnchor="middle" fontSize="7"
              className={sentiment ? sentimentTextClass(sentiment).replace('text-', 'fill-') : 'fill-muted-foreground'}>
              {confidence ? `${confidence}%` : (isActive ? '...' : 'Off')}
            </text>
            {/* State dot (top-right) */}
            <circle cx={agent.gx + 16} cy={agent.gy - 16} r="3.5" fill={si.svgColor} />
            {isActive && (
              <circle cx={agent.gx + 16} cy={agent.gy - 16} r="3.5"
                fill="none" stroke={si.svgColor} strokeWidth="1">
                <animate attributeName="r" values="3.5;7;3.5" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function AgentNetworkPanel() {
  const {
    agentStatuses, signalConsensus, agentEvents, knowledgeCount,
    isExecuting,
  } = useTradingStore();

  // Fetch agent status on mount + periodic refresh
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      const store = useTradingStore.getState();
      if (data.agents) store.setAgentStatuses(data.agents);
      if (data.signalSummary) store.setSignalConsensus(data.signalSummary);
    } catch { /* agents API not available */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Fetch knowledge count on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/knowledge');
        const data = await res.json();
        if (typeof data.count === 'number') {
          useTradingStore.getState().setKnowledgeCount(data.count);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const statusMap = new Map(agentStatuses.map(a => [a.id, a]));

  return (
    <FadeIn className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border text-[13px] font-medium tracking-[0.01em] text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="1" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="23" />
              <line x1="1" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="23" y2="12" />
            </svg>
          </div>
          <span>Agent Intelligence</span>
        </div>
        <button onClick={fetchStatus}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          title="Refresh agent status">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Signal Consensus Bar */}
        <Card className="py-0 gap-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Signal Consensus
              </span>
              {signalConsensus && (
                <span className={cn(
                  'text-[11px] font-semibold',
                  signalConsensus.consensusSentiment === 'bullish' ? 'text-claude-green' :
                  signalConsensus.consensusSentiment === 'bearish' ? 'text-destructive' :
                  'text-foreground'
                )}>
                  {signalConsensus.consensusSentiment.toUpperCase()} {signalConsensus.consensusConfidence}%
                </span>
              )}
            </div>
            {signalConsensus ? (
              <>
                <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                      signalConsensus.consensusSentiment === 'bullish' ? 'bg-claude-green' :
                      signalConsensus.consensusSentiment === 'bearish' ? 'bg-destructive' :
                      'bg-muted-foreground'
                    )}
                    style={{
                      width: `${signalConsensus.consensusConfidence}%`,
                      opacity: 0.8,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-muted-foreground">
                    {signalConsensus.totalSignals} active signal{signalConsensus.totalSignals !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    {Object.keys(signalConsensus.byAgent).length} agent{Object.keys(signalConsensus.byAgent).length !== 1 ? 's' : ''} reporting
                  </span>
                </div>
              </>
            ) : (
              <div className="text-[10px] text-muted-foreground">
                Agents offline — start autopilot to activate
              </div>
            )}
          </CardContent>
        </Card>

        {/* Network Graph */}
        <Card className="py-0 gap-0 shadow-sm">
          <CardContent className="p-2">
            <NetworkGraph agents={statusMap} isExecuting={isExecuting} />
          </CardContent>
        </Card>

        {/* Agent Status Cards */}
        {AGENTS.map(agent => {
          const status = statusMap.get(agent.id);
          const si = stateIndicator(status?.state ?? 'stopped');
          const signal = status?.latestSignal;
          const age = signal ? Math.round((Date.now() - signal.timestamp) / 1000) : null;

          return (
            <Card key={agent.id} className="py-0 gap-0 shadow-sm">
              <CardContent className="p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', si.className)} />
                    <span className="text-[11px] font-semibold text-foreground">{agent.name}</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                    {si.label}
                  </Badge>
                </div>
                <div className="text-[9px] text-muted-foreground mb-1">{agent.desc}</div>
                {signal ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        'text-[10px] font-medium',
                        sentimentTextClass(signal.sentiment)
                      )}>
                        {signal.sentiment.toUpperCase()} {signal.confidence}%
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {age !== null ? (age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`) : ''}
                      </span>
                    </div>
                    {signal.confidence != null && (
                      <ConfidenceBar value={signal.confidence / 100} showLabel={false} />
                    )}
                    <p className="text-[9px] text-foreground line-clamp-2">{signal.summary}</p>
                  </div>
                ) : (
                  <div className="text-[9px] text-muted-foreground">
                    {status?.state === 'running' ? 'Initializing...' : 'No signal'}
                  </div>
                )}
                {status?.tickCount !== undefined && status.tickCount > 0 && (
                  <div className="mt-1 text-[8px] text-muted-foreground">
                    Tick #{status.tickCount}
                    {status.lastError && (
                      <span className="text-destructive ml-2">Last error: {status.lastError}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Knowledge Base Indicator */}
        <Card className="py-0 gap-0 shadow-sm">
          <CardContent className="p-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-primary">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                <span className="text-[10px] font-semibold text-foreground">Knowledge Base</span>
              </div>
              <span className="text-[10px] text-primary font-medium">{knowledgeCount} entries</span>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">
              Type{' '}
              <code className="text-primary bg-muted px-1 rounded text-[8px]">
                learn: Title | Content
              </code>{' '}
              in chat to teach the Commander
            </p>
          </CardContent>
        </Card>

        {/* Recent Agent Events */}
        {agentEvents.length > 0 && (
          <Card className="py-0 gap-0 shadow-sm">
            <CardContent className="p-2.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                Recent Events
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {agentEvents.slice(-10).reverse().map((evt, i) => {
                  const evtAge = Math.round((Date.now() - evt.timestamp) / 1000);
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-[9px]">
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full flex-shrink-0',
                        evt.type === 'agent_signal' ? 'bg-primary' :
                        evt.type === 'agent_error' ? 'bg-destructive' :
                        evt.type === 'agent_started' ? 'bg-claude-green' :
                        evt.type === 'agent_stopped' ? 'bg-yellow-500' :
                        'bg-muted-foreground'
                      )} />
                      <span className="text-foreground truncate flex-1">
                        {evt.type.replace('agent_', '').replace('orchestrator_', '')} — {String(evt.agentId)}
                      </span>
                      <span className="text-muted-foreground flex-shrink-0">
                        {evtAge < 60 ? `${evtAge}s` : `${Math.round(evtAge / 60)}m`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </FadeIn>
  );
}
