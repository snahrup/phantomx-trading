'use client';

import { cn } from '@/lib/utils';
// TooltipProvider is rendered in app/layout.tsx (root layout), so Tooltip works globally.
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export type AgentStatusValue = 'idle' | 'working' | 'sleeping' | 'error' | 'paused';

interface AgentStatusDotProps {
  status: AgentStatusValue;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<AgentStatusValue, { color: string; label: string }> = {
  idle:     { color: 'bg-gray-400',    label: 'Idle' },
  working:  { color: 'bg-emerald-500', label: 'Working' },
  sleeping: { color: 'bg-blue-400/60', label: 'Sleeping' },
  error:    { color: 'bg-red-500',     label: 'Error' },
  paused:   { color: 'bg-yellow-500',  label: 'Paused' },
};

const SIZE_MAP: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

export default function AgentStatusDot({
  status,
  size = 'md',
  showTooltip = true,
  className,
}: AgentStatusDotProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  const sizeClass = SIZE_MAP[size];

  const dot = (
    <span className={cn('relative inline-flex', className)}>
      <span className={cn('rounded-full flex-shrink-0', config.color, sizeClass)} />
      {status === 'working' && (
        <span
          className={cn(
            'absolute inset-0 rounded-full animate-ping',
            config.color,
            'opacity-75',
          )}
        />
      )}
    </span>
  );

  if (!showTooltip) return dot;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {config.label}
      </TooltipContent>
    </Tooltip>
  );
}

export { STATUS_CONFIG };
