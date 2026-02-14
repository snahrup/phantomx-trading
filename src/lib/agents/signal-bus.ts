// ============================================================================
// PhantomX — Signal Bus (Inter-Agent Communication)
// ============================================================================
// In-memory store where sub-agents publish structured signals.
// The Commander (PortfolioHeartbeatEngine) reads all signals to enrich its
// AI prompt. TTL-based expiry ensures stale signals are automatically pruned.
// ============================================================================

import type { AgentId, AgentSignal, AgentSentiment, SignalSummary } from '@/types/trading';

class SignalBus {
  private signals = new Map<AgentId, AgentSignal[]>();

  /** Publish a signal from an agent. Cleans expired signals on write. */
  publish(signal: AgentSignal): void {
    this.cleanup();
    const existing = this.signals.get(signal.agentId) ?? [];
    existing.push(signal);
    // Keep only last 20 signals per agent to bound memory
    if (existing.length > 20) existing.splice(0, existing.length - 20);
    this.signals.set(signal.agentId, existing);
  }

  /** Get latest (non-expired) signals, optionally filtered by agent. */
  getLatestSignals(agentId?: AgentId): AgentSignal[] {
    this.cleanup();
    if (agentId) {
      return [...(this.signals.get(agentId) ?? [])];
    }
    const all: AgentSignal[] = [];
    for (const signals of this.signals.values()) {
      all.push(...signals);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Get the single most recent signal per agent. */
  getLatestPerAgent(): Map<AgentId, AgentSignal> {
    this.cleanup();
    const latest = new Map<AgentId, AgentSignal>();
    for (const [agentId, signals] of this.signals) {
      if (signals.length > 0) {
        latest.set(agentId, signals[signals.length - 1]);
      }
    }
    return latest;
  }

  /** Get signals relevant to a specific symbol (or market-wide signals). */
  getSignalsForSymbol(symbol: string): AgentSignal[] {
    this.cleanup();
    const result: AgentSignal[] = [];
    for (const signals of this.signals.values()) {
      for (const s of signals) {
        if (!s.symbols || s.symbols.length === 0 || s.symbols.includes(symbol)) {
          result.push(s);
        }
      }
    }
    return result.sort((a, b) => b.timestamp - a.timestamp);
  }

  /** Remove all expired signals. Called automatically on reads/writes. */
  cleanup(): void {
    const now = Date.now();
    for (const [agentId, signals] of this.signals) {
      const valid = signals.filter(s => s.expiresAt > now);
      if (valid.length === 0) {
        this.signals.delete(agentId);
      } else {
        this.signals.set(agentId, valid);
      }
    }
  }

  /** Summary for UI display and Commander prompt. */
  getSummary(): SignalSummary {
    this.cleanup();
    const byAgent: SignalSummary['byAgent'] = {};
    let totalBullish = 0;
    let totalBearish = 0;
    let totalNeutral = 0;
    let weightedConfidence = 0;
    let totalWeight = 0;

    for (const [agentId, signals] of this.signals) {
      if (signals.length === 0) continue;
      const latest = signals[signals.length - 1];
      byAgent[agentId] = {
        count: signals.length,
        latestSentiment: latest.sentiment,
        latestConfidence: latest.confidence,
      };
      // Tally for consensus
      if (latest.sentiment === 'bullish') totalBullish++;
      else if (latest.sentiment === 'bearish') totalBearish++;
      else totalNeutral++;
      weightedConfidence += latest.confidence;
      totalWeight++;
    }

    let consensusSentiment: AgentSentiment = 'neutral';
    if (totalBullish > totalBearish && totalBullish > totalNeutral) consensusSentiment = 'bullish';
    else if (totalBearish > totalBullish && totalBearish > totalNeutral) consensusSentiment = 'bearish';

    return {
      totalSignals: Array.from(this.signals.values()).reduce((sum, s) => sum + s.length, 0),
      byAgent,
      consensusSentiment,
      consensusConfidence: totalWeight > 0 ? Math.round(weightedConfidence / totalWeight) : 0,
    };
  }

  /** Clear all signals (used on engine stop). */
  clear(): void {
    this.signals.clear();
  }
}

// Singleton instance
const signalBus = new SignalBus();
export function getSignalBus(): SignalBus { return signalBus; }
export { SignalBus };
