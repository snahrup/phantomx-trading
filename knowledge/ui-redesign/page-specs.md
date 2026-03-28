# Page Specifications — Paperclip Dashboard Redesign

> **Date:** 2026-03-08
> **Author:** UI Design Division
> **Pages:** 8 core pages (consolidated from 24)

---

## Navigation Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  [Status Bar] Company: Phantom Trading Co. │ MANUAL │ 18/22 ▲ │
├──────────┬──────────────────────────────────────────────────────┤
│ SIDEBAR  │                                                      │
│ 240px    │                   MAIN CONTENT                       │
│          │                   (full width)                        │
│ Dashboard│                                                      │
│ Agents   │                                                      │
│ Work     │                                                      │
│ Trading  │                                                      │
│ Analytics│                                                      │
│ Costs    │                                                      │
│ Settings │                                                      │
│          │                                                      │
│          │                                                      │
│ [theme]  │                                                      │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## Page 1: Dashboard (Command Center)

**Route:** `/:prefix/dashboard`
**Purpose:** Single view for 80% of daily interactions

### Layout (ASCII Wireframe)

```
┌─────────────────────────────────────────────────────────────────┐
│ Dashboard                                          [🔔 3] [⌘K] │
├────────────────────┬────────────────────┬───────────────────────┤
│ ┌────────────────┐ │ ┌────────────────┐ │ ┌─────────────────┐  │
│ │ 🤖 Agents      │ │ │ 💰 Daily P&L   │ │ │ 🎯 Goals        │  │
│ │ 18 active      │ │ │ +$1,247.50     │ │ │ 2/5 complete    │  │
│ │ 2 error   ▴12% │ │ │ ▴ +3.2% today  │ │ │ ████████░░ 40%  │  │
│ └────────────────┘ │ └────────────────┘ │ └─────────────────┘  │
│ ┌────────────────┐ │ ┌────────────────┐ │ ┌─────────────────┐  │
│ │ 📋 Open Issues │ │ │ 💸 Monthly Cost│ │ │ ⚡ Kill Switch   │  │
│ │ 14 total       │ │ │ $847 / $2,000  │ │ │ ● ARMED         │  │
│ │ 3 critical     │ │ │ ████████░░ 42% │ │ │ Click to toggle │  │
│ └────────────────┘ │ └────────────────┘ │ └─────────────────┘  │
├─────────────────────────────┬───────────────────────────────────┤
│                             │                                   │
│  AGENT GRID                 │  PENDING ACTIONS                  │
│  (3x4 or 4x5 card grid)    │                                   │
│                             │  ┌───────────────────────────┐   │
│  ┌──────┐ ┌──────┐ ┌─────┐ │  │ ⏳ Approval: Strategy      │   │
│  │CEO   │ │Found.│ │Risk │ │  │   Architect requests...    │   │
│  │●run  │ │●idle │ │●run │ │  │   [Approve] [Reject]       │   │
│  │2m ago│ │5m ago│ │1m ag│ │  └───────────────────────────┘   │
│  └──────┘ └──────┘ └─────┘ │  ┌───────────────────────────┐   │
│  ┌──────┐ ┌──────┐ ┌─────┐ │  │ ❌ Failed: Scanner Monitor  │   │
│  │Strat.│ │Scan. │ │Exec.│ │  │   ECONNREFUSED at 00:32   │   │
│  │●idle │ │⚠err  │ │●idle│ │  │   [Retry] [Dismiss]        │   │
│  └──────┘ └──────┘ └─────┘ │  └───────────────────────────┘   │
│  ... more agent cards ...   │  ┌───────────────────────────┐   │
│                             │  │ 💰 Budget: CEO at 82%      │   │
│                             │  │   $410 / $500 this month   │   │
│                             │  │   [View Costs]             │   │
│                             │  └───────────────────────────┘   │
├─────────────────────────────┴───────────────────────────────────┤
│                                                                 │
│  POSITIONS                                                      │
│  ┌──────────┬──────┬──────────┬────────┬──────────┬──────────┐ │
│  │ Symbol   │ Side │ Size     │ Entry  │ Unrl P&L │ ROE      │ │
│  ├──────────┼──────┼──────────┼────────┼──────────┼──────────┤ │
│  │ BTCUSDT  │ LONG │ 0.05 BTC │ 67,420 │ +$312.50 │ +4.63%  │ │
│  │ ETHUSDT  │ SHORT│ 2.0 ETH  │ 3,850  │ -$47.20  │ -1.23%  │ │
│  └──────────┴──────┴──────────┴────────┴──────────┴──────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ACTIVITY TIMELINE                                              │
│  ● 00:45  CEO completed heartbeat — delegated PAP-12 to Strat  │
│  ● 00:43  Strategy Architect analyzing EMA ribbon setup         │
│  ⚠ 00:32  Scanner Monitor heartbeat FAILED — ECONNREFUSED      │
│  ● 00:28  Founding Engineer synced Nexus context                │
│  ● 00:26  Head of Design completed layout implementation        │
│  ...                                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Components Required
- `MetricCard` (6 variants: agents, P&L, issues, cost, goals, kill switch)
- `AgentGridCard` — Compact agent card (icon, name, status pill, last heartbeat)
- `PendingActionCard` — Approval/failure/alert with inline actions
- `PositionsTable` — Compact position list from Phemex
- `ActivityTimeline` — Timestamped activity stream with entity links
- `StatusBar` — Company name, trading mode, agent count (persistent top bar)

### Data Requirements
- `GET /api/companies/:id/agents` (status, lastHeartbeatAt)
- `GET /api/dashboard/summary` (metrics)
- `GET /api/companies/:id/issues?status=open` (count)
- `GET /api/companies/:id/approvals?status=pending`
- `GET /api/companies/:id/activity?limit=20`
- `GET /api/companies/:id/costs?preset=mtd`
- `GET http://localhost:3100/api/phemex/positions` (trading positions)
- `GET /api/companies/:id/goals` (progress)

