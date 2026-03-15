// ============================================================================
// PhantomX — Mission Orchestrator
// ============================================================================
// Self-sustaining task engine for autonomous trading mode. Continuously
// seeds work for Axon agents so they're always scanning, researching,
// debating, and executing — without ever going idle.
//
// Lifecycle per symbol:
//   SCAN → EVALUATE → TRADE (5-wave pipeline) → MONITOR → SCAN (repeat)
//
// The orchestrator runs server-side as a singleton with setInterval.
// Start it from LaunchPanel, stop it from the kill switch.
// ============================================================================

import { getAxonClient } from '@/lib/axon/client';
import type { AxonIssue } from '@/lib/axon/types';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SymbolPhase =
  | 'scanning'      // Research agents analyzing this symbol
  | 'pipeline'      // 5-wave trading pipeline in progress
  | 'monitoring'    // Position open, agents watching for exit signals
  | 'cooldown'      // Just traded/rejected, brief pause before next scan
  | 'idle';         // Waiting for next scan cycle

interface SymbolState {
  symbol: string;
  phase: SymbolPhase;
  activeIssueId: string | null;
  lastScanAt: number;
  lastTradeAt: number;
  scanCount: number;
  tradeCount: number;
  consecutiveNoOpportunity: number;
}

export type TeamSize = 'lean' | 'standard' | 'full';

export interface MissionConfig {
  selectedPairs: string[];
  riskLevel: string;
  maxConcurrentPositions: number;
  profitGoal: number | null;
  startingBalance: number | null;
  teamSize: TeamSize;
  scanIntervalSec: number;
}

export interface OrchestratorStatus {
  running: boolean;
  startedAt: string | null;
  config: MissionConfig | null;
  symbols: Record<string, {
    phase: SymbolPhase;
    activeIssueId: string | null;
    scanCount: number;
    tradeCount: number;
  }>;
  tickCount: number;
  lastTickAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICK_INTERVAL_MS = 15_000;           // Check every 15s
const DEFAULT_SCAN_COOLDOWN_MS = 120_000;  // Default 2 min between scans (overridden by config)
const POST_TRADE_COOLDOWN_MS = 120_000;    // 2 min cooldown after trade/rejection
const MAX_CONCURRENT_PIPELINES = 2;        // Don't overwhelm Axon
const MAX_CONCURRENT_SCANS = 3;            // Only scan a few symbols at a time
const STALE_ISSUE_TIMEOUT_MS = 10 * 60_000; // 10 min — cancel stale issues (was 30m, too long)

const TEAM_SIZE_DESCRIPTIONS: Record<TeamSize, string> = {
  lean: 'Lean team (2 analysts). Focus on technical analysis + sentiment only.',
  standard: 'Standard team (4 analysts). Technical, sentiment, on-chain, microstructure.',
  full: 'Full team (4 analysts + deep microstructure + on-chain whale tracking). Maximum intelligence.',
};

// Agent role keywords used to match Axon agents by title/role for issue assignment.
// Scan issues go to the research lead; pipeline issues go to the trading lead.
const SCAN_AGENT_KEYWORDS = ['head of research', 'market research analyst', 'research'];
const PIPELINE_AGENT_KEYWORDS = ['head of trading', 'trading lead', 'trading'];

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

class MissionOrchestrator {
  private running = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private config: MissionConfig | null = null;
  private symbolStates = new Map<string, SymbolState>();
  private startedAt: string | null = null;
  private tickCount = 0;
  private lastTickAt: string | null = null;

  // Resolved agent IDs — populated on start() from Axon agent list
  private scanAgentId: string | null = null;
  private pipelineAgentId: string | null = null;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  start(config: MissionConfig): void {
    // Defensive: clear any leaked interval from a previous instance or hot reload
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.running) {
      console.warn('[orchestrator] Already running — stopping first to restart cleanly');
      this.stop();
    }

    this.config = config;
    this.running = true;
    this.startedAt = new Date().toISOString();
    this.tickCount = 0;
    this.symbolStates.clear();

