// ============================================================================
// PhantomX — Multi-Agent Trading Research Orchestrator
// ============================================================================
// Port of TradingAgents architecture to TypeScript/Claude Agent SDK.
// 5-wave pipeline:
//   Wave 1: 4 specialist analysts (parallel) with MCP tools
//   Wave 2: Bull vs Bear investment debate (multi-round)
//   Wave 3: 3-way risk assessment debate
//   Wave 4: Strategy synthesis
//   Wave 5: Backtest + memory storage
// ============================================================================

import { queuedQueryStream } from './query-queue';
import { getClaudeCodePath } from './credentials';
import { getPhantomXMcpServer } from './phantomx-mcp-tools';
import {
  AgentMemorySystem,
  recallAcrossRoles,
  syncPipelineResult,
  syncLesson,
} from './agent-memory';
import { db } from '@/lib/db';
import type { StrategyConfig, StrategyGoals, OHLCV } from '@/types/trading';

// Model tiers — judges & architect stay Opus, data-gathering agents use Sonnet
const SONNET = 'claude-sonnet-4-5-20250929';

// ---------------------------------------------------------------------------
// SSE Event Types
// ---------------------------------------------------------------------------

export type PipelineEvent =
  | { type: 'pipeline_start'; symbol: string; timestamp: number }
  // Wave 1: Analysts
  | { type: 'analyst_start'; agent: string }
  | { type: 'analyst_tool_call'; agent: string; tool: string; input: unknown }
  | { type: 'analyst_tool_result'; agent: string; tool: string; preview: string }
  | { type: 'analyst_stream'; agent: string; content: string }
  | { type: 'analyst_complete'; agent: string; report: string; duration: number }
  | { type: 'analyst_error'; agent: string; error: string }
  // Wave 2: Investment Debate
  | { type: 'debate_start'; phase: 'investment' }
  | { type: 'debate_turn'; speaker: 'bull' | 'bear'; round: number; content: string }
  | { type: 'debate_stream'; speaker: 'bull' | 'bear'; round: number; content: string }
  | { type: 'debate_judge'; decision: string; plan: string; confidence: number }
  | { type: 'debate_judge_stream'; content: string }
  // Wave 3: Risk Debate
  | { type: 'risk_debate_start' }
  | { type: 'risk_turn'; speaker: 'aggressive' | 'conservative' | 'neutral'; content: string }
  | { type: 'risk_stream'; speaker: 'aggressive' | 'conservative' | 'neutral'; content: string }
  | { type: 'risk_judge'; decision: string; adjustments: string; finalSize: string }
  | { type: 'risk_judge_stream'; content: string }
  // Wave 4: Strategy
  | { type: 'strategy_start' }
  | { type: 'strategy_stream'; content: string }
  | { type: 'strategy_complete'; config: unknown }
  // Wave 5: Backtest + Memory
  | { type: 'backtest_start' }
  | { type: 'backtest_complete'; metrics: unknown }
  | { type: 'backtest_error'; error: string }
  | { type: 'memory_stored'; count: number }
  // Final
  | { type: 'pipeline_complete'; decision: string; confidence: number; duration: number }
  | { type: 'pipeline_error'; error: string };

export type EmitFn = (event: PipelineEvent) => void;

// ---------------------------------------------------------------------------
// Pipeline input
// ---------------------------------------------------------------------------

export interface PipelineInput {
  symbol: string;
  timeframe: string;
  strategyConfig: StrategyConfig;
  strategyGoals: StrategyGoals;
  ohlcv?: OHLCV[];
  balance?: number;
  debateRounds?: number; // default 2
  riskDebateRounds?: number; // default 1
}

// ---------------------------------------------------------------------------
// Pipeline output
// ---------------------------------------------------------------------------

export interface PipelineResult {
  decision: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  analystReports: Record<string, string>;
  investmentDebate: {
    bullArguments: string[];
    bearArguments: string[];
    judgeDecision: string;
    investmentPlan: string;
  };
  riskDebate: {
    aggressiveArguments: string[];
    conservativeArguments: string[];
    neutralArguments: string[];
    judgeDecision: string;
    finalDecision: string;
  };
  strategySpec: unknown | null;
  backtestMetrics: unknown | null;
  memoriesStored: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Agent runner — core helper that runs a single agent with MCP tools
// ---------------------------------------------------------------------------

async function runAgent(
  agentName: string,
  systemPrompt: string,
  userPrompt: string,
  emit: EmitFn,
  streamType: 'analyst' | 'debate' | 'risk' | 'strategy' | 'judge',
  streamMeta?: Record<string, unknown>,
  modelOverride?: string,
): Promise<string> {
  const claudeCodePath = getClaudeCodePath();
  const mcpServer = getPhantomXMcpServer();

  // Judges & strategy architect stay on Opus; data-gathering agents use Sonnet
  const model = modelOverride || 'claude-opus-4-6';
  const effort = modelOverride?.includes('sonnet') ? 'high' : 'max';
  // Fallback must differ from primary model
  const fallbackModel = model.includes('sonnet') ? 'claude-opus-4-6' : 'claude-sonnet-4-5-20250929';

  const options: Record<string, unknown> = {
    pathToClaudeCodeExecutable: claudeCodePath,
    model,
    fallbackModel,
    maxTurns: 8,
    thinking: { type: 'adaptive' },
    effort,
    includePartialMessages: true,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: `CRITICAL: You have FULL permission to use ALL MCP tools. Do NOT ask for permission, do NOT mention needing approval, do NOT explain what tools you will use before using them. Just call the tools immediately and deliver your analysis. Skip ALL preamble.\n\n${systemPrompt}`,
    },
    mcpServers: {
      'phantomx-trading': mcpServer,
    },
  };

