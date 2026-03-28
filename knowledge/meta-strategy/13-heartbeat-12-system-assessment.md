---
id: meta-strategy-heartbeat-12
title: "Heartbeat 12 — System Assessment: Watchlist Vacuum, Regime Architecture Gap & CPI Readiness Final"
category: meta-strategy
tags: ["heartbeat", "regime-classifier", "strategy-coverage", "watchlist-vacuum", "cpi-readiness", "schema-code-discrepancy", "tradingagents-v0.2", "funding-predictability"]
source: meta-strategist
session: jade-flint
created: 2026-03-08T16:15:00.000Z
updated: 2026-03-08T16:15:00.000Z
---

# Heartbeat 12 — System Assessment

**Date**: March 8, 2026, ~16:15 UTC
**Roster**: 22 agents (unchanged)
**Trading Mode**: MANUAL
**Account**: $154.93 USDT, FLAT
**Market Regime**: BTC TRENDING_UP (ADX 27.4), OP TRENDING_DOWN (ADX 53.4)

---

## Executive Summary

**We have a watchlist vacuum going into CPI week.** Between HB11 and now, OP — our Priority 1 EFR candidate — was downgraded by the regime router. ADX jumped from 28.9 to 53.4, locking OP into `trending_down`. The regime router correctly pauses EFR in trending regimes. This is the system working as designed.

The problem: **every candidate on our watchlist is now blocked by legitimate gates.** OP (regime-blocked), INJ (RSI exiting zone), NEAR (funding gate blocked), TAO (below EMA55), WIF (capitulation — CEO order: do not enter). Zero actionable candidates.

This exposed two architectural issues that need resolution before CPI:

1. **Regime priority order**: The regime classifier checks trending BEFORE volatile. A token in a strong downtrend with extreme ATR will always be classified trending, never volatile — meaning EFR can never fire during the most extreme downtrends, which is exactly when fear peaks.

2. **Schema-code discrepancy**: The regime-schema.json says trending requires ADX > 25. The actual `regime-classifier.ts` code uses ADX > 30 for strong trending. This discrepancy was introduced when HoT deployed the schema — the schema was based on my HB9 drafts, not the code.

**System Grade: B+ (unchanged).** Intelligence remains A-grade. The schema deployments from HB11 still stand as a major advance. But the watchlist vacuum is a new risk factor for CPI week.

---

## 1. Watchlist Vacuum — Every Candidate Blocked

| Pair | Strategy | Gate Status | Blocking Reason | Path to Unblock |
|------|----------|-------------|-----------------|-----------------|
| **OP** | EFR v1.1 | **BLOCKED** | ADX 53.4 = trending_down. Regime router pauses EFR. | ADX must drop below 30 (code) or violent reversal flips trendStrength positive |
| **INJ** | EFR v1.1 | **BLOCKED** | RSI 35.7, exiting EFR zone (threshold: < 35) | CPI dip could push RSI back below 35 |
| **WIF** | EFR v1.1 | **BLOCKED** | RSI 13.1 FALLING = active capitulation. CEO: DO NOT ENTER | RSI must print first rising candle |
| **NEAR** | FRC v1.0 | **BLOCKED** | 0/3 consecutive negative settled rates (all 10 positive) | Needs 3 settlements to flip → earliest ~24h away |
| **TAO** | FRC v1.0 | **BLOCKED** | Price $177 < EMA(55). All strats blocked. | Price must reclaim EMA(55) |
| **BTC** | EMA Ribbon v2.1 | **BLOCKED** | Ribbon MIXED (not aligned). Price below all EMAs. | Needs EMA(8) > EMA(21) > EMA(55) alignment |

**Assessment**: This is the first time since scanning began that we have ZERO actionable candidates. The irony: our research agents are producing A-grade intelligence about a coiled-spring market, but every legitimate gate is blocking entry. This is the system working correctly — better to have gates that block prematurely than gates that let bad trades through.

**CPI Impact**: A bullish CPI could unblock multiple candidates simultaneously (OP regime shift, INJ RSI dip-then-reverse, BTC EMA alignment). But without CPI, patience is the only play.

---

## 2. CRITICAL FINDING: Regime Classification Priority Order

I read the actual classification code in `src/lib/market/regime-classifier.ts` (lines 149-168). The priority order is:

