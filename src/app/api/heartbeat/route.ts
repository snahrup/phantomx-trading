// ============================================================================
// PhantomX — Heartbeat API (Start/Stop/SSE Events)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  createHeartbeatEngine, stopHeartbeatEngine, getHeartbeatEngine,
  type HeartbeatConfig, type HeartbeatEvent,
} from '@/lib/ai/heartbeat-engine';
import {
  createPortfolioHeartbeatEngine, stopPortfolioHeartbeatEngine, getPortfolioHeartbeatEngine,
  type PortfolioHeartbeatEngine,
} from '@/lib/ai/portfolio-heartbeat-engine';
import { isPhemexConfigured } from '@/lib/phemex/client';
import { createOrchestrator, stopOrchestrator, getOrchestrator } from '@/lib/agents/agent-orchestrator';
import { addSSEClient, removeSSEClient, broadcastSSE } from '@/lib/sse-broadcast';
import type { PortfolioHeartbeatConfig, PortfolioHeartbeatEvent, AgentEvent } from '@/types/trading';

// Track which mode is active so stop/status work for either
let activeMode: 'single' | 'portfolio' | null = null;

function broadcastEvent(event: HeartbeatEvent | PortfolioHeartbeatEvent | AgentEvent) {
  broadcastSSE(event);
}

// GET — SSE stream of heartbeat events
export async function GET() {
  const encoder = new TextEncoder();
  let ctrl: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      ctrl = controller;
      addSSEClient(controller);

      // Send current status immediately — check both engines
      const singleEngine = getHeartbeatEngine();
      const portfolioEng = getPortfolioHeartbeatEngine();
      const anyEngine = portfolioEng ?? singleEngine;
      if (anyEngine) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'status',
            tick: 0,
            data: { ...anyEngine.getStatus(), mode: activeMode ?? 'single' },
            timestamp: Date.now(),
          })}\n\n`)
        );
      } else {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'status',
            tick: 0,
            data: { isRunning: false },
            timestamp: Date.now(),
          })}\n\n`)
        );
      }
    },
    cancel() {
      if (ctrl) removeSSEClient(ctrl);
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

// POST — Control heartbeat (start/stop/status/update)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'start': {
        // Guard: Phemex must be connected before starting any engine
        if (!isPhemexConfigured()) {
          return NextResponse.json(
            { error: 'PhemexClient not initialized. Connect to Phemex first.' },
            { status: 400 }
          );
        }

        const mode = body.mode ?? 'single';

        // Validate config ranges (CRIT-12: prevent unsafe values)
        const clamp = (v: unknown, min: number, max: number, def: number): number => {
          const n = Number(v);
          if (!isFinite(n)) return def;
          return Math.max(min, Math.min(max, n));
        };

        // Stop any existing engine first
        stopHeartbeatEngine();
        stopPortfolioHeartbeatEngine();

        if (mode === 'portfolio') {
          const portfolioConfig: PortfolioHeartbeatConfig = {
            symbols: Array.isArray(body.symbols) && body.symbols.length > 0
              ? body.symbols.slice(0, 30)
              : ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'],
            scanMode: body.scanMode === 'full_scan' ? 'full_scan' : 'watchlist',
            intervalMs: clamp(body.intervalMs, 15000, 600000, 60000),
            riskLevel: body.riskLevel ?? 'moderate',
            enableAutoTrade: body.enableAutoTrade ?? false,
            maxDailyLossPercent: clamp(body.maxDailyLossPercent, 1, 25, 5),
            stopAfterKill: body.stopAfterKill ?? true,
            maxPerTokenAllocationPercent: clamp(body.maxPerTokenAllocation, 5, 50, 25),
            maxTotalExposurePercent: clamp(body.maxTotalExposure, 20, 95, 80),
            maxOpenPositions: clamp(body.maxOpenPositions, 1, 15, 5),
            minCashReservePercent: clamp(body.minCashReserve, 5, 80, 20),
            fullScanTopN: clamp(body.fullScanTopN, 5, 50, 20),
            fullScanFilterMinVolume: clamp(body.fullScanFilterMinVolume, 10000, 1000000, 50000),
          };

          const engine = createPortfolioHeartbeatEngine(portfolioConfig);
          engine.onEvent((event) => broadcastEvent(event));

          // Start multi-agent orchestrator alongside the engine
          stopOrchestrator();
          const agentOrch = createOrchestrator(body.agentConfig);
          agentOrch.setWatchlist(portfolioConfig.symbols);
          agentOrch.onEvent((event) => broadcastEvent(event));
          await agentOrch.start();

          await engine.start();
          activeMode = 'portfolio';

          return NextResponse.json({
            success: true,
            mode: 'portfolio',
            message: `Portfolio autopilot started (${portfolioConfig.intervalMs / 1000}s, ${portfolioConfig.scanMode}, ${portfolioConfig.riskLevel}) with multi-agent intelligence`,
            config: portfolioConfig,
            agents: agentOrch.getStatus(),
          });
        }

        // Legacy single-symbol mode
        const config: HeartbeatConfig = {
          intervalMs: clamp(body.intervalMs, 15000, 600000, 60000),
          symbol: body.symbol ?? 'BTC/USDT:USDT',
          maxPositionPercent: clamp(body.maxPositionPercent, 1, 25, 5),
          riskLevel: body.riskLevel ?? 'moderate',
          enableAutoTrade: body.enableAutoTrade ?? false,
          maxDailyLossPercent: clamp(body.maxDailyLossPercent, 1, 25, 5),
          stopAfterKill: body.stopAfterKill ?? true,
        };

        const engine = createHeartbeatEngine(config);
        engine.onEvent((event) => broadcastEvent(event));
        await engine.start();
        activeMode = 'single';

        return NextResponse.json({
          success: true,
          mode: 'single',
          message: `Heartbeat started (${config.intervalMs / 1000}s interval, ${config.riskLevel} mode)`,
          config,
        });
      }

      case 'stop': {
        stopOrchestrator();
        stopHeartbeatEngine();
        stopPortfolioHeartbeatEngine();
        activeMode = null;
        broadcastEvent({
          type: 'status',
          tick: 0,
          data: { isRunning: false, status: 'stopped' },
          timestamp: Date.now(),
        });
        return NextResponse.json({ success: true, message: 'Autopilot stopped' });
      }

      case 'status': {
        const sEngine = getHeartbeatEngine();
        const pEngine = getPortfolioHeartbeatEngine();
        const running = pEngine ?? sEngine;
        const agentOrch = getOrchestrator();
        return NextResponse.json({
          isRunning: running?.isActive() ?? false,
          mode: activeMode,
          status: running?.getStatus() ?? null,
          agents: agentOrch?.getStatus() ?? null,
        });
      }

      case 'update': {
        const sEngine = getHeartbeatEngine();
        const pEngine = getPortfolioHeartbeatEngine();
        const running = pEngine ?? sEngine;
        if (!running) {
          return NextResponse.json({ error: 'No engine running' }, { status: 400 });
        }
        running.updateConfig(body.config ?? {});
        return NextResponse.json({ success: true, message: 'Config updated' });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[Heartbeat API] Error:', err);
    const msg = process.env.NODE_ENV === 'production' ? 'Internal server error' : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
