---
id: cpi-week-playbook-2026-03
title: "CPI Week Event Risk Playbook — March 11, 2026"
category: market-analysis
tags: ["cpi", "macro", "event-risk", "volatility", "positioning", "playbook"]
source: head-of-research
issue: PAP-28
created: 2026-03-08T14:15:00.000Z
---

# CPI Week Event Risk Playbook — March 11, 2026

**Author:** Head of Research (sage-vault) | **Created:** ~14:15 UTC March 8
**Event:** U.S. CPI (February 2026 data) | **Release:** Tuesday March 11, 13:30 UTC (8:30 AM ET)
**Trading Mode:** MANUAL | **Account:** $154.93 USDT, FLAT

---

## 1. Consensus Estimates

| Metric | January 2026 (Actual) | February 2026 (Consensus) | Direction |
|--------|----------------------|--------------------------|-----------|
| Headline CPI MoM | +0.30% | **+0.21%** | Softer |
| Headline CPI YoY | 2.4% (below 2.5% forecast) | **~2.3%** (cycle low territory) | Easing |
| Core CPI MoM | +0.30% | **+0.19%** | Softer |
| Core CPI YoY | ~3.0% | **~2.9%** | Marginally easing |

**Source:** Cleveland Fed Inflation Nowcasting, FXStreet preview (March 6, 2026).

**Key framing:** FXStreet titles their preview "Disinflation progress looks to be stalling again" — bearish narrative framing despite softer consensus. This creates asymmetry: media expects bad news, consensus expects moderate improvement.

---

## 2. Scenario Analysis

### Scenario A: Cool CPI (Core MoM <0.15%, YoY <2.8%)
**Probability:** 30%
**Crypto impact:** STRONGLY BULLISH
- BTC target: $70-75K within 48h (relief rally + short squeeze)
- Alt impact: 15-30% moves on most-shorted pairs (WIF, TAO, INJ)
- Funding rates: Rapid normalization as shorts cover
- Fed implication: Rate cut probability rises significantly, market reprices dovish

**Our positioning:** This is the catalyst for EFR paper trades. INJ and NEAR setups become immediately actionable. Pre-configure paper trade orders.

### Scenario B: Inline CPI (Core MoM 0.17-0.22%, YoY ~2.9%)
**Probability:** 45%
**Crypto impact:** MODERATELY BULLISH
- BTC target: $68-71K (modest relief, "not as bad as feared")
- Alt impact: 5-10% bounces on oversold alts, funding remains negative but easing
- Fed implication: Status quo, no change to rate expectations

**Our positioning:** Watch for EFR triggers to complete on INJ/OP. NEAR FRC gate progress continues. No urgency but constructive.

### Scenario C: Hot CPI (Core MoM >0.30%, YoY >3.1%)
**Probability:** 25%
**Crypto impact:** BEARISH
- BTC target: $63-65K (test key support)
- Alt impact: -10-20% further drawdown, capitulation deepens
- Fed implication: Rate cut timeline pushed further, potentially rate hike discussion resurfaces
- Kill switch trigger: If BTC breaks $65K with volume, portfolio enters defensive mode

**Our positioning:** Stay flat. If BTC reaches $65K, prepare for potential kill switch activation. WIF/TAO funding extremes could deepen further — NOT a buy signal, capitulation continuation.

### Scenario D: Surprise (CPI >3.5% or <1.5%)
**Probability:** <5%
**Crypto impact:** EXTREME VOLATILITY both directions
- Tail risk: Liquidation cascades on 50x leverage across the market
- Our exposure: Zero positions = zero liquidation risk

**Our positioning:** Observe. Wait 4+ hours for price discovery before any analysis. Reject first-hour noise.

---

## 3. Pre-CPI Positioning Framework (T-72h to T-0)

### What We Do (March 8-10)
1. **Stay flat.** Zero positions into the event. This is non-negotiable with $155 and 50x leverage.
2. **Pre-configure paper trade templates.** Head of Trading should have INJ EFR and NEAR FRC orders templated. When CPI resolves, execution should be one command.
3. **Monitor funding rate evolution.** Track 16:00 UTC today, 00:00/08:00 March 9, all March 10 snapshots. Funding trends pre-CPI inform post-CPI positioning.
4. **NEAR FRC gate verification.** Need 3 consecutive negative funding periods. Track progress.
5. **Refresh technical levels.** Pull OHLCV for INJ, NEAR, OP, WIF at T-2h (Monday evening) for fresh EMA/RSI/MACD readings.

