// ============================================================================
// PhantomX — Intelligence View Seed API
// ============================================================================
// Seeds knowledge base, intervention logs, and returns agent data for the
// Zustand store. Call POST /api/seed to populate everything at once.
// ============================================================================

import { NextResponse } from 'next/server';
import { getKnowledgeBase } from '@/lib/agents/knowledge-base';
import { logIntervention, recordOutcome } from '@/lib/ai/intervention-logger';
import type { AgentSignal, AgentStatus, AgentEvent, SignalSummary } from '@/types/trading';

// ---------------------------------------------------------------------------
// Knowledge Base Seed Data
// ---------------------------------------------------------------------------

// Shared tag vocabulary that creates explicit cross-connections:
//   'entry-timing'  → links FOMO learning ↔ EMA strategy ↔ Triangle pattern
//   'position-sizing' → links Revenge learning ↔ Sizing framework ↔ Drawdown protocol
//   'trailing-stop'  → links Cutting Winners ↔ EMA strategy ↔ Sizing framework
//   'breakout'       → links FOMO learning ↔ Triangle pattern ↔ EMA strategy
//   'low-volatility' → links Overtrading ↔ Weekend Fade ↔ Regime assessment
//   'stop-loss'      → links Revenge ↔ Liquidity Sweep ↔ Drawdown protocol
//   'BTC'/'ETH'/'SOL' → symbol-level links across all categories

