# Prism v2 — memU-Style Proactive Hierarchical Memory

**Author**: PhantomX session (handoff spec)
**Target repo**: `~/CascadeProjects/prism-v2`
**Date**: 2026-03-17
**Reference**: https://github.com/NevaMind-AI/memU.git

---

## Problem Statement

Prism v2's memory-agent already does background consolidation with temporal decay, importance scoring, and cross-referencing across 15 memory blocks. But the **context delivery model is still reactive** — when an agent needs context, it pulls from blocks/stores on demand. This means:

1. **Token waste**: Agents load full block contents even when only a subset is relevant to the current interaction
2. **No anticipation**: The system doesn't predict what context will be needed based on patterns (time of day, current app, conversation topic)
3. **Flat hierarchy**: Memory blocks are key-value with categories, but there's no extraction layer that distills raw interactions into reusable insights
4. **No proactive surfacing**: The memory-agent consolidates but doesn't push context to other agents ahead of need

memU's three-layer architecture (Resources → Items → Categories) with proactive assembly solves exactly this.

---

## Architecture: Three-Layer Memory for Prism

### Layer 1: Resources (Raw Data) — ALREADY EXISTS

Prism already captures this via:
- `session-store.ts` — transcript chunks, chat history, digests
- `memory-blocks.ts` — 15 structured blocks (meeting_context, screen_context, etc.)
- `observation-log.ts` — agent action audit trail

**No changes needed.** This is the raw substrate.

### Layer 2: Items (Extracted Knowledge) — NEW

A new extraction pipeline that runs inside `memory-agent.ts` during its 5-minute consolidation cycle. Transforms raw resources into discrete, typed knowledge items:

```typescript
// src/core/storage/knowledge-items.ts

interface KnowledgeItem {
  id: string;                    // uuid
  type: 'fact' | 'preference' | 'pattern' | 'relationship' | 'skill' | 'decision';
  content: string;               // compressed insight (1-3 sentences max)
  confidence: number;            // 0.0-1.0, increases with reinforcement
  importance: number;            // 0.0-1.0 with temporal decay (reuse existing decay fn)
  reinforcementCount: number;    // how many times this has been confirmed
  sourceRefs: string[];          // pointers to Layer 1 resources (block labels, session IDs)
  relatedItems: string[];        // cross-references to other items
  tags: string[];                // auto-generated topic tags
  createdAt: number;
  lastReinforced: number;
  lastAccessed: number;
}
```

**Item types map to Prism's domain:**

| Type | What it captures | Example |
|------|-----------------|---------|
| `fact` | Verified truths about Steve, his work, his environment | "Steve runs 5-7 Claude Code sessions simultaneously" |
| `preference` | Behavioral preferences learned from corrections | "Prefers terse responses, no trailing summaries" |
| `pattern` | Recurring temporal/behavioral patterns | "Checks Jira board every morning around 9am EST" |
| `relationship` | People, projects, and their connections | "Reports to leadership at IP Corp, works on Fabric/Power BI" |
| `skill` | Steve's known competencies and knowledge gaps | "Deep Go expertise, new to React frontend" |
| `decision` | Architectural/strategic decisions made | "Chose Zustand over Redux for all state management" |

**Extraction process** (runs in memory-agent cycle):
1. Scan new/modified block content since last cycle
2. Use Claude (via existing `query()` method) with a focused extraction prompt
3. Deduplicate against existing items (embedding similarity or tag overlap)
4. Reinforce existing items if repeated, create new ones if novel
5. Log all extractions to observation log

### Layer 3: Categories (Auto-Organized Topics) — NEW

Categories are emergent groupings of related Items, maintained automatically:

```typescript
// src/core/storage/knowledge-categories.ts

interface KnowledgeCategory {
  id: string;
  name: string;                  // e.g., "Trading Infrastructure", "Meeting Habits", "Design Preferences"
  description: string;           // 1-sentence summary
  itemIds: string[];             // member items
  salience: number;              // 0.0-1.0 — how active/relevant this category is right now
  lastActive: number;
  triggers: CategoryTrigger[];   // conditions that boost this category's salience
}

interface CategoryTrigger {
  type: 'time_of_day' | 'day_of_week' | 'app_detected' | 'keyword' | 'meeting_active' | 'block_updated';
  value: string;                 // e.g., "09:00-10:00", "Monday", "PowerBI", "jira"
  salienceBoost: number;         // 0.0-0.5
}
```

**Category formation**:
- Cluster items by tag similarity (simple cosine on tag vectors, no heavy ML needed)
- Merge categories with >70% item overlap
- Split categories with >30 items into subcategories
- Triggers learned from access patterns (if "Trading Infrastructure" items are always accessed during morning sessions, add a time trigger)

---

## Proactive Context Assembly — The Key Innovation

### ContextAssembler (new module)

Replaces the current pattern where agents pull blocks on demand. Instead, the assembler **pushes pre-built context packets** to agents before they need them.

