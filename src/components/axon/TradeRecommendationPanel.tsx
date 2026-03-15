'use client';

import { useCallback } from 'react';
import { useAxonStore } from '@/store/axon-store';
import {
  useTradeRecommendationStore,
  useOrderedRecommendations,
} from '@/store/trade-recommendation-store';
import TradeRecommendationCard from './TradeRecommendationCard';
import type { TradeRecommendation } from '@/lib/axon/recommendation-parser';
import { toast } from 'sonner';
import {
  Target, Zap, Loader2,
} from 'lucide-react';

// Auth header for the execute-recommendation API route. The server-side route
// checks X-PhantomX-Auth when PHANTOMX_EXECUTION_SECRET is set. The client
// reads the same secret via the NEXT_PUBLIC_ prefix so it's available in the browser.
const EXECUTION_AUTH_HEADERS: HeadersInit = (() => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.NEXT_PUBLIC_PHANTOMX_EXECUTION_SECRET;
  if (secret) headers['X-PhantomX-Auth'] = secret;
  return headers;
})();

// ============================================================================
// TradeRecommendationPanel
// ============================================================================
// Lists all tracked trade recommendations from Axon's Wave 5 pipeline.
// Each recommendation renders as a TradeRecommendationCard with approve/reject
// actions. Approve calls /api/execute-recommendation, reject updates Axon.
// ============================================================================

export default function TradeRecommendationPanel() {
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const recommendations = useOrderedRecommendations();
  const setStatus = useTradeRecommendationStore((s) => s.setStatus);

  // -------------------------------------------------------------------------
  // Approve & Execute — calls the dedicated API route
  // -------------------------------------------------------------------------
  const handleApprove = useCallback(async (rec: TradeRecommendation) => {
    setStatus(rec.commentId, 'executing');

    try {
      const res = await fetch('/api/execute-recommendation', {
        method: 'POST',
        headers: EXECUTION_AUTH_HEADERS,
        body: JSON.stringify({ recommendation: rec, action: 'execute' }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errMsg = data.error || `HTTP ${res.status}`;
        setStatus(rec.commentId, 'error', errMsg);
        toast.error(`Execution failed: ${errMsg}`);
        return;
      }

      setStatus(rec.commentId, 'approved');
      toast.success(`Trade executed: ${rec.symbol} ${rec.direction}`, {
        description: `Order ${data.orderId} filled at $${data.fillPrice?.toLocaleString() ?? 'market'}`,
      });

      // Show warning if TP orders failed
      if (data.warnings?.length) {
        for (const warning of data.warnings) {
          toast.warning(warning);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      setStatus(rec.commentId, 'error', errMsg);
      toast.error(`Execution failed: ${errMsg}`);
    }
  }, [setStatus]);

  // -------------------------------------------------------------------------
  // Reject — calls the dedicated API route with action: 'reject'
  // -------------------------------------------------------------------------
  const handleReject = useCallback(async (rec: TradeRecommendation) => {
    setStatus(rec.commentId, 'executing');

    try {
      const res = await fetch('/api/execute-recommendation', {
        method: 'POST',
        headers: EXECUTION_AUTH_HEADERS,
        body: JSON.stringify({ recommendation: rec, action: 'reject', reason: 'Rejected by operator via PhantomX UI' }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errMsg = data.error || `HTTP ${res.status}`;
        setStatus(rec.commentId, 'error', errMsg);
        toast.error(`Rejection failed: ${errMsg}`);
        return;
      }

      setStatus(rec.commentId, 'rejected');
      toast.info(`Trade rejected: ${rec.symbol} ${rec.direction}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      setStatus(rec.commentId, 'error', errMsg);
      toast.error(`Rejection failed: ${errMsg}`);
    }
  }, [setStatus]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!daemonOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Target className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">Axon daemon offline</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Start the daemon to receive trade signals</p>
      </div>
    );
  }

  const pending = recommendations.filter((r) => r.status === 'pending');
  const others = recommendations.filter((r) => r.status !== 'pending');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Trade Signals</span>
          {pending.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-1.5 py-0.5">
              <Zap className="w-2.5 h-2.5" />
              {pending.length}
            </span>
          )}
        </div>
      </div>

      {/* Recommendations list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="w-8 h-8 text-muted-foreground/20 mb-2" strokeWidth={1} />
            <p className="text-xs text-muted-foreground">No trade signals yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Signals appear when Axon completes a Wave 5 pipeline
            </p>
          </div>
        ) : (
          <>
            {/* Pending recommendations first */}
            {pending.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-amber-400/20" />
                  <span className="text-[9px] text-amber-400 uppercase tracking-widest font-medium">
                    Awaiting Decision ({pending.length})
                  </span>
                  <div className="flex-1 h-px bg-amber-400/20" />
                </div>
                {pending.map((tracked) => (
                  <TradeRecommendationCard
                    key={tracked.recommendation.commentId}
                    recommendation={tracked.recommendation}
                    status={tracked.status}
                    error={tracked.error}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            )}

            {/* Non-pending (executed, rejected, etc.) */}
            {others.length > 0 && (
              <div className="space-y-2">
                {pending.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[9px] text-muted-foreground uppercase tracking-widest">
                      History ({others.length})
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {others.map((tracked) => (
                  <TradeRecommendationCard
                    key={tracked.recommendation.commentId}
                    recommendation={tracked.recommendation}
                    status={tracked.status}
                    error={tracked.error}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