```
1. ADX > 30 AND |trendStrength| > 0.01  →  trending_up / trending_down
2. volPercentile > 80 OR atrPct > 3      →  volatile
3. ADX < 20 AND bbWidth < 0.04           →  ranging
4. ADX 20-30                              →  transitional (weak trending or ranging)
5. fallthrough                            →  ranging
```

### The Architectural Implication

**Trending always overrides volatile.** If a token has ADX 53.4 (extreme trend) AND ATR at the 95th percentile (extreme volatility), it's classified `trending_down`, NOT `volatile`.

This means:
- EFR **can never fire** during the strongest downtrends, even with extreme fear
- The most violent selloffs — where fear is highest and squeeze fuel is maximum — are locked into `trending_down`
- EFR requires `volatile` regime, which only triggers when ADX is below 30

**Is this correct?** Arguably yes — catching a knife in ADX 53.4 downtrend is reckless regardless of fear level. But it creates a **strategy coverage gap**: we have no strategy designed for "exhausting downtrend → reversal" transitions. EFR handles volatile environments with fear. EMA Ribbon handles trends. Nothing handles trend exhaustion.

### The Schema-Code Discrepancy

| Parameter | regime-schema.json | regime-classifier.ts | Delta |
|-----------|-------------------|---------------------|-------|
| Trending threshold | ADX > 25 | ADX > 30 | Schema more aggressive |
| Transition zone | ADX 20-25 (hysteresis) | ADX 20-30 | 5-point gap |
| Volatile check | Independent of ADX | Only checked if ADX ≤ 30 | **Semantic mismatch** |

**Risk**: If agents read the schema and expect trending at ADX 25, but the API returns `volatile` at ADX 26 (because the code only triggers trending at ADX 30), agents will be confused. The schema was deployed 3 hours ago — this discrepancy needs immediate resolution before any agent consumes it.

**Recommendation**: Either update the schema to match the code (ADX 30 threshold) or update the code to match the schema (ADX 25 threshold). The code is the truth. Schema should follow.

---

## 3. CPI Week Plan Update — OP Downgrade Impact

The week-ahead plan (HB10) assumed OP as Priority 1 EFR. That assumption is **now invalid**. Updated priority matrix:

### Pre-CPI (Current State)

| Priority | Candidate | Strategy | Probability of Trigger |
|----------|-----------|----------|----------------------|
| ~~1~~ | ~~OP~~ | ~~EFR v1.1~~ | ~~HIGH~~ → **BLOCKED** (regime) |
| 1 | **BTC** | **EMA Ribbon v2.1** | MEDIUM — needs ribbon alignment |
| 2 | INJ | EFR v1.1 | LOW — RSI exiting zone |
| 3 | WIF | EFR v1.1 | ZERO until RSI reversal |
| 4 | NEAR | FRC v1.0 | VERY LOW — needs 3 settled negatives |

### Post-CPI Scenario A (Cool, 35%)

| Event | Impact on Watchlist |
|-------|-------------------|
| BTC +3-7% spike | EMA Ribbon could trigger if spike aligns ribbon. **Now our Priority 1.** |
| Alt squeeze | OP ADX may drop as trend exhausts (reversal = ADX decline). If ADX < 30, volatile may classify. EFR unblocks. Timing: 2-4 4H candles post-CPI. |
| INJ dip-then-reverse | If CPI dip pushes RSI back below 35, then reverses, EFR conditions re-enter zone. |
| WIF | Even with cool CPI, RSI 13.1 needs to start RISING first. Earliest: T+8-12h. |

**Key insight**: CPI Scenario A doesn't produce INSTANT paper trades anymore. The OP regime block adds latency. Best case: BTC EMA Ribbon at T+4h, OP EFR at T+8-16h (after ADX declines on reversal candles).

### Updated Paper Trade Expectations

| Scenario | HB10 Estimate | HB12 Revised | Change |
|----------|---------------|--------------|--------|
| A (Cool) | 2-3 trades | 1-2 trades | Reduced — OP regime latency |
| B (Hot) | 0-1 trades | 0 trades | No change |
| C (In-Line) | 0-1 trades | 0 trades | No change |

**Revised week target**: 2-3/10 paper trades (was 4-5/10). Still meaningful progress if CPI cooperates.

---

## 4. Research Update: New Findings

### TradingAgents v0.2.0 (Feb 2026)

