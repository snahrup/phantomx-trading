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

// --- Legacy indicator config (kept for backward compatibility) ---
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

// ============================================================================
// NEW INDICATOR COMPUTATIONS
// ============================================================================

// --- MACD (Moving Average Convergence Divergence) ---
export interface MACDData {
  macdLine: IndicatorLineData[];
  signalLine: IndicatorLineData[];
  histogram: { time: Time; value: number; color: string }[];
}

export function computeMACD(ohlcv: OHLCV[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDData {
  const macdLine: IndicatorLineData[] = [];
  const signalLine: IndicatorLineData[] = [];
  const histogram: { time: Time; value: number; color: string }[] = [];

  if (ohlcv.length < slowPeriod + signalPeriod) return { macdLine, signalLine, histogram };

  // Compute fast & slow EMAs on closes
  const closes = ohlcv.map(c => c.close);
  const fastEMA = emaFromArray(closes, fastPeriod);
  const slowEMA = emaFromArray(closes, slowPeriod);

  // MACD line = fast EMA - slow EMA (aligned from slowPeriod-1 onwards)
  const macdValues: number[] = [];
  const startIdx = slowPeriod - 1;
  for (let i = startIdx; i < ohlcv.length; i++) {
    const fastIdx = i - (fastPeriod - 1);
    const slowIdx = i - (slowPeriod - 1);
    if (fastIdx >= 0 && fastIdx < fastEMA.length && slowIdx >= 0 && slowIdx < slowEMA.length) {
      const val = fastEMA[fastIdx] - slowEMA[slowIdx];
      macdValues.push(val);
      macdLine.push({ time: (ohlcv[i].timestamp / 1000) as Time, value: val });
    }
  }

  // Signal line = EMA of MACD values
  if (macdValues.length >= signalPeriod) {
    const sigEMA = emaFromArray(macdValues, signalPeriod);
    for (let i = 0; i < sigEMA.length; i++) {
      const macdIdx = i + (signalPeriod - 1);
      const ohlcvIdx = startIdx + macdIdx;
      if (ohlcvIdx < ohlcv.length) {
        const time = (ohlcv[ohlcvIdx].timestamp / 1000) as Time;
        signalLine.push({ time, value: sigEMA[i] });
        const histVal = macdValues[macdIdx] - sigEMA[i];
        histogram.push({
          time,
          value: histVal,
          color: histVal >= 0 ? 'rgba(95, 184, 122, 0.7)' : 'rgba(224, 85, 85, 0.7)',
        });
      }
    }
  }

  return { macdLine, signalLine, histogram };
}

// --- ATR (Average True Range) ---
export function computeATR(ohlcv: OHLCV[], period = 14): IndicatorLineData[] {
  const result: IndicatorLineData[] = [];
  if (ohlcv.length < period + 1) return result;

  const trueRanges: number[] = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const c = ohlcv[i];
    const prevClose = ohlcv[i - 1].close;
    trueRanges.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }

  // Initial ATR = average of first `period` TRs
  let atr = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  result.push({ time: (ohlcv[period].timestamp / 1000) as Time, value: atr });

  // Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result.push({ time: (ohlcv[i + 1].timestamp / 1000) as Time, value: atr });
  }
  return result;
}

// --- SuperTrend ---
export interface SuperTrendData {
  line: IndicatorLineData[];
  direction: ('bullish' | 'bearish')[]; // parallel array — direction at each point
}

