// ============================================================================
// PhantomX — Background Research Engine API Route
// POST: start/stop/configure the research engine
// GET: SSE stream of research events (findings, theses, status updates)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  createResearchEngine,
  getResearchEngine,
  stopResearchEngine,
  type ResearchEngineEvent,
} from '@/lib/ai/research-engine';
import {
  createPaperTradingEngine,
  getPaperTradingEngine,
  stopPaperTradingEngine,
} from '@/lib/ai/paper-trading-engine';
import type { ResearchEngineConfig } from '@/types/trading';

// Event buffer for SSE consumers
const eventBuffer: ResearchEngineEvent[] = [];
const MAX_EVENT_BUFFER = 500;
let engineWired = false;

function wireEngineEvents(): void {
  const engine = getResearchEngine();
  if (!engine || engineWired) return;

  engine.onEvent((event) => {
    eventBuffer.push(event);
    if (eventBuffer.length > MAX_EVENT_BUFFER) {
      eventBuffer.shift();
    }
  });
  engineWired = true;
}

// ---------------------------------------------------------------------------
// POST — Control the research engine
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'start': {
        const config = body.config as Partial<ResearchEngineConfig> | undefined;
        const engine = createResearchEngine(config);
        engineWired = false;
        wireEngineEvents();
        await engine.start();

        // Auto-start paper trading alongside research (they feed each other)
        const paperEngine = createPaperTradingEngine(body.virtualBalance ?? 100_000);
        await paperEngine.start();

        return NextResponse.json({
          success: true,
          status: engine.getStatus(),
          paperTrading: paperEngine.getState(),
        });
      }

      case 'stop': {
        stopResearchEngine();
        stopPaperTradingEngine();
        engineWired = false;
        return NextResponse.json({ success: true, status: { state: 'idle' } });
      }

      case 'pause': {
        const engine = getResearchEngine();
        if (!engine) return NextResponse.json({ error: 'Engine not running' }, { status: 400 });
        engine.pause();
        return NextResponse.json({ success: true, status: engine.getStatus() });
      }

      case 'resume': {
        const engine = getResearchEngine();
        if (!engine) return NextResponse.json({ error: 'Engine not running' }, { status: 400 });
        engine.resume();
        return NextResponse.json({ success: true, status: engine.getStatus() });
      }

      case 'configure': {
        const engine = getResearchEngine();
        if (!engine) return NextResponse.json({ error: 'Engine not running' }, { status: 400 });
        engine.updateConfig(body.config ?? {});
        return NextResponse.json({ success: true, status: engine.getStatus() });
      }

      case 'status': {
        const engine = getResearchEngine();
        return NextResponse.json({
          status: engine?.getStatus() ?? { state: 'idle' },
        });
      }

      case 'top_opportunities': {
        const engine = getResearchEngine();
        if (!engine) return NextResponse.json({ opportunities: [], theses: [], findings: [] });

        const count = body.count ?? 10;
        return NextResponse.json({
          opportunities: engine.getTopOpportunities(count),
          theses: engine.getReadyTheses(),
          findings: engine.getFindings().slice(0, 50),
          events: engine.getEvents(),
          status: engine.getStatus(),
        });
      }

      case 'get_thesis': {
        const engine = getResearchEngine();
        if (!engine) return NextResponse.json({ error: 'Engine not running' }, { status: 400 });

        const thesisId = body.thesisId as string;
        const theses = engine.getTheses();
        const thesis = theses.find(t => t.id === thesisId);
        if (!thesis) return NextResponse.json({ error: 'Thesis not found' }, { status: 404 });

        // Get related findings
        const findings = engine.getFindings().filter(
          f => thesis.findingIds.includes(f.id) || f.symbol === thesis.symbol
        );

        return NextResponse.json({ thesis, findings });
      }

      case 'get_research_summary': {
        const engine = getResearchEngine();
        return NextResponse.json({
          summary: engine?.getResearchSummary() ?? 'Research engine not running.',
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET — SSE stream of research events
// ---------------------------------------------------------------------------
export async function GET() {
  let lastIndex = eventBuffer.length;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial status
      const engine = getResearchEngine();
      const initialData = {
        type: 'initial_state',
        status: engine?.getStatus() ?? { state: 'idle' },
        topOpportunities: engine?.getTopOpportunities(10) ?? [],
        thesesCount: engine?.getReadyTheses().length ?? 0,
        findingsCount: engine?.getFindings().length ?? 0,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`));

      // Poll for new events every 2 seconds
      const interval = setInterval(() => {
        try {
          // Send any new events
          while (lastIndex < eventBuffer.length) {
            const event = eventBuffer[lastIndex];
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            lastIndex++;
          }

          // Periodically send top opportunities update (every 30s)
          const eng = getResearchEngine();
          if (eng && lastIndex % 15 === 0) { // every 15 polls = 30 seconds
            const update = {
              type: 'top_opportunities_update',
              opportunities: eng.getTopOpportunities(10),
              status: eng.getStatus(),
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
          }
        } catch {
          clearInterval(interval);
          try { controller.close(); } catch { /* already closed */ }
        }
      }, 2000);

      // Cleanup on cancel
      const cleanup = () => {
        clearInterval(interval);
      };

      // Store cleanup for abort signal
      (controller as unknown as Record<string, unknown>).__cleanup = cleanup;
    },
    cancel() {
      // Controller cancelled — interval already cleared in error handler
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
