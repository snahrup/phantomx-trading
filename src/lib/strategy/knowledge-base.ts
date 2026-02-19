// ============================================================================
// PhantomX — Trading Knowledge Base
// Curated, structured, queryable knowledge that the AI agents consume during
// research, optimization, and live supervision. Every principle here has
// survived multiple market cycles and is backed by academic research or
// decades of institutional practice.
// ============================================================================

export interface KnowledgeEntry {
  id: string;
  domain: KnowledgeDomain;
  title: string;
  principle: string;
  details: string;
  source: string;               // academic paper, book, or institutional origin
  confidence: number;           // 0-1 how well-established this is
  applicability: Applicability;
  tags: string[];
  contraindications?: string[]; // when this principle should NOT be applied
}

export type KnowledgeDomain =
  | 'risk_management'
  | 'position_sizing'
  | 'technical_analysis'
  | 'market_microstructure'
  | 'behavioral_finance'
  | 'quant_foundations'
  | 'crypto_native'
  | 'regime_detection'
  | 'strategy_patterns'
  | 'anti_patterns'
  | 'hft_strategies'
  | 'performance_review';

export interface Applicability {
  regimes: ('trending' | 'ranging' | 'volatile' | 'all')[];
  timeframes: ('scalp' | 'day' | 'swing' | 'position' | 'all')[];
  assets: ('btc' | 'eth' | 'altcoin' | 'stablecoin_pair' | 'all')[];
}

// ============================================================================
// Hard Constraints — These are NON-NEGOTIABLE. The AI cannot override them.
// They are enforced at the execution layer, not just suggested.
// ============================================================================

export interface HardConstraint {
  id: string;
  rule: string;
  enforcement: string;          // how it's enforced in code
  reasoning: string;
  source: string;
  severity: 'critical' | 'high';
}

export const HARD_CONSTRAINTS: HardConstraint[] = [
  {
    id: 'hc-001',
    rule: 'Never risk more than 2% of account equity on a single trade (conservative) or 5% (aggressive)',
    enforcement: 'Position size computed via fractional Kelly. Execution engine rejects orders exceeding limit.',
    reasoning: 'Ensures survival through losing streaks. At 2% risk, 10 consecutive losses only drawdown ~18%. At 10% risk, 10 losses = 65% drawdown.',
    source: 'Van Tharp — Trade Your Way to Financial Freedom; Kelly Criterion (1956)',
    severity: 'critical',
  },
  {
    id: 'hc-002',
    rule: 'Maximum portfolio drawdown circuit breaker. All positions closed if exceeded.',
    enforcement: 'Kill switch in execution engine. Non-bypassable. Persisted across sessions.',
    reasoning: 'Recovery from 50% drawdown requires 100% gain. Recovery from 75% requires 300%. The math is unforgiving.',
    source: 'Institutional risk management standard. Turtle Trading rules.',
    severity: 'critical',
  },
  {
    id: 'hc-003',
    rule: 'Stop losses NEVER widen. They can only tighten or remain unchanged.',
    enforcement: 'Execution engine rejects stop-loss modifications that increase distance from entry.',
    reasoning: 'Widening stops is the #1 behavioral pattern that precedes account blowups. It transforms a controlled loss into an uncontrolled one.',
    source: 'Mark Douglas — Trading in the Zone; Every risk management textbook ever written.',
    severity: 'critical',
  },
  {
    id: 'hc-004',
    rule: 'Daily loss limit. No new positions opened after daily loss threshold hit.',
    enforcement: 'Execution engine tracks daily P&L. Rejects new entries past limit. Resets at UTC midnight.',
    reasoning: 'Prevents revenge trading and tilt cascades. Professional trading desks enforce this universally.',
    source: 'Institutional trading desk standard. CME Group risk guidelines.',
    severity: 'critical',
  },
  {
    id: 'hc-005',
    rule: 'Every trade MUST have a stop loss set BEFORE entry.',
    enforcement: 'Execution engine requires stopLoss field in every order request. Rejects naked entries.',
    reasoning: 'A trade without a stop loss is a prayer, not a strategy. Unlimited downside risk has infinite expected loss.',
    source: 'Universal risk management principle.',
    severity: 'critical',
  },
  {
    id: 'hc-006',
    rule: 'No averaging down without a pre-defined, backtested scaling plan.',
    enforcement: 'Additional entries to losing positions blocked unless strategy.scalingPlan is defined and backtested.',
    reasoning: 'Averaging down converts a small loss into a catastrophic one. It violates the core principle of cutting losses short.',
    source: 'Jesse Livermore — Reminiscences of a Stock Operator; Paul Tudor Jones interviews.',
    severity: 'high',
  },
  {
    id: 'hc-007',
    rule: 'Position correlation limit — no more than 40% of equity in correlated assets.',
    enforcement: 'Execution engine computes rolling correlation matrix. Blocks entries that would breach limit.',
    reasoning: 'Correlated positions are a single bet disguised as diversification. When they unwind, they unwind together.',
    source: 'Modern Portfolio Theory (Markowitz, 1952). Every institutional risk framework.',
    severity: 'high',
  },
  {
    id: 'hc-008',
    rule: 'Leverage adjusted for volatility. Higher volatility = lower leverage.',
    enforcement: 'Position size formula includes ATR-based volatility adjustment. High-vol regimes automatically reduce exposure.',
    reasoning: 'Fixed leverage in variable volatility guarantees eventual blowup. The Turtle Traders used ATR-based sizing for exactly this reason.',
    source: 'Turtle Trading System. AQR Capital research on volatility targeting.',
    severity: 'high',
  },
];

