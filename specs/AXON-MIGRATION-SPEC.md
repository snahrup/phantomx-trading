# AXON-MIGRATION-SPEC: Rewire PhantomX Features to Axon Team

**Date**: 2026-03-13
**Status**: SPEC READY
**Priority**: CRITICAL — app is currently broken (deleted imports)

---

## Context

PhantomX had a **rogue parallel AI system** (`src/lib/ai/`, 12 files) that made direct
`@anthropic-ai/claude-agent-sdk` `query()` calls from the Next.js process, bypassing the
Axon 22-agent trading team entirely. This system was purged:

- **12 lib files** deleted (`src/lib/ai/`)
- **10 API routes** deleted (`/api/ai`, `/api/research`, `/api/orchestrator`, etc.)
- **11 components** deleted (AIChatPanel, TradingJournal, GemScanner, WorkflowDashboard, etc.)

The Axon backend (Python FastAPI at `:8400`) is the **correct** execution layer. It has:
- 22 agents with heartbeat scheduling
- 5-wave trading debate pipeline (Research → Debate → Risk → Approval → Execution)
- Concierge AI chat (streaming SSE)
- Real-time SSE event stream
- Full activity logging, cost tracking, issue management

**Principle**: Every feature that existed before MUST be rebuilt to go through the Axon team.
No orphaned UI sections. Nothing goes into the ether.

---

## Existing Axon Infrastructure (Already Working)

### PhantomX Frontend (`src/lib/axon/`)
| File | What It Does |
|------|-------------|
| `client.ts` | REST client for Axon daemon API (`:8400`). PHANTOM_COMPANY_ID constant. |
| `event-source.ts` | SSE streaming with named event listeners, auto-reconnect, backoff. |
| `store-bridge.ts` | Wires SSE events → Zustand axon-store (agent_status, heartbeat_log, issue_update, activity). |
| `concierge-stream.ts` | Streaming chat client for concierge endpoint. `streamConciergeChat()`. |
| `recommendation-parser.ts` | Parses Wave 5 trade recommendations from issue comments. |
| `types.ts` | TypeScript types matching Axon FastAPI models. |

### Zustand Store (`src/store/axon-store.ts`)
- `useAxonStore` — connection, agents, issues, chat, costs, SSE lifecycle
- `useAxonAgentSummary()` — working/idle/error counts
- `useAxonLastHeartbeat()` — last heartbeat info
- `useAxonActivePipelines()` — count of active trading pipelines

### Working Components
| Component | Location | What It Does |
|-----------|----------|-------------|
| `ConciergeChatPanel` | `components/concierge/` | Streaming chat with Axon concierge. Markdown, tool calls, connection status. |
| `AxonActivityBar` | `components/autopilot/` | Activity bar: agent status, heartbeats, costs, kill switch. |
| `DaemonStatus` | `components/autopilot/` | Health widget: daemon online/offline, scheduler, agent breakdown. |
| `AgentDetailModal` | `components/agents/` | Agent detail dialog: persona, heartbeats, costs, controls. |
| `AgentTeamPanel` | `components/agents/` | Agent listing by team (Leadership, Research, Trading, Execution). |
| `AgentStatusDot` | `components/agents/` | Status indicator badge. |
| `TradeRecommendationCard` | `components/trading/` | Trade rec display with execute/reject/edit. |
| `TradeRecommendationList` | `components/trading/` | List of recommendations from trading pipeline issues. |
| `DataProvider` | `components/` | SSE bridge side-effect component. |
| `PipelineShowcase` | `components/agents/` | 5-wave trading pipeline cinematic view. |

### Axon Backend API Endpoints (`:8400`)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/companies/{id}/agents` | GET | List all 22 agents |
| `/api/companies/{id}/issues` | GET/POST | List/create issues (trading, build, triage) |
| `/api/companies/{id}/activity` | GET | Activity log (agent decisions, heartbeats, etc.) |
| `/api/companies/{id}/stream` | GET (SSE) | Real-time event stream |
| `/api/companies/{id}/concierge/chat` | POST (SSE) | Concierge AI chat (streaming) |
| `/api/companies/{id}/chat-history` | GET | Chat history |
| `/api/companies/{id}/concierge/reset` | POST | Reset conversation |
| `/api/companies/{id}/status` | GET | Full company dashboard status |
| `/api/companies/{id}/report` | GET | Morning report (overnight execution results) |
| `/api/companies/{id}/agents/pause-all` | POST | Pause all agents |
| `/api/companies/{id}/agents/resume-all` | POST | Resume all agents |
| `/api/companies/{id}/agents/kill` | POST | Kill switch |
| `/api/agents/{id}/heartbeats` | GET | Agent heartbeat history |
| `/api/agents/{id}/costs` | GET | Agent cost breakdown |
| `/api/agents/{id}/wakeup` | POST | Manual agent wakeup |
| `/api/agents/{id}/persona` | GET | Agent persona files (SOUL.md, etc.) |
| `/api/agents/{id}/summary` | GET | AI-generated agent summary |
| `/api/issues/{id}` | PATCH | Update issue status/assignment/priority |
| `/api/issues/{id}/comments` | GET/POST | Issue comments (wave-indexed debate content) |
| `/api/issues/{id}/sub-issues` | GET | Sub-issues for a parent trading issue |

