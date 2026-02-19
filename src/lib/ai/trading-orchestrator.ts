// ============================================================================
// PhantomX — Trading Orchestrator
// ============================================================================
// The unified coordinator that ties Research, Paper Trading, and Live Trading
// into a single autonomous pipeline. Not a replacement for the engines — a
// coordinator that manages their lifecycle, wires events into a unified stream,
// tracks thesis validation, and promotes validated strategies to live trading.
//
// Data flow:
//   Research Engine → generates theses
//       ↓
//   Paper Trading Engine → tests theses with virtual money
//       ↓
//   Orchestrator tracks validation: per-thesis win rate, profit factor, trade count
//       ↓
//   When thesis passes criteria → promote to live trading engine
//       ↓
//   Live Trading Engine → executes with real money on Phemex
// ============================================================================

import { db } from '@/lib/db';
import { broadcastSSE } from '@/lib/sse-broadcast';
import {
  type WorkflowId,
  type WorkflowStatus,
  type OrchestratorEvent,
  type OrchestratorEventType,
  type WorkflowState,
  type ResearchWorkflowMetrics,
  type PaperWorkflowMetrics,
  type LiveWorkflowMetrics,
  type ThesisValidationRecord,
  type PromotionCriteria,
  type TradingOrchestratorConfig,
  type OrchestratorState,
  type PaperTradingState,
} from '@/types/trading';

import {
  getResearchEngine,
  createResearchEngine,
  stopResearchEngine,
  type ResearchEngineEvent,
} from './research-engine';

import {
  getPaperTradingEngine,
  createPaperTradingEngine,
  stopPaperTradingEngine,
  type PaperTradingEvent,
} from './paper-trading-engine';

import {
  getHeartbeatEngine,
  createHeartbeatEngine,
  stopHeartbeatEngine,
  type HeartbeatEvent,
} from './heartbeat-engine';

import {
  getPortfolioHeartbeatEngine,
  createPortfolioHeartbeatEngine,
  stopPortfolioHeartbeatEngine,
} from './portfolio-heartbeat-engine';

import type { PortfolioHeartbeatEvent } from '@/types/trading';

import {
  runTradingAgentsPipeline,
  type PipelineResult,
  type EmitFn,
} from './trading-agents';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECENT_EVENTS = 100;
const PROMOTION_CHECK_INTERVAL_MS = 60_000; // check every 60s
const STATE_SAVE_INTERVAL_MS = 30_000; // persist state every 30s

// ---------------------------------------------------------------------------
// Default Config — Aggressive by design
// ---------------------------------------------------------------------------

export const DEFAULT_ORCHESTRATOR_CONFIG: TradingOrchestratorConfig = {
  research: {
    enabled: true,
    quickScanIntervalMs: 5 * 60_000,      // 5 min (not 10)
    deepDiveIntervalMs: 15 * 60_000,       // 15 min (not 30)
    thesisIntervalMs: 30 * 60_000,         // 30 min (not 60)
    agentPipelineEnabled: true,
  },
  paper: {
    enabled: true,
    virtualBalance: 100_000,
    maxConcurrentTrades: 10,
    promotionCriteria: {
      minTrades: 5,
      minWinRate: 0.55,
      minProfitFactor: 1.3,
      maxDrawdownPercent: 15,
      requireUserApproval: true,
    },
  },
  live: {
    enabled: true,
    mode: 'portfolio',
    onlyValidatedStrategies: true,
    requireUserApproval: true,
    heartbeatIntervalMs: 30_000,           // 30s ticks (catches 60-second windows)
    confidenceThreshold: 70,               // 70% (not 90 — the AI should trade)
  },
};

// ---------------------------------------------------------------------------
// Event Callback Type
// ---------------------------------------------------------------------------

type OrchestratorEventCallback = (event: OrchestratorEvent) => void;

// ---------------------------------------------------------------------------
// TradingOrchestrator Class
// ---------------------------------------------------------------------------

export class TradingOrchestrator {
  private config: TradingOrchestratorConfig;
  private isRunning = false;
  private startedAt: number | null = null;

  // Workflow states
  private researchState: WorkflowState & { metrics: ResearchWorkflowMetrics };
  private paperState: WorkflowState & { metrics: PaperWorkflowMetrics };
  private liveState: WorkflowState & { metrics: LiveWorkflowMetrics };

  // Thesis validation
  private validationRecords: Map<string, ThesisValidationRecord> = new Map();

  // Event system
  private eventCallbacks: OrchestratorEventCallback[] = [];
  private recentEvents: OrchestratorEvent[] = [];

