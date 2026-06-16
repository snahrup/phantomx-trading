# SYSTEM ARCHITECTURE — Steve's Agent Ecosystem

**Last Updated:** 2026-03-14
**Owner:** Steve Nahrup (`snahrup`)
**Platform:** Windows 11, Git Bash

> **WHY THIS FILE EXISTS:** Steve runs 5-7+ concurrent Claude Code sessions across multiple repos. Without this map, every session wastes 10+ minutes rediscovering the architecture and makes wrong assumptions about which repo owns what. This file is the single source of truth for cross-repo relationships.

---

## ⚠️ VERIFIED RUNTIME TOPOLOGY (updated 2026-06-15) — READ THIS FIRST

Older diagrams below conflated three separate services and put "Conductor" inside the `nexus` repo. That is **wrong** and has misled multiple sessions. Below is the **source-confirmed** layout. **Conductor is its own repo** (`~/CascadeProjects/conductor`), not a folder in `nexus/`.

| Component | Repo / Path | Start command | Port | Role |
|---|---|---|---|---|
| **Conductor** (the backend) | `~/CascadeProjects/conductor` | `node dist/index.js` | **3777** | The actual backend. Owns the SQLite DB: sessions, animal names, memory, messages, activity, SSE. **Every Claude hook + the Codex bridge registers here.** Source: `conductor/src/index.ts` (`CONDUCTOR_PORT`, "replaces Nexus v1"). |
| **Gateway** | `~/CascadeProjects/nexus/server` (`nexus-gateway`, Hono) | `node dist/index.js` | **3800** | Proxies the Conductor and adds tasks, transcript titles, health aggregation. Source: `nexus/server/src/index.ts` (`PORT=3800`). |
| **Dashboard** (Mission Control) | `~/CascadeProjects/nexus/app` (React/Vite) | `vite` | **3810** | The UI Steve actually looks at. Proxies `/api` → `:3800`. **It is `:3810`, NOT `:5173`.** Source: `nexus/app/vite.config.ts`. |
| **Codex→Nexus bridge** | `~/.codex/mcp-nexus/server.js` | MCP stdio (Codex auto-starts) | — | Registers each Codex session with the Conductor on `:3777`. |
| **Claude hooks** | `~/CascadeProjects/nexus/hooks/*.js` (wired in `~/.claude/settings.json`) | CC lifecycle | — | Register Claude sessions with the Conductor on `:3777`. |

**Data flow Steve sees:** `dashboard :3810  →  gateway :3800  →  conductor :3777  →  SQLite`.

**Gotchas that have repeatedly burned sessions:**
- `node conductor/index.js` (mentioned later in this file) is **wrong**. Conductor is a separate repo: `cd ~/CascadeProjects/conductor && node dist/index.js`.
- `conductor/hooks/` is a **dead duplicate**. The LIVE hooks are `nexus/hooks/` (see `~/.claude/settings.json`).
- The thing on **:3777 is the Conductor backend** — not the gateway, not the dashboard. "Nexus" is the umbrella name for all of it.
- To restart the backend you rebuild + restart `~/CascadeProjects/conductor` (`tsc` → `node dist/index.js`). All sessions depend on it, so a restart briefly blips session tracking everywhere.
- There is **no** `~/CascadeProjects/SYSTEM-ARCHITECTURE.md` at the repo root; the synced copies live in `nexus/`, `Auto-Claude/`, and `phantomx/`.

---

## Quick Reference — The Three Repos

