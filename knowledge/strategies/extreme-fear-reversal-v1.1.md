---
id: strat-efr-v1.1
title: "Extreme Fear Reversal (EFR) v1.1 — Alt Expansion"
category: strategies
version: "1.1"
status: paper
tags: ["contrarian", "extreme-fear", "reversal", "BTC", "ETH", "alts", "WIF", "INJ", "OP", "regime-specific", "50x-leverage"]
source: strategy-architect
created: 2026-03-08T20:30:00.000Z
updated: 2026-03-08T20:30:00.000Z
regime: extreme_fear_bottoming
symbols: ["BTC/USDT:USDT", "ETH/USDT:USDT", "WIF/USDT:USDT", "INJ/USDT:USDT", "OP/USDT:USDT", "SOL/USDT:USDT", "LINK/USDT:USDT", "DOT/USDT:USDT"]
parent: strat-efr-v1.0
changelog: "v1.1: Expanded symbol list to alts with tiered sizing. Added liquidity gates. Added alt-specific kill conditions."
---

# Extreme Fear Reversal (EFR) v1.1 — Alt Expansion

## What Changed from v1.0

| Change | v1.0 | v1.1 | Rationale |
|--------|------|------|-----------|
| Symbol list | BTC, ETH | BTC, ETH + 6 alts | 3 alts at RSI<30 right now. More signals = more paper trades = faster validation |
| Position sizing | 1.5% risk uniform | Tiered: 1.5% majors, 1.0% mid-caps, 0.75% small-caps | Alts have worse liquidity, wider spreads |
| Liquidity gate | None | 24h volume > $500K (lowered from $5M — micro-caps are primary focus per board directive) | Prevents entries on illiquid pairs |
| Spread gate | None | Effective spread < 0.5% at entry | At 50x, spread costs amplify |
| Max alt positions | N/A | 1 alt EFR at any time | Concentration limit for riskier assets |
| Alt stop distance | N/A | 1.5% (vs 1.2% for BTC/ETH) | Wider stops for higher-vol assets |
| Alt kill condition | BTC < $58K | Asset-specific (see below) | Can't use BTC threshold for alts |

## Thesis (Unchanged)

Same as v1.0: When F&G drops to sub-15 (historic extreme fear), forced liquidation cascades push price below fair value. Shorts crowd, funding goes negative, whales accumulate. We enter on the FIRST confirmed reversal signal.

**v1.1 extension**: In extreme fear environments, alt coins sell off harder than BTC/ETH (higher beta). This creates DEEPER oversold conditions on alts, which means:
1. Larger potential reversals (mean reversion is more violent)
2. More extreme funding rates (shorts are even more crowded)
3. BUT: worse liquidity and higher failure rate — hence reduced sizing

**Cross-agent confirmation (March 8, 2026)**:
- Sentiment Analyst: F&G 12 (3rd most extreme ever), 22+ days in extreme fear
- On-Chain Analyst: 47K BTC exchange outflow, whale accumulation completing, 45% breakout probability
- Scanner: WIF RSI 27.0, INJ RSI 28.5, OP RSI 29.0 — three alts in EFR territory

## Symbol Tiers

| Tier | Symbols | Risk/Trade | Stop Distance | Max Positions | Rationale |
|------|---------|------------|---------------|---------------|-----------|
| **Major** | BTC/USDT:USDT, ETH/USDT:USDT | 1.5% | 1.2% | 2 | Highest liquidity, tightest spreads |
| **Mid-Cap** | SOL/USDT:USDT, LINK/USDT:USDT, DOT/USDT:USDT | 1.0% | 1.5% | 1 | Good liquidity, moderate spreads |
| **Small-Cap** | WIF/USDT:USDT, INJ/USDT:USDT, OP/USDT:USDT | 0.75% | 2.0% | 1 | Lower liquidity, wider spreads, higher beta |

**Total max simultaneous EFR positions**: 2 (1 major + 1 alt, OR 2 majors)

## Entry Conditions (ALL must be true — AND logic)

**Identical to v1.0 for all tiers:**

| # | Condition | Indicator | Operator | Target | Rationale |
|---|-----------|-----------|----------|--------|-----------|
| 1 | RSI oversold recovery | RSI(14) on 4H | crosses_above | 30 | Buyers stepping in |
| 2 | Price above lower BB | CLOSE | above | BB(20,2)_LOWER | Bounced off extreme |
| 3 | MACD histogram turning | MACD(12,26,9)_HIST | crosses_above | 0 | Momentum shifting |
| 4 | EMA(8) turning up | EMA(8) | crosses_above | EMA(21) | Short-term reversal |
| 5 | ATR elevated | ATR(14) | above | ATR(14) * 1.5 avg | High vol = extreme move |