const KNOWLEDGE_SEEDS = [
  // ── Learnings ──
  {
    title: 'Revenge Trading After Stop-Loss',
    category: 'learnings' as const,
    tags: ['revenge-trading', 'stop-loss', 'position-sizing', 'BTC', 'drawdown'],
    content: `**Pattern:** Immediately re-entering a position within 15 minutes of a stop-loss hit, typically with 1.5-2x the original position size. Directly violates the position sizing framework and drawdown recovery protocol.

**Evidence:** Observed across 23 BTC/USDT trades over a 6-week window. Re-entry trades after stop-outs had a 74% loss rate vs. 48% for planned entries. Average loss on revenge trades was 2.3x the original stop-loss amount. In 8 cases, the revenge trade coincided with a liquidity sweep pattern that would have offered a better entry 20-40 minutes later.

**Impact:** Estimated $4,200 in unnecessary losses over the observation period. The compounding effect of larger position sizes on losing trades created a negative feedback loop that extended drawdown periods by an average of 3.2 days — repeatedly triggering the 5% drawdown threshold in the recovery protocol.

**Recommendation:** Enforce a mandatory 30-minute cooldown after any stop-loss event. During cooldown, require the AI to present a fresh technical analysis (EMA alignment, RSI state) before any new position can be opened. Size must not exceed the original position per the Kelly framework.`,
    source: 'ai' as const,
  },
  {
    title: 'FOMO on Breakout Candles',
    category: 'learnings' as const,
    tags: ['fomo', 'breakout', 'entry-timing', 'trailing-stop', 'BTC', 'ETH'],
    content: `**Pattern:** Entering long positions on the third consecutive green 4H candle without waiting for a pullback or retest of the breakout level. Most common during ascending triangle breakouts on BTC and ETH — exactly the setups the EMA Ribbon strategy is designed to capture with discipline.

**Evidence:** 17 instances identified. Entries on extended breakout candles (RSI > 72) resulted in an average immediate drawdown of -1.8% before any continuation. Only 29% reached a 2:1 R:R target without first hitting the stop. In contrast, the EMA Ribbon's pullback-to-21-EMA entry achieved 58% win rate on the same moves.

**Impact:** Premature entries at extended prices consistently underperformed entries taken on the first retest of the breakout level by an average of 1.4R. The trailing stop that would have been placed by the EMA strategy was never reached in 71% of these FOMO entries — the position was stopped out first.

**Recommendation:** Wait for the first 4H close back above the breakout level after a pullback. If no pullback occurs within 3 candles, reduce position size by 50% and use a wider stop placed below the breakout origin. Cross-reference with the ascending triangle pattern criteria before entering.`,
    source: 'ai' as const,
  },
  {
    title: 'Cutting Winners Too Early',
    category: 'learnings' as const,
    tags: ['cutting-winners', 'trailing-stop', 'entry-timing', 'SOL', 'ETH'],
    content: `**Pattern:** Closing profitable positions at the first sign of a pullback candle, regardless of whether the broader trend structure (EMA ribbon alignment) remains intact.

**Evidence:** Analysis of 31 SOL/USDT and 18 ETH/USDT trades showed that positions closed at +0.8-1.2% frequently continued to move an additional 2-4% in the original direction. The trailing stop approach (1.5 ATR, as specified in the EMA Ribbon strategy exit rules) would have captured 68% more profit on average.

**Impact:** Over $3,100 in unrealized gains left on the table across the sample period. The psychological comfort of booking small wins created a consistently skewed R:R profile (average win 0.9R vs average loss 1.1R) — below the 2.1:1 target R:R of the position sizing framework.

**Recommendation:** Implement a trailing stop of 1.5 ATR on all positions that reach +1R. Do not manually close unless the trailing stop is hit or a higher-timeframe structure break is confirmed. Trust the EMA ribbon — if 8 > 21 > 55, the trend is intact.`,
    source: 'ai' as const,
  },
  {
    title: 'Overtrading During Low Volatility',
    category: 'learnings' as const,
    tags: ['overtrading', 'low-volatility', 'breakout', 'position-sizing', 'BTC'],
    content: `**Pattern:** Increasing trade frequency by 3x during periods when ATR drops below the 20-period average, typically driven by boredom rather than opportunity. Often triggers after a weekend fade pattern (low-volume drift) when the BTC market regime enters consolidation.

**Evidence:** During low-ATR periods (bottom quartile), trade count averaged 8.4/day vs 2.7/day in normal conditions. Win rate dropped from 54% to 31% during these periods, with average R:R falling to 0.6:1 — well below the 2.5:1 minimum the position sizing framework requires during low-vol regimes.

**Impact:** Low-volatility overtrading accounted for 41% of all losing trades despite representing only 22% of total trading time. Estimated unnecessary commission drag of $890/month. Frequently accelerated drawdown into the 5% recovery protocol threshold.

**Recommendation:** When 4H ATR is below the 20-period SMA, reduce maximum daily trades to 2 and increase minimum R:R requirement to 2.5:1. Consider switching to range-bound strategies (mean reversion, liquidity sweep setups) instead of breakout hunting. The ascending triangle pattern has the best reliability filter for this — only trade breakouts that meet all validation criteria.`,
    source: 'ai' as const,
  },

  // ── Strategies ──
  {
    title: 'EMA Ribbon Trend Following',
    category: 'strategies' as const,
    tags: ['entry-timing', 'trailing-stop', 'breakout', 'BTC', 'ETH', 'position-sizing'],
    content: `Core strategy using 8/21/55 EMA ribbon on 4H timeframe for trend direction and entries. Directly counters the FOMO pattern — forces waiting for a pullback to the 21 EMA instead of chasing breakout candles.

**Entry Conditions:**
- All three EMAs aligned (8 > 21 > 55 for longs, inverse for shorts)
- Price pulls back to the 21 EMA and shows a rejection candle (pin bar or engulfing)
- RSI between 40-60 on pullback (not oversold/overbought)
- Volume on entry candle > 20-period average
- Cross-reference: Check if the setup aligns with an ascending triangle breakout retest

**Exit Rules:**
- Take profit at 2R and 3R (50/50 split) — counters the cutting-winners behavior
- Trailing stop at 1.5 ATR after 2R hit — automated exit removes emotional decision
- Hard stop below the 55 EMA — ties directly to the position sizing framework's Kelly calculation

**Performance:** 58% win rate over 142 trades, average R:R of 2.1:1, Sharpe 1.34. Win rate drops to 38% when entries are taken without waiting for the 21 EMA pullback (FOMO entries).`,
    source: 'ai' as const,
  },
  {
    title: 'Liquidity Sweep Reversal',
    category: 'strategies' as const,
    tags: ['stop-loss', 'breakout', 'entry-timing', 'BTC', 'SOL', 'position-sizing'],
    content: `Identifies false breakouts that sweep liquidity pools above/below key levels before reversing. This strategy is the counterplay to FOMO — many of the breakouts that FOMO entries chase are actually liquidity sweeps that reverse within 1-3 candles.

**Setup Requirements:**
- Clear liquidity pool visible (cluster of equal highs/lows or obvious stop-loss zone)
- Price sweeps beyond the pool by 0.1-0.5%
- Immediate rejection with a strong reversal candle (>60% body-to-wick ratio)
- Confirmation on lower timeframe (15m) with a break of structure in the reversal direction

**Risk Management:**
- Stop above/below the sweep wick (tight stop, high R:R potential)
- Target the opposite liquidity pool or the equilibrium of the range
- Maximum position size: 3% of account per the Kelly framework
- This is the ideal strategy during post-stop-loss cooldowns — the sweep often occurs right after your stop was hit

**Edge:** Win rate of 52% but average R:R of 3.2:1 due to tight stops. Works best during London/NY session overlap. In 34% of cases, the liquidity sweep occurs at an EMA ribbon support/resistance level, creating a confluence entry.`,
    source: 'ai' as const,
  },

  // ── Patterns ──
  {
    title: 'BTC Weekend Fade Pattern',
    category: 'patterns' as const,
    tags: ['BTC', 'low-volatility', 'entry-timing', 'overtrading', 'fomo'],
    content: `Statistically significant tendency for BTC to reverse weekend pumps on Monday opens. This pattern is the classic FOMO trap — weekend pumps on thin volume attract late entries that get faded by institutional selling at Monday open.

**Observation:** Over 48 weekends analyzed, moves exceeding +3% from Friday close to Sunday peak reversed an average of 62% of the move by Tuesday close. This pattern is strongest when the move occurs on low volume (below 60% of weekday average) — the same low-volatility conditions that trigger the overtrading behavioral pattern.

**Usage:** When BTC pumps >3% over a weekend on low volume, position for a Monday fade with stops above the weekend high. Target: 50% retracement of the weekend move. The EMA Ribbon will typically confirm — if the 8 EMA is extended far above the 21, mean reversion is likely.

**Reliability:** 64% hit rate. Invalidated when the move is driven by a verifiable fundamental catalyst (regulatory news, ETF flows, major exchange listing). Cross-reference with the News Agent's sentiment reading before trading the fade.`,
    source: 'ai' as const,
  },
  {
    title: 'Ascending Triangle Breakout Setup',
    category: 'patterns' as const,
    tags: ['breakout', 'entry-timing', 'trailing-stop', 'ETH', 'BTC', 'fomo'],
    content: `Classic ascending triangle formation on 4H chart with minimum 3 touches on both the flat resistance and the rising trendline. This is the pattern most often involved in FOMO entries — traders jump in on the breakout candle instead of waiting for the retest.

**Validation Criteria:**
- Duration: 2-8 days of consolidation
- Volume: Declining volume during formation, spike on breakout
- Breakout confirmation: 4H close above resistance with volume > 1.5x 20-period average
- Measured move target: Height of triangle projected from breakout point
- EMA Ribbon must be aligned (8 > 21 > 55) for high-probability longs

**Historical Performance (ETH/USDT):** 71% of valid ascending triangles resulted in successful breakouts. Average measured move completion rate: 78%. False breakouts (closing back below resistance within 2 candles) occurred 18% of the time — these are actually liquidity sweep setups in disguise.

**Key Filters:**
- Fails most often when BTC is in a confirmed downtrend (Macro Agent bearish signal)
- The trailing stop at 1.5 ATR captures the full measured move in 82% of valid breakouts vs. only 41% for manual exits (cutting-winners pattern)
- FOMO filter: Do NOT enter if the breakout candle closes >1.5% above resistance. Wait for retest.`,
    source: 'ai' as const,
  },

  // ── Market Analysis ──
  {
    title: 'Current BTC Market Regime Assessment',
    category: 'market-analysis' as const,
    tags: ['BTC', 'breakout', 'entry-timing', 'low-volatility', 'stop-loss'],
    content: `**Regime:** Bullish continuation — price holding above the 200 DMA with the 50 DMA crossing above (golden cross confirmed 12 days ago). EMA Ribbon fully aligned on daily (8 > 21 > 55).

**Key Levels (cross-referenced with Sentinel Agent risk thresholds):**
- Major support: $92,400 (200 DMA + horizontal S/R confluence — key stop-loss cluster zone, liquidity sweep target)
- Minor support: $96,800 (21 EMA on daily — EMA Ribbon pullback entry zone)
- Resistance: $103,500 (previous ATH weekly close — ascending triangle resistance)
- Breakout target: $108,000-$112,000 (measured move from the cup & handle on weekly)

**Macro Context (validates Macro Agent's neutral-bullish read):** Fed holding rates steady, DXY weakening below 104, institutional flows via ETFs averaging $340M/day net inflow. Risk-on environment favoring crypto allocation.

**Trading Bias:** Long-only above $96,800 using EMA Ribbon entries. Scale into weakness toward the 200 DMA per the position sizing framework (half-Kelly at support, full Kelly on confirmation). Avoid shorts until daily structure break below $92,400. Weekend fade pattern active — watch for low-volume pumps above $103,500.`,
    source: 'ai' as const,
  },
  {
    title: 'ETH/BTC Relative Strength Analysis',
    category: 'market-analysis' as const,
    tags: ['ETH', 'BTC', 'breakout', 'entry-timing', 'trailing-stop'],
    content: `**Current ETH/BTC Ratio:** 0.038 — near multi-year lows. Historically, rallies from this zone have preceded significant ETH outperformance. The ascending triangle pattern is currently forming on the ETH/USDT 4H chart, which would be the trigger.

**Historical Precedent:**
- 2020: ETH/BTC bottomed at 0.024 before rallying to 0.088 (+267%)
- 2022: Bottomed at 0.049 before a 40% bounce
- Current: Compression at 0.036-0.041 for 8 weeks with declining volume — classic pre-breakout structure

**Connection to Active Strategies:**
- The EMA Ribbon on ETH/BTC is currently compressed (8/21/55 within 0.003 of each other) — a ribbon expansion would confirm the rotation
- The ascending triangle breakout criteria are 80% met on ETH/USDT — only waiting for the volume confirmation candle
- FOMO risk is HIGH on this setup due to narrative strength — enforce strict entry-timing rules

**Actionable:** Consider overweighting ETH relative to BTC when the ratio reclaims 0.042 with the EMA ribbon expanding. Use the trailing stop at 1.5 ATR to avoid cutting this winner early. Reduce ETH exposure if the ratio breaks below 0.034 on weekly close.`,
    source: 'ai' as const,
  },

  // ── Risk Management ──
  {
    title: 'Position Sizing Framework',
    category: 'risk-management' as const,
    tags: ['position-sizing', 'stop-loss', 'trailing-stop', 'drawdown', 'entry-timing'],
    content: `**Framework:** Modified Kelly Criterion with volatility adjustment. This framework is the mathematical backbone behind every strategy's entry size and exit placement.

**Base Formula:**
- Kelly % = (Win Rate x Avg Win) - ((1 - Win Rate) x Avg Loss) / Avg Win
- Applied Kelly = Kelly % x 0.5 (half-Kelly for safety)
- Volatility Adjustment: Multiply by (20 / Current ATR%) to reduce size in high-vol environments

**Current Parameters (from EMA Ribbon performance data):**
- Win Rate: 56%
- Avg Win: 2.1R
- Avg Loss: 1.0R
- Half-Kelly: 8.4% of account per trade
- With current ATR adjustment: 5.2% effective max position

**Hard Limits (enforced by Sentinel Agent):**
- Never exceed 10% of account on a single position
- Maximum 3 correlated positions (e.g., BTC + ETH + SOL all long counts as 3)
- Daily loss limit: 5% of account → mandatory cooldown until next session
- Revenge trading override: After any stop-loss, next position capped at 1x original size

**Connection to Behavioral Learnings:**
- Revenge trading pattern violates the sizing caps → automatic block
- FOMO entries at extended prices require 50% size reduction per this framework
- Overtrading in low-vol regimes: reduce to 2 trades/day with 2.5:1 minimum R:R`,
    source: 'ai' as const,
  },
  {
    title: 'Drawdown Recovery Protocol',
    category: 'risk-management' as const,
    tags: ['drawdown', 'position-sizing', 'stop-loss', 'low-volatility', 'overtrading'],
    content: `**Trigger Levels & Responses (monitored by Sentinel Agent):**

| Drawdown | Action | Behavioral Risk |
|----------|--------|-----------------|
| 5% | Reduce position sizes by 25%. Review last 10 trades for pattern violations. | Revenge trading and FOMO entries spike at this level. |
| 10% | Reduce position sizes by 50%. Switch to A+ setups only (EMA Ribbon confluences). | Overtrading frequency typically doubles here. |
| 15% | Pause live trading for 24 hours. Full portfolio review. Only paper trade. | Emotional decision-making peaks. |
| 20% | Full stop. No trading until a written plan is reviewed and the drawdown cause is identified. | Capital preservation mode. |

**Recovery Sizing:** After a drawdown > 10%, do not return to full size immediately. Scale back in over 5 winning trades: 50% → 60% → 70% → 80% → 100%. Use the Kelly framework with an additional 0.5x multiplier during recovery.

**Psychological Check:** The AI must ask "Are you trading to recover losses or because there's a genuine setup?" before any entry during an active drawdown > 5%. Cross-reference with the overtrading learning — low-volatility periods during drawdown are the highest-risk combination for account destruction.

**Integration:** Sentinel Agent monitors drawdown in real-time. When thresholds are hit, it signals the intervention system, which cross-references against the revenge trading and FOMO learnings to determine if the current behavior matches a documented pattern.`,
    source: 'ai' as const,
  },

  // ── Custom ──
  {
    title: 'Session Time Preferences',
    category: 'custom' as const,
    tags: ['entry-timing', 'low-volatility', 'breakout', 'BTC', 'ETH'],
    content: `**Preferred Trading Windows (validated by 6 months of performance data):**
- London open (3:00-5:00 AM EST): Best for breakout setups (ascending triangles), high volume entries. EMA Ribbon signals most reliable here.
- NY open (9:30-11:00 AM EST): Best for continuation trades and news-driven moves. Liquidity sweep reversals peak during this window.
- London/NY overlap (8:00-11:00 AM EST): Highest probability setups, tightest spreads. Both strategies (EMA Ribbon + Liquidity Sweep) perform best here.

**Avoid (overtrading risk zones):**
- Asian session (8 PM - 2 AM EST): Low volume, frequent fakeouts, wider spreads. This is where the overtrading pattern triggers most — ATR drops below threshold and boredom-driven trades begin.
- First 15 minutes of any session: Wait for initial volatility to settle — FOMO entries cluster here.
- Last hour of NY session: Liquidity thins, increased slippage risk. Stop-losses get swept more frequently.

**Personal Note:** Performance data shows a 23% higher win rate during the overlap window vs. off-hours trading. The AI should weight signals more heavily during preferred windows. The News Agent's sentiment scores are most actionable at NY open when institutional flows respond to overnight developments.`,
    source: 'user' as const,
  },
];

