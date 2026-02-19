'use client';

import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { WorkflowStatus } from '@/types/trading';

interface WorkflowPanelShellProps {
  title: string;
  icon: React.ReactNode;
  enabled: boolean;
  status: WorkflowStatus;
  objective: string;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

const statusConfig: Record<WorkflowStatus, { label: string; color: string; pulse: boolean }> = {
  idle: { label: 'IDLE', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', pulse: false },
  running: { label: 'RUNNING', color: 'bg-[var(--success)]/20 text-[var(--success)] border-[var(--success)]/30', pulse: true },
  paused: { label: 'PAUSED', color: 'bg-[var(--warning)]/20 text-[var(--warning)] border-[var(--warning)]/30', pulse: false },
  error: { label: 'ERROR', color: 'bg-[var(--danger)]/20 text-[var(--danger)] border-[var(--danger)]/30', pulse: true },
};

export function WorkflowPanelShell({
  title,
  icon,
  enabled,
  status,
  objective,
  onToggle,
  children,
  className,
}: WorkflowPanelShellProps) {
  const sc = statusConfig[status];

  return (
    <div className={cn(
      'flex flex-col rounded-xl border border-white/10 bg-[var(--card-bg)] backdrop-blur-sm overflow-hidden',
      !enabled && 'opacity-60',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <span className="text-base">{icon}</span>
          <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">{title}</h3>
          <Badge variant="outline" className={cn('text-[9px] uppercase', sc.color)}>
            {sc.pulse && (
              <span className="w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
            )}
            {sc.label}
          </Badge>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          className="data-[state=checked]:bg-[var(--highlight)]"
        />
      </div>

      {/* Objective */}
      {objective && enabled && (
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Current Objective</p>
          <p className="text-xs text-[var(--text)] leading-snug">{objective}</p>
        </div>
      )}

      {/* Content */}
      {enabled && (
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      )}

      {!enabled && (
        <div className="flex-1 flex items-center justify-center py-12 text-xs text-[var(--text-muted)]">
          Workflow disabled
        </div>
      )}
    </div>
  );
}
