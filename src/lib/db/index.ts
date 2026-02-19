import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Strategy {
  id: string;
  name: string;
  symbol: string;
  timeframe: string | null;
  config: unknown;
  goals: unknown | null;
  createdAt: number;
  updatedAt: number;
}

export interface ResearchBrief {
  id: string;
  strategyId: string | null;
  phase: string;
  agentName: string | null;
  title: string | null;
  summary: string | null;
  findings: string | null;
  confidence: number | null;
  keyDataPoints: unknown | null;
  toolCalls: unknown | null;
  durationMs: number | null;
  createdAt: number;
}

export interface Backtest {
  id: string;
  strategyId: string | null;
  config: unknown;
  metrics: unknown;
  equityCurve: unknown | null;
  trades: unknown | null;
  walkForward: unknown | null;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  thinking: string | null;
  metadata: unknown | null;
  createdAt: number;
}

export interface JournalEntry {
  id: string;
  type: string | null;
  content: string;
  tags: string[] | null;
  tradeIds: string[] | null;
  createdAt: number;
}

export interface AgentMemory {
  id: string;
  agentRole: string;
  situation: string;
  decision: string;
  outcome: string | null;
  lesson: string | null;
  tokens: string | null;
  createdAt: number;
}

export interface DebateRound {
  id: string;
  strategyId: string | null;
  debateType: string;
  speaker: string;
  round: number;
  content: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT,
  config TEXT NOT NULL,
  goals TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS research_briefs (
  id TEXT PRIMARY KEY,
  strategy_id TEXT,
  phase TEXT NOT NULL,
  agent_name TEXT,
  title TEXT,
  summary TEXT,
  findings TEXT,
  confidence REAL,
  key_data_points TEXT,
  tool_calls TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backtests (
  id TEXT PRIMARY KEY,
  strategy_id TEXT,
  config TEXT NOT NULL,
  metrics TEXT NOT NULL,
  equity_curve TEXT,
  trades TEXT,
  walk_forward TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS optimization_runs (
  id TEXT PRIMARY KEY,
  strategy_id TEXT,
  iteration INTEGER NOT NULL,
  changes TEXT,
  metrics_before TEXT,
  metrics_after TEXT,
  decision TEXT,
  reasoning TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  strategy_id TEXT,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price REAL,
  exit_price REAL,
  size_usdt REAL,
  realized_pnl REAL,
  unrealized_pnl REAL,
  status TEXT DEFAULT 'open',
  opened_at INTEGER,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  type TEXT,
  content TEXT NOT NULL,
  tags TEXT,
  trade_ids TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS research_findings (
  id TEXT PRIMARY KEY,
  cycle TEXT,
  category TEXT,
  symbol TEXT,
  title TEXT,
  content TEXT,
  severity TEXT,
  confidence REAL,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS theses (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  direction TEXT,
  title TEXT,
  content TEXT,
  confidence REAL,
  proposed_entry REAL,
  proposed_stop REAL,
  proposed_tp REAL,
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  agent_role TEXT NOT NULL,
  situation TEXT NOT NULL,
  decision TEXT NOT NULL,
  outcome TEXT,
  lesson TEXT,
  tokens TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_role ON agent_memories(agent_role);

CREATE TABLE IF NOT EXISTS debate_rounds (
  id TEXT PRIMARY KEY,
  strategy_id TEXT,
  debate_type TEXT NOT NULL,
  speaker TEXT NOT NULL,
  round INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_debate_strategy ON debate_rounds(strategy_id);

CREATE TABLE IF NOT EXISTS orchestrator_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  config TEXT NOT NULL,
  validation_records TEXT,
  research_state TEXT,
  paper_state TEXT,
  live_state TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thesis_validations (
  id TEXT PRIMARY KEY,
  thesis_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  total_trades INTEGER DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  win_rate REAL DEFAULT 0,
  profit_factor REAL DEFAULT 0,
  avg_pnl_percent REAL DEFAULT 0,
  max_drawdown_percent REAL DEFAULT 0,
  status TEXT DEFAULT 'testing',
  promoted_at INTEGER,
  rejected_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_thesis_val_thesis ON thesis_validations(thesis_id);
CREATE INDEX IF NOT EXISTS idx_thesis_val_status ON thesis_validations(status);
`;

// ---------------------------------------------------------------------------
// Database singleton — lazy init, WAL mode
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  _db = new Database(path.join(dbDir, 'phantomx.db'));
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA);
  return _db;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonParse(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function jsonStringify(val: unknown): string | null {
  if (val == null) return null;
  return typeof val === 'string' ? val : JSON.stringify(val);
}

function uid(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Prepared statement cache (lazily created per db instance)
// ---------------------------------------------------------------------------

let _stmts: ReturnType<typeof buildStatements> | null = null;

function stmts() {
  if (_stmts) return _stmts;
  _stmts = buildStatements(getDb());
  return _stmts;
}

function buildStatements(sqlite: Database.Database) {
  return {
    // strategies
    upsertStrategy: sqlite.prepare(`
      INSERT INTO strategies (id, name, symbol, timeframe, config, goals, created_at, updated_at)
      VALUES (@id, @name, @symbol, @timeframe, @config, @goals, @now, @now)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        symbol = excluded.symbol,
        timeframe = excluded.timeframe,
        config = excluded.config,
        goals = excluded.goals,
        updated_at = excluded.updated_at
    `),
    getStrategy: sqlite.prepare('SELECT * FROM strategies WHERE id = ?'),
    getAllStrategies: sqlite.prepare('SELECT * FROM strategies ORDER BY updated_at DESC'),
    deleteStrategy: sqlite.prepare('DELETE FROM strategies WHERE id = ?'),

    // research_briefs
    insertBrief: sqlite.prepare(`
      INSERT INTO research_briefs (id, strategy_id, phase, agent_name, title, summary, findings, confidence, key_data_points, tool_calls, duration_ms, created_at)
      VALUES (@id, @strategyId, @phase, @agentName, @title, @summary, @findings, @confidence, @keyDataPoints, @toolCalls, @durationMs, @now)
    `),
    getBriefsForStrategy: sqlite.prepare(
      'SELECT * FROM research_briefs WHERE strategy_id = ? ORDER BY created_at DESC'
    ),
    deleteBriefsForStrategy: sqlite.prepare(
      'DELETE FROM research_briefs WHERE strategy_id = ?'
    ),

    // backtests
    insertBacktest: sqlite.prepare(`
      INSERT INTO backtests (id, strategy_id, config, metrics, equity_curve, trades, walk_forward, created_at)
      VALUES (@id, @strategyId, @config, @metrics, @equityCurve, @trades, @walkForward, @now)
    `),
    getBacktestsForStrategy: sqlite.prepare(
      'SELECT * FROM backtests WHERE strategy_id = ? ORDER BY created_at DESC'
    ),
    getLatestBacktest: sqlite.prepare(
      'SELECT * FROM backtests WHERE strategy_id = ? ORDER BY created_at DESC LIMIT 1'
    ),

    // chat_messages
    insertChat: sqlite.prepare(`
      INSERT INTO chat_messages (id, role, content, thinking, metadata, created_at)
      VALUES (@id, @role, @content, @thinking, @metadata, @now)
    `),
    getRecentChats: sqlite.prepare(
      'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT ?'
    ),
    clearChats: sqlite.prepare('DELETE FROM chat_messages'),

    // journal_entries
    insertJournal: sqlite.prepare(`
      INSERT INTO journal_entries (id, type, content, tags, trade_ids, created_at)
      VALUES (@id, @type, @content, @tags, @tradeIds, @now)
    `),
    getAllJournal: sqlite.prepare(
      'SELECT * FROM journal_entries ORDER BY created_at DESC'
    ),

    // agent_memories
    insertMemory: sqlite.prepare(`
      INSERT INTO agent_memories (id, agent_role, situation, decision, outcome, lesson, tokens, created_at)
      VALUES (@id, @agentRole, @situation, @decision, @outcome, @lesson, @tokens, @now)
    `),
    getMemoriesByRole: sqlite.prepare(
      'SELECT * FROM agent_memories WHERE agent_role = ? ORDER BY created_at DESC LIMIT ?'
    ),
    getAllMemories: sqlite.prepare(
      'SELECT * FROM agent_memories ORDER BY created_at DESC'
    ),
    getMemoriesByRoleAll: sqlite.prepare(
      'SELECT * FROM agent_memories WHERE agent_role = ? ORDER BY created_at DESC'
    ),
    updateMemoryOutcome: sqlite.prepare(
      'UPDATE agent_memories SET outcome = @outcome, lesson = @lesson WHERE id = @id'
    ),

    // debate_rounds
    insertDebate: sqlite.prepare(`
      INSERT INTO debate_rounds (id, strategy_id, debate_type, speaker, round, content, created_at)
      VALUES (@id, @strategyId, @debateType, @speaker, @round, @content, @now)
    `),
    getDebatesForStrategy: sqlite.prepare(
      'SELECT * FROM debate_rounds WHERE strategy_id = ? ORDER BY round ASC, created_at ASC'
    ),

    // orchestrator_state
    upsertOrchestratorState: sqlite.prepare(`
      INSERT INTO orchestrator_state (id, config, validation_records, research_state, paper_state, live_state, updated_at)
      VALUES ('singleton', @config, @validationRecords, @researchState, @paperState, @liveState, @now)
      ON CONFLICT(id) DO UPDATE SET
        config = excluded.config,
        validation_records = excluded.validation_records,
        research_state = excluded.research_state,
        paper_state = excluded.paper_state,
        live_state = excluded.live_state,
        updated_at = excluded.updated_at
    `),
    getOrchestratorState: sqlite.prepare('SELECT * FROM orchestrator_state WHERE id = ?'),

    // thesis_validations
    upsertThesisValidation: sqlite.prepare(`
      INSERT INTO thesis_validations (id, thesis_id, symbol, direction, total_trades, win_count, win_rate, profit_factor, avg_pnl_percent, max_drawdown_percent, status, promoted_at, rejected_reason, created_at, updated_at)
      VALUES (@id, @thesisId, @symbol, @direction, @totalTrades, @winCount, @winRate, @profitFactor, @avgPnlPercent, @maxDrawdownPercent, @status, @promotedAt, @rejectedReason, @createdAt, @now)
      ON CONFLICT(id) DO UPDATE SET
        total_trades = excluded.total_trades,
        win_count = excluded.win_count,
        win_rate = excluded.win_rate,
        profit_factor = excluded.profit_factor,
        avg_pnl_percent = excluded.avg_pnl_percent,
        max_drawdown_percent = excluded.max_drawdown_percent,
        status = excluded.status,
        promoted_at = excluded.promoted_at,
        rejected_reason = excluded.rejected_reason,
        updated_at = excluded.updated_at
    `),
    getThesisValidation: sqlite.prepare('SELECT * FROM thesis_validations WHERE thesis_id = ?'),
    getAllThesisValidations: sqlite.prepare('SELECT * FROM thesis_validations ORDER BY updated_at DESC'),
    getThesisValidationsByStatus: sqlite.prepare('SELECT * FROM thesis_validations WHERE status = ? ORDER BY updated_at DESC'),
  };
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapStrategy(row: any): Strategy {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe,
    config: jsonParse(row.config),
    goals: jsonParse(row.goals),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBrief(row: any): ResearchBrief {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    phase: row.phase,
    agentName: row.agent_name,
    title: row.title,
    summary: row.summary,
    findings: row.findings,
    confidence: row.confidence,
    keyDataPoints: jsonParse(row.key_data_points),
    toolCalls: jsonParse(row.tool_calls),
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

function mapBacktest(row: any): Backtest {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    config: jsonParse(row.config),
    metrics: jsonParse(row.metrics),
    equityCurve: jsonParse(row.equity_curve),
    trades: jsonParse(row.trades),
    walkForward: jsonParse(row.walk_forward),
    createdAt: row.created_at,
  };
}

function mapChat(row: any): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    thinking: row.thinking,
    metadata: jsonParse(row.metadata),
    createdAt: row.created_at,
  };
}

function mapJournal(row: any): JournalEntry {
  return {
    id: row.id,
    type: row.type,
    content: row.content,
    tags: jsonParse(row.tags) as string[] | null,
    tradeIds: jsonParse(row.trade_ids) as string[] | null,
    createdAt: row.created_at,
  };
}

function mapMemory(row: any): AgentMemory {
  return {
    id: row.id,
    agentRole: row.agent_role,
    situation: row.situation,
    decision: row.decision,
    outcome: row.outcome,
    lesson: row.lesson,
    tokens: row.tokens,
    createdAt: row.created_at,
  };
}

function mapDebate(row: any): DebateRound {
  return {
    id: row.id,
    strategyId: row.strategy_id,
    debateType: row.debate_type,
    speaker: row.speaker,
    round: row.round,
    content: row.content,
    createdAt: row.created_at,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const db = {
  /** Direct access to the underlying better-sqlite3 instance */
  get raw(): Database.Database {
    return getDb();
  },

  strategies: {
    save(s: {
      id?: string;
      name: string;
      symbol: string;
      timeframe?: string;
      config: unknown;
      goals?: unknown;
    }): string {
      const id = s.id || uid();
      const now = Date.now();
      stmts().upsertStrategy.run({
        id,
        name: s.name,
        symbol: s.symbol,
        timeframe: s.timeframe ?? null,
        config: jsonStringify(s.config) ?? '{}',
        goals: jsonStringify(s.goals) ?? null,
        now,
      });
      return id;
    },

    getById(id: string): Strategy | null {
      const row = stmts().getStrategy.get(id);
      return row ? mapStrategy(row) : null;
    },

    getAll(): Strategy[] {
      return stmts().getAllStrategies.all().map(mapStrategy);
    },

    delete(id: string): void {
      stmts().deleteStrategy.run(id);
    },
  },

  researchBriefs: {
    save(b: {
      id?: string;
      strategyId?: string;
      phase: string;
      agentName?: string;
      title?: string;
      summary?: string;
      findings?: string;
      confidence?: number;
      keyDataPoints?: unknown;
      toolCalls?: unknown;
      durationMs?: number;
    }): string {
      const id = b.id || uid();
      stmts().insertBrief.run({
        id,
        strategyId: b.strategyId ?? null,
        phase: b.phase,
        agentName: b.agentName ?? null,
        title: b.title ?? null,
        summary: b.summary ?? null,
        findings: b.findings ?? null,
        confidence: b.confidence ?? null,
        keyDataPoints: jsonStringify(b.keyDataPoints) ?? null,
        toolCalls: jsonStringify(b.toolCalls) ?? null,
        durationMs: b.durationMs ?? null,
        now: Date.now(),
      });
      return id;
    },

    getForStrategy(strategyId: string): ResearchBrief[] {
      return stmts().getBriefsForStrategy.all(strategyId).map(mapBrief);
    },

    deleteForStrategy(strategyId: string): void {
      stmts().deleteBriefsForStrategy.run(strategyId);
    },
  },

  backtests: {
    save(b: {
      id?: string;
      strategyId?: string;
      config: unknown;
      metrics: unknown;
      equityCurve?: unknown;
      trades?: unknown;
      walkForward?: unknown;
    }): string {
      const id = b.id || uid();
      stmts().insertBacktest.run({
        id,
        strategyId: b.strategyId ?? null,
        config: jsonStringify(b.config) ?? '{}',
        metrics: jsonStringify(b.metrics) ?? '{}',
        equityCurve: jsonStringify(b.equityCurve) ?? null,
        trades: jsonStringify(b.trades) ?? null,
        walkForward: jsonStringify(b.walkForward) ?? null,
        now: Date.now(),
      });
      return id;
    },

    getForStrategy(strategyId: string): Backtest[] {
      return stmts().getBacktestsForStrategy.all(strategyId).map(mapBacktest);
    },

    getLatest(strategyId: string): Backtest | null {
      const row = stmts().getLatestBacktest.get(strategyId);
      return row ? mapBacktest(row) : null;
    },
  },

  chatMessages: {
    save(msg: {
      id?: string;
      role: string;
      content: string;
      thinking?: string;
      metadata?: unknown;
    }): string {
      const id = msg.id || uid();
      stmts().insertChat.run({
        id,
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking ?? null,
        metadata: jsonStringify(msg.metadata) ?? null,
        now: Date.now(),
      });
      return id;
    },

    getRecent(limit = 50): ChatMessage[] {
      return stmts().getRecentChats.all(limit).map(mapChat).reverse();
    },

    clear(): void {
      stmts().clearChats.run();
    },
  },

  journalEntries: {
    save(entry: {
      id?: string;
      type?: string;
      content: string;
      tags?: string[];
      tradeIds?: string[];
    }): string {
      const id = entry.id || uid();
      stmts().insertJournal.run({
        id,
        type: entry.type ?? null,
        content: entry.content,
        tags: jsonStringify(entry.tags) ?? null,
        tradeIds: jsonStringify(entry.tradeIds) ?? null,
        now: Date.now(),
      });
      return id;
    },

    getAll(): JournalEntry[] {
      return stmts().getAllJournal.all().map(mapJournal);
    },
  },

  agentMemories: {
    save(mem: {
      id?: string;
      agentRole: string;
      situation: string;
      decision: string;
      outcome?: string;
      lesson?: string;
      tokens?: string;
    }): string {
      const id = mem.id || uid();
      stmts().insertMemory.run({
        id,
        agentRole: mem.agentRole,
        situation: mem.situation,
        decision: mem.decision,
        outcome: mem.outcome ?? null,
        lesson: mem.lesson ?? null,
        tokens: mem.tokens ?? null,
        now: Date.now(),
      });
      return id;
    },

    getByRole(role: string, limit = 20): AgentMemory[] {
      return stmts().getMemoriesByRole.all(role, limit).map(mapMemory);
    },

    getAllForSearch(role?: string): AgentMemory[] {
      if (role) {
        return stmts().getMemoriesByRoleAll.all(role).map(mapMemory);
      }
      return stmts().getAllMemories.all().map(mapMemory);
    },

    updateOutcome(id: string, outcome: string, lesson?: string): void {
      stmts().updateMemoryOutcome.run({
        id,
        outcome,
        lesson: lesson ?? null,
      });
    },
  },

  debateRounds: {
    save(round: {
      id?: string;
      strategyId?: string;
      debateType: string;
      speaker: string;
      round: number;
      content: string;
    }): string {
      const id = round.id || uid();
      stmts().insertDebate.run({
        id,
        strategyId: round.strategyId ?? null,
        debateType: round.debateType,
        speaker: round.speaker,
        round: round.round,
        content: round.content,
        now: Date.now(),
      });
      return id;
    },

    getForStrategy(strategyId: string): DebateRound[] {
      return stmts().getDebatesForStrategy.all(strategyId).map(mapDebate);
    },
  },

  orchestratorState: {
    save(state: {
      config: unknown;
      validationRecords?: unknown;
      researchState?: unknown;
      paperState?: unknown;
      liveState?: unknown;
    }): void {
      stmts().upsertOrchestratorState.run({
        config: JSON.stringify(state.config),
        validationRecords: state.validationRecords ? JSON.stringify(state.validationRecords) : null,
        researchState: state.researchState ? JSON.stringify(state.researchState) : null,
        paperState: state.paperState ? JSON.stringify(state.paperState) : null,
        liveState: state.liveState ? JSON.stringify(state.liveState) : null,
        now: Date.now(),
      });
    },

    get(): { config: unknown; validationRecords: unknown; researchState: unknown; paperState: unknown; liveState: unknown } | null {
      const row = stmts().getOrchestratorState.get('singleton') as any;
      if (!row) return null;
      return {
        config: jsonParse(row.config),
        validationRecords: jsonParse(row.validation_records),
        researchState: jsonParse(row.research_state),
        paperState: jsonParse(row.paper_state),
        liveState: jsonParse(row.live_state),
      };
    },
  },

  thesisValidations: {
    save(record: {
      id: string;
      thesisId: string;
      symbol: string;
      direction: string;
      totalTrades: number;
      winCount: number;
      winRate: number;
      profitFactor: number;
      avgPnlPercent: number;
      maxDrawdownPercent: number;
      status: string;
      promotedAt?: number;
      rejectedReason?: string;
      createdAt?: number;
    }): void {
      stmts().upsertThesisValidation.run({
        id: record.id,
        thesisId: record.thesisId,
        symbol: record.symbol,
        direction: record.direction,
        totalTrades: record.totalTrades,
        winCount: record.winCount,
        winRate: record.winRate,
        profitFactor: record.profitFactor,
        avgPnlPercent: record.avgPnlPercent,
        maxDrawdownPercent: record.maxDrawdownPercent,
        status: record.status,
        promotedAt: record.promotedAt ?? null,
        rejectedReason: record.rejectedReason ?? null,
        createdAt: record.createdAt ?? Date.now(),
        now: Date.now(),
      });
    },

    getForThesis(thesisId: string): any {
      return stmts().getThesisValidation.get(thesisId);
    },

    getAll(): any[] {
      return stmts().getAllThesisValidations.all();
    },

    getByStatus(status: string): any[] {
      return stmts().getThesisValidationsByStatus.all(status);
    },
  },
};

export default db;
