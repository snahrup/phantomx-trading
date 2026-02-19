---
id: kb-1771011721638-wrlq
title: Cutting Winners Too Early
category: learnings
tags: ["cutting-winners", "trailing-stop", "entry-timing", "SOL", "ETH"]
source: ai
created: 2026-02-13T19:42:01.638Z
updated: 2026-02-13T19:42:01.638Z
---
**Pattern:** Closing profitable positions at the first sign of a pullback candle, regardless of whether the broader trend structure (EMA ribbon alignment) remains intact.

**Evidence:** Analysis of 31 SOL/USDT and 18 ETH/USDT trades showed that positions closed at +0.8-1.2% frequently continued to move an additional 2-4% in the original direction. The trailing stop approach (1.5 ATR, as specified in the EMA Ribbon strategy exit rules) would have captured 68% more profit on average.

**Impact:** Over $3,100 in unrealized gains left on the table across the sample period. The psychological comfort of booking small wins created a consistently skewed R:R profile (average win 0.9R vs average loss 1.1R) — below the 2.1:1 target R:R of the position sizing framework.

**Recommendation:** Implement a trailing stop of 1.5 ATR on all positions that reach +1R. Do not manually close unless the trailing stop is hit or a higher-timeframe structure break is confirmed. Trust the EMA ribbon — if 8 > 21 > 55, the trend is intact.
