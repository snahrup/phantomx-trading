---
id: week-ahead-plan-march-10-2026
title: "Week-Ahead Game Plan — March 10-14, 2026"
category: meta-strategy
tags: ["week-plan", "cpi", "fomc", "scenario-analysis", "system-readiness", "paper-trading"]
source: meta-strategist
created: 2026-03-08T15:00:00.000Z
updated: 2026-03-08T15:00:00.000Z
heartbeat: 10
---

# Week-Ahead Game Plan — March 10-14, 2026

**Author**: Meta-Strategist (Heartbeat 10)
**System Grade**: B (intelligence A, execution D)
**Account**: $154.93 USDT, FLAT, 0 positions
**Mode**: MANUAL (board-set)
**Regime**: BTC TRENDING (ADX 27.4), alts mixed

---

## Executive Summary

This is the most consequential week since Phantom Trading Co. launched. Two macro catalysts — **CPI Tuesday March 11 (13:30 UTC)** and **FOMC Wednesday March 18** — land into the strongest four-stream convergence we've ever recorded: 270K BTC whale accumulation (13-year high), $3B USDC minting, F&G at 12 for 22+ days (3rd most extreme ever), and deeply negative alt funding rates. The spring is coiled.

**The system question is not "will there be a signal?" — it's "is the system ready to act on one?"**

Answer: Partially. Intelligence is A-grade. Execution infrastructure is D-grade. This plan addresses the gap with hour-by-hour coordination, pre-calculated trade parameters, and a realistic blocker-clearing schedule.

---

## 1. Key Catalysts This Week

| Event | Date/Time | Impact | What to Watch |
|-------|-----------|--------|---------------|
| **US CPI (Feb data)** | Tue Mar 11, 13:30 UTC | **CRITICAL** | Headline vs 2.4% prior, Core vs 2.5% prior. Jan was softer — continuation = bullish crypto |
| CPI market reaction window | Tue Mar 11, 13:30-17:30 UTC | HIGH | BTC typically moves 2-5% within 4 hours of CPI |
| Post-CPI positioning | Wed-Thu Mar 12-13 | MEDIUM | Markets price in FOMC expectations based on CPI data |
| **FOMC Rate Decision** | Tue Mar 18, 18:00 UTC | **CRITICAL** | Not this week but market will front-run expectations starting Tuesday |
| Funding settlements | Every 8h (00:00/08:00/16:00 UTC) | MEDIUM | NEAR FRC gating depends on settlements flipping negative |

**Critical insight**: Jan 2026 CPI came in at 2.4% headline / 2.5% core — both softer than expected. BTC spiked 6% and passed $68K on that print. If Feb CPI continues the cooling trend, BTC has already demonstrated the reaction pattern. Our EFR and EMA Ribbon strategies are designed exactly for this catalyst.

---

## 2. Market Position Entering the Week

### Strengths
- **$154.93 dry powder**: 100% cash, no exposure risk going into CPI
- **Intelligence layer A-grade**: 4-stream convergence, HoR synthesizing, all research delivered
- **Strategy portfolio validated**: Combined EMA+EFR backtested at +16.9% (Sharpe 4.47)
- **Extreme fear environment**: F&G 12 for 22+ days = maximum contrarian setup
- **Short crowding extreme**: TAO -147% ann, WIF -96% ann = massive squeeze fuel

### Weaknesses
- **0/6 autonomous mode blockers cleared**: System cannot execute autonomously
- **1/10 paper trades**: Cannot validate edge without more data
- **No signal schema**: Agents still communicate in free-form markdown
- **NEAR funding confusion**: Predicted vs settled rate not standardized
- **40.6% drawdown from peak**: Recovery scaling at 0.5x reduces position impact

### Neutral
- **BTC ADX 27.4 (TRENDING)**: First confirmed trend since scanning began. Activates EMA Ribbon but ribbon not yet aligned
- **Kill switch INACTIVE**: Trading allowed but MANUAL mode = Steve trades, agents advise

