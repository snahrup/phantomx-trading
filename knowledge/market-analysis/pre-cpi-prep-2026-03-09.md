---
id: pre-cpi-prep-2026-03-09
title: "Pre-CPI Preparation — Tuesday March 10, 2026"
category: market-analysis
tags: ["cpi", "event-risk", "strategy-adjustment", "volatility"]
source: head-of-trading
created: 2026-03-08T14:00:00.000Z
due: 2026-03-09T12:00:00.000Z
---

# Pre-CPI Preparation — March 10, 2026

## Event Details

| Item | Detail |
|------|--------|
| Event | US Consumer Price Index (CPI) Release |
| Date | Tuesday, March 10, 2026 |
| Time | 08:30 ET / 13:30 UTC |
| Consensus | TBD — check Monday AM |
| Prior | TBD |
| Impact | HIGH — typically 2-5% BTC moves within hours |

## Current Market Context Going Into CPI

| Factor | State | Implication for CPI |
|--------|-------|---------------------|
| F&G Index | 12 (Extreme Fear, 22+ days) | Market already pricing worst case. Upside asymmetric if CPI cool |
| BTC ADX | 27.4 (TRENDING) | Just crossed 25. Directional move ready to extend |
| Funding rates | Deeply negative on alts | Short crowding extreme. Dovish CPI = violent squeeze |
| BTC exchange outflows | 47K BTC (7d) | Supply constrained. Any demand catalyst amplified |
| Portfolio | FLAT, $154.93 | No exposure risk. Clean slate for post-CPI entries |
| 45% breakout probability | Per On-Chain Analyst | CPI could be the catalyst for $75K+ move |

## Scenario Analysis

### Scenario A: CPI Cool (Lower Than Expected) — BULLISH
**Probability**: ~35%
- **Immediate**: BTC +3-5% in 1-4 hours. Alts +5-15%
- **Mechanism**: Dovish → rate cut expectations rise → risk-on → short squeeze
- **Strategy impact**:
  - **EFR v1.1**: HIGH PROBABILITY of trigger. Alt RSIs currently 26-35 and rising. Dovish CPI forces RSI cross above 30, MACD improvement, and EMA crosses. INJ and WIF are the strongest squeeze candidates.
  - **FRC v1.0**: Prices may punch above EMA(55) on several pairs (TAO only 2.4% below, NEAR already above). Multiple FRC gates could unlock simultaneously.
  - **EMA Ribbon v2.1**: BTC ADX already 27.4. Strong bullish move could align ribbon (8>21>55) within 1-2 candles. First LONG entry opportunity since launch.
  - **LSR v1.0**: Less relevant — breakout > ranging.

### Scenario B: CPI Hot (Higher Than Expected) — BEARISH
**Probability**: ~30%
- **Immediate**: BTC -3-5% in 1-4 hours. Alts -5-20%
- **Mechanism**: Hawkish → rate cut delayed → risk-off → capitulation extends
- **Strategy impact**:
  - **EFR v1.1**: DO NOT CHASE. RSIs will drop further but catching falling knives in hawkish environment is maximum risk. Funding deepens = better entry LATER.
  - **FRC v1.0**: Prices collapse further below EMA(55). All FRC gates REMAIN BLOCKED. Correct behavior.
  - **EMA Ribbon v2.1**: BEAR ribbon may fully align (55>21>8). SHORT entry possible if ADX stays above 25 and pullback to EMA(21) occurs.
  - **WIF/OP**: Could see RSI <10. Unprecedented. Will be the trade of the month when reversal comes — patience.

### Scenario C: CPI In-Line (As Expected) — NEUTRAL
**Probability**: ~35%
- **Immediate**: BTC ±1%, volatile whipsaw then reversion
- **Mechanism**: No surprise → no catalyst → range continues
- **Strategy impact**: Status quo. Continue monitoring. NEAR FRC gating proceeds on schedule. INJ EFR continues forming. No forced entries.

## Pre-CPI Operational Orders

### T-24h (Monday March 9, 12:00 UTC)
1. **Scanner**: Increase scan frequency to every 1H on priority watchlist (INJ, WIF, NEAR, OP, TAO, BTC, ETH)
2. **Microstructure**: Refresh order book depth maps for all 8 EFR v1.1 pairs
3. **Risk params check**: Verify all thresholds in risk-params.json. Confirm kill switch cooldown status
4. **Paper trade readiness**: Ensure execution pipeline can log paper trades instantly post-CPI

### T-2h (Tuesday March 10, 11:30 UTC)
1. **NO NEW ENTRIES** within 30 minutes of CPI release (13:00-13:30 UTC blackout)
2. **Widen stops**: Any open positions (if any by then) should have stops widened by 1.5x to account for CPI whipsaw
3. **Pre-calculate**: Paper trade sizes for top 3 candidates at current equity ($154.93)
4. **Alert setup**: Monitor BTC price, RSI, and ADX in real-time during CPI release

### T+0 to T+4h (Tuesday March 10, 13:30-17:30 UTC)
1. **First 15 minutes**: OBSERVE ONLY. Do not react to initial spike/dump — CPI whipsaw common
2. **T+30 min**: Assess direction. Check if any EFR/FRC/EMA triggers fire
3. **T+1h**: If Scenario A, prepare paper trade entries for INJ EFR and NEAR FRC (if funding negative by then)
4. **T+2h**: Full scan. Log all observations. This is a HIGH-INFORMATION event — data from this will inform strategy tuning

### Post-CPI (T+4h onward)
1. **Run full regime scan**: Market structure may have permanently shifted
2. **Update playbook**: New ADX, RSI, ribbon readings post-CPI
3. **Paper trade any triggered entries**: This counts toward the 10-trade paper trial
4. **Report to CEO**: CPI impact assessment, strategy outcomes, pipeline performance

## Position Sizing for Paper Trades (Pre-Calculated)

At $154.93 equity, 0.5x recovery multiplier:

| Strategy | Tier | Risk % | $ Risk | Stop | Notional | Margin (50x) |
|----------|------|--------|--------|------|----------|--------------|
| EFR v1.1 | Major (BTC/ETH) | 1.5% | $1.16 | 1.2% | $96.83 | $1.94 |
| EFR v1.1 | Mid (SOL/LINK/OP) | 1.0% | $0.77 | 1.5% | $51.55 | $1.03 |
| EFR v1.1 | Small (WIF/INJ) | 0.75% | $0.58 | 2.0% | $29.06 | $0.58 |
| FRC v1.0 | Any | 1.0% | $1.55 | 1.0% | $154.93 | $3.10 |
| EMA v2.1 | Any | 2.0% | $1.55 | Dynamic | Dynamic | Dynamic |

## Key Watchlist Pre-CPI

| Priority | Pair | Setup | CPI Catalyst Needed |
|----------|------|-------|---------------------|
| 1 | INJ | EFR forming (RSI ~26, rising) | Dovish = trigger. Hawkish = deeper setup |
| 2 | WIF | Capitulation (RSI ~13) | Dovish = reversal begins. Hawkish = new lows |
| 3 | NEAR | FRC gating (above EMA55, funding flipping) | Dovish = FRC accelerates. Any = continue gating |
| 4 | BTC | ADX 27.4, ribbon MIXED | Dovish = ribbon aligns. Hawkish = BEAR ribbon forms |
| 5 | OP | EFR 3/5 (RSI ~34, rising) | Dovish = possible trigger. Hawkish = setup deepens |

---

**Author**: Head of Trading (onyx-pike)
**Status**: DRAFT — finalize with fresh data Monday AM
**Review**: CEO approval before CPI event window
