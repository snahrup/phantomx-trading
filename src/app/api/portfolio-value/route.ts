// ============================================================================
// PhantomX — Portfolio Value API (for Nexus dashboard integration)
// Returns current portfolio value, PnL, and position breakdown
// ============================================================================

import { NextResponse } from 'next/server';
import { getPortfolioHeartbeatEngine } from '@/lib/ai/portfolio-heartbeat-engine';
import { getHeartbeatEngine } from '@/lib/ai/heartbeat-engine';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';

export async function GET() {
  try {
    // Check if Phemex is configured
    if (!isPhemexConfigured()) {
      return NextResponse.json({
        connected: false,
        value: 0,
        source: 'not_configured',
      });
    }

    // Try to get live data from running engine first (avoids extra API calls)
    const portfolioEngine = getPortfolioHeartbeatEngine();
    if (portfolioEngine?.isActive()) {
      const status = portfolioEngine.getStatus();
      const pnl = portfolioEngine.getPnlSummary();
      const portfolio = status.portfolio;

      return NextResponse.json({
        connected: true,
        autopilotRunning: true,
        autopilotMode: 'portfolio',
        value: portfolio?.totalEquity ?? 0,
        availableCash: portfolio?.availableCash ?? 0,
        cashPercent: portfolio?.cashPercent ?? 0,
        unrealizedPnl: portfolio?.totalUnrealizedPnl ?? 0,
        dailyPnlPercent: portfolio?.dailyPnlPercent ?? 0,
        positions: portfolio?.positions.map(p => ({
          symbol: p.symbol.replace('/USDT:USDT', ''),
          side: p.side,
          allocationPercent: p.allocationPercent,
          unrealizedPnl: p.unrealizedPnl,
          notionalValue: p.notionalValue,
        })) ?? [],
        pnl: {
          cumulativeRealized: pnl.cumulativeRealizedPnl,
          closedTrades: pnl.closedTradeCount,
          winRate: pnl.winRate,
          sessionStartEquity: pnl.sessionStartEquity,
          totalReturnPercent: pnl.totalReturnPercent,
        },
        tickCount: status.tickCount,
        timestamp: Date.now(),
      });
    }

    // Check single-symbol engine
    const singleEngine = getHeartbeatEngine();
    if (singleEngine?.isActive()) {
      const status = singleEngine.getStatus();
      return NextResponse.json({
        connected: true,
        autopilotRunning: true,
        autopilotMode: 'single',
        value: 0, // single engine doesn't track total portfolio
        ...status,
        timestamp: Date.now(),
      });
    }

    // No engine running — fetch live from Phemex
    const client = getPhemexClient();
    const [account, positions] = await Promise.all([
      client.getAccountInfo(),
      client.getPositions(),
    ]);

    const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

    return NextResponse.json({
      connected: true,
      autopilotRunning: false,
      value: account.totalUsdValue,
      unrealizedPnl: totalPnl,
      positions: positions.map(p => ({
        symbol: p.symbol.replace('/USDT:USDT', ''),
        side: p.side,
        size: p.size,
        unrealizedPnl: p.unrealizedPnl,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
      })),
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      error: String(err),
      value: 0,
      timestamp: Date.now(),
    });
  }
}
