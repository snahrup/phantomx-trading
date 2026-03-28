---
id: portfolio-construction-v1
title: "Portfolio Construction — $200 to $20,000"
category: strategies
version: "1.0"
tags: ["portfolio", "position-sizing", "growth-plan", "multi-pair", "regime-switching"]
source: strategy-architect
created: 2026-03-07T23:59:00.000Z
updated: 2026-03-07T23:59:00.000Z
---

# Portfolio Construction — $200 to $20,000

## Objective

Get from $200 to $20,000 (100x) as fast as possible without catastrophic drawdown.

## Backtested Edge (Validated Dec 14, 2025 – Mar 7, 2026)

500 BTC/USDT 4H candles. BTC fell 24.7% in this period.

| Strategy | P&L | Win Rate | R:R | PF | Max DD | Sharpe |
|---|---|---|---|---|---|---|
| EMA Ribbon v2.0 | +4.6% | 56% | 1.4:1 | 1.70 | 3.2% | 1.57 |
| EFR v1.0 | +6.7% | 56% | 1.8:1 | 2.30 | 2.5% | 3.81 |
| **Combined (regime-switched)** | **+16.9%** | **62%** | **1.7:1** | **2.86** | **3.2%** | **4.47** |

The combined approach (EFR in fear regimes, EMA Ribbon in trending regimes) produced the best results by exploiting both market states.

## Chosen Approach: Phased Multi-Pair Regime-Switched Portfolio

### Why This Approach

1. **Regime switching is the edge.** A single strategy that works in all markets doesn't exist. Switching between EFR (fear), EMA Ribbon (trend), and LSR (range) adapts to market structure.

2. **Multi-pair trading multiplies opportunities.** With 3 pairs (BTC, ETH, SOL), trade frequency roughly triples vs. single-pair. More trades = faster compounding.

3. **Phased sizing controls ruin risk.** Aggressive sizing early (when account is small) accelerates growth. Conservative sizing later (when account is large) protects gains.

4. **The math of 100x.** At 1% compound per trade with 100 trades/year, 100x takes ~4.6 years. At 2% compound per trade with 150 trades/year, it takes ~1.5 years. Position sizing and trade frequency are the two variables.

### Why Not Other Approaches

- **Single-pair focus**: Too few signals. BTC-only produced 9-16 trades in 83 days.
- **10+ pair portfolio**: Capital too thin at $200. With $4 risk per trade, running 10 pairs means $40 at risk simultaneously = 20% of equity.
- **Hedged pairs**: Hedging reduces returns. With $200, every dollar must work.
- **Grid/DCA**: Not compatible with 50x leverage. Averaging down at 50x is suicide.

## Three-Phase Growth Plan

### Phase 1: Growth ($200 → $2,000)

**Goal:** 10x the account. Build confidence in the system.

| Parameter | Value | Rationale |
|---|---|---|
| Pairs | BTC/USDT:USDT, ETH/USDT:USDT | Two highest-liquidity perps. SOL added at $500+ |
| Risk per trade | 3% (EFR), 2.5% (EMA Ribbon) | More aggressive — small account, need growth |
| Max notional | 2x equity per position | $200 equity = $400 max notional |
| Max positions | 2 simultaneous | Keeps total risk at ~6% |
| Stop distance | 1.0-1.5% (EFR), dynamic to EMA(55) (EMA Ribbon) | Tighter stops in growth phase |
| Timeframe | 4H primary, 1H for LSR confirmation | Standard |
| Regime routing | Active: EFR (fear) + EMA Ribbon (trend) | Per playbook |

**Expected metrics (Phase 1):**
- ~1.5% average compound return per trade
- ~50 trades over ~3-4 months (2 pairs × ~7 trades/month)
- (1.015)^50 = 2.1x → $420 after 50 trades
- With compounding: reach $2,000 requires ~300 trades at 1.5% = ~21 months
- **Acceleration needed**: increase to 3 pairs at $500, and 2% avg return per trade at $1,000+