export function computeSuperTrend(ohlcv: OHLCV[], period = 10, multiplier = 3): SuperTrendData {
  const line: IndicatorLineData[] = [];
  const direction: ('bullish' | 'bearish')[] = [];

  const atrData = computeATR(ohlcv, period);
  if (atrData.length === 0) return { line, direction };

  // Align ATR with OHLCV (ATR starts at index `period`)
  const offset = period;
  let upperBand = 0, lowerBand = 0;
  let prevUpper = 0, prevLower = 0;
  let dir: 'bullish' | 'bearish' = 'bullish';

  for (let i = 0; i < atrData.length; i++) {
    const idx = offset + i;
    const hl2 = (ohlcv[idx].high + ohlcv[idx].low) / 2;
    const atr = atrData[i].value;

    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;

    upperBand = i === 0 ? basicUpper : (basicUpper < prevUpper || ohlcv[idx - 1].close > prevUpper) ? basicUpper : prevUpper;
    lowerBand = i === 0 ? basicLower : (basicLower > prevLower || ohlcv[idx - 1].close < prevLower) ? basicLower : prevLower;

    if (i > 0) {
      if (dir === 'bullish' && ohlcv[idx].close < lowerBand) dir = 'bearish';
      else if (dir === 'bearish' && ohlcv[idx].close > upperBand) dir = 'bullish';
    }

    const time = (ohlcv[idx].timestamp / 1000) as Time;
    line.push({ time, value: dir === 'bullish' ? lowerBand : upperBand });
    direction.push(dir);

    prevUpper = upperBand;
    prevLower = lowerBand;
  }

  return { line, direction };
}

// --- EMA Ribbon ---
export function computeEMARibbon(ohlcv: OHLCV[], periods: number[] = [8, 13, 21, 34, 55]): Map<number, IndicatorLineData[]> {
  const result = new Map<number, IndicatorLineData[]>();
  for (const p of periods) {
    result.set(p, computeEMA(ohlcv, p));
  }
  return result;
}

// --- Ichimoku Cloud ---
export interface IchimokuData {
  tenkan: IndicatorLineData[];   // Conversion line (9)
  kijun: IndicatorLineData[];    // Base line (26)
  senkouA: IndicatorLineData[];  // Leading Span A (shifted 26 forward)
  senkouB: IndicatorLineData[];  // Leading Span B (shifted 26 forward)
  chikou: IndicatorLineData[];   // Lagging Span (shifted 26 back)
}

