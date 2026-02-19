// ============================================================================
// PhantomX — Autonomous Heartbeat Engine
// Proactive AI trading loop — Claude analyzes market state on a timer
// and autonomously executes trades without waiting for user prompts
// ============================================================================

import { queuedQueryStream } from './query-queue';
import { getClaudeCodePath } from './credentials';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';
import { triggerKillSwitch } from '@/lib/kill-switch';
import { renderChartFromOHLCV } from '@/lib/chart/server-renderer';
import { getKnowledgeBase } from '@/lib/agents/knowledge-base';
import { logIntervention, getInterventionSummary } from './intervention-logger';
import {
  computeSMA, computeEMA, computeRSI, computeMACD, computeATR,
  computeSuperTrend, computeADX, computeVolumeProfile,
  generateEMACrossSignals,
} from '@/lib/chart/indicators';
import type { OHLCV } from '@/types/trading';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface HeartbeatConfig {
  intervalMs: number;       // How often to tick (default: 60000 = 1 min)
  symbol: string;
  maxPositionPercent: number;  // Max % of account per trade
  riskLevel: 'conservative' | 'moderate' | 'aggressive' | 'degen';
  enableAutoTrade: boolean;    // If false, only advise — don't execute
  maxDailyLossPercent: number;
  stopAfterKill: boolean;      // Stop heartbeat if kill switch triggers
}

export interface HeartbeatEvent {
  type: 'tick_start' | 'analysis' | 'action' | 'trade_executed' | 'trade_skipped' |
        'error' | 'kill_triggered' | 'status' | 'thinking';
  data: Record<string, unknown>;
  timestamp: number;
}

export interface AITradeAction {
  action: 'buy' | 'sell' | 'close' | 'hold' | 'adjust_sl' | 'adjust_tp';
  symbol: string;
  reason: string;
  confidence: number;        // 0-100
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  positionSizePercent?: number;
  leverage?: number;
  urgency: 'immediate' | 'wait_for_confirmation' | 'low';
  // Behavioral intervention fields
  intervention_matched?: boolean;
  intervention_override?: boolean;
  intervention_learning_id?: string;
  intervention_note?: string;
}

type HeartbeatEventCallback = (event: HeartbeatEvent) => void;

