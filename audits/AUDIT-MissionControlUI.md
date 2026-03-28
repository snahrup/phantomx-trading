# AUDIT: Mission Control UI Components
**Files**: LaunchPanel.tsx, StatusBar.tsx, MissionControlPanel.tsx, AgentFeedPanel.tsx
**Supporting**: useMissionPolling.ts, useAgentChartOverlays.ts
**Audited**: 2026-03-15

## Summary

Four Mission Control UI components audited against their backing stores (trading-store, axon-store), API routes (/api/trading, /api/phemex), and the Axon REST client. All API endpoints verified to exist with correct request/response shapes. Found 4 frontend bugs (fixed in-place) and 1 backend observation (documented only). No memory leaks found -- all setInterval/setTimeout instances are properly cleaned up on unmount.

---

## Frontend Bugs Found & Fixed

### [MEDIUM] F1: agentNameMap was a factory function instead of a memoized value
- **File**: src/components/mission-control/AgentFeedPanel.tsx:132-138
- **Root cause**: `agentNameMap` was defined as `useCallback(() => { ... return map; }, [agents])` -- a stable function reference that *returns a new object each call*. While the dependency tracking was technically correct (the callback identity changes when `agents` changes), the pattern was semantically wrong: every call site did `agentNameMap()` to get a fresh Record, wasting allocations. More importantly, this masked the intent -- effects depended on `agentNameMap` (the function ref) but really needed the map value. If someone refactored the callback to be non-memoized, the effects would re-run on every render.
- **Fix**: Changed to `useMemo(() => { ... return map; }, [agents])` which returns the map directly. Updated all call sites from `agentNameMap()` to `agentNameMap`. Semantically correct and avoids unnecessary object allocations per render cycle.

### [LOW] F2: Missing mountedRef guard on handleSend async callback
- **File**: src/components/mission-control/AgentFeedPanel.tsx:280-306
- **Root cause**: `handleSend` is async (awaits `axon.sendChatMessage`) but had no `mountedRef` guard on the `setSending(false)` in the `finally` block. If the user navigated away or the feed panel unmounted while the chat message was in-flight, React would log a "Can't perform a React state update on an unmounted component" warning (React 18 removed the error, but it still indicates a logic bug).
- **Fix**: Added `mountedRef` with cleanup effect. Wrapped `setSending(false)` in `if (mountedRef.current)` guard.

### [LOW] F3: Division by zero when accountBalance is 0
- **File**: src/components/mission-control/LaunchPanel.tsx:321-324
- **Root cause**: The profit goal percentage display computed `(config.profitGoal / accountBalance) * 100` with only a `accountBalance !== null` guard. If the exchange returned a zero balance (empty account, network error returning 0), this would produce `Infinity%` in the UI.
- **Fix**: Added `accountBalance > 0` to the render guard.

### [LOW] F4: Dead state variable `closeFlashes` never populated
- **File**: src/components/mission-control/MissionControlPanel.tsx:35
- **Root cause**: `closeFlashes` was declared as `useState<Record<string, 'win' | 'loss'>>({})` and passed to `MiniChartStrip`, but no code ever called `setCloseFlashes`. The state was always `{}`, making it dead code that added a state slot for nothing.
- **Fix**: Removed the state declaration. Passed `{}` directly as the prop literal. (If trade close flash behavior is ever implemented, it should be driven from an effect that watches position changes, not a dead state.)

### [TRIVIAL] F5: Unused import `useCallback` in LaunchPanel
- **File**: src/components/mission-control/LaunchPanel.tsx:3
- **Root cause**: `useCallback` was imported but never used in the component.
- **Fix**: Removed from import statement.

---

## Backend Issues (DOCUMENTED ONLY)

### B1: `/api/trading` set_mode response lacks error handling for concurrent writes
- **File**: src/app/api/trading/route.ts:318-349
- **Issue**: The `set_mode` action reads `trading-mode.json`, modifies it, and writes it back. This is a classic read-modify-write race if two requests (e.g., launch + kill) arrive near-simultaneously. The orchestrator start/stop also reads/writes this file. No file lock or atomic write mechanism is used.
- **Fix needed**: Use atomic write (write to temp file, rename) or a simple mutex. Low urgency since concurrent mode switches are rare in practice.