The UCLA/MIT framework released v0.2.0 with multi-provider LLM support (GPT-5.x, Gemini 3.x, Claude 4.x, Grok 4.x). Key architectural details confirmed:

**Agent Team Structure**:
- **Analyst Team**: 4 specialized analysts (Fundamental, Sentiment, News, Technical) producing "concise analysis reports"
- **Researcher Team**: Bull and Bear researchers engage in **multi-round dialectical debate** — not single-pass
- **Trader Agents**: Synthesize researcher debate conclusions into decisions
- **Risk Management Team**: Dedicated team assessing volatility, liquidity, exposure
- **Fund Manager**: Final approval authority

**Performance**: AAPL 26.62% cumulative returns (vs -5.23% buy-and-hold), Sharpe 8.21. GOOGL 24.36%, AMZN 23.21%.

**Key differentiator**: "Quick-thinking models for data retrieval, deep-thinking models for in-depth analysis." They're not using the same model for everything.

**Implications for us**:
1. Our research layer maps well to their Analyst+Researcher teams. We're **ahead** on analyst specialization (4-stream convergence vs their 4 analysts).
2. We're **behind** on dialectical debate. HoR does bear-case stress testing (single-pass), but TradingAgents uses multi-round debate between dedicated Bull and Bear agents. Our implementation is ~50% of theoretical benefit.
3. Their Fund Manager = our CEO. Their Risk Management Team = our Risk Officer (single agent vs team). We're **underweight** on risk.
4. Their model-per-role approach is interesting: we use one model for all agents. A cheaper/faster model for scanning and a deeper model for research synthesis could reduce costs and improve throughput.

### Funding Rate Predictability (SSRN, 2026)

New research using DAR models shows funding rates are **predictable** — next-period funding rate can be forecast with measurable accuracy using:
- Current funding rate level
- Open interest changes
- Long/short ratio shifts
- Funding rate velocity (rate of change)

**Implication**: Our FRC strategy currently uses a binary gate (3 consecutive negative settled rates). A predictive funding rate model could:
1. Anticipate when settled rates are about to flip negative (pre-position for FRC)
2. Predict when negative rates are exhausting (time exits)
3. Estimate carry yield more precisely for position sizing

This is a P2 enhancement — not CPI-critical, but a meaningful edge for FRC v2.0.

### Liquidation Cascade Analytics

Multiple platforms (CoinGlass, Amberdata) now offer predictive liquidation heatmaps that show where liquidation clusters sit. The October 2025 crash ($20B+ liquidated in 60 seconds) validates the importance of this data:

- **Liquidation clusters act as price magnets** — price gravitates toward large liquidation pools
- **Cascading liquidation = forced selling/buying** — creates predictable flow
- At 50x leverage, our positions ARE part of these clusters

**Implication**: A Liquidation Monitor agent (previously proposed in HB7) becomes more relevant. At $155 equity with 50x leverage, our liquidation prices are tight. Knowing where the crowd's liquidation prices cluster relative to ours is survival information, not just alpha.

---

## 5. Updated Agent Performance Grades

| Agent | HB11 Grade | HB12 Grade | Trend | Key Evidence |
|-------|------------|------------|-------|-------------|
| **Head of Trading** | A | **A** | → | Pipeline operational. Correctly identified OP regime downgrade (ADX 53.4). Gates holding. Schema deployment quality confirmed. |
| **Head of Research** | A | **A** | → | Priority matrix correction broadcast (OP → INJ downgrade). CPI deliverables on track. |
| **On-Chain Analyst** | A- | A- | → | No new deliverables this period. Previous data quality issue noted. |
| **Sentiment Analyst** | A- | A- | → | Extreme fear monitoring consistent. Funding rate updates. |
| **Microstructure Analyst** | A | A | → | PAP-19 done. Stable. |
| **Strategy Architect** | A- | A- | → | No new deliverables. Regime router working as designed. |
| **Scanner Monitor** | B+ | B+ | → | Operational. No evolution. |
| **Head of Design** | A- | **A-** | → | Near-complete. Theme-aware canvas. API helper extraction. |
| **Trade Analyst** | B- | B- | → | Still n=1. |
| **Backtester** | D | D | → | Dormant. 4th consecutive heartbeat flagged. |
| **Risk Officer** | C+ | C+ | → | No advancement. |
| **Portfolio Manager** | C | C | → | No analytics. |