const HEARTBEAT_SYSTEM_PROMPT = `You are PhantomX Autopilot — an autonomous AI crypto trading engine running on a heartbeat timer.

## Your Role
You receive periodic market snapshots and MUST decide what action to take RIGHT NOW. You are not chatting — you are making real trading decisions that will be executed automatically.

## Decision Framework
For each heartbeat, you receive:
- **A candlestick chart image** — you can SEE the chart visually. Analyze patterns, support/resistance, trend structure, and candlestick formations directly from the image.
- Current price, 24h stats, bid/ask
- Recent OHLCV candles (last 50)
- Open positions with PnL
- Account balance
- Recent trade history
- Kill switch status

## Chart Vision & Indicators
You receive a real candlestick chart image with overlays PLUS a comprehensive indicator suite. ALWAYS reference what you see:
- Identify chart patterns (flags, wedges, double tops/bottoms, H&S)
- Spot support/resistance from visual price action and Volume Profile (POC/VAH/VAL)
- Read SMA/EMA crossovers and trend direction
- Note candlestick patterns (engulfing, doji, hammer, etc.)
- Use MACD histogram for momentum confirmation (rising = strengthening, falling = weakening)
- Use SuperTrend direction for trend bias (bullish = green below price, bearish = red above)
- Use ADX for trend strength (>40 strong, 25-40 moderate, <25 choppy/ranging)
- Use RSI zones + divergence for reversal signals
- Use ATR for volatility context and stop-loss sizing
- Cross-reference multiple indicators for confluence before acting

## Response Format — CRITICAL
You MUST respond with a JSON block wrapped in \`\`\`json ... \`\`\` containing an array of actions:

\`\`\`json
{
  "analysis": "Brief 1-2 sentence market read",
  "actions": [
    {
      "action": "buy|sell|close|hold|adjust_sl|adjust_tp",
      "symbol": "BTC/USDT:USDT",
      "reason": "Why this action",
      "confidence": 85,
      "entryPrice": 50000,
      "stopLoss": 49500,
      "takeProfit": 51000,
      "positionSizePercent": 5,
      "leverage": 10,
      "urgency": "immediate|wait_for_confirmation|low"
    }
  ]
}
\`\`\`

## Rules
1. **"hold" is the default** — only trade when there's a clear signal. Most heartbeats should be "hold".
2. **Never enter without a stop loss** — always include stopLoss in buy/sell actions.
3. **Confidence threshold** — only execute if confidence >= 70 for aggressive, >= 80 for moderate, >= 90 for conservative.
4. **One trade at a time** — if there's an open position, manage it (close/adjust) before opening a new one.
5. **Respect the kill switch** — if daily loss is approaching the limit, be more conservative or hold.
6. **Multi-Indicator Confluence** — The user's core strategy uses SMA 7/20 crossovers as primary signals, confirmed by MACD histogram, SuperTrend direction, and ADX strength. Require at least 2-3 indicators agreeing before acting.
7. **Volume confirmation** — Don't enter on price moves without volume backing. Use Volume Profile (POC/VAH/VAL) as key support/resistance levels.
8. **Position sizing** — Never exceed maxPositionPercent of account. Scale down when uncertain.
9. **Be honest about uncertainty** — If the setup is unclear, output "hold" and explain why.

## Urgency Levels
- **immediate**: Execute right now (strong signal, time-sensitive)
- **wait_for_confirmation**: Signal is forming, wait for next candle to confirm
- **low**: Interesting setup but not urgent, can wait

## When to Close
- Target hit or about to reverse
- Stop loss approaching but not yet triggered (trail it)
- Better opportunity elsewhere
- Risk/reward no longer favorable`;

// ---------------------------------------------------------------------------
// Heartbeat Engine
// ---------------------------------------------------------------------------
export class HeartbeatEngine {
  private config: HeartbeatConfig;
  private listeners: Set<HeartbeatEventCallback> = new Set();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private tickLock: Promise<void> = Promise.resolve();
  private tickCount = 0;
  private dailyPnlAccum = 0;
  private dailyStartEquity = 0;
  private isKilled = false;
  private lastAnalysis = '';
  private actionHistory: { action: string; timestamp: number; result: string }[] = [];

  constructor(config: HeartbeatConfig) {
    this.config = config;
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    if (this.isRunning) return;

    if (!isPhemexConfigured()) {
      throw new Error('PhemexClient not initialized. Connect to Phemex first.');
    }

    this.isRunning = true;
    this.isKilled = false;
    this.tickCount = 0;
    this.dailyPnlAccum = 0;
    this.actionHistory = [];

    // Get starting equity
    try {
      const client = getPhemexClient();
      const account = await client.getAccountInfo();
      this.dailyStartEquity = account.totalUsdValue;
    } catch {
      this.dailyStartEquity = 0;
    }

    this.emit({
      type: 'status',
      data: { status: 'started', interval: this.config.intervalMs, symbol: this.config.symbol },
      timestamp: Date.now(),
    });

    // Run first tick immediately
    this.tick();

    // Then set up interval
    this.tickInterval = setInterval(() => this.tick(), this.config.intervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.emit({
      type: 'status',
      data: { status: 'stopped', totalTicks: this.tickCount },
      timestamp: Date.now(),
    });
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isKilled: this.isKilled,
      tickCount: this.tickCount,
      lastAnalysis: this.lastAnalysis,
      actionHistory: this.actionHistory.slice(-20),
      config: this.config,
    };
  }

  updateConfig(partial: Partial<HeartbeatConfig>): void {
    Object.assign(this.config, partial);
    // If interval changed, restart the timer
    if (partial.intervalMs && this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = setInterval(() => this.tick(), this.config.intervalMs);
    }
  }

  // --- Event System ---

  onEvent(callback: HeartbeatEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: HeartbeatEvent): void {
    this.listeners.forEach(cb => {
      try { cb(event); } catch { /* listener error shouldn't crash engine */ }
    });
  }

