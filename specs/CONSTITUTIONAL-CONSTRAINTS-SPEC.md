# PhantomX Constitutional Constraints & Graduated Survival Tiers

**Spec ID**: PX-CONST-001
**Date**: 2026-03-18
**Author**: Steve Nahrup
**Inspired by**: [Conway Research / Automaton](https://github.com/Conway-Research/automaton)
**Status**: Draft — ready for implementation

---

## Problem Statement

PhantomX trading agents operate under risk rules scattered across `risk-params.json`, `kill-switch.ts`, and CLAUDE.md instructions. These rules are **advisory** — they live in prompt context and config files that agents can rationalize around under context pressure. The kill switch is also near-binary (inactive / close_only / killed) with no graduated behavioral degradation.

Two fundamental gaps:
1. **No immutable enforcement layer** — risk rules are "instructions," not "laws"
2. **No graduated degradation** — the system goes from full-speed to emergency-stop with no intermediate states

## Inspiration

Automaton's constitutional constraint hierarchy: three immutable laws that cannot be overridden by any prompt, self-modification, or child agent, enforced by a separate guardian process. Plus graduated survival tiers (normal → low_compute → critical → dead) that automatically adjust agent behavior based on resource state.

---

## Spec: Constitutional Constraints

### 1. Constitution File

Create `src/lib/trading/constitution.ts` — a module that exports immutable trading laws.

```typescript
// The Constitution — immutable trading laws
// These CANNOT be overridden by any agent, prompt, config, or API call.
// Enforced by the ConstitutionalGuard, not by the agents themselves.

export const CONSTITUTION = {
  version: '1.0.0',
  laws: [
    {
      id: 'LAW_1_NO_LIVE_WITHOUT_BOARD',
      text: 'No live orders may be placed without explicit board approval. Paper mode is the only default.',
      enforcement: 'reject_order',
      immutable: true,
    },
    {
      id: 'LAW_2_RISK_GATES_ARE_FINAL',
      text: 'If a risk gate rejects a trade, the trade dies. No retry, no override, no escalation path.',
      enforcement: 'reject_signal',
      immutable: true,
    },
    {
      id: 'LAW_3_KILL_SWITCH_IS_ABSOLUTE',
      text: 'When the kill switch activates, ALL positions flatten and ALL new entries are blocked. No exceptions.',
      enforcement: 'flatten_and_block',
      immutable: true,
    },
    {
      id: 'LAW_4_POSITION_SIZE_CEILING',
      text: 'No single position may risk more than 2% of equity. No combined exposure may exceed 3x equity.',
      enforcement: 'reject_order',
      immutable: true,
    },
    {
      id: 'LAW_5_COOLDOWN_IS_SACRED',
      text: 'After kill switch activation, 48h cooldown must elapse. Only CEO with force=true can override.',
      enforcement: 'reject_reset',
      immutable: true,
    },
  ],
} as const;
```

### 2. Constitutional Guard

Create `src/lib/trading/constitutional-guard.ts` — a **separate enforcement process** that wraps the trading pipeline.

```typescript
export class ConstitutionalGuard {
  // Runs BEFORE the pipeline processes any signal or order
  // This is NOT part of the agent — it's a gate the agent cannot bypass

  validateSignal(signal: TradingSignal): ConstitutionalVerdict;
  validateOrder(order: OrderRequest): ConstitutionalVerdict;
  validateReset(resetRequest: KillSwitchReset): ConstitutionalVerdict;

  // Integrity check — hash the constitution file and compare
  // If the hash doesn't match the known-good value, HALT everything
  verifyIntegrity(): boolean;
}

interface ConstitutionalVerdict {
  allowed: boolean;
  law?: string;        // which law blocked it
  reason?: string;     // human-readable explanation
  severity: 'info' | 'warning' | 'violation';
}
```

### 3. Integration Points

The ConstitutionalGuard wraps three chokepoints:

| Chokepoint | Current Location | Guard Check |
|------------|-----------------|-------------|
| Signal submission | `POST /api/trading` → `submit_signal` | `validateSignal()` before pipeline entry |
| Order placement | `src/lib/trading/execution-engine.ts` → `executeOrder()` | `validateOrder()` before ccxt call |
| Kill switch reset | `POST /api/trading` → `kill_switch reset` | `validateReset()` before state change |

### 4. Integrity Verification

On server startup and every 60 seconds:
- Hash the constitution laws array
- Compare against a hardcoded expected hash
- If mismatch → activate kill switch immediately, log `CONSTITUTIONAL_INTEGRITY_VIOLATION`
- This prevents any code path from modifying the constitution at runtime

---

## Spec: Graduated Survival Tiers

### 5. Tier Definitions

Replace the binary kill switch with a 5-tier graduated system in `src/lib/trading/survival-tiers.ts`:

```typescript
export enum SurvivalTier {
  NORMAL = 'normal',
  CAUTIOUS = 'cautious',
  DEFENSIVE = 'defensive',
  SURVIVAL = 'survival',
  DEAD = 'dead',
}

export const TIER_THRESHOLDS = {
  // Thresholds based on drawdown from high-water mark
  [SurvivalTier.NORMAL]:    { maxDrawdown: 0.00, minEquity: Infinity },
  [SurvivalTier.CAUTIOUS]:  { maxDrawdown: 0.05, minEquity: 140 },  // 5% drawdown
  [SurvivalTier.DEFENSIVE]: { maxDrawdown: 0.10, minEquity: 125 },  // 10% drawdown
  [SurvivalTier.SURVIVAL]:  { maxDrawdown: 0.15, minEquity: 110 },  // 15% drawdown (kill switch)
  [SurvivalTier.DEAD]:      { maxDrawdown: 0.35, minEquity: 100 },  // HALT threshold
} as const;
```

### 6. Behavioral Modifiers per Tier

| Tier | Position Sizing | Strategy Activation | New Entries | Monitoring |
|------|----------------|-------------------|-------------|------------|
| `normal` | 1.0x multiplier | All active strategies | Allowed | Standard heartbeat |
| `cautious` | 0.5x multiplier | No new strategy activations | Allowed, wider stops | 2x heartbeat frequency |
| `defensive` | 0.25x multiplier | Reduce-only, close winners | Close-only mode | 4x heartbeat, alert CEO |
| `survival` | 0x — no new positions | Flatten everything | Blocked | Continuous, CEO notified |
| `dead` | 0x | All halted | Blocked | Manual restart only |

### 7. Tier Evaluation

```typescript
export class SurvivalMonitor {
  // Runs on every portfolio update
  evaluateTier(portfolio: PortfolioState): SurvivalTier;

  // Returns behavioral modifiers for current tier
  getModifiers(tier: SurvivalTier): TierModifiers;

  // Tier transitions are logged and broadcast
  onTierChange(from: SurvivalTier, to: SurvivalTier): void;

  // Only CEO can manually override tier (up only, never down)
  overrideTier(newTier: SurvivalTier, auth: CEOAuth): void;
}

interface TierModifiers {
  sizingMultiplier: number;
  allowNewEntries: boolean;
  allowNewStrategies: boolean;
  heartbeatMultiplier: number;
  alertCEO: boolean;
  autoFlatten: boolean;
}
```

### 8. Integration with Existing Kill Switch

The survival tier system **subsumes** the existing kill switch:
- `SurvivalTier.SURVIVAL` = current `killed` mode
- `SurvivalTier.DEFENSIVE` = current `close_only` mode
- The file-based `.phantomx-kill` persists the current tier instead of just a mode string
- `isCloseOnlyMode()` → `getTier() === DEFENSIVE`
- `isFullyKilled()` → `getTier() >= SURVIVAL`
- Backward-compatible exports maintained

---

## Implementation Plan

### Phase 1: Constitutional Guard (1 session)
1. Create `src/lib/trading/constitution.ts` with immutable laws
2. Create `src/lib/trading/constitutional-guard.ts` with enforcement
3. Wire into `POST /api/trading` signal submission path
4. Wire into execution engine order placement
5. Wire into kill switch reset path
6. Add integrity verification on startup + interval

### Phase 2: Survival Tiers (1 session)
1. Create `src/lib/trading/survival-tiers.ts` with tier definitions
2. Create `SurvivalMonitor` class
3. Refactor `kill-switch.ts` to use tiers internally
4. Update `POST /api/trading` to apply tier modifiers
5. Update risk gate checks to respect tier multipliers
6. Add tier to `GET /api/risk/limits` response

### Phase 3: Dashboard Integration (0.5 session)
1. Add tier indicator to Mission Control StatusBar
2. Add constitutional violation log to AgentFeedPanel
3. Tier change notifications via existing heartbeat system

---

## Files Created/Modified

| File | Action |
|------|--------|
| `src/lib/trading/constitution.ts` | NEW — immutable laws |
| `src/lib/trading/constitutional-guard.ts` | NEW — enforcement gate |
| `src/lib/trading/survival-tiers.ts` | NEW — graduated tiers |
| `src/lib/kill-switch.ts` | MODIFY — refactor to use tiers |
| `src/app/api/trading/route.ts` | MODIFY — wire constitutional guard |
| `src/lib/trading/execution-engine.ts` | MODIFY — wire constitutional guard |
| `src/lib/trading/risk-manager.ts` | MODIFY — apply tier modifiers |
| `src/components/mission-control/StatusBar.tsx` | MODIFY — tier indicator |

---

## Success Criteria

- [ ] No order can bypass constitutional laws, even with direct API calls
- [ ] Constitution integrity check catches any runtime modification attempt
- [ ] Tiers transition automatically based on portfolio state
- [ ] Each tier applies correct behavioral modifiers
- [ ] Existing kill switch API remains backward-compatible
- [ ] CEO can override tiers upward (toward normal) but not downward
- [ ] All tier transitions are logged with timestamps
- [ ] Dashboard shows current tier and recent constitutional verdicts
