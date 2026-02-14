// ============================================================================
// PhantomX — Strategy Execution Engine with Kill Switch
// ============================================================================

import { PhemexClient } from '@/lib/phemex/client';
import type {
  StrategyConfig, RiskParameters, Order,
  TradingViewWebhook, ChartAnnotation, DashboardStats
} from '@/types/trading';

export type KillReason = 'max_drawdown' | 'daily_loss_limit' | 'hard_floor' | 'hard_ceiling' | 'manual_panic' | 'error';

export interface ExecutionState {
  isRunning: boolean;
  isPaused: boolean;
  isKilled: boolean;
  killReason?: KillReason;
  strategyId: string;
  symbol: string;
  startedAt: number;
  peakEquity: number;
  dailyStartEquity: number;
  totalPnl: number;
  dailyPnl: number;
  currentDrawdown: number;
  tradesExecuted: number;
  trades: TradeRecord[];
  annotations: ChartAnnotation[];
}

export interface TradeRecord {
  id: string;
  timestamp: number;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  cost: number;
  pnl?: number;
  pnlPercent?: number;
  reason: string;
  orderId?: string;
}

type ExecutionEventCallback = (event: ExecutionEvent) => void;

export interface ExecutionEvent {
  type: 'trade_executed' | 'kill_switch' | 'status_update' | 'error' | 'annotation';
  data: Record<string, unknown>;
  timestamp: number;
}

export class StrategyExecutionEngine {
  private client: PhemexClient;
  private state: ExecutionState;
  private risk: RiskParameters;
  private listeners: Set<ExecutionEventCallback> = new Set();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private healthCheckInProgress = false;  // Prevent concurrent health checks / race conditions

  constructor(client: PhemexClient, strategy: StrategyConfig) {
    this.client = client;
    this.risk = strategy.risk;
    this.state = {
      isRunning: false,
      isPaused: false,
      isKilled: false,
      strategyId: strategy.id,
      symbol: strategy.symbol,
      startedAt: Date.now(),
      peakEquity: 0,
      dailyStartEquity: 0,
      totalPnl: 0,
      dailyPnl: 0,
      currentDrawdown: 0,
      tradesExecuted: 0,
      trades: [],
      annotations: [],
    };
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    const account = await this.client.getAccountInfo();
    const equity = account.totalUsdValue;

    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.isKilled = false;
    this.state.peakEquity = equity;
    this.state.dailyStartEquity = equity;
    this.state.startedAt = Date.now();

    // Start health check loop — monitors kill switch conditions
    this.healthCheckInterval = setInterval(() => this.healthCheck(), 5000);

    this.addAnnotation('signal', Date.now(), 0, 'Strategy STARTED', '#00d26a');
    this.emit({ type: 'status_update', data: { status: 'started', equity }, timestamp: Date.now() });
  }

  pause(): void {
    this.state.isPaused = true;
    this.addAnnotation('ai_note', Date.now(), 0, 'Strategy PAUSED', '#ffc107');
    this.emit({ type: 'status_update', data: { status: 'paused' }, timestamp: Date.now() });
  }

  resume(): void {
    this.state.isPaused = false;
    this.addAnnotation('ai_note', Date.now(), 0, 'Strategy RESUMED', '#00d26a');
    this.emit({ type: 'status_update', data: { status: 'resumed' }, timestamp: Date.now() });
  }

  async stop(): Promise<void> {
    this.state.isRunning = false;
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    // Close all open positions for this strategy's symbol
    try {
      const positions = await this.client.getPositions(this.state.symbol);
      for (const pos of positions) {
        await this.client.createOrder(
          this.state.symbol,
          'market',
          pos.side === 'long' ? 'sell' : 'buy',
          pos.size
        );
      }
    } catch (err) {
      this.emit({ type: 'error', data: { error: String(err) }, timestamp: Date.now() });
    }

    this.addAnnotation('signal', Date.now(), 0, 'Strategy STOPPED', '#dc3545');
    this.emit({ type: 'status_update', data: { status: 'stopped' }, timestamp: Date.now() });
  }

  // --- PANIC BUTTON ---

  async panic(): Promise<void> {
    this.state.isKilled = true;
    this.state.isRunning = false;
    this.state.killReason = 'manual_panic';

    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    // Cancel ALL open orders
    try {
      await this.client.cancelAllOrders(this.state.symbol);
    } catch { /* best effort */ }

    // Close ALL positions
    try {
      const positions = await this.client.getPositions(this.state.symbol);
      for (const pos of positions) {
        await this.client.createOrder(
          this.state.symbol,
          'market',
          pos.side === 'long' ? 'sell' : 'buy',
          pos.size
        );
      }
    } catch { /* best effort */ }

    this.addAnnotation('signal', Date.now(), 0, 'PANIC — ALL POSITIONS CLOSED', '#dc3545');
    this.emit({
      type: 'kill_switch',
      data: { reason: 'manual_panic', equity: 0 },
      timestamp: Date.now(),
    });
  }

