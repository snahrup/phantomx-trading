// ============================================================================
// PhantomX — AI Trading Assistant (Claude Agent SDK Integration)
// Uses Claude Max OAuth — NO API billing required
// ============================================================================

import { query } from '@anthropic-ai/claude-agent-sdk';
import { withPoolSlot } from './query-queue';
import { getClaudeCodePath } from './credentials';
import { getPhantomXMcpServer } from './phantomx-mcp-tools';
import type {
  AIMessage, ChartAnalysis, TradingContext, RiskParameters,
  Position, OHLCV
} from '@/types/trading';

const SYSTEM_PROMPT = `You are PhantomX, an elite AI crypto trading assistant built for aggressive scalp and speculative trading on Phemex.

## CRITICAL: You ARE the Autopilot
You are not a separate entity from the autopilot. YOU are the brain that powers everything — the chat, the autonomous trading, the analysis, all of it. When autopilot is running, YOU are the one scanning markets, making decisions, and executing trades. When the user asks about a position, YOU opened it. When a trade closes, YOU closed it. Own your decisions.

Never say things like "the autopilot did X" or "autopilot's got the wheel" — YOU did X, YOU have the wheel. First person, always. "I opened this position because..." / "I'm watching for..." / "I'll close this if..."

## You ARE Connected
You are FULLY integrated with the user's Phemex trading account. You have:
- **Live account data** — balance, positions, unrealized P&L (provided in [LIVE TRADING CONTEXT] below)
- **Real-time market data** — current price, 24h stats, OHLCV candles
- **Chart vision** — when the user pastes a screenshot or you receive chart images, you can visually analyze them
- **Autonomous trading** — when enabled, you continuously scan markets, analyze setups, and execute trades on each tick cycle. You own every trade you make.
- **Trade execution** — you place real orders on Phemex when auto-trade is enabled

You are NOT just a chatbot. You are the brain of an active trading platform. When asked "thoughts?" — look at the live context data and give real, actionable analysis based on the user's actual positions and balance. If you opened those positions, say so.

## Your Personality
- You're a sharp, no-BS trading co-pilot. Direct, confident, data-driven.
- You own your decisions. "I went long on SOL because..." not "The system opened a position..."
- You understand the user is a high-energy, high-speed scalper who thrives on risk and adrenaline.
- You respect their style: they find gems early (like FARTCOIN, PIPPIN), ride the SMA crossover pattern on 4h/1d charts, and understand that even weak projects follow chart patterns.
- When they say "thoughts?" — give a concise, actionable take on the current market situation based on their ACTUAL positions and the live chart.
- When they describe a thesis — build on it, challenge it if the data disagrees, then generate a concrete strategy.

## Your Capabilities
1. **Chart Analysis** — When given chart screenshots, identify patterns (double bottoms, SMA crossovers, cup and handle, bull flags, etc.), key support/resistance levels, and trend direction.
2. **Strategy Generation** — Generate PineScript v5 strategies for TradingView based on the user's thesis, risk level, and account size.
3. **Risk Assessment** — Calculate position sizing, set stop-losses, take-profits, and evaluate risk/reward ratios.
4. **Trade Planning** — Create day-long or multi-day trading plans with specific entry/exit points.
5. **Real-time Analysis** — Analyze OHLCV data, volume profiles, and indicator values to provide actionable insights.
6. **Portfolio Awareness** — You see the user's full account: balance, open positions, unrealized PnL. Factor this into every response. If you opened those positions via autopilot, acknowledge that.

## Key Trading Patterns You Know
- **SMA Crossover Recovery**: When a new token plummets post-launch then slowly recovers, watch for 4h SMA crossover → confirmed by 1D crossover = extremely high probability moonshot.
- **Volume Confirmation**: Rising price + rising volume = genuine move. Rising price + declining volume = suspect.
- **Support/Resistance Flips**: Previous resistance becoming support is one of the strongest signals.

## Rules
- Always include specific price levels, not vague "it might go up"
- Always quantify risk: "risking X to make Y, R:R of Z:1"
- When generating strategies, include proper risk management (stop-loss, take-profit, position sizing)
- Be honest about uncertainty — crypto is volatile, acknowledge when setups are weak
- Never recommend investing more than the user is comfortable losing
- Always respect the kill switch parameters — if they set a hard floor, honor it absolutely

## Trade Execution — YOU CAN ACT
You can execute trades directly. When the user asks you to open, close, or manage a position, DO IT. Don't just talk about it. Include a command block in your response:

\`\`\`phantomx_command
{"commands": [
  {"action": "close_position", "symbol": "FLOW/USDT:USDT"},
  {"action": "open_long", "symbol": "SOL/USDT:USDT", "size_usdt": 10, "leverage": 5, "stop_loss": 170.0, "take_profit": 195.0},
  {"action": "open_short", "symbol": "BTC/USDT:USDT", "size_usdt": 20, "leverage": 3},
  {"action": "set_stop_loss", "symbol": "SOL/USDT:USDT", "price": 175.0},
  {"action": "set_take_profit", "symbol": "SOL/USDT:USDT", "price": 200.0},
  {"action": "cancel_orders", "symbol": "SOL/USDT:USDT"}
]}
\`\`\`

Available actions:
- **close_position** — Close an existing position entirely (market order). Requires: symbol.
- **open_long** — Open a long position. Requires: symbol, size_usdt. Optional: leverage, stop_loss, take_profit.
- **open_short** — Open a short position. Requires: symbol, size_usdt. Optional: leverage, stop_loss, take_profit.
- **set_stop_loss** — Set/move stop loss on existing position. Requires: symbol, price.
- **set_take_profit** — Set/move take profit on existing position. Requires: symbol, price.
- **cancel_orders** — Cancel all open orders on a symbol. Requires: symbol.

Rules for execution:
- When the user says "close it", "close this", "take profit", "get out" — CLOSE THE POSITION. Don't ask for confirmation.
- When the user says "buy X", "go long X", "short X" — OPEN THE POSITION.
- Always include the command block AND a brief explanation of what you're doing and why.
- If you're unsure about parameters (size, leverage), use sensible defaults based on the account balance and risk profile.
- The system will execute these commands and report results. You'll see the execution status.

## Chart Drawing — YOU CAN DRAW
You can draw on the chart by including price lines and annotations. Include a draw block:

\`\`\`phantomx_draw
{"lines": [
  {"price": 178.50, "label": "Entry", "type": "entry", "color": "#3B82F6", "style": "solid"},
  {"price": 174.20, "label": "Stop Loss", "type": "stop_loss", "color": "#EF4444", "style": "dashed"},
  {"price": 189.00, "label": "Take Profit", "type": "take_profit", "color": "#22C55E", "style": "dashed"},
  {"price": 180.00, "label": "Support", "type": "support", "color": "#22C55E", "style": "dotted"},
  {"price": 195.00, "label": "Resistance", "type": "resistance", "color": "#EF4444", "style": "dotted"}
]}
\`\`\`

When you analyze a chart or discuss levels, DRAW THEM. Don't just list numbers — put them on the chart so the user can see exactly what you mean.

## System Control — Research Engine & Paper Trading
You can control the background Research Engine and Paper Trading system. Include a system block:

\`\`\`phantomx_system
{"action": "start_research", "config": {"symbols": ["SOL/USDT:USDT", "BTC/USDT:USDT"], "riskProfile": "aggressive"}}
\`\`\`

Available system actions:
- **start_research** — Start the background research engine (also starts paper trading). Optional: config (symbols, riskProfile, focusAreas), virtualBalance (default $100,000).
- **stop_research** — Stop the research engine and paper trading.
- **pause_research** — Pause scanning without losing state.
- **resume_research** — Resume a paused research engine.
- **configure_research** — Update research config (symbols, risk profile, focus areas) while running. Requires: config.
- **start_paper_trading** — Start paper trading independently. Optional: virtualBalance.
- **stop_paper_trading** — Stop paper trading.
- **get_research_status** — Get current research engine status, findings count, and top opportunities.
- **get_paper_trading_status** — Get paper trading equity, P&L, open positions, and win rate.

Rules for system commands:
- When the user says "start scanning", "research everything", "find me opportunities" — START THE RESEARCH ENGINE.
- When the user asks "what did you find?", "any opportunities?", "research status" — GET STATUS first, then discuss findings.
- When the user says "paper trade this", "simulate it" — START PAPER TRADING.
- When the user says "stop scanning", "pause research" — PAUSE or STOP accordingly.
- Always include the system block AND explain what you're doing. The frontend will update in real-time to show research progress.
- You can combine system commands with trade commands and draw commands in the same response.

## Response Format
- Keep responses concise and scannable
- Use bullet points for key data
- Bold important numbers and levels
- When analyzing charts, describe what you see, then give your take — and DRAW the key levels
- When the user asks you to act, ACT FIRST then explain. Command block should come early in the response.
- When generating PineScript, include comments explaining the logic`;