| Repo | Path | What It Is | Port | Stack |
|------|------|-----------|------|-------|
| **Auto-Claude (Praxis)** | `~/CascadeProjects/Auto-Claude` | Agent framework + Electron desktop UI + Axon daemon | **8400** (Axon API) | Python, Electron, React, TypeScript |
| **PhantomX** | `~/CascadeProjects/phantomx` | Trading frontend — charts, execution, Mission Control | **3000** (Next.js) | Next.js 16, React 19, TypeScript, Zustand, Tailwind |
| **Nexus** | `~/CascadeProjects/nexus` | Multi-session bridge — memory, messages, archive | **3800** (Gateway) / **3777** (Conductor) | TypeScript, Hono, React, SQLite |

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        STEVE'S MACHINE                               │
│                                                                      │
│  ┌──────────────────────┐     ┌──────────────────────┐              │
│  │   Auto-Claude Repo    │     │    PhantomX Repo      │             │
│  │  ~/CascadeProjects/   │     │  ~/CascadeProjects/   │             │
│  │    Auto-Claude/       │     │    phantomx/           │             │
│  │                       │     │                        │             │
│  │  ┌─────────────────┐  │     │  ┌──────────────────┐ │             │
│  │  │ Electron Desktop │  │     │  │ Next.js Frontend │ │             │
│  │  │ (Praxis UI)      │  │     │  │ (Trading UI)     │ │             │
│  │  │ React/TypeScript │  │     │  │ :3000             │ │             │
│  │  └────────┬─────────┘  │     │  └────────┬─────────┘ │             │
│  │           │IPC          │     │           │REST        │             │
│  │  ┌────────▼─────────┐  │     │           │            │             │
│  │  │ Python Backend   │  │     │           │            │             │
│  │  │ (Praxis Core)    │  │     │           │            │             │
│  │  │ agents/, core/,  │  │     │           │            │             │
│  │  │ spec_agents/     │  │     │           │            │             │
│  │  └────────┬─────────┘  │     │           │            │             │
│  │           │             │     │           │            │             │
│  │  ┌────────▼─────────┐  │     │           │            │             │
│  │  │ Axon Daemon      │◄─┼─────┼───────────┘            │             │
│  │  │ (FastAPI)        │  │     │  POST /api/execute-     │             │
│  │  │ :8400            │──┼─────┼──recommendation ───────►│             │
│  │  │ company/         │  │     │  (Wave 5 trade output)  │             │
│  │  │ heartbeat.py     │  │     │                        │             │
│  │  │ trading.py       │  │     │                        │             │
│  │  └────────┬─────────┘  │     └──────────┬─────────────┘             │
│  └───────────┼────────────┘                │                          │
│              │                             │                          │
│              │ REST + SSE                  │ REST (market data)       │
│              ▼                             ▼                          │
│  ┌──────────────────────┐     ┌──────────────────────┐              │
│  │   Nexus Bridge        │     │   Phemex Exchange     │             │
│  │  ~/CascadeProjects/   │     │   api.phemex.com      │             │
│  │    nexus/             │     │   (Perpetual Futures)  │             │
│  │  Gateway :3800        │     └──────────────────────┘              │
│  │  Conductor :3777      │                                           │
│  │  (separate repo!)     │                                           │
│  │  Dashboard :3810      │     ┌──────────────────────┐              │
│  └──────────────────────┘     │   Claude Agent SDK     │             │
│                                │   (In-process LLM)    │             │
│  ┌──────────────────────┐     └──────────────────────┘              │
│  │   Claude Code Hooks   │                                           │
│  │  session-start.js     │──► Register with Nexus                    │
│  │  post-tool-use.js     │──► Log activity to Nexus                  │
│  │  session-end.js       │──► Deregister from Nexus                  │
│  └──────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Repo 1: Auto-Claude (Praxis) — `~/CascadeProjects/Auto-Claude`

### What It Is
Multi-agent autonomous coding framework. Has THREE sub-systems:
1. **Praxis Core** — Spec creation → planning → coding → QA pipeline
2. **Axon Framework** — Multi-agent team orchestration with heartbeat scheduling (`company/` module)
3. **Electron Desktop UI** — Visual management for specs, agents, companies

### Directory Map