  // --- Webhook Handler (TradingView → Phemex) ---

  async handleWebhook(webhook: TradingViewWebhook): Promise<TradeRecord | null> {
    // Pre-check: reject if not running
    if (!this.state.isRunning || this.state.isPaused || this.state.isKilled) {
      return null;
    }

    // Run kill switch check before executing — healthCheck sets isKilled atomically
    await this.healthCheck();

    // Post-check: reject if kill switch triggered during health check
    if (this.state.isKilled || !this.state.isRunning) return null;

    try {
      let order: Order;
      let annotation: ChartAnnotation;

      switch (webhook.action) {
        case 'buy': {
          const amount = await this.calculatePositionSize(webhook.price);
          order = await this.client.createOrder(
            this.state.symbol, 'market', 'buy', amount
          );
          annotation = this.addAnnotation(
            'trade_entry', Date.now(), webhook.price,
            `LONG ${amount} @ $${webhook.price.toFixed(2)}`,
            '#00d26a', 'buy'
          );
          break;
        }
        case 'sell': {
          const amount = await this.calculatePositionSize(webhook.price);
          order = await this.client.createOrder(
            this.state.symbol, 'market', 'sell', amount
          );
          annotation = this.addAnnotation(
            'trade_entry', Date.now(), webhook.price,
            `SHORT ${amount} @ $${webhook.price.toFixed(2)}`,
            '#dc3545', 'sell'
          );
          break;
        }
        case 'close': {
          const positions = await this.client.getPositions(this.state.symbol);
          if (positions.length === 0) return null;

          const pos = positions[0];
          order = await this.client.createOrder(
            this.state.symbol,
            'market',
            pos.side === 'long' ? 'sell' : 'buy',
            pos.size
          );

          const pnl = pos.unrealizedPnl;
          const pnlPercent = ((webhook.price - pos.entryPrice) / pos.entryPrice) * 100 *
            (pos.side === 'long' ? 1 : -1);

          annotation = this.addAnnotation(
            'trade_exit', Date.now(), webhook.price,
            `CLOSE ${pos.side.toUpperCase()} | PnL: $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)`,
            pnl >= 0 ? '#00d26a' : '#dc3545',
            pos.side === 'long' ? 'sell' : 'buy',
            pnl, pnlPercent
          );
          break;
        }
        default:
          return null;
      }

      const trade: TradeRecord = {
        id: order!.id,
        timestamp: Date.now(),
        side: webhook.action === 'close' ? 'sell' : webhook.action,
        price: webhook.price,
        amount: order!.amount,
        cost: order!.cost,
        reason: `TV webhook: ${webhook.strategy}`,
        orderId: order!.id,
      };

      this.state.trades.push(trade);
      this.state.tradesExecuted++;

      this.emit({
        type: 'trade_executed',
        data: { trade, annotation: annotation! },
        timestamp: Date.now(),
      });

      return trade;
    } catch (err) {
      this.emit({ type: 'error', data: { error: String(err) }, timestamp: Date.now() });
      return null;
    }
  }

  // --- Kill Switch Health Check ---

  private async healthCheck(): Promise<void> {
    if (!this.state.isRunning || this.state.isKilled) return;
    // Prevent concurrent health checks (race condition guard)
    if (this.healthCheckInProgress) return;
    this.healthCheckInProgress = true;

    try {
      const account = await this.client.getAccountInfo();
      const equity = account.totalUsdValue;

      // Guard: equity must be a valid positive number
      if (!Number.isFinite(equity) || equity < 0) {
        this.emit({ type: 'error', data: { error: `Invalid equity value: ${equity}` }, timestamp: Date.now() });
        return;
      }

      // Update peak equity
      this.state.peakEquity = Math.max(this.state.peakEquity, equity);

      // Calculate drawdown (guard against peakEquity=0)
      this.state.currentDrawdown = this.state.peakEquity > 0
        ? ((this.state.peakEquity - equity) / this.state.peakEquity) * 100
        : 0;

      // Calculate daily PnL % (guard against dailyStartEquity=0)
      this.state.dailyPnl = this.state.dailyStartEquity > 0
        ? ((this.state.dailyStartEquity - equity) / this.state.dailyStartEquity) * 100
        : 0;

      // Total PnL absolute
      this.state.totalPnl = equity - this.state.dailyStartEquity;

      // Clamp to prevent NaN/Infinity propagation from floating point edge cases
      if (!Number.isFinite(this.state.currentDrawdown)) this.state.currentDrawdown = 0;
      if (!Number.isFinite(this.state.dailyPnl)) this.state.dailyPnl = 0;

      // Check kill conditions (use > instead of >= to avoid floating-point boundary triggers)
      let killReason: KillReason | null = null;
      const EPSILON = 0.001; // 0.001% tolerance

      if (this.state.currentDrawdown >= this.risk.maxDrawdownPercent - EPSILON) {
        killReason = 'max_drawdown';
      } else if (this.state.dailyPnl >= this.risk.maxDailyLossPercent - EPSILON) {
        killReason = 'daily_loss_limit';
      } else if (this.risk.hardFloorUsd && equity <= this.risk.hardFloorUsd) {
        killReason = 'hard_floor';
      } else if (this.risk.hardCeilingUsd && equity >= this.risk.hardCeilingUsd) {
        killReason = 'hard_ceiling';
      }

      if (killReason) {
        await this.triggerKillSwitch(killReason, equity);
      }
    } catch (err) {
      // Network errors shouldn't kill the strategy, but log them
      this.emit({ type: 'error', data: { error: `Health check failed: ${err}` }, timestamp: Date.now() });
    } finally {
      this.healthCheckInProgress = false;
    }
  }

