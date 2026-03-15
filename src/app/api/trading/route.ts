// ============================================================================
// PhantomX — Trading Pipeline API
// ============================================================================
// Unified endpoint for the automated execution pipeline.
//
// Actions:
//   GET  /api/trading                     → pipeline status
//   POST /api/trading { action: '...' }   → control pipeline
//
// POST actions:
//   submit_signal   — submit a new trading signal
//   process         — process pending signals now
//   positions       — get open paper + live positions
//   signals         — get signal history
//   portfolio       — equity, P&L, stats
//   kill_switch     — trigger or reset kill switch
//   config          — get or update pipeline config
//   close           — close an open execution
//   history         — execution history
// ============================================================================

import { NextResponse } from 'next/server';
import { pipeline, tradingSignalBus, executionEngine } from '@/lib/trading';
import { isKillSwitchActive, isCloseOnlyMode, triggerKillSwitch, setCloseOnlyMode, resetKillSwitch, getKillState, getCooldownRemainingMs, RISK_THRESHOLDS } from '@/lib/kill-switch';
import { getPhemexClient } from '@/lib/phemex/client';
import type { Position } from '@/types/trading';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getOrchestrator } from '@/lib/mission/orchestrator';
import type { MissionConfig } from '@/lib/mission/orchestrator';

const TRADING_MODE_PATH = join(process.cwd(), 'knowledge', 'trading-mode.json');

// ---------------------------------------------------------------------------
// Helper: get live context from exchange
// ---------------------------------------------------------------------------

async function getLiveContext(): Promise<{
  positions: Position[];
  equity: number;
  prices: Map<string, number>;
}> {
  let client: ReturnType<typeof getPhemexClient> | null = null;
  try { client = getPhemexClient(); } catch { /* not configured */ }

  let positions: Position[] = [];
  let equity = 0;
  const prices = new Map<string, number>();

  if (client) {
    try {
      positions = await client.getPositions();
      for (const p of positions) {
        prices.set(p.symbol, p.markPrice);
      }
    } catch { /* exchange unavailable */ }

    try {
      const account = await client.getAccountInfo();
      equity = account.totalUsdValue ?? 0;
    } catch { /* fallback */ }
  }

  return { positions, equity, prices };
}