```
apps/
├── backend/                    # ALL Python code lives here
│   ├── run.py                  # Main CLI entry: python run.py --spec 001
│   ├── spec_runner.py          # Spec creation pipeline
│   │
│   ├── core/                   # Infrastructure
│   │   ├── client.py           # Claude Agent SDK client factory (create_client())
│   │   ├── auth.py             # OAuth token management
│   │   ├── nexus.py            # Nexus bridge integration
│   │   └── workspace/          # Git worktree management
│   │
│   ├── agents/                 # Build pipeline agents
│   │   ├── planner.py          # Creates implementation plans
│   │   ├── coder.py            # Implements subtasks
│   │   ├── qa_reviewer.py      # Validates acceptance criteria
│   │   ├── qa_fixer.py         # Fixes QA issues
│   │   └── memory_manager.py   # Graphiti session memory
│   │
│   ├── company/                # *** AXON AGENT FRAMEWORK ***
│   │   ├── db.py               # CompanyDB (SQLite, thread-safe)
│   │   ├── router.py           # FastAPI endpoints (/api/companies, /agents, /issues)
│   │   ├── heartbeat.py        # HeartbeatScheduler (background thread, 10s tick)
│   │   ├── trading.py          # 5-Wave Trading Debate Protocol
│   │   ├── concierge.py        # Steve's AI proxy (CEO authority)
│   │   ├── models.py           # Pydantic schemas (AgentStatus, IssueType, etc.)
│   │   ├── execution.py        # Issue execution orchestration
│   │   ├── checkpoint.py       # Wave-based execution resume points
│   │   ├── account_pool.py     # Multi-account budget management
│   │   ├── templates.py        # Pre-built agent configurations
│   │   └── adapters/
│   │       ├── sdk_adapter.py      # In-process Claude SDK execution
│   │       └── subprocess_adapter.py  # Fallback: claude -p subprocess
│   │
│   ├── daemon/                 # Headless daemon server
│   │   ├── serve.py            # FastAPI app + scheduler lifecycle (:8400)
│   │   └── scheduler.py        # DaemonScheduler wrapper
│   │
│   ├── integrations/           # External service connectors
│   │   ├── graphiti/           # Knowledge graph memory (LadybugDB)
│   │   ├── jira/               # Bi-directional Jira sync
│   │   └── linear/             # Linear progress updates
│   │
│   └── prompts/                # All agent system prompts (.md files)
│       ├── planner.md, coder.md, qa_reviewer.md, qa_fixer.md
│       ├── spec_gatherer.md, spec_writer.md, spec_critic.md
│       └── github/             # GitHub automation prompts
│
└── frontend/                   # Electron desktop app
    └── src/
        ├── main/               # Electron main process
        │   ├── index.ts        # Window creation, IPC setup
        │   └── ipc-handlers/   # All IPC bridges
        │       └── company-handlers.ts  # Proxies to Axon API (:8400)
        ├── preload/            # API bridges to renderer
        └── renderer/           # React UI
            ├── pages/company/  # ControlRoom, ConciergePage, AgentLiveView
            ├── stores/company-store.ts  # Zustand store for Axon state
            └── components/     # UI components
```

### Key Entry Points
```bash
# Praxis build pipeline
cd apps/backend && python run.py --spec 001

# Axon daemon (agent heartbeats)
cd apps/backend && python -m daemon.serve --port 8400 --company "Phantom Trading Co."

# Electron desktop app
npm run dev   # Dev mode with remote debugging on :9222
npm start     # Production build
```

### What This Repo Provides to Others
- **Axon API on :8400** — PhantomX reads agent status, issues, activity via REST + SSE
- **Trade recommendations** — Wave 5 POSTs to PhantomX's `/api/execute-recommendation`
- **Session registration** — Registers with Nexus on :3777 via hooks

### What This Repo Consumes
- **Nexus** (:3777) — Shared memory, cross-session messages
- **Claude Agent SDK** — In-process LLM calls for all agents
- **PhantomX** (:3000) — Forwards trade execution recommendations

---

## Repo 2: PhantomX — `~/CascadeProjects/phantomx`

### What It Is
Next.js trading frontend. Live charts, autonomous execution, agent monitoring, Mission Control command center.

### Directory Map