---

## Page 2: Agents

**Route:** `/:prefix/agents`
**Purpose:** Agent management with grid view, org tree, and batch operations

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Agents                    [Grid | Org Tree]  [Filter ▾] [⌘K]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐│
│  │ ☐ CEO        │ │ ☐ Found. Eng │ │ ☐ Risk Off.  │ │ ☐ Head ││
│  │ 🟢 Running   │ │ ⚪ Idle       │ │ 🟢 Running   │ │   of   ││
│  │ Last: 2m ago │ │ Last: 5m ago │ │ Last: 1m ago │ │ Design ││
│  │ $410/$500    │ │ $180/$300    │ │ $95/$150     │ │ ⚪ Idle ││
│  │ ████████░░   │ │ ██████░░░░   │ │ ██████░░░░   │ │ $45/$  ││
│  │ opus-4       │ │ sonnet-4     │ │ sonnet-4     │ │ 300    ││
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────┘│
│  ... (4-column grid, all 22 agents) ...                        │
│                                                                 │
│  [▶ Resume Selected]  [⏸ Pause Selected]  [🔄 Trigger Selected]│
└─────────────────────────────────────────────────────────────────┘
```

**Org Tree view (toggle):**
```
┌─────────────────────────────────────────────────────────────────┐
│                        Board (Steve)                            │
│                            │                                    │
│                       ┌────┴────┐                               │
│                       │  CEO    │                               │
│                       │ 🟢 run  │                               │
│                       └────┬────┘                               │
│              ┌─────────┬───┴───┬──────────┐                     │
│         ┌────┴───┐┌────┴──┐┌──┴────┐┌────┴────┐               │
│         │Found.  ││Head   ││Head   ││Head     │               │
│         │Eng     ││Trading││Research││Design  │               │
│         │⚪ idle  ││🟢 run  ││🟢 run  ││⚪ idle  │               │
│         └────────┘└───┬───┘└───┬───┘└────┬────┘               │
│                   ... │    ... │     ... │                      │
└─────────────────────────────────────────────────────────────────┘
```

### Agent Quick Panel (Slide-Out)
Click any agent card → right panel slides in:
```
┌─────────────────────────┐
│ CEO                  ✕  │
│ claude-opus-4           │
│ Status: 🟢 Running      │
│ Last heartbeat: 2m ago  │
│ Budget: $410 / $500     │
│                         │
│ [⏸ Pause] [🔄 Trigger]  │
│ [📋 View Issues]        │
│ [⚙️ Full Config →]      │
│                         │
│ Recent Runs:            │
│ ● 00:31 — succeeded    │
│ ● 00:16 — succeeded    │
│ ⚠ 23:58 — failed       │
└─────────────────────────┘
```

### Components Required
- `AgentCard` — Full agent card with checkbox, status, budget bar
- `AgentOrgTree` — Interactive org tree visualization
- `AgentQuickPanel` — Slide-out panel with quick actions
- `BatchActionBar` — Bulk pause/resume/trigger controls
- `StatusFilter` — Filter bar (all, active, paused, error, idle)

---

## Page 3: Work (Issues + Goals)

**Route:** `/:prefix/work`
**Purpose:** All work items — issues, projects, goals in one unified view

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Work              [Kanban | List]  [Project ▾] [+ New Issue]    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  BACKLOG (4) │ IN PROG (6)  │ REVIEW (2)   │ DONE (12)         │
│              │              │              │                    │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────────┐  │
│ │ PAP-15   │ │ │ PAP-8    │ │ │ PAP-11   │ │ │ PAP-3        │  │
│ │ Risk     │ │ │ Design 3 │ │ │ QA loop  │ │ │ Agent setup  │  │
│ │ params   │ │ │ strats   │ │ │ pipeline │ │ │ ✓ completed  │  │
│ │ 🔴 crit  │ │ │ 🟡 high  │ │ │ 🟡 high  │ │ │              │  │
│ │ → Strat. │ │ │ → Strat. │ │ │ → QA Eng │ │ │              │  │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────────┘  │
│ ┌──────────┐ │ ┌──────────┐ │              │                    │
│ │ PAP-16   │ │ │ PAP-12   │ │              │                    │
│ │ ...      │ │ │ ...      │ │              │                    │
│ └──────────┘ │ └──────────┘ │              │                    │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

**Goals bar (top of page, collapsible):**
```
┌─────────────────────────────────────────────────────────────────┐
│ 🎯 Goals                                            [collapse]  │
│                                                                 │
│ Build profitable strategies  ████████░░░░░░░░ 40%  (2/5 KRs)   │
│ Automate risk management     ██████████████░░ 70%  (7/10 KRs)  │
│ Ship dashboard redesign      ████░░░░░░░░░░░░ 15%  (1/7 KRs)   │
└─────────────────────────────────────────────────────────────────┘
```

### Issue Detail (Slide-Out Panel)
Click issue card → right panel with full details:
```
┌──────────────────────────────────┐
│ PAP-8: Design 3 Strategies   ✕  │
│                                  │
│ Status: [In Progress ▾]         │
│ Priority: [🟡 High ▾]           │
│ Assignee: [Strategy Architect ▾]│
│ Project: [Core Trading ▾]       │
│ Due: 2026-03-15                 │
│                                  │
│ Description:                     │
│ Design 3 aggressive strategies  │
│ targeting 50x leverage pairs... │
│                                  │
│ Comments (3):                    │
│ ┌────────────────────────────┐  │
│ │ CEO — 2h ago               │  │
│ │ This is the critical path. │  │
│ │ Prioritize BTC/ETH pairs.  │  │
│ └────────────────────────────┘  │
│ [Add comment...]                 │
└──────────────────────────────────┘
```

### Components Required
- `KanbanBoard` — Drag-and-drop status columns
- `IssueCard` — Compact card (ID, title, priority icon, assignee avatar)
- `GoalProgressBar` — Goal with completion percentage
- `IssueDetailPanel` — Slide-out full issue editor
- `ProjectFilter` — Project scope dropdown
- `ListView` — Alternative tabular list view

---

## Page 4: Trading

**Route:** `/:prefix/trading`
**Purpose:** Full trading view with positions, charting, risk visualization

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Trading                    MODE: MANUAL 🟡   KILL SWITCH: ● ON  │
├──────────────────────────────────────────┬──────────────────────┤
│                                          │                      │
│  CHART (candlestick)                     │  RISK METERS         │
│  [BTCUSDT ▾] [1H ▾] [4H] [1D]          │                      │
│                                          │  Position Util.      │
│  ┌──────────────────────────────────┐   │  ████████░░ 75%      │
│  │                                  │   │  $15k / $20k max     │
│  │    📊 Candlestick Chart          │   │                      │
│  │    (lightweight-charts)          │   │  Daily Loss          │
│  │                                  │   │  ████░░░░░░ 35%      │
│  │                                  │   │  -$350 / -$1k limit  │
│  │                                  │   │                      │
│  └──────────────────────────────────┘   │  Leverage            │
│                                          │  50x (max: 50x)     │
│                                          │                      │
│                                          │  Exposure            │
│                                          │  ██████░░░░ 55%      │
│                                          │  $27.5k / $50k       │
├──────────────────────────────────────────┴──────────────────────┤
│                                                                 │
│  ALL POSITIONS                                                  │
│  ┌──────┬──────┬────────┬────────┬──────────┬───────┬────────┐ │
│  │Symbol│ Side │ Size   │ Entry  │ Unrl P&L │ ROE   │ Action │ │
│  ├──────┼──────┼────────┼────────┼──────────┼───────┼────────┤ │
│  │BTCUSD│ LONG │ 0.05   │ 67,420 │ +$312.50 │+4.63% │ [Close]│ │
│  │ETHUSD│ SHORT│ 2.0    │ 3,850  │ -$47.20  │-1.23% │ [Close]│ │
│  │SOLUSD│ LONG │ 50     │ 148.20 │ +$89.00  │+1.20% │ [Close]│ │
│  └──────┴──────┴────────┴────────┴──────────┴───────┴────────┘ │
│                                                                 │
│  RECENT TRADES                                                  │
│  ● BTCUSDT LONG opened at 67,420 — 2h ago — by: Execution Trad │
│  ● SOLUSD LONG opened at 148.20 — 4h ago — by: Execution Trad  │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Components Required
- `TradingChart` — Lightweight-charts candlestick (existing, keep)
- `RiskMeterPanel` — Vertical stack of utilization meters
- `PositionsTable` — All positions with close action
- `RecentTradesList` — Trade history timeline
- `TradingModeIndicator` — Manual/Autonomous with toggle
- `KillSwitchButton` — Prominent safety control
- `SymbolSelector` — Symbol dropdown with search

---

## Page 5: Analytics

**Route:** `/:prefix/analytics`
**Purpose:** Historical performance, backtesting, strategy analysis

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Analytics                           [7D] [30D] [90D] [All]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  P&L CHART (area chart, cumulative)                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   $2,500 ─────────────────────────── ╱                  │   │
│  │   $2,000 ─────────────────────── ╱──╱                   │   │
│  │   $1,500 ────────────────── ╱───╱                       │   │
│  │   $1,000 ──────────── ╱───╱                             │   │
│  │      $0  ─────── ╱───╱                                  │   │
│  │          Mar 1    Mar 3    Mar 5    Mar 7                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├──────────────────────────────┬──────────────────────────────────┤
│  STRATEGY PERFORMANCE        │  AGENT PERFORMANCE               │
│                              │                                  │
│  ┌────────────┬─────┬─────┐ │  ┌────────────┬────────┬──────┐ │
│  │ Strategy   │ W/L │ Exp │ │  │ Agent      │ Runs   │ Cost │ │
│  ├────────────┼─────┼─────┤ │  ├────────────┼────────┼──────┤ │
│  │ EMA Ribbon │ 7/3 │+1.2%│ │  │ CEO        │ 142    │ $410 │ │
│  │ Liq Sweep  │ 4/2 │+0.8%│ │  │ Strat Arch │ 98     │ $215 │ │
│  │ BTC Fade   │ 2/5 │-0.3%│ │  │ Scanner    │ 312    │ $180 │ │
│  └────────────┴─────┴─────┘ │  └────────────┴────────┴──────┘ │
│                              │                                  │
├──────────────────────────────┴──────────────────────────────────┤
│                                                                 │
│  LEARNINGS / TRADING JOURNAL                                    │
│  📄 "Never fight the 4H trend" — from BTCUSDT loss Mar 3       │
│  📄 "SOL funding rates spike before dumps" — observed Mar 5    │
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Components Required
- `PnLChart` — Area chart, cumulative P&L over time
- `StrategyTable` — Strategy win/loss/expectancy breakdown
- `AgentPerformanceTable` — Runs, cost, success rate per agent
- `LearningsPanel` — Trading journal entries from knowledge base
- `DateRangeSelector` — Preset range buttons

---

## Page 6: Costs

**Route:** `/:prefix/costs`
**Purpose:** Budget tracking and spend analysis

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Costs                              [MTD] [7D] [30D] [Custom]   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Total Spend  │ │ Projected    │ │ Budget Remain│            │
│  │ $847.00      │ │ $1,420/mo    │ │ $1,153.00    │            │
│  │ ████████░░   │ │ Based on     │ │ 58% remaining│            │
│  │ 42% of $2k   │ │ current rate │ │              │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  COST BY AGENT                                                  │
│  ┌──────────────────┬────────┬────────┬───────┬──────────────┐ │
│  │ Agent            │ Spent  │ Budget │ %     │ Bar          │ │
│  ├──────────────────┼────────┼────────┼───────┼──────────────┤ │
│  │ CEO              │ $410   │ $500   │ 82% ⚠│ ████████████ │ │
│  │ Strategy Arch    │ $215   │ $250   │ 86% ⚠│ █████████████│ │
│  │ Founding Eng     │ $180   │ $300   │ 60%  │ ████████░░░░ │ │
│  │ Scanner Monitor  │ $42    │ $200   │ 21%  │ ████░░░░░░░░ │ │
│  │ ...              │        │        │       │              │ │
│  └──────────────────┴────────┴────────┴───────┴──────────────┘ │
│                                                                 │
│  COST OVER TIME (stacked area chart)                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │   Chart showing daily cost by agent, stacked            │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Components Required
- `CostSummaryCards` — Total, projected, remaining
- `CostByAgentTable` — Agent cost vs budget with visual bars
- `CostOverTimeChart` — Stacked area chart by agent
- `DatePresetSelector` — MTD/7D/30D/Custom range

---

## Page 7: Settings

**Route:** `/:prefix/settings`
**Purpose:** All configuration in tabbed layout

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Settings                                                        │
├─────────────────────────────────────────────────────────────────┤
│ [Company] [Risk Management] [Trading] [Integrations]            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RISK MANAGEMENT TAB:                                           │
│                                                                 │
│  Position Limits                                                │
│  ┌──────────────────────────────────────────────────┐          │
│  │ Max position size (% of equity):  [    5%     ]  │          │
│  │ Max total exposure:               [  $50,000  ]  │          │
│  │ Max leverage per position:        [    50x    ]  │          │
│  │ Max concurrent positions:         [     8     ]  │          │
│  └──────────────────────────────────────────────────┘          │
│                                                                 │
│  Loss Limits                                                    │
│  ┌──────────────────────────────────────────────────┐          │
│  │ Daily loss limit (kill switch):   [ -$1,000   ]  │          │
│  │ Weekly loss limit:                [ -$3,000   ]  │          │
│  │ Max drawdown before pause:        [    15%    ]  │          │
│  └──────────────────────────────────────────────────┘          │
│                                                                 │
│  Funding Rate Limits                                            │
│  ┌──────────────────────────────────────────────────┐          │
│  │ Max funding rate cost/8h:         [  0.03%    ]  │          │
│  └──────────────────────────────────────────────────┘          │
│                                                                 │
│                                    [Save Changes]               │
└─────────────────────────────────────────────────────────────────┘
```

