'use client';

import { useEffect, useCallback } from 'react';
import { useTradingStore } from '@/store/trading-store';
import type { AgentStatus, AgentSentiment } from '@/types/trading';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sentimentColor(sentiment: AgentSentiment | undefined): string {
  if (!sentiment) return 'var(--cl-text-secondary)';
  switch (sentiment) {
    case 'bullish': return 'var(--cl-success)';
    case 'bearish': return 'var(--cl-error)';
    default: return 'var(--cl-text-secondary)';
  }
}

function stateIndicator(state: string): { color: string; label: string } {
  switch (state) {
    case 'running': return { color: 'var(--cl-success)', label: 'Running' };
    case 'error': return { color: 'var(--cl-error)', label: 'Error' };
    case 'idle': return { color: 'var(--cl-warning)', label: 'Idle' };
    default: return { color: 'var(--cl-text-secondary)', label: 'Stopped' };
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
              stroke={isActive ? 'var(--cl-accent)' : 'var(--cl-border)'}
              strokeWidth={isActive ? 1.5 : 0.5}
              strokeDasharray={isActive ? 'none' : '4 4'}
              opacity={isActive ? 0.5 : 0.15}
            />
            {/* Animated signal dot flowing to Commander */}
            {isActive && status?.latestSignal && (
              <circle r="3" fill={sentimentColor(status.latestSignal.sentiment)}
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
          fill="var(--cl-bg-surface)"
          stroke={isExecuting ? 'var(--cl-accent)' : 'var(--cl-border)'}
          strokeWidth={isExecuting ? 2 : 1} />
        {isExecuting && (
          <circle cx={CMD.x} cy={CMD.y} r="30" fill="none"
            stroke="var(--cl-accent)" strokeWidth="1" opacity="0.5">
            <animate attributeName="r" values="30;38;30" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
          </circle>
        )}
        <text x={CMD.x} y={CMD.y - 5} textAnchor="middle"
          fill="var(--cl-accent)" fontSize="10" fontWeight="600">Commander</text>
        <text x={CMD.x} y={CMD.y + 8} textAnchor="middle"
          fill="var(--cl-text-secondary)" fontSize="8">
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
              stroke={isActive && sentiment ? sentimentColor(sentiment) : 'var(--cl-border)'}
              strokeWidth={isActive ? 2 : 0.5}
              opacity={isActive ? 0.8 : 0.2} />
            {/* Inner circle */}
            <circle cx={agent.gx} cy={agent.gy} r="18"
              fill="var(--cl-bg-surface)"
              stroke="var(--cl-border-subtle)" strokeWidth="1" />
            {/* Name */}
            <text x={agent.gx} y={agent.gy - 2} textAnchor="middle"
              fontSize="9" fontWeight="600"
              fill={isActive ? 'var(--cl-text-primary)' : 'var(--cl-text-secondary)'}>
              {agent.name.length > 7 ? agent.name.slice(0, 6) : agent.name}
            </text>
            {/* Confidence or descriptor */}
            <text x={agent.gx} y={agent.gy + 9} textAnchor="middle" fontSize="7"
              fill={sentiment ? sentimentColor(sentiment) : 'var(--cl-text-secondary)'}>
              {confidence ? `${confidence}%` : (isActive ? '...' : 'Off')}
            </text>
            {/* State dot (top-right) */}
            <circle cx={agent.gx + 16} cy={agent.gy - 16} r="3.5" fill={si.color} />
            {isActive && (
              <circle cx={agent.gx + 16} cy={agent.gy - 16} r="3.5"
                fill="none" stroke={si.color} strokeWidth="1">
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[var(--cl-accent)] flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="1" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="23" />
              <line x1="1" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="23" y2="12" />
            </svg>
          </div>
          <span>Agent Intelligence</span>
        </div>
        <button onClick={fetchStatus}
          className="text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)] transition-colors p-1"
          title="Refresh agent status">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Signal Consensus Bar */}
        <div className="glass-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-semibold">
              Signal Consensus
            </span>
            {signalConsensus && (
              <span className={`text-[11px] font-semibold ${
                signalConsensus.consensusSentiment === 'bullish' ? 'text-[var(--cl-success)]' :
                signalConsensus.consensusSentiment === 'bearish' ? 'text-[var(--cl-error)]' :
                'text-[var(--cl-text-faint)]'
              }`}>
                {signalConsensus.consensusSentiment.toUpperCase()} {signalConsensus.consensusConfidence}%
              </span>
            )}
          </div>
          {signalConsensus ? (
            <>
              <div className="relative h-2 rounded-full bg-[var(--cl-fill-control)] overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${signalConsensus.consensusConfidence}%`,
                    backgroundColor: sentimentColor(signalConsensus.consensusSentiment),
                    opacity: 0.8,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[9px] text-[var(--cl-text-secondary)]">
                  {signalConsensus.totalSignals} active signal{signalConsensus.totalSignals !== 1 ? 's' : ''}
                </span>
                <span className="text-[9px] text-[var(--cl-text-secondary)]">
                  {Object.keys(signalConsensus.byAgent).length} agent{Object.keys(signalConsensus.byAgent).length !== 1 ? 's' : ''} reporting
                </span>
              </div>
            </>
          ) : (
            <div className="text-[10px] text-[var(--cl-text-secondary)]">
              Agents offline — start autopilot to activate
            </div>
          )}
        </div>

        {/* Network Graph */}
        <div className="glass-card p-2">
          <NetworkGraph agents={statusMap} isExecuting={isExecuting} />
        </div>

        {/* Agent Status Cards */}
        {AGENTS.map(agent => {
          const status = statusMap.get(agent.id);
          const si = stateIndicator(status?.state ?? 'stopped');
          const signal = status?.latestSignal;
          const age = signal ? Math.round((Date.now() - signal.timestamp) / 1000) : null;

          return (
            <div key={agent.id} className="glass-card p-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: si.color }} />
                  <span className="text-[11px] font-semibold text-[var(--cl-text-primary)]">{agent.name}</span>
                </div>
                <span className="text-[9px] text-[var(--cl-text-secondary)]">{si.label}</span>
              </div>
              <div className="text-[9px] text-[var(--cl-text-secondary)] mb-1">{agent.desc}</div>
              {signal ? (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-medium ${
                      signal.sentiment === 'bullish' ? 'text-[var(--cl-success)]' :
                      signal.sentiment === 'bearish' ? 'text-[var(--cl-error)]' :
                      'text-[var(--cl-text-faint)]'
                    }`}>
                      {signal.sentiment.toUpperCase()} {signal.confidence}%
                    </span>
                    <span className="text-[9px] text-[var(--cl-text-secondary)]">
                      {age !== null ? (age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`) : ''}
                    </span>
                  </div>
                  <p className="text-[9px] text-[var(--cl-text-faint)] line-clamp-2">{signal.summary}</p>
                </div>
              ) : (
                <div className="text-[9px] text-[var(--cl-text-secondary)]">
                  {status?.state === 'running' ? 'Initializing...' : 'No signal'}
                </div>
              )}
              {status?.tickCount !== undefined && status.tickCount > 0 && (
                <div className="mt-1 text-[8px] text-[var(--cl-text-secondary)]">
                  Tick #{status.tickCount}
                  {status.lastError && (
                    <span className="text-[var(--cl-error)] ml-2">Last error: {status.lastError}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Knowledge Base Indicator */}
        <div className="glass-card p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cl-accent)" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span className="text-[10px] font-semibold text-[var(--cl-text-primary)]">Knowledge Base</span>
            </div>
            <span className="text-[10px] text-[var(--cl-accent)] font-medium">{knowledgeCount} entries</span>
          </div>
          <p className="text-[9px] text-[var(--cl-text-secondary)] mt-1">
            Type{' '}
            <code className="text-[var(--cl-accent)] bg-[var(--cl-fill-control)] px-1 rounded text-[8px]">
              learn: Title | Content
            </code>{' '}
            in chat to teach the Commander
          </p>
        </div>

        {/* Recent Agent Events */}
        {agentEvents.length > 0 && (
          <div className="glass-card p-2.5">
            <div className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider font-semibold mb-1.5">
              Recent Events
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {agentEvents.slice(-10).reverse().map((evt, i) => {
                const age = Math.round((Date.now() - evt.timestamp) / 1000);
                return (
                  <div key={i} className="flex items-center gap-1.5 text-[9px]">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      evt.type === 'agent_signal' ? 'bg-[var(--cl-accent)]' :
                      evt.type === 'agent_error' ? 'bg-[var(--cl-error)]' :
                      evt.type === 'agent_started' ? 'bg-[var(--cl-success)]' :
                      evt.type === 'agent_stopped' ? 'bg-[var(--cl-warning)]' :
                      'bg-[var(--cl-text-secondary)]'
                    }`} />
                    <span className="text-[var(--cl-text-faint)] truncate flex-1">
                      {evt.type.replace('agent_', '').replace('orchestrator_', '')} — {String(evt.agentId)}
                    </span>
                    <span className="text-[var(--cl-text-secondary)] flex-shrink-0">
                      {age < 60 ? `${age}s` : `${Math.round(age / 60)}m`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
