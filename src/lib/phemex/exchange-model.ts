// ============================================================================
// PhantomX — Phemex Exchange-Specific Model
// Funding rates, liquidation mechanics, ADL, fee tiers
// ============================================================================

import { PhemexClient } from '@/lib/phemex/client';
import type { ExchangeModel, FundingRateSnapshot } from '@/types/trading';

export class PhemexExchangeModel {
  private client: PhemexClient;
  private model: ExchangeModel;
  private fundingRates: Map<string, FundingRateSnapshot> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  constructor(client: PhemexClient) {
    this.client = client;
    this.model = {
      exchange: 'phemex',
      fundingRateIntervalMs: 8 * 60 * 60 * 1000, // 8 hours
      currentFundingRate: 0,
      nextFundingTime: 0,
      makerFeePercent: 0.01,    // Phemex perpetual maker fee
      takerFeePercent: 0.06,    // Phemex perpetual taker fee
      minOrderSizes: {},
      maxLeverage: {},
      adlEnabled: true,
      liquidationFeePercent: 0.5,
      maintenanceMarginPercent: 0.5,
    };
  }

  // --- Initialize Model (loads exchange info) ---

  async initialize(): Promise<void> {
    try {
      const marketsDict = await this.client.getMarkets();
      const markets = Object.values(marketsDict);
      for (const market of markets) {
        const m = market as unknown as Record<string, unknown>;
        const symbol = m.symbol as string;
        const limits = m.limits as Record<string, Record<string, number>> | undefined;
        const leverage = m.leverage as Record<string, number> | undefined;
        this.model.minOrderSizes[symbol] = limits?.amount?.min ?? 0.001;
        this.model.maxLeverage[symbol] = leverage?.max ?? 100;
      }
    } catch {
      // Use defaults if market info unavailable
    }
  }

  // --- Funding Rate Tracking ---

  async fetchFundingRate(symbol: string): Promise<FundingRateSnapshot | null> {
    try {
      // CCXT provides funding rate info
      const ticker = await this.client.getTicker(symbol);
      const rate = (ticker as unknown as Record<string, unknown>).fundingRate as number | undefined;

      const snapshot: FundingRateSnapshot = {
        symbol,
        rate: rate ?? 0,
        predictedRate: rate ?? 0,
        nextFundingTime: this.getNextFundingTime(),
        timestamp: Date.now(),
      };

      this.fundingRates.set(symbol, snapshot);
      this.model.currentFundingRate = snapshot.rate;
      this.model.nextFundingTime = snapshot.nextFundingTime;

      return snapshot;
    } catch {
      return null;
    }
  }

  // Start periodic funding rate updates
  startFundingRateUpdates(symbols: string[], intervalMs = 60_000): void {
    this.updateInterval = setInterval(async () => {
      for (const symbol of symbols) {
        await this.fetchFundingRate(symbol);
      }
    }, intervalMs);

    // Fetch immediately
    for (const symbol of symbols) {
      this.fetchFundingRate(symbol);
    }
  }

  stopFundingRateUpdates(): void {
    if (this.updateInterval) clearInterval(this.updateInterval);
  }

  // --- Liquidation Price Calculator ---

  calculateLiquidationPrice(
    entryPrice: number,
    leverage: number,
    side: 'long' | 'short',
    marginType: 'cross' | 'isolated' = 'isolated',
  ): number {
    const maintenanceMargin = this.model.maintenanceMarginPercent / 100;
    const liquidationFee = this.model.liquidationFeePercent / 100;

    if (marginType === 'isolated') {
      // Isolated margin liquidation
      const marginRatio = 1 / leverage;

      if (side === 'long') {
        // Liq price = entry * (1 - margin + maintenance + liq_fee)
        return entryPrice * (1 - marginRatio + maintenanceMargin + liquidationFee);
      } else {
        // Liq price = entry * (1 + margin - maintenance - liq_fee)
        return entryPrice * (1 + marginRatio - maintenanceMargin - liquidationFee);
      }
    } else {
      // Cross margin — would need full account balance, simplified here
      return side === 'long'
        ? entryPrice * (1 - 1 / leverage + maintenanceMargin)
        : entryPrice * (1 + 1 / leverage - maintenanceMargin);
    }
  }

  // --- Fee Estimation ---

  estimateFees(
    orderSizeUsd: number,
    orderType: 'market' | 'limit',
    roundTrip = true,
  ): number {
    const rate = orderType === 'limit'
      ? this.model.makerFeePercent / 100
      : this.model.takerFeePercent / 100;

    const multiplier = roundTrip ? 2 : 1;
    return orderSizeUsd * rate * multiplier;
  }

  // --- Funding Rate P&L Impact ---

  estimateFundingCost(
    symbol: string,
    positionSizeUsd: number,
    holdDurationMs: number,
    side: 'long' | 'short',
  ): number {
    const snapshot = this.fundingRates.get(symbol);
    if (!snapshot) return 0;

    const fundingPeriods = holdDurationMs / this.model.fundingRateIntervalMs;
    const rate = snapshot.rate;

    // Positive rate: longs pay shorts. Negative rate: shorts pay longs.
    const direction = side === 'long' ? 1 : -1;
    return positionSizeUsd * rate * fundingPeriods * direction;
  }

  // --- ADL Risk Assessment ---

  assessADLRisk(
    leverage: number,
    pnlPercent: number,
  ): { riskLevel: 'low' | 'medium' | 'high'; description: string } {
    // ADL priority is based on: profit ranking × leverage ranking
    // Higher leverage + higher profit = higher ADL priority (more likely to be auto-deleveraged)
    const adlScore = leverage * Math.max(0, pnlPercent);

    if (adlScore > 500) {
      return {
        riskLevel: 'high',
        description: `High ADL risk: ${leverage}x leverage with ${pnlPercent.toFixed(1)}% profit. Consider reducing position.`,
      };
    } else if (adlScore > 200) {
      return {
        riskLevel: 'medium',
        description: `Moderate ADL risk at ${leverage}x leverage.`,
      };
    }
    return { riskLevel: 'low', description: 'Low ADL risk.' };
  }

  // --- Next Funding Time ---

  private getNextFundingTime(): number {
    // Phemex funding at 00:00, 08:00, 16:00 UTC
    const now = new Date();
    const hours = now.getUTCHours();
    let nextHour: number;

    if (hours < 8) nextHour = 8;
    else if (hours < 16) nextHour = 16;
    else nextHour = 24;

    const next = new Date(now);
    next.setUTCHours(nextHour === 24 ? 0 : nextHour, 0, 0, 0);
    if (nextHour === 24) next.setUTCDate(next.getUTCDate() + 1);

    return next.getTime();
  }

  // --- Accessors ---

  getModel(): ExchangeModel { return { ...this.model }; }
  getFundingRate(symbol: string): FundingRateSnapshot | undefined {
    return this.fundingRates.get(symbol);
  }
  getMinOrderSize(symbol: string): number {
    return this.model.minOrderSizes[symbol] ?? 0.001;
  }
  getMaxLeverage(symbol: string): number {
    return this.model.maxLeverage[symbol] ?? 100;
  }
}
