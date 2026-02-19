// ============================================================================
// PhantomX — BM25 Agent Memory System
// ============================================================================
// Port of TradingAgents' FinancialSituationMemory.
// Stores (situation, decision, outcome) tuples in SQLite.
// Uses BM25 text similarity to recall past similar situations.
// Syncs important lessons to Nexus shared memory for cross-project use.
// ============================================================================

import { db } from '@/lib/db';
import type { AgentMemory } from '@/lib/db';

// ---------------------------------------------------------------------------
// BM25 implementation — lightweight, zero dependencies
// ---------------------------------------------------------------------------

/** Tokenize text: lowercase, split on non-alpha, remove stopwords, stem naively */
function tokenize(text: string): string[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this',
    'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she',
    'they', 'them', 'their', 'what', 'which', 'who', 'whom',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopwords.has(t));
}

/** Compute term frequencies for a token list */
function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

/**
 * BM25 scoring against a corpus of documents.
 * k1 = 1.5, b = 0.75 (standard BM25 params).
 */
function bm25Score(
  queryTokens: string[],
  documents: Array<{ tokens: string[]; tf: Map<string, number> }>,
): number[] {
  const k1 = 1.5;
  const b = 0.75;
  const N = documents.length;
  if (N === 0) return [];

  // Average document length
  const avgDl = documents.reduce((sum, d) => sum + d.tokens.length, 0) / N;

  // IDF for each query term
  const idf = new Map<string, number>();
  const queryTf = termFrequencies(queryTokens);

  for (const term of queryTf.keys()) {
    // Count docs containing this term
    let df = 0;
    for (const doc of documents) {
      if (doc.tf.has(term)) df++;
    }
    // BM25 IDF: log((N - df + 0.5) / (df + 0.5) + 1)
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  // Score each document
  return documents.map(doc => {
    let score = 0;
    const dl = doc.tokens.length;

    for (const [term, termIdf] of idf) {
      const f = doc.tf.get(term) ?? 0;
      if (f === 0) continue;
      const numerator = f * (k1 + 1);
      const denominator = f + k1 * (1 - b + b * (dl / avgDl));
      score += termIdf * (numerator / denominator);
    }

    return score;
  });
}

// ---------------------------------------------------------------------------
// AgentMemorySystem — manages per-role memory with BM25 recall
// ---------------------------------------------------------------------------

export class AgentMemorySystem {
  private agentRole: string;

  constructor(agentRole: string) {
    this.agentRole = agentRole;
  }

  /**
   * Store a situation + decision. Outcome can be added later via reflect().
   */
  remember(situation: string, decision: string, outcome?: string): string {
    const tokens = tokenize(situation).join(' ');
    return db.agentMemories.save({
      agentRole: this.agentRole,
      situation,
      decision,
      outcome,
      tokens,
    });
  }

  /**
   * Recall the N most similar past situations using BM25 text similarity.
   */
  recall(currentSituation: string, n = 5): AgentMemory[] {
    const allMemories = db.agentMemories.getAllForSearch(this.agentRole);
    if (allMemories.length === 0) return [];

    const queryTokens = tokenize(currentSituation);
    if (queryTokens.length === 0) return allMemories.slice(0, n);

    // Build document corpus from stored tokens (or re-tokenize)
    const documents = allMemories.map(mem => {
      const tokens = mem.tokens
        ? mem.tokens.split(' ').filter(Boolean)
        : tokenize(mem.situation);
      return { tokens, tf: termFrequencies(tokens) };
    });

    const scores = bm25Score(queryTokens, documents);

    // Pair scores with memories and sort descending
    const scored = allMemories
      .map((mem, i) => ({ mem, score: scores[i] }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, n).map(s => s.mem);
  }

  /**
   * Post-trade reflection: update an existing memory with outcome + lesson.
   */
  reflect(memoryId: string, outcome: string, lesson?: string): void {
    db.agentMemories.updateOutcome(memoryId, outcome, lesson);
  }

  /**
   * Generate a formatted context block of past similar situations
   * for injection into agent prompts.
   */
  recallForPrompt(currentSituation: string, n = 3): string {
    const memories = this.recall(currentSituation, n);
    if (memories.length === 0) return '';

    const blocks = memories.map((m, i) => {
      const parts = [
        `### Past Situation ${i + 1} (${new Date(m.createdAt).toISOString().slice(0, 10)})`,
        `**Context:** ${m.situation.slice(0, 500)}${m.situation.length > 500 ? '...' : ''}`,
        `**Decision:** ${m.decision.slice(0, 300)}`,
      ];
      if (m.outcome) parts.push(`**Outcome:** ${m.outcome.slice(0, 300)}`);
      if (m.lesson) parts.push(`**Lesson:** ${m.lesson}`);
      return parts.join('\n');
    });

    return `## PAST SIMILAR SITUATIONS (from memory)\n${blocks.join('\n\n')}`;
  }
}

// ---------------------------------------------------------------------------
// Cross-role memory search — for judges/managers who need full context
// ---------------------------------------------------------------------------

export function recallAcrossRoles(
  situation: string,
  roles: string[],
  nPerRole = 2,
): AgentMemory[] {
  const results: AgentMemory[] = [];
  for (const role of roles) {
    const mem = new AgentMemorySystem(role);
    results.push(...mem.recall(situation, nPerRole));
  }
  // Deduplicate by id and sort by recency
  const seen = new Set<string>();
  return results
    .filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------------------------------------------------------------------------
// Nexus Sync — push important decisions/lessons to shared memory
// ---------------------------------------------------------------------------

const NEXUS_URL = 'http://localhost:3777';

export async function syncToNexus(
  category: 'decision' | 'discovery' | 'pattern' | 'fact',
  key: string,
  value: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${NEXUS_URL}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        key,
        value,
        sourceProject: 'PhantomX',
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    // Nexus may not be running — non-fatal
    return false;
  }
}

/**
 * After a pipeline completes, sync the final decision to Nexus
 * so other sessions/projects can reference it.
 */
export async function syncPipelineResult(
  symbol: string,
  decision: string,
  confidence: number,
  keyInsights: string[],
): Promise<void> {
  const key = `trade-decision-${symbol.replace(/[/:]/g, '-').toLowerCase()}-${Date.now()}`;
  const value = [
    `Symbol: ${symbol}`,
    `Decision: ${decision}`,
    `Confidence: ${confidence}%`,
    `Insights:`,
    ...keyInsights.map(i => `  - ${i}`),
    `Timestamp: ${new Date().toISOString()}`,
  ].join('\n');

  await syncToNexus('decision', key, value);
}

/**
 * Sync a learned lesson to Nexus discovery memory.
 */
export async function syncLesson(
  agentRole: string,
  lesson: string,
): Promise<void> {
  const key = `trading-lesson-${agentRole}-${Date.now()}`;
  await syncToNexus('discovery', key, `[${agentRole}] ${lesson}`);
}

// ---------------------------------------------------------------------------
// Convenience: get all memories formatted for a reflection prompt
// ---------------------------------------------------------------------------

export function getAllMemoriesForReflection(role: string): string {
  const memories = db.agentMemories.getByRole(role, 50);
  if (memories.length === 0) return 'No past memories for this role.';

  return memories.map(m => {
    const parts = [
      `- [${new Date(m.createdAt).toISOString().slice(0, 10)}] Decision: ${m.decision.slice(0, 200)}`,
    ];
    if (m.outcome) parts.push(`  Outcome: ${m.outcome.slice(0, 200)}`);
    if (m.lesson) parts.push(`  Lesson: ${m.lesson}`);
    return parts.join('\n');
  }).join('\n');
}
