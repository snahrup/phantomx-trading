// ============================================================================
// PhantomX — Trading Signal Bus (Persistent)
// ============================================================================
// Unlike the agent signal bus (in-memory sentiment), this persists structured
// trading signals to SQLite and tracks their lifecycle:
//   pending -> approved/rejected -> executed -> closed
// ============================================================================

import crypto from 'crypto';
import type { TradingSignal, TradingSignalStatus } from '@/types/trading';
import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Schema migration — adds trading_signals table if missing
// ---------------------------------------------------------------------------

function ensureSchema(): void {
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS trading_signals (
      id TEXT PRIMARY KEY,
      asset TEXT NOT NULL,
      direction TEXT NOT NULL,
      strategy TEXT NOT NULL,
      entry REAL NOT NULL,
      stop REAL NOT NULL,
      targets TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      execution_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_signals_status ON trading_signals(status);
    CREATE INDEX IF NOT EXISTS idx_signals_asset ON trading_signals(asset);
  `);

  // PAP-22: Attribution columns — migration-safe ALTERs
  const attributionColumns = [
    ['strategy_id', 'TEXT'],
    ['source', 'TEXT'],
    ['regime', 'TEXT'],
    ['trigger_details', 'TEXT'],
  ];
  for (const [col, type] of attributionColumns) {
    try {
      db.raw.exec(`ALTER TABLE trading_signals ADD COLUMN ${col} ${type}`);
    } catch {
      // Column already exists — expected on subsequent runs
    }
  }
}

let _schemaReady = false;
function ready(): void {
  if (_schemaReady) return;
  ensureSchema();
  _schemaReady = true;
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapSignal(row: any): TradingSignal {
  return {
    id: row.id,
    asset: row.asset,
    direction: row.direction,
    strategy: row.strategy,
    strategyId: row.strategy_id ?? undefined,
    source: row.source ?? undefined,
    regime: row.regime ?? undefined,
    triggerDetails: row.trigger_details ?? undefined,
    entry: row.entry,
    stop: row.stop,
    targets: JSON.parse(row.targets),
    confidence: row.confidence,
    status: row.status,
    rejectionReason: row.rejection_reason ?? undefined,
    executionId: row.execution_id ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const tradingSignalBus = {
  /** Submit a new trading signal. Returns the signal ID. */
  submit(signal: Omit<TradingSignal, 'id' | 'status' | 'createdAt' | 'updatedAt'>): string {
    ready();
    const id = crypto.randomUUID();
    const now = Date.now();
    db.raw.prepare(`
      INSERT INTO trading_signals (
        id, asset, direction, strategy, entry, stop, targets, confidence, status,
        metadata, created_at, updated_at, expires_at,
        strategy_id, source, regime, trigger_details
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      signal.asset,
      signal.direction,
      signal.strategy,
      signal.entry,
      signal.stop,
      JSON.stringify(signal.targets),
      signal.confidence,
      signal.metadata ? JSON.stringify(signal.metadata) : null,
      now,
      now,
      signal.expiresAt,
      signal.strategyId ?? null,
      signal.source ?? null,
      signal.regime ?? null,
      signal.triggerDetails ?? null,
    );
    return id;
  },

  /** Update a signal's status. */
  updateStatus(
    id: string,
    status: TradingSignalStatus,
    extra?: { rejectionReason?: string; executionId?: string },
  ): void {
    ready();
    const now = Date.now();
    const parts: string[] = ['status = ?', 'updated_at = ?'];
    const params: unknown[] = [status, now];

    if (extra?.rejectionReason !== undefined) {
      parts.push('rejection_reason = ?');
      params.push(extra.rejectionReason);
    }
    if (extra?.executionId !== undefined) {
      parts.push('execution_id = ?');
      params.push(extra.executionId);
    }
    params.push(id);
    db.raw.prepare(`UPDATE trading_signals SET ${parts.join(', ')} WHERE id = ?`).run(...params);
  },

  /** Get a single signal by ID. */
  getById(id: string): TradingSignal | null {
    ready();
    const row = db.raw.prepare('SELECT * FROM trading_signals WHERE id = ?').get(id);
    return row ? mapSignal(row) : null;
  },

  /** Get signals filtered by status. */
  getByStatus(status: TradingSignalStatus, limit = 50): TradingSignal[] {
    ready();
    return db.raw
      .prepare('SELECT * FROM trading_signals WHERE status = ? ORDER BY created_at DESC LIMIT ?')
      .all(status, limit)
      .map(mapSignal);
  },

  /** Get all pending (non-expired) signals. */
  getPending(): TradingSignal[] {
    ready();
    const now = Date.now();
    return db.raw
      .prepare('SELECT * FROM trading_signals WHERE status = ? AND expires_at > ? ORDER BY confidence DESC')
      .all('pending', now)
      .map(mapSignal);
  },

  /** Get recent signals (any status). */
  getRecent(limit = 100): TradingSignal[] {
    ready();
    return db.raw
      .prepare('SELECT * FROM trading_signals ORDER BY created_at DESC LIMIT ?')
      .all(limit)
      .map(mapSignal);
  },

  /** Expire stale pending signals. Returns count expired. */
  expireStale(): number {
    ready();
    const now = Date.now();
    const result = db.raw
      .prepare("UPDATE trading_signals SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at <= ?")
      .run(now, now);
    return result.changes;
  },

  /** Get signal counts by status. */
  getCounts(): Record<TradingSignalStatus, number> {
    ready();
    const rows = db.raw
      .prepare('SELECT status, COUNT(*) as cnt FROM trading_signals GROUP BY status')
      .all() as { status: TradingSignalStatus; cnt: number }[];

    const counts: Record<TradingSignalStatus, number> = {
      pending: 0, approved: 0, rejected: 0, executed: 0, closed: 0, expired: 0,
    };
    for (const row of rows) {
      counts[row.status] = row.cnt;
    }
    return counts;
  },
};
