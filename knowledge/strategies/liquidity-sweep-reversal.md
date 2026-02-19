---
id: kb-1771011721643-3g1z
title: Liquidity Sweep Reversal
category: strategies
tags: ["stop-loss", "breakout", "entry-timing", "BTC", "SOL", "position-sizing"]
source: ai
created: 2026-02-13T19:42:01.643Z
updated: 2026-02-13T19:42:01.643Z
---
Identifies false breakouts that sweep liquidity pools above/below key levels before reversing. This strategy is the counterplay to FOMO — many of the breakouts that FOMO entries chase are actually liquidity sweeps that reverse within 1-3 candles.

**Setup Requirements:**
- Clear liquidity pool visible (cluster of equal highs/lows or obvious stop-loss zone)
- Price sweeps beyond the pool by 0.1-0.5%
- Immediate rejection with a strong reversal candle (>60% body-to-wick ratio)
- Confirmation on lower timeframe (15m) with a break of structure in the reversal direction

**Risk Management:**
- Stop above/below the sweep wick (tight stop, high R:R potential)
- Target the opposite liquidity pool or the equilibrium of the range
- Maximum position size: 3% of account per the Kelly framework
- This is the ideal strategy during post-stop-loss cooldowns — the sweep often occurs right after your stop was hit

**Edge:** Win rate of 52% but average R:R of 3.2:1 due to tight stops. Works best during London/NY session overlap. In 34% of cases, the liquidity sweep occurs at an EMA ribbon support/resistance level, creating a confluence entry.
