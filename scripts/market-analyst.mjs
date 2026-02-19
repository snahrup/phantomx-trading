#!/usr/bin/env node
/**
 * Market Analyst CLI — Direct tool invocation for DOGE/USDT:USDT analysis
 */

import { getPhemexClient } from '../src/lib/phemex/client.js';

const symbol = 'DOGE/USDT:USDT';

async function analyze() {
  try {
    const client = getPhemexClient();

    // 1. Get ticker
    console.log('=== TICKER ===');
    const ticker = await client.getTicker(symbol);
    console.log(JSON.stringify(ticker, null, 2));

    // 2. Get OHLCV 1h (24 candles)
    console.log('\n=== OHLCV 1H (24 candles) ===');
    const ohlcv1h = await client.getOHLCV(symbol, '1h', 24);
    console.log(JSON.stringify(ohlcv1h.map(c => ({
      t: c.timestamp,
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
      v: c.volume
    })), null, 2));

    // 3. Get order book
    console.log('\n=== ORDER BOOK ===');
    const orderBook = await client.getOrderBook(symbol, 20);
    console.log(JSON.stringify(orderBook, null, 2));

    // 4. Get OHLCV for 4h technical analysis
    console.log('\n=== TECHNICAL ANALYSIS 4H ===');
    const ohlcv4h = await client.getOHLCV(symbol, '4h', 60);
    const ta4h = computeTechnicalAnalysis(ohlcv4h, '4h');
    console.log(JSON.stringify(ta4h, null, 2));

    // 5. Get OHLCV for 1d technical analysis
    console.log('\n=== TECHNICAL ANALYSIS 1D ===');
    const ohlcv1d = await client.getOHLCV(symbol, '1d', 60);
    const ta1d = computeTechnicalAnalysis(ohlcv1d, '1d');
    console.log(JSON.stringify(ta1d, null, 2));

    // 6. Regime classification (uses 1h data)
    console.log('\n=== REGIME CLASSIFICATION ===');
    const ohlcv100 = await client.getOHLCV(symbol, '1h', 100);
    const regime = await classifyRegimeSimple(ohlcv100);
    console.log(JSON.stringify(regime, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function sma(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((s, p) => s + p, 0) / period;
}

function ema(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let value = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    value = prices[i] * k + value * (1 - k);
  }
  return value;
}

function emaArray(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let value = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  result.push(value);
  for (let i = period; i < prices.length; i++) {
    value = prices[i] * k + value * (1 - k);
    result.push(value);
  }
  return result;
}

function emaFromArray(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

function rsi(prices, period) {
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

function macd(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow + signal) return { line: null, signal: null, histogram: null };

  const emaFast = ema(prices, fast);
  const emaSlow = ema(prices, slow);
  if (emaFast === null || emaSlow === null) return { line: null, signal: null, histogram: null };

  const fastArr = emaArray(prices, fast);
  const slowArr = emaArray(prices, slow);
  const macdValues = [];
  const minLen = Math.min(fastArr.length, slowArr.length);
  for (let i = 0; i < minLen; i++) {
    macdValues.push(fastArr[fastArr.length - minLen + i] - slowArr[slowArr.length - minLen + i]);
  }

  if (macdValues.length < signal) return { line: emaFast - emaSlow, signal: null, histogram: null };

  const signalLine = emaFromArray(macdValues, signal);
  const macdLine = macdValues[macdValues.length - 1];
  const histogram = signalLine !== null ? macdLine - signalLine : null;

  return { line: macdLine, signal: signalLine, histogram };
}

function bollingerBands(prices, period, stdDevMultiplier) {
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

function atr(highs, lows, closes, period) {
  if (highs.length < period + 1) return null;
  const trueRanges = [];
  for (let i = highs.length - period; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hc, lc));
  }
  return trueRanges.reduce((s, tr) => s + tr, 0) / period;
}

function computeTechnicalAnalysis(ohlcv, timeframe) {
  const closes = ohlcv.map(c => c.close);
  const highs = ohlcv.map(c => c.high);
  const lows = ohlcv.map(c => c.low);
  const volumes = ohlcv.map(c => c.volume);
  const price = closes[closes.length - 1];

  const sma7 = sma(closes, 7);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const macdResult = macd(closes);
  const bb = bollingerBands(closes, 20, 2);
  const atr14 = atr(highs, lows, closes, 14);

  // Volume trend: last 5 bars vs prior 5
  const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0);
  const priorVol = volumes.slice(-10, -5).reduce((s, v) => s + v, 0);
  const volumeTrend = priorVol > 0 ? ((recentVol - priorVol) / priorVol) * 100 : 0;

  // Determine trend direction
  let trend = 'sideways';
  if (sma7 && sma20 && sma50) {
    if (sma7 > sma20 && sma20 > sma50) trend = 'up';
    else if (sma7 < sma20 && sma20 < sma50) trend = 'down';
  } else if (sma7 && sma20) {
    trend = sma7 > sma20 ? 'up' : 'down';
  }

  // Compute strength score (0-100)
  let strength = 50;

  // SMA alignment
  if (trend === 'up') strength += 15;
  else if (trend === 'down') strength -= 15;

  // RSI
  if (rsi14 !== null) {
    if (rsi14 > 70) strength += 10;
    else if (rsi14 > 55) strength += 15;
    else if (rsi14 < 30) strength -= 10;
    else if (rsi14 < 45) strength -= 15;
  }

  // MACD histogram
  if (macdResult.histogram !== null) {
    if (macdResult.histogram > 0) strength += 10;
    else strength -= 10;
  }

  // Bollinger Band position
  if (bb.upper && bb.lower && bb.middle) {
    const bbPos = (price - bb.lower) / (bb.upper - bb.lower);
    if (bbPos > 0.8) strength += 5;
    else if (bbPos < 0.2) strength -= 5;
  }

  // Volume trend confirmation
  if (volumeTrend > 20 && trend === 'up') strength += 5;
  else if (volumeTrend > 20 && trend === 'down') strength -= 5;

  strength = Math.max(0, Math.min(100, Math.round(strength)));

  return {
    symbol,
    timeframe,
    price,
    indicators: {
      sma7: sma7 !== null ? Math.round(sma7 * 100) / 100 : null,
      sma20: sma20 !== null ? Math.round(sma20 * 100) / 100 : null,
      sma50: sma50 !== null ? Math.round(sma50 * 100) / 100 : null,
      rsi14: rsi14 !== null ? Math.round(rsi14 * 100) / 100 : null,
      macdLine: macdResult.line !== null ? Math.round(macdResult.line * 1000) / 1000 : null,
      macdSignal: macdResult.signal !== null ? Math.round(macdResult.signal * 1000) / 1000 : null,
      macdHistogram: macdResult.histogram !== null ? Math.round(macdResult.histogram * 1000) / 1000 : null,
      bbUpper: bb.upper !== null ? Math.round(bb.upper * 100) / 100 : null,
      bbMiddle: bb.middle !== null ? Math.round(bb.middle * 100) / 100 : null,
      bbLower: bb.lower !== null ? Math.round(bb.lower * 100) / 100 : null,
      atr14: atr14 !== null ? Math.round(atr14 * 100) / 100 : null,
      volumeTrend: Math.round(volumeTrend * 100) / 100,
    },
    trend,
    strength,
    candlesAnalyzed: ohlcv.length,
  };
}

async function classifyRegimeSimple(ohlcv) {
  // Simple regime classification - placeholder
  // In production this would use the actual classifyRegime from market/regime-classifier
  const closes = ohlcv.map(c => c.close);
  const highs = ohlcv.map(c => c.high);
  const lows = ohlcv.map(c => c.low);

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const atr14 = atr(highs, lows, closes, 14);
  const price = closes[closes.length - 1];

  let regime = 'ranging';
  if (sma20 && sma50) {
    if (sma20 > sma50 * 1.02) regime = 'trending_up';
    else if (sma20 < sma50 * 0.98) regime = 'trending_down';
  }

  const atrPercent = atr14 ? (atr14 / price) * 100 : 0;
  if (atrPercent > 5) regime = 'volatile';

  return {
    symbol,
    regime,
    confidence: 75,
    adx: 25, // placeholder
    volatilityPercentile: atrPercent > 3 ? 80 : 50,
    trendStrength: Math.abs((sma20 || price) - (sma50 || price)) / price,
    atrPercent,
    interpretation: `Market regime: ${regime}. ATR%: ${atrPercent.toFixed(2)}%`,
  };
}

analyze().catch(console.error);
