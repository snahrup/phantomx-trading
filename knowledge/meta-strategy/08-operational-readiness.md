---
id: meta-strategy-operational-readiness
title: Operational Readiness — Data Standards, Coordination Protocols, Autonomous Mode Prerequisites
category: meta-strategy
tags: ["operational-readiness", "data-standards", "coordination", "autonomous-mode", "schemas"]
source: meta-strategist
created: 2026-03-08T00:25:00.000Z
updated: 2026-03-08T00:25:00.000Z
---

# Operational Readiness — Standards & Protocols

## Purpose

The 17-agent roster is assembled. The org structure is sound. Now the bottleneck is **coordination quality** — how agents share data, resolve conflicts, and make collective decisions. This document defines the missing infrastructure.

---

## 1. Signal Interchange Format

### Problem
Every research agent writes free-form markdown. Head of Research must parse prose to synthesize signals. This is error-prone and wastes heartbeat budget on reading comprehension instead of analysis.

### Proposed Schema: `signal-schema.json`

Every research agent MUST append a structured signal block at the bottom of their narrative reports:

```json
{
  "signals": [
    {
      "id": "signal-[agent]-[timestamp]",
      "source": "onchain-analyst | sentiment-analyst | market-research | microstructure | scanner",
      "timestamp": "2026-03-07T23:48:00Z",
      "asset": "BTC | ETH | SOL | ALL",
      "direction": "bullish | bearish | neutral | mixed",
      "confidence": 0.75,
      "timeframe": "1h | 4h | 1d | 1w | 2w | 1m",
      "signal_type": "entry | exit | warning | regime_change | execution_quality",
      "summary": "One-line signal description",
      "data_points": [
        {"metric": "exchange_whale_ratio", "value": 0.64, "context": "highest since Oct 2015"}
      ],
      "invalidation": "Condition that would negate this signal",
      "expires": "2026-03-14T23:48:00Z"
    }
  ]
}
```

### Rules
- **All research agents** append this block to their heartbeat output files
- **Head of Research** consumes signals from all reports, resolves conflicts, and produces a synthesized signal set
- **Head of Trading** consumes the synthesized signals to guide the trading pipeline
- **Signals expire**. An expired signal is treated as neutral. This prevents stale data from driving decisions.
- **Confidence thresholds**: Signals below 0.5 confidence are informational only (no trading action)

### Consumption Flow
```
On-Chain → signals[]  ─┐
Sentiment → signals[] ──┤──→ Head of Research → synthesized_signals[] ──→ Head of Trading
Market Research → signals[] ─┘                                            │
                                                                ┌────────┼──────────┐
                                                                ↓        ↓          ↓
                                                          Strategy  Scanner  Microstructure
```

---

## 2. Market Regime Schema

### Problem
Multiple agents reference "regimes" but define them differently. Strategy Architect's "risk-off" and Backtester's "risk-off" may not mean the same thing.

### Proposed Schema: `knowledge/regime-schema.json`

```json
{
  "regimes": {
    "risk-on": {
      "description": "Broad risk appetite, trending up",
      "indicators": {
        "btc_rsi_14d": ">50",
        "fear_greed": ">45",
        "btc_sma_20d_position": "price > SMA20",
        "funding_rates_avg": ">0.01%"
      },
      "strategies_enabled": ["ema-ribbon-v2", "funding-rate-carry-v1"]
    },
    "risk-off": {
      "description": "Broad risk aversion, trending down or fear-driven",
      "indicators": {
        "btc_rsi_14d": "<40",
        "fear_greed": "<30",
        "btc_sma_20d_position": "price < SMA20",
        "funding_rates_avg": "<-0.01%"
      },
      "strategies_enabled": ["extreme-fear-reversal-v1"]
    },
    "ranging": {
      "description": "Low directional conviction, mean-reverting",
      "indicators": {
        "btc_adx_14d": "<20",
        "btc_rsi_14d": "40-60",
        "atr_percentile": "<30th"
      },
      "strategies_enabled": []
    },
    "volatile": {
      "description": "High ATR, rapid moves, liquidation cascades likely",
      "indicators": {
        "btc_adx_14d": ">30",
        "atr_percentile": ">80th",
        "liquidation_volume_24h": ">$500M"
      },
      "strategies_enabled": ["liquidity-sweep-reversal-v1"]
    }
  },
  "current_regime": {
    "regime": "risk-off",
    "set_by": "market-research-analyst",
    "set_at": "2026-03-07T23:43:00Z",
    "confidence": 0.85,
    "next_review": "2026-03-08T06:00:00Z"
  }
}
```