---

## 3. CPI Scenario Decision Tree

### Scenario A: CPI Cool (Below 2.3% headline / Below 2.4% core)
**Probability**: 35%
**Market impact**: BTC +3-7%, alts +5-20% within 4 hours

```
CPI COOL → Rate cut odds rise → Risk-on → Short squeeze

IMMEDIATE STRATEGY ACTIVATION:
├── EFR v1.1 (Priority 1)
│   ├── OP: Already 3/5 conditions. Cool CPI likely triggers RSI cross + MACD improvement
│   ├── WIF: Capitulation RSI ~13. Reversal begins here — highest conviction when confirmed
│   └── INJ: RSI 35.7 may re-enter zone on initial dip, then reverse strongly
│
├── EMA Ribbon v2.1 (Priority 2)
│   ├── BTC: If +5% move, EMA(8) could cross above EMA(21) within 2-3 candles
│   ├── ADX already 27.4 — pullback to EMA(21) after spike = textbook entry
│   └── First LONG entry opportunity since launch
│
├── FRC v1.0 (Priority 3)
│   ├── Prices may punch above EMA(55) on TAO, INJ
│   ├── NEAR already above EMA(55) — funding settlement behavior is the gate
│   └── Monitor 16:00 UTC settlement post-CPI for first negative settled rate
│
└── AGENT ACTIONS:
    ├── Scanner: Increase to 1H frequency on all 8 priority pairs
    ├── HoR: Produce flash brief within 30 min of CPI release
    ├── HoT: Pre-calculated paper trade ready for immediate logging
    ├── Risk Officer: Confirm all thresholds, verify kill switch state
    └── Strategy Architect: Update regime classification post-move
```

**Paper trade targets (Scenario A)**:
1. OP EFR LONG — if 5/5 conditions fire ($0.58 risk, $29 notional, $0.58 margin)
2. BTC EMA Ribbon LONG — if ribbon aligns post-spike ($1.55 risk, dynamic notional)
3. NEAR FRC LONG — if 16:00 UTC settlement negative ($1.55 risk, $155 notional, $3.10 margin)

**Success metric**: 2-3 paper trades logged. Paper trade count → 3-4/10.

---

### Scenario B: CPI Hot (Above 2.5% headline / Above 2.7% core)
**Probability**: 30%
**Market impact**: BTC -3-7%, alts -5-25% within 4 hours

```
CPI HOT → Rate cut delayed → Risk-off → Capitulation extends

IMMEDIATE STRATEGY ACTIVATION:
├── EFR v1.1: DO NOT CHASE
│   ├── RSIs will drop further — catching falling knives in hawkish env = max risk
│   ├── Funding deepens = BETTER entry LATER
│   ├── WIF could hit RSI <10 — unprecedented territory
│   └── This is SETUP phase, not ENTRY phase
│
├── EMA Ribbon v2.1 (SHORT opportunity)
│   ├── If BTC drops 5%+, BEAR ribbon may fully align (55>21>8)
│   ├── SHORT entry possible if ADX stays >25 and pullback to EMA(21) occurs
│   ├── CAUTION: Counter-trend shorts in extreme fear = risky
│   └── Only with full confluence (ribbon + ADX + RSI 45-60 zone)
│
├── FRC v1.0: All gates REMAIN BLOCKED
│   └── Prices collapse further below EMA(55). Correct behavior.
│
└── AGENT ACTIONS:
    ├── Scanner: Monitor for RSI <10 extremes (historic opportunities forming)
    ├── HoR: Produce "extended capitulation" brief — timeline for recovery
    ├── HoT: Log zero entries as CORRECT behavior (patience paper trade)
    ├── On-Chain: Check if whale accumulation accelerates (buying the dip)
    └── Sentiment: Update F&G trajectory, check for sub-10 readings
```

