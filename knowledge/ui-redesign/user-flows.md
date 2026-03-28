# User Flows — Paperclip Dashboard

> **Date:** 2026-03-08
> **Author:** UX Research Division
> **Primary User:** Steve (sole board member, desktop-first, runs 5-7 concurrent sessions)

---

## User Profile

Steve is a **power user** who:
- Manages an autonomous 22-agent AI trading company
- Checks the dashboard throughout the day for situational awareness
- Makes quick decisions (approve/reject, pause/resume agents)
- Monitors trading positions and P&L
- Occasionally deep-dives into agent configurations or issue details
- Values density — wants to see everything at a glance without clicking through 5 pages

---

## Flow 1: Morning Check-In (Most Critical)

**Goal:** Understand "what happened overnight, what needs my attention"

### Current Flow (6 steps, 5 page loads):
1. Open Dashboard → see agent count, recent activity
2. Navigate to Inbox → check failed runs, alerts
3. Navigate to Approvals → approve/reject pending items
4. Navigate to Trading → check positions, P&L
5. Navigate to Issues → see what's in progress
6. Navigate to Agents → check who's running/paused/errored

### Ideal Flow (1 step):
1. Open Dashboard → see EVERYTHING:
   - Agent status grid (who's running, who failed, who's idle)
   - Pending approvals with inline approve/reject buttons
   - P&L summary (daily, weekly, total)
   - Active positions (symbol, side, unrealized PnL)
   - Failed runs with error preview
   - Recent activity timeline
   - Goal progress bars
   - Budget usage meters

**Key insight:** The Dashboard should be the ONLY page Steve needs 80% of the time.

---

## Flow 2: Agent Management

**Goal:** Check agent health, pause/resume, trigger heartbeat

### Current Flow:
1. Sidebar → Agents (expandable list or Agents page)
2. Filter by status
3. Click agent → AgentDetail (2593-line mega-page)
4. Find the right tab (runs, config, runtime state)
5. Take action (pause, resume, trigger heartbeat)

### Ideal Flow:
1. Dashboard agent grid → click agent card
2. Quick-action panel slides out (or modal) with:
   - Status, last heartbeat, recent run result
   - One-click: Pause / Resume / Trigger Heartbeat
   - Link to full detail page for deep config
3. For bulk: checkboxes on agent grid → "Pause Selected" / "Resume Selected"

---

## Flow 3: Issue Triage

**Goal:** Review new issues, assign priority, unblock work

### Current Flow:
1. Issues page → scroll through list
2. Click issue → IssueDetail (957 lines)
3. Edit properties in right panel
4. Add comment
5. Back to list → next issue

### Ideal Flow:
1. Issues page with Kanban default view (columns by status)
2. Drag-and-drop to change status
3. Inline priority/assignee editing (no detail page needed for triage)
4. Quick comment from the list view
5. Only open IssueDetail for complex updates

---

## Flow 4: Trading Oversight

**Goal:** Monitor positions, check if risk limits are being respected

### Current Flow:
1. Navigate to Trading page
2. Select symbol from dropdown
3. View chart + positions
4. Manually check position sizes against risk params (no UI for this)

### Ideal Flow:
1. Dashboard shows P&L card + active positions summary
2. Click "Trading" for full view:
   - Multi-position overview (all symbols at once)
   - Risk utilization meters (position size vs. max, daily loss vs. limit)
   - Kill switch status + one-click activation
3. Individual symbol drill-down for detailed charting

---

## Flow 5: Approval Processing

**Goal:** Review and approve/reject agent requests quickly

### Current Flow:
1. Navigate to Approvals page
2. Filter pending
3. Click approval → ApprovalDetail
4. Read payload, add comment, approve/reject
5. Back to list → next

### Ideal Flow:
1. Dashboard shows pending approval cards
2. Expand to see payload preview
3. Approve/reject inline with optional comment
4. No page navigation needed for simple approvals

---

## Flow 6: Cost Monitoring

**Goal:** Track agent spending against budgets

### Current Flow:
1. Navigate to Costs page
2. Select date preset
3. View summary, by-agent, by-project tables

### Ideal Flow:
1. Dashboard shows budget utilization bar per agent (actual vs. limit)
2. Click bar to drill down to Costs detail
3. Alert indicators when any agent exceeds 80% of monthly budget

---

## Flow 7: Configuration & Settings

**Goal:** Change company settings, agent configs, risk parameters

### Current Flow:
1. Settings in sidebar under "Company"
2. CompanySettings page for company-level
3. AgentDetail → Config tab for agent-level
4. No UI for risk parameters (JSON file only)

### Ideal Flow:
1. Settings page with tabbed sections:
   - Company (name, description, brand)
   - Risk Management (position limits, loss limits — editable UI for the JSON)
   - Trading Mode (manual/autonomous toggle)
   - Integrations (exchange, Nexus)
2. Agent config accessible from Agent card quick-action panel

---

## Navigation Architecture (Proposed)

```
Sidebar (7 items):
├── Dashboard          ← Everything at a glance
├── Agents             ← Grid + list + org tree (merged views)
├── Work               ← Issues + Kanban + Goals (merged)
├── Trading            ← Positions, P&L, charting
├── Analytics          ← Backtesting, performance history
├── Costs              ← Budget tracking, spend analysis
└── Settings           ← Company, risk, integrations
```

**Removed/Merged:**
- `Org` → merged into Agents page as a tab/toggle
- `Projects` → merged into Work (project filter on issues)
- `Activity` → moved to Dashboard timeline widget
- `Inbox` → merged into Dashboard notifications area
- `Approvals` → surfaced on Dashboard, full list accessible from there
- `MyIssues` → removed (only one user)
- `DesignGuide` → dev-only, hidden from production nav

---

## Interaction Patterns

### Quick Actions (New)
Every entity card/row should support:
- **Hover:** Reveal quick-action icons (edit, pause, delete)
- **Right-click:** Context menu with full actions
- **Cmd+K:** Command palette includes entity-specific actions

### Inline Editing (Enhanced)
- Status changes via dropdown, not navigation
- Priority changes via click-to-cycle
- Assignee changes via avatar click → picker

### Progressive Disclosure
- **Level 1:** Card/row in list (summary info)
- **Level 2:** Quick-action panel (key details + actions)
- **Level 3:** Full detail page (everything, for power users)