### Tabs
1. **Company** — Name, description, brand color, issue prefix (existing CompanySettings)
2. **Risk Management** — UI for risk-params.json (NEW)
3. **Trading** — Trading mode toggle (manual/autonomous), exchange status
4. **Integrations** — Nexus bridge status, exchange API key management

### Components Required
- `SettingsTabs` — Tab navigation
- `RiskParamsForm` — Editable form for risk parameters
- `TradingModeToggle` — Manual/autonomous switch with confirmation
- `IntegrationStatusCard` — Connection status for external services
- `ExchangeConnectionStatus` — Phemex API health

---

## Page 8: Agent Detail

**Route:** `/:prefix/agents/:agentId`
**Purpose:** Deep agent configuration (accessed from Agent Quick Panel)

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Agents    CEO                    [⏸ Pause] [🔄 Trigger]│
├─────────────────────────────────────────────────────────────────┤
│ [Overview] [Runs] [Configuration] [Permissions]                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  OVERVIEW TAB:                                                  │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Status       │ │ Total Runs   │ │ Success Rate │            │
│  │ 🟢 Running   │ │ 142          │ │ 94.4%        │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                 │
│  HEALTH TIMELINE (heatmap — last 7 days)                        │
│  Mon: 🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢            │
│  Tue: 🟢🟢🟢🟢🟢🟢🔴🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢            │
│  Wed: 🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢⚪⚪⚪⚪⚪⚪🟢🟢🟢🟢🟢🟢            │
│  ...                                                            │
│                                                                 │
│  RECENT RUNS                                                    │
│  ┌────────┬──────────┬──────────┬──────────┬────────┐          │
│  │ Run ID │ Started  │ Duration │ Status   │ Cost   │          │
│  ├────────┼──────────┼──────────┼──────────┼────────┤          │
│  │ dac8f6 │ 00:50:49 │ 1m 09s   │ ✓ passed │ $0.29  │          │
│  │ b7c3e2 │ 00:35:12 │ 0m 45s   │ ✓ passed │ $0.18  │          │
│  │ a1d8f3 │ 00:20:01 │ 2m 30s   │ ✗ failed │ $0.42  │          │
│  └────────┴──────────┴──────────┴──────────┴────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Components Required
- `AgentOverview` — Status, metrics, health timeline
- `HealthHeatmap` — Grid heatmap of heartbeat success/fail (NEW)
- `RunsTable` — Paginated run history
- `AgentConfigForm` — Adapter, model, env, instructions (existing, cleaned up)
- `PermissionsPanel` — Agent permissions editor

---

## Interaction Specifications

### Hover States
- Cards: Subtle shadow lift (`--shadow-sm` → `--shadow-md`), 150ms transition
- Buttons: Slight color darken (5% darker), 150ms
- Nav items: `--accent` background, 100ms
- Table rows: `--accent` background, 100ms

### Transitions
- Panel slide-in: 250ms ease-out, from right
- Modal open: 200ms fade + scale(0.98 → 1.0)
- Page transitions: 150ms fade
- Sidebar collapse: 200ms ease

### Click Targets
- Minimum 44px height on mobile
- Minimum 36px height on desktop
- 8px minimum gap between clickable elements

### Keyboard Navigation
- Tab through all interactive elements
- Escape closes modals/panels
- Cmd+K opens command palette anywhere
- Arrow keys navigate lists/grids
