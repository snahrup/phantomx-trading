'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { OrchestratorEvent } from '@/types/trading';

interface ReasoningChainProps {
  events: OrchestratorEvent[];
  className?: string;
}

export function ReasoningChain({ events, className }: ReasoningChainProps) {
  const [expanded, setExpanded] = useState(false);
  const reasoningEvents = events.filter(e =>
    e.type === 'reasoning_step' || e.type === 'decision' || e.type === 'objective_update'
  );

  if (reasoningEvents.length === 0) {
    return null;
  }

  const shown = expanded ? reasoningEvents : reasoningEvents.slice(-3);

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          AI Reasoning
        </span>
        {reasoningEvents.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-[var(--highlight)] hover:underline"
          >
            {expanded ? 'Collapse' : `Show all (${reasoningEvents.length})`}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {shown.map((evt, i) => (
          <div key={evt.id} className="flex gap-2 text-[11px]">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={cn(
                'w-1.5 h-1.5 rounded-full mt-1.5',
                evt.type === 'decision' ? 'bg-amber-400' :
                evt.type === 'objective_update' ? 'bg-blue-400' : 'bg-purple-400'
              )} />
              {i < shown.length - 1 && (
                <div className="w-px flex-1 bg-white/10 mt-0.5" />
              )}
            </div>
            <div className="min-w-0 pb-1.5">
              <p className="text-[var(--text)] leading-snug">{evt.data.title}</p>
              {evt.data.detail && evt.data.detail !== evt.data.title && (
                <p className="text-[var(--text-muted)] leading-snug mt-0.5 line-clamp-2">
                  {evt.data.detail}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
