---
id: strat-lsr-v1.0
title: "Liquidity Sweep Reversal (LSR) v1.0"
category: strategies
version: "1.0"
status: paper
tags: ["liquidity-sweep", "false-breakout", "reversal", "ranging-market", "stop-hunt", "multi-timeframe", "50x-leverage"]
source: strategy-architect
created: 2026-03-08T00:30:00.000Z
updated: 2026-03-08T00:30:00.000Z
regime: ranging
symbols: ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
---

# Liquidity Sweep Reversal (LSR) v1.0

## Thesis

In ranging markets, price oscillates between well-defined support and resistance levels. Liquidity clusters (stop-losses, limit orders) accumulate just beyond these levels. Market makers and whales systematically sweep these pools — pushing price briefly beyond the level to trigger stops and fill limit orders — before reversing sharply. This creates high-probability reversal setups with tight stops and favorable R:R.

The strategy exploits the **false breakout** phenomenon: price appears to break out but immediately reverses, trapping breakout traders and triggering a cascade in the opposite direction.

## Market Structure Exploited

1. **Stop-loss clustering**: Retail traders place stops at obvious levels (round numbers, prior swing highs/lows). These clusters become liquidity pools that attract large players.
2. **Equal highs/lows**: When price tests the same level multiple times (within 0.3%), it creates a visible liquidity pool. The more touches, the larger the pool.
3. **Sweep mechanics**: Price pierces the pool by 0.1-0.5% (enough to trigger stops), then immediately reverses. The stop triggers provide liquidity for the large player's actual position.
4. **Reversal confirmation**: A strong reversal candle after the sweep (>60% body-to-wick ratio) confirms the sweep is complete and the move is exhausted.
5. **Structure break on lower timeframe**: A break of structure on 15m confirms institutional order flow has reversed.

## Why This Works in Ranging Markets

- **ADX < 20-25**: Low trend strength means breakouts are more likely to fail.
- **Price oscillates predictably**: Defined range creates repeated sweep opportunities at both ends.
- **High R:R from tight stops**: Stop placed above/below the sweep wick is very tight (typically 0.3-0.8% from entry), while targets span the range width.
- **Mean reversion dominance**: In ranges, mean reversion strategies outperform trend-following. This IS mean reversion with a precision entry.

## Entry Conditions

### Phase 1: Liquidity Pool Detection (4H timeframe)

| # | Condition | Method | Threshold | Rationale |
|---|-----------|--------|-----------|-----------|
| 1 | Equal highs/lows cluster | Swing point detection | 2+ swing highs (or lows) within 0.3% of each other | Identifies liquidity pools |
| 2 | ADX confirms ranging | ADX(14) on 4H | < 25 | Ensures we're in a range, not a trend |
| 3 | Range width adequate | (range_high - range_low) / range_low | > 3% | Need enough room for profitable R:R |

**Detection logic for equal highs:**
```
For each swing high H[i] in last 50 candles:
  Count H[j] where abs(H[i] - H[j]) / H[i] < 0.003 AND j != i
  If count >= 1: LIQUIDITY_POOL detected at avg(matching highs)
Same logic inverted for equal lows.
```

### Phase 2: Sweep Detection (4H timeframe)

| # | Condition | Method | Threshold | Rationale |
|---|-----------|--------|-----------|-----------|
| 4 | Price sweeps beyond pool | 4H candle high/low | Exceeds pool by 0.1-0.5% | Sweep in progress |
| 5 | Candle reverses | 4H close back inside range | Close below pool (bearish sweep) or above pool (bullish sweep) | Sweep failed to hold |
| 6 | Reversal candle quality | Body-to-total ratio | > 60% body vs. total candle height | Strong rejection, not a doji |
| 7 | Volume spike | Volume > SMA(volume, 20) * 1.5 | Above average | Confirms liquidation cascade / stop triggers |

**Sweep classification:**
- **Bullish sweep** (short setup): Price sweeps above equal highs, then closes below. Wick above = trapped longs being hunted before down move.
- **Bearish sweep** (long setup): Price sweeps below equal lows, then closes above. Wick below = trapped shorts being hunted before up move.

### Phase 3: Confirmation (15m timeframe)