**Paper trade targets (Scenario B)**:
1. BTC EMA Ribbon SHORT — only if full BEAR ribbon aligns ($1.55 risk)
2. **Patience is the trade** — logging "no entry" with reasoning counts as pipeline validation

**Success metric**: 0-1 paper trades. But document WHY no trades = validates risk framework.

---

### Scenario C: CPI In-Line (2.3-2.5% headline / 2.4-2.6% core)
**Probability**: 35%
**Market impact**: BTC +/-1%, volatile whipsaw then reversion

```
CPI IN-LINE → No catalyst → Range continues

IMMEDIATE STRATEGY ACTIVATION:
├── All strategies: STATUS QUO
│   ├── EFR v1.1: Continue monitoring. OP setup may evolve slowly
│   ├── EMA Ribbon v2.1: Ribbon remains MIXED. No change
│   ├── FRC v1.0: NEAR gating continues on schedule
│   └── LSR v1.0: ETH ranging — scan for sweep setups
│
├── CRITICAL: Do not force trades just because CPI happened
│   └── The ABSENCE of a catalyst is itself information
│
└── AGENT ACTIONS:
    ├── Scanner: Return to normal 4H frequency
    ├── HoR: Brief update, shift focus to FOMC March 18 prep
    ├── HoT: No action needed
    └── All agents: Begin FOMC scenario planning
```

**Paper trade targets (Scenario C)**:
1. ETH LSR — if sweep setup detected ($1.55 risk)
2. Focus shifts to FOMC prep

**Success metric**: 0-1 paper trades. Use the quiet to clear autonomous mode blockers.

---

## 4. System Readiness Assessment — CPI-Specific

### READY (Green)
| Component | Status | Evidence |
|-----------|--------|----------|
| Research intelligence | READY | 4-stream convergence, HoR synthesizing, all agents delivered |
| Kill switch | READY | INACTIVE, file absent from disk |
| Risk params | READY | risk-params.json comprehensive, thresholds calibrated |
| Position sizing | READY | Pre-calculated at $154.93 equity, 0.5x recovery |
| Pre-CPI prep doc | READY | knowledge/market-analysis/pre-cpi-prep-2026-03-09.md (draft, needs Monday refresh) |
| Strategy playbook | READY | active-strategy-playbook.md current |
| Regime router | READY | src/lib/strategy/regime-router.ts functional |

### NOT READY (Red) — Must Fix Before CPI
| Component | Status | Impact | Fix |
|-----------|--------|--------|-----|
| Signal schema | MISSING | Agents can't exchange structured signals | Deploy signal-schema.json (draft in HB9 report). 2h effort. |
| Regime schema | MISSING | Agents compute own regimes, creating discrepancies | Deploy regime-schema.json (draft in HB9 report). 1h effort. |
| Funding rate disambiguation | MISSING | NEAR FRC confusion (predicted vs settled) | Add `fundingRateType` field to all agent reports. 30 min effort. |
| Paper trade logging | UNTESTED | Pipeline can accept signals but hasn't processed a strategy-driven trade | Dry-run: submit a test paper trade through the pipeline Monday. 1h effort. |
| Backtester agent | DORMANT | Cannot formally validate strategies | Lower priority for CPI — manual backtests exist. P1 for FOMC week. |

### PARTIALLY READY (Yellow)
| Component | Status | Notes |
|-----------|--------|-------|
| CPI prep document | DRAFT | Head of Trading produced draft. Needs Monday AM refresh with consensus estimates. |
| Scanner frequency | 4H default | Must increase to 1H on T-24h (Monday 12:00 UTC). Needs HoT coordination. |
| Pipeline dry-run | NOT DONE | Submit_signal → process flow untested end-to-end for paper trades |

---

## 5. Agent Coordination Timeline

### Monday March 10 (T-24h)

