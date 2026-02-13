// ============================================================================
// PhantomX — Phemex WebSocket Manager
// ============================================================================

import type { Ticker, OHLCV, OrderBook, WSEvent, WSEventType } from '@/types/trading';

type WSCallback = (event: WSEvent) => void;

interface PhemexWSConfig {
  testnet?: boolean;
  apiKey?: string;
  secret?: string;
}

export class PhemexWebSocket {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<WSCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptions: Set<string> = new Set();
  private config: PhemexWSConfig;
  private connected = false;

  constructor(config: PhemexWSConfig = {}) {
    this.config = config;
  }

  get isConnected() { return this.connected; }

  connect(): void {
    // Guard against SSR — WebSocket only exists in the browser
    if (typeof globalThis.WebSocket === 'undefined') {
      console.warn('[PhemexWS] WebSocket not available (SSR context)');
      return;
    }

    const baseUrl = this.config.testnet
      ? 'wss://testnet-api.phemex.com/ws'
      : 'wss://ws.phemex.com/ws';

    this.ws = new WebSocket(baseUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.startPing();
      // Re-subscribe on reconnect
      for (const sub of this.subscriptions) {
        this.sendSubscription(sub);
      }
      this.emit('connection', { type: 'connection' as WSEventType, data: { status: 'connected' }, timestamp: Date.now() });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handleMessage(data);
      } catch {
        // Binary or invalid JSON
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.stopPing();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.connected = false;
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  // --- Subscriptions ---

  subscribeTicker(symbol: string): void {
    const channel = `ticker.${this.formatSymbol(symbol)}`;
    this.subscribe(channel);
  }

  subscribeKline(symbol: string, interval: string): void {
    const channel = `kline.${this.formatSymbol(symbol)}.${this.mapInterval(interval)}`;
    this.subscribe(channel);
  }

  subscribeOrderBook(symbol: string): void {
    const channel = `orderbook.${this.formatSymbol(symbol)}`;
    this.subscribe(channel);
  }

  subscribeTrades(symbol: string): void {
    const channel = `trade.${this.formatSymbol(symbol)}`;
    this.subscribe(channel);
  }

  subscribeAccountUpdates(): void {
    this.subscribe('aop.subscribe');
  }

  // --- Event Handling ---

  on(event: string, callback: WSCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  off(event: string, callback: WSCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  // --- Internal ---

  private subscribe(channel: string): void {
    this.subscriptions.add(channel);
    if (this.connected) {
      this.sendSubscription(channel);
    }
  }

  private sendSubscription(channel: string): void {
    this.send({
      id: Date.now(),
      method: channel.includes('aop') ? 'aop.subscribe' : `${channel.split('.')[0]}.subscribe`,
      params: channel.includes('aop') ? [] : [channel.replace(/^[^.]+\./, '')],
    });
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(data: Record<string, unknown>): void {
    // Pong response
    if (data.result === 'pong') return;

    // Ticker update
    if (data.ticker) {
      const ticker = this.parseTicker(data);
      this.emit('ticker', {
        type: 'ticker',
        symbol: data.symbol as string,
        data: ticker,
        timestamp: Date.now(),
      });
    }

    // Kline update
    if (data.kline) {
      const kline = this.parseKline(data);
      this.emit('kline', {
        type: 'kline',
        symbol: data.symbol as string,
        data: kline,
        timestamp: Date.now(),
      });
    }

    // Order book
    if (data.book) {
      const book = this.parseOrderBook(data);
      this.emit('orderbook', {
        type: 'orderbook',
        symbol: data.symbol as string,
        data: book,
        timestamp: Date.now(),
      });
    }

    // Trade
    if (data.trades) {
      this.emit('trade', {
        type: 'trade',
        symbol: data.symbol as string,
        data: data.trades,
        timestamp: Date.now(),
      });
    }

    // Account/Order/Position updates
    if (data.accounts || data.orders || data.positions) {
      if (data.accounts) {
        this.emit('balance_update', {
          type: 'balance_update',
          data: data.accounts,
          timestamp: Date.now(),
        });
      }
      if (data.orders) {
        this.emit('order_update', {
          type: 'order_update',
          data: data.orders,
          timestamp: Date.now(),
        });
      }
      if (data.positions) {
        this.emit('position_update', {
          type: 'position_update',
          data: data.positions,
          timestamp: Date.now(),
        });
      }
    }
  }

  private parseTicker(data: Record<string, unknown>): Partial<Ticker> {
    const t = data.ticker as Record<string, unknown>;
    return {
      symbol: data.symbol as string,
      last: Number(t?.lastEp ?? t?.last ?? 0) / 1e4,
      bid: Number(t?.bidEp ?? t?.bid ?? 0) / 1e4,
      ask: Number(t?.askEp ?? t?.ask ?? 0) / 1e4,
      high: Number(t?.highEp ?? t?.high ?? 0) / 1e4,
      low: Number(t?.lowEp ?? t?.low ?? 0) / 1e4,
      volume: Number(t?.volumeEv ?? t?.volume ?? 0) / 1e8,
      timestamp: Number(t?.timestamp ?? Date.now()),
    };
  }

  private parseKline(data: Record<string, unknown>): Partial<OHLCV> {
    const k = (data.kline as Record<string, unknown>[])?.at(0);
    if (!k) return {};
    return {
      timestamp: Number(k.timestamp ?? 0) * 1000,
      open: Number(k.openEp ?? k.open ?? 0) / 1e4,
      high: Number(k.highEp ?? k.high ?? 0) / 1e4,
      low: Number(k.lowEp ?? k.low ?? 0) / 1e4,
      close: Number(k.closeEp ?? k.close ?? 0) / 1e4,
      volume: Number(k.volumeEv ?? k.volume ?? 0) / 1e8,
    };
  }

  private parseOrderBook(data: Record<string, unknown>): Partial<OrderBook> {
    const book = data.book as Record<string, unknown>;
    return {
      symbol: data.symbol as string,
      bids: ((book?.bids as number[][]) ?? []).map(([price, size]) => ({
        price: price / 1e4,
        amount: size / 1e8,
      })),
      asks: ((book?.asks as number[][]) ?? []).map(([price, size]) => ({
        price: price / 1e4,
        amount: size / 1e8,
      })),
      timestamp: Date.now(),
    };
  }

  private emit(event: string, wsEvent: WSEvent): void {
    this.listeners.get(event)?.forEach(cb => cb(wsEvent));
    this.listeners.get('*')?.forEach(cb => cb(wsEvent));
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({ id: Date.now(), method: 'server.ping', params: [] });
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 3000);
  }

  private formatSymbol(symbol: string): string {
    // Convert CCXT format (BTC/USDT:USDT) to Phemex format (BTCUSDT)
    return symbol.replace(/[/:]/g, '');
  }

  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '60', '3m': '180', '5m': '300', '15m': '900',
      '30m': '1800', '1h': '3600', '2h': '7200', '4h': '14400',
      '6h': '21600', '12h': '43200', '1d': '86400', '1w': '604800',
      '1M': '2592000',
    };
    return map[interval] ?? '3600';
  }
}
