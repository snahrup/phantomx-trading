# Full Scanner Heartbeat — March 8, 2026 05:00 UTC

## Summary
- Symbols scanned: 20
- Total alerts: 20 (all HIGH_RANGE, 3 FRC opportunities, 2 FRC exits, 1 EMA paused)
- Entry signals: 0
- Setups forming: 0
- Portfolio: FLAT ($154.93, no positions)

## Regime Map

| Symbol | Price | 40h Chg | Trend | Vol Ratio | Flags | FRC Rate | FRC Ann |
|--------|-------|---------|-------|-----------|-------|----------|---------|
| BTC | $66,977 | +2.5% | UP | 0.47x | HIGH_RANGE | +0.005% | +5.5% |
| ETH | $1,946 | +1.4% | UP | 0.69x | HIGH_RANGE | — | — |
| SOL | $82.28 | +0.9% | UP | 0.45x | HIGH_RANGE | — | — |
| XRP | $1.348 | -0.2% | UP | 0.66x | HIGH_RANGE | **-0.014%** | **-15.7%** |
| SUI | $0.880 | -1.4% | UP | 0.80x | HIGH_RANGE | — | — |
| DOGE | $0.089 | -4.0% | RANGE | 0.66x | HIGH_RANGE | — | — |
| **LINK** | $8.593 | -0.8% | UP | 1.03x | HIGH_RANGE | **-0.018%** | **-19.3%** |
| AVAX | $8.849 | -0.4% | UP | 0.78x | HIGH_RANGE | — | — |
| **NEAR** | $1.214 | **+11.9%** | UP | 0.50x | BIG_MOVE | — | — |
| **HYPE** | $30.08 | **+11.1%** | UP | 0.51x | BIG_MOVE | — | — |
| **TAO** | $176.1 | +0.8% | UP | 0.98x | HIGH_RANGE | **-0.131%** | **-143.2%** |
| **WIF** | $0.175 | **-14.3%** | UP¹ | 0.90x | BIG_MOVE, NEAR_LOW | **-0.097%** | **-106.6%** |
| ONDO | $0.245 | -3.9% | UP | 0.75x | HIGH_RANGE | — | — |
| ARB | $0.096 | -3.8% | UP | 0.53x | HIGH_RANGE | — | — |
| **OP** | $0.115 | -3.9% | UP | 0.66x | HIGH_RANGE | +0.010% | +10.9% |
| APT | $0.929 | -0.3% | UP | 0.43x | HIGH_RANGE | — | — |
| SEI | $0.064 | -6.6% | RANGE | 0.77x | BIG_MOVE | — | — |
| **INJ** | $2.804 | **-8.7%** | DOWN | 0.83x | BIG_MOVE | **-0.077%** | **-84.2%** |
| BNB | $617.0 | +1.2% | UP | 0.63x | HIGH_RANGE | — | — |
| **DOT** | $1.434 | **-10.7%** | DOWN | 0.69x | BIG_MOVE, NEAR_LOW | — | — |

¹WIF shows UP trend per scanner (period open > close check reversed by large drop, recheck)

## Strategy Indicator Overlay (Key Pairs)

| Symbol | RSI(14) | ADX(14) | EMA8 vs 21 vs 55 | FRC Status | EFR Status |
|--------|---------|---------|-------------------|-----------|------------|
| BTC | 36.4 | 23.1 | Mixed | EXIT (funding positive) | RSI > 30, not triggered |
| ETH | 38.0 | 18.9 | 55 > 21 > 8 (bear) | — | RSI > 30, not triggered |
| WIF | **27.0** | **31.6** | Price < EMA55 | OPP blocked (price<EMA55) | **EFR territory** (not in symbol list) |
| INJ | **28.5** | 22.4 | Price < EMA55 | OPP blocked (price<EMA55) | **EFR territory** (not in symbol list) |
| OP | **29.0** | 26.7 | Price < EMA55 | EXIT (funding positive) | **EFR territory** (not in symbol list) |

## Funding Rate Carry Deep Dive

| Pair | Rate/8h | Annualized | Price vs EMA55 | 3x Consec Neg | FRC Verdict |
|------|---------|------------|----------------|---------------|-------------|
| **TAO** | **-0.131%** | **-143.2%** | BELOW | ? | BLOCKED — price < EMA55 |
| **WIF** | **-0.097%** | **-106.6%** | BELOW | PARTIAL | BLOCKED — price < EMA55, not 3x neg |
| **INJ** | **-0.077%** | **-84.2%** | BELOW | ? | BLOCKED — price < EMA55 |
| LINK | -0.018% | -19.3% | ? | ? | NEEDS CHECK |
| XRP | -0.014% | -15.7% | ? | ? | NEEDS CHECK |

**TAO is the deepest carry opportunity in the portfolio.** -143.2% annualized means shorts are paying longs 0.131% every 8 hours. However, all top FRC candidates have price below EMA(55), which is the safety gate preventing entry during freefall. The gate is working correctly.

## Key Observations

1. **Funding rates are deepening rapidly**: WIF went from -0.057% to -0.097% in 2 hours. TAO at -0.131% is the deepest carry we've seen. Market is extremely short-biased on small caps.
2. **3 assets at extreme fear (RSI < 30)**: WIF, INJ, OP — none in EFR symbol list (BTC/ETH only)
3. **2 assets near 40h lows**: WIF (0.9% from low), DOT (0.8% from low)
4. **2 big gainers**: NEAR +11.9%, HYPE +11.1% — potential momentum but not in our strategy book
5. **Market bifurcation**: Large caps (BTC, ETH, BNB) relatively stable (+1-2%). Small caps (WIF, DOT, INJ, SEI) selling off hard (-7 to -14%).
6. **Volume declining**: Most pairs showing vol ratio < 1.0x (below average). LINK is the exception at 1.03x.

## Changes from Last Scan (04:00 UTC)

| Metric | 04:00 UTC | 05:00 UTC | Change |
|--------|-----------|-----------|--------|
| WIF funding | -0.057% | **-0.097%** | -70% deeper |
| TAO funding | not highlighted | **-0.131%** | NEW EXTREME |
| INJ funding | not reported | **-0.077%** | NEW DATA |
| WIF RSI | 27.0 | 27.0 | Stable at extreme |
| INJ RSI | 28.5 | 28.5 | Stable at extreme |
| OP RSI | 29.0 | 29.0 | Stable at extreme |
| BTC ADX | 22.2 | 23.1 | Rising toward trend |
| Entry signals | 0 | 0 | No change |

## Pipeline Assessment

Scanner is functioning correctly. No entry signals is the right call — all FRC opportunities are blocked by the price<EMA(55) safety gate, and EFR targets (BTC/ETH) haven't reached RSI<30. The scanner is patient. This is correct behavior.

**Recommendation**: Strategy Architect should evaluate expanding EFR symbol list to include WIF, INJ, OP — three alts at extreme fear levels with potential mean-reversion setups forming. Risk: smaller alts = worse liquidity, wider spreads. But the extreme funding + oversold combination is notable.