| Time (UTC) | Agent | Action |
|------------|-------|--------|
| 00:00-08:00 | Scanner Monitor | Regular 4H scan. Log overnight price/RSI/funding changes |
| 08:00 | Head of Trading | **Increase scanner to 1H** on INJ, WIF, NEAR, OP, TAO, BTC, ETH |
| 09:00 | Strategy Architect | Refresh all watchlist technicals. Update playbook with Sunday price action |
| 10:00 | Head of Research | **Monday morning brief**: CPI consensus estimates, scenario probabilities, priority matrix update |
| 10:00 | Sentiment Analyst | Update F&G, funding rates, long/short ratios for CPI prep |
| 10:00 | On-Chain Analyst | Check if whale accumulation trend continues. Update exchange reserve data |
| 12:00 | Head of Trading | **Finalize CPI prep doc** with Monday data. Pre-calculate paper trade params for all 3 scenarios |
| 12:00 | Microstructure Analyst | Refresh order book depth maps for 8 priority pairs |
| 14:00 | Risk Officer | Verify all risk-params.json thresholds. Confirm pipeline config. Test kill switch state |
| 14:00 | Meta-Strategist | System readiness final check. Blocker status update |
| 16:00 | Head of Trading | **Pipeline dry-run**: Submit test paper trade signal, verify end-to-end flow |
| 20:00 | Scanner Monitor | T-16h scan. Final pre-CPI technical snapshot |

### Tuesday March 11 — CPI Day

| Time (UTC) | Agent | Action |
|------------|-------|--------|
| 00:00-08:00 | Scanner Monitor | 1H scans continue |
| 08:00 | Head of Research | **CPI morning brief**: Final expectations, scenario prep, market positioning |
| 10:00 | All agents | **Pre-CPI checkpoint**. All research current. Pipeline tested. Risk params verified. |
| 11:30 | Head of Trading | **BLACKOUT BEGINS** — No new entries within 2h of CPI (11:30-13:30 UTC) |
| 13:30 | **CPI RELEASE** | ALL AGENTS: Observe. Do NOT react for 15 minutes. |
| 13:45 | Head of Research | **Flash brief**: CPI result, which scenario, immediate implications |
| 14:00 | Scanner Monitor | **Immediate full scan**: RSI, MACD, EMA positions across all 8 priority pairs |
| 14:00 | Sentiment Analyst | Real-time F&G update, funding rate shifts, social sentiment pulse |
| 14:00 | On-Chain Analyst | Exchange flow reaction — are whales buying/selling the CPI move? |
| 14:30 | Head of Research | **Scenario classification**: Declare which scenario (A/B/C) is active |
| 14:30 | Strategy Architect | Update regime classification. Check if any strategy triggers fired |
| 15:00 | Head of Trading | **Decision point**: If Scenario A, prepare paper trade submission(s). If B/C, document patience |
| 15:30 | Head of Trading | **Paper trade window opens** (T+2h). Submit entries if triggers fire |
| 17:30 | Head of Trading | **T+4h review**: Full post-CPI assessment. Close CPI event window |
| 17:30 | Head of Research | **Post-CPI daily brief**: Updated priority matrix, regime assessment, FOMC implications |
| 20:00 | Meta-Strategist | System performance review — did the pipeline behave correctly? |

### Wednesday-Friday March 12-14 (Post-CPI / Pre-FOMC)

| Day | Focus | Key Actions |
|-----|-------|-------------|
| **Wed Mar 12** | Post-CPI regime assessment | Full regime scan. Update all strategy statuses. Begin FOMC scenario planning. |
| **Thu Mar 13** | FOMC prep begins | Head of Research: FOMC scenario analysis. Strategy Architect: FOMC-specific strategy adjustments. |
| **Fri Mar 14** | Week review + FOMC prep | Meta-Strategist: Week performance review. All agents: FOMC prep deliverables. |

---

## 6. Strategy Activation Decision Matrix

For each CPI outcome, which strategies activate and with what priority:

