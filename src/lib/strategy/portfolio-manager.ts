// ============================================================================
// PhantomX — Multi-Strategy Portfolio Manager
// Capital allocation, correlation management, portfolio-level circuit breaker
// ============================================================================

import { HFTEngine } from '@/lib/strategy/hft-engine';
import { PaperTradingEngine } from '@/lib/strategy/paper-engine';
import { MarketDataService } from '@/lib/market/data-service';
import { classifyRegime, isStrategyCompatibleWithRegime } from '@/lib/market/regime-classifier';
import type {
  StrategyConfig, StrategyAllocation, PortfolioRiskState,
  MarketRegime, HFTConfig, DrawdownRecoveryConfig,
} from '@/types/trading';

type PortfolioEventCallback = (event: PortfolioEvent) => void;

export interface PortfolioEvent {
  type: 'strategy_started' | 'strategy_stopped' | 'allocation_changed' |
        'circuit_breaker' | 'rebalance' | 'pnl_update' | 'error';
  data: Record<string, unknown>;
  timestamp: number;
}

export interface ManagedStrategy {
  id: string;
  config: StrategyConfig;
  engine: HFTEngine | null;       // null if paper-only
  paperEngine: PaperTradingEngine | null;
  allocation: StrategyAllocation;
  mode: 'live' | 'paper';
}

export class PortfolioManager {
  private strategies: Map<string, ManagedStrategy> = new Map();
  private dataService: MarketDataService;
  private listeners: Set<PortfolioEventCallback> = new Set();
  private riskState: PortfolioRiskState;
  private monitorInterval: ReturnType<typeof setInterval> | null = null;

  // Portfolio-level limits
  private maxTotalExposurePercent = 80;    // never use more than 80% of equity
  private maxCorrelatedExposurePercent = 50; // correlated strategies can't exceed 50%
  private portfolioCircuitBreakerPercent = 25; // halt ALL if portfolio dd > 25%

  constructor(dataService: MarketDataService, initialEquity: number) {
    this.dataService = dataService;
    this.riskState = {
      totalEquity: initialEquity,
      totalDrawdownPercent: 0,
      peakEquity: initialEquity,
      strategyAllocations: [],
      circuitBreakerTriggered: false,
      portfolioHeatPercent: 0,
      correlationWarnings: [],
    };
  }

  // --- Strategy Management ---

  addStrategy(
    config: StrategyConfig,
    allocationPercent: number,
    mode: 'live' | 'paper' = 'paper',
    hftConfig?: Partial<HFTConfig>,
  ): string {
    const id = config.id;

    // Check total allocation
    const currentTotal = this.riskState.strategyAllocations
      .reduce((s, a) => s + a.allocationPercent, 0);
    if (currentTotal + allocationPercent > 100) {
      allocationPercent = 100 - currentTotal;
    }

    const capitalUsd = this.riskState.totalEquity * (allocationPercent / 100);

    const allocation: StrategyAllocation = {
      strategyId: id,
      strategyName: config.name,
      allocationPercent,
      capitalUsd,
      currentPnl: 0,
      currentPnlPercent: 0,
      isActive: false,
      regime: 'unknown',
      maxDrawdownPercent: config.risk.maxDrawdownPercent,
      currentDrawdownPercent: 0,
    };

    const managed: ManagedStrategy = {
      id,
      config,
      engine: null,
      paperEngine: null,
      allocation,
      mode,
    };

    this.strategies.set(id, managed);
    this.riskState.strategyAllocations.push(allocation);

    this.emit({
      type: 'allocation_changed',
      data: { strategyId: id, allocation },
      timestamp: Date.now(),
    });

    return id;
  }

