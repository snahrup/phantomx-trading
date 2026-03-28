# Component Inventory — Paperclip Dashboard Redesign

> **Date:** 2026-03-08
> **Author:** UI Design Division

---

## Decision Key

| Decision | Meaning |
|----------|---------|
| **KEEP** | Component works well, just restyle to new theme |
| **MODIFY** | Component needs API/behavior changes + restyle |
| **REPLACE** | Rebuild from scratch with new design |
| **NEW** | Doesn't exist yet, must be created |
| **REMOVE** | Delete, functionality absorbed elsewhere |

---

## 1. Layout Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `Layout.tsx` | Flex: Rail + Sidebar + Content + Panel | **MODIFY** | Add StatusBar, remove CompanyRail |
| `Sidebar.tsx` | 14+ items, 3 sections | **MODIFY** | Reduce to 7 items, restyle warm gray |
| `SidebarSection` | Collapsible nav group | **KEEP** | Restyle only |
| `SidebarNavItem` | Nav link with icon/badge | **MODIFY** | Add terracotta active indicator |
| `SidebarProjects` | Expandable project list | **REMOVE** | Projects merged into Work page |
| `SidebarAgents` | Expandable agent list | **REMOVE** | Agent list lives on Agents page |
| `CompanyRail` | Vertical company switcher | **REMOVE** | Single company, not needed |
| `CompanySwitcher` | Dropdown company switch | **REMOVE** | Single company |
| `BreadcrumbBar` | Dynamic breadcrumbs | **MODIFY** | Simplify, remove company prefix |
| `MobileBottomNav` | Mobile bottom nav | **KEEP** | Restyle to 7 items |

### NEW Layout Components

| Component | Purpose |
|-----------|---------|
| `StatusBar` | Persistent top bar: company name, trading mode, agent count, P&L, kill switch |
| `NotificationBell` | Top-right notification dropdown replacing Inbox page |

---

## 2. Dashboard Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `ActiveAgentsPanel` | Agent list widget | **REPLACE** | New `AgentGrid` with cards |
| `MetricCard` | Icon + value + label | **MODIFY** | Add trend indicator, warm styling |
| `ActivityCharts` | 4 chart components | **MODIFY** | Restyle, warm palette |
| `ActivityRow` | Activity log entry | **MODIFY** | Restyle for timeline format |
| `RunActivityChart` | Bar chart | **KEEP** | Restyle colors |
| `PriorityChart` | Pie/donut | **KEEP** | Restyle colors |
| `IssueStatusChart` | Pie/donut | **KEEP** | Restyle colors |
| `SuccessRateChart` | Line chart | **KEEP** | Restyle colors |

### NEW Dashboard Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `AgentGridCard` | Compact agent card for dashboard grid | `agent, onPause, onResume, onTrigger, onClick` |
| `PendingActionCard` | Approval/failure/alert with inline actions | `type, title, description, actions[]` |
| `PositionsSummary` | Compact position table from Phemex | `positions[]` |
| `ActivityTimeline` | Timestamped activity stream | `activities[], limit` |
| `GoalProgressWidget` | Goal completion bars | `goals[]` |
| `KillSwitchIndicator` | Kill switch status + toggle | `armed, onToggle` |
| `BudgetMeter` | Budget utilization bar | `spent, budget, warningThreshold` |

---

## 3. Agent Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `AgentDetail.tsx` (2593 lines) | Mega-page with all tabs | **REPLACE** | Split into tab-specific components |
| `AgentConfigForm` | Agent config editor | **MODIFY** | Clean up, separate concerns |
| `AgentIconPicker` | Icon selector | **KEEP** | Restyle |
| `LiveRunWidget` | Live run display | **MODIFY** | Restyle with warm theme |
| `OrgChart.tsx` | Canvas-based org tree | **MODIFY** | Restyle nodes, warm colors |

### NEW Agent Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `AgentCard` | Full agent card (grid view) | `agent, selected, onSelect, onQuickAction` |
| `AgentQuickPanel` | Slide-out with status + quick actions | `agent, onClose, onPause, onResume, onTrigger` |
| `BatchActionBar` | Bulk operations on selected agents | `selectedCount, onPauseAll, onResumeAll, onTriggerAll` |
| `HealthHeatmap` | 7-day heartbeat success heatmap | `runs[], days` |
| `AgentOverview` | Overview tab content | `agent, runs, metrics` |
| `RunsTable` | Paginated run history table | `runs[], page, onPageChange` |