// ---------------------------------------------------------------------------
// GET — Pipeline status
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    return NextResponse.json(pipeline.getStatus());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Pipeline actions
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ---------------------------------------------------------------
      // Submit a new trading signal
      // ---------------------------------------------------------------
      case 'submit_signal': {
        const { asset, direction, strategy, entry, stop, targets, confidence, metadata,
                strategyId, source, regime, triggerDetails } = body;
        if (!asset || !direction || !strategy || entry == null || stop == null) {
          return NextResponse.json({ error: 'Missing required fields: asset, direction, strategy, entry, stop' }, { status: 400 });
        }
        if (!['long', 'short'].includes(direction)) {
          return NextResponse.json({ error: 'direction must be "long" or "short"' }, { status: 400 });
        }
        const numEntry = Number(entry);
        const numStop = Number(stop);
        const numConfidence = Number(confidence ?? 50);
        if (!isFinite(numEntry) || numEntry <= 0) {
          return NextResponse.json({ error: 'entry must be a positive finite number' }, { status: 400 });
        }
        if (!isFinite(numStop) || numStop <= 0) {
          return NextResponse.json({ error: 'stop must be a positive finite number' }, { status: 400 });
        }
        if (!isFinite(numConfidence) || numConfidence < 0 || numConfidence > 100) {
          return NextResponse.json({ error: 'confidence must be a number between 0 and 100' }, { status: 400 });
        }
        const config = pipeline.getConfig();
        const id = tradingSignalBus.submit({
          asset,
          direction,
          strategy,
          strategyId: strategyId ?? undefined,
          source: source ?? undefined,
          regime: regime ?? undefined,
          triggerDetails: triggerDetails ?? undefined,
          entry: numEntry,
          stop: numStop,
          targets: targets ?? [],
          confidence: numConfidence,
          metadata,
          expiresAt: Date.now() + config.signalTtlMs,
        });
        return NextResponse.json({ id, status: 'pending' });
      }

      // ---------------------------------------------------------------
      // Process pending signals now
      // ---------------------------------------------------------------
      case 'process': {
        const ctx = await getLiveContext();
        const dailyPnl = executionEngine.getDailyPnl();
        const dailyPnlPercent = ctx.equity > 0 ? (dailyPnl / ctx.equity) * 100 : 0;
        const result = await pipeline.processPending(ctx.positions, ctx.equity, dailyPnlPercent);
        return NextResponse.json(result);
      }

      // ---------------------------------------------------------------
      // Get open positions (paper + live)
      // ---------------------------------------------------------------
      case 'positions': {
        const ctx = await getLiveContext();
        const paperPositions = executionEngine.getOpen();
        return NextResponse.json({
          paper: paperPositions,
          live: ctx.positions,
          equity: ctx.equity,
        });
      }

      // ---------------------------------------------------------------
      // Get signal history
      // ---------------------------------------------------------------
      case 'signals': {
        const { status, limit } = body;
        if (status) {
          const validStatuses = ['pending', 'approved', 'rejected', 'failed', 'executed', 'closed', 'expired'];
          if (!validStatuses.includes(status)) {
            return NextResponse.json(
              { error: `Invalid status "${status}". Must be one of: ${validStatuses.join(', ')}` },
              { status: 400 },
            );
          }
        }
        const signals = status
          ? tradingSignalBus.getByStatus(status, limit ?? 50)
          : tradingSignalBus.getRecent(limit ?? 100);
        const counts = tradingSignalBus.getCounts();
        return NextResponse.json({ signals, counts });
      }

      // ---------------------------------------------------------------
      // Portfolio overview
      // ---------------------------------------------------------------
      case 'portfolio': {
        const ctx = await getLiveContext();
        const stats = executionEngine.getStats();
        const openPaper = executionEngine.getOpen();

        // Calculate paper unrealized P&L
        let paperUnrealizedPnl = 0;
        for (const pos of openPaper) {
          const price = ctx.prices.get(pos.asset);
          if (price) {
            const dir = pos.direction === 'long' ? 1 : -1;
            paperUnrealizedPnl += (price - pos.entryPrice) * pos.size * dir;
          }
        }

        // Live unrealized P&L
        const liveUnrealizedPnl = ctx.positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

        return NextResponse.json({
          equity: ctx.equity,
          unrealizedPnl: paperUnrealizedPnl + liveUnrealizedPnl,
          realizedPnl: stats.totalPnl,
          dailyPnl: stats.dailyPnl,
          openPositions: openPaper.length + ctx.positions.length,
          stats,
          mode: pipeline.getConfig().mode,
        });
      }

      // ---------------------------------------------------------------
      // Kill switch control
      // ---------------------------------------------------------------
      case 'kill_switch': {
        const { command, reason } = body;
        if (command === 'trigger') {
          const mode = body.mode === 'close_only' ? 'close_only' : 'killed';
          triggerKillSwitch(reason ?? 'Manual trigger via API', mode);
          return NextResponse.json({ triggered: true, ...getKillState() });
        } else if (command === 'close_only') {
          setCloseOnlyMode(reason ?? 'Close-only mode set via API');
          return NextResponse.json({ triggered: true, ...getKillState() });
        } else if (command === 'reset') {
          const result = resetKillSwitch(body.force === true);
          if (!result.success) {
            return NextResponse.json({ error: result.message, ...getKillState() }, { status: 403 });
          }
          return NextResponse.json({ triggered: false, ...getKillState() });
        } else if (command === 'status') {
          return NextResponse.json({ active: isKillSwitchActive(), closeOnly: isCloseOnlyMode(), cooldownRemainingMs: getCooldownRemainingMs(), ...getKillState() });
        }
        return NextResponse.json({ error: 'Unknown command. Use: trigger, close_only, reset, status' }, { status: 400 });
      }

      // ---------------------------------------------------------------
      // Pipeline config
      // ---------------------------------------------------------------
      case 'config': {
        const { updates } = body;
        if (updates) {
          // Guard: don't allow setting mode to 'live' via this endpoint
          if (updates.mode === 'live') {
            return NextResponse.json({ error: 'Live mode must be enabled via board approval' }, { status: 403 });
          }
          // Whitelist allowed config keys based on PipelineConfig type
          const allowedKeys = [
            'mode', 'minConfidence', 'maxOpenPositions', 'maxDailyLossPercent',
            'maxExposurePercent', 'defaultLeverage', 'positionSizePercent',
            'signalTtlMs', 'requireStopLoss', 'minHoldTimeMs',
          ];
          const unknownKeys = Object.keys(updates).filter((k: string) => !allowedKeys.includes(k));
          if (unknownKeys.length > 0) {
            return NextResponse.json(
              { error: `Unknown config keys: ${unknownKeys.join(', ')}. Allowed: ${allowedKeys.join(', ')}` },
              { status: 400 },
            );
          }
          const updated = pipeline.updateConfig(updates);
          return NextResponse.json({ config: updated });
        }
        return NextResponse.json({ config: pipeline.getConfig() });
      }

      // ---------------------------------------------------------------
      // Close an open execution
      // ---------------------------------------------------------------
      case 'close': {
        const { executionId, exitPrice, reason: closeReason, exitContext } = body;
        if (!executionId || exitPrice == null) {
          return NextResponse.json({ error: 'Missing executionId and exitPrice' }, { status: 400 });
        }
        const numExitPrice = Number(exitPrice);
        if (!isFinite(numExitPrice) || numExitPrice <= 0) {
          return NextResponse.json({ error: 'exitPrice must be a positive finite number' }, { status: 400 });
        }
        const record = await executionEngine.close(executionId, numExitPrice, closeReason, exitContext);
        if (!record) {
          return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
        }
        return NextResponse.json(record);
      }

      // ---------------------------------------------------------------
      // Execution history
      // ---------------------------------------------------------------
      case 'history': {
        const records = executionEngine.getHistory(body.limit ?? 100);
        return NextResponse.json({ executions: records });
      }

      // ---------------------------------------------------------------
      // Strategy performance breakdown (PAP-22/23)
      // ---------------------------------------------------------------
      case 'strategy_stats': {
        const stratStats = executionEngine.getStrategyStats();
        return NextResponse.json({ strategies: stratStats });
      }

      // ---------------------------------------------------------------
      // Whipsaw trades (PAP-23)
      // ---------------------------------------------------------------
      case 'whipsaw': {
        const threshold = body.thresholdMs ?? 5 * 60 * 1000;
        const whipsaws = executionEngine.getWhipsawTrades(threshold);
        return NextResponse.json({ count: whipsaws.length, trades: whipsaws, thresholdMs: threshold });
      }

      // ---------------------------------------------------------------
      // Mission Orchestrator — autonomous task recycler
      // ---------------------------------------------------------------
      case 'start_orchestrator': {
        const orchestrator = getOrchestrator();
        if (orchestrator.isRunning()) {
          return NextResponse.json({ error: 'Orchestrator already running', status: orchestrator.getStatus() }, { status: 409 });
        }
        if (body.riskLevel) {
          const validRiskLevels = ['conservative', 'moderate', 'aggressive', 'degen'];
          if (!validRiskLevels.includes(body.riskLevel)) {
            return NextResponse.json(
              { error: `Invalid riskLevel "${body.riskLevel}". Must be one of: ${validRiskLevels.join(', ')}` },
              { status: 400 },
            );
          }
        }
        const missionConfig: MissionConfig = {
          selectedPairs: body.selectedPairs ?? [],
          riskLevel: body.riskLevel ?? 'aggressive',
          maxConcurrentPositions: body.maxConcurrentPositions ?? 3,
          profitGoal: body.profitGoal ?? null,
          startingBalance: body.startingBalance ?? null,
          teamSize: body.teamSize ?? 'standard',
          scanIntervalSec: body.scanIntervalSec ?? 120,
        };
        orchestrator.start(missionConfig);
        return NextResponse.json({ started: true, status: orchestrator.getStatus() });
      }

      case 'stop_orchestrator': {
        const orchestrator = getOrchestrator();
        await orchestrator.stop();
        return NextResponse.json({ stopped: true, status: orchestrator.getStatus() });
      }

      case 'pause_orchestrator': {
        const orchestrator = getOrchestrator();
        orchestrator.pause();
        return NextResponse.json({ paused: true, status: orchestrator.getStatus() });
      }

      case 'resume_orchestrator': {
        const orchestrator = getOrchestrator();
        if (!orchestrator.isPaused()) {
          return NextResponse.json({ error: 'Orchestrator is not paused', status: orchestrator.getStatus() }, { status: 409 });
        }
        orchestrator.resume();
        return NextResponse.json({ resumed: true, status: orchestrator.getStatus() });
      }

      case 'orchestrator_status': {
        const orchestrator = getOrchestrator();
        return NextResponse.json(orchestrator.getStatus());
      }

      // ---------------------------------------------------------------
      // Trading mode (autonomous vs manual) — controls Axon auto-execution
      // ---------------------------------------------------------------
      case 'set_mode': {
        const { mode: newMode, reason: modeReason } = body;
        if (newMode !== 'autonomous' && newMode !== 'manual') {
          return NextResponse.json({ error: 'mode must be "autonomous" or "manual"' }, { status: 400 });
        }

        // Read existing trading-mode.json, update mode field
        let existing: Record<string, unknown> = {};
        try {
          existing = JSON.parse(readFileSync(TRADING_MODE_PATH, 'utf-8'));
        } catch { /* file may not exist yet */ }

        const updated = {
          ...existing,
          mode: newMode,
          setBy: 'mission-control',
          setAt: new Date().toISOString(),
          reason: modeReason ?? (newMode === 'autonomous'
            ? 'Autonomous mode activated from Mission Control launch'
            : 'Reverted to manual mode'),
        };

        try {
          writeFileSync(TRADING_MODE_PATH, JSON.stringify(updated, null, 2));
        } catch (writeErr) {
          return NextResponse.json(
            { error: `Failed to write trading mode: ${writeErr instanceof Error ? writeErr.message : 'Unknown write error'}` },
            { status: 500 },
          );
        }
        return NextResponse.json({ mode: newMode, updated: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Available: submit_signal, process, positions, signals, portfolio, kill_switch, config, close, history, strategy_stats, whipsaw, set_mode, start_orchestrator, stop_orchestrator, pause_orchestrator, resume_orchestrator, orchestrator_status` },
          { status: 400 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
