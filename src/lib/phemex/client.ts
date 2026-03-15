// ============================================================================
// PhantomX — Phemex Exchange Client (CCXT Wrapper)
// ============================================================================

import ccxt, { type Exchange, type Order as CCXTOrder } from 'ccxt';
import type {
  Ticker, OHLCV, OrderBook, AccountInfo, Balance,
  Position, Order, Trade, OrderSide, OrderType, FundingRate
} from '@/types/trading';

export interface PhemexClientConfig {
  apiKey: string;
  secret: string;
  testnet?: boolean;
  marketType?: 'spot' | 'swap';
}

// Phemex server time endpoint (public, no auth needed)
const PHEMEX_TIME_URL = 'https://api.phemex.com/public/time';
const PHEMEX_TESTNET_TIME_URL = 'https://testnet-api.phemex.com/public/time';

export class PhemexClient {
  private exchange: Exchange;
  private config: PhemexClientConfig;
  private timeSynced = false;

  constructor(config: PhemexClientConfig) {
    this.config = config;
    this.exchange = new ccxt.phemex({
      apiKey: config.apiKey,
      secret: config.secret,
      sandbox: config.testnet ?? false,
      enableRateLimit: true,
      options: {
        defaultType: config.marketType ?? 'swap',
      },
    });
  }

  /**
   * Sync local clock with Phemex server time.
   * Patches CCXT's seconds() and milliseconds() so request signatures
   * are always valid, even when the system clock is wildly off.
   */
  async syncTime(): Promise<number> {
    const url = this.config.testnet ? PHEMEX_TESTNET_TIME_URL : PHEMEX_TIME_URL;
    const res = await fetch(url);
    const data = await res.json();
    const serverMs = data.data?.serverTime as number;
    if (!serverMs) return 0;

    const localMs = Date.now();
    const offsetMs = serverMs - localMs;

    // Only patch if drift > 2 seconds
    if (Math.abs(offsetMs) > 2000) {
      const origSeconds = this.exchange.seconds.bind(this.exchange);
      const origMilliseconds = this.exchange.milliseconds.bind(this.exchange);
      const offsetSec = Math.round(offsetMs / 1000);
      this.exchange.seconds = () => origSeconds() + offsetSec;
      this.exchange.milliseconds = () => origMilliseconds() + offsetMs;
      console.log(`[PhantomX] Clock sync: local is ${(offsetMs / 1000).toFixed(1)}s behind Phemex — patched`);
    }

    this.timeSynced = true;
    return offsetMs;
  }

  /** Ensure time is synced before any authenticated call */
  private async ensureTimeSync(): Promise<void> {
    if (!this.timeSynced) {
      await this.syncTime();
    }
  }

  // --- Market Data ---

  async getTicker(symbol: string): Promise<Ticker> {
    const t = await this.exchange.fetchTicker(symbol);
    return {
      symbol: t.symbol,
      last: t.last ?? 0,
      bid: t.bid ?? 0,
      ask: t.ask ?? 0,
      high: t.high ?? 0,
      low: t.low ?? 0,
      volume: t.baseVolume ?? 0,
      change24h: t.change ?? 0,
      changePercent24h: t.percentage ?? 0,
      timestamp: t.timestamp ?? Date.now(),
    };
  }