```
src/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Dashboard (main trading view)
│   ├── trading/page.tsx        # Full trading interface
│   ├── mission-control/page.tsx # Autonomous trading command center
│   ├── agents/page.tsx         # Agent team visualization
│   ├── pipeline/page.tsx       # 5-wave pipeline progress
│   ├── research/page.tsx       # Symbol analysis
│   ├── strategy/page.tsx       # Backtest & optimization
│   ├── journal/page.tsx        # Trade journal
│   ├── scanner/page.tsx        # Gem scanner (4 strategies)
│   ├── knowledge/page.tsx      # Knowledge base
│   ├── controls/page.tsx       # Risk controls & kill switch
│   ├── settings/page.tsx       # App settings
│   ├── ai/page.tsx             # Concierge voice chat
│   │
│   └── api/                    # API Routes
│       ├── phemex/route.ts     # Phemex exchange proxy
│       ├── execute/route.ts    # Strategy execution engine + SSE
│       ├── execute-recommendation/route.ts  # *** RECEIVES FROM AXON ***
│       ├── trading/route.ts    # Trading pipeline unified API
│       ├── webhook/route.ts    # TradingView webhook receiver
│       ├── agents/route.ts     # Local agent orchestrator
│       ├── knowledge/route.ts  # Knowledge base CRUD
│       ├── risk/limits/route.ts # Risk parameters
│       ├── db/strategies/route.ts   # SQLite: strategies
│       ├── db/research/route.ts     # SQLite: research briefs
│       └── db/backtests/route.ts    # SQLite: backtest results
│
├── components/
│   ├── AppSidebar.tsx          # Navigation sidebar
│   ├── AppLayout.tsx           # Main layout wrapper
│   ├── ErrorBoundary.tsx       # Error boundary
│   ├── DataProvider.tsx        # SSE + store initialization
│   ├── trading/               # Trading UI (ControlPanel, SymbolSelector, etc.)
│   ├── chart/                 # TradingChart (lightweight-charts)
│   ├── axon/                  # *** AXON INTEGRATION COMPONENTS ***
│   │   ├── AxonDaemonStatus.tsx        # Daemon health indicator
│   │   ├── AxonTradingPipelineView.tsx # 5-wave pipeline viz
│   │   ├── TradeRecommendationPanel.tsx # Display & execute recommendations
│   │   └── TradeRecommendationListener.tsx # SSE listener
│   ├── mission-control/       # Autonomous trading command center
│   ├── concierge/             # Claude chat interface
│   └── ui/                    # Radix UI component library
│
├── lib/
│   ├── axon/                  # *** AXON CLIENT LIBRARY ***
│   │   ├── client.ts          # REST client for :8400 API
│   │   ├── concierge-stream.ts # SSE streaming for concierge chat
│   │   ├── recommendation-parser.ts # Parse Wave 5 recommendations
│   │   ├── event-source.ts    # SSE listener for agent events
│   │   └── store-bridge.ts    # Axon SSE → Zustand bridge
│   ├── phemex/                # CCXT wrapper for Phemex exchange
│   ├── trading/               # Execution engine, pipeline, risk gate
│   ├── agents/                # Local agent orchestrator (4 agents)
│   ├── market/                # Regime classifier, anomaly detector
│   └── db/                    # SQLite (better-sqlite3)
│
├── store/
│   ├── trading-store.ts       # Primary Zustand store (~40KB)
│   ├── axon-store.ts          # Axon daemon state (~17KB)
│   └── trade-recommendation-store.ts # Recommendation display
│
└── types/
    ├── trading.ts             # All trading domain types (~54KB)
    └── mission-control.ts     # Mission Control types
```

### Key External Connections

| Service | How PhantomX Connects | Direction |
|---------|----------------------|-----------|
| **Axon** (:8400) | `src/lib/axon/client.ts` — REST + SSE | **Reads** agents, issues, activity. **Receives** trade recommendations |
| **Phemex** | `src/lib/phemex/client.ts` — CCXT wrapper | **Reads** market data, **Writes** orders |
| **ElevenLabs** | `src/app/api/elevenlabs/route.ts` | Voice agent conversations |
| **CoinGecko** | `src/lib/agents/macro-agent.ts` | Market data (free tier, no key) |

### Company ID
```
8fc360f2-31bc-4ab2-a441-e69b2d260126  (Phantom Trading Co.)
```
Hardcoded in `axon-store.ts`. All Axon API calls use this company ID.

### Critical Data Flow: Axon → PhantomX Trade Execution
```
Axon Wave 5 completes
  → trading.py POSTs to PhantomX /api/execute-recommendation
    → PhantomX parses recommendation (symbol, direction, leverage, SL, TP)
      → PhemexClient.createOrder() (entry)
      → PhemexClient.createOrder() (stop-loss)
      → PhemexClient.createOrder() (take-profit)
    → POSTs execution result back to Axon /api/issues/{id}/comments
    → PATCHes issue status to 'done'
```

