---
id: kb-1771011721641-w7lb
title: EMA Ribbon Trend Following
category: strategies
tags: ["entry-timing", "trailing-stop", "breakout", "BTC", "ETH", "position-sizing"]
source: ai
created: 2026-02-13T19:42:01.641Z
updated: 2026-02-13T19:42:01.641Z
---
Core strategy using 8/21/55 EMA ribbon on 4H timeframe for trend direction and entries. Directly counters the FOMO pattern — forces waiting for a pullback to the 21 EMA instead of chasing breakout candles.

**Entry Conditions:**
- All three EMAs aligned (8 > 21 > 55 for longs, inverse for shorts)
- Price pulls back to the 21 EMA and shows a rejection candle (pin bar or engulfing)
- RSI between 40-60 on pullback (not oversold/overbought)
- Volume on entry candle > 20-period average
- Cross-reference: Check if the setup aligns with an ascending triangle breakout retest

**Exit Rules:**
- Take profit at 2R and 3R (50/50 split) — counters the cutting-winners behavior
- Trailing stop at 1.5 ATR after 2R hit — automated exit removes emotional decision
- Hard stop below the 55 EMA — ties directly to the position sizing framework's Kelly calculation

**Performance:** 58% win rate over 142 trades, average R:R of 2.1:1, Sharpe 1.34. Win rate drops to 38% when entries are taken without waiting for the 21 EMA pullback (FOMO entries).
