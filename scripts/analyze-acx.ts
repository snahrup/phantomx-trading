#!/usr/bin/env tsx
// Market Analysis Script for ACX/USDT:USDT
import { getPhemexClient } from '../src/lib/phemex/client';
import { classifyRegime } from '../src/lib/market/regime-classifier';

async function analyzeACX() {
  const symbol = 'ACX/USDT:USDT';

  try {
    const client = getPhemexClient();

    // 1. Get ticker
    const ticker = await client.getTicker(symbol);
    console.log('=== TICKER DATA ===');
    console.log(JSON.stringify(ticker, null, 2));

    // 2. Get 1h OHLCV (last 24 candles for intraday structure)
    const ohlcv1h = await client.getOHLCV(symbol, '1h', 24);
    console.log('\n=== 1H OHLCV (24 candles) ===');
    console.log(JSON.stringify({ count: ohlcv1h.length, candles: ohlcv1h.slice(-5) }, null, 2));

    // 3. Get 4h OHLCV and calculate indicators
    const ohlcv4h = await client.getOHLCV(symbol, '4h', 60);
    console.log('\n=== 4H TECHNICAL ANALYSIS ===');

    const closes4h = ohlcv4h.map(c => c.close);
    const highs4h = ohlcv4h.map(c => c.high);
    const lows4h = ohlcv4h.map(c => c.low);
    const volumes4h = ohlcv4h.map(c => c.volume);

    // Helper functions for indicators
    const sma = (prices: number[], period: number) => {
      if (prices.length < period) return null;
      const slice = prices.slice(-period);
      return slice.reduce((s, p) => s + p, 0) / period;
    };

    const ema = (prices: number[], period: number) => {
      if (prices.length < period) return null;
      const k = 2 / (period + 1);
      let value = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
      for (let i = period; i < prices.length; i++) {
        value = prices[i] * k + value * (1 - k);
      }
      return value;
    };

    const rsi = (prices: number[], period: number) => {
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
    };

    const macd = (prices: number[]) => {
      const fast = ema(prices, 12);
      const slow = ema(prices, 26);
      if (!fast || !slow) return { line: null, histogram: null };
      const line = fast - slow;
      return { line, histogram: line * 0.1 }; // Simplified
    };

    const bb = (prices: number[], period: number, mult: number) => {
      const mid = sma(prices, period);
      if (!mid) return { upper: null, middle: null, lower: null };
      const slice = prices.slice(-period);
      const variance = slice.reduce((s, p) => s + Math.pow(p - mid, 2), 0) / period;
      const stdDev = Math.sqrt(variance);
      return {
        upper: mid + stdDev * mult,
        middle: mid,
        lower: mid - stdDev * mult,
      };
    };

    const indicators4h = {
      symbol,
      timeframe: '4h',
      price: closes4h[closes4h.length - 1],
      sma7: sma(closes4h, 7),
      sma20: sma(closes4h, 20),
      sma50: sma(closes4h, 50),
      ema12: ema(closes4h, 12),
      ema26: ema(closes4h, 26),
      rsi14: rsi(closes4h, 14),
      macd: macd(closes4h),
      bb: bb(closes4h, 20, 2),
      volumeAvg: sma(volumes4h, 20),
      volumeCurrent: volumes4h[volumes4h.length - 1],
    };
    console.log(JSON.stringify(indicators4h, null, 2));

    // 4. Get 1d OHLCV and calculate indicators
    console.log('\n=== 1D TECHNICAL ANALYSIS ===');
    const ohlcv1d = await client.getOHLCV(symbol, '1d', 60);
    const closes1d = ohlcv1d.map(c => c.close);
    const volumes1d = ohlcv1d.map(c => c.volume);

    const indicators1d = {
      symbol,
      timeframe: '1d',
      price: closes1d[closes1d.length - 1],
      sma7: sma(closes1d, 7),
      sma20: sma(closes1d, 20),
      sma50: sma(closes1d, 50),
      ema12: ema(closes1d, 12),
      ema26: ema(closes1d, 26),
      rsi14: rsi(closes1d, 14),
      macd: macd(closes1d),
      bb: bb(closes1d, 20, 2),
      volumeAvg: sma(volumes1d, 20),
      volumeCurrent: volumes1d[volumes1d.length - 1],
    };
    console.log(JSON.stringify(indicators1d, null, 2));

    // 5. Get order book
    console.log('\n=== ORDER BOOK ===');
    const orderBook = await client.getOrderBook(symbol, 20);

    // Calculate order book metrics
    const totalBidVolume = orderBook.bids.reduce((sum, bid) => sum + bid.amount, 0);
    const totalAskVolume = orderBook.asks.reduce((sum, ask) => sum + ask.amount, 0);
    const bidAskRatio = totalAskVolume > 0 ? totalBidVolume / totalAskVolume : 0;

    console.log(JSON.stringify({
      symbol: orderBook.symbol,
      timestamp: orderBook.timestamp,
      topBid: orderBook.bids[0],
      topAsk: orderBook.asks[0],
      spread: orderBook.asks[0] ? orderBook.asks[0].price - orderBook.bids[0].price : 0,
      spreadPercent: orderBook.asks[0] && orderBook.bids[0] ?
        ((orderBook.asks[0].price - orderBook.bids[0].price) / orderBook.bids[0].price) * 100 : 0,
      totalBidVolume,
      totalAskVolume,
      bidAskRatio,
      top5Bids: orderBook.bids.slice(0, 5),
      top5Asks: orderBook.asks.slice(0, 5),
    }, null, 2));

    // 6. Classify market regime
    console.log('\n=== MARKET REGIME ===');
    const regime = classifyRegime(ohlcv1h, 24);
    console.log(JSON.stringify(regime, null, 2));

    console.log('\n=== ANALYSIS COMPLETE ===');

  } catch (error) {
    console.error('Error during analysis:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

analyzeACX().catch(console.error);