  async getOHLCV(
    symbol: string,
    timeframe: string = '1h',
    limit: number = 500
  ): Promise<OHLCV[]> {
    const candles = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp: timestamp as number,
      open: open as number,
      high: high as number,
      low: low as number,
      close: close as number,
      volume: volume as number,
    }));
  }

  async getOrderBook(symbol: string, limit: number = 25): Promise<OrderBook> {
    const ob = await this.exchange.fetchOrderBook(symbol, limit);
    return {
      symbol,
      bids: ob.bids.map(([price, amount]) => ({ price: Number(price), amount: Number(amount) })),
      asks: ob.asks.map(([price, amount]) => ({ price: Number(price), amount: Number(amount) })),
      timestamp: ob.timestamp ?? Date.now(),
    };
  }

  async getMarkets() {
    return this.exchange.loadMarkets();
  }

  async getAvailableSymbols(): Promise<string[]> {
    const markets = await this.exchange.loadMarkets();
    return Object.keys(markets).filter(s => {
      const m = markets[s];
      if (!m) return false;
      return this.config.marketType === 'spot' ? m.spot : m.swap;
    });
  }

  // --- Funding Rates ---

  async getFundingRate(symbol: string): Promise<FundingRate> {
    const fr = await this.exchange.fetchFundingRate(symbol);
    return {
      symbol: fr.symbol ?? symbol,
      fundingRate: fr.fundingRate ?? 0,
      fundingTimestamp: fr.fundingDatetime ? new Date(fr.fundingDatetime).getTime() : (fr.timestamp ?? Date.now()),
      nextFundingTimestamp: fr.nextFundingDatetime ? new Date(fr.nextFundingDatetime).getTime() : undefined,
      markPrice: fr.markPrice ?? undefined,
      indexPrice: fr.indexPrice ?? undefined,
    };
  }

  async getFundingRateHistory(symbol: string, since?: number, limit: number = 100): Promise<FundingRate[]> {
    const history = await this.exchange.fetchFundingRateHistory(symbol, since, limit);
    return history.map(fr => ({
      symbol: fr.symbol ?? symbol,
      fundingRate: fr.fundingRate ?? 0,
      fundingTimestamp: fr.timestamp ?? Date.now(),
      markPrice: undefined,
      indexPrice: undefined,
    }));
  }

  // --- Account ---

  async getAccountInfo(): Promise<AccountInfo> {
    await this.ensureTimeSync();
    const balance = await this.exchange.fetchBalance();
    const freeMap = (balance.free ?? {}) as unknown as Record<string, number>;
    const usedMap = (balance.used ?? {}) as unknown as Record<string, number>;
    const balances: Balance[] = Object.entries(balance.total || {})
      .filter(([, v]) => (v as number) > 0)
      .map(([currency, total]) => ({
        currency,
        total: total as number,
        free: freeMap[currency] ?? 0,
        used: usedMap[currency] ?? 0,
      }));

    return {
      balances,
      totalUsdValue: balances.reduce((sum, b) => sum + (b.usdValue ?? b.total), 0),
    };
  }

  async getPositions(symbol?: string): Promise<Position[]> {
    await this.ensureTimeSync();
    const positions = await this.exchange.fetchPositions(symbol ? [symbol] : undefined);
    return positions
      .filter(p => Math.abs(p.contracts ?? 0) > 0)
      .map(p => ({
        id: p.id ?? `${p.symbol}-${p.side}`,
        symbol: p.symbol ?? '',
        side: (p.side as 'long' | 'short') ?? 'long',
        size: Math.abs(p.contracts ?? 0),
        entryPrice: p.entryPrice ?? 0,
        markPrice: p.markPrice ?? 0,
        liquidationPrice: p.liquidationPrice ?? undefined,
        leverage: p.leverage ?? 1,
        unrealizedPnl: p.unrealizedPnl ?? 0,
        realizedPnl: p.realizedPnl ?? 0,
        marginType: (p.marginMode as 'cross' | 'isolated') ?? 'cross',
        timestamp: p.timestamp ?? Date.now(),
      }));
  }

  // --- Orders ---

  async createOrder(
    symbol: string,
    type: OrderType,
    side: OrderSide,
    amount: number,
    price?: number,
    params?: Record<string, unknown>
  ): Promise<Order> {
    await this.ensureTimeSync();
    const ccxtType = this.mapOrderType(type);
    const order = await this.exchange.createOrder(
      symbol, ccxtType, side, amount, price, params
    );
    return this.mapOrder(order);
  }

  async cancelOrder(id: string, symbol: string): Promise<void> {
    await this.ensureTimeSync();
    await this.exchange.cancelOrder(id, symbol);
  }

  async cancelAllOrders(symbol: string): Promise<void> {
    await this.ensureTimeSync();
    await this.exchange.cancelAllOrders(symbol);
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    await this.ensureTimeSync();
    const orders = await this.exchange.fetchOpenOrders(symbol);
    return orders.map(o => this.mapOrder(o));
  }

  async getOrder(id: string, symbol: string): Promise<Order> {
    await this.ensureTimeSync();
    const order = await this.exchange.fetchOrder(id, symbol);
    return this.mapOrder(order);
  }

  // --- Trades ---

  async getMyTrades(symbol: string, limit: number = 50): Promise<Trade[]> {
    await this.ensureTimeSync();
    const trades = await this.exchange.fetchMyTrades(symbol, undefined, limit);
    return trades.map(t => ({
      id: String(t.id ?? ''),
      orderId: String(t.order ?? ''),
      symbol: String(t.symbol ?? ''),
      side: t.side as OrderSide,
      price: Number(t.price ?? 0),
      amount: Number(t.amount ?? 0),
      cost: Number(t.cost ?? 0),
      fee: { cost: Number(t.fee?.cost ?? 0), currency: String(t.fee?.currency ?? 'USDT') },
      timestamp: Number(t.timestamp ?? Date.now()),
    }));
  }

  // --- Closed Orders ---

  async getClosedOrders(symbol?: string, since?: number, limit: number = 100): Promise<Order[]> {
    await this.ensureTimeSync();
    const orders = await this.exchange.fetchClosedOrders(symbol, since, limit);
    return orders.map(o => this.mapOrder(o));
  }

  // --- Close Position ---

  async closePosition(
    symbol: string,
    side: 'long' | 'short',
    size: number,
    type: 'market' | 'limit' = 'market',
    price?: number
  ): Promise<Order> {
    await this.ensureTimeSync();
    const closeSide: OrderSide = side === 'long' ? 'sell' : 'buy';

    // Try one-way mode first (reduceOnly), fall back to hedge mode (posSide)
    try {
      const order = await this.exchange.createOrder(
        symbol, type, closeSide, size, price, { reduceOnly: true }
      );
      return this.mapOrder(order);
    } catch (err) {
      const msg = String(err);
      // TE_ERR_INCONSISTENT_POS_MODE (code 20004) = account is in hedge mode
      if (msg.includes('INCONSISTENT_POS_MODE') || msg.includes('20004')) {
        console.log(`[PhantomX] Hedge mode detected for ${symbol}, retrying with posSide=${side}`);
        const posSide = side === 'long' ? 'Long' : 'Short';
        const order = await this.exchange.createOrder(
          symbol, type, closeSide, size, price, { posSide }
        );
        return this.mapOrder(order);
      }
      throw err;
    }
  }

  // --- Leverage & Margin ---

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    await this.ensureTimeSync();
    await this.exchange.setLeverage(leverage, symbol);
  }

  async setMarginMode(symbol: string, mode: 'cross' | 'isolated'): Promise<void> {
    await this.ensureTimeSync();
    await this.exchange.setMarginMode(mode, symbol);
  }

  // --- Helpers ---

  private mapOrderType(type: OrderType): string {
    const mapping: Record<OrderType, string> = {
      market: 'market',
      limit: 'limit',
      stop: 'stop',
      stop_limit: 'stop',
      take_profit: 'limit',
      trailing_stop: 'market',
    };
    return mapping[type] ?? 'market';
  }

  private mapOrder(o: CCXTOrder): Order {
    return {
      id: String(o.id ?? ''),
      clientOrderId: o.clientOrderId ? String(o.clientOrderId) : undefined,
      symbol: String(o.symbol ?? ''),
      side: o.side as OrderSide,
      type: o.type as OrderType,
      status: o.status as Order['status'],
      price: o.price != null ? Number(o.price) : undefined,
      stopPrice: o.stopPrice != null ? Number(o.stopPrice) : undefined,
      amount: Number(o.amount ?? 0),
      filled: Number(o.filled ?? 0),
      remaining: Number(o.remaining ?? 0),
      cost: Number(o.cost ?? 0),
      fee: o.fee ? { cost: Number(o.fee.cost ?? 0), currency: String(o.fee.currency ?? 'USDT') } : undefined,
      timestamp: Number(o.timestamp ?? Date.now()),
    };
  }

  getExchange(): Exchange {
    return this.exchange;
  }
}