### Rules
- **Market Research Analyst** is the authoritative regime setter
- **Head of Research** can override with CEO notification
- **All agents** read `current_regime` before making regime-dependent decisions
- **Regime changes** are logged with timestamp, old regime, new regime, and rationale
- **Backtester** uses the same indicator thresholds to classify historical periods

---

## 3. Escalation Protocols

### Problem
No formal process for resolving disagreements between agents. What happens when Backtester says FAIL but Strategy Architect insists the strategy is valid?

### Escalation Matrix

| Conflict | Resolution Authority | Escalation Path | SLA |
|----------|---------------------|-----------------|-----|
| Research signal conflict (On-Chain vs Sentiment) | Head of Research | → CEO if unresolved | Same heartbeat |
| Strategy validation (Backtester FAIL) | Head of Trading | → CEO if strategist objects | 2 heartbeats max |
| Execution quality dispute | Head of Trading | → CEO + Risk Officer | Same heartbeat |
| Risk parameter breach | Risk Officer (final authority) | → CEO (informational only) | Immediate |
| Kill switch activation | Risk Officer (independent) | CEO notified, no override without board | Immediate |
| Budget overrun | CEO | Board (Steve) approval | Next heartbeat |
| Cross-division conflict (Research vs Trading) | CEO | Board if systemic | 2 heartbeats max |

### Rules
1. **Risk Officer has veto power** on all trading decisions. No escalation can override risk limits.
2. **Backtester FAIL is binding** unless Head of Trading escalates to CEO with written justification.
3. **Head of Research and Head of Trading** resolve within-division conflicts themselves. Only cross-division or unresolvable conflicts go to CEO.
4. **CEO does not mediate operational details**. Managers manage. CEO sets direction and handles exceptions.

---

## 4. Agent Coordination Timeline

### Problem
Agents run heartbeats asynchronously. There's no guarantee that Head of Research has synthesized before Head of Trading needs the daily brief.

### Proposed Heartbeat Ordering

```
Phase 1 — DATA COLLECTION (parallel, any order)
  └─ On-Chain Analyst
  └─ Sentiment Analyst
  └─ Market Research Analyst
  └─ Microstructure Analyst
  └─ Scanner Monitor

Phase 2 — SYNTHESIS (depends on Phase 1)
  └─ Head of Research (reads all Phase 1 research outputs → daily brief)
  └─ Head of Trading (reads scanner + microstructure → pipeline status)

Phase 3 — DECISION (depends on Phase 2)
  └─ Strategy Architect (reads daily brief → selects/adjusts strategies)
  └─ Risk Officer (reads all → risk assessment)

Phase 4 — EXECUTION (depends on Phase 3, autonomous mode only)
  └─ Execution Trader (executes approved signals)

Phase 5 — REVIEW (depends on Phase 4)
  └─ Trade Analyst (reviews completed trades → feedback)
  └─ Portfolio Manager (P&L snapshot → CEO report)
```

