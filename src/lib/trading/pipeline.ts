// ============================================================================
// PhantomX — Trading Pipeline Orchestrator
// ============================================================================
// Wires together: Signal Bus -> Risk Gate -> Execution Engine -> Position Monitor
//
// Signal flow:
//   1. External agent/scanner submits signal via tradingSignalBus.submit()
//   2. Pipeline.processPending() picks up pending signals
//   3. Risk gate validates each signal
//   4. Approved signals go to execution engine
//   5. Position monitor tracks open trades on each tick
//
// Default mode: PAPER. Board must explicitly call setMode('live').
// ============================================================================

import type { PipelineConfig, Position } from '@/types/trading';
import { tradingSignalBus } from './trading-signal-bus';
import { checkRisk } from './risk-gate';
import { executionEngine } from './execution-engine';
import { monitorPositions, type MonitorSnapshot } from './position-monitor';
import { isKillSwitchActive } from '@/lib/kill-switch';

// ---------------------------------------------------------------------------
// Default config — conservative paper-trading defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: PipelineConfig = {
  mode: 'paper',
  minConfidence: 60,
  maxOpenPositions: 5,
  maxDailyLossPercent: 5,
  maxExposurePercent: 50,
  defaultLeverage: 1,
  positionSizePercent: 5,
  signalTtlMs: 15 * 60 * 1000, // 15 minutes
  requireStopLoss: true,
  minHoldTimeMs: 5 * 60 * 1000,   // 5 min — closes below this flagged as whipsaw (PAP-23)
};

// ---------------------------------------------------------------------------
// Pipeline singleton
// ---------------------------------------------------------------------------

let _config: PipelineConfig = { ...DEFAULT_CONFIG };
let _running = false;
let _tickInterval: ReturnType<typeof setInterval> | null = null;
let _lastSnapshot: MonitorSnapshot | null = null;

export const pipeline = {
  /** Get current pipeline config. */
  getConfig(): PipelineConfig {
    return { ..._config };
  },

  /** Update pipeline config. Merges with existing. */
  updateConfig(partial: Partial<PipelineConfig>): PipelineConfig {
    // Guard: mode can only be set to 'live' when explicitly requested
    if (partial.mode === 'live') {
      console.log('[Pipeline] WARNING: Live mode requested. Board approval required.');
    }
    _config = { ..._config, ...partial };
    return { ..._config };
  },

  /** Set trading mode. Paper is safe. Live requires board approval. */
  setMode(mode: 'paper' | 'live'): void {
    if (mode === 'live') {
      console.log('[Pipeline] LIVE MODE ENABLED — real orders will be placed on Phemex');
    } else {
      console.log('[Pipeline] Paper mode — trades are simulated only');
    }
    _config.mode = mode;
  },

  /** Process all pending signals through risk gate and execution. */
  async processPending(
    positions: Position[],
    equity: number,
    dailyPnlPercent: number,
  ): Promise<{ processed: number; approved: number; rejected: number; executed: number; errors: string[] }> {
    // Expire stale signals first
    tradingSignalBus.expireStale();

    if (isKillSwitchActive()) {
      return { processed: 0, approved: 0, rejected: 0, executed: 0, errors: ['Kill switch active — skipping all signals'] };
    }

    const pending = tradingSignalBus.getPending();
    let approved = 0;
    let rejected = 0;
    let executed = 0;
    const errors: string[] = [];

    for (const signal of pending) {
      // Risk check
      const result = checkRisk(signal, _config, { positions, equity, dailyPnlPercent });

      if (!result.approved) {
        tradingSignalBus.updateStatus(signal.id, 'rejected', { rejectionReason: result.reason });
        rejected++;
        continue;
      }

      // Mark approved
      tradingSignalBus.updateStatus(signal.id, 'approved');
      approved++;

      // Execute
      try {
        const record = await executionEngine.execute(signal, _config, equity);
        if (record.status === 'filled') {
          tradingSignalBus.updateStatus(signal.id, 'executed', { executionId: record.id });
          executed++;
        } else {
          tradingSignalBus.updateStatus(signal.id, 'rejected', {
            rejectionReason: record.error ?? 'Execution failed',
          });
          errors.push(`${signal.asset}: ${record.error ?? 'unknown failure'}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tradingSignalBus.updateStatus(signal.id, 'rejected', { rejectionReason: msg });
        errors.push(`${signal.asset}: ${msg}`);
      }
    }

    return { processed: pending.length, approved, rejected, executed, errors };
  },

  /** Run a single monitoring pass. */
  async tick(
    livePositions: Position[],
    prices: Map<string, number>,
    equity: number,
  ): Promise<MonitorSnapshot> {
    const snapshot = await monitorPositions(_config, livePositions, prices, equity);
    _lastSnapshot = snapshot;
    return snapshot;
  },

  /** Get the last monitoring snapshot. */
  getLastSnapshot(): MonitorSnapshot | null {
    return _lastSnapshot;
  },

  /** Start auto-monitoring on an interval (ms). */
  startMonitor(
    intervalMs: number,
    getContext: () => Promise<{ positions: Position[]; prices: Map<string, number>; equity: number }>,
  ): void {
    if (_running) return;
    _running = true;
    console.log(`[Pipeline] Monitor started (${intervalMs}ms interval, ${_config.mode} mode)`);

    const run = async () => {
      try {
        const ctx = await getContext();
        await this.tick(ctx.positions, ctx.prices, ctx.equity);

        // Also process any pending signals
        const dailyPnl = _lastSnapshot?.dailyPnlPercent ?? 0;
        await this.processPending(ctx.positions, ctx.equity, dailyPnl);
      } catch (err) {
        console.error('[Pipeline] Monitor tick error:', err);
      }
    };

    // First tick immediately
    run();
    _tickInterval = setInterval(run, intervalMs);
  },

  /** Stop auto-monitoring. */
  stopMonitor(): void {
    if (_tickInterval) {
      clearInterval(_tickInterval);
      _tickInterval = null;
    }
    _running = false;
    console.log('[Pipeline] Monitor stopped');
  },

  /** Is the monitor running? */
  isRunning(): boolean {
    return _running;
  },

  /** Get full pipeline status. */
  getStatus() {
    const stats = executionEngine.getStats();
    const signalCounts = tradingSignalBus.getCounts();
    return {
      running: _running,
      mode: _config.mode,
      config: _config,
      signals: signalCounts,
      execution: stats,
      lastSnapshot: _lastSnapshot,
    };
  },
};
