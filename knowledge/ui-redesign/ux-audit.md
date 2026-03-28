# UX Audit — Paperclip Dashboard

> **Date:** 2026-03-08
> **Auditor:** UX Research Division
> **Scope:** Full dashboard UI at `paperclip/ui/src/`

---

## Executive Summary

The current Paperclip dashboard is functionally complete (24 pages, 70+ components) but suffers from **information fragmentation**, **redundant views**, and a **cold/utilitarian visual identity**. The core issue: too many pages that show the same data sliced differently, and no single view that gives a board member the full picture at a glance.

---

## 1. Information Architecture Issues

### 1.1 Redundant Views
- **Agents page** has a list view AND an org tree toggle — but **OrgChart** also exists as a separate page (`/org`). Two ways to see the same org hierarchy.
- **Issues** exist on the main Issues page, inside ProjectDetail, inside AgentDetail, and in the Inbox. Four places to manage the same entities.
- **Goals** page and GoalDetail exist but are disconnected from the Dashboard — no goal progress on the main view.
- **MyIssues** exists but isn't even routed. Dead feature.

### 1.2 Over-Segmented Navigation
The sidebar has 14+ navigation items across 3 collapsible sections. For a single-user board member managing an AI company, this is excessive:
- `Dashboard`, `Trading`, `Analytics` (top level)
- `Issues`, `Goals` (under "Work")
- `Projects` (expandable list)
- `Agents` (expandable list)
- `Org`, `Costs`, `Activity`, `Settings` (under "Company")
- Plus `Inbox`, `Approvals` accessible elsewhere

**Recommendation:** Consolidate to 6-7 top-level items max. Merge related views.

### 1.3 Missing Dashboard Density
The Dashboard (349 lines) shows: agent panel, 4 metric cards, 4 charts, activity log, recent tasks. But it's missing:
- **P&L summary** — No trading performance on the main dashboard
- **Goal progress** — Company goals aren't visible
- **Approval queue count** — Pending approvals not surfaced
- **System health** — No server/database/exchange status
- **Kill switch status** — Critical safety info buried in settings

---

## 2. Navigation & Flow Issues

### 2.1 Deep Nesting
AgentDetail (2593 lines) is a mega-page with 7+ tabs: config, runs, keys, permissions, runtime state, task sessions, adapter test. This should be progressive disclosure, not a single component.

### 2.2 Context Switching
To understand "what's happening right now," a board member must visit:
1. Dashboard (agent status, recent activity)
2. Issues (pending work)
3. Inbox (alerts, failed runs)
4. Trading (positions, P&L)
5. Approvals (pending decisions)

That's 5 page loads to get situational awareness. The Dashboard should consolidate these into one view.

### 2.3 Mobile Navigation
Mobile gets a bottom nav and swipe gestures — well implemented. But the trading page's charting library is not touch-optimized.

---

## 3. Component Quality Issues

### 3.1 Visual Inconsistency
- Border radius set to `0` everywhere (sharp corners) — looks dated
- No shadow tokens used for elevation hierarchy
- Cards and panels lack visual breathing room
- Color palette is generic light/dark with no brand personality

### 3.2 Information Density vs. Readability
- IssuesList and AgentsList use dense list layouts that work on desktop but compress poorly
- No card-view alternative for smaller datasets (agents)
- Tables use full borders (traditional look) rather than modern spacing-based separation

### 3.3 Loading States
- PageSkeleton has only 2 variants (dashboard, list) — many pages have no loading skeleton
- No error boundary UI beyond generic errors

---

## 4. Feature Gaps

### 4.1 Missing Features
1. **Quick actions** — No way to approve/reject from Dashboard without navigating to Approvals
2. **Agent health timeline** — When did agents last succeed? Fail? No historical view
3. **Cost alerts** — Budget warnings when agents approach spend limits
4. **Keyboard-first operation** — Command palette exists but doesn't expose agent actions (pause, resume, trigger heartbeat)
5. **Trading P&L on dashboard** — Exchange positions are siloed on Trading page
6. **Batch operations** — Can't pause/resume multiple agents at once from the list
7. **Risk dashboard** — Risk parameters exist in JSON but have no UI visualization

### 4.2 Over-Engineered Features
1. **Multi-company support** — CompanyRail, CompanySwitcher, multi-tenant routing. Steve has ONE company. This adds complexity to every route and component.
2. **DesignGuide page** — Developer tool, not a user feature. Should be dev-only.
3. **InviteLanding / BoardClaim** — Auth flows that run once, taking up permanent route space.

---

## 5. Accessibility

### 5.1 Good
- "Skip to Main Content" link exists
- Keyboard shortcuts registered
- Mobile touch targets ≥44px
- Focus management in dialogs

### 5.2 Needs Improvement
- Color contrast ratios not verified for OKLCH values
- No ARIA landmarks on main content areas
- Screen reader navigation through sidebar sections unclear
- No reduced-motion media query support

---

## 6. Performance Concerns

- **AgentDetail at 2593 lines** — Should be code-split into tab-specific chunks
- **TanStack Query polling** at 10-15s intervals on all pages — could be optimized to only poll visible data
- **No virtualization** on long lists (Issues, Activity) — will degrade with hundreds of items
- **Trading page loads 3 external API endpoints** synchronously

---

## Recommendations Priority

| Priority | Item | Impact |
|----------|------|--------|
| P0 | Consolidate Dashboard to show everything at a glance | High — Steve's #1 ask |
| P0 | Merge redundant views (Org into Agents, MyIssues removed) | High — reduces navigation |
| P0 | Apply warm cream + terracotta visual identity | High — brand differentiation |
| P1 | Add P&L / positions widget to Dashboard | Medium — trading visibility |
| P1 | Surface approvals and alerts on Dashboard | Medium — fewer page switches |
| P1 | Add batch agent operations | Medium — operational efficiency |
| P2 | Keyboard-first command palette enhancements | Low — power user feature |
| P2 | Agent health timeline visualization | Low — nice to have |
| P2 | Code-split AgentDetail into smaller chunks | Low — performance |