---

## Repo 3: Nexus — `~/CascadeProjects/nexus`

### What It Is
Multi-session coordination hub. Strategy docs + real-time session tracking + shared memory + conversation archive.

### Architecture
Nexus has TWO services:
- **Conductor** (:3777) — Core session orchestrator (sessions, memory, activity)
- **Gateway** (:3800) — Aggregation proxy + local task management + dashboard

> **Note:** The global CLAUDE.md says "Nexus runs on 3777" but that's Conductor. The gateway (with dashboard) runs on **3800**.

### Directory Map

```
nexus/
├── strategy/                   # High-level vision docs
│   ├── harness-engineering.md  # Design philosophy
│   ├── ecosystem-map.md       # System diagram
│   └── orchestrator-vision.md # Roadmap to autonomous orchestration
│
├── architecture/
│   ├── decisions/             # Architecture Decision Records
│   └── patterns/              # Shared implementation patterns
│
├── server/                    # Gateway API (TypeScript/Hono)
│   └── src/
│       ├── index.ts           # Main server (:3800), SSE endpoint
│       ├── db/schema.ts       # SQLite schema (tasks, comments, agents)
│       ├── routes/            # API endpoints
│       │   ├── health.ts      # Probes all upstream services
│       │   ├── sessions.ts    # Proxies Conductor /api/sessions
│       │   ├── memory.ts      # Proxies Conductor /api/memory
│       │   ├── tasks.ts       # Local task CRUD (SQLite)
│       │   ├── activity.ts    # Proxies Conductor /api/activity
│       │   └── conversations.ts # JSONL session archive scanner
│       ├── services/          # Upstream clients
│       │   ├── conductor.ts   # HTTP client for Conductor (:3777)
│       │   └── session-scanner.ts # ~/.claude/projects/ JSONL parser
│       └── sse/aggregator.ts  # SSE relay from Conductor
│
└── app/                       # Dashboard frontend (React/Vite)
    └── src/
        ├── features/
        │   ├── nerve-center/      # System overview dashboard
        │   ├── session-monitor/   # Active session tracking
        │   ├── task-board/        # Kanban task management
        │   ├── activity-river/    # Real-time event stream
        │   ├── memory-explorer/   # Shared memory blocks
        │   ├── conversations/     # JSONL session archive viewer
        │   ├── agent-roster/      # Agent status & metrics
        │   └── metrics/           # Performance dashboard
        └── lib/
            ├── api.ts             # Fetch client
            └── sse.ts             # useSSE hook
```

### How Other Repos Connect to Nexus

**Claude Code Hooks** (configured globally, fire for ALL sessions):
- `hooks/session-start.js` → `POST /api/sessions/register` (assigns animal name)
- `hooks/post-tool-use.js` → `POST /api/activity` (logs every tool use)
- `hooks/user-prompt.js` → logs user messages
- `hooks/session-end.js` → deregisters session

**From Auto-Claude** (`core/nexus.py`):
- `POST /api/memory` — save discoveries
- `GET /api/memory/context` — fetch shared context
- `POST /api/messages` — cross-session messaging

**From PhantomX**: Not directly integrated (yet).

---

## Cross-Repo Data Flows

### Flow 1: Autonomous Trading (Axon → PhantomX → Phemex)
```
[Auto-Claude]                    [PhantomX]                    [Phemex]
Axon Daemon :8400                Next.js :3000                 Exchange
    │                                │                            │
    │ Wave 1-4: Agents debate        │                            │
    │ (research, argue, approve)     │                            │
    │                                │                            │
    │──POST /api/execute-recommendation──►                        │
    │  {symbol, direction, leverage,  │                            │
    │   stop_loss, take_profit}       │                            │
    │                                │──createOrder(entry)────────►│
    │                                │──createOrder(stop-loss)────►│
    │                                │──createOrder(take-profit)──►│
    │                                │                            │
    │◄──POST /api/issues/{id}/comments──│ (execution result)      │
    │◄──PATCH /api/issues/{id}───────── │ (status → done)          │
```

