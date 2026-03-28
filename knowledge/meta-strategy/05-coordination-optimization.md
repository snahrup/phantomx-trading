---
id: meta-strategy-coordination
title: Coordination Optimization - Pipeline Architecture Analysis
category: meta-strategy
tags: ["coordination", "pipeline", "architecture", "signal-flow", "consensus"]
source: meta-strategist
created: 2026-03-07T23:30:00.000Z
updated: 2026-03-07T23:30:00.000Z
---

# Coordination Optimization — Pipeline Architecture

## Current Pipeline

```
Research → Strategy → Scanner → Risk → Execution
(linear, sequential)
```

### Problems with Current Linear Pipeline

1. **Single point of failure**: If any stage blocks, the entire pipeline stalls
2. **No parallel research streams**: Market Research, Strategy, and Scanner run sequentially — but they could run in parallel since they consume different data
3. **No feedback loop**: Post-trade results don't feed back into Research or Strategy
4. **No consensus mechanism**: Portfolio Heartbeat Engine makes all decisions alone (with agent signals as input, but no challenge/debate)
5. **Signal decay**: By the time a signal passes through all stages, the opportunity may have expired (especially at 2-minute timeframes)

---

## Proposed Architecture: Parallel Streams with Consensus Gate

```
┌─────────────────────────────────────────────────────┐
│                  RESEARCH LAYER                      │
│  (parallel streams, continuous)                      │
│                                                      │
│  Market Research ──┐                                 │
│  On-Chain Analyst ─┤                                 │
│  Sentiment NLP ────┤──→ Signal Aggregator            │
│  Macro Analysis ───┘    (weighted consensus)         │
│                              │                       │
│  Internal Agents ────────────┤                       │
│  (Sentinel, Macro,           │                       │
│   News, Technical)           │                       │
└──────────────────────────────┼───────────────────────┘
                               ↓
┌──────────────────────────────┼───────────────────────┐
│                  STRATEGY LAYER                      │
│                                                      │
│  Strategy Architect ──→ Active Strategy Selection    │
│  Backtester ──────────→ Strategy Validation          │
│                              │                       │
│  Scanner Monitor ────────────┤                       │
│  (pattern detection          │                       │
│   against active strategies) │                       │
└──────────────────────────────┼───────────────────────┘
                               ↓
┌──────────────────────────────┼───────────────────────┐
│                  DECISION GATE                       │
│                                                      │
│  Portfolio Heartbeat ──→ Trade Decision              │
│  (Claude API)              │                         │
│                            ↓                         │
│  Risk Gate ──────────→ Approve / Reject / Modify     │
│  (kill switch,             │                         │
│   position limits,         │                         │
│   correlation check)       │                         │
└────────────────────────────┼─────────────────────────┘
                             ↓
┌────────────────────────────┼─────────────────────────┐
│                  EXECUTION LAYER                     │
│                                                      │
│  Microstructure ──→ Optimal Entry Timing             │
│  Execution Trader ─→ Order Placement (Phemex)        │
│                            │                         │
│  Position Monitor ─────────┤                         │
│  (running P&L, stops,      │                         │
│   take-profits)            │                         │
└────────────────────────────┼─────────────────────────┘
                             ↓
┌────────────────────────────┼─────────────────────────┐
│                  FEEDBACK LAYER                      │
│                                                      │
│  Post-Trade Analyst ──→ Trade Review                 │
│  Portfolio Manager ───→ Performance Report           │
│  Knowledge Base ──────→ Learning Storage             │
│                            │                         │
│              ┌─────────────┘                         │
│              ↓                                       │
│  Feeds back into Research + Strategy layers          │
└──────────────────────────────────────────────────────┘
```

---

## Key Architecture Decisions

### 1. Parallel Research Streams (Not Sequential)

**Current**: Market Research → Strategy → Scanner (linear)
**Proposed**: All research streams run in parallel, continuously

