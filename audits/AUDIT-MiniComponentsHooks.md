# Audit: Mission Control Mini Components & Hooks

**Date**: 2026-03-15
**Auditor**: Claude Code (Opus 4.6)
**Branch**: feat/mission-control
**Scope**: 6 files in `src/components/mission-control/`

---

## Summary

| File | Bugs Found | Fixed | Backend Issues |
|------|-----------|-------|----------------|
| MiniChartStrip.tsx | 0 | 0 | 0 |
| MiniChartCard.tsx | 0 | 0 | 0 |
| TokenSelector.tsx | 1 | 1 | 0 |
| TradeCloseCard.tsx | 1 | 1 | 0 |
| useMissionPolling.ts | 1 | 1 | 1 |
| useAgentChartOverlays.ts | 0 | 0 | 0 |

**Total: 3 bugs fixed, 1 backend note documented**

---

## 1. MiniChartStrip.tsx

**Status: CLEAN**

### Analysis
- Pure rendering component; no async operations, no effects, no intervals.
- All state read via Zustand selectors (stable, no stale closures).
- `agentActiveSymbols` correctly read from store and filtered against position set.
- `maxPositions` drives slot calculation — verified `missionControlConfig.maxConcurrentPositions` exists in store (line 278 of trading-store.ts).
- Key usage is correct: position cards use `pos.symbol`, agent slots use `agent-${symbol}`, empty slots use index (safe because empty slots are structural, not reorderable).

### Verified Store Bindings
- `positions` -> `Position[]` -- matches `pos.symbol`, `pos.side`, `pos.leverage`, `pos.unrealizedPnl`, `pos.entryPrice` usage.
- `pos.side === 'long'` maps to `PositionSide = 'long' | 'short'` -- correct.
- `pos.leverage ?? 50` -- Position.leverage is `number` (not optional), but the fallback is harmless defensive coding.

---

## 2. MiniChartCard.tsx

**Status: CLEAN**

### Analysis
- Stateless component with `useMemo` for sparkline SVG path and entry marker.
- No effects, no async, no intervals.
- `priceHistory.length < 2` guard prevents divide-by-zero in sparkline (divisor = `priceHistory.length - 1`).
- `Math.min(...priceHistory)` / `Math.max(...)` could blow the stack on extremely large arrays, but `priceHistory` is capped at 50 entries (OHLCV limit in useMissionPolling), so this is safe.
- Entry price marker uses 0.1% tolerance for price matching -- reasonable for sparkline resolution.
- `Number.isFinite()` guards on pnl and entryPrice prevent NaN rendering.
- `closeFlash` animation uses framer-motion correctly; no cleanup needed (declarative animation).

### Type Check
- Props `direction: 'LONG' | 'SHORT'` matches the ternary in MiniChartStrip (`pos.side === 'long' ? 'LONG' : 'SHORT'`).
- `ChartAnnotation.side` is `OrderSide = 'buy' | 'sell'` -- not related to this component (separate concern in useAgentChartOverlays).

---

## 3. TokenSelector.tsx

**Status: 1 BUG FIXED**

### Bug: State-after-unmount on async fetch (FIXED)
**Location**: `useEffect` at line 47 (symbol fetch on mount)
**Problem**: `fetchSymbols()` is async with `await fetch()` + `await res.json()`, then calls `setSymbols()`. If the component unmounts while the fetch is in flight (e.g., user navigates away), `setSymbols` fires on an unmounted component.
**Fix**: Added `cancelled` flag pattern. The cleanup function sets `cancelled = true`; the async function checks it after each await before calling setState.

### Other Observations
- Click-outside handler correctly scoped to `dropdownOpen` and cleaned up on unmount.
- `handleQuickFilter` and `addPair`/`removePair` use `useCallback` with correct deps.
- `filtered` useMemo depends on `[search, symbols]` -- correct, no stale data.
- `displayName` handles null with `(symbol ?? '')` -- defensive, good.