// ---------------------------------------------------------------------------
// Types for SDK streaming
// ---------------------------------------------------------------------------
interface StreamCallbacks {
  onText?: (chunk: string) => void;
  onThinking?: (chunk: string) => void;
  onToolUse?: (toolName: string, input: unknown) => void;
  onToolResult?: (toolName: string, preview: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Core query helper — wraps the Agent SDK query() with our system prompt
// ---------------------------------------------------------------------------
async function runQuery(
  prompt: string,
  callbacks?: StreamCallbacks,
  imageBase64?: string,
): Promise<{ text: string; thinking: string }> {
  const claudeCodePath = getClaudeCodePath();

  // Inject MCP tools so Claude can dynamically fetch market data
  const mcpServer = getPhantomXMcpServer();

  const queryOptions: Record<string, unknown> = {
    pathToClaudeCodeExecutable: claudeCodePath,
    model: 'claude-opus-4-6',
    fallbackModel: 'claude-sonnet-4-5-20250929',
    maxTurns: 10,
    includePartialMessages: true,
    thinking: { type: 'adaptive' },
    effort: 'max',
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: SYSTEM_PROMPT,
    },
    mcpServers: {
      'phantomx-trading': mcpServer,
    },
  };

  // Build query input — either plain string or AsyncIterable for images
  let queryInput: { prompt: string | AsyncIterable<unknown>; options: Record<string, unknown> };

  if (imageBase64) {
    // Image + text via AsyncIterable
    queryInput = {
      prompt: (async function* () {
        yield {
          type: 'user' as const,
          message: {
            role: 'user' as const,
            content: [
              {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: 'image/png' as const,
                  data: imageBase64,
                },
              },
              { type: 'text' as const, text: prompt },
            ],
          },
          parent_tool_use_id: null,
          session_id: '',
        };
      })(),
      options: queryOptions,
    };
  } else {
    queryInput = {
      prompt,
      options: queryOptions,
    };
  }

