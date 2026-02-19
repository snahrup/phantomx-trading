'use client';

import { useTradingStore } from '@/store/trading-store';
import { WorkflowPanelShell } from './WorkflowPanelShell';
import { EventFeed } from './shared/EventFeed';
import { WorkflowKPIStrip, type KPIItem } from './shared/WorkflowKPIStrip';
import { ThesisCard } from './shared/ThesisCard';
import type { WorkflowState, ResearchWorkflowMetrics, OrchestratorEvent, ThesisValidationRecord } from '@/types/trading';

interface ResearchWorkflowPanelProps {
  state: WorkflowState & { metrics: ResearchWorkflowMetrics };
  events: OrchestratorEvent[];
  validationRecords: ThesisValidationRecord[];
  onToggle: (enabled: boolean) => void;
}

export function ResearchWorkflowPanel({
  state,
  events,
  validationRecords,
  onToggle,
}: ResearchWorkflowPanelProps) {
  const tradingTheses = useTradingStore(s => s.tradingTheses);
  const topOpportunities = useTradingStore(s => s.topOpportunities);

  const kpis: KPIItem[] = [
    { label: 'Scans', value: state.metrics.totalScans },
    { label: 'Deep Dives', value: state.metrics.totalDeepDives },
    { label: 'Theses', value: state.metrics.totalThesesGenerated },
    { label: 'Findings', value: state.metrics.activeFindings },
    {
      label: 'Cycle',
      value: state.metrics.currentCycle?.replace('_', ' ') || 'idle',
      color: state.metrics.currentCycle ? 'warning' : 'default',
    },
  ];

  const testingRecords = validationRecords.filter(r => r.status === 'testing');
  const validatedRecords = validationRecords.filter(r => r.status === 'validated');

  return (
    <WorkflowPanelShell
      title="Research"
      icon={<span>&#x1F50D;</span>}
      enabled={state.enabled}
      status={state.status}
      objective={state.currentObjective}
      onToggle={onToggle}
    >
      <div className="flex flex-col gap-3 p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {/* KPIs */}
        <WorkflowKPIStrip items={kpis} />

        {/* Top Opportunities */}
        {topOpportunities.length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
              Top Opportunities
            </h4>
            <div className="space-y-1">
              {topOpportunities.slice(0, 3).map((opp) => (
                <div key={opp.symbol} className="flex items-center justify-between py-1 px-2 rounded bg-white/5 text-xs">
                  <span className="font-semibold text-[var(--text)]">{opp.symbol}</span>
                  <span className="text-[var(--text-muted)]">{opp.direction}</span>
                  <span className="text-[var(--highlight)] tabular-nums">{opp.confidence}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validated Theses awaiting promotion */}
        {validatedRecords.length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--success)] font-semibold mb-1.5">
              Ready for Promotion
            </h4>
            {validatedRecords.map(r => (
              <ThesisCard
                key={r.id}
                record={r}
                onApprove={async (thesisId) => {
                  await fetch('/api/orchestrator', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'approve_promotion', thesisId }),
                  });
                }}
              />
            ))}
          </div>
        )}

        {/* Testing Theses */}
        {testingRecords.length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
              Under Validation ({testingRecords.length})
            </h4>
            <div className="space-y-2">
              {testingRecords.slice(0, 5).map(r => (
                <ThesisCard key={r.id} record={r} />
              ))}
            </div>
          </div>
        )}

        {/* Active Theses from store */}
        {tradingTheses.length > 0 && (
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
              Active Theses ({tradingTheses.length})
            </h4>
            <div className="space-y-1">
              {tradingTheses.slice(0, 5).map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1 px-2 rounded bg-white/5 text-xs">
                  <span className="font-semibold">{t.symbol}</span>
                  <span className={t.direction === 'long' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                    {t.direction}
                  </span>
                  <span className="text-[var(--text-muted)] tabular-nums">{t.confidence}%</span>
                  <span className="text-[9px] uppercase text-[var(--text-muted)]">{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event Feed */}
        <div>
          <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold mb-1.5">
            Event Feed
          </h4>
          <EventFeed events={events} maxHeight="200px" />
        </div>
      </div>
    </WorkflowPanelShell>
  );
}
