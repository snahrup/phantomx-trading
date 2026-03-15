// ============================================================================
// PhantomX — Strategy Scanner
// Implements detection criteria for all 4 active strategies:
//   1. Extreme Fear Reversal (EFR) v1.0
//   2. Funding Rate Carry (FRC) v1.0
//   3. EMA Ribbon v2.1
//   4. Liquidity Sweep Reversal (LSR) v1.0
//
// Uses existing indicator infrastructure from condition-evaluator.ts
// and swing-points.ts. Outputs structured StrategyAlert[] for logging
// and (in autonomous mode) execution delegation.
// ============================================================================

import type { OHLCV, IndicatorConfig } from '@/types/trading';
import { computeIndicators, type IndicatorValues } from '@/lib/strategy/condition-evaluator';
import { scanForSweeps, type SweepEvent } from '@/lib/indicators/swing-points';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertLevel =
  | 'SETUP_FORMING'
  | 'ENTRY_SIGNAL'
  | 'FOMO_BLOCK'
  | 'EXIT'
  | 'PAUSED'
  | 'OPPORTUNITY'
  | 'POOL_DETECTED'
  | 'SWEEP'
  | 'TREND_FORMING'
  | 'INFO';

export interface StrategyAlert {
  strategy: string;
  strategyId: string;
  symbol: string;
  alertLevel: AlertLevel;
  direction: 'long' | 'short' | null;
  confidence: number; // 0-1
  message: string;
  indicators: Record<string, number>;
  timestamp: number;
}

export interface FundingData {
  currentRate: number;     // per 8h, as decimal (e.g. -0.00036 = -0.036%)
  history?: number[];      // last N rates, newest first
}

export interface ScanInput {
  symbol: string;
  ohlcv4h: OHLCV[];       // 4H candles, minimum 55 for EMA(55)
  ohlcv15m?: OHLCV[];     // 15m candles for LSR confirmation
  funding?: FundingData;
}

export interface ScanResult {
  symbol: string;
  alerts: StrategyAlert[];
  regime: { adx: number; rsi: number; atr: number; atrRatio: number };
  scannedAt: number;
}

// ---------------------------------------------------------------------------
// Shared indicator config — compute once per symbol
// ---------------------------------------------------------------------------

const STANDARD_INDICATORS: IndicatorConfig[] = [
  { type: 'EMA', params: { period: 8 }, label: 'EMA_8' },
  { type: 'EMA', params: { period: 21 }, label: 'EMA_21' },
  { type: 'EMA', params: { period: 55 }, label: 'EMA_55' },
  { type: 'RSI', params: { period: 14 }, label: 'RSI_14' },
  { type: 'MACD', params: { fast: 12, slow: 26, signal: 9, period: 26 }, label: 'MACD' },
  { type: 'BB', params: { period: 20, stdDev: 2 }, label: 'BB_20' },
  { type: 'ATR', params: { period: 14 }, label: 'ATR_14' },
  { type: 'ADX', params: { period: 14 }, label: 'ADX_14' },
  { type: 'SMA', params: { period: 20 }, label: 'ATR_SMA_20' }, // For ATR ratio — will be computed separately
];