### Flow 2: Session Lifecycle (Claude Code → Nexus)
```
[Any Claude Code Session]        [Nexus Conductor :3777]
    │                                │
    │──session-start hook──────────► │ Register, get animal name
    │◄──briefing (unread msgs)────── │
    │                                │
    │──post-tool-use hook──────────► │ Log activity
    │──user-prompt hook────────────► │ Log prompt
    │                                │
    │──session-end hook────────────► │ Deregister
```

### Flow 3: Agent Monitoring (Axon → Electron UI)
```
[Axon Daemon :8400]              [Electron Frontend]
    │                                │
    │◄──GET /api/companies/{id}/agents───│ Poll agents
    │◄──GET /api/companies/{id}/stream──│ SSE subscription
    │                                │
    │──SSE: agent_status────────────►│ Update company-store
    │──SSE: heartbeat_decision──────►│ Update live feed
    │──SSE: issue_status────────────►│ Update issue board
```

### Flow 4: Agent Monitoring (Axon → PhantomX)
```
[Axon Daemon :8400]              [PhantomX :3000]
    │                                │
    │◄──GET /health─────────────────│ Health check
    │◄──GET /api/companies/{id}/agents──│ Agent roster
    │◄──GET /api/companies/{id}/activity──│ Activity feed
    │◄──SSE /api/companies/{id}/stream──│ Live events
    │                                │
    │──events────────────────────────►│ axon-store.ts processes
    │                                │ store-bridge.ts syncs to UI
```

---

## Port Map

| Port | Service | Repo | Notes |
|------|---------|------|-------|
| **3000** | PhantomX (Next.js) | phantomx | Trading frontend |
| **3777** | Nexus Conductor (backend) | **conductor** (separate repo `~/CascadeProjects/conductor`) | Core backend — owns the session/memory/message DB |
| **3800** | Nexus Gateway (`nexus-gateway`) | nexus/server | Aggregation proxy over the Conductor |
| **3810** | Nexus Dashboard (Vite) | nexus/app | Mission Control UI — the screen Steve looks at |
| **8400** | Axon API (FastAPI) | Auto-Claude | Agent daemon |
| **9222** | Electron Remote Debug | Auto-Claude | E2E testing only |

---

## Environment Variables — Cross-Repo

### Auto-Claude (`apps/backend/.env`)
```bash
CLAUDE_CODE_OAUTH_TOKEN=...         # Required for Claude SDK
PHANTOMX_URL=http://localhost:3000  # Where to forward trade recommendations
GRAPHITI_ENABLED=true               # Enable knowledge graph memory
```

### PhantomX (`.env.local`)
```bash
PHEMEX_API_KEY=...                  # Exchange credentials
PHEMEX_API_SECRET=...
PHEMEX_TESTNET=true|false
ELEVENLABS_API_KEY=...              # Voice agent (optional)
# Axon URL is hardcoded in axon-store.ts as http://localhost:8400
```

### Nexus
```bash
# Conductor URL hardcoded in server/src/services/conductor.ts as http://localhost:3777
PORT=3800                           # Gateway port
```

---

## Database Locations

| Database | Path | Repo | Engine |
|----------|------|------|--------|
| Axon company DB | `apps/backend/company.db` | Auto-Claude | SQLite (WAL mode) |
| PhantomX trading DB | `phantomx/data/` (runtime) | PhantomX | SQLite (better-sqlite3) |
| Nexus task DB | `~/.nexus/mission-control.db` | Nexus | SQLite (WAL mode) |
| Graphiti memory | `.auto-claude/specs/XXX/graphiti/` | Auto-Claude | LadybugDB (embedded) |
| Conversation archive | `~/.claude/projects/` | All | JSONL files |

---

## Common Mistakes Sessions Make