  // Run through the pool — withPoolSlot holds a concurrent slot while
  // streaming live (callbacks fire in real-time, not buffered)
  return withPoolSlot(async () => {
    let fullText = '';
    let thinkingText = '';

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const message of query(queryInput as any)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = message as any;

        if (msg.type === 'stream_event') {
          const event = msg.event;

          if (event?.type === 'content_block_delta') {
            const delta = event.delta;

            if (delta?.type === 'thinking_delta' && delta.thinking) {
              thinkingText += delta.thinking;
              callbacks?.onThinking?.(delta.thinking);
            } else if (delta?.type === 'text_delta' && delta.text) {
              fullText += delta.text;
              callbacks?.onText?.(delta.text);
            }
          }
        } else if (msg.type === 'assistant') {
          // Complete assistant message — extract content blocks + tool usage
          const content = msg.message?.content || msg.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                // Only use if we didn't get it from streaming
                if (!fullText) fullText = block.text;
              } else if (block.type === 'thinking' && block.thinking) {
                if (!thinkingText) thinkingText = block.thinking;
              } else if (block.type === 'tool_use') {
                callbacks?.onToolUse?.(block.name ?? 'unknown', block.input ?? {});
              } else if (block.type === 'tool_result') {
                const preview = typeof block.content === 'string'
                  ? block.content.slice(0, 120)
                  : JSON.stringify(block.content).slice(0, 120);
                callbacks?.onToolResult?.('tool', preview);
              }
            }
          }
        }
      }
    } catch (err) {
      const errMsg = String(err);
      callbacks?.onError?.(errMsg);
      if (!fullText) fullText = `Error communicating with Claude: ${errMsg}`;
    }

    callbacks?.onDone?.();
    return { text: fullText, thinking: thinkingText };
  }, 'high', 'chat');
}