| | Scenario A (Cool) | Scenario B (Hot) | Scenario C (In-Line) |
|---|---|---|---|
| **EFR v1.1** | PRIORITY 1: OP/WIF/INJ if triggers fire | WATCH: Setups deepen, don't chase | MONITOR: Slow evolution |
| **EMA Ribbon v2.1** | PRIORITY 2: BTC LONG if ribbon aligns | POSSIBLE: BTC SHORT if bear ribbon forms | INACTIVE: Ribbon still mixed |
| **FRC v1.0** | PRIORITY 3: NEAR/TAO if gates clear | BLOCKED: All gates fail | MONITOR: NEAR gating continues |
| **LSR v1.0** | LOW: Breakout > ranging | LOW: Capitulation > ranging | ACTIVE: ETH ranging setup |
| **Expected paper trades** | 2-3 | 0-1 | 0-1 |
| **Risk posture** | Offensive (0.5x recovery) | Defensive (observe only) | Neutral (selective) |

---

## 7. Pre-Calculated Paper Trade Parameters

All at $154.93 equity, 0.5x recovery multiplier:

### EFR v1.1 Paper Trades

| Pair | Tier | Risk % | $ Risk | Stop | Entry Zone | TP1 | TP2 | Notional | Margin |
|------|------|--------|--------|------|------------|-----|-----|----------|--------|
| OP | Mid-cap | 1.0% | $0.77 | 1.5% | ~$0.115-0.118 | 3.0% | Trail 2.5 ATR | $51.55 | $1.03 |
| WIF | Small-cap | 0.75% | $0.58 | 2.0% | ~$0.175-0.185 | 4.0% | Trail 2.5 ATR | $29.06 | $0.58 |
| INJ | Small-cap | 0.75% | $0.58 | 2.0% | ~$2.80-2.90 | 4.0% | Trail 2.5 ATR | $29.06 | $0.58 |

### EMA Ribbon v2.1 Paper Trades

| Pair | Risk % | $ Risk | Stop | Entry Condition | Notional | Margin |
|------|--------|--------|------|-----------------|----------|--------|
| BTC LONG | 2.0% | $1.55 | Below EMA(55) ~$68,390 | Ribbon aligns (8>21>55) + pullback to EMA(21) | Dynamic | Dynamic |
| BTC SHORT | 2.0% | $1.55 | Above EMA(55) | Ribbon aligns (55>21>8) + pullback to EMA(21) | Dynamic | Dynamic |

### FRC v1.0 Paper Trades

| Pair | Risk % | $ Risk | Stop | Entry Condition | Notional | Margin |
|------|--------|--------|------|-----------------|----------|--------|
| NEAR | 1.0% | $1.55 | 1.0% | Price > EMA(55) + 3 consecutive negative SETTLED rates | $154.93 | $3.10 |
| TAO | 1.0% | $1.55 | 1.0% | Price > EMA(55) + 3 consecutive negative settled rates | $154.93 | $3.10 |

**Maximum simultaneous paper trades**: 2 (Phase 1 limit)
**Maximum total risk at any time**: $3.10 (2% of equity at recovery scaling)
**Margin utilization at max capacity**: ~$4.13 / $154.93 = 2.7% (well within 70% limit)

---

## 8. Paper Trade Acceleration Plan

**Current**: 1/10 (ETH test trade, $0 P&L)
**Target by end of week**: 4-5/10
**Target by FOMC (March 18)**: 7-8/10

### How to Accelerate

| Source | Expected Trades | Timing | Notes |
|--------|----------------|--------|-------|
| CPI Scenario A triggers | 2-3 | Tue Mar 11, 15:30+ UTC | OP EFR + BTC EMA or NEAR FRC |
| CPI Scenario B SHORT | 0-1 | Tue Mar 11, 15:30+ UTC | BTC EMA SHORT if bear ribbon |
| Post-CPI momentum | 1-2 | Wed-Thu Mar 12-13 | Follow-through trades as setups evolve |
| ETH LSR ranging | 0-1 | Anytime this week | If sweep setup detected |

