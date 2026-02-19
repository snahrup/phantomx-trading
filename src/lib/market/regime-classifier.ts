// ============================================================================
// PhantomX — Real-Time Market Regime Classifier
// Classifies market as trending_up/trending_down/ranging/volatile
// ============================================================================

import type { OHLCV, MarketRegime, RegimeClassification } from '@/types/trading';

// --- Indicator Helpers (self-contained, no external deps) ---

function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const k = 2 / (period + 1);
  let em = values[0];
  for (let i = 1; i < values.length; i++) {
    em = values[i] * k + em * (1 - k);
  }
  return em;
}

function trueRange(bars: OHLCV[]): number[] {
  const tr: number[] = [bars[0].high - bars[0].low];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return tr;
}

function atr(bars: OHLCV[], period = 14): number {
  const tr = trueRange(bars);
  if (tr.length < period) return NaN;
  return sma(tr, period);
}

function adx(bars: OHLCV[], period = 14): number {
  if (bars.length < period * 2) return NaN;

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr = trueRange(bars);

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smoothed averages
  const smoothedTR = ema(tr.slice(1), period);
  const smoothedPlusDM = ema(plusDM, period);
  const smoothedMinusDM = ema(minusDM, period);

  if (smoothedTR === 0) return 0;

  const plusDI = (smoothedPlusDM / smoothedTR) * 100;
  const minusDI = (smoothedMinusDM / smoothedTR) * 100;
  const diSum = plusDI + minusDI;

  if (diSum === 0) return 0;

  const dx = (Math.abs(plusDI - minusDI) / diSum) * 100;
  return dx; // Single-pass approximation; close enough for regime detection
}

function stddev(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

// --- Percentile Rank ---

function percentileRank(value: number, history: number[]): number {
  if (history.length === 0) return 50;
  const below = history.filter(v => v < value).length;
  return (below / history.length) * 100;
}

// ============================================================================
// Classify Market Regime
// ============================================================================

export function classifyRegime(bars: OHLCV[], lookbackPeriod = 50): RegimeClassification {
  if (bars.length < lookbackPeriod) {
    return {
      regime: 'unknown',
      confidence: 0,
      adx: 0,
      volatilityPercentile: 50,
      trendStrength: 0,
      atrPercent: 0,
      timestamp: Date.now(),
    };
  }

  const recentBars = bars.slice(-lookbackPeriod);
  const closes = recentBars.map(b => b.close);
  const currentPrice = closes.at(-1)!;

  // 1. ADX — trend strength
  const adxValue = adx(recentBars, 14);

  // 2. ATR as % of price — volatility
  const atrValue = atr(recentBars, 14);
  const atrPct = (atrValue / currentPrice) * 100;

  // Historical ATR% for percentile ranking
  const atrHistory: number[] = [];
  for (let i = lookbackPeriod; i >= 14; i--) {
    const windowBars = bars.slice(-i, -i + 14);
    if (windowBars.length >= 14) {
      const a = atr(windowBars, 14);
      const p = windowBars.at(-1)!.close;
      if (p > 0) atrHistory.push((a / p) * 100);
    }
  }
  const volPercentile = percentileRank(atrPct, atrHistory);

  // 3. Trend direction — EMA slope
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, Math.min(50, closes.length));
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, Math.min(50, closes.length));

  // Trend strength: normalized distance between fast/slow MAs
  const trendStrength = sma50 > 0
    ? (sma20 - sma50) / sma50
    : 0;

  // 4. Bollinger Band width (normalized)
  const bbStd = stddev(closes, 20);
  const bbWidth = sma20 > 0 ? (bbStd * 2) / sma20 : 0;

  // --- Regime Decision ---
  let regime: MarketRegime;
  let confidence: number;

  if (adxValue > 30 && Math.abs(trendStrength) > 0.01) {
    // Strong trend
    regime = trendStrength > 0 ? 'trending_up' : 'trending_down';
    confidence = Math.min(0.95, (adxValue / 50) * 0.7 + Math.abs(trendStrength) * 10 * 0.3);
  } else if (volPercentile > 80 || atrPct > 3) {
    // High volatility without clear trend
    regime = 'volatile';
    confidence = Math.min(0.9, volPercentile / 100);
  } else if (adxValue < 20 && bbWidth < 0.04) {
    // Low ADX + tight BB = ranging
    regime = 'ranging';
    confidence = Math.min(0.85, (1 - adxValue / 25) * 0.6 + (1 - bbWidth / 0.05) * 0.4);
  } else if (adxValue >= 20 && adxValue <= 30) {
    // Transitional — weak trend
    regime = trendStrength > 0.005 ? 'trending_up' : trendStrength < -0.005 ? 'trending_down' : 'ranging';
    confidence = 0.5;
  } else {
    regime = 'ranging';
    confidence = 0.4;
  }

  return {
    regime,
    confidence,
    adx: adxValue,
    volatilityPercentile: volPercentile,
    trendStrength,
    atrPercent: atrPct,
    timestamp: Date.now(),
  };
}

// --- Strategy Compatibility ---

export function isStrategyCompatibleWithRegime(
  strategyType: string,
  regime: MarketRegime,
): boolean {
  const compatibility: Record<string, MarketRegime[]> = {
    'hft_scalp': ['volatile', 'ranging'],
    'market_making': ['ranging'],
    'momentum': ['trending_up', 'trending_down', 'volatile'],
    'mean_reversion': ['ranging', 'volatile'],
    'trend_following': ['trending_up', 'trending_down'],
    'grid': ['ranging', 'volatile'],
    'funding_arb': ['trending_up', 'trending_down', 'ranging', 'volatile'], // regime-agnostic
    'breakout': ['ranging'], // ranges break out
  };

  return compatibility[strategyType]?.includes(regime) ?? true;
}
