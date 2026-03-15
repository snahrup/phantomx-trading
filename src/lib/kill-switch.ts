// ============================================================================
// PhantomX — Global Kill Switch (Server-Side Singleton)
// Survives hot reloads via globalThis. Checked by ALL order-placement paths.
// Risk thresholds defined per knowledge/risk-management/risk-params.json
// ============================================================================

import fs from 'fs';
import path from 'path';

const KILL_FILE = path.join(process.cwd(), '.phantomx-kill');

// ---------------------------------------------------------------------------
// Concrete risk thresholds (source: risk-params.json, enforced here)
// ---------------------------------------------------------------------------
export const RISK_THRESHOLDS = {
  // Per-trade risk: max 2% of equity
  MAX_RISK_PER_TRADE: 0.02,

  // Position limits
  MAX_POSITION_SIZE: 0.10,         // 10% of equity (notional)
  MAX_POSITION_SIZE_RECOVERY: 0.05, // 5% during drawdown recovery
  MAX_TOTAL_EXPOSURE: 3.0,         // 3x equity across all positions
  MAX_SIMULTANEOUS_POSITIONS: 3,
  MAX_CORRELATED_POSITIONS: 2,

  // Margin
  MAX_MARGIN_UTILIZATION: 0.70,    // 70% of available margin
  MARGIN_ALERT_THRESHOLD: 0.50,
  MIN_FREE_MARGIN_USDT: 20,

  // Loss limits (fraction of equity)
  DAILY_LOSS_LIMIT: 0.05,          // 5% daily → 4h pause
  WEEKLY_LOSS_LIMIT: 0.10,         // 10% weekly → pause until Monday
  KILL_SWITCH_DRAWDOWN: 0.15,      // 15% from peak → close all, full stop

  // Account floor
  ACCOUNT_FLOOR_USDT: 50,          // Below $50 → permanent halt

  // Cooldown
  POST_KILL_COOLDOWN_MS: 48 * 60 * 60 * 1000, // 48 hours

  // Funding rate
  MAX_ANNUALIZED_FUNDING_COST: 0.05,
  FUNDING_ALERT_THRESHOLD: 0.03,

  // Stop-loss
  STOP_LOSS_MANDATORY: true,
  MAX_STOP_DISTANCE_50X: 0.018,    // 1.8% at 50x (must fire before liquidation)
  RECOMMENDED_STOP_DISTANCE_50X: 0.008,
} as const;

// ---------------------------------------------------------------------------
// Kill switch state
// ---------------------------------------------------------------------------
// Three modes:
//   inactive   — normal operations
//   close_only — new entries blocked; reduce-only / close orders allowed
//   killed     — everything blocked except direct close_position
// ---------------------------------------------------------------------------
type KillMode = 'inactive' | 'close_only' | 'killed';

interface KillState {
  isKilled: boolean;
  mode: KillMode;
  reason: string | null;
  triggeredAt: number | null;
}

const globalForKill = globalThis as unknown as { __phantomxKill?: KillState };

function getState(): KillState {
  if (!globalForKill.__phantomxKill) {
    // Check persisted file on first access (CRIT-11: survive server restart)
    try {
      if (fs.existsSync(KILL_FILE)) {
        const raw = JSON.parse(fs.readFileSync(KILL_FILE, 'utf-8'));
        const mode: KillMode = raw.mode ?? 'killed';
        globalForKill.__phantomxKill = {
          isKilled: true,
          mode,
          reason: raw.reason ?? 'persisted from previous session',
          triggeredAt: raw.triggeredAt ?? null,
        };
        console.log(`[PhantomX] Kill switch restored from file (${mode}):`, raw.reason);
        return globalForKill.__phantomxKill;
      }
    } catch { /* ignore corrupt file */ }
    globalForKill.__phantomxKill = { isKilled: false, mode: 'inactive', reason: null, triggeredAt: null };
  }
  return globalForKill.__phantomxKill;
}

/** Returns true if the kill switch is in ANY active state (close_only or killed). */
export function isKillSwitchActive(): boolean {
  return getState().isKilled;
}

/** Returns true only when in close_only mode (reduce-only orders still permitted). */
export function isCloseOnlyMode(): boolean {
  const s = getState();
  return s.isKilled && s.mode === 'close_only';
}

/** Returns true only when fully killed (no orders at all). */
export function isFullyKilled(): boolean {
  const s = getState();
  return s.isKilled && s.mode === 'killed';
}

export function getKillState(): KillState & { mode: KillMode } {
  return { ...getState() };
}

/**
 * Trigger the kill switch. Default mode is 'killed' (full block).
 * Pass mode='close_only' to allow reduce-only orders while blocking new entries.
 */
export function triggerKillSwitch(reason: string, mode: KillMode = 'killed'): void {
  const state = getState();
  state.isKilled = true;
  state.mode = mode === 'inactive' ? 'killed' : mode; // prevent setting inactive via trigger
  state.reason = reason;
  state.triggeredAt = Date.now();
  // Persist to file (CRIT-11)
  try {
    fs.writeFileSync(KILL_FILE, JSON.stringify({ reason, mode: state.mode, triggeredAt: state.triggeredAt }));
  } catch { /* best effort */ }
  console.log(`[PhantomX] KILL SWITCH TRIGGERED (${state.mode}): ${reason}`);
}

/**
 * Switch an active kill switch to close_only mode (allow reduce-only orders).
 * If kill switch is not active, triggers it in close_only mode.
 */
export function setCloseOnlyMode(reason?: string): void {
  const state = getState();
  if (!state.isKilled) {
    triggerKillSwitch(reason ?? 'Close-only mode activated', 'close_only');
    return;
  }
  state.mode = 'close_only';
  if (reason) state.reason = reason;
  try {
    fs.writeFileSync(KILL_FILE, JSON.stringify({ reason: state.reason, mode: 'close_only', triggeredAt: state.triggeredAt }));
  } catch { /* best effort */ }
  console.log(`[PhantomX] Kill switch mode changed to CLOSE_ONLY`);
}

/**
 * Returns the number of milliseconds remaining in the mandatory cooldown,
 * or 0 if the cooldown has elapsed. Returns 0 if kill switch is not active.
 */
export function getCooldownRemainingMs(): number {
  const state = getState();
  if (!state.isKilled || !state.triggeredAt) return 0;
  const elapsed = Date.now() - state.triggeredAt;
  const remaining = RISK_THRESHOLDS.POST_KILL_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}

/**
 * Resets the kill switch. Enforces the mandatory 48-hour cooldown period.
 * Pass force=true only with CEO authorization to bypass cooldown.
 * Returns { success, message }.
 */
export function resetKillSwitch(force = false): { success: boolean; message: string } {
  const cooldown = getCooldownRemainingMs();
  if (cooldown > 0 && !force) {
    const hoursLeft = (cooldown / (1000 * 60 * 60)).toFixed(1);
    const msg = `Reset blocked: ${hoursLeft}h remaining in mandatory 48h cooldown. Use force=true with CEO authorization to override.`;
    console.log(`[PhantomX] ${msg}`);
    return { success: false, message: msg };
  }

  const state = getState();
  state.isKilled = false;
  state.mode = 'inactive';
  state.reason = null;
  state.triggeredAt = null;
  try {
    if (fs.existsSync(KILL_FILE)) fs.unlinkSync(KILL_FILE);
  } catch { /* best effort */ }
  console.log('[PhantomX] Kill switch reset' + (force ? ' (forced with CEO authorization)' : ''));
  return { success: true, message: 'Kill switch reset successfully.' };
}