// ---------------------------------------------------------------------------
// TradingAssistant class
// ---------------------------------------------------------------------------
export class TradingAssistant {
  private conversationHistory: AIMessage[] = [];
  private tradingContext: TradingContext | null = null;

  setTradingContext(context: TradingContext): void {
    this.tradingContext = context;
  }

  async chat(
    userMessage: string,
    chartImage?: string,
    streamCallback?: (chunk: string) => void,
    toolCallbacks?: {
      onToolUse?: (toolName: string, input: unknown) => void;
      onToolResult?: (toolName: string, preview: string) => void;
      onThinking?: (chunk: string) => void;
    },
  ): Promise<AIMessage> {
    const contextBlock = this.buildContextBlock();
    const fullPrompt = contextBlock
      ? `${contextBlock}\n\n${userMessage}`
      : userMessage;

    // Include conversation history as context
    const historyContext = this.conversationHistory
      .slice(-10) // last 10 messages for context
      .map(m => `${m.role === 'user' ? 'User' : 'PhantomX'}: ${m.content}`)
      .join('\n\n');

    const promptWithHistory = historyContext
      ? `[CONVERSATION HISTORY]\n${historyContext}\n\n[CURRENT MESSAGE]\n${fullPrompt}`
      : fullPrompt;

    const userMsg: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    this.conversationHistory.push(userMsg);

    let thinkingContent = '';

    const { text } = await runQuery(
      promptWithHistory,
      {
        onText: streamCallback,
        onThinking: (chunk) => {
          thinkingContent += chunk;
          toolCallbacks?.onThinking?.(chunk);
        },
        onToolUse: toolCallbacks?.onToolUse,
        onToolResult: toolCallbacks?.onToolResult,
      },
      chartImage,
    );

    const assistantMsg: AIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: text,
      timestamp: Date.now(),
      metadata: {
        thinkingContent: thinkingContent || undefined,
      },
    };

    this.conversationHistory.push(assistantMsg);

    if (text.includes('//@version=')) {
      assistantMsg.metadata = {
        ...assistantMsg.metadata,
        strategyGenerated: 'embedded',
      };
    }

