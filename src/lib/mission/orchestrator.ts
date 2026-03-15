// ============================================================================
// PhantomX — Mission Orchestrator (v2: Analyze Once, Monitor Fast)
// ============================================================================
// Three-phase architecture per symbol:
//
//   Phase 1 — DEEP ANALYSIS (once per symbol per session):
//     Full multi-TF technical analysis, regime, funding, sentiment.
//     Agent writes structured thesis + trigger conditions as JSON.
//
//   Phase 2 — MONITORING (fast lightweight loop):
//     Tiny issue: "Check triggers for BTC" with stored conditions.
//     Agent responds quickly: NO_TRIGGER or TRIGGER_HIT with details.
//     ~90% fewer issues than old "full scan every 2 min" approach.
//
//   Phase 3 — PIPELINE (only on trigger):
//     Full 5-wave debate + execution. Only when monitoring detects a hit.
//
// State machine per symbol:
//   idle → analyzing → monitoring ↔ pipeline → cooldown → monitoring
//
// The orchestrator runs server-side as a singleton with setInterval.
// Start it from LaunchPanel, stop it from the kill switch.
// ============================================================================

import { getAxonClient, resetAxonClient } from '@/lib/axon/client';
import type { AxonIssue } from '@/lib/axon/types';
import { isKillSwitchActive } from '@/lib/kill-switch';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SymbolPhase =
  | 'idle'           // Waiting to start
  | 'analyzing'      // Phase 1: deep analysis in progress (once per session)
  | 'monitoring'     // Phase 2: lightweight trigger checking (fast loop)
  | 'pipeline'       // Phase 3: 5-wave trading pipeline
  | 'cooldown';      // Brief pause after trade/rejection before re-monitoring

/** Structured trigger conditions written by agents after deep analysis */
export interface TriggerConditions {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  regime: string;
  entryTriggers: string[];   // e.g. ["price > 67500", "RSI crosses above 30"]
  invalidation: string[];    // e.g. ["price < 65000", "regime shifts to volatile"]
  keyLevels: { support: number[]; resistance: number[] };
  fundingBias: string;
  thesis: string;            // One-paragraph summary
  confidence: 'low' | 'medium' | 'high';
}

interface SymbolState {
  symbol: string;
  phase: SymbolPhase;
  activeIssueId: string | null;
  lastAnalysisAt: number;         // When deep analysis completed
  lastMonitorAt: number;          // When last monitoring check was created
  lastTradeAt: number;
  analysisCount: number;
  monitorCount: number;
  tradeCount: number;
  triggerConditions: TriggerConditions | null;  // Stored from Phase 1
  consecutiveNoTrigger: number;   // For adaptive backoff on monitoring
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
    analysisCount: number;
    monitorCount: number;
    tradeCount: number;
    hasTriggerConditions: boolean;
  }>;
  tickCount: number;
  lastTickAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICK_INTERVAL_MS = 15_000;                 // Check every 15s
const MONITORING_INTERVAL_MS = 45_000;           // Monitor checks every 45s (fast)
const POST_TRADE_COOLDOWN_MS = 120_000;          // 2 min cooldown after trade/rejection
const MAX_CONCURRENT_PIPELINES = 2;              // Don't overwhelm Axon
const MAX_CONCURRENT_ANALYSES = 2;               // Only deep-analyze a couple at a time
const MAX_CONCURRENT_MONITORS = 5;               // Monitoring is lightweight — allow more
const STALE_ISSUE_TIMEOUT_MS = 10 * 60_000;      // 10 min — cancel stale issues
const ANALYSIS_STALE_TIMEOUT_MS = 15 * 60_000;   // 15 min for deep analysis (they take longer)

const TEAM_SIZE_DESCRIPTIONS: Record<TeamSize, string> = {
  lean: 'Lean team (2 analysts). Focus on technical analysis + sentiment only.',
  standard: 'Standard team (4 analysts). Technical, sentiment, on-chain, microstructure.',
  full: 'Full team (4 analysts + deep microstructure + on-chain whale tracking). Maximum intelligence.',
};