  async startStrategy(strategyId: string, client?: import('@/lib/phemex/client').PhemexClient): Promise<void> {
    const managed = this.strategies.get(strategyId);
    if (!managed) return;

    if (this.riskState.circuitBreakerTriggered) {
      this.emit({
        type: 'error',
        data: { error: 'Portfolio circuit breaker active — cannot start new strategies' },
        timestamp: Date.now(),
      });
      return;
    }

    // Check regime compatibility
    const bars = this.dataService.getBars(managed.config.symbol, managed.config.timeframe);
    if (bars.length >= 50) {
      const regime = classifyRegime(bars);
      managed.allocation.regime = regime.regime;
    }

    if (managed.mode === 'live' && client) {
      const hftConfig: HFTConfig = {
        strategy: managed.config,
        mode: 'live',
        maxTradesPerMinute: 10,
        minTimeBetweenTradesMs: 5000,
        maxConcurrentPositions: managed.config.risk.maxOpenPositions,
        positionSizeMode: 'percent_equity',
        percentEquity: managed.allocation.allocationPercent,
      };

      managed.engine = new HFTEngine(client, this.dataService, hftConfig);
      managed.engine.onEvent((event) => {
        if (event.type === 'position_closed') {
          this.updateStrategyPnl(strategyId);
        }
      });

      await managed.engine.start();
    } else {
      // Paper mode
      managed.paperEngine = new PaperTradingEngine(
        this.dataService,
        managed.allocation.capitalUsd,
      );
      managed.paperEngine.start();
    }

    managed.allocation.isActive = true;

    this.emit({
      type: 'strategy_started',
      data: { strategyId, mode: managed.mode },
      timestamp: Date.now(),
    });
  }

  async stopStrategy(strategyId: string): Promise<void> {
    const managed = this.strategies.get(strategyId);
    if (!managed) return;

    if (managed.engine) {
      await managed.engine.stop();
      managed.engine = null;
    }
    if (managed.paperEngine) {
      managed.paperEngine.stop();
      managed.paperEngine = null;
    }

    managed.allocation.isActive = false;

    this.emit({
      type: 'strategy_stopped',
      data: { strategyId },
      timestamp: Date.now(),
    });
  }

  removeStrategy(strategyId: string): void {
    this.stopStrategy(strategyId);
    this.strategies.delete(strategyId);
    this.riskState.strategyAllocations = this.riskState.strategyAllocations
      .filter(a => a.strategyId !== strategyId);
  }

  // --- Portfolio Monitoring ---

  startMonitoring(intervalMs = 10_000): void {
    this.monitorInterval = setInterval(() => this.monitorPortfolio(), intervalMs);
  }

  stopMonitoring(): void {
    if (this.monitorInterval) clearInterval(this.monitorInterval);
  }

  private monitorPortfolio(): void {
    // Update all strategy P&L
    for (const [id] of this.strategies) {
      this.updateStrategyPnl(id);
    }

    // Calculate portfolio-level metrics
    const totalPnl = this.riskState.strategyAllocations
      .reduce((s, a) => s + a.currentPnl, 0);
    const currentEquity = this.riskState.totalEquity + totalPnl;

    this.riskState.peakEquity = Math.max(this.riskState.peakEquity, currentEquity);
    this.riskState.totalDrawdownPercent = this.riskState.peakEquity > 0
      ? ((this.riskState.peakEquity - currentEquity) / this.riskState.peakEquity) * 100
      : 0;

    // Portfolio heat (total exposure)
    const totalExposure = this.riskState.strategyAllocations
      .filter(a => a.isActive)
      .reduce((s, a) => s + a.allocationPercent, 0);
    this.riskState.portfolioHeatPercent = totalExposure;

    // Check correlation warnings
    this.checkCorrelationWarnings();

    // Circuit breaker check
    if (this.riskState.totalDrawdownPercent >= this.portfolioCircuitBreakerPercent) {
      this.triggerCircuitBreaker();
    }

    this.emit({
      type: 'pnl_update',
      data: {
        totalPnl,
        currentEquity,
        drawdownPercent: this.riskState.totalDrawdownPercent,
        heat: this.riskState.portfolioHeatPercent,
      },
      timestamp: Date.now(),
    });
  }

