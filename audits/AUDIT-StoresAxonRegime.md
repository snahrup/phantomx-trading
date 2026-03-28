# Audit: Stores, Axon Integration, Regime/Strategy Modules

**Date**: 2026-03-15
**Auditor**: Steve Nahrup
**Scope**: trading-store, axon-store, axon client/SSE/bridge/types, regime-classifier, regime-router, condition-evaluator

---

## Executive Summary

The data backbone is solid. Array growth is capped throughout, SSE reconnection logic is well-implemented with exponential backoff + daemon health monitor, and the regime classifier matches the documented priority order. Three bugs were found and fixed in-place: a 100x threshold error in the funding rate carry strategy gate, a stale comment in the type definition, and a formatting bug in the regime router's reasoning output.

**Bugs fixed**: 3
**Design issues flagged**: 6
**Clean files (no issues)**: 4

---

## File-by-File Audit

### 1. `src/store/trading-store.ts` — Main Trading State

**Verdict**: CLEAN (design notes only)

**Strengths**:
- All append actions cap array length (aiMessages: 200, annotations: 100, equitySnapshots: 500, etc.) -- no unbounded growth
- Credentials (`apiKey`, `apiSecret`) correctly excluded from persistence via `partialize`
- Pipeline state (`pipelineState`, `pipelineRunning`, `pipelineSymbol`) correctly NOT persisted -- transient streaming state
- OHLCV `appendOHLCV` caps at 500 candles, handles same-timestamp updates (live candle replace)
- Migration chain covers v2 through v17, handles removed tabs and new fields
- `setKilled` properly wires kill state + reason

**Design Notes**:
- **D1: Store is very large (~280 state fields + ~100 actions)**. This is a monolith store. Not a bug, but if performance becomes an issue, Zustand's `useShallow` or splitting into slices would help. The `partialize` config already prevents excessive localStorage writes.
- **D2: No global reset action for kill switch or new mission**. When `isKilled` fires, there is no single action to reset transient trading state (positions, signals, pipeline). The kill switch sets a flag but doesn't clear stale market data. The mission start flow relies on individual `set*` calls from the UI -- a `resetMissionState()` action would be safer.
- **D3: `agentSignals`, `agentStatuses`, `signalConsensus` defined as state + actions mixed into the flat object** (lines 747-758). Not a bug, but these are legacy multi-agent fields that overlap with axon-store's agent model. They're not connected to Axon at all.

**No circular dependencies detected** -- the store imports only from `@/types/*`.

---

### 2. `src/store/axon-store.ts` — Axon Agent State

**Verdict**: CLEAN (design notes only)

**Strengths**:
- All event arrays capped via `cap()` helper (agentEvents: 100, chatMessages: 200)
- Dynamic import of trading-store in `fetchActivity` avoids circular dependency
- Polling fallback activates when SSE disconnects, stops when SSE reconnects
- Daemon health monitor uses adaptive intervals (5s offline, 15s after 5 failures, 30s when healthy)
- `justReconnected` flash with auto-clear timer for UI feedback
- Activity merge logic preserves SSE-only events not yet indexed by REST API

