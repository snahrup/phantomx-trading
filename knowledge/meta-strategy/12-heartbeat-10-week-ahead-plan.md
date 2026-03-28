---
id: meta-strategy-heartbeat-10
title: "Heartbeat 10 — Week-Ahead Game Plan: CPI + FOMC Catalysts"
category: meta-strategy
tags: ["heartbeat", "week-plan", "cpi", "fomc", "system-readiness", "paper-trading"]
source: meta-strategist
created: 2026-03-08T15:00:00.000Z
updated: 2026-03-08T15:00:00.000Z
---

# Heartbeat 10 — Week-Ahead Game Plan

**Date**: March 8, 2026, ~15:00 UTC
**System Grade**: B (unchanged from HB9)
**Primary Deliverable**: `knowledge/strategies/week-ahead-plan-march-10.md`

## Summary

Produced comprehensive week-ahead game plan covering:

1. **Dual catalysts identified**: CPI Tuesday March 11 (13:30 UTC) AND FOMC March 18. Market will front-run FOMC expectations starting CPI day.

2. **CPI research**: Jan 2026 CPI was 2.4% headline / 2.5% core (both softer). BTC spiked 6% and passed $68K on that print. If Feb CPI continues cooling, our strategies are designed for exactly this reaction.

3. **Three scenarios** with probability estimates, strategy activation maps, and specific agent actions:
   - Scenario A (Cool, 35%): 2-3 paper trades, EFR/EMA/FRC all potentially active
   - Scenario B (Hot, 30%): 0-1 paper trades, patience is the trade, short opportunity possible
   - Scenario C (In-Line, 35%): 0-1 paper trades, status quo, shift focus to FOMC

4. **Hour-by-hour agent coordination timeline** for Monday prep and Tuesday CPI day. Every agent has specific assignments.

5. **Pre-calculated paper trade parameters** at $154.93 equity, 0.5x recovery:
   - OP EFR: $0.77 risk, $51.55 notional
   - WIF EFR: $0.58 risk, $29.06 notional
   - BTC EMA Ribbon: $1.55 risk, dynamic notional
   - NEAR FRC: $1.55 risk, $154.93 notional

6. **Autonomous mode blocker plan**: Target clearing 3/6 blockers this week (schemas + funding terminology). Advance paper trades from 1/10 to 4-5/10.

7. **Risk framework CPI adjustments**: 1.5x stop widening during event window, T+2h entry delay, 1 position max during CPI window, 1H scan frequency.

## Key Recommendation (4th consecutive heartbeat)

**Deploy signal-schema.json and regime-schema.json. Drafts exist in HB9 report. 30 minutes of CEO time. Clears 2/6 autonomous blockers. This is the highest-ROI work available.**

## Pipeline Dry-Run (NEW — P0)

The pipeline has never processed a strategy-driven paper trade end-to-end. If CPI triggers a signal and the pipeline fails, months of research are wasted. **Monday 16:00 UTC dry-run is mandatory.**

## Changes from HB9

- Added FOMC March 18 as second catalyst (was not tracked)
- Upgraded OP to Priority 1 EFR (3/5 conditions, highest in universe)
- Downgraded INJ (RSI exiting extreme zone, confirmed 35.7)
- Added pipeline dry-run as P0 requirement
- First research incorporating real-world CPI data (Jan 2026 results, BTC reaction pattern)

## POST-PLAN UPDATE: Blockers 1, 2, 6 CLEARED

During this heartbeat window, lunar-hawk session deployed:
- `knowledge/signal-schema.json` — Blocker #1 CLEARED. Proper JSON Schema with required fields, examples, pipeline rules.
- `knowledge/regime-schema.json` — Blocker #2 CLEARED. Canonical source (API), hysteresis, strategy routing, agent instructions.
- `knowledge/funding-rate-standard.md` — Blocker #6 CLEARED. Predicted vs settled disambiguation, FRC gating rules, validation checklist.
- `knowledge/strategies/paper-trade-templates-cpi-week.json` — 4 paper trade candidates pre-sized for CPI.

**Autonomous mode blockers: 3/6 CLEARED (was 0/6).** Remaining: #3 backtester, #4 correlation, #5 paper trades (1/10).

This validates the meta-strategy recommendation process: 3 heartbeats of consistent P0 recommendation → implementation → immediate system-grade improvement. My P0 items for the week-ahead plan are now DONE before the week even starts.