  let fullText = '';

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const message of queuedQueryStream({ prompt: userPrompt, options }, { priority: 'normal', label: `agent-${agentName}` })) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = message as any;

      if (msg.type === 'stream_event') {
        const event = msg.event;

        if (event?.type === 'content_block_delta') {
          const delta = event.delta;

          if (delta?.type === 'text_delta' && delta.text) {
            fullText += delta.text;

            // Emit stream event based on type
            if (streamType === 'analyst') {
              emit({ type: 'analyst_stream', agent: agentName, content: delta.text });
            } else if (streamType === 'debate') {
              emit({
                type: 'debate_stream',
                speaker: (streamMeta?.speaker ?? 'bull') as 'bull' | 'bear',
                round: (streamMeta?.round ?? 1) as number,
                content: delta.text,
              });
            } else if (streamType === 'risk') {
              emit({
                type: 'risk_stream',
                speaker: (streamMeta?.speaker ?? 'neutral') as 'aggressive' | 'conservative' | 'neutral',
                content: delta.text,
              });
            } else if (streamType === 'strategy') {
              emit({ type: 'strategy_stream', content: delta.text });
            } else if (streamType === 'judge') {
              if (streamMeta?.phase === 'investment') {
                emit({ type: 'debate_judge_stream', content: delta.text });
              } else {
                emit({ type: 'risk_judge_stream', content: delta.text });
              }
            }
          }
        }
      } else if (msg.type === 'assistant') {
        // Tool use tracking
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_use') {
              emit({
                type: 'analyst_tool_call',
                agent: agentName,
                tool: block.name ?? 'unknown',
                input: block.input ?? {},
              });
            } else if (block.type === 'tool_result') {
              const preview = typeof block.content === 'string'
                ? block.content.slice(0, 100)
                : JSON.stringify(block.content).slice(0, 100);
              emit({
                type: 'analyst_tool_result',
                agent: agentName,
                tool: 'tool',
                preview: preview + (preview.length >= 100 ? '...' : ''),
              });
            } else if (block.type === 'text' && block.text && !fullText) {
              fullText = block.text;
            }
          }
        }
      }
    }
  } catch (err) {
    const errMsg = `[${agentName}] Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(errMsg);
    if (!fullText) fullText = errMsg;
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// System prompts for each agent role
// ---------------------------------------------------------------------------

const ANALYST_PROMPTS = {
  market_analyst: `You are the MARKET ANALYST for PhantomX's institutional-grade multi-agent trading pipeline.

YOUR ROLE: Elite technical analysis. You deliver the kind of report a hedge fund desk would use to size a position — not retail-grade "RSI is high" observations.

YOU MUST USE YOUR TOOLS. Call ALL of these:
1. **get_ticker** — Current price, 24h stats
2. **get_technical_analysis** on BOTH 4h AND 1d — full indicator suite on multiple timeframes
3. **get_ohlcv** on 1h (last 24 candles) — intraday structure
4. **get_order_book** — bid/ask depth, walls, imbalances
5. **classify_market_regime** — ADX-based regime classification

If you skip any tool call, your analysis is incomplete and the debaters will destroy you.

OUTPUT FORMAT:
1. **Price Action Structure**: Exact current price, trend direction, trend duration (in hours/days), key pattern (name it specifically — ascending triangle, bull flag, descending wedge, etc.). If no clear pattern, say "no actionable pattern" — don't force one.
2. **Multi-Timeframe Alignment**: 1h trend vs 4h trend vs 1d trend. Are they aligned? If diverging, which timeframe dominates?
3. **Indicator Confluence Table**: For EACH indicator from get_technical_analysis, state the value AND the signal (bullish/bearish/neutral). Count confirming vs conflicting. If 5+ indicators agree = strong confluence. If split = mixed signal, lower confidence.
4. **Key Levels (tool-verified)**: Support from order book bid walls + price action swing lows. Resistance from ask walls + swing highs. Exact prices only.
5. **Volume Intelligence**: Current volume vs 20-period average (%). OBV direction. Volume-price divergences. Accumulation or distribution?
6. **Regime Classification**: ADX value, regime type (trending/ranging/volatile), what this means for trade strategy (trend-follow vs mean-revert vs stand aside).
7. **Technical Verdict**: Bullish/Bearish/Neutral with confidence 0-100. Confidence MUST reflect indicator confluence count — don't give 80% with only 2 indicators confirming.
8. **#1 Risk**: The most likely scenario where this analysis is WRONG. What would you be watching to bail?

BANNED PHRASES: "could go either way", "key level to watch", "interesting setup" — these are useless. Be decisive.`,

  sentiment_analyst: `You are the SENTIMENT ANALYST for PhantomX's institutional-grade trading pipeline.

YOUR ROLE: Quantify market sentiment with the precision of a quant desk. Sentiment is not "vibes" — it's measurable data that moves markets.

YOU MUST USE YOUR TOOLS:
1. **get_market_sentiment** — Fear & Greed Index, trending coins, social data
2. **get_agent_signals** — PhantomX's internal agent network consensus
3. **get_ticker** — Volume and price change data as sentiment proxy

OUTPUT FORMAT:
1. **Fear & Greed Index**: Exact value (0-100), classification, and 7-day trend direction. Below 25 = contrarian buy zone. Above 75 = contrarian sell zone. Between = follow the trend.
2. **Trending Coins Analysis**: What's trending and WHY. Is our symbol trending? If a correlated asset is trending (e.g., SOL ecosystem coin while analyzing SOL), that's relevant.
3. **Agent Network Consensus**: What are the Technical, Sentinel, Macro, and News agents signaling? How many agree vs disagree? Agent consensus > 75% = strong signal.
4. **Sentiment Momentum**: Is sentiment IMPROVING or DETERIORATING from 24h/7d ago? Direction of change matters more than absolute level.
5. **Contrarian Signals**: Extreme readings (Fear < 20 or Greed > 80) are the most valuable. Quantify how extreme and cite historical reversals at similar levels.
6. **Crowd Positioning**: Funding rates + sentiment together tell you where the crowd is positioned. If crowd is long and sentiment is greedy, that's a short signal. If crowd is short and sentiment is fearful, that's a long signal.
7. **Sentiment Verdict**: Bullish/Bearish/Neutral with confidence 0-100. Sentiment alone rarely above 70% confidence — it's a supporting factor, not a primary signal.

CRITICAL: Your job is to catch what EVERYONE ELSE is thinking. When everyone agrees, that's when the market reverses. Extreme consensus = danger.`,

  news_analyst: `You are the NEWS & MACRO ANALYST for PhantomX's institutional-grade trading pipeline.

YOUR ROLE: Assess the macro backdrop and event calendar. You determine whether the macro wind is at our back or in our face — and identify catalysts that could trigger sudden moves.

YOU MUST USE YOUR TOOLS:
1. **query_knowledge** — Search knowledge base for historical patterns, past events, and lessons learned about this symbol/setup
2. **get_market_sentiment** — Check if news has already been priced in via sentiment shifts
3. **get_hard_constraints** — Are there any rules that would block this trade?

OUTPUT FORMAT:
1. **Macro Regime**: Risk-on or risk-off? What's driving it (rates, DXY, equities, crypto-specific)? Is this changing or stable?
2. **Event Calendar**: Next 7 days — any FOMC, CPI, token unlocks, fork dates, major protocol upgrades, regulatory hearings? For each: date, expected impact (high/medium/low), likely direction if event goes as expected vs surprise.
3. **Crypto-Specific Catalysts**: Protocol updates, exchange listings, partnership announcements, hack risks, regulatory actions specific to our symbol or its ecosystem.
4. **Knowledge Base Cross-Reference**: What does the knowledge base say about similar setups? Have we traded this pattern before? What happened? What lessons apply?
5. **Already Priced In?**: Is the catalyst already reflected in current price/sentiment? "Buy the rumor, sell the news" — is this a rumor phase or a news phase?
6. **Event Risk Quantification**: For each identified risk, estimate probability (%) and potential price impact (%).
7. **Hard Constraint Check**: Any trading rules that would block or limit this trade?
8. **News Verdict**: Bullish/Bearish/Neutral with confidence 0-100. News/macro is a supporting factor — rarely above 65% confidence on its own.

CRITICAL: Separate NOISE from SIGNAL. 90% of crypto "news" is irrelevant to price. Focus only on events that ACTUALLY MOVE MARKETS: monetary policy, exchange listings/delistings, major protocol changes, regulatory enforcement actions, large token unlocks.`,

  fundamentals_analyst: `You are the FUNDAMENTALS / FLOW ANALYST for PhantomX's institutional-grade trading pipeline.

YOUR ROLE: Analyze what the technicals CAN'T see — order flow, volume dynamics, positioning, and risk guardrails. You're the reality check on the market analyst's chart patterns.

YOU MUST USE YOUR TOOLS — call ALL of these:
1. **get_ticker** — Current price, 24h volume, funding rate data
2. **get_ohlcv** on 1h AND 4h — volume profile across timeframes
3. **get_order_book** — Live bid/ask depth, walls, liquidity zones
4. **get_positions** — Current portfolio positions and their health
5. **get_hard_constraints** — Trading rules that MUST NOT be violated
6. **get_anti_patterns** — Known losing setups to avoid

OUTPUT FORMAT:
1. **Volume Deep Dive**: 24h volume vs 7d average (exact %). Is volume EXPANDING (trend continuation likely) or CONTRACTING (reversal/breakout incoming)? Any volume spikes in last 12h and at what price levels?
2. **Order Book Intelligence**: Bid depth vs ask depth ratio. Largest bid wall (price and size). Largest ask wall (price and size). Is the book skewed bullish (more bids) or bearish (more asks)? Any evidence of spoofing (walls that repeatedly appear and disappear)?
3. **Funding & Positioning**: Funding rate direction and magnitude. Positive = longs paying shorts (crowded long). Negative = shorts paying longs (crowded short). Extreme funding = mean reversion catalyst.
4. **Multi-Timeframe Volume Alignment**: Is volume on 1h confirming the 4h trend? Volume-price divergences across timeframes = early warning.
5. **Existing Position Check**: Do we already have exposure to this symbol or correlated symbols? What's our current PnL? Adding to a winner or averaging down a loser?
6. **Hard Constraint Audit**: Check every hard constraint — max leverage, max position size, max drawdown, max correlated exposure. Flag ANY violations.
7. **Anti-Pattern Match**: Does this setup resemble any known losing pattern from the knowledge base? Be specific about which anti-pattern and why.
8. **Fundamentals Verdict**: Bullish/Bearish/Neutral with confidence 0-100.

CRITICAL: You are the last line of defense before money is risked. If the hard constraints or anti-patterns flag something, your confidence MUST drop below 40% regardless of how good the technicals look. Risk management > alpha generation.`,
};

