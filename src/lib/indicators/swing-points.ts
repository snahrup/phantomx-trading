// ============================================================================
// PhantomX — Swing Point Detector & Liquidity Pool Scanner
// Used by: Liquidity Sweep Reversal (LSR) v1.0
// ============================================================================

import type { OHLCV } from '@/types/trading';

export interface SwingPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
  timestamp: number;
}

export interface LiquidityPool {
  type: 'high' | 'low';
  level: number;
  touches: number;
  firstTouch: number;
  lastTouch: number;
  points: SwingPoint[];
}

export type SweepDirection = 'bullish_sweep' | 'bearish_sweep';

export interface SweepEvent {
  direction: SweepDirection;
  pool: LiquidityPool;
  sweepCandle: OHLCV;
  sweepDistance: number; // % beyond pool level
  candleQuality: number; // body-to-total ratio (0-1)
}

/**
 * Detect swing highs and lows using a lookback window.
 * A swing high is a candle whose high is greater than the N candles on either side.
 * A swing low is a candle whose low is less than the N candles on either side.
 */
export function detectSwingPoints(
  candles: OHLCV[],
  lookback: number = 5
): SwingPoint[] {
  const points: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const candle = candles[i];

    // Check swing high
    let isSwingHigh = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= candle.high || candles[i + j].high >= candle.high) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) {
      points.push({
        index: i,
        price: candle.high,
        type: 'high',
        timestamp: candle.timestamp,
      });
    }

    // Check swing low
    let isSwingLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].low <= candle.low || candles[i + j].low <= candle.low) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) {
      points.push({
        index: i,
        price: candle.low,
        type: 'low',
        timestamp: candle.timestamp,
      });
    }
  }

  return points;
}

/**
 * Cluster swing points into liquidity pools.
 * Points of the same type within `tolerance` % of each other form a pool.
 */
export function detectLiquidityPools(
  swings: SwingPoint[],
  tolerance: number = 0.003
): LiquidityPool[] {
  const pools: LiquidityPool[] = [];
  const used = new Set<number>();

  // Process highs and lows separately
  for (const poolType of ['high', 'low'] as const) {
    const typed = swings.filter(s => s.type === poolType);

    for (let i = 0; i < typed.length; i++) {
      if (used.has(typed[i].index)) continue;

      const cluster: SwingPoint[] = [typed[i]];
      used.add(typed[i].index);

      for (let j = i + 1; j < typed.length; j++) {
        if (used.has(typed[j].index)) continue;
        const diff = Math.abs(typed[i].price - typed[j].price) / typed[i].price;
        if (diff <= tolerance) {
          cluster.push(typed[j]);
          used.add(typed[j].index);
        }
      }

      if (cluster.length >= 2) {
        const avgPrice = cluster.reduce((sum, p) => sum + p.price, 0) / cluster.length;
        pools.push({
          type: poolType,
          level: avgPrice,
          touches: cluster.length,
          firstTouch: Math.min(...cluster.map(p => p.timestamp)),
          lastTouch: Math.max(...cluster.map(p => p.timestamp)),
          points: cluster,
        });
      }
    }
  }

  // Sort by number of touches (more touches = stronger pool)
  return pools.sort((a, b) => b.touches - a.touches);
}

/**
 * Detect if a candle has swept a liquidity pool and reversed.
 *
 * Bullish sweep of highs: candle high exceeds pool, close is below pool → SHORT setup
 * Bearish sweep of lows: candle low goes below pool, close is above pool → LONG setup
 */
export function detectSweep(
  candle: OHLCV,
  pool: LiquidityPool,
  minSweep: number = 0.001,
  maxSweep: number = 0.005
): SweepEvent | null {
  const totalHeight = candle.high - candle.low;
  if (totalHeight <= 0) return null;

  const bodyTop = Math.max(candle.open, candle.close);
  const bodyBottom = Math.min(candle.open, candle.close);
  const bodyHeight = bodyTop - bodyBottom;
  const candleQuality = bodyHeight / totalHeight;

  if (pool.type === 'high') {
    // Check if candle swept above the pool highs then closed below
    const sweepDist = (candle.high - pool.level) / pool.level;
    if (sweepDist >= minSweep && sweepDist <= maxSweep && candle.close < pool.level) {
      // Bearish reversal candle (close near low)
      if (candleQuality >= 0.6) {
        return {
          direction: 'bearish_sweep', // Swept highs → go short
          pool,
          sweepCandle: candle,
          sweepDistance: sweepDist,
          candleQuality,
        };
      }
    }
  }

  if (pool.type === 'low') {
    // Check if candle swept below the pool lows then closed above
    const sweepDist = (pool.level - candle.low) / pool.level;
    if (sweepDist >= minSweep && sweepDist <= maxSweep && candle.close > pool.level) {
      // Bullish reversal candle (close near high)
      if (candleQuality >= 0.6) {
        return {
          direction: 'bullish_sweep', // Swept lows → go long
          pool,
          sweepCandle: candle,
          sweepDistance: sweepDist,
          candleQuality,
        };
      }
    }
  }

  return null;
}

/**
 * Check for a structure break on lower timeframe candles.
 * For longs: 15m close above the most recent 15m swing high
 * For shorts: 15m close below the most recent 15m swing low
 */
export function checkStructureBreak(
  candles15m: OHLCV[],
  direction: 'long' | 'short',
  lookback: number = 3
): { confirmed: boolean; breakPrice: number } {
  if (candles15m.length < lookback * 2 + 1) {
    return { confirmed: false, breakPrice: 0 };
  }

  const swings = detectSwingPoints(candles15m, lookback);
  const lastCandle = candles15m[candles15m.length - 1];

  if (direction === 'long') {
    // Find most recent swing high on 15m
    const recentHighs = swings
      .filter(s => s.type === 'high')
      .sort((a, b) => b.index - a.index);

    if (recentHighs.length === 0) return { confirmed: false, breakPrice: 0 };
    const target = recentHighs[0];
    return {
      confirmed: lastCandle.close > target.price,
      breakPrice: target.price,
    };
  } else {
    // Find most recent swing low on 15m
    const recentLows = swings
      .filter(s => s.type === 'low')
      .sort((a, b) => b.index - a.index);

    if (recentLows.length === 0) return { confirmed: false, breakPrice: 0 };
    const target = recentLows[0];
    return {
      confirmed: lastCandle.close < target.price,
      breakPrice: target.price,
    };
  }
}

/**
 * Full LSR signal detection pipeline.
 * Returns all detected sweep events for the given candle data.
 */
export function scanForSweeps(
  candles: OHLCV[],
  options: {
    swingLookback?: number;
    poolTolerance?: number;
    minSweep?: number;
    maxSweep?: number;
    minCandleQuality?: number;
  } = {}
): SweepEvent[] {
  const {
    swingLookback = 5,
    poolTolerance = 0.003,
    minSweep = 0.001,
    maxSweep = 0.005,
  } = options;

  const swings = detectSwingPoints(candles, swingLookback);
  const pools = detectLiquidityPools(swings, poolTolerance);

  const events: SweepEvent[] = [];

  // Check the last few candles for sweeps against detected pools
  const checkWindow = 3; // Check last 3 candles
  for (let i = Math.max(0, candles.length - checkWindow); i < candles.length; i++) {
    for (const pool of pools) {
      // Only check pools that were formed before this candle
      if (pool.lastTouch >= candles[i].timestamp) continue;

      const sweep = detectSweep(candles[i], pool, minSweep, maxSweep);
      if (sweep) {
        events.push(sweep);
      }
    }
  }

  return events;
}