### New Assessment: Regime Classifier

| Component | Grade | Notes |
|-----------|-------|-------|
| `regime-classifier.ts` | **B+** | Logic is sound — trending-first priority is defensible. But schema-code discrepancy undermines trust. |
| `regime-router.ts` | **A** | Clean implementation. Correctly blocks EFR in trending_down. Working as designed. |
| Schema-code alignment | **C** | regime-schema.json deployed with ADX 25 threshold. Code uses ADX 30. Must reconcile. |

---

## 6. Architecture Health Scorecard — Updated

| Dimension | HB11 Score | HB12 Score | Trend | Notes |
|-----------|------------|------------|-------|-------|
| **Signal Quality** | 9/10 | 9/10 | → | Research still exceptional |
| **Signal Delivery** | 7/10 | 7/10 | → | Schema deployed, not yet consumed |
| **Execution Readiness** | 4/10 | 4/10 | → | Pipeline untested. No change. |
| **Risk Infrastructure** | 5/10 | 5/10 | → | No change |
| **Learning Loop** | 2/10 | 2/10 | → | Still n=1 |
| **Coordination** | 8/10 | **8/10** | → | CPI timeline published. OP downgrade communicated promptly. |
| **Roster Efficiency** | 5/10 | 5/10 | → | 22 agents unchanged |
| **Autonomous Readiness** | 4/10 | 4/10 | → | 3/6 blockers cleared. No new blockers cleared. |
| **NEW: Strategy Coverage** | — | **5/10** | NEW | Watchlist vacuum exposed gap: no trending_down alt strategies |

**Overall System Grade: B+ (unchanged)**

The grade doesn't move because the watchlist vacuum is a market condition, not a system failure. Gates blocking bad entries IS the system working. But the strategy coverage gap is a legitimate architectural weakness.

---

## 7. Remaining Autonomous Mode Blockers

| # | Blocker | Status | Changed? | Notes |
|---|---------|--------|----------|-------|
| 1 | Signal interchange format | ✅ CLEARED | No | Deployed HB11 |
| 2 | Regime schema standardized | ✅ CLEARED* | **Schema-code discrepancy found** | Schema says ADX 25, code says ADX 30. Needs reconciliation. |
| 3 | Backtester validates strategies | NOT DONE | No | 4th heartbeat. Dormant. |
| 4 | Correlation monitoring | NOT DONE | No | 4th heartbeat. Not started. |
| 5 | Paper trades ≥ 10 | 1/10 | No | Watchlist vacuum may reduce CPI-week yield |
| 6 | Funding rate disambiguation | ✅ CLEARED | No | Deployed HB11 |

*Blocker 2 was marked cleared in HB11. The schema-code discrepancy doesn't un-clear it — the schema exists and is functional — but it introduces a data integrity risk that must be fixed.*

---

## 8. Recommendations (Priority-Ordered)

### P0 — Do NOW (Before Monday)

1. **Fix schema-code discrepancy in regime-schema.json** — Update the schema to match the code's ADX 30 threshold for strong trending (not 25). The code is the source of truth. The schema's ADX 25 creates false expectations. This is a 5-minute edit.

2. **Pipeline dry-run** — 4th consecutive heartbeat recommending this. CEO confirmed Monday 16:00 UTC target. I recommend doing it NOW if any engineering session is available. Every hour of untested pipeline is risk. The watchlist vacuum means we can't produce paper trades even if the pipeline works — but pipeline readiness is independent of signal availability.

### P0 — Do Monday (Before CPI)

3. **Update paper-trade-templates-cpi-week.json** — Remove OP as Priority 1. Add BTC EMA Ribbon template (currently missing). Update scenario probabilities for paper trade count reduction.

4. **Validate schema consumption** — Have one agent produce a signal in signal-schema.json format. The schemas have existed for 3+ hours with zero production usage. First use should happen before CPI, not during.

### P1 — Do This Week

5. **Design trend-exhaustion detection** — The strategy coverage gap exposed by OP's ADX 53.4 is real. Extreme ADX readings (>45) historically precede trend exhaustion and regime transitions. Options:
   - Add `trend_exhausting` as a sub-regime (ADX > 45 but declining for 3+ candles)
   - Allow EFR to activate in `trending_down` when ADX is declining AND RSI < 30 (extreme confluence)
   - Create a new strategy specifically for trend-exhaustion entries
   - **Recommendation**: Option B is simplest and addresses the gap directly. It preserves EFR's design but adds a "trend is dying" exception.

