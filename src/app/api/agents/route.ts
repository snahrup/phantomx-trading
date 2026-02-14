// ============================================================================
// PhantomX — Agents API (Status & Control)
// ============================================================================
// GET: Agent statuses, signal summary, orchestrator state
// POST: Control orchestrator (start/stop/update config)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator, createOrchestrator, stopOrchestrator } from '@/lib/agents/agent-orchestrator';
import { getSignalBus } from '@/lib/agents/signal-bus';
import { broadcastSSE } from '@/lib/sse-broadcast';

// GET — Status
export async function GET() {
  try {
    const orchestrator = getOrchestrator();

    if (!orchestrator) {
      return NextResponse.json({
        isRunning: false,
        agents: [],
        signalSummary: getSignalBus().getSummary(),
      });
    }

    return NextResponse.json(orchestrator.getStatus());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — Control
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'start': {
        const orchestrator = createOrchestrator(body.config);
        if (body.watchlist) {
          orchestrator.setWatchlist(body.watchlist);
        }
        // Wire agent events to the shared SSE broadcast so the frontend receives them
        orchestrator.onEvent((event) => broadcastSSE(event));
        await orchestrator.start();
        return NextResponse.json({
          success: true,
          message: 'Agent orchestrator started',
          status: orchestrator.getStatus(),
        });
      }

      case 'stop': {
        stopOrchestrator();
        return NextResponse.json({ success: true, message: 'Agent orchestrator stopped' });
      }

      case 'status': {
        const orchestrator = getOrchestrator();
        if (!orchestrator) {
          return NextResponse.json({ isRunning: false, agents: [] });
        }
        return NextResponse.json(orchestrator.getStatus());
      }

      case 'update': {
        const orchestrator = getOrchestrator();
        if (!orchestrator) {
          return NextResponse.json({ error: 'Orchestrator not running' }, { status: 400 });
        }
        if (body.config) orchestrator.updateConfig(body.config);
        if (body.watchlist) orchestrator.setWatchlist(body.watchlist);
        return NextResponse.json({ success: true, status: orchestrator.getStatus() });
      }

      case 'signals': {
        // Get current signal intelligence (prompt-ready format)
        const orchestrator = getOrchestrator();
        if (!orchestrator) {
          return NextResponse.json({ intelligence: 'Agents not running.' });
        }
        return NextResponse.json({
          intelligence: orchestrator.getSignalIntelligence(),
          summary: getSignalBus().getSummary(),
          latestSignals: getSignalBus().getLatestSignals().slice(0, 20),
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
