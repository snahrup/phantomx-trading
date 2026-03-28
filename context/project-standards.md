# Project Standards

**What this is**: Core stack, conventions, and patterns for PhantomX.
**When to read**: Before any development task — especially new pages, components, or API routes.

## Stack
- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, TypeScript strict
- **Styling**: Tailwind CSS + Radix UI primitives (shadcn/ui pattern via components.json)
- **State**: Zustand (axon-store.ts, trading-store.ts, trade-recommendation-store.ts)
- **Charts**: TradingView-style chart components in src/components/chart/
- **AI SDK**: @anthropic-ai/claude-agent-sdk + @modelcontextprotocol/sdk
- **Testing**: Playwright (E2E)
- **Linting**: ESLint (flat config, eslint.config.mjs)

## Key Patterns
- **App Router pages** live in `src/app/<route>/page.tsx`
- **Axon integration**: All AI/trading intelligence calls go to `localhost:8400` (the Axon daemon in Auto-Claude repo). PhantomX never contains trading logic itself.
- **Component organization**: Domain-grouped under `src/components/` (chart, trading, dashboard, autopilot, axon, strategy, agents, etc.)
- **Layout**: `AppLayout.tsx` + `AppSidebar.tsx` wrap all pages
- **Error handling**: `ErrorBoundary.tsx` + `ClientErrorBoundary.tsx` at app level
- **Data flow**: Components read from Zustand stores, stores fetch from API routes or Axon
- **Knowledge base**: `knowledge/` contains trading strategies, patterns, risk rules, and regime schemas used by scanning scripts

## File Naming
- React components: PascalCase (e.g., `MissionControl.tsx`)
- Stores: kebab-case with `-store` suffix (e.g., `axon-store.ts`)
- API routes: `src/app/api/<route>/route.ts`
- Scripts: snake_case for Python, kebab-case for JS/TS

## Learnings
