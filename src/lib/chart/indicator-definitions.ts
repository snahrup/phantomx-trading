// ============================================================================
// PhantomX — Indicator Definitions
// Registers all indicators into the data-driven registry
// ============================================================================

import type { OHLCV } from '@/types/trading';
import type { Time, SeriesMarker } from 'lightweight-charts';
import { indicatorRegistry, type IndicatorComputeResult } from './indicator-registry';
import {
  computeSMA, computeEMA, computeBollingerBands, computeVWAP, computeRSI,
  computeMACD, computeATR, computeSuperTrend, computeEMARibbon,
  computeIchimoku, computeADX, computeStochRSI, computeCCI, computeOBV,
  computePivotPoints, computeATRBands, computeDonchian,
  detectSwingPoints, detectCandlePatterns, detectRSIDivergence,
  generateEMACrossSignals, generateRSIReversalSignals, generateMACDFlipSignals,
  computeVolumeProfile,
} from './indicators';

const EMA_RIBBON_COLORS = ['#22d3ee', '#38bdf8', '#818cf8', '#a78bfa', '#c084fc'];

export function registerAllIndicators(): void {

  // ========================================================================
  // TREND CATEGORY
  // ========================================================================

  // Legacy: SMA 7
  indicatorRegistry.register({
    key: 'sma7', label: 'SMA 7', category: 'trend', color: '#f59e0b',
    description: 'Simple Moving Average (7 periods). Fast-moving trend line — tracks recent price action closely.',
    pane: 'overlay', defaultEnabled: false,
    params: [{ name: 'period', label: 'Period', default: 7, min: 2, max: 200, step: 1 }],
    compute: (ohlcv, params) => {
      const data = computeSMA(ohlcv, params.period);
      const lastVal = data.length > 0 ? data[data.length - 1].value : 0;
      return {
        outputs: [{ type: 'line', key: 'sma7', data, color: '#f59e0b', lineWidth: 1, pane: 'overlay' }],
        signals: [],
        aiContext: data.length > 0 ? `SMA${params.period}: $${lastVal.toFixed(2)}` : '',
      };
    },
  });

  // Legacy: SMA 20
  indicatorRegistry.register({
    key: 'sma20', label: 'SMA 20', category: 'trend', color: '#3b82f6',
    description: 'Simple Moving Average (20 periods). Medium-term trend — widely watched by traders.',
    pane: 'overlay', defaultEnabled: true,
    params: [{ name: 'period', label: 'Period', default: 20, min: 2, max: 200, step: 1 }],
    compute: (ohlcv, params) => {
      const data = computeSMA(ohlcv, params.period);
      const lastVal = data.length > 0 ? data[data.length - 1].value : 0;
      return {
        outputs: [{ type: 'line', key: 'sma20', data, color: '#3b82f6', lineWidth: 1, pane: 'overlay' }],
        signals: [],
        aiContext: data.length > 0 ? `SMA${params.period}: $${lastVal.toFixed(2)}` : '',
      };
    },
  });

  // Legacy: SMA 50
  indicatorRegistry.register({
    key: 'sma50', label: 'SMA 50', category: 'trend', color: '#a855f7',
    description: 'Simple Moving Average (50 periods). Long-term trend — institutional level.',
    pane: 'overlay', defaultEnabled: true,
    params: [{ name: 'period', label: 'Period', default: 50, min: 2, max: 200, step: 1 }],
    compute: (ohlcv, params) => {
      const data = computeSMA(ohlcv, params.period);
      const lastVal = data.length > 0 ? data[data.length - 1].value : 0;
      return {
        outputs: [{ type: 'line', key: 'sma50', data, color: '#a855f7', lineWidth: 1, pane: 'overlay' }],
        signals: [],
        aiContext: data.length > 0 ? `SMA${params.period}: $${lastVal.toFixed(2)}` : '',
      };
    },
  });

  // Legacy: EMA 21
  indicatorRegistry.register({
    key: 'ema21', label: 'EMA 21', category: 'trend', color: '#06b6d4',
    description: 'Exponential Moving Average (21 periods). Weights recent prices more heavily.',
    pane: 'overlay', defaultEnabled: false,
    params: [{ name: 'period', label: 'Period', default: 21, min: 2, max: 200, step: 1 }],
    compute: (ohlcv, params) => {
      const data = computeEMA(ohlcv, params.period);
      const lastVal = data.length > 0 ? data[data.length - 1].value : 0;
      return {
        outputs: [{ type: 'line', key: 'ema21', data, color: '#06b6d4', lineWidth: 1, lineStyle: 2, pane: 'overlay' }],
        signals: [],
        aiContext: data.length > 0 ? `EMA${params.period}: $${lastVal.toFixed(2)}` : '',
      };
    },
  });

  // NEW: EMA Ribbon (8/13/21/34/55)
  indicatorRegistry.register({
    key: 'ema_ribbon', label: 'EMA Ribbon', category: 'trend', color: '#38bdf8',
    description: 'Five EMAs (8/13/21/34/55) stacked as a ribbon. All aligned in order = strong trend. Tangled = choppy/ranging market.',
    pane: 'overlay', defaultEnabled: false,
    params: [],
    compute: (ohlcv) => {
      const periods = [8, 13, 21, 34, 55];
      const ribbon = computeEMARibbon(ohlcv, periods);
      const outputs: IndicatorComputeResult['outputs'] = [];
      const signals: IndicatorComputeResult['signals'] = [];

      periods.forEach((p, idx) => {
        const data = ribbon.get(p) || [];
        outputs.push({ type: 'line', key: `ema_ribbon_${p}`, data, color: EMA_RIBBON_COLORS[idx], lineWidth: 1, pane: 'overlay' });
      });

      // Check alignment
      const lastValues = periods.map(p => {
        const d = ribbon.get(p) || [];
        return d.length > 0 ? d[d.length - 1].value : null;
      }).filter((v): v is number => v !== null);

      let alignment = 'tangled';
      if (lastValues.length === 5) {
        const bullish = lastValues.every((v, i) => i === 0 || v <= lastValues[i - 1]);
        const bearish = lastValues.every((v, i) => i === 0 || v >= lastValues[i - 1]);
        if (bullish) alignment = 'BULLISH ALIGNED';
        else if (bearish) alignment = 'BEARISH ALIGNED';
      }

      return { outputs, signals, aiContext: `EMA Ribbon: ${alignment}` };
    },
  });

  // NEW: SuperTrend
  indicatorRegistry.register({
    key: 'supertrend', label: 'SuperTrend', category: 'trend', color: '#10b981',
    description: 'ATR-based trailing stop that flips between bullish (green, below price) and bearish (red, above price). Direction changes = potential trend reversal.',
    pane: 'overlay', defaultEnabled: false,
    params: [
      { name: 'period', label: 'ATR Period', default: 10, min: 5, max: 50, step: 1 },
      { name: 'multiplier', label: 'Multiplier', default: 3, min: 1, max: 6, step: 0.5 },
    ],
    compute: (ohlcv, params) => {
      const st = computeSuperTrend(ohlcv, params.period, params.multiplier);
      if (st.line.length === 0) return { outputs: [], signals: [], aiContext: '' };

      // Split into bull/bear segments for color rendering
      const bullData: { time: Time; value: number }[] = [];
      const bearData: { time: Time; value: number }[] = [];
      const signals: IndicatorComputeResult['signals'] = [];

      for (let i = 0; i < st.line.length; i++) {
        const point = st.line[i];
        if (st.direction[i] === 'bullish') {
          bullData.push(point);
          // Gap to prevent connecting line
          if (bearData.length > 0) bearData.push({ time: point.time, value: NaN as number });
        } else {
          bearData.push(point);
          if (bullData.length > 0) bullData.push({ time: point.time, value: NaN as number });
        }

        // Signal on flip
        if (i > 0 && st.direction[i] !== st.direction[i - 1]) {
          const idx = ohlcv.findIndex(c => (c.timestamp / 1000) as Time === point.time);
          signals.push({
            type: 'supertrend_flip',
            direction: st.direction[i],
            strength: 80,
            time: point.time,
            price: idx >= 0 ? ohlcv[idx].close : point.value,
            description: st.direction[i] === 'bullish' ? 'ST Bull' : 'ST Bear',
          });
        }
      }

      const lastDir = st.direction[st.direction.length - 1];
      const lastVal = st.line[st.line.length - 1].value;

      return {
        outputs: [
          { type: 'line', key: 'supertrend_bull', data: bullData.filter(d => !isNaN(d.value)), color: '#5FB87A', lineWidth: 2, pane: 'overlay' },
          { type: 'line', key: 'supertrend_bear', data: bearData.filter(d => !isNaN(d.value)), color: '#E05555', lineWidth: 2, pane: 'overlay' },
        ],
        signals,
        aiContext: `SuperTrend: ${lastDir.toUpperCase()} (level: $${lastVal.toFixed(2)})`,
      };
    },
  });

  // NEW: Ichimoku Cloud
  indicatorRegistry.register({
    key: 'ichimoku', label: 'Ichimoku Cloud', category: 'trend', color: '#f97316',
    description: 'Complete trend system: Tenkan (9), Kijun (26) lines + cloud (Senkou A/B). Price above cloud = bullish. TK cross = signal.',
    pane: 'overlay', defaultEnabled: false,
    params: [],
    compute: (ohlcv) => {
      const ich = computeIchimoku(ohlcv);
      const outputs: IndicatorComputeResult['outputs'] = [];

      if (ich.tenkan.length > 0) outputs.push({ type: 'line', key: 'ich_tenkan', data: ich.tenkan, color: '#22d3ee', lineWidth: 1, pane: 'overlay' });
      if (ich.kijun.length > 0) outputs.push({ type: 'line', key: 'ich_kijun', data: ich.kijun, color: '#f43f5e', lineWidth: 1, pane: 'overlay' });
      if (ich.senkouA.length > 0) outputs.push({ type: 'line', key: 'ich_spanA', data: ich.senkouA, color: 'rgba(34,211,238,0.4)', lineWidth: 1, pane: 'overlay' });
      if (ich.senkouB.length > 0) outputs.push({ type: 'line', key: 'ich_spanB', data: ich.senkouB, color: 'rgba(244,63,94,0.4)', lineWidth: 1, pane: 'overlay' });
      if (ich.chikou.length > 0) outputs.push({ type: 'line', key: 'ich_chikou', data: ich.chikou, color: '#a3e635', lineWidth: 1, lineStyle: 1, pane: 'overlay' });

      const lastClose = ohlcv.length > 0 ? ohlcv[ohlcv.length - 1].close : 0;
      const lastSpanA = ich.senkouA.length > 0 ? ich.senkouA[ich.senkouA.length - 1].value : 0;
      const lastSpanB = ich.senkouB.length > 0 ? ich.senkouB[ich.senkouB.length - 1].value : 0;
      const cloudTop = Math.max(lastSpanA, lastSpanB);
      const cloudBottom = Math.min(lastSpanA, lastSpanB);
      const position = lastClose > cloudTop ? 'ABOVE cloud (bullish)' : lastClose < cloudBottom ? 'BELOW cloud (bearish)' : 'IN cloud (neutral)';

      return { outputs, signals: [], aiContext: `Ichimoku: Price ${position}` };
    },
  });

  // NEW: MACD
  indicatorRegistry.register({
    key: 'macd', label: 'MACD', category: 'trend', color: '#3b82f6',
    description: 'Moving Average Convergence Divergence. MACD line crossing signal line = momentum shift. Histogram shows gap magnitude.',
    pane: 'sub_pane', defaultEnabled: false,
    params: [
      { name: 'fast', label: 'Fast', default: 12, min: 2, max: 50, step: 1 },
      { name: 'slow', label: 'Slow', default: 26, min: 5, max: 100, step: 1 },
      { name: 'signal', label: 'Signal', default: 9, min: 2, max: 30, step: 1 },
    ],
    compute: (ohlcv, params) => {
      const macd = computeMACD(ohlcv, params.fast, params.slow, params.signal);
      const outputs: IndicatorComputeResult['outputs'] = [];

      if (macd.macdLine.length > 0) outputs.push({ type: 'line', key: 'macd_line', data: macd.macdLine, color: '#3b82f6', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'macd' });
      if (macd.signalLine.length > 0) outputs.push({ type: 'line', key: 'macd_signal', data: macd.signalLine, color: '#f59e0b', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'macd' });
      if (macd.histogram.length > 0) outputs.push({ type: 'histogram', key: 'macd_hist', data: macd.histogram, pane: 'sub_pane', priceScaleId: 'macd' });

      const lastMACD = macd.macdLine.length > 0 ? macd.macdLine[macd.macdLine.length - 1].value : 0;
      const lastSignal = macd.signalLine.length > 0 ? macd.signalLine[macd.signalLine.length - 1].value : 0;
      const crossDir = lastMACD > lastSignal ? 'BULLISH' : 'BEARISH';

      return { outputs, signals: [], aiContext: `MACD(${params.fast}/${params.slow}/${params.signal}): ${crossDir} (MACD: ${lastMACD.toFixed(2)}, Signal: ${lastSignal.toFixed(2)})` };
    },
  });

  // NEW: ADX
  indicatorRegistry.register({
    key: 'adx', label: 'ADX', category: 'trend', color: '#e2e8f0',
    description: 'Average Directional Index — measures trend STRENGTH (not direction). ADX > 25 = strong trend. DI+ > DI- = bullish, DI- > DI+ = bearish.',
    pane: 'sub_pane', defaultEnabled: false,
    params: [{ name: 'period', label: 'Period', default: 14, min: 7, max: 30, step: 1 }],
    compute: (ohlcv, params) => {
      const adxData = computeADX(ohlcv, params.period);
      const outputs: IndicatorComputeResult['outputs'] = [];

      if (adxData.adx.length > 0) outputs.push({ type: 'line', key: 'adx_line', data: adxData.adx, color: '#e2e8f0', lineWidth: 2, pane: 'sub_pane', priceScaleId: 'adx' });
      if (adxData.diPlus.length > 0) outputs.push({ type: 'line', key: 'adx_di_plus', data: adxData.diPlus, color: '#5FB87A', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'adx' });
      if (adxData.diMinus.length > 0) outputs.push({ type: 'line', key: 'adx_di_minus', data: adxData.diMinus, color: '#E05555', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'adx' });

      const lastADX = adxData.adx.length > 0 ? adxData.adx[adxData.adx.length - 1].value : 0;
      const lastDIPlus = adxData.diPlus.length > 0 ? adxData.diPlus[adxData.diPlus.length - 1].value : 0;
      const lastDIMinus = adxData.diMinus.length > 0 ? adxData.diMinus[adxData.diMinus.length - 1].value : 0;
      const strength = lastADX > 25 ? 'STRONG' : 'WEAK';
      const dir = lastDIPlus > lastDIMinus ? 'bullish' : 'bearish';

      return { outputs, signals: [], aiContext: `ADX(${params.period}): ${lastADX.toFixed(1)} ${strength} trend, ${dir} (DI+: ${lastDIPlus.toFixed(1)}, DI-: ${lastDIMinus.toFixed(1)})` };
    },
  });

  // ========================================================================
  // LEGACY S/R (Bollinger, VWAP)
  // ========================================================================

  indicatorRegistry.register({
    key: 'bb', label: 'Bollinger Bands', category: 'support_resistance', color: '#6366f1',
    description: 'Volatility bands at ±2 std deviations from SMA. Price at upper band = stretched high, at lower band = stretched low.',
    pane: 'overlay', defaultEnabled: false,
    params: [
      { name: 'period', label: 'Period', default: 20, min: 5, max: 100, step: 1 },
      { name: 'stdDev', label: 'Std Dev', default: 2, min: 0.5, max: 4, step: 0.5 },
    ],
    compute: (ohlcv, params) => {
      const bb = computeBollingerBands(ohlcv, params.period, params.stdDev);
      const outputs: IndicatorComputeResult['outputs'] = [];

      if (bb.upper.length > 0) {
        outputs.push({ type: 'line', key: 'bb_upper', data: bb.upper, color: '#6366f1', lineWidth: 1, lineStyle: 2, pane: 'overlay' });
        outputs.push({ type: 'line', key: 'bb_middle', data: bb.middle, color: '#6366f1', lineWidth: 1, pane: 'overlay' });
        outputs.push({ type: 'line', key: 'bb_lower', data: bb.lower, color: '#6366f1', lineWidth: 1, lineStyle: 2, pane: 'overlay' });
      }

      const lastUpper = bb.upper.length > 0 ? bb.upper[bb.upper.length - 1].value : 0;
      const lastLower = bb.lower.length > 0 ? bb.lower[bb.lower.length - 1].value : 0;
      const lastClose = ohlcv.length > 0 ? ohlcv[ohlcv.length - 1].close : 0;
      const bbWidth = lastUpper - lastLower;
      const position = lastClose > lastUpper ? 'ABOVE upper band' : lastClose < lastLower ? 'BELOW lower band' : 'within bands';

      return { outputs, signals: [], aiContext: `BB(${params.period},${params.stdDev}): ${position}, width: $${bbWidth.toFixed(2)}` };
    },
  });

  indicatorRegistry.register({
    key: 'vwap', label: 'VWAP', category: 'support_resistance', color: '#ec4899',
    description: 'Volume-Weighted Average Price. Institutional benchmark — price above VWAP = buyers in control, below = sellers.',
    pane: 'overlay', defaultEnabled: false,
    params: [],
    compute: (ohlcv) => {
      const data = computeVWAP(ohlcv);
      const lastVal = data.length > 0 ? data[data.length - 1].value : 0;
      const lastClose = ohlcv.length > 0 ? ohlcv[ohlcv.length - 1].close : 0;
      const position = lastClose > lastVal ? 'ABOVE' : 'BELOW';
      return {
        outputs: [{ type: 'line', key: 'vwap', data, color: '#ec4899', lineWidth: 2, pane: 'overlay' }],
        signals: [],
        aiContext: data.length > 0 ? `VWAP: $${lastVal.toFixed(2)} (price ${position})` : '',
      };
    },
  });

  // ========================================================================
  // MOMENTUM CATEGORY
  // ========================================================================

  // NEW: RSI + Divergence
  indicatorRegistry.register({
    key: 'rsi', label: 'RSI + Divergence', category: 'momentum', color: '#f59e0b',
    description: 'Relative Strength Index (0-100). Above 70 = overbought, below 30 = oversold. Divergences from price signal potential reversals.',
    pane: 'sub_pane', defaultEnabled: false,
    params: [{ name: 'period', label: 'Period', default: 14, min: 5, max: 30, step: 1 }],
    compute: (ohlcv, params) => {
      const rsiData = computeRSI(ohlcv, params.period);
      const outputs: IndicatorComputeResult['outputs'] = [];
      const signals: IndicatorComputeResult['signals'] = [];

      if (rsiData.length > 0) {
        outputs.push({ type: 'line', key: 'rsi_line', data: rsiData, color: '#f59e0b', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'rsi' });
      }

      // Detect divergences
      const divergences = detectRSIDivergence(ohlcv, rsiData);
      if (divergences.length > 0) {
        const markers: SeriesMarker<Time>[] = divergences.map(d => ({
          time: d.time,
          position: d.type === 'bullish_divergence' ? 'belowBar' as const : 'aboveBar' as const,
          color: d.type === 'bullish_divergence' ? '#5FB87A' : '#E05555',
          shape: d.type === 'bullish_divergence' ? 'arrowUp' as const : 'arrowDown' as const,
          text: d.type === 'bullish_divergence' ? 'Bull Div' : 'Bear Div',
        }));
        outputs.push({ type: 'markers', key: 'rsi_divergence', data: markers });

        for (const d of divergences) {
          signals.push({
            type: d.type, direction: d.type === 'bullish_divergence' ? 'bullish' : 'bearish',
            strength: 75, time: d.time, price: d.price,
            description: d.type === 'bullish_divergence' ? 'RSI Bull Div' : 'RSI Bear Div',
          });
        }
      }

      const lastRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1].value : 0;
      const zone = lastRSI > 70 ? 'OVERBOUGHT' : lastRSI < 30 ? 'OVERSOLD' : 'neutral';

      return { outputs, signals, aiContext: `RSI(${params.period}): ${lastRSI.toFixed(1)} ${zone}${divergences.length > 0 ? ` | ${divergences.length} divergence(s) detected` : ''}` };
    },
  });

  // NEW: Stochastic RSI
  indicatorRegistry.register({
    key: 'stochrsi', label: 'Stochastic RSI', category: 'momentum', color: '#8b5cf6',
    description: 'Ultra-sensitive momentum oscillator. %K crossing above %D below 20 = strong buy. %K crossing below %D above 80 = strong sell.',
    pane: 'sub_pane', defaultEnabled: false,
    params: [
      { name: 'rsiPeriod', label: 'RSI Period', default: 14, min: 5, max: 30, step: 1 },
      { name: 'stochPeriod', label: 'Stoch Period', default: 14, min: 5, max: 30, step: 1 },
      { name: 'kSmooth', label: '%K Smooth', default: 3, min: 1, max: 10, step: 1 },
      { name: 'dSmooth', label: '%D Smooth', default: 3, min: 1, max: 10, step: 1 },
    ],
    compute: (ohlcv, params) => {
      const stoch = computeStochRSI(ohlcv, params.rsiPeriod, params.stochPeriod, params.kSmooth, params.dSmooth);
      const outputs: IndicatorComputeResult['outputs'] = [];

      if (stoch.k.length > 0) outputs.push({ type: 'line', key: 'stochrsi_k', data: stoch.k, color: '#8b5cf6', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'stochrsi' });
      if (stoch.d.length > 0) outputs.push({ type: 'line', key: 'stochrsi_d', data: stoch.d, color: '#f59e0b', lineWidth: 1, lineStyle: 2, pane: 'sub_pane', priceScaleId: 'stochrsi' });

      const lastK = stoch.k.length > 0 ? stoch.k[stoch.k.length - 1].value : 50;
      const lastD = stoch.d.length > 0 ? stoch.d[stoch.d.length - 1].value : 50;
      const zone = lastK > 80 ? 'OVERBOUGHT' : lastK < 20 ? 'OVERSOLD' : 'neutral';

      return { outputs, signals: [], aiContext: `StochRSI: %K=${lastK.toFixed(1)} %D=${lastD.toFixed(1)} ${zone}` };
    },
  });

  // NEW: CCI
  indicatorRegistry.register({
    key: 'cci', label: 'CCI', category: 'momentum', color: '#14b8a6',
    description: 'Commodity Channel Index. Measures deviation from average. Above +100 = overbought, below -100 = oversold. Zero-line cross = momentum shift.',
    pane: 'sub_pane', defaultEnabled: false,
    params: [{ name: 'period', label: 'Period', default: 20, min: 5, max: 50, step: 1 }],
    compute: (ohlcv, params) => {
      const data = computeCCI(ohlcv, params.period);
      const lastCCI = data.length > 0 ? data[data.length - 1].value : 0;
      const zone = lastCCI > 100 ? 'OVERBOUGHT' : lastCCI < -100 ? 'OVERSOLD' : 'neutral';
      return {
        outputs: data.length > 0 ? [{ type: 'line', key: 'cci_line', data, color: '#14b8a6', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'cci' }] : [],
        signals: [],
        aiContext: `CCI(${params.period}): ${lastCCI.toFixed(1)} ${zone}`,
      };
    },
  });

  // ========================================================================
  // VOLUME CATEGORY
  // ========================================================================

  // NEW: OBV
  indicatorRegistry.register({
    key: 'obv', label: 'OBV', category: 'volume', color: '#a78bfa',
    description: 'On-Balance Volume. Running total — adds volume on up-days, subtracts on down-days. Rising OBV confirms uptrend, falling confirms downtrend.',
    pane: 'sub_pane', defaultEnabled: false,
    params: [],
    compute: (ohlcv) => {
      const data = computeOBV(ohlcv);
      const lastOBV = data.length > 0 ? data[data.length - 1].value : 0;
      const prevOBV = data.length > 5 ? data[data.length - 6].value : lastOBV;
      const trend = lastOBV > prevOBV ? 'RISING' : lastOBV < prevOBV ? 'FALLING' : 'FLAT';
      return {
        outputs: data.length > 0 ? [{ type: 'line', key: 'obv_line', data, color: '#a78bfa', lineWidth: 1, pane: 'sub_pane', priceScaleId: 'obv' }] : [],
        signals: [],
        aiContext: `OBV: ${trend} (${lastOBV.toFixed(0)})`,
      };
    },
  });

  // NEW: Volume Profile (POC/VAH/VAL as price lines)
  indicatorRegistry.register({
    key: 'volume_profile', label: 'Volume Profile', category: 'volume', color: '#f472b6',
    description: 'Shows where trading volume concentrated. POC = most-traded price (fair value). VAH/VAL = 70% volume range boundaries.',
    pane: 'overlay', defaultEnabled: false,
    params: [{ name: 'bins', label: 'Bins', default: 50, min: 20, max: 100, step: 5 }],
    compute: (ohlcv, params) => {
      const vp = computeVolumeProfile(ohlcv, params.bins);
      if (!vp) return { outputs: [], signals: [], aiContext: '' };

      return {
        outputs: [
          { type: 'price_line', key: 'vp_poc', price: vp.poc, color: '#f472b6', lineWidth: 2, lineStyle: 0, label: `POC $${vp.poc.toFixed(2)}`, axisLabelVisible: true },
          { type: 'price_line', key: 'vp_vah', price: vp.vah, color: 'rgba(244,114,182,0.5)', lineWidth: 1, lineStyle: 2, label: `VAH $${vp.vah.toFixed(2)}`, axisLabelVisible: false },
          { type: 'price_line', key: 'vp_val', price: vp.val, color: 'rgba(244,114,182,0.5)', lineWidth: 1, lineStyle: 2, label: `VAL $${vp.val.toFixed(2)}`, axisLabelVisible: false },
        ],
        signals: [],
        aiContext: `Vol Profile: POC=$${vp.poc.toFixed(2)}, VAH=$${vp.vah.toFixed(2)}, VAL=$${vp.val.toFixed(2)}`,
      };
    },
  });

  // ========================================================================
  // SUPPORT / RESISTANCE CATEGORY
  // ========================================================================

  // NEW: Pivot Points
  indicatorRegistry.register({
    key: 'pivots', label: 'Pivot Points', category: 'support_resistance', color: '#fbbf24',
    description: 'Classic institutional levels: PP (pivot), R1-R3 (resistance), S1-S3 (support). Calculated from prior period high/low/close.',
    pane: 'overlay', defaultEnabled: false,
    params: [],
    compute: (ohlcv) => {
      const pp = computePivotPoints(ohlcv);
      if (!pp) return { outputs: [], signals: [], aiContext: '' };

      return {
        outputs: [
          { type: 'price_line', key: 'pp', price: pp.pp, color: '#fbbf24', lineWidth: 1, lineStyle: 0, label: `PP $${pp.pp.toFixed(2)}`, axisLabelVisible: true },
          { type: 'price_line', key: 'r1', price: pp.r1, color: '#E05555', lineWidth: 1, lineStyle: 2, label: `R1 $${pp.r1.toFixed(2)}`, axisLabelVisible: true },
          { type: 'price_line', key: 'r2', price: pp.r2, color: '#E05555', lineWidth: 1, lineStyle: 2, label: `R2`, axisLabelVisible: false },
          { type: 'price_line', key: 'r3', price: pp.r3, color: '#E05555', lineWidth: 1, lineStyle: 1, label: `R3`, axisLabelVisible: false },
          { type: 'price_line', key: 's1', price: pp.s1, color: '#5FB87A', lineWidth: 1, lineStyle: 2, label: `S1 $${pp.s1.toFixed(2)}`, axisLabelVisible: true },
          { type: 'price_line', key: 's2', price: pp.s2, color: '#5FB87A', lineWidth: 1, lineStyle: 2, label: `S2`, axisLabelVisible: false },
          { type: 'price_line', key: 's3', price: pp.s3, color: '#5FB87A', lineWidth: 1, lineStyle: 1, label: `S3`, axisLabelVisible: false },
        ],
        signals: [],
        aiContext: `Pivots: PP=$${pp.pp.toFixed(2)}, R1=$${pp.r1.toFixed(2)}, R2=$${pp.r2.toFixed(2)}, S1=$${pp.s1.toFixed(2)}, S2=$${pp.s2.toFixed(2)}`,
      };
    },
  });

  // NEW: ATR Bands
  indicatorRegistry.register({
    key: 'atr_bands', label: 'ATR Bands', category: 'support_resistance', color: '#06b6d4',
    description: 'Volatility envelope around EMA using ATR. Wider = more volatile. Price at outer band = stretched / potential reversal.',
    pane: 'overlay', defaultEnabled: false,
    params: [
      { name: 'atrPeriod', label: 'ATR Period', default: 14, min: 5, max: 50, step: 1 },
      { name: 'multiplier', label: 'Multiplier', default: 2, min: 1, max: 5, step: 0.5 },
      { name: 'emaPeriod', label: 'EMA Period', default: 20, min: 5, max: 100, step: 1 },
    ],
    compute: (ohlcv, params) => {
      const bands = computeATRBands(ohlcv, params.atrPeriod, params.multiplier, params.emaPeriod);
      return {
        outputs: [
          ...(bands.upper.length > 0 ? [{ type: 'line' as const, key: 'atr_upper', data: bands.upper, color: '#06b6d4', lineWidth: 1, lineStyle: 2, pane: 'overlay' as const }] : []),
          ...(bands.lower.length > 0 ? [{ type: 'line' as const, key: 'atr_lower', data: bands.lower, color: '#06b6d4', lineWidth: 1, lineStyle: 2, pane: 'overlay' as const }] : []),
        ],
        signals: [],
        aiContext: bands.upper.length > 0 ? `ATR Bands: Upper=$${bands.upper[bands.upper.length - 1].value.toFixed(2)}, Lower=$${bands.lower[bands.lower.length - 1].value.toFixed(2)}` : '',
      };
    },
  });

  // NEW: Donchian Channel
  indicatorRegistry.register({
    key: 'donchian', label: 'Donchian Channel', category: 'support_resistance', color: '#34d399',
    description: 'N-period high/low channel. Breakout above upper = new high (bullish). Breakout below lower = new low (bearish). The Turtle Traders strategy.',
    pane: 'overlay', defaultEnabled: false,
    params: [{ name: 'period', label: 'Period', default: 20, min: 5, max: 100, step: 1 }],
    compute: (ohlcv, params) => {
      const don = computeDonchian(ohlcv, params.period);
      const outputs: IndicatorComputeResult['outputs'] = [];

      if (don.upper.length > 0) {
        outputs.push({ type: 'line', key: 'don_upper', data: don.upper, color: '#34d399', lineWidth: 1, pane: 'overlay' });
        outputs.push({ type: 'line', key: 'don_middle', data: don.middle, color: '#34d399', lineWidth: 1, lineStyle: 2, pane: 'overlay' });
        outputs.push({ type: 'line', key: 'don_lower', data: don.lower, color: '#34d399', lineWidth: 1, pane: 'overlay' });
      }

      const lastClose = ohlcv.length > 0 ? ohlcv[ohlcv.length - 1].close : 0;
      const lastUpper = don.upper.length > 0 ? don.upper[don.upper.length - 1].value : 0;
      const lastLower = don.lower.length > 0 ? don.lower[don.lower.length - 1].value : 0;
      const breakout = lastClose >= lastUpper ? 'BREAKOUT HIGH' : lastClose <= lastLower ? 'BREAKOUT LOW' : 'within channel';

      return { outputs, signals: [], aiContext: `Donchian(${params.period}): ${breakout}, High=$${lastUpper.toFixed(2)}, Low=$${lastLower.toFixed(2)}` };
    },
  });

  // ========================================================================
  // SIGNALS CATEGORY
  // ========================================================================

  // NEW: EMA Cross (9/21)
  indicatorRegistry.register({
    key: 'ema_cross', label: 'EMA Cross (9/21)', category: 'signals', color: '#10b981',
    description: 'Buy/sell arrows at EMA crossover points. Fast EMA (9) crossing above slow EMA (21) = bullish momentum shift.',
    pane: 'overlay', defaultEnabled: false,
    params: [
      { name: 'fast', label: 'Fast EMA', default: 9, min: 2, max: 50, step: 1 },
      { name: 'slow', label: 'Slow EMA', default: 21, min: 5, max: 100, step: 1 },
    ],
    compute: (ohlcv, params) => {
      const fastData = computeEMA(ohlcv, params.fast);
      const slowData = computeEMA(ohlcv, params.slow);
      const crossSignals = generateEMACrossSignals(ohlcv, params.fast, params.slow);

      const outputs: IndicatorComputeResult['outputs'] = [];
      const signals: IndicatorComputeResult['signals'] = [];

      outputs.push({ type: 'line', key: 'ema_cross_fast', data: fastData, color: '#10b981', lineWidth: 1, pane: 'overlay' });
      outputs.push({ type: 'line', key: 'ema_cross_slow', data: slowData, color: '#ef4444', lineWidth: 1, pane: 'overlay' });

      if (crossSignals.length > 0) {
        const markers: SeriesMarker<Time>[] = crossSignals.map(s => ({
          time: s.time,
          position: s.direction === 'bullish' ? 'belowBar' as const : 'aboveBar' as const,
          color: s.direction === 'bullish' ? '#5FB87A' : '#E05555',
          shape: s.direction === 'bullish' ? 'arrowUp' as const : 'arrowDown' as const,
          text: s.direction === 'bullish' ? 'BUY' : 'SELL',
        }));
        outputs.push({ type: 'markers', key: 'ema_cross_signals', data: markers });

        for (const s of crossSignals) {
          signals.push({
            type: `ema_cross_${s.direction}`,
            direction: s.direction,
            strength: 70,
            time: s.time,
            price: s.price,
            description: s.direction === 'bullish' ? `EMA ${params.fast}/${params.slow} BUY` : `EMA ${params.fast}/${params.slow} SELL`,
          });
        }
      }

      const lastCross = crossSignals.length > 0 ? crossSignals[crossSignals.length - 1] : null;
      return { outputs, signals, aiContext: lastCross ? `EMA Cross(${params.fast}/${params.slow}): Last signal = ${lastCross.direction.toUpperCase()} at $${lastCross.price.toFixed(2)}` : `EMA Cross(${params.fast}/${params.slow}): No recent crosses` };
    },
  });

  // NEW: RSI Reversal
  indicatorRegistry.register({
    key: 'rsi_reversal', label: 'RSI Reversal', category: 'signals', color: '#f59e0b',
    description: 'Buy arrows when RSI exits oversold (crosses above 30). Sell arrows when RSI exits overbought (crosses below 70).',
    pane: 'overlay', defaultEnabled: false,
    params: [{ name: 'period', label: 'RSI Period', default: 14, min: 5, max: 30, step: 1 }],
    compute: (ohlcv, params) => {
      const rsiData = computeRSI(ohlcv, params.period);
      const reversals = generateRSIReversalSignals(ohlcv, rsiData);
      const outputs: IndicatorComputeResult['outputs'] = [];
      const signals: IndicatorComputeResult['signals'] = [];

      if (reversals.length > 0) {
        const markers: SeriesMarker<Time>[] = reversals.map(s => ({
          time: s.time,
          position: s.direction === 'bullish' ? 'belowBar' as const : 'aboveBar' as const,
          color: s.direction === 'bullish' ? '#5FB87A' : '#E05555',
          shape: s.direction === 'bullish' ? 'arrowUp' as const : 'arrowDown' as const,
          text: s.direction === 'bullish' ? 'RSI Buy' : 'RSI Sell',
        }));
        outputs.push({ type: 'markers', key: 'rsi_reversal_signals', data: markers });

        for (const s of reversals) {
          signals.push({
            type: `rsi_reversal_${s.direction}`,
            direction: s.direction,
            strength: 65,
            time: s.time,
            price: s.price,
            description: s.direction === 'bullish' ? 'RSI Exit Oversold' : 'RSI Exit Overbought',
          });
        }
      }

      return { outputs, signals, aiContext: reversals.length > 0 ? `RSI Reversal: ${reversals.length} signal(s)` : 'RSI Reversal: No signals' };
    },
  });

  // NEW: MACD Histogram Flip
  indicatorRegistry.register({
    key: 'macd_flip', label: 'MACD Hist Flip', category: 'signals', color: '#3b82f6',
    description: 'Buy/sell arrows when MACD histogram changes sign. Histogram flipping positive = early bullish momentum shift.',
    pane: 'overlay', defaultEnabled: false,
    params: [
      { name: 'fast', label: 'Fast', default: 12, min: 2, max: 50, step: 1 },
      { name: 'slow', label: 'Slow', default: 26, min: 5, max: 100, step: 1 },
      { name: 'signal', label: 'Signal', default: 9, min: 2, max: 30, step: 1 },
    ],
    compute: (ohlcv, params) => {
      const macd = computeMACD(ohlcv, params.fast, params.slow, params.signal);
      const flips = generateMACDFlipSignals(macd.histogram, ohlcv);
      const outputs: IndicatorComputeResult['outputs'] = [];
      const signals: IndicatorComputeResult['signals'] = [];

      if (flips.length > 0) {
        const markers: SeriesMarker<Time>[] = flips.map(s => ({
          time: s.time,
          position: s.direction === 'bullish' ? 'belowBar' as const : 'aboveBar' as const,
          color: s.direction === 'bullish' ? '#5FB87A' : '#E05555',
          shape: s.direction === 'bullish' ? 'arrowUp' as const : 'arrowDown' as const,
          text: s.direction === 'bullish' ? 'MACD+' : 'MACD-',
        }));
        outputs.push({ type: 'markers', key: 'macd_flip_signals', data: markers });

        for (const s of flips) {
          signals.push({
            type: `macd_flip_${s.direction}`,
            direction: s.direction,
            strength: 60,
            time: s.time,
            price: s.price,
            description: s.direction === 'bullish' ? 'MACD Hist → Positive' : 'MACD Hist → Negative',
          });
        }
      }

      return { outputs, signals, aiContext: flips.length > 0 ? `MACD Flip: ${flips.length} signal(s)` : 'MACD Flip: No signals' };
    },
  });

  // ========================================================================
  // PATTERNS CATEGORY
  // ========================================================================

  // NEW: Swing High/Low
  indicatorRegistry.register({
    key: 'swing_points', label: 'Swing High/Low', category: 'patterns', color: '#f472b6',
    description: 'Marks pivot highs (resistance) and pivot lows (support). Shows market structure — higher highs + higher lows = uptrend.',
    pane: 'overlay', defaultEnabled: false,
    params: [{ name: 'lookback', label: 'Lookback', default: 3, min: 2, max: 10, step: 1 }],
    compute: (ohlcv, params) => {
      const swings = detectSwingPoints(ohlcv, params.lookback);
      const markers: SeriesMarker<Time>[] = swings.map(s => ({
        time: s.time,
        position: s.type === 'high' ? 'aboveBar' as const : 'belowBar' as const,
        color: s.type === 'high' ? '#E05555' : '#5FB87A',
        shape: s.type === 'high' ? 'arrowDown' as const : 'arrowUp' as const,
        text: s.type === 'high' ? 'SH' : 'SL',
      }));

      return {
        outputs: markers.length > 0 ? [{ type: 'markers', key: 'swing_points', data: markers }] : [],
        signals: [],
        aiContext: `Swing Points: ${swings.filter(s => s.type === 'high').length} highs, ${swings.filter(s => s.type === 'low').length} lows`,
      };
    },
  });

  // NEW: Candlestick Patterns
  indicatorRegistry.register({
    key: 'candle_patterns', label: 'Candle Patterns', category: 'patterns', color: '#ec4899',
    description: 'Detects engulfing, doji, hammer, shooting star patterns. These are the language of price action — key reversal signals.',
    pane: 'overlay', defaultEnabled: false,
    params: [],
    compute: (ohlcv) => {
      const patterns = detectCandlePatterns(ohlcv);
      const markers: SeriesMarker<Time>[] = patterns.map(p => ({
        time: p.time,
        position: p.direction === 'bullish' ? 'belowBar' as const : p.direction === 'bearish' ? 'aboveBar' as const : 'aboveBar' as const,
        color: p.direction === 'bullish' ? '#5FB87A' : p.direction === 'bearish' ? '#E05555' : '#B8860B',
        shape: p.direction === 'bullish' ? 'arrowUp' as const : 'arrowDown' as const,
        text: p.pattern,
      }));

      const signals: IndicatorComputeResult['signals'] = patterns.slice(-5).map(p => ({
        type: `candle_${p.pattern.toLowerCase().replace(' ', '_')}`,
        direction: p.direction,
        strength: 55,
        time: p.time,
        price: p.price,
        description: `${p.pattern} (${p.direction})`,
      }));

      return {
        outputs: markers.length > 0 ? [{ type: 'markers', key: 'candle_pattern_markers', data: markers }] : [],
        signals,
        aiContext: patterns.length > 0 ? `Candle Patterns: ${patterns.slice(-3).map(p => `${p.pattern}(${p.direction})`).join(', ')}` : 'Candle Patterns: None detected',
      };
    },
  });
}