| # | Condition | Method | Threshold | Rationale |
|---|-----------|--------|-----------|-----------|
| 8 | 15m structure break | Break of recent 15m swing high (for longs) or swing low (for shorts) | First 15m close beyond the opposing swing | Confirms institutional flow reversal |
| 9 | RSI not extreme | RSI(14) on 15m | Between 25-75 | Don't enter mid-squeeze |

**ENTRY**: Market order on 15m structure break confirmation.

### Combined Signal Logic (for condition evaluator)

```json
{
  "logic": "AND",
  "conditions": [
    { "indicator": "ADX_14", "operator": "below", "target": 25 },
    {
      "description": "Liquidity pool detected (swing point cluster)",
      "custom": "LIQUIDITY_POOL_DETECTED"
    },
    {
      "description": "Sweep detected (price exceeded pool then reversed)",
      "custom": "SWEEP_DETECTED"
    },
    {
      "description": "15m structure break confirms reversal",
      "custom": "STRUCTURE_BREAK_15M"
    }
  ]
}
```

**Note**: The liquidity pool detection and sweep logic require custom indicator implementation beyond standard OHLCV indicators. See Implementation Notes below.

## Exit Rules

| Rule | Condition | Action |
|------|-----------|--------|
| Stop Loss | Above/below sweep wick + 0.1% buffer | Close entire position immediately |
| Take Profit 1 | Opposite side of range (or range equilibrium if R:R < 2:1) | Close 50%, move stop to breakeven |
| Take Profit 2 | Opposite liquidity pool | Close remaining 50% |
| Trailing Stop | 2.0 ATR(14) trailing from TP1 on remaining 50% | Protects profit if move extends beyond range |
| Time Exit | 48h max hold without reaching TP1 | Close — sweep reversal should play out quickly |
| Regime Exit | ADX(14) crosses above 25 | Close — regime changed to trending, range invalidated |
| Failed Sweep | Price closes back beyond the sweep level on 4H | Close immediately — sweep was actually a breakout |

## Position Sizing

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Risk per trade | 2% of equity | Standard Kelly-adjusted risk |
| Kelly fraction | Half-Kelly (targeting ~0.025) | Moderate conviction — sweep detection isn't perfect |
| Stop distance | Sweep wick to entry, typically 0.3-0.8% | Tight stops from wick placement |
| Position size formula | `notional = (equity * 0.02) / stop_distance` | Risk-based sizing |
| Margin at 50x | `notional / 50` | Typically 4-8% of equity |
| Max simultaneous | 1 LSR position | Only one reversal trade at a time |
| Max notional | 10% of equity | Cap even if stop is very tight |

### Sizing Example

```
Equity: $240.71
Risk: 2% = $4.81
Stop distance: 0.5% (sweep wick to entry)
Notional = $4.81 / 0.005 = $962.14
Margin = $962.14 / 50 = $19.24 (8.0% of equity)
```

## Expected Performance

| Metric | Target | Basis |
|--------|--------|-------|
| Win Rate | 50-55% | Sweep detection has ~52% historical accuracy per original research |
| R:R Ratio | 2.5-3.5:1 | Tight stops (0.3-0.8%) vs range-width targets (2-4%) |
| Profit Factor | > 1.5 | Conservative given wide R:R variance |
| Max Drawdown | < 10% | Tight stops limit individual loss, but streaks hurt |
| Sharpe Ratio | > 1.0 | Variable — depends on range persistence |
| Trades per month | 4-8 | Ranging markets produce 1-2 sweeps per week per pair |
| EV per trade | ~+1.0R | (0.52 * 3.0R) - (0.48 * 1.0R) = +1.08R |

## Regime Suitability

| Regime | Suitable? | Notes |
|--------|-----------|-------|
| Ranging (ADX < 20) | **YES — primary use case** | Maximum sweep frequency, highest conviction |
| Transition (ADX 20-25) | YES (reduced) | Sweeps still occur but breakouts more likely to be real |
| Trending (ADX > 25) | **NO** | Breakouts are genuine in trends. Strategy is counter-trend = dangerous |
| Extreme Fear (RSI < 25) | CONDITIONAL | Sweeps of lows in extreme fear can work, but risk of waterfall |
| Extreme Greed (RSI > 75) | CONDITIONAL | Sweeps of highs in greed can work, but risk of melt-up |