---

## Migration Map: Deleted Feature → Axon Replacement

### 1. AIChatPanel → ConciergeChatPanel ✅ DONE
**Status**: Already exists at `components/concierge/ConciergeChatPanel.tsx`
**Action**: Wire into `page.tsx` sidebar 'ai' tab (replace deleted AIChatPanel import)
**Data source**: `streamConciergeChat()` → `/companies/{id}/concierge/chat`

### 2. TradingJournal → AxonJournalPanel (NEW)
**What it was**: AI-generated trade analysis, daily summaries, journal entries
**What replaces it**: Axon activity log + agent decisions + heartbeat reports
**Data source**: `GET /companies/{id}/activity` (filtered by action type)
**Component plan**:
- Fetch activity log via `getAxonClient().request('/companies/{id}/activity?limit=200')`
- Filter by action types: `agent_decision`, `heartbeat_completed`, `trading_pipeline_complete`, `issue_started`, `issue_completed`
- Group by date for daily summaries
- Show agent name, decision text, cost, tokens used
- Trading-specific entries get highlighted treatment (trade recommendations, approvals, rejections)
**Where used**: Sidebar 'journal' tab, `/journal` page

### 3. GemScanner → AxonScannerPanel (NEW)
**What it was**: AI-powered market opportunity detection (called `/api/scanner`)
**What replaces it**: Create a `trading` issue via Axon, assigned to research analysts
**Data source**: `POST /companies/{id}/issues` (create scanning issue) + `GET /issues/{id}/comments` (results)
**Component plan**:
- "Scan for Opportunities" button creates a trading issue:
  ```json
  {
    "title": "Market Scan: {symbol} {timeframe}",
    "description": "Scan for trading opportunities...",
    "issue_type": "trading",
    "priority": "high",
    "assigned_agent_id": null
  }
  ```
- The 5-wave pipeline kicks in automatically (4 analysts research → debate → risk → approval → execution rec)
- Show active scanning issues with their current wave progress
- Display completed scan results from issue comments
- Link to TradeRecommendationList for actionable results
**Where used**: Sidebar 'strategy' tab (replaces GemScanner in StrategyPanel), `/scanner` page

### 4. WorkflowDashboard → AxonPipelineView (NEW)
**What it was**: Orchestrator dashboard showing workflow status
**What replaces it**: Axon agent team + active trading pipelines
**Data source**: `useAxonStore` (agents, issues, agentEvents)
**Component plan**:
- Top: Agent team status grid (reuse `AgentTeamPanel`)
- Middle: Active trading pipelines with wave progress (reuse `PipelineShowcase` or simplified version)
- Bottom: Recent activity feed from `agentEvents`
- Shows: which agents are working, what issues are in-flight, pipeline progress
**Where used**: `page.tsx` intelligence/autopilot view mode

### 5. PaperTradingDashboard → AxonTradingPipelineView (NEW)
**What it was**: Paper trade simulation with equity curve, trade history
**What replaces it**: Axon trading pipeline results (5-wave debate outcomes)
**Data source**: `GET /companies/{id}/issues?issue_type=trading` + `/issues/{id}/comments`
**Component plan**:
- List all trading pipeline issues (completed and active)
- For each completed pipeline: show wave-by-wave summary (research findings, debate arguments, risk assessment, approval/rejection, execution recommendation)
- Aggregate stats: total pipelines run, approved vs rejected, estimated P&L from recommendations
- Trade recommendation cards for Wave 5 outputs (reuse `TradeRecommendationCard`)
**Where used**: `/journal` page (paper trading tab)

