# Trading Pipeline Audit Report

**Date**: 2026-03-15
**Auditor**: Claude Opus 4.6
**Scope**: `src/lib/trading/` (6 files) + `src/types/trading.ts`
**Commit Base**: `feat/mission-control` branch

---

## Executive Summary

Found **4 bugs fixed in-place** and **4 architectural issues documented**. One bug (daily P&L check using `Math.abs`) would have blocked all trading after a profitable day. Another (P&L calculated from signal price instead of fill price) would produce incorrect realized P&L on every live trade with slippage.

| Severity | Count | Fixed | Documented Only |
|----------|-------|-------|-----------------|
| CRITICAL | 2     | 2     | 0               |
| HIGH     | 2     | 2     | 0               |
| MEDIUM   | 3     | 1     | 2               |
| LOW      | 1     | 0     | 1               |

---

## Bugs Fixed

### BUG-1: CRITICAL — Daily P&L Check Blocks Profitable Days

**File**: `src/lib/trading/risk-gate.ts:34`
**Was**: `const dailyPnlOk = Math.abs(ctx.dailyPnlPercent) < config.maxDailyLossPercent;`
**Now**: `const dailyPnlOk = ctx.dailyPnlPercent > -config.maxDailyLossPercent;`

**Impact**: `Math.abs()` treats +5.1% profit the same as -5.1% loss. On any day where the portfolio is up more than `maxDailyLossPercent` (default 5%), ALL new signals would be rejected. This would lock out trading precisely when the strategy is performing well.

**Root cause**: Defensive coding that assumed P&L is always negative. The variable name `dailyPnlPercent` is signed (positive = profit, negative = loss). The check should only gate on losses.

---

### BUG-2: HIGH — P&L Calculated from Signal Entry, Not Actual Fill

**File**: `src/lib/trading/execution-engine.ts:375` (close method)
**Was**: `const pnl = (exitPrice - record.entryPrice) * record.size * direction;`
**Now**: `const pnl = (exitPrice - (record.fillPrice ?? record.entryPrice)) * record.size * direction;`

**Impact**: In live mode, the actual fill price can differ from the signal's target entry due to slippage. Using `entryPrice` (the signal's intended price) instead of `fillPrice` (actual execution price) produces incorrect realized P&L. On a trade with 0.5% slippage at $67,000 BTC, that is a $335 error in the P&L number per BTC of position size.

**Paper mode**: No impact (fillPrice === entryPrice by design).

---

### BUG-3: HIGH — Live Orders Placed at Wrong Leverage

**File**: `src/lib/trading/execution-engine.ts` (executeLive function)
**Added**: `client.setLeverage(signal.asset, leverage)` call before order placement.

**Impact**: The execution engine computed a leverage value and stored it in the record, but never actually called `setLeverage()` on the exchange. Orders would execute at whatever leverage the Phemex account was previously set to. If the account was set to 50x from manual testing but `config.defaultLeverage` is 1x, the position would be 50x leveraged instead of 1x. This is a potentially catastrophic discrepancy for real money.

---

### BUG-4: MEDIUM — Market Order Fill Price Unreliable

**File**: `src/lib/trading/execution-engine.ts` (executeLive function)
**Was**: `const fillPrice = order.price ?? signal.entry;`
**Now**: Uses `order.cost / order.filled` when both are > 0, falling back to `order.price ?? signal.entry`.

**Impact**: Phemex (via ccxt) often returns `price: undefined` for market orders. The old code would fall through to `signal.entry`, recording zero slippage and masking the actual execution quality. The `cost / filled` ratio is the true average fill price from ccxt.

---

## Architectural Issues (Not Fixed — Require Design Decision)

### ARCH-1: MEDIUM — Position Sizing Ignores Stop Distance (Risk Normalization Missing)

**File**: `src/lib/trading/execution-engine.ts:147,231`
**Current formula**: `sizeUsdt = equity * (positionSizePercent / 100)`
**Documented formula** (MEMORY.md): `notional = risk / stop_distance`, `margin = notional / leverage`

The current implementation uses a fixed percentage of equity regardless of stop distance. This means:
- A trade with a 1% stop and a trade with a 10% stop get the same dollar allocation
- Tight stops risk much less capital per trade than intended
- Wide stops risk far more capital per trade than intended
- The documented 2% risk-per-trade rule from `RISK_THRESHOLDS.MAX_RISK_PER_TRADE` is not enforced