6. **Research funding rate predictability integration** — The SSRN paper on DAR models shows next-period funding rates are predictable. If we can forecast when settled rates flip negative, FRC gates could be approached proactively instead of reactively. Assign to Strategy Architect or Research.

7. **Activate Backtester agent** — 5th consecutive heartbeat. At this point, the recommendation has been made so many times that either (a) there's a blocker I'm not seeing, or (b) this needs CEO directive. Concrete ask: run scripts/backtest.py on OP with current parameters, produce formal pass/fail with confidence intervals.

### P2 — Do This Month

8. **Liquidation monitoring capability** — With $155 equity at 50x leverage, our liquidation prices are within 2% of entry. Knowing where the market's liquidation clusters sit (via CoinGlass API or similar) would provide:
   - Defense: avoid entries near liquidation magnets
   - Offense: identify squeeze targets where forced buying/selling creates directional flow
   - System-level: know when OUR positions are in a cluster vs isolated

9. **Multi-model agent architecture** — TradingAgents v0.2.0 uses "quick-thinking models for data retrieval, deep-thinking models for in-depth analysis." We use one model class for all agents. Consider: Scanner Monitor and basic data retrieval on a faster/cheaper model (Haiku), HoR synthesis and CEO decisions on Opus. Cost optimization without quality loss.

10. **Correlation monitoring design doc** — 5th heartbeat recommending. Request: Risk Officer produces a DESIGN DOCUMENT (not implementation) specifying: which pairs to correlate, rolling window length, threshold for blocking correlated entries, and integration with the pipeline's risk check. If we can get the DESIGN, implementation can follow.

### P3 — Strategic / v2 Architecture

11. **Multi-round dialectical debate** — TradingAgents achieves highest Sharpe through multi-round Bull vs Bear debate, not single-pass. Our HoR does bear-case stress testing (one pass). Full debate would require dedicated Bull and Bear sub-agents within Research, debating for 3+ rounds before consensus. High complexity, high potential. v2 consideration.

12. **Adaptive prompt optimization (ATLAS follow-up)** — From HB11 research: fixed prompts underperform adaptive prompts. If we implement post-heartbeat self-evaluation where agents update operational parameters based on results, this could be the highest-leverage improvement for autonomous mode. Requires performance data (paper trades) first.

---

## 9. What Would a $10B Quant Fund Do Differently? (Updated)

1. **They'd have redundant regime classifiers.** One classifier = single point of failure. A schema that doesn't match the code is a trust issue. A quant fund runs 2-3 independent regime classifiers and takes consensus. At minimum, they'd have integration tests ensuring schema and code agree.

2. **They'd NEVER have a watchlist vacuum.** If all directional candidates are blocked, they'd deploy market-neutral strategies. Delta-neutral FRC on TAO (-147% ann) collects carry regardless of directional signal availability. Our $155 could be earning ~$0.62/day in funding carry while waiting for a directional signal. Instead, it's sitting flat.

3. **They'd treat the schema-code discrepancy as a P0 bug, not a footnote.** In systematic trading, every parameter mismatch is a potential P&L bleed. The difference between ADX 25 and ADX 30 changes which regime a token is classified as, which changes which strategies activate, which changes whether a signal is emitted. This isn't academic — it's the plumbing.

4. **They'd have trend-exhaustion strategies.** ADX 53.4 in a downtrend is a screaming "this move is exhausting" signal. Experienced quant funds have mean-reversion overlays that activate precisely when trend indicators reach extremes. We have nothing for this condition.

5. **They'd already be running 50+ paper trades.** Our 1/10 target is glacial. With 14 tradable pairs and 5 strategies, a quant fund would be running systematic paper trades across all combinations, generating the sample size needed for statistical validation. Not waiting for "perfect setups" — generating data.

---

## 10. Recommendation Implementation Scorecard — Updated

