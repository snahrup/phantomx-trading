# API Routes Audit Report

**Date**: 2026-03-15
**Auditor**: silver-falcon session
**Scope**: All 5 API routes used by Mission Control
**Build status**: CLEAN (tsc --noEmit passes after all fixes)

---

## Executive Summary

| Route | Actions Audited | Bugs Fixed | Issues Documented |
|-------|:-:|:-:|:-:|
| `/api/trading` | 17 | 2 | 3 |
| `/api/phemex` | 22 | 8 | 2 |
| `/api/market/regime` | 1 | 0 | 1 |
| `/api/strategies/active` | 1 | 0 | 0 |
| `/api/risk/limits` | 1 | 0 | 0 |
| **TOTAL** | **42** | **10** | **6** |

**Severity breakdown**:
- CRITICAL: 1 (NaN propagation into trading pipeline)
- HIGH: 2 (missing input validation on financial parameters, missing `ai_close` handler)
- MEDIUM: 7 (missing symbol validation on exchange calls)
- LOW: 6 (informational / architectural recommendations)

---

## 1. `/api/trading/route.ts` — Trading Pipeline API

**File**: `src/app/api/trading/route.ts`
**Methods**: GET, POST (17 actions)
**Imports**: pipeline, tradingSignalBus, executionEngine, kill-switch, phemex/client, orchestrator

### Actions Audited

| Action | Error Handling | Input Validation | Response Shape | Verdict |
|--------|:-:|:-:|:-:|---------|
| `submit_signal` | OK | **FIXED** | OK | Had NaN propagation bug |
| `process` | OK | N/A | OK | Pass |
| `positions` | OK | N/A | OK | Pass |
| `signals` | OK | Partial | OK | `status` not validated against enum |
| `portfolio` | OK | N/A | OK | Pass |
| `kill_switch` | OK | OK | OK | Pass |
| `config` | OK | OK | OK | Pass |
| `close` | OK | **FIXED** | OK | Had NaN propagation bug |
| `history` | OK | OK | OK | Pass |
| `strategy_stats` | OK | N/A | OK | Pass |
| `whipsaw` | OK | OK | OK | Pass |
| `start_orchestrator` | OK | Partial | OK | No validation on `riskLevel` enum |
| `stop_orchestrator` | OK | N/A | OK | Pass |
| `pause_orchestrator` | OK | N/A | OK | Pass |
| `resume_orchestrator` | OK | OK | OK | Pass |
| `orchestrator_status` | OK | N/A | OK | Pass |
| `set_mode` | OK | OK | OK | Pass |

### Bugs Fixed

#### BUG-T1: NaN propagation in `submit_signal` (CRITICAL)

`Number("abc")` returns `NaN` which is a valid JS number type. The original code did:
```typescript
entry: Number(entry),
stop: Number(stop),
confidence: Number(confidence ?? 50),
```
If any of these received non-numeric strings, `NaN` would propagate through the entire trading pipeline -- risk gate, execution engine, P&L calculations, and database writes. NaN comparisons always return false, meaning risk checks like `signal.confidence >= config.minConfidence` would evaluate to false (rejecting the signal), but `entry` and `stop` could still corrupt the signal record in the database.

Additionally, `entry` was checked with `!entry` which would be true for `0` -- a valid (though unusual) price. Changed to `entry == null` for proper null/undefined check.

**Fix**: Added explicit `isFinite()` + range validation for `entry`, `stop`, and `confidence`. Added `direction` enum validation (`"long"` or `"short"`).

#### BUG-T2: NaN propagation in `close` action (HIGH)

Same pattern: `Number(exitPrice)` without NaN validation. A non-numeric `exitPrice` would produce NaN P&L stored in the database, corrupting trade statistics.

**Fix**: Added `isFinite()` + positive number validation for `exitPrice`.

### Issues Documented (Not Fixed)

#### ISSUE-T1: `signals` action — no status enum validation (LOW)

`body.status` is passed directly to `tradingSignalBus.getByStatus()` without validating it's a valid `TradingSignalStatus`. Invalid status values return empty results (not an error), so this is low severity.

**Recommendation**: Add validation: `if (status && !['pending','approved','rejected','executed','closed','expired'].includes(status))`.

#### ISSUE-T2: `start_orchestrator` — no riskLevel enum validation (LOW)

`body.riskLevel` accepts any string. The orchestrator uses it in issue descriptions and priority mapping. Invalid values won't crash but produce confusing agent prompts.