export function computeIchimoku(ohlcv: OHLCV[], tenkanP = 9, kijunP = 26, senkouBP = 52): IchimokuData {
  const tenkan: IndicatorLineData[] = [];
  const kijun: IndicatorLineData[] = [];
  const senkouA: IndicatorLineData[] = [];
  const senkouB: IndicatorLineData[] = [];
  const chikou: IndicatorLineData[] = [];

  if (ohlcv.length < senkouBP) return { tenkan, kijun, senkouA, senkouB, chikou };

  const midpoint = (data: OHLCV[], end: number, period: number): number => {
    let high = -Infinity, low = Infinity;
    for (let j = end - period + 1; j <= end; j++) {
      if (j >= 0) { high = Math.max(high, data[j].high); low = Math.min(low, data[j].low); }
    }
    return (high + low) / 2;
  };

  for (let i = 0; i < ohlcv.length; i++) {
    const time = (ohlcv[i].timestamp / 1000) as Time;

    // Tenkan-sen (9-period midpoint)
    if (i >= tenkanP - 1) {
      tenkan.push({ time, value: midpoint(ohlcv, i, tenkanP) });
    }

    // Kijun-sen (26-period midpoint)
    if (i >= kijunP - 1) {
      kijun.push({ time, value: midpoint(ohlcv, i, kijunP) });
    }

    // Senkou Span A = (Tenkan + Kijun) / 2, shifted 26 forward
    if (i >= kijunP - 1) {
      const tVal = midpoint(ohlcv, i, tenkanP);
      const kVal = midpoint(ohlcv, i, kijunP);
      // Use a future timestamp (shift forward by kijunP candles)
      const futureIdx = Math.min(i + kijunP, ohlcv.length - 1);
      const futureTime = (ohlcv[futureIdx].timestamp / 1000) as Time;
      senkouA.push({ time: futureTime, value: (tVal + kVal) / 2 });
    }

    // Senkou Span B = 52-period midpoint, shifted 26 forward
    if (i >= senkouBP - 1) {
      const futureIdx = Math.min(i + kijunP, ohlcv.length - 1);
      const futureTime = (ohlcv[futureIdx].timestamp / 1000) as Time;
      senkouB.push({ time: futureTime, value: midpoint(ohlcv, i, senkouBP) });
    }

    // Chikou Span = current close shifted 26 back
    if (i >= kijunP) {
      const pastTime = (ohlcv[i - kijunP].timestamp / 1000) as Time;
      chikou.push({ time: pastTime, value: ohlcv[i].close });
    }
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

// --- ADX (Average Directional Index) ---
export interface ADXData {
  adx: IndicatorLineData[];
  diPlus: IndicatorLineData[];
  diMinus: IndicatorLineData[];
}

export function computeADX(ohlcv: OHLCV[], period = 14): ADXData {
  const adx: IndicatorLineData[] = [];
  const diPlus: IndicatorLineData[] = [];
  const diMinus: IndicatorLineData[] = [];

  if (ohlcv.length < period * 2 + 1) return { adx, diPlus, diMinus };

  // Calculate DM and TR
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  const tr: number[] = [];

  for (let i = 1; i < ohlcv.length; i++) {
    const c = ohlcv[i], p = ohlcv[i - 1];
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }

  // Wilder's smoothing
  let smoothDMPlus = dmPlus.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothDMMinus = dmMinus.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothTR = tr.slice(0, period).reduce((s, v) => s + v, 0);

  const dxValues: number[] = [];

  for (let i = period; i < tr.length; i++) {
    if (i > period) {
      smoothDMPlus = smoothDMPlus - smoothDMPlus / period + dmPlus[i];
      smoothDMMinus = smoothDMMinus - smoothDMMinus / period + dmMinus[i];
      smoothTR = smoothTR - smoothTR / period + tr[i];
    }

    const diP = smoothTR > 0 ? (smoothDMPlus / smoothTR) * 100 : 0;
    const diM = smoothTR > 0 ? (smoothDMMinus / smoothTR) * 100 : 0;
    const diSum = diP + diM;
    const dx = diSum > 0 ? Math.abs(diP - diM) / diSum * 100 : 0;
    dxValues.push(dx);

    const time = (ohlcv[i + 1].timestamp / 1000) as Time;
    diPlus.push({ time, value: diP });
    diMinus.push({ time, value: diM });

    // ADX = smoothed DX (need period DX values)
    if (dxValues.length >= period) {
      const adxVal = dxValues.length === period
        ? dxValues.reduce((s, v) => s + v, 0) / period
        : (adx.length > 0 ? (adx[adx.length - 1].value * (period - 1) + dx) / period : dx);
      adx.push({ time, value: adxVal });
    }
  }

  return { adx, diPlus, diMinus };
}

// --- Stochastic RSI ---
export interface StochRSIData {
  k: IndicatorLineData[];
  d: IndicatorLineData[];
}

export function computeStochRSI(
  ohlcv: OHLCV[], rsiPeriod = 14, stochPeriod = 14, kSmooth = 3, dSmooth = 3
): StochRSIData {
  const k: IndicatorLineData[] = [];
  const d: IndicatorLineData[] = [];

  const rsiData = computeRSI(ohlcv, rsiPeriod);
  if (rsiData.length < stochPeriod) return { k, d };

  const rsiValues = rsiData.map(r => r.value);
  const rsiTimes = rsiData.map(r => r.time);

  // Raw Stochastic of RSI
  const rawK: number[] = [];
  for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
    const window = rsiValues.slice(i - stochPeriod + 1, i + 1);
    const min = Math.min(...window);
    const max = Math.max(...window);
    rawK.push(max === min ? 50 : ((rsiValues[i] - min) / (max - min)) * 100);
  }

  // Smooth %K with SMA
  const smoothK: number[] = [];
  for (let i = kSmooth - 1; i < rawK.length; i++) {
    const sum = rawK.slice(i - kSmooth + 1, i + 1).reduce((s, v) => s + v, 0);
    smoothK.push(sum / kSmooth);
  }

  // %D = SMA of smoothed %K
  const timeOffset = stochPeriod - 1 + kSmooth - 1;
  for (let i = 0; i < smoothK.length; i++) {
    const tIdx = timeOffset + i;
    if (tIdx < rsiTimes.length) {
      k.push({ time: rsiTimes[tIdx], value: smoothK[i] });
    }
  }

  for (let i = dSmooth - 1; i < smoothK.length; i++) {
    const sum = smoothK.slice(i - dSmooth + 1, i + 1).reduce((s, v) => s + v, 0);
    const tIdx = timeOffset + i;
    if (tIdx < rsiTimes.length) {
      d.push({ time: rsiTimes[tIdx], value: sum / dSmooth });
    }
  }

  return { k, d };
}

// --- CCI (Commodity Channel Index) ---
export function computeCCI(ohlcv: OHLCV[], period = 20): IndicatorLineData[] {
  const result: IndicatorLineData[] = [];
  if (ohlcv.length < period) return result;

  for (let i = period - 1; i < ohlcv.length; i++) {
    const slice = ohlcv.slice(i - period + 1, i + 1);
    const tps = slice.map(c => (c.high + c.low + c.close) / 3);
    const meanTP = tps.reduce((s, v) => s + v, 0) / period;
    const meanDev = tps.reduce((s, v) => s + Math.abs(v - meanTP), 0) / period;
    const cci = meanDev === 0 ? 0 : (tps[tps.length - 1] - meanTP) / (0.015 * meanDev);
    result.push({ time: (ohlcv[i].timestamp / 1000) as Time, value: cci });
  }
  return result;
}

// --- OBV (On-Balance Volume) ---
export function computeOBV(ohlcv: OHLCV[]): IndicatorLineData[] {
  const result: IndicatorLineData[] = [];
  if (ohlcv.length === 0) return result;

  let obv = 0;
  result.push({ time: (ohlcv[0].timestamp / 1000) as Time, value: obv });

  for (let i = 1; i < ohlcv.length; i++) {
    if (ohlcv[i].close > ohlcv[i - 1].close) obv += ohlcv[i].volume;
    else if (ohlcv[i].close < ohlcv[i - 1].close) obv -= ohlcv[i].volume;
    result.push({ time: (ohlcv[i].timestamp / 1000) as Time, value: obv });
  }
  return result;
}

// --- Pivot Points (Standard) ---
export interface PivotPointData {
  pp: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
}

export function computePivotPoints(ohlcv: OHLCV[]): PivotPointData | null {
  if (ohlcv.length < 2) return null;

  // Use the previous candle (completed period) to calculate pivots
  const prev = ohlcv[ohlcv.length - 2];
  const pp = (prev.high + prev.low + prev.close) / 3;
  return {
    pp,
    r1: 2 * pp - prev.low,
    s1: 2 * pp - prev.high,
    r2: pp + (prev.high - prev.low),
    s2: pp - (prev.high - prev.low),
    r3: prev.high + 2 * (pp - prev.low),
    s3: prev.low - 2 * (prev.high - pp),
  };
}

// --- ATR Bands ---
export interface ATRBandData {
  upper: IndicatorLineData[];
  lower: IndicatorLineData[];
}

export function computeATRBands(ohlcv: OHLCV[], atrPeriod = 14, multiplier = 2, emaPeriod = 20): ATRBandData {
  const upper: IndicatorLineData[] = [];
  const lower: IndicatorLineData[] = [];

  const ema = computeEMA(ohlcv, emaPeriod);
  const atr = computeATR(ohlcv, atrPeriod);

  if (ema.length === 0 || atr.length === 0) return { upper, lower };

  // Align by time
  const emaMap = new Map(ema.map(e => [String(e.time), e.value]));
  for (const a of atr) {
    const emaVal = emaMap.get(String(a.time));
    if (emaVal !== undefined) {
      upper.push({ time: a.time, value: emaVal + multiplier * a.value });
      lower.push({ time: a.time, value: emaVal - multiplier * a.value });
    }
  }
  return { upper, lower };
}

// --- Donchian Channel ---
export interface DonchianData {
  upper: IndicatorLineData[];
  middle: IndicatorLineData[];
  lower: IndicatorLineData[];
}

export function computeDonchian(ohlcv: OHLCV[], period = 20): DonchianData {
  const upper: IndicatorLineData[] = [];
  const middle: IndicatorLineData[] = [];
  const lower: IndicatorLineData[] = [];

  if (ohlcv.length < period) return { upper, middle, lower };

  for (let i = period - 1; i < ohlcv.length; i++) {
    const window = ohlcv.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const time = (ohlcv[i].timestamp / 1000) as Time;
    upper.push({ time, value: high });
    middle.push({ time, value: (high + low) / 2 });
    lower.push({ time, value: low });
  }
  return { upper, middle, lower };
}

// --- Swing High/Low Detection ---
export interface SwingPoint {
  index: number;
  time: Time;
  price: number;
  type: 'high' | 'low';
}

export function detectSwingPoints(ohlcv: OHLCV[], lookback = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  if (ohlcv.length < lookback * 2 + 1) return points;

  for (let i = lookback; i < ohlcv.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (ohlcv[i].high <= ohlcv[i - j].high || ohlcv[i].high <= ohlcv[i + j].high) isHigh = false;
      if (ohlcv[i].low >= ohlcv[i - j].low || ohlcv[i].low >= ohlcv[i + j].low) isLow = false;
    }
    const time = (ohlcv[i].timestamp / 1000) as Time;
    if (isHigh) points.push({ index: i, time, price: ohlcv[i].high, type: 'high' });
    if (isLow) points.push({ index: i, time, price: ohlcv[i].low, type: 'low' });
  }
  return points;
}