  private async triggerKillSwitch(reason: KillReason, equity: number): Promise<void> {
    this.state.isKilled = true;
    this.state.isRunning = false;
    this.state.killReason = reason;

    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    // Close everything
    try {
      await this.client.cancelAllOrders(this.state.symbol);
      const positions = await this.client.getPositions(this.state.symbol);
      for (const pos of positions) {
        await this.client.createOrder(
          this.state.symbol, 'market',
          pos.side === 'long' ? 'sell' : 'buy',
          pos.size
        );
      }
    } catch { /* best effort */ }

    const reasonText: Record<KillReason, string> = {
      max_drawdown: `MAX DRAWDOWN (${this.state.currentDrawdown.toFixed(1)}% >= ${this.risk.maxDrawdownPercent}%)`,
      daily_loss_limit: `DAILY LOSS LIMIT (${this.state.dailyPnl.toFixed(1)}% >= ${this.risk.maxDailyLossPercent}%)`,
      hard_floor: `HARD FLOOR HIT ($${equity.toFixed(2)} <= $${this.risk.hardFloorUsd})`,
      hard_ceiling: `HARD CEILING HIT ($${equity.toFixed(2)} >= $${this.risk.hardCeilingUsd})`,
      manual_panic: 'MANUAL PANIC BUTTON',
      error: 'CRITICAL ERROR',
    };

    this.addAnnotation('signal', Date.now(), 0,
      `KILL SWITCH: ${reasonText[reason]}`, '#dc3545');

    this.emit({
      type: 'kill_switch',
      data: { reason, equity, reasonText: reasonText[reason] },
      timestamp: Date.now(),
    });
  }

  // --- Position Sizing ---

  private async calculatePositionSize(price: number): Promise<number> {
    const account = await this.client.getAccountInfo();
    const equity = account.totalUsdValue;
    const maxPositionUsd = equity * (this.risk.maxPositionSizePercent / 100);
    return maxPositionUsd / price;
  }

  // --- Stats ---

  getStats(): DashboardStats {
    const trades = this.state.trades;
    const winTrades = trades.filter(t => (t.pnl ?? 0) > 0);
    const lossTrades = trades.filter(t => (t.pnl ?? 0) < 0);

    return {
      totalPnl: this.state.totalPnl,
      totalPnlPercent: this.state.dailyStartEquity > 0
        ? (this.state.totalPnl / this.state.dailyStartEquity) * 100 : 0,
      dailyPnl: -this.state.dailyPnl * this.state.dailyStartEquity / 100,
      dailyPnlPercent: -this.state.dailyPnl,
      winRate: trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0,
      totalTrades: trades.length,
      winningTrades: winTrades.length,
      losingTrades: lossTrades.length,
      averageWin: winTrades.length > 0
        ? winTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / winTrades.length : 0,
      averageLoss: lossTrades.length > 0
        ? lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0) / lossTrades.length : 0,
      profitFactor: (() => {
        const totalLoss = lossTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
        const totalWin = winTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
        return totalLoss !== 0 ? Math.abs(totalWin / totalLoss) : totalWin > 0 ? Infinity : 0;
      })(),
      sharpeRatio: 0,
      maxDrawdown: this.state.currentDrawdown,
      accountValue: this.state.peakEquity,
    };
  }

  getState(): ExecutionState {
    return { ...this.state };
  }

  getAnnotations(): ChartAnnotation[] {
    return [...this.state.annotations];
  }

  // --- Events ---

  onEvent(callback: ExecutionEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: ExecutionEvent): void {
    this.listeners.forEach(cb => cb(event));
  }

  // --- Annotations ---

  private addAnnotation(
    type: ChartAnnotation['type'],
    timestamp: number,
    price: number,
    text: string,
    color: string,
    side?: 'buy' | 'sell',
    pnl?: number,
    pnlPercent?: number
  ): ChartAnnotation {
    const annotation: ChartAnnotation = {
      id: crypto.randomUUID(),
      type,
      timestamp,
      price,
      text,
      color,
      side,
      pnl,
      pnlPercent,
    };
    this.state.annotations.push(annotation);
    return annotation;
  }
}