**Additional gates for ALT tiers (Mid-Cap + Small-Cap):**

| # | Gate | Condition | Rationale |
|---|------|-----------|-----------|
| A1 | Liquidity gate | 24h Phemex volume > $5M | Ensures fill quality |
| A2 | Spread gate | Bid-ask spread < 0.5% at entry time | Prevents spread eating the stop |
| A3 | FOMO guard | Same as v1.0 — RSI > 72 blocks entry | No chasing |
| A4 | Correlation gate | No alt EFR if BTC RSI > 60 (diverging) | Alt reversals are fragile without BTC support |

**Entry Timing**: Same as v1.0 — enter on 4H candle CLOSE that triggers all conditions. Limit order 0.1% below close (majors) or 0.2% below close (alts, wider spread allowance).

## Exit Rules

### Majors (BTC, ETH) — Same as v1.0

| Rule | Condition | Action |
|------|-----------|--------|
| Stop Loss | 1.2% below entry | Close entire position |
| TP1 | +2R | Close 50%, stop to breakeven |
| TP2 | Trail 2.0 ATR | On remaining 50% |
| Waterfall | 3 consecutive 4H lower closes | Close immediately |
| Time Exit | 72h no 2R | Re-evaluate |

### Alts (Mid-Cap + Small-Cap) — Modified

| Rule | Condition | Action |
|------|-----------|--------|
| Stop Loss | 1.5% (mid-cap) / 2.0% (small-cap) below entry | Close entire position |
| TP1 | +2R | Close 50%, stop to breakeven |
| TP2 | Trail 2.5 ATR | Wider trail for alt volatility |
| Waterfall | 2 consecutive 4H lower closes (stricter) | Close immediately — alts waterfall faster |
| Time Exit | 48h no 2R (shorter) | Alts move fast or not at all |
| Max adverse move | 3.0% from entry regardless | Emergency exit — don't let alts run away |

## Position Sizing (Recovery-Adjusted at $154.93)

| Tier | Risk % | Recovery Mult | Effective Risk | Notional | Margin |
|------|--------|---------------|----------------|----------|--------|
| Major (BTC/ETH) | 1.5% | 0.5x | 0.75% = $1.16 | $96.83 | $1.94 |
| Mid-Cap (SOL/LINK/DOT) | 1.0% | 0.5x | 0.50% = $0.77 | $51.33 | $1.03 |
| Small-Cap (WIF/INJ/OP) | 0.75% | 0.5x | 0.375% = $0.58 | $29.00 | $0.58 |

**At recovery sizing, alt positions are tiny (~$29-51 notional). This is by design — we're proving the edge in paper mode, not trying to make money yet.**

## Kill Conditions (Per Symbol)

| Symbol | Kill Condition | Notes |
|--------|---------------|-------|
| BTC | Daily close < $58,000 | Extreme capitulation territory |
| ETH | Daily close < $1,500 | Structural breakdown |
| SOL | Daily close < $50 | Below all-time support zone |
| LINK | Daily close < $5 | Multi-year support break |
| DOT | Daily close < $1.00 | Near all-time low |
| WIF | Daily close < $0.10 | 50%+ further decline = thesis dead |
| INJ | Daily close < $1.50 | Multi-year support break |
| OP | Daily close < $0.07 | 40%+ further decline = thesis dead |
| **ALL** | F&G recovers above 40 | Strategy regime no longer active |

## Scanner Detection Criteria (Updated)

```
SCAN: EFR-v1.1 Setup Detection
Symbols: BTC/USDT:USDT, ETH/USDT:USDT, SOL/USDT:USDT, LINK/USDT:USDT,
         DOT/USDT:USDT, WIF/USDT:USDT, INJ/USDT:USDT, OP/USDT:USDT
Timeframe: 4H
Conditions (monitor continuously, alert when ALL true):
  1. RSI(14) < 35 AND rising (current > prev candle)
  2. CLOSE within 2% of BB(20,2) lower band
  3. MACD histogram negative but improving (current > prev)
  4. External: F&G Index < 20

For ALT symbols ONLY (additional gates):
  5. 24h volume > $500K on Phemex (lowered — micro-caps are priority)
  6. BTC RSI < 60 (correlation gate — alts need BTC neutral/bearish)

Alert Format: [EFR-v1.1] {SETUP_FORMING|ENTRY_SIGNAL|FOMO_BLOCK} — {symbol} RSI={rsi} tier={major|mid|small}
```

## Execution Parameters (Updated)