  // --- Core Tick ---

  private async tick(): Promise<void> {
    if (!this.isRunning || this.isKilled) return;

    // LOGIC-02: Promise-based lock prevents concurrent ticks
    let releaseLock: () => void;
    const prevLock = this.tickLock;
    this.tickLock = new Promise<void>(resolve => { releaseLock = resolve; });

    try {
      await prevLock;
    } catch { /* previous tick errored, proceed */ }

    if (!this.isRunning || this.isKilled) { releaseLock!(); return; }

    // Guard: if Phemex client was lost (hot reload, disconnect), stop gracefully
    if (!isPhemexConfigured()) {
      this.emit({
        type: 'error',
        data: { error: 'Phemex connection lost. Reconnect and restart autopilot.' },
        timestamp: Date.now(),
      });
      this.stop();
      releaseLock!();
      return;
    }

    this.tickCount++;

    this.emit({
      type: 'tick_start',
      data: { tick: this.tickCount },
      timestamp: Date.now(),
    });

    try {
      // 1. Gather market snapshot
      const snapshot = await this.gatherMarketSnapshot();

      // 2. Check kill conditions
      if (this.checkKillConditions(snapshot)) {
        releaseLock!();
        return;
      }

      // 3. Build prompt
      const prompt = this.buildPrompt(snapshot);

      // 3.5. Render chart image for vision analysis
      let chartImageBase64: string | undefined;
      try {
        if (snapshot.ohlcv.length >= 10) {
          const closes = snapshot.ohlcv.map((c: { close: number }) => c.close);
          chartImageBase64 = renderChartFromOHLCV(
            snapshot.ohlcv,
            this.config.symbol,
            '1h',
            {
              sma7: this.computeSMAArray(closes, 7),
              sma20: this.computeSMAArray(closes, 20),
              sma50: this.computeSMAArray(closes, 50),
              rsi14: snapshot.indicators.rsi ?? undefined,
            },
          ) || undefined;
        }
      } catch (err) {
        console.warn('[PhantomX] Chart render failed:', err);
      }

      // 4. Query Claude (with chart image if available)
      const { text: responseText, thinking } = await this.queryAI(prompt, chartImageBase64);

      if (thinking) {
        this.emit({
          type: 'thinking',
          data: { thinking },
          timestamp: Date.now(),
        });
      }

      // 5. Parse response
      const parsed = this.parseResponse(responseText);

      this.lastAnalysis = parsed.analysis || responseText.slice(0, 200);
      this.emit({
        type: 'analysis',
        data: {
          tick: this.tickCount,
          analysis: parsed.analysis,
          actionsCount: parsed.actions.length,
          rawResponse: responseText,
        },
        timestamp: Date.now(),
      });

      // 6. Execute actions
      for (const action of parsed.actions) {
        await this.executeAction(action, snapshot);
      }

    } catch (err) {
      this.emit({
        type: 'error',
        data: { tick: this.tickCount, error: String(err) },
        timestamp: Date.now(),
      });
    } finally {
      releaseLock!();
    }
  }

  // --- Market Data ---