// ============================================================================
// Core Knowledge Base — Organized by domain
// ============================================================================

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [

  // ========== RISK MANAGEMENT ==========
  {
    id: 'rm-001',
    domain: 'risk_management',
    title: 'Kelly Criterion for Optimal Position Sizing',
    principle: 'Optimal bet size = (win_probability × avg_win - loss_probability × avg_loss) / avg_win',
    details: 'The Kelly Criterion gives the mathematically optimal fraction of capital to risk on each trade to maximize long-term growth rate. In practice, use fractional Kelly (25-50% of full Kelly) because the formula assumes perfect knowledge of probabilities, which we never have. Full Kelly is too aggressive for real markets — one miscalibrated probability estimate and drawdowns become severe.',
    source: 'J.L. Kelly Jr. — A New Interpretation of Information Rate (1956); Edward Thorp — Beat the Dealer',
    confidence: 0.95,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['position_sizing', 'kelly', 'risk', 'mathematical'],
  },
  {
    id: 'rm-002',
    domain: 'risk_management',
    title: 'Risk of Ruin Table',
    principle: 'The probability of total account loss given win rate, risk per trade, and reward:risk ratio',
    details: 'At 2% risk per trade with 50% win rate and 2:1 R:R, risk of ruin is effectively 0%. At 10% risk per trade with same stats, risk of ruin is ~13%. At 25% risk per trade, risk of ruin exceeds 50%. This is why position sizing matters more than entry timing. A mediocre strategy with excellent position sizing outperforms a great strategy with poor position sizing every time.',
    source: 'Ralph Vince — Portfolio Management Formulas; Nauzer Balsara — Money Management Strategies',
    confidence: 0.98,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['risk_of_ruin', 'position_sizing', 'survival', 'mathematical'],
  },
  {
    id: 'rm-003',
    domain: 'risk_management',
    title: 'Asymmetric Drawdown Recovery',
    principle: 'Losses require disproportionately larger gains to recover. 10% loss needs 11% gain. 50% needs 100%. 75% needs 300%.',
    details: 'This mathematical reality is why capital preservation is the #1 priority. The optimization loop should treat drawdown reduction as the highest-priority objective. A strategy that makes 30% per year with 10% max drawdown is vastly superior to one that makes 60% per year with 40% max drawdown, because the second strategy is one bad streak away from requiring years of recovery.',
    source: 'Mathematics. Universal.',
    confidence: 1.0,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['drawdown', 'recovery', 'capital_preservation', 'mathematical'],
  },

  // ========== POSITION SIZING ==========
  {
    id: 'ps-001',
    domain: 'position_sizing',
    title: 'ATR-Based Volatility Position Sizing',
    principle: 'Position size = (Account × Risk%) / (ATR × Multiplier)',
    details: 'Using Average True Range to dynamically size positions ensures consistent risk across different volatility regimes. In low volatility, positions are larger. In high volatility, positions automatically shrink. This is the core of the Turtle Trading system and used by most systematic funds. The ATR multiplier (typically 1.5-3x) determines the stop distance, and position size is derived from there.',
    source: 'Richard Dennis — Turtle Trading System; Kestner — Quantitative Trading Strategies',
    confidence: 0.95,
    applicability: { regimes: ['all'], timeframes: ['day', 'swing', 'position'], assets: ['all'] },
    tags: ['atr', 'volatility', 'position_sizing', 'turtle'],
  },
  {
    id: 'ps-002',
    domain: 'position_sizing',
    title: 'Fixed Fractional Position Sizing',
    principle: 'Risk a fixed percentage of current equity on every trade. Never a fixed dollar amount.',
    details: 'Fixed fractional sizing creates geometric growth on winning streaks and geometric decay on losing streaks, which is mathematically optimal for compounding. Fixed dollar sizing creates linear growth but does not protect capital during drawdowns. As equity grows, position sizes grow proportionally. As equity shrinks, position sizes automatically reduce, providing built-in risk reduction during drawdowns.',
    source: 'Ralph Vince — The Mathematics of Money Management; Van Tharp — Trade Your Way to Financial Freedom',
    confidence: 0.97,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['position_sizing', 'fractional', 'compounding'],
  },

  // ========== TECHNICAL ANALYSIS ==========
  {
    id: 'ta-001',
    domain: 'technical_analysis',
    title: 'Volume Confirms Price',
    principle: 'Price moves on high volume are more significant than price moves on low volume.',
    details: 'A breakout above resistance on 3x average volume is far more likely to sustain than the same breakout on 0.5x volume. Volume represents commitment — institutional money moving creates volume. Low-volume moves are often retail noise or liquidity gaps that get filled. During the research phase, volume analysis should be weighted heavily in confluence scoring.',
    source: 'Richard Wyckoff — Studies in Tape Reading (1910); Charles Dow — Dow Theory',
    confidence: 0.90,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['volume', 'confirmation', 'breakout', 'wyckoff'],
  },
  {
    id: 'ta-002',
    domain: 'technical_analysis',
    title: 'RSI Divergence as Reversal Signal',
    principle: 'When price makes new highs/lows but RSI does not, momentum is weakening and reversal is likely.',
    details: 'Bullish divergence: price makes lower low, RSI makes higher low. Bearish divergence: price makes higher high, RSI makes lower high. This works because RSI measures the internal strength of the move. When price is moving on decreasing momentum, it signals exhaustion. Most effective on higher timeframes (4H+). On lower timeframes, divergences fail frequently due to noise.',
    source: 'J. Welles Wilder — New Concepts in Technical Trading Systems (1978)',
    confidence: 0.82,
    applicability: { regimes: ['trending'], timeframes: ['day', 'swing', 'position'], assets: ['all'] },
    tags: ['rsi', 'divergence', 'reversal', 'momentum'],
    contraindications: ['Strong trending moves can sustain divergence for extended periods. Do not fight a strong trend solely on divergence.'],
  },
  {
    id: 'ta-003',
    domain: 'technical_analysis',
    title: 'Multi-Timeframe Confluence',
    principle: 'A signal that aligns across multiple timeframes is significantly more reliable.',
    details: 'If the daily chart shows a bullish trend, the 4H shows a pullback to support, and the 1H shows a reversal candle pattern — that is three-timeframe confluence. Systematically, strategies that require signals on at least 2 timeframes to align have historically shown 15-30% higher win rates than single-timeframe strategies. The research pipeline should always analyze the primary timeframe plus one higher and one lower.',
    source: 'Alexander Elder — Trading for a Living (Triple Screen); Multiple academic studies on multi-scale analysis',
    confidence: 0.88,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['multi_timeframe', 'confluence', 'triple_screen', 'elder'],
  },
  {
    id: 'ta-004',
    domain: 'technical_analysis',
    title: 'Support/Resistance Flip',
    principle: 'Former support becomes resistance after a breakdown. Former resistance becomes support after a breakout.',
    details: 'This principle reflects market psychology — traders who bought at support and are now underwater will sell to break even when price returns to their entry. This creates real selling pressure at the level. The more times a level has been tested, the more significant the flip. Institutional orders cluster at these levels, making them self-reinforcing.',
    source: 'Wyckoff Method; John Murphy — Technical Analysis of the Financial Markets',
    confidence: 0.88,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['support_resistance', 'flip', 'polarity', 'institutional'],
  },
  {
    id: 'ta-005',
    domain: 'technical_analysis',
    title: 'Bollinger Band Squeeze → Expansion',
    principle: 'Periods of low volatility (BB squeeze) precede periods of high volatility (BB expansion). Direction is unknown, magnitude is predicted.',
    details: 'When Bollinger Bands narrow to within 4-6% width on daily BTC charts, a major move is imminent. This is volatility mean reversion — volatility clusters and cycles between compression and expansion. The squeeze itself does not predict direction. Combine with trend bias, order flow, and OI changes to predict the breakout direction.',
    source: 'John Bollinger — Bollinger on Bollinger Bands; Mandelbrot — The Misbehavior of Markets',
    confidence: 0.85,
    applicability: { regimes: ['ranging'], timeframes: ['day', 'swing'], assets: ['all'] },
    tags: ['bollinger', 'squeeze', 'volatility', 'breakout'],
  },

  // ========== MARKET MICROSTRUCTURE ==========
  {
    id: 'mm-001',
    domain: 'market_microstructure',
    title: 'Liquidation Cascade Dynamics',
    principle: 'Leveraged positions create liquidation clusters that accelerate price moves when triggered.',
    details: 'In crypto, open interest and funding rates reveal where liquidation clusters exist. When price approaches a cluster, the liquidations trigger market orders that push price further, triggering more liquidations — a cascade. The supervisor should monitor: OI changes, funding rate extremes (>0.1% per 8h), and liquidation heatmaps. When a cascade begins, the correct response is to either ride it (if aligned) or flatten immediately (if against position).',
    source: 'Binance/Bybit liquidation data research; Coinalyze, Hyblock Capital analytics',
    confidence: 0.90,
    applicability: { regimes: ['volatile'], timeframes: ['scalp', 'day'], assets: ['btc', 'eth', 'altcoin'] },
    tags: ['liquidation', 'cascade', 'leverage', 'open_interest'],
  },
  {
    id: 'mm-002',
    domain: 'market_microstructure',
    title: 'Order Book Imbalance as Short-Term Predictor',
    principle: 'Significant bid/ask imbalance (>3:1 ratio at top 5 levels) predicts short-term price direction with ~60% accuracy.',
    details: 'When bids significantly outweigh asks, short-term price tends to move up as market makers adjust. However: large visible orders can be spoofed (placed and cancelled). Focus on orders that have been resting for >30 seconds and are within 0.5% of mid price. In crypto, order book data is noisy but useful when combined with trade flow (actual executed trades vs resting orders).',
    source: 'Cont, Stoikov & Talreja — A Stochastic Model for Order Book Dynamics (2010); Cartea & Jaimungal — Algorithmic and High-Frequency Trading',
    confidence: 0.72,
    applicability: { regimes: ['all'], timeframes: ['scalp'], assets: ['btc', 'eth'] },
    tags: ['order_book', 'imbalance', 'microstructure', 'spoofing'],
    contraindications: ['Order book data is easily manipulated. Never use as sole signal. Always combine with trade flow.'],
  },

  // ========== BEHAVIORAL FINANCE ==========
  {
    id: 'bf-001',
    domain: 'behavioral_finance',
    title: 'Fear & Greed Cycle Exploitation',
    principle: 'Markets oscillate between fear and greed. Extreme readings in either direction predict mean reversion.',
    details: 'When the Crypto Fear & Greed Index drops below 15 (extreme fear), historically BTC has returned an average of +40% over the next 90 days. When it exceeds 85 (extreme greed), average returns are -15% over 90 days. This is not a timing tool — it is a regime indicator. During extreme fear, the strategy should be accumulating. During extreme greed, it should be taking profits and tightening stops. The AI supervisor should weight this in position sizing decisions.',
    source: 'Kahneman & Tversky — Prospect Theory (1979); alternative.me Fear & Greed Index historical data',
    confidence: 0.80,
    applicability: { regimes: ['all'], timeframes: ['swing', 'position'], assets: ['btc', 'eth', 'altcoin'] },
    tags: ['fear_greed', 'sentiment', 'contrarian', 'regime'],
  },
  {
    id: 'bf-002',
    domain: 'behavioral_finance',
    title: 'Disposition Effect — Cut Winners Early, Hold Losers Too Long',
    principle: 'Humans naturally sell winners too early and hold losers too long. The AI must do the opposite.',
    details: 'This is the single most destructive behavioral bias in trading. Studies show retail traders hold losing trades 2x longer than winning trades. The optimization loop should specifically check for this pattern: is average hold time for losers > average hold time for winners? If so, the strategy has a disposition effect problem. Fix: enforce time-based exits, never widen stops, use trailing stops to let winners run.',
    source: 'Shefrin & Statman — The Disposition to Sell Winners Too Early and Ride Losers Too Long (1985); Odean — Are Investors Reluctant to Realize Their Losses? (1998)',
    confidence: 0.95,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['disposition_effect', 'behavioral', 'bias', 'hold_time'],
  },

  // ========== QUANT FOUNDATIONS ==========
  {
    id: 'qf-001',
    domain: 'quant_foundations',
    title: 'Momentum Factor — Trend Persistence',
    principle: 'Assets that have performed well recently tend to continue performing well in the short-to-medium term.',
    details: 'The momentum factor is one of the most robust findings in quantitative finance. Jegadeesh & Titman (1993) documented 3-12 month momentum in equities. In crypto, momentum is even stronger due to reflexivity and narrative-driven flows. The cross-sectional momentum strategy (long winners, short losers) has a Sharpe ratio of ~0.8-1.2 historically. Time-series momentum (trend following on individual assets) is slightly less robust but more practical for single-asset strategies.',
    source: 'Jegadeesh & Titman — Returns to Buying Winners and Selling Losers (1993); Asness, Moskowitz & Pedersen — Value and Momentum Everywhere (2013)',
    confidence: 0.90,
    applicability: { regimes: ['trending'], timeframes: ['swing', 'position'], assets: ['all'] },
    tags: ['momentum', 'trend', 'factor', 'academic'],
    contraindications: ['Momentum crashes are violent and fast. Momentum reverses sharply at regime changes. Must combine with regime detection.'],
  },
  {
    id: 'qf-002',
    domain: 'quant_foundations',
    title: 'Mean Reversion in Bounded Instruments',
    principle: 'When an asset deviates significantly from its mean, the probability of returning to the mean increases.',
    details: 'Mean reversion is the complement of momentum — they operate on different timeframes. Short-term (intraday to 1 week) mean reversion is strong. Medium-term (1-12 months) momentum is strong. Long-term (1-5 years) mean reversion reasserts. For the optimization loop: if a strategy underperforms in trending markets, consider adding a mean-reversion component for ranging regimes. RSI, Bollinger Bands, and z-score of price are common mean-reversion indicators.',
    source: 'DeBondt & Thaler — Does the Stock Market Overreact? (1985); Poterba & Summers — Mean Reversion in Stock Prices (1988)',
    confidence: 0.85,
    applicability: { regimes: ['ranging'], timeframes: ['scalp', 'day'], assets: ['all'] },
    tags: ['mean_reversion', 'contrarian', 'ranging', 'academic'],
    contraindications: ['Mean reversion fails catastrophically in trending regimes. Catching falling knives during a crash is mean reversion gone wrong.'],
  },
  {
    id: 'qf-003',
    domain: 'quant_foundations',
    title: 'Walk-Forward Optimization — Gold Standard',
    principle: 'In-sample optimization + out-of-sample validation + rolling windows = the only reliable way to validate a strategy.',
    details: 'Standard backtesting is curve-fitting in disguise. Walk-forward optimization splits data into rolling windows: optimize parameters on in-sample data, test on out-of-sample data, roll forward and repeat. If out-of-sample performance is consistently close to in-sample performance (overfit ratio < 2.0), the strategy is robust. If not, it is overfit. The optimization loop MUST use walk-forward validation. A strategy that passes walk-forward with overfit ratio < 1.5 across 5+ windows is genuinely robust.',
    source: 'Robert Pardo — The Evaluation and Optimization of Trading Strategies (2008); Aronson — Evidence-Based Technical Analysis',
    confidence: 0.95,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['walk_forward', 'optimization', 'overfit', 'validation', 'backtest'],
  },

  // ========== CRYPTO-NATIVE ==========
  {
    id: 'cn-001',
    domain: 'crypto_native',
    title: 'Exchange Net Flow as Accumulation/Distribution Signal',
    principle: 'Net outflows from exchanges indicate accumulation (bullish). Net inflows indicate distribution (bearish).',
    details: 'When large holders move coins off exchanges, they are reducing available supply for selling — accumulation. When they move coins onto exchanges, they are preparing to sell — distribution. Track this via on-chain data (Glassnode, CryptoQuant). Significant sustained outflows (>10K BTC per week) have preceded major rallies in 7 out of 10 historical instances. The supervisor should monitor exchange flow as a medium-term regime indicator.',
    source: 'Glassnode research; CryptoQuant exchange flow analysis; Ki Young Ju research',
    confidence: 0.82,
    applicability: { regimes: ['all'], timeframes: ['swing', 'position'], assets: ['btc', 'eth'] },
    tags: ['on_chain', 'exchange_flow', 'accumulation', 'distribution'],
  },
  {
    id: 'cn-002',
    domain: 'crypto_native',
    title: 'Funding Rate Extremes as Contrarian Signal',
    principle: 'Extreme positive funding (>0.1%/8h) suggests overleveraged longs — bearish. Extreme negative funding suggests overleveraged shorts — bullish.',
    details: 'Funding rate reflects the cost of holding a perpetual futures position. When it is extremely positive, long holders are paying shorts a premium — the market is overleveraged long and a squeeze/correction is likely. When extremely negative, the opposite. This is one of the most reliable short-term contrarian indicators in crypto. The supervisor should flag funding rate extremes as potential intervention triggers.',
    source: 'Binance/Bybit funding rate data; Coinalyze funding rate analysis',
    confidence: 0.85,
    applicability: { regimes: ['all'], timeframes: ['scalp', 'day'], assets: ['btc', 'eth', 'altcoin'] },
    tags: ['funding_rate', 'perpetual', 'contrarian', 'leverage'],
  },
  {
    id: 'cn-003',
    domain: 'crypto_native',
    title: 'Whale Wallet Tracking',
    principle: 'Large wallet movements (>$10M) that precede price action by 1-24 hours provide alpha.',
    details: 'Track the top 100 wallets for each major asset. When multiple whales move funds to exchanges simultaneously, it is a distribution signal. When they accumulate from exchanges, it is bullish. The latency between whale movement and price impact varies: for BTC, typically 2-6 hours. For altcoins, can be faster. The supervisor should maintain a whale activity feed and escalate when unusual clustering occurs.',
    source: 'Whale Alert data; Arkham Intelligence; Nansen wallet labeling research',
    confidence: 0.75,
    applicability: { regimes: ['all'], timeframes: ['day', 'swing'], assets: ['btc', 'eth', 'altcoin'] },
    tags: ['whale', 'on_chain', 'accumulation', 'distribution', 'alpha'],
    contraindications: ['Whales can move funds between their own wallets (internal transfers). Not every large transfer is a buy/sell signal. Verify with exchange deposit/withdrawal data.'],
  },

  // ========== REGIME DETECTION ==========
  {
    id: 'rd-001',
    domain: 'regime_detection',
    title: 'ADX for Trend Strength Classification',
    principle: 'ADX < 20 = ranging. ADX 20-40 = trending. ADX > 40 = strong trend. ADX > 60 = extreme trend (potential exhaustion).',
    details: 'The Average Directional Index measures trend strength regardless of direction. The optimization loop should detect the current regime and select strategy parameters accordingly. Trending regimes favor momentum, moving average crossovers, and breakout strategies. Ranging regimes favor mean reversion, RSI overbought/oversold, and Bollinger Band bounces. Switching between these based on ADX improves Sharpe ratio by ~0.3 on average.',
    source: 'J. Welles Wilder — New Concepts in Technical Trading Systems (1978); multiple systematic trading studies',
    confidence: 0.85,
    applicability: { regimes: ['all'], timeframes: ['day', 'swing', 'position'], assets: ['all'] },
    tags: ['adx', 'regime', 'trend_strength', 'ranging', 'trending'],
  },
  {
    id: 'rd-002',
    domain: 'regime_detection',
    title: 'BTC Dominance as Altcoin Regime Indicator',
    principle: 'Rising BTC dominance = risk-off, capital flowing from alts to BTC. Falling BTC dominance = risk-on, alt season beginning.',
    details: 'BTC dominance is the percentage of total crypto market cap held by Bitcoin. When dominance rises, altcoins underperform — capital is consolidating into the safest crypto asset. When dominance falls, capital is flowing into altcoins seeking higher returns. This is a crypto-native regime indicator. The strategy should adjust asset selection: in high-dominance regimes, focus on BTC. In falling-dominance regimes, rotate into high-beta altcoins.',
    source: 'CoinMarketCap dominance data; Historical altseason analysis',
    confidence: 0.80,
    applicability: { regimes: ['all'], timeframes: ['swing', 'position'], assets: ['all'] },
    tags: ['btc_dominance', 'alt_season', 'regime', 'rotation'],
  },

  // ========== STRATEGY PATTERNS ==========
  {
    id: 'sp-001',
    domain: 'strategy_patterns',
    title: 'Turtle Trading Breakout System',
    principle: '20-day high breakout entry, 10-day low exit for longs (reverse for shorts). ATR-based position sizing.',
    details: 'The Turtle Trading system is one of the most thoroughly documented and validated systematic strategies in history. Richard Dennis and William Eckhardt trained novice traders who collectively made $175M. The system is pure trend following: enter on 20-day breakouts, exit on 10-day countermoves, size positions using ATR (N), risk 2% per trade. The system has positive expectancy but low win rate (~35-40%). It requires strict discipline to take every signal. The AI optimizer should study this as a baseline template for trend-following strategies.',
    source: 'Curtis Faith — Way of the Turtle; Michael Covel — The Complete TurtleTrader',
    confidence: 0.90,
    applicability: { regimes: ['trending'], timeframes: ['day', 'swing'], assets: ['all'] },
    tags: ['turtle', 'breakout', 'trend_following', 'atr', 'position_sizing'],
  },
  {
    id: 'sp-002',
    domain: 'strategy_patterns',
    title: 'Mean Reversion with Bollinger Bands',
    principle: 'Enter long when price touches lower BB and RSI < 30. Enter short when price touches upper BB and RSI > 70. Exit at middle BB.',
    details: 'This is the canonical mean-reversion strategy. It works best in ranging markets (ADX < 20). Win rate is typically 60-70% but reward:risk is ~1:1. Key optimizable parameters: BB period (default 20), BB standard deviations (default 2), RSI period (default 14), RSI thresholds. The optimization loop should test this template in ranging regimes and compare against momentum templates in trending regimes.',
    source: 'John Bollinger; Connors & Raschke — Street Smarts',
    confidence: 0.82,
    applicability: { regimes: ['ranging'], timeframes: ['day', 'swing'], assets: ['all'] },
    tags: ['mean_reversion', 'bollinger', 'rsi', 'ranging'],
    contraindications: ['Fails badly in trending markets. BB touch in a strong trend is NOT a reversal signal — it is trend continuation.'],
  },
  {
    id: 'sp-003',
    domain: 'strategy_patterns',
    title: 'MACD + EMA Trend Following',
    principle: 'Enter when MACD crosses signal line AND price is above 200 EMA. Exit on MACD cross back.',
    details: 'Combining MACD momentum with trend filter (200 EMA) reduces false signals. MACD alone has ~45% win rate. With 200 EMA filter, win rate improves to ~55% and more importantly, average winner size increases significantly because you are trading with the trend. This is a robust template that works across assets and timeframes. Key parameters for optimization: MACD fast/slow/signal periods, EMA filter period.',
    source: 'Gerald Appel — Technical Analysis: Power Tools for Active Investors (2005)',
    confidence: 0.80,
    applicability: { regimes: ['trending'], timeframes: ['day', 'swing'], assets: ['all'] },
    tags: ['macd', 'ema', 'trend_following', 'filter'],
  },

  // ========== ANTI-PATTERNS ==========
  {
    id: 'ap-001',
    domain: 'anti_patterns',
    title: 'Martingale / Doubling Down',
    principle: 'NEVER double position size after a loss. This guarantees eventual catastrophic loss.',
    details: 'Martingale strategies (doubling bet size after each loss) have a 100% probability of ruin given unlimited time. Even with a positive expectancy system, a losing streak of 7 trades at martingale sizing requires 128x the original position to recover — a 12800% increase. The AI optimizer must never generate a strategy that increases position size after losses. Position sizing should be based on current equity, not on previous trade results.',
    source: 'Mathematical proof. Paul Samuelson — Risk and Uncertainty: A Fallacy of Large Numbers (1963)',
    confidence: 1.0,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['martingale', 'anti_pattern', 'position_sizing', 'ruin'],
  },
  {
    id: 'ap-002',
    domain: 'anti_patterns',
    title: 'Over-Optimization (Curve Fitting)',
    principle: 'A strategy with too many parameters that perfectly fits historical data will fail in live trading.',
    details: 'If a strategy has >10 optimizable parameters, it is almost certainly overfit. The more parameters, the more degrees of freedom, the easier it is to find parameters that look perfect on historical data but are fitting noise, not signal. Signs of overfitting: in-sample Sharpe > 3.0, walk-forward performance ratio > 2.0, large parameter sensitivity (small param changes dramatically alter results). The optimization loop MUST detect and reject overfit strategies.',
    source: 'Robert Pardo — The Evaluation and Optimization of Trading Strategies; David Aronson — Evidence-Based Technical Analysis',
    confidence: 0.95,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['overfitting', 'curve_fitting', 'anti_pattern', 'parameters'],
  },
  {
    id: 'ap-003',
    domain: 'anti_patterns',
    title: 'Ignoring Slippage and Fees',
    principle: 'A strategy that is profitable before fees and slippage may be a net loser after.',
    details: 'In crypto, taker fees are typically 0.04-0.1%. Market orders in volatile conditions can slip 0.05-0.5%. A scalping strategy with average profit of 0.1% per trade and 0.08% round-trip fees only has 0.02% real profit — one bad slip eliminates 5 winning trades. The backtest engine MUST include realistic fee and slippage modeling. The optimization loop should validate that the strategy has sufficient edge AFTER costs.',
    source: 'Universal quantitative trading principle. Every systematic fund models transaction costs explicitly.',
    confidence: 0.98,
    applicability: { regimes: ['all'], timeframes: ['scalp', 'day'], assets: ['all'] },
    tags: ['fees', 'slippage', 'transaction_costs', 'anti_pattern', 'realistic'],
  },
  {
    id: 'ap-004',
    domain: 'anti_patterns',
    title: 'Survivorship Bias in Strategy Development',
    principle: 'Testing only on currently successful assets biases results upward.',
    details: 'If you backtest a strategy on BTC because BTC has gone up historically, you are biasing toward strategies that are long. The strategy may simply be capturing the underlying trend of the asset. Always compare against buy-and-hold of the same asset. Also test on assets that did NOT survive (dead coins) to verify the strategy can identify and avoid losers. The walk-forward engine partially addresses this, but asset selection bias must also be checked.',
    source: 'Elton, Gruber & Blake — Survivorship Bias and Mutual Fund Performance (1996)',
    confidence: 0.90,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['survivorship_bias', 'anti_pattern', 'backtest', 'selection_bias'],
  },

  // ====================================================================
  // HFT / Scalping Strategies
  // ====================================================================

  {
    id: 'hft-001',
    domain: 'hft_strategies',
    title: 'Market Making Spread Capture',
    principle: 'Place simultaneous bid and ask orders to capture the spread. Profit comes from the bid-ask gap, not directional movement.',
    details: 'In crypto, perpetual futures have thin order books on many alts, creating 0.02-0.10% spread opportunities. The bot places limit orders on both sides, cancels and re-places as the mid-price moves. Key risks: inventory risk (accumulating a directional position), adverse selection (getting filled on the wrong side before a big move). Mitigations: position limits, rapid inventory flattening, volatility filters to pause during news events. Requires: low-latency execution, maker fee rebates (Phemex offers -0.025% maker rebates on some tiers). Expected: hundreds of trades/day, tiny PnL per trade, consistency over volume.',
    source: 'Irene Aldridge — High-Frequency Trading: A Practical Guide; market microstructure literature',
    confidence: 0.85,
    applicability: { regimes: ['ranging', 'all'], timeframes: ['scalp'], assets: ['all'] },
    tags: ['market_making', 'spread', 'hft', 'scalp', 'inventory', 'maker_rebate'],
  },
  {
    id: 'hft-002',
    domain: 'hft_strategies',
    title: 'Momentum Ignition / Microstructure Momentum',
    principle: 'Detect aggressive order flow and ride the micro-trend for seconds to minutes.',
    details: 'When large aggressive market orders hit one side of the book, they create short-lived momentum. The bot detects: large trade prints (>2x average trade size), rapid order book imbalance shifts (bid depth vs ask depth ratio changes >60:40), and funding rate spikes. Entry: market order in the direction of flow immediately after detection. Exit: tight trailing stop (0.03-0.08%) or time-based exit (30-120 seconds). Leverage: 10-25x typical. Win rate: 55-65% expected. The edge is speed — by the time retail reacts, the move is half done.',
    source: 'Quantitative microstructure research; Marcos Lopez de Prado — Advances in Financial Machine Learning (Ch. 19)',
    confidence: 0.80,
    applicability: { regimes: ['volatile', 'trending'], timeframes: ['scalp'], assets: ['all'] },
    tags: ['momentum', 'order_flow', 'hft', 'scalp', 'microstructure', 'aggressive_orders'],
  },
  {
    id: 'hft-003',
    domain: 'hft_strategies',
    title: 'Mean Reversion Scalping on Bollinger Band Extremes',
    principle: 'When price rapidly deviates beyond 2-3 standard deviations on short timeframes, snap back to the mean is statistically likely.',
    details: 'On 1m-5m charts, use 20-period Bollinger Bands (2.5 SD). When price pierces the outer band AND RSI(7) is extreme (>80 or <20) AND volume is declining (not a genuine breakout), enter counter-trend. Target: midline (20 SMA). Stop: 1.5x the band width from entry. Leverage: 5-15x. This works because short-term overreactions are common in crypto — emotional retail traders push price too far, and it snaps back. Key filter: NEVER counter-trend during a genuine breakout (check for expanding volume + ATR expansion). Expected: 60-70% win rate, 1.2:1 R:R, 20-50 trades/day per pair.',
    source: 'John Bollinger — Bollinger on Bollinger Bands; mean reversion literature; adapted for crypto microstructure',
    confidence: 0.85,
    applicability: { regimes: ['ranging', 'volatile'], timeframes: ['scalp'], assets: ['all'] },
    tags: ['mean_reversion', 'bollinger', 'rsi', 'scalp', 'hft', 'overreaction'],
  },
  {
    id: 'hft-004',
    domain: 'hft_strategies',
    title: 'Funding Rate Arbitrage',
    principle: 'When perpetual futures funding rates are extreme, take the opposite side and collect funding while hedging.',
    details: 'Funding rates on crypto perps are paid every 8 hours (some exchanges: every hour). When funding is very positive (>0.05%), longs pay shorts — so short the perp and long spot. When funding is very negative, reverse. This is low-risk arbitrage when properly hedged, but the scalp bot version skips the hedge: if funding is >0.03%, short the perp and hold through the funding timestamp, exiting shortly after collection. The edge: high-leverage shorts collect outsized funding relative to capital. Risk: price can move against you during the hold period. Mitigation: only enter when price is at resistance (confluence), tight stop. The AI supervisor monitors funding rate changes in real-time.',
    source: 'Crypto-native strategy; Binance/Phemex funding rate mechanics; adapted from basis trading',
    confidence: 0.75,
    applicability: { regimes: ['all'], timeframes: ['scalp', 'day'], assets: ['all'] },
    tags: ['funding_rate', 'arbitrage', 'hft', 'scalp', 'perp', 'basis'],
  },
  {
    id: 'hft-005',
    domain: 'hft_strategies',
    title: 'Volatility Breakout Scalping',
    principle: 'During low-volatility squeezes, the subsequent breakout direction is predictable 60-70% of the time using volume confirmation.',
    details: 'Detect squeeze: Bollinger Band width at 20-period low AND ATR(14) declining for 3+ bars on 1m-5m chart. Place bracket orders: buy stop above upper band, sell stop below lower band. When one fills, cancel the other. The first 30-60 seconds of a breakout from a squeeze typically travel 1-2 ATR before the first pullback. Exit: trailing stop at 0.5 ATR or when momentum (MACD histogram) reverses. Leverage: 10-20x. Key insight from Keltner Channel + BB squeeze combo: when BB goes inside Keltner, squeeze is confirmed. Breakout direction predicted by: which band price was pressing against during the squeeze, volume delta, and order book pressure.',
    source: 'John Carter — Mastering the Trade (TTM Squeeze); adapted for crypto HFT',
    confidence: 0.82,
    applicability: { regimes: ['ranging'], timeframes: ['scalp'], assets: ['all'] },
    tags: ['squeeze', 'breakout', 'volatility', 'hft', 'scalp', 'keltner', 'bollinger'],
  },
  {
    id: 'hft-006',
    domain: 'hft_strategies',
    title: 'Multi-Pair Correlation Scalping',
    principle: 'When correlated pairs temporarily diverge, trade the convergence.',
    details: 'BTC and ETH are correlated ~0.85 over most periods. When ETH suddenly lags BTC (or vice versa), the laggard typically catches up within minutes. Monitor the spread between normalized prices of correlated pairs. When the z-score of the spread exceeds 2.0: long the laggard, short the leader. Exit when z-score returns to 0.5 or below. This is crypto-native pairs trading. Scale across many pairs simultaneously — BTC/ETH, SOL/AVAX, etc. Each trade is small, but running across 10-20 pairs generates consistent volume. Risk: correlation breakdown during regime changes (BTC pumps, alt season doesn\'t follow). Filter: check rolling 4h correlation before entry, skip if <0.70.',
    source: 'Statistical arbitrage / pairs trading literature; adapted for crypto market structure',
    confidence: 0.78,
    applicability: { regimes: ['all'], timeframes: ['scalp', 'day'], assets: ['all'] },
    tags: ['pairs_trading', 'correlation', 'stat_arb', 'hft', 'scalp', 'spread', 'z_score'],
  },
  {
    id: 'hft-007',
    domain: 'hft_strategies',
    title: 'HFT Risk Management — The Survival Rules',
    principle: 'HFT profit per trade is tiny. One bad trade can wipe out 50+ winners. Risk management is not optional — it IS the strategy.',
    details: 'Hard rules for HFT/scalp bots: 1) Max position size per trade: 2% of portfolio (even at high leverage). 2) Daily loss circuit breaker: -3% of portfolio → bot pauses for 4 hours. 3) Per-trade max loss: 0.15% of portfolio (leverage-adjusted). 4) Max concurrent positions: 3 per pair, 10 total across all pairs. 5) Exponential backoff on consecutive losses: after 3 consecutive losses, double the minimum time between entries. After 5, pause for 15 minutes. After 8, pause for 1 hour. 6) Never increase leverage after a loss. 7) Track slippage in real-time — if average slippage exceeds 2x expected, reduce size or pause. 8) End-of-session flatten: all positions closed before any planned downtime.',
    source: 'Institutional HFT risk management practices; Irene Aldridge; adapted for retail crypto',
    confidence: 0.95,
    applicability: { regimes: ['all'], timeframes: ['scalp'], assets: ['all'] },
    tags: ['risk_management', 'hft', 'circuit_breaker', 'position_sizing', 'scalp', 'survival'],
  },
  {
    id: 'hft-008',
    domain: 'hft_strategies',
    title: 'Grid Trading for Range-Bound Markets',
    principle: 'Place buy and sell orders at regular price intervals (grid) to profit from natural oscillation.',
    details: 'When a market is range-bound (identified by ADX < 20 and declining BB width), deploy a grid of limit orders. Grid spacing: 0.1-0.3% per level. Grid range: recent support to resistance (use 50-period high/low). Each grid level that fills creates a pending opposite order at the adjacent level. Profit = grid spacing minus fees. Works beautifully in crypto ranging periods (which are common during low-volume sessions). Key risk: trend breakout through the grid → accumulates a large losing position. Mitigation: overall position limit, emergency stop if position exceeds 5% of portfolio, pause grid if ATR expands >2x average. Expected: consistent small profits during ranging periods, losses during trends. The AI supervisor detects regime change and activates/deactivates the grid automatically.',
    source: 'Grid trading quantitative literature; popular in crypto since 2018; institutionalized by 3Commas/Pionex',
    confidence: 0.80,
    applicability: { regimes: ['ranging'], timeframes: ['scalp', 'day'], assets: ['all'] },
    tags: ['grid', 'range_trading', 'hft', 'scalp', 'limit_orders', 'oscillation'],
  },

  // ====================================================================
  // Performance Review & Continuous Learning
  // ====================================================================

  {
    id: 'pr-001',
    domain: 'performance_review',
    title: 'Post-Trade Analysis Framework',
    principle: 'Every closed trade must be analyzed against its original thesis to identify execution quality, decision quality, and luck.',
    details: 'For each trade, compute: 1) Was the thesis correct? (Did the market do what we expected?) 2) Was the entry timing good? (Compare entry vs optimal entry within the move) 3) Was the exit timing good? (Compare exit vs optimal exit) 4) Did we follow the rules? (Check if all conditions were met at entry) 5) Was the position size correct? (Compare actual vs Kelly-recommended size) 6) Was there slippage impact? (Actual fill vs expected fill) 7) Was the hold time appropriate? This decomposition separates SKILL from LUCK. A trade can be profitable due to luck (bad entry, bad thesis, but market moved anyway) or unprofitable despite good decision-making (thesis correct, entered well, but random noise hit stop).',
    source: 'Michael Mauboussin — The Success Equation; Annie Duke — Thinking in Bets; systematic trading audit practices',
    confidence: 0.92,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['post_trade', 'review', 'performance', 'thesis_validation', 'skill_vs_luck'],
  },
  {
    id: 'pr-002',
    domain: 'performance_review',
    title: 'Error Taxonomy & Pattern Detection',
    principle: 'Categorize every mistake into a taxonomy so the system can detect recurring patterns and prevent them.',
    details: 'Error categories: 1) ENTRY_PREMATURE — entered before all conditions confirmed 2) ENTRY_LATE — waited too long, moved already happened 3) EXIT_PREMATURE — took profit too early, left money on table 4) EXIT_LATE — held too long past signals, gave back profit 5) STOP_TOO_TIGHT — stopped out then market reversed in our direction 6) STOP_TOO_WIDE — allowed too much drawdown before stopping 7) SIZE_TOO_LARGE — position size exceeded risk rules 8) SIZE_TOO_SMALL — had high conviction but undersized 9) WRONG_DIRECTION — thesis was fundamentally wrong 10) IGNORED_SIGNALS — overrode or ignored system signals 11) CORRELATED_RISK — multiple correlated positions amplified loss 12) REGIME_MISMATCH — applied wrong strategy for current market regime. Track frequency of each error type over time. If an error type occurs >3 times in 20 trades, it becomes a HARD CONSTRAINT until the pattern breaks.',
    source: 'Trading psychology literature; adapted from Van Tharp\'s error tracking; Mark Douglas — Trading in the Zone',
    confidence: 0.90,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['error_taxonomy', 'review', 'performance', 'pattern_detection', 'learning'],
  },
  {
    id: 'pr-003',
    domain: 'performance_review',
    title: 'Equity Curve Analysis & Regime Correlation',
    principle: 'The shape of the equity curve reveals whether the strategy works in all conditions or only specific regimes.',
    details: 'Plot equity curve and overlay market regime markers (trending/ranging/volatile). Look for: 1) Staircase pattern (consistent gains, small drawdowns) → healthy strategy 2) Hockey stick (flat then sudden jump) → strategy only works in specific conditions, likely overfit 3) Sawtooth (big gains followed by big losses) → strategy lacks proper risk management 4) Steady decline with occasional spikes → anti-pattern, likely fighting the trend. Compute rolling Sharpe (30-trade window) to detect strategy degradation over time. If rolling Sharpe drops below 0.5 for 30+ trades, the strategy should be paused for review. Correlate drawdown periods with regime data to understand WHEN the strategy fails.',
    source: 'Quantitative portfolio management; equity curve trading concept from Kevin Davey',
    confidence: 0.88,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['equity_curve', 'review', 'performance', 'regime', 'degradation', 'rolling_sharpe'],
  },
  {
    id: 'pr-004',
    domain: 'performance_review',
    title: 'Continuous Learning Feedback Loop',
    principle: 'Every performance review generates actionable knowledge that feeds back into the strategy and knowledge base.',
    details: 'The review agent produces 3 outputs: 1) LESSONS — new knowledge entries to add to the knowledge base (e.g., "RSI divergence on 5m chart has 72% win rate for BTC shorts during high-volume sessions"). 2) CONSTRAINTS — new rules to enforce (e.g., "Do not enter long when funding rate > 0.05% — lost 4/5 such trades"). 3) ADJUSTMENTS — specific parameter changes to test in the optimization loop (e.g., "Tighten RSI entry from 30 to 25 based on 40-trade sample"). Each output has a DecisionRecord with supporting evidence (the actual trades that justify it). The optimization loop can ingest these adjustments as starting points for its next iteration. This creates a genuine learning system: trade → review → learn → improve → trade better.',
    source: 'Adaptive systems design; machine learning feedback loop principles; FinAgent audit layer concept',
    confidence: 0.90,
    applicability: { regimes: ['all'], timeframes: ['all'], assets: ['all'] },
    tags: ['feedback_loop', 'learning', 'review', 'performance', 'adaptive', 'knowledge_generation'],
  },
];

