// ============================================================================
// PhantomX — Risk Gate
// ============================================================================
// Standalone risk validator for trading signals. Checks every constraint
// before allowing a signal to proceed to execution.
// ============================================================================

import type { TradingSignal, RiskCheckResult, PipelineConfig, Position } from '@/types/trading';
import { isKillSwitchActive, isCloseOnlyMode } from '@/lib/kill-switch';

interface RiskContext {
  positions: Position[];
  equity: number;               // total account equity in USDT
  dailyPnlPercent: number;      // current day's realized+unrealized P&L as % of equity
}

export function checkRisk(
  signal: TradingSignal,
  config: PipelineConfig,
  ctx: RiskContext,
): RiskCheckResult {
  const killActive = isKillSwitchActive();

  // Position count check
  const positionCount = ctx.positions.length;
  const posCountOk = positionCount < config.maxOpenPositions;

  // Already have a position in this asset?
  const duplicatePosition = ctx.positions.some(
    p => p.symbol === signal.asset && p.side === signal.direction,
  );

  // Daily P&L check
  const dailyPnlOk = Math.abs(ctx.dailyPnlPercent) < config.maxDailyLossPercent;

  // Exposure check — sum of all position notional values as % of equity
  const currentExposure = ctx.positions.reduce((sum, p) => {
    return sum + (p.size * p.markPrice);
  }, 0);
  const currentExposurePercent = ctx.equity > 0 ? (currentExposure / ctx.equity) * 100 : 0;
  const exposureOk = currentExposurePercent < config.maxExposurePercent;

  // Kill switch
  const killOk = !killActive;

  // Signal quality
  const qualityOk = signal.confidence >= config.minConfidence;

  // Stop-loss required check
  const hasStop = signal.stop > 0;
  const stopOk = !config.requireStopLoss || hasStop;

  // Aggregate
  const allPassed = posCountOk && !duplicatePosition && dailyPnlOk && exposureOk && killOk && qualityOk && stopOk;

  let reason = 'All risk checks passed';
  if (!allPassed) {
    const reasons: string[] = [];
    if (killActive) reasons.push(isCloseOnlyMode() ? 'Kill switch is in close-only mode — no new entries' : 'Kill switch is active');
    if (!posCountOk) reasons.push(`Max positions reached (${positionCount}/${config.maxOpenPositions})`);
    if (duplicatePosition) reasons.push(`Duplicate ${signal.direction} position in ${signal.asset}`);
    if (!dailyPnlOk) reasons.push(`Daily P&L limit breached (${ctx.dailyPnlPercent.toFixed(2)}%/${config.maxDailyLossPercent}%)`);
    if (!exposureOk) reasons.push(`Exposure limit breached (${currentExposurePercent.toFixed(1)}%/${config.maxExposurePercent}%)`);
    if (!qualityOk) reasons.push(`Low confidence (${signal.confidence}/${config.minConfidence})`);
    if (!stopOk) reasons.push('Stop-loss required but not provided');
    reason = reasons.join('; ');
  }

  return {
    approved: allPassed,
    reason,
    checks: {
      positionCount: { passed: posCountOk && !duplicatePosition, current: positionCount, max: config.maxOpenPositions },
      dailyPnl: { passed: dailyPnlOk, currentPercent: ctx.dailyPnlPercent, limitPercent: config.maxDailyLossPercent },
      exposure: { passed: exposureOk, currentPercent: currentExposurePercent, maxPercent: config.maxExposurePercent },
      killSwitch: { passed: killOk, active: killActive },
      signalQuality: { passed: qualityOk, confidence: signal.confidence, minRequired: config.minConfidence },
    },
  };
}
