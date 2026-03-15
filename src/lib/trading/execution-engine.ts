// ============================================================================
// PhantomX — Execution Engine
// ============================================================================
// Accepts risk-approved trading signals and executes them.
// In PAPER mode: logs the trade without hitting Phemex.
// In LIVE mode: places real orders via PhemexClient.
// Board must explicitly set mode to 'live' — default is always 'paper'.
// ============================================================================

import crypto from 'crypto';
import type {
  TradingSignal,
  ExecutionRecord,
  PipelineConfig,
} from '@/types/trading';
import { db } from '@/lib/db';
import { isKillSwitchActive, isCloseOnlyMode } from '@/lib/kill-switch';

// ---------------------------------------------------------------------------
// Schema migration — adds execution_log table if missing
// ---------------------------------------------------------------------------

function ensureSchema(): void {
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS execution_log (
      id TEXT PRIMARY KEY,
      signal_id TEXT NOT NULL,
      asset TEXT NOT NULL,
      direction TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'paper',
      entry_price REAL NOT NULL,
      fill_price REAL,
      size REAL NOT NULL,
      size_usdt REAL NOT NULL,
      stop_loss REAL NOT NULL,
      take_profit REAL,
      leverage INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      exit_price REAL,
      realized_pnl REAL,
      fees REAL,
      slippage REAL,
      order_id TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      closed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_exec_signal ON execution_log(signal_id);
    CREATE INDEX IF NOT EXISTS idx_exec_status ON execution_log(status);
    CREATE INDEX IF NOT EXISTS idx_exec_asset ON execution_log(asset);
  `);

  // PAP-22: Attribution columns — migration-safe ALTERs (ignore if already exist)
  const attributionColumns = [
    ['strategy_id', 'TEXT'],
    ['strategy_name', 'TEXT'],
    ['confidence', 'REAL'],
    ['source', 'TEXT'],
    ['regime', 'TEXT'],
    ['trigger_details', 'TEXT'],
    ['exit_rationale', 'TEXT'],
    ['hold_time_ms', 'INTEGER'],
    ['entry_context', 'TEXT'],       // JSON blob
    ['exit_context', 'TEXT'],        // JSON blob
  ];
  for (const [col, type] of attributionColumns) {
    try {
      db.raw.exec(`ALTER TABLE execution_log ADD COLUMN ${col} ${type}`);
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
function mapRecord(row: any): ExecutionRecord {
  return {
    id: row.id,
    signalId: row.signal_id,
    asset: row.asset,
    direction: row.direction,
    mode: row.mode,
    entryPrice: row.entry_price,
    fillPrice: row.fill_price ?? undefined,
    size: row.size,
    sizeUsdt: row.size_usdt,
    stopLoss: row.stop_loss,
    takeProfit: row.take_profit ?? undefined,
    leverage: row.leverage,
    status: row.status,
    exitPrice: row.exit_price ?? undefined,
    realizedPnl: row.realized_pnl ?? undefined,
    fees: row.fees ?? undefined,
    slippage: row.slippage ?? undefined,
    orderId: row.order_id ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    closedAt: row.closed_at ?? undefined,
    // PAP-22: Attribution fields
    strategyId: row.strategy_id ?? undefined,
    strategyName: row.strategy_name ?? undefined,
    confidence: row.confidence ?? undefined,
    source: row.source ?? undefined,
    regime: row.regime ?? undefined,
    triggerDetails: row.trigger_details ?? undefined,
    exitRationale: row.exit_rationale ?? undefined,
    holdTimeMs: row.hold_time_ms ?? undefined,
    entryContext: row.entry_context ? JSON.parse(row.entry_context) : undefined,
    exitContext: row.exit_context ? JSON.parse(row.exit_context) : undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Paper execution — simulates fill at signal entry price
// ---------------------------------------------------------------------------

/** Build attribution fields from signal — shared by paper and live execution. */
function buildAttribution(signal: TradingSignal): Pick<ExecutionRecord, 'strategyId' | 'strategyName' | 'confidence' | 'source' | 'regime' | 'triggerDetails' | 'entryContext'> {
  return {
    strategyId: signal.strategyId,
    strategyName: signal.strategy,
    confidence: signal.confidence,
    source: signal.source,
    regime: signal.regime,
    triggerDetails: signal.triggerDetails,
    entryContext: signal.metadata,
  };
}

function executePaper(
  signal: TradingSignal,
  config: PipelineConfig,
  equity: number,
): ExecutionRecord {
  const sizeUsdt = equity * (config.positionSizePercent / 100);
  const size = sizeUsdt / signal.entry;
  const fillPrice = signal.entry; // paper = perfect fill
  const leverage = Math.min(config.defaultLeverage, 100); // Clamp to Phemex max

  return {
    id: crypto.randomUUID(),
    signalId: signal.id,
    asset: signal.asset,
    direction: signal.direction,
    mode: 'paper',
    entryPrice: signal.entry,
    fillPrice,
    size,
    sizeUsdt,
    stopLoss: signal.stop,
    takeProfit: signal.targets[0] ?? undefined,
    leverage,
    status: 'filled',
    slippage: 0,
    createdAt: Date.now(),
    ...buildAttribution(signal),
  };
}

// ---------------------------------------------------------------------------
// Live execution — places order on Phemex (REQUIRES board approval)
// ---------------------------------------------------------------------------

async function executeLive(
  signal: TradingSignal,
  config: PipelineConfig,
  equity: number,
): Promise<ExecutionRecord> {
  // Dynamic import to avoid circular deps with client singleton
  const { getPhemexClient } = await import('@/lib/phemex/client');
  let client: ReturnType<typeof getPhemexClient> | null = null;
  try { client = getPhemexClient(); } catch { /* not configured */ }

  const attribution = buildAttribution(signal);
  const leverage = Math.min(config.defaultLeverage, 100); // Clamp to Phemex max

  if (!client) {
    return {
      id: crypto.randomUUID(),
      signalId: signal.id,
      asset: signal.asset,
      direction: signal.direction,
      mode: 'live',
      entryPrice: signal.entry,
      size: 0,
      sizeUsdt: 0,
      stopLoss: signal.stop,
      leverage,
      status: 'failed',
      error: 'PhemexClient not connected',
      createdAt: Date.now(),
      ...attribution,
    };
  }

  // Final kill-switch check right before order placement
  // Both close_only and killed modes block new entries
  if (isKillSwitchActive()) {
    return {
      id: crypto.randomUUID(),
      signalId: signal.id,
      asset: signal.asset,
      direction: signal.direction,
      mode: 'live',
      entryPrice: signal.entry,
      size: 0,
      sizeUsdt: 0,
      stopLoss: signal.stop,
      leverage,
      status: 'failed',
      error: isCloseOnlyMode()
        ? 'Kill switch in close-only mode — no new entries'
        : 'Kill switch active at execution time',
      createdAt: Date.now(),
      ...attribution,
    };
  }

  const sizeUsdt = equity * (config.positionSizePercent / 100);
  const size = sizeUsdt / signal.entry;
  const side = signal.direction === 'long' ? 'buy' : 'sell';

  try {
    // Set leverage BEFORE placing the order — exchange default may differ
    try {
      await client.setLeverage(signal.asset, leverage);
    } catch (levErr) {
      console.warn('[ExecutionEngine] Leverage set failed (using exchange default):', levErr);
    }

    const order = await client.createOrder(signal.asset, 'market', side, size);
    // Derive average fill price: cost/filled is most accurate for market orders
    // (order.price is often undefined for market orders on Phemex)
    const fillPrice = (order.cost > 0 && order.filled > 0)
      ? order.cost / order.filled
      : (order.price ?? signal.entry);
    const slippage = Math.abs(fillPrice - signal.entry);

    // Place stop-loss order (2s delay — Phemex rate-limits rapid sequential calls)
    const stopSide = signal.direction === 'long' ? 'sell' : 'buy';
    try {
      await new Promise(r => setTimeout(r, 2000));
      await client.createOrder(signal.asset, 'stop', stopSide, size, signal.stop, {
        stopPrice: signal.stop,
        reduceOnly: true,
      });
    } catch (slErr) {
      console.error('[ExecutionEngine] Stop-loss placement failed:', slErr);
    }

    // Place take-profit if targets exist (2s delay for rate limiting)
    if (signal.targets[0]) {
      try {
        await new Promise(r => setTimeout(r, 2000));
        await client.createOrder(signal.asset, 'limit', stopSide, size, signal.targets[0], {
          reduceOnly: true,
        });
      } catch (tpErr) {
        console.error('[ExecutionEngine] Take-profit placement failed:', tpErr);
      }
    }

    return {
      id: crypto.randomUUID(),
      signalId: signal.id,
      asset: signal.asset,
      direction: signal.direction,
      mode: 'live',
      entryPrice: signal.entry,
      fillPrice,
      size,
      sizeUsdt,
      stopLoss: signal.stop,
      takeProfit: signal.targets[0] ?? undefined,
      leverage,
      status: 'filled',
      slippage,
      orderId: order.id,
      fees: order.fee?.cost,
      createdAt: Date.now(),
      ...attribution,
    };
  } catch (err) {
    return {
      id: crypto.randomUUID(),
      signalId: signal.id,
      asset: signal.asset,
      direction: signal.direction,
      mode: 'live',
      entryPrice: signal.entry,
      size,
      sizeUsdt,
      stopLoss: signal.stop,
      leverage,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      createdAt: Date.now(),
      ...attribution,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const executionEngine = {
  /** Execute a risk-approved signal. Returns the execution record. */
  async execute(
    signal: TradingSignal,
    config: PipelineConfig,
    equity: number,
  ): Promise<ExecutionRecord> {
    ready();

    let record: ExecutionRecord;
    if (config.mode === 'live') {
      record = await executeLive(signal, config, equity);
    } else {
      record = executePaper(signal, config, equity);
    }

    // Persist to DB (includes PAP-22 attribution columns)
    db.raw.prepare(`
      INSERT INTO execution_log (
        id, signal_id, asset, direction, mode, entry_price, fill_price, size, size_usdt,
        stop_loss, take_profit, leverage, status, exit_price, realized_pnl, fees, slippage,
        order_id, error, created_at, closed_at,
        strategy_id, strategy_name, confidence, source, regime, trigger_details, entry_context
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id, record.signalId, record.asset, record.direction, record.mode,
      record.entryPrice, record.fillPrice ?? null, record.size, record.sizeUsdt,
      record.stopLoss, record.takeProfit ?? null, record.leverage, record.status,
      record.exitPrice ?? null, record.realizedPnl ?? null, record.fees ?? null,
      record.slippage ?? null, record.orderId ?? null, record.error ?? null,
      record.createdAt, record.closedAt ?? null,
      record.strategyId ?? null, record.strategyName ?? null, record.confidence ?? null,
      record.source ?? null, record.regime ?? null, record.triggerDetails ?? null,
      record.entryContext ? JSON.stringify(record.entryContext) : null,
    );

    // Log to journal (with attribution context)
    const stratLabel = record.strategyId ? ` | Strategy: ${record.strategyName ?? record.strategyId}` : '';
    const confLabel = record.confidence != null ? ` | Conf: ${record.confidence}%` : '';
    const sourceLabel = record.source ? ` | Source: ${record.source}` : '';
    db.journalEntries.save({
      type: 'trade_execution',
      content: `[${record.mode.toUpperCase()}] ${record.direction.toUpperCase()} ${record.asset} @ ${record.fillPrice ?? record.entryPrice} | Size: ${record.sizeUsdt.toFixed(2)} USDT | SL: ${record.stopLoss} | Status: ${record.status}${stratLabel}${confLabel}${sourceLabel}`,
      tags: [record.mode, record.direction, record.asset, record.status, ...(record.strategyId ? [record.strategyId] : [])],
      tradeIds: [record.id],
    });

    return record;
  },

  /** Close an open execution (paper mode: mark as closed; live mode: close on exchange). */
  async close(
    executionId: string,
    exitPrice: number,
    reason?: string,
    exitContext?: Record<string, unknown>,
  ): Promise<ExecutionRecord | null> {
    ready();
    const row = db.raw.prepare('SELECT * FROM execution_log WHERE id = ?').get(executionId);
    if (!row) return null;
    const record = mapRecord(row);

    if (record.status !== 'filled') return record;

    // Calculate P&L and hold time — use fillPrice (actual entry) not entryPrice (signal target)
    const direction = record.direction === 'long' ? 1 : -1;
    const actualEntry = record.fillPrice ?? record.entryPrice;
    const pnl = (exitPrice - actualEntry) * record.size * direction;
    const now = Date.now();
    const holdTimeMs = now - record.createdAt;
    const exitRationale = reason ?? 'manual';

    db.raw.prepare(`
      UPDATE execution_log
      SET status = 'closed', exit_price = ?, realized_pnl = ?, closed_at = ?,
          exit_rationale = ?, hold_time_ms = ?, exit_context = ?
      WHERE id = ?
    `).run(
      exitPrice, pnl, now,
      exitRationale, holdTimeMs, exitContext ? JSON.stringify(exitContext) : null,
      executionId,
    );

    const updated: ExecutionRecord = {
      ...record,
      status: 'closed',
      exitPrice,
      realizedPnl: pnl,
      closedAt: now,
      exitRationale,
      holdTimeMs,
      exitContext,
    };

    // Format hold time for journal
    const holdSec = Math.round(holdTimeMs / 1000);
    const holdLabel = holdSec < 60 ? `${holdSec}s` : holdSec < 3600 ? `${Math.round(holdSec / 60)}m` : `${(holdSec / 3600).toFixed(1)}h`;
    const stratLabel = record.strategyId ? ` | Strategy: ${record.strategyName ?? record.strategyId}` : '';

    db.journalEntries.save({
      type: 'trade_close',
      content: `[${record.mode.toUpperCase()}] Closed ${record.direction.toUpperCase()} ${record.asset} @ ${exitPrice} | P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} USDT | Hold: ${holdLabel} | ${exitRationale}${stratLabel}`,
      tags: [record.mode, 'close', record.asset, pnl >= 0 ? 'profit' : 'loss', ...(record.strategyId ? [record.strategyId] : [])],
      tradeIds: [record.id],
    });

    return updated;
  },

  /** Get execution record by ID. */
  getById(id: string): ExecutionRecord | null {
    ready();
    const row = db.raw.prepare('SELECT * FROM execution_log WHERE id = ?').get(id);
    return row ? mapRecord(row) : null;
  },

  /** Get open (filled but not closed) executions. */
  getOpen(): ExecutionRecord[] {
    ready();
    return db.raw
      .prepare("SELECT * FROM execution_log WHERE status = 'filled' ORDER BY created_at DESC")
      .all()
      .map(mapRecord);
  },

  /** Get execution history. */
  getHistory(limit = 100): ExecutionRecord[] {
    ready();
    return db.raw
      .prepare('SELECT * FROM execution_log ORDER BY created_at DESC LIMIT ?')
      .all(limit)
      .map(mapRecord);
  },

  /** Get daily P&L (realized, for today). */
  getDailyPnl(): number {
    ready();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const row = db.raw
      .prepare("SELECT COALESCE(SUM(realized_pnl), 0) as total FROM execution_log WHERE status = 'closed' AND closed_at >= ?")
      .get(startOfDay.getTime()) as { total: number };
    return row.total;
  },

  /** Get stats summary (includes whipsaw count). */
  getStats(): { totalTrades: number; openTrades: number; winRate: number; totalPnl: number; dailyPnl: number; whipsawCount: number } {
    ready();
    const total = db.raw.prepare('SELECT COUNT(*) as cnt FROM execution_log').get() as { cnt: number };
    const open = db.raw.prepare("SELECT COUNT(*) as cnt FROM execution_log WHERE status = 'filled'").get() as { cnt: number };
    const closed = db.raw.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(realized_pnl), 0) as pnl FROM execution_log WHERE status = 'closed'").get() as { cnt: number; pnl: number };
    const wins = db.raw.prepare("SELECT COUNT(*) as cnt FROM execution_log WHERE status = 'closed' AND realized_pnl > 0").get() as { cnt: number };
    const whipsaws = this.getWhipsawTrades().length;

    return {
      totalTrades: total.cnt,
      openTrades: open.cnt,
      winRate: closed.cnt > 0 ? (wins.cnt / closed.cnt) * 100 : 0,
      totalPnl: closed.pnl,
      dailyPnl: this.getDailyPnl(),
      whipsawCount: whipsaws,
    };
  },

  /** Get trades flagged as whipsaw (held < 5 minutes). */
  getWhipsawTrades(thresholdMs = 5 * 60 * 1000): ExecutionRecord[] {
    ready();
    return db.raw
      .prepare("SELECT * FROM execution_log WHERE status = 'closed' AND hold_time_ms IS NOT NULL AND hold_time_ms < ? ORDER BY created_at DESC")
      .all(thresholdMs)
      .map(mapRecord);
  },

  /** Get strategy performance breakdown. */
  getStrategyStats(): Record<string, { trades: number; wins: number; totalPnl: number; avgHoldMs: number; whipsaws: number }> {
    ready();
    const rows = db.raw.prepare(`
      SELECT
        COALESCE(strategy_id, strategy_name, 'unknown') as strat,
        COUNT(*) as trades,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) as wins,
        COALESCE(SUM(realized_pnl), 0) as total_pnl,
        COALESCE(AVG(hold_time_ms), 0) as avg_hold_ms,
        SUM(CASE WHEN hold_time_ms IS NOT NULL AND hold_time_ms < 300000 THEN 1 ELSE 0 END) as whipsaws
      FROM execution_log
      WHERE status = 'closed'
      GROUP BY strat
    `).all() as { strat: string; trades: number; wins: number; total_pnl: number; avg_hold_ms: number; whipsaws: number }[];

    const result: Record<string, { trades: number; wins: number; totalPnl: number; avgHoldMs: number; whipsaws: number }> = {};
    for (const row of rows) {
      result[row.strat] = {
        trades: row.trades,
        wins: row.wins,
        totalPnl: row.total_pnl,
        avgHoldMs: row.avg_hold_ms,
        whipsaws: row.whipsaws,
      };
    }
    return result;
  },
};