### B2: Orchestrator `resume_orchestrator` returns 409 if not paused, but frontend fire-and-forgets
- **File**: src/app/api/trading/route.ts:302-307 + src/components/mission-control/StatusBar.tsx:63-67
- **Issue**: The `resume_orchestrator` endpoint returns HTTP 409 if the orchestrator isn't paused. The frontend fire-and-forgets this call (`.catch(console.warn)`), so the 409 is silently swallowed. This is acceptable but means the UI shows "resumed" even if the orchestrator was never paused (e.g., it crashed). The mismatch between frontend `isPaused` state and backend orchestrator state could diverge after a crash.
- **Fix needed**: Consider making the resume call non-failing (return 200 if already running) or having the frontend poll orchestrator_status to reconcile pause state.

---

## Verified Clean (No Issues)

### Memory Leak Checks
- **LaunchPanel**: `mountedRef` cleanup in useEffect return. No intervals.
- **StatusBar**: `mountedRef` cleanup in useEffect return. No intervals.
- **MissionControlPanel**: No intervals. `reconciledRef` prevents double-run.
- **AgentFeedPanel**: Comment poll interval cleaned via `clearInterval` in effect cleanup + `cancelled` flag.
- **useMissionPolling**: Six interval refs, all cleared by `clearAll()` in effect cleanup + safety-net unmount cleanup.
- **useAgentChartOverlays**: No intervals. Processed set capped at 500 entries.

### API Endpoint Verification
| Call Site | Endpoint | Action | Verified |
|-----------|----------|--------|----------|
| LaunchPanel:64 | POST /api/phemex | account | Yes -- route.ts line 10+ |
| LaunchPanel:106 | POST /api/trading | set_mode | Yes -- route.ts line 318 |
| LaunchPanel:118 | POST /api/trading | start_orchestrator | Yes -- route.ts line 271 |
| LaunchPanel:200 | POST /api/trading | config (updates) | Yes -- route.ts line 215 |
| StatusBar:63 | POST /api/trading | resume_orchestrator | Yes -- route.ts line 300 |
| StatusBar:72 | POST /api/trading | pause_orchestrator | Yes -- route.ts line 295 |
| StatusBar:110 | POST /api/trading | kill_switch trigger | Yes -- route.ts line 192 |
| StatusBar:124 | POST /api/phemex | close_position | Yes -- route.ts (phemex) |
| StatusBar:144 | POST /api/phemex | cancel_all | Yes -- route.ts (phemex) |
| StatusBar:156 | POST /api/trading | stop_orchestrator | Yes -- route.ts line 289 |
| StatusBar:168 | POST /api/trading | set_mode manual | Yes -- route.ts line 318 |
| StatusBar:303 | POST /api/trading | kill_switch reset | Yes -- route.ts line 200 |
| useMissionPolling:60 | POST /api/phemex | positions | Yes |
| useMissionPolling:78 | POST /api/phemex | account | Yes |
| useMissionPolling:112 | POST /api/trading | orchestrator_status | Yes -- route.ts line 310 |
| useMissionPolling:180 | POST /api/phemex | ohlcv | Yes |

### Axon Client Calls
| Call Site | Client Method | Axon Endpoint | Verified |
|-----------|---------------|---------------|----------|
| LaunchPanel:155 | createIssue | POST /companies/{id}/issues | Yes |
| LaunchPanel:237 | listAgents | GET /companies/{id}/agents | Yes |
| LaunchPanel:242 | updateAgent | PATCH /agents/{id} | Yes |
| LaunchPanel:247 | wakeAll | POST /companies/{id}/agents/wake-all | Yes |
| StatusBar:96 | killAll | POST /companies/{id}/agents/kill | Yes |
| StatusBar:98 | listAgents | GET /companies/{id}/agents | Yes |
| StatusBar:103 | updateAgent | PATCH /agents/{id} | Yes |
| AgentFeedPanel:157 | getIssueComments | GET /issues/{id}/comments | Yes |
| AgentFeedPanel:290 | sendChatMessage | POST /companies/{id}/chat-messages | Yes |

### Type Usage
All types (`RiskLevel`, `TeamSize`, `ScanInterval`, `MissionControlConfig`, `FeedMessage`, `AgentRole`, `TradeCloseEvent`, `AxonIssueComment`, `AxonPriority`) traced from source to usage -- no mismatches found.