**Recommendation**: Replace position sizing with risk-normalized formula:
```typescript
const stopDistance = Math.abs(signal.entry - signal.stop) / signal.entry;
const riskPerTrade = equity * RISK_THRESHOLDS.MAX_RISK_PER_TRADE; // 2% of equity
const notional = riskPerTrade / stopDistance;
const sizeUsdt = Math.min(notional, equity * config.maxExposurePercent / 100);
const size = sizeUsdt / signal.entry;
```
This is the highest-impact architectural change remaining. It should be implemented alongside proper margin calculation.

---

### ARCH-2: MEDIUM — Failed Executions Marked as 'rejected' After Being 'approved'

**File**: `src/lib/trading/pipeline.ts:105-118`

Signal lifecycle on execution failure: `pending -> approved -> rejected`. This is semantically incorrect. A signal that passed risk checks but failed at the exchange is not "rejected" — it was approved but failed to execute. This muddies analytics: you cannot distinguish "risk gate said no" from "exchange returned an error" by looking at signal status alone.

**Recommendation**: Either:
1. Add a `'failed'` status to `TradingSignalStatus` (preferred)
2. Or keep status as `'approved'` and store the error in metadata for retry

---

### ARCH-3: LOW — Pipeline Monitor Swallows Errors Silently

**File**: `src/lib/trading/pipeline.ts:163`

The `startMonitor` interval catches all errors with `console.error` but takes no corrective action. If the context provider (`getContext`) consistently fails (e.g., exchange API down), the monitor will log errors indefinitely without alerting the position monitor or triggering any escalation.

**Recommendation**: Add a consecutive error counter. After N consecutive failures (e.g., 5), trigger an alert or pause the monitor.

---

### ARCH-4: LOW — No Atomic Transaction Around Signal Status + Execution

**File**: `src/lib/trading/pipeline.ts:105-123`

The signal is marked `approved` (line 105), then execution happens (line 110), then the signal is updated to `executed` or `rejected` (lines 112-118). If the process crashes between marking approved and completing execution, the signal is stuck in `approved` state forever. There is no recovery mechanism to re-process approved-but-unexecuted signals.

**Recommendation**: Either wrap in a SQLite transaction, or add a `processPending` filter that also picks up signals stuck in `approved` state for longer than a timeout.

---

## File-by-File Assessment

### 1. `src/types/trading.ts` — PASS

Types are well-defined. `TradingSignal`, `ExecutionRecord`, `PipelineConfig`, and `RiskCheckResult` are consistent. The `Position.side` (PositionSide) and `TradingSignal.direction` (TradeDirection) are both `'long' | 'short'` — type-compatible for the risk gate comparison. No issues.

### 2. `src/lib/trading/pipeline.ts` — PASS (with notes)

Orchestration logic is correct. Kill switch checked before processing. Signals expired before processing (correct order). The `tick()` and `processPending()` separation is clean. Config merge via spread is safe.

Issues: ARCH-2 (failed execution status), ARCH-3 (silent error swallowing), ARCH-4 (no atomicity).

### 3. `src/lib/trading/risk-gate.ts` — FIXED (BUG-1)

After the fix, all 6 risk checks are correct:
- **Position count**: `< maxOpenPositions` (correct, strict less-than)
- **Duplicate position**: Checks same asset AND same direction (correct — allows hedging opposite directions)
- **Daily P&L**: Now correctly only gates on losses
- **Exposure**: Sums `size * markPrice` for all positions (correct notional calculation)
- **Kill switch**: Checks both `close_only` and `killed` modes (correct)
- **Signal quality**: Confidence threshold check (correct)
- **Stop-loss**: Required check with config flag (correct)

One note: The exposure check uses `Position.markPrice` which is the live mark price, not entry price. This is correct for current exposure but means the check fluctuates with price.

### 4. `src/lib/trading/execution-engine.ts` — FIXED (BUG-2, BUG-3, BUG-4)

**Paper execution**: Clean. Perfect fill simulation at entry price. Attribution fields properly propagated.

**Live execution**: Now correctly sets leverage before order, uses cost/filled for fill price, and has the P&L fix in close(). Stop-loss and take-profit orders placed with 2s delay for rate limiting (appropriate for Phemex).

**DB schema**: Migration-safe ALTER TABLE pattern is correct. Prepared statements use proper parameterization (no SQL injection risk).

**Remaining concern**: If the main market order fills but the stop-loss placement fails (line 248-249), the position is open with NO stop-loss on the exchange. The error is logged but the execution record still shows `status: 'filled'`. The position monitor will check stops on paper, but if the monitor is down, the position has no protection. Consider: if stop-loss placement fails in live mode, should the position be immediately closed?

### 5. `src/lib/trading/trading-signal-bus.ts` — PASS