**Design Notes**:
- **D4: Timer references stored in state (`_pollTimer`, `_healthMonitorTimer`, `_reconnectedTimer`)**. These are `setInterval`/`setTimeout` handles stored as Zustand state, which means they get serialized if anyone tries to `JSON.stringify(getState())`. Not a bug (the store isn't persisted), but these should ideally be module-level variables. The `_` prefix convention signals "private" correctly.
- **D5: `fetchCompanyStatus` overwrites `agents` and `issues` arrays entirely**. If SSE events arrive between REST calls, they could be lost on the next `fetchCompanyStatus` call. Unlikely to cause visible issues due to the debounced issue refresh, but worth noting.

**No memory leaks detected** -- `_stopPolling` and `_stopDaemonMonitor` both clear timers, and the bridge cleanup calls both.

---

### 3. `src/lib/axon/client.ts` — REST Client

**Verdict**: CLEAN

**Strengths**:
- Uses `127.0.0.1` not `localhost` to avoid IPv6 resolution issues (documented with comment)
- Health endpoint correctly uses `rootUrl` (not `/api` prefix) via `useRootUrl = true`
- Company-scoped vs agent-scoped endpoints correctly separated with comments
- Error handling extracts `detail` from JSON error responses, falls back to raw text
- Singleton via `globalThis` survives Next.js HMR
- `AxonResult<T>` discriminated union forces callers to check `ok` before accessing `data`

**No hardcoded URLs** beyond the default `127.0.0.1:8400/api` which is correct.
**No missing error handling** -- all methods go through `request()` which catches and wraps errors.

---

### 4. `src/lib/axon/event-source.ts` — SSE Connection

**Verdict**: CLEAN

**Strengths**:
- Exponential backoff: 1s -> 2s -> 4s -> 8s -> 15s (capped)
- Backoff resets on successful connection
- `intentionalClose` flag prevents reconnect after deliberate `disconnect()`
- Named SSE event listeners (not just `onmessage`) -- matches backend's `event:` field pattern
- Handles both wrapped `{type, data}` and raw object payloads from backend
- `removeAllHandlers()` available for complete cleanup
- Singleton via `globalThis`

**No memory leaks** -- `disconnect()` clears retry timer and closes EventSource. Handler unsubscribe functions returned from `on()`/`onAll()`.

---

### 5. `src/lib/axon/store-bridge.ts` — SSE to Zustand Routing

**Verdict**: CLEAN (design note only)

**Strengths**:
- Prevents double-wiring via `_cleanup` guard
- All 5 SSE event types routed: `connection`, `agent_status`, `heartbeat_log`, `issue_update`, `activity`
- Issue update triggers debounced full refresh (2s) to catch cascading changes
- Initial data fetch on bridge setup (health, agents, issues, activity)
- Starts daemon health monitor for auto-reconnection
- Clean cleanup: unsubscribes all handlers, disconnects SSE, stops polling, stops monitor

**Design Note**:
- **D6: `heartbeat_decision` event type is registered in `event-source.ts` NAMED_EVENTS but has NO handler in the bridge**. The event source will parse it, but no typed handler is wired, so events are silently dropped. This is either intentional (decisions are embedded in heartbeat_log detail_json) or a missing handler. If the backend starts sending standalone `heartbeat_decision` events, they will be lost.

---

### 6. `src/lib/axon/types.ts` — Type Definitions

**Verdict**: CLEAN

Complete type coverage for all Axon API endpoints. `AxonResult<T>` discriminated union is well-designed. SSE event types match what the event source registers. No issues.

---

### 7. `src/lib/market/regime-classifier.ts` — Regime Classification

**Verdict**: CLEAN (code correct, type definition comment was stale)

**Priority order matches documented spec**:
1. ADX > 30 -> trending (up/down based on trend strength) -- CORRECT
2. volPercentile > 80 OR atrPct > 3 -> volatile -- CORRECT
3. ADX < 20 AND bbWidth < 0.04 -> ranging -- CORRECT
4. ADX 20-30 -> transitional (mapped to trending or ranging based on trend strength) -- CORRECT
5. Fallback -> ranging with low confidence -- CORRECT

**ADX thresholds**: 30 for trending, 20 for ranging -- MATCHES knowledge/regime-schema.json spec.

**Bug fixed** (in `src/types/trading.ts` line 1085):
```
// BEFORE: adx: number; // ADX value (>25 = trending)
// AFTER:  adx: number; // ADX value (>30 = trending)
```
The comment was stale from before the CEO corrected the ADX threshold from 25 to 30.

**Note**: The `ema()` function in the classifier computes EMA from index 0 (full-history seeding), which is a valid approach but differs from the standard "SMA seed then EMA" method used in `computeEMA` in `chart/indicators.ts`. For regime classification purposes this is fine -- the ADX calculation is described as a "single-pass approximation" and the small numerical difference does not affect regime decisions at the 20/30 thresholds.

---

### 8. `src/lib/strategy/regime-router.ts` — Strategy-Regime Mapping

**Verdict**: 2 BUGS FIXED

**Bug B1 -- Funding rate threshold 100x too negative** (FIXED):
```typescript
// BEFORE: { type: 'funding_negative', threshold: -0.01, description: 'Funding rate < -0.01% per 8h' }
// AFTER:  { type: 'funding_negative', threshold: -0.0001, description: 'Funding rate < -0.01% per 8h' }
```
The ccxt library returns funding rate as a decimal (e.g., -0.00134 for -0.134%). The description says the gate should be -0.01% per 8h, which is -0.0001 as a decimal. The old threshold of -0.01 means -1%, which would virtually never trigger. This made the FRC v1.0 strategy permanently disabled even with deeply negative funding. Since `fundingRate` in `marketData` is currently always `undefined` (scanner-pipeline.ts line 209), this bug was dormant -- but it would bite the moment funding data is wired in.

**Bug B2 -- Threshold display in reasoning message** (FIXED):
```typescript
// BEFORE: `...funding ${(marketData.fundingRate * 100).toFixed(4)}% >= ${cond.threshold}% ...`
// AFTER:  `...funding ${(marketData.fundingRate * 100).toFixed(4)}% >= ${(cond.threshold * 100).toFixed(4)}% ...`
```
The reasoning message displayed the raw decimal threshold as a percentage without converting. Would show "PAUSE: funding -0.1340% >= -0.0001%" instead of the misleading "PAUSE: funding -0.1340% >= -0.0001%".

**Strategy-regime mappings verified**:
| Strategy | Allowed Regimes | Additional Conditions | Correct? |
|----------|----------------|----------------------|----------|
| EMA Ribbon v2.0 | trending_up, trending_down | ADX > 30 | Yes -- matches classifier |
| EFR v1.0 | volatile | RSI < 35, ATR > 1.5x avg | Yes -- volatile regime gate is correct |
| FRC v1.0 | volatile, ranging, trending_up | funding < -0.01% | Yes (after fix) |
| LSR v1.0 | ranging, volatile | ADX < 20 | Yes -- matches classifier ranging threshold |

**Note on EFR and volatile regime**: The MEMORY.md Heartbeat 12 flags that the classifier checks trending (ADX>30) BEFORE volatile, meaning EFR can never fire in strong downtrends even with extreme fear. This is by design (the regime classifier's priority order is intentional), but it means EFR is limited to situations where ADX < 30 AND vol percentile > 80. The router correctly maps EFR to 'volatile' only.

---

### 9. `src/lib/strategy/condition-evaluator.ts` — Condition Evaluation

**Verdict**: CLEAN

**All operator types handled**:
- `above`, `below`, `equals` -- simple comparisons, NaN-safe
- `crosses_above`, `crosses_below` -- correctly checks previous bar, NaN-safe, guards barIndex < 1
- `equals` uses epsilon (0.0001) -- appropriate for float comparison

**All indicator types computed**:
- SMA, EMA, RSI, BB (upper/middle/lower), VWAP, ATR, MACD (line/signal/histogram), ADX (adx/DI+/DI-), VOLUME_SMA
- Raw price fields always included: CLOSE, OPEN, HIGH, LOW, VOLUME
- Unsupported types gracefully fill with NaN (no crash)

**Recursive ConditionGroup evaluation**: Correctly handles nested AND/OR groups via `isConditionGroup()` type guard. Empty condition groups return `false` (safe default).

**`resolveValue` handles**: exact key match, case-insensitive match, numeric string parsing, literal numbers. Comprehensive.

**Indicator types NOT computed but defined in `IndicatorType`**: WMA, DEMA, TEMA, CCI, STOCH, STOCHRSI, OBV, ICHIMOKU, SUPERTREND, DONCHIAN, ATR_BANDS, EMA_RIBBON, PIVOT, EMA_CROSS, RSI_DIVERGENCE, CANDLE_PATTERNS, SWING_POINTS, MACD_HIST_FLIP, RSI_REVERSAL, VOLUME_PROFILE. These all fall through to the `default` case and fill with NaN, which is safe but means strategies using these indicators would silently never match conditions. This is acceptable since none of the 4 active strategies use these indicator types.

---

## Summary of Changes Made

| File | Change | Type |
|------|--------|------|
| `src/types/trading.ts:1085` | Comment `>25 = trending` -> `>30 = trending` | Doc fix |
| `src/lib/strategy/regime-router.ts:52` | FRC threshold `-0.01` -> `-0.0001` | Bug fix (B1) |
| `src/lib/strategy/regime-router.ts:116` | Threshold display `${cond.threshold}%` -> `${(cond.threshold * 100).toFixed(4)}%` | Bug fix (B2) |

## Recommendations (Not Actioned)

1. **Add `resetMissionState()` to trading-store** that clears positions, signals, pipeline, and transient market data when a new mission starts or kill switch fires (D2).
2. **Wire `heartbeat_decision` handler** in store-bridge if the Axon backend sends standalone decision events, or remove it from NAMED_EVENTS if decisions are always embedded in heartbeat_log (D6).
3. **Wire `fundingRate` into scanner-pipeline.ts** (currently hardcoded `undefined` at line 209) so the FRC strategy gate actually evaluates.
4. **Consider splitting trading-store** into domain slices (market, strategy, research, UI) if render performance degrades (D1).
