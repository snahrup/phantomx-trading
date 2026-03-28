# Scanner Heartbeat — 2026-03-08 13:32 UTC

**Session**: wise-iris | **Agent**: Scanner Monitor | **Mode**: MANUAL

## Connection Health
- PhantomX server: RESPONSIVE (port 3100)
- Phemex API: RESPONSIVE, rate limits OK
- Positions: FLAT (0 open)
- Account: $154.93 USDT
- Kill switch: INACTIVE (CEO order: do not reset)

## Market Overview (20 pairs scanned)

| Metric | Value | Change |
|--------|-------|--------|
| BTC | $67,488 | +2.62% (40h) |
| ETH | $1,950 | +1.39% (40h) |
| BTC Regime | TRANSITION | ADX 23.8 (below 25) |
| ETH Regime | RANGING | ADX 19.7 |
| F&G Index | 12 | Extreme Fear (22+ days) |

### Big Movers (40h window)
| Pair | Change | Direction | Flags |
|------|--------|-----------|-------|
| NEAR | +14.85% | UP | BIG_MOVE, MOMENTUM |
| HYPE | +12.67% | RANGE | BIG_MOVE (low vol 0.36x) |
| WIF | -10.99% | UP | BIG_MOVE |
| INJ | -7.28% | DOWN | BIG_MOVE |
| SEI | -6.94% | DOWN | BIG_MOVE |
| DOT | -6.86% | DOWN | BIG_MOVE |

### Market Character
- Nearly ALL pairs MACD IMPROVING — broad momentum recovery signal
- ALL ribbons BEAR or MIXED — no bull structure yet
- Volume subdued across board (most 0.5-0.9x average)
- LINK only pair with vol > 1x (1.11x)

## EFR v1.1 Detailed Scan

### Priority 1: OP — EFR 3/5 (HIGHEST SCORE)
| Indicator | Value | EFR Condition | Status |
|-----------|-------|---------------|--------|
| RSI(14) | 33.9 | < 35 & rising | PASS (from 29.8) |
| RSI cross >30 | 29.8 → 33.9 | crosses_above 30 | **TRIGGERED** |
| MACD hist | -0.000785 | negative, improving | PASS |
| MACD hist >0 | negative | crosses_above 0 | NOT YET |
| EMA(8) vs EMA(21) | 0.1168 < 0.1201 | crosses_above | NOT YET |
| ADX | 28.9 | — | Strong downtrend (caution) |
| Funding | +10.9% ann | — | POSITIVE (no carry edge) |
| Price vs EMA(55) | -5.54% | — | Below |
- **Assessment**: RSI just crossed above 30 — first EFR entry condition met. Needs MACD histogram cross >0 and EMA(8) cross >EMA(21) for full trigger. **Closest to entry of any pair.** No funding carry — pure reversal play.

### Priority 2: WIF — EFR 2/5
| Indicator | Value | EFR Condition | Status |
|-----------|-------|---------------|--------|
| RSI(14) | 34.8 | < 35 & rising | PASS (from 31.8) |
| RSI cross >30 | was 31.8 | already above | — |
| MACD hist | -0.001890 | negative, improving | PASS |
| EMA(8) vs EMA(21) | 0.181 < 0.190 | — | NOT YET |
| ADX | 32.5 | — | STRONG downtrend (high failure risk) |
| Funding | -99bp/8h (-108% ann) | extreme | DEEP CARRY |
| Price vs EMA(55) | -9.38% | — | Far below |
- **Assessment**: RSI recovering but still below 35. MACD improving. ADX 32.5 = strong downtrend — reversals here fail more often. Extreme funding carry is the key edge. Watch for RSI cross >30 already happened, needs MACD and EMA cross.

### Priority 3: INJ — FADING
| Indicator | Value | Status |
|-----------|-------|--------|
| RSI(14) | 35.7 (rising from 33.8) | Exiting EFR zone (>35) |
| Funding | -26bp/8h (-28.8% ann) | Improved (was -84%) |
| ADX | 23.8 | Moderate |
| Price vs EMA(55) | -6.30% | Below |
- **Assessment**: RSI above 35, funding halved. Setup FADING. Lower priority.

### Full Alt Summary (sorted by RSI)
| Symbol | Tier | Price | RSI | Dir | ADX | EFR | FRC Gate | Status |
|--------|------|-------|-----|-----|-----|-----|----------|--------|
| OP | mid | $0.1157 | 33.9 | RISING | 28.9 | 3/5 | BLOCKED | SETUP FORMING |
| WIF | small | $0.1798 | 34.8 | RISING | 32.5 | 2/5 | BLOCKED | SETUP FORMING |
| INJ | small | $2.842 | 35.7 | RISING | 23.8 | 1/5 | BLOCKED | MONITOR |
| ARB | mid | $0.096 | 36.5 | RISING | 23.5 | 1/5 | BLOCKED | MONITOR |
| SEI | small | $0.0644 | 36.9 | RISING | 16.6 | 1/5 | BLOCKED | MONITOR |
| DOGE | mid | $0.0893 | 38.7 | RISING | 12.4 | 1/5 | BLOCKED | MONITOR |
| LINK | mid | $8.647 | 38.9 | RISING | 20.4 | 1/5 | BLOCKED | MONITOR |
| AVAX | mid | $8.908 | 39.5 | RISING | 18.1 | 1/5 | BLOCKED | MONITOR |

