// ============================================================================
// PhantomX — Paper Trading Engine
// Simulates trades against real-time market data with virtual capital
// ============================================================================

import { MarketDataService } from '@/lib/market/data-service';
import { estimateSlippage } from '@/lib/market/slippage-model';
import type {
  PaperAccount, PaperPosition, PaperTrade,
  StrategyConfig, PositionSide, OHLCV, OrderBook,
} from '@/types/trading';

type PaperEventCallback = (event: PaperEvent) => void;

export interface PaperEvent {
  type: 'position_opened' | 'position_closed' | 'position_updated' | 'account_updated' | 'error';
  data: Record<string, unknown>;
  timestamp: number;
}

export class PaperTradingEngine {
  private dataService: MarketDataService;
  private account: PaperAccount;
  private listeners: Set<PaperEventCallback> = new Set();
  private priceUpdateInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dataService: MarketDataService, initialEquity: number) {
    this.dataService = dataService;
    this.account = {
      equity: initialEquity,
      initialEquity,
      availableMargin: initialEquity,
      positions: [],
      closedTrades: [],
      peakEquity: initialEquity,
      currentDrawdownPercent: 0,
    };
  }

  // --- Lifecycle ---

  start(): void {
    // Update unrealized P&L every second
    this.priceUpdateInterval = setInterval(() => this.updatePositions(), 1000);
  }

  stop(): void {
    if (this.priceUpdateInterval) clearInterval(this.priceUpdateInterval);
  }

  // --- Order Execution ---

  openPosition(
    symbol: string,
    side: PositionSide,
    sizeUsd: number,
    leverage: number,
    stopLoss?: number,
    takeProfit?: number,
  ): PaperPosition | null {
    const price = this.dataService.getLatestPrice(symbol);
    if (price <= 0) return null;

    // Slippage estimation
    const slippage = estimateSlippage({
      orderSizeUsd: sizeUsd,
      orderBook: this.dataService.getOrderBook(symbol),
      recentBars: this.dataService.getBars(symbol, '1m', 20),
    });

    const fillPrice = price * (1 + (side === 'long' ? 1 : -1) * slippage.totalSlippage / 100);
    const size = sizeUsd / fillPrice;
    const marginRequired = sizeUsd / leverage;

    if (marginRequired > this.account.availableMargin) {
      this.emit({ type: 'error', data: { error: 'Insufficient margin' }, timestamp: Date.now() });
      return null;
    }

    const fees = sizeUsd * 0.0006; // 0.06% taker fee
    this.account.availableMargin -= marginRequired;
    this.account.equity -= fees;

    const position: PaperPosition = {
      id: crypto.randomUUID(),
      symbol,
      side,
      size,
      entryPrice: fillPrice,
      leverage,
      openedAt: Date.now(),
      stopLoss,
      takeProfit,
      unrealizedPnl: 0,
      markPrice: fillPrice,
    };

    this.account.positions.push(position);
    this.emit({ type: 'position_opened', data: { position }, timestamp: Date.now() });

    return position;
  }

  closePosition(positionId: string, reason: string): PaperTrade | null {
    const idx = this.account.positions.findIndex(p => p.id === positionId);
    if (idx === -1) return null;

    const pos = this.account.positions[idx];
    const exitPrice = this.dataService.getLatestPrice(pos.symbol);
    if (exitPrice <= 0) return null;

    // Slippage on exit
    const slippage = estimateSlippage({
      orderSizeUsd: pos.size * exitPrice,
      orderBook: this.dataService.getOrderBook(pos.symbol),
    });
    const fillPrice = exitPrice * (1 + (pos.side === 'long' ? -1 : 1) * slippage.totalSlippage / 100);

    const direction = pos.side === 'long' ? 1 : -1;
    const pnl = (fillPrice - pos.entryPrice) * direction * pos.size;
    const pnlPercent = ((fillPrice - pos.entryPrice) / pos.entryPrice) * direction * 100;
    const fees = pos.size * fillPrice * 0.0006;

    const trade: PaperTrade = {
      id: crypto.randomUUID(),
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: fillPrice,
      size: pos.size,
      leverage: pos.leverage,
      pnl: pnl - fees,
      pnlPercent,
      fees,
      slippage: slippage.totalSlippage,
      openedAt: pos.openedAt,
      closedAt: Date.now(),
      reason,
      holdDurationMs: Date.now() - pos.openedAt,
    };

    // Update account
    this.account.positions.splice(idx, 1);
    this.account.closedTrades.push(trade);
    this.account.equity += pnl - fees;
    this.account.availableMargin += (pos.size * pos.entryPrice) / pos.leverage;

    this.updateAccountMetrics();
    this.emit({ type: 'position_closed', data: { trade }, timestamp: Date.now() });

    return trade;
  }

  // --- Position Updates ---

  private updatePositions(): void {
    for (const pos of this.account.positions) {
      const price = this.dataService.getLatestPrice(pos.symbol);
      if (price <= 0) continue;

      pos.markPrice = price;
      const direction = pos.side === 'long' ? 1 : -1;
      pos.unrealizedPnl = (price - pos.entryPrice) * direction * pos.size;

      // Check stop loss
      if (pos.stopLoss) {
        if ((pos.side === 'long' && price <= pos.stopLoss) ||
            (pos.side === 'short' && price >= pos.stopLoss)) {
          this.closePosition(pos.id, 'stop_loss');
          continue;
        }
      }

      // Check take profit
      if (pos.takeProfit) {
        if ((pos.side === 'long' && price >= pos.takeProfit) ||
            (pos.side === 'short' && price <= pos.takeProfit)) {
          this.closePosition(pos.id, 'take_profit');
          continue;
        }
      }
    }

    this.updateAccountMetrics();
  }

  private updateAccountMetrics(): void {
    const unrealizedTotal = this.account.positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    const totalEquity = this.account.equity + unrealizedTotal;

    this.account.peakEquity = Math.max(this.account.peakEquity, totalEquity);
    this.account.currentDrawdownPercent = this.account.peakEquity > 0
      ? ((this.account.peakEquity - totalEquity) / this.account.peakEquity) * 100
      : 0;

    this.emit({
      type: 'account_updated',
      data: {
        equity: totalEquity,
        drawdownPercent: this.account.currentDrawdownPercent,
        positionCount: this.account.positions.length,
        unrealizedPnl: unrealizedTotal,
      },
      timestamp: Date.now(),
    });
  }

  // --- Events ---

  onEvent(callback: PaperEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: PaperEvent): void {
    this.listeners.forEach(cb => {
      try { cb(event); } catch { /* listener error */ }
    });
  }

  // --- Accessors ---

  getAccount(): PaperAccount { return { ...this.account }; }
  getPositions(): PaperPosition[] { return [...this.account.positions]; }
  getClosedTrades(): PaperTrade[] { return [...this.account.closedTrades]; }

  getStats() {
    const trades = this.account.closedTrades;
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

    return {
      totalTrades: trades.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      totalPnl,
      totalPnlPercent: this.account.initialEquity > 0
        ? (totalPnl / this.account.initialEquity) * 100 : 0,
      avgWin: wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0,
      profitFactor: (() => {
        const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
        const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
        return totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;
      })(),
      currentEquity: this.account.equity + this.account.positions.reduce((s, p) => s + p.unrealizedPnl, 0),
      maxDrawdownPercent: this.account.currentDrawdownPercent,
    };
  }
}
