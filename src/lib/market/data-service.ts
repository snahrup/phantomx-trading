// ============================================================================
// PhantomX — Market Data Service
// Rolling OHLCV buffers with historical load + real-time WebSocket append
// ============================================================================

import { PhemexClient } from '@/lib/phemex/client';
import { PhemexWebSocket } from '@/lib/phemex/websocket';
import type {
  OHLCV, Ticker, OrderBook, DataBuffer, DataBufferConfig,
  WSEvent,
} from '@/types/trading';

type DataEventCallback = (event: DataServiceEvent) => void;

export interface DataServiceEvent {
  type: 'bar_update' | 'bar_close' | 'ticker' | 'orderbook' | 'error';
  symbol: string;
  timeframe?: string;
  data: unknown;
  timestamp: number;
}

export interface DataServiceConfig {
  testnet?: boolean;
  apiKey?: string;
  secret?: string;
  defaultMaxBars?: number;
}

export class MarketDataService {
  private client: PhemexClient;
  private ws: PhemexWebSocket;
  private buffers: Map<string, DataBuffer> = new Map();
  private tickers: Map<string, Ticker> = new Map();
  private orderBooks: Map<string, OrderBook> = new Map();
  private listeners: Set<DataEventCallback> = new Set();
  private config: DataServiceConfig;
  private wsCleanups: Array<() => void> = [];

  constructor(client: PhemexClient, config: DataServiceConfig = {}) {
    this.client = client;
    this.config = config;
    this.ws = new PhemexWebSocket({
      testnet: config.testnet,
      apiKey: config.apiKey,
      secret: config.secret,
    });
  }

  // --- Buffer Key ---

  private bufferKey(symbol: string, timeframe: string): string {
    return `${symbol}:${timeframe}`;
  }

  // --- Initialize a Data Buffer ---

  async initBuffer(config: DataBufferConfig): Promise<DataBuffer> {
    const key = this.bufferKey(config.symbol, config.timeframe);

    // Load historical data via REST
    const ohlcv = await this.client.getOHLCV(
      config.symbol,
      config.timeframe,
      config.maxBars || this.config.defaultMaxBars || 500,
    );

    const buffer: DataBuffer = {
      symbol: config.symbol,
      timeframe: config.timeframe,
      bars: ohlcv,
      lastUpdate: Date.now(),
      isLive: false,
    };

    this.buffers.set(key, buffer);
    return buffer;
  }

  // --- Subscribe to Real-Time Updates ---

  subscribeLive(symbol: string, timeframe: string): void {
    const key = this.bufferKey(symbol, timeframe);
    const buffer = this.buffers.get(key);

    if (!buffer) {
      console.warn(`[DataService] No buffer for ${key} — call initBuffer first`);
      return;
    }

    // Connect WebSocket if not already
    if (!this.ws.isConnected) {
      this.ws.connect();
    }

    // Subscribe to kline stream
    this.ws.subscribeKline(symbol, timeframe);
    buffer.isLive = true;

    // Listen for kline events
    const cleanup = this.ws.on('kline', (event: WSEvent) => {
      if (event.symbol !== symbol.replace(/[/:]/g, '')) return;

      const kline = event.data as Partial<OHLCV>;
      if (!kline.timestamp || !kline.close) return;

      this.handleKlineUpdate(key, kline as OHLCV);
    });

    this.wsCleanups.push(cleanup);
  }

  // Subscribe to ticker for a symbol
  subscribeTicker(symbol: string): void {
    if (!this.ws.isConnected) this.ws.connect();
    this.ws.subscribeTicker(symbol);

    const cleanup = this.ws.on('ticker', (event: WSEvent) => {
      const ticker = event.data as Partial<Ticker>;
      if (ticker.symbol) {
        this.tickers.set(ticker.symbol, ticker as Ticker);
        this.emit({ type: 'ticker', symbol: ticker.symbol, data: ticker, timestamp: Date.now() });
      }
    });

    this.wsCleanups.push(cleanup);
  }