**Realistic Phase 1 timeline: 6-12 months**

### Phase 2: Scaling ($2,000 → $10,000)

| Parameter | Value | Rationale |
|---|---|---|
| Pairs | BTC, ETH, SOL + 1-2 narrative plays (DOGE for squeeze, ONDO for RWA) | More opportunities at this capital level |
| Risk per trade | 2.5% (EFR), 2% (EMA Ribbon) | Slight reduction — more to protect |
| Max notional | 1.5x equity per position | $2,000 = $3,000 max notional |
| Max positions | 3 simultaneous | Total risk capped at 7.5% |
| Timeframe | 4H | Standard |

**Expected metrics (Phase 2):**
- ~1.2% average return per trade
- ~80 trades over ~6 months (3-5 pairs × ~4 trades/month)
- (1.012)^80 = 2.6x → $5,200 from $2,000
- Continue to $10,000: ~190 trades total from $2,000 = ~14 months
- **Acceleration**: add FRC (funding carry) as passive income layer

**Realistic Phase 2 timeline: 8-14 months**

### Phase 3: Preservation ($10,000 → $20,000)

| Parameter | Value | Rationale |
|---|---|---|
| Pairs | Top 3 by liquidity (BTC, ETH, SOL) | Reduce to most liquid only |
| Risk per trade | 2% standard | Capital preservation |
| Max notional | 1x equity per position | Conservative |
| Max positions | 3 simultaneous | Standard |
| Timeframe | 4H | Standard |

**Expected metrics (Phase 3):**
- ~1% average return per trade
- ~70 trades over ~6 months
- (1.01)^70 = 2.0x → $20,000 from $10,000

**Realistic Phase 3 timeline: 4-8 months**

## Total Projected Timeline

**Conservative estimate: 18-34 months** (1.5 - 2.8 years)
**Optimistic estimate: 12-18 months** (catching a strong trend cycle accelerates Phase 1 dramatically)

### What Could Accelerate This

1. **A BTC breakout from $60-70K range to $100K+** — the EMA Ribbon strategy in a strong uptrend can produce 5-10% returns per trade, not 2%
2. **Extreme fear reversals** — these are rare but high-conviction. The current F&G at 5-14 is the highest-conviction setup I've ever seen. If BTC reverses from here, a single EFR trade could return 5-10% of equity
3. **Multi-timeframe scaling** — adding 1H entries within 4H setups increases trade frequency
4. **Funding carry as base income** — negative funding rates currently pay longs 5-20% annualized

### What Could Slow This Down

1. **Extended range-bound market** — low-vol chop produces few signals and more whipsaws
2. **Kill switch events** — each 48h cooldown + recovery scaling costs ~1-2 weeks of momentum
3. **Correlation clustering** — if BTC/ETH/SOL all move together, multi-pair doesn't help diversification

## Capital Allocation Framework

At any given time, capital is allocated across active strategies based on regime:

### Extreme Fear Regime (Current: F&G < 15)
```
EFR v1.0:  60% of risk budget → max 2 EFR positions (BTC + ETH)
FRC v1.0:  30% of risk budget → 1 carry position (cheapest funding)
EMA v2.0:  0% → PAUSED
LSR v1.0:  10% of risk budget → 1 sweep trade if spotted
```

### Trending Regime (ADX > 25)
```
EMA v2.0:  60% of risk budget → max 2 positions
FRC v1.0:  20% if funding negative
LSR v1.0:  10% → reduced
EFR v1.0:  0% → PAUSED
```

### Ranging Regime (ADX < 20)
```
LSR v1.0:  50% of risk budget
FRC v1.0:  30% if funding negative
EMA v2.0:  0% → PAUSED
EFR v1.0:  0% → PAUSED (unless F&G < 15)
```

## Risk Budget Definition

"Risk budget" = total percentage of equity that can be at risk simultaneously.