// ============================================================================
// Optimization Directives — Rules the self-improvement loop follows
// ============================================================================

export interface OptimizationDirective {
  id: string;
  priority: number;             // 1 = highest
  directive: string;
  details: string;
  metrics: string[];            // which metrics this affects
}

export const OPTIMIZATION_DIRECTIVES: OptimizationDirective[] = [
  {
    id: 'opt-001',
    priority: 1,
    directive: 'Reduce max drawdown first, improve returns second',
    details: 'The optimization loop should prioritize drawdown reduction over return enhancement. A strategy with 10% max drawdown and 25% annual return is superior to one with 30% drawdown and 40% return. Due to asymmetric recovery math, reducing drawdown has a compounding effect on long-term returns that exceeds the apparent return difference.',
    metrics: ['maxDrawdownPercent', 'totalPnlPercent'],
  },
  {
    id: 'opt-002',
    priority: 2,
    directive: 'Improve profit factor before win rate',
    details: 'A strategy with 40% win rate and 3:1 R:R (profit factor ~2.0) is more robust than 70% win rate with 0.5:1 R:R (profit factor ~1.2). High win rate strategies feel better but are more fragile — a small decrease in win rate devastates P&L when average winners are small. Focus on letting winners run (increasing avg win / avg loss ratio) before trying to increase win rate.',
    metrics: ['profitFactor', 'winRate', 'avgWin', 'avgLoss'],
  },
  {
    id: 'opt-003',
    priority: 3,
    directive: 'Minimize parameter count',
    details: 'When two strategy configurations produce similar results but one has fewer optimizable parameters, prefer the simpler one. Each additional parameter is a degree of freedom that increases overfit risk. The ideal strategy has 3-5 parameters. More than 8 is a red flag. More than 12 is almost certainly overfit.',
    metrics: ['sortinoRatio', 'sharpeRatio'],
  },
  {
    id: 'opt-004',
    priority: 4,
    directive: 'Check for disposition effect in every iteration',
    details: 'After each backtest, compare average hold time of winners vs losers. If losers are held longer, the exit conditions need tightening. The ratio should be avgWinHoldTime >= avgLossHoldTime. If not, consider: tighter time-based stops, wider take profits, or adding trailing stops.',
    metrics: ['avgHoldTime', 'avgWin', 'avgLoss'],
  },
  {
    id: 'opt-005',
    priority: 5,
    directive: 'Validate with walk-forward on every iteration',
    details: 'Never accept an optimization result based solely on full-sample backtest. Every iteration must pass walk-forward validation with overfit ratio < 2.0. If walk-forward fails, the improvement is overfitting and must be rejected, even if the full-sample metrics look better.',
    metrics: ['sharpeRatio', 'winRate', 'profitFactor'],
  },
  {
    id: 'opt-006',
    priority: 6,
    directive: 'Adapt to regime — do not force one strategy on all conditions',
    details: 'If the backtest shows strong performance in trending markets but poor in ranging, do not try to fix the ranging performance by adding complexity. Instead, consider: adding a regime filter (only trade in favorable regime), or layering a complementary mean-reversion component for ranging periods. The optimization loop should test both approaches.',
    metrics: ['totalPnl', 'maxDrawdownPercent', 'winRate'],
  },
  {
    id: 'opt-007',
    priority: 7,
    directive: 'Compare against buy-and-hold on every iteration',
    details: 'If the strategy does not beat buy-and-hold on a risk-adjusted basis (Sharpe ratio), it provides no value. The whole point is to achieve either: higher returns with equal risk, equal returns with lower risk, or (ideally) higher returns with lower risk. If buy-and-hold Sharpe > strategy Sharpe, the strategy needs fundamental rethinking.',
    metrics: ['sharpeRatio', 'totalPnlPercent', 'buyAndHoldReturnPercent'],
  },
];

