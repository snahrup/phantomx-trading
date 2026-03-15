// ============================================================================
// PhantomX — Risk Limits API (Agent-Facing)
// ============================================================================
// GET /api/risk/limits
//
// Returns current risk parameters, pipeline config, kill switch state,
// and execution stats. Everything an agent needs to check before submitting
// a signal.
// ============================================================================

import { NextResponse } from 'next/server';
import { pipeline, executionEngine } from '@/lib/trading';
import { isKillSwitchActive, isCloseOnlyMode, getKillState, getCooldownRemainingMs, RISK_THRESHOLDS } from '@/lib/kill-switch';

export async function GET() {
  try {
    const config = pipeline.getConfig();
    const stats = executionEngine.getStats();
    const killState = getKillState();

    return NextResponse.json({
      pipeline: {
        mode: config.mode,
        minConfidence: config.minConfidence,
        maxOpenPositions: config.maxOpenPositions,
        maxDailyLossPercent: config.maxDailyLossPercent,
        maxExposurePercent: config.maxExposurePercent,
        defaultLeverage: config.defaultLeverage,
        positionSizePercent: config.positionSizePercent,
        signalTtlMs: config.signalTtlMs,
        requireStopLoss: config.requireStopLoss,
        minHoldTimeMs: config.minHoldTimeMs,
      },
      riskThresholds: RISK_THRESHOLDS,
      killSwitch: {
        active: isKillSwitchActive(),
        closeOnly: isCloseOnlyMode(),
        cooldownRemainingMs: getCooldownRemainingMs(),
        ...killState,
      },
      execution: stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