### 6. WorkflowSidebarSummary → AxonAgentSummary (REWIRE)
**Status**: Component exists at `components/workflows/WorkflowSidebarSummary.tsx`
**Action**: Check if it works with Axon data or needs rewiring. If broken, replace with a compact version of `AgentTeamPanel` showing working/idle/error counts + active pipelines count.
**Where used**: Sidebar 'agents' tab

### 7. ResearchDashboard → AxonResearchView (REWIRE)
**What it was**: Research pipeline with SSE from `/api/research`
**What replaces it**: Trading issue Wave 1 (RESEARCH phase) results
**Data source**: `GET /issues/{parent_id}/sub-issues` + `GET /issues/{id}/comments?wave=1`
**Component plan**:
- When a trading pipeline is active, show Wave 1 progress: 4 analyst sub-issues
- Each analyst card shows: name, status (working/done), findings (from comments)
- Once all 4 complete, show aggregated research brief
- "Start New Research" button creates a trading issue
**Where used**: Strategy page 'research' tab

---

## Broken Components: Rewiring Plan

These components still exist but call deleted `/api/ai` or `/api/research` endpoints.

### 8. TradingChart.tsx — Pattern Detection
**Current**: Calls `POST /api/ai` with `action: 'analyze_pattern'`
**Fix**: Replace with Axon concierge query via `streamConciergeChat()`
**Implementation**:
```typescript
// OLD: fetch('/api/ai', { body: JSON.stringify({ action: 'analyze_pattern', ... }) })
// NEW:
import { streamConciergeChat } from '@/lib/axon/concierge-stream';

streamConciergeChat(
  `Analyze the chart pattern for ${symbol} on ${timeframe}: ${JSON.stringify(ohlcvSlice)}`,
  {
    onText: (text) => { /* accumulate response */ },
    onDone: () => { /* parse and display pattern */ },
    onError: (err) => console.error(err),
    onToolUse: () => {},
    onToolResult: () => {},
  }
);
```

### 9. PineScriptModal.tsx — PineScript Generation
**Current**: Calls `POST /api/ai` with `action: 'generate_pinescript'`
**Fix**: Replace with Axon concierge query
**Implementation**: Same pattern as #8 — send strategy params to concierge, accumulate streaming response as PineScript code.

### 10. StrategyBuilder.tsx — Quick Strategy Generation
**Current**: Calls `POST /api/ai` with `action: 'generate_strategy'`
**Fix**: Replace with Axon concierge query for quick generation, or create a trading issue for full pipeline.

### 11. PerformanceReview.tsx — AI Performance Analysis
**Current**: Calls `POST /api/ai` with `action: 'analyze_performance'`
**Fix**: Replace with Axon concierge query — send backtest metrics, get AI analysis back.

### 12. Strategy Page — Deep Research & Optimization SSE
**Current**: `consumeSSE('/api/ai', { action: 'deep_research', ... })` and `consumeSSE('/api/ai', { action: 'optimize_strategy', ... })`
**Fix**: Create a trading issue in Axon and monitor the 5-wave pipeline via SSE.
**Implementation**:
```typescript
// Create trading issue
const client = getAxonClient();
const issue = await client.createIssue({
  title: `Deep Research: ${config.symbol} ${config.strategy}`,
  description: JSON.stringify({ strategyConfig: config, strategyGoals: goals }),
  issue_type: 'trading',
  priority: 'high',
});

// Monitor via existing SSE stream (axon-store gets issue_update events)
// Pipeline progresses automatically: Research → Debate → Risk → Approval → Execution
// UI reads wave progress from: GET /issues/{id}/sub-issues + /issues/{id}/comments
```

---

## Page-Level Fixes