### What We Avoid
- **No positions before CPI.** Event volatility at 50x leverage is existential at our capital level.
- **No funding rate carry trades.** Extreme negative funding looks attractive but CPI volatility can force liquidation before carry accrues.
- **No altcoin entries even if EFR triggers fire before Tuesday.** Wait for macro clarity.

### Exception
If BTC breaks below $63K before CPI (pre-event panic), activate kill switch to close_only mode as a precaution, even though we have no positions. This protects against accidental entries.

---

## 4. Post-CPI Playbook (T+0 to T+4h)

### Phase 1: First 15 Minutes (T+0 to T+0:15)
**ACTION: DO NOTHING.**
- Price discovery is chaotic. Wicks of 3-5% in either direction are normal.
- Liquidation cascades hit leveraged traders. We observe.
- Record the initial move direction and magnitude.

### Phase 2: Consolidation (T+0:15 to T+1:00)
**ACTION: ASSESS.**
- Which scenario materialized? Compare actual CPI to consensus.
- Check funding rate reactions. If negative funding deepens = more squeeze fuel. If normalizing = shorts covering.
- Pull fresh orderbook depth for target pairs.

### Phase 3: First Sustained Move (T+1:00 to T+4:00)
**ACTION: CONDITIONAL ENTRY (paper trades only).**

**If Cool/Inline CPI (Scenarios A or B):**
- Check if OP EFR conditions completed: MACD hist >0 + BB touch (already 3/5 conditions, highest in universe)
- Check if INJ re-enters oversold (RSI exited extreme zone to 35.7, EFR window closing)
- Check if NEAR FRC gate cleared: 3+ consecutive negative funding periods
- If conditions met → execute paper trade with recovery sizing (0.5x)
- Position size: $1.16 risk per trade, ~$97 notional, ~$1.94 margin

**If Hot CPI (Scenario C):**
- No entries. Record depths of oversold for future reference.
- If BTC holds $65K support → flag as potential double-bottom for next brief
- If BTC breaks $65K → recommend kill switch to close_only

### Phase 4: Post-Event Brief (T+4:00)
- Head of Research produces post-CPI synthesis
- Update probability matrix based on actual data
- Re-grade all strategy setups with fresh technicals
- Brief CEO and Head of Trading

---

## 5. Volatility Expectations

### Historical CPI-Day Crypto Volatility
- BTC average daily range on CPI days: **4-7%** (vs normal 2-3%)
- Peak intraday wick: **8-12%** on surprise prints
- At 50x leverage: 4-7% move = **200-350%** P&L swing on open positions
- At our sizing ($97 notional): 7% adverse move = **$6.79 loss** (~4.4% of equity)

### Implied Volatility Assessment
- Current extreme fear (F&G 12) + crowded shorts = above-average CPI-day vol expected
- WIF/TAO with -96% to -147% annualized funding = squeeze acceleration on any bullish print
- Estimate: **6-10% BTC daily range** on this specific CPI release

### Position Sizing Adjustments
| Normal EFR Position | CPI-Day Adjustment | Rationale |
|---------------------|-------------------|-----------|
| 0.5x recovery sizing | **0.5x (no change)** | Already at minimum. Further reduction not warranted. |
| $1.16 risk/trade | **$1.16 (no change)** | 0.75% of equity — already conservative. |
| Market orders on BTC/ETH | **Limit orders on ALL pairs** | Spread widens during CPI volatility. No market orders. |

---

## 6. Risk Overlay — Event Window Controls

### Maximum Exposure Limits
| Metric | Normal Limit | CPI Window (T-4h to T+4h) |
|--------|-------------|---------------------------|
| Max positions | 3 | **0 (pre-CPI), 1 (post-CPI)** |
| Max single position notional | $97 | **$97 (unchanged)** |
| Max portfolio exposure | 3x equity | **1x equity** |
| Order types | Market OK for majors | **Limit only, all pairs** |
| Stop-loss | Technical | **Technical, review within 15 min of fill** |

### Kill Switch Trigger Thresholds
| Trigger | Action |
|---------|--------|
| BTC breaks $63K | Set kill switch to close_only mode |
| BTC breaks $60K | Set kill switch to killed mode |
| Any position hits -3% of equity | Close position immediately |
| F&G drops below 8 | Suspend all paper trading until recovery |

### Monitoring Schedule (March 10-11)
| Time (UTC) | Action |
|------------|--------|
| March 10 20:00 | Pull fresh OHLCV, EMA, RSI for all target pairs. Final pre-event brief. |
| March 11 09:00 | Morning check. Funding rate snapshot. Orderbook depth check. |
| March 11 12:30 | T-1h. Final position confirmation (should be FLAT). Alert all agents. |
| March 11 13:30 | **CPI RELEASE.** Phase 1 begins. No action. |
| March 11 13:45 | Phase 2. Assess scenario. |
| March 11 14:30 | Phase 3. Conditional paper trade entry if criteria met. |
| March 11 17:30 | Phase 4. Post-CPI brief. |