| Phase | Total Risk Budget | Max Simultaneous Positions | Per-Trade Risk |
|---|---|---|---|
| Phase 1 | 8% | 2 | 3-4% |
| Phase 2 | 7.5% | 3 | 2-2.5% |
| Phase 3 | 6% | 3 | 2% |

## Kill Conditions (Portfolio Level)

| Condition | Action |
|---|---|
| Equity drops below $100 (Phase 1) | HALT. Post-mortem. CEO review. Capital injection decision |
| 3 consecutive losing trades | Reduce next 3 trades to 50% size |
| 2 kill switch events in 30 days | Pause all trading for 1 week. Full strategy review |
| Win rate drops below 40% over 20+ trades | Strategy recalibration required |
| Max drawdown > 15% from peak | Kill switch triggers automatically |

## Capital Recovery Assessment (Updated March 8, 2026 03:55 UTC)

**Current equity: $154.93** (down from $200 start, -40.6% from $260.81 peak).

The FLOW loss was a manual trade that violated every risk parameter: 10.5x exposure (max 3.0x), no stop-loss, concentrated in a single low-liquidity alt. This loss was NOT from the automated pipeline.

### Recovery Scaling (Mandatory)

| Trade # After Reset | Size Multiplier | Per-Trade Risk | Notional (EFR) |
|---------------------|-----------------|----------------|----------------|
| 1-2 | 0.50x | 0.75% | ~$97 |
| 3 | 0.60x | 0.90% | ~$116 |
| 4 | 0.70x | 1.05% | ~$135 |
| 5 | 0.80x | 1.20% | ~$155 |
| 6+ | 1.00x | 1.50% | ~$194 |

### Recovery Math

- **Back to $200**: ~35 trades at 0.75% avg compound
- **To $2,000 (Phase 1 target)**: ~175 trades
- **HALT distance**: $54.93 (35.5% more drawdown = $100 HALT threshold)
- **EV per trade (recovery sizing)**: ~$0.79 at 56% win rate

### Adjusted Phase 1 Parameters

| Parameter | Original ($200) | Adjusted ($154.93) |
|-----------|-----------------|---------------------|
| Risk per trade | 3% | 1.5% (recovery) → 3% after 6 wins |
| Max notional | $400 (2x equity) | $310 (2x equity) |
| Max positions | 2 | 2 |
| HALT threshold | $100 | $100 (unchanged, now 35.5% away) |

## Immediate Next Steps

1. **Paper trade the combined strategy** on BTC + ETH for 2 weeks
2. **Monitor funding rates** — WIF at -62.8% ann, LINK at -27.1% ann (FRC v1.0 candidates)
3. **Complete post-mortem** on FLOW loss (required before kill switch reset)
4. **Request CEO approval** to move from paper to live with recovery-scaled Phase 1 parameters
5. **Target first trade**: EFR v1.0 long on BTC when RSI < 30 and kill switch is properly reset

## What Makes This Work at 50x

The leverage is a constant. What changes is position SIZE:
- $200 equity at 50x = $10,000 max notional
- But we never use max notional. Risk per trade controls actual exposure
- 3% risk on $200 with 1.2% stop: notional = $200 * 0.03 / 0.012 = $500 (margin = $10)
- That $500 notional at 50x uses only $10 margin (5% of equity)
- At 2.4% TP: profit = $500 * 0.024 = $12 (6% of equity per winning trade)
- With 56% win rate: EV = 0.56 * 6% - 0.44 * 3% = 3.36% - 1.32% = +2.04% per trade
- At 70 trades/year: annual compound = (1.0204)^70 = 4.1x per year
- Four years of 4.1x: 4.1^4 = 283x → $200 * 283 = $56,600

**The math works.** The challenge is execution discipline.

---

**Document Owner**: Strategy Architect
**Approval Required**: CEO/Board must approve Phase 1 go-live
**Review Cadence**: Monthly, or when equity crosses phase thresholds