---

## 4. Work / Issue Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `IssuesList` | Main issue board | **REPLACE** | New Kanban-first view |
| `KanbanBoard` | Basic kanban | **MODIFY** | Add drag-and-drop, restyle cards |
| `IssueDetail.tsx` (957 lines) | Full issue page | **REPLACE** | Slide-out panel instead of full page |
| `IssueProperties` | Right-side editor | **MODIFY** | Merge into IssueDetailPanel |
| `NewIssueDialog` | Create issue modal | **MODIFY** | Restyle |
| `CommentThread` | Comment renderer | **MODIFY** | Restyle with warm theme |
| `GoalTree` | Goal hierarchy | **MODIFY** | Add progress bars |
| `GoalDetail.tsx` | Goal page | **MODIFY** | Simplify, add progress visualization |

### NEW Work Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `IssueCard` | Compact kanban card | `issue, onDrag, onClick` |
| `IssueDetailPanel` | Slide-out issue editor (replaces full page) | `issue, onClose, onUpdate` |
| `GoalProgressBar` | Horizontal progress with % | `goal, progress, total` |
| `ProjectFilter` | Project scope dropdown | `projects[], selected, onChange` |

---

## 5. Trading Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `Trading.tsx` (655 lines) | Full trading page | **MODIFY** | Add risk meters, multi-position view |
| Charting (lightweight-charts) | Candlestick + line | **KEEP** | Already good, restyle wrapper |

### NEW Trading Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `RiskMeterPanel` | Vertical stack of utilization meters | `positionUtil, dailyLoss, leverage, exposure` |
| `RiskMeter` | Single utilization meter (bar + label) | `label, current, max, warningAt` |
| `TradingModeIndicator` | Manual/Autonomous badge + toggle | `mode, onToggle` |
| `KillSwitchButton` | Prominent safety toggle | `armed, onToggle, confirmRequired` |
| `PositionsTable` | All positions with close action | `positions[], onClose` |
| `RecentTradesList` | Trade history timeline | `trades[], limit` |

---

## 6. Analytics Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `Analytics.tsx` (1100 lines) | Backtesting + performance | **MODIFY** | Add P&L chart, strategy table |

### NEW Analytics Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `PnLChart` | Cumulative P&L area chart | `data[], range` |
| `StrategyPerformanceTable` | Win/loss/expectancy per strategy | `strategies[]` |
| `AgentPerformanceTable` | Runs/cost/success per agent | `agents[]` |
| `LearningsPanel` | Trading journal from knowledge base | `entries[]` |
| `DateRangeSelector` | Preset range buttons | `presets[], selected, onChange` |

---

## 7. Settings Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `CompanySettings.tsx` (545 lines) | Company config page | **MODIFY** | Add tabs for Risk, Trading, Integrations |

### NEW Settings Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `SettingsTabs` | Tab navigation for settings sections | `tabs[], activeTab, onChange` |
| `RiskParamsForm` | Editable risk parameter form | `params, onSave` |
| `TradingModeToggle` | Manual/autonomous switch | `mode, onChange` |
| `IntegrationStatusCard` | Connection status card | `name, status, lastSync, onTest` |
| `ExchangeConnectionStatus` | Phemex API health display | `connected, latency, lastCheck` |

---

## 8. Shared / UI Base Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `button.tsx` | Shadcn button | **MODIFY** | Warm colors, 8px radius |
| `card.tsx` | Shadcn card | **MODIFY** | 12px radius, subtle shadow |
| `badge.tsx` | Shadcn badge | **MODIFY** | Pill shape, muted colors |
| `input.tsx` | Shadcn input | **MODIFY** | Subtle border, terracotta focus ring |
| `dialog.tsx` | Shadcn dialog | **MODIFY** | 16px radius, warm overlay |
| `tabs.tsx` | Shadcn tabs | **MODIFY** | Terracotta active indicator |
| `select.tsx` | Shadcn select | **MODIFY** | Warm styling |
| `textarea.tsx` | Shadcn textarea | **MODIFY** | Match input style |
| `tooltip.tsx` | Shadcn tooltip | **MODIFY** | Warm colors |
| `popover.tsx` | Shadcn popover | **MODIFY** | Warm shadow |
| `dropdown-menu.tsx` | Shadcn dropdown | **MODIFY** | Warm colors |
| `checkbox.tsx` | Shadcn checkbox | **MODIFY** | Terracotta checked state |
| `separator.tsx` | Shadcn separator | **MODIFY** | Nearly invisible (--border) |
| `skeleton.tsx` | Shadcn skeleton | **MODIFY** | Warm gray animated pulse |
| `avatar.tsx` | Shadcn avatar | **KEEP** | Already fine |
| `breadcrumb.tsx` | Shadcn breadcrumb | **KEEP** | Restyle |
| `collapsible.tsx` | Shadcn collapsible | **KEEP** | Already fine |
| `command.tsx` | Shadcn command palette | **MODIFY** | Warm colors + extended actions |
| `label.tsx` | Shadcn label | **KEEP** | Already fine |
| `scroll-area.tsx` | Shadcn scroll area | **KEEP** | Already fine |
| `sheet.tsx` | Shadcn sheet | **MODIFY** | Warm styling |

