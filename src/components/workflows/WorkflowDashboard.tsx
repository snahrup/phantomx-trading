'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { ResearchWorkflowPanel } from './ResearchWorkflowPanel';
import { PaperTradingWorkflowPanel } from './PaperTradingWorkflowPanel';
import { LiveTradingWorkflowPanel } from './LiveTradingWorkflowPanel';
import type { OrchestratorState, OrchestratorEvent, WorkflowId } from '@/types/trading';

// ---------------------------------------------------------------------------
// SSE Hook — connects to /api/orchestrator SSE and dispatches to store
// ---------------------------------------------------------------------------

function useWorkflowSSE() {
  const setOrchestratorState = useTradingStore(s => s.setOrchestratorState);
  const addOrchestratorEvent = useTradingStore(s => s.addOrchestratorEvent);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/orchestrator');
    eventSourceRef.current = es;

    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'orchestrator_state' && data.state) {
          setOrchestratorState(data.state as OrchestratorState);
        } else if (data.type === 'orchestrator_event' && data.event) {
          addOrchestratorEvent(data.event as OrchestratorEvent);
          // Also update the state's workflow-specific data
          if (data.state) {
            setOrchestratorState(data.state as OrchestratorState);
          }
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [setOrchestratorState, addOrchestratorEvent]);
}

// ---------------------------------------------------------------------------
// WorkflowDashboard — Three-column grid
// ---------------------------------------------------------------------------

export function WorkflowDashboard() {
  useWorkflowSSE();

  const orchestratorState = useTradingStore(s => s.orchestratorState);
  const orchestratorEvents = useTradingStore(s => s.orchestratorEvents);
  const workflowToggles = useTradingStore(s => s.workflowToggles);
  const setWorkflowToggle = useTradingStore(s => s.setWorkflowToggle);
  const setOrchestratorState = useTradingStore(s => s.setOrchestratorState);

  const handleToggle = useCallback(async (workflow: WorkflowId, enabled: boolean) => {
    setWorkflowToggle(workflow, enabled);
    try {
      await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: enabled ? 'start_workflow' : 'stop_workflow',
          workflow,
        }),
      });
    } catch { /* network error */ }
  }, [setWorkflowToggle]);

  // Fetch status on mount (but do NOT auto-start — user must click Start)
  const statusChecked = useRef(false);
  useEffect(() => {
    if (!statusChecked.current) {
      statusChecked.current = true;
      fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      })
        .then(r => r.json())
        .then(data => { if (data.state) setOrchestratorState(data.state); })
        .catch(() => {});
    }
  }, [setOrchestratorState]);

  // Default states when orchestrator hasn't reported yet
  const defaultWorkflowState = (workflow: WorkflowId) => ({
    enabled: workflowToggles[workflow],
    status: 'idle' as const,
    currentObjective: '',
    currentStage: '',
    lastActivityAt: null,
    recentEvents: [] as OrchestratorEvent[],
    error: null,
  });

  const researchState = orchestratorState?.research ?? {
    ...defaultWorkflowState('research'),
    metrics: {
      totalScans: 0, totalDeepDives: 0, totalThesesGenerated: 0,
      activeFindings: 0, readyTheses: 0, currentCycle: null,
    },
  };

  const paperState = orchestratorState?.paper ?? {
    ...defaultWorkflowState('paper'),
    metrics: {
      totalTrades: 0, openTrades: 0, winRate: 0, profitFactor: 0,
      totalPnl: 0, currentEquity: 100000, thesesTested: 0, thesesValidated: 0,
    },
  };

  const liveState = orchestratorState?.live ?? {
    ...defaultWorkflowState('live'),
    metrics: {
      mode: null, isAutoTrading: false, tickCount: 0, openPositions: 0,
      dailyPnlPercent: 0, strategiesDeployed: 0, isKilled: false,
    },
  };

  // Split events by workflow
  const researchEvents = orchestratorEvents.filter(e => e.workflow === 'research');
  const paperEvents = orchestratorEvents.filter(e => e.workflow === 'paper');
  const liveEvents = orchestratorEvents.filter(e => e.workflow === 'live');

  const validationRecords = orchestratorState?.validationRecords ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-[var(--text)]">Autopilot</h2>
          <span className={`inline-flex items-center gap-1 text-xs ${orchestratorState?.isRunning ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
            <span className={`w-2 h-2 rounded-full ${orchestratorState?.isRunning ? 'bg-[var(--success)] animate-pulse' : 'bg-gray-500'}`} />
            {orchestratorState?.isRunning ? 'Active' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!orchestratorState?.isRunning ? (
            <button
              onClick={async () => {
                await fetch('/api/orchestrator', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'start' }),
                });
              }}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 hover:bg-[var(--success)]/30 transition-colors"
            >
              Start Orchestrator
            </button>
          ) : (
            <button
              onClick={async () => {
                await fetch('/api/orchestrator', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'stop' }),
                });
              }}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-[var(--danger)]/20 text-[var(--danger)] border border-[var(--danger)]/30 hover:bg-[var(--danger)]/30 transition-colors"
            >
              Stop All
            </button>
          )}
        </div>
      </div>

      {/* Three-column grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 p-3 overflow-auto">
        <ResearchWorkflowPanel
          state={researchState}
          events={researchEvents}
          validationRecords={validationRecords}
          onToggle={(enabled) => handleToggle('research', enabled)}
        />
        <PaperTradingWorkflowPanel
          state={paperState}
          events={paperEvents}
          onToggle={(enabled) => handleToggle('paper', enabled)}
        />
        <LiveTradingWorkflowPanel
          state={liveState}
          events={liveEvents}
          onToggle={(enabled) => handleToggle('live', enabled)}
        />
      </div>
    </div>
  );
}
