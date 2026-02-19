// ============================================================================
// PhantomX — Rule-Based HFT Execution Engine
// Runs condition evaluator directly — NO Claude in the hot path
// Sub-second signal detection → order execution
// ============================================================================

import { PhemexClient } from '@/lib/phemex/client';
import { MarketDataService } from '@/lib/market/data-service';
import { computeIndicators, evaluateConditionGroup } from '@/lib/strategy/condition-evaluator';
import { classifyRegime } from '@/lib/market/regime-classifier';
import { estimateSlippage } from '@/lib/market/slippage-model';
import type {
  StrategyConfig, HFTConfig, HFTEngineState, HFTSignal, HFTTradeRecord,
  OHLCV, PositionSide, DrawdownRecoveryState, RegimeClassification,
} from '@/types/trading';

type HFTEventCallback = (event: HFTEvent) => void;

export interface HFTEvent {
  type: 'signal' | 'trade' | 'position_closed' | 'state_change' | 'regime_change' | 'error';
  data: Record<string, unknown>;
  timestamp: number;
}

export class HFTEngine {
  private client: PhemexClient;
  private dataService: MarketDataService;
  private config: HFTConfig;
  private state: HFTEngineState = 'idle';
  private listeners: Set<HFTEventCallback> = new Set();

  // Position tracking
  private openPositions: Map<string, HFTTradeRecord> = new Map();
  private closedTrades: HFTTradeRecord[] = [];
  private tradeCount = 0;

  // Rate limiting
  private recentTradeTimestamps: number[] = [];
  private lastTradeTime = 0;

  // Regime awareness
  private currentRegime: RegimeClassification | null = null;
  private regimeCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Drawdown recovery
  private recoveryState: DrawdownRecoveryState = {
    phase: 'normal',
    currentDrawdownPercent: 0,
    peakEquity: 0,
    positionSizeMultiplier: 1.0,
    consecutiveLosses: 0,
    lastPhaseChange: Date.now(),
    recoveryHistory: [],
  };

  // Equity tracking
  private initialEquity = 0;
  private currentEquity = 0;
  private peakEquity = 0;

  // Data subscription cleanup
  private dataCleanup: (() => void) | null = null;

  constructor(client: PhemexClient, dataService: MarketDataService, config: HFTConfig) {
    this.client = client;
    this.dataService = dataService;
    this.config = config;
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    if (this.state === 'running') return;

    const strategy = this.config.strategy;

    // Initialize data buffer
    await this.dataService.initBuffer({
      symbol: strategy.symbol,
      timeframe: strategy.timeframe,
      maxBars: 500,
    });

    // Subscribe to live data
    this.dataService.subscribeLive(strategy.symbol, strategy.timeframe);
    this.dataService.subscribeTicker(strategy.symbol);
    this.dataService.subscribeOrderBook(strategy.symbol);

    // Get initial equity
    if (this.config.mode === 'live') {
      const account = await this.client.getAccountInfo();
      this.initialEquity = account.totalUsdValue;
      this.currentEquity = this.initialEquity;
      this.peakEquity = this.initialEquity;
      this.recoveryState.peakEquity = this.initialEquity;
    }

    // Listen for bar close events — this is the signal trigger
    this.dataCleanup = this.dataService.onEvent((event) => {
      if (event.type === 'bar_close' && event.symbol === strategy.symbol) {
        this.onBarClose();
      }
      // Also check on bar updates for very fast timeframes (1m)
      if (event.type === 'bar_update' && event.symbol === strategy.symbol) {
        if (strategy.timeframe === '1m') {
          this.onBarUpdate();
        }
      }
    });

    // Start regime classification loop (every 60s)
    this.regimeCheckInterval = setInterval(() => this.checkRegime(), 60_000);
    this.checkRegime(); // initial check

    this.state = 'running';
    this.emit({ type: 'state_change', data: { state: 'running' }, timestamp: Date.now() });
  }

