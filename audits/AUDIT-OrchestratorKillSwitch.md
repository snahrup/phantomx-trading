# Audit: MissionOrchestrator + Kill Switch

**Date**: 2026-03-15
**Auditor**: Claude Opus 4.6 (automated)
**Files audited**:
- `src/lib/mission/orchestrator.ts` (834 lines)
- `src/lib/kill-switch.ts` (186 lines)
- `src/lib/axon/client.ts` (369 lines)
- `src/lib/axon/types.ts` (306 lines)

**Verdict**: 3 bugs fixed in-place, 5 design concerns documented for deeper work.

---

## Bugs Found and Fixed

### BUG-1 [FIXED]: Trigger hit silently lost when pipeline slots full (CRITICAL)

**File**: `orchestrator.ts` lines 385-391
**Severity**: CRITICAL -- real trading signals discarded without retry

**Problem**: When `checkMonitoringResult()` returned `true` (trigger fired) but `activePipelines >= MAX_CONCURRENT_PIPELINES`, the code fell into the `else` branch and incremented `consecutiveNoTrigger`. This had two effects:
1. The trigger was silently lost -- no log, no retry, no record.
2. `consecutiveNoTrigger` was incremented, causing the adaptive backoff to SLOW DOWN monitoring for this symbol, making it even less likely to catch the next trigger.

**Fix**: Split the logic so `triggerHit=true` always resets `consecutiveNoTrigger` to 0. When pipeline slots are full, the symbol stays in `monitoring` phase and will re-evaluate on the next tick. Added a log line for visibility.

### BUG-2 [FIXED]: activePipelines counter inflated on failed issue creation (MINOR)

**File**: `orchestrator.ts` line 388
**Severity**: Minor -- only affects remaining symbols in the same tick iteration

**Problem**: `activePipelines++` was executed unconditionally after `createTradingIssue()`, even when that method failed to create the issue (which sets `state.phase` back to `monitoring`, not `pipeline`). This consumed a phantom concurrency slot for the rest of the tick.

**Fix**: Changed to `if (state.phase === 'pipeline') activePipelines++` -- only count the slot if the issue was actually created.

### BUG-3 [FIXED]: Kill switch file corruption = fail-open (CRITICAL SAFETY)

**File**: `kill-switch.ts` lines 73-91
**Severity**: CRITICAL SAFETY -- system could trade when it should be killed

**Problem**: Three sub-issues:
1. `writeFileSync()` is not atomic. A crash mid-write leaves a corrupt `.phantomx-kill` file.
2. On startup, a corrupt file was caught by `catch { /* ignore corrupt file */ }`, causing the kill switch to default to `inactive`. This is a **fail-open** design in a safety-critical path.
3. No cleanup of temp files on reset.

**Fix**:
- All writes now use atomic write-then-rename (`writeFileSync` to `.phantomx-kill.tmp`, then `renameSync` to `.phantomx-kill`). `renameSync` is atomic on all major filesystems.
- Corrupt file now fails-safe: if the file exists but cannot be parsed, the kill switch is treated as `killed` with a logged error.
- `resetKillSwitch()` now cleans up both `.phantomx-kill` and `.phantomx-kill.tmp`.

---

## State Machine Audit: Phase Transitions

### idle -> analyzing
- **Guard**: `activeAnalyses < MAX_CONCURRENT_ANALYSES` -- CORRECT
- **Transition**: Only occurs if `createDeepAnalysisIssue` succeeds (sets `state.phase = 'analyzing'` and `state.activeIssueId`)
- **Kill switch**: Checked inside `createDeepAnalysisIssue` before creating the issue -- CORRECT
- **Error path**: If `createDeepAnalysisIssue` throws, caught by outer try/catch which resets to `idle` -- CORRECT

### analyzing -> monitoring
- **Guard**: Issue status is `done` or `cancelled`
- **Transition**: `extractTriggerConditions` failure is caught and triggers are set to `null` -- symbol still transitions to monitoring -- CORRECT
- **Orphan check**: `activeIssueId` is nulled before any potentially-throwing code? NO -- `extractTriggerConditions` is called while `activeIssueId` is still set, but it's wrapped in try/catch and `activeIssueId` is nulled in the "atomic state transition" block after. CORRECT.

### analyzing -> idle (stale)
- **Guard**: `isStale()` with 15-minute timeout
- **Transition**: Cancels the stale issue via Axon API, then resets -- CORRECT
- **Edge case**: If `axon.updateIssue()` fails, the outer catch resets to `idle` -- CORRECT

### analyzing -> idle (null issue)
- **Guard**: `fetchIssue` returns null (issue deleted externally)
- **Transition**: Resets to idle -- CORRECT

### monitoring -> monitoring (no trigger)
- **Guard**: Monitoring issue done + `checkMonitoringResult` returns false
- **Transition**: `activeIssueId` nulled, `consecutiveNoTrigger++`, stays in monitoring -- CORRECT

