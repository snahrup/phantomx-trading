// ============================================================================
// PhantomX — Dynamic Slippage Model
// Estimates slippage based on order size, book depth, volatility, liquidity
// ============================================================================

import type { OrderBook, OHLCV, SlippageEstimate } from '@/types/trading';

interface SlippageModelParams {
  orderSizeUsd: number;
  orderBook?: OrderBook;
  recentBars?: OHLCV[];          // last 20+ bars for volatility calc
  baseSlippagePercent?: number;   // default exchange slippage (e.g., 0.05%)
}

export function estimateSlippage(params: SlippageModelParams): SlippageEstimate {
  const {
    orderSizeUsd,
    orderBook,
    recentBars,
    baseSlippagePercent = 0.05,
  } = params;

  let volumeAdj = 0;
  let volatilityAdj = 0;
  let depthAdj = 0;

  // 1. Volume Adjustment — larger orders move the market more
  if (orderSizeUsd > 1000) {
    // Logarithmic scaling: every 10x in size adds ~0.02% slippage
    volumeAdj = Math.log10(orderSizeUsd / 1000) * 0.02;
  }

  // 2. Volatility Adjustment — ATR-based
  if (recentBars && recentBars.length >= 14) {
    const closes = recentBars.map(b => b.close);
    const currentPrice = closes.at(-1)!;

    // Simple ATR
    let atrSum = 0;
    for (let i = 1; i < Math.min(15, recentBars.length); i++) {
      const h = recentBars[i].high;
      const l = recentBars[i].low;
      const pc = recentBars[i - 1].close;
      atrSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    }
    const atr = atrSum / Math.min(14, recentBars.length - 1);
    const atrPercent = (atr / currentPrice) * 100;

    // Higher ATR% → more slippage
    if (atrPercent > 2) {
      volatilityAdj = (atrPercent - 2) * 0.01; // 0.01% per 1% ATR above 2%
    }
  }

  // 3. Order Book Depth Adjustment
  if (orderBook && orderBook.asks.length > 0 && orderBook.bids.length > 0) {
    // Sum liquidity within 0.1% of mid price
    const midPrice = (orderBook.bids[0].price + orderBook.asks[0].price) / 2;
    const spreadPercent = ((orderBook.asks[0].price - orderBook.bids[0].price) / midPrice) * 100;

    // Spread contributes to slippage
    depthAdj += spreadPercent / 2;

    // Check if order would eat through multiple levels
    const threshold = midPrice * 0.001; // 0.1% band
    let depthUsd = 0;
    for (const level of orderBook.asks) {
      if (level.price > midPrice + threshold) break;
      depthUsd += level.price * level.amount;
    }

    // If order is bigger than available depth, slippage increases
    if (depthUsd > 0 && orderSizeUsd > depthUsd) {
      depthAdj += ((orderSizeUsd - depthUsd) / depthUsd) * 0.1;
    }
  }

  const totalSlippage = baseSlippagePercent + volumeAdj + volatilityAdj + depthAdj;

  // Confidence: higher when we have more data
  let confidence = 0.3; // base
  if (recentBars && recentBars.length >= 14) confidence += 0.3;
  if (orderBook && orderBook.asks.length > 5) confidence += 0.4;

  return {
    baseSlippage: baseSlippagePercent,
    volumeAdjustment: volumeAdj,
    volatilityAdjustment: volatilityAdj,
    depthAdjustment: depthAdj,
    totalSlippage: Math.max(0, totalSlippage),
    confidence: Math.min(1, confidence),
  };
}
