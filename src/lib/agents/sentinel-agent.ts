// ============================================================================
// PhantomX — Sentinel Agent (Market Sentiment)
// ============================================================================
// Monitors Fear & Greed Index, trending coins, and social sentiment
// via CoinGecko's free API. Publishes sentiment signals to the Signal Bus.
// No AI calls — pure algorithmic computation from public data.
// ============================================================================

import { BaseAgent } from './base-agent';
import type { AgentSentiment } from '@/types/trading';

interface FearGreedResponse {
  data: Array<{ value: string; value_classification: string; timestamp: string }>;
}

interface TrendingResponse {
  coins: Array<{
    item: {
      id: string;
      coin_id: number;
      name: string;
      symbol: string;
      market_cap_rank: number;
      price_btc: number;
      score: number;
      data?: {
        price_change_percentage_24h?: Record<string, number>;
      };
    };
  }>;
}

export class SentinelAgent extends BaseAgent {
  readonly id = 'sentinel' as const;
  readonly name = 'Sentinel (Sentiment)';
  readonly defaultIntervalMs = 300_000; // 5 minutes

  protected async tick(): Promise<void> {
    const [fearGreed, trending] = await Promise.all([
      this.fetchFearGreed(),
      this.fetchTrending(),
    ]);

    // Compute composite sentiment
    const fgValue = fearGreed?.value ?? 50;
    const fgClassification = fearGreed?.classification ?? 'Neutral';
    const trendingBullish = trending.filter(t => (t.priceChange24h ?? 0) > 0).length;
    const trendingBearish = trending.filter(t => (t.priceChange24h ?? 0) < 0).length;
    const trendingMomentum = trending.length > 0
      ? trending.reduce((sum, t) => sum + (t.priceChange24h ?? 0), 0) / trending.length
      : 0;

    // Score: 0-100 where 0=extreme fear, 100=extreme greed
    // Combine Fear & Greed (60% weight) with trending momentum (40% weight)
    const momentumScore = Math.max(0, Math.min(100, 50 + trendingMomentum * 2));
    const compositeScore = Math.round(fgValue * 0.6 + momentumScore * 0.4);

    let sentiment: AgentSentiment = 'neutral';
    if (compositeScore >= 65) sentiment = 'bullish';
    else if (compositeScore <= 35) sentiment = 'bearish';

    const confidence = Math.min(100, Math.abs(compositeScore - 50) * 2);

    this.emit({
      type: 'agent_tick',
      agentId: this.id,
      data: {
        fearGreedIndex: fgValue,
        fearGreedClassification: fgClassification,
        trendingCoins: trending.slice(0, 5).map(t => t.symbol),
        trendingBullish,
        trendingBearish,
        trendingMomentum: Math.round(trendingMomentum * 100) / 100,
        compositeScore,
      },
      timestamp: Date.now(),
    });

    this.publish({
      confidence,
      sentiment,
      summary: `Fear & Greed: ${fgValue} (${fgClassification}). Trending momentum: ${trendingMomentum > 0 ? '+' : ''}${trendingMomentum.toFixed(1)}%. ${trendingBullish}/${trending.length} trending coins green. Composite: ${compositeScore}/100.`,
      data: {
        fearGreedIndex: fgValue,
        fearGreedClassification: fgClassification,
        compositeScore,
        trendingCoins: trending.slice(0, 7).map(t => ({
          symbol: t.symbol,
          name: t.name,
          rank: t.rank,
          priceChange24h: t.priceChange24h,
        })),
        trendingBullishCount: trendingBullish,
        trendingBearishCount: trendingBearish,
        trendingMomentum,
      },
    });
  }

  private async fetchFearGreed(): Promise<{ value: number; classification: string } | null> {
    try {
      const res = await fetch('https://api.alternative.me/fng/?limit=1', {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as FearGreedResponse;
      const entry = data.data?.[0];
      if (!entry) return null;
      return {
        value: parseInt(entry.value, 10),
        classification: entry.value_classification,
      };
    } catch {
      return null;
    }
  }

  private async fetchTrending(): Promise<Array<{
    symbol: string;
    name: string;
    rank: number;
    priceChange24h: number | null;
  }>> {
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/search/trending', {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as TrendingResponse;
      return (data.coins ?? []).map(c => ({
        symbol: c.item.symbol.toUpperCase(),
        name: c.item.name,
        rank: c.item.market_cap_rank ?? 999,
        priceChange24h: c.item.data?.price_change_percentage_24h?.usd ?? null,
      }));
    } catch {
      return [];
    }
  }
}
