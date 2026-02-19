// ============================================================================
// PhantomX — In-Process MCP Tool Server
// ============================================================================
// Defines 17 tools across 5 categories (Market Data, Account, Technical
// Analysis, Strategy, Knowledge) using the Claude Agent SDK's MCP helpers.
// Wraps existing PhantomX infrastructure so Claude can dynamically fetch
// real market data, run backtests, and query the trading knowledge base.
// ============================================================================

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';
import { getSignalBus } from '@/lib/agents/signal-bus';
import { classifyRegime } from '@/lib/market/regime-classifier';
import { runWalkForward } from '@/lib/strategy/backtest-engine';
import {
  queryKnowledge,
  getHardConstraints,
  getAntiPatterns,
  type KnowledgeDomain,
} from '@/lib/strategy/knowledge-base';
import type { OHLCV, BacktestConfig, StrategyConfig } from '@/types/trading';

// ============================================================================
// Standalone Technical Indicator Functions
// (Ported from TechnicalAgent private methods — self-contained, no class deps)
// ============================================================================

function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((s, p) => s + p, 0) / period;
}

function ema(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let value = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  for (let i = period; i < prices.length; i++) {
    value = prices[i] * k + value * (1 - k);
  }
  return value;
}

function emaArray(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let value = prices.slice(0, period).reduce((s, p) => s + p, 0) / period;
  result.push(value);
  for (let i = period; i < prices.length; i++) {
    value = prices[i] * k + value * (1 - k);
    result.push(value);
  }
  return result;
}

function emaFromArray(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    value = values[i] * k + value * (1 - k);
  }
  return value;
}

function rsi(prices: number[], period: number): number | null {
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

function macd(prices: number[], fast = 12, slow = 26, signal = 9): {
  line: number | null;
  signal: number | null;
  histogram: number | null;
} {
  if (prices.length < slow + signal) return { line: null, signal: null, histogram: null };

  const emaFast = ema(prices, fast);
  const emaSlow = ema(prices, slow);
  if (emaFast === null || emaSlow === null) return { line: null, signal: null, histogram: null };

  const fastArr = emaArray(prices, fast);
  const slowArr = emaArray(prices, slow);
  const macdValues: number[] = [];
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

function bollingerBands(prices: number[], period: number, stdDevMultiplier: number): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
} {
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

function atr(highs: number[], lows: number[], closes: number[], period: number): number | null {
  if (highs.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = highs.length - period; i < highs.length; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trueRanges.push(Math.max(hl, hc, lc));
  }
  return trueRanges.reduce((s, tr) => s + tr, 0) / period;
}

// ============================================================================
// Helper: Text result builder
// ============================================================================

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: 'text' as const, text }], isError };
}

function requirePhemex(): CallToolResult | null {
  if (!isPhemexConfigured()) {
    return textResult(
      'Phemex exchange is not configured. Connect via Settings > Exchange Connection first, ' +
      'or set PHEMEX_API_KEY and PHEMEX_API_SECRET environment variables.',
      true,
    );
  }
  return null;
}

// ============================================================================
// Tool Definitions — 17 tools across 5 categories
// ============================================================================

// ---------------------------------------------------------------------------
// 1. MARKET DATA
// ---------------------------------------------------------------------------