// ============================================================================
// Query Functions — Used by AI agents during research & optimization
// ============================================================================

export function queryKnowledge(filters: {
  domain?: KnowledgeDomain;
  tags?: string[];
  regime?: 'trending' | 'ranging' | 'volatile';
  timeframe?: 'scalp' | 'day' | 'swing' | 'position';
  minConfidence?: number;
}): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter(entry => {
    if (filters.domain && entry.domain !== filters.domain) return false;
    if (filters.tags && !filters.tags.some(t => entry.tags.includes(t))) return false;
    if (filters.regime && !entry.applicability.regimes.includes(filters.regime) && !entry.applicability.regimes.includes('all')) return false;
    if (filters.timeframe && !entry.applicability.timeframes.includes(filters.timeframe) && !entry.applicability.timeframes.includes('all')) return false;
    if (filters.minConfidence && entry.confidence < filters.minConfidence) return false;
    return true;
  });
}

export function getAntiPatterns(): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter(e => e.domain === 'anti_patterns');
}

export function getStrategyTemplates(): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter(e => e.domain === 'strategy_patterns');
}

export function getHardConstraints(): HardConstraint[] {
  return HARD_CONSTRAINTS;
}

export function getOptimizationDirectives(): OptimizationDirective[] {
  return OPTIMIZATION_DIRECTIVES.sort((a, b) => a.priority - b.priority);
}

