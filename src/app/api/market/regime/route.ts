// ============================================================================
// PhantomX — Market Regime API (Agent-Facing)
// ============================================================================
// GET /api/market/regime?symbol=BTC/USDT:USDT&timeframe=4h&limit=100
//
// Returns current market regime classification for the given symbol.
// Defaults: BTC/USDT:USDT, 4h timeframe, 100 candles.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getPhemexClient } from '@/lib/phemex/client';
import { classifyRegime } from '@/lib/market/regime-classifier';
import { routeStrategies } from '@/lib/strategy/regime-router';

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const symbol = params.get('symbol') ?? 'BTC/USDT:USDT';
    const timeframe = params.get('timeframe') ?? '4h';
    const limit = Math.min(Number(params.get('limit') ?? 100), 500);

    let client: ReturnType<typeof getPhemexClient> | null = null;
    try { client = getPhemexClient(); } catch { /* not configured */ }

    if (!client) {
      return NextResponse.json(
        { error: 'Phemex client not configured' },
        { status: 503 },
      );
    }

    const ohlcv = await client.getOHLCV(symbol, timeframe, limit);
    const regime = classifyRegime(ohlcv);

    // Also run the regime router to show which strategies are active
    const routing = routeStrategies(regime);

    return NextResponse.json({
      symbol,
      timeframe,
      candles: ohlcv.length,
      regime,
      strategies: routing,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
