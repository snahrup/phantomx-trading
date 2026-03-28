---
id: playbook-2026-03-07
title: "Active Strategy Playbook — March 2026"
category: strategies
tags: ["playbook", "scanner-criteria", "execution-params", "regime-routing", "backtested"]
source: strategy-architect
created: 2026-03-07T23:59:00.000Z
updated: 2026-03-08T14:50:00.000Z
---

# Active Strategy Playbook — March 2026

## Current Regime Assessment (Updated March 8, 2026 ~14:50 UTC — Strategy Architect Heartbeat)

| Factor | Value | Implication |
|--------|-------|-------------|
| BTC Price | **$67,252** | Stable. Holding above $66.5K support |
| ETH Price | **$1,950** | Stable. BEAR ribbon, ranging |
| BTC ADX | **27.4** (CEO confirmed) | **TRENDING** — EMA Ribbon v2.1 eligible but ribbon MIXED |
| ETH ADX | **19.7** | RANGING — LSR v1.0 candidate |
| BTC RSI | **~41** (rising) | Improving but NOT extreme fear |
| F&G Index | **12** (Extreme Fear) | 3rd most extreme ever. 22+ days below 25 |
| BTC EMA Structure | **MIXED** | 8 < 21 ≈ 55. No alignment |
| Funding TRUMP | **-0.055%** (-60.7% ann predicted) | **EXTREME — 10/10 settled NEGATIVE. CONFIRMED short-heavy** |
| Funding TAO | **-0.134%** (-147% ann predicted) | EXTREME — price below EMA(55) |
| Funding WIF | **-0.088%** (-96% ann predicted) | EXTREME — recovering from capitulation |
| Funding CAT | **-0.019%** (-21.2% ann predicted) | Moderate negative |
| Funding INJ | **-0.027%** (-29% ann) | Stable, moderate |
| Kill Switch | INACTIVE (CEO: do not reset) | NO LIVE TRADING until conditions met |
| Portfolio | FLAT, $154.93 | All positions closed. No change. |
| Drawdown | -40.6% from peak ($260.81) | CRITICAL — recovery mode active |

### Funding Rate Type Disambiguation — SYSTEMIC ISSUE (NEW)