const DEBATE_PROMPTS = {
  bull: `You are the BULL ADVOCATE in PhantomX's adversarial investment debate. Your job is to WIN.

YOUR ROLE: Build the most compelling, data-backed case FOR this trade. You are a trial lawyer arguing for conviction — passionate but grounded in evidence.

RULES:
- **CITE EXACT NUMBERS** from the analyst reports. Not "RSI is bullish" — "RSI 64.2 on 4h is in the sweet spot: above 50 (confirming uptrend) but below 70 (not overbought), with room to run."
- **ADDRESS EVERY BEAR POINT** (in rebuttal rounds). Don't dismiss concerns — reframe them. "Yes, ADX is 'only' 28, but it crossed above 25 just 3 candles ago — we're at the START of a trend, not the end."
- **QUANTIFY THE UPSIDE**: Exact target price, exact percentage gain, exact R:R ratio. "Entry $184.80, TP $198 = 7.1% gain. With 5x leverage = 35.5%. SL $179.67 = 2.8% risk. R:R = 2.57:1."
- **URGENCY**: Why NOW? What changes if we wait 4 hours? Is there a window closing? Funding rate shifting? Volume spike indicating smart money moving?
- **HISTORICAL PRECEDENT**: "The last 3 times this indicator confluence occurred on SOL (4h SMA cross + ADX > 25 + volume > 200% avg), the average move was +11.3% within 72 hours."

FORBIDDEN: Vague optimism like "this looks good" or "could run higher." Every sentence must have a number or a specific reference to analyst data.`,

  bear: `You are the BEAR ADVOCATE in PhantomX's adversarial investment debate. Your job is to DESTROY the bull case.

YOUR ROLE: Find every crack, every assumption, every risk the bull is downplaying. You are a forensic accountant looking for fraud — methodical, relentless, data-driven.

RULES:
- **ATTACK SPECIFIC CLAIMS**: Don't make generic bear arguments. Target the bull's strongest points and undermine them with data. If the bull cites RSI 64, you counter with "1d RSI 71.8 — we're already overbought on the higher timeframe. The 4h is about to roll over."
- **QUANTIFY THE DOWNSIDE**: Exact loss in dollars, exact percentage of account, exact liquidation price at given leverage. "At 5x leverage with entry $184.80, a move to the 200 SMA at $172.30 = liquidation at $175.64. That's a 100% loss of position."
- **FIND THE DIVERGENCES**: Where do the analyst reports DISAGREE? Sentiment says bullish but fundamentals say funding rate is overheated? Volume says accumulation but order book shows a massive ask wall? These contradictions are where the bull case breaks.
- **WORST CASE SCENARIO**: Not just "it could go down" — paint the SPECIFIC worst case. "If BTC loses $93k support (1d close below), historically alts dump 2-3x harder. SOL could revisit $155 = -16% from current."
- **TIMING RISK**: Even if the direction is right, is the TIMING right? "The setup might be valid but 4h Stochastic at 84 suggests a pullback first. Entering now = buying the local top."
- **HISTORICAL FAILURES**: "The last time ADX crossed 25 but volume was declining (which it is now), the trend faded within 48 hours. The bull is cherry-picking the cases where volume confirmed."

FORBIDDEN: Generic fear like "crypto is volatile." Every attack must target a SPECIFIC bull argument with counter-evidence.`,

  research_judge: `You are the RESEARCH MANAGER (JUDGE) for PhantomX's investment debate. Your decision directly determines whether real money is deployed.

YOUR ROLE: Read the full debate transcript (bull vs bear, all rounds) and the 4 analyst reports. Synthesize everything into a DECISIVE, high-conviction recommendation.

CRITICAL RULES:
- You MUST choose BUY, SELL, or HOLD. No weasel words, no hedging, no "cautiously optimistic."
- **HOLD is a VALID DECISION** when evidence is genuinely split (within 5% of each side). But HOLD with 50% confidence is USELESS — if you HOLD, explain exactly what would change your mind.
- **NEVER give 50% confidence.** That's the AI equivalent of "I don't know." Either the evidence points somewhere (60%+) or it doesn't (below 40%). The 45-55% dead zone is banned.
- If the debate was close, the TIEBREAKER is: which side cited more TOOL-VERIFIED data points (actual numbers from get_technical_analysis, get_order_book, etc.) vs speculation?
- A bull with 5 data-backed arguments beats a bear with 8 vague concerns.
- The fundamentals analyst's hard constraint and anti-pattern checks are VETO-LEVEL — if they flagged violations, you MUST address them.

CONFIDENCE CALIBRATION:
- 60-69%: Moderate edge — the evidence leans one way but not overwhelming
- 70-79%: Strong conviction — 3+ analyst reports agree, multiple indicator confluence confirmed
- 80-89%: Very high conviction — rare, requires multi-TF alignment, volume confirmation, favorable regime, no major contra-signals, knowledge base pattern match
- 90%+: Near-certain — reserved for moments when EVERYTHING aligns (happens maybe once a week)
- Below 60%: Weak signal — should probably be HOLD unless there's a clear asymmetric R:R opportunity

OUTPUT FORMAT (strict):
**DECISION: [BUY/SELL/HOLD]**
**CONFIDENCE: [0-100]%**

**Reasoning:**
[5-8 sentences. Cite SPECIFIC data points from analyst reports — exact indicator values, exact price levels, exact volume ratios. Explain which arguments won the debate and WHY. If the fundamentals analyst flagged risks, address them directly.]

**Investment Plan:**
- Direction: [LONG/SHORT/FLAT]
- Entry Zone: [$X - $Y] (narrow zone, not a 5% range)
- Initial Stop Loss: $Z (at a STRUCTURAL level — below support, below SMA, not arbitrary %)
- Take Profit 1: $A (partial close 50%, at nearest resistance/target)
- Take Profit 2: $B (full close, at extension target)
- R:R Ratio: [X:1] — must be >= 1.5 for any non-HOLD decision
- Position Size: [% of account] (factor in leverage and stop distance)
- Timeframe: [scalp < 4h | day trade < 24h | swing 1-7d | position > 7d]
- Invalidation: [EXACT price level or condition — e.g., "Close below $178.50 on 4h with volume > 200% avg"]`,

  aggressive_risk: `You are the AGGRESSIVE RISK ANALYST in PhantomX's risk debate. You argue for MAXIMUM capital deployment.

YOUR ROLE: The setup passed the research judge's scrutiny. Now capitalize. Under-sizing is the silent killer of trading accounts — you miss the winners while the losers hit your small positions anyway.

RULES:
- Cite the judge's confidence level and justify why it supports larger sizing
- Calculate the OPPORTUNITY COST: "At 1% position size, even a 10% win = 0.1% account gain. At 5%, same win = 0.5%. Over 50 trades, the difference is enormous."
- Propose exact position size (3-8% of account), exact leverage (3-10x), and justify with math
- Reference the ATR for stop distance calculation: "ATR is $3.42 on 4h. Stop at 1.5x ATR = $5.13. At 5x leverage, risk per dollar = $5.13/$184.80 * 5 = 13.9%. Position size to risk 3% of account = $X."
- Factor in the R:R: "R:R is 2.57:1. Kelly Criterion says optimal sizing = (2.57 * 0.6 - 0.4) / 2.57 = 44.7%. We should be at LEAST 5% of account."
- Acknowledge the risk but argue it's WORTH TAKING: "Yes, max loss is $Y, but the expected value is positive by $Z."`,

  conservative_risk: `You are the CONSERVATIVE RISK ANALYST in PhantomX's risk debate. Capital preservation is your religion.

YOUR ROLE: Every dollar at risk is a dollar that could be permanently lost. The crypto market has 20%+ flash crashes. Your job is to ensure that even the WORST CASE doesn't significantly damage the account.

RULES:
- Calculate the MAXIMUM LOSS at the proposed leverage: exact dollar amount, exact % of account
- Calculate the LIQUIDATION PRICE at various leverage levels. "At 5x long from $184.80, liquidation at ~$148. At 3x, liquidation at ~$123. This matters more than stop loss."
- Cite every risk from the bear's arguments and the fundamentals analyst's anti-pattern check
- Propose exact position size (0.5-2% of account), lower leverage (1-3x), and justify: "At 2% risk, even 5 consecutive losers only draw down 10%."
- Address CORRELATION RISK: "If we already have SOL exposure via ecosystem tokens, this is effectively doubling down. Max correlated exposure should be 5% total."
- Reference hard constraints: "The kill switch triggers at -15% daily drawdown. Current positions already have $X unrealized. Adding $Y more at risk leaves only $Z buffer."`,

  neutral_risk: `You are the NEUTRAL RISK ANALYST in PhantomX's risk debate. You are the mathematician — emotion has no place here.

YOUR ROLE: Apply quantitative risk models to find the OPTIMAL position size. Not the biggest, not the smallest — the mathematically optimal one that maximizes long-term account growth.

RULES:
- Apply KELLY CRITERION: f* = (p * b - q) / b where p = win probability (from judge confidence), b = R:R ratio, q = 1-p. Then use HALF-KELLY for safety.
- Factor in CURRENT PORTFOLIO EXPOSURE: What % of account is already deployed? How correlated are existing positions?
- Calculate VALUE AT RISK (VaR): Based on ATR and leverage, what's the 95th percentile loss?
- Propose exact position size with MATHEMATICAL JUSTIFICATION — not gut feel
- If the aggressive and conservative analysts both have valid points, say which conditions would justify sizing up vs sizing down
- Specify SCALING: "Enter 60% of position now, add 40% on pullback to $X if the setup holds"`,

  risk_judge: `You are the RISK MANAGER (FINAL JUDGE) for PhantomX's trading pipeline. YOUR OUTPUT IS EXECUTED WITH REAL MONEY.

YOUR ROLE: Synthesize the investment plan (from research judge) and the risk debate (aggressive/conservative/neutral) into a FINAL, EXECUTABLE trade decision. Every number you output will be sent directly to the exchange.

CRITICAL RULES:
- Your output feeds DIRECTLY into order execution. Imprecise numbers = bad fills or failed orders.
- ALWAYS factor in the risk debate. If the conservative analyst identified a valid concern (correlation risk, hard constraint near limit, anti-pattern match), you MUST adjust sizing downward.
- If the aggressive analyst's Kelly Criterion calculation shows optimal sizing > 3%, you can go higher than the conservative suggests.
- Use the NEUTRAL analyst's recommendation as your anchor, then adjust based on conviction.
- Do NOT reverse the research judge's direction unless: (a) hard constraints would be violated, or (b) the fundamentals analyst identified an anti-pattern match.
- ENTRY TYPE: Use "limit" when the judge specified a tight entry zone (spread < 0.5%). Use "market" when urgency is high (breakout in progress, momentum trade).
- STOP LOSS: Must be at a STRUCTURAL level identified by the market analyst (below support, below SMA). Never an arbitrary percentage.
- TAKE PROFIT: TP1 = nearest resistance from analyst reports. TP2 = extension target if trend continues.
- LEVERAGE: Must be ≤ the number that keeps liquidation price below the next major structural support. NEVER set leverage where liquidation is within 1 ATR of current price.

OUTPUT FORMAT (strict JSON block — this feeds directly to the exchange):
\`\`\`phantomx_decision
{
  "decision": "BUY" | "SELL" | "HOLD",
  "confidence": 0-100,
  "direction": "LONG" | "SHORT" | "FLAT",
  "entry": { "type": "limit" | "market", "price": number | null },
  "stopLoss": number,
  "takeProfit1": number,
  "takeProfit2": number | null,
  "positionSizeUsd": number,
  "leverage": number,
  "timeframe": "scalp" | "day" | "swing",
  "reasoning": "3-4 sentences citing specific data: 'Market analyst confirmed ADX 32 trending regime with 4h/1d SMA alignment. Order book shows 2.3M bid wall at $183.50 providing structural support for stop placement. Kelly half-sizing at neutral analyst's recommendation of 3.2% of account. Conservative concern about BTC correlation addressed: BTC is ranging (ADX 18), not threatening.'",
  "keyRisk": "Specific, actionable: 'BTC daily close below $93k would invalidate alt trend. Monitor 4h candle close.'",
  "invalidation": "EXACT condition: '4h close below $179.67 (1.5x ATR below entry) with volume > 150% average.'"
}
\`\`\``,

  strategy_architect: `You are the STRATEGY ARCHITECT for PhantomX. You translate trade decisions into machine-executable strategy configurations.

YOUR ROLE: Take the risk manager's final decision (direction, entry, SL, TP, size, leverage) and the analyst reports (indicator values), and produce a PRECISE StrategyConfig that can be executed by the platform's strategy engine.

You will receive:
1. The final trade decision with exact parameters
2. The 4 analyst reports with indicator values
3. The existing strategy configuration to update

OUTPUT REQUIREMENTS:
- Entry conditions must use EXACT indicator thresholds from the analyst reports (e.g., "RSI > 55 AND price > SMA20 AND ADX > 25")
- Stop loss must match the risk manager's structural level EXACTLY
- Take profit must include both TP1 (partial close) and TP2 (full close)
- Trailing stop activation: after reaching TP1, trail at 1x ATR
- Include a monitoring plan: which indicators to watch for position management
- Position sizing in USDT, leverage as specified by risk manager

The strategy config must be COMPLETE and VALID — the engine will execute it immediately. Missing fields = broken strategy.

Output the strategy as a JSON code block:
\`\`\`phantomx_strategy
{ ...StrategyConfig fields... }
\`\`\``,
};