### Majors (BTC, ETH, SOL) — NOT IN EFR ZONE
| Symbol | RSI | ADX | Ribbon | EFR |
|--------|-----|-----|--------|-----|
| BTC | 39.3 RISING | 23.8 | MIXED | 2/5 (RSI too high) |
| ETH | 39.8 RISING | 19.7 | BEAR | 2/5 (RSI too high) |
| SOL | 39.4 RISING | 21.2 | BEAR | 2/5 (RSI too high) |

## FRC v1.0 Scan

### Funding Rate Summary (Current)
| Pair | Rate/8h | Annualized | 3x Neg | Price>EMA55 | FRC Status |
|------|---------|------------|--------|-------------|------------|
| TAO | -0.1289% | -141% | YES | NO (-2.35%) | **BLOCKED** |
| WIF | -0.0991% | -108% | YES* | NO (-9.38%) | **BLOCKED** |
| NEAR | -0.0376% | -41% | NO (just flipped) | YES (+2.09%) | **NOT TRIGGERED** |
| INJ | -0.0264% | -29% | YES | NO (-6.30%) | **BLOCKED** |
| DOT | +0.0092% | +10% | — | NO | NO CARRY |
| BTC | +0.0027% | +2.9% | — | — | NEUTRAL |

*WIF has 5 consecutive negative periods, but earlier history has a positive entry.

**NEAR Notable**: Only pair with FRC price gate PASS (price > EMA55). However, funding just flipped negative (was +0.01%/8h = +11% ann historically). NOT 3 consecutive negative. WATCH for next 2 funding snapshots.

**FRC Assessment**: All deep carry candidates (TAO, WIF, INJ) BLOCKED by price < EMA(55). Safety gate working correctly. No FRC entries available.

## EMA Ribbon v2.1 Scan

- BTC ADX 23.8 — 1.2 points from trend threshold (25). WATCH.
- BTC Ribbon MIXED (EMA8 < EMA21, but EMA21 approaching EMA55 from above). Not aligned for entry.
- No pair has bullish ribbon alignment (8 > 21 > 55).
- **Strategy PAUSED** — no trending regime detected.

## LSR v1.0 Scan

- ETH ADX 19.7 (< 20 = ranging) — best LSR candidate.
- Need to detect liquidity pools and sweeps. No automated sweep detection ran this heartbeat.
- **Watch list**: ETH for sweep-of-highs in ranging market.

## Key Changes Since Last Heartbeat (~05:00 UTC)

1. **OP RSI crossed above 30** (was 29.0, now 33.9) — EFR score jumped to 3/5. Highest EFR score of any pair.
2. **WIF RSI continued rising** (31.8 → 34.8) — approaching exit from setup zone.
3. **INJ RSI moved above 35** (28.5 → 35.7) — exiting EFR setup zone, carry halved.
4. **NEAR funding flipped negative** — was consistently +11% ann, now -41% ann. Price > EMA(55). Potential future FRC candidate.
5. **Broad MACD improvement** — 13/14 alts have improving MACD histogram. Momentum shifting across board.
6. **All ribbons still BEAR/MIXED** — no structural trend reversal yet despite improving momentum.

## Alerts

| Alert | Level | Details |
|-------|-------|---------|
| [EFR-v1.1] SETUP_FORMING — OP | **WATCH** | RSI 33.9 rising, 3/5 conditions. Mid-cap tier. No funding edge. |
| [EFR-v1.1] SETUP_FORMING — WIF | WATCH | RSI 34.8 rising, 2/5 conditions. Extreme funding -108% ann. |
| [FRC-v1.0] BLOCKED — ALL | INFO | TAO/WIF/INJ all below EMA(55). Safety gate holds. |
| [EMA-v2.1] PAUSED | INFO | BTC ADX 23.8, no trend confirmed. 1.2 pts from threshold. |
| [NEAR] FUNDING_FLIP | WATCH | Funding flipped from +11% to -41% ann. FRC candidate if 3x neg. |

## Next Actions
- Continue scanning at next 4H candle close
- Watch OP for MACD histogram cross above 0 and EMA(8) cross above EMA(21) — would complete EFR trigger
- Watch NEAR funding at next 2 snapshots (16:00, 00:00 UTC) for FRC consecutive negative check
- Watch BTC ADX approaching 25 — if it crosses, EMA Ribbon v2.1 reactivates
- Mode: MANUAL — all findings logged only, no execution alerts