// --- Candlestick Pattern Detection ---
export interface CandlePattern {
  index: number;
  time: Time;
  price: number;
  pattern: string;
  direction: 'bullish' | 'bearish' | 'neutral';
}

export function detectCandlePatterns(ohlcv: OHLCV[]): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  if (ohlcv.length < 3) return patterns;

  for (let i = 1; i < ohlcv.length; i++) {
    const c = ohlcv[i], p = ohlcv[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const time = (c.timestamp / 1000) as Time;

    // Doji — very small body relative to range
    if (range > 0 && body / range < 0.1) {
      patterns.push({ index: i, time, price: c.high, pattern: 'Doji', direction: 'neutral' });
      continue;
    }

    // Bullish Engulfing
    if (p.close < p.open && c.close > c.open && c.close > p.open && c.open < p.close) {
      patterns.push({ index: i, time, price: c.low, pattern: 'Bull Engulf', direction: 'bullish' });
      continue;
    }

    // Bearish Engulfing
    if (p.close > p.open && c.close < c.open && c.close < p.open && c.open > p.close) {
      patterns.push({ index: i, time, price: c.high, pattern: 'Bear Engulf', direction: 'bearish' });
      continue;
    }

    // Hammer (small body at top, long lower wick)
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (body > 0 && lowerWick > body * 2 && upperWick < body * 0.5) {
      patterns.push({ index: i, time, price: c.low, pattern: 'Hammer', direction: 'bullish' });
      continue;
    }

    // Shooting Star (small body at bottom, long upper wick)
    if (body > 0 && upperWick > body * 2 && lowerWick < body * 0.5) {
      patterns.push({ index: i, time, price: c.high, pattern: 'Shoot Star', direction: 'bearish' });
      continue;
    }
  }

  return patterns;
}