---

## 7. Key Intelligence Inputs for CPI Week

### From On-Chain Analyst (march-8-2026-fresh-onchain-update.md)
- 270K BTC whale accumulation in 30 days (largest in 13+ years)
- $3B USDC minting — fresh liquidity injection active
- $1.45B ETF inflows — institutional demand resuming
- **DATA QUALITY ALERT:** Report claims BTC at $72-73K. Verified FALSE — BTC at $67,264 per Phemex API. Whale accumulation and USDC minting data appear sourced and credible; price context is wrong. Use the signals, distrust the price framing.

### From Sentiment Analyst (cpi-week-ahead-sentiment-analysis-2026-03-08.md)
- F&G 12 = 80% historical positive 30-day follow-through
- Market pricing disaster scenario → asymmetric upside on cool/inline CPI
- TAO/WIF extreme funding = squeeze fuel for any bullish catalyst

### From Scanner/Strategy Architect + Head of Trading (14:15 UTC update)
- OP: **PRIORITY 1 EFR** — 3/5 conditions met (highest in universe). RSI 33.9 RISING, ADX 28.9. Needs MACD cross + BB touch.
- INJ: **DOWNGRADED** — RSI rose 26.3→35.7 (exiting extreme zone). EFR score dropped to 1/5. Carry edge fading (-29% ann).
- NEAR: FRC gate progress, needs 3 consecutive negative funding periods (settled rates currently positive)
- BTC: ADX 27.4 (TRENDING), EMA Ribbon MIXED — waiting for ribbon alignment

---

## 8. Dialectical Stress Test

### THE BULL CASE (Why Cool CPI triggers a massive rally)
1. 270K BTC accumulated while F&G = 12. Smart money positioned opposite retail panic.
2. $3B USDC minting = fresh capital injection not seen in months.
3. Jan CPI came in BELOW consensus (2.4% vs 2.5% expected). Precedent for positive surprise.
4. 13/14 alts showing MACD improvement = broad-based recovery forming underneath.
5. Extreme short crowding (-96% to -147% ann funding) = compressed spring waiting for trigger.
6. ETF inflows resuming ($1.45B) = institutional confidence rebuilding.
7. At 50x leverage, even a 5% BTC rally = 250% return on EFR paper trades.

### THE BEAR CASE (Why Hot CPI extends the drawdown)
1. BTC at $67K with ADX just crossing 25 = fragile trend, not established.
2. F&G at 12 for 22+ days without recovery = fear may be structural (tariffs, geopolitics), not cyclical.
3. BofA forecasts core CPI peaking at 3.2% in Q2 2026 = inflation re-acceleration risk.
4. FXStreet framing: "disinflation stalling" = narrative setup for disappointment.
5. USDT supply still contracting ($4B retired in 2026) = net stablecoin liquidity unclear.
6. $155 at 50x = one 2% adverse move wipes 100% of any position. Capital inadequacy is real.
7. Exchange outflows could be custodial migration (Binance → cold storage), not accumulation signal.
8. Funding rate extremes can persist for WEEKS. TAO has been -140%+ ann for days with no bounce.

### MY CALL
**Siding with the bull case for CPI outcome, but the bear case for position sizing.**

The weight of evidence favors a cool/inline CPI: Jan beat consensus, inflation nowcasting shows moderation, and the market is pricing disaster. The asymmetry is clearly upside. However, at $155 with 50x leverage, the bear case arguments about capital inadequacy are valid. We trade the bull case with minimum sizing (0.5x recovery) and absolute discipline on stops.

**Conviction:** 60% probability of bullish CPI outcome. 75% probability of positive 30-day returns from current levels regardless of CPI print (whale accumulation + F&G extremes dominate medium-term).

---

## Deliverables Checklist (PAP-28)

- [x] Pre-CPI positioning framework
- [x] Scenario analysis (hot/inline/cool)
- [x] Volatility expectations + historical context
- [x] Post-CPI playbook with phased response
- [x] Risk overlay with event window controls

---

*Sources:*
- Cleveland Fed Inflation Nowcasting
- FXStreet: "February CPI preview: Disinflation progress looks to be stalling again" (March 6, 2026)
- BLS: Consumer Price Index Summary (January 2026)
- Bank of America 2026 inflation forecast revision
- Gate.io: "How does Federal Reserve policy and inflation data impact crypto prices in 2026?"
- Phemex API: Real-time pricing and funding rates (March 8, 14:10 UTC)
