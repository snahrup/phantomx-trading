// ============================================================================
// PhantomX — Global Kill Switch (Server-Side Singleton)
// Survives hot reloads via globalThis. Checked by ALL order-placement paths.
// ============================================================================

import fs from 'fs';
import path from 'path';

const KILL_FILE = path.join(process.cwd(), '.phantomx-kill');

interface KillState {
  isKilled: boolean;
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
        globalForKill.__phantomxKill = {
          isKilled: true,
          reason: raw.reason ?? 'persisted from previous session',
          triggeredAt: raw.triggeredAt ?? null,
        };
        console.log('[PhantomX] Kill switch restored from file:', raw.reason);
        return globalForKill.__phantomxKill;
      }
    } catch { /* ignore corrupt file */ }
    globalForKill.__phantomxKill = { isKilled: false, reason: null, triggeredAt: null };
  }
  return globalForKill.__phantomxKill;
}

export function isKillSwitchActive(): boolean {
  return getState().isKilled;
}

export function getKillState(): KillState {
  return { ...getState() };
}

export function triggerKillSwitch(reason: string): void {
  const state = getState();
  state.isKilled = true;
  state.reason = reason;
  state.triggeredAt = Date.now();
  // Persist to file (CRIT-11)
  try {
    fs.writeFileSync(KILL_FILE, JSON.stringify({ reason, triggeredAt: state.triggeredAt }));
  } catch { /* best effort */ }
  console.log(`[PhantomX] KILL SWITCH TRIGGERED: ${reason}`);
}

export function resetKillSwitch(): void {
  const state = getState();
  state.isKilled = false;
  state.reason = null;
  state.triggeredAt = null;
  try {
    if (fs.existsSync(KILL_FILE)) fs.unlinkSync(KILL_FILE);
  } catch { /* best effort */ }
  console.log('[PhantomX] Kill switch reset');
}