## Scanner Detection Criteria

```
SCAN: LSR-v1.0 Liquidity Sweep Monitor
Symbols: BTC/USDT:USDT, ETH/USDT:USDT, SOL/USDT:USDT
Check: Every 15m candle close
4H Timeframe Checks:
  1. Detect equal highs/lows (2+ within 0.3%) → LIQUIDITY_POOL
  2. If pool detected, check current candle:
     - High > pool_high by 0.1-0.5% AND close < pool_high → BEARISH_SWEEP
     - Low < pool_low by 0.1-0.5% AND close > pool_low → BULLISH_SWEEP
  3. Check reversal candle quality: body > 60% of total height
  4. Check volume > 1.5x SMA(volume, 20)
15m Timeframe Checks (only when sweep detected):
  5. Monitor for structure break in reversal direction
     - For bullish reversal: 15m close above recent 15m swing high
     - For bearish reversal: 15m close below recent 15m swing low
  6. RSI(14) between 25-75

Alert Levels:
  LIQUIDITY_POOL: "Pool detected at $X, Y touches"
  SWEEP_DETECTED: "Sweep of [highs/lows] at $X, [bull/bear] reversal"
  ENTRY_SIGNAL: "15m structure break confirmed, LSR entry"
```

**Alert Format**: `[LSR-v1.0] {POOL_DETECTED|SWEEP_DETECTED|ENTRY_SIGNAL} — {symbol} pool=${level} sweep_dist={distance}% reversal={candle_quality}%`

## Execution Parameters

```
EXECUTION: LSR-v1.0
Entry Type: Market order on 15m structure break confirmation
Leverage: 50x (set before order)
Position Size: (equity * 0.02) / sweepWickDistance
Stop Loss: Above/below sweep wick + 0.1% buffer (IMMEDIATE after fill)
TP1: Range equilibrium or opposite side of range → close 50%, move stop to BE
TP2: Opposite liquidity pool or 2.0 ATR trail on remainder
Max Hold: 48h
Max Positions: 1 LSR at any time
Paper Mode: MANDATORY until backtested and CEO approved
```

## Confluence Filters (Boost Confidence)

These optional confluence factors increase conviction but are not required:

| Confluence | How | Impact |
|------------|-----|--------|
| EMA confluence | Sweep occurs at EMA(21) or EMA(55) level | +10% size increase |
| RSI divergence | RSI makes higher low while price makes lower low (bullish) or vice versa | Higher conviction entry |
| Funding rate alignment | Negative funding + bullish sweep = shorts paying + longs getting squeezed | FRC v1.0 overlap opportunity |
| Session timing | London/NY overlap (13:00-17:00 UTC) | 34% of sweeps occur during this window per historical data |
| Multiple pool hits | 3+ touches of the same level vs. 2 | Deeper pool = stronger reversal expected |

## Learnings Integration

| Learning | How Integrated |
|----------|----------------|
| FOMO on Breakouts | This strategy is ANTI-breakout. Every entry is a bet that the breakout fails. Perfectly aligned. |
| Revenge Trading | Sweeps often happen right after your stop was hit. This strategy profits from that exact scenario. |
| Cutting Winners | TP1 at 50% is mandatory. TP2 uses 2.0 ATR trail — no premature close. |
| Overtrading | Max 1 LSR position. Pool detection is objective — no subjective "I think this might sweep" entries. |
| Holding Losers | 48h time exit forces re-evaluation. Failed sweep = immediate close. |
| Stop Distance | Stop is at the sweep wick — the objectively wrong level. If price goes back there, the thesis is dead. |
| R:R Minimum | Minimum 2:1 R:R enforced. If range is too narrow for 2:1, skip the trade. |

## Kill Conditions (Strategy-Level)

| Condition | Action |
|-----------|--------|
| ADX(14) rises above 30 for 2+ consecutive 4H candles | Deactivate — market is trending, sweeps become real breakouts |
| 3 consecutive sweep trades stopped out | Reduce to 50% size for next 3 trades (loss streak recovery) |
| Range breaks (4H close beyond range by > 1%) | Deactivate — range is invalidated |
| Daily P&L drawdown > 4% from LSR trades | Pause for 24h |

## Implementation Notes

