// ============================================================================
// PhantomX — Trade Recommendation Store (Zustand)
// ============================================================================
// Manages parsed trade recommendations from Axon's Wave 5 pipeline.
// Tracks status (pending / executing / approved / rejected / error) per
// recommendation, along with execution errors.
// ============================================================================

import { create } from 'zustand';
import type { TradeRecommendation } from '@/lib/axon/recommendation-parser';
import type { RecommendationStatus } from '@/components/axon/TradeRecommendationCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackedRecommendation {
  recommendation: TradeRecommendation;
  status: RecommendationStatus;
  error?: string;
  createdAt: number;
}

interface TradeRecommendationState {
  /** All tracked recommendations, keyed by commentId */
  recommendations: Map<string, TrackedRecommendation>;

  /** Ordered list of commentIds (newest first) */
  orderedIds: string[];

  // Actions
  addRecommendation: (rec: TradeRecommendation) => void;
  setStatus: (commentId: string, status: RecommendationStatus, error?: string) => void;
  hasRecommendation: (commentId: string) => boolean;
  removeRecommendation: (commentId: string) => void;
  clearAll: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTradeRecommendationStore = create<TradeRecommendationState>()(
  (set, get) => ({
    recommendations: new Map(),
    orderedIds: [],

    addRecommendation: (rec) => {
      const { recommendations, orderedIds } = get();
      if (recommendations.has(rec.commentId)) return; // Deduplicate

      const tracked: TrackedRecommendation = {
        recommendation: rec,
        status: 'pending',
        createdAt: Date.now(),
      };

      const next = new Map(recommendations);
      next.set(rec.commentId, tracked);

      set({
        recommendations: next,
        orderedIds: [rec.commentId, ...orderedIds],
      });
    },

    setStatus: (commentId, status, error) => {
      const { recommendations } = get();
      const existing = recommendations.get(commentId);
      if (!existing) return;

      const next = new Map(recommendations);
      next.set(commentId, { ...existing, status, error });
      set({ recommendations: next });
    },

    hasRecommendation: (commentId) => {
      return get().recommendations.has(commentId);
    },

    removeRecommendation: (commentId) => {
      const { recommendations, orderedIds } = get();
      const next = new Map(recommendations);
      next.delete(commentId);
      set({
        recommendations: next,
        orderedIds: orderedIds.filter((id) => id !== commentId),
      });
    },

    clearAll: () => {
      set({ recommendations: new Map(), orderedIds: [] });
    },
  }),
);

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export function useOrderedRecommendations(): TrackedRecommendation[] {
  const recommendations = useTradeRecommendationStore((s) => s.recommendations);
  const orderedIds = useTradeRecommendationStore((s) => s.orderedIds);

  return orderedIds
    .map((id) => recommendations.get(id))
    .filter((t): t is TrackedRecommendation => t !== undefined);
}

export function usePendingRecommendationCount(): number {
  const recommendations = useTradeRecommendationStore((s) => s.recommendations);
  let count = 0;
  for (const [, tracked] of recommendations) {
    if (tracked.status === 'pending') count++;
  }
  return count;
}
