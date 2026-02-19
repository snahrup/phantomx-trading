'use client';

import { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { OrchestratorEvent } from '@/types/trading';

interface EventFeedProps {
  events: OrchestratorEvent[];
  maxHeight?: string;
  className?: string;
}

const typeColors: Record<string, string> = {
  objective_update: 'border-l-blue-400',
  reasoning_step: 'border-l-purple-400',
  finding: 'border-l-cyan-400',
  decision: 'border-l-amber-400',
  action: 'border-l-[var(--highlight)]',
  progress: 'border-l-[var(--text-muted)]',
  workflow_status: 'border-l-emerald-400',
  promotion: 'border-l-[var(--success)]',
  error: 'border-l-[var(--danger)]',
};

const typeLabels: Record<string, string> = {
  objective_update: 'OBJ',
  reasoning_step: 'THINK',
  finding: 'FIND',
  decision: 'DECIDE',
  action: 'ACT',
  progress: 'PROG',
  workflow_status: 'STATUS',
  promotion: 'PROMO',
  error: 'ERR',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function EventFeed({ events, maxHeight = '300px', className }: EventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-[var(--text-muted)] text-xs', className)}>
        Waiting for events...
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn('overflow-y-auto space-y-0.5 pr-1', className)}
      style={{ maxHeight }}
    >
      {events.map((evt) => (
        <div
          key={evt.id}
          className={cn(
            'border-l-2 pl-2 py-1 text-xs transition-colors',
            typeColors[evt.type] ?? 'border-l-gray-500'
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-[var(--text-muted)]">
              {formatTime(evt.timestamp)}
            </span>
            <span className={cn(
              'text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded',
              evt.data.severity === 'critical'
                ? 'bg-[var(--danger)]/20 text-[var(--danger)]'
                : evt.data.severity === 'warning'
                  ? 'bg-[var(--warning)]/20 text-[var(--warning)]'
                  : 'bg-white/5 text-[var(--text-muted)]'
            )}>
              {typeLabels[evt.type] ?? evt.type}
            </span>
            {evt.data.symbol && (
              <span className="text-[10px] font-semibold text-[var(--highlight)]">
                {evt.data.symbol}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text)] leading-snug mt-0.5">
            {evt.data.title}
          </p>
          {evt.data.detail && evt.data.detail !== evt.data.title && (
            <p className="text-[10px] text-[var(--text-muted)] leading-snug mt-0.5 line-clamp-2">
              {evt.data.detail}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
