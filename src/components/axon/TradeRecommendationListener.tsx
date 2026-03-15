'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAxonStore } from '@/store/axon-store';
import { getAxonClient } from '@/lib/axon/client';
import { parseRecommendation } from '@/lib/axon/recommendation-parser';
import type { TradeRecommendation } from '@/lib/axon/recommendation-parser';
import { useTradeRecommendationStore } from '@/store/trade-recommendation-store';
import { toast } from 'sonner';

// ============================================================================
// TradeRecommendationListener
// ============================================================================
// Renders no UI -- listens for completed Wave 5 trading issues in the Axon
// store, fetches their comments, parses recommendation comments, and stores
// parsed TradeRecommendation objects in the trade-recommendation store.
//
// Triggers a toast notification when a new recommendation arrives.
// ============================================================================

export default function TradeRecommendationListener() {
  const issues = useAxonStore((s) => s.issues);
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const addRecommendation = useTradeRecommendationStore((s) => s.addRecommendation);
  const hasRecommendation = useTradeRecommendationStore((s) => s.hasRecommendation);

  // Track which issue IDs we've already processed to avoid re-fetching
  const processedRef = useRef<Set<string>>(new Set());

  const processIssue = useCallback(async (issue: typeof issues[number]) => {
    if (processedRef.current.has(issue.id)) return;
    processedRef.current.add(issue.id);

    try {
      const result = await getAxonClient().getIssueComments(issue.id);
      if (!result.ok) return;

      const comments = result.data;

      for (const comment of comments) {
        // Only process recommendation-type comments
        if (comment.comment_type !== 'recommendation') continue;

        // Skip if we already have this recommendation
        if (hasRecommendation(comment.id)) continue;

        const rec = parseRecommendation(comment, issue);
        if (!rec) continue;

        addRecommendation(rec);

        // Notify
        toast.info(`New trade signal: ${rec.symbol} ${rec.direction}`, {
          description: `${rec.strategy} | ${rec.confidence} confidence | R:R ${rec.riskRewardRatio}:1`,
          duration: 8000,
        });
      }
    } catch (err) {
      console.error('[TradeRecommendationListener] Failed to fetch comments for issue:', issue.id, err);
    }
  }, [addRecommendation, hasRecommendation]);

  useEffect(() => {
    if (!daemonOnline) return;

    // Find trading issues at Wave 5+ that are done
    const wave5Issues = issues.filter(
      (i) =>
        i.issue_type === 'trading' &&
        i.status === 'done' &&
        i.current_wave >= 5,
    );

    for (const issue of wave5Issues) {
      processIssue(issue);
    }
  }, [issues, daemonOnline, processIssue]);

  // This component renders no UI
  return null;
}
