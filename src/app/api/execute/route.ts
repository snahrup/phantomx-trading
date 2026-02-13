// ============================================================================
// PhantomX — Execution Engine API Route
// Wraps StrategyExecutionEngine singleton for dashboard integration
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { StrategyExecutionEngine, type ExecutionEvent } from '@/lib/strategy/execution-engine';
import { getPhemexClient } from '@/lib/phemex/client';
import type { TradingViewWebhook, RiskParameters } from '@/types/trading';

// Singleton engine instance
let engine: StrategyExecutionEngine | null = null;

// Event buffer for SSE consumers
const eventBuffer: ExecutionEvent[] = [];
const MAX_EVENT_BUFFER = 200;

function getEngine(): StrategyExecutionEngine | null {
  return engine;
}

function createEngine(symbol: string, risk: RiskParameters): StrategyExecutionEngine {
  const client = getPhemexClient();
  if (!client) throw new Error('Phemex client not connected');

  // Clean up existing engine
  if (engine) {
    try { engine.stop(); } catch { /* best effort */ }
  }

  engine = new StrategyExecutionEngine(client, {
    id: `phantomx-${Date.now()}`,
    name: 'PhantomX Live Strategy',
    symbol,
    timeframe: '4h',
    status: 'live',
    risk,
    indicators: [],
    entryConditions: { logic: 'AND', conditions: [] },
    exitConditions: { logic: 'AND', conditions: [] },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Wire up event listener to buffer for SSE
  engine.onEvent((event) => {
    eventBuffer.push(event);
    if (eventBuffer.length > MAX_EVENT_BUFFER) {
      // Log overflow for critical events that might get dropped
      const dropped = eventBuffer.shift();
      if (dropped && (dropped.type === 'kill_switch' || dropped.type === 'trade_executed')) {
        console.warn(`[PhantomX] Event buffer overflow — dropped ${dropped.type} event`);
      }
    }
  });

  return engine;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'start': {
        const { symbol, risk } = body;
        if (!symbol || !risk) {
          return NextResponse.json({ error: 'symbol and risk required' }, { status: 400 });
        }
        const eng = createEngine(symbol, risk);
        await eng.start();
        return NextResponse.json({ success: true, state: eng.getState() });
      }

      case 'stop': {
        const eng = getEngine();
        if (!eng) return NextResponse.json({ error: 'No active engine' }, { status: 400 });
        await eng.stop();
        return NextResponse.json({ success: true, state: eng.getState() });
      }

      case 'pause': {
        const eng = getEngine();
        if (!eng) return NextResponse.json({ error: 'No active engine' }, { status: 400 });
        eng.pause();
        return NextResponse.json({ success: true, state: eng.getState() });
      }

      case 'resume': {
        const eng = getEngine();
        if (!eng) return NextResponse.json({ error: 'No active engine' }, { status: 400 });
        eng.resume();
        return NextResponse.json({ success: true, state: eng.getState() });
      }

      case 'panic': {
        const eng = getEngine();
        if (!eng) {
          // No engine but still need to close everything — call exchange directly
          const client = getPhemexClient();
          if (client) {
            const symbol = body.symbol || 'BTC/USDT:USDT';
            try { await client.cancelAllOrders(symbol); } catch { /* best effort */ }
            const positions = await client.getPositions(symbol);
            for (const pos of positions) {
              await client.createOrder(symbol, 'market', pos.side === 'long' ? 'sell' : 'buy', pos.size);
            }
          }
          return NextResponse.json({ success: true, message: 'Panic executed (no engine)' });
        }
        await eng.panic();
        return NextResponse.json({ success: true, state: eng.getState() });
      }

      case 'webhook': {
        const eng = getEngine();
        if (!eng) return NextResponse.json({ error: 'No active engine' }, { status: 400 });
        const webhook = body.signal as TradingViewWebhook;
        if (!webhook) return NextResponse.json({ error: 'signal required' }, { status: 400 });
        const trade = await eng.handleWebhook(webhook);
        return NextResponse.json({ success: true, trade, state: eng.getState() });
      }

      case 'stats': {
        const eng = getEngine();
        if (!eng) return NextResponse.json({ stats: null, state: null });
        return NextResponse.json({ stats: eng.getStats(), state: eng.getState() });
      }

      case 'state': {
        const eng = getEngine();
        if (!eng) return NextResponse.json({ state: null });
        return NextResponse.json({ state: eng.getState() });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[PhantomX] Execute error:', err);
    const msg = process.env.NODE_ENV === 'production' ? 'Internal server error' : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// SSE endpoint for real-time engine events
export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let lastSent = 0;

      const interval = setInterval(() => {
        // Send any new events
        while (lastSent < eventBuffer.length) {
          const event = eventBuffer[lastSent];
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          lastSent++;
        }
      }, 200);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 15000);

      // Also send periodic stats
      const statsInterval = setInterval(() => {
        const eng = getEngine();
        if (eng) {
          const payload = { type: 'stats_update', data: { stats: eng.getStats(), state: eng.getState() }, timestamp: Date.now() };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
      }, 5000);

      const maxLifetime = setTimeout(() => {
        clearInterval(interval);
        clearInterval(keepAlive);
        clearInterval(statsInterval);
        controller.close();
      }, 3600000);

      cleanup = () => {
        clearInterval(interval);
        clearInterval(keepAlive);
        clearInterval(statsInterval);
        clearTimeout(maxLifetime);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
