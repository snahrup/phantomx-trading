---
title: Scanner Heartbeat - 2026-03-07
category: patterns
tags: ["heartbeat", "FLOW", "PHA", "BTC", "risk-alert", "order-book"]
source: scanner-monitor
created: 2026-03-07T17:30:00Z
---

# Scanner Heartbeat Report — 2026-03-07 ~17:30 UTC

## Connection Health
- PhantomX server: ONLINE (port 3100)
- Phemex mainnet: CONNECTED, authenticated
- Engine status: STOPPED (manual mode)
- Kill switch: INACTIVE

## Account Summary
| Metric | Value |
|--------|-------|
| Total equity | $91.30 |
| Free margin | $5.61 |
| Used margin | $85.69 |
| Margin utilization | 93.8% |
| Open positions | 2 |
| Open orders | 0 |

## Position Monitor

### FLOW/USDT:USDT — LONG
| Field | Value |
|-------|-------|
| Size | 100,055.8 contracts |
| Entry | $0.040206 |
| Mark | $0.0419 |
| Liquidation | $0.0398 |
| Liq distance | 5.01% from mark |
| Leverage | 50x cross |
| Unrealized PnL | +$169.51 |
| Stop-loss orders | NONE |
| Take-profit orders | NONE |

### PHA/USDT:USDT — LONG
| Field | Value |
|-------|-------|
| Size | 1 contract |
| Entry | $0.03588 |
| Mark | $0.03589 |
| Liquidation | $0.00001 |
| Leverage | 50x cross |
| Unrealized PnL | ~$0.00 |
| Notes | Dust position, negligible risk |

## ALERTS

### ALERT: FLOW/USDT — No Protective Orders
No stop-loss or take-profit orders on a 100K+ contract LONG at 50x leverage. Liquidation at $0.0398 is only 5% below mark price. A single sharp wick could liquidate the position with zero protection. **Risk Officer: action required.**

### WATCH: Account Margin Utilization at 93.8%
Only $5.61 free margin. Any adverse move in FLOW reduces this further. No room for new positions or to absorb drawdown. Near margin call territory.

## Order Book Analysis — FLOW/USDT

### Bid Side (Support)
| Level | Size | Notes |
|-------|------|-------|
| $0.0418 | 2,392 | Thin — first line |
| $0.0415 | 38,220 | Moderate |
| $0.0413 | 237,811 | LARGE wall |
| $0.0409 | 237,562 | LARGE wall |
| $0.0407 | 354,344 | VERY LARGE |
| $0.0406 | 1,045,834 | MASSIVE wall (1.05M) |
| $0.0405 | 810,118 | MASSIVE (810K) |

Strong bid support cluster $0.0405-$0.0413 (~2.8M contracts total). Below $0.0405 there is a gap to $0.0386 (228K), then a desert down to $0.033.

### Ask Side (Resistance)
| Level | Size | Notes |
|-------|------|-------|
| $0.0420 | 10,966 | Moderate — immediate resistance |
| $0.0425 | 248,821 | LARGE wall |
| $0.0428 | 251,999 | LARGE |
| $0.0431 | 466,288 | VERY LARGE |
| $0.0432 | 618,790 | MASSIVE |
| $0.0433 | 1,485,985 | EXTREME wall (1.49M) |
| $0.0434 | 428,245 | VERY LARGE |

Massive ask cluster $0.0425-$0.0434 (~3.7M contracts). The $0.0433 wall (1.49M) is the ceiling. Breakout above $0.0434 requires enormous buying pressure.

### Imbalance Assessment
Ask side is heavier than bid side above/below equilibrium. Slight bearish lean — sellers have more resting liquidity. Price is range-bound $0.0405-$0.0433 until one side gets absorbed.

## Pattern Scan — FLOW/USDT

### 4H Price Action
- Prior downtrend: $0.0392 → $0.0332 (mid-Feb to Mar 4)
- Explosive rally: $0.0334 → $0.0443 (+32.6%) in ~24 hours
- Volume during spike: 3-5x normal (confirms breakout validity per strategy rules)
- Post-spike consolidation: oscillating $0.039-$0.044
- Volume declining on each subsequent bounce — bearish divergence signal

### Strategy Checks
| Strategy | Match? | Notes |
|----------|--------|-------|
| EMA Ribbon Trend | UNCLEAR | Rally broke structure; 8/21/55 likely aligned bullish but pullback from $0.0443 may have crossed 8 below 21. Need exact EMA computation. |
| Liquidity Sweep Reversal | POSSIBLE | The spike above prior range highs ($0.039-$0.040) to $0.0443 could be a liquidity sweep. If so, reversal target is $0.035 area — BAD for the LONG. Currently holding above $0.04 which argues against full sweep reversal. |
| Ascending Triangle | NO | No clear formation visible in recent data. |
| BTC Weekend Fade | N/A | Today is Friday. Monitor over weekend for BTC pump pattern. |

## Macro Context — BTC/USDT
- Last: $67,237
- 24h range: $66,881 — $68,513
- Flat, no directional bias. Neutral macro environment.

## Summary
- Pairs scanned: 3 (FLOW/USDT, PHA/USDT, BTC/USDT)
- Setups detected: 1 possible (FLOW liquidity sweep — monitor for reversal)
- Alerts fired: 1 ALERT (no stop-loss on FLOW), 1 WATCH (margin utilization)
- Recommended action: Set protective stop-loss on FLOW/USDT immediately. Consider taking partial profit to free margin.