// ---------------------------------------------------------------------------
// Intervention Seed Data
// ---------------------------------------------------------------------------

const INTERVENTION_SEEDS = [
  {
    learningId: 'seed-revenge-1',
    patternTag: 'revenge-trading',
    symbol: 'BTC/USDT:USDT',
    originalAction: 'Open 2x long after stop-loss hit (3 min cooldown)',
    finalAction: 'Blocked — 30-minute cooldown enforced',
    wasOverridden: false,
    confidence: 92,
    reasoning: 'Position was closed at -1.2% loss 3 minutes ago. The proposed re-entry at 1.8x size matches the documented revenge trading pattern exactly. Cooldown enforced.',
  },
  {
    learningId: 'seed-revenge-2',
    patternTag: 'revenge-trading',
    symbol: 'ETH/USDT:USDT',
    originalAction: 'Increase position size to 2.5x after consecutive losses',
    finalAction: 'Size reduced to 1x, entry delayed by 30 min',
    wasOverridden: false,
    confidence: 88,
    reasoning: 'Three consecutive losing trades detected. The proposed 2.5x position is classic martingale behavior during a losing streak. Resized to standard and imposed cooldown.',
  },
  {
    learningId: 'seed-fomo-1',
    patternTag: 'fomo',
    symbol: 'BTC/USDT:USDT',
    originalAction: 'Long entry on 4th consecutive green 4H candle, RSI 78',
    finalAction: 'Entry blocked — wait for pullback to breakout level',
    wasOverridden: true,
    confidence: 85,
    reasoning: 'Extended breakout with RSI > 72 matches the documented FOMO pattern. Recommended waiting for a retest. User overrode the intervention.',
  },
  {
    learningId: 'seed-cutting-1',
    patternTag: 'cutting-winners',
    symbol: 'SOL/USDT:USDT',
    originalAction: 'Close long at +0.9% on first red candle',
    finalAction: 'Trailing stop set at 1.5 ATR instead of manual close',
    wasOverridden: false,
    confidence: 79,
    reasoning: 'Position at +0.9% with trend structure intact. The pullback candle is a normal retracement within an uptrend. Trailing stop activated instead of premature exit.',
  },
  {
    learningId: 'seed-cutting-2',
    patternTag: 'cutting-winners',
    symbol: 'ETH/USDT:USDT',
    originalAction: 'Take profit at +1.1% (below 2R target)',
    finalAction: 'Held position — trailing stop at 1.5 ATR',
    wasOverridden: false,
    confidence: 82,
    reasoning: 'Position reached +1.1% but the 2R target is at +2.4%. Moving to trailing stop rather than manual close. Higher timeframe trend supports continuation.',
  },
  {
    learningId: 'seed-overtrading-1',
    patternTag: 'overtrading',
    symbol: 'BTC/USDT:USDT',
    originalAction: '6th trade attempt today during ATR < 20-period SMA',
    finalAction: 'Trade blocked — daily limit reached in low-vol regime',
    wasOverridden: false,
    confidence: 94,
    reasoning: 'ATR at 72% of 20-period average (low volatility). This would be the 6th trade today vs. the 2-trade maximum during low-vol periods. Blocked per overtrading protocol.',
  },
  {
    learningId: 'seed-revenge-3',
    patternTag: 'revenge-trading',
    symbol: 'SOL/USDT:USDT',
    originalAction: 'Market buy immediately after stop-loss filled',
    finalAction: 'Blocked — mandatory 30-min cooldown',
    wasOverridden: false,
    confidence: 96,
    reasoning: 'Stop-loss filled 47 seconds ago. Immediate re-entry attempt is textbook revenge trading. Cooldown timer started.',
  },
  {
    learningId: 'seed-fomo-2',
    patternTag: 'fomo',
    symbol: 'ETH/USDT:USDT',
    originalAction: 'Chase breakout after missing original entry by 2.3%',
    finalAction: 'Position opened at reduced size (50%) with wider stop',
    wasOverridden: true,
    confidence: 71,
    reasoning: 'Entry is 2.3% above the original breakout level. FOMO indicators present but the setup has partial validity. User chose to enter at reduced size.',
  },
  {
    learningId: 'seed-overtrading-2',
    patternTag: 'overtrading',
    symbol: 'BTC/USDT:USDT',
    originalAction: '5th scalp attempt in 2 hours during range-bound market',
    finalAction: 'Blocked — switch to range strategy or stop trading',
    wasOverridden: false,
    confidence: 87,
    reasoning: 'Market has been in a 0.4% range for 6 hours. Five scalp attempts in 2 hours with 4 losses. Recommended switching to range-bound strategy or waiting for a breakout.',
  },
  {
    learningId: 'seed-fomo-3',
    patternTag: 'fomo',
    symbol: 'SOL/USDT:USDT',
    originalAction: 'Long entry after 15% pump in 24h, no pullback',
    finalAction: 'Blocked — waiting for retest of prior resistance as support',
    wasOverridden: false,
    confidence: 91,
    reasoning: 'SOL up 15% in 24h without a meaningful pullback. RSI at 84 on 4H. High probability of reversion. Waiting for a pullback to the prior resistance zone.',
  },
];

