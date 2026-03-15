// ============================================================================
// PhantomX — Position Monitor
// ============================================================================
// Tracks open positions (both paper and live), monitors stop-loss and
// take-profit levels, calculates running P&L, and triggers kill switch
// on drawdown threshold breach.
// ============================================================================

import type { Position, ExecutionRecord, PipelineConfig } from '@/types/trading';
import { triggerKillSwitch } from '@/lib/kill-switch';
import { executionEngine } from './execution-engine';

export interface MonitorSnapshot {
  timestamp: number;
  paperPositions: ExecutionRecord[];
  livePositions: Position[];
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  dailyPnlPercent: number;
  alerts: string[];
  whipsawCount?: number;            // trades closed below minHoldTimeMs (PAP-23)
}

/**
 * Run a single monitoring pass. Called by the pipeline on each tick.
 *
 * For paper positions: checks if current price hit stop or target.
 * For live positions: reads from exchange (passed in).
 * Returns alerts and closes positions that hit their stops/targets.
 */
export async function monitorPositions(
  config: PipelineConfig,
  livePositions: Position[],
  prices: Map<string, number>,  // asset -> current price
  equity: number,
): Promise<MonitorSnapshot> {
  const alerts: string[] = [];
  const paperPositions = executionEngine.getOpen();
  const dailyPnl = executionEngine.getDailyPnl();
  const dailyPnlPercent = equity > 0 ? (dailyPnl / equity) * 100 : 0;

  // Check paper positions against stops and targets
  for (const pos of paperPositions) {
    if (pos.mode !== 'paper') continue;
    const price = prices.get(pos.asset);
    if (!price) continue;

    const isLong = pos.direction === 'long';

    // Stop-loss check
    const stopHit = isLong ? price <= pos.stopLoss : price >= pos.stopLoss;
    if (stopHit) {
      alerts.push(`STOP HIT: ${pos.direction} ${pos.asset} @ ${price} (stop: ${pos.stopLoss})`);
      await executionEngine.close(pos.id, pos.stopLoss, 'stop-loss hit');
      continue;
    }

    // Take-profit check
    if (pos.takeProfit) {
      const tpHit = isLong ? price >= pos.takeProfit : price <= pos.takeProfit;
      if (tpHit) {
        alerts.push(`TARGET HIT: ${pos.direction} ${pos.asset} @ ${price} (tp: ${pos.takeProfit})`);
        await executionEngine.close(pos.id, pos.takeProfit, 'take-profit hit');
        continue;
      }
    }
  }

  // Calculate unrealized P&L across all open positions
  let totalUnrealizedPnl = 0;

  // Paper unrealized
  const remainingPaper = executionEngine.getOpen();
  for (const pos of remainingPaper) {
    const price = prices.get(pos.asset);
    if (!price) continue;
    const direction = pos.direction === 'long' ? 1 : -1;
    totalUnrealizedPnl += (price - pos.entryPrice) * pos.size * direction;
  }

  // Live unrealized
  for (const pos of livePositions) {
    totalUnrealizedPnl += pos.unrealizedPnl;
  }

  // Drawdown kill-switch check
  const totalPnlPercent = equity > 0
    ? ((dailyPnl + totalUnrealizedPnl) / equity) * 100
    : 0;

  if (totalPnlPercent < -config.maxDailyLossPercent) {
    const reason = `Daily loss limit breached: ${totalPnlPercent.toFixed(2)}% (limit: -${config.maxDailyLossPercent}%)`;
    triggerKillSwitch(reason);
    alerts.push(`KILL SWITCH TRIGGERED: ${reason}`);
  }

  // PAP-23: Whipsaw count for monitoring
  const whipsawThreshold = config.minHoldTimeMs ?? 5 * 60 * 1000;
  const whipsawTrades = executionEngine.getWhipsawTrades(whipsawThreshold);
  if (whipsawTrades.length > 0) {
    alerts.push(`WHIPSAW: ${whipsawTrades.length} trade(s) closed under ${Math.round(whipsawThreshold / 1000)}s hold time`);
  }

  return {
    timestamp: Date.now(),
    paperPositions: remainingPaper,
    livePositions,
    totalUnrealizedPnl,
    totalRealizedPnl: dailyPnl,
    dailyPnlPercent: totalPnlPercent,
    alerts,
    whipsawCount: whipsawTrades.length,
  };
}