  pause(): void {
    this.state = 'paused';
    this.emit({ type: 'state_change', data: { state: 'paused' }, timestamp: Date.now() });
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'running';
      this.emit({ type: 'state_change', data: { state: 'running' }, timestamp: Date.now() });
    }
  }

  async stop(): Promise<void> {
    this.state = 'stopped';

    // Clean up subscriptions
    this.dataCleanup?.();
    if (this.regimeCheckInterval) clearInterval(this.regimeCheckInterval);

    // Close all open positions
    if (this.config.mode === 'live') {
      for (const [posId, trade] of this.openPositions) {
        await this.closePosition(posId, 'kill_switch');
      }
    }

    this.emit({ type: 'state_change', data: { state: 'stopped' }, timestamp: Date.now() });
  }

  // --- Core Signal Loop (HOT PATH — no async AI calls) ---

  private onBarClose(): void {
    if (this.state !== 'running') return;

    const strategy = this.config.strategy;
    const bars = this.dataService.getBars(strategy.symbol, strategy.timeframe);
    if (bars.length < 50) return; // Need enough data for indicators

    const startTime = performance.now();

    // 1. Compute indicators (pure math, no I/O)
    const values = computeIndicators(bars, strategy.indicators);

    const barIndex = bars.length - 1;

    // 2. Check exit conditions for open positions FIRST
    for (const [posId, trade] of this.openPositions) {
      const currentPrice = bars[barIndex].close;

      // Check stop loss
      if (strategy.risk.stopLossPercent > 0) {
        const slDistance = trade.entryPrice * (strategy.risk.stopLossPercent / 100);
        const slPrice = trade.side === 'long'
          ? trade.entryPrice - slDistance
          : trade.entryPrice + slDistance;

        if ((trade.side === 'long' && currentPrice <= slPrice) ||
            (trade.side === 'short' && currentPrice >= slPrice)) {
          this.closePosition(posId, 'stop_loss');
          continue;
        }
      }

      // Check take profit
      if (strategy.risk.takeProfitPercent > 0) {
        const tpDistance = trade.entryPrice * (strategy.risk.takeProfitPercent / 100);
        const tpPrice = trade.side === 'long'
          ? trade.entryPrice + tpDistance
          : trade.entryPrice - tpDistance;

        if ((trade.side === 'long' && currentPrice >= tpPrice) ||
            (trade.side === 'short' && currentPrice <= tpPrice)) {
          this.closePosition(posId, 'take_profit');
          continue;
        }
      }

      // Check exit conditions (rule-based)
      if (strategy.exitConditions.conditions.length > 0) {
        const exitTriggered = evaluateConditionGroup(strategy.exitConditions, values, barIndex);
        if (exitTriggered) {
          this.closePosition(posId, 'signal');
          continue;
        }
      }
    }

    // 3. Check entry conditions
    if (!this.canTrade()) return;

    const entryTriggered = evaluateConditionGroup(strategy.entryConditions, values, barIndex);
    if (!entryTriggered) return;

    // 4. Determine side (use RSI or price vs MA to infer direction)
    const side = this.inferSide(values, barIndex);

    // 5. Generate signal
    const signal: HFTSignal = {
      type: 'entry',
      side,
      price: bars[barIndex].close,
      timestamp: Date.now(),
      conditionsMet: this.describeConditions(strategy.entryConditions, values, barIndex),
      strength: this.calculateSignalStrength(values, barIndex),
    };

    const latencyMs = performance.now() - startTime;

    this.emit({ type: 'signal', data: { signal, latencyMs }, timestamp: Date.now() });

    // 6. Execute trade
    this.executeTrade(signal, latencyMs);
  }

  private onBarUpdate(): void {
    // For 1-minute timeframes, also check SL/TP on partial bars
    if (this.state !== 'running') return;

    const strategy = this.config.strategy;
    const latestBar = this.dataService.getLatestBar(strategy.symbol, strategy.timeframe);
    if (!latestBar) return;

    for (const [posId, trade] of this.openPositions) {
      const currentPrice = latestBar.close;

      // Quick SL/TP check on partial bar
      if (strategy.risk.stopLossPercent > 0) {
        const slDistance = trade.entryPrice * (strategy.risk.stopLossPercent / 100);
        const slPrice = trade.side === 'long'
          ? trade.entryPrice - slDistance
          : trade.entryPrice + slDistance;

        if ((trade.side === 'long' && currentPrice <= slPrice) ||
            (trade.side === 'short' && currentPrice >= slPrice)) {
          this.closePosition(posId, 'stop_loss');
        }
      }

      if (strategy.risk.takeProfitPercent > 0) {
        const tpDistance = trade.entryPrice * (strategy.risk.takeProfitPercent / 100);
        const tpPrice = trade.side === 'long'
          ? trade.entryPrice + tpDistance
          : trade.entryPrice - tpDistance;

        if ((trade.side === 'long' && currentPrice >= tpPrice) ||
            (trade.side === 'short' && currentPrice <= tpPrice)) {
          this.closePosition(posId, 'take_profit');
        }
      }
    }
  }

  // --- Trade Execution ---

  private async executeTrade(signal: HFTSignal, latencyMs: number): Promise<void> {
    const strategy = this.config.strategy;
    const positionSize = this.calculatePositionSize(signal.price);
    if (positionSize <= 0) return;

    // Dynamic slippage estimation
    const slippageEst = estimateSlippage({
      orderSizeUsd: positionSize * signal.price,
      orderBook: this.dataService.getOrderBook(strategy.symbol),
      recentBars: this.dataService.getBars(strategy.symbol, strategy.timeframe, 20),
    });

    const trade: HFTTradeRecord = {
      id: crypto.randomUUID(),
      strategyId: strategy.id,
      symbol: strategy.symbol,
      side: signal.side,
      entryPrice: signal.price * (1 + (signal.side === 'long' ? 1 : -1) * slippageEst.totalSlippage / 100),
      size: positionSize,
      leverage: strategy.risk.maxPositionSizePercent, // leverage approximation
      fees: 0,
      slippage: slippageEst.totalSlippage,
      entrySignal: signal,
      entryTime: Date.now(),
      latencyMs,
    };

    // Execute on exchange (or paper)
    if (this.config.mode === 'live') {
      try {
        const order = await this.client.createOrder(
          strategy.symbol,
          'market',
          signal.side === 'long' ? 'buy' : 'sell',
          positionSize,
        );
        trade.entryPrice = order.price ?? signal.price;
        trade.fees = order.fee?.cost ?? 0;
      } catch (err) {
        this.emit({ type: 'error', data: { error: String(err), signal }, timestamp: Date.now() });
        return;
      }
    } else {
      // Paper mode — simulated fill
      trade.fees = trade.entryPrice * positionSize * 0.0006; // 0.06% taker fee
    }

    this.openPositions.set(trade.id, trade);
    this.tradeCount++;
    this.lastTradeTime = Date.now();
    this.recentTradeTimestamps.push(Date.now());

    this.emit({ type: 'trade', data: { trade, action: 'open' }, timestamp: Date.now() });
  }

  private async closePosition(
    positionId: string,
    reason: HFTTradeRecord['exitReason'],
  ): Promise<void> {
    const trade = this.openPositions.get(positionId);
    if (!trade) return;

    const currentPrice = this.dataService.getLatestPrice(trade.symbol);
    if (currentPrice <= 0) return;

    // Calculate P&L
    const direction = trade.side === 'long' ? 1 : -1;
    const pnl = (currentPrice - trade.entryPrice) * direction * trade.size;
    const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * direction * 100;

    trade.exitPrice = currentPrice;
    trade.exitTime = Date.now();
    trade.exitReason = reason;
    trade.pnl = pnl - trade.fees;
    trade.pnlPercent = pnlPercent;

    // Execute on exchange
    if (this.config.mode === 'live') {
      try {
        await this.client.createOrder(
          trade.symbol,
          'market',
          trade.side === 'long' ? 'sell' : 'buy',
          trade.size,
        );
      } catch (err) {
        this.emit({ type: 'error', data: { error: String(err) }, timestamp: Date.now() });
      }
    }

    this.openPositions.delete(positionId);
    this.closedTrades.push(trade);

    // Update equity tracking
    this.currentEquity += (trade.pnl ?? 0);
    this.peakEquity = Math.max(this.peakEquity, this.currentEquity);

    // Update drawdown recovery state
    this.updateRecoveryState(trade);

    this.emit({ type: 'position_closed', data: { trade, reason }, timestamp: Date.now() });
  }

  // --- Position Sizing ---

  private calculatePositionSize(price: number): number {
    if (price <= 0) return 0;

    let sizeUsd: number;

    switch (this.config.positionSizeMode) {
      case 'fixed_usd':
        sizeUsd = this.config.fixedSizeUsd ?? 100;
        break;
      case 'percent_equity':
        sizeUsd = this.currentEquity * ((this.config.percentEquity ?? 5) / 100);
        break;
      case 'kelly': {
        // Fractional Kelly based on recent win rate and avg win/loss
        const recentTrades = this.closedTrades.slice(-50);
        if (recentTrades.length < 10) {
          sizeUsd = this.currentEquity * 0.02; // 2% default when insufficient data
        } else {
          const wins = recentTrades.filter(t => (t.pnl ?? 0) > 0);
          const winRate = wins.length / recentTrades.length;
          const avgWin = wins.length > 0
            ? wins.reduce((s, t) => s + (t.pnlPercent ?? 0), 0) / wins.length
            : 1;
          const losses = recentTrades.filter(t => (t.pnl ?? 0) <= 0);
          const avgLoss = losses.length > 0
            ? Math.abs(losses.reduce((s, t) => s + (t.pnlPercent ?? 0), 0) / losses.length)
            : 1;
          const kellyPercent = avgLoss > 0
            ? (winRate * avgWin - (1 - winRate) * avgLoss) / avgLoss
            : 0;
          const fraction = this.config.kellyFraction ?? 0.25;
          sizeUsd = this.currentEquity * Math.max(0, Math.min(kellyPercent * fraction / 100, 0.1));
        }
        break;
      }
      default:
        sizeUsd = 100;
    }

    // Apply drawdown recovery multiplier
    sizeUsd *= this.recoveryState.positionSizeMultiplier;

    return sizeUsd / price;
  }

  // --- Rate Limiting ---

  private canTrade(): boolean {
    if (this.state !== 'running') return false;

    // Recovery state check
    if (this.recoveryState.phase === 'halted') return false;
    if (this.recoveryState.cooldownUntil && Date.now() < this.recoveryState.cooldownUntil) return false;

    // Max concurrent positions
    if (this.openPositions.size >= this.config.maxConcurrentPositions) return false;

    // Min time between trades
    if (Date.now() - this.lastTradeTime < this.config.minTimeBetweenTradesMs) return false;

    // Max trades per minute
    const oneMinAgo = Date.now() - 60_000;
    this.recentTradeTimestamps = this.recentTradeTimestamps.filter(t => t > oneMinAgo);
    if (this.recentTradeTimestamps.length >= this.config.maxTradesPerMinute) return false;

    // Regime compatibility
    if (this.currentRegime && this.currentRegime.regime === 'unknown') return false;

    return true;
  }

  // --- Regime Detection ---

  private checkRegime(): void {
    const bars = this.dataService.getBars(
      this.config.strategy.symbol,
      this.config.strategy.timeframe,
    );
    if (bars.length < 50) return;

    const prev = this.currentRegime;
    this.currentRegime = classifyRegime(bars);

    if (prev && prev.regime !== this.currentRegime.regime) {
      this.emit({
        type: 'regime_change',
        data: {
          from: prev.regime,
          to: this.currentRegime.regime,
          confidence: this.currentRegime.confidence,
        },
        timestamp: Date.now(),
      });
    }
  }

  // --- Drawdown Recovery ---

  private updateRecoveryState(trade: HFTTradeRecord): void {
    const pnl = trade.pnl ?? 0;
    const rs = this.recoveryState;

    if (pnl < 0) {
      rs.consecutiveLosses++;
    } else {
      rs.consecutiveLosses = 0;
    }

    // Update drawdown
    rs.peakEquity = Math.max(rs.peakEquity, this.currentEquity);
    rs.currentDrawdownPercent = rs.peakEquity > 0
      ? ((rs.peakEquity - this.currentEquity) / rs.peakEquity) * 100
      : 0;

    // Determine phase
    const prevPhase = rs.phase;
    const dd = rs.currentDrawdownPercent;

    if (dd >= 20 || rs.consecutiveLosses >= 7) {
      rs.phase = 'halted';
      rs.positionSizeMultiplier = 0;
      rs.cooldownUntil = Date.now() + 300_000; // 5 min cooldown
    } else if (dd >= 15 || rs.consecutiveLosses >= 5) {
      rs.phase = 'minimal';
      rs.positionSizeMultiplier = 0.25;
    } else if (dd >= 10 || rs.consecutiveLosses >= 4) {
      rs.phase = 'reduced';
      rs.positionSizeMultiplier = 0.5;
    } else if (dd >= 5 || rs.consecutiveLosses >= 3) {
      rs.phase = 'caution';
      rs.positionSizeMultiplier = 0.75;
    } else {
      rs.phase = 'normal';
      rs.positionSizeMultiplier = 1.0;
    }

    if (prevPhase !== rs.phase) {
      rs.lastPhaseChange = Date.now();
      rs.recoveryHistory.push({
        timestamp: Date.now(),
        fromPhase: prevPhase,
        toPhase: rs.phase,
        drawdownPercent: dd,
        reason: rs.consecutiveLosses >= 3
          ? `${rs.consecutiveLosses} consecutive losses`
          : `Drawdown at ${dd.toFixed(1)}%`,
      });
    }
  }

  // --- Signal Helpers ---

  private inferSide(
    values: Record<string, number[]>,
    barIndex: number,
  ): PositionSide {
    // Use RSI and MA relationship to infer direction
    const rsi14 = values['RSI_14'];
    const close = values['CLOSE'];
    const sma20 = values['SMA_20'];

    if (rsi14 && rsi14[barIndex] !== undefined) {
      if (rsi14[barIndex] < 40) return 'long';  // oversold → buy
      if (rsi14[barIndex] > 60) return 'short'; // overbought → sell
    }

    if (close && sma20 && close[barIndex] > sma20[barIndex]) return 'long';
    if (close && sma20 && close[barIndex] < sma20[barIndex]) return 'short';

    return 'long'; // default
  }

  private calculateSignalStrength(
    values: Record<string, number[]>,
    barIndex: number,
  ): number {
    // Simple strength based on how many indicators agree
    let agreements = 0;
    let total = 0;

    const close = values['CLOSE']?.[barIndex];
    const sma20 = values['SMA_20']?.[barIndex];
    const ema20 = values['EMA_20']?.[barIndex];
    const rsi = values['RSI_14']?.[barIndex];

    if (close && sma20) {
      total++;
      if (close > sma20) agreements++;
    }
    if (close && ema20) {
      total++;
      if (close > ema20) agreements++;
    }
    if (rsi !== undefined) {
      total++;
      if (rsi < 30 || rsi > 70) agreements++; // extreme = strong signal
    }

    return total > 0 ? agreements / total : 0.5;
  }

  private describeConditions(
    group: StrategyConfig['entryConditions'],
    values: Record<string, number[]>,
    barIndex: number,
  ): string[] {
    const descriptions: string[] = [];
    for (const cond of group.conditions) {
      if ('indicator' in cond) {
        const val = values[cond.indicator]?.[barIndex];
        const targetVal = typeof cond.target === 'number'
          ? cond.target
          : values[cond.target as string]?.[barIndex];
        descriptions.push(`${cond.indicator}(${val?.toFixed(2)}) ${cond.operator} ${targetVal?.toFixed(2)}`);
      }
    }
    return descriptions;
  }

  // --- Events ---

  onEvent(callback: HFTEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: HFTEvent): void {
    this.listeners.forEach(cb => {
      try { cb(event); } catch { /* listener error */ }
    });
  }

  // --- Getters ---

  getState(): HFTEngineState { return this.state; }
  getOpenPositions(): HFTTradeRecord[] { return Array.from(this.openPositions.values()); }
  getClosedTrades(): HFTTradeRecord[] { return [...this.closedTrades]; }
  getTradeCount(): number { return this.tradeCount; }
  getRecoveryState(): DrawdownRecoveryState { return { ...this.recoveryState }; }
  getRegime(): RegimeClassification | null { return this.currentRegime; }
  getEquity(): number { return this.currentEquity; }
  getPnl(): number { return this.currentEquity - this.initialEquity; }
  getPnlPercent(): number {
    return this.initialEquity > 0
      ? ((this.currentEquity - this.initialEquity) / this.initialEquity) * 100
      : 0;
  }
}