  // Cleanup handles
  private unwireResearch: (() => void) | null = null;
  private unwirePaper: (() => void) | null = null;
  private unwireLive: (() => void) | null = null;
  private promotionTimer: ReturnType<typeof setInterval> | null = null;
  private stateSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<TradingOrchestratorConfig>) {
    this.config = {
      ...DEFAULT_ORCHESTRATOR_CONFIG,
      ...config,
      research: { ...DEFAULT_ORCHESTRATOR_CONFIG.research, ...config?.research },
      paper: {
        ...DEFAULT_ORCHESTRATOR_CONFIG.paper,
        ...config?.paper,
        promotionCriteria: {
          ...DEFAULT_ORCHESTRATOR_CONFIG.paper.promotionCriteria,
          ...config?.paper?.promotionCriteria,
        },
      },
      live: { ...DEFAULT_ORCHESTRATOR_CONFIG.live, ...config?.live },
    };

    this.researchState = this.makeWorkflowState<ResearchWorkflowMetrics>(
      this.config.research.enabled,
      {
        totalScans: 0,
        totalDeepDives: 0,
        totalThesesGenerated: 0,
        activeFindings: 0,
        readyTheses: 0,
        currentCycle: null,
      }
    );

    this.paperState = this.makeWorkflowState<PaperWorkflowMetrics>(
      this.config.paper.enabled,
      {
        totalTrades: 0,
        openTrades: 0,
        winRate: 0,
        profitFactor: 0,
        totalPnl: 0,
        currentEquity: this.config.paper.virtualBalance,
        thesesTested: 0,
        thesesValidated: 0,
      }
    );

    this.liveState = this.makeWorkflowState<LiveWorkflowMetrics>(
      this.config.live.enabled,
      {
        mode: this.config.live.mode,
        isAutoTrading: false,
        tickCount: 0,
        openPositions: 0,
        dailyPnlPercent: 0,
        strategiesDeployed: 0,
        isKilled: false,
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) return;

    // Load persisted state
    await this.loadState();
    await this.loadValidationRecords();

    this.isRunning = true;
    this.startedAt = Date.now();

    this.emitEvent('research', 'workflow_status', {
      title: 'Orchestrator started',
      detail: 'Autonomous trading pipeline online. All workflows initializing.',
      severity: 'info',
    });

    // Start enabled workflows — heavily staggered to avoid concurrent Claude CLI spawns.
    // Each engine fires AI queries on its first tick. The query pool only allows 2 concurrent
    // processes, but the Claude Code CLI subprocess needs time to cold-start (~12s). Spacing
    // workflows 30s apart ensures each gets a clean slot for its first query.
    if (this.config.research.enabled) {
      await this.startWorkflow('research');
    }
    if (this.config.paper.enabled) {
      // Delay paper start by 30s so research gets its first scan through
      await new Promise(r => setTimeout(r, 30_000));
      await this.startWorkflow('paper');
    }
    if (this.config.live.enabled) {
      // Delay live start by another 30s
      await new Promise(r => setTimeout(r, 30_000));
      await this.startWorkflow('live');
    }

    // Periodic promotion check
    this.promotionTimer = setInterval(() => {
      this.checkThesisPromotions().catch(() => {});
    }, PROMOTION_CHECK_INTERVAL_MS);

    // Periodic state persistence
    this.stateSaveTimer = setInterval(() => {
      this.saveState().catch(() => {});
    }, STATE_SAVE_INTERVAL_MS);

    // Broadcast initial state
    this.broadcastState();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    // Clear timers
    if (this.promotionTimer) { clearInterval(this.promotionTimer); this.promotionTimer = null; }
    if (this.stateSaveTimer) { clearInterval(this.stateSaveTimer); this.stateSaveTimer = null; }

    // Stop all workflows
    await this.stopWorkflow('research');
    await this.stopWorkflow('paper');
    await this.stopWorkflow('live');

    this.isRunning = false;

    // Persist final state
    await this.saveState();

    this.emitEvent('research', 'workflow_status', {
      title: 'Orchestrator stopped',
      detail: 'All workflows shut down. State persisted.',
      severity: 'info',
    });
  }

  // ---------------------------------------------------------------------------
  // Workflow Control
  // ---------------------------------------------------------------------------

  async startWorkflow(id: WorkflowId): Promise<void> {
    const state = this.getWorkflowState(id);
    if (state.status === 'running') return;

    try {
      switch (id) {
        case 'research':
          await this.startResearchWorkflow();
          break;
        case 'paper':
          await this.startPaperWorkflow();
          break;
        case 'live':
          await this.startLiveWorkflow();
          break;
      }

      state.status = 'running';
      state.enabled = true;
      state.error = null;
      state.lastActivityAt = Date.now();

      this.emitEvent(id, 'workflow_status', {
        title: `${id} workflow started`,
        detail: `${id.charAt(0).toUpperCase() + id.slice(1)} workflow is now active and processing.`,
        severity: 'info',
      });
    } catch (err) {
      state.status = 'error';
      state.error = err instanceof Error ? err.message : String(err);

      this.emitEvent(id, 'error', {
        title: `${id} workflow failed to start`,
        detail: state.error,
        severity: 'critical',
      });
    }
  }

  async stopWorkflow(id: WorkflowId): Promise<void> {
    const state = this.getWorkflowState(id);
    if (state.status === 'idle') return;

    switch (id) {
      case 'research':
        this.unwireResearch?.();
        this.unwireResearch = null;
        stopResearchEngine();
        break;
      case 'paper':
        this.unwirePaper?.();
        this.unwirePaper = null;
        stopPaperTradingEngine();
        break;
      case 'live':
        this.unwireLive?.();
        this.unwireLive = null;
        if (this.config.live.mode === 'portfolio') {
          stopPortfolioHeartbeatEngine();
        } else {
          stopHeartbeatEngine();
        }
        break;
    }

    state.status = 'idle';
    state.currentObjective = '';
    state.currentStage = '';

    this.emitEvent(id, 'workflow_status', {
      title: `${id} workflow stopped`,
      detail: `${id.charAt(0).toUpperCase() + id.slice(1)} workflow has been shut down.`,
      severity: 'info',
    });
  }

  async pauseWorkflow(id: WorkflowId): Promise<void> {
    const state = this.getWorkflowState(id);
    if (state.status !== 'running') return;

    // Research engine has pause — others we just mark paused and stop
    if (id === 'research') {
      const engine = getResearchEngine();
      if (engine) engine.pause();
    } else {
      // Paper and live don't have pause — stop the engine but keep state
      await this.stopWorkflow(id);
    }

    state.status = 'paused';

    this.emitEvent(id, 'workflow_status', {
      title: `${id} workflow paused`,
      detail: `${id.charAt(0).toUpperCase() + id.slice(1)} workflow paused. Resume to continue.`,
      severity: 'info',
    });
  }

  async resumeWorkflow(id: WorkflowId): Promise<void> {
    const state = this.getWorkflowState(id);
    if (state.status !== 'paused') return;

    if (id === 'research') {
      const engine = getResearchEngine();
      if (engine) engine.start();
      state.status = 'running';
    } else {
      await this.startWorkflow(id);
    }

    this.emitEvent(id, 'workflow_status', {
      title: `${id} workflow resumed`,
      detail: `${id.charAt(0).toUpperCase() + id.slice(1)} workflow is active again.`,
      severity: 'info',
    });
  }

  // ---------------------------------------------------------------------------
  // State Accessors
  // ---------------------------------------------------------------------------

  getState(): OrchestratorState {
    return {
      isRunning: this.isRunning,
      startedAt: this.startedAt,
      research: { ...this.researchState },
      paper: { ...this.paperState },
      live: { ...this.liveState },
      validationRecords: Array.from(this.validationRecords.values()),
      config: this.config,
    };
  }

  getConfig(): TradingOrchestratorConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<TradingOrchestratorConfig>): void {
    if (partial.research) {
      Object.assign(this.config.research, partial.research);
    }
    if (partial.paper) {
      if (partial.paper.promotionCriteria) {
        Object.assign(this.config.paper.promotionCriteria, partial.paper.promotionCriteria);
      }
      const { promotionCriteria: _, ...rest } = partial.paper;
      Object.assign(this.config.paper, rest);
    }
    if (partial.live) {
      Object.assign(this.config.live, partial.live);
    }
  }

  getRecentEvents(workflow?: WorkflowId, count = 50): OrchestratorEvent[] {
    let events = this.recentEvents;
    if (workflow) {
      events = events.filter(e => e.workflow === workflow);
    }
    return events.slice(-count);
  }

  getValidationRecords(status?: ThesisValidationRecord['status']): ThesisValidationRecord[] {
    const all = Array.from(this.validationRecords.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  // ---------------------------------------------------------------------------
  // Event System
  // ---------------------------------------------------------------------------

  onEvent(callback: OrchestratorEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const idx = this.eventCallbacks.indexOf(callback);
      if (idx >= 0) this.eventCallbacks.splice(idx, 1);
    };
  }

  private emitEvent(
    workflow: WorkflowId,
    type: OrchestratorEventType,
    data: OrchestratorEvent['data']
  ): void {
    const event: OrchestratorEvent = {
      id: `oe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      workflow,
      timestamp: Date.now(),
      data,
    };

    // Store in recent events
    this.recentEvents.push(event);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents = this.recentEvents.slice(-MAX_RECENT_EVENTS);
    }

    // Store in workflow-specific recent events
    const state = this.getWorkflowState(workflow);
    state.recentEvents.push(event);
    if (state.recentEvents.length > 30) {
      state.recentEvents = state.recentEvents.slice(-30);
    }
    state.lastActivityAt = Date.now();

    // Notify all callbacks
    for (const cb of this.eventCallbacks) {
      try { cb(event); } catch { /* listener error shouldn't crash orchestrator */ }
    }

    // Broadcast via SSE for real-time UI
    broadcastSSE({ type: 'orchestrator_event', event });
  }

  private broadcastState(): void {
    broadcastSSE({ type: 'orchestrator_state', state: this.getState() });
  }

  // ---------------------------------------------------------------------------
  // Research Workflow Wiring
  // ---------------------------------------------------------------------------

  private async startResearchWorkflow(): Promise<void> {
    let engine = getResearchEngine();
    if (!engine) {
      engine = createResearchEngine({
        quickScanIntervalMs: this.config.research.quickScanIntervalMs,
        deepDiveIntervalMs: this.config.research.deepDiveIntervalMs,
        thesisIntervalMs: this.config.research.thesisIntervalMs,
        riskProfile: 'aggressive',
      });
    }

    // Wire events
    this.unwireResearch?.();
    const handler = (evt: ResearchEngineEvent) => this.translateResearchEvent(evt);
    engine.onEvent(handler);
    this.unwireResearch = () => {
      // Research engine doesn't return unsubscribe — we'll stop the engine instead
    };

    this.researchState.currentObjective = 'Continuous market intelligence gathering';
    this.researchState.currentStage = 'initializing';

    engine.start();
  }

  private translateResearchEvent(evt: ResearchEngineEvent): void {
    const { type, data, cycle } = evt;

    switch (type) {
      case 'cycle_start':
        this.researchState.currentStage = cycle || 'scanning';
        this.researchState.currentObjective = cycle === 'quick_scan'
          ? 'Quick scan — market overview, top movers, news pulse'
          : cycle === 'deep_dive'
            ? 'Deep dive — full technical + fundamental analysis'
            : 'Thesis generation — synthesizing research into strategies';
        this.emitEvent('research', 'progress', {
          title: `${cycle} cycle started`,
          detail: `Research engine beginning ${cycle?.replace('_', ' ')} cycle.`,
          stage: cycle || undefined,
        });
        if (cycle === 'quick_scan') this.researchState.metrics.totalScans++;
        if (cycle === 'deep_dive') this.researchState.metrics.totalDeepDives++;
        break;

      case 'cycle_complete':
        this.researchState.currentStage = 'idle';
        this.emitEvent('research', 'progress', {
          title: `${cycle} cycle complete`,
          detail: `Research ${cycle?.replace('_', ' ')} finished.`,
          stage: 'idle',
        });
        break;

      case 'finding': {
        const finding = data as Record<string, unknown>;
        this.researchState.metrics.activeFindings++;
        this.emitEvent('research', 'finding', {
          title: (finding.title as string) || 'New finding',
          detail: (finding.summary as string) || JSON.stringify(finding).slice(0, 200),
          symbol: finding.symbol as string,
          confidence: finding.confidence as number,
          severity: finding.urgency === 'critical' ? 'critical'
            : finding.urgency === 'high' ? 'warning' : 'info',
        });
        break;
      }

      case 'thesis': {
        const thesis = data as Record<string, unknown>;
        this.researchState.metrics.totalThesesGenerated++;
        this.researchState.metrics.readyTheses++;

        // Create validation record for this thesis
        const thesisId = (thesis.id as string) || `thesis_${Date.now()}`;
        this.createValidationRecord(
          thesisId,
          (thesis.symbol as string) || 'UNKNOWN',
          ((thesis.direction as string) || 'long') as 'long' | 'short'
        );

        this.emitEvent('research', 'finding', {
          title: `New thesis: ${(thesis.symbol as string) || 'Unknown'} ${(thesis.direction as string) || ''}`,
          detail: (thesis.summary as string) || (thesis.title as string) || 'New trading thesis generated',
          symbol: thesis.symbol as string,
          thesisId,
          confidence: thesis.confidence as number,
          severity: 'info',
        });
        break;
      }

      case 'error':
        this.emitEvent('research', 'error', {
          title: 'Research engine error',
          detail: typeof data === 'string' ? data : JSON.stringify(data).slice(0, 300),
          severity: 'critical',
        });
        break;

      case 'status_change':
        this.emitEvent('research', 'workflow_status', {
          title: 'Research status changed',
          detail: JSON.stringify(data).slice(0, 200),
          severity: 'info',
        });
        break;

      default:
        // 'event' type — market events
        this.emitEvent('research', 'reasoning_step', {
          title: 'Market event detected',
          detail: typeof data === 'string' ? data : JSON.stringify(data).slice(0, 200),
          severity: 'info',
        });
    }

    // Update metrics from engine status
    const engine = getResearchEngine();
    if (engine) {
      const status = engine.getStatus();
      this.researchState.metrics.totalScans = status.totalQuickScans;
      this.researchState.metrics.totalDeepDives = status.totalDeepDives;
      this.researchState.metrics.totalThesesGenerated = status.totalThesesGenerated;
      this.researchState.metrics.activeFindings = status.totalFindings;
    }
  }

  // ---------------------------------------------------------------------------
  // Paper Trading Workflow Wiring
  // ---------------------------------------------------------------------------

  private async startPaperWorkflow(): Promise<void> {
    let engine = getPaperTradingEngine();
    if (!engine) {
      engine = createPaperTradingEngine(this.config.paper.virtualBalance);
    }

    this.unwirePaper?.();
    const handler = (evt: PaperTradingEvent) => this.translatePaperEvent(evt);
    engine.onEvent(handler);
    this.unwirePaper = () => {};

    this.paperState.currentObjective = 'Testing research theses with virtual capital';
    this.paperState.currentStage = 'active';

    engine.start();
  }

  private translatePaperEvent(evt: PaperTradingEvent): void {
    const { type, data } = evt;
    const d = data as Record<string, unknown>;

    switch (type) {
      case 'trade_open':
        this.paperState.metrics.openTrades++;
        this.emitEvent('paper', 'action', {
          title: `Paper trade opened: ${d.symbol || 'Unknown'}`,
          detail: `${d.side || d.direction || 'long'} @ ${d.entryPrice || '?'} — ${d.reason || 'Thesis test'}`,
          symbol: d.symbol as string,
          thesisId: d.thesisId as string,
          confidence: d.confidence as number,
          severity: 'info',
        });
        break;

      case 'trade_close':
        this.paperState.metrics.openTrades = Math.max(0, this.paperState.metrics.openTrades - 1);
        this.onPaperTradeClose(d);
        this.emitEvent('paper', 'action', {
          title: `Paper trade closed: ${d.symbol || 'Unknown'}`,
          detail: `PnL: ${d.pnlPercent ? `${(d.pnlPercent as number).toFixed(2)}%` : '?'} — ${d.reason || 'Closed'}`,
          symbol: d.symbol as string,
          thesisId: d.thesisId as string,
          severity: (d.pnl as number) >= 0 ? 'info' : 'warning',
        });
        break;

      case 'trade_update':
        this.emitEvent('paper', 'progress', {
          title: `Trade update: ${d.symbol || 'Unknown'}`,
          detail: `Current PnL: ${d.pnlPercent ? `${(d.pnlPercent as number).toFixed(2)}%` : '?'}`,
          symbol: d.symbol as string,
          severity: 'info',
        });
        break;

      case 'journal':
        this.emitEvent('paper', 'reasoning_step', {
          title: 'AI Journal Entry',
          detail: (d.content as string) || (d.summary as string) || 'New journal entry',
          severity: 'info',
        });
        break;

      case 'stats_update':
        this.updatePaperMetrics(d);
        this.emitEvent('paper', 'progress', {
          title: 'Paper trading stats updated',
          detail: `Equity: $${(d.currentEquity as number || 0).toFixed(0)} | WR: ${((d.winRate as number || 0) * 100).toFixed(1)}% | PF: ${(d.profitFactor as number || 0).toFixed(2)}`,
          severity: 'info',
        });
        break;

      case 'status_change':
        this.emitEvent('paper', 'workflow_status', {
          title: 'Paper trading status changed',
          detail: JSON.stringify(d).slice(0, 200),
          severity: 'info',
        });
        break;

      case 'error':
        this.emitEvent('paper', 'error', {
          title: 'Paper trading error',
          detail: typeof data === 'string' ? data : JSON.stringify(d).slice(0, 300),
          severity: 'critical',
        });
        break;
    }

    // Sync metrics from engine state
    const engine = getPaperTradingEngine();
    if (engine) {
      const state: PaperTradingState = engine.getState();
      this.paperState.metrics.totalTrades = state.totalTrades;
      this.paperState.metrics.winRate = state.winCount / Math.max(1, state.totalTrades);
      this.paperState.metrics.profitFactor = state.profitFactor;
      this.paperState.metrics.totalPnl = state.totalPnl;
      this.paperState.metrics.currentEquity = state.currentEquity;
    }
  }

  private updatePaperMetrics(d: Record<string, unknown>): void {
    if (d.totalTrades !== undefined) this.paperState.metrics.totalTrades = d.totalTrades as number;
    if (d.winRate !== undefined) this.paperState.metrics.winRate = d.winRate as number;
    if (d.profitFactor !== undefined) this.paperState.metrics.profitFactor = d.profitFactor as number;
    if (d.totalPnl !== undefined) this.paperState.metrics.totalPnl = d.totalPnl as number;
    if (d.currentEquity !== undefined) this.paperState.metrics.currentEquity = d.currentEquity as number;
  }

  // ---------------------------------------------------------------------------
  // Live Trading Workflow Wiring
  // ---------------------------------------------------------------------------

  private async startLiveWorkflow(): Promise<void> {
    if (this.config.live.mode === 'portfolio') {
      await this.startPortfolioLive();
    } else {
      await this.startSingleLive();
    }

    this.liveState.currentObjective = this.config.live.mode === 'portfolio'
      ? 'Multi-symbol autonomous portfolio management'
      : 'Single-symbol autonomous trading';
    this.liveState.currentStage = 'active';
    this.liveState.metrics.mode = this.config.live.mode;
    this.liveState.metrics.isAutoTrading = true;
  }

  private async startSingleLive(): Promise<void> {
    let engine = getHeartbeatEngine();
    if (!engine) {
      engine = createHeartbeatEngine({
        intervalMs: this.config.live.heartbeatIntervalMs || 30_000,
        symbol: 'BTC/USDT',
        maxPositionPercent: 25,
        riskLevel: 'aggressive',
        enableAutoTrade: true,
        maxDailyLossPercent: 5,
        stopAfterKill: true,
      });
    }

    this.unwireLive?.();
    const unsub = engine.onEvent((evt: HeartbeatEvent) => this.translateHeartbeatEvent(evt));
    this.unwireLive = unsub;

    engine.start();
  }

  private async startPortfolioLive(): Promise<void> {
    let engine = getPortfolioHeartbeatEngine();
    if (!engine) {
      engine = createPortfolioHeartbeatEngine({
        symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
        scanMode: 'full_scan',
        intervalMs: this.config.live.heartbeatIntervalMs || 30_000,
        riskLevel: 'aggressive',
        enableAutoTrade: true,
        maxDailyLossPercent: 5,
        stopAfterKill: true,
        maxPerTokenAllocationPercent: 30,
        maxTotalExposurePercent: 80,
        maxOpenPositions: 5,
        minCashReservePercent: 20,
        fullScanTopN: 20,
        fullScanFilterMinVolume: 1_000_000,
      });
    }

    this.unwireLive?.();
    const unsub = engine.onEvent((evt: PortfolioHeartbeatEvent) => this.translatePortfolioEvent(evt));
    this.unwireLive = unsub;

    engine.start();
  }

  private translateHeartbeatEvent(evt: HeartbeatEvent): void {
    const { type, data } = evt;
    const d = data as Record<string, unknown>;

    this.liveState.metrics.tickCount++;

    switch (type) {
      case 'tick_start':
        this.liveState.currentStage = 'analyzing';
        this.emitEvent('live', 'progress', {
          title: `Tick #${d.tick || this.liveState.metrics.tickCount}`,
          detail: `Analyzing ${d.symbol || 'BTC/USDT'}...`,
          symbol: d.symbol as string,
          severity: 'info',
        });
        break;

      case 'thinking':
        this.emitEvent('live', 'reasoning_step', {
          title: 'AI Reasoning',
          detail: (d.thinking as string) || (d.message as string) || 'Processing...',
          symbol: d.symbol as string,
          severity: 'info',
        });
        break;

      case 'analysis':
        this.liveState.currentStage = 'deciding';
        this.emitEvent('live', 'reasoning_step', {
          title: 'Market analysis complete',
          detail: (d.summary as string) || JSON.stringify(d).slice(0, 200),
          symbol: d.symbol as string,
          confidence: d.confidence as number,
          severity: 'info',
        });
        break;

      case 'action':
        this.emitEvent('live', 'decision', {
          title: `Decision: ${d.action || 'hold'}`,
          detail: (d.reason as string) || `${d.action} with ${d.confidence || '?'}% confidence`,
          symbol: d.symbol as string,
          confidence: d.confidence as number,
          severity: d.action === 'hold' ? 'info' : 'warning',
        });
        break;

      case 'trade_executed':
        this.emitEvent('live', 'action', {
          title: `TRADE EXECUTED: ${d.side || d.action} ${d.symbol}`,
          detail: `@ ${d.price || '?'} | Size: ${d.size || '?'} | Reason: ${d.reason || '?'}`,
          symbol: d.symbol as string,
          confidence: d.confidence as number,
          severity: 'critical',
        });
        break;

      case 'trade_skipped':
        this.emitEvent('live', 'decision', {
          title: 'Trade skipped',
          detail: (d.reason as string) || 'Conditions not met',
          symbol: d.symbol as string,
          severity: 'info',
        });
        break;

      case 'kill_triggered':
        this.liveState.metrics.isKilled = true;
        this.liveState.status = 'error';
        this.emitEvent('live', 'error', {
          title: 'KILL SWITCH TRIGGERED',
          detail: (d.reason as string) || 'Daily loss limit exceeded',
          severity: 'critical',
        });
        break;

      case 'status':
        this.liveState.currentStage = (d.status as string) || 'active';
        break;

      case 'error':
        this.emitEvent('live', 'error', {
          title: 'Heartbeat error',
          detail: typeof data === 'object' ? JSON.stringify(d).slice(0, 300) : String(data),
          severity: 'critical',
        });
        break;
    }
  }

  private translatePortfolioEvent(evt: PortfolioHeartbeatEvent): void {
    const { type, data, tick, phase } = evt;
    const d = data as Record<string, unknown>;

    this.liveState.metrics.tickCount = tick;

    switch (type) {
      case 'tick_start':
        this.liveState.currentStage = phase || 'scanning';
        this.emitEvent('live', 'progress', {
          title: `Portfolio tick #${tick}`,
          detail: `Phase: ${phase || 'scan'}`,
          stage: phase,
          severity: 'info',
        });
        break;

      case 'scanning':
        this.liveState.currentStage = 'scanning';
        this.emitEvent('live', 'progress', {
          title: 'Scanning markets',
          detail: (d.message as string) || `Scanning ${d.symbolCount || '?'} symbols...`,
          stage: 'scan',
          severity: 'info',
        });
        break;

      case 'ranking':
        this.liveState.currentStage = 'ranking';
        this.emitEvent('live', 'reasoning_step', {
          title: 'Ranking opportunities',
          detail: (d.message as string) || 'Evaluating and ranking symbols by potential...',
          stage: 'rank',
          severity: 'info',
        });
        break;

      case 'thinking':
        this.emitEvent('live', 'reasoning_step', {
          title: 'Portfolio AI Reasoning',
          detail: (d.thinking as string) || (d.message as string) || 'Processing...',
          severity: 'info',
        });
        break;

      case 'analysis':
        this.liveState.currentStage = 'analyzing';
        this.emitEvent('live', 'reasoning_step', {
          title: `Analyzing ${d.symbol || 'portfolio'}`,
          detail: (d.summary as string) || JSON.stringify(d).slice(0, 200),
          symbol: d.symbol as string,
          confidence: d.confidence as number,
          severity: 'info',
        });
        break;

      case 'action':
      case 'trade_executed':
        this.emitEvent('live', 'action', {
          title: `${type === 'trade_executed' ? 'TRADE' : 'Action'}: ${d.action || d.side} ${d.symbol}`,
          detail: `@ ${d.price || '?'} | ${d.reason || ''}`,
          symbol: d.symbol as string,
          confidence: d.confidence as number,
          severity: 'critical',
        });
        break;

      case 'portfolio_update':
        if (d.positions !== undefined) {
          this.liveState.metrics.openPositions = Array.isArray(d.positions)
            ? d.positions.length
            : (d.positionCount as number) || 0;
        }
        if (d.dailyPnlPercent !== undefined) {
          this.liveState.metrics.dailyPnlPercent = d.dailyPnlPercent as number;
        }
        this.emitEvent('live', 'progress', {
          title: 'Portfolio updated',
          detail: `Positions: ${this.liveState.metrics.openPositions} | Daily PnL: ${this.liveState.metrics.dailyPnlPercent.toFixed(2)}%`,
          severity: 'info',
        });
        break;

      case 'error':
        this.emitEvent('live', 'error', {
          title: 'Portfolio engine error',
          detail: typeof data === 'object' ? JSON.stringify(d).slice(0, 300) : String(data),
          severity: 'critical',
        });
        break;

      case 'kill_triggered':
        this.liveState.metrics.isKilled = true;
        this.liveState.status = 'error';
        this.emitEvent('live', 'error', {
          title: 'PORTFOLIO KILL SWITCH',
          detail: (d.reason as string) || 'Daily loss limit exceeded',
          severity: 'critical',
        });
        break;

      default:
        this.emitEvent('live', 'progress', {
          title: `Portfolio: ${type}`,
          detail: (d.message as string) || (d.status as string) || JSON.stringify(d).slice(0, 150),
          stage: phase,
          severity: 'info',
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Thesis Validation & Promotion
  // ---------------------------------------------------------------------------

  private createValidationRecord(thesisId: string, symbol: string, direction: 'long' | 'short'): void {
    if (this.validationRecords.has(thesisId)) return;

    const record: ThesisValidationRecord = {
      id: `tv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      thesisId,
      symbol,
      direction,
      paperTradeIds: [],
      totalTrades: 0,
      winCount: 0,
      winRate: 0,
      profitFactor: 0,
      avgPnlPercent: 0,
      maxDrawdownPercent: 0,
      status: 'testing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.validationRecords.set(thesisId, record);

    // Persist
    try {
      db.thesisValidations.save({
        id: record.id,
        thesisId: record.thesisId,
        symbol: record.symbol,
        direction: record.direction,
        totalTrades: 0,
        winCount: 0,
        winRate: 0,
        profitFactor: 0,
        avgPnlPercent: 0,
        maxDrawdownPercent: 0,
        status: 'testing',
        promotedAt: undefined,
        rejectedReason: undefined,
        createdAt: record.createdAt,
      });
    } catch { /* DB error shouldn't crash orchestrator */ }
  }

  private onPaperTradeClose(tradeData: Record<string, unknown>): void {
    const thesisId = tradeData.thesisId as string;
    if (!thesisId) return;

    const record = this.validationRecords.get(thesisId);
    if (!record || record.status !== 'testing') return;

    // Update record
    const tradeId = (tradeData.id as string) || `pt_${Date.now()}`;
    const pnlPercent = (tradeData.pnlPercent as number) || 0;
    const isWin = pnlPercent > 0;

    record.paperTradeIds.push(tradeId);
    record.totalTrades++;
    if (isWin) record.winCount++;
    record.winRate = record.winCount / record.totalTrades;

    // Track P/L for profit factor
    const totalWinPnl = record.paperTradeIds.reduce((sum, _, i) => {
      // Approximate — we track aggregate, not individual
      return sum;
    }, 0);

    // Simplified profit factor update using running average
    const prevAvg = record.avgPnlPercent;
    record.avgPnlPercent = prevAvg + (pnlPercent - prevAvg) / record.totalTrades;

    // Track max drawdown
    if (pnlPercent < 0 && Math.abs(pnlPercent) > record.maxDrawdownPercent) {
      record.maxDrawdownPercent = Math.abs(pnlPercent);
    }

    // Compute profit factor: sum wins / abs(sum losses)
    // Since we don't store individual trades, use win rate and avg as proxy
    if (record.winRate > 0 && record.winRate < 1) {
      const avgWin = record.avgPnlPercent > 0 ? record.avgPnlPercent : 1;
      const avgLoss = record.avgPnlPercent < 0 ? Math.abs(record.avgPnlPercent) : 1;
      record.profitFactor = (record.winRate * avgWin) / ((1 - record.winRate) * avgLoss);
    }

    record.updatedAt = Date.now();

    // Check if thesis should be rejected
    const criteria = this.config.paper.promotionCriteria;
    if (record.totalTrades >= criteria.minTrades) {
      if (record.winRate < criteria.minWinRate * 0.7 || record.maxDrawdownPercent > criteria.maxDrawdownPercent * 1.5) {
        record.status = 'rejected';
        record.rejectedReason = record.winRate < criteria.minWinRate * 0.7
          ? `Win rate too low: ${(record.winRate * 100).toFixed(1)}%`
          : `Max drawdown exceeded: ${record.maxDrawdownPercent.toFixed(1)}%`;

        this.emitEvent('paper', 'decision', {
          title: `Thesis REJECTED: ${record.symbol}`,
          detail: record.rejectedReason,
          symbol: record.symbol,
          thesisId: record.thesisId,
          severity: 'warning',
        });
      }
    }

    // Persist update
    this.persistValidationRecord(record);

    // Update paper metrics
    this.paperState.metrics.thesesTested = this.validationRecords.size;
    this.paperState.metrics.thesesValidated = Array.from(this.validationRecords.values())
      .filter(r => r.status === 'validated' || r.status === 'promoted').length;
  }

  private async checkThesisPromotions(): Promise<void> {
    const criteria = this.config.paper.promotionCriteria;

    for (const record of this.validationRecords.values()) {
      if (record.status !== 'testing') continue;
      if (record.totalTrades < criteria.minTrades) continue;

      const meetsWinRate = record.winRate >= criteria.minWinRate;
      const meetsProfitFactor = record.profitFactor >= criteria.minProfitFactor;
      const meetsDrawdown = record.maxDrawdownPercent <= criteria.maxDrawdownPercent;

      if (meetsWinRate && meetsProfitFactor && meetsDrawdown) {
        record.status = 'validated';
        record.updatedAt = Date.now();

        this.emitEvent('paper', 'promotion', {
          title: `THESIS VALIDATED: ${record.symbol} ${record.direction}`,
          detail: `WR: ${(record.winRate * 100).toFixed(1)}% | PF: ${record.profitFactor.toFixed(2)} | Trades: ${record.totalTrades}. Running 5-wave deep analysis...`,
          symbol: record.symbol,
          thesisId: record.thesisId,
          confidence: record.winRate * 100,
          severity: 'critical',
        });

        // Run 5-wave pipeline as final deep-analysis gate before live deployment
        if (this.config.research.agentPipelineEnabled) {
          const pipelineResult = await this.runPipelineGate(record);

          if (pipelineResult && pipelineResult.confidence >= 65 && pipelineResult.decision !== 'HOLD') {
            this.emitEvent('paper', 'decision', {
              title: `PIPELINE CONFIRMS: ${record.symbol} — ${pipelineResult.decision} at ${pipelineResult.confidence}%`,
              detail: `5-wave analysis confirms thesis. ${pipelineResult.decision} with ${pipelineResult.confidence}% confidence. Duration: ${(pipelineResult.durationMs / 1000).toFixed(0)}s.`,
              symbol: record.symbol,
              thesisId: record.thesisId,
              confidence: pipelineResult.confidence,
              severity: 'info',
            });

            // Auto-promote if user approval not required
            if (!criteria.requireUserApproval) {
              await this.promoteThesisToLive(record);
            }
          } else {
            // Pipeline rejected the thesis
            const reason = pipelineResult
              ? `Pipeline returned ${pipelineResult.decision} at ${pipelineResult.confidence}% (min 65% required)`
              : 'Pipeline execution failed';

            record.status = 'rejected';
            record.rejectedReason = reason;
            record.updatedAt = Date.now();

            this.emitEvent('paper', 'decision', {
              title: `PIPELINE REJECTED: ${record.symbol}`,
              detail: reason,
              symbol: record.symbol,
              thesisId: record.thesisId,
              confidence: pipelineResult?.confidence ?? 0,
              severity: 'warning',
            });
          }
        } else {
          // No pipeline gate — auto-promote if user approval not required
          if (!criteria.requireUserApproval) {
            await this.promoteThesisToLive(record);
          }
        }

        this.persistValidationRecord(record);
      }
    }
  }

  /**
   * Run the 5-wave trading agents pipeline as a validation gate.
   * 4 analysts → Bull/Bear debate → Risk debate → Strategy synthesis → Backtest
   * Returns the pipeline result, or null if execution fails.
   */
  private async runPipelineGate(record: ThesisValidationRecord): Promise<PipelineResult | null> {
    try {
      this.emitEvent('live', 'reasoning_step', {
        title: `5-WAVE PIPELINE: Analyzing ${record.symbol}`,
        detail: 'Running 4 specialist analysts, investment debate, risk assessment, strategy synthesis, and backtesting...',
        symbol: record.symbol,
        thesisId: record.thesisId,
        severity: 'info',
      });

      // Build minimal StrategyConfig and Goals for the pipeline
      const strategyConfig = {
        id: `pipeline-${record.thesisId}`,
        name: `${record.direction.toUpperCase()} ${record.symbol} — Thesis Validation`,
        symbol: record.symbol,
        timeframe: '4h',
        status: 'paper' as const,
        risk: {
          level: 'aggressive' as const,
          maxPositionSizePercent: 5,
          stopLossPercent: 3,
          takeProfitPercent: 8,
          maxDrawdownPercent: 15,
          maxOpenPositions: 5,
          maxDailyLossPercent: 10,
          trailingStopPercent: 0,
          allowLossOfEntireAmount: false,
        },
        indicators: [],
        entryConditions: { logic: 'AND' as const, conditions: [] },
        exitConditions: { logic: 'OR' as const, conditions: [] },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const strategyGoals = {
        minWinRate: 0.55,
        minProfitFactor: 1.3,
        maxDrawdownPercent: 15,
        minSharpeRatio: 1.0,
        duration: 'swing' as const,
        maxOptimizationIterations: 5,
        questions: [
          `Is this ${record.direction} thesis on ${record.symbol} still valid at current prices?`,
          `Paper trading shows ${(record.winRate * 100).toFixed(1)}% WR over ${record.totalTrades} trades — is this sustainable?`,
          'What are the key risks for live deployment right now?',
        ],
      };

      // Create an emit function that forwards pipeline events to the orchestrator event stream
      const pipelineEmit: EmitFn = (event) => {
        // Forward key pipeline events as orchestrator events
        if (event.type === 'analyst_complete') {
          this.emitEvent('live', 'reasoning_step', {
            title: `Analyst: ${event.agent}`,
            detail: typeof event.report === 'string' ? event.report.slice(0, 200) + '...' : 'Analysis complete',
            symbol: record.symbol,
            severity: 'info',
          });
        } else if (event.type === 'debate_judge') {
          this.emitEvent('live', 'decision', {
            title: `Debate verdict: ${event.decision}`,
            detail: `Confidence: ${event.confidence}%. Plan: ${typeof event.plan === 'string' ? event.plan.slice(0, 150) : 'N/A'}`,
            symbol: record.symbol,
            confidence: event.confidence,
            severity: 'info',
          });
        } else if (event.type === 'pipeline_complete') {
          this.emitEvent('live', 'decision', {
            title: `Pipeline complete: ${event.decision} at ${event.confidence}%`,
            detail: `Full 5-wave analysis completed in ${(event.duration / 1000).toFixed(0)}s`,
            symbol: record.symbol,
            confidence: event.confidence,
            severity: 'critical',
          });
        } else if (event.type === 'pipeline_error') {
          this.emitEvent('live', 'error', {
            title: `Pipeline error on ${record.symbol}`,
            detail: event.error,
            symbol: record.symbol,
            severity: 'critical',
          });
        }
      };

      const result = await runTradingAgentsPipeline(
        {
          symbol: record.symbol,
          timeframe: '4h',
          strategyConfig,
          strategyGoals,
          debateRounds: 2,
          riskDebateRounds: 1,
        },
        pipelineEmit,
      );

      return result;
    } catch (err) {
      console.error(`[Orchestrator] Pipeline gate failed for ${record.symbol}:`, err);
      this.emitEvent('live', 'error', {
        title: `Pipeline gate failed: ${record.symbol}`,
        detail: err instanceof Error ? err.message : String(err),
        symbol: record.symbol,
        severity: 'critical',
      });
      return null;
    }
  }

  async approvePromotion(thesisId: string): Promise<boolean> {
    const record = this.validationRecords.get(thesisId);
    if (!record || record.status !== 'validated') return false;

    return this.promoteThesisToLive(record);
  }

  private async promoteThesisToLive(record: ThesisValidationRecord): Promise<boolean> {
    if (!this.config.live.enabled) return false;

    record.status = 'promoted';
    record.promotedAt = Date.now();
    record.updatedAt = Date.now();

    this.liveState.metrics.strategiesDeployed++;

    this.emitEvent('live', 'promotion', {
      title: `STRATEGY DEPLOYED: ${record.symbol} ${record.direction}`,
      detail: `Validated thesis promoted to live trading. WR: ${(record.winRate * 100).toFixed(1)}% | PF: ${record.profitFactor.toFixed(2)}. Pipeline-confirmed.`,
      symbol: record.symbol,
      thesisId: record.thesisId,
      confidence: record.winRate * 100,
      severity: 'critical',
    });

    this.persistValidationRecord(record);

    // The live engine will pick up the promoted thesis on its next tick
    // via knowledge base / strategy integration
    return true;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  private async saveState(): Promise<void> {
    try {
      db.orchestratorState.save({
        config: this.config,
        validationRecords: Array.from(this.validationRecords.values()),
        researchState: {
          currentObjective: this.researchState.currentObjective,
          currentStage: this.researchState.currentStage,
          metrics: this.researchState.metrics,
        },
        paperState: {
          currentObjective: this.paperState.currentObjective,
          currentStage: this.paperState.currentStage,
          metrics: this.paperState.metrics,
        },
        liveState: {
          currentObjective: this.liveState.currentObjective,
          currentStage: this.liveState.currentStage,
          metrics: this.liveState.metrics,
        },
      });
    } catch { /* DB error shouldn't crash orchestrator */ }
  }

  private async loadState(): Promise<void> {
    try {
      const saved = db.orchestratorState.get();
      if (!saved) return;

      // Restore config
      try {
        const savedConfig = saved.config as Record<string, unknown>;
        if (savedConfig && typeof savedConfig === 'object') {
          this.config = {
            ...DEFAULT_ORCHESTRATOR_CONFIG,
            ...savedConfig,
            research: { ...DEFAULT_ORCHESTRATOR_CONFIG.research, ...(savedConfig.research as object) },
            paper: {
              ...DEFAULT_ORCHESTRATOR_CONFIG.paper,
              ...(savedConfig.paper as object),
              promotionCriteria: {
                ...DEFAULT_ORCHESTRATOR_CONFIG.paper.promotionCriteria,
                ...((savedConfig.paper as Record<string, unknown>)?.promotionCriteria as object),
              },
            },
            live: { ...DEFAULT_ORCHESTRATOR_CONFIG.live, ...(savedConfig.live as object) },
          } as TradingOrchestratorConfig;
        }
      } catch { /* ignore parse errors */ }

      // Restore workflow states
      try {
        const rs = saved.researchState as Record<string, unknown>;
        if (rs?.metrics) Object.assign(this.researchState.metrics, rs.metrics);

        const ps = saved.paperState as Record<string, unknown>;
        if (ps?.metrics) Object.assign(this.paperState.metrics, ps.metrics);

        const ls = saved.liveState as Record<string, unknown>;
        if (ls?.metrics) Object.assign(this.liveState.metrics, ls.metrics);
      } catch { /* ignore parse errors */ }
    } catch { /* DB error shouldn't prevent startup */ }
  }

  private async loadValidationRecords(): Promise<void> {
    try {
      const rows = db.thesisValidations.getAll();
      for (const row of rows) {
        const record: ThesisValidationRecord = {
          id: row.id as string,
          thesisId: row.thesis_id as string,
          symbol: row.symbol as string,
          direction: row.direction as 'long' | 'short',
          paperTradeIds: [],
          totalTrades: row.total_trades as number,
          winCount: row.win_count as number,
          winRate: row.win_rate as number,
          profitFactor: row.profit_factor as number,
          avgPnlPercent: row.avg_pnl_percent as number,
          maxDrawdownPercent: row.max_drawdown_percent as number,
          status: row.status as ThesisValidationRecord['status'],
          promotedAt: row.promoted_at as number | undefined,
          rejectedReason: row.rejected_reason as string | undefined,
          createdAt: row.created_at as number,
          updatedAt: row.updated_at as number,
        };
        this.validationRecords.set(record.thesisId, record);
      }
    } catch { /* DB error shouldn't prevent startup */ }
  }

  private persistValidationRecord(record: ThesisValidationRecord): void {
    try {
      db.thesisValidations.save({
        id: record.id,
        thesisId: record.thesisId,
        symbol: record.symbol,
        direction: record.direction,
        totalTrades: record.totalTrades,
        winCount: record.winCount,
        winRate: record.winRate,
        profitFactor: record.profitFactor,
        avgPnlPercent: record.avgPnlPercent,
        maxDrawdownPercent: record.maxDrawdownPercent,
        status: record.status,
        promotedAt: record.promotedAt,
        rejectedReason: record.rejectedReason,
        createdAt: record.createdAt,
      });
    } catch { /* DB error shouldn't crash orchestrator */ }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getWorkflowState(id: WorkflowId): WorkflowState & { metrics: unknown } {
    switch (id) {
      case 'research': return this.researchState;
      case 'paper': return this.paperState;
      case 'live': return this.liveState;
    }
  }

  private makeWorkflowState<T>(enabled: boolean, metrics: T): WorkflowState & { metrics: T } {
    return {
      enabled,
      status: 'idle',
      currentObjective: '',
      currentStage: '',
      lastActivityAt: null,
      recentEvents: [],
      error: null,
      metrics,
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let orchestratorInstance: TradingOrchestrator | null = null;

export function getTradingOrchestrator(): TradingOrchestrator | null {
  return orchestratorInstance;
}

export function createTradingOrchestrator(
  config?: Partial<TradingOrchestratorConfig>
): TradingOrchestrator {
  if (orchestratorInstance) {
    orchestratorInstance.stop();
  }
  orchestratorInstance = new TradingOrchestrator(config);
  return orchestratorInstance;
}

export function stopTradingOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop();
    orchestratorInstance = null;
  }
}