**Recommendation**: Validate against `['conservative','moderate','aggressive','degen']`.

#### ISSUE-T3: `config` action — no schema validation on updates (MEDIUM)

`pipeline.updateConfig(updates)` merges arbitrary keys into the pipeline config. While `mode: 'live'` is blocked, a caller could inject unexpected fields like `{ maxOpenPositions: -1 }` or `{ mode: 'paper', __proto__: { polluted: true } }`.

**Recommendation**: Whitelist allowed config keys and validate types. Prototype pollution risk is theoretical in this context (not user-facing API) but worth hardening.

---

## 2. `/api/phemex/route.ts` — Exchange Integration

**File**: `src/app/api/phemex/route.ts`
**Methods**: POST (22 actions)
**Imports**: phemex/client, kill-switch

### Actions Audited

| Action | Error Handling | Input Validation | Response Shape | Verdict |
|--------|:-:|:-:|:-:|---------|
| `check_env` | OK | N/A | OK | Pass |
| `connect` | OK | Partial | OK | No validation on `apiKey`/`secret` types |
| `connect_env` | **FIXED** | OK | OK | Was returning 200 on failure |
| `connect_and_verify` | OK (excellent) | OK | OK | Best error handling in codebase |
| `network` | OK | N/A | OK | Pass |
| `switch_network` | OK | OK | OK | Pass |
| `ticker` | OK | **FIXED** | OK | Missing symbol validation |
| `ohlcv` | OK | **FIXED** | OK | Missing symbol validation |
| `orderbook` | OK | **FIXED** | OK | Missing symbol validation |
| `account` | OK | N/A | OK | Pass |
| `positions` | OK | N/A (symbol optional) | OK | Pass |
| `open_orders` | OK | N/A (symbol optional) | OK | Pass |
| `create_order` | OK | OK (thorough) | OK | Pass — kill switch check correct |
| `cancel_order` | OK | **FIXED** | OK | Missing orderId + symbol validation |
| `cancel_all` | OK | OK | OK | Pass |
| `trades` | OK | **FIXED** | OK | Missing symbol validation |
| `symbols` | OK | N/A | OK | Pass |
| `markets` | OK | N/A | OK | Pass |
| `funding_rate` | OK | **FIXED** | OK | Missing symbol validation |
| `funding_rate_history` | OK | **FIXED** | OK | Missing symbol validation |
| `set_leverage` | OK | **FIXED** | OK | Missing symbol + leverage validation |
| `closed_orders` | OK | N/A (symbol optional) | OK | Pass |
| `close_position` | OK | OK | OK | Correctly skips kill switch |

### Bugs Fixed

#### BUG-P1: Missing symbol validation on 6 actions (MEDIUM)

`ticker`, `ohlcv`, `orderbook`, `funding_rate`, `funding_rate_history`, `trades` all passed `body.symbol` directly to ccxt without validation. If `symbol` was undefined, ccxt would throw a generic error caught by the outer try/catch, returning a 500 with "Internal server error" in production mode. Users would not know the request was malformed.

**Fix**: Added `if (!body.symbol || typeof body.symbol !== 'string')` checks returning 400 with clear error messages.

#### BUG-P2: Missing orderId + symbol validation on `cancel_order` (MEDIUM)

`cancel_order` passed `body.orderId` and `body.symbol` to `client.cancelOrder()` without validation. Both are required by Phemex.

**Fix**: Added validation for both parameters.

#### BUG-P3: Missing leverage validation on `set_leverage` (MEDIUM)

`set_leverage` accepted any value including negative numbers, strings, or values > 100. Phemex max leverage is 100x.

**Fix**: Added range validation (1-100, finite number).

#### BUG-P4: `connect_env` returns 200 on credential failure (LOW)

When env credentials are missing, `connect_env` returned `{ success: false, message: '...' }` with HTTP 200. The UI checks `success` field so this didn't cause visible bugs, but it violates REST conventions.

**Fix**: Changed to return 503 (Service Unavailable).

### Issues Documented (Not Fixed)

#### ISSUE-P1: Missing `ai_close` action handler (HIGH)

`TradeAnalytics.tsx` (line 268) calls `action: 'ai_close'` with `{ symbol, side, size, entryPrice }` and expects `{ success: true, aiPrice: number, aiReasoning: string }`. This action does NOT exist in the phemex route -- it falls through to the default case and returns `{ error: "Unknown action: ai_close" }` with 400.