export function getKnowledgeForPhase(phase: string): KnowledgeEntry[] {
  const phaseTagMap: Record<string, string[]> = {
    market_structure: ['support_resistance', 'regime', 'trend_strength', 'adx', 'btc_dominance'],
    technical_confluence: ['rsi', 'macd', 'bollinger', 'ema', 'multi_timeframe', 'confluence', 'volume'],
    agent_consensus: ['momentum', 'mean_reversion', 'trend_following', 'contrarian'],
    pattern_matching: ['breakout', 'squeeze', 'divergence', 'flip'],
    risk_reward: ['position_sizing', 'kelly', 'atr', 'risk_of_ruin', 'drawdown'],
    scenario_analysis: ['liquidation', 'cascade', 'funding_rate', 'whale'],
    knowledge_integration: ['on_chain', 'exchange_flow', 'fear_greed', 'sentiment', 'behavioral'],
    strategy_synthesis: ['turtle', 'walk_forward', 'overfitting', 'anti_pattern', 'optimization'],
    hft_setup: ['hft', 'scalp', 'market_making', 'spread', 'order_flow', 'grid', 'momentum'],
    performance_review: ['post_trade', 'review', 'performance', 'error_taxonomy', 'learning', 'feedback_loop'],
  };
  const tags = phaseTagMap[phase] || [];
  return queryKnowledge({ tags, minConfidence: 0.7 });
}

export function getHFTStrategies(): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter(e => e.domain === 'hft_strategies');
}

export function getPerformanceReviewKnowledge(): KnowledgeEntry[] {
  return KNOWLEDGE_BASE.filter(e => e.domain === 'performance_review');
}