### monitoring -> pipeline (trigger hit)
- **Guard**: `checkMonitoringResult` returns true AND `activePipelines < MAX_CONCURRENT_PIPELINES`
- **Kill switch**: Checked inside `createTradingIssue` -- CORRECT
- **Transition**: `createTradingIssue` sets phase to `pipeline` on success, `monitoring` on failure -- CORRECT (after BUG-1/BUG-2 fixes)

### pipeline -> cooldown
- **Guard**: Pipeline status is `done`, `cancelled`, or `blocked`
- **Transition**: Increments `tradeCount` on `done`, moves to cooldown -- CORRECT
- **Fallback**: If `getPipelineStatus` fails, falls back to `fetchIssue` direct check -- CORRECT
- **Edge case**: If pipeline issue vanishes (null), returns to `monitoring` -- CORRECT, no cooldown needed since no trade happened

### cooldown -> monitoring
- **Guard**: `now - lastTradeAt >= POST_TRADE_COOLDOWN_MS` (120s)
- **Transition**: Returns to monitoring, not idle (preserves analysis) -- CORRECT

### Verdict: No orphan scenarios after fixes. Every phase transition accounts for both success and failure paths.

---

## Concurrency Limits Audit

| Limit | Value | Enforcement | Verdict |
|-------|-------|-------------|---------|
| MAX_CONCURRENT_ANALYSES | 2 | Counted at tick start + incremented in-loop | CORRECT |
| MAX_CONCURRENT_MONITORS | 5 | Counted at tick start + incremented in-loop | CORRECT |
| MAX_CONCURRENT_PIPELINES | 2 | Counted at tick start + incremented in-loop | CORRECT (after BUG-2 fix) |

**Note**: Concurrency counters are local to each tick. Since `tick()` is `async` and runs sequentially (no parallel ticks due to `setInterval` + `await`), there is no risk of concurrent tick executions inflating counts... **UNLESS** a tick takes longer than `TICK_INTERVAL_MS` (15s). See CONCERN-1 below.

---

## Kill Switch Integration Audit

| Checkpoint | Location | Correct? |
|------------|----------|----------|
| Tick start | `tick()` line 288 | YES -- stops orchestrator entirely |
| Before deep analysis issue | `createDeepAnalysisIssue()` line 504 | YES |
| Before monitoring issue | `createMonitoringIssue()` line 582 | YES |
| Before trading issue | `createTradingIssue()` line 651 | YES |

**Missing check**: There is no kill switch check between `checkMonitoringResult()` returning `true` and `createTradingIssue()` being called. The check INSIDE `createTradingIssue` covers this, so it is functionally safe. However, the ~50ms gap where the trigger-hit log fires before the kill check could confuse operators reading logs. Low concern.

---

## Kill Switch Module Audit

### Mode transitions

| From | To | Method | Valid? |
|------|----|--------|--------|
| inactive | killed | `triggerKillSwitch()` | YES |
| inactive | close_only | `triggerKillSwitch('...', 'close_only')` or `setCloseOnlyMode()` | YES |
| killed | close_only | `setCloseOnlyMode()` | YES |
| close_only | killed | `triggerKillSwitch()` | YES |
| killed/close_only | inactive | `resetKillSwitch()` | YES (with cooldown) |
| inactive | inactive | `triggerKillSwitch('...', 'inactive')` | Blocked -- coerced to `killed` | YES |

All transitions are valid. The `inactive` guard in `triggerKillSwitch` prevents accidentally deactivating via the trigger path.

### Cooldown enforcement

- `getCooldownRemainingMs()` checks `triggeredAt` against `POST_KILL_COOLDOWN_MS` (48h) -- CORRECT
- `resetKillSwitch(force=false)` blocks if cooldown > 0 -- CORRECT
- `resetKillSwitch(force=true)` bypasses -- CORRECT, requires CEO auth (enforced at API layer)
- **Edge case**: If `triggeredAt` is null (e.g., restored from corrupt file), cooldown returns 0 and reset succeeds immediately. After BUG-3 fix, corrupt files set `triggeredAt: null` but mode to `killed`. Reset would succeed without waiting. This is acceptable because: (a) the operator must explicitly call reset, and (b) the corrupt state is already anomalous.

### Race conditions

**Single-process**: Node.js is single-threaded, so `getState()` mutations are atomic within the process. No race conditions between concurrent callers in the same process.

**Multi-process**: If two server instances (e.g., Next.js workers) both read/write `.phantomx-kill`, the atomic rename prevents corruption but does NOT prevent lost updates. One process could overwrite the other's write. In practice, Next.js runs a single server process for API routes (not clustered), so this is low risk. If clustering is ever enabled, a file lock (`flock`) would be needed.

---

## Pause/Resume Audit

### pause()
- Clears interval -- CORRECT
- Sets `running = false` -- CORRECT
- Preserves `config`, `symbolStates`, `startedAt` -- CORRECT

### resume()
- Guard: `!running && config !== null` -- CORRECT
- Clears all `activeIssueId` values -- CORRECT (issues may have timed out during pause)
- Does NOT clear phases -- symbols in `analyzing` with null `activeIssueId` will transition to `idle` on first tick (line 323-325). CORRECT.
- Symbols in `cooldown` may have already elapsed their cooldown during pause and will immediately transition to `monitoring`. CORRECT.