// Singleton factory — survives Next.js hot reloads via globalThis
const globalForPhemex = globalThis as unknown as { __phantomxClient?: PhemexClient | null };

function getClient(): PhemexClient | null {
  return globalForPhemex.__phantomxClient ?? null;
}

function setClient(c: PhemexClient | null): void {
  globalForPhemex.__phantomxClient = c;
}

/**
 * Resolve API credentials from env, respecting testnet/mainnet selection.
 * When PHEMEX_TESTNET=true, prefers PHEMEX_TESTNET_API_KEY/SECRET,
 * falling back to PHEMEX_API_KEY/SECRET if testnet-specific vars aren't set.
 */
function resolveEnvCredentials(): { apiKey: string; secret: string; testnet: boolean } | null {
  const testnet = process.env.PHEMEX_TESTNET === 'true';
  let apiKey: string | undefined;
  let secret: string | undefined;

  if (testnet) {
    apiKey = process.env.PHEMEX_TESTNET_API_KEY || process.env.PHEMEX_API_KEY;
    secret = process.env.PHEMEX_TESTNET_API_SECRET || process.env.PHEMEX_API_SECRET;
  } else {
    apiKey = process.env.PHEMEX_API_KEY;
    secret = process.env.PHEMEX_API_SECRET;
  }

  if (!apiKey || !secret) return null;
  return { apiKey, secret, testnet };
}

/**
 * Auto-connect from env if the singleton was lost (hot reload, serverless cold start).
 * Returns true if connection was restored.
 */
function tryAutoConnectFromEnv(): boolean {
  if (getClient()) return true;
  const creds = resolveEnvCredentials();
  if (!creds) return false;
  setClient(new PhemexClient({ ...creds, marketType: 'swap' }));
  const network = creds.testnet ? 'TESTNET' : 'MAINNET';
  console.log(`[PhantomX] Auto-reconnected PhemexClient from env credentials (${network})`);
  return true;
}

/** Returns the current network derived from env config. */
export function getConfiguredNetwork(): 'mainnet' | 'testnet' {
  return process.env.PHEMEX_TESTNET === 'true' ? 'testnet' : 'mainnet';
}

/** Returns true if testnet-specific API keys are configured. */
export function hasTestnetCredentials(): boolean {
  return !!(process.env.PHEMEX_TESTNET_API_KEY && process.env.PHEMEX_TESTNET_API_SECRET);
}

export function getPhemexClient(config?: PhemexClientConfig): PhemexClient {
  if (config) {
    // Always reinitialize when config is provided (supports re-connect)
    setClient(new PhemexClient(config));
  }
  const c = getClient();
  if (!c) {
    // Try env auto-connect before giving up
    if (tryAutoConnectFromEnv()) return getClient()!;
    throw new Error('PhemexClient not initialized. Call with config first.');
  }
  return c;
}

export function isPhemexConfigured(): boolean {
  // Also try env auto-connect if client was lost
  if (!getClient()) tryAutoConnectFromEnv();
  return getClient() !== null;
}

export function resetPhemexClient(): void {
  setClient(null);
}