This is likely a planned feature (AI-suggested close price with reasoning) that was never implemented on the backend. The UI handles the error gracefully (logs to console), but the "AI Close" button in TradeAnalytics is non-functional.

**Recommendation**: Either implement the `ai_close` action (would need LLM integration to generate close reasoning) or remove/disable the button in TradeAnalytics.tsx.

#### ISSUE-P2: `close_position` intentionally skips kill switch — correct but undocumented in route (LOW)

The kill switch design (kill-switch.ts line 58) explicitly states: "killed -- everything blocked except direct close_position". The phemex route correctly implements this by NOT checking the kill switch in `close_position`, while `create_order` does check it. However, this intentional design decision is not documented in the route itself.

**Recommendation**: Add a comment above `close_position` explaining the intentional kill switch bypass.

### Security Notes

- **Credential exposure**: `check_env` correctly returns `hasEnv: boolean` without exposing key values. `connect` accepts plaintext credentials from the client which is acceptable for a local-only trading app.
- **Kill switch bypass**: Only `close_position` and `cancel_all` bypass the kill switch. `create_order` correctly blocks in both `killed` and `close_only` modes (allowing reduce-only in close_only). This is well-implemented.
- **Rate limiting**: No server-side rate limiting. The app relies on ccxt's built-in `enableRateLimit: true`. For a local-only app this is acceptable, but if exposed to a network, API-level rate limiting should be added.

---

## 3. `/api/market/regime/route.ts` — Regime Classification

**File**: `src/app/api/market/regime/route.ts`
**Methods**: GET
**Imports**: phemex/client, regime-classifier, regime-router

### Actions Audited

| Action | Error Handling | Input Validation | Response Shape | Verdict |
|--------|:-:|:-:|:-:|---------|
| GET | OK | OK | OK | Pass |

**Analysis**:
- Error handling: Proper try/catch with error message extraction.
- Input validation: `limit` capped at 500 via `Math.min()`. Defaults for all params are sensible.
- Client check: Correctly returns 503 when Phemex not configured.
- Response shape: Returns `{ symbol, timeframe, candles, regime, strategies }` -- matches what agents consume.

### Issues Documented

#### ISSUE-R1: No caching for expensive OHLCV + indicator computation (LOW)

Every GET request fetches up to 500 candles from Phemex and runs the full regime classifier + strategy router. With the mission control polling at 10s intervals and multiple agent calls, this could hit Phemex rate limits.

**Recommendation**: Add a TTL cache (30-60 seconds per symbol+timeframe pair). The regime doesn't change faster than that.

---

## 4. `/api/strategies/active/route.ts` — Active Strategies

**File**: `src/app/api/strategies/active/route.ts`
**Methods**: GET
**Imports**: regime-router

### Actions Audited

| Action | Error Handling | Input Validation | Response Shape | Verdict |
|--------|:-:|:-:|:-:|---------|
| GET | OK | N/A | OK | Pass |

**Analysis**:
- Clean, simple endpoint. No external dependencies beyond the in-memory strategy registry.
- Error handling is correct.
- Response includes strategies, count, routing, and a helpful `note` field pointing to the regime endpoint.
- The neutral regime routing (ADX=0, confidence=0) is a reasonable default to show baseline strategy status.

---

## 5. `/api/risk/limits/route.ts` — Risk Limits

**File**: `src/app/api/risk/limits/route.ts`
**Methods**: GET
**Imports**: pipeline, executionEngine, kill-switch

### Actions Audited

| Action | Error Handling | Input Validation | Response Shape | Verdict |
|--------|:-:|:-:|:-:|---------|
| GET | OK | N/A | OK | Pass |

**Analysis**:
- Clean, well-structured response combining pipeline config, risk thresholds, kill switch state, and execution stats.
- All data is read-only -- no mutation paths.
- Error handling is correct.
- No input validation needed (no parameters).

---

## Cross-Cutting Concerns

### Error Handling Architecture (PASS)

All 5 routes follow the same pattern:
1. Outer try/catch around entire handler
2. Error message extraction: `err instanceof Error ? err.message : 'Unknown error'`
3. Appropriate HTTP status codes (400 client error, 403 forbidden, 404 not found, 409 conflict, 500 server error, 503 service unavailable)

The phemex route additionally masks error details in production mode (`NODE_ENV === 'production'`), which is correct.

### JSON Body Parsing (PASS)

All POST handlers use `await req.json()` which throws on malformed JSON. This is caught by the outer try/catch and returns 500. Could improve by catching JSON parse errors separately and returning 400, but this is low priority.

