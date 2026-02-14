# PhantomX — Comprehensive Platform Documentation

> **AI-Powered Autonomous Crypto Trading Platform for Phemex Perpetual Futures**

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Design System](#design-system)
4. [Core Features](#core-features)
   - [Connection & Onboarding](#1-connection--onboarding)
   - [Live Trading Dashboard](#2-live-trading-dashboard)
   - [AI Chat & Analysis](#3-ai-chat--analysis)
   - [Autonomous Autopilot Mode](#4-autonomous-autopilot-mode)
   - [Multi-Agent Intelligence Network](#5-multi-agent-intelligence-network)
   - [Interactive Charting](#6-interactive-charting)
   - [AI Chart Vision & Pattern Detection](#7-ai-chart-vision--pattern-detection)
   - [Strategy Builder & PineScript Generation](#8-strategy-builder--pinescript-generation)
   - [Gem Scanner](#9-gem-scanner--low-price-discovery)
   - [Risk Management & Kill Switch](#10-risk-management--kill-switch)
   - [Trade Journal](#11-trade-journal)
   - [TradingView Webhook Receiver](#12-tradingview-webhook-receiver)
   - [Knowledge Base](#13-knowledge-base)
   - [Portfolio Analytics](#14-portfolio-analytics)
   - [Settings & Configuration](#15-settings--configuration)
5. [API Reference](#api-reference)
6. [Real-Time Data Streams (SSE)](#real-time-data-streams-sse)
7. [Type System](#type-system)
8. [Security Architecture](#security-architecture)
9. [Performance Characteristics](#performance-characteristics)
10. [Deployment & Setup](#deployment--setup)
11. [Selling Points & Differentiators](#selling-points--differentiators)

---

## Platform Overview

PhantomX is a full-stack, AI-native crypto trading platform purpose-built for Phemex perpetual futures. It combines real-time market data, Claude AI analysis (via the Claude Agent SDK with Claude Max OAuth — zero API billing), autonomous portfolio management, multi-agent intelligence, and comprehensive risk controls into a single-page web application.

**What makes PhantomX different**: Unlike traditional trading bots that follow rigid rule-based strategies, PhantomX uses Claude Opus 4.6 as its "brain" — the AI can actually *see* candlestick charts (vision analysis), reason about market conditions with extended thinking, and make nuanced portfolio-level decisions that adapt to changing conditions in real time. It's not just executing signals — it's thinking.

### Key Metrics
- **15+ React components** forming a single-page trading terminal
- **7 API routes** handling exchange, AI, execution, scanning, journaling, and webhooks
- **4 specialized AI agents** providing parallel market intelligence
- **100 E2E Playwright tests** for automated validation
- **500+ TypeScript type definitions** ensuring type safety across the entire stack
- **Claude Max OAuth** — runs on subscription, no per-token API costs

---

## Architecture & Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| **Next.js** | 16.1.6 | App Router framework, API routes, SSR |
| **React** | 19.2.3 | UI rendering (latest with concurrent features) |
| **Zustand** | 5.0.11 | State management with localStorage persistence |
| **Tailwind CSS** | v4 | Utility-first styling with CSS variable theming |
| **lightweight-charts** | 5.1.0 | TradingView-quality candlestick charts |
| **ReactMarkdown** | 10.1.0 | Rich AI response rendering with GFM tables |
| **date-fns** | 4.1.0 | Date formatting and manipulation |

### Backend / AI
| Technology | Version | Purpose |
|------------|---------|---------|
| **Claude Agent SDK** | 0.2.39 | AI brain (Opus 4.6 with extended thinking) |
| **CCXT** | 4.5.37 | Phemex exchange connectivity (REST + WS) |
| **node-canvas** | 3.2.1 | Server-side chart rendering for AI vision |
| **ws** | 8.19.0 | WebSocket client for real-time market data |
| **technicalindicators** | 3.1.0 | SMA, RSI, MACD, Bollinger Bands calculation |

### Dev / QA
| Technology | Version | Purpose |
|------------|---------|---------|
| **TypeScript** | 5.x | Strict type safety across entire codebase |
| **Playwright** | 1.58.2 | End-to-end browser testing (100 tests) |
| **ESLint** | 9.x | Code quality enforcement |

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React SPA)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Trading  │  │ AI Chat  │  │  Chart   │  │  Controls  │  │
│  │  Chart   │  │  Panel   │  │ Drawing  │  │   Panel    │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └─────┬──────┘  │
│       │              │                             │         │
│       └──────────────┼─────────────────────────────┘         │
│                      │                                       │
│              ┌───────┴───────┐                               │
│              │  Zustand Store │  ← localStorage persistence  │
│              └───────┬───────┘                               │
└──────────────────────┼───────────────────────────────────────┘
                       │ HTTP + SSE
┌──────────────────────┼───────────────────────────────────────┐
│                 Next.js API Routes                            │
│                                                              │
│  /api/phemex   → Exchange operations (CCXT)                  │
│  /api/ai       → Claude chat, analysis, strategy gen         │
│  /api/execute  → Strategy execution engine                   │
│  /api/heartbeat→ Autopilot portfolio manager                 │
│  /api/scanner  → Gem scanner + AI ranking                    │
│  /api/webhook  → TradingView signal receiver                 │
│  /api/journal  → Trade journal CRUD                          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Claude Agent SDK (Opus 4.6)               │  │
│  │  • Extended thinking (16k tokens)                      │  │
│  │  • Vision (chart image analysis)                       │  │
│  │  • Streaming responses                                 │  │
│  │  • Command extraction (trade + draw)                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─────────────────────┐  ┌────────────────────────────┐     │
│  │  Agent Orchestrator │  │  Knowledge Base (markdown)  │    │
│  │  Sentinel │ Macro   │  │  Strategies │ Patterns      │    │
│  │  News     │ Technical│  │  Market Analysis │ Custom   │    │
│  └─────────────────────┘  └────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼
            ┌────────────────────┐
            │  Phemex Exchange   │
            │  REST + WebSocket  │
            │  Perpetual Futures │
            └────────────────────┘
```

---

## Design System

PhantomX uses the **Claude Design System** — a forensically extracted set of tokens from Claude.ai, Claude Desktop, and Anthropic brand sources. The result is a warm, professional aesthetic that avoids generic "crypto dashboard" tropes.

### Theme Philosophy
- **Warm, not cold**: Cream backgrounds (light) and warm charcoal (dark) instead of pure black/white
- **Terracotta accent**: `#AE5630` — Anthropic's brand terracotta used for CTAs, links, and highlights
- **Dual-layer shadows**: Inner + outer shadow for authentic depth without flatness
- **SF Pro Text**: Apple's system font for chat rendering at multiple weights (100/400/600/900)
- **Glassmorphism touches**: Semi-transparent cards with subtle backdrop blur

### Color Tokens (CSS Variables)

**Light Theme (Default)**:
| Token | Value | Usage |
|-------|-------|-------|
| `--cl-bg-page` | `#F5F5F0` | Page background (warm cream) |
| `--cl-bg-surface` | `#FFFFFF` | Card/panel backgrounds |
| `--cl-bg-elevated` | `#FAF9F6` | Elevated surfaces |
| `--cl-text-primary` | `#1A1915` | Primary text |
| `--cl-text-secondary` | `#5D5C58` | Secondary text |
| `--cl-text-faint` | `#8B8984` | Muted/subtle text |
| `--cl-accent` | `#AE5630` | Terracotta accent |
| `--cl-accent-hover` | `#9A4A28` | Accent hover state |
| `--cl-success` | `#18794E` | Profit/long/positive |
| `--cl-error` | `#CE2C31` | Loss/short/negative |
| `--cl-warning` | `#CC7B1A` | Caution/neutral signals |

**Dark Theme** (`[data-theme="dark"]`):
| Token | Value | Usage |
|-------|-------|-------|
| `--cl-bg-page` | `#1D1C19` | Page background (warm charcoal) |
| `--cl-bg-surface` | `#2B2A27` | Card surfaces |
| `--cl-text-primary` | `#E8E5DE` | Primary text |
| `--cl-accent` | `#D4754E` | Terracotta (lighter for contrast) |
| `--cl-success` | `#30A46C` | Profit green |
| `--cl-error` | `#E5484D` | Loss red |

### Trading-Specific Tokens
| Token | Usage |
|-------|-------|
| `--color-long` | `var(--cl-success)` — Long/buy positions |
| `--color-short` | `var(--cl-error)` — Short/sell positions |
| `--color-profit` | `var(--cl-success)` — Realized/unrealized profit |
| `--color-loss` | `var(--cl-error)` — Realized/unrealized loss |
| `--color-neutral` | `var(--cl-text-secondary)` — Neutral/flat states |

### Utility CSS Classes
- `.panic-button` — Shimmer animation for kill switch / emergency buttons
- `.risk-badge` — 4 risk level indicators (conservative→degen)
- `.status-dot` — State indicators (live/paused/killed/disconnected)
- `.ai-thinking` — Bouncing dots animation for AI processing

---

## Core Features

### 1. Connection & Onboarding

**Component**: `ConnectionSetup.tsx`

PhantomX guides users through a multi-step onboarding flow to connect their Phemex account:

**Step 1: Credential Detection**
- Automatically checks for environment variables (`PHEMEX_API_KEY`, `PHEMEX_SECRET`)
- Shows status indicators for each credential
- Falls back to manual API key + secret input if env vars not set

**Step 2: Network Selection**
- **Mainnet** (real funds) — red indicator, clear warning
- **Testnet** (paper trading) — green indicator, safe for experimentation

**Step 3: Connection Verification**
- Authenticates with Phemex via CCXT
- Fetches account balance, positions, and holdings
- Shows live preview: total balance, position count, BTC price, holdings grid

**Step 4: Dashboard Launch**
- On successful verification, transitions to the full trading dashboard
- State persisted to Zustand store (survives page refresh)

**Why this matters**: No other AI trading platform provides this level of guided onboarding. Users see their actual account data before committing to the connection, reducing anxiety about connecting real exchange accounts.

---

### 2. Live Trading Dashboard

**Component**: `page.tsx` (Dashboard)

The main dashboard is a single-page application with a chart-centric layout:

```
┌─────────────────────────────────────────────────────┐
│  Header: Symbol | Price | Status Badge | Theme      │
├─────────────────────┬───────────────────────────────┤
│                     │                               │
│   Candlestick       │   Sidebar (tabbed)            │
│   Chart             │   ┌─────────────────────┐     │
│   + Drawing Overlay │   │ AI Chat             │     │
│   + Price Lines     │   │ Journal             │     │
│   + Portfolio Bar   │   │ Strategy            │     │
│                     │   │ Controls            │     │
│                     │   │ Settings            │     │
│                     │   └─────────────────────┘     │
│                     │                               │
├─────────────────────┴───────────────────────────────┤
│  Portfolio Bar: Balance | Positions | PnL | Status  │
└─────────────────────────────────────────────────────┘
```

**Key Dashboard Behaviors**:
- **Real-time data polling**: Ticker (3s), OHLCV (30s), Account data (10s)
- **Dynamic price lines**: AI analysis automatically draws support/resistance on chart
- **Position overlays**: Open positions shown as horizontal lines on chart with PnL
- **Symbol selector**: Quick-switch between Phemex perpetual futures
- **Timeframe selector**: 1m, 5m, 15m, 1h, 4h, 1d
- **Status badge**: MANUAL / AUTOPILOT / KILLED with animated state indicators
- **Theme toggle**: Light/dark with CSS variable transition

---

### 3. AI Chat & Analysis

**Components**: `AIChatPanel.tsx`, `trading-assistant.ts`, `/api/ai/route.ts`

The AI Chat panel is the primary interface for interacting with PhantomX's Claude brain.

**Conversational Trading AI**:
- Natural language interface: "What do you think about SOL right now?"
- Claude responds with markdown-formatted analysis (tables, code blocks, bold/italic)
- Streaming responses — words appear in real-time as Claude thinks
- Extended thinking display — collapsible "Reasoning" block shows Claude's chain of thought
- Conversation history (last 10 messages) provides context continuity

**AI-Powered Chart Analysis (Vision)**:
- Click "AI Vision" on the chart → captures PNG screenshot
- Screenshot sent to Claude with full trading context
- Claude *sees* the candlestick patterns, SMA lines, volume bars
- Returns: pattern identification, sentiment, confidence, key levels, recommendation
- Automatically draws support/resistance lines on chart from analysis

**Image Upload**:
- Paste or upload screenshots directly into chat
- Claude analyzes any chart image — even from other platforms
- Useful for "What do you see in this TradingView screenshot?"

**Trade Execution from Chat**:
- Claude can extract trade commands from its own recommendations
- `phantomx_command` blocks: open_long, open_short, close_position, set_stop_loss, set_take_profit
- `phantomx_draw` blocks: add price lines for support, resistance, entry, exit points
- Commands execute automatically after AI response

**Strategy Generation**:
- "Generate a PineScript strategy for BTC with RSI + SMA crossover"
- Claude produces complete PineScript v5 code with position sizing, alerts, risk rules
- Code displayed in syntax-highlighted block, ready to paste into TradingView

**Quick Actions**:
- Pre-built prompts for common requests
- "Analyze this chart", "Generate a strategy", "What are the key levels?"
- One-click to populate and send

**Risk Selector (Inline)**:
- Dropdown in the composer: Conservative / Moderate / Aggressive / Degen
- Controls risk profile injected into AI context
- AI adjusts recommendations based on selected risk appetite

**Why this matters**: PhantomX is the only trading platform where the AI can literally *look at* your chart and make visual pattern assessments — not just crunch numbers. The extended thinking gives transparency into AI reasoning, building trust.

---

### 4. Autonomous Autopilot Mode

**Components**: `portfolio-heartbeat-engine.ts`, `/api/heartbeat/route.ts`, `AIChatPanel.tsx` (inline controls)

The Autopilot is PhantomX's crown jewel — a fully autonomous AI portfolio manager that runs on a configurable heartbeat timer.

**How It Works**:
1. **Scan**: Every tick (configurable interval), the engine scans the watchlist or full market
2. **Rank**: Symbols ranked by technical momentum, volume, and AI scoring
3. **Analyze**: Top-ranked symbols get deep analysis with chart images sent to Claude Vision
4. **Decide**: Claude evaluates the full portfolio context and decides: buy, sell, close, hold, rotate, or adjust
5. **Execute**: Approved actions execute as market orders with stop-loss and take-profit
6. **Journal**: Every decision logged to the Trade Journal with full reasoning

**Portfolio Management Intelligence**:
- **Diversification enforcement**: Configurable max allocation per token
- **Opportunity cost reasoning**: "Is there something better?" before holding losers
- **Cash is a position**: AI can decide to sit in USDT when no good setups exist
- **Relative strength rotation**: Rotate capital from underperformers to stronger setups
- **Asymmetric risk management**: Close losers fast, let winners run

**Configurable Parameters**:
| Parameter | Description | Range |
|-----------|-------------|-------|
| `intervalMs` | Heartbeat frequency | 30s – 5min |
| `riskLevel` | Conservative/Moderate/Aggressive/Degen | 4 levels |
| `maxDailyLossPercent` | Daily loss cap (triggers kill switch) | 1% – 10% |
| `maxOpenPositions` | Maximum simultaneous positions | 1 – 20 |
| `maxPerTokenAllocationPercent` | Max % of portfolio in single token | 5% – 50% |
| `maxTotalExposurePercent` | Max % of portfolio at risk | 20% – 100% |
| `minCashReservePercent` | Minimum cash buffer | 10% – 50% |
| `scanMode` | Watchlist only or full market scan | 2 modes |
| `fullScanTopN` | How many symbols to deeply analyze | 3 – 10 |

**Real-Time Event Streaming**:
- SSE endpoint streams every autopilot event to the frontend
- Events: tick_start, scanning, ranking, analysis, thinking, sizing, action, trade_executed, trade_skipped, error, kill_triggered
- Frontend shows live phase indicators and AI reasoning as it happens

**Inline Controls** (in AI Chat composer):
- Toggle autopilot ON/OFF with a single button
- Risk level selector dropdown
- Gear icon opens full autopilot settings panel
- Status indicator shows current state

**Chart Images for AI Vision**:
- Server-side chart rendering via node-canvas (no browser needed)
- SMA overlays (7/20/50), RSI badge, volume bars
- Dark theme matching the UI aesthetic
- Charts sent as base64 PNG to Claude's vision capability

**Why this matters**: This is a genuine autonomous AI portfolio manager — not a rule-based bot. It uses Claude's reasoning and vision capabilities to make contextual decisions that adapt to market conditions, with multi-layered safety rails.

---

### 5. Multi-Agent Intelligence Network

**Components**: `agent-orchestrator.ts`, `AgentNetworkPanel.tsx`

PhantomX runs 4 specialized AI agents in parallel, each providing independent market intelligence signals that feed into the Commander's decision-making.

**Agent Network**:

| Agent | Purpose | Default Interval | Signal Type |
|-------|---------|-------------------|-------------|
| **Sentinel** | Fear & Greed Index, trending coins, social sentiment | 5 min | Market-wide sentiment |
| **Macro** | Global market caps, BTC dominance, DXY correlation | 10 min | Macro regime detection |
| **Technical** | RSI, MACD, SMA, Bollinger Bands per symbol | 2 min | Per-symbol technicals |
| **News** | CryptoPanic headline sentiment, breaking news | 5 min | Event-driven alerts |

**Signal Bus**:
- Each agent produces signals with: sentiment (bullish/bearish/neutral), confidence (0-100), summary, expiry
- Signals have a configurable TTL (default 10 minutes) — stale signals auto-expire
- `getSignalIntelligence()` generates a prompt-ready consensus summary for the Commander
- `getSignalsForSymbol()` retrieves symbol-specific intelligence

**Consensus Engine**:
- Aggregates all active signals → consensus sentiment + confidence score
- Weighted by recency and individual agent confidence
- Injected into the Autopilot's system prompt every tick

**Network Visualization** (SVG):
- Hub-spoke layout: Commander at center, 4 agents around it
- Animated connection lines (green when active, dim when idle)
- Glowing nodes indicate running state
- Real-time sentiment badges on each agent node
- Error state indicators

**Why this matters**: Ensemble intelligence. Instead of one AI looking at everything, 4 specialized agents each focus on their domain and vote. Reduces blind spots and provides richer context for autonomous decisions.

---

### 6. Interactive Charting

**Components**: `TradingChart.tsx`, `ChartDrawingOverlay.tsx`, `DrawingToolbar.tsx`

PhantomX features a professional-grade charting system built on TradingView's lightweight-charts library with a custom annotation overlay.

**Candlestick Chart**:
- Full OHLCV candlestick rendering with volume histogram
- Symbol, timeframe, current price, and 24h change in header
- Live portfolio metrics row: balance, unrealized PnL, day/week/month returns
- Responsive resize with ResizeObserver
- Dark/light theme with CSS variable integration

**Drawing Tools**:
| Tool | Description |
|------|-------------|
| **Horizontal Line** | Static support/resistance levels |
| **Trendline** | Two-point directional trend lines |
| **Ray** | Extends infinitely in one direction (necklines, channels) |
| **Fibonacci Retracement** | Standard fib levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1) with golden pocket shading |
| **Rectangle** | Zone highlights (demand/supply zones, consolidation areas) |
| **Select** | Click to select, drag to move, delete with keyboard |

**Drawing Features**:
- Color picker (customizable per drawing)
- Line width adjustment (1-5px)
- Line style: solid, dashed, dotted
- Fibonacci golden pocket (0.382–0.618) highlighted with semi-transparent fill
- Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y (redo), Esc (deselect), Delete (remove)
- AI-locked drawings (from pattern detection) displayed but not user-editable
- High-DPI canvas rendering for crisp lines on Retina displays

**Dynamic Price Lines** (AI-generated):
- Support and resistance levels automatically drawn by AI analysis
- Entry, stop-loss, and take-profit price lines from trade plans
- Liquidation price lines from open positions
- Open order price lines
- Color-coded by type with labels
- Auto-expiry for stale levels

---

### 7. AI Chart Vision & Pattern Detection

**Components**: `server-renderer.ts`, `pattern-visualizer.ts`, `trading-assistant.ts`

PhantomX generates server-side chart images and sends them to Claude's vision model for visual pattern analysis.

**Server-Side Chart Rendering**:
- Node-canvas generates PNG charts without any browser dependency
- Renders: candlesticks, volume bars, SMA overlays (7/20/50), RSI badge
- Dark theme matching the UI (green bulls, red bears)
- Time labels, price labels, grid lines
- Output as base64 PNG → sent directly to Claude vision

**Vision Analysis Flow**:
1. User clicks "AI Vision" or autopilot tick triggers analysis
2. Server renders chart PNG from latest OHLCV data
3. PNG sent to Claude with system prompt including trading context
4. Claude analyzes the image: patterns, trends, key levels, momentum
5. Response parsed for price lines and drawing commands
6. Pattern drawings automatically overlaid on chart

**Pattern Detection & Visualization**:
- **Flags & Pennants**: Trendlines drawn at upper/lower bounds
- **Double Bottom/Top**: Neckline ray + zone rectangles
- **Head & Shoulders**: Neckline + shoulder trendlines
- **Wedges & Triangles**: Converging trendlines
- **Cup & Handle**: Fibonacci retracement of cup depth
- **SMA Crossovers**: Highlighted cross points with color coding
- All pattern drawings: color-coded by sentiment (green=bullish, red=bearish, amber=neutral), locked (read-only), labeled with pattern name and confidence

---

### 8. Strategy Builder & PineScript Generation

**Components**: `ControlPanel.tsx`, `PineScriptModal.tsx`, `/api/ai/route.ts`

**Strategy Configuration**:
- Risk level selector: Conservative, Moderate, Aggressive, Degen
- Individual risk parameter sliders:
  - Position size % (max allocation per trade)
  - Stop loss % (per-trade protection)
  - Take profit % (profit target)
  - Max drawdown % (portfolio-level kill switch)
  - Daily loss cap % (daily kill switch)
  - Max open positions (concentration limit)
- Hard floor / ceiling USD limits (absolute account value barriers)
- Acceptance checkbox for risk acknowledgment

**PineScript Generation**:
- AI generates complete PineScript v5 code based on:
  - Selected indicators (SMA, RSI, MACD, Bollinger Bands, etc.)
  - Entry/exit conditions (crossovers, threshold breaks, pattern triggers)
  - Risk parameters (position sizing, stop/take-profit rules)
  - Alert conditions (for TradingView webhook integration)
- Full modal viewer with syntax highlighting
- Copy-to-clipboard for pasting into TradingView
- Parameters customizable via modal inputs

**Indicator Types Supported**:
- Moving Averages: SMA, EMA, WMA, DEMA, TEMA
- Oscillators: RSI, MACD, Stochastic, StochRSI, CCI
- Volatility: Bollinger Bands, ATR, ADX
- Volume: VWAP, OBV
- Advanced: Ichimoku Cloud, Supertrend

**Condition Logic**:
- AND/OR grouping for entry/exit conditions
- Operators: crosses_above, crosses_below, above, below, equals
- Targets: other indicators, fixed values, dynamic levels

---

### 9. Gem Scanner — Low-Price Discovery

**Components**: `GemScanner.tsx`, `/api/scanner/route.ts`

The Gem Scanner finds high-potential low-price perpetual futures across the entire Phemex market.

**Scan Process**:
1. **Fetch**: Pulls all Phemex USDT perpetual futures (~500+ markets)
2. **Filter**: Price ≤ $0.10, 24h volume > $10k, leverage ≥ 20x
3. **Enrich**: 30-day OHLCV, SMA crossover detection (SMA7 vs SMA20), ATL/ATH distance, volume trend
4. **AI Rank**: Top 20 candidates sent to Claude for analysis → picks best 5

**Candidate Data**:
| Field | Description |
|-------|-------------|
| Price | Current market price |
| 24h Change | % change with color coding |
| Max Leverage | Available leverage (20x+) |
| SMA Signal | Bullish cross / Bearish cross / Neutral (color coded) |
| ATL Distance | % from all-time low (proximity = opportunity) |
| ATH Distance | % from all-time high (potential upside) |
| Volume | 24h USD volume |
| Volume Trend | 3-day vs prior-3-day comparison (increasing/decreasing) |

**AI Analysis Output**:
- Ranked list of top candidates with setup descriptions
- Entry price, stop loss, take profit, recommended leverage
- Thinking/reasoning display (collapsible)
- Click any candidate → routes to AI Chat for deeper analysis

**Why this matters**: Manually scanning 500+ futures for micro-cap gems is tedious. PhantomX automates the discovery with technical filtering AND AI-powered ranking, surfacing opportunities in seconds.

---

### 10. Risk Management & Kill Switch

**Components**: `execution-engine.ts`, `ControlPanel.tsx`

PhantomX implements multi-layered risk management with an emergency kill switch system.

**Risk Levels**:
| Level | Position Size | Stop Loss | Daily Cap | Description |
|-------|-------------|-----------|-----------|-------------|
| **Conservative** | 2-5% | 1-2% | 2% | Capital preservation focus |
| **Moderate** | 5-10% | 2-5% | 5% | Balanced risk/reward |
| **Aggressive** | 10-20% | 5-10% | 10% | Growth-oriented |
| **Degen** | 20-50% | 10%+ | 15%+ | Maximum risk (explicit acceptance required) |

**Kill Switch Triggers**:
1. **Max drawdown exceeded**: Account drops below peak × (1 - maxDrawdownPercent)
2. **Daily loss cap hit**: Day's P&L exceeds negative threshold
3. **Hard floor breached**: Account value drops below absolute USD minimum
4. **Hard ceiling reached**: Account value exceeds target USD maximum (profit taking)
5. **Manual trigger**: User clicks panic button

**Kill Switch Behavior**:
- All open orders canceled immediately
- All positions closed at market
- Engine stops — no new trades
- Kill reason logged and displayed prominently
- Requires manual restart to resume (deliberate friction)

**Health Check Loop** (5-second interval):
- Monitors all kill switch conditions continuously
- Fetches live portfolio data from Phemex
- Atomic state transitions (prevents race conditions in kill trigger)
- Event emitter broadcasts kill_switch event to all subscribers

**Position Sizing**:
- Dynamic: based on account equity × max position size %
- Adjusted by risk level
- Respects max open positions limit
- Separate stop-loss and take-profit orders placed alongside entries

---

### 11. Trade Journal

**Components**: `TradingJournal.tsx`, `/api/journal/route.ts`

The Trade Journal provides a play-by-play timeline of every autopilot decision, creating a complete audit trail.

**Entry Types**:
| Type | Icon | Description |
|------|------|-------------|
| `session_start` | 🚀 | Autopilot session began |
| `session_end` | 🏁 | Autopilot session stopped |
| `scan` | 🔍 | Market scan completed, top opportunities ranked |
| `analysis` | 🧠 | AI analyzed market and formed thesis |
| `decision` | ⚖️ | AI decided to act (with reasoning) |
| `trade` | ⚡ | Order executed on exchange |
| `close` | 💰 | Position closed (with realized P&L) |
| `skip` | ⏭️ | Trade skipped (constraint violation) |
| `kill` | 🛑 | Kill switch triggered |
| `summary` | 📋 | AI-generated day summary |

**Journal Entry Data**:
- Timestamp and tick number
- Symbol and action
- AI reasoning (full markdown — expandable)
- Confidence score (0-100)
- Price at time of event
- Realized P&L (for close events)
- Portfolio state snapshot: equity, cash %, position count, daily PnL
- Technical indicators at time of event
- Expandable/collapsible cards with timeline connector

**Timeline UI**:
- Vertical timeline with connected dots
- Color-coded by entry type
- Expandable cards showing full AI reasoning
- P&L badges on trade/close events
- Day grouping with summary statistics
- Filter by entry type

**Journal API** (`/api/journal`):
- `GET`: Fetch all journal entries (with optional date/type filters)
- `POST`: Create new journal entry (used by autopilot engine)
- `DELETE`: Clear journal entries

**Why this matters**: Complete transparency into AI decision-making. Every trade has a documented reason, confidence level, and portfolio context. Essential for auditing, learning, and building trust in the autonomous system.

---

### 12. TradingView Webhook Receiver

**Component**: `/api/webhook/route.ts`

PhantomX can receive TradingView alerts via webhook, enabling PineScript-triggered trading.

**Webhook Flow**:
1. TradingView alert fires → sends POST to PhantomX webhook URL
2. Webhook validates secret (`x-webhook-secret` header)
3. Payload parsed: strategy, action (buy/sell/close), symbol, price, quantity
4. Signal queued in-memory (max 100 entries, FIFO overflow)
5. Execution engine consumes signals and places orders
6. SSE stream forwards signals to frontend in real-time

**Security**:
- `WEBHOOK_SECRET` environment variable (mandatory)
- Rate limiting: 10 requests/minute per IP
- Max tracked IPs: 1000 (prevents memory exhaustion)
- Periodic cleanup of stale rate limit entries (5-minute intervals)
- Invalid action rejection (only buy/sell/close accepted)

**TradingView Integration**:
- PineScript generates alert conditions
- TradingView webhook URL points to PhantomX endpoint
- JSON payload format matches TradingView's alert message structure
- Supports: strategy name, action, symbol/ticker, price/close, quantity, timestamp, message/comment

---

### 13. Knowledge Base

**Component**: `knowledge-base.ts`

File-based persistent storage for trading knowledge, strategies, and market insights.

**Categories**:
| Category | Purpose |
|----------|---------|
| `strategies` | Saved trading strategies and configurations |
| `patterns` | Chart pattern descriptions and playbooks |
| `market-analysis` | Historical market analysis and notes |
| `risk-management` | Risk rules and lessons learned |
| `custom` | User-defined knowledge entries |

**Features**:
- Markdown files with YAML frontmatter (title, category, tags, source, dates)
- Full CRUD: create, read, update, delete
- Tag-based search and content text search
- `getPromptSummary()`: AI-ready formatted summary injected into autopilot context
- Sources: user (manual), AI (generated), system (auto-captured)
- Slug-based filenames for filesystem safety

**Why this matters**: The AI learns from accumulated knowledge. Each session's insights persist as markdown files, building an ever-growing library that makes the AI smarter over time.

---

### 14. Portfolio Analytics

**Components**: `TradeAnalytics.tsx`, `PortfolioBar.tsx`

**Portfolio Bar** (always visible):
- Total account value
- Available balance
- Unrealized P&L (color-coded)
- Number of open positions
- Connection status indicator

**Trade Analytics Panel**:
| Metric | Description |
|--------|-------------|
| Total P&L | All-time realized profit/loss |
| Daily P&L | Today's realized + unrealized |
| Win Rate | Winning trades / total trades |
| Profit Factor | Gross profit / gross loss |
| Average Win | Mean winning trade size |
| Average Loss | Mean losing trade size |
| Max Drawdown | Largest peak-to-trough decline |
| Sharpe Ratio | Risk-adjusted return metric |

**Autopilot P&L Tracking**:
- Separate tracking for autopilot-closed trades
- Session start equity recorded
- Cumulative realized P&L
- Best/worst trade identification
- Win/loss count and rate
- Total return % since autopilot start

**Trade History**:
- Per-symbol trade history fetching
- Round-trip matching (entry → exit pairs)
- Hold duration tracking
- AI-generated trade annotations
- Daily P&L bar chart

---

### 15. Settings & Configuration

**Settings Panel** (sidebar tab):
- **Connection Info**: API key status (masked), network (mainnet/testnet)
- **Disconnect**: Gracefully disconnects from Phemex, clears credentials
- **AI Model**: Currently locked to Claude Opus 4.6 (via Claude Max OAuth)
- **Theme Toggle**: Light / Dark
- **About**: Version info, technology credits

---

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/phemex` | POST | Exchange operations: check_env, connect_and_verify, ticker, ohlcv, positions, balances, open_orders, create_order, close_position, cancel_order, markets, recent_trades, set_leverage, trade_history |
| `/api/ai` | POST | AI operations: chat (streaming SSE), analyze_chart, generate_strategy, generate_plan |
| `/api/execute` | POST | Execution engine: start, stop, pause, resume, configure, get_stats |
| `/api/execute` | GET | SSE stream: engine events, stats updates (200ms poll) |
| `/api/heartbeat` | POST | Autopilot: start, stop, configure, get_stats, get_pnl |
| `/api/heartbeat` | GET | SSE stream: heartbeat events, portfolio updates |
| `/api/scanner` | POST | Gem scanner: scan market, AI-rank candidates |
| `/api/webhook` | POST | TradingView webhook: receive buy/sell/close signals |
| `/api/webhook` | GET | SSE stream: webhook signal forwarding |
| `/api/journal` | GET | Fetch journal entries (with filters) |
| `/api/journal` | POST | Create journal entry |
| `/api/journal` | DELETE | Clear journal entries |

---

## Real-Time Data Streams (SSE)

PhantomX uses Server-Sent Events for real-time frontend updates:

| Endpoint | Update Frequency | Data |
|----------|-----------------|------|
| `/api/heartbeat` (GET) | Per-event | Autopilot ticks, AI analysis, trade actions, portfolio snapshots |
| `/api/execute` (GET) | 200ms poll + 5s stats | Engine events, trade executions, stats updates |
| `/api/webhook` (GET) | 100ms poll | TradingView webhook signals |

All SSE streams include:
- 15-second keepalive pings
- 1-hour maximum lifetime
- Proper `cancel()` cleanup on client disconnect
- `Content-Type: text/event-stream` with `no-cache`

---

## Type System

PhantomX has 500+ lines of TypeScript type definitions in `src/types/trading.ts` covering:

- **Exchange types**: Ticker, OHLCV, OrderBook, Balance, Position, Order, Trade
- **Strategy types**: StrategyConfig, RiskParameters, IndicatorConfig, ConditionGroup
- **AI types**: AIMessage, ChartAnalysis, TradingContext
- **Chart types**: ChartAnnotation, ChartPriceLine, ChartDrawing, DrawingPoint
- **Autopilot types**: PortfolioHeartbeatConfig, PortfolioSnapshot, PortfolioTradeAction, AutopilotClosedTrade
- **Journal types**: JournalEntry, JournalDay, PortfolioTickSummary
- **Agent types**: AgentSignal, AgentStatus, OrchestratorConfig, SignalSummary
- **Knowledge types**: KnowledgeEntry
- **WebSocket types**: WSEvent, WSEventType

Strict TypeScript compilation with zero errors ensures type safety across the entire client-server boundary.

---

## Security Architecture

### Current State (from QA audit)
- Webhook endpoint has secret validation + rate limiting + IP tracking
- `.env.local` stores exchange credentials (not committed to git)
- CCXT handles Phemex API authentication (HMAC signing)

### Recommended Improvements (from QA Report)
- Add authentication middleware to all API routes
- Rate limiting on all endpoints (not just webhook)
- Auth tokens for SSE stream connections
- CORS + CSP headers
- Kill switch state persistence
- Input validation on trade parameters
- Error response sanitization

See `QA_REPORT.md` for the full 66-finding security audit with prioritized fix plan.

---

## Performance Characteristics

| Metric | Value |
|--------|-------|
| **Initial page load** | ~287 kB (gzipped) |
| **Build time** | ~5 seconds (Turbopack) |
| **API routes** | 7 serverless endpoints |
| **Ticker polling** | 3-second intervals |
| **OHLCV polling** | 30-second intervals |
| **Account polling** | 10-second intervals |
| **Autopilot tick** | Configurable (30s – 5min) |
| **SSE keepalive** | 15-second pings |
| **Max SSE lifetime** | 1 hour (auto-reconnect) |
| **Chart rendering** | lightweight-charts native (60fps capable) |
| **Server chart PNG** | node-canvas (~100ms per render) |

### Known Performance Issues (from QA Report)
- ChartDrawingOverlay runs 60fps RAF loop even when idle
- getComputedStyle called excessively (CSS variable reads)
- Dashboard re-renders all children every 3s (broad Zustand selector)
- No React.memo on any components
- WebSocket module exists but unused (HTTP polling instead)

See `QA_REPORT.md` Phase 4 for the full performance optimization plan.

---

## Deployment & Setup

### Prerequisites
- Node.js 18+ (LTS recommended)
- Phemex account (mainnet or testnet)
- Claude Max subscription (for Claude Agent SDK OAuth)

### Quick Start
```bash
# Clone and install
git clone <repo-url>
cd windsurf-project-2
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with:
#   PHEMEX_API_KEY=your_key
#   PHEMEX_SECRET=your_secret
#   PHEMEX_TESTNET=true  (or false for mainnet)
#   WEBHOOK_SECRET=your_webhook_secret
#   ANTHROPIC_API_KEY=  (not needed with Claude Max OAuth)

# Development
npm run dev        # http://localhost:3000

# Production
npm run build
npm start

# Testing
npx playwright test   # 100 E2E tests
npx tsc --noEmit      # Type check
npx eslint src/       # Lint check
```

### Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `PHEMEX_API_KEY` | Yes | Phemex API key |
| `PHEMEX_SECRET` | Yes | Phemex API secret |
| `PHEMEX_TESTNET` | Yes | `true` for testnet, `false` for mainnet |
| `WEBHOOK_SECRET` | For webhooks | TradingView webhook authentication secret |
| `PHEMEX_SIGNAL_TOKEN` | Optional | Phemex signal integration token |

---

## Selling Points & Differentiators

### 1. AI That Can *See* Charts
Unlike rule-based bots that only process numbers, PhantomX sends actual candlestick chart images to Claude's vision model. The AI identifies visual patterns (head and shoulders, flags, double bottoms) the same way a human trader would — but faster and without emotional bias.

### 2. Zero API Billing
Runs on Claude Max OAuth via the Claude Agent SDK. No per-token costs, no usage caps, no surprise bills. The AI brain costs a flat subscription fee regardless of how many analyses, strategies, or autonomous decisions it makes.

### 3. True Autonomous Portfolio Management
Not just a signal follower. PhantomX's autopilot makes genuine portfolio-level decisions: diversification, rotation, cash allocation, relative strength comparison. It reasons about *why* to make each trade, not just *when*.

### 4. Multi-Agent Intelligence
4 specialized agents (Sentinel, Macro, Technical, News) provide parallel market intelligence. Consensus signals reduce blind spots and give richer context than any single model could.

### 5. Transparent AI Reasoning
Extended thinking is displayed for every decision. The Trade Journal logs every scan, analysis, decision, and trade with full AI reasoning. You can audit exactly *why* the AI did what it did.

### 6. Multi-Layered Safety
5 kill switch triggers, configurable risk levels, hard floor/ceiling barriers, daily loss caps, max drawdown limits. Safety is not an afterthought — it's the foundation.

### 7. Professional Chart Tools
Drawing tools (trendlines, fibonacci, rectangles), AI-generated price lines, pattern visualization, and trade markers. Everything a professional trader expects, plus AI augmentation.

### 8. TradingView Integration
Generate PineScript strategies → deploy to TradingView → receive webhook signals → auto-execute. Complete loop from strategy ideation to live execution.

### 9. Gem Discovery
Full-market scanner finds micro-cap futures with momentum, then AI ranks the top candidates. Discovers opportunities across 500+ perpetual futures in seconds.

### 10. Persistent Knowledge
File-based knowledge base that grows with every session. The AI accumulates insights about strategies, patterns, and market conditions — getting smarter over time.

### 11. Beautiful, Thoughtful Design
Claude Design System: warm cream/charcoal themes, terracotta accents, SF Pro Text, dual-layer shadows. Not another generic dark-mode crypto dashboard — a distinctive, professional aesthetic.

### 12. Production-Quality Codebase
500+ TypeScript type definitions, 100 Playwright E2E tests, strict compilation, comprehensive QA process. This isn't a prototype — it's engineered for reliability.

---

## Quality Assurance

PhantomX includes a comprehensive QA pipeline:

- **TypeScript strict mode**: 0 compilation errors
- **ESLint**: Full rule enforcement
- **Next.js production build**: Verified clean compilation
- **100 Playwright E2E tests**: Covering every component, API route, keyboard shortcut, and user flow
- **Deep AI audits**: Security, performance, and logic/race condition analysis by parallel audit agents
- **QA Report**: 66 findings categorized by severity with prioritized fix plan

The `/qa-gauntlet` global skill can re-run the entire QA pipeline on demand.

---

*Documentation generated by sage-echo session. Last updated: 2026-02-13.*
*See QA_REPORT.md for the full quality audit with 66 findings and prioritized fix plan.*
