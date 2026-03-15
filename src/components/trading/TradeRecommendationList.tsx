'use client';

// ============================================================================
// PhantomX — Trade Recommendation List
// ============================================================================
// Polls Axon for Wave 5 completed trading issues, parses recommendation
// comments, and renders TradeRecommendationCards. Shows a count badge for
// pending recommendations and auto-refreshes every 10 seconds.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Bell, RefreshCw, Inbox } from 'lucide-react';
import { AxonClient, getAxonClient } from '@/lib/axon/client';
import { parseRecommendation } from '@/lib/axon/recommendation-parser';
import type { TradeRecommendation } from '@/lib/axon/recommendation-parser';
import type { AxonIssue } from '@/lib/axon/types';
import TradeRecommendationCard from './TradeRecommendationCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecommendationEntry {
  recommendation: TradeRecommendation;
  isNew: boolean;
  handled: boolean; // true after execute or reject
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TradeRecommendationList() {
  const [entries, setEntries] = useState<RecommendationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const entriesRef = useRef<RecommendationEntry[]>(entries);
  entriesRef.current = entries; // always keep ref in sync

  // -------------------------------------------------------------------------
  // Fetch recommendations from Axon
  // -------------------------------------------------------------------------

  const fetchRecommendations = useCallback(async () => {
    try {
      const axon: AxonClient = getAxonClient();

      // Fetch trading issues where wave >= 5 and not done
      const issuesResult = await axon.listIssues({ issue_type: 'trading' });
      if (!issuesResult.ok) {
        setError(issuesResult.error);
        return;
      }

      // Filter to issues with wave >= 5 and status not 'done' or 'cancelled'
      const eligibleIssues: AxonIssue[] = issuesResult.data.filter(
        (issue) =>
          issue.current_wave >= 5 &&
          issue.status !== 'done' &&
          issue.status !== 'cancelled',
      );

      const newEntries: RecommendationEntry[] = [];

      for (const issue of eligibleIssues) {
        // Fetch comments for this issue
        const commentsResult = await axon.getIssueComments(issue.id);
        if (!commentsResult.ok) continue;

        // Find recommendation comments (Wave 5)
        const recComments = commentsResult.data.filter(
          (c) => c.comment_type === 'recommendation' && (c.wave === 5 || c.wave === null),
        );

        for (const comment of recComments) {
          const rec = parseRecommendation(comment, issue);
          if (!rec) continue;

          // Unique key: issue ID + comment ID
          const key = `${issue.id}:${comment.id}`;
          const isNew = !isFirstLoadRef.current && !seenIdsRef.current.has(key);
          seenIdsRef.current.add(key);

          // Use ref to read current entries (avoids stale closure)
          const existingEntry = entriesRef.current.find(
            (e) => e.recommendation.issueId === issue.id,
          );
          const handled = existingEntry?.handled ?? false;

          newEntries.push({
            recommendation: rec,
            isNew,
            handled,
          });
        }
      }

      // Play notification sound on new recommendations (not on first load)
      if (!isFirstLoadRef.current && newEntries.some((e) => e.isNew)) {
        playNotificationSound();
      }

      isFirstLoadRef.current = false;
      setEntries(newEntries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch recommendations');
    } finally {
      setLoading(false);
    }
  }, []); // stable — uses refs instead of entries state

  // -------------------------------------------------------------------------
  // Notification sound
  // -------------------------------------------------------------------------

  const playNotificationSound = useCallback(() => {
    try {
      // Use Web Audio API for a subtle notification ping
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 880; // A5
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio not available — fail silently
    }
  }, []);

  // -------------------------------------------------------------------------
  // Polling lifecycle
  // -------------------------------------------------------------------------

  useEffect(() => {
    fetchRecommendations();

    intervalRef.current = setInterval(fetchRecommendations, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear "isNew" flag after 5 seconds
  useEffect(() => {
    const newOnes = entries.filter((e) => e.isNew);
    if (newOnes.length === 0) return;

    const timer = setTimeout(() => {
      setEntries((prev) =>
        prev.map((e) => (e.isNew ? { ...e, isNew: false } : e)),
      );
    }, 5000);

    return () => clearTimeout(timer);
  }, [entries]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleExecuted = useCallback(
    (issueId: string) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.recommendation.issueId === issueId ? { ...e, handled: true } : e,
        ),
      );
    },
    [],
  );

  const handleRejected = useCallback(
    (issueId: string) => {
      setEntries((prev) =>
        prev.map((e) =>
          e.recommendation.issueId === issueId ? { ...e, handled: true } : e,
        ),
      );
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const pendingCount = entries.filter((e) => !e.handled).length;
  const hasNew = entries.some((e) => e.isNew);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Bell className={`size-4 ${hasNew ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          <span>Axon Recommendations</span>
          {pendingCount > 0 && (
            <Badge className="bg-primary/20 text-primary text-[10px] px-1.5 py-0">
              {pendingCount}
            </Badge>
          )}
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchRecommendations();
          }}
          className="p-1 rounded hover:bg-accent transition-colors"
          title="Refresh now"
        >
          <RefreshCw className={`size-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Error */}
        {error && (
          <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="size-4 animate-spin mr-2" />
            <span className="text-sm">Checking Axon for recommendations...</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && entries.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="size-8 mb-3 opacity-40" />
            <p className="text-sm font-medium">No pending trade recommendations</p>
            <p className="text-xs mt-1 opacity-60">
              Axon Wave 5 completions will appear here
            </p>
          </div>
        )}

        {/* Recommendation cards */}
        {entries.map((entry) => (
          <TradeRecommendationCard
            key={`${entry.recommendation.issueId}:${entry.recommendation.commentId}`}
            recommendation={entry.recommendation}
            isNew={entry.isNew}
            onExecuted={() => handleExecuted(entry.recommendation.issueId)}
            onRejected={() => handleRejected(entry.recommendation.issueId)}
          />
        ))}
      </div>
    </div>
  );
}
