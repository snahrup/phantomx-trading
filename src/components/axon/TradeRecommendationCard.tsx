'use client';

// ============================================================================
// PhantomX — Trade Recommendation Card (Axon Sidebar version)
// ============================================================================
// Compact recommendation card with external state management (status comes
// via props from the trade-recommendation-store). Used by
// TradeRecommendationPanel in the sidebar "Signals" tab.
// The full-page version with editing and 2-step confirmation lives at
// components/trading/TradeRecommendationCard.tsx.
// ============================================================================

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { TradeRecommendation } from '@/lib/axon/recommendation-parser';
import {
  TrendingUp, TrendingDown, Shield, Target, DollarSign,
  CheckCircle2, XCircle, Edit3, Loader2, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationStatus = 'pending' | 'executing' | 'approved' | 'rejected' | 'error';

interface TradeRecommendationCardProps {
  recommendation: TradeRecommendation;
  status?: RecommendationStatus;
  error?: string;
  onApprove: (rec: TradeRecommendation) => Promise<void>;
  onReject: (rec: TradeRecommendation) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const priceFmt = (n: number) => `$${usdFmt.format(n)}`;

function confidenceColor(confidence: string): string {
  switch (confidence.toUpperCase()) {
    case 'HIGH': return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10';
    case 'MEDIUM': return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
    case 'LOW': return 'text-red-400 border-red-400/30 bg-red-400/10';
    default: return 'text-muted-foreground border-border';
  }
}

function statusAccent(status: RecommendationStatus): string {
  switch (status) {
    case 'pending': return 'border-amber-500/40';
    case 'executing': return 'border-blue-500/40';
    case 'approved': return 'border-emerald-500/40';
    case 'rejected': return 'border-red-500/40';
    case 'error': return 'border-red-500/40';
    default: return 'border-border';
  }
}

function statusBadge(status: RecommendationStatus) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="text-[9px] text-amber-400 border-amber-400/30 bg-amber-400/10">Pending</Badge>;
    case 'executing':
      return <Badge variant="outline" className="text-[9px] text-blue-400 border-blue-400/30 bg-blue-400/10"><Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" />Executing</Badge>;
    case 'approved':
      return <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-400/30 bg-emerald-400/10"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Executed</Badge>;
    case 'rejected':
      return <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/30 bg-red-400/10"><XCircle className="w-2.5 h-2.5 mr-0.5" />Rejected</Badge>;
    case 'error':
      return <Badge variant="outline" className="text-[9px] text-red-400 border-red-400/30 bg-red-400/10"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Error</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TradeRecommendationCard({
  recommendation: rec,
  status = 'pending',
  error,
  onApprove,
  onReject,
}: TradeRecommendationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = rec.direction === 'LONG';
  const DirectionIcon = isLong ? TrendingUp : TrendingDown;
  const isActionable = status === 'pending';

  return (
    <div className={cn(
      'rounded-lg border bg-card transition-all duration-200',
      statusAccent(status),
      isActionable && 'hover:shadow-md',
    )}>
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
          isLong ? 'bg-emerald-500/15' : 'bg-red-500/15',
        )}>
          <DirectionIcon className={cn('w-3.5 h-3.5', isLong ? 'text-emerald-400' : 'text-red-400')} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-foreground">{rec.symbol}</span>
            <Badge variant="outline" className={cn(
              'text-[9px] px-1 py-0',
              isLong ? 'text-emerald-400 border-emerald-400/30' : 'text-red-400 border-red-400/30',
            )}>
              {rec.direction}
            </Badge>
            <Badge variant="outline" className={cn('text-[9px] px-1 py-0', confidenceColor(rec.confidence))}>
              {rec.confidence}
            </Badge>
          </div>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{rec.strategy}</p>
        </div>

        {statusBadge(status)}

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Price levels (always visible) */}
      <div className="px-3 pb-2 grid grid-cols-3 gap-2">
        <div>
          <span className="text-[9px] text-muted-foreground block">Entry</span>
          <span className="text-[11px] font-mono font-medium text-foreground">{priceFmt(rec.entryPrice)}</span>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground block">Stop Loss</span>
          <span className="text-[11px] font-mono font-medium text-red-400">{priceFmt(rec.stopLoss)}</span>
        </div>
        <div>
          <span className="text-[9px] text-muted-foreground block">R:R</span>
          <span className="text-[11px] font-mono font-medium text-foreground">
            {rec.riskRewardRatio > 0 ? `${rec.riskRewardRatio}:1` : '--'}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
          {/* Take profit targets */}
          {rec.takeProfitTargets.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <Target className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Take Profit Targets</span>
              </div>
              <div className="space-y-0.5">
                {rec.takeProfitTargets.map((tp, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">TP{i + 1}</span>
                    <span className="font-mono text-emerald-400">{priceFmt(tp.price)}</span>
                    <span className="text-muted-foreground">{tp.closePercent}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Position sizing */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <DollarSign className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground">Notional</span>
              </div>
              <span className="text-[10px] font-mono text-foreground">{priceFmt(rec.positionSizeNotional)}</span>
            </div>
            <div>
              <span className="text-[9px] text-muted-foreground block">Margin</span>
              <span className="text-[10px] font-mono text-foreground">{priceFmt(rec.positionSizeMargin)}</span>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <Shield className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground">Leverage</span>
              </div>
              <span className="text-[10px] font-mono text-foreground">{rec.leverage}x</span>
            </div>
          </div>

          {/* Approvers */}
          {rec.approvedBy.length > 0 && (
            <div>
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider block mb-1">Approval Chain</span>
              <div className="flex flex-wrap gap-1">
                {rec.approvedBy.map((name, i) => (
                  <div key={i} className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Issue reference */}
          <div className="text-[9px] text-muted-foreground/60">
            Issue: {rec.issueTitle} ({rec.issueId.slice(0, 8)})
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="px-3 pb-2">
          <div className="flex items-start gap-1.5 p-2 rounded-md bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {isActionable && (
        <div className="px-3 pb-3 flex gap-2">
          <button
            onClick={() => onApprove(rec)}
            className="flex-1 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/25 transition-colors flex items-center justify-center gap-1"
          >
            <CheckCircle2 className="w-3 h-3" />
            Approve & Execute
          </button>
          <button
            onClick={() => onReject(rec)}
            className="py-1.5 px-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1"
          >
            <XCircle className="w-3 h-3" />
            Reject
          </button>
          <button
            disabled
            className="py-1.5 px-3 rounded-md bg-muted border border-border text-muted-foreground text-[11px] font-medium cursor-not-allowed opacity-50 flex items-center justify-center gap-1"
            title="Edit — coming soon"
          >
            <Edit3 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