const getTickerTool = tool(
  'get_ticker',
  'Get current ticker data for a symbol including price, 24h high/low, volume, and change%.',
  {
    symbol: z.string().describe('Trading pair symbol, e.g. "BTC/USDT:USDT"'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const ticker = await client.getTicker(args.symbol);
      return textResult(JSON.stringify(ticker, null, 2));
    } catch (e) {
      return textResult(`Error fetching ticker for ${args.symbol}: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getOhlcvTool = tool(
  'get_ohlcv',
  'Get OHLCV (candlestick) data for a symbol. Returns array of {t,o,h,l,c,v} objects.',
  {
    symbol: z.string().describe('Trading pair symbol, e.g. "BTC/USDT:USDT"'),
    timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('1h')
      .describe('Candlestick timeframe'),
    limit: z.number().min(1).max(500).default(200)
      .describe('Number of candles to fetch (max 500)'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const ohlcv = await client.getOHLCV(args.symbol, args.timeframe, args.limit);
      // Compact format: {t,o,h,l,c,v} to reduce token usage
      const compact = ohlcv.map(c => ({
        t: c.timestamp,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        v: c.volume,
      }));
      return textResult(JSON.stringify({
        symbol: args.symbol,
        timeframe: args.timeframe,
        count: compact.length,
        candles: compact,
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching OHLCV for ${args.symbol}: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getOrderBookTool = tool(
  'get_order_book',
  'Get the order book for a symbol. Returns top N bids/asks with prices and sizes.',
  {
    symbol: z.string().describe('Trading pair symbol, e.g. "BTC/USDT:USDT"'),
    limit: z.number().min(1).max(100).default(10)
      .describe('Number of levels to fetch per side'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const ob = await client.getOrderBook(args.symbol, args.limit);
      return textResult(JSON.stringify(ob, null, 2));
    } catch (e) {
      return textResult(`Error fetching order book for ${args.symbol}: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getAvailableSymbolsTool = tool(
  'get_available_symbols',
  'Get all available tradeable USDT perpetual symbols on Phemex.',
  {},
  async (): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const symbols = await client.getAvailableSymbols();
      return textResult(JSON.stringify({
        count: symbols.length,
        symbols,
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching available symbols: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

// ---------------------------------------------------------------------------
// 2. ACCOUNT
// ---------------------------------------------------------------------------

const getAccountInfoTool = tool(
  'get_account_info',
  'Get account balances and total USD value.',
  {},
  async (): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const info = await client.getAccountInfo();
      return textResult(JSON.stringify(info, null, 2));
    } catch (e) {
      return textResult(`Error fetching account info: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getPositionsTool = tool(
  'get_positions',
  'Get open positions with entry price, size, unrealized PnL. Optionally filter by symbol.',
  {
    symbol: z.string().optional().describe('Filter by symbol, e.g. "BTC/USDT:USDT". Omit for all positions.'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const positions = await client.getPositions(args.symbol);
      return textResult(JSON.stringify({
        count: positions.length,
        positions,
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching positions: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getOpenOrdersTool = tool(
  'get_open_orders',
  'Get all open/pending orders. Optionally filter by symbol.',
  {
    symbol: z.string().optional().describe('Filter by symbol. Omit for all open orders.'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const orders = await client.getOpenOrders(args.symbol);
      return textResult(JSON.stringify({
        count: orders.length,
        orders,
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching open orders: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getTradeHistoryTool = tool(
  'get_trade_history',
  'Get recent trade history for a symbol.',
  {
    symbol: z.string().describe('Trading pair symbol, e.g. "BTC/USDT:USDT"'),
    limit: z.number().min(1).max(100).default(20).describe('Number of trades to fetch'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const trades = await client.getMyTrades(args.symbol, args.limit);
      return textResult(JSON.stringify({
        symbol: args.symbol,
        count: trades.length,
        trades,
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching trade history for ${args.symbol}: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

// ---------------------------------------------------------------------------
// 3. TECHNICAL ANALYSIS
// ---------------------------------------------------------------------------

const getTechnicalAnalysisTool = tool(
  'get_technical_analysis',
  'Compute full technical analysis for a symbol: SMA(7,20,50), RSI(14), MACD(12,26,9), Bollinger Bands(20,2), ATR(14), volume trend, trend direction, and strength score.',
  {
    symbol: z.string().describe('Trading pair symbol, e.g. "BTC/USDT:USDT"'),
    timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).default('1h')
      .describe('Timeframe for analysis'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const ohlcv = await client.getOHLCV(args.symbol, args.timeframe, 60);

      if (ohlcv.length < 20) {
        return textResult(`Insufficient data for ${args.symbol}: only ${ohlcv.length} candles (need >= 20).`, true);
      }

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
      let trend: 'up' | 'down' | 'sideways' = 'sideways';
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

      const result = {
        symbol: args.symbol,
        timeframe: args.timeframe,
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

      return textResult(JSON.stringify(result, null, 2));
    } catch (e) {
      return textResult(`Error computing technical analysis for ${args.symbol}: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getMarketSentimentTool = tool(
  'get_market_sentiment',
  'Get market sentiment from Fear & Greed Index and CoinGecko trending coins. Returns composite score, trending coins, and momentum.',
  {},
  async (): Promise<CallToolResult> => {
    try {
      // Fetch Fear & Greed Index
      let fearGreed: { value: number; classification: string } | null = null;
      try {
        const fgRes = await fetch('https://api.alternative.me/fng/?limit=1', {
          signal: AbortSignal.timeout(10_000),
        });
        if (fgRes.ok) {
          const fgData = await fgRes.json() as {
            data: Array<{ value: string; value_classification: string }>;
          };
          const entry = fgData.data?.[0];
          if (entry) {
            fearGreed = {
              value: parseInt(entry.value, 10),
              classification: entry.value_classification,
            };
          }
        }
      } catch {
        // Fear & Greed unavailable
      }

      // Fetch CoinGecko trending
      let trending: Array<{
        symbol: string;
        name: string;
        rank: number;
        priceChange24h: number | null;
      }> = [];
      try {
        const trendRes = await fetch('https://api.coingecko.com/api/v3/search/trending', {
          signal: AbortSignal.timeout(10_000),
        });
        if (trendRes.ok) {
          const trendData = await trendRes.json() as {
            coins: Array<{
              item: {
                name: string;
                symbol: string;
                market_cap_rank: number;
                data?: { price_change_percentage_24h?: Record<string, number> };
              };
            }>;
          };
          trending = (trendData.coins ?? []).map(c => ({
            symbol: c.item.symbol.toUpperCase(),
            name: c.item.name,
            rank: c.item.market_cap_rank ?? 999,
            priceChange24h: c.item.data?.price_change_percentage_24h?.usd ?? null,
          }));
        }
      } catch {
        // Trending unavailable
      }

      // Composite sentiment (same logic as SentinelAgent)
      const fgValue = fearGreed?.value ?? 50;
      const fgClassification = fearGreed?.classification ?? 'Neutral';
      const trendingBullish = trending.filter(t => (t.priceChange24h ?? 0) > 0).length;
      const trendingBearish = trending.filter(t => (t.priceChange24h ?? 0) < 0).length;
      const trendingMomentum = trending.length > 0
        ? trending.reduce((sum, t) => sum + (t.priceChange24h ?? 0), 0) / trending.length
        : 0;

      const momentumScore = Math.max(0, Math.min(100, 50 + trendingMomentum * 2));
      const compositeScore = Math.round(fgValue * 0.6 + momentumScore * 0.4);

      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (compositeScore >= 65) sentiment = 'bullish';
      else if (compositeScore <= 35) sentiment = 'bearish';

      return textResult(JSON.stringify({
        compositeScore,
        sentiment,
        fearGreed: {
          value: fgValue,
          classification: fgClassification,
        },
        trending: {
          coins: trending.slice(0, 7),
          bullishCount: trendingBullish,
          bearishCount: trendingBearish,
          momentum: Math.round(trendingMomentum * 100) / 100,
        },
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching market sentiment: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getAgentSignalsTool = tool(
  'get_agent_signals',
  'Get the latest signals from all running PhantomX agents (Technical, Sentinel, Macro, News).',
  {},
  async (): Promise<CallToolResult> => {
    try {
      const bus = getSignalBus();
      const summary = bus.getSummary();
      const latestPerAgent = bus.getLatestPerAgent();

      if (summary.totalSignals === 0) {
        return textResult(JSON.stringify({
          message: 'No agent signals currently available. Agents may not be running or signals have expired.',
          totalSignals: 0,
        }, null, 2));
      }

      const agentDetails: Record<string, unknown> = {};
      for (const [agentId, signal] of latestPerAgent) {
        agentDetails[agentId] = {
          agentName: signal.agentName,
          sentiment: signal.sentiment,
          confidence: signal.confidence,
          summary: signal.summary,
          timestamp: signal.timestamp,
          expiresAt: signal.expiresAt,
          data: signal.data,
        };
      }

      return textResult(JSON.stringify({
        totalSignals: summary.totalSignals,
        consensusSentiment: summary.consensusSentiment,
        consensusConfidence: summary.consensusConfidence,
        agents: agentDetails,
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching agent signals: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const classifyMarketRegimeTool = tool(
  'classify_market_regime',
  'Classify the current market regime for a symbol as trending_up, trending_down, ranging, or volatile. Uses ADX, ATR, and trend analysis.',
  {
    symbol: z.string().describe('Trading pair symbol, e.g. "BTC/USDT:USDT"'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;
      const client = getPhemexClient();
      const ohlcv = await client.getOHLCV(args.symbol, '1h', 100);

      if (ohlcv.length < 50) {
        return textResult(
          `Insufficient data for regime classification: ${ohlcv.length} candles (need >= 50).`,
          true,
        );
      }

      const classification = classifyRegime(ohlcv, 50);

      return textResult(JSON.stringify({
        symbol: args.symbol,
        regime: classification.regime,
        confidence: Math.round(classification.confidence * 100) / 100,
        adx: Math.round(classification.adx * 100) / 100,
        volatilityPercentile: Math.round(classification.volatilityPercentile * 100) / 100,
        trendStrength: Math.round(classification.trendStrength * 10000) / 10000,
        atrPercent: Math.round(classification.atrPercent * 100) / 100,
        interpretation: getRegimeInterpretation(classification.regime, classification.adx, classification.atrPercent),
      }, null, 2));
    } catch (e) {
      return textResult(`Error classifying regime for ${args.symbol}: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

function getRegimeInterpretation(regime: string, adx: number, atrPct: number): string {
  switch (regime) {
    case 'trending_up':
      return `Market is in an uptrend (ADX: ${adx.toFixed(1)}). Favor momentum/trend-following strategies. Avoid mean reversion.`;
    case 'trending_down':
      return `Market is in a downtrend (ADX: ${adx.toFixed(1)}). Favor short momentum/trend-following. Tighten risk. Avoid buying dips.`;
    case 'ranging':
      return `Market is range-bound (ADX: ${adx.toFixed(1)}). Favor mean reversion, grid, and Bollinger Band strategies. Avoid breakout entries.`;
    case 'volatile':
      return `Market is highly volatile (ATR%: ${atrPct.toFixed(2)}%). Reduce position sizes. Widen stops. Consider volatility scalping.`;
    default:
      return `Regime unclear. Insufficient data for confident classification.`;
  }
}

// ---------------------------------------------------------------------------
// 4. STRATEGY
// ---------------------------------------------------------------------------

const runBacktestTool = tool(
  'run_backtest',
  'Run a walk-forward validated backtest on a strategy configuration against OHLCV data. Returns win rate, profit factor, max drawdown, Sharpe ratio, and trade count.',
  {
    strategyConfigJson: z.string().describe('JSON string of StrategyConfig object'),
    ohlcvJson: z.string().describe('JSON string of OHLCV[] array [{timestamp,open,high,low,close,volume},...]'),
    initialCapital: z.number().default(10000).describe('Initial capital in USD'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      let strategy: StrategyConfig;
      let ohlcv: OHLCV[];

      try {
        strategy = JSON.parse(args.strategyConfigJson) as StrategyConfig;
      } catch {
        return textResult('Invalid strategyConfigJson: failed to parse JSON.', true);
      }

      try {
        ohlcv = JSON.parse(args.ohlcvJson) as OHLCV[];
      } catch {
        return textResult('Invalid ohlcvJson: failed to parse JSON.', true);
      }

      if (!Array.isArray(ohlcv) || ohlcv.length < 20) {
        return textResult(`Insufficient OHLCV data: ${Array.isArray(ohlcv) ? ohlcv.length : 0} candles (need >= 20).`, true);
      }

      const config: BacktestConfig = {
        strategy,
        ohlcv,
        initialCapital: args.initialCapital,
        fees: 0.0006,     // 0.06% Phemex taker fee
        slippage: 0.0005,  // 0.05% slippage
      };

      const wfResult = runWalkForward(config);
      const metrics = wfResult.aggregateOutOfSample;

      return textResult(JSON.stringify({
        summary: {
          totalTrades: metrics.totalTrades,
          winRate: Math.round(metrics.winRate * 10000) / 100, // as percentage
          profitFactor: Math.round(metrics.profitFactor * 100) / 100,
          sharpeRatio: Math.round(metrics.sharpeRatio * 100) / 100,
          sortinoRatio: Math.round(metrics.sortinoRatio * 100) / 100,
          totalPnl: Math.round(metrics.totalPnl * 100) / 100,
          totalPnlPercent: Math.round(metrics.totalPnlPercent * 100) / 100,
          maxDrawdownPercent: Math.round(metrics.maxDrawdownPercent * 100) / 100,
          buyAndHoldReturnPercent: Math.round(metrics.buyAndHoldReturnPercent * 100) / 100,
        },
        tradeStats: {
          winCount: metrics.winCount,
          lossCount: metrics.lossCount,
          avgWin: Math.round(metrics.avgWin * 100) / 100,
          avgLoss: Math.round(metrics.avgLoss * 100) / 100,
          bestTrade: Math.round(metrics.bestTrade * 100) / 100,
          worstTrade: Math.round(metrics.worstTrade * 100) / 100,
          consecutiveWins: metrics.consecutiveWins,
          consecutiveLosses: metrics.consecutiveLosses,
          avgHoldTimeMs: Math.round(metrics.avgHoldTime),
        },
        walkForward: {
          windowCount: wfResult.windows.length,
          overfitRatio: Math.round(wfResult.overfitRatio * 100) / 100,
          isRobust: wfResult.overfitRatio < 2.0,
        },
      }, null, 2));
    } catch (e) {
      return textResult(`Error running backtest: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  // Backtesting is a computation, not read-only in the strict sense
  { annotations: { readOnlyHint: false } },
);

const evaluateConditionsTool = tool(
  'evaluate_conditions',
  'Evaluate a set of trading conditions against current market data for a symbol. Returns boolean result and current indicator values.',
  {
    conditionsJson: z.string().describe('JSON string of conditions to evaluate (indicator thresholds, crossovers, etc.)'),
    symbol: z.string().describe('Trading pair symbol, e.g. "BTC/USDT:USDT"'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const err = requirePhemex();
      if (err) return err;

      let conditions: Record<string, unknown>;
      try {
        conditions = JSON.parse(args.conditionsJson) as Record<string, unknown>;
      } catch {
        return textResult('Invalid conditionsJson: failed to parse JSON.', true);
      }

      const client = getPhemexClient();
      const ohlcv = await client.getOHLCV(args.symbol, '1h', 60);

      if (ohlcv.length < 30) {
        return textResult(`Insufficient data for condition evaluation: ${ohlcv.length} candles.`, true);
      }

      const closes = ohlcv.map(c => c.close);
      const highs = ohlcv.map(c => c.high);
      const lows = ohlcv.map(c => c.low);
      const price = closes[closes.length - 1];

      // Compute all indicators for context
      const indicators = {
        price,
        sma7: sma(closes, 7),
        sma20: sma(closes, 20),
        sma50: sma(closes, 50),
        rsi14: rsi(closes, 14),
        macd: macd(closes),
        bollingerBands: bollingerBands(closes, 20, 2),
        atr14: atr(highs, lows, closes, 14),
      };

      // Evaluate conditions against computed indicators
      const results: Array<{ condition: string; met: boolean; currentValue: unknown }> = [];
      let allMet = true;

      const condArray = Array.isArray(conditions) ? conditions : (conditions.conditions as unknown[] ?? [conditions]);

      for (const cond of condArray) {
        const c = cond as Record<string, unknown>;
        const indicator = String(c.indicator ?? '').toLowerCase();
        const operator = String(c.operator ?? '');
        const targetValue = Number(c.value ?? 0);

        let currentValue: number | null = null;

        // Map condition indicator name to computed value
        if (indicator.includes('rsi')) currentValue = indicators.rsi14;
        else if (indicator.includes('sma7') || indicator === 'sma_7') currentValue = indicators.sma7;
        else if (indicator.includes('sma20') || indicator === 'sma_20') currentValue = indicators.sma20;
        else if (indicator.includes('sma50') || indicator === 'sma_50') currentValue = indicators.sma50;
        else if (indicator.includes('macd_hist')) currentValue = indicators.macd.histogram;
        else if (indicator.includes('macd_signal')) currentValue = indicators.macd.signal;
        else if (indicator.includes('macd')) currentValue = indicators.macd.line;
        else if (indicator.includes('bb_upper')) currentValue = indicators.bollingerBands.upper;
        else if (indicator.includes('bb_lower')) currentValue = indicators.bollingerBands.lower;
        else if (indicator.includes('bb_middle')) currentValue = indicators.bollingerBands.middle;
        else if (indicator.includes('atr')) currentValue = indicators.atr14;
        else if (indicator.includes('price') || indicator === 'close') currentValue = price;

        let met = false;
        if (currentValue !== null) {
          switch (operator) {
            case '>':
            case 'greater_than':
              met = currentValue > targetValue;
              break;
            case '<':
            case 'less_than':
              met = currentValue < targetValue;
              break;
            case '>=':
            case 'gte':
              met = currentValue >= targetValue;
              break;
            case '<=':
            case 'lte':
              met = currentValue <= targetValue;
              break;
            case '==':
            case 'equals':
              met = Math.abs(currentValue - targetValue) < 0.0001;
              break;
            case 'crosses_above':
              // Simplified: current value above target (full crossover needs previous bar)
              met = currentValue > targetValue;
              break;
            case 'crosses_below':
              met = currentValue < targetValue;
              break;
            default:
              met = false;
          }
        }

        if (!met) allMet = false;

        results.push({
          condition: `${indicator} ${operator} ${targetValue}`,
          met,
          currentValue: currentValue !== null ? Math.round(currentValue * 10000) / 10000 : null,
        });
      }

      return textResult(JSON.stringify({
        symbol: args.symbol,
        allConditionsMet: allMet,
        conditionResults: results,
        currentIndicators: {
          price: indicators.price,
          sma7: indicators.sma7 !== null ? Math.round(indicators.sma7 * 100) / 100 : null,
          sma20: indicators.sma20 !== null ? Math.round(indicators.sma20 * 100) / 100 : null,
          sma50: indicators.sma50 !== null ? Math.round(indicators.sma50 * 100) / 100 : null,
          rsi14: indicators.rsi14 !== null ? Math.round(indicators.rsi14 * 100) / 100 : null,
          macdLine: indicators.macd.line !== null ? Math.round(indicators.macd.line * 1000) / 1000 : null,
          macdHistogram: indicators.macd.histogram !== null ? Math.round(indicators.macd.histogram * 1000) / 1000 : null,
          bbUpper: indicators.bollingerBands.upper !== null ? Math.round(indicators.bollingerBands.upper * 100) / 100 : null,
          bbLower: indicators.bollingerBands.lower !== null ? Math.round(indicators.bollingerBands.lower * 100) / 100 : null,
          atr14: indicators.atr14 !== null ? Math.round(indicators.atr14 * 100) / 100 : null,
        },
      }, null, 2));
    } catch (e) {
      return textResult(`Error evaluating conditions for ${args.symbol}: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

// ---------------------------------------------------------------------------
// 5. KNOWLEDGE
// ---------------------------------------------------------------------------

const queryKnowledgeTool = tool(
  'query_knowledge',
  'Query the PhantomX trading knowledge base. Filter by domain (e.g. risk_management, technical_analysis) and/or tags.',
  {
    domain: z.string().optional().describe(
      'Knowledge domain to filter: risk_management, position_sizing, technical_analysis, ' +
      'market_microstructure, behavioral_finance, quant_foundations, crypto_native, ' +
      'regime_detection, strategy_patterns, anti_patterns, hft_strategies, performance_review'
    ),
    tags: z.string().optional().describe('Comma-separated tags to filter by, e.g. "rsi,momentum,trend_following"'),
  },
  async (args): Promise<CallToolResult> => {
    try {
      const filters: {
        domain?: KnowledgeDomain;
        tags?: string[];
      } = {};

      if (args.domain) {
        filters.domain = args.domain as KnowledgeDomain;
      }
      if (args.tags) {
        filters.tags = args.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
      }

      const entries = queryKnowledge(filters);

      if (entries.length === 0) {
        return textResult(JSON.stringify({
          message: 'No knowledge entries match the given filters.',
          filters: {
            domain: args.domain ?? 'any',
            tags: args.tags ?? 'any',
          },
        }, null, 2));
      }

      return textResult(JSON.stringify({
        count: entries.length,
        entries: entries.map(e => ({
          id: e.id,
          domain: e.domain,
          title: e.title,
          principle: e.principle,
          details: e.details,
          confidence: e.confidence,
          tags: e.tags,
          contraindications: e.contraindications,
        })),
      }, null, 2));
    } catch (e) {
      return textResult(`Error querying knowledge base: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getHardConstraintsTool = tool(
  'get_hard_constraints',
  'Get all non-negotiable trading rules that the AI must never violate. These are enforced at the execution layer.',
  {},
  async (): Promise<CallToolResult> => {
    try {
      const constraints = getHardConstraints();
      return textResult(JSON.stringify({
        count: constraints.length,
        constraints: constraints.map(c => ({
          id: c.id,
          rule: c.rule,
          enforcement: c.enforcement,
          reasoning: c.reasoning,
          severity: c.severity,
        })),
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching hard constraints: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

const getAntiPatternsTool = tool(
  'get_anti_patterns',
  'Get known behavioral and strategic anti-patterns in trading that the AI should detect and avoid.',
  {},
  async (): Promise<CallToolResult> => {
    try {
      const antiPatterns = getAntiPatterns();
      return textResult(JSON.stringify({
        count: antiPatterns.length,
        antiPatterns: antiPatterns.map(ap => ({
          id: ap.id,
          title: ap.title,
          principle: ap.principle,
          details: ap.details,
          confidence: ap.confidence,
          tags: ap.tags,
        })),
      }, null, 2));
    } catch (e) {
      return textResult(`Error fetching anti-patterns: ${e instanceof Error ? e.message : String(e)}`, true);
    }
  },
  { annotations: { readOnlyHint: true } },
);

// ============================================================================
// MCP Server Singleton
// ============================================================================

let _mcpServer: ReturnType<typeof createSdkMcpServer> | null = null;

export function getPhantomXMcpServer() {
  if (!_mcpServer) {
    _mcpServer = createSdkMcpServer({
      name: 'phantomx-trading',
      version: '1.0.0',
      tools: [
        // Market Data (4)
        getTickerTool,
        getOhlcvTool,
        getOrderBookTool,
        getAvailableSymbolsTool,
        // Account (4)
        getAccountInfoTool,
        getPositionsTool,
        getOpenOrdersTool,
        getTradeHistoryTool,
        // Technical Analysis (4)
        getTechnicalAnalysisTool,
        getMarketSentimentTool,
        getAgentSignalsTool,
        classifyMarketRegimeTool,
        // Strategy (2)
        runBacktestTool,
        evaluateConditionsTool,
        // Knowledge (3)
        queryKnowledgeTool,
        getHardConstraintsTool,
        getAntiPatternsTool,
      ],
    });
  }
  return _mcpServer;
}