    return assistantMsg;
  }

  async analyzeChart(imageBase64: string, symbol: string, timeframe: string): Promise<ChartAnalysis> {
    const prompt = `Analyze this ${symbol} chart (${timeframe} timeframe). Identify:
1. Current trend and pattern (name it precisely)
2. Key support/resistance levels with exact prices
3. SMA positions relative to price (are they crossing? diverging?)
4. Volume profile
5. Your sentiment (bullish/bearish/neutral) with confidence 0-100%
6. Specific actionable recommendation

Respond in this exact JSON format:
{
  "pattern": "pattern name",
  "sentiment": "bullish|bearish|neutral",
  "confidence": 0.85,
  "keyLevels": [{"type": "support|resistance", "price": 1234.56}],
  "recommendation": "specific action to take",
  "timeframe": "${timeframe}"
}`;

    const { text } = await runQuery(prompt, undefined, imageBase64);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    try {
      return JSON.parse(jsonMatch?.[0] ?? '{}') as ChartAnalysis;
    } catch {
      return {
        pattern: 'Unable to parse',
        sentiment: 'neutral',
        confidence: 0,
        keyLevels: [],
        recommendation: text,
        timeframe,
      };
    }
  }

  async generateStrategy(
    symbol: string,
    thesis: string,
    risk: RiskParameters,
    accountBalance: number,
    ohlcv: OHLCV[]
  ): Promise<string> {
    const recentPrices = ohlcv.slice(-50).map(c =>
      `${new Date(c.timestamp).toISOString().slice(0, 10)}: O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`
    ).join('\n');

    const prompt = `Generate a PineScript v5 strategy for ${symbol} based on this thesis and parameters:

## User's Thesis
${thesis}

## Risk Parameters
- Risk Level: ${risk.level}
- Max Position Size: ${risk.maxPositionSizePercent}% of account
- Stop Loss: ${risk.stopLossPercent}%
- Take Profit: ${risk.takeProfitPercent}%
- Max Drawdown: ${risk.maxDrawdownPercent}%
- Daily Loss Limit: ${risk.maxDailyLossPercent}%
- Trailing Stop: ${risk.trailingStopPercent ?? 'none'}%
- Allow Total Loss: ${risk.allowLossOfEntireAmount}
${risk.hardFloorUsd ? `- Hard Floor: $${risk.hardFloorUsd}` : ''}
${risk.hardCeilingUsd ? `- Hard Ceiling: $${risk.hardCeilingUsd}` : ''}

## Account
- Balance: $${accountBalance}

## Recent Price Data (last 50 candles)
${recentPrices}

## Requirements
1. Use PineScript v5 (//@version=5)
2. Include SMA crossover signals (the user's core pattern)
3. Implement proper risk management with position sizing
4. Add alert conditions for automated webhook execution
5. Include strategy.entry() and strategy.exit() calls
6. Add visual markers for entries/exits
7. Set proper initial_capital and commission
8. Include alertcondition() calls that output JSON payloads for webhook automation
9. The alert JSON should include: action (buy/sell/close), symbol, price, quantity
10. Comment the code explaining each section

Return ONLY the PineScript code, nothing else.`;

    const { text } = await runQuery(prompt);

    const codeMatch = text.match(/```(?:pine|pinescript)?\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1].trim() : text.trim();
  }

  async generateTradingPlan(
    symbol: string,
    thesis: string,
    risk: RiskParameters,
    accountBalance: number,
    currentPrice: number,
    positions: Position[]
  ): Promise<string> {
    const prompt = `Create a detailed day-long trading plan for ${symbol}.

## Current State
- Price: $${currentPrice}
- Account Balance: $${accountBalance}
- Open Positions: ${positions.length > 0 ? positions.map(p =>
      `${p.side} ${p.size} @ $${p.entryPrice} (PnL: $${p.unrealizedPnl.toFixed(2)})`
    ).join(', ') : 'None'}

## User's Thesis
${thesis}

## Risk Level: ${risk.level}
- Max per trade: ${risk.maxPositionSizePercent}% ($${(accountBalance * risk.maxPositionSizePercent / 100).toFixed(2)})
- Stop Loss: ${risk.stopLossPercent}%
- Take Profit: ${risk.takeProfitPercent}%
- Daily Loss Cap: ${risk.maxDailyLossPercent}% ($${(accountBalance * risk.maxDailyLossPercent / 100).toFixed(2)})

## Requirements
1. Specific entry/exit prices with reasoning
2. Position sizing for each planned trade
3. Contingency plans (what if it dumps? what if it moons?)
4. Key levels to watch throughout the day
5. When to be aggressive vs. when to sit on hands
6. Total risk exposure at any given time`;

    const { text } = await runQuery(prompt);
    return text;
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  getHistory(): AIMessage[] {
    return [...this.conversationHistory];
  }

  private buildContextBlock(): string {
    if (!this.tradingContext) return '';

    const ctx = this.tradingContext;
    const parts: string[] = ['[LIVE TRADING CONTEXT]'];

    parts.push(`Symbol: ${ctx.symbol} | Price: $${ctx.currentPrice}`);
    parts.push(`Account: $${ctx.accountBalance.toFixed(2)}`);

    if (ctx.openPositions.length > 0) {
      parts.push(`Open Positions:`);
      ctx.openPositions.forEach(p => {
        parts.push(`  ${p.side.toUpperCase()} ${p.size} @ $${p.entryPrice} | PnL: $${p.unrealizedPnl.toFixed(2)} | Liq: $${p.liquidationPrice ?? 'N/A'}`);
      });
    }

    if (ctx.marketData.ticker) {
      const t = ctx.marketData.ticker;
      parts.push(`24h: H=$${t.high} L=$${t.low} Vol=${t.volume.toFixed(0)} Change=${t.changePercent24h.toFixed(2)}%`);
    }

    return parts.join('\n');
  }
}

// Singleton
let assistant: TradingAssistant | null = null;

export function getTradingAssistant(): TradingAssistant {
  if (!assistant) {
    assistant = new TradingAssistant();
  }
  return assistant;
}
