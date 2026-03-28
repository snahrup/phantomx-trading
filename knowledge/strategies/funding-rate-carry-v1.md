---
id: strat-frc-v1.0
title: "Funding Rate Carry (FRC) v1.0"
category: strategies
version: "1.0"
status: paper
tags: ["carry-trade", "funding-rate", "negative-funding", "perpetual-futures", "regime-specific", "50x-leverage"]
source: strategy-architect
created: 2026-03-07T23:50:00.000Z
updated: 2026-03-08T01:20:00.000Z
regime: negative_funding
symbols: ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
---

# Funding Rate Carry (FRC) v1.0

## Thesis

Perpetual futures have no expiry — they use funding rates to tether the perp price to spot. When funding is negative (shorts paying longs), holding a long perp position earns passive income every 8 hours. In extreme fear regimes, funding often goes deeply negative as short positioning becomes crowded. This creates a dual edge:

1. **Carry income**: Longs receive funding payments every 8h
2. **Squeeze potential**: Crowded shorts create fuel for explosive upside moves when they unwind

The strategy enters long on top-cap perps when funding is deeply negative and holds for carry income, with the directional move as upside optionality.

## Market Structure Exploited

1. **Crowded shorts**: Negative funding means more shorts than longs. Shorts pay longs to maintain the price peg
2. **Mean reversion of funding**: Extreme funding rates are unsustainable. They revert to neutral, which means short covering (buying pressure)
3. **Asymmetric payout**: Carry income provides base return even if price is flat. Directional upside is bonus
4. **Self-correcting mechanism**: The more negative funding gets, the more longs get paid, attracting more longs, which normalizes funding

## Entry Conditions

This strategy requires EXTERNAL data (funding rate API) that the condition evaluator cannot provide from OHLCV alone. Entry is semi-automated:

| # | Condition | Source | Threshold | Rationale |
|---|-----------|--------|-----------|-----------|
| 1 | Funding rate deeply negative | Phemex API: `fetchFundingRate()` | < -0.01% per 8h | Shorts are crowded enough to generate meaningful carry |
| 2 | Consecutive negative periods | Phemex API: funding history | >= 3 consecutive 8h periods | Not a transient blip — persistent crowding |
| 3 | Annualized carry > 5% | Calculated: `rate * 3 * 365` | > 5% annualized | Worth the exposure risk |
| 4 | Price above key support | OHLCV: 4H close > EMA(55) | Price > EMA_55 | Don't carry into a breakdown. EMA(55) is the structural support |
| 5 | RSI not overbought | OHLCV: RSI(14) on 4H | < 65 | Don't enter carry positions at extended prices |

**OHLCV-based confirmation (for condition evaluator):**
```json
{
  "logic": "AND",
  "conditions": [
    { "indicator": "CLOSE", "operator": "above", "target": "EMA_55" },
    { "indicator": "RSI_14", "operator": "below", "target": 65 }
  ]
}
```

**Entry Timing**: Enter at the 8h funding snapshot time (00:00, 08:00, 16:00 UTC on Phemex) to capture the next funding payment immediately.

## Exit Rules

| Rule | Condition | Action |
|------|-----------|--------|
| Carry Exit | Funding turns positive for 2+ consecutive 8h periods | Close position — carry edge is gone |
| Stop Loss | Price drops 1.0% from entry | Close entire position. Carry doesn't justify large drawdowns |
| Take Profit | Price reaches +1.5R | Close 50%. Trail remainder with 1.5 ATR |
| Support Break | 4H close below EMA(55) | Close immediately — structural support broken |
| Time Exit | 7 days max hold | Re-evaluate. Carry trades shouldn't become bagholding |
| Max Adverse Funding | Funding flips to > +0.03% (longs paying shorts heavily) | Close immediately — you're now the one paying |

## Position Sizing

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Risk per trade | 1.0% of equity | Conservative — carry is the edge, not conviction |
| Kelly fraction | Quarter-Kelly (0.021) | Low conviction directional, high conviction carry |
| Max position notional | 5% of equity | Below standard cap. Carry positions are passive, not aggressive |
| Leverage | 50x (platform setting) | Small notional at high leverage = low margin usage |
| Stop distance | 1.0% from entry | At 50x: position_size = (equity * 0.01) / (0.01 * 50) = 2% of equity |
| Max simultaneous | 2 | Can run BTC + one alt carry simultaneously |
| Correlation limit | Must be different sectors | No BTC carry + ETH carry simultaneously (correlation > 0.7) |

## Carry Income Calculation

```
Example: $243.93 equity, 2% position ($4.88 notional at 50x, ~$0.10 margin)
Funding rate: -0.02% per 8h
Income per period: $4.88 * 0.0002 = $0.00098 per 8h
Daily: $0.00098 * 3 = $0.00294
Annualized: $0.00294 * 365 = $1.07 (21.9% annualized on margin used)
```

At current account size ($243.93), carry income is small in absolute terms but provides:
1. Positive expected value floor (income even if price is flat)
2. Alignment with the directional thesis (long in extreme fear)
3. Discipline — structured entry/exit beats emotional trading

## Regime Suitability

