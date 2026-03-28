# Feature Recommendations — Paperclip Dashboard Redesign

> **Date:** 2026-03-08
> **Author:** UX Research Division
> **Principle:** Every feature must earn its screen space. If it duplicates another view, it dies.

---

## Features to KEEP (Core Value)

### 1. Dashboard — REBUILT as Command Center
The dashboard is the product. Rebuild it as a dense, information-rich command center:

| Widget | Data | Actions |
|--------|------|---------|
| Agent Grid | All agents, status, last heartbeat, run result | Pause/resume/trigger inline |
| P&L Card | Daily/weekly/total P&L from Phemex | Link to Trading detail |
| Active Positions | Symbol, side, size, unrealized PnL, ROE | Close position inline |
| Pending Approvals | Request summary, requester | Approve/reject inline |
| Failed Runs | Agent name, error preview, timestamp | Retry/dismiss inline |
| Goal Progress | Top-level goals with completion % bars | — |
| Budget Meters | Per-agent spend vs. monthly budget | Alert on >80% |
| Activity Timeline | Recent activity stream, entity-linked | Filter by type |
| Risk Status | Kill switch state, exposure utilization | Toggle kill switch |
| System Health | Server, DB, exchange connection status | — |

### 2. Agent Management — CONSOLIDATED
Merge Agents list, Org tree, and agent actions into one unified page:
- **Default view:** Grid of agent cards (status, role, last heartbeat, budget usage)
- **Toggle:** Org tree view (interactive, same page)
- **Quick panel:** Click agent → slide-out with status, recent runs, quick actions
- **Batch ops:** Select multiple → pause/resume/trigger all
- **Full detail:** Preserved for deep config, but accessed from the panel, not a separate route

### 3. Issues / Work — CONSOLIDATED
Merge Issues, Projects, and Goals into a unified "Work" section:
- **Default view:** Kanban board (columns = status)
- **Toggle:** List view, Project-scoped view
- **Filters:** By project, priority, assignee, status
- **Goal integration:** Goals shown as collapsible header sections, issues nest under them
- **Inline editing:** Status drag, priority click-cycle, assignee picker

### 4. Trading — ENHANCED
Keep as dedicated page but enhance:
- Multi-position overview (all symbols at once, not single-select)
- Risk utilization visualization (position size vs. max, daily loss vs. limit)
- Kill switch prominent in header
- Funding rate alerts

### 5. Analytics — KEPT
Backtesting and performance analysis stay. Add:
- Agent-specific performance breakdown
- Strategy win rate / expectancy metrics
- Historical P&L chart

### 6. Costs — ENHANCED
Keep dedicated page, add:
- Budget vs. actual per agent (visual bars)
- Projected monthly cost based on current run rate
- Cost per trade / cost per heartbeat metrics
- Alert thresholds

### 7. Settings — CONSOLIDATED
Merge all config into tabbed settings:
- Company info
- Risk Management (UI for risk-params.json — position limits, daily loss limits, max leverage)
- Trading Mode toggle (manual/autonomous)
- Exchange connection (Phemex status, API key management)
- Integrations (Nexus bridge status)

---

## Features to REMOVE

### 1. Separate Org Page (`/org`)
**Why:** Duplicates the org tree toggle already on the Agents page. One view, one place.

### 2. MyIssues (`/my-issues`)
**Why:** Not even routed. Only one user. Issues page with "assigned to me" filter serves the same purpose.

### 3. Separate Inbox (`/inbox`)
**Why:** Dashboard command center absorbs all inbox functionality. Failed runs, alerts, approvals — all on the dashboard.

### 4. Separate Approvals Page (`/approvals`)
**Why:** Dashboard surfaces pending approvals with inline approve/reject. Full list accessible via "See all" link if needed, but doesn't need a sidebar nav item.

### 5. Separate Activity Page (`/activity`)
**Why:** Dashboard timeline widget replaces this. Activity log is a supporting feature, not a destination.

### 6. DesignGuide (`/design-guide`)
**Why:** Developer tool. Should be dev-only route, not in production navigation.

### 7. Companies Page / CompanyRail
**Why:** Steve has one company. Multi-tenant routing adds complexity. Keep the data model (future-proofing) but remove the UI switcher. If Steve ever has 2+ companies, re-add.

### 8. BoardClaim / InviteLanding
**Why:** One-time auth flows. Keep the routes but remove from navigation entirely.

---

## NEW Features to ADD

### 1. Risk Dashboard Widget (Dashboard)
Visualize the risk framework from `knowledge/risk-management/risk-params.json`:
- Position size utilization (current vs. max %)
- Daily loss meter (current vs. trigger threshold)
- Total exposure meter
- Leverage per position
- Kill switch status (armed/triggered/disabled)

### 2. Agent Health Timeline (Agent Detail)
Show a timeline/heatmap of agent heartbeats:
- Green = succeeded, Red = failed, Gray = idle
- Last 24h / 7d / 30d views
- Click on a cell to see that run's details

### 3. Trading Mode Indicator (Global)
Persistent indicator in the top bar showing:
- `MANUAL` (orange) — Steve is trading, agents observe only
- `AUTONOMOUS` (green) — Agents trading within risk framework
- Click to toggle (with confirmation dialog)

### 4. Quick Command Enhancements (Cmd+K)
Expand the command palette to include:
- "Pause all agents"
- "Resume all agents"
- "Trigger [agent name] heartbeat"
- "Show [agent name] last run"
- "Switch to manual/autonomous mode"
- "Kill switch on/off"

### 5. Budget Alert System
When any agent exceeds 80% of monthly budget:
- Dashboard budget meter turns amber
- Toast notification on page load
- Optional: auto-pause agent at 100%

### 6. Notification Center
Replace Inbox with a notification bell in the top bar:
- Badge count for unread items
- Dropdown panel with categorized notifications
- Mark as read, dismiss, take action inline
- Categories: Failed runs, Budget alerts, Approvals, System events

### 7. Company Status Bar (Global)
Persistent bar showing:
- Company status (active/paused)
- Trading mode
- Total agents running / total
- Daily P&L
- Kill switch indicator

---

## Feature Priority Matrix

| Feature | User Impact | Dev Effort | Priority |
|---------|-----------|-----------|----------|
| Dashboard Command Center | 🔴 Critical | Large | P0 |
| Remove redundant pages | 🔴 Critical | Small | P0 |
| Warm cream + terracotta theme | 🔴 Critical | Medium | P0 |
| Inline approvals on Dashboard | 🟡 High | Medium | P1 |
| Agent grid with batch ops | 🟡 High | Medium | P1 |
| Risk dashboard widget | 🟡 High | Medium | P1 |
| Trading mode indicator | 🟡 High | Small | P1 |
| Kanban for issues | 🟢 Medium | Medium | P2 |
| Agent health timeline | 🟢 Medium | Medium | P2 |
| Command palette enhancements | 🟢 Medium | Small | P2 |
| Budget alert system | 🟢 Medium | Small | P2 |
| Notification center | 🟢 Medium | Medium | P2 |
| Company status bar | 🟢 Medium | Small | P2 |

---

## Design Principles for Implementation

1. **Dashboard is the product** — 80% of interactions should happen on the Dashboard
2. **No duplicate views** — One entity, one canonical view, one URL
3. **Progressive disclosure** — Summary → quick panel → full detail
4. **Inline actions** — Don't navigate to act. Act where you see.
5. **Density without overload** — Show a lot, but use spacing, color, and hierarchy to prevent cognitive overload
6. **Every pixel earns its rent** — If a feature doesn't serve the board member, it doesn't ship
