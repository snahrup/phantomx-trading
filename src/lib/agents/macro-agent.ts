// ============================================================================
// PhantomX — Macro Agent (Global Market Conditions)
// ============================================================================
// Monitors BTC dominance, total market cap, DeFi TVL, and macro trends
// via CoinGecko's free API. Publishes macro signals to the Signal Bus.
// No AI calls — pure algorithmic computation from public data.
// ============================================================================

import { BaseAgent } from './base-agent';
import type { AgentSentiment } from '@/types/trading';

interface GlobalData {
  data: {
    active_cryptocurrencies: number;
    total_market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

interface DefiData {
  data: {
    defi_market_cap: string;
    eth_market_cap: string;
    defi_to_eth_ratio: string;
    trading_volume_24h: string;
    defi_dominance: string;
    top_coin_name: string;
    top_coin_defi_dominance: number;
  };
}

export class MacroAgent extends BaseAgent {
  readonly id = 'macro' as const;
  readonly name = 'Macro (Global Markets)';
  readonly defaultIntervalMs = 600_000; // 10 minutes

  private previousMarketCap: number | null = null;
  private previousBtcDominance: number | null = null;

  protected async tick(): Promise<void> {
    const [global, defi] = await Promise.all([
      this.fetchGlobalData(),
      this.fetchDefiData(),
    ]);

    if (!global) {
      throw new Error('Failed to fetch global market data (CoinGecko API unreachable or rate-limited)');
    }

    const totalMarketCap = global.totalMarketCapUsd;
    const btcDominance = global.btcDominance;
    const ethDominance = global.ethDominance;
    const marketCapChange24h = global.marketCapChange24h;
    const totalVolume = global.totalVolumeUsd;

    // Compute momentum signals
    const marketCapTrend = this.previousMarketCap
      ? ((totalMarketCap - this.previousMarketCap) / this.previousMarketCap) * 100
      : 0;
    const btcDominanceDelta = this.previousBtcDominance
      ? btcDominance - this.previousBtcDominance
      : 0;

    this.previousMarketCap = totalMarketCap;
    this.previousBtcDominance = btcDominance;

    // Volume/MarketCap ratio — high ratio = high activity
    const volumeRatio = totalMarketCap > 0 ? (totalVolume / totalMarketCap) * 100 : 0;

    // DeFi metrics
    const defiDominance = defi ? parseFloat(defi.defiDominance) : 0;
    const defiVolume24h = defi ? parseFloat(defi.tradingVolume24h) : 0;

    // Compute composite macro score (0-100)
    // Factors: 24h market cap change, volume ratio, BTC dominance shift
    let score = 50;

    // Market cap momentum (±20 points)
    score += Math.max(-20, Math.min(20, marketCapChange24h * 4));

    // Volume ratio signal (high volume = conviction, ±10 points)
    if (volumeRatio > 8) score += 10;
    else if (volumeRatio > 5) score += 5;
    else if (volumeRatio < 2) score -= 5;

    // BTC dominance falling = altcoin season (bullish for alts), ±10 points
    if (btcDominanceDelta < -0.5) score += 10;
    else if (btcDominanceDelta > 0.5) score -= 5;

    // DeFi activity bonus (±10 points)
    if (defiDominance > 5) score += 5;

    score = Math.max(0, Math.min(100, Math.round(score)));

    let sentiment: AgentSentiment = 'neutral';
    if (score >= 60) sentiment = 'bullish';
    else if (score <= 40) sentiment = 'bearish';

    const confidence = Math.min(100, Math.abs(score - 50) * 2.5);

    this.emit({
      type: 'agent_tick',
      agentId: this.id,
      data: {
        totalMarketCap: Math.round(totalMarketCap / 1e9),
        btcDominance: Math.round(btcDominance * 100) / 100,
        ethDominance: Math.round(ethDominance * 100) / 100,
        marketCapChange24h: Math.round(marketCapChange24h * 100) / 100,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        defiDominance,
        macroScore: score,
      },
      timestamp: Date.now(),
    });

    this.publish({
      confidence: Math.round(confidence),
      sentiment,
      summary: `Total crypto market cap: $${(totalMarketCap / 1e12).toFixed(2)}T (${marketCapChange24h >= 0 ? '+' : ''}${marketCapChange24h.toFixed(1)}% 24h). BTC dominance: ${btcDominance.toFixed(1)}%${btcDominanceDelta !== 0 ? ` (${btcDominanceDelta > 0 ? '+' : ''}${btcDominanceDelta.toFixed(2)}pp)` : ''}. Vol/MCap: ${volumeRatio.toFixed(1)}%. Macro score: ${score}/100.`,
      data: {
        totalMarketCapUsd: totalMarketCap,
        totalMarketCapBillions: Math.round(totalMarketCap / 1e9),
        btcDominance,
        ethDominance,
        marketCapChange24h,
        totalVolumeUsd: totalVolume,
        volumeToMarketCapRatio: volumeRatio,
        marketCapTrend,
        btcDominanceDelta,
        defiDominance,
        defiVolume24h,
        macroScore: score,
      },
    });
  }

  private static readonly COINGECKO_HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'PhantomX/1.0',
  };

  /** Fetch with single retry on failure. */
  private async fetchWithRetry(url: string): Promise<Response | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          headers: MacroAgent.COINGECKO_HEADERS,
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429) {
          // CoinGecko rate limit — wait 2s and retry once
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          return null;
        }
        if (!res.ok) return null;
        return res;
      } catch {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  private async fetchGlobalData(): Promise<{
    totalMarketCapUsd: number;
    totalVolumeUsd: number;
    btcDominance: number;
    ethDominance: number;
    marketCapChange24h: number;
  } | null> {
    const res = await this.fetchWithRetry('https://api.coingecko.com/api/v3/global');
    if (!res) return null;
    try {
      const json = (await res.json()) as GlobalData;
      const d = json.data;
      return {
        totalMarketCapUsd: d.total_market_cap?.usd ?? 0,
        totalVolumeUsd: d.total_volume?.usd ?? 0,
        btcDominance: d.market_cap_percentage?.btc ?? 0,
        ethDominance: d.market_cap_percentage?.eth ?? 0,
        marketCapChange24h: d.market_cap_change_percentage_24h_usd ?? 0,
      };
    } catch {
      return null;
    }
  }

  private async fetchDefiData(): Promise<{
    defiDominance: string;
    tradingVolume24h: string;
  } | null> {
    const res = await this.fetchWithRetry('https://api.coingecko.com/api/v3/global/decentralized_finance_defi');
    if (!res) return null;
    try {
      const json = (await res.json()) as DefiData;
      return {
        defiDominance: json.data?.defi_dominance ?? '0',
        tradingVolume24h: json.data?.trading_volume_24h ?? '0',
      };
    } catch {
      return null;
    }
  }
}