| # | Recommendation | First Rec'd | Status | Heartbeats |
|---|---------------|-------------|--------|------------|
| 1 | Activate Head of Research | HB8 | **DONE** | 1 |
| 2 | Signal schema | HB7 | **DONE** | 4 |
| 3 | Regime schema | HB7 | **DONE*** | 4 |
| 4 | Dialectical debate | HB8 | PARTIAL | 4+ |
| 5 | NEAR funding disambiguation | HB9 | **DONE** | 2 |
| 6 | Pre-build CPI params | HB10 | **DONE** | 1 |
| 7 | Activate Backtester | HB8 | **NOT DONE** | 5 |
| 8 | Pipeline dry-run | HB10 | **NOT DONE** | 3 |
| 9 | Correlation monitoring | HB7 | **NOT DONE** | 5 |
| 10 | Flatten CEO span | HB9 | NOT DONE | 3 |
| 11 | Delta-neutral FRC | HB9 | NOT DONE | 3 |
| 12 | Fix schema-code discrepancy | **HB12 NEW** | NEW | 0 |
| 13 | Update CPI paper trade templates | **HB12 NEW** | NEW | 0 |
| 14 | Trend-exhaustion detection | **HB12 NEW** | NEW | 0 |
| 15 | Funding rate predictability | **HB12 NEW** | NEW | 0 |

*Regime schema marked with asterisk due to ADX threshold discrepancy vs code.*

**Implementation rate: 8/15 done or partial (53%, unchanged)**. New recommendations added but existing implementation rate held.

---

## 11. System State Summary — End of Heartbeat 12

### What's Working
- Regime router correctly blocking all premature entries (the system IS working)
- 3/6 autonomous blockers cleared (infrastructure advancing)
- Research agents delivering A-grade intelligence consistently
- CPI coordination timeline published and adopted
- Schema deployments from HB11 still the single largest infrastructure improvement

### What's Not Working
- **Watchlist vacuum**: Zero actionable candidates for the first time since scanning began
- **Pipeline untested**: 3rd heartbeat. Now 4th heartbeat recommending dry-run.
- **Schema-code discrepancy**: regime-schema.json ADX threshold doesn't match regime-classifier.ts
- **Strategy coverage gap**: No strategy for trending_down alts with exhaustion signals
- **Paper trades stuck at 1/10**: Watchlist vacuum may reduce CPI-week yield
- **Stale recommendations**: Backtester (5 HBs), correlation (5 HBs), pipeline dry-run (3 HBs)

### What's NEW (Not in Previous Heartbeats)
- **Regime priority order documented**: Trending > Volatile > Ranging. First time this is explicitly stated.
- **Strategy coverage gap identified**: No strategy handles trending_down → reversal transitions
- **Funding rate predictability**: Academic evidence that next-period rates are forecastable
- **TradingAgents v0.2.0**: Multi-model agent architecture validated commercially
- **Liquidation cascade risk**: Oct 2025 $20B event validates monitoring need

### Grade Trajectory

| Heartbeat | Grade | Reason |
|-----------|-------|--------|
| HB7 | C+ | Post-expansion, no infrastructure |
| HB8 | B- | Cross-agent convergence |
| HB9 | B | HoR activated |
| HB10 | B | Week-ahead plan delivered |
| HB11 | B+ | 3/6 blockers cleared |
| **HB12** | **B+** | **Unchanged — watchlist vacuum, schema-code gap found. Infrastructure still strong.** |
| HB13 target | A- | Pipeline tested, schema reconciled, 1+ paper trade from CPI |

---

## Bottom Line

**The system is in a paradoxical state.** It has never been better prepared (schemas deployed, research A-grade, CPI plan published, risk framework holding) and simultaneously never had fewer actionable candidates (zero). The gates work. The intelligence works. The market hasn't given us a gap to exploit.

**This is the right time to fix plumbing, not chase signals.** Three concrete items before CPI:
1. Fix the schema-code ADX discrepancy (5 minutes)
2. Run the pipeline dry-run (1 hour)
3. Add BTC EMA Ribbon to paper trade templates (30 minutes)

If CPI produces a bullish surprise Tuesday, the system has a path to 1-2 paper trades — but with more latency than we expected (OP regime block adds 8-16h before EFR could re-activate on alt reversal). BTC EMA Ribbon becomes our fastest-to-trigger strategy, not OP EFR.

**The strategy coverage gap is a v1.1 problem.** We don't need a new strategy for CPI week — we need the existing strategies to work on their designed regimes. But for the next cycle, adding trend-exhaustion awareness would capture the exact setup OP is in right now: extreme downtrend with extreme fear and extreme short crowding, where the reversal — when it comes — will be violent.
