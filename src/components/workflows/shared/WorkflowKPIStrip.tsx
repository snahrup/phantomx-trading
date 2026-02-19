'use client';

import { cn } from '@/lib/utils';

export interface KPIItem {
  label: string;
  value: string | number;
  color?: 'default' | 'success' | 'warning' | 'danger';
}

interface WorkflowKPIStripProps {
  items: KPIItem[];
  className?: string;
}

const colorMap = {
  default: 'text-[var(--text)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
};

export function WorkflowKPIStrip({ items, className }: WorkflowKPIStripProps) {
  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] whitespace-nowrap">
            {item.label}
          </span>
          <span className={cn(
            'text-xs font-semibold tabular-nums',
            colorMap[item.color ?? 'default']
          )}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}