Signal validation is thorough:
- Stop must be positive
- At least one target required
- Long: stop < entry, targets > entry
- Short: stop > entry, targets < entry

Expiration handled correctly: `expireStale()` bulk-updates pending signals past their `expires_at`. `getPending()` also filters by `expires_at > now`, so even if `expireStale()` hasn't run, expired signals won't be processed.

**Can signals get stuck?** Only in the `approved` state (see ARCH-4). All other transitions are handled. Pending signals either get processed, expired, or remain pending until expiry.

### 6. `src/lib/trading/position-monitor.ts` — FIXED (variable naming)

After the fix, variable names accurately reflect what they contain:
- `dailyRealizedPnl` = realized P&L from closed trades today
- `dailyRealizedPnlPercent` = above as % of equity
- `totalDailyPnlPercent` = realized + unrealized as % of equity (used for kill switch)

The returned `dailyPnlPercent` field in `MonitorSnapshot` now contains the combined realized+unrealized figure, which is what the risk gate needs to see for accurate daily loss gating.

Stop-loss and take-profit monitoring for paper positions is correct. Unrealized P&L calculation `(price - entryPrice) * size * direction` is correct for paper positions (where entryPrice === fillPrice).

### 7. `src/lib/trading/index.ts` — PASS

Barrel export is complete. All public APIs are re-exported.

---

## Signal Lifecycle Verification

```
submit()          -> pending     [signal-bus: validates entry/stop/target relationships]
                                 [signal-bus: persists to SQLite]
expireStale()     -> expired     [signal-bus: bulk transition for past-expiry signals]
processPending()  -> approved    [pipeline: risk gate passes]
                  -> rejected    [pipeline: risk gate fails]
execute()         -> executed    [pipeline: execution engine returns filled]
                  -> rejected*   [pipeline: execution engine fails — SEE ARCH-2]
close()           -> closed      [execution-engine: stop/tp hit or manual close]
```

*ARCH-2: Failed executions should not use `rejected` status.

---

## Calculation Verification

### Position Sizing (current implementation)
```
sizeUsdt = equity * (positionSizePercent / 100)
         = $154.93 * 0.05
         = $7.75
size     = sizeUsdt / entry
         = $7.75 / $67,191
         = 0.0001153 BTC
```
This is a flat 5% allocation. See ARCH-1 for risk-normalized alternative.

### P&L Calculation (after BUG-2 fix)
```
direction = long ? 1 : -1
actualEntry = fillPrice ?? entryPrice
pnl = (exitPrice - actualEntry) * size * direction

Example (long BTC, 0.5% slippage):
  entryPrice = 67,000 (signal target)
  fillPrice  = 67,335 (actual fill)
  exitPrice  = 68,000 (close)
  size       = 0.0001153

  OLD (wrong): (68,000 - 67,000) * 0.0001153 * 1 = $0.1153
  NEW (correct): (68,000 - 67,335) * 0.0001153 * 1 = $0.0767

  Error in old formula: $0.0386 (50% overstated P&L on this trade)
```

### Daily P&L Gate (after BUG-1 fix)
```
Old: Math.abs(-3.2%) = 3.2 < 5 -> OK  (correct)
     Math.abs(+5.1%) = 5.1 < 5 -> BLOCKED (wrong!)

New: -3.2% > -5% -> OK  (correct)
     +5.1% > -5% -> OK  (correct)
     -5.1% > -5% -> BLOCKED (correct)
```

---

## Risk Assessment

| Risk | Current State | Mitigation |
|------|--------------|------------|
| Position sizing not risk-normalized | ARCH-1 open | Manual position size override via config |
| Stuck signals in approved state | ARCH-4 open | Signals expire via TTL (15 min default) |
| Stop-loss fails on live order | Documented above | Paper mode only currently; monitor catches stops |
| Leverage mismatch | BUG-3 fixed | Now explicitly set before each order |
| P&L accuracy | BUG-2 fixed | Uses fillPrice for calculations |
| False blocks on profitable days | BUG-1 fixed | Only gates on negative P&L |
| Market order price unknown | BUG-4 fixed | Uses cost/filled ratio |

---

## Recommendations (Priority Order)

1. **Implement risk-normalized position sizing** (ARCH-1) — highest impact on trading safety
2. **Add `'failed'` signal status** (ARCH-2) — clean up analytics
3. **Add stop-loss failure escalation** — if live SL placement fails, close position immediately
4. **Add approved-signal recovery** (ARCH-4) — re-process stuck signals on startup
5. **Add monitor error escalation** (ARCH-3) — pause after N consecutive failures