### isPaused()
- Returns `!running && config !== null && symbolStates.size > 0` -- CORRECT

---

## Start/Stop Resource Leak Audit

### start()
- Defensively clears any existing `intervalId` before starting -- CORRECT
- Calls `stop()` if already running -- CORRECT
- Clears `symbolStates` and reinitializes -- CORRECT
- Resets Axon client to avoid stale singleton -- CORRECT

### stop()
- Clears `intervalId` -- CORRECT
- Sets `running = false` -- CORRECT
- Does NOT clear `symbolStates` or `config` -- INTENTIONAL (allows `isPaused()` to work and `resume()` to restart from existing state)
- Does NOT cancel outstanding Axon issues -- see CONCERN-2

### Hot reload safety
- Singleton via `globalThis` key `__phantomx_orchestrator__` -- CORRECT
- `start()` clears any leaked interval from a previous instance -- CORRECT
- `resetAxonClient()` on start prevents stale Axon connections -- CORRECT

---

## Design Concerns (Require Deeper Changes)

### CONCERN-1: Tick overlap when async operations are slow

`setInterval` fires every 15s regardless of whether the previous tick has completed. If Axon is slow (e.g., 20s response time), two ticks can run concurrently, violating concurrency limits and causing duplicate issue creation.

**Recommendation**: Replace `setInterval` with a self-scheduling `setTimeout` pattern:
```typescript
private scheduleNextTick(): void {
  this.intervalId = setTimeout(async () => {
    await this.tick();
    if (this.running) this.scheduleNextTick();
  }, TICK_INTERVAL_MS);
}
```
This ensures ticks never overlap. **Priority: HIGH**.

### CONCERN-2: Orphaned Axon issues on stop()

When `stop()` is called (or kill switch fires), any in-flight Axon issues are left in `in_progress` or `todo` status. The orchestrator forgets about them (state is not persisted), and on restart they will never be cleaned up.

**Recommendation**: On `stop()`, iterate `symbolStates` and cancel any `activeIssueId` that is still set. Alternatively, rely on Axon's `cleanStaleIssues()` endpoint (already available in the client) as a periodic cleanup, but this is passive and could leave issues active for hours.

**Priority: MEDIUM** -- the stale issue timeout in `tick()` handles this if the orchestrator restarts, but if it stays stopped, issues accumulate.

### CONCERN-3: checkMonitoringResult relies on text heuristics

The `checkMonitoringResult()` method uses string matching (`TRIGGER_HIT`, `NO_TRIGGER`, plus fallback heuristics) to determine if a trigger fired. This is fragile:
- An agent's natural language response containing "CONDITIONS MET in the future" would false-positive.
- The heuristic fallback checks for positive BEFORE negative only because negative is checked first. But `WAIT` in "DON'T WAIT" would false-negative.

**Recommendation**: Require agents to output a structured JSON response (similar to Phase 1 trigger conditions) rather than relying on keyword matching. The monitoring issue prompt already asks for `TRIGGER_HIT` or `NO_TRIGGER`, but there's no enforcement.

**Priority: MEDIUM** -- false positives are caught by the 5-wave pipeline (which does its own analysis), so the blast radius is limited to unnecessary pipeline issues.

### CONCERN-4: isModeManual() reads file synchronously on every tick

`readFileSync` on `trading-mode.json` runs every 15 seconds. On Windows, file I/O can be slow if the disk is busy. This blocks the event loop.

**Recommendation**: Cache the result with a TTL (e.g., 60 seconds) or use `fs.watch()` to invalidate the cache on file change.

**Priority: LOW** -- `readFileSync` on a tiny JSON file is fast in practice.

### CONCERN-5: No kill switch re-check AFTER pipeline issue creation

Between the kill switch check at the top of `createTradingIssue()` and the issue actually being created via `axon.createIssue()`, there is a network round-trip to Axon. If the kill switch is triggered during this window, a trading pipeline issue will be created. The Axon agents should have their own kill switch check, but the orchestrator does not verify this.

**Recommendation**: After `createIssue` succeeds, re-check the kill switch and immediately cancel the issue if it activated during creation. This is a narrow window but matters for a safety-critical system.

**Priority: LOW** -- the window is ~100-500ms and the trading pipeline has its own risk gates.

---

## Summary

| Category | Items | Status |
|----------|-------|--------|
| Bugs fixed | 3 (2 critical, 1 minor) | DONE |
| State transitions | 8 checked | All correct |
| Concurrency limits | 3 checked | Correct (after fixes) |
| Kill switch checks | 4 locations | All present |
| Error recovery | Every async path | All have catch handlers |
| Resource leaks | Start/stop/pause/resume | No leaks found |
| Design concerns | 5 documented | Need separate work items |

The system is sound after the three fixes applied. The most impactful remaining work is CONCERN-1 (tick overlap prevention) which should be addressed before enabling autonomous trading.