**Critical requirement**: The pipeline must be able to LOG paper trades programmatically. Currently untested. Monday pipeline dry-run is MANDATORY.

### Paper Trade Logging Standard

Every paper trade must record:
```json
{
  "tradeId": "paper-XXX",
  "strategy": "strat-efr-v1.1 | strat-ema-v2.1 | strat-frc-v1.0 | strat-lsr-v1.0",
  "pair": "OPUSDT",
  "direction": "LONG | SHORT",
  "entryPrice": 0.116,
  "stopLoss": 0.1143,
  "takeProfit1": 0.1195,
  "takeProfit2": "trail 2.5 ATR",
  "positionSize": 51.55,
  "riskAmount": 0.77,
  "regime": "TRENDING | RANGING | VOLATILE",
  "catalyst": "CPI cool — Scenario A",
  "entryTimestamp": "2026-03-11T15:30:00Z",
  "triggerConditions": ["RSI crossed above 30", "MACD histogram positive", "EMA(8) > EMA(21)"],
  "outcome": "pending | win | loss | breakeven",
  "exitPrice": null,
  "exitTimestamp": null,
  "pnl": null,
  "notes": "First EFR paper trade on alt pair"
}
```

---

## 9. Autonomous Mode Blockers — This Week's Target

| # | Blocker | Can Clear This Week? | Who | Effort | Priority |
|---|---------|---------------------|-----|--------|----------|
| 1 | Signal interchange format | **YES** | CEO deploys schema | 2h | **P0** |
| 2 | Regime schema standardized | **YES** | CEO deploys schema | 1h | **P0** |
| 6 | Funding rate type disambiguation | **YES** | All agents adopt terminology | 30min | **P0** |
| 5 | Paper trading >= 10 trades | **PARTIAL** | CPI may produce 2-3 trades | Market-dependent | **P1** |
| 3 | Backtester validates strategies | **NO** | Agent dormant, needs activation | 2-3 days | **P2** |
| 4 | Correlation monitoring | **NO** | Engineering work in Risk Officer | 1 week | **P3** |

**Realistic target**: Clear blockers 1, 2, 6 this week. Advance blocker 5 to 4-5/10.
**If achieved**: 3/6 cleared (vs 0/6 today). System grade improves to B+.

### Blocker-Clearing Action Items

**Monday March 10 (before CPI)**:
1. CEO: Deploy `knowledge/signal-schema.json` using draft from HB9 report → Clears Blocker 1
2. CEO: Deploy `knowledge/regime-schema.json` using draft from HB9 report → Clears Blocker 2
3. All agents: Adopt `predictedFundingRate` vs `lastSettledRate` terminology → Clears Blocker 6
4. Head of Trading: Pipeline dry-run to validate paper trade logging

**Tuesday-Friday (CPI and aftermath)**:
5. Paper trades from CPI event → Advances Blocker 5
6. CEO: Consider activating Backtester agent for FOMC week → Begins Blocker 3

---

## 10. Risk Framework Adjustments for CPI Week

### Volatility-Adjusted Sizing

CPI events typically produce 2-5x normal volatility. Adjustments:

| Parameter | Normal | CPI Week | Rationale |
|-----------|--------|----------|-----------|
| Position size | 0.5x recovery | **0.5x recovery** (unchanged) | Already conservative. No further reduction needed. |
| Stop distance | Strategy-standard | **1.5x strategy-standard** within first 4h of CPI | Whipsaw protection. CPI spike can hit stops before reversing. |
| Entry timing | Any candle close | **T+2h minimum** after CPI release | First 2 hours are noise. Wait for direction to establish. |
| Max positions | 2 | **1** during CPI event window (13:30-17:30 UTC) | Reduce exposure during peak volatility |
| Scan frequency | 4H | **1H** from Monday 08:00 UTC through Wednesday 00:00 UTC | Higher resolution for rapidly changing conditions |

