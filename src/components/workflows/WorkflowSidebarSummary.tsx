'use client';

import { useTradingStore } from '@/store/trading-store';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WorkflowStatus } from '@/types/trading';

const statusDot: Record<WorkflowStatus, string> = {
  idle: 'bg-gray-500',
  running: 'bg-[var(--success)] animate-pulse',
  paused: 'bg-[var(--warning)]',
  error: 'bg-[var(--danger)] animate-pulse',
};

interface WorkflowRowProps {
  label: string;
  icon: string;
  status: WorkflowStatus;
  enabled: boolean;
  kpi1: { label: string; value: string | number };
  kpi2: { label: string; value: string | number };
}

function WorkflowRow({ label, icon, status, enabled, kpi1, kpi2 }: WorkflowRowProps) {
  return (
    <div className={cn('flex items-center gap-2 py-2 px-2 rounded-lg bg-white/5', !enabled && 'opacity-50')}>
      <span className="text-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot[status])} />
          <span className="text-xs font-semibold text-[var(--text)] uppercase">{label}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-[var(--text-muted)]">{kpi1.label}: <span className="text-[var(--text)]">{kpi1.value}</span></span>
          <span className="text-[10px] text-[var(--text-muted)]">{kpi2.label}: <span className="text-[var(--text)]">{kpi2.value}</span></span>
        </div>
      </div>
    </div>
  );
}

export function WorkflowSidebarSummary() {
  const orchestratorState = useTradingStore(s => s.orchestratorState);
  const workflowToggles = useTradingStore(s => s.workflowToggles);
  const setViewMode = useTradingStore(s => s.setViewMode);

  const research = orchestratorState?.research;
  const paper = orchestratorState?.paper;
  const live = orchestratorState?.live;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-[var(--text)] uppercase tracking-wider">Autopilot</h4>
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px]',
            orchestratorState?.isRunning ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', orchestratorState?.isRunning ? 'bg-[var(--success)] animate-pulse' : 'bg-gray-500')} />
            {orchestratorState?.isRunning ? 'Active' : 'Off'}
          </span>
        </div>
        <button
          onClick={() => setViewMode('intelligence')}
          className="text-[10px] text-[var(--highlight)] hover:underline"
        >
          Full View
        </button>
      </div>

      <WorkflowRow
        label="Research"
        icon="&#x1F50D;"
        status={research?.status ?? 'idle'}
        enabled={workflowToggles.research}
        kpi1={{ label: 'Scans', value: research?.metrics.totalScans ?? 0 }}
        kpi2={{ label: 'Theses', value: research?.metrics.totalThesesGenerated ?? 0 }}
      />

      <WorkflowRow
        label="Paper"
        icon="&#x1F4B0;"
        status={paper?.status ?? 'idle'}
        enabled={workflowToggles.paper}
        kpi1={{ label: 'WR', value: `${((paper?.metrics.winRate ?? 0) * 100).toFixed(0)}%` }}
        kpi2={{ label: 'Equity', value: `$${(paper?.metrics.currentEquity ?? 100000).toLocaleString(undefined, { maximumFractionDigits: 0 })}` }}
      />

      <WorkflowRow
        label="Live"
        icon="&#x26A1;"
        status={live?.status ?? 'idle'}
        enabled={workflowToggles.live}
        kpi1={{ label: 'Ticks', value: live?.metrics.tickCount ?? 0 }}
        kpi2={{ label: 'PnL', value: `${(live?.metrics.dailyPnlPercent ?? 0).toFixed(1)}%` }}
      />
    </div>
  );
}