// ---------------------------------------------------------------------------
// Wave 1: Specialist Analysts (parallel)
// ---------------------------------------------------------------------------

async function runAnalysts(
  input: PipelineInput,
  emit: EmitFn,
): Promise<Record<string, string>> {
  const { symbol, timeframe, strategyConfig, strategyGoals } = input;

  const contextBlock = [
    `## RESEARCH TARGET`,
    `Symbol: ${symbol}`,
    `Timeframe: ${timeframe}`,
    `Strategy: ${strategyConfig.name}`,
    `Duration: ${strategyGoals.duration}`,
    `Goals: WR>${strategyGoals.minWinRate * 100}%, PF>${strategyGoals.minProfitFactor}, MaxDD<${strategyGoals.maxDrawdownPercent}%`,
    strategyGoals.questions?.length > 0
      ? `Focus Questions:\n${strategyGoals.questions.map(q => `- ${q}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  const analysts = [
    { name: 'market_analyst', prompt: ANALYST_PROMPTS.market_analyst },
    { name: 'sentiment_analyst', prompt: ANALYST_PROMPTS.sentiment_analyst },
    { name: 'news_analyst', prompt: ANALYST_PROMPTS.news_analyst },
    { name: 'fundamentals_analyst', prompt: ANALYST_PROMPTS.fundamentals_analyst },
  ];

  // Launch all 4 in parallel
  const results = await Promise.allSettled(
    analysts.map(async (analyst) => {
      emit({ type: 'analyst_start', agent: analyst.name });
      const startTime = Date.now();

      // Get past memories for this analyst role
      const memory = new AgentMemorySystem(analyst.name);
      const pastContext = memory.recallForPrompt(
        `${symbol} ${timeframe} ${strategyGoals.duration} analysis`,
        3,
      );

      const userPrompt = [
        contextBlock,
        pastContext,
        `\nNow analyze ${symbol} on the ${timeframe} timeframe. USE YOUR TOOLS to get real data. Do not guess.`,
      ].filter(Boolean).join('\n\n');

      try {
        const report = await runAgent(
          analyst.name,
          analyst.prompt,
          userPrompt,
          emit,
          'analyst',
          undefined,
          SONNET,
        );

        const duration = Date.now() - startTime;
        emit({ type: 'analyst_complete', agent: analyst.name, report, duration });

        return { name: analyst.name, report };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        emit({ type: 'analyst_error', agent: analyst.name, error });
        return { name: analyst.name, report: `[ERROR] ${error}` };
      }
    }),
  );

  const reports: Record<string, string> = {};
  for (const result of results) {
    if (result.status === 'fulfilled') {
      reports[result.value.name] = result.value.report;
    }
  }
  return reports;
}

// ---------------------------------------------------------------------------
// Wave 2: Investment Debate (Bull vs Bear → Judge)
// ---------------------------------------------------------------------------

async function runInvestmentDebate(
  input: PipelineInput,
  analystReports: Record<string, string>,
  emit: EmitFn,
  maxRounds = 2,
): Promise<{
  bullArguments: string[];
  bearArguments: string[];
  judgeDecision: string;
  investmentPlan: string;
}> {
  emit({ type: 'debate_start', phase: 'investment' });

  const reportsBlock = Object.entries(analystReports)
    .map(([name, report]) => `### ${name.replace('_', ' ').toUpperCase()}\n${report}`)
    .join('\n\n---\n\n');

  // Get past memories for debaters
  const pastDebateMemories = recallAcrossRoles(
    `${input.symbol} ${input.timeframe} investment debate`,
    ['bull_researcher', 'bear_researcher', 'research_judge'],
    2,
  );
  const pastMemoriesBlock = pastDebateMemories.length > 0
    ? `## PAST SIMILAR DEBATES\n${pastDebateMemories.map(m =>
        `- [${m.agentRole}] ${m.decision.slice(0, 200)}${m.outcome ? ` → Outcome: ${m.outcome.slice(0, 100)}` : ''}`
      ).join('\n')}`
    : '';

  const bullArguments: string[] = [];
  const bearArguments: string[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    // Bull's turn
    const bullContext = [
      `## ANALYST REPORTS\n${reportsBlock}`,
      pastMemoriesBlock,
      round > 1 ? `## PREVIOUS DEBATE\n${bullArguments.map((a, i) => `Bull R${i + 1}: ${a}`).join('\n\n')}\n${bearArguments.map((a, i) => `Bear R${i + 1}: ${a}`).join('\n\n')}` : '',
      `\nThis is Round ${round}/${maxRounds}. Make your case FOR ${input.symbol} on ${input.timeframe}.${round > 1 ? ' Address the bear\'s latest counterarguments directly.' : ''}`,
    ].filter(Boolean).join('\n\n');

    const bullReport = await runAgent(
      'bull_researcher',
      DEBATE_PROMPTS.bull,
      bullContext,
      emit,
      'debate',
      { speaker: 'bull', round },
      SONNET,
    );
    bullArguments.push(bullReport);
    emit({ type: 'debate_turn', speaker: 'bull', round, content: bullReport });

    // Bear's turn
    const bearContext = [
      `## ANALYST REPORTS\n${reportsBlock}`,
      pastMemoriesBlock,
      `## BULL'S ARGUMENT (Round ${round})\n${bullReport}`,
      round > 1 ? `## PREVIOUS ROUNDS\n${bearArguments.map((a, i) => `Bear R${i + 1}: ${a}`).join('\n\n')}` : '',
      `\nThis is Round ${round}/${maxRounds}. Destroy the bull's case. Attack every claim with evidence.${round > 1 ? ' Address the bull\'s rebuttals.' : ''}`,
    ].filter(Boolean).join('\n\n');

    const bearReport = await runAgent(
      'bear_researcher',
      DEBATE_PROMPTS.bear,
      bearContext,
      emit,
      'debate',
      { speaker: 'bear', round },
      SONNET,
    );
    bearArguments.push(bearReport);
    emit({ type: 'debate_turn', speaker: 'bear', round, content: bearReport });
  }

  // Judge's decision
  const judgeContext = [
    `## ANALYST REPORTS\n${reportsBlock}`,
    `## FULL DEBATE TRANSCRIPT`,
    ...bullArguments.map((a, i) => `### Bull Round ${i + 1}\n${a}`),
    ...bearArguments.map((a, i) => `### Bear Round ${i + 1}\n${a}`),
    pastMemoriesBlock,
    `\nYou have read all analyst reports and the complete ${maxRounds}-round debate. Make your decision NOW. BUY, SELL, or HOLD. Do NOT hedge.`,
  ].join('\n\n');

  const judgeReport = await runAgent(
    'research_judge',
    DEBATE_PROMPTS.research_judge,
    judgeContext,
    emit,
    'judge',
    { phase: 'investment' },
  );

  // Parse decision and confidence from judge's output
  const decisionMatch = judgeReport.match(/\*\*DECISION:\s*(BUY|SELL|HOLD)\*\*/i);
  const confidenceMatch = judgeReport.match(/\*\*CONFIDENCE:\s*(\d+)/i);
  const decision = decisionMatch?.[1]?.toUpperCase() ?? 'HOLD';
  const confidence = parseInt(confidenceMatch?.[1] ?? '50', 10);

  emit({
    type: 'debate_judge',
    decision,
    plan: judgeReport,
    confidence,
  });

  return {
    bullArguments,
    bearArguments,
    judgeDecision: decision,
    investmentPlan: judgeReport,
  };
}

// ---------------------------------------------------------------------------
// Wave 3: Risk Assessment (3-way debate → Risk Judge)
// ---------------------------------------------------------------------------

async function runRiskDebate(
  input: PipelineInput,
  investmentPlan: string,
  analystReports: Record<string, string>,
  emit: EmitFn,
): Promise<{
  aggressiveArguments: string[];
  conservativeArguments: string[];
  neutralArguments: string[];
  judgeDecision: string;
  finalDecision: string;
}> {
  emit({ type: 'risk_debate_start' });

  const reportsBlock = Object.entries(analystReports)
    .map(([name, report]) => `### ${name.replace('_', ' ').toUpperCase()}\n${report.slice(0, 1000)}`)
    .join('\n\n---\n\n');

  const riskContext = [
    `## INVESTMENT PLAN (from Research Judge)\n${investmentPlan}`,
    `## KEY ANALYST DATA\n${reportsBlock}`,
    `## ACCOUNT CONTEXT\nBalance: $${input.balance ?? 10000}`,
  ].join('\n\n');

  const aggressiveArguments: string[] = [];
  const conservativeArguments: string[] = [];
  const neutralArguments: string[] = [];

  // Aggressive risk analyst
  const aggressiveReport = await runAgent(
    'aggressive_risk',
    DEBATE_PROMPTS.aggressive_risk,
    `${riskContext}\n\nMake the case for MAXIMUM position size. Why should we go big on this trade?`,
    emit,
    'risk',
    { speaker: 'aggressive' },
    SONNET,
  );
  aggressiveArguments.push(aggressiveReport);
  emit({ type: 'risk_turn', speaker: 'aggressive', content: aggressiveReport });

  // Conservative risk analyst
  const conservativeReport = await runAgent(
    'conservative_risk',
    DEBATE_PROMPTS.conservative_risk,
    `${riskContext}\n\n## AGGRESSIVE POSITION\n${aggressiveReport}\n\nAttack the aggressive position. Why should we minimize exposure?`,
    emit,
    'risk',
    { speaker: 'conservative' },
    SONNET,
  );
  conservativeArguments.push(conservativeReport);
  emit({ type: 'risk_turn', speaker: 'conservative', content: conservativeReport });

  // Neutral risk analyst
  const neutralReport = await runAgent(
    'neutral_risk',
    DEBATE_PROMPTS.neutral_risk,
    `${riskContext}\n\n## AGGRESSIVE POSITION\n${aggressiveReport}\n\n## CONSERVATIVE POSITION\n${conservativeReport}\n\nSynthesize both views. What is the optimal position size?`,
    emit,
    'risk',
    { speaker: 'neutral' },
    SONNET,
  );
  neutralArguments.push(neutralReport);
  emit({ type: 'risk_turn', speaker: 'neutral', content: neutralReport });

  // Risk Manager Judge
  const riskJudgeContext = [
    riskContext,
    `## RISK DEBATE`,
    `### Aggressive\n${aggressiveReport}`,
    `### Conservative\n${conservativeReport}`,
    `### Neutral\n${neutralReport}`,
    `\nMake the FINAL decision. Output the exact trade parameters in the phantomx_decision JSON block.`,
  ].join('\n\n');

  const riskJudgeReport = await runAgent(
    'risk_judge',
    DEBATE_PROMPTS.risk_judge,
    riskJudgeContext,
    emit,
    'judge',
    { phase: 'risk' },
  );

  // Parse the final decision JSON
  const decisionJsonMatch = riskJudgeReport.match(/```phantomx_decision\s*\n([\s\S]*?)```/);
  let finalDecision = 'HOLD';
  let adjustments = riskJudgeReport;
  let finalSize = 'TBD';

  if (decisionJsonMatch) {
    try {
      const parsed = JSON.parse(decisionJsonMatch[1]);
      finalDecision = parsed.decision ?? 'HOLD';
      finalSize = `$${parsed.positionSizeUsd ?? 0} @ ${parsed.leverage ?? 1}x`;
      adjustments = parsed.reasoning ?? riskJudgeReport;
    } catch {
      // Fall back to text parsing
      const decMatch = riskJudgeReport.match(/"decision"\s*:\s*"(BUY|SELL|HOLD)"/i);
      if (decMatch) finalDecision = decMatch[1].toUpperCase();
    }
  }

  emit({
    type: 'risk_judge',
    decision: finalDecision,
    adjustments,
    finalSize,
  });

  return {
    aggressiveArguments,
    conservativeArguments,
    neutralArguments,
    judgeDecision: riskJudgeReport,
    finalDecision,
  };
}

// ---------------------------------------------------------------------------
// Wave 4: Strategy Synthesis
// ---------------------------------------------------------------------------

async function runStrategySynthesis(
  input: PipelineInput,
  riskJudgeDecision: string,
  analystReports: Record<string, string>,
  emit: EmitFn,
): Promise<unknown | null> {
  emit({ type: 'strategy_start' });

  const architectContext = [
    `## RISK MANAGER'S FINAL DECISION\n${riskJudgeDecision}`,
    `## MARKET ANALYST REPORT\n${analystReports['market_analyst']?.slice(0, 1500) ?? 'N/A'}`,
    `## CURRENT STRATEGY CONFIG\n${JSON.stringify(input.strategyConfig, null, 2)}`,
    `\nConvert the risk manager's decision into an updated StrategyConfig. Output as phantomx_strategy JSON block.`,
  ].join('\n\n');

  const result = await runAgent(
    'strategy_architect',
    DEBATE_PROMPTS.strategy_architect,
    architectContext,
    emit,
    'strategy',
  );

  // Parse strategy JSON
  const strategyMatch = result.match(/```phantomx_strategy\s*\n([\s\S]*?)```/);
  if (strategyMatch) {
    try {
      const parsed = JSON.parse(strategyMatch[1]);
      emit({ type: 'strategy_complete', config: parsed });
      return parsed;
    } catch {
      emit({ type: 'strategy_complete', config: null });
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main Pipeline Orchestrator
// ---------------------------------------------------------------------------

export async function runTradingAgentsPipeline(
  input: PipelineInput,
  emit: EmitFn,
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const strategyId = input.strategyConfig.id;

  emit({ type: 'pipeline_start', symbol: input.symbol, timestamp: pipelineStart });

  try {
    // =====================================================================
    // WAVE 1: Specialist Analysts (parallel)
    // =====================================================================
    const analystReports = await runAnalysts(input, emit);

    // Persist analyst reports to DB
    for (const [agent, report] of Object.entries(analystReports)) {
      db.researchBriefs.save({
        strategyId,
        phase: 'analyst',
        agentName: agent,
        title: `${agent.replace('_', ' ')} Report`,
        summary: report.slice(0, 500),
        findings: report,
        confidence: extractConfidence(report) ?? undefined,
      });
    }

    // =====================================================================
    // WAVE 2: Investment Debate
    // =====================================================================
    const debateResult = await runInvestmentDebate(
      input,
      analystReports,
      emit,
      input.debateRounds ?? 2,
    );

    // Persist debate rounds
    debateResult.bullArguments.forEach((arg, i) => {
      db.debateRounds.save({
        strategyId,
        debateType: 'investment',
        speaker: 'bull',
        round: i + 1,
        content: arg,
      });
    });
    debateResult.bearArguments.forEach((arg, i) => {
      db.debateRounds.save({
        strategyId,
        debateType: 'investment',
        speaker: 'bear',
        round: i + 1,
        content: arg,
      });
    });
    db.debateRounds.save({
      strategyId,
      debateType: 'investment',
      speaker: 'judge',
      round: 0,
      content: debateResult.investmentPlan,
    });

    // =====================================================================
    // WAVE 3: Risk Assessment
    // =====================================================================
    const riskResult = await runRiskDebate(
      input,
      debateResult.investmentPlan,
      analystReports,
      emit,
    );

    // Persist risk debate
    riskResult.aggressiveArguments.forEach((arg, i) => {
      db.debateRounds.save({
        strategyId,
        debateType: 'risk',
        speaker: 'aggressive',
        round: i + 1,
        content: arg,
      });
    });
    riskResult.conservativeArguments.forEach((arg, i) => {
      db.debateRounds.save({
        strategyId,
        debateType: 'risk',
        speaker: 'conservative',
        round: i + 1,
        content: arg,
      });
    });
    riskResult.neutralArguments.forEach((arg, i) => {
      db.debateRounds.save({
        strategyId,
        debateType: 'risk',
        speaker: 'neutral',
        round: i + 1,
        content: arg,
      });
    });
    db.debateRounds.save({
      strategyId,
      debateType: 'risk',
      speaker: 'risk_judge',
      round: 0,
      content: riskResult.judgeDecision,
    });

    // =====================================================================
    // WAVE 4: Strategy Synthesis
    // =====================================================================
    const strategySpec = await runStrategySynthesis(
      input,
      riskResult.judgeDecision,
      analystReports,
      emit,
    );

    // =====================================================================
    // WAVE 5: Backtest + Memory
    // =====================================================================
    let backtestMetrics: unknown = null;

    if (input.ohlcv && input.ohlcv.length > 50 && strategySpec) {
      emit({ type: 'backtest_start' });
      try {
        // Dynamic import to avoid circular dependency
        const { runWalkForward } = await import('@/lib/strategy/backtest-engine');
        const wfResult = runWalkForward({
          strategy: strategySpec as StrategyConfig,
          ohlcv: input.ohlcv,
          initialCapital: input.balance ?? 10000,
          fees: 0.0006,
          slippage: 0.001,
        });
        backtestMetrics = wfResult.aggregateOutOfSample;
        emit({ type: 'backtest_complete', metrics: backtestMetrics });

        // Save backtest to DB
        db.backtests.save({
          strategyId,
          config: strategySpec,
          metrics: backtestMetrics,
          walkForward: wfResult,
        });
      } catch (err) {
        emit({ type: 'backtest_error', error: String(err) });
      }
    }

    // Store memories for all agent roles
    let memoriesStored = 0;
    const situation = `Symbol: ${input.symbol}, TF: ${input.timeframe}, Duration: ${input.strategyGoals.duration}. ` +
      `Market: ${analystReports['market_analyst']?.slice(0, 300) ?? 'N/A'}. ` +
      `Sentiment: ${analystReports['sentiment_analyst']?.slice(0, 200) ?? 'N/A'}`;

    const agentRoles = [
      'market_analyst', 'sentiment_analyst', 'news_analyst', 'fundamentals_analyst',
      'bull_researcher', 'bear_researcher', 'research_judge',
      'aggressive_risk', 'conservative_risk', 'neutral_risk', 'risk_judge',
    ];

    for (const role of agentRoles) {
      const mem = new AgentMemorySystem(role);
      mem.remember(situation, `Final: ${riskResult.finalDecision}. ${riskResult.judgeDecision.slice(0, 300)}`);
      memoriesStored++;
    }
    emit({ type: 'memory_stored', count: memoriesStored });

    // Sync to Nexus
    const confidence = extractConfidence(riskResult.judgeDecision) ?? 50;
    await syncPipelineResult(
      input.symbol,
      riskResult.finalDecision,
      confidence,
      [
        `Investment Judge: ${debateResult.judgeDecision}`,
        `Risk Judge: ${riskResult.finalDecision}`,
        `Analyst Verdicts: ${Object.entries(analystReports).map(([k, v]) => `${k}: ${extractVerdict(v)}`).join(', ')}`,
      ],
    );

    // If any agent learned a lesson, sync that too
    if (riskResult.judgeDecision.toLowerCase().includes('lesson')) {
      const lessonMatch = riskResult.judgeDecision.match(/lesson[:\s]+([^.]+)/i);
      if (lessonMatch) {
        await syncLesson('risk_judge', lessonMatch[1]);
      }
    }

    const durationMs = Date.now() - pipelineStart;

    emit({
      type: 'pipeline_complete',
      decision: riskResult.finalDecision,
      confidence,
      duration: durationMs,
    });

    return {
      decision: riskResult.finalDecision as 'BUY' | 'SELL' | 'HOLD',
      confidence,
      analystReports,
      investmentDebate: debateResult,
      riskDebate: riskResult,
      strategySpec,
      backtestMetrics,
      memoriesStored,
      durationMs,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emit({ type: 'pipeline_error', error });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractConfidence(text: string): number | null {
  const match = text.match(/(?:confidence|CONFIDENCE)[:\s]*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function extractVerdict(text: string): string {
  const match = text.match(/(?:verdict|VERDICT|decision|DECISION)[:\s]*(bullish|bearish|neutral|BUY|SELL|HOLD)/i);
  return match ? match[1] : 'unknown';
}