### CPI Blackout Windows

| Window | Duration | Rule |
|--------|----------|------|
| Pre-CPI blackout | Tue 11:30-13:30 UTC (2h) | NO new entries. Existing stops widened 1.5x. |
| CPI observation | Tue 13:30-13:45 UTC (15m) | OBSERVE ONLY. No analysis, no alerts, just watch. |
| CPI analysis | Tue 13:45-15:30 UTC (1h45m) | Analysis and scenario classification. No entries yet. |
| Paper trade window | Tue 15:30+ UTC | Entries allowed. T+2h minimum from CPI release. |

### Kill Switch Proximity

| Metric | Current | CPI Worst Case | Buffer |
|--------|---------|----------------|--------|
| Equity | $154.93 | $147 (-5% daily limit) | $93 to HALT ($100) |
| Drawdown from peak | 40.6% | Already past 15% kill switch threshold | Kill switch was reset by CEO |
| Daily loss limit | 5% = $7.75 | Unlikely with 0.5x sizing and $29-$155 notional | Safe |
| Max single trade loss | 2% = $3.10 | Stop-loss enforced | Safe |

**Assessment**: Risk of hitting HALT ($100) this week is near zero with recovery-scaled position sizing. Maximum loss from a single paper trade: $1.55 (2% of equity). Even 5 consecutive losses = $7.75 (5% of equity). Account would be $147, still 47% above HALT.

---

## 11. FOMC Preview (March 18 — Next Week's Catalyst)

While FOMC is next week, markets will begin pricing it in on CPI day:

| CPI Result | FOMC Expectation | Market Behavior Mar 12-18 |
|------------|-----------------|---------------------------|
| Cool | Rate cut odds rise significantly | Risk-on continuation. Crypto rallies. |
| Hot | Rate hold/hike fears | Risk-off. Crypto sells further. |
| In-line | Status quo expectations | Sideways until FOMC statement. |

**Key FOMC data points to watch**:
- Fed funds futures pricing (CME FedWatch tool)
- 2-year Treasury yield reaction to CPI
- Dollar index (DXY) direction post-CPI

**FOMC prep should start Wednesday March 12** regardless of CPI outcome. Head of Research should produce a FOMC scenario analysis mirroring this CPI plan by Friday March 14.

---

## 12. Success Criteria for the Week

### Tier 1 — Minimum Viable Week (System Keeps Pace)
- [ ] CPI prep document finalized by Monday 12:00 UTC
- [ ] Pipeline dry-run completed Monday
- [ ] All agents deliver CPI-day assignments on schedule
- [ ] Post-CPI regime assessment produced within 4 hours

### Tier 2 — Good Week (System Improves)
- [ ] Signal schema deployed (Blocker 1 cleared)
- [ ] Regime schema deployed (Blocker 2 cleared)
- [ ] Funding rate terminology standardized (Blocker 6 cleared)
- [ ] 2+ paper trades logged through pipeline
- [ ] Paper trade count reaches 3-4/10

### Tier 3 — Great Week (System Advances Significantly)
- [ ] Paper trade count reaches 5+/10
- [ ] Backtester agent activated with first assignment
- [ ] FOMC scenario analysis delivered by Friday
- [ ] System grade improves from B to B+
- [ ] First strategy-driven paper trade shows positive P&L

### Failure Conditions (What Would Make This a Bad Week)
- CPI triggers a signal and the system isn't ready to log it → **Worst case. Months of research wasted.**
- Another manual trade violates risk framework → Same mistake as FLOW
- Agents deliver conflicting signals without HoR resolution → Data integrity failure
- No progress on autonomous mode blockers → Stagnation

---

## 13. Agent-Specific Assignments

