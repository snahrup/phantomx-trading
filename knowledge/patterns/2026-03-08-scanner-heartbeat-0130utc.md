# Scanner Heartbeat — 2026-03-08 01:30 UTC

## Connection Health
- Server: RESPONSIVE (localhost:3100)
- Phemex API: CONNECTED (mainnet)
- Rate limit: OK (2.5s delays)

## Active Position: PHA/USDT:USDT LONG

| Field | Value |
|-------|-------|
| Side | LONG |
| Size | 46,310 contracts |
| Entry | $0.034655 |
| Mark | $0.03460 |
| Last | $0.03463 |
| Liquidation | $0.03004 |
| Liq distance | -13.2% from mark |
| Leverage | 50x |
| Margin | $33.07 (cross) |
| uPnL | ~+$3.91 → declining |
| Funding | +0.01%/8h (longs pay) |

**Assessment**: Position entered during session gap. Currently near breakeven/slightly underwater. Liquidation buffer adequate at 13.2%. Cross margin puts full $228 account at risk. PHA OHLCV unavailable via API — limited technical analysis. WATCH level.

## Account
- Total equity: $228.58
- Free margin: $195.51
- Used margin: $33.07
- Down from $240.71 at last heartbeat (~-$12)

## Watchlist Scan (20 pairs, 4h x 50 candles)

### Market Regime: POST-SELLOFF RECOVERY (LOW VOLUME)
- 15/20 pairs UP trend, 2 RANGE, 3 DOWN
- Volume universally LOW (<0.6x avg on 18/20 pairs)
- HIGH_RANGE on ALL 20 pairs (13-41%) — elevated volatility persists
- **Verdict**: Relief rally on thin volume. Not yet a confirmed trend reversal.

### Top Movers (40h window)
| Pair | Change | Flags | Assessment |
|------|--------|-------|------------|
| NEAR | +9.67% | BIG_MOVE | Leading recovery, 41% range, UP trend |
| HYPE | +7.66% | BIG_MOVE | Strong bounce, vol declining |
| BTC | +1.77% | HIGH_RANGE | Moderate recovery, UP |
| ETH | +1.09% | HIGH_RANGE | Lagging BTC, vol declining |
| BNB | +0.98% | HIGH_RANGE | Stable, UP |

### Bottom Movers (40h window)
| Pair | Change | Flags | Assessment |
|------|--------|-------|------------|
| WIF | -14.31% | BIG_MOVE, NEAR_LOW | Severe weakness, 94% down in range |
| INJ | -9.51% | BIG_MOVE, NEAR_LOW | DOWN trend, weakest of all |
| DOT | -7.55% | BIG_MOVE | DOWN trend, near lows |
| SEI | -6.64% | BIG_MOVE | RANGE, grinding lower |
| DOGE | -4.36% | HIGH_RANGE | RANGE, not recovering |

### Momentum Alert
- **TAO**: 1.74x volume spike with -2.82% momentum — selling into an UP trend. Potential trend reversal risk.

## Funding Rate Signals

| Pair | Rate/8h | Annualized | Direction |
|------|---------|------------|-----------|
| **INJ** | -0.0597% | **-65%** | Shorts pay longs |
| **LINK** | -0.0356% | **-39%** | Shorts pay longs |
| **WIF** | -0.0360% | **-39%** | Shorts pay longs |
| BTC | +0.0076% | +8% | Neutral |
| PHA | +0.0100% | +11% | Neutral |
| NEAR | +0.0100% | +11% | Neutral |

### Funding Rate Carry (FRC v1.0) Candidates

**LINK/USDT**: STRONGEST candidate
- Funding: -0.036%/8h (-39% annualized)
- Trend: UP
- 40h change: -1.29% (mild pullback in uptrend)
- Volume: 0.99x (healthy, near average)
- FRC entry condition check: Need price > EMA(55) confirmation

**INJ/USDT**: HIGH RISK candidate
- Funding: -0.060%/8h (-65% annualized) — extreme
- BUT: DOWN trend, NEAR_LOW, -9.51% 40h
- Assessment: Funding extreme but price action bearish. FRC rules block entry (DOWN trend).

**WIF/USDT**: HIGH RISK candidate
- Funding: -0.036%/8h (-39% annualized)
- BUT: -14.31% 40h, near lows (94% down in range)
- Assessment: Extreme weakness overrides funding signal. FRC blocked.

## Extreme Fear Reversal (EFR v1.0) Candidates
- **WIF**: -14.31% 40h, near lows — potential EFR if RSI < 25 on 1h. Needs confirmation.
- **INJ**: -9.51%, NEAR_LOW — monitoring for capitulation volume.

## EMA Ribbon v2.1 Signals
- Broad recovery on low volume — no confirmed ribbon crossover signals at this scan.
- Would need higher-resolution data (1h EMAs) to detect ribbon compression/expansion.

## Alerts Summary

| Level | Count | Details |
|-------|-------|---------|
| WATCH | 1 | PHA long position — monitor breakeven proximity |
| INFO | 3 | LINK FRC candidate, WIF/INJ EFR potential |
| INFO | 1 | TAO volume spike with negative momentum |
| INFO | 1 | Market-wide low volume on recovery |

## Next Scan Actions
- Monitor PHA position mark price vs entry ($0.034655)
- Track LINK funding persistence for FRC entry
- Watch WIF/INJ for capitulation volume (EFR trigger)
- Confirm TAO selling pressure continues or resolves
- Volume uptick across board would confirm recovery → regime shift to RISK-ON
