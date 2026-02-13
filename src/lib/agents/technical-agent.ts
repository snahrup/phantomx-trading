// ============================================================================
// PhantomX — Technical Agent (Price Action & Indicators)
// ============================================================================
// Monitors watchlist symbols via Phemex OHLCV data. Computes SMA, RSI, MACD,
// Bollinger Bands, volume trends, and pattern detection. Publishes technical
// signals to the Signal Bus per symbol + a market-wide composite.
// No AI calls — pure algorithmic computation from exchange data.
// ============================================================================

import { BaseAgent } from './base-agent';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';
import type { AgentSentiment } from '@/types/trading';

interface SymbolTechnicals {
  symbol: string;
  price: number;
  sma7: number | null;
  sma20: number | null;
  sma50: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  volumeTrend: number;   // % change recent vs prior
  atr14: number | null;
  trend: 'up' | 'down' | 'sideways';
  strength: number;      // 0-100
}

export class TechnicalAgent extends BaseAgent {
  readonly id = 'technical' as const;
  readonly name = 'Technical (Price Action)';
  readonly defaultIntervalMs = 120_000; // 2 minutes

  private watchlistSymbols: string[] = [];

  /** Set which symbols to monitor. Called by orchestrator. */
  setWatchlist(symbols: string[]): void {
    this.watchlistSymbols = symbols;
  }

  protected async tick(): Promise<void> {
    if (!isPhemexConfigured()) {
      throw new Error('Phemex not connected');
    }

    if (this.watchlistSymbols.length === 0) {
      return; // Nothing to analyze
    }

    const client = getPhemexClient();
    const results: SymbolTechnicals[] = [];

    // Fetch OHLCV for each symbol in parallel
    const fetches = await Promise.allSettled(
      this.watchlistSymbols.map(async (sym) => {
        const ohlcv = await client.getOHLCV(sym, '1h', 60);
        return { sym, ohlcv };
      })
    );

    for (const result of fetches) {
      if (result.status !== 'fulfilled') continue;
      const { sym, ohlcv } = result.value;
      if (ohlcv.length < 20) continue;

      const closes = ohlcv.map(c => c.close);
      const highs = ohlcv.map(c => c.high);
      const lows = ohlcv.map(c => c.low);
      const volumes = ohlcv.map(c => c.volume);
      const price = closes[closes.length - 1];

      const sma7 = this.sma(closes, 7);
      const sma20 = this.sma(closes, 20);
      const sma50 = this.sma(closes, 50);
      const rsi14 = this.rsi(closes, 14);
      const { line: macdLine, signal: macdSignal, histogram: macdHistogram } = this.macd(closes);
      const { upper: bbUpper, middle: bbMiddle, lower: bbLower } = this.bollingerBands(closes, 20, 2);
      const atr14 = this.atr(highs, lows, closes, 14);

      // Volume trend: compare last 5 bars vs prior 5 bars
      const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0);
      const priorVol = volumes.slice(-10, -5).reduce((s, v) => s + v, 0);
      const volumeTrend = priorVol > 0 ? ((recentVol - priorVol) / priorVol) * 100 : 0;

      // Determine trend
      let trend: 'up' | 'down' | 'sideways' = 'sideways';
      if (sma7 && sma20 && sma50) {
        if (sma7 > sma20 && sma20 > sma50) trend = 'up';
        else if (sma7 < sma20 && sma20 < sma50) trend = 'down';
      } else if (sma7 && sma20) {
        trend = sma7 > sma20 ? 'up' : 'down';
      }

      // Compute strength (0-100) from multiple signals
      let strength = 50;

      // SMA alignment (±15)
      if (trend === 'up') strength += 15;
      else if (trend === 'down') strength -= 15;

      // RSI (±15)
      if (rsi14 !== null) {
        if (rsi14 > 70) strength += 10;       // overbought but strong momentum
        else if (rsi14 > 55) strength += 15;  // healthy bullish
        else if (rsi14 < 30) strength -= 10;  // oversold but weak
        else if (rsi14 < 45) strength -= 15;  // weak bearish
      }

      // MACD (±10)
      if (macdHistogram !== null) {
        if (macdHistogram > 0) strength += 10;
        else strength -= 10;
      }

      // Bollinger Band position (±10)
      if (bbUpper && bbLower && bbMiddle) {
        const bbPosition = (price - bbLower) / (bbUpper - bbLower);
        if (bbPosition > 0.8) strength += 5;   // near upper = momentum
        else if (bbPosition < 0.2) strength -= 5; // near lower = weakness
      }

      // Volume trend confirmation (±5)
      if (volumeTrend > 20 && trend === 'up') strength += 5;
      else if (volumeTrend > 20 && trend === 'down') strength -= 5;

      strength = Math.max(0, Math.min(100, Math.round(strength)));

      results.push({
        symbol: sym,
        price,
        sma7, sma20, sma50,
        rsi14,
        macdLine, macdSignal, macdHistogram,
        bbUpper, bbMiddle, bbLower,
        volumeTrend: Math.round(volumeTrend * 100) / 100,
        atr14,
        trend,
        strength,
      });
    }

    if (results.length === 0) return;

