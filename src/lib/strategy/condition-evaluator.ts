// ============================================================================
// PhantomX — Strategy Condition Evaluator
// Evaluates ConditionGroup against indicator values at a given bar index.
// Used by the backtest engine and live strategy execution.
// ============================================================================

import type { OHLCV, Condition, ConditionGroup, IndicatorConfig } from '@/types/trading';
import { computeSMA, computeEMA, computeBollingerBands, computeVWAP, computeRSI } from '@/lib/chart/indicators';

// Raw indicator values aligned to OHLCV index (NaN for bars before indicator warmup)
export type IndicatorValues = Record<string, number[]>;

/**
 * Compute all indicators defined in a strategy config, returning raw number arrays
 * aligned with the OHLCV data index. Bars before the indicator warmup period are NaN.
 */
export function computeIndicators(ohlcv: OHLCV[], indicators: IndicatorConfig[]): IndicatorValues {
  const values: IndicatorValues = {};
  const len = ohlcv.length;

  // Always include raw price fields
  values['CLOSE'] = ohlcv.map(c => c.close);
  values['OPEN'] = ohlcv.map(c => c.open);
  values['HIGH'] = ohlcv.map(c => c.high);
  values['LOW'] = ohlcv.map(c => c.low);
  values['VOLUME'] = ohlcv.map(c => c.volume);

  for (const ind of indicators) {
    const period = ind.params.period ?? 14;
    const key = ind.label || `${ind.type}_${period}`;

    switch (ind.type) {
      case 'SMA': {
        const raw = computeSMA(ohlcv, period);
        const arr = new Array(len).fill(NaN);
        // SMA starts at index (period - 1)
        for (let i = 0; i < raw.length; i++) {
          arr[period - 1 + i] = raw[i].value;
        }
        values[key] = arr;
        break;
      }
      case 'EMA': {
        const raw = computeEMA(ohlcv, period);
        const arr = new Array(len).fill(NaN);
        for (let i = 0; i < raw.length; i++) {
          arr[period - 1 + i] = raw[i].value;
        }
        values[key] = arr;
        break;
      }
      case 'RSI': {
        const raw = computeRSI(ohlcv, period);
        const arr = new Array(len).fill(NaN);
        // RSI starts at index (period)
        for (let i = 0; i < raw.length; i++) {
          arr[period + i] = raw[i].value;
        }
        values[key] = arr;
        break;
      }
      case 'BB': {
        const stdDev = ind.params.stdDev ?? 2;
        const bb = computeBollingerBands(ohlcv, period, stdDev);
        const upper = new Array(len).fill(NaN);
        const middle = new Array(len).fill(NaN);
        const lower = new Array(len).fill(NaN);
        for (let i = 0; i < bb.upper.length; i++) {
          upper[period - 1 + i] = bb.upper[i].value;
          middle[period - 1 + i] = bb.middle[i].value;
          lower[period - 1 + i] = bb.lower[i].value;
        }
        values[`${key}_UPPER`] = upper;
        values[`${key}_MIDDLE`] = middle;
        values[`${key}_LOWER`] = lower;
        break;
      }
      case 'VWAP': {
        const raw = computeVWAP(ohlcv);
        values['VWAP'] = raw.map(r => r.value);
        break;
      }
      // ATR — compute inline since not in indicators.ts
      case 'ATR': {
        const arr = new Array(len).fill(NaN);
        if (len > period) {
          const trs: number[] = [];
          for (let i = 1; i < len; i++) {
            const tr = Math.max(
              ohlcv[i].high - ohlcv[i].low,
              Math.abs(ohlcv[i].high - ohlcv[i - 1].close),
              Math.abs(ohlcv[i].low - ohlcv[i - 1].close),
            );
            trs.push(tr);
          }
          // Simple average for first ATR
          let atr = 0;
          for (let i = 0; i < period; i++) atr += trs[i];
          atr /= period;
          arr[period] = atr;
          // Smoothed ATR
          for (let i = period; i < trs.length; i++) {
            atr = (atr * (period - 1) + trs[i]) / period;
            arr[i + 1] = atr;
          }
        }
        values[key] = arr;
        break;
      }
      case 'MACD': {
        const fastPeriod = ind.params.fast ?? 12;
        const slowPeriod = ind.params.slow ?? 26;
        const signalPeriod = ind.params.signal ?? 9;
        const fastEma = computeEMA(ohlcv, fastPeriod);
        const slowEma = computeEMA(ohlcv, slowPeriod);

        const macdLine = new Array(len).fill(NaN);
        const signalLine = new Array(len).fill(NaN);
        const histogram = new Array(len).fill(NaN);

        // MACD line = fast EMA - slow EMA (both start at their respective periods)
        const startIdx = slowPeriod - 1;
        const macdValues: number[] = [];
        for (let i = startIdx; i < len; i++) {
          const fastIdx = i - (fastPeriod - 1);
          const slowIdx = i - (slowPeriod - 1);
          if (fastIdx >= 0 && fastIdx < fastEma.length && slowIdx >= 0 && slowIdx < slowEma.length) {
            const m = fastEma[fastIdx].value - slowEma[slowIdx].value;
            macdLine[i] = m;
            macdValues.push(m);
          }
        }

        // Signal line = EMA of MACD line
        if (macdValues.length >= signalPeriod) {
          const k = 2 / (signalPeriod + 1);
          let signalEma = 0;
          for (let i = 0; i < signalPeriod; i++) signalEma += macdValues[i];
          signalEma /= signalPeriod;
          const signalStartOhlcvIdx = startIdx + signalPeriod - 1;
          signalLine[signalStartOhlcvIdx] = signalEma;
          histogram[signalStartOhlcvIdx] = macdValues[signalPeriod - 1] - signalEma;

          for (let i = signalPeriod; i < macdValues.length; i++) {
            signalEma = macdValues[i] * k + signalEma * (1 - k);
            const ohlcvIdx = startIdx + i;
            signalLine[ohlcvIdx] = signalEma;
            histogram[ohlcvIdx] = macdValues[i] - signalEma;
          }
        }

        values[`${key}_LINE`] = macdLine;
        values[`${key}_SIGNAL`] = signalLine;
        values[`${key}_HIST`] = histogram;
        break;
      }
      default:
        // Unsupported indicator — fill with NaN
        values[key] = new Array(len).fill(NaN);
        break;
    }
  }

  return values;
}

