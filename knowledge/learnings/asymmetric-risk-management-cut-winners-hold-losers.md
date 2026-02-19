---
id: kb-1771014742990-m7p5
title: Asymmetric Risk Management — Cut Winners, Hold Losers
category: learnings
tags: ["asymmetric-risk", "cutting-winners", "holding-losers", "risk-management"]
source: ai
created: 2026-02-13T20:32:22.990Z
updated: 2026-02-13T20:32:22.990Z
---
**Pattern:** asymmetric-risk
**Evidence:** Documented 'cutting-winners' pattern (closing profits on first pullback) combined with new 'holding-losers' pattern (19 consecutive holds during GUN waterfall). This creates negative expectancy — small wins, large losses.
**Impact:** Even with a >50% win rate, this asymmetry guarantees net losses over time. The average winner is smaller than the average loser.
**Recommendation:** Flip the script: use trailing stops on winners (let them run) and hard time-based stops on losers (3 ticks of no reversal = exit). The goal is big winners and small losers, not the reverse.
