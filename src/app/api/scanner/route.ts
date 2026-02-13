// ============================================================================
// PhantomX — Deep Futures Scanner API
// Scans ALL Phemex futures for low-price, high-leverage gems near ATL
// Uses Claude Agent SDK for AI-powered ranking
// ============================================================================

import { NextResponse } from 'next/server';
import { getPhemexClient } from '@/lib/phemex/client';
import { getTradingAssistant } from '@/lib/ai/trading-assistant';

interface ScannedToken {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  maxLeverage: number | null;
  distanceFromLow: number;   // % above 24h low
  volumeUsdApprox: number;
}

export async function POST() {
  try {
    let client;
    try { client = getPhemexClient(); } catch {
      return NextResponse.json({ error: 'Not connected to Phemex. Connect first.' }, { status: 400 });
    }
    const exchange = client.getExchange();

    // 1. Load all markets
    const markets = await exchange.loadMarkets();
    const swapSymbols = Object.values(markets).filter(m =>
      m && m.swap && m.active && m.quote === 'USDT'
    );

    console.log(`[Scanner] Found ${swapSymbols.length} active USDT perpetual futures`);

    // 2. Fetch all tickers in one batch call
    const allTickers = await exchange.fetchTickers(
      swapSymbols.map(m => m!.symbol)
    );

    // 3. Filter and enrich: low price, has leverage, near bottom
    const candidates: ScannedToken[] = [];

    for (const market of swapSymbols) {
      if (!market) continue;
      const ticker = allTickers[market.symbol];
      if (!ticker || !ticker.last || ticker.last <= 0) continue;

      const price = ticker.last;
      const high24h = ticker.high ?? price;
      const low24h = ticker.low ?? price;
      const change24h = ticker.percentage ?? 0;
      const volume24h = ticker.baseVolume ?? 0;
      const quoteVolume = ticker.quoteVolume ?? 0;

      // Price filter: $0 - $0.10
      if (price > 0.10) continue;

      // Need some volume — skip dead markets
      if (quoteVolume < 10000) continue;

      // Calculate distance from 24h low
      const distanceFromLow = low24h > 0 ? ((price - low24h) / low24h) * 100 : 0;

      // Get max leverage from market info
      const maxLeverage = market.limits?.leverage?.max ?? null;

      // Only include tokens with up to 50x leverage available
      if (maxLeverage !== null && maxLeverage < 20) continue;

      candidates.push({
        symbol: market.symbol,
        price,
        change24h,
        volume24h,
        high24h,
        low24h,
        maxLeverage: maxLeverage ? Number(maxLeverage) : null,
        distanceFromLow,
        volumeUsdApprox: quoteVolume,
      });
    }

    console.log(`[Scanner] ${candidates.length} candidates after filtering (price ≤ $0.10, vol > $10k)`);

    // 4. Sort by proximity to bottom + negative momentum (biggest dumps = biggest bounce potential)
    candidates.sort((a, b) => {
      // Score: lower distance from low + more negative change = better
      const scoreA = a.distanceFromLow - Math.min(0, a.change24h) * 0.5;
      const scoreB = b.distanceFromLow - Math.min(0, b.change24h) * 0.5;
      return scoreA - scoreB;
    });

    // Take top 20 candidates for AI analysis
    const topCandidates = candidates.slice(0, 20);

    if (topCandidates.length === 0) {
      return NextResponse.json({
        results: [],
        scanned: swapSymbols.length,
        filtered: 0,
        message: 'No tokens matched the criteria (price ≤ $0.10, volume > $10k, leverage ≥ 20x)',
      });
    }

    // 5. Fetch OHLCV for top candidates to get multi-day context
    const enriched = await Promise.all(
      topCandidates.map(async (c) => {
        try {
          const ohlcv = await exchange.fetchOHLCV(c.symbol, '1d', undefined, 30);
          const prices = ohlcv.map(candle => candle[4] as number); // close prices
          const allTimeLow = Math.min(...prices);
          const allTimeHigh = Math.max(...prices);
          const distFromATL = allTimeLow > 0 ? ((c.price - allTimeLow) / allTimeLow) * 100 : 0;
          const distFromATH = allTimeHigh > 0 ? ((allTimeHigh - c.price) / allTimeHigh) * 100 : 0;

          // SMA crossover detection
          const sma7 = prices.length >= 7
            ? prices.slice(-7).reduce((s, p) => s + p, 0) / 7
            : null;
          const sma20 = prices.length >= 20
            ? prices.slice(-20).reduce((s, p) => s + p, 0) / 20
            : null;
          const smaSignal = sma7 && sma20
            ? sma7 > sma20 ? 'bullish_cross' : sma7 < sma20 ? 'bearish' : 'neutral'
            : 'insufficient_data';

          // Volume trend (last 3 days vs prior 3 days)
          const recentVol = ohlcv.slice(-3).reduce((s, c) => s + (c[5] as number), 0);
          const priorVol = ohlcv.slice(-6, -3).reduce((s, c) => s + (c[5] as number), 0);
          const volumeTrend = priorVol > 0 ? ((recentVol - priorVol) / priorVol) * 100 : 0;

          return {
            ...c,
            allTimeLow30d: allTimeLow,
            allTimeHigh30d: allTimeHigh,
            distFromATL,
            distFromATH,
            smaSignal,
            volumeTrend,
            dailyPrices: prices.slice(-7),
          };
        } catch {
          return { ...c, allTimeLow30d: c.low24h, allTimeHigh30d: c.high24h, distFromATL: c.distanceFromLow, distFromATH: 0, smaSignal: 'unknown', volumeTrend: 0, dailyPrices: [] };
        }
      })
    );

    // 6. AI analysis — ask Claude to pick top 5 and explain why
    const dataForAI = enriched.map((t, i) => (
      `${i + 1}. ${t.symbol}
   Price: $${t.price.toFixed(6)} | 24h Change: ${t.change24h.toFixed(2)}%
   24h Vol (USD): $${t.volumeUsdApprox.toFixed(0)} | Max Leverage: ${t.maxLeverage ?? 'unknown'}x
   30d Low: $${t.allTimeLow30d.toFixed(6)} (${t.distFromATL.toFixed(1)}% above) | 30d High: $${t.allTimeHigh30d.toFixed(6)} (${t.distFromATH.toFixed(1)}% below)
   SMA 7/20 Signal: ${t.smaSignal} | Volume Trend (3d): ${t.volumeTrend > 0 ? '+' : ''}${t.volumeTrend.toFixed(1)}%
   Last 7 daily closes: ${t.dailyPrices.map(p => '$' + p.toFixed(6)).join(' → ')}`
    )).join('\n\n');

    const assistant = getTradingAssistant();
    const aiResponse = await assistant.chat(
      `DEEP SCAN RESULTS — Phemex Futures Market

I just scanned ${swapSymbols.length} Phemex perpetual futures and filtered down to ${enriched.length} candidates that match my criteria:
- Token price: $0 - $0.10
- USDT quote volume > $10k/24h
- Leverage available ≥ 20x

Here are the candidates with their data:

${dataForAI}

Based on this data, pick the TOP 5 tokens that offer the biggest profit opportunity for today's trading session. For each pick, explain:
1. WHY this token (what makes it stand out)
2. The setup you see (SMA crossover, bounce from ATL, volume surge, etc.)
3. Specific entry price range
4. Stop loss and take profit levels
5. Suggested leverage (considering the risk)
6. Confidence level (1-10)

Focus on tokens that are:
- At or very near their 30-day all-time low (biggest bounce potential)
- Showing volume increases (smart money accumulating)
- About to or just completed an SMA crossover (momentum shift)
- Have high max leverage available (50x preferred for scalping)

Format your response as a clear ranked list. Be specific with numbers.`
    );

    return NextResponse.json({
      results: enriched.slice(0, 20),
      aiAnalysis: aiResponse.content,
      aiThinking: aiResponse.metadata?.thinkingContent,
      scanned: swapSymbols.length,
      filtered: candidates.length,
      timestamp: Date.now(),
    });

  } catch (err) {
    console.error('[Scanner] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