  private updateStrategyPnl(strategyId: string): void {
    const managed = this.strategies.get(strategyId);
    if (!managed) return;

    const alloc = managed.allocation;

    if (managed.engine) {
      alloc.currentPnl = managed.engine.getPnl();
      alloc.currentPnlPercent = managed.engine.getPnlPercent();
      const recovery = managed.engine.getRecoveryState();
      alloc.currentDrawdownPercent = recovery.currentDrawdownPercent;
    } else if (managed.paperEngine) {
      const stats = managed.paperEngine.getStats();
      alloc.currentPnl = stats.totalPnl;
      alloc.currentPnlPercent = stats.totalPnlPercent;
      alloc.currentDrawdownPercent = stats.maxDrawdownPercent;
    }
  }

  private checkCorrelationWarnings(): void {
    // Simple correlation check: strategies on the same symbol are highly correlated
    const symbolGroups = new Map<string, string[]>();
    for (const [id, managed] of this.strategies) {
      if (!managed.allocation.isActive) continue;
      const sym = managed.config.symbol;
      if (!symbolGroups.has(sym)) symbolGroups.set(sym, []);
      symbolGroups.get(sym)!.push(managed.config.name);
    }

    const warnings: string[] = [];
    for (const [symbol, names] of symbolGroups) {
      if (names.length > 1) {
        const totalAlloc = this.riskState.strategyAllocations
          .filter(a => a.isActive && this.strategies.get(a.strategyId)?.config.symbol === symbol)
          .reduce((s, a) => s + a.allocationPercent, 0);

        if (totalAlloc > this.maxCorrelatedExposurePercent) {
          warnings.push(
            `${symbol}: ${names.join(', ')} have ${totalAlloc}% combined allocation (>${this.maxCorrelatedExposurePercent}% limit)`,
          );
        }
      }
    }

    this.riskState.correlationWarnings = warnings;
  }

  private async triggerCircuitBreaker(): Promise<void> {
    if (this.riskState.circuitBreakerTriggered) return;

    this.riskState.circuitBreakerTriggered = true;
    this.riskState.circuitBreakerReason =
      `Portfolio drawdown ${this.riskState.totalDrawdownPercent.toFixed(1)}% exceeded ${this.portfolioCircuitBreakerPercent}% limit`;

    // Stop all active strategies
    for (const [id, managed] of this.strategies) {
      if (managed.allocation.isActive) {
        await this.stopStrategy(id);
      }
    }

    this.emit({
      type: 'circuit_breaker',
      data: {
        reason: this.riskState.circuitBreakerReason,
        drawdownPercent: this.riskState.totalDrawdownPercent,
      },
      timestamp: Date.now(),
    });
  }

  // --- Rebalance ---

  rebalance(newAllocations: Record<string, number>): void {
    for (const [strategyId, percent] of Object.entries(newAllocations)) {
      const alloc = this.riskState.strategyAllocations.find(a => a.strategyId === strategyId);
      if (alloc) {
        alloc.allocationPercent = percent;
        alloc.capitalUsd = this.riskState.totalEquity * (percent / 100);
      }
    }

    this.emit({
      type: 'rebalance',
      data: { allocations: newAllocations },
      timestamp: Date.now(),
    });
  }

  // Reset circuit breaker (manual)
  resetCircuitBreaker(): void {
    this.riskState.circuitBreakerTriggered = false;
    this.riskState.circuitBreakerReason = undefined;
  }

  // --- Events ---

  onEvent(callback: PortfolioEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: PortfolioEvent): void {
    this.listeners.forEach(cb => {
      try { cb(event); } catch { /* listener error */ }
    });
  }

  // --- Accessors ---

  getRiskState(): PortfolioRiskState { return { ...this.riskState }; }
  getStrategies(): ManagedStrategy[] { return Array.from(this.strategies.values()); }
  getStrategy(id: string): ManagedStrategy | undefined { return this.strategies.get(id); }
  getActiveCount(): number {
    return this.riskState.strategyAllocations.filter(a => a.isActive).length;
  }
  getTotalPnl(): number {
    return this.riskState.strategyAllocations.reduce((s, a) => s + a.currentPnl, 0);
  }
}
