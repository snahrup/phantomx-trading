// ============================================================================
// PhantomX — Strategy Scanner API
// Runs all 4 active strategies (EFR, FRC, EMA Ribbon, LSR) against
// Phemex perpetual futures and returns structured alerts.
//
// POST /api/strategy-scan
// Body: { symbols?: string[], timeframe?: string, limit?: number }
//
// If no symbols provided, scans the default watchlist (20 pairs).
// ============================================================================

import { NextResponse } from 'next/server';
import { getPhemexClient } from '@/lib/phemex/client';
import { scanAll, formatAlertsAsMarkdown, type ScanInput } from '@/lib/scanner/strategy-scanner';

const DEFAULT_PAIRS = [
  'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'XRP/USDT:USDT',
  'SUI/USDT:USDT', 'DOGE/USDT:USDT', 'LINK/USDT:USDT', 'AVAX/USDT:USDT',
  'NEAR/USDT:USDT', 'HYPE/USDT:USDT', 'TAO/USDT:USDT', 'WIF/USDT:USDT',
  'ONDO/USDT:USDT', 'ARB/USDT:USDT', 'OP/USDT:USDT', 'APT/USDT:USDT',
  'SEI/USDT:USDT', 'INJ/USDT:USDT', 'BNB/USDT:USDT', 'DOT/USDT:USDT',
];

const RATE_LIMIT_MS = 2500; // Phemex rate limit safe margin

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  try {
    let client;
    try { client = getPhemexClient(); } catch {
      return NextResponse.json({ error: 'Not connected to Phemex. Connect first.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const symbols: string[] = body.symbols || DEFAULT_PAIRS;
    const ohlcvLimit: number = body.limit || 100; // Need 56+ for EMA(55)

    console.log(`[Strategy Scanner] Scanning ${symbols.length} symbols with ${ohlcvLimit} candles`);

    const inputs: ScanInput[] = [];

    for (const symbol of symbols) {
      try {
        // Fetch 4H OHLCV
        const ohlcv4h = await client.getOHLCV(symbol, '4h', ohlcvLimit);
        if (!ohlcv4h || ohlcv4h.length < 20) {
          console.log(`[Strategy Scanner] ${symbol}: insufficient data (${ohlcv4h?.length ?? 0} candles)`);
          await sleep(RATE_LIMIT_MS);
          continue;
        }

        await sleep(RATE_LIMIT_MS);

        // Fetch funding rate
        let funding;
        try {
          const fr = await client.getFundingRate(symbol);
          const frHistory = await client.getFundingRateHistory(symbol, undefined, 5);
          await sleep(RATE_LIMIT_MS);

          funding = {
            currentRate: fr.fundingRate,
            history: frHistory.map((h: { fundingRate: number }) => h.fundingRate),
          };
        } catch {
          // Some symbols may not have funding rate data
          console.log(`[Strategy Scanner] ${symbol}: no funding data available`);
        }

        // Fetch 15m OHLCV for LSR confirmation (only for LSR symbols)
        let ohlcv15m;
        if (['BTC/USDT:USDT', 'SOL/USDT:USDT'].includes(symbol)) {
          try {
            ohlcv15m = await client.getOHLCV(symbol, '15m', 50);
            await sleep(RATE_LIMIT_MS);
          } catch {
            console.log(`[Strategy Scanner] ${symbol}: no 15m data available`);
          }
        }

        inputs.push({
          symbol,
          ohlcv4h,
          ohlcv15m,
          funding,
        });

      } catch (err) {
        console.error(`[Strategy Scanner] ${symbol}: fetch error -`, err);
        await sleep(RATE_LIMIT_MS);
      }
    }

    if (inputs.length === 0) {
      return NextResponse.json({
        error: 'No valid data fetched for any symbol',
        symbolsAttempted: symbols.length,
      }, { status: 500 });
    }

    // Run the scanner
    const { results, summary } = scanAll(inputs);
    const markdown = formatAlertsAsMarkdown(results);

    console.log(`[Strategy Scanner] Complete: ${summary.symbolsScanned} scanned, ${summary.totalAlerts} alerts, ${summary.entrySignals} entry signals`);

    return NextResponse.json({
      results,
      summary,
      markdown,
      timestamp: Date.now(),
    });

  } catch (err) {
    console.error('[Strategy Scanner] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