```typescript
// src/core/agents/context-assembler.ts

interface ContextPacket {
  agentId: AgentId;
  sections: ContextSection[];    // reuses existing ContextSection type
  totalTokens: number;
  assembledAt: number;
  reason: string;                // why these items were selected
}

class ContextAssembler {
  constructor(
    private items: KnowledgeItemStore,
    private categories: KnowledgeCategoryStore,
    private budget: ContextBudget,
    private bus: AgentBus
  ) {}

  /**
   * Called on a 30-second interval. Evaluates current context signals
   * (time, active app, recent transcript, meeting state) and pre-assembles
   * context packets for each agent based on category salience.
   */
  async tick(): Promise<void> {
    const signals = this.gatherSignals();
    const boostedCategories = this.boostCategories(signals);

    for (const agent of this.getActiveAgents()) {
      const relevantItems = this.selectItems(agent, boostedCategories);
      const packet = this.buildPacket(agent, relevantItems);

      // Push to agent via bus — agent picks it up on next cycle
      this.bus.emit('context:assembled', packet);
    }
  }

  /**
   * Gather current environmental signals for salience boosting.
   */
  private gatherSignals(): ContextSignal[] {
    return [
      { type: 'time_of_day', value: getCurrentTimeSlot() },
      { type: 'day_of_week', value: getDayOfWeek() },
      { type: 'app_detected', value: this.getActiveApp() },       // from vision-agent
      { type: 'meeting_active', value: this.isMeetingActive() },   // from listener-agent
      { type: 'recent_topics', value: this.getRecentTopics() },    // from transcript
    ];
  }
}
```

### Integration with existing ContextBudget

The existing `ContextBudget` class handles token-aware assembly with priority trimming. The `ContextAssembler` feeds into it:

```
ContextAssembler (selects WHAT) → ContextBudget (manages HOW MUCH) → Agent prompt
```

The assembler selects items by salience. The budget trims by priority if over limit. This is a clean separation — no need to rewrite ContextBudget.

---

## Storage Schema

New tables in `memory.db` (alongside existing `memories` table):

```sql
CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('fact','preference','pattern','relationship','skill','decision')),
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  importance REAL NOT NULL DEFAULT 0.5,
  reinforcement_count INTEGER NOT NULL DEFAULT 1,
  source_refs TEXT NOT NULL DEFAULT '[]',     -- JSON array
  related_items TEXT NOT NULL DEFAULT '[]',   -- JSON array
  tags TEXT NOT NULL DEFAULT '[]',            -- JSON array
  created_at INTEGER NOT NULL,
  last_reinforced INTEGER NOT NULL,
  last_accessed INTEGER
);

CREATE TABLE knowledge_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  item_ids TEXT NOT NULL DEFAULT '[]',        -- JSON array
  salience REAL NOT NULL DEFAULT 0.0,
  last_active INTEGER NOT NULL,
  triggers TEXT NOT NULL DEFAULT '[]'         -- JSON array of CategoryTrigger
);

-- FTS5 for item search
CREATE VIRTUAL TABLE knowledge_items_fts USING fts5(
  content, tags,
  content=knowledge_items,
  content_rowid=rowid
);

-- Index for fast salience-based queries
CREATE INDEX idx_items_importance ON knowledge_items(importance DESC);
CREATE INDEX idx_items_type ON knowledge_items(type);
CREATE INDEX idx_categories_salience ON knowledge_categories(salience DESC);
```

---

## Implementation Plan

### Phase 1: Knowledge Item Store (2-3 sessions)
1. Create `src/core/storage/knowledge-items.ts` — CRUD + FTS5 search + decay
2. Add extraction prompt to memory-agent's consolidation cycle
3. Wire extraction into the existing 5-minute cycle
4. Add API routes: `GET /api/knowledge/items`, `GET /api/knowledge/search?q=`

### Phase 2: Category Auto-Organization (1-2 sessions)
1. Create `src/core/storage/knowledge-categories.ts` — category CRUD + trigger evaluation
2. Add category formation logic to memory-agent (runs after item extraction)
3. Tag-based clustering (no external ML deps — keep it lightweight)
4. Add API routes: `GET /api/knowledge/categories`, `GET /api/knowledge/categories/:id/items`

### Phase 3: Proactive Context Assembler (2-3 sessions)
1. Create `src/core/agents/context-assembler.ts`
2. Integrate with vision-agent (active app detection) and listener-agent (meeting state)
3. Wire assembler output into ContextBudget pipeline
4. Add 30-second tick interval to bootstrap.ts
5. Dashboard view: `MemoryExplorer.tsx` upgrade to show items/categories/salience

### Phase 4: Feedback Loop (1 session)
1. Track which assembled items agents actually use (accessed_at + access_count)
2. Boost importance of frequently-used items
3. Learn trigger patterns from access history
4. Prune items with importance < 0.05 after 7 days

---

## What NOT to Do

- **Don't add embeddings/vector search yet** — FTS5 + tag clustering is sufficient for the item counts Prism will have (hundreds to low thousands). Vector search is a Phase 5 optimization.
- **Don't replace memory blocks** — they serve a different purpose (structured agent-owned state). Knowledge items are a layer ABOVE blocks.
- **Don't use external services** — everything stays in SQLite. No Postgres, no pgvector, no API calls for memory ops.
- **Don't over-extract** — the extraction prompt should be conservative. Better to miss an item than create noise. Confidence scoring handles uncertainty.

---

## Key Differences from memU

| Aspect | memU | Prism Implementation |
|--------|------|---------------------|
| Storage | PostgreSQL + pgvector | SQLite + FTS5 (keeps Prism portable) |
| LLM | OpenAI default | Claude Agent SDK (Steve's MAX subscription) |
| Embeddings | OpenAI/Voyage | Not needed Phase 1-4 (tag-based clustering) |
| Deployment | Cloud or self-hosted | Local-only (Electron app) |
| Data sources | Conversations + documents | Conversations + screen + audio + meetings + calendar |
| Proactive triggers | Category-based | Category + temporal + environmental (richer signal set) |

We're taking the **architecture pattern**, not the library. Prism's existing infrastructure (3-tier storage, memory-agent, context-budget, agent bus) means we're wiring into proven foundations rather than bolting on a foreign system.