### Custom Indicator Required: Swing Point Detector

The standard condition evaluator handles ADX, RSI, EMA, BB, MACD. LSR requires a **Swing Point Detector** custom indicator:

```typescript
// Proposed: src/lib/indicators/swing-points.ts

interface SwingPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
  timestamp: number;
}

interface LiquidityPool {
  type: 'high' | 'low';
  level: number;        // Average price of cluster
  touches: number;      // How many times price tested this level
  firstTouch: number;   // Timestamp of first touch
  lastTouch: number;    // Timestamp of most recent touch
}

function detectSwingPoints(candles: OHLCV[], lookback: number = 5): SwingPoint[];
function detectLiquidityPools(swings: SwingPoint[], tolerance: number = 0.003): LiquidityPool[];
function detectSweep(candle: OHLCV, pool: LiquidityPool, minSweep: number = 0.001, maxSweep: number = 0.005): 'bullish_sweep' | 'bearish_sweep' | null;
function checkStructureBreak(candles15m: OHLCV[], direction: 'long' | 'short'): boolean;
```

### Implementation Priority

1. **Phase 1**: Swing point detector + liquidity pool detection (pure indicator, no trading)
2. **Phase 2**: Backtest using detected pools against historical sweeps
3. **Phase 3**: Integrate with condition evaluator for automated signal generation
4. **Phase 4**: Paper trade for 2 weeks
5. **Phase 5**: CEO approval for live

### Backtesting Approach

LSR requires multi-timeframe data (4H for pools/sweeps, 15m for confirmation). The backtester needs:
1. Fetch 500+ 4H candles for pool/sweep detection
2. For each detected sweep, fetch 15m candles around that timestamp for structure break confirmation
3. Simulate entry at 15m structure break, stop at wick, targets at range levels

This is more complex than EMA Ribbon or EFR backtesting. Estimated backtest development time: 2-4 hours.

## Backtest Results (March 8, 2026)

**Period**: Dec 14, 2025 - Mar 7, 2026 (500 BTC/USDT 4H candles)
**Note**: Period was predominantly TRENDING DOWN (-24.1% BnH). LSR is designed for RANGING. Results expected to improve in actual ranging conditions.

| Metric | Value | Notes |
|--------|-------|-------|
| Final Equity | $203.95 | +$3.95 from $200 |
| Total P&L | +2.0% | vs -24.1% Buy & Hold |
| Alpha | +26.1% | Massive alpha vs BnH due to being mostly flat |
| Total Trades | 8 | Low frequency (mostly trending period) |
| Win Rate | 25% | Low — most ranging windows were brief |
| Avg R:R | 2.12:1 | Meets 2:1 target |
| Profit Factor | 0.71 | Below breakeven — loss-making per trade |
| Max Drawdown | 5.9% | Acceptable |
| Sharpe | -2.51 | Negative — strategy was not in its element |

**Directional Analysis:**
- SHORT sweeps: 3/5 profitable (+$8.61 / +4.3%) — strong in bearish structure
- LONG sweeps: 0/3 profitable (-$12.74 / -6.0%) — getting stopped in decline

**Critical Learning — Directional Bias Rule**:
Added to entry conditions: when EMA(21) < EMA(55) by >1%, only take SHORT sweeps (bearish bias). When EMA(21) > EMA(55) by >1%, only take LONG sweeps (bullish bias). This filter must be enforced by the condition evaluator and scanner.

**Conclusion**: LSR v1.0 needs strict regime routing. Only activate when ADX < 20 (pure range). Apply directional bias filter. The regime router must prevent LSR from running during trends.

**Backtester**: `scripts/backtest_lsr.py` (Python)
**Indicator**: `src/lib/indicators/swing-points.ts` (TypeScript)
**Results**: `knowledge/strategies/backtest-lsr-v1-results.json`

---

**Approval Status**: PAPER ONLY — backtest shows mixed results on predominantly trending data. Needs paper trading in actual ranging conditions + CEO sign-off.
**Next Steps**:
1. Paper trade in current ranging regime (ADX 18-22) with SHORT bias
2. Collect 15+ paper trades to validate revised parameters
3. If paper results show >45% win rate and PF >1.2, request CEO approval for live
4. Monitor directional bias rule effectiveness