  private async gatherMarketSnapshot() {
    const client = getPhemexClient();

    const [ticker, positions, account, ohlcv, recentTrades] = await Promise.all([
      client.getTicker(this.config.symbol),
      client.getPositions(this.config.symbol),
      client.getAccountInfo(),
      client.getOHLCV(this.config.symbol, '1h', 50),
      client.getMyTrades(this.config.symbol, 10).catch(() => []),
    ]);

    // Use centralized indicator computations
    const typedOhlcv = ohlcv as OHLCV[];

    // -- Trend --
    const sma7Data = computeSMA(typedOhlcv, 7);
    const sma20Data = computeSMA(typedOhlcv, 20);
    const sma50Data = computeSMA(typedOhlcv, 50);
    const ema21Data = computeEMA(typedOhlcv, 21);
    const macdData = computeMACD(typedOhlcv);
    const superTrend = computeSuperTrend(typedOhlcv);
    const adxData = computeADX(typedOhlcv);

    // -- Momentum --
    const rsiData = computeRSI(typedOhlcv);
    const atrData = computeATR(typedOhlcv);

    // -- Volume --
    const volumeProfile = computeVolumeProfile(typedOhlcv);
    const recentVol = ohlcv.slice(-3).reduce((s: number, c: { volume: number }) => s + c.volume, 0);
    const priorVol = ohlcv.slice(-6, -3).reduce((s: number, c: { volume: number }) => s + c.volume, 0);
    const volumeTrend = priorVol > 0 ? ((recentVol - priorVol) / priorVol) * 100 : 0;

    // -- Signals --
    const emaCrossSignals = generateEMACrossSignals(typedOhlcv, 9, 21);

    // Extract last values for prompt
    const last = <T extends { value: number }>(arr: T[]): number | null =>
      arr.length > 0 ? arr[arr.length - 1].value : null;

    return {
      ticker,
      positions,
      account,
      ohlcv,
      recentTrades,
      indicators: {
        sma7: last(sma7Data),
        sma20: last(sma20Data),
        sma50: last(sma50Data),
        ema21: last(ema21Data),
        rsi: last(rsiData),
        atr: last(atrData),
        macdLine: last(macdData.macdLine),
        macdSignal: last(macdData.signalLine),
        macdHistogram: macdData.histogram.length > 0 ? macdData.histogram[macdData.histogram.length - 1].value : null,
        superTrendDir: superTrend.direction.length > 0 ? superTrend.direction[superTrend.direction.length - 1] : null,
        superTrendVal: last(superTrend.line),
        adx: last(adxData.adx),
        diPlus: last(adxData.diPlus),
        diMinus: last(adxData.diMinus),
        volumeTrend,
        volumeProfile,
        recentSignals: emaCrossSignals.slice(-3).map(s => ({
          direction: s.direction,
          price: s.price,
        })),
      },
    };
  }

  // --- Prompt Builder ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private buildPrompt(snapshot: any): string {
    const { ticker, positions, account, ohlcv, recentTrades, indicators } = snapshot;