### API Shape Verification
- Calls `POST /api/phemex` with `{ action: 'markets' }`.
- Backend returns `{ markets: [{ symbol, base, maxLeverage, contractSize }] }`.
- Component reads `m.symbol` and `m.maxLeverage` -- both present in backend response. Correct.
- Fallback to `data.symbols` -- backend `symbols` action returns `string[]` from `getAvailableSymbols()`. The component handles both `string` and object shapes. Correct.

---

## 4. TradeCloseCard.tsx

**Status: 1 BUG FIXED**

### Bug: Timer churn from unstable onDismiss prop (FIXED)
**Location**: `useEffect` at line 15
**Problem**: The `useEffect` depends on `[onDismiss]`. If the parent creates a new function reference each render (inline arrow, no `useCallback`), the 30-second timer resets on every parent re-render, meaning the card may never auto-dismiss under frequent updates (e.g., during active polling in Mission Control).
**Fix**: Stored `onDismiss` in a ref (`onDismissRef`), updated synchronously on each render. The `useEffect` now has an empty dependency array and calls through the ref, so the timer is set exactly once on mount.

### Other Observations
- `Number.isFinite()` guards on `event.pnl` and `event.rrAchieved` -- good defensive rendering.
- framer-motion `exit` animation requires `AnimatePresence` in the parent -- verified this is a convention in the codebase (parent should wrap in `<AnimatePresence>`).
- No memory leak risk now that timer is stable.

---

## 5. useMissionPolling.ts

**Status: 1 BUG FIXED, 1 BACKEND NOTE**

### Bug: State-after-unmount across all 6 async fetchers (FIXED)
**Location**: All `fetch*` functions defined inside the main `useEffect`
**Problem**: Every fetcher does `await fetch(...)` then writes to the Zustand store. While Zustand store writes are technically safe even after unmount (they update external state, not component state), the sparkline fetcher is the critical case: it runs a sequential loop with `SPARKLINE_STAGGER_MS` (1 second) delays between up to 5 symbols. If the component unmounts mid-loop, the staggered fetches continue running for up to 5 more seconds, making unnecessary network requests and writing stale data.
**Fix**: Added `mountedRef` (initialized `true`, set to `false` on unmount). All async fetchers now check `mountedRef.current` after each `await` and bail early if unmounted. The sparkline loop checks before each iteration, preventing the stagger cascade.

### Interval Cleanup Verification
- 6 intervals created: positions, account, activity, agents, orchestrator, sparkline.
- `clearAll()` nullifies all 6 ref-tracked intervals.
- Main effect cleanup calls `clearAll()`.
- Secondary unmount effect also calls `clearAll()` as safety net.
- `clearAll` is `useCallback([], [])` -- stable reference, no stale closure risk. Correct.

### Sparkline Concurrency Guard
- `sparklineBusyRef` prevents overlapping sparkline fetch cycles. If a cycle takes longer than `SPARKLINE_INTERVAL` (15s), the next interval tick is a no-op. Correct.

### API Shape Verification
- `POST /api/phemex { action: 'positions' }` -> `{ positions: [...] }` -- matches `data.positions` check.
- `POST /api/phemex { action: 'account' }` -> `{ account: { totalUsdValue } }` -- matches `data.account?.totalUsdValue`.
- `POST /api/phemex { action: 'ohlcv', symbol, timeframe, limit }` -> `{ ohlcv: [...] }` -- matches both array-of-arrays and object-of-fields destructuring.
- `POST /api/trading { action: 'orchestrator_status' }` -> orchestrator's `getStatus()` return shape.