// Outcomes for some interventions (simulating post-trade results)
const INTERVENTION_OUTCOMES = [
  { index: 0, pnl: 340, wasCorrect: true },    // revenge block saved $340
  { index: 1, pnl: 180, wasCorrect: true },     // size reduction saved $180
  { index: 2, pnl: -420, wasCorrect: true },     // FOMO override led to loss — intervention was correct
  { index: 3, pnl: 890, wasCorrect: true },      // trailing stop captured $890 vs premature $340 exit
  { index: 4, pnl: 520, wasCorrect: true },      // held for full target
  { index: 5, pnl: 0, wasCorrect: true },        // avoided a flat trade
  { index: 6, pnl: 210, wasCorrect: true },      // cooldown prevented another loss
  { index: 8, pnl: 0, wasCorrect: true },        // avoided churning
];

// ---------------------------------------------------------------------------
// Agent State Seed Data
// ---------------------------------------------------------------------------

function buildAgentSeedData() {
  const now = Date.now();

  const signals: AgentSignal[] = [
    {
      agentId: 'sentinel',
      agentName: 'Sentinel Agent',
      timestamp: now - 120000,
      expiresAt: now + 3600000,
      confidence: 78,
      sentiment: 'bullish',
      summary: 'Portfolio risk within limits. Drawdown at 2.1% — well below the 5% threshold that triggers the recovery protocol. Position sizing compliant with Kelly framework (4.8% max). 7 behavioral interventions this session, 85% accuracy. No revenge trading cooldowns active.',
      data: { drawdown: 2.1, maxPositionPct: 4.8, openPositions: 2, dailyLoss: 0.3, interventions: 7, interventionAccuracy: 85 },
      symbols: ['BTC/USDT:USDT', 'ETH/USDT:USDT'],
    },
    {
      agentId: 'technical',
      agentName: 'Technical Agent',
      timestamp: now - 90000,
      expiresAt: now + 3600000,
      confidence: 84,
      sentiment: 'bullish',
      summary: 'EMA Ribbon fully aligned on BTC 4H (8>21>55). Ascending triangle forming with resistance at $98,400 — breakout targets $103,200 via measured move. RSI at 58 with room. FOMO filter active: wait for pullback to 21 EMA at $96,800 before entry. Trailing stop recommendation: 1.5 ATR ($1,840).',
      data: { ema8: 97200, ema21: 96800, ema55: 95400, rsi: 58, atr: 1840, pattern: 'ascending_triangle', fomoRisk: 'moderate' },
      symbols: ['BTC/USDT:USDT'],
    },
    {
      agentId: 'news',
      agentName: 'News Agent',
      timestamp: now - 200000,
      expiresAt: now + 3600000,
      confidence: 62,
      sentiment: 'bullish',
      summary: 'ETF inflows $412M yesterday — validates the macro regime assessment. No regulatory catalysts that would invalidate the weekend fade pattern. Institutional narrative supports the ascending triangle breakout thesis on BTC. Minor exchange hack FUD — not material enough to override technical signals.',
      data: { etfInflow: 412e6, sentimentScore: 0.68, majorEvents: 0, fudLevel: 'low', weekendFadeValid: true },
    },
    {
      agentId: 'macro',
      agentName: 'Macro Agent',
      timestamp: now - 300000,
      expiresAt: now + 3600000,
      confidence: 71,
      sentiment: 'neutral',
      summary: 'DXY at 103.8, weakening trend supports crypto risk-on. 10Y yield at 4.32% — stable. Fed meeting in 12 days, 91% pricing a hold. Equities near resistance (SPX 5620) which could trigger rotation into crypto. ETH/BTC ratio at 0.038 — approaching the 0.042 breakout level documented in the relative strength analysis. VIX at 14.2 suggests low macro volatility.',
      data: { dxy: 103.8, yield10y: 4.32, fedProbHold: 91, spx: 5620, vix: 14.2, ethBtcRatio: 0.038 },
    },
  ];

  const statuses: AgentStatus[] = [
    {
      id: 'sentinel',
      name: 'Sentinel Agent',
      state: 'running',
      intervalMs: 30000,
      lastTick: now - 30000,
      lastError: null,
      tickCount: 847,
      latestSignal: signals[0],
    },
    {
      id: 'technical',
      name: 'Technical Agent',
      state: 'running',
      intervalMs: 60000,
      lastTick: now - 15000,
      lastError: null,
      tickCount: 423,
      latestSignal: signals[1],
    },
    {
      id: 'news',
      name: 'News Agent',
      state: 'running',
      intervalMs: 300000,
      lastTick: now - 180000,
      lastError: null,
      tickCount: 84,
      latestSignal: signals[2],
    },
    {
      id: 'macro',
      name: 'Macro Agent',
      state: 'running',
      intervalMs: 600000,
      lastTick: now - 300000,
      lastError: null,
      tickCount: 42,
      latestSignal: signals[3],
    },
  ];

  const consensus: SignalSummary = {
    totalSignals: 4,
    byAgent: {
      sentinel: { count: 1, latestSentiment: 'bullish', latestConfidence: 78 },
      technical: { count: 1, latestSentiment: 'bullish', latestConfidence: 84 },
      news: { count: 1, latestSentiment: 'bullish', latestConfidence: 62 },
      macro: { count: 1, latestSentiment: 'neutral', latestConfidence: 71 },
    },
    consensusSentiment: 'bullish',
    consensusConfidence: 74,
  };

  const events: AgentEvent[] = [
    { type: 'orchestrator_status', agentId: 'orchestrator', data: { status: 'running', agents: 4 }, timestamp: now - 3600000 },
    { type: 'agent_started', agentId: 'sentinel', data: { intervalMs: 30000 }, timestamp: now - 3600000 },
    { type: 'agent_started', agentId: 'technical', data: { intervalMs: 60000 }, timestamp: now - 3590000 },
    { type: 'agent_started', agentId: 'news', data: { intervalMs: 300000 }, timestamp: now - 3580000 },
    { type: 'agent_started', agentId: 'macro', data: { intervalMs: 600000 }, timestamp: now - 3570000 },
    { type: 'agent_tick', agentId: 'sentinel', data: { tickCount: 845 }, timestamp: now - 90000 },
    { type: 'agent_signal', agentId: 'news', data: { sentiment: 'bullish', confidence: 62 }, timestamp: now - 200000 },
    { type: 'agent_tick', agentId: 'technical', data: { tickCount: 422 }, timestamp: now - 75000 },
    { type: 'agent_signal', agentId: 'technical', data: { sentiment: 'bullish', confidence: 84 }, timestamp: now - 90000 },
    { type: 'agent_signal', agentId: 'sentinel', data: { sentiment: 'bullish', confidence: 78 }, timestamp: now - 120000 },
    { type: 'agent_tick', agentId: 'sentinel', data: { tickCount: 846 }, timestamp: now - 60000 },
    { type: 'agent_signal', agentId: 'macro', data: { sentiment: 'neutral', confidence: 71 }, timestamp: now - 300000 },
    { type: 'agent_tick', agentId: 'sentinel', data: { tickCount: 847 }, timestamp: now - 30000 },
    { type: 'agent_tick', agentId: 'technical', data: { tickCount: 423 }, timestamp: now - 15000 },
  ];

  // Sort events by timestamp (newest first for display)
  events.sort((a, b) => b.timestamp - a.timestamp);

  return { signals, statuses, consensus, events };
}

