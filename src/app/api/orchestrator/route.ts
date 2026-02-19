// ============================================================================
// PhantomX — Orchestrator API (SSE Events + Control)
// ============================================================================
// GET  — SSE stream of unified OrchestratorEvent (all three workflows merged)
// POST — Control: start, stop, start_workflow, stop_workflow, pause_workflow,
//        resume_workflow, approve_promotion, status, update_config
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getTradingOrchestrator,
  createTradingOrchestrator,
  stopTradingOrchestrator,
} from '@/lib/ai/trading-orchestrator';
import { addSSEClient, removeSSEClient } from '@/lib/sse-broadcast';
import type { WorkflowId } from '@/types/trading';

// ---------------------------------------------------------------------------
// GET — SSE stream
// ---------------------------------------------------------------------------

export async function GET() {
  const encoder = new TextEncoder();
  let ctrl: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      ctrl = controller;
      addSSEClient(controller);

      // Send current state immediately
      const orch = getTradingOrchestrator();
      const state = orch ? orch.getState() : null;
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'orchestrator_state',
          state,
          timestamp: Date.now(),
        })}\n\n`)
      );
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

// ---------------------------------------------------------------------------
// POST — Control actions
// ---------------------------------------------------------------------------

const VALID_WORKFLOWS: WorkflowId[] = ['research', 'paper', 'live'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // --- Orchestrator lifecycle ---

      case 'start': {
        let orch = getTradingOrchestrator();
        if (!orch) {
          orch = createTradingOrchestrator(body.config);
        }
        // Start is async and staggered — don't await the full startup
        // to avoid blocking the HTTP response for 20+ seconds
        orch.start().catch(err => {
          console.error('[Orchestrator API] Start error:', err);
        });
        return NextResponse.json({
          success: true,
          message: 'Trading orchestrator starting — workflows will initialize with staggered delay.',
          state: orch.getState(),
        });
      }

      case 'stop': {
        const orch = getTradingOrchestrator();
        if (orch) {
          await orch.stop();
        }
        stopTradingOrchestrator();
        return NextResponse.json({
          success: true,
          message: 'Trading orchestrator stopped.',
        });
      }

      case 'status': {
        const orch = getTradingOrchestrator();
        return NextResponse.json({
          isRunning: orch?.getState().isRunning ?? false,
          state: orch?.getState() ?? null,
        });
      }

      // --- Individual workflow control ---

      case 'start_workflow': {
        const workflow = body.workflow as WorkflowId;
        if (!VALID_WORKFLOWS.includes(workflow)) {
          return NextResponse.json(
            { error: `Invalid workflow: ${workflow}. Must be one of: ${VALID_WORKFLOWS.join(', ')}` },
            { status: 400 }
          );
        }
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json(
            { error: 'Orchestrator not running. Start it first.' },
            { status: 400 }
          );
        }
        await orch.startWorkflow(workflow);
        return NextResponse.json({
          success: true,
          message: `${workflow} workflow started.`,
          state: orch.getState(),
        });
      }

      case 'stop_workflow': {
        const workflow = body.workflow as WorkflowId;
        if (!VALID_WORKFLOWS.includes(workflow)) {
          return NextResponse.json(
            { error: `Invalid workflow: ${workflow}` },
            { status: 400 }
          );
        }
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json({ error: 'Orchestrator not running.' }, { status: 400 });
        }
        await orch.stopWorkflow(workflow);
        return NextResponse.json({
          success: true,
          message: `${workflow} workflow stopped.`,
          state: orch.getState(),
        });
      }

      case 'pause_workflow': {
        const workflow = body.workflow as WorkflowId;
        if (!VALID_WORKFLOWS.includes(workflow)) {
          return NextResponse.json(
            { error: `Invalid workflow: ${workflow}` },
            { status: 400 }
          );
        }
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json({ error: 'Orchestrator not running.' }, { status: 400 });
        }
        await orch.pauseWorkflow(workflow);
        return NextResponse.json({
          success: true,
          message: `${workflow} workflow paused.`,
          state: orch.getState(),
        });
      }

      case 'resume_workflow': {
        const workflow = body.workflow as WorkflowId;
        if (!VALID_WORKFLOWS.includes(workflow)) {
          return NextResponse.json(
            { error: `Invalid workflow: ${workflow}` },
            { status: 400 }
          );
        }
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json({ error: 'Orchestrator not running.' }, { status: 400 });
        }
        await orch.resumeWorkflow(workflow);
        return NextResponse.json({
          success: true,
          message: `${workflow} workflow resumed.`,
          state: orch.getState(),
        });
      }

      // --- Thesis promotion ---

      case 'approve_promotion': {
        const { thesisId } = body;
        if (!thesisId) {
          return NextResponse.json({ error: 'thesisId required.' }, { status: 400 });
        }
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json({ error: 'Orchestrator not running.' }, { status: 400 });
        }
        const promoted = await orch.approvePromotion(thesisId);
        return NextResponse.json({
          success: promoted,
          message: promoted
            ? `Thesis ${thesisId} promoted to live trading.`
            : `Thesis ${thesisId} not eligible for promotion (must be validated first).`,
          state: orch.getState(),
        });
      }

      // --- Config ---

      case 'update_config': {
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json({ error: 'Orchestrator not running.' }, { status: 400 });
        }
        orch.updateConfig(body.config ?? {});
        return NextResponse.json({
          success: true,
          message: 'Orchestrator config updated.',
          config: orch.getConfig(),
        });
      }

      // --- Events query ---

      case 'events': {
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json({ events: [] });
        }
        const events = orch.getRecentEvents(
          body.workflow as WorkflowId | undefined,
          body.count ?? 50
        );
        return NextResponse.json({ events });
      }

      case 'validations': {
        const orch = getTradingOrchestrator();
        if (!orch) {
          return NextResponse.json({ records: [] });
        }
        const records = orch.getValidationRecords(body.status);
        return NextResponse.json({ records });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error('[Orchestrator API] Error:', err);
    const msg = process.env.NODE_ENV === 'production' ? 'Internal server error' : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