**Why**: Research inputs are independent:
- On-chain data doesn't depend on sentiment
- Technical analysis doesn't depend on macro
- Each stream produces a confidence-weighted signal

**Implementation**: Each Paperclip research agent runs its own heartbeat cycle. Internal agents already run on independent intervals. Signals aggregate in the Signal Bus.

### 2. Weighted Signal Aggregation

**Current**: Signal Bus does simple majority voting (bullish > bearish = bullish)
**Proposed**: Weighted consensus based on historical accuracy

Each signal source gets a weight based on:
- Recent accuracy (backtested and live)
- Regime appropriateness (technical signals matter more in trending markets)
- Confidence level (self-reported by each agent)

```
Consensus Score = Σ (signal_direction × weight × confidence) / Σ weights

Where weights are calibrated weekly based on:
- Correct direction predictions (last 20 signals)
- Regime-appropriate weighting (from regime classifier)
```

### 3. Independent Risk Gate (Veto Power)

**Current**: Risk gate checks position size and kill switch
**Proposed**: Risk gate has expanded veto power:

- Position size check ✓ (exists)
- Kill switch check ✓ (exists)
- Correlation check (NEW — block correlated positions)
- Margin utilization check (NEW — block if >70%)
- Regime-appropriateness check (NEW — block counter-regime trades)
- Liquidation proximity check (NEW — block if liquidation price within 1.5% of current price)

**Critical**: Risk gate must NEVER report to the same manager as trading agents. Independent oversight.

### 4. Execution Optimization Layer

**Current**: Market orders placed directly via CCXT
**Proposed**: Microstructure analysis before execution

For each trade signal:
1. Check current spread (wait if spread > threshold)
2. Check order book depth (reduce size if depth insufficient)
3. Check for large pending liquidations nearby
4. Select order type (limit vs market based on urgency)
5. Split large orders (TWAP/VWAP for positions > $50)

### 5. Feedback Loop (Currently Missing)

**Proposed**: After every closed trade:
1. Post-Trade Analyst reviews entry, exit, timing, slippage
2. Classifies: was the signal accurate? Was execution optimal?
3. Updates signal source weights (reinforcement)
4. Stores learning in Knowledge Base
5. Feeds back into Strategy Architect for strategy tuning

---

## Pipeline Latency Analysis

At 50x leverage on short timeframes, signal latency matters:

| Stage | Current Latency | Target Latency |
|-------|----------------|----------------|
| Signal Generation (internal) | 2-10 min (interval) | 2 min (maintain) |
| Signal Generation (Paperclip) | Minutes (heartbeat) | Not latency-critical |
| Signal Aggregation | Instant (in-memory) | Instant (maintain) |
| Risk Gate | ~100ms | ~100ms (maintain) |
| Portfolio Decision (Claude API) | 5-15s | 5-15s (acceptable) |
| Execution | ~500ms (Phemex API) | ~500ms (maintain) |
| **Total** | **~2-10 min + 15s** | **~2 min + 15s** |

**Key insight**: The bottleneck is the internal agent interval (2 min minimum for Technical). The Paperclip layer is not latency-critical — it handles strategic decisions (which strategy to use, risk framework tuning) that change on hourly/daily timescales.

---

## Consensus vs Single-Decision-Maker

### Current: Single Decision Maker (Portfolio Heartbeat Engine)
- Claude API makes all trade decisions
- Agents provide input but don't vote
- CEO is the only Paperclip-level decision authority

### Recommendation: Hybrid Approach

**Real-time decisions** (enter/exit/stop): Single decision maker (Portfolio Heartbeat Engine) — speed matters more than consensus

**Strategic decisions** (strategy selection, risk parameter changes, new asset onboarding): Require multi-agent consensus:
- Strategy Architect recommends
- Risk Officer validates
- Market Research confirms regime alignment
- CEO approves

This mirrors quant fund practice: traders execute quickly, but strategy changes go through committee.