    // Market-wide composite
    const avgStrength = Math.round(
      results.reduce((sum, r) => sum + r.strength, 0) / results.length
    );
    const bullishCount = results.filter(r => r.strength >= 60).length;
    const bearishCount = results.filter(r => r.strength <= 40).length;

    let sentiment: AgentSentiment = 'neutral';
    if (avgStrength >= 60) sentiment = 'bullish';
    else if (avgStrength <= 40) sentiment = 'bearish';

    const confidence = Math.min(100, Math.abs(avgStrength - 50) * 2.5);

    // Per-symbol data for the Commander
    const symbolBreakdown = results.map(r => ({
      symbol: r.symbol.replace('/USDT:USDT', ''),
      price: r.price,
      trend: r.trend,
      strength: r.strength,
      rsi14: r.rsi14 !== null ? Math.round(r.rsi14 * 10) / 10 : null,
      macdHistogram: r.macdHistogram !== null ? Math.round(r.macdHistogram * 1000) / 1000 : null,
      volumeTrend: r.volumeTrend,
    }));

    const strongestSymbol = results.reduce((best, r) => r.strength > best.strength ? r : best, results[0]);
    const weakestSymbol = results.reduce((worst, r) => r.strength < worst.strength ? r : worst, results[0]);

    this.emit({
      type: 'agent_tick',
      agentId: this.id,
      data: {
        symbolsAnalyzed: results.length,
        avgStrength,
        bullishCount,
        bearishCount,
        strongest: strongestSymbol.symbol.replace('/USDT:USDT', ''),
        weakest: weakestSymbol.symbol.replace('/USDT:USDT', ''),
      },
      timestamp: Date.now(),
    });

    this.publish({
      confidence: Math.round(confidence),
      sentiment,
      summary: `${results.length} symbols analyzed. Avg strength: ${avgStrength}/100. ${bullishCount} bullish, ${bearishCount} bearish. Strongest: ${strongestSymbol.symbol.replace('/USDT:USDT', '')} (${strongestSymbol.strength}). Weakest: ${weakestSymbol.symbol.replace('/USDT:USDT', '')} (${weakestSymbol.strength}).`,
      data: {
        avgStrength,
        bullishCount,
        bearishCount,
        symbolBreakdown,
        strongestSymbol: strongestSymbol.symbol,
        weakestSymbol: weakestSymbol.symbol,
      },
      symbols: this.watchlistSymbols,
    });
  }

  // --- Indicator Calculations ---

  private sma(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((s, p) => s + p, 0) / period;
  }

  private rsi(prices: number[], period: number): number | null {
    if (prices.length < period + 1) return null;
    const changes = prices.slice(-(period + 1)).map((p, i, arr) =>
      i > 0 ? p - arr[i - 1] : 0
    ).slice(1);

    const gains = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((s, g) => s + g, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, l) => s + l, 0) / period : 0;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private macd(prices: number[], fast = 12, slow = 26, signal = 9): {
    line: number | null;
    signal: number | null;
    histogram: number | null;
  } {
    if (prices.length < slow + signal) return { line: null, signal: null, histogram: null };

    const emaFast = this.ema(prices, fast);
    const emaSlow = this.ema(prices, slow);
    if (emaFast === null || emaSlow === null) return { line: null, signal: null, histogram: null };

    // Compute MACD line for recent bars
    const macdValues: number[] = [];
    const fastArr = this.emaArray(prices, fast);
    const slowArr = this.emaArray(prices, slow);
    const minLen = Math.min(fastArr.length, slowArr.length);
    for (let i = 0; i < minLen; i++) {
      macdValues.push(fastArr[fastArr.length - minLen + i] - slowArr[slowArr.length - minLen + i]);
    }

    if (macdValues.length < signal) return { line: emaFast - emaSlow, signal: null, histogram: null };

    const signalLine = this.emaFromArray(macdValues, signal);
    const macdLine = macdValues[macdValues.length - 1];
    const histogram = signalLine !== null ? macdLine - signalLine : null;

    return { line: macdLine, signal: signalLine, histogram };
  }

  private bollingerBands(prices: number[], period: number, stdDevMultiplier: number): {
    upper: number | null;
    middle: number | null;
    lower: number | null;
  } {
    if (prices.length < period) return { upper: null, middle: null, lower: null };
    const slice = prices.slice(-period);
    const middle = slice.reduce((s, p) => s + p, 0) / period;
    const variance = slice.reduce((s, p) => s + Math.pow(p - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return {
      upper: middle + stdDev * stdDevMultiplier,
      middle,
      lower: middle - stdDev * stdDevMultiplier,
    };
  }

  private atr(highs: number[], lows: number[], closes: number[], period: number): number | null {
    if (highs.length < period + 1) return null;
    const trueRanges: number[] = [];
    for (let i = highs.length - period; i < highs.length; i++) {
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(hl, hc, lc));
    }
    return trueRanges.reduce((s, tr) => s + tr, 0) / period;
  }

  private ema(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private emaArray(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = [];
    let ema = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
    result.push(ema);
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }

  private emaFromArray(values: number[], period: number): number | null {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }
}