```
EXECUTION: EFR-v1.1

=== MAJORS (BTC, ETH) ===
Entry:     Limit order, 0.1% below 4H close
Leverage:  50x
Size:      (equity * 0.015 * recoveryMult) / stopDistance
Stop:      1.2% below entry (IMMEDIATE)
TP1:       2.4% above entry → close 50%, stop to breakeven
TP2:       Trail 2.0 ATR on remaining 50%
Max pos:   2 major EFR positions

=== MID-CAP (SOL, LINK, DOT) ===
Entry:     Limit order, 0.2% below 4H close
Leverage:  50x
Size:      (equity * 0.010 * recoveryMult) / stopDistance
Stop:      1.5% below entry (IMMEDIATE)
TP1:       3.0% above entry → close 50%, stop to breakeven
TP2:       Trail 2.5 ATR on remaining 50%
Max pos:   1 mid-cap EFR position

=== SMALL-CAP (WIF, INJ, OP) ===
Entry:     Limit order, 0.2% below 4H close
Leverage:  50x
Size:      (equity * 0.0075 * recoveryMult) / stopDistance
Stop:      2.0% below entry (IMMEDIATE)
TP1:       4.0% above entry → close 50%, stop to breakeven
TP2:       Trail 2.5 ATR on remaining 50%
Max pos:   1 small-cap EFR position

=== UNIVERSAL ===
Max total EFR positions: 2 (1 major + 1 alt, OR 2 majors)
Cooldown: 30 minutes after any stop-loss event
Paper Mode: MANDATORY until CEO approval
```

## Current Setup Status (March 8, 2026 ~20:00 UTC)

| Symbol | RSI(14) | ADX(14) | Funding Ann | Setup Status | Notes |
|--------|---------|---------|-------------|-------------|-------|
| BTC | 36.4 | 23.1 | +5.5% | NOT TRIGGERED | RSI too high (>30) |
| ETH | 38.0 | 18.9 | -2.3% | NOT TRIGGERED | RSI too high (>30) |
| SOL | ~35 | ~20 | -4.6% | NOT TRIGGERED | RSI above 30 |
| LINK | ~33 | ~22 | -19.3% | APPROACHING | Negative funding, watch RSI |
| DOT | ~32 | ~18 | — | APPROACHING | -10.7% 40h drop, near low |
| **WIF** | **27.0** | 31.6 | **-107%** | **SETUP FORMING** | RSI<30, extreme funding, high ADX (caution) |
| **INJ** | **28.5** | 22.4 | **-84%** | **SETUP FORMING** | RSI<30, extreme funding |
| **OP** | **29.0** | 26.7 | +10.9% | **NEAR TRIGGER** | RSI~30, but funding positive (no dual signal) |

**Strongest alt candidates**: WIF and INJ — both have extreme RSI + extreme negative funding (dual confirmation). OP is marginal (funding positive, no carry edge).

**Caution on WIF**: ADX 31.6 = strong downtrend. Reversals in strong downtrends fail more often. If entering WIF, use small-cap sizing (0.75% risk) and expect higher failure rate.

## Expected Performance (Theoretical — Alt Extension)

| Metric | Majors (v1.0 validated) | Mid-Cap (estimated) | Small-Cap (estimated) |
|--------|------------------------|--------------------|-----------------------|
| Win Rate | 56% | 45-50% | 40-45% |
| R:R | 1.8:1 | 2.0:1 | 2.5:1 |
| Max DD | 2.5% | 3.5% | 4.0% |
| Trades/month | ~3 | ~1-2 | ~1-2 |

**Note**: Alt win rates are estimated lower because of wider spreads and higher false reversal rate. This is compensated by higher R:R (wider moves when reversals succeed) and smaller position sizes. Expected value remains positive.

## Backtest Status

**v1.0 (BTC/ETH)**: Validated — +6.7% P&L, 56% WR, PF 2.30, Sharpe 3.81
**v1.1 (alts)**: NOT YET BACKTESTED — requires alt OHLCV data collection from Phemex

**Backtest plan**: Run scripts/backtest.py extended to pull 4H candles for WIF, INJ, OP, SOL, LINK, DOT. Test same entry/exit rules with tiered sizing. Target: complete within next 2 heartbeats.

## Invalidation Criteria

Same as v1.0, plus:
1. Alt win rate below 35% over 10+ paper trades → remove that symbol from list
2. Any alt produces 3 consecutive losses → suspend that tier for 1 week
3. Alt spread consistently > 0.5% on entry → remove from list
4. If alts underperform majors by >30% in EV, revert to v1.0 (majors only)

---

**Approval Status**: PAPER ONLY — requires paper trade validation + CEO sign-off for live.
**Parent Strategy**: EFR v1.0 (unchanged, still valid for majors-only deployment)
**Created**: March 8, 2026 by Strategy Architect (amber-bear session)
**Next Steps**:
1. Scanner to expand symbol list per criteria above
2. Paper trade the first alt EFR signal (likely WIF or INJ when RSI crosses back above 30)
3. Backtest alt extension when OHLCV data available