// --- RSI Divergence Detection ---
export interface DivergenceSignal {
  time: Time;
  price: number;
  type: 'bullish_divergence' | 'bearish_divergence';
}

export function detectRSIDivergence(ohlcv: OHLCV[], rsiData: IndicatorLineData[], lookback = 30): DivergenceSignal[] {
  const signals: DivergenceSignal[] = [];
  if (rsiData.length < lookback || ohlcv.length < lookback) return signals;

  // Find swing lows/highs in both price and RSI over recent bars
  const swings = detectSwingPoints(ohlcv, 3);
  const recentHighs = swings.filter(s => s.type === 'high').slice(-5);
  const recentLows = swings.filter(s => s.type === 'low').slice(-5);

  const rsiMap = new Map(rsiData.map(r => [String(r.time), r.value]));

  // Bearish divergence: price makes higher high, RSI makes lower high
  for (let i = 1; i < recentHighs.length; i++) {
    const prev = recentHighs[i - 1], curr = recentHighs[i];
    const prevRsi = rsiMap.get(String(prev.time));
    const currRsi = rsiMap.get(String(curr.time));
    if (prevRsi !== undefined && currRsi !== undefined) {
      if (curr.price > prev.price && currRsi < prevRsi) {
        signals.push({ time: curr.time, price: curr.price, type: 'bearish_divergence' });
      }
    }
  }

  // Bullish divergence: price makes lower low, RSI makes higher low
  for (let i = 1; i < recentLows.length; i++) {
    const prev = recentLows[i - 1], curr = recentLows[i];
    const prevRsi = rsiMap.get(String(prev.time));
    const currRsi = rsiMap.get(String(curr.time));
    if (prevRsi !== undefined && currRsi !== undefined) {
      if (curr.price < prev.price && currRsi > prevRsi) {
        signals.push({ time: curr.time, price: curr.price, type: 'bullish_divergence' });
      }
    }
  }

  return signals;
}

