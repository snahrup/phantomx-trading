// ============================================================================
// PhantomX — Client-Side Technical Indicator Calculations
// Returns data formatted for lightweight-charts LineSeries
// ============================================================================

import type { OHLCV } from '@/types/trading';
import type { Time } from 'lightweight-charts';

export interface IndicatorLineData {
  time: Time;
  value: number;
}

// --- Simple Moving Average ---
export function computeSMA(ohlcv: OHLCV[], period: number): IndicatorLineData[] {
  const result: IndicatorLineData[] = [];
  if (ohlcv.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += ohlcv[i].close;

  result.push({ time: (ohlcv[period - 1].timestamp / 1000) as Time, value: sum / period });

  for (let i = period; i < ohlcv.length; i++) {
    sum += ohlcv[i].close - ohlcv[i - period].close;
    result.push({ time: (ohlcv[i].timestamp / 1000) as Time, value: sum / period });
  }
  return result;
}

// --- Exponential Moving Average ---
export function computeEMA(ohlcv: OHLCV[], period: number): IndicatorLineData[] {
  const result: IndicatorLineData[] = [];
  if (ohlcv.length < period) return result;

  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += ohlcv[i].close;
  ema /= period;
  result.push({ time: (ohlcv[period - 1].timestamp / 1000) as Time, value: ema });

  for (let i = period; i < ohlcv.length; i++) {
    ema = ohlcv[i].close * k + ema * (1 - k);
    result.push({ time: (ohlcv[i].timestamp / 1000) as Time, value: ema });
  }
  return result;
}

// --- Bollinger Bands ---
export interface BollingerBandData {
  upper: IndicatorLineData[];
  middle: IndicatorLineData[];
  lower: IndicatorLineData[];
}

export function computeBollingerBands(ohlcv: OHLCV[], period = 20, stdDevMultiplier = 2): BollingerBandData {
  const upper: IndicatorLineData[] = [];
  const middle: IndicatorLineData[] = [];
  const lower: IndicatorLineData[] = [];

  if (ohlcv.length < period) return { upper, middle, lower };

  for (let i = period - 1; i < ohlcv.length; i++) {
    const slice = ohlcv.slice(i - period + 1, i + 1).map(c => c.close);
    const mean = slice.reduce((s, p) => s + p, 0) / period;
    const variance = slice.reduce((s, p) => s + (p - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    const time = (ohlcv[i].timestamp / 1000) as Time;

    upper.push({ time, value: mean + stdDev * stdDevMultiplier });
    middle.push({ time, value: mean });
    lower.push({ time, value: mean - stdDev * stdDevMultiplier });
  }

  return { upper, middle, lower };
}

// --- VWAP (Volume-Weighted Average Price) ---
export function computeVWAP(ohlcv: OHLCV[]): IndicatorLineData[] {
  const result: IndicatorLineData[] = [];
  if (ohlcv.length === 0) return result;

  let cumulativeTPV = 0; // typical price * volume
  let cumulativeVol = 0;

  for (const candle of ohlcv) {
    const tp = (candle.high + candle.low + candle.close) / 3;
    cumulativeTPV += tp * candle.volume;
    cumulativeVol += candle.volume;
    if (cumulativeVol > 0) {
      result.push({
        time: (candle.timestamp / 1000) as Time,
        value: cumulativeTPV / cumulativeVol,
      });
    }
  }
  return result;
}

// --- RSI (as separate pane data, not on price axis) ---
export function computeRSI(ohlcv: OHLCV[], period = 14): IndicatorLineData[] {
  const result: IndicatorLineData[] = [];
  if (ohlcv.length < period + 1) return result;

  const closes = ohlcv.map(c => c.close);
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial average gain/loss
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({
    time: (ohlcv[period].timestamp / 1000) as Time,
    value: 100 - 100 / (1 + rs0),
  });

  // Smoothed RSI for remaining bars
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({
      time: (ohlcv[i + 1].timestamp / 1000) as Time,
      value: 100 - 100 / (1 + rs),
    });
  }
  return result;
}

// --- Indicator config type ---
export type IndicatorKey = 'sma7' | 'sma20' | 'sma50' | 'ema21' | 'bb' | 'vwap';

export interface IndicatorDef {
  key: IndicatorKey;
  label: string;
  color: string;
  enabled: boolean;
}

export const DEFAULT_INDICATORS: IndicatorDef[] = [
  { key: 'sma7', label: 'SMA 7', color: '#f59e0b', enabled: false },
  { key: 'sma20', label: 'SMA 20', color: '#3b82f6', enabled: true },
  { key: 'sma50', label: 'SMA 50', color: '#a855f7', enabled: true },
  { key: 'ema21', label: 'EMA 21', color: '#06b6d4', enabled: false },
  { key: 'bb', label: 'Bollinger', color: '#6366f1', enabled: false },
  { key: 'vwap', label: 'VWAP', color: '#ec4899', enabled: false },
];
