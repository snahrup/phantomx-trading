// ============================================================================
// PhantomX — Strategy Backtest Engine
// Walk-forward validated backtesting for strategy optimization.
// ============================================================================

import type {
  OHLCV,
  BacktestConfig,
  BacktestTrade,
  BacktestResult,
  BacktestMetrics,
  WalkForwardWindow,
  WalkForwardResult,
} from '@/types/trading';
import { computeIndicators, evaluateConditionGroup, type IndicatorValues } from './condition-evaluator';

// ============================================================================
// Core Backtest Engine
// ============================================================================

interface OpenPosition {
  side: 'long' | 'short';
  entryPrice: number;
  entryTime: number;
  entryIndex: number;
  size: number;        // in units (e.g., BTC)
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * Run a backtest simulation over OHLCV data using a strategy config.
 */
export function runBacktest(config: BacktestConfig): BacktestResult {
  const startTime = Date.now();
  const { strategy, ohlcv, initialCapital, fees, slippage } = config;

  if (ohlcv.length < 2) {
    return emptyResult(config, startTime);
  }

  // Pre-compute indicators
  const indicators = computeIndicators(ohlcv, strategy.indicators);

  let equity = initialCapital;
  let peakEquity = initialCapital;
  let position: OpenPosition | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: { time: number; equity: number }[] = [
    { time: ohlcv[0].timestamp, equity: initialCapital },
  ];

  const risk = strategy.risk;

  // Minimum warmup: skip the first N bars where indicators have NaN
  const warmupBars = getWarmupBars(indicators);

  for (let i = warmupBars; i < ohlcv.length; i++) {
    const candle = ohlcv[i];

    if (position) {
      // --- Check stop loss / take profit within candle range ---
      const exitResult = checkExits(position, candle, indicators, i, strategy.exitConditions);

      if (exitResult) {
        const trade = closePosition(position, exitResult.price, candle.timestamp, exitResult.reason, fees);
        trades.push(trade);
        equity += trade.pnl;
        if (equity > peakEquity) peakEquity = equity;
        position = null;
      }
    }

    if (!position) {
      // --- Check entry conditions ---
      const hasEntryConditions = strategy.entryConditions?.conditions?.length > 0;
      if (hasEntryConditions && evaluateConditionGroup(strategy.entryConditions, indicators, i)) {
        // Determine side from conditions (default: long if first indicator crosses_above)
        const side = inferSide(strategy.entryConditions);
        const entryPrice = candle.close * (1 + (side === 'long' ? slippage : -slippage));

        // Position sizing
        const positionUsd = equity * (risk.maxPositionSizePercent / 100);
        const size = positionUsd / entryPrice;

        if (size > 0 && equity > 0) {
          position = {
            side,
            entryPrice,
            entryTime: candle.timestamp,
            entryIndex: i,
            size,
            stopLoss: side === 'long'
              ? entryPrice * (1 - risk.stopLossPercent / 100)
              : entryPrice * (1 + risk.stopLossPercent / 100),
            takeProfit: side === 'long'
              ? entryPrice * (1 + risk.takeProfitPercent / 100)
              : entryPrice * (1 - risk.takeProfitPercent / 100),
          };

          // Entry fee
          equity -= positionUsd * fees;
        }
      }
    }

    // Update equity curve (unrealized P&L for open positions)
    const unrealized = position ? getUnrealizedPnl(position, candle.close) : 0;
    equityCurve.push({
      time: candle.timestamp,
      equity: equity + unrealized,
    });

    // Kill switch: max drawdown check
    const currentEquity = equity + unrealized;
    const drawdownPercent = ((peakEquity - currentEquity) / peakEquity) * 100;
    if (drawdownPercent >= risk.maxDrawdownPercent) {
      // Force close
      if (position) {
        const trade = closePosition(position, candle.close, candle.timestamp, 'stop_loss', fees);
        trades.push(trade);
        equity += trade.pnl;
        position = null;
      }
      break; // Kill switch triggered
    }
  }

  // Close any remaining position at last candle
  if (position && ohlcv.length > 0) {
    const lastCandle = ohlcv[ohlcv.length - 1];
    const trade = closePosition(position, lastCandle.close, lastCandle.timestamp, 'end_of_data', fees);
    trades.push(trade);
    equity += trade.pnl;
  }

  const metrics = computeMetrics(trades, equityCurve, initialCapital, ohlcv);

  return {
    id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    strategyId: strategy.id,
    config,
    trades,
    equityCurve,
    metrics,
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Walk-Forward Validation
// ============================================================================

/**
 * Generate rolling walk-forward windows.
 * @param totalBars Total number of OHLCV bars
 * @param numWindows Number of walk-forward windows (default 5)
 * @param inSampleRatio Ratio of in-sample to total window (default 0.7)
 */
export function generateWalkForwardWindows(
  totalBars: number,
  numWindows = 5,
  inSampleRatio = 0.7,
): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];
  const windowSize = Math.floor(totalBars / numWindows);
  if (windowSize < 20) return windows; // Not enough data

  const inSampleSize = Math.floor(windowSize * inSampleRatio);
  const outOfSampleSize = windowSize - inSampleSize;

  for (let w = 0; w < numWindows; w++) {
    const start = w * outOfSampleSize; // Overlap in-sample windows
    const inSampleEnd = start + inSampleSize;
    const outOfSampleEnd = Math.min(inSampleEnd + outOfSampleSize, totalBars);

    if (outOfSampleEnd <= inSampleEnd) break;

    windows.push({
      inSampleStart: start,
      inSampleEnd,
      outOfSampleStart: inSampleEnd,
      outOfSampleEnd,
    });
  }

  return windows;
}

/**
 * Run walk-forward validation: test strategy on out-of-sample windows.
 */
export function runWalkForward(config: BacktestConfig, windows?: WalkForwardWindow[]): WalkForwardResult {
  const effectiveWindows = windows || generateWalkForwardWindows(config.ohlcv.length);

  const windowResults: WalkForwardResult['windows'] = [];
  const allOutOfSampleTrades: BacktestTrade[] = [];
  const allOutOfSampleEquity: { time: number; equity: number }[] = [];

  for (const window of effectiveWindows) {
    const inSampleOhlcv = config.ohlcv.slice(window.inSampleStart, window.inSampleEnd);
    const outOfSampleOhlcv = config.ohlcv.slice(window.outOfSampleStart, window.outOfSampleEnd);

    // Run backtest on in-sample data
    const inSampleResult = runBacktest({
      ...config,
      ohlcv: inSampleOhlcv,
    });

    // Run backtest on out-of-sample data with same strategy
    const outOfSampleResult = runBacktest({
      ...config,
      ohlcv: outOfSampleOhlcv,
    });

    windowResults.push({
      window,
      inSampleMetrics: inSampleResult.metrics,
      outOfSampleMetrics: outOfSampleResult.metrics,
      trades: outOfSampleResult.trades,
    });

    allOutOfSampleTrades.push(...outOfSampleResult.trades);
    allOutOfSampleEquity.push(...outOfSampleResult.equityCurve);
  }

  // Aggregate out-of-sample metrics
  const aggregateOutOfSample = computeMetrics(
    allOutOfSampleTrades,
    allOutOfSampleEquity,
    config.initialCapital,
    config.ohlcv,
  );

  // Overfit ratio: average in-sample Sharpe / aggregate out-of-sample Sharpe
  const avgInSampleSharpe =
    windowResults.reduce((sum, w) => sum + w.inSampleMetrics.sharpeRatio, 0) / Math.max(windowResults.length, 1);
  const overfitRatio = aggregateOutOfSample.sharpeRatio > 0
    ? avgInSampleSharpe / aggregateOutOfSample.sharpeRatio
    : Infinity;

  const totalResult: BacktestResult = {
    id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    strategyId: config.strategy.id,
    config,
    trades: allOutOfSampleTrades,
    equityCurve: allOutOfSampleEquity,
    metrics: aggregateOutOfSample,
    duration: 0,
    timestamp: Date.now(),
  };

  return {
    windows: windowResults,
    aggregateOutOfSample,
    overfitRatio,
    totalResult,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function emptyResult(config: BacktestConfig, startTime: number): BacktestResult {
  return {
    id: `bt-${Date.now()}`,
    strategyId: config.strategy.id,
    config,
    trades: [],
    equityCurve: [{ time: Date.now(), equity: config.initialCapital }],
    metrics: emptyMetrics(),
    duration: Date.now() - startTime,
    timestamp: Date.now(),
  };
}

function emptyMetrics(): BacktestMetrics {
  return {
    totalPnl: 0, totalPnlPercent: 0, winRate: 0, profitFactor: 0,
    maxDrawdown: 0, maxDrawdownPercent: 0, sharpeRatio: 0, sortinoRatio: 0,
    totalTrades: 0, winCount: 0, lossCount: 0, avgWin: 0, avgLoss: 0,
    avgHoldTime: 0, bestTrade: 0, worstTrade: 0,
    consecutiveWins: 0, consecutiveLosses: 0,
    buyAndHoldReturn: 0, buyAndHoldReturnPercent: 0,
  };
}

function getWarmupBars(indicators: IndicatorValues): number {
  let maxWarmup = 1;
  for (const values of Object.values(indicators)) {
    for (let i = 0; i < values.length; i++) {
      if (!isNaN(values[i])) {
        maxWarmup = Math.max(maxWarmup, i);
        break;
      }
    }
  }
  return maxWarmup;
}

function getUnrealizedPnl(pos: OpenPosition, currentPrice: number): number {
  const diff = pos.side === 'long'
    ? currentPrice - pos.entryPrice
    : pos.entryPrice - currentPrice;
  return diff * pos.size;
}

function checkExits(
  pos: OpenPosition,
  candle: OHLCV,
  indicators: IndicatorValues,
  barIndex: number,
  exitConditions?: { logic: 'AND' | 'OR'; conditions: unknown[] },
): { price: number; reason: BacktestTrade['exitReason'] } | null {
  // Check stop loss
  if (pos.stopLoss) {
    if (pos.side === 'long' && candle.low <= pos.stopLoss) {
      return { price: pos.stopLoss, reason: 'stop_loss' };
    }
    if (pos.side === 'short' && candle.high >= pos.stopLoss) {
      return { price: pos.stopLoss, reason: 'stop_loss' };
    }
  }

  // Check take profit
  if (pos.takeProfit) {
    if (pos.side === 'long' && candle.high >= pos.takeProfit) {
      return { price: pos.takeProfit, reason: 'take_profit' };
    }
    if (pos.side === 'short' && candle.low <= pos.takeProfit) {
      return { price: pos.takeProfit, reason: 'take_profit' };
    }
  }

  // Check signal-based exit conditions
  if (exitConditions?.conditions?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (evaluateConditionGroup(exitConditions as any, indicators, barIndex)) {
      return { price: candle.close, reason: 'signal' };
    }
  }

  return null;
}

function closePosition(
  pos: OpenPosition,
  exitPrice: number,
  exitTime: number,
  reason: BacktestTrade['exitReason'],
  fees: number,
): BacktestTrade {
  const diff = pos.side === 'long'
    ? exitPrice - pos.entryPrice
    : pos.entryPrice - exitPrice;
  const grossPnl = diff * pos.size;
  const exitFee = pos.size * exitPrice * fees;
  const pnl = grossPnl - exitFee;
  const pnlPercent = (diff / pos.entryPrice) * 100;

  return {
    id: `trade-${pos.entryTime}-${exitTime}`,
    entryTime: pos.entryTime,
    exitTime,
    side: pos.side,
    entryPrice: pos.entryPrice,
    exitPrice,
    size: pos.size,
    pnl,
    pnlPercent,
    exitReason: reason,
    fees: exitFee + (pos.size * pos.entryPrice * fees),
  };
}

/**
 * Infer trade side from entry conditions.
 * If the first condition uses crosses_above → long, crosses_below → short.
 * Default: long.
 */
function inferSide(group: { logic: string; conditions: unknown[] }): 'long' | 'short' {
  if (!group.conditions || group.conditions.length === 0) return 'long';

  const first = group.conditions[0];
  if (first && typeof first === 'object' && 'operator' in first) {
    const op = (first as { operator: string }).operator;
    if (op === 'crosses_below') return 'short';
  }
  return 'long';
}

/**
 * Compute comprehensive backtest metrics from trade list and equity curve.
 */
function computeMetrics(
  trades: BacktestTrade[],
  equityCurve: { time: number; equity: number }[],
  initialCapital: number,
  ohlcv: OHLCV[],
): BacktestMetrics {
  if (trades.length === 0) return emptyMetrics();

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalGrossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalGrossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));

  // Drawdown
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let peak = initialCapital;
  for (const point of equityCurve) {
    if (point.equity > peak) peak = point.equity;
    const dd = peak - point.equity;
    const ddPercent = (dd / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPercent > maxDrawdownPercent) maxDrawdownPercent = ddPercent;
  }

  // Sharpe & Sortino (annualized, assuming daily returns)
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) {
      returns.push((equityCurve[i].equity - prev) / prev);
    }
  }

  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdDev = returns.length > 1
    ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length - 1))
    : 0;
  const downsideReturns = returns.filter(r => r < 0);
  const downsideDev = downsideReturns.length > 1
    ? Math.sqrt(downsideReturns.reduce((s, r) => s + r ** 2, 0) / (downsideReturns.length - 1))
    : 0;

  const annualizationFactor = Math.sqrt(365); // Crypto trades 365 days
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annualizationFactor : 0;
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annualizationFactor : 0;

  // Consecutive wins/losses
  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let currentConsecWins = 0;
  let currentConsecLosses = 0;
  for (const t of trades) {
    if (t.pnl > 0) {
      currentConsecWins++;
      currentConsecLosses = 0;
      maxConsecWins = Math.max(maxConsecWins, currentConsecWins);
    } else {
      currentConsecLosses++;
      currentConsecWins = 0;
      maxConsecLosses = Math.max(maxConsecLosses, currentConsecLosses);
    }
  }

  // Buy and hold comparison
  let buyAndHoldReturn = 0;
  let buyAndHoldReturnPercent = 0;
  if (ohlcv.length >= 2) {
    const firstPrice = ohlcv[0].close;
    const lastPrice = ohlcv[ohlcv.length - 1].close;
    const bnh = (initialCapital / firstPrice) * lastPrice;
    buyAndHoldReturn = bnh - initialCapital;
    buyAndHoldReturnPercent = ((lastPrice - firstPrice) / firstPrice) * 100;
  }

  return {
    totalPnl,
    totalPnlPercent: (totalPnl / initialCapital) * 100,
    winRate: trades.length > 0 ? wins.length / trades.length : 0,
    profitFactor: totalGrossLoss > 0 ? totalGrossProfit / totalGrossLoss : totalGrossProfit > 0 ? Infinity : 0,
    maxDrawdown,
    maxDrawdownPercent,
    sharpeRatio,
    sortinoRatio,
    totalTrades: trades.length,
    winCount: wins.length,
    lossCount: losses.length,
    avgWin: wins.length > 0 ? totalGrossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? totalGrossLoss / losses.length : 0,
    avgHoldTime: trades.length > 0 ? trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0) / trades.length : 0,
    bestTrade: trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0,
    worstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0,
    consecutiveWins: maxConsecWins,
    consecutiveLosses: maxConsecLosses,
    buyAndHoldReturn,
    buyAndHoldReturnPercent,
  };
}