| Mistake | Reality |
|---------|---------|
| "I'll add the trading API route to Auto-Claude" | Trading API routes live in **PhantomX** (`src/app/api/`) |
| "I'll modify the agent heartbeat in PhantomX" | Agent heartbeats live in **Auto-Claude** (`company/heartbeat.py`) |
| "I'll add this to the Nexus API" | Check if it's Conductor (:3777) or Gateway (:3800) — they're different services |
| "The Axon store is in Auto-Claude" | There are TWO Axon stores: `company-store.ts` (Electron) and `axon-store.ts` (PhantomX) |
| "I'll create the execute-recommendation endpoint" | It already exists in PhantomX at `src/app/api/execute-recommendation/route.ts` |
| "Nexus runs on port 3777" | That's Conductor. Nexus Gateway runs on **3800** |
| "I'll add agent types to PhantomX" | Agent types/models are defined in Auto-Claude (`company/models.py`). PhantomX consumes via REST |
| "The trading pipeline is in PhantomX" | The 5-wave debate pipeline is in Auto-Claude (`company/trading.py`). PhantomX only receives the final recommendation |

---

## Who Owns What

| Concern | Owner Repo | Key File(s) |
|---------|-----------|-------------|
| Agent definitions & personas | Auto-Claude | `company/db.py`, agent SOUL.md files |
| Agent heartbeat scheduling | Auto-Claude | `company/heartbeat.py` |
| Trading debate (5-wave) | Auto-Claude | `company/trading.py` |
| Trade execution (orders) | PhantomX | `src/app/api/execute-recommendation/route.ts` |
| Exchange connectivity | PhantomX | `src/lib/phemex/client.ts` |
| Live charts | PhantomX | `src/components/chart/TradingChart.tsx` |
| Mission Control UI | PhantomX | `src/components/mission-control/` |
| Agent monitoring (Electron) | Auto-Claude | `frontend/src/renderer/pages/company/` |
| Agent monitoring (Web) | PhantomX | `src/components/axon/` |
| Session tracking | Nexus | `server/src/routes/sessions.ts` |
| Cross-session memory | Nexus | `server/src/routes/memory.ts` |
| Conversation archive | Nexus | `server/src/services/session-scanner.ts` |
| Spec creation pipeline | Auto-Claude | `spec_runner.py`, `spec_agents/` |
| Build pipeline (plan→code→QA) | Auto-Claude | `agents/planner.py`, `agents/coder.py` |
| Concierge AI (company) | Auto-Claude | `company/concierge.py` |
| Kill switch (trading) | PhantomX | `src/lib/kill-switch.ts` |
| Risk controls | PhantomX | `src/app/api/risk/limits/route.ts` |

---

## Starting the Full Stack

```bash
# 1. Start Nexus Conductor (session tracking) — SEPARATE repo, NOT inside nexus/
cd ~/CascadeProjects/conductor && node dist/index.js

# 2. Start Axon daemon (agent heartbeats)
cd ~/CascadeProjects/Auto-Claude/apps/backend
python -m daemon.serve --port 8400 --company "Phantom Trading Co."

# 3. Start PhantomX (trading UI)
cd ~/CascadeProjects/phantomx && npm run dev

# 4. (Optional) Start Nexus Gateway + Dashboard
cd ~/CascadeProjects/nexus/server && npm run dev
cd ~/CascadeProjects/nexus/app && npm run dev

# 5. (Optional) Start Praxis Electron UI
cd ~/CascadeProjects/Auto-Claude && npm run dev
```

---

## For AI Sessions: Quick Decision Tree

```
Need to modify agent behavior?
  → Auto-Claude: company/ module (heartbeat.py, trading.py, adapters/)

Need to modify trading execution?
  → PhantomX: src/app/api/execute-recommendation/route.ts

Need to modify the trading UI?
  → PhantomX: src/components/ (chart/, mission-control/, axon/)

Need to modify the Electron desktop UI?
  → Auto-Claude: apps/frontend/src/renderer/

Need to add cross-session memory?
  → Nexus: Use the API at :3777

Need to modify the build pipeline (spec→code→QA)?
  → Auto-Claude: apps/backend/ (agents/, spec_agents/, prompts/)

Need to add a new agent type?
  → Auto-Claude: company/models.py (schema) + company/templates.py (config)
  → Then create SOUL.md + HEARTBEAT.md instruction files

Need to modify how agents talk to the exchange?
  → Auto-Claude: company/trading.py (debate protocol) + PhantomX: lib/phemex/ (CCXT)
```