### `src/app/page.tsx` (Main Dashboard)
| Line | Broken Import | Replace With |
|------|--------------|-------------|
| 6 | `AIChatPanel` | `ConciergeChatPanel` from `@/components/concierge/ConciergeChatPanel` |
| 8 | `TradingJournal` | `AxonJournalPanel` (NEW — see #2 above) |
| 12 | `GemScanner` | `AxonScannerPanel` (NEW — see #3 above) |
| 18 | `WorkflowDashboard` | `AxonPipelineView` (NEW — see #4 above) |
| 19 | `WorkflowSidebarSummary` | Check if works, else use `AgentTeamPanel` compact mode |

**SidebarContent changes**:
- `sidePanel === 'ai'` → render `<ConciergeChatPanel />`
- `sidePanel === 'journal'` → render `<AxonJournalPanel />`
- `sidePanel === 'agents'` → render `<AgentTeamPanel />` (or keep WorkflowSidebarSummary if it works)
- Intelligence view mode → render `<AxonPipelineView />`
- StrategyPanel → remove `<GemScanner />`, add `<AxonScannerPanel />`

### `src/app/journal/page.tsx`
| Line | Broken Import | Replace With |
|------|--------------|-------------|
| 6 | `TradingJournal` | `AxonJournalPanel` (NEW) |
| 7 | `PaperTradingDashboard` | `AxonTradingPipelineView` (NEW — see #5 above) |

### `src/app/scanner/page.tsx`
| Line | Broken Import | Replace With |
|------|--------------|-------------|
| 5 | `GemScanner` | `AxonScannerPanel` (NEW — see #3 above) |

### `src/app/strategy/page.tsx`
- Lines 87, 147: Replace `consumeSSE('/api/ai', ...)` with Axon issue creation + pipeline monitoring (see #12)
- Line 20: `consumeSSE` import may still be needed for other uses, or can be removed if only used here

---

## New Components to Build

| Component | File | Data Source | Complexity |
|-----------|------|------------|------------|
| `AxonJournalPanel` | `components/axon/AxonJournalPanel.tsx` | `GET /companies/{id}/activity` | Medium |
| `AxonScannerPanel` | `components/axon/AxonScannerPanel.tsx` | `POST /companies/{id}/issues` + issue comments | Medium |
| `AxonPipelineView` | `components/axon/AxonPipelineView.tsx` | `useAxonStore` (agents, issues, events) | Medium-High |
| `AxonTradingPipelineView` | `components/axon/AxonTradingPipelineView.tsx` | Trading issues + sub-issues + comments | High |

---

## Implementation Order

### Phase 1: Unbreak the App (IMMEDIATE)
1. Fix `page.tsx` imports — swap AIChatPanel → ConciergeChatPanel, stub out others with placeholder components
2. Fix `journal/page.tsx` — stub placeholders
3. Fix `scanner/page.tsx` — stub placeholder
4. Fix `PipelineShowcase.tsx` — remove import from deleted `pipeline-runner.ts`
5. **Goal**: App compiles and runs without crashes

### Phase 2: Build Core Replacement Components
1. `AxonJournalPanel` — activity log viewer (replaces TradingJournal)
2. `AxonScannerPanel` — issue creation + results viewer (replaces GemScanner)
3. `AxonPipelineView` — agent team + pipeline status (replaces WorkflowDashboard)
4. Wire all three into their page locations

### Phase 3: Rewire Broken Components to Concierge
1. TradingChart pattern detection → concierge query
2. PineScriptModal generation → concierge query
3. StrategyBuilder generation → concierge query
4. PerformanceReview analysis → concierge query

### Phase 4: Strategy Lab Full Integration
1. Replace `consumeSSE('/api/ai', ...)` calls with Axon trading issue creation
2. Wire ResearchPipeline component to show Wave 1 sub-issue progress
3. Wire BacktestResults to show Wave 2-3 debate + risk results
4. Wire DeployPanel to show Wave 4-5 approval + execution
5. Build `AxonTradingPipelineView` for journal page

### Phase 5: Polish & Verify
1. No orphaned UI sections — every visible element is functional
2. All sidebar tabs render working content
3. All page routes render working content
4. AgentNetworkPanel rewired to use Axon agent data (not rogue `/api/agents`)
5. Final grep for any remaining references to deleted routes/files

---

## Axon Client Extensions Needed

The `AxonClient` in `src/lib/axon/client.ts` may need new methods:

```typescript
// Already have:
listAgents(), listIssues(), health(), getCompanyStatus(),
getChatHistory(), killAll(), createIssue()

// May need to add:
getActivity(limit?: number): Promise<Result<AxonActivity[]>>
getIssueComments(issueId: string, wave?: number): Promise<Result<AxonIssueComment[]>>
getSubIssues(issueId: string): Promise<Result<AxonIssue[]>>
getMorningReport(since?: string): Promise<Result<MorningReport>>
getAgentHeartbeats(agentId: string): Promise<Result<HeartbeatRun[]>>
wakeupAgent(agentId: string): Promise<Result<HeartbeatRun>>
```

---

## Notes

- **Company ID**: `8fc360f2-31bc-4ab2-a441-e69b2d260126` (hardcoded in `client.ts`)
- **Concierge is the single AI chat endpoint** — all user-facing AI chat goes through it
- **Trading issues auto-progress** through the 5-wave pipeline via heartbeat scheduler
- **Manual mode** by default — Wave 5 produces recommendations, not live executions
- **SSE events update the store automatically** via the bridge — components just read from `useAxonStore`