// ---------------------------------------------------------------------------
// POST Handler — Seeds everything
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const kb = getKnowledgeBase();

    // 1. Seed knowledge base entries (skip if titles already exist)
    const existing = kb.getAll();
    const existingTitles = new Set(existing.map(e => e.title));
    let kbCreated = 0;

    for (const seed of KNOWLEDGE_SEEDS) {
      if (existingTitles.has(seed.title)) continue;
      kb.create(seed);
      kbCreated++;
    }

    // 2. Seed intervention logs
    const interventionIds: string[] = [];
    for (const seed of INTERVENTION_SEEDS) {
      const log = logIntervention(seed);
      interventionIds.push(log.id);
    }

    // 3. Record outcomes for interventions that have them
    for (const outcome of INTERVENTION_OUTCOMES) {
      const id = interventionIds[outcome.index];
      if (id) {
        recordOutcome(id, { pnl: outcome.pnl, wasCorrect: outcome.wasCorrect });
      }
    }

    // 4. Build agent state data for client-side Zustand population
    const agentData = buildAgentSeedData();

    return NextResponse.json({
      success: true,
      seeded: {
        knowledgeEntries: kbCreated,
        interventionLogs: INTERVENTION_SEEDS.length,
        interventionOutcomes: INTERVENTION_OUTCOMES.length,
        agentStatuses: agentData.statuses.length,
        agentEvents: agentData.events.length,
      },
      agentData: {
        statuses: agentData.statuses,
        consensus: agentData.consensus,
        events: agentData.events,
        signals: agentData.signals,
      },
    });
  } catch (err) {
    console.error('[Seed] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
