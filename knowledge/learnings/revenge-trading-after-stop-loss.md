---
id: kb-1771011721634-m3dm
title: Revenge Trading After Stop-Loss
category: learnings
tags: ["revenge-trading", "stop-loss", "position-sizing", "BTC", "drawdown"]
source: ai
created: 2026-02-13T19:42:01.634Z
updated: 2026-02-13T19:42:01.634Z
---
**Pattern:** Immediately re-entering a position within 15 minutes of a stop-loss hit, typically with 1.5-2x the original position size. Directly violates the position sizing framework and drawdown recovery protocol.

**Evidence:** Observed across 23 BTC/USDT trades over a 6-week window. Re-entry trades after stop-outs had a 74% loss rate vs. 48% for planned entries. Average loss on revenge trades was 2.3x the original stop-loss amount. In 8 cases, the revenge trade coincided with a liquidity sweep pattern that would have offered a better entry 20-40 minutes later.

**Impact:** Estimated $4,200 in unnecessary losses over the observation period. The compounding effect of larger position sizes on losing trades created a negative feedback loop that extended drawdown periods by an average of 3.2 days — repeatedly triggering the 5% drawdown threshold in the recovery protocol.

**Recommendation:** Enforce a mandatory 30-minute cooldown after any stop-loss event. During cooldown, require the AI to present a fresh technical analysis (EMA alignment, RSI state) before any new position can be opened. Size must not exceed the original position per the Kelly framework.