    // Initialize state for each selected pair
    for (const pair of config.selectedPairs) {
      this.symbolStates.set(pair, {
        symbol: pair,
        phase: 'idle',
        activeIssueId: null,
        lastScanAt: 0,
        lastTradeAt: 0,
        scanCount: 0,
        tradeCount: 0,
        consecutiveNoOpportunity: 0,
      });
    }

    console.log(`[orchestrator] Started with ${config.selectedPairs.length} pairs — ${config.riskLevel} mode`);

    // Resolve agent IDs from Axon before first tick
    this.resolveAgentIds().then(() => {
      // Run first tick immediately, then on interval
      this.tick().catch(console.error);
      this.intervalId = setInterval(() => this.tick().catch(console.error), TICK_INTERVAL_MS);
    }).catch((err) => {
      console.error('[orchestrator] Failed to resolve agent IDs — starting anyway:', err);
      this.tick().catch(console.error);
      this.intervalId = setInterval(() => this.tick().catch(console.error), TICK_INTERVAL_MS);
    });
  }

  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log(`[orchestrator] Stopped after ${this.tickCount} ticks`);
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): OrchestratorStatus {
    const symbols: OrchestratorStatus['symbols'] = {};
    for (const [sym, state] of this.symbolStates) {
      symbols[sym] = {
        phase: state.phase,
        activeIssueId: state.activeIssueId,
        scanCount: state.scanCount,
        tradeCount: state.tradeCount,
      };
    }
    return {
      running: this.running,
      startedAt: this.startedAt,
      config: this.config,
      symbols,
      tickCount: this.tickCount,
      lastTickAt: this.lastTickAt,
    };
  }

  // -------------------------------------------------------------------------
  // Core tick — runs every TICK_INTERVAL_MS
  // -------------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (!this.running || !this.config) return;

    this.tickCount++;
    this.lastTickAt = new Date().toISOString();
    const now = Date.now();

    // Safety: check if mode was reverted to manual externally
    if (this.isModeManual()) {
      console.log('[orchestrator] Trading mode reverted to manual — stopping');
      this.stop();
      return;
    }

    const axon = getAxonClient();

    // Count active pipelines and scans to respect concurrency limits
    let activePipelines = 0;
    let activeScans = 0;
    for (const state of this.symbolStates.values()) {
      if (state.phase === 'pipeline') activePipelines++;
      if (state.phase === 'scanning') activeScans++;
    }

    for (const [symbol, state] of this.symbolStates) {
      try {
        switch (state.phase) {
          case 'idle': {
            // Throttle: only allow MAX_CONCURRENT_SCANS at a time
            if (activeScans >= MAX_CONCURRENT_SCANS) break;

            // Ready to scan — check cooldown (use config scanIntervalSec)
            const timeSinceLastScan = now - state.lastScanAt;
            const baseCooldown = (this.config!.scanIntervalSec ?? 120) * 1000;
            // Back off scan interval based on consecutive no-opportunity results
            const backoffMultiplier = Math.min(state.consecutiveNoOpportunity, 5);
            const effectiveCooldown = baseCooldown * (1 + backoffMultiplier);

            if (timeSinceLastScan >= effectiveCooldown) {
              await this.createScanIssue(symbol, state);
              activeScans++;
            }
            break;
          }

          case 'scanning': {
            // Check if scan issue completed
            if (!state.activeIssueId) {
              state.phase = 'idle';
              break;
            }
            const issue = await this.fetchIssue(state.activeIssueId);
            if (!issue) {
              state.phase = 'idle';
              state.activeIssueId = null;
              break;
            }

            if (issue.status === 'done' || issue.status === 'cancelled') {
              // Scan finished — check if agents found an opportunity
              const hasOpportunity = await this.checkScanForOpportunity(state.activeIssueId);
              state.activeIssueId = null;

              if (hasOpportunity && activePipelines < MAX_CONCURRENT_PIPELINES) {
                state.consecutiveNoOpportunity = 0;
                await this.createTradingIssue(symbol, state);
                activePipelines++;
              } else {
                state.consecutiveNoOpportunity++;
                state.phase = 'idle';
              }
            } else if (this.isStale(issue, now)) {
              // Scan took too long — cancel and move on
              await axon.updateIssue(state.activeIssueId, { status: 'cancelled' });
              state.activeIssueId = null;
              state.phase = 'idle';
            }
            break;
          }

          case 'pipeline': {
            // 5-wave trading pipeline in progress — check status
            if (!state.activeIssueId) {
              state.phase = 'idle';
              break;
            }
            const pipelineResult = await axon.getPipelineStatus(state.activeIssueId);
            if (!pipelineResult.ok) {
              // Issue may not exist anymore
              const issue = await this.fetchIssue(state.activeIssueId);
              if (!issue || issue.status === 'done' || issue.status === 'cancelled') {
                state.activeIssueId = null;
                state.phase = 'cooldown';
                state.lastTradeAt = now;
              }
              break;
            }

            const pipeline = pipelineResult.data;

            if (pipeline.status === 'done') {
              // Pipeline completed — trade was executed (or rejected at a gate)
              state.tradeCount++;
              state.activeIssueId = null;
              state.phase = 'cooldown';
              state.lastTradeAt = now;
            } else if (pipeline.status === 'cancelled' || pipeline.status === 'blocked') {
              // Pipeline was rejected/blocked — cooldown then rescan
              state.activeIssueId = null;
              state.phase = 'cooldown';
              state.lastTradeAt = now;
            } else {
              // Check for stale pipeline via the issue directly
              const pipelineIssue = await this.fetchIssue(state.activeIssueId);
              if (pipelineIssue && this.isStale(pipelineIssue, now)) {
                await axon.updateIssue(state.activeIssueId, { status: 'cancelled' });
                state.activeIssueId = null;
                state.phase = 'cooldown';
                state.lastTradeAt = now;
              }
            }
            // Otherwise: pipeline still in progress — wait for next tick
            break;
          }

          case 'cooldown': {
            // Brief pause after trade before rescanning
            if (now - state.lastTradeAt >= POST_TRADE_COOLDOWN_MS) {
              state.phase = 'idle';
            }
            break;
          }

          case 'monitoring': {
            // Future: active position monitoring via agent tasks
            // For now, SL/TP orders on exchange handle exits automatically
            // Transition back to scanning after cooldown
            state.phase = 'idle';
            break;
          }
        }
      } catch (err) {
        console.error(`[orchestrator] Error processing ${symbol}:`, err);
        // Don't crash the loop — reset this symbol to idle
        state.phase = 'idle';
        state.activeIssueId = null;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Issue creation
  // -------------------------------------------------------------------------

  private async createScanIssue(symbol: string, state: SymbolState): Promise<void> {
    const axon = getAxonClient();
    const base = symbol.split('/')[0];
    const config = this.config!;

    const result = await axon.createIssue({
      title: `Scan ${base}: entry opportunity analysis`,
      description: [
        `**Autonomous scan** — Mission Control orchestrator`,
        '',
        `Analyze ${symbol} for potential entry opportunities.`,
        '',
        `**Instructions for research agents:**`,
        `1. **Multi-timeframe analysis** — check ALL of these:`,
        `   - **15m**: Immediate momentum, order flow, micro-structure`,
        `   - **1h**: Short-term trend, key S/R levels, volume profile`,
        `   - **4h**: Medium-term structure, EMA ribbon alignment, regime`,
        `   - **1D**: Macro trend, daily S/R, volume trends`,
        `   Use \`/api/phemex\` with \`action: "ohlcv"\` and \`timeframe: "15m"/"1h"/"4h"/"1d"\`, \`limit: 100\``,
        `2. Evaluate regime (trending/ranging/volatile) via ADX, EMA ribbon, volatility`,
        `3. Check funding rates: \`action: "funding_rate"\` with \`symbol: "${symbol}"\``,
        `4. Assess sentiment and any upcoming catalysts`,
        `5. If you find a valid entry setup, clearly state:`,
        `   - Direction (LONG/SHORT)`,
        `   - Entry zone (specific price)`,
        `   - Stop loss level`,
        `   - Take profit targets (at least 2)`,
        `   - Why now (what's the edge across multiple timeframes?)`,
        `6. If NO opportunity exists, clearly state "NO ENTRY" and why`,
        '',
        `**Risk Level**: ${config.riskLevel}`,
        `**Team**: ${TEAM_SIZE_DESCRIPTIONS[config.teamSize ?? 'standard']}`,
        `**Scan #${state.scanCount + 1}** for this symbol this session`,
        config.profitGoal ? `**Profit Goal**: $${config.profitGoal}` : '',
      ].filter(Boolean).join('\n'),
      issue_type: 'trading',
      priority: 'medium',
      ...(this.scanAgentId ? { assigned_agent_id: this.scanAgentId } : {}),
    });

    if (result.ok) {
      state.phase = 'scanning';
      state.activeIssueId = result.data.id;
      state.lastScanAt = Date.now();
      state.scanCount++;
      console.log(`[orchestrator] Created scan issue for ${base}: ${result.data.id}`);
    } else {
      console.error(`[orchestrator] Failed to create scan issue for ${base}:`, result.error);
    }
  }

  private async createTradingIssue(symbol: string, state: SymbolState): Promise<void> {
    const axon = getAxonClient();
    const base = symbol.split('/')[0];
    const config = this.config!;

    const result = await axon.createIssue({
      title: `Trade ${base}/USDT — ${config.riskLevel} mode`,
      description: [
        `**Autonomous trading pipeline** — triggered by scan results.`,
        '',
        `Run the full 5-wave pipeline for ${symbol}:`,
        `1. **Research**: Multi-timeframe deep-dive (15m, 1h, 4h, 1D). Technical, on-chain, sentiment, microstructure.`,
        `   Use \`/api/phemex\` with \`action: "ohlcv"\`, \`timeframe: "15m"/"1h"/"4h"/"1d"\`, \`limit: 100\``,
        `   Check funding: \`action: "funding_rate"\`, \`symbol: "${symbol}"\``,
        `2. **Debate**: Bull vs bear case across timeframes, Head of Research ruling`,
        `3. **Risk Assessment**: Position sizing, correlation, drawdown check`,
        `4. **Approval**: Head of Trading + CEO sign-off`,
        `5. **Execution**: Structured recommendation → auto-forward to PhantomX`,
        '',
        `**Risk Level**: ${config.riskLevel}`,
        `**Max Concurrent Positions**: ${config.maxConcurrentPositions}`,
        config.profitGoal ? `**Profit Goal**: $${config.profitGoal}` : '',
        config.startingBalance ? `**Starting Balance**: $${config.startingBalance}` : '',
      ].filter(Boolean).join('\n'),
      issue_type: 'trading',
      priority: config.riskLevel === 'degen' ? 'critical' : config.riskLevel === 'aggressive' ? 'high' : 'medium',
      ...(this.pipelineAgentId ? { assigned_agent_id: this.pipelineAgentId } : {}),
    });

    if (result.ok) {
      state.phase = 'pipeline';
      state.activeIssueId = result.data.id;
      console.log(`[orchestrator] Created trading issue for ${base}: ${result.data.id}`);
    } else {
      console.error(`[orchestrator] Failed to create trading issue for ${base}:`, result.error);
      state.phase = 'cooldown';
      state.lastTradeAt = Date.now();
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Fetch agent list from Axon and resolve IDs for scan/pipeline assignment */
  private async resolveAgentIds(): Promise<void> {
    const axon = getAxonClient();
    const result = await axon.listAgents();
    if (!result.ok) {
      console.warn('[orchestrator] Could not fetch agents — issues will be unassigned:', result.error);
      return;
    }

    const agents = result.data;

    // Find best match for scan agent (Head of Research > Market Research Analyst > any research)
    for (const keyword of SCAN_AGENT_KEYWORDS) {
      const match = agents.find(
        (a) => a.title.toLowerCase().includes(keyword) || a.role.toLowerCase().includes(keyword),
      );
      if (match) {
        this.scanAgentId = match.id;
        console.log(`[orchestrator] Scan agent resolved: ${match.title} (${match.id})`);
        break;
      }
    }

    // Find best match for pipeline agent (Head of Trading > trading lead > any trading)
    for (const keyword of PIPELINE_AGENT_KEYWORDS) {
      const match = agents.find(
        (a) => a.title.toLowerCase().includes(keyword) || a.role.toLowerCase().includes(keyword),
      );
      if (match) {
        this.pipelineAgentId = match.id;
        console.log(`[orchestrator] Pipeline agent resolved: ${match.title} (${match.id})`);
        break;
      }
    }

    if (!this.scanAgentId) {
      console.warn('[orchestrator] No scan agent found — scan issues will be unassigned');
    }
    if (!this.pipelineAgentId) {
      console.warn('[orchestrator] No pipeline agent found — pipeline issues will be unassigned');
    }
  }

  /** Check scan issue comments for opportunity signal */
  private async checkScanForOpportunity(issueId: string): Promise<boolean> {
    const axon = getAxonClient();
    const comments = await axon.getIssueComments(issueId);
    if (!comments.ok) return false;

    // Look through comments for positive signals
    const allText = comments.data.map(c => c.content).join('\n').toUpperCase();

    // Negative signals — agents explicitly said no opportunity
    const noOpportunityPatterns = [
      'NO ENTRY', 'NO OPPORTUNITY', 'NO SETUP', 'NO TRADE',
      'SKIP', 'PASS', 'NOT FAVORABLE', 'NO EDGE',
    ];
    const hasExplicitNo = noOpportunityPatterns.some(p => allText.includes(p));

    // Positive signals — agents found something
    const opportunityPatterns = [
      'ENTRY', 'OPPORTUNITY', 'SETUP', 'SIGNAL',
      'BUY ZONE', 'SELL ZONE', 'LONG', 'SHORT',
      'BULLISH', 'BEARISH', 'REVERSAL', 'BREAKOUT',
    ];
    const hasPositiveSignal = opportunityPatterns.some(p => allText.includes(p));

    // If explicit no → no opportunity. If positive signal without explicit no → opportunity.
    if (hasExplicitNo) return false;
    return hasPositiveSignal;
  }

  /** Fetch an issue, returning null if it doesn't exist */
  private async fetchIssue(issueId: string): Promise<AxonIssue | null> {
    const axon = getAxonClient();
    const result = await axon.getIssue(issueId);
    return result.ok ? result.data : null;
  }

  /** Check if an issue has been stale (unchanged) for too long */
  private isStale(issue: AxonIssue, now: number): boolean {
    const updatedAt = new Date(issue.updated_at ?? issue.created_at).getTime();
    return (now - updatedAt) > STALE_ISSUE_TIMEOUT_MS;
  }

  /** Check if trading-mode.json has been reverted to manual */
  private isModeManual(): boolean {
    try {
      const modePath = join(process.cwd(), 'knowledge', 'trading-mode.json');
      const data = JSON.parse(readFileSync(modePath, 'utf-8'));
      return data.mode === 'manual';
    } catch {
      return true; // If can't read, assume manual (safe default)
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton — survives Next.js hot reloads via globalThis
// ---------------------------------------------------------------------------

const GLOBAL_KEY = '__phantomx_orchestrator__' as const;
const g = globalThis as unknown as { [GLOBAL_KEY]?: MissionOrchestrator };

export function getOrchestrator(): MissionOrchestrator {
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new MissionOrchestrator();
  }
  return g[GLOBAL_KEY];
}