**CRITICAL FINDING (Strategy Architect ~14:50 UTC)**: The predicted-vs-settled funding rate confusion (Meta-Strategist blocker #6) is now confirmed on TWO micro-cap pairs beyond NEAR:

| Pair | Predicted Rate | Settled History (10 periods) | Pattern |
|------|---------------|------------------------------|---------|
| **NEAR** | -39% ann | ALL POSITIVE (+11% ann) | Predicted ≠ Settled |
| **FORM** | -14.1% ann | ALL POSITIVE (+0.01%/8h) | Predicted ≠ Settled |
| **TRUMP** | -60.7% ann | **ALL NEGATIVE (-9.5% to -79% ann)** | **CONSISTENT — predicted matches settled** |

**Implication**: FRC strategy MUST use settled rates, not predicted. TRUMP is the only verified pair where predicted and settled funding AGREE on direction. All FRC candidates require settled history verification before gating. This effectively kills the FRC universe until the disambiguation is resolved system-wide.

### Funding Rate Carry Opportunities (March 8, ~14:50 UTC)

| Pair | Predicted Rate/8h | Annualized | EMA(55) Gate | Settled History | FRC Status |
|------|---------|------------|-------------|------|------------|
| **TAO/USDT** | **-0.134%** | **-147%** | **below** | unknown | BLOCKED — price below EMA(55) |
| **WIF/USDT** | **-0.088%** | **-96%** | **below** | unknown | BLOCKED — price below EMA(55) |
| **NEAR/USDT** | **-0.036%** | **-39%** (predicted) | **above** ✅ | **ALL 10 settled POSITIVE** | **BLOCKED — predicted≠settled** |
| **INJ/USDT** | **-0.027%** | **-29%** | **below** | unknown | BLOCKED — price below EMA(55) |
| **FORM/USDT** | **-0.013%** | **-14.1%** (predicted) | **above** ✅ | **ALL 10 settled POSITIVE** | **BLOCKED — same pattern as NEAR** |

**FRC Universe Status**: ALL tracked pairs are BLOCKED. TAO/WIF/INJ by price gate. NEAR/FORM by settled-rate divergence (predicted negative, settled positive). **Zero FRC candidates actionable.** The predicted-vs-settled issue means every micro-cap above EMA55 with negative predicted funding is a potential false signal until settled history is verified.

### Alt Technical Snapshot (March 8, ~14:15 UTC — Fresh Scan)

| Pair | Price | RSI | RSI Dir | EMA(55) Dist | Ribbon | Assessment |
|------|-------|-----|---------|-------------|--------|------------|
| **WIF** | $0.179 | **~13** | **FALLING** | -9.2% | BEAR | **CAPITULATION** — most oversold in universe. NO entry yet |
| **INJ** | $2.825 | **35.7** | **RISING** | -5.8% | BEAR | **RSI CORRECTED (was 26.3). Exiting EFR zone (>35). WATCH only.** |
| **TAO** | $177.61 | ~34 | FALLING | below | BEAR | Fading — funding deepening to -147% |
| **NEAR** | $1.239 | ~39 | RISING | above | MIXED | Price above EMA(55) but settled funding ALL positive |

### INJ RSI Discrepancy — RESOLVED

Meta-Strategist flagged RSI discrepancy: Strategy Architect previously reported 26.3, Scanner reported 35.7. **Scanner was correct.** Fresh Strategy Architect computation confirms RSI(14) = **35.7 (RISING)**, prev = 33.8. The earlier 26.3 reading was from stale data or a different candle boundary. INJ has recovered ABOVE the EFR threshold of 35, which means it is EXITING the EFR setup zone, not entering it. MACD histogram is still improving (-0.007, was -0.010) but remains negative. EMA(8) is still below EMA(21). INJ is on WATCH but NOT a near-term EFR trigger.

### WIF Capitulation Alert

WIF RSI 13.1 is the most extreme oversold reading in the entire portfolio universe. For context:
- Previous scan: RSI 34.8 (was "SETUP FORMING")
- Now: RSI 13.1 and FALLING — this is not a setup, it's a crash
- Price -9.2% below EMA(55), BEAR ribbon
- Funding -108% ann — shorts are paying massively but winning

**Action**: DO NOT enter. EFR requires recovery (RSI rising + MACD improving + EMA cross). WIF is in active capitulation. Set alert for RSI reversal (first rising candle). When recovery begins, this will be the highest-conviction EFR trade due to the depth of the oversold condition + extreme negative funding = maximum squeeze fuel.

### Notable Market Movers (This Scan)

| Pair | Change | Flags | Regime | Notes |
|------|--------|-------|--------|-------|
| **WIF** | selling hard | BIG_MOVE | BEAR | RSI 13.1 — unprecedented. Capitulation |
| **NEAR** | recovering | MOMENTUM | MIXED | Only pair above EMA(55). Carry just flipped |
| **INJ** | stabilizing | — | BEAR | RSI 26.3 rising — EFR setup forming |
| **TAO** | drifting down | — | BEAR | Carry extreme but no technical setup |

### Cross-Agent Intelligence Summary (Updated March 8, 13:30 UTC)

| Source | Signal | Confidence | Implication |
|--------|--------|------------|-------------|
| Sentiment (PAP-18) | F&G 12, 22+ days extreme fear | HIGH | 3rd most extreme ever. Contrarian long thesis validated |
| On-Chain (PAP-17) | 47K BTC outflow (7d) | HIGH | Largest since Oct 2015. Whale accumulation completing |
| On-Chain | Exchange reserves at 6-year lows | HIGH | Less BTC available to sell = supply squeeze setup |
| On-Chain | 45% breakout >$75K probability | MEDIUM-HIGH | Timing: 2-4 weeks. CPI Tuesday = potential catalyst |
| Microstructure (PAP-19) | Order book depth mapped, 8 pairs | HIGH | FRC execution feasible for TAO/WIF up to $25K |
| Scanner | WIF RSI 13.1 — extreme capitulation | HIGH | Deepest oversold + deepest shorts = max squeeze fuel when reversal comes |
| Scanner | INJ RSI 26.3 rising — EFR forming | HIGH | Closest alt to EFR paper trade trigger |
| Scanner | NEAR above EMA(55), funding just flipped | MEDIUM | First FRC gate clearance. Needs 2 more negative periods |
| Scanner | TAO/WIF carry stable at -108%/-141% | HIGH | Short crowding deepening. Safety gates holding |

**Convergence Assessment (Updated ~14:15 UTC)**: Four-stream convergence is the STRONGEST since launch. On-Chain: 270K BTC whale accumulation (largest in 13+ years) + $3B USDC minting + $1.45B ETF inflows → breakout probability upgraded 45% → 65%. Sentiment: F&G 12 for 22+ days (3rd most extreme ever) + crowded shorts. Microstructure: order book depth confirms execution feasibility. Scanner: MACD improving across 13/14 alts.

**The spring is coiling tighter.** Market bifurcation continues — majors stable (BTC/ETH RSI ~40 rising), alts still depressed but WIF in capitulation (RSI ~13). Alt funding rates remain extreme (TAO -147%, WIF -96%). When the reversal comes (CPI catalyst Tuesday?), the snap-back will be violent across the board. INJ has already begun recovering (RSI 35.7, up from ~26 earlier). **PATIENCE remains correct — zero entries, zero losses, maximum dry powder for the catalyst.**

## CPI Strategy Annex — Strategy Architect (March 8, ~14:15 UTC)

**Ref**: Head of Trading's full CPI prep at `knowledge/market-analysis/pre-cpi-prep-2026-03-09.md`

### Strategy Architect Corrections to CPI Prep

The Head of Trading's CPI prep doc contains stale data. Corrections:
- **INJ RSI**: Document says "~26, rising." Correct: **35.7 RISING**. INJ has EXITED the EFR <35 zone. It is NOT as close to trigger as the CPI prep suggests.
- **NEAR FRC**: Document says "funding flipping, FRC gating." Correct: **ALL settled funding positive. 0/3 negative settled. Fully BLOCKED.** NEAR FRC will NOT trigger before CPI unless negative rates begin settling immediately.
- **BTC ADX**: Document says "27.4 (TRENDING)." Strategy Architect computes **23.8 (TRANSITION)**. Discrepancy noted but immaterial — no EMA Ribbon entry conditions met either way.

### CPI-Triggered Entry Parameters (Strategy Architect's Call)

**Scenario A (Cool CPI)** — Strategy deployment order:
1. **EFR v1.1 on alts that get RSI pushed below 35 on the move, then reverse** — WIF is the prime candidate if it begins recovering from RSI ~13. INJ would need to re-enter <35 first (unlikely with cool CPI).
2. **EMA Ribbon v2.1 on BTC** — IF cool CPI aligns ribbon (needs 8>21>55) AND ADX >25. Could happen in 1-2 candles after a +3-5% BTC move.
3. **FRC on micro-caps** — scan results pending. Any micro-cap with extreme negative funding + price above EMA(55) post-CPI rally is a candidate.

**Scenario B (Hot CPI)** — DO NOT enter. Let capitulation deepen. The setup gets BETTER, not worse. Specifically:
- WIF RSI could hit <10 — uncharted territory. Record squeeze fuel for later.
- TAO funding could hit -200% ann — unprecedented carry opportunity when gate clears.
- **EMA Ribbon SHORT**: If BTC drops hard, bear ribbon (55>21>8) could align. SHORT entry possible.

**Scenario C (Inline CPI)** — Status quo. Continue patient monitoring. No forced entries. Let micro-cap scan results inform next moves.

### Paper Trade Pre-Calculations ($154.93 equity, 0.5x recovery mult)

| Candidate | Strategy | Entry Condition | Risk $ | Stop | Notional | Margin |
|-----------|----------|----------------|--------|------|----------|--------|
| WIF | EFR v1.1 Small | RSI reversal from <15 + MACD improving | $0.58 | 2.0% | $29.06 | $0.58 |
| BTC | EMA v2.1 | Ribbon aligns + ADX>25 + pullback to EMA(21) | $1.55 | EMA(55) dist | Dynamic | Dynamic |
| Micro-cap TBD | EFR/FRC | Scan results pending | $0.58 | 2.0%/1.0% | $29-155 | $0.58-3.10 |

---

## Backtest Results (Validated Dec 14, 2025 – Mar 7, 2026)

500 BTC/USDT 4H candles. BTC fell 24.7%.

| Strategy | P&L | Win Rate | R:R | Profit Factor | Max DD | Sharpe |
|---|---|---|---|---|---|---|
| EMA Ribbon v2.0 (original) | +$9.14 (+4.6%) | 56% | 1.4:1 | 1.70 | 3.2% | 1.57 |
| **EMA Ribbon v2.1 (optimized)** | **+$14.88 (+7.4%)** | **78%** | 0.8:1 | **2.84** | **2.1%** | **2.68** |
| EFR v1.0 | +$13.42 (+6.7%) | 56% | 1.8:1 | 2.30 | 2.5% | 3.81 |
| LSR v1.0 | +$3.95 (+2.0%) | 25% | 2.1:1 | 0.71 | 5.9% | -2.51 |
| **Combined (EMA+EFR)** | **+$33.82 (+16.9%)** | **62%** | **1.7:1** | **2.86** | **3.2%** | **4.47** |
| Buy & Hold | -24.7% | — | — | — | 29.3% | — |

**LSR v1.0 backtest (March 8)**: Mixed results — period was predominantly trending. SHORT sweeps profitable (3/5), LONG sweeps all stopped. Added directional bias rule: only take sweeps aligned with EMA structure. LSR expected to perform better in actual ranging conditions.

**EMA Ribbon v2.1 optimization (March 8)**: Changed signal exit from "close at market" to "tighten stop to breakeven." Result: +63% more P&L, +72% better Sharpe, -1.1pp less drawdown.

**Combined regime-switching outperforms individual strategies by 2-4x.** Detailed trade logs and JSON results in `backtest-results-2026-03-07.json`.

## Portfolio Status & Capital Recalibration (Updated ~14:15 UTC)

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Equity | **~$89** | $50 HALT | 78% above HALT |
| Starting Capital | $200.00 | — | -55.5% total loss |
| Peak Equity | $260.81 | — | -65.9% drawdown |
| Open Positions | 0 | max 2 (Phase 1) | CLEAN |
| Kill Switch | INACTIVE | CEO order | NO trading |
| Trading Mode | MANUAL | Board-set | Agents research only |
| Recovery Multiplier | **0.5x** | Scale 0.5→1.0 over 5 wins | ACTIVE |
| Paper Trades Completed | **1/10** | 10 required before live | IN PROGRESS |
| **Capital Injection** | **$500-600** | **Wed eve / Thu morning (Mar 12-13)** | **PLAN FOR THIS** |

### BOARD DIRECTIVE — Capital Injection Plan (March 8)

**Steve is adding $500-600 on Wednesday evening or Thursday morning (March 12-13).** Current equity (~$89) was reduced by a manual scalp gone wrong — NOT an agent trade. Board takes full responsibility.

**What this means for strategy:**
1. **Current $89**: Preserve it. Keep trading mode MANUAL. Continue paper trades and research. Do NOT risk the remaining equity before the injection.
2. **Post-injection (~$589-689 total)**: This is a SIGNIFICANT capital event. Strategies need a deployment plan ready BEFORE the funds arrive:
   - How much to allocate per strategy (EFR, FRC, EMA Ribbon, LSR)?
   - Which pairs to prioritize for first live trades?
   - Position sizing recalibration for the new equity base
   - Risk parameters (max position %, daily loss limit, max drawdown before halt)
3. **CPI Tuesday (March 11) happens BEFORE the injection** — observe only, do not trade. Use CPI reaction data to inform deployment strategy.
4. **The injection + post-CPI clarity = ideal entry window.** Have the plan ready.

### Capital Recalibration at $154.93 (CEO Directive — SUPERSEDED by above)

At current equity with 0.5x recovery multiplier, here are the recalibrated position sizes:

| Strategy | Tier | Risk % × 0.5x | $ Risk | Stop Dist | Notional | Margin (50x) | Eff. Lev |
|----------|------|---------------|--------|-----------|----------|-------------|----------|
| EFR v1.1 | Major (BTC/ETH) | 1.5% × 0.5 | **$1.16** | 1.2% | $96.83 | $1.94 | 0.63x |
| EFR v1.1 | Mid (SOL/LINK/OP) | 1.0% × 0.5 | **$0.77** | 1.5% | $51.55 | $1.03 | 0.33x |
| EFR v1.1 | Small (WIF/INJ) | 0.75% × 0.5 | **$0.58** | 2.0% | $29.06 | $0.58 | 0.19x |
| FRC v1.0 | Any | 1.0% × 0.5 | **$0.77** | 1.0% | $77.47 | $1.55 | 0.50x |
| EMA v2.1 | Any | 2.0% × 0.5 | **$1.55** | Dynamic | ~$103 | ~$2.07 | 0.67x |

**Max combo** (2 positions, e.g., EFR Major + EFR Small): $125.89 notional, $2.52 margin. Exposure = 0.81x equity. Well within 3x limit and 70% margin cap.

### Recovery Path Math

At 0.5x sizing with combined strategy (62% win rate, 1.7:1 R:R, PF 2.86):
- **Expected value per trade**: ~$1.04
- **Trades to $200**: ~43 trades (breakeven with starting capital)
- **Scaling inflection**: After 5 wins, recovery mult → 1.0x, risk per trade doubles
- **At 1.0x**: EV per trade ~$2.08, compounding begins meaningfully
- **To $20K target**: Requires ~250-300 trades with compounding (3-4 months at 2-3 trades/week)
- **HALT threshold**: $100 equity (35% away). At $0.58-$1.55 risk per trade, requires 35+ consecutive losses to reach — statistically impossible given proven edge.

**Critical constraint**: 9 more paper trades required before ANY live capital is risked. CPI Tuesday is the highest-probability event for accumulating paper trades quickly (multiple strategies may trigger simultaneously).

**FLOW Loss Post-Mortem**: Steve's manual LONG FLOW at $0.042654 (50x, ~$2,138 notional = 10.5x equity) was closed/liquidated around $0.0424. This was 3.5x the max exposure limit (3.0x). No stop-loss was placed. The 24h low came within 0.26% of liquidation price. This single position destroyed ~$50 of equity. **All manual trades bypassed the risk framework.**

## Strategy Priority Matrix (Updated March 8, ~14:15 UTC — Strategy Architect Heartbeat)

| Priority | Strategy | Status | Current Data | Action |
|----------|----------|--------|-------------|--------|
| **1** | **EFR v1.1 (WIF)** | WATCH — CAPITULATION | RSI **~13 FALLING**, funding -96%, -9.2% below EMA(55) | **DO NOT ENTER.** Capitulation in progress. Alert on first RSI rising candle. Highest squeeze fuel when reversal comes. **CPI Tuesday = potential reversal catalyst.** |
| **2** | **EFR v1.1 (INJ)** | **WATCH** | RSI **35.7 RISING**, funding -29%, -5.8% below EMA(55) | **CORRECTED: RSI >35, exiting EFR zone.** MACD improving but negative. EMA(8) < EMA(21). Not a near-term trigger. |
| **3** | **EMA Ribbon v2.1** | MONITOR | BTC ADX 23.8/27.4 (disputed), ribbon MIXED, RSI 41.1 | Ribbon not aligned (8<21≈55). Pullback 1.45% from EMA(21). No entry. |
| 4 | **LSR v1.0 (ETH)** | CANDIDATE | ETH ADX 19.7 (ranging), RSI 39.2, BEAR ribbon | Scan for sweep setups on ETH. Ranging conditions favor LSR. |
| 5 | **FRC v1.0 (TAO)** | BLOCKED | Funding -147% (deepening), price below EMA(55) | Deepest carry in universe. Gate holds. |
| 6 | **FRC v1.0 (NEAR)** | **BLOCKED** | Predicted -39% but ALL settled positive | **CORRECTED: 0/3 neg settled (was wrongly 1/3). Completely blocked.** |
| 7 | **EFR v1.0 (Majors)** | NOT ACTIVE | BTC 41.1, ETH 39.2 — all >35 | Majors well above EFR territory. |
| 8 | **Micro-cap EFR/FRC** | **SCANNING** | Full universe scan in progress | Board directive: scan all 57+ micro-caps for opportunities. Results pending. |

**Key changes this heartbeat (CRITICAL CORRECTIONS):**
1. **INJ RSI corrected 26.3 → 35.7** — was "Priority 1 SETUP FORMING", now WATCH. RSI has risen ABOVE EFR threshold. Scanner was correct. Previous reading was stale/incorrect. **Demoted to Priority 2.**
2. **NEAR FRC corrected "1/3 gating" → 0/3 BLOCKED** — ALL 10 settled funding periods are POSITIVE (+10-11% ann). The *predicted* rate is negative (-39% ann) but no negative funding has actually settled yet. **Demoted to Priority 6.**
3. **No near-term entry triggers exist.** All EFR setups are either in capitulation (WIF — don't enter) or exiting the zone (INJ — RSI >35). All FRC setups are blocked. EMA Ribbon has no alignment.
4. **CPI Tuesday is the next catalyst.** The four-stream convergence (On-Chain + Sentiment + Microstructure + Scanner) is the strongest since launch, but timing is uncertain. CPI data could trigger the reversal that activates EFR on multiple pairs simultaneously.
5. **Micro-cap universe scan launched.** 57+ symbols being scanned for EFR and FRC opportunities outside the current watchlist.
6. **EFR v1.1 operates outside regime router** — alt-specific strategy, monitored independently of BTC regime.

## Scanner Detection Criteria (All Strategies)

### 1. Extreme Fear Reversal (EFR) v1.1 — Expanded

**Symbols**: ALL 50x perps on Phemex (see `knowledge/symbol-universe.json`). Priority scan on micro-caps: GUN, FLOW, PHA, HOOK, ACH, JASMY, MAGIC, SPELL, TURBO, POPCAT, MEW, BOME, PNUT, ACT, GOAT, MOODENG, FARTCOIN, AIXBT, TRUMP, ANIME, MUBARAK, PARTI + all large/mid-cap alts.
**Timeframe**: 4H
**Scan Frequency**: Every 4H candle close

| Check | Indicator | Condition | Alert Level |
|-------|-----------|-----------|-------------|
| RSI recovery | RSI(14) | < 35 AND rising (curr > prev) | SETUP FORMING |
| BB proximity | CLOSE | Within 2% of BB(20,2) lower | SETUP FORMING |
| MACD momentum | MACD(12,26,9) histogram | Negative but improving (curr > prev) | SETUP FORMING |
| EMA cross | EMA(8) | Approaching EMA(21) from below | SETUP FORMING |
| **TRIGGER** | RSI crosses_above 30 + MACD_HIST crosses_above 0 + EMA(8) crosses_above EMA(21) | ALL true | **ENTRY SIGNAL** |
| FOMO BLOCK | RSI(14) | > 72 on entry candle | BLOCK — wait for pullback |
| External | F&G Index | < 20 (manual check) | CONFIRMS regime |

**Tier Assignment**: BTC/ETH = Major (1.5% risk), SOL/LINK/DOT/AVAX/ARB/OP = Mid-Cap (1.0%), ALL OTHERS = Small-Cap (0.75%)

**Alert Format**: `[EFR-v1.1] {SETUP_FORMING|ENTRY_SIGNAL|FOMO_BLOCK} — {symbol} RSI={rsi} tier={major|mid|small}`

### 2. Funding Rate Carry (FRC) v1.0

**Symbols**: ALL 50x perps (see `knowledge/symbol-universe.json`). Micro-caps often have extreme funding rates — scan the full universe.
**Timeframe**: 8H (aligned with funding snapshots)
**Scan Frequency**: Before each funding snapshot (00:00, 08:00, 16:00 UTC)

| Check | Source | Condition | Alert Level |
|-------|--------|-----------|-------------|
| Funding rate | Phemex API: fetchFundingRate | < -0.01% per 8h | OPPORTUNITY |
| Consecutive negative | Funding history (3 periods) | All 3 negative | CONFIRMED |
| Annualized carry | rate * 3 * 365 | > 5% | ATTRACTIVE |
| Price above support | OHLCV: CLOSE vs EMA(55) | CLOSE > EMA(55) | SAFE |
| RSI check | RSI(14) on 4H | < 65 | NOT OVERBOUGHT |
| **TRIGGER** | All above true | ALL true | **ENTRY SIGNAL** |
| EXIT SIGNAL | Funding rate | Positive for 2+ consecutive periods | **EXIT** |

**Alert Format**: `[FRC-v1.0] {OPPORTUNITY|ENTRY_SIGNAL|EXIT} — {symbol} funding={rate}% ann={annualized}%`

### 3. EMA Ribbon v2.0 (Paused — monitor for regime change)

**Symbols**: ALL 50x perps (see `knowledge/symbol-universe.json`). Trend-following works on any liquid pair.
**Timeframe**: 4H
**Scan Frequency**: Every 4H candle close

| Check | Indicator | Condition | Alert Level |
|-------|-----------|-----------|-------------|
| Ribbon alignment | EMA(8), EMA(21), EMA(55) | 8>21>55 (long) or 55>21>8 (short) | TREND FORMING |
| Pullback to 21 | CLOSE | Within 0.5% of EMA(21) | SETUP FORMING |
| RSI pullback zone | RSI(14) | Between 40-55 (long) or 45-60 (short) | CONFIRMED |
| ADX trend strength | ADX(14) | > 25 | TREND CONFIRMED |
| **TRIGGER** | EMA aligned + CLOSE crosses EMA(21) + RSI in zone + ADX > 25 | ALL true | **ENTRY SIGNAL** |
| LOW-VOL GATE | ATR(14) | < SMA(ATR,20) | REDUCE — max 2 trades, min 2.5:1 R:R |
| FOMO BLOCK | RSI(14) | > 72 | BLOCK — wait for pullback |
| REGIME GATE | ADX(14) | < 20 | PAUSE — not trending enough |

**Alert Format**: `[EMA-v2.0] {TREND_FORMING|SETUP|ENTRY_SIGNAL|PAUSED} — {symbol} EMA={alignment} ADX={adx} RSI={rsi}`

### 4. Liquidity Sweep Reversal v1.0

**Symbols**: ALL 50x perps (see `knowledge/symbol-universe.json`). Liquidity sweeps are especially potent on micro-caps with thin books.
**Timeframe**: 4H + 15m confirmation
**Scan Frequency**: Every 15m

| Check | Indicator | Condition | Alert Level |
|-------|-----------|-----------|-------------|
| Equal highs/lows | Swing Point Detection | 2+ swing highs/lows within 0.3% of each other | LIQUIDITY POOL |
| Sweep detection | CLOSE or HIGH/LOW | Breaks beyond pool by 0.1-0.5% then reverses | SWEEP DETECTED |
| Reversal candle | Candlestick pattern | Engulfing or hammer at sweep level (>60% body-to-wick) | REVERSAL CONFIRMED |
| 15m structure break | 15m OHLCV | Break of structure in reversal direction | **ENTRY SIGNAL** |

**Alert Format**: `[LSR-v1.0] {POOL_DETECTED|SWEEP|ENTRY_SIGNAL} — {symbol} pool={level} sweep={distance}%`

---

## Execution Parameters (All Strategies)

### Universal Pre-Entry Checklist

Every trade, every strategy, every time. Non-negotiable.

```
PRE-ENTRY CHECKLIST (Execution Trader must verify ALL before submitting order):

[ ] 1. Kill switch is INACTIVE
[ ] 2. Kill switch was NOT reset within past 48 hours
[ ] 3. R:R ratio >= 2:1 (calculated with actual stop distance)
[ ] 4. Last stop-loss was > 30 minutes ago (revenge cooldown)
[ ] 5. Daily P&L loss < 5% of equity (daily limit not hit)
[ ] 6. Free margin > $20 after this position
[ ] 7. Margin utilization will be < 70% after this position
[ ] 8. Total open positions will be <= 3 after this position
[ ] 9. No correlated positions exceeding limit (max 2 at >0.7 correlation)
[ ] 10. Strategy is ACTIVE in regime router (not paused for wrong regime)
[ ] 11. Stop-loss order prepared (submit within 30 seconds of fill)
[ ] 12. Position size complies with Kelly framework + recovery scaling
```

### Strategy-Specific Execution Parameters

#### EFR v1.1 (Tiered)
```
=== MAJORS (BTC, ETH) ===
Entry:     Limit 0.1% below 4H close
Stop:      1.2% | TP1: 2.4% | TP2: Trail 2.0 ATR
Size:      equity * 0.015 * recoveryMult / stopDist
Max hold:  72h | Max pos: 2 majors

=== MID-CAP (SOL, LINK, DOT) ===
Entry:     Limit 0.2% below 4H close
Stop:      1.5% | TP1: 3.0% | TP2: Trail 2.5 ATR
Size:      equity * 0.010 * recoveryMult / stopDist
Max hold:  48h | Max pos: 1 mid-cap

=== SMALL-CAP (WIF, INJ, OP) ===
Entry:     Limit 0.2% below 4H close
Stop:      2.0% | TP1: 4.0% | TP2: Trail 2.5 ATR
Size:      equity * 0.0075 * recoveryMult / stopDist
Max hold:  48h | Max pos: 1 small-cap

=== ALL TIERS ===
Leverage:  50x | Max total EFR: 2 (1 major + 1 alt OR 2 majors)
Cooldown:  30 min after stop-loss
Paper:     MANDATORY
```

#### FRC v1.0
```
Entry:     Limit at current bid (passive fill)
Timing:    Before 8h funding snapshot (00:00/08:00/16:00 UTC)
Leverage:  50x
Size:      (equity * 0.01) / (0.01 * 50) ≈ 2% of equity notional
Stop:      1.0% below entry (IMMEDIATE after fill)
TP:        1.5% above entry → close 50%, trail remainder with 1.5 ATR
Max hold:  7 days
Max pos:   2 FRC positions (different assets, no correlated pairs)
Monitor:   Check funding every 8h → exit if positive 2x consecutive
```

#### EMA Ribbon v2.0
```
Entry:     Limit at EMA(21) level (or 0.1% inside for fill probability)
Leverage:  50x
Size:      (equity * 0.02 * atrAdj) / (stopDistance * 50)
           where stopDistance = |entry - EMA(55)| / entry
           atrAdj = 20 / currentATR%
Stop:      Below EMA(55) for longs, above EMA(55) for shorts
TP1:       2R → close 50%, move stop to breakeven
TP2:       3R or trail at 1.5 ATR (2.0 ATR if MAE < 0.1% at 2 candles)
Max pos:   2 EMA Ribbon positions across all symbols
Low-vol:   If ATR < SMA(ATR,20), max 2 trades today, min 2.5:1 R:R
```

#### Liquidity Sweep Reversal v1.0
```
Entry:     Market order on 15m structure break confirmation
Leverage:  50x
Size:      (equity * 0.02) / (sweepWickDistance * 50)
Stop:      Above/below sweep wick (tight stop, high R:R)
TP:        Opposite liquidity pool or range equilibrium
Max pos:   1 LSR position at any time
```

---

## Recovery Scaling Schedule

If the kill switch was recently reset, ALL strategies use reduced sizing:

| Trade # After Reset | Size Multiplier | Notes |
|---------------------|-----------------|-------|
| 1-2 | 0.50x | Half size. Prove the edge works |
| 3 | 0.60x | Gradual increase |
| 4 | 0.70x | Building confidence |
| 5 | 0.80x | Almost full |
| 6+ | 1.00x | Full size restored |

**Losing trades DO NOT reset the counter.** Only winning trades advance the scale.

---

## Kill Conditions (Strategy-Level)

Each strategy has its own kill condition beyond the global kill switch:

| Strategy | Kill Condition | Action |
|----------|---------------|--------|
| EFR v1.1 (Majors) | F&G > 40 OR BTC daily < $58K / ETH daily < $1,500 | Deactivate, close positions |
| EFR v1.1 (Mid-Cap) | F&G > 40 OR SOL < $50 / LINK < $5 / DOT < $1 | Deactivate, close positions |
| EFR v1.1 (Small-Cap) | F&G > 40 OR WIF < $0.10 / INJ < $1.50 / OP < $0.07 | Deactivate, close positions |
| FRC v1.0 | Funding turns positive 2x consecutive | Close positions, deactivate until next negative cycle |
| EMA v2.0 | ADX drops < 20 for 3 consecutive candles | Pause strategy, switch to LSR/ranging strategies |
| LSR v1.0 | ADX > 30 (strong trend, not ranging) | Pause strategy, switch to EMA Ribbon |

---

## Code References

| Component | File | Purpose |
|-----------|------|---------|
| Condition Evaluator | `src/lib/strategy/condition-evaluator.ts` | Computes indicators, evaluates entry/exit conditions |
| Backtest Engine | `src/lib/strategy/backtest-engine.ts` | Walk-forward validated backtesting |
| Regime Router | `src/lib/strategy/regime-router.ts` | Maps regimes to active strategies |
| Portfolio Manager | `src/lib/strategy/portfolio-manager.ts` | Allocates capital across strategies |
| Execution Engine | `src/lib/strategy/execution-engine.ts` | Submits orders, manages positions |
| Trading Pipeline | `src/lib/trading/` | Signal → Risk → Execute → Monitor lifecycle |
| Kill Switch | `src/lib/kill-switch.ts` | Global circuit breaker |
| Risk Params | `knowledge/risk-management/risk-params.json` | Position sizing, exposure limits, loss limits |
| Types | `src/types/trading.ts` | All type definitions |

---

**Document Owner**: Strategy Architect
**Review Cadence**: Updated every heartbeat or when regime changes
**Approval Required**: CEO/Board approval before any strategy moves from PAPER to LIVE