// Agent role keywords used to match Axon agents by title/role for issue assignment.
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
        lastAnalysisAt: 0,
        lastMonitorAt: 0,
        lastTradeAt: 0,
        analysisCount: 0,
        monitorCount: 0,
        tradeCount: 0,
        triggerConditions: null,
        consecutiveNoTrigger: 0,
      });
    }

    console.log(`[orchestrator] Started v2 (Analyze Once, Monitor Fast) with ${config.selectedPairs.length} pairs — ${config.riskLevel} mode`);

    // Force-reset the Axon client to ensure it uses the current URL config
    // (globalThis cache may hold a stale instance from a previous hot reload)
    resetAxonClient();

    // Resolve agent IDs from Axon before first tick
    this.resolveAgentIds().then(() => {
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

  /**
   * Pause the orchestrator — stops the tick interval but PRESERVES all state
   * (symbol phases, trigger conditions, analysis progress). Use resume() to
   * continue from where it left off.
   */
  pause(): void {
    if (!this.running) return;
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log(`[orchestrator] Paused (preserving state for ${this.symbolStates.size} symbols)`);
  }

  /**
   * Resume the orchestrator after a pause — restarts the tick interval using
   * the existing config and preserved symbol state. Does NOT re-analyze.
   * Clears stale activeIssueIds that accumulated during pause.
   */
  resume(): void {
    if (this.running || !this.config) return;
    this.running = true;

    // Clear stale active issues that sat unprocessed during pause.
    // The agents may have finished or timed out while we weren't ticking.
    // Clearing the IDs lets the next tick re-evaluate from current phase.
    for (const state of this.symbolStates.values()) {
      if (state.activeIssueId) {
        console.log(`[orchestrator] Clearing stale issue ${state.activeIssueId} for ${state.symbol} (was paused)`);
        state.activeIssueId = null;
      }
    }

    console.log(`[orchestrator] Resumed — continuing with ${this.symbolStates.size} symbols`);
    this.tick().catch(console.error);
    this.intervalId = setInterval(() => this.tick().catch(console.error), TICK_INTERVAL_MS);
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return !this.running && this.config !== null && this.symbolStates.size > 0;
  }

  getStatus(): OrchestratorStatus {
    const symbols: OrchestratorStatus['symbols'] = {};
    for (const [sym, state] of this.symbolStates) {
      symbols[sym] = {
        phase: state.phase,
        activeIssueId: state.activeIssueId,
        analysisCount: state.analysisCount,
        monitorCount: state.monitorCount,
        tradeCount: state.tradeCount,
        hasTriggerConditions: state.triggerConditions !== null,
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

    // Safety: check if kill switch was activated
    if (isKillSwitchActive()) {
      console.log('[orchestrator] Kill switch active — stopping');
      this.stop();
      return;
    }

    const axon = getAxonClient();

    // Count active phases to respect concurrency limits
    let activeAnalyses = 0;
    let activeMonitors = 0;
    let activePipelines = 0;
    for (const state of this.symbolStates.values()) {
      if (state.phase === 'analyzing') activeAnalyses++;
      if (state.phase === 'monitoring' && state.activeIssueId) activeMonitors++;
      if (state.phase === 'pipeline') activePipelines++;
    }

    for (const [symbol, state] of this.symbolStates) {
      try {
        switch (state.phase) {
          // ---------------------------------------------------------------
          // IDLE → start deep analysis (Phase 1)
          // ---------------------------------------------------------------
          case 'idle': {
            if (activeAnalyses >= MAX_CONCURRENT_ANALYSES) break;
            await this.createDeepAnalysisIssue(symbol, state);
            if (state.activeIssueId) activeAnalyses++;
            break;
          }

          // ---------------------------------------------------------------
          // ANALYZING — deep analysis in progress (Phase 1)
          // ---------------------------------------------------------------
          case 'analyzing': {
            if (!state.activeIssueId) {
              state.phase = 'idle';
              break;
            }
            const issue = await this.fetchIssue(state.activeIssueId);
            if (!issue) {
              state.activeIssueId = null;
              state.phase = 'idle';
              break;
            }

            if (issue.status === 'done' || issue.status === 'cancelled') {
              // Analysis done — extract trigger conditions from comments.
              // IMPORTANT: Capture issueId and do all state mutations atomically
              // to prevent orphaned state if extractTriggerConditions throws.
              const issueId = state.activeIssueId;
              let triggers: TriggerConditions | null = null;
              try {
                triggers = await this.extractTriggerConditions(issueId);
              } catch (extractErr) {
                console.warn(`[orchestrator] ${symbol} trigger extraction failed:`, extractErr);
              }

              // Atomic state transition — all mutations together
              state.activeIssueId = null;
              state.lastAnalysisAt = now;
              state.analysisCount++;
              state.triggerConditions = triggers;
              state.phase = 'monitoring';

              if (triggers) {
                console.log(`[orchestrator] ${symbol} analysis complete → monitoring (${triggers.direction}, ${triggers.confidence} confidence)`);
              } else {
                console.log(`[orchestrator] ${symbol} analysis complete → monitoring (no structured triggers)`);
              }
            } else if (this.isStale(issue, now, ANALYSIS_STALE_TIMEOUT_MS)) {
              await axon.updateIssue(state.activeIssueId, { status: 'cancelled' });
              state.activeIssueId = null;
              state.phase = 'idle';
              console.warn(`[orchestrator] ${symbol} analysis stale — cancelled, will retry`);
            }
            break;
          }

          // ---------------------------------------------------------------
          // MONITORING — lightweight trigger checks (Phase 2)
          // ---------------------------------------------------------------
          case 'monitoring': {
            // If we have an active monitoring issue, check its status
            if (state.activeIssueId) {
              const issue = await this.fetchIssue(state.activeIssueId);
              if (!issue) {
                state.activeIssueId = null;
                break;
              }

              if (issue.status === 'done' || issue.status === 'cancelled') {
                // Check if a trigger fired
                const triggerHit = await this.checkMonitoringResult(state.activeIssueId);
                state.activeIssueId = null;
                state.monitorCount++;

                if (triggerHit && activePipelines < MAX_CONCURRENT_PIPELINES) {
                  state.consecutiveNoTrigger = 0;
                  await this.createTradingIssue(symbol, state);
                  activePipelines++;
                } else {
                  state.consecutiveNoTrigger++;
                }
              } else if (this.isStale(issue, now, STALE_ISSUE_TIMEOUT_MS)) {
                await axon.updateIssue(state.activeIssueId, { status: 'cancelled' });
                state.activeIssueId = null;
              }
              break;
            }

            // No active monitoring issue — create one if cooldown elapsed
            if (activeMonitors >= MAX_CONCURRENT_MONITORS) break;

            const timeSinceLastMonitor = now - state.lastMonitorAt;
            // Adaptive backoff: extend interval for consecutive no-triggers
            const backoff = Math.min(state.consecutiveNoTrigger, 5);
            const baseIntervalMs = (this.config?.scanIntervalSec ?? 45) * 1000;
            const effectiveInterval = baseIntervalMs * (1 + backoff * 0.5);

            if (timeSinceLastMonitor >= effectiveInterval) {
              await this.createMonitoringIssue(symbol, state);
              activeMonitors++;
            }
            break;
          }

          // ---------------------------------------------------------------
          // PIPELINE — 5-wave trading pipeline (Phase 3)
          // ---------------------------------------------------------------
          case 'pipeline': {
            if (!state.activeIssueId) {
              state.phase = 'monitoring';
              break;
            }
            const pipelineResult = await axon.getPipelineStatus(state.activeIssueId);
            if (!pipelineResult.ok) {
              // getPipelineStatus can fail for network reasons — check the issue directly
              const issue = await this.fetchIssue(state.activeIssueId);
              if (!issue) {
                // Issue doesn't exist at all — orphaned, return to monitoring
                state.activeIssueId = null;
                state.phase = 'monitoring';
                console.warn(`[orchestrator] ${symbol} pipeline issue vanished — returning to monitoring`);
              } else if (issue.status === 'done') {
                state.tradeCount++;
                state.activeIssueId = null;
                state.phase = 'cooldown';
                state.lastTradeAt = now;
              } else if (issue.status === 'cancelled') {
                state.activeIssueId = null;
                state.phase = 'cooldown';
                state.lastTradeAt = now;
              }
              // else: issue is still in_progress — keep waiting (don't assume done)
              break;
            }

            const pipeline = pipelineResult.data;

            if (pipeline.status === 'done') {
              state.tradeCount++;
              state.activeIssueId = null;
              state.phase = 'cooldown';
              state.lastTradeAt = now;
            } else if (pipeline.status === 'cancelled' || pipeline.status === 'blocked') {
              state.activeIssueId = null;
              state.phase = 'cooldown';
              state.lastTradeAt = now;
            } else {
              const pipelineIssue = await this.fetchIssue(state.activeIssueId);
              if (pipelineIssue && this.isStale(pipelineIssue, now, STALE_ISSUE_TIMEOUT_MS)) {
                await axon.updateIssue(state.activeIssueId, { status: 'cancelled' });
                state.activeIssueId = null;
                state.phase = 'cooldown';
                state.lastTradeAt = now;
              }
            }
            break;
          }

          // ---------------------------------------------------------------
          // COOLDOWN → return to monitoring (not idle!)
          // ---------------------------------------------------------------
          case 'cooldown': {
            if (now - state.lastTradeAt >= POST_TRADE_COOLDOWN_MS) {
              // Return to monitoring, not idle — we already have analysis
              state.phase = 'monitoring';
            }
            break;
          }
        }
      } catch (err) {
        console.error(`[orchestrator] CATCH error processing ${symbol} (phase=${state.phase}, issue=${state.activeIssueId}):`, err);
        // Clear active issue so we don't get stuck polling a broken reference,
        // but move to a safe phase depending on context:
        state.activeIssueId = null;
        if (state.phase === 'analyzing') {
          // Failed during analysis — retry from idle
          state.phase = 'idle';
        } else if (state.phase === 'pipeline') {
          // Failed during pipeline — cool down then re-monitor
          state.phase = 'cooldown';
          state.lastTradeAt = Date.now();
        }
        // monitoring/cooldown/idle: stay in current phase (safe)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Phase 1: Deep Analysis issue
  // -------------------------------------------------------------------------

  private async createDeepAnalysisIssue(symbol: string, state: SymbolState): Promise<void> {
    // Re-check kill switch before creating new work (don't wait for next tick)
    if (isKillSwitchActive()) return;
    const axon = getAxonClient();
    const base = symbol.split('/')[0];
    const config = this.config!;

    const result = await axon.createIssue({
      title: `Deep Analysis: ${base} — build thesis + triggers`,
      description: [
        `**Phase 1 — Deep Analysis** (runs ONCE per symbol per session)`,
        '',
        `Perform comprehensive multi-timeframe analysis of ${symbol} and produce a structured thesis with specific trigger conditions for monitoring.`,
        '',
        `## Instructions`,
        '',
        `### 1. Multi-Timeframe Technical Analysis`,
        `Analyze ALL timeframes using \`/api/phemex\` with \`action: "ohlcv"\`, \`limit: 100\`:`,
        `- **15m**: Immediate momentum, micro-structure, order flow`,
        `- **1h**: Short-term trend, key S/R levels, volume profile`,
        `- **4h**: Medium-term structure, EMA ribbon alignment, regime classification`,
        `- **1D**: Macro trend, daily S/R zones, volume trends`,
        '',
        `### 2. Regime Classification`,
        `Via ADX (>30 = trending, <20 = ranging, 20-30 = transitional), EMA ribbon, volatility percentile.`,
        '',
        `### 3. Funding Rate Check`,
        `\`action: "funding_rate"\` with \`symbol: "${symbol}"\` — note direction + annualized rate.`,
        '',
        `### 4. Sentiment / Catalysts`,
        `Any macro events, upcoming CPI/FOMC, Fear & Greed, on-chain flows.`,
        '',
        `## CRITICAL: Output Format`,
        '',
        `After your analysis, you MUST write a final comment containing a JSON block with trigger conditions. The monitoring agent will use these to check quickly without re-analyzing. Format:`,
        '',
        '```json',
        `{`,
        `  "direction": "LONG" | "SHORT" | "NEUTRAL",`,
        `  "regime": "trending_up | trending_down | ranging | volatile | transitional",`,
        `  "entryTriggers": ["price crosses above 67500", "RSI(14) crosses above 30", "4h EMA(8) > EMA(21)"],`,
        `  "invalidation": ["price drops below 64000", "regime shifts to volatile"],`,
        `  "keyLevels": {"support": [65000, 63500], "resistance": [68500, 71000]},`,
        `  "fundingBias": "negative (-0.03%), favors longs",`,
        `  "thesis": "One paragraph explaining the edge and timing.",`,
        `  "confidence": "low" | "medium" | "high"`,
        `}`,
        '```',
        '',
        `If you find NO viable setup, still output the JSON with direction: "NEUTRAL" and confidence: "low", with entryTriggers describing what would NEED to change for an opportunity.`,
        '',
        `**Risk Level**: ${config.riskLevel}`,
        `**Team**: ${TEAM_SIZE_DESCRIPTIONS[config.teamSize ?? 'standard']}`,
        config.profitGoal ? `**Profit Goal**: $${config.profitGoal}` : '',
      ].filter(Boolean).join('\n'),
      // Use 'operational' so Axon doesn't run the 5-wave trading executor.
      // We just want the agent to analyze and post trigger JSON, then mark done.
      issue_type: 'operational',
      priority: 'medium',
      ...(this.scanAgentId ? { assigned_agent_id: this.scanAgentId } : {}),
    });

    if (result.ok) {
      state.phase = 'analyzing';
      state.activeIssueId = result.data.id;
      console.log(`[orchestrator] Created deep analysis for ${base}: ${result.data.id}`);
      if (this.scanAgentId) {
        axon.wakeupAgent(this.scanAgentId).catch(() => {});
      }
    } else {
      console.error(`[orchestrator] FAILED to create analysis for ${base}:`, (result as { error: string }).error);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 2: Lightweight Monitoring issue
  // -------------------------------------------------------------------------

  private async createMonitoringIssue(symbol: string, state: SymbolState): Promise<void> {
    // Re-check kill switch before creating new work (don't wait for next tick)
    if (isKillSwitchActive()) return;
    const axon = getAxonClient();
    const base = symbol.split('/')[0];
    const triggers = state.triggerConditions;

    // Build a concise monitoring prompt
    const triggerBlock = triggers
      ? [
          `**Stored Analysis**: Direction=${triggers.direction}, Confidence=${triggers.confidence}`,
          `**Thesis**: ${triggers.thesis}`,
          `**Entry Triggers**: ${triggers.entryTriggers.join(' | ')}`,
          `**Invalidation**: ${triggers.invalidation.join(' | ')}`,
          `**Key Levels**: Support ${triggers.keyLevels.support.join(', ')} | Resistance ${triggers.keyLevels.resistance.join(', ')}`,
          `**Funding**: ${triggers.fundingBias}`,
        ]
      : [
          `No structured triggers from initial analysis. Do a quick check:`,
          `- Current price vs recent S/R levels`,
          `- RSI(14) extremes (<30 or >70)`,
          `- Funding rate direction`,
          `- Any sudden regime change`,
        ];

    const result = await axon.createIssue({
      title: `Monitor ${base}: check triggers`,
      description: [
        `**Phase 2 — Quick Trigger Check** (lightweight, be FAST)`,
        '',
        `Check if entry triggers have fired for ${symbol}. Do NOT redo full analysis.`,
        '',
        ...triggerBlock,
        '',
        `## Instructions`,
        `1. Fetch current price: \`/api/phemex\` with \`action: "ticker"\`, \`symbol: "${symbol}"\``,
        `2. Fetch 15m candles (last 20): \`action: "ohlcv"\`, \`timeframe: "15m"\`, \`limit: 20\``,
        `3. Compare against trigger conditions above`,
        `4. Respond with ONE of:`,
        `   - **NO_TRIGGER** — conditions not met, brief reason`,
        `   - **TRIGGER_HIT** — which trigger fired + current values`,
        '',
        `Keep response SHORT. This runs every 45-90 seconds.`,
        `Monitor check #${state.monitorCount + 1} for this symbol.`,
      ].join('\n'),
      // 'operational' — lightweight check, no 5-wave pipeline
      issue_type: 'operational',
      priority: 'low',
      ...(this.scanAgentId ? { assigned_agent_id: this.scanAgentId } : {}),
    });

    if (result.ok) {
      state.activeIssueId = result.data.id;
      state.lastMonitorAt = Date.now();
      console.log(`[orchestrator] Monitor #${state.monitorCount + 1} for ${base}: ${result.data.id}`);
      if (this.scanAgentId) {
        axon.wakeupAgent(this.scanAgentId).catch(() => {});
      }
    } else {
      // Backoff: set lastMonitorAt to prevent immediate retry spam on Axon failure
      state.lastMonitorAt = Date.now();
      console.error(`[orchestrator] Failed to create monitor for ${base} (will retry after interval):`, result.error);
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: Trading Pipeline issue
  // -------------------------------------------------------------------------

  private async createTradingIssue(symbol: string, state: SymbolState): Promise<void> {
    // Re-check kill switch before creating trading work (most critical check)
    if (isKillSwitchActive()) return;
    const axon = getAxonClient();
    const base = symbol.split('/')[0];
    const config = this.config!;
    const triggers = state.triggerConditions;

    const result = await axon.createIssue({
      title: `Trade ${base}/USDT — ${config.riskLevel} mode`,
      description: [
        `**Phase 3 — Trading Pipeline** — trigger fired from monitoring.`,
        '',
        triggers ? `**Pre-analyzed thesis**: ${triggers.thesis}` : '',
        triggers ? `**Direction**: ${triggers.direction} | **Confidence**: ${triggers.confidence}` : '',
        '',
        `Run the full 5-wave pipeline for ${symbol}:`,
        `1. **Research**: Verify the thesis is still valid. Quick re-check of 4h + 1D structure.`,
        `   Use \`/api/phemex\` with \`action: "ohlcv"\`, \`limit: 100\``,
        `   Check funding: \`action: "funding_rate"\`, \`symbol: "${symbol}"\``,
        `2. **Debate**: Bull vs bear case, Head of Research ruling`,
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
      console.log(`[orchestrator] TRIGGER HIT — created pipeline for ${base}: ${result.data.id}`);
      if (this.pipelineAgentId) {
        axon.wakeupAgent(this.pipelineAgentId).catch(() => {});
      }
    } else {
      // Don't go to cooldown on creation failure — no trade happened.
      // Return to monitoring so the trigger can be re-evaluated next cycle.
      console.error(`[orchestrator] Failed to create pipeline for ${base} — returning to monitoring:`, result.error);
      state.phase = 'monitoring';
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
      console.warn('[orchestrator] Failed to resolve agent IDs:', (result as { error: string }).error);
      return;
    }

    const agents = result.data;

    for (const keyword of SCAN_AGENT_KEYWORDS) {
      const match = agents.find(
        (a) => (a.title ?? '').toLowerCase().includes(keyword) || (a.role ?? '').toLowerCase().includes(keyword),
      );
      if (match) { this.scanAgentId = match.id; break; }
    }

    for (const keyword of PIPELINE_AGENT_KEYWORDS) {
      const match = agents.find(
        (a) => (a.title ?? '').toLowerCase().includes(keyword) || (a.role ?? '').toLowerCase().includes(keyword),
      );
      if (match) { this.pipelineAgentId = match.id; break; }
    }

    console.log(`[orchestrator] Agents: scan=${this.scanAgentId ? 'OK' : 'MISSING'} pipeline=${this.pipelineAgentId ? 'OK' : 'MISSING'}`);
  }

  /** Extract structured trigger conditions from deep analysis issue comments */
  private async extractTriggerConditions(issueId: string): Promise<TriggerConditions | null> {
    const axon = getAxonClient();
    const comments = await axon.getIssueComments(issueId);
    if (!comments.ok) return null;

    // Look through comments (reverse — most recent first) for JSON trigger block
    for (const comment of [...comments.data].reverse()) {
      const jsonMatch = comment.content.match(/```json\s*([\s\S]*?)```/);
      if (!jsonMatch) continue;

      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        // Validate minimum required fields
        if (parsed.direction && parsed.entryTriggers && Array.isArray(parsed.entryTriggers)) {
          return {
            direction: parsed.direction,
            regime: parsed.regime ?? 'unknown',
            entryTriggers: parsed.entryTriggers,
            invalidation: parsed.invalidation ?? [],
            keyLevels: parsed.keyLevels ?? { support: [], resistance: [] },
            fundingBias: parsed.fundingBias ?? 'unknown',
            thesis: parsed.thesis ?? '',
            confidence: parsed.confidence ?? 'low',
          };
        }
      } catch {
        // Not valid JSON — keep looking
      }
    }

    return null;
  }

  /** Check monitoring issue result for trigger hit */
  private async checkMonitoringResult(issueId: string): Promise<boolean> {
    const axon = getAxonClient();
    const comments = await axon.getIssueComments(issueId);
    if (!comments.ok) return false;

    const allText = comments.data.map(c => c.content).join('\n').toUpperCase();

    // Explicit trigger hit
    if (allText.includes('TRIGGER_HIT') || allText.includes('TRIGGER HIT')) {
      return true;
    }

    // Explicit no trigger
    if (allText.includes('NO_TRIGGER') || allText.includes('NO TRIGGER') || allText.includes('NO_HIT')) {
      return false;
    }

    // Fallback heuristics (less reliable)
    const positivePatterns = ['ENTRY SIGNAL', 'EXECUTE NOW', 'TRIGGER FIRED', 'CONDITIONS MET'];
    const negativePatterns = ['NO ENTRY', 'NOT MET', 'CONDITIONS NOT', 'WAIT', 'NO SETUP'];

    const hasNegative = negativePatterns.some(p => allText.includes(p));
    if (hasNegative) return false;

    const hasPositive = positivePatterns.some(p => allText.includes(p));
    return hasPositive;
  }

  /** Fetch an issue, returning null if it doesn't exist */
  private async fetchIssue(issueId: string): Promise<AxonIssue | null> {
    const axon = getAxonClient();
    const result = await axon.getIssue(issueId);
    return result.ok ? result.data : null;
  }

  /** Check if an issue has been stale (unchanged) for too long */
  private isStale(issue: AxonIssue, now: number, timeout = STALE_ISSUE_TIMEOUT_MS): boolean {
    const updatedAt = new Date(issue.updated_at ?? issue.created_at).getTime();
    return (now - updatedAt) > timeout;
  }

  /** Check if trading-mode.json has been reverted to manual */
  private isModeManual(): boolean {
    try {
      const modePath = join(process.cwd(), 'knowledge', 'trading-mode.json');
      const data = JSON.parse(readFileSync(modePath, 'utf-8'));
      return data.mode === 'manual';
    } catch (err) {
      // Log the error so it's visible — silent stops are hard to debug
      console.error('[orchestrator] Failed to read trading-mode.json — defaulting to manual (safe stop):', err);
      return true;
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
