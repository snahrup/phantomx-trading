// ============================================================================
// PhantomX — Agent Orchestrator
// ============================================================================
// Manages the lifecycle of all sub-agents. Started/stopped alongside the
// heartbeat engine. Routes agent events to SSE broadcast. Provides a
// unified status endpoint for the UI.
// ============================================================================

import { SentinelAgent } from './sentinel-agent';
import { MacroAgent } from './macro-agent';
import { NewsAgent } from './news-agent';
import { TechnicalAgent } from './technical-agent';
import { getSignalBus } from './signal-bus';
import type { AgentEvent, AgentStatus, OrchestratorConfig, SignalSummary } from '@/types/trading';

const DEFAULT_CONFIG: OrchestratorConfig = {
  enableSentinel: true,
  enableMacro: true,
  enableNews: true,
  enableTechnical: true,
  sentinelIntervalMs: 300_000,  // 5 min
  macroIntervalMs: 600_000,     // 10 min
  newsIntervalMs: 300_000,      // 5 min
  technicalIntervalMs: 120_000, // 2 min
  signalTtlMs: 600_000,        // 10 min
};

export class AgentOrchestrator {
  private sentinel: SentinelAgent;
  private macro: MacroAgent;
  private news: NewsAgent;
  private technical: TechnicalAgent;
  private config: OrchestratorConfig;
  private eventCallbacks: Array<(event: AgentEvent) => void> = [];
  private isRunning = false;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sentinel = new SentinelAgent();
    this.macro = new MacroAgent();
    this.news = new NewsAgent();
    this.technical = new TechnicalAgent();

