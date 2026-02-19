// ============================================================================
// PhantomX — Paper Trading + AI Journal API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getPaperTradingEngine,
  createPaperTradingEngine,
  stopPaperTradingEngine,
  PaperTradingEvent,
} from '@/lib/ai/paper-trading-engine';

// ---------------------------------------------------------------------------
// POST — Actions
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'start': {
        const engine = createPaperTradingEngine(body.virtualBalance ?? 100_000);
        await engine.start();
        return NextResponse.json({
          success: true,
          state: engine.getState(),
        });
      }

      case 'stop': {
        stopPaperTradingEngine();
        return NextResponse.json({ success: true });
      }

      case 'status': {
        const engine = getPaperTradingEngine();
        if (!engine) {
          return NextResponse.json({ success: true, state: null });
        }
        return NextResponse.json({
          success: true,
          state: engine.getState(),
        });
      }

      case 'journal': {
        const engine = getPaperTradingEngine();
        if (!engine) {
          return NextResponse.json({ success: true, entries: [] });
        }
        const count = body.count ?? 50;
        const symbol = body.symbol;
        const tradeId = body.tradeId;

        let entries;
        if (tradeId) {
          entries = engine.getJournalForTrade(tradeId);
        } else if (symbol) {
          entries = engine.getJournalForSymbol(symbol);
        } else {
          entries = engine.getRecentJournal(count);
        }

        return NextResponse.json({ success: true, entries });
      }

      case 'trades': {
        const engine = getPaperTradingEngine();
        if (!engine) {
          return NextResponse.json({ success: true, open: [], closed: [] });
        }
        const state = engine.getState();
        return NextResponse.json({
          success: true,
          open: state.openTrades,
          closed: state.closedTrades.slice(-(body.limit ?? 50)),
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET — SSE Stream (journal entries + trade updates in real-time)
// ---------------------------------------------------------------------------
export async function GET() {
  const encoder = new TextEncoder();
  const eventBuffer: PaperTradingEvent[] = [];
  const MAX_BUFFER = 300;

  const stream = new ReadableStream({
    start(controller) {
      const engine = getPaperTradingEngine();

      // Send initial state
      const initData = engine ? {
        state: engine.getState(),
        recentJournal: engine.getRecentJournal(20),
      } : { state: null, recentJournal: [] };

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'init', ...initData })}\n\n`)
      );

      // Listen for live events
      if (engine) {
        engine.onEvent((event) => {
          eventBuffer.push(event);
          if (eventBuffer.length > MAX_BUFFER) {
            eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER);
          }
        });
      }

      // Poll for new events every 1s
      let lastSent = 0;
      const interval = setInterval(() => {
        const newEvents = eventBuffer.filter(e => e.timestamp > lastSent);
        if (newEvents.length > 0) {
          lastSent = newEvents[newEvents.length - 1].timestamp;
          for (const event of newEvents) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
              );
            } catch {
              clearInterval(interval);
            }
          }
        }
      }, 1000);

      // Periodic stats update every 10s
      const statsInterval = setInterval(() => {
        const eng = getPaperTradingEngine();
        if (eng) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'stats_update',
                data: eng.getState(),
                timestamp: Date.now(),
              })}\n\n`)
            );
          } catch {
            clearInterval(statsInterval);
          }
        }
      }, 10_000);

      // Keepalive
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          clearInterval(keepalive);
          clearInterval(interval);
          clearInterval(statsInterval);
        }
      }, 15_000);
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