// --- EMA Cross Signal Generator ---
export interface CrossSignal {
  time: Time;
  price: number;
  direction: 'bullish' | 'bearish';
}

export function generateEMACrossSignals(ohlcv: OHLCV[], fastPeriod = 9, slowPeriod = 21): CrossSignal[] {
  const signals: CrossSignal[] = [];
  const fastEMA = computeEMA(ohlcv, fastPeriod);
  const slowEMA = computeEMA(ohlcv, slowPeriod);

  if (fastEMA.length < 2 || slowEMA.length < 2) return signals;

  // Align by time
  const slowMap = new Map(slowEMA.map(e => [String(e.time), e.value]));

  let prevDiff: number | null = null;
  for (const fast of fastEMA) {
    const slow = slowMap.get(String(fast.time));
    if (slow === undefined) continue;
    const diff = fast.value - slow;
    if (prevDiff !== null) {
      if (prevDiff <= 0 && diff > 0) {
        const idx = ohlcv.findIndex(c => (c.timestamp / 1000) as Time === fast.time);
        signals.push({ time: fast.time, price: idx >= 0 ? ohlcv[idx].close : fast.value, direction: 'bullish' });
      } else if (prevDiff >= 0 && diff < 0) {
        const idx = ohlcv.findIndex(c => (c.timestamp / 1000) as Time === fast.time);
        signals.push({ time: fast.time, price: idx >= 0 ? ohlcv[idx].close : fast.value, direction: 'bearish' });
      }
    }
    prevDiff = diff;
  }
  return signals;
}