| Regime | Suitable? | Notes |
|--------|-----------|-------|
| Negative funding + Extreme Fear | YES — primary use case | Maximum carry + maximum squeeze potential |
| Negative funding + Neutral | YES | Carry still pays, but directional edge weaker |
| Positive funding (any) | NO | Longs pay shorts — reversed edge |
| Trending Down (negative funding) | CONDITIONAL | Only if price above EMA(55). Don't carry into a breakdown |
| Low volatility | POSSIBLE | Low vol = smaller risk, carry as % of risk is higher |

## Learnings Integration

| Learning | How Integrated |
|----------|----------------|
| Revenge Trading | Not applicable — carry entries are at funding snapshots, not reactive |
| FOMO on Breakouts | RSI < 65 gate prevents entering at extended levels |
| Cutting Winners | 1.5 ATR trailing stop on TP remainder. Let the squeeze run |
| Overtrading | Max 2 carry positions. No "adding to winners" without new funding signal |
| Holding Losers | Hard 1.0% stop + EMA(55) support break = immediate exit |
| R:R Minimum | Carry provides base return, so R:R calculation includes funding income |
| Trail Width | 1.5 ATR matches the passive hold thesis (not scalp-tight) |

## Expected Performance (Theoretical)

| Metric | Target | Basis |
|--------|--------|-------|
| Win Rate | 45-55% directional | Conservative — carry provides floor regardless |
| R:R Ratio | 1.5:1 directional + carry | Lower R:R offset by carry income |
| Carry Income | 5-20% annualized on margin | Dependent on funding rate magnitude |
| Max Drawdown | < 8% | Smaller positions, tighter stops |
| Sharpe Ratio | > 1.0 | Lower vol strategy with consistent carry income |
| Trades per month | 2-4 | Funding regime changes ~weekly |
| EV per trade | +0.5R + carry | (0.50 * 1.5R) - (0.50 * 1.0R) + carry = +0.25R + carry |

## Scanner Detection Criteria

```
SCAN: FRC-v1.0 Funding Rate Monitor
Symbols: BTC/USDT:USDT, ETH/USDT:USDT, SOL/USDT:USDT
Check: Every 8h (before funding snapshot at 00:00, 08:00, 16:00 UTC)
Conditions:
  1. Fetch current funding rate via Phemex API
  2. If rate < -0.01% for current + prev 2 periods:
     Alert: "FRC OPPORTUNITY — [symbol] funding at [rate], [annualized]% annualized carry"
  3. If existing carry position AND funding turns positive:
     Alert: "FRC EXIT SIGNAL — [symbol] funding turned positive, carry edge lost"
```

## Execution Parameters

```
EXECUTION: FRC-v1.0
Entry Type: Limit order at current bid (passive fill to minimize fees)
Entry Timing: Before 8h funding snapshot (00:00/08:00/16:00 UTC)
Leverage: 50x (set before order)
Position Size: (equity * 0.01) / (0.01 * 50) = ~2% of equity notional
Stop Loss: Set IMMEDIATELY after fill, 1.0% below entry
Take Profit: 1.5% above entry (close 50%)
Trailing Stop: 1.5 ATR on remainder
Monitor: Check funding rate every 8h. Exit if positive for 2 consecutive periods
Max Hold: 7 days
Paper Mode: MANDATORY until CEO approval for live
```

## Implementation Notes

The current condition evaluator handles the OHLCV-based confirmation (EMA(55) support, RSI filter). The funding rate check requires extending the trading pipeline:

1. Add `fetchFundingRate()` call to the signal generation step
2. Add `fundingRate` field to TradingSignal type
3. Scanner should poll funding rates every 8h and generate signals when conditions met

This is a **semi-automated** strategy until the funding rate integration is built. The Scanner/Monitor agent should track funding rates and alert when conditions are met, then the Execution Trader submits the order.

## Current Conditions Assessment (March 8, 2026)

**ENTRY CONDITIONS NOT MET.** Live funding rate data contradicts the initial market analysis:

| Symbol | Funding Rate | Threshold | Status |
|--------|-------------|-----------|--------|
| BTC/USDT:USDT | **+0.006%** | < -0.01% | NOT MET — positive (longs pay shorts) |
| ETH/USDT:USDT | **-0.001%** | < -0.01% | NOT MET — slightly negative but 10x above threshold |
| SOL/USDT:USDT | **+0.004%** | < -0.01% | NOT MET — positive |

**Analysis**: Despite extreme fear (F&G 5-14) and a broad sell-off, funding rates are near neutral or slightly positive. This means shorts are NOT dominant enough to create the crowded-short carry opportunity this strategy requires. The initial market analysis that described "negative funding across major perps" was inaccurate — funding was briefly negative but has normalized.

**Implication**: FRC v1.0 remains on the shelf until a genuine funding dislocation occurs (sustained negative funding < -0.01% for 3+ consecutive 8h periods). The strategy design is sound, but the market condition is not present.

**Historical note**: Funding tends to go deeply negative during rapid liquidation cascades, not during slow grinds. If BTC drops sharply to $60K or below in a flash crash, funding will likely spike negative — that's when to watch for FRC entry signals.

---

**Approval Status**: PAPER ONLY — requires backtest results + funding rate integration + CEO sign-off.
**Next Steps**: Monitor funding rates via scanner. Strategy activates when funding < -0.01% for 3+ consecutive periods. Do not force entry.