### Backend Note: orchestrator_status response shape
The `fetchOrchestratorStatus` function expects `data.symbols` to be `Record<string, { phase: string }>`. The actual `getStatus()` returns:
```ts
symbols: Record<string, {
  phase: string;
  activeIssueId: string | null;
  analysisCount: number;
  monitorCount: number;
  tradeCount: number;
  hasTriggerConditions: boolean;
}>
```
This is a superset of what the hook reads (`state.phase`), so it works. However, note that the response also includes top-level fields `running`, `startedAt`, `config`, `tickCount`, `lastTickAt` that the frontend currently ignores. These could be surfaced for operational monitoring if desired.

---

## 6. useAgentChartOverlays.ts

**Status: CLEAN**

### Analysis
- Processes `agentEvents` (from Axon store) into chart overlays (annotations + price lines) in the trading store.
- Uses `processedRef` (Set) to deduplicate -- events are only processed once regardless of how many times the effect re-runs.
- The Set is capped at 500 entries to prevent unbounded memory growth. Cap logic uses `Array.from(processed).slice(0, arr.length - 500)` which leverages Set insertion order (guaranteed in JS spec). Correct.

### Effect Dependency Verification
- First effect: `[agentEvents, agents]` -- both are Zustand store values. Re-runs when either changes. The `processedRef` deduplication ensures idempotency. Correct.
- Second effect: `[focusedSymbol]` -- clears agent_analysis price lines and resets auto-pattern timer when user switches focus. Correct behavior.

### Type Safety Check
- `ChartAnnotation.side` is `OrderSide = 'buy' | 'sell'`. The `detectDirection` function returns `'buy' | 'sell' | null`. The annotation sets `side: dir ?? 'buy'` (for trade events) and `side: dir ?? undefined` (for signals). Both are valid for `OrderSide | undefined`. Correct.
- `ChartPriceLine.type` is a union including `'stop_loss' | 'take_profit' | 'support' | 'resistance'`. All usages match. Correct.
- `ChartPriceLine.source` is `PriceLineSource` which includes `'agent_analysis'`. All usages set `source: 'agent_analysis'`. Correct.

### Helper Function Review
- `extractPrice`: Handles number, string with `$` and `,` stripping. Returns null for non-positive or NaN. Sound.
- `extractTimestamp`: Handles seconds-vs-milliseconds disambiguation (> 1e12 threshold). Falls back to `event.timestamp` string. Sound.
- `detectDirection`: Checks structured fields first, then scans content text with word-boundary regex. Sound.
- `extractPriceTargets`: Two regex passes -- dollar-sign patterns and named-target patterns. Deduplicates in the named pass. Sound.

### No State-After-Unmount Risk
This hook writes to Zustand stores (`addAnnotation`, `addPriceLine`, `setPriceLinesFromAnalysis`, `clearPriceLines`, `setLastAutoPatternTime`), which are external state. Writing to external stores after unmount is a no-op (no React warnings, no crashes). The effect is synchronous (no async/await), so there's no timing window where unmount could interleave. Clean.

---

## Cross-Cutting Observations

### 1. Error Handling Philosophy
All 6 files use silent `catch {}` blocks. This is intentional for a polling-based trading UI (network blips are expected and retried on the next interval). However, consider adding a lightweight error counter or toast for persistent failures (e.g., 5+ consecutive failures on the same endpoint).

### 2. Polling Load
`useMissionPolling` creates 6 independent polling loops when autonomous mode is active. Total request frequency:
- Positions: every 10s
- Account: every 15s
- Activity: every 8s
- Agents: every 20s
- Orchestrator: every 10s
- Sparklines: every 15s (up to 5 sequential requests with 1s stagger)

Worst case: ~12 requests per 10-second window to local API + up to 5 forwarded to Phemex. The `sparklineBusyRef` guard prevents accumulation. Acceptable for a single-user trading dashboard.

### 3. Zustand Store Selector Granularity
`MiniChartStrip` uses 7 individual selectors. This is correct -- each selector returns a primitive or a stable reference, so the component only re-renders when relevant data changes. If performance becomes an issue, `priceHistoryMap` (returns a new object ref on any symbol update) could be further optimized with a shallow-equality selector.