    const recentCandles = ohlcv.slice(-20).map((c: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }) =>
      `${new Date(c.timestamp).toISOString().slice(11, 16)} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume.toFixed(0)}`
    ).join('\n');

    const positionsBlock = positions.length > 0
      ? positions.map((p: { side: string; size: number; entryPrice: number; markPrice: number; unrealizedPnl: number; leverage: number; liquidationPrice: number | null }) =>
          `  ${p.side.toUpperCase()} ${p.size} @ $${p.entryPrice} → $${p.markPrice} | PnL: $${p.unrealizedPnl.toFixed(2)} | ${p.leverage}x lev | Liq: $${p.liquidationPrice ?? 'N/A'}`
        ).join('\n')
      : '  None';

    const recentTradesBlock = recentTrades.length > 0
      ? recentTrades.slice(0, 5).map((t: { side: string; price: number; amount: number; timestamp: number }) =>
          `  ${t.side.toUpperCase()} ${t.amount} @ $${t.price} (${new Date(t.timestamp).toISOString().slice(11, 16)})`
        ).join('\n')
      : '  None';

    const recentActionsBlock = this.actionHistory.length > 0
      ? this.actionHistory.slice(-5).map(a =>
          `  [${new Date(a.timestamp).toISOString().slice(11, 16)}] ${a.action}: ${a.result}`
        ).join('\n')
      : '  None yet';

    return `[HEARTBEAT TICK #${this.tickCount}] — ${new Date().toISOString()}
Symbol: ${this.config.symbol} | Risk: ${this.config.riskLevel} | Auto-trade: ${this.config.enableAutoTrade ? 'ON' : 'ADVISE ONLY'}

== MARKET STATE ==
Price: $${ticker.last} | Bid: $${ticker.bid} | Ask: $${ticker.ask}
24h: High $${ticker.high} | Low $${ticker.low} | Change: ${ticker.changePercent24h.toFixed(2)}% | Vol: ${ticker.volume.toFixed(0)}

== INDICATORS ==
--- Moving Averages ---
SMA7: ${indicators.sma7?.toFixed(4) ?? 'N/A'} | SMA20: ${indicators.sma20?.toFixed(4) ?? 'N/A'} | SMA50: ${indicators.sma50?.toFixed(4) ?? 'N/A'} | EMA21: ${indicators.ema21?.toFixed(4) ?? 'N/A'}
SMA Signal: ${indicators.sma7 && indicators.sma20 ? (indicators.sma7 > indicators.sma20 ? 'BULLISH (7 > 20)' : 'BEARISH (7 < 20)') : 'N/A'}
${indicators.sma20 && indicators.sma50 ? `SMA Trend: ${indicators.sma20 > indicators.sma50 ? 'BULLISH (20 > 50)' : 'BEARISH (20 < 50)'}` : ''}
--- Momentum ---
RSI(14): ${indicators.rsi?.toFixed(1) ?? 'N/A'} ${indicators.rsi ? (indicators.rsi > 70 ? '⚠ OVERBOUGHT' : indicators.rsi < 30 ? '⚠ OVERSOLD' : indicators.rsi > 60 ? '(bullish zone)' : indicators.rsi < 40 ? '(bearish zone)' : '(neutral)') : ''}
MACD: Line=${indicators.macdLine?.toFixed(4) ?? 'N/A'} | Signal=${indicators.macdSignal?.toFixed(4) ?? 'N/A'} | Hist=${indicators.macdHistogram?.toFixed(4) ?? 'N/A'} ${indicators.macdHistogram != null ? (indicators.macdHistogram > 0 ? '(bullish momentum)' : '(bearish momentum)') : ''}
--- Trend Strength ---
SuperTrend: ${indicators.superTrendDir?.toUpperCase() ?? 'N/A'} @ ${indicators.superTrendVal?.toFixed(4) ?? 'N/A'}
ADX: ${indicators.adx?.toFixed(1) ?? 'N/A'} ${indicators.adx ? (indicators.adx > 40 ? '(STRONG TREND)' : indicators.adx > 25 ? '(trending)' : '(weak/ranging)') : ''} | DI+: ${indicators.diPlus?.toFixed(1) ?? 'N/A'} | DI-: ${indicators.diMinus?.toFixed(1) ?? 'N/A'} ${indicators.diPlus != null && indicators.diMinus != null ? (indicators.diPlus > indicators.diMinus ? '(bulls lead)' : '(bears lead)') : ''}
--- Volatility ---
ATR(14): ${indicators.atr?.toFixed(4) ?? 'N/A'}
Volume Trend (3h vs prior 3h): ${indicators.volumeTrend > 0 ? '+' : ''}${indicators.volumeTrend.toFixed(1)}%
${indicators.volumeProfile ? `Volume Profile: POC=$${indicators.volumeProfile.poc.toFixed(2)} | VAH=$${indicators.volumeProfile.vah.toFixed(2)} | VAL=$${indicators.volumeProfile.val.toFixed(2)}` : ''}
--- Recent Signals ---
${indicators.recentSignals && indicators.recentSignals.length > 0 ? indicators.recentSignals.map((s: { direction: string; price: number }) => `  EMA Cross: ${s.direction.toUpperCase()} @ $${s.price.toFixed(2)}`).join('\n') : '  No recent EMA cross signals'}

== RECENT CANDLES (1h) ==
${recentCandles}

== ACCOUNT ==
Balance: $${account.totalUsdValue.toFixed(2)} | Max position: ${this.config.maxPositionPercent}%
Daily start equity: $${this.dailyStartEquity.toFixed(2)} | Daily PnL: $${(account.totalUsdValue - this.dailyStartEquity).toFixed(2)} (${this.dailyStartEquity > 0 ? (((account.totalUsdValue - this.dailyStartEquity) / this.dailyStartEquity) * 100).toFixed(2) : '0'}%)
Daily loss limit: ${this.config.maxDailyLossPercent}%

== OPEN POSITIONS ==
${positionsBlock}

== RECENT TRADES ==
${recentTradesBlock}

== MY RECENT ACTIONS ==
${recentActionsBlock}

== BEHAVIORAL LEARNINGS ==
${this.getBehavioralLearningsBlock()}

== INTERVENTION TRACK RECORD ==
${getInterventionSummary()}

What is your decision for this tick? Remember: "hold" is the safe default. Only trade on clear setups with proper risk management.
If your proposed action matches a documented behavioral pattern above, you MUST set intervention_matched=true in your response and either back off (hold) or override with explicit justification (intervention_override=true).`;
  }

  // --- AI Query ---

  private async queryAI(prompt: string, chartImageBase64?: string): Promise<{ text: string; thinking: string }> {
    const claudeCodePath = getClaudeCodePath();

    const queryOptions: Record<string, unknown> = {
      pathToClaudeCodeExecutable: claudeCodePath,
      model: 'claude-opus-4-6',
      fallbackModel: 'claude-sonnet-4-5-20250929',
      maxTurns: 1,
      includePartialMessages: false,
      thinking: { type: 'adaptive' },
      effort: 'max',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: HEARTBEAT_SYSTEM_PROMPT,
      },
    };

    // Build query input — multimodal if chart image available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryInput: any;

    if (chartImageBase64) {
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
                    data: chartImageBase64,
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
      queryInput = { prompt, options: queryOptions };
    }

    let fullText = '';
    let thinkingText = '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const message of queuedQueryStream(queryInput, { priority: 'critical', label: 'heartbeat-tick' })) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = message as any;

      if (msg.type === 'assistant') {
        const content = msg.message?.content || msg.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) fullText = block.text;
            if (block.type === 'thinking' && block.thinking) thinkingText = block.thinking;
          }
        }
      } else if (msg.type === 'stream_event') {
        const event = msg.event;
        if (event?.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            fullText += event.delta.text;
          } else if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
            thinkingText += event.delta.thinking;
          }
        }
      }
    }

    return { text: fullText, thinking: thinkingText };
  }

  private computeSMAArray(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    const result: number[] = [];
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      result.push(slice.reduce((s, p) => s + p, 0) / period);
    }
    return result;
  }

  // --- Behavioral Learnings ---

  private getBehavioralLearningsBlock(): string {
    try {
      const kb = getKnowledgeBase();
      return kb.getLearningsPromptBlock(10);
    } catch {
      return '  Learnings system unavailable.';
    }
  }

  // --- Response Parser ---

  private parseResponse(text: string): { analysis: string; actions: AITradeAction[] } {
    // Extract JSON block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      // Try raw JSON
      const rawMatch = text.match(/\{[\s\S]*"actions"[\s\S]*\}/);
      if (rawMatch) {
        try {
          const parsed = JSON.parse(rawMatch[0]);
          return {
            analysis: parsed.analysis || text.slice(0, 200),
            actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          };
        } catch {
          return { analysis: text.slice(0, 300), actions: [] };
        }
      }
      return { analysis: text.slice(0, 300), actions: [] };
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        analysis: parsed.analysis || '',
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      };
    } catch {
      return { analysis: text.slice(0, 300), actions: [] };
    }
  }

  // --- Action Executor ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executeAction(action: AITradeAction, snapshot: any): Promise<void> {
    // Confidence gate based on risk level
    const confidenceThreshold = {
      conservative: 90,
      moderate: 80,
      aggressive: 70,
      degen: 50,
    }[this.config.riskLevel];

    // Log behavioral intervention if AI flagged a pattern match
    if (action.intervention_matched) {
      logIntervention({
        learningId: action.intervention_learning_id ?? 'unknown',
        patternTag: action.intervention_note ?? 'untagged',
        symbol: action.symbol || this.config.symbol,
        originalAction: action.action,
        finalAction: action.intervention_override ? action.action : 'hold',
        wasOverridden: action.intervention_override ?? false,
        confidence: action.confidence,
        reasoning: action.reason,
      });
    }

    if (action.action === 'hold') {
      this.emit({
        type: 'action',
        data: { action: 'hold', reason: action.reason, confidence: action.confidence, interventionMatched: action.intervention_matched },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: 'hold',
        timestamp: Date.now(),
        result: action.reason,
      });
      return;
    }

    // Skip low-confidence actions
    if (action.confidence < confidenceThreshold) {
      this.emit({
        type: 'trade_skipped',
        data: {
          action: action.action,
          reason: `Confidence ${action.confidence}% < threshold ${confidenceThreshold}% (${this.config.riskLevel})`,
          originalReason: action.reason,
        },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: `skip_${action.action}`,
        timestamp: Date.now(),
        result: `Confidence ${action.confidence}% too low`,
      });
      return;
    }

    // Skip non-immediate urgency unless aggressive/degen
    if (action.urgency === 'wait_for_confirmation' && ['conservative', 'moderate'].includes(this.config.riskLevel)) {
      this.emit({
        type: 'trade_skipped',
        data: {
          action: action.action,
          reason: 'Waiting for confirmation (non-aggressive mode)',
          originalReason: action.reason,
        },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: `wait_${action.action}`,
        timestamp: Date.now(),
        result: 'Waiting for confirmation',
      });
      return;
    }

    if (!this.config.enableAutoTrade) {
      // Advise-only mode — emit but don't execute
      this.emit({
        type: 'action',
        data: {
          action: action.action,
          reason: action.reason,
          confidence: action.confidence,
          autoTradeDisabled: true,
          suggestedEntry: action.entryPrice,
          suggestedSL: action.stopLoss,
          suggestedTP: action.takeProfit,
        },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: `advise_${action.action}`,
        timestamp: Date.now(),
        result: `${action.reason} (advise only)`,
      });
      return;
    }

    // --- EXECUTE TRADE ---
    try {
      const client = getPhemexClient();
      const account = snapshot.account;
      const equity = account.totalUsdValue;
      const price = snapshot.ticker.last;

      if (action.action === 'buy' || action.action === 'sell') {
        // Set leverage if specified
        if (action.leverage) {
          await client.setLeverage(this.config.symbol, action.leverage).catch(() => {});
        }

        // Calculate position size
        const sizePercent = Math.min(
          action.positionSizePercent ?? this.config.maxPositionPercent,
          this.config.maxPositionPercent
        );
        const positionUsd = equity * (sizePercent / 100);
        const amount = positionUsd / price;

        // Place main order
        const order = await client.createOrder(
          this.config.symbol, 'market', action.action, amount
        );

        // Place stop-loss if specified
        if (action.stopLoss) {
          await client.createOrder(
            this.config.symbol,
            'stop',
            action.action === 'buy' ? 'sell' : 'buy',
            amount,
            undefined,
            { stopPrice: action.stopLoss, reduceOnly: true }
          ).catch(err => {
            this.emit({ type: 'error', data: { error: `SL order failed: ${err}` }, timestamp: Date.now() });
          });
        }

        // Place take-profit if specified
        if (action.takeProfit) {
          await client.createOrder(
            this.config.symbol,
            'limit',
            action.action === 'buy' ? 'sell' : 'buy',
            amount,
            action.takeProfit,
            { reduceOnly: true }
          ).catch(err => {
            this.emit({ type: 'error', data: { error: `TP order failed: ${err}` }, timestamp: Date.now() });
          });
        }

        this.emit({
          type: 'trade_executed',
          data: {
            action: action.action,
            amount,
            price,
            orderId: order.id,
            stopLoss: action.stopLoss,
            takeProfit: action.takeProfit,
            leverage: action.leverage,
            confidence: action.confidence,
            reason: action.reason,
          },
          timestamp: Date.now(),
        });

        this.actionHistory.push({
          action: action.action,
          timestamp: Date.now(),
          result: `${action.action.toUpperCase()} ${amount.toFixed(4)} @ $${price} | SL:$${action.stopLoss ?? 'N/A'} TP:$${action.takeProfit ?? 'N/A'}`,
        });

      } else if (action.action === 'close') {
        const positions = snapshot.positions;
        if (positions.length === 0) {
          this.emit({
            type: 'trade_skipped',
            data: { action: 'close', reason: 'No open positions to close' },
            timestamp: Date.now(),
          });
          return;
        }

        for (const pos of positions) {
          const closeSide = pos.side === 'long' ? 'sell' : 'buy';
          const order = await client.createOrder(
            this.config.symbol, 'market', closeSide, pos.size
          );

          this.emit({
            type: 'trade_executed',
            data: {
              action: 'close',
              side: closeSide,
              amount: pos.size,
              price,
              pnl: pos.unrealizedPnl,
              orderId: order.id,
              reason: action.reason,
            },
            timestamp: Date.now(),
          });

          this.actionHistory.push({
            action: 'close',
            timestamp: Date.now(),
            result: `Closed ${pos.side} ${pos.size} | PnL: $${pos.unrealizedPnl.toFixed(2)} | ${action.reason}`,
          });
        }

      } else if (action.action === 'adjust_sl' || action.action === 'adjust_tp') {
        // Cancel existing SL/TP orders and place new ones
        const positions = snapshot.positions;
        if (positions.length === 0) return;

        await client.cancelAllOrders(this.config.symbol).catch(() => {});

        const pos = positions[0];
        const closeSide = pos.side === 'long' ? 'sell' : 'buy';

        if (action.action === 'adjust_sl' && action.stopLoss) {
          await client.createOrder(
            this.config.symbol, 'stop', closeSide, pos.size,
            undefined, { stopPrice: action.stopLoss, reduceOnly: true }
          );
        }
        if (action.action === 'adjust_tp' && action.takeProfit) {
          await client.createOrder(
            this.config.symbol, 'limit', closeSide, pos.size,
            action.takeProfit, { reduceOnly: true }
          );
        }

        this.emit({
          type: 'trade_executed',
          data: {
            action: action.action,
            stopLoss: action.stopLoss,
            takeProfit: action.takeProfit,
            reason: action.reason,
          },
          timestamp: Date.now(),
        });

        this.actionHistory.push({
          action: action.action,
          timestamp: Date.now(),
          result: `Adjusted ${action.action === 'adjust_sl' ? 'SL' : 'TP'} to $${action.stopLoss ?? action.takeProfit} | ${action.reason}`,
        });
      }

    } catch (err) {
      this.emit({
        type: 'error',
        data: { action: action.action, error: String(err) },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: `error_${action.action}`,
        timestamp: Date.now(),
        result: String(err),
      });
    }
  }

  // --- Kill Switch ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private checkKillConditions(snapshot: any): boolean {
    const equity = snapshot.account.totalUsdValue;
    if (this.dailyStartEquity <= 0) return false;

    const dailyLossPercent = ((this.dailyStartEquity - equity) / this.dailyStartEquity) * 100;

    if (dailyLossPercent >= this.config.maxDailyLossPercent) {
      this.isKilled = true;
      // CRIT-11: Persist kill switch globally so it survives restarts
      triggerKillSwitch(`daily_loss_limit: ${dailyLossPercent.toFixed(2)}% (limit: ${this.config.maxDailyLossPercent}%)`);
      this.emit({
        type: 'kill_triggered',
        data: {
          reason: 'daily_loss_limit',
          dailyLossPercent: dailyLossPercent.toFixed(2),
          limit: this.config.maxDailyLossPercent,
          equity,
        },
        timestamp: Date.now(),
      });

      if (this.config.stopAfterKill) {
        this.stop();
      }
      return true;
    }

    return false;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let heartbeat: HeartbeatEngine | null = null;

export function getHeartbeatEngine(): HeartbeatEngine | null {
  return heartbeat;
}

export function createHeartbeatEngine(config: HeartbeatConfig): HeartbeatEngine {
  if (heartbeat?.isActive()) {
    heartbeat.stop();
  }
  heartbeat = new HeartbeatEngine(config);
  return heartbeat;
}

export function stopHeartbeatEngine(): void {
  heartbeat?.stop();
  heartbeat = null;
}
