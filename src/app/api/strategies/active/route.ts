// ============================================================================
// PhantomX — Active Strategies API (Agent-Facing)
// ============================================================================
// GET /api/strategies/active
//
// Returns all registered strategies with their regime mappings and conditions.
// Agents can use this to understand which strategies are available and what
// market conditions activate them.
// ============================================================================

import { NextResponse } from 'next/server';
import { routeStrategies, getAllStrategyIds, getStrategyMapping } from '@/lib/strategy/regime-router';
import type { RegimeClassification } from '@/types/trading';

export async function GET() {
  try {
    const strategyIds = getAllStrategyIds();
    const strategies = strategyIds.map(id => getStrategyMapping(id)).filter(Boolean);

    // Run routing against a neutral regime to show current status
    const neutralRegime: RegimeClassification = {
      regime: 'unknown',
      confidence: 0,
      adx: 0,
      volatilityPercentile: 50,
      trendStrength: 0,
      atrPercent: 0,
      timestamp: Date.now(),
    };
    const routing = routeStrategies(neutralRegime);

    return NextResponse.json({
      strategies,
      count: strategies.length,
      routing,
      note: 'Use GET /api/market/regime to see which strategies are active for current market conditions',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