// --- RSI Reversal Signal Generator ---
export function generateRSIReversalSignals(ohlcv: OHLCV[], rsiData: IndicatorLineData[], obLevel = 70, osLevel = 30): CrossSignal[] {
  const signals: CrossSignal[] = [];
  if (rsiData.length < 2) return signals;

  for (let i = 1; i < rsiData.length; i++) {
    const prev = rsiData[i - 1].value, curr = rsiData[i].value;
    const idx = ohlcv.findIndex(c => (c.timestamp / 1000) as Time === rsiData[i].time);
    const price = idx >= 0 ? ohlcv[idx].close : 0;

    // Bullish: RSI crosses back above oversold
    if (prev < osLevel && curr >= osLevel) {
      signals.push({ time: rsiData[i].time, price, direction: 'bullish' });
    }
    // Bearish: RSI crosses back below overbought
    if (prev > obLevel && curr <= obLevel) {
      signals.push({ time: rsiData[i].time, price, direction: 'bearish' });
    }
  }
  return signals;
}

// --- MACD Histogram Flip Signal Generator ---
export function generateMACDFlipSignals(histogram: { time: Time; value: number }[], ohlcv: OHLCV[]): CrossSignal[] {
  const signals: CrossSignal[] = [];
  if (histogram.length < 2) return signals;

  for (let i = 1; i < histogram.length; i++) {
    const prev = histogram[i - 1].value, curr = histogram[i].value;
    if (prev < 0 && curr >= 0) {
      const idx = ohlcv.findIndex(c => (c.timestamp / 1000) as Time === histogram[i].time);
      signals.push({ time: histogram[i].time, price: idx >= 0 ? ohlcv[idx].close : 0, direction: 'bullish' });
    } else if (prev > 0 && curr <= 0) {
      const idx = ohlcv.findIndex(c => (c.timestamp / 1000) as Time === histogram[i].time);
      signals.push({ time: histogram[i].time, price: idx >= 0 ? ohlcv[idx].close : 0, direction: 'bearish' });
    }
  }
  return signals;
}

// --- Volume Profile (simplified: POC/VAH/VAL) ---
export interface VolumeProfileLevels {
  poc: number;   // Point of Control — price with most volume
  vah: number;   // Value Area High — upper 70% volume boundary
  val: number;   // Value Area Low — lower 70% volume boundary
}

export function computeVolumeProfile(ohlcv: OHLCV[], bins = 50): VolumeProfileLevels | null {
  if (ohlcv.length < 10) return null;

  const allHigh = Math.max(...ohlcv.map(c => c.high));
  const allLow = Math.min(...ohlcv.map(c => c.low));
  const range = allHigh - allLow;
  if (range === 0) return null;

  const binSize = range / bins;
  const volumeByBin: number[] = new Array(bins).fill(0);

  for (const c of ohlcv) {
    const binIdx = Math.min(Math.floor((c.close - allLow) / binSize), bins - 1);
    volumeByBin[binIdx] += c.volume;
  }

  // POC = bin with highest volume
  let maxVol = 0, pocBin = 0;
  for (let i = 0; i < bins; i++) {
    if (volumeByBin[i] > maxVol) { maxVol = volumeByBin[i]; pocBin = i; }
  }

  // Value Area = 70% of total volume around POC
  const totalVol = volumeByBin.reduce((s, v) => s + v, 0);
  const targetVol = totalVol * 0.7;
  let vaVol = volumeByBin[pocBin];
  let lo = pocBin, hi = pocBin;

  while (vaVol < targetVol && (lo > 0 || hi < bins - 1)) {
    const addLo = lo > 0 ? volumeByBin[lo - 1] : 0;
    const addHi = hi < bins - 1 ? volumeByBin[hi + 1] : 0;
    if (addLo >= addHi && lo > 0) { lo--; vaVol += addLo; }
    else if (hi < bins - 1) { hi++; vaVol += addHi; }
    else { lo--; vaVol += addLo; }
  }

  return {
    poc: allLow + (pocBin + 0.5) * binSize,
    vah: allLow + (hi + 1) * binSize,
    val: allLow + lo * binSize,
  };
}

// ---- Helpers ----

/** Compute EMA from a raw number array (returns values aligned from period-1 onwards) */
function emaFromArray(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const result = [ema];
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}