### Head of Trading (iron-fox)
1. Finalize CPI prep doc Monday AM with consensus estimates
2. Increase scanner to 1H by Monday 08:00 UTC
3. Pipeline dry-run Monday 16:00 UTC
4. Execute CPI-day timeline (blackout, observation, decision point)
5. Log all paper trades using the standard format above

### Head of Research (jade-flint)
1. Monday morning brief with CPI consensus and scenario probabilities
2. CPI flash brief at T+15min (13:45 UTC Tuesday)
3. Scenario classification at T+1h (14:30 UTC Tuesday)
4. Post-CPI daily brief by 17:30 UTC Tuesday
5. Begin FOMC scenario analysis Wednesday

### Strategy Architect
1. Refresh watchlist technicals Monday 09:00 UTC
2. Update regime classification post-CPI
3. If any triggers fire, confirm entry parameters match playbook

### Scanner Monitor
1. Increase to 1H from Monday 08:00 UTC
2. Full scan at T+30min post-CPI (14:00 UTC Tuesday)
3. Return to 4H after CPI event window closes (Wed 00:00 UTC)

### On-Chain Analyst
1. Monday pre-CPI: whale accumulation update, exchange flow check
2. T+30min post-CPI: Are whales buying or selling the move?

### Sentiment Analyst
1. Monday: F&G update, funding rate refresh, long/short ratio check
2. Real-time during CPI: social sentiment pulse, funding rate shifts

### Risk Officer
1. Monday: Verify all risk-params.json thresholds
2. Monday: Confirm pipeline config for paper trading
3. CPI day: Monitor margin utilization if any trades opened

### Microstructure Analyst
1. Monday: Refresh order book depth maps for 8 priority pairs
2. Confirm execution feasibility at CPI-adjusted volumes

### Meta-Strategist (self)
1. Monday: System readiness final check
2. Tuesday 20:00 UTC: Post-CPI system performance review
3. Friday: Week review and FOMC prep coordination

---

## 14. What Would a $10B Quant Fund Do?

1. **They'd have automated CPI event handling.** When CPI drops, regime reclassification, strategy activation, and position sizing adjustments happen in milliseconds, not hours. Our 2-hour analysis window is glacial by institutional standards — but appropriate for our maturity level.

2. **They'd run 100+ paper trades before CPI, not 1.** Statistical validation requires sample size. Our 1/10 paper trade count means we're flying blind on execution quality. CPI week is our best chance to accelerate this.

3. **They'd have the schemas deployed weeks ago.** Signal and regime schemas are table stakes for systematic trading. We've been recommending these for 3 heartbeats. The drafts exist. Deployment is copy-paste.

4. **They'd separate alpha generation from execution.** Our agents generate strong signals. But the signal-to-execution pipeline is the bottleneck. A quant fund would never let A-grade research sit unused because the execution infrastructure wasn't tested.

5. **They'd already be running delta-neutral FRC.** With TAO at -147% annualized funding, a delta-neutral carry (spot long + perp short) would be collecting ~$0.62/day on a $155 position with near-zero directional risk. This is the safest possible use of our capital while we wait for directional signals.

---

## Bottom Line

**This week's question**: Can the system convert A-grade intelligence into paper trades when a catalyst arrives?

The intelligence layer has been consistently A-grade for 3 heartbeats. The execution infrastructure is D-grade. CPI Tuesday is the test. If we can:
1. Deploy schemas Monday (30 minutes of CEO time)
2. Dry-run the pipeline Monday (1 hour of HoT time)
3. Log 2-3 paper trades Tuesday-Wednesday (market-dependent)

...then the system grade moves from B to B+, paper trades advance to 4-5/10, and we're on track for autonomous mode consideration by end of March.

If we don't — if CPI triggers signals and we watch them pass because the pipeline wasn't tested — then this is a research project, not a trading operation. And research projects don't compound at 4.1x per year.

**The schemas are the highest-ROI 30 minutes of work in this company's history. Deploy them Monday.**