    // Wire up event forwarding from each agent
    const forward = (event: AgentEvent) => {
      for (const cb of this.eventCallbacks) {
        try { cb(event); } catch { /* swallow */ }
      }
    };
    this.sentinel.onEvent(forward);
    this.macro.onEvent(forward);
    this.news.onEvent(forward);
    this.technical.onEvent(forward);
  }

  /** Set which symbols the Technical Agent should monitor. */
  setWatchlist(symbols: string[]): void {
    this.technical.setWatchlist(symbols);
  }

  /** Start all enabled agents. */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const startPromises: Promise<void>[] = [];

    if (this.config.enableSentinel) {
      startPromises.push(
        this.sentinel.start(this.config.sentinelIntervalMs, this.config.signalTtlMs)
      );
    }
    if (this.config.enableMacro) {
      startPromises.push(
        this.macro.start(this.config.macroIntervalMs, this.config.signalTtlMs)
      );
    }
    if (this.config.enableNews) {
      startPromises.push(
        this.news.start(this.config.newsIntervalMs, this.config.signalTtlMs)
      );
    }
    if (this.config.enableTechnical) {
      startPromises.push(
        this.technical.start(this.config.technicalIntervalMs, this.config.signalTtlMs)
      );
    }

    await Promise.allSettled(startPromises);

    this.emitOrchestratorEvent('started');
  }

  /** Stop all agents and clear signals. */
  stop(): void {
    this.sentinel.stop();
    this.macro.stop();
    this.news.stop();
    this.technical.stop();
    this.isRunning = false;

    this.emitOrchestratorEvent('stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  /** Get status of all agents. */
  getStatus(): {
    isRunning: boolean;
    agents: AgentStatus[];
    signalSummary: SignalSummary;
    config: OrchestratorConfig;
  } {
    return {
      isRunning: this.isRunning,
      agents: [
        this.sentinel.getStatus(),
        this.macro.getStatus(),
        this.news.getStatus(),
        this.technical.getStatus(),
      ],
      signalSummary: getSignalBus().getSummary(),
      config: this.config,
    };
  }

  /** Get the signal summary for injecting into the Commander's prompt. */
  getSignalIntelligence(): string {
    const bus = getSignalBus();
    const summary = bus.getSummary();
    const latestPerAgent = bus.getLatestPerAgent();

    if (summary.totalSignals === 0) {
      return '  No agent signals yet (agents are still initializing).';
    }

    const lines: string[] = [
      `  Consensus: ${summary.consensusSentiment.toUpperCase()} (${summary.consensusConfidence}% confidence)`,
      `  Total active signals: ${summary.totalSignals}`,
      '',
    ];

    for (const [agentId, signal] of latestPerAgent) {
      const age = Math.round((Date.now() - signal.timestamp) / 1000);
      lines.push(`  [${signal.agentName}] ${signal.sentiment.toUpperCase()} (${signal.confidence}% conf, ${age}s ago)`);
      lines.push(`    ${signal.summary}`);

      // Include key data points based on agent type
      if (agentId === 'sentinel') {
        const d = signal.data as Record<string, unknown>;
        if (d.fearGreedIndex) lines.push(`    Fear & Greed Index: ${d.fearGreedIndex}`);
        if (d.compositeScore) lines.push(`    Composite Sentiment: ${d.compositeScore}/100`);
      } else if (agentId === 'macro') {
        const d = signal.data as Record<string, unknown>;
        if (d.totalMarketCapBillions) lines.push(`    Market Cap: $${d.totalMarketCapBillions}B`);
        if (d.btcDominance) lines.push(`    BTC Dominance: ${d.btcDominance}%`);
        if (d.macroScore) lines.push(`    Macro Score: ${d.macroScore}/100`);
      } else if (agentId === 'news') {
        const d = signal.data as Record<string, unknown>;
        if (d.postCount) lines.push(`    Headlines analyzed: ${d.postCount}`);
        if (d.normalizedScore) lines.push(`    News Score: ${d.normalizedScore}/100`);
        const headlines = d.topHeadlines as Array<{ title: string; sentiment: string }> | undefined;
        if (headlines && headlines.length > 0) {
          lines.push(`    Top headlines:`);
          for (const h of headlines.slice(0, 3)) {
            lines.push(`      • [${h.sentiment}] ${h.title}`);
          }
        }
      } else if (agentId === 'technical') {
        const d = signal.data as Record<string, unknown>;
        if (d.avgStrength) lines.push(`    Avg Technical Strength: ${d.avgStrength}/100`);
        const breakdown = d.symbolBreakdown as Array<{ symbol: string; trend: string; strength: number; rsi14: number | null }> | undefined;
        if (breakdown && breakdown.length > 0) {
          for (const sym of breakdown.slice(0, 5)) {
            lines.push(`      ${sym.symbol}: ${sym.trend} (${sym.strength}/100)${sym.rsi14 !== null ? ` RSI:${sym.rsi14}` : ''}`);
          }
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /** Get signals relevant to a specific symbol for targeted analysis. */
  getSignalsForSymbol(symbol: string): string {
    const signals = getSignalBus().getSignalsForSymbol(symbol);
    if (signals.length === 0) return `  No signals for ${symbol}`;

    return signals.slice(0, 5).map(s => {
      const age = Math.round((Date.now() - s.timestamp) / 1000);
      return `  [${s.agentName}] ${s.sentiment.toUpperCase()} ${s.confidence}% (${age}s ago): ${s.summary}`;
    }).join('\n');
  }

  /** Subscribe to agent events (for SSE broadcast). */
  onEvent(callback: (event: AgentEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  /** Update config on the fly. */
  updateConfig(partial: Partial<OrchestratorConfig>): void {
    Object.assign(this.config, partial);
    // Restart affected agents if intervals changed
    if (this.isRunning) {
      if (partial.sentinelIntervalMs !== undefined) {
        this.sentinel.stop();
        if (this.config.enableSentinel) {
          this.sentinel.start(this.config.sentinelIntervalMs, this.config.signalTtlMs);
        }
      }
      if (partial.macroIntervalMs !== undefined) {
        this.macro.stop();
        if (this.config.enableMacro) {
          this.macro.start(this.config.macroIntervalMs, this.config.signalTtlMs);
        }
      }
      if (partial.newsIntervalMs !== undefined) {
        this.news.stop();
        if (this.config.enableNews) {
          this.news.start(this.config.newsIntervalMs, this.config.signalTtlMs);
        }
      }
      if (partial.technicalIntervalMs !== undefined) {
        this.technical.stop();
        if (this.config.enableTechnical) {
          this.technical.start(this.config.technicalIntervalMs, this.config.signalTtlMs);
        }
      }
    }
  }

  private emitOrchestratorEvent(status: string): void {
    const event: AgentEvent = {
      type: 'orchestrator_status',
      agentId: 'orchestrator',
      data: {
        status,
        agents: [
          this.sentinel.getStatus(),
          this.macro.getStatus(),
          this.news.getStatus(),
          this.technical.getStatus(),
        ],
        signalSummary: getSignalBus().getSummary(),
      },
      timestamp: Date.now(),
    };
    for (const cb of this.eventCallbacks) {
      try { cb(event); } catch { /* swallow */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let orchestrator: AgentOrchestrator | null = null;

export function getOrchestrator(): AgentOrchestrator | null {
  return orchestrator;
}

export function createOrchestrator(config?: Partial<OrchestratorConfig>): AgentOrchestrator {
  if (orchestrator?.isActive()) {
    orchestrator.stop();
  }
  orchestrator = new AgentOrchestrator(config);
  return orchestrator;
}

export function stopOrchestrator(): void {
  orchestrator?.stop();
  orchestrator = null;
}
