'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { ThesisValidationRecord } from '@/types/trading';

interface ThesisCardProps {
  record: ThesisValidationRecord;
  onApprove?: (thesisId: string) => void;
  className?: string;
}

const statusColors: Record<string, string> = {
  testing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  validated: 'bg-[var(--success)]/20 text-[var(--success)] border-[var(--success)]/30',
  promoted: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  rejected: 'bg-[var(--danger)]/20 text-[var(--danger)] border-[var(--danger)]/30',
};

export function ThesisCard({ record, onApprove, className }: ThesisCardProps) {
  const winRatePercent = (record.winRate * 100).toFixed(1);
  const isPositive = record.avgPnlPercent >= 0;

  return (
    <div className={cn(
      'rounded-lg border border-white/10 bg-white/5 p-3 space-y-2',
      className
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-[var(--text)]">{record.symbol}</span>
          <Badge variant="outline" className={cn(
            'text-[9px] uppercase',
            record.direction === 'long' ? 'text-[var(--success)] border-[var(--success)]/30' : 'text-[var(--danger)] border-[var(--danger)]/30'
          )}>
            {record.direction}
          </Badge>
        </div>
        <Badge variant="outline" className={cn('text-[9px] uppercase', statusColors[record.status])}>
          {record.status}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase">Trades</div>
          <div className="text-xs font-semibold tabular-nums">{record.totalTrades}</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase">Win Rate</div>
          <div className={cn('text-xs font-semibold tabular-nums', Number(winRatePercent) >= 55 ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
            {winRatePercent}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase">PF</div>
          <div className={cn('text-xs font-semibold tabular-nums', record.profitFactor >= 1.3 ? 'text-[var(--success)]' : 'text-[var(--warning)]')}>
            {record.profitFactor.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className={cn('tabular-nums', isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]')}>
          Avg PnL: {isPositive ? '+' : ''}{record.avgPnlPercent.toFixed(2)}%
        </span>
        <span className="text-[var(--text-muted)]">
          DD: {record.maxDrawdownPercent.toFixed(1)}%
        </span>
      </div>

      {record.status === 'validated' && onApprove && (
        <button
          onClick={() => onApprove(record.thesisId)}
          className="w-full mt-1 px-3 py-1.5 rounded text-xs font-semibold bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/30 hover:bg-[var(--success)]/30 transition-colors"
        >
          Promote to Live
        </button>
      )}

      {record.rejectedReason && (
        <p className="text-[10px] text-[var(--danger)] mt-1">{record.rejectedReason}</p>
      )}
    </div>
  );
}