function computeAtrSma(atrValues: number[], period: number = 20): number[] {
  const result = new Array(atrValues.length).fill(NaN);
  for (let i = period - 1; i < atrValues.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (!isNaN(atrValues[j])) {
        sum += atrValues[j];
        count++;
      }
    }
    if (count === period) result[i] = sum / count;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 1. Extreme Fear Reversal (EFR) v1.1 — Expanded to 8 symbols with tiers
// Majors: BTC, ETH (1.5% risk) | Mid-cap: SOL, LINK, DOT (1.0%) | Small-cap: WIF, INJ, OP (0.75%)
// ---------------------------------------------------------------------------

const EFR_TIERS: Record<string, { tier: 'major' | 'mid' | 'small'; riskPct: number }> = {
  'BTC/USDT:USDT': { tier: 'major', riskPct: 0.015 },
  'ETH/USDT:USDT': { tier: 'major', riskPct: 0.015 },
  'SOL/USDT:USDT': { tier: 'mid', riskPct: 0.010 },
  'LINK/USDT:USDT': { tier: 'mid', riskPct: 0.010 },
  'DOT/USDT:USDT': { tier: 'mid', riskPct: 0.010 },
  'WIF/USDT:USDT': { tier: 'small', riskPct: 0.0075 },
  'INJ/USDT:USDT': { tier: 'small', riskPct: 0.0075 },
  'OP/USDT:USDT': { tier: 'small', riskPct: 0.0075 },
};

function scanEFR(symbol: string, vals: IndicatorValues, idx: number, ts: number): StrategyAlert[] {
  const alerts: StrategyAlert[] = [];
  const tierInfo = EFR_TIERS[symbol];
  if (!tierInfo) return alerts;

  const rsi = vals['RSI_14']?.[idx];
  const rsiPrev = idx > 0 ? vals['RSI_14']?.[idx - 1] : NaN;
  const close = vals['CLOSE']?.[idx];
  const bbLower = vals['BB_20_LOWER']?.[idx];
  const macdHist = vals['MACD_HIST']?.[idx];
  const macdHistPrev = idx > 0 ? vals['MACD_HIST']?.[idx - 1] : NaN;
  const ema8 = vals['EMA_8']?.[idx];
  const ema21 = vals['EMA_21']?.[idx];
  const ema8Prev = idx > 0 ? vals['EMA_8']?.[idx - 1] : NaN;
  const ema21Prev = idx > 0 ? vals['EMA_21']?.[idx - 1] : NaN;

  if ([rsi, close, bbLower, macdHist, ema8, ema21].some(v => v === undefined || isNaN(v!))) return alerts;

  const indicators = {
    rsi: rsi!,
    macd_hist: macdHist!,
    ema8: ema8!,
    ema21: ema21!,
    bb_lower: bbLower!,
    close: close!,
    tier: tierInfo.tier === 'major' ? 1 : tierInfo.tier === 'mid' ? 2 : 3,
    riskPct: tierInfo.riskPct,
  };

  // FOMO block check first
  if (rsi! > 72) {
    alerts.push({
      strategy: 'Extreme Fear Reversal v1.1',
      strategyId: 'strat-efr-v1.1',
      symbol,
      alertLevel: 'FOMO_BLOCK',
      direction: null,
      confidence: 0.9,
      message: `[EFR-v1.1] FOMO_BLOCK — ${symbol} RSI=${rsi!.toFixed(1)} > 72 tier=${tierInfo.tier}. Wait for pullback.`,
      indicators,
      timestamp: ts,
    });
    return alerts;
  }

  // Check setup forming conditions
  const rsiRecovery = rsi! < 35 && !isNaN(rsiPrev!) && rsi! > rsiPrev!;
  const bbProximity = close! <= bbLower! * 1.02; // within 2%
  const macdImproving = macdHist! < 0 && !isNaN(macdHistPrev!) && macdHist! > macdHistPrev!;
  const emaApproaching = ema8! < ema21! && !isNaN(ema8Prev!) && !isNaN(ema21Prev!) &&
    (ema21! - ema8!) < (ema21Prev! - ema8Prev!); // gap narrowing

  const setupCount = [rsiRecovery, bbProximity, macdImproving, emaApproaching].filter(Boolean).length;

  // ENTRY SIGNAL: RSI crosses above 30 + MACD hist crosses above 0 + EMA(8) crosses above EMA(21)
  const rsiCrossAbove30 = !isNaN(rsiPrev!) && rsiPrev! <= 30 && rsi! > 30;
  const macdHistCrossAbove0 = !isNaN(macdHistPrev!) && macdHistPrev! <= 0 && macdHist! > 0;
  const emaBullishCross = !isNaN(ema8Prev!) && !isNaN(ema21Prev!) && ema8Prev! <= ema21Prev! && ema8! > ema21!;

  if (rsiCrossAbove30 && macdHistCrossAbove0 && emaBullishCross) {
    alerts.push({
      strategy: 'Extreme Fear Reversal v1.1',
      strategyId: 'strat-efr-v1.1',
      symbol,
      alertLevel: 'ENTRY_SIGNAL',
      direction: 'long',
      confidence: 0.85,
      message: `[EFR-v1.1] ENTRY_SIGNAL — ${symbol} RSI=${rsi!.toFixed(1)} MACD_H=${macdHist!.toFixed(4)} EMA8/21=${ema8! > ema21! ? 'ALIGNED' : 'CROSSING'} tier=${tierInfo.tier}`,
      indicators,
      timestamp: ts,
    });
  } else if (setupCount >= 2) {
    alerts.push({
      strategy: 'Extreme Fear Reversal v1.1',
      strategyId: 'strat-efr-v1.1',
      symbol,
      alertLevel: 'SETUP_FORMING',
      direction: 'long',
      confidence: setupCount * 0.2,
      message: `[EFR-v1.1] SETUP_FORMING — ${symbol} RSI=${rsi!.toFixed(1)} MACD_H=${macdHist!.toFixed(4)} EMA8/21=${ema8! > ema21! ? 'ALIGNED' : 'PENDING'} tier=${tierInfo.tier} (${setupCount}/4 conditions)`,
      indicators,
      timestamp: ts,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// 2. Funding Rate Carry (FRC) v1.0
// Symbols: BTC, ETH, SOL (expanded to all perps with deep negative funding)
// ---------------------------------------------------------------------------

function scanFRC(
  symbol: string,
  vals: IndicatorValues,
  idx: number,
  ts: number,
  funding?: FundingData,
): StrategyAlert[] {
  const alerts: StrategyAlert[] = [];
  if (!funding) return alerts;

  const close = vals['CLOSE']?.[idx];
  const ema55 = vals['EMA_55']?.[idx];
  const rsi = vals['RSI_14']?.[idx];

  if ([close, ema55, rsi].some(v => v === undefined || isNaN(v!))) return alerts;

  const rate = funding.currentRate;
  const annualized = rate * 3 * 365 * 100; // percent

  const indicators = {
    funding_rate_pct: rate * 100,
    annualized_pct: annualized,
    close: close!,
    ema55: ema55!,
    rsi: rsi!,
  };

  // EXIT: funding turned positive for 2+ consecutive periods
  if (funding.history && funding.history.length >= 2) {
    if (funding.history[0] > 0 && funding.history[1] > 0) {
      alerts.push({
        strategy: 'Funding Rate Carry v1.0',
        strategyId: 'strat-frc-v1.0',
        symbol,
        alertLevel: 'EXIT',
        direction: null,
        confidence: 0.9,
        message: `[FRC-v1.0] EXIT — ${symbol} funding=${(rate * 100).toFixed(4)}% positive 2x consecutive. Close carry positions.`,
        indicators,
        timestamp: ts,
      });
      return alerts;
    }
  }

  // Opportunity detection: funding < -0.01%
  if (rate < -0.0001) {
    const priceAboveEma55 = close! > ema55!;
    const rsiNotOverbought = rsi! < 65;

    // Check consecutive negative (3 periods)
    const consecutiveNeg = funding.history
      ? funding.history.slice(0, 3).every(r => r < 0)
      : false;

    const annualizedAttractive = Math.abs(annualized) > 5;

    if (priceAboveEma55 && rsiNotOverbought && consecutiveNeg && annualizedAttractive) {
      alerts.push({
        strategy: 'Funding Rate Carry v1.0',
        strategyId: 'strat-frc-v1.0',
        symbol,
        alertLevel: 'ENTRY_SIGNAL',
        direction: 'long',
        confidence: 0.8,
        message: `[FRC-v1.0] ENTRY_SIGNAL — ${symbol} funding=${(rate * 100).toFixed(4)}% ann=${annualized.toFixed(1)}% price>EMA55 RSI=${rsi!.toFixed(1)}`,
        indicators,
        timestamp: ts,
      });
    } else {
      // Report opportunity even if not all conditions met
      const blockers: string[] = [];
      if (!priceAboveEma55) blockers.push('price<EMA55');
      if (!rsiNotOverbought) blockers.push('RSI>65');
      if (!consecutiveNeg) blockers.push('not 3x consecutive neg');
      if (!annualizedAttractive) blockers.push('ann<5%');

      alerts.push({
        strategy: 'Funding Rate Carry v1.0',
        strategyId: 'strat-frc-v1.0',
        symbol,
        alertLevel: 'OPPORTUNITY',
        direction: 'long',
        confidence: 0.4,
        message: `[FRC-v1.0] OPPORTUNITY — ${symbol} funding=${(rate * 100).toFixed(4)}% ann=${annualized.toFixed(1)}%. Blocked: ${blockers.join(', ')}`,
        indicators,
        timestamp: ts,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// 3. EMA Ribbon v2.1
// Symbols: BTC, ETH, SOL | Timeframe: 4H
// ---------------------------------------------------------------------------

function scanEMARibbon(symbol: string, vals: IndicatorValues, idx: number, ts: number): StrategyAlert[] {
  const alerts: StrategyAlert[] = [];
  const ribbonSymbols = ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'];
  if (!ribbonSymbols.includes(symbol)) return alerts;

  const close = vals['CLOSE']?.[idx];
  const ema8 = vals['EMA_8']?.[idx];
  const ema21 = vals['EMA_21']?.[idx];
  const ema55 = vals['EMA_55']?.[idx];
  const rsi = vals['RSI_14']?.[idx];
  const adx = vals['ADX_14']?.[idx];
  const atr = vals['ATR_14']?.[idx];

  if ([close, ema8, ema21, ema55, rsi, adx].some(v => v === undefined || isNaN(v!))) return alerts;

  const indicators = {
    close: close!,
    ema8: ema8!,
    ema21: ema21!,
    ema55: ema55!,
    rsi: rsi!,
    adx: adx!,
    atr: atr ?? 0,
  };

  // FOMO block
  if (rsi! > 72) {
    alerts.push({
      strategy: 'EMA Ribbon v2.1',
      strategyId: 'strat-ema-ribbon-v2.0',
      symbol,
      alertLevel: 'FOMO_BLOCK',
      direction: null,
      confidence: 0.9,
      message: `[EMA-v2.1] FOMO_BLOCK — ${symbol} RSI=${rsi!.toFixed(1)} > 72. Wait for pullback.`,
      indicators,
      timestamp: ts,
    });
    return alerts;
  }

  // Regime gate: ADX < 20 = not trending enough
  if (adx! < 20) {
    alerts.push({
      strategy: 'EMA Ribbon v2.1',
      strategyId: 'strat-ema-ribbon-v2.0',
      symbol,
      alertLevel: 'PAUSED',
      direction: null,
      confidence: 0.5,
      message: `[EMA-v2.1] PAUSED — ${symbol} ADX=${adx!.toFixed(1)} < 20. Not trending enough.`,
      indicators,
      timestamp: ts,
    });
    return alerts;
  }

  // Check ribbon alignment
  const longAligned = ema8! > ema21! && ema21! > ema55!; // 8 > 21 > 55
  const shortAligned = ema55! > ema21! && ema21! > ema8!; // 55 > 21 > 8
  const alignment = longAligned ? 'LONG' : shortAligned ? 'SHORT' : 'MIXED';

  if (alignment === 'MIXED') {
    // Check if trend is forming
    const ema8Above21 = ema8! > ema21!;
    const gap821 = Math.abs(ema8! - ema21!) / ema21! * 100;
    if (gap821 < 0.5) {
      alerts.push({
        strategy: 'EMA Ribbon v2.1',
        strategyId: 'strat-ema-ribbon-v2.0',
        symbol,
        alertLevel: 'TREND_FORMING',
        direction: ema8Above21 ? 'long' : 'short',
        confidence: 0.3,
        message: `[EMA-v2.1] TREND_FORMING — ${symbol} EMA=COMPRESSING(${gap821.toFixed(2)}%) ADX=${adx!.toFixed(1)} RSI=${rsi!.toFixed(1)}`,
        indicators,
        timestamp: ts,
      });
    }
    return alerts;
  }

  const direction: 'long' | 'short' = alignment === 'LONG' ? 'long' : 'short';

  // Check pullback to EMA(21)
  const distToEma21 = Math.abs(close! - ema21!) / ema21! * 100;
  const pullbackToZone = distToEma21 < 0.5;

  // RSI pullback zone
  const rsiInZone = direction === 'long'
    ? (rsi! >= 40 && rsi! <= 55)
    : (rsi! >= 45 && rsi! <= 60);

  // ADX trend confirmed
  const trendConfirmed = adx! > 25;

  // ENTRY SIGNAL: aligned + pullback to EMA(21) + RSI in zone + ADX > 25
  if (pullbackToZone && rsiInZone && trendConfirmed) {
    alerts.push({
      strategy: 'EMA Ribbon v2.1',
      strategyId: 'strat-ema-ribbon-v2.0',
      symbol,
      alertLevel: 'ENTRY_SIGNAL',
      direction,
      confidence: 0.8,
      message: `[EMA-v2.1] ENTRY_SIGNAL — ${symbol} EMA=${alignment} ADX=${adx!.toFixed(1)} RSI=${rsi!.toFixed(1)} pullback=${distToEma21.toFixed(2)}%`,
      indicators,
      timestamp: ts,
    });
  } else if (longAligned || shortAligned) {
    const missing: string[] = [];
    if (!pullbackToZone) missing.push(`pullback=${distToEma21.toFixed(2)}%>0.5%`);
    if (!rsiInZone) missing.push(`RSI=${rsi!.toFixed(1)} out of zone`);
    if (!trendConfirmed) missing.push(`ADX=${adx!.toFixed(1)}<25`);

    alerts.push({
      strategy: 'EMA Ribbon v2.1',
      strategyId: 'strat-ema-ribbon-v2.0',
      symbol,
      alertLevel: 'SETUP_FORMING',
      direction,
      confidence: 0.5,
      message: `[EMA-v2.1] SETUP — ${symbol} EMA=${alignment} ADX=${adx!.toFixed(1)} RSI=${rsi!.toFixed(1)}. Missing: ${missing.join(', ')}`,
      indicators,
      timestamp: ts,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// 4. Liquidity Sweep Reversal (LSR) v1.0
// Symbols: BTC, SOL | Timeframe: 4H + 15m confirmation
// ---------------------------------------------------------------------------

function scanLSR(
  symbol: string,
  ohlcv4h: OHLCV[],
  vals: IndicatorValues,
  idx: number,
  ts: number,
  ohlcv15m?: OHLCV[],
): StrategyAlert[] {
  const alerts: StrategyAlert[] = [];
  const lsrSymbols = ['BTC/USDT:USDT', 'SOL/USDT:USDT'];
  if (!lsrSymbols.includes(symbol)) return alerts;

  const adx = vals['ADX_14']?.[idx];

  // LSR regime gate: ADX > 30 = strongly trending, not suitable
  if (adx !== undefined && !isNaN(adx) && adx > 30) {
    alerts.push({
      strategy: 'Liquidity Sweep Reversal v1.0',
      strategyId: 'strat-liquidity-sweep-v1.0',
      symbol,
      alertLevel: 'PAUSED',
      direction: null,
      confidence: 0.5,
      message: `[LSR-v1.0] PAUSED — ${symbol} ADX=${adx.toFixed(1)} > 30. Strongly trending, not ranging.`,
      indicators: { adx },
      timestamp: ts,
    });
    return alerts;
  }

  // Run sweep detection on 4H candles
  const sweeps = scanForSweeps(ohlcv4h, {
    swingLookback: 5,
    poolTolerance: 0.003,
    minSweep: 0.001,
    maxSweep: 0.005,
  });

  if (sweeps.length === 0) return alerts;

  for (const sweep of sweeps) {
    const dir: 'long' | 'short' = sweep.direction === 'bullish_sweep' ? 'long' : 'short';

    const indicators = {
      pool_level: sweep.pool.level,
      pool_touches: sweep.pool.touches,
      sweep_distance_pct: sweep.sweepDistance * 100,
      candle_quality: sweep.candleQuality,
      adx: adx ?? 0,
    };

    // If we have 15m data, check for structure break confirmation
    if (ohlcv15m && ohlcv15m.length > 10) {
      // Import inline to avoid circular dependency at module level
      const { checkStructureBreak } = require('@/lib/indicators/swing-points');
      const structBreak = checkStructureBreak(ohlcv15m, dir, 3);

      if (structBreak.confirmed) {
        alerts.push({
          strategy: 'Liquidity Sweep Reversal v1.0',
          strategyId: 'strat-liquidity-sweep-v1.0',
          symbol,
          alertLevel: 'ENTRY_SIGNAL',
          direction: dir,
          confidence: 0.75,
          message: `[LSR-v1.0] ENTRY_SIGNAL — ${symbol} pool=${sweep.pool.level.toFixed(2)} sweep=${(sweep.sweepDistance * 100).toFixed(2)}% 15m_break=${structBreak.breakPrice.toFixed(2)}`,
          indicators: { ...indicators, break_price: structBreak.breakPrice },
          timestamp: ts,
        });
      } else {
        alerts.push({
          strategy: 'Liquidity Sweep Reversal v1.0',
          strategyId: 'strat-liquidity-sweep-v1.0',
          symbol,
          alertLevel: 'SWEEP',
          direction: dir,
          confidence: 0.5,
          message: `[LSR-v1.0] SWEEP — ${symbol} pool=${sweep.pool.level.toFixed(2)} sweep=${(sweep.sweepDistance * 100).toFixed(2)}%. Awaiting 15m structure break.`,
          indicators,
          timestamp: ts,
        });
      }
    } else {
      // No 15m data — report sweep only
      alerts.push({
        strategy: 'Liquidity Sweep Reversal v1.0',
        strategyId: 'strat-liquidity-sweep-v1.0',
        symbol,
        alertLevel: 'SWEEP',
        direction: dir,
        confidence: 0.4,
        message: `[LSR-v1.0] SWEEP — ${symbol} pool=${sweep.pool.level.toFixed(2)} sweep=${(sweep.sweepDistance * 100).toFixed(2)}% (no 15m data for confirmation)`,
        indicators,
        timestamp: ts,
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Liquidity Pool Detection (standalone — useful for monitoring)
// ---------------------------------------------------------------------------

function scanLiquidityPools(
  symbol: string,
  ohlcv4h: OHLCV[],
  ts: number,
): StrategyAlert[] {
  const alerts: StrategyAlert[] = [];
  const { detectSwingPoints, detectLiquidityPools } = require('@/lib/indicators/swing-points');

  const swings = detectSwingPoints(ohlcv4h, 5);
  const pools = detectLiquidityPools(swings, 0.003);

  for (const pool of pools.slice(0, 3)) { // Top 3 pools
    alerts.push({
      strategy: 'Liquidity Sweep Reversal v1.0',
      strategyId: 'strat-liquidity-sweep-v1.0',
      symbol,
      alertLevel: 'POOL_DETECTED',
      direction: null,
      confidence: Math.min(pool.touches * 0.2, 1),
      message: `[LSR-v1.0] POOL_DETECTED — ${symbol} ${pool.type}=${pool.level.toFixed(6)} touches=${pool.touches}`,
      indicators: {
        pool_level: pool.level,
        pool_touches: pool.touches,
        pool_type: pool.type === 'high' ? 1 : -1,
      },
      timestamp: ts,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Main Scanner — runs all strategies for a single symbol
// ---------------------------------------------------------------------------

export function scanSymbol(input: ScanInput): ScanResult {
  const { symbol, ohlcv4h, ohlcv15m, funding } = input;
  const now = Date.now();

  if (ohlcv4h.length < 56) {
    // Need at least 56 candles for EMA(55) warmup
    return {
      symbol,
      alerts: [{
        strategy: 'Scanner',
        strategyId: 'scanner',
        symbol,
        alertLevel: 'INFO',
        direction: null,
        confidence: 0,
        message: `[SCANNER] INSUFFICIENT_DATA — ${symbol} only ${ohlcv4h.length} candles (need 56+)`,
        indicators: { candle_count: ohlcv4h.length },
        timestamp: now,
      }],
      regime: { adx: 0, rsi: 0, atr: 0, atrRatio: 0 },
      scannedAt: now,
    };
  }

  // Compute all indicators once
  const vals = computeIndicators(ohlcv4h, STANDARD_INDICATORS);

  // Compute ATR SMA for ratio
  const atrArr = vals['ATR_14'] || [];
  const atrSma = computeAtrSma(atrArr, 20);
  vals['ATR_SMA_20'] = atrSma;

  const lastIdx = ohlcv4h.length - 1;
  const ts = ohlcv4h[lastIdx].timestamp;

  // Extract regime metrics
  const adx = vals['ADX_14']?.[lastIdx] ?? 0;
  const rsi = vals['RSI_14']?.[lastIdx] ?? 0;
  const atr = vals['ATR_14']?.[lastIdx] ?? 0;
  const atrSmaVal = atrSma[lastIdx] ?? 0;
  const atrRatio = atrSmaVal > 0 ? atr / atrSmaVal : 0;

  // Run all 4 strategy scanners
  const alerts: StrategyAlert[] = [
    ...scanEFR(symbol, vals, lastIdx, ts),
    ...scanFRC(symbol, vals, lastIdx, ts, funding),
    ...scanEMARibbon(symbol, vals, lastIdx, ts),
    ...scanLSR(symbol, ohlcv4h, vals, lastIdx, ts, ohlcv15m),
  ];

  return {
    symbol,
    alerts,
    regime: { adx, rsi, atr, atrRatio },
    scannedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Batch Scanner — runs all strategies across multiple symbols
// ---------------------------------------------------------------------------

export function scanAll(inputs: ScanInput[]): {
  results: ScanResult[];
  summary: {
    symbolsScanned: number;
    totalAlerts: number;
    entrySignals: number;
    setupsForming: number;
    opportunities: number;
    paused: number;
    timestamp: number;
  };
} {
  const results = inputs.map(scanSymbol);
  const allAlerts = results.flatMap(r => r.alerts);

  return {
    results,
    summary: {
      symbolsScanned: inputs.length,
      totalAlerts: allAlerts.length,
      entrySignals: allAlerts.filter(a => a.alertLevel === 'ENTRY_SIGNAL').length,
      setupsForming: allAlerts.filter(a => a.alertLevel === 'SETUP_FORMING').length,
      opportunities: allAlerts.filter(a => a.alertLevel === 'OPPORTUNITY').length,
      paused: allAlerts.filter(a => a.alertLevel === 'PAUSED').length,
      timestamp: Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// Format alerts for logging to knowledge/patterns/
// ---------------------------------------------------------------------------

export function formatAlertsAsMarkdown(scanResults: ScanResult[]): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const allAlerts = scanResults.flatMap(r => r.alerts);

  const entrySignals = allAlerts.filter(a => a.alertLevel === 'ENTRY_SIGNAL');
  const setups = allAlerts.filter(a => a.alertLevel === 'SETUP_FORMING');
  const opportunities = allAlerts.filter(a => a.alertLevel === 'OPPORTUNITY');
  const sweeps = allAlerts.filter(a => a.alertLevel === 'SWEEP');
  const paused = allAlerts.filter(a => a.alertLevel === 'PAUSED');

  let md = `# Strategy Scanner Report — ${now.toISOString().slice(0, 19)} UTC\n\n`;
  md += `## Summary\n`;
  md += `- Symbols scanned: ${scanResults.length}\n`;
  md += `- Total alerts: ${allAlerts.length}\n`;
  md += `- Entry signals: ${entrySignals.length}\n`;
  md += `- Setups forming: ${setups.length}\n`;
  md += `- Opportunities: ${opportunities.length}\n`;
  md += `- Sweeps detected: ${sweeps.length}\n`;
  md += `- Strategies paused: ${paused.length}\n\n`;

  if (entrySignals.length > 0) {
    md += `## ENTRY SIGNALS\n\n`;
    for (const a of entrySignals) {
      md += `- **${a.message}**\n`;
      md += `  - Confidence: ${(a.confidence * 100).toFixed(0)}%\n`;
      md += `  - Indicators: ${JSON.stringify(a.indicators)}\n\n`;
    }
  }

  if (setups.length > 0) {
    md += `## Setup Forming\n\n`;
    for (const a of setups) {
      md += `- ${a.message}\n`;
    }
    md += '\n';
  }

  if (opportunities.length > 0) {
    md += `## Opportunities\n\n`;
    for (const a of opportunities) {
      md += `- ${a.message}\n`;
    }
    md += '\n';
  }

  if (sweeps.length > 0) {
    md += `## Sweeps Detected\n\n`;
    for (const a of sweeps) {
      md += `- ${a.message}\n`;
    }
    md += '\n';
  }

  // Regime summary table
  md += `## Regime by Symbol\n\n`;
  md += `| Symbol | ADX | RSI | ATR Ratio | Regime |\n`;
  md += `|--------|-----|-----|-----------|--------|\n`;
  for (const r of scanResults) {
    const regime = r.regime.adx > 30 ? 'TRENDING' :
      r.regime.adx > 20 ? 'TRANSITION' : 'RANGING';
    const short = r.symbol.split('/')[0];
    md += `| ${short} | ${r.regime.adx.toFixed(1)} | ${r.regime.rsi.toFixed(1)} | ${r.regime.atrRatio.toFixed(2)}x | ${regime} |\n`;
  }
  md += '\n';

  if (paused.length > 0) {
    md += `## Paused Strategies\n\n`;
    for (const a of paused) {
      md += `- ${a.message}\n`;
    }
    md += '\n';
  }

  return md;
}
