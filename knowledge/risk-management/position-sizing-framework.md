---
id: kb-1771011721650-5awb
title: Position Sizing Framework
category: risk-management
tags: ["position-sizing", "stop-loss", "trailing-stop", "drawdown", "entry-timing"]
source: ai
created: 2026-02-13T19:42:01.650Z
updated: 2026-02-13T19:42:01.650Z
---
**Framework:** Modified Kelly Criterion with volatility adjustment. This framework is the mathematical backbone behind every strategy's entry size and exit placement.

**Base Formula:**
- Kelly % = (Win Rate x Avg Win) - ((1 - Win Rate) x Avg Loss) / Avg Win
- Applied Kelly = Kelly % x 0.5 (half-Kelly for safety)
- Volatility Adjustment: Multiply by (20 / Current ATR%) to reduce size in high-vol environments

**Current Parameters (from EMA Ribbon performance data):**
- Win Rate: 56%
- Avg Win: 2.1R
- Avg Loss: 1.0R
- Half-Kelly: 8.4% of account per trade
- With current ATR adjustment: 5.2% effective max position

**Hard Limits (enforced by Sentinel Agent):**
- Never exceed 10% of account on a single position
- Maximum 3 correlated positions (e.g., BTC + ETH + SOL all long counts as 3)
- Daily loss limit: 5% of account → mandatory cooldown until next session
- Revenge trading override: After any stop-loss, next position capped at 1x original size

**Connection to Behavioral Learnings:**
- Revenge trading pattern violates the sizing caps → automatic block
- FOMO entries at extended prices require 50% size reduction per this framework
- Overtrading in low-vol regimes: reduce to 2 trades/day with 2.5:1 minimum R:R
