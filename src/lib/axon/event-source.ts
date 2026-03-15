// ============================================================================
// PhantomX — Axon SSE Event Source (Singleton)
// Real-time agent events from the Axon daemon stream endpoint.
// Auto-reconnects with exponential backoff on disconnect.
// ============================================================================

import type { AxonSSEEvent, AxonSSEEventType } from './types';
import { getAxonClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AxonEventHandler = (event: AxonSSEEvent) => void;
export type AxonTypedHandler<T = Record<string, unknown>> = (data: T) => void;

interface HandlerMap {
  /** Fired for every SSE event regardless of type */
  all: Set<AxonEventHandler>;
  /** Fired for a specific event type */
  typed: Map<AxonSSEEventType, Set<AxonTypedHandler>>;
}

// ---------------------------------------------------------------------------
// Backoff config
// ---------------------------------------------------------------------------

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;
const BACKOFF_FACTOR = 2;

// ---------------------------------------------------------------------------
// AxonEventSource
// ---------------------------------------------------------------------------

export class AxonEventSource {
  private es: EventSource | null = null;
  private handlers: HandlerMap = {
    all: new Set(),
    typed: new Map(),
  };
  private retryMs = INITIAL_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  connect(): void {
    // Already connected or connecting
    if (this.es && this.es.readyState !== EventSource.CLOSED) return;

    this.intentionalClose = false;
    const url = getAxonClient().getStreamUrl();
    this.es = new EventSource(url);

    this.es.onopen = () => {
      // Reset backoff on successful connection
      this.retryMs = INITIAL_RETRY_MS;
      this.dispatch({ type: 'connection', data: { connected: true } });
    };

    // Backend sends NAMED SSE events (e.g. "event: agent_status\ndata: ...\n\n").
    // onmessage only catches unnamed events — register a listener per type.
    const NAMED_EVENTS: AxonSSEEventType[] = [
      'agent_status',
      'heartbeat_log',
      'heartbeat_decision',
      'issue_update',
      'activity',
      'connection',
    ];

    for (const eventType of NAMED_EVENTS) {
      this.es.addEventListener(eventType, (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data as string);
          // The backend may send the payload either wrapped as {type, data}
          // or as a raw object without a type field. If the parsed object
          // doesn't have a `type`, inject the SSE event name so dispatch
          // routes it to the correct typed handler.
          const event: AxonSSEEvent = parsed.type
            ? (parsed as AxonSSEEvent)
            : { type: eventType, data: parsed };
          this.dispatch(event);
        } catch {
          // Non-JSON payload — ignore
        }
      });
    }

    this.es.onerror = () => {
      this.dispatch({ type: 'connection', data: { connected: false } });
      this.es?.close();
      this.es = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.dispatch({ type: 'connection', data: { connected: false } });
  }

  get connected(): boolean {
    return this.es?.readyState === EventSource.OPEN;
  }

  // -----------------------------------------------------------------------
  // Event subscription
  // -----------------------------------------------------------------------

  /** Subscribe to all SSE events */
  onAll(handler: AxonEventHandler): () => void {
    this.handlers.all.add(handler);
    return () => {
      this.handlers.all.delete(handler);
    };
  }

  /** Subscribe to a specific event type */
  on<T = Record<string, unknown>>(
    type: AxonSSEEventType,
    handler: AxonTypedHandler<T>,
  ): () => void {
    if (!this.handlers.typed.has(type)) {
      this.handlers.typed.set(type, new Set());
    }
    const set = this.handlers.typed.get(type)!;
    const wrapped = handler as AxonTypedHandler;
    set.add(wrapped);
    return () => {
      set.delete(wrapped);
    };
  }

  /** Remove all handlers (useful on component unmount) */
  removeAllHandlers(): void {
    this.handlers.all.clear();
    this.handlers.typed.clear();
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private dispatch(event: AxonSSEEvent): void {
    // Broadcast to "all" handlers
    this.handlers.all.forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        console.error('[AxonEventSource] Handler error:', err);
      }
    });

    // Broadcast to typed handlers
    const typedSet = this.handlers.typed.get(event.type);
    if (typedSet) {
      typedSet.forEach((handler) => {
        try {
          handler(event.data);
        } catch (err) {
          console.error(`[AxonEventSource] Handler error (${event.type}):`, err);
        }
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.retryTimer) return;
    console.log(
      `[AxonEventSource] Reconnecting in ${(this.retryMs / 1000).toFixed(1)}s...`,
    );
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryMs = Math.min(this.retryMs * BACKOFF_FACTOR, MAX_RETRY_MS);
      this.connect();
    }, this.retryMs);
  }
}

// ---------------------------------------------------------------------------
// Singleton — survives Next.js hot reloads via globalThis
// ---------------------------------------------------------------------------

const globalForAxonSSE = globalThis as unknown as {
  __axonEventSource?: AxonEventSource;
};

export function getAxonEventSource(): AxonEventSource {
  if (!globalForAxonSSE.__axonEventSource) {
    globalForAxonSSE.__axonEventSource = new AxonEventSource();
  }
  return globalForAxonSSE.__axonEventSource;
}