  // Subscribe to order book for a symbol
  subscribeOrderBook(symbol: string): void {
    if (!this.ws.isConnected) this.ws.connect();
    this.ws.subscribeOrderBook(symbol);

    const cleanup = this.ws.on('orderbook', (event: WSEvent) => {
      const book = event.data as Partial<OrderBook>;
      if (book.symbol) {
        this.orderBooks.set(book.symbol, book as OrderBook);
        this.emit({ type: 'orderbook', symbol: book.symbol, data: book, timestamp: Date.now() });
      }
    });

    this.wsCleanups.push(cleanup);
  }

  // --- Handle Kline Update ---

  private handleKlineUpdate(key: string, kline: OHLCV): void {
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const lastBar = buffer.bars.at(-1);

    if (lastBar && lastBar.timestamp === kline.timestamp) {
      // Update current (in-progress) bar
      lastBar.open = kline.open;
      lastBar.high = Math.max(lastBar.high, kline.high);
      lastBar.low = Math.min(lastBar.low, kline.low);
      lastBar.close = kline.close;
      lastBar.volume = kline.volume;
      buffer.lastUpdate = Date.now();

      this.emit({
        type: 'bar_update',
        symbol: buffer.symbol,
        timeframe: buffer.timeframe,
        data: lastBar,
        timestamp: Date.now(),
      });
    } else {
      // New bar — the previous bar is now closed
      if (lastBar) {
        this.emit({
          type: 'bar_close',
          symbol: buffer.symbol,
          timeframe: buffer.timeframe,
          data: lastBar,
          timestamp: Date.now(),
        });
      }

      // Append new bar and trim buffer
      buffer.bars.push(kline);
      const maxBars = this.config.defaultMaxBars || 1000;
      if (buffer.bars.length > maxBars) {
        buffer.bars = buffer.bars.slice(-maxBars);
      }
      buffer.lastUpdate = Date.now();
    }
  }

  // --- Accessors ---

  getBuffer(symbol: string, timeframe: string): DataBuffer | undefined {
    return this.buffers.get(this.bufferKey(symbol, timeframe));
  }

  getBars(symbol: string, timeframe: string, count?: number): OHLCV[] {
    const buffer = this.buffers.get(this.bufferKey(symbol, timeframe));
    if (!buffer) return [];
    return count ? buffer.bars.slice(-count) : buffer.bars;
  }

  getLatestBar(symbol: string, timeframe: string): OHLCV | undefined {
    const buffer = this.buffers.get(this.bufferKey(symbol, timeframe));
    return buffer?.bars.at(-1);
  }

  getTicker(symbol: string): Ticker | undefined {
    return this.tickers.get(symbol);
  }

  getOrderBook(symbol: string): OrderBook | undefined {
    return this.orderBooks.get(symbol);
  }

  getLatestPrice(symbol: string): number {
    const ticker = this.tickers.get(symbol);
    if (ticker) return ticker.last;
    // Fallback: look in any buffer for this symbol
    for (const buffer of this.buffers.values()) {
      if (buffer.symbol === symbol) {
        const lastBar = buffer.bars.at(-1);
        if (lastBar) return lastBar.close;
      }
    }
    return 0;
  }

  // --- Fetch Historical on Demand ---

  async fetchOHLCV(symbol: string, timeframe: string, limit = 500): Promise<OHLCV[]> {
    return this.client.getOHLCV(symbol, timeframe, limit);
  }

  // --- Events ---

  onEvent(callback: DataEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: DataServiceEvent): void {
    this.listeners.forEach(cb => {
      try { cb(event); } catch { /* listener error */ }
    });
  }

  // --- Lifecycle ---

  shutdown(): void {
    this.wsCleanups.forEach(cleanup => cleanup());
    this.wsCleanups = [];
    this.ws.disconnect();
    this.buffers.clear();
    this.tickers.clear();
    this.orderBooks.clear();
    this.listeners.clear();
  }

  get isConnected(): boolean {
    return this.ws.isConnected;
  }

  getBufferCount(): number {
    return this.buffers.size;
  }

  getAllBufferKeys(): string[] {
    return Array.from(this.buffers.keys());
  }
}