### Implementation Note
Paperclip currently triggers heartbeats independently. True phase ordering would require either:
1. **Dependency-aware scheduling** in Paperclip (ideal but requires engineering)
2. **Temporal spacing** — schedule Phase 1 agents every N minutes, Phase 2 agents offset by M minutes
3. **File-based readiness** — agents check for prerequisites before acting (e.g., Head of Research checks if all Phase 1 agents have written today's output before synthesizing)

**Recommendation**: Start with option 3 (file-based readiness checks). Each agent checks for its inputs before producing outputs. If inputs are stale (>6 hours old), produce a partial synthesis and note the gaps.

---

## 5. Pair Coverage Matrix

### Problem
"All perp pairs" is undefined. Phemex has 50+ perp pairs. Full research coverage on all is wasteful.

### Proposed Tiered Coverage

| Tier | Pairs | Coverage | Agents Involved |
|------|-------|----------|----------------|
| **Tier 1** | BTC, ETH, SOL | Full (all agents, every heartbeat) | All research + microstructure |
| **Tier 2** | Top 20 by OI/volume (DOGE, ADA, AVAX, LINK, etc.) | Scanner + On-signal research | Scanner Monitor scans; research agents analyze on signal |
| **Tier 3** | All others | Scanner only | Scanner Monitor scans for anomalies; no proactive research |

### Rules
- **Tier promotion/demotion**: If a Tier 3 pair shows abnormal volume/OI/funding, Scanner promotes it to Tier 2 for the session
- **Review frequency**: Tier assignments reviewed weekly based on volume and OI changes
- **Position limits by tier**: Tier 1 = full position sizing. Tier 2 = 50% max position. Tier 3 = 25% max position.

---

## 6. Autonomous Mode Prerequisites Checklist

Before the board (Steve) should approve switching from `manual` to `autonomous`:

### Must-Have (blocking)

- [ ] **Backtester validates all active strategies** with pass/fail criteria from agent instructions
- [ ] **Correlation monitoring implemented** in Risk Officer (blocks correlated over-exposure)
- [ ] **Head of Research produces ≥3 daily briefs** demonstrating synthesis quality
- [ ] **Head of Trading produces ≥3 pipeline status reports** demonstrating coordination quality
- [ ] **Signal interchange format adopted** by ≥3 research agents
- [ ] **Regime schema adopted** and consumed by Strategy Architect + Backtester
- [ ] **Paper trading trial** — run the full pipeline in paper mode for ≥10 simulated trades
- [ ] **Kill switch tested** — verify kill switch fires correctly in autonomous mode
- [ ] **Position sizing validated** — verify Risk Officer correctly blocks oversized positions

### Should-Have (important but not blocking)

- [ ] **Trade Analyst has ≥10 trades analyzed** demonstrating feedback loop quality
- [ ] **Microstructure pre-computes** slippage estimates for Tier 1 pairs before execution
- [ ] **Escalation protocols tested** — at least one simulated conflict resolution
- [ ] **Pair coverage matrix adopted** by all agents

### Nice-to-Have

- [ ] **Model cost optimization** evaluated (Opus vs Sonnet per agent)
- [ ] **Meta-Strategist role reduced** to quarterly reviews
- [ ] **Weekly performance digest** produced by Trade Analyst

---

## 7. Performance Metrics Framework

### Agent-Level KPIs

| Agent | Primary KPI | Target |
|-------|------------|--------|
| Head of Research | Daily brief delivery rate | 100% on trading days |
| Head of Research | Conflict resolution rate | <2 heartbeats per conflict |
| On-Chain Analyst | Whale signal lead time | >2 hours before price impact |
| Sentiment Analyst | Contrarian signal accuracy | >55% hit rate |
| Market Research Analyst | Regime classification accuracy | >70% correct (validated by price) |
| Strategy Architect | Strategy pass rate (Backtester) | >60% |
| Backtester | Strategy validation coverage | 100% before deployment |
| Scanner Monitor | Setup detection rate | >80% of Tier 1 pair moves |
| Microstructure Analyst | Slippage model accuracy | Within 2 bps of actual |
| Execution Trader | Fill quality (actual vs mid) | <3 bps deviation |
| Trade Analyst | Feedback implementation rate | >50% of recommendations adopted |
| Risk Officer | Breach prevention rate | 100% (no undetected limit violations) |

### System-Level KPIs

| Metric | Target | Measurement |
|--------|--------|------------|
| Win rate (regime-adjusted) | >55% | Trade Analyst weekly report |
| Average R:R achieved | >2:1 | Trade Analyst weekly report |
| Max drawdown | <15% (kill switch trigger) | Risk Officer continuous |
| Signal-to-execution latency | <2 heartbeats | Head of Trading pipeline report |
| Agent budget utilization | <80% monthly | CEO budget audit |
| False positive rate (scanner) | <40% | Trade Analyst feedback loop |

---

## Bottom Line

The agents are hired. The structure is sound. What's missing is the **connective tissue** — the schemas, protocols, and standards that let 17 agents function as one system rather than 17 independent units.

Priority implementation order:
1. **Signal interchange format** — agents speak the same language
2. **Regime schema** — agents agree on what "risk-off" means
3. **Backtester validates strategies** — nothing goes live without data
4. **Correlation monitoring** — prevents concentrated directional bets
5. **Paper trading trial** — prove the pipeline works end-to-end

Once these 5 items are done, the system is ready for autonomous mode review.