### Shared Components

| Component | Current | Decision | Notes |
|-----------|---------|----------|-------|
| `StatusBadge` | Status pills | **MODIFY** | Use new status colors |
| `StatusIcon` | Issue status icon | **KEEP** | Restyle colors |
| `PriorityIcon` | Issue priority icon | **KEEP** | Restyle colors |
| `Identity` | Agent/user badge | **MODIFY** | Warm avatar styling |
| `EmptyState` | Icon + message | **MODIFY** | Warm illustration style |
| `EntityRow` | Generic list row | **MODIFY** | 48px min height, warm hover |
| `CopyText` | Copy-to-clipboard | **KEEP** | Already fine |
| `PageSkeleton` | Loading skeleton | **MODIFY** | Add more variants |
| `PageTabBar` | Tab navigation | **MODIFY** | Terracotta active tab |
| `InlineEditor` | Contenteditable | **KEEP** | Already fine |
| `InlineEntitySelector` | Entity typeahead | **MODIFY** | Warm dropdown styling |
| `MarkdownEditor` | MDXEditor | **MODIFY** | Update theme vars |
| `MarkdownBody` | Rendered markdown | **MODIFY** | Warm code blocks |
| `FilterBar` | Filter controls | **MODIFY** | Warm styling |
| `CommandPalette` | Global search | **MODIFY** | Add agent actions, warm theme |

---

## 9. Components to REMOVE

| Component | Reason |
|-----------|--------|
| `SidebarProjects` | Projects merged into Work, no sidebar expansion |
| `SidebarAgents` | Agent list on Agents page, not sidebar |
| `CompanyRail` | Single company |
| `CompanySwitcher` | Single company |
| `Companies.tsx` | Single company, settings only |
| `BoardClaim.tsx` | One-time flow, keep route but remove nav |
| `InviteLanding.tsx` | One-time flow, keep route but remove nav |
| `DesignGuide.tsx` | Dev-only, add `?dev=true` gate |
| `MyIssues.tsx` | Never routed, single user |
| `Org.tsx` | Merged into Agents page toggle |
| `Inbox.tsx` | Replaced by NotificationBell + Dashboard |
| `Approvals.tsx` | Inline on Dashboard |
| `Activity.tsx` | Moved to Dashboard timeline |
| `ProjectDetail.tsx` | Merged into Work page with project filter |
| `ProjectProperties` | Simplified into Work page |
| `ApprovalCard` | Replaced by PendingActionCard |
| `OnboardingWizard` | Keep but won't be in nav |
| `AsciiArtAnimation` | Replace with cleaner loading |
| `CompanyPatternIcon` | Single company, not needed |

---

## Summary Statistics

| Category | Keep | Modify | Replace | New | Remove |
|----------|------|--------|---------|-----|--------|
| Layout | 2 | 4 | 0 | 2 | 4 |
| Dashboard | 4 | 2 | 1 | 7 | 0 |
| Agents | 1 | 3 | 1 | 6 | 0 |
| Work | 0 | 4 | 2 | 4 | 0 |
| Trading | 1 | 1 | 0 | 6 | 0 |
| Analytics | 0 | 1 | 0 | 5 | 0 |
| Settings | 0 | 1 | 0 | 5 | 0 |
| UI Base | 6 | 14 | 0 | 0 | 0 |
| Shared | 3 | 11 | 0 | 0 | 0 |
| Removed | — | — | — | — | 19 |
| **Total** | **17** | **41** | **4** | **35** | **23** |