### Race Conditions (DOCUMENTED)

#### RACE-1: Orchestrator + manual pipeline process

If the orchestrator's tick calls `pipeline.processPending()` simultaneously with a manual `POST /api/trading { action: 'process' }`, the same pending signals could be processed twice. The execution engine generates a new UUID for each execution, so this would create duplicate trades for the same signal.

**Mitigation**: The trading signal bus's `updateStatus()` uses SQLite's single-writer lock, so the second call would find the signal already in `approved` or `executed` status and skip it. Risk is LOW but not zero (status check + update is not atomic).

#### RACE-2: Kill switch + order placement

A kill switch trigger between the kill switch check (line 184 of phemex route) and the actual `client.createOrder()` call could allow an order through. The execution engine has its own kill switch check right before placement (execution-engine.ts line 210), providing defense in depth.

### File I/O (PASS)

- `trading-mode.json` reads/writes in `set_mode` action: Properly handled with try/catch on both read and write.
- Kill switch file (`.phantomx-kill`): Handled in kill-switch.ts with try/catch on all read/write/unlink operations.
- No path traversal risk -- all paths use `join(process.cwd(), ...)` with hardcoded filenames.

### UI-API Response Shape Compatibility (VERIFIED)

| UI Component | API Call | Expected Shape | Match? |
|---|---|---|---|
| LaunchPanel | `POST /api/phemex { action: 'account' }` | `{ account: { balances, totalUsdValue } }` | YES |
| LaunchPanel | `POST /api/trading { action: 'set_mode' }` | `{ mode, updated }` | YES |
| LaunchPanel | `POST /api/trading { action: 'start_orchestrator' }` | `{ started, status }` | YES |
| LaunchPanel | `POST /api/trading { action: 'config' }` | `{ config }` | YES |
| StatusBar | `POST /api/trading { action: 'kill_switch' }` | `{ triggered, ...killState }` | YES |
| StatusBar | `POST /api/trading { action: 'stop_orchestrator' }` | `{ stopped, status }` | YES |
| StatusBar | `POST /api/trading { action: 'set_mode' }` | `{ mode, updated }` | YES |
| StatusBar | `POST /api/trading { action: 'resume_orchestrator' }` | `{ resumed, status }` | YES |
| StatusBar | `POST /api/trading { action: 'pause_orchestrator' }` | `{ paused, status }` | YES |
| useMissionPolling | `POST /api/phemex { action: 'positions' }` | `{ positions }` | YES |
| useMissionPolling | `POST /api/phemex { action: 'account' }` | `{ account: { totalUsdValue } }` | YES |
| useMissionPolling | `POST /api/trading { action: 'orchestrator_status' }` | `{ symbols, ... }` | YES |
| useMissionPolling | `POST /api/phemex { action: 'ohlcv' }` | `{ ohlcv: [...] }` | YES |
| TradeAnalytics | `POST /api/phemex { action: 'ai_close' }` | `{ success, aiPrice, aiReasoning }` | **NO** (handler missing) |

---

## Summary of Fixes Applied

1. **BUG-T1** (CRITICAL): Added NaN/range validation for `entry`, `stop`, `confidence` in `submit_signal`. Added `direction` enum validation.
2. **BUG-T2** (HIGH): Added NaN/range validation for `exitPrice` in `close` action.
3. **BUG-P1** (MEDIUM): Added `symbol` validation to `ticker`, `ohlcv`, `orderbook`, `funding_rate`, `funding_rate_history`, `trades`.
4. **BUG-P2** (MEDIUM): Added `orderId` + `symbol` validation to `cancel_order`.
5. **BUG-P3** (MEDIUM): Added `symbol` + leverage range validation to `set_leverage`.
6. **BUG-P4** (LOW): Changed `connect_env` failure response from 200 to 503.

## Open Items Requiring Deeper Work

1. **ISSUE-P1** (HIGH): Implement `ai_close` action in phemex route, or remove the dead button from TradeAnalytics.tsx.
2. **ISSUE-T3** (MEDIUM): Add config update key whitelist + type validation to prevent injection.
3. **ISSUE-R1** (LOW): Add TTL cache to `/api/market/regime` to reduce Phemex rate limit pressure.
4. **ISSUE-T1** (LOW): Add status enum validation to `signals` action.
5. **ISSUE-T2** (LOW): Add riskLevel enum validation to `start_orchestrator`.
6. **ISSUE-P2** (LOW): Add documentation comment to `close_position` explaining intentional kill switch bypass.