/**
 * Resolve an indicator reference to its value at a given bar index.
 * `ref` can be an indicator name (string key into values) or a numeric literal.
 */
function resolveValue(ref: string | number, values: IndicatorValues, barIndex: number): number {
  if (typeof ref === 'number') return ref;

  // Try exact match first
  if (values[ref] && barIndex < values[ref].length) {
    return values[ref][barIndex];
  }

  // Try case-insensitive match
  const upper = ref.toUpperCase();
  for (const key of Object.keys(values)) {
    if (key.toUpperCase() === upper && barIndex < values[key].length) {
      return values[key][barIndex];
    }
  }

  // Try parsing as number
  const num = Number(ref);
  if (!isNaN(num)) return num;

  return NaN;
}

/**
 * Evaluate a single Condition at a given bar index.
 */
function evaluateCondition(condition: Condition, values: IndicatorValues, barIndex: number): boolean {
  const current = resolveValue(condition.indicator, values, barIndex);
  const target = resolveValue(condition.target, values, barIndex);

  if (isNaN(current) || isNaN(target)) return false;

  switch (condition.operator) {
    case 'above':
      return current > target;
    case 'below':
      return current < target;
    case 'equals':
      return Math.abs(current - target) < 0.0001;
    case 'crosses_above': {
      if (barIndex < 1) return false;
      const prevCurrent = resolveValue(condition.indicator, values, barIndex - 1);
      const prevTarget = resolveValue(condition.target, values, barIndex - 1);
      if (isNaN(prevCurrent) || isNaN(prevTarget)) return false;
      return prevCurrent <= prevTarget && current > target;
    }
    case 'crosses_below': {
      if (barIndex < 1) return false;
      const prevCurrent = resolveValue(condition.indicator, values, barIndex - 1);
      const prevTarget = resolveValue(condition.target, values, barIndex - 1);
      if (isNaN(prevCurrent) || isNaN(prevTarget)) return false;
      return prevCurrent >= prevTarget && current < target;
    }
    default:
      return false;
  }
}

/**
 * Check if a value is a ConditionGroup (has `logic` and `conditions` fields)
 */
function isConditionGroup(item: Condition | ConditionGroup): item is ConditionGroup {
  return 'logic' in item && 'conditions' in item;
}

/**
 * Evaluate a ConditionGroup recursively at a given bar index.
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  values: IndicatorValues,
  barIndex: number,
): boolean {
  if (!group.conditions || group.conditions.length === 0) return false;

  if (group.logic === 'AND') {
    return group.conditions.every(item =>
      isConditionGroup(item)
        ? evaluateConditionGroup(item, values, barIndex)
        : evaluateCondition(item, values, barIndex),
    );
  } else {
    return group.conditions.some(item =>
      isConditionGroup(item)
        ? evaluateConditionGroup(item, values, barIndex)
        : evaluateCondition(item, values, barIndex),
    );
  }
}
