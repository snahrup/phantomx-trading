// ============================================================================
// PhantomX — Behavioral Intervention Logger
// ============================================================================
// Tracks every time the AI's behavioral learnings prevent, modify, or
// override a trade decision. Records outcomes so the AI can see its own
// intervention accuracy and improve over time.
// ============================================================================

export interface InterventionLog {
  id: string;
  timestamp: number;
  learningId: string;        // which knowledge entry triggered this
  patternTag: string;        // e.g. 'revenge-trading', 'fomo', 'cutting-winners'
  symbol: string;
  originalAction: string;    // what the AI wanted to do before intervention
  finalAction: string;       // what actually happened (hold, reduced size, etc.)
  wasOverridden: boolean;    // true = AI acknowledged pattern but traded anyway
  confidence: number;        // AI's confidence in the intervention match (0-100)
  reasoning: string;         // AI's explanation for matching/overriding
  outcome?: {
    pnl?: number;            // realized P&L if the trade completed
    wasCorrect?: boolean;    // was the intervention the right call?
    recordedAt: number;
  };
}

export interface InterventionSummary {
  totalInterventions: number;
  totalPrevented: number;
  totalOverridden: number;
  outcomeTracked: number;
  correctInterventions: number;
  incorrectInterventions: number;
  accuracy: number;          // % of tracked interventions that were correct
  topPatterns: Array<{
    tag: string;
    count: number;
    preventedCount: number;
  }>;
}

// In-memory ring buffer — survives for the session, not persisted to disk
// (learnings themselves are persisted in the knowledge base)
const MAX_LOGS = 200;
const interventionLogs: InterventionLog[] = [];

/**
 * Record a behavioral intervention event.
 */
export function logIntervention(input: Omit<InterventionLog, 'id' | 'timestamp'>): InterventionLog {
  const log: InterventionLog = {
    id: `intv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    ...input,
  };

  interventionLogs.push(log);

  // Trim to max size
  if (interventionLogs.length > MAX_LOGS) {
    interventionLogs.splice(0, interventionLogs.length - MAX_LOGS);
  }

  return log;
}

/**
 * Record the outcome of a previous intervention (after the trade closes).
 */
export function recordOutcome(
  interventionId: string,
  outcome: { pnl?: number; wasCorrect: boolean }
): boolean {
  const log = interventionLogs.find(l => l.id === interventionId);
  if (!log) return false;

  log.outcome = {
    ...outcome,
    recordedAt: Date.now(),
  };
  return true;
}

/**
 * Get all intervention logs (newest first).
 */
export function getInterventionLogs(): InterventionLog[] {
  return [...interventionLogs].reverse();
}

/**
 * Generate a prompt-ready summary of intervention accuracy.
 * Injected into heartbeat prompts so the AI can calibrate.
 */
export function getInterventionSummary(): string {
  if (interventionLogs.length === 0) {
    return '  No behavioral interventions recorded this session.';
  }

  const total = interventionLogs.length;
  const prevented = interventionLogs.filter(l => !l.wasOverridden).length;
  const overridden = total - prevented;
  const withOutcome = interventionLogs.filter(l => l.outcome != null);
  const correct = withOutcome.filter(l => l.outcome!.wasCorrect).length;
  const incorrect = withOutcome.length - correct;
  const accuracy = withOutcome.length > 0
    ? Math.round((correct / withOutcome.length) * 100)
    : 0;

  // Aggregate by pattern tag
  const patternMap = new Map<string, { count: number; preventedCount: number }>();
  for (const log of interventionLogs) {
    const existing = patternMap.get(log.patternTag) ?? { count: 0, preventedCount: 0 };
    existing.count++;
    if (!log.wasOverridden) existing.preventedCount++;
    patternMap.set(log.patternTag, existing);
  }
  const topPatterns = [...patternMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const lines: string[] = [
    `  Session interventions: ${total} total (${prevented} prevented, ${overridden} overridden)`,
  ];

  if (withOutcome.length > 0) {
    lines.push(`  Outcome tracking: ${correct}/${withOutcome.length} correct (${accuracy}% accuracy)`);
  }

  if (topPatterns.length > 0) {
    lines.push('  Top patterns matched:');
    for (const [tag, stats] of topPatterns) {
      lines.push(`    - ${tag}: ${stats.count}x (${stats.preventedCount} prevented)`);
    }
  }

  return lines.join('\n');
}

/**
 * Get structured summary (for programmatic use).
 */
export function getInterventionStats(): InterventionSummary {
  const total = interventionLogs.length;
  const prevented = interventionLogs.filter(l => !l.wasOverridden).length;
  const overridden = total - prevented;
  const withOutcome = interventionLogs.filter(l => l.outcome != null);
  const correct = withOutcome.filter(l => l.outcome!.wasCorrect).length;
  const incorrect = withOutcome.length - correct;
  const accuracy = withOutcome.length > 0
    ? Math.round((correct / withOutcome.length) * 100)
    : 0;

  const patternMap = new Map<string, { count: number; preventedCount: number }>();
  for (const log of interventionLogs) {
    const existing = patternMap.get(log.patternTag) ?? { count: 0, preventedCount: 0 };
    existing.count++;
    if (!log.wasOverridden) existing.preventedCount++;
    patternMap.set(log.patternTag, existing);
  }

  return {
    totalInterventions: total,
    totalPrevented: prevented,
    totalOverridden: overridden,
    outcomeTracked: withOutcome.length,
    correctInterventions: correct,
    incorrectInterventions: incorrect,
    accuracy,
    topPatterns: [...patternMap.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([tag, stats]) => ({ tag, ...stats })),
  };
}
