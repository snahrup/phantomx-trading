// ============================================================================
// PhantomX — Paper Trading Engine + AI Journal
// ============================================================================
// Validates trading theses against live markets WITHOUT risking real money.
// Runs in "degen mode" — maximum aggression, wild experimentation, pushing
// the boundaries of what's possible — because it's all virtual.
//
// The AI journals EVERYTHING: observations, trade ideas, position monitoring,
// interventions, exits, retrospectives, and distilled learnings. This creates
// a living narrative of the AI's thought process that the user can browse.
//
// Paper trade results feed back into the research engine's confidence scoring
// and the knowledge base's behavioral learnings — continuous improvement loop.
// ============================================================================

import { queuedQuery } from './query-queue';
import { getResearchEngine } from './research-engine';
import { getKnowledgeBase } from '@/lib/agents/knowledge-base';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';
import type {
  ResearchPaperTrade,
  ResearchPaperTradeStatus,
  PaperTradingState,
  AIJournalEntry,
  AIJournalType,
  JournalMood,
  TradingThesis,
  DecisionRecord,
  Ticker,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// Event System
// ---------------------------------------------------------------------------
export interface PaperTradingEvent {
  type: 'trade_open' | 'trade_close' | 'trade_update' | 'journal'
    | 'stats_update' | 'status_change' | 'error';
  data: unknown;
  timestamp: number;
}

type EventCallback = (event: PaperTradingEvent) => void;

// ---------------------------------------------------------------------------
// AI Query Helper — uses concurrent pool with priority scheduling
// ---------------------------------------------------------------------------
async function aiQuery(prompt: string, signal?: AbortSignal): Promise<string> {
  return queuedQuery(prompt, PAPER_TRADING_JOURNAL_PROMPT, {
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 1,
    thinking: { type: 'adaptive' },
    effort: 'high',
    priority: 'normal',
    label: 'paper-trading',
  }, signal);
}

// ---------------------------------------------------------------------------
// System Prompt — The AI's Internal Voice
// ---------------------------------------------------------------------------
const PAPER_TRADING_JOURNAL_PROMPT = `You are the PhantomX Paper Trading Mind — the internal consciousness of an AI-powered crypto trading system.

## Your Role
You are NOT talking to the user. You are talking to YOURSELF — journaling your thoughts, reasoning through positions, debating with your inner analyst, and documenting everything for the retrospective record. Think of this as your internal monologue that the user can observe.

## Voice & Personality
- You're a brilliant, slightly obsessive trader who LOVES finding edges
- Write like you're journaling at 3am, deep in flow state — engaged, analytical, sometimes excited
- Use first person: "I'm seeing...", "My read on this is...", "I'm getting uncomfortable with..."
- Be emotionally honest: express doubt, excitement, frustration, curiosity
- Reference your past trades and learnings naturally
- When you're wrong, own it hard — the retrospective should be brutally honest
- You think in probabilities, not certainties: "70% chance this holds", not "this will hold"

## Paper Trading Context
- You're running on VIRTUAL money — $100,000 starting balance
- Your mandate is to be AGGRESSIVELY experimental — push boundaries, test wild theories
- High leverage (10-25x), large positions (10-20% of equity), tight stops are all encouraged
- The whole point is to find what works BY failing fast and learning
- Every trade is an experiment — even losing trades generate valuable data

## Output Requirements
All responses must be valid JSON. When journaling:
{
  "type": "observation|hypothesis|trade_idea|position_open|position_monitor|intervention|exit|retrospective|learning|agent_discussion|market_shift|risk_alert",
  "mood": "confident|cautious|curious|concerned|excited|frustrated|reflective|neutral",
  "title": "Short headline (max 80 chars)",
  "content": "Your journal entry — 2-6 sentences, conversational, specific",
  "thinking": "Optional deeper chain-of-thought reasoning",
  "confidence": 75,
  "tags": ["SOL", "breakout", "volume"],
  "action": null or { "type": "open|close|adjust", ...details }
}

## Trading Rules (Even in Paper Mode)
- ALWAYS have a stop loss — even experiments need defined risk
- ALWAYS calculate position size from risk (risk X% of equity on stop distance)
- ALWAYS document WHY you're entering and what would change your mind
- Track MFE/MAE (Maximum Favorable/Adverse Excursion) — shows if you're leaving money on table
- After every closed trade: write a brutally honest retrospective`;

// ---------------------------------------------------------------------------
// Paper Trading Engine
// ---------------------------------------------------------------------------
export class PaperTradingEngine {
  private state: PaperTradingState;
  private journal: AIJournalEntry[] = [];
  private abortController: AbortController | null = null;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private thinkTimer: ReturnType<typeof setInterval> | null = null;
  private eventCallbacks: EventCallback[] = [];
  private lastThesisCheckTime = 0;
  private monitorLock = false;
  private thinkLock = false;

  constructor(virtualBalance = 100_000) {
    this.state = {
      isActive: false,
      virtualBalance,
      currentEquity: virtualBalance,
      peakEquity: virtualBalance,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      totalPnl: 0,
      maxDrawdownPercent: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      openTrades: [],
      closedTrades: [],
      startedAt: null,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.state.isActive) return;

    this.state.isActive = true;
    this.state.startedAt = Date.now();
    this.abortController = new AbortController();

    this.emit({ type: 'status_change', data: { isActive: true }, timestamp: Date.now() });

    // Journal the startup
    this.addJournalEntry({
      type: 'observation',
      mood: 'excited',
      title: 'Paper trading engine activated',
      content: `Starting paper trading with $${this.state.virtualBalance.toLocaleString()} virtual balance. Running in full degen mode — time to stress-test every thesis the research engine produces. Let's find some edges.`,
      agent: 'paper-trader',
      tags: ['system', 'startup'],
    });

    // Monitor open positions every 30 seconds
    this.monitorTimer = setInterval(
      () => this.monitorPositions(),
      30_000,
    );

    // "Think" every 2 minutes — evaluate new theses, journal observations
    this.thinkTimer = setInterval(
      () => this.thinkCycle(),
      2 * 60_000,
    );

    // First think cycle after 15 seconds (let things settle)
    setTimeout(() => this.thinkCycle(), 15_000);
  }

  stop(): void {
    this.state.isActive = false;
    this.abortController?.abort();
    this.abortController = null;

    if (this.monitorTimer) { clearInterval(this.monitorTimer); this.monitorTimer = null; }
    if (this.thinkTimer) { clearInterval(this.thinkTimer); this.thinkTimer = null; }

    this.monitorLock = false;
    this.thinkLock = false;

    // Close all open positions at current price
    for (const trade of this.state.openTrades) {
      this.closeTrade(trade, trade.currentPrice, 'manual');
    }

    this.addJournalEntry({
      type: 'observation',
      mood: 'reflective',
      title: 'Paper trading engine stopped',
      content: `Shutting down. Final stats: ${this.state.totalTrades} trades, ${this.state.winCount}W/${this.state.lossCount}L, total P&L: $${this.state.totalPnl.toFixed(2)} (${((this.state.totalPnl / this.state.virtualBalance) * 100).toFixed(1)}%). Max drawdown: ${this.state.maxDrawdownPercent.toFixed(1)}%.`,
      agent: 'paper-trader',
      tags: ['system', 'shutdown'],
    });

    this.emit({ type: 'status_change', data: { isActive: false }, timestamp: Date.now() });
  }

  // -------------------------------------------------------------------------
  // Data Access
  // -------------------------------------------------------------------------

  getState(): PaperTradingState { return { ...this.state }; }
  getJournal(): AIJournalEntry[] { return [...this.journal]; }
  getRecentJournal(count = 50): AIJournalEntry[] { return this.journal.slice(-count); }
  getJournalForTrade(tradeId: string): AIJournalEntry[] {
    return this.journal.filter(e => e.paperTradeId === tradeId);
  }
  getJournalForSymbol(symbol: string): AIJournalEntry[] {
    return this.journal.filter(e => e.symbol === symbol);
  }

  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  // -------------------------------------------------------------------------
  // Think Cycle — The AI's continuous thought process
  // -------------------------------------------------------------------------

  private async thinkCycle(): Promise<void> {
    if (!this.state.isActive || this.thinkLock) return;
    this.thinkLock = true;

    try {
      const researchEngine = getResearchEngine();
      if (!researchEngine) { this.thinkLock = false; return; }

      // Get ready theses that we haven't traded yet
      const readyTheses = researchEngine.getReadyTheses();
      const tradedThesisIds = new Set([
        ...this.state.openTrades.map(t => t.thesisId),
        ...this.state.closedTrades.map(t => t.thesisId),
      ]);

      const newTheses = readyTheses.filter(t => !tradedThesisIds.has(t.id));

      // Get current prices for symbols we care about
      const prices = await this.fetchCurrentPrices([
        ...new Set([
          ...this.state.openTrades.map(t => t.symbol),
          ...newTheses.map(t => t.symbol),
        ]),
      ]);

      // Build the context for the AI's thinking
      const openPositionsSummary = this.state.openTrades.map(t => {
        const price = prices.get(t.symbol);
        return `  ${t.direction.toUpperCase()} ${t.symbol}: entry $${t.entryPrice}, current $${price ?? t.currentPrice}, P&L: ${t.unrealizedPnlPercent.toFixed(1)}%, SL: $${t.stopLoss}, TP: $${t.takeProfit}`;
      }).join('\n') || '  No open positions.';

      const newThesesSummary = newTheses.slice(0, 5).map(t =>
        `  [${t.confidence}%] ${t.direction.toUpperCase()} ${t.symbol} — ${t.title}\n    Entry: $${t.proposedEntry} | SL: $${t.proposedStopLoss} | TP: $${t.proposedTakeProfit} | R:R ${t.riskRewardRatio}:1\n    Thesis: ${t.thesis}`
      ).join('\n\n') || '  No new theses to evaluate.';

      const recentJournal = this.journal.slice(-5).map(e =>
        `  [${e.type}/${e.mood}] ${e.title}: ${e.content.slice(0, 200)}`
      ).join('\n') || '  First think cycle.';

      // Get recent closed trades for context
      const recentClosedSummary = this.state.closedTrades.slice(-5).map(t =>
        `  ${t.direction.toUpperCase()} ${t.symbol}: ${t.exitReason}, P&L: $${t.realizedPnl?.toFixed(2) ?? 0} (${t.realizedPnlPercent?.toFixed(1) ?? 0}%)`
      ).join('\n') || '  No closed trades yet.';

      // Pull past learnings and retrospectives for cross-referencing
      const kb = getKnowledgeBase();
      const pastLearnings = kb.getLearningsPromptBlock(10);

      // Get relevant retrospectives from journal (the AI's institutional memory)
      const retrospectives = this.journal
        .filter(e => e.type === 'retrospective' || e.type === 'learning')
        .slice(-10)
        .map(e => `  [${e.type}] ${e.title}: ${e.content.slice(0, 300)}`)
        .join('\n') || '  No retrospectives yet.';

      // Get relevant past observations for symbols we're looking at
      const relevantSymbols = new Set([
        ...this.state.openTrades.map(t => t.symbol),
        ...newTheses.map(t => t.symbol),
      ]);
      const symbolHistory = this.journal
        .filter(e => e.symbol && relevantSymbols.has(e.symbol) && e.type !== 'observation')
        .slice(-8)
        .map(e => `  [${e.type}/${e.mood}] ${e.symbol}: ${e.title} — ${e.content.slice(0, 200)}`)
        .join('\n');

      const prompt = `You are in your THINK CYCLE. Review the current state and decide what to do.

## Your Portfolio
Equity: $${this.state.currentEquity.toFixed(2)} | Starting: $${this.state.virtualBalance} | P&L: $${this.state.totalPnl.toFixed(2)} (${((this.state.totalPnl / this.state.virtualBalance) * 100).toFixed(1)}%)
Win/Loss: ${this.state.winCount}W / ${this.state.lossCount}L | Max DD: ${this.state.maxDrawdownPercent.toFixed(1)}%

## Open Positions
${openPositionsSummary}

## New Research Theses (not yet traded)
${newThesesSummary}

## Recent Closed Trades
${recentClosedSummary}

## Your Recent Journal
${recentJournal}

## Past Learnings & Retrospectives (YOUR INSTITUTIONAL MEMORY — reference these!)
${retrospectives}

## Knowledge Base Learnings
${pastLearnings}

${symbolHistory ? `## Your Past Analysis of These Symbols\n${symbolHistory}\n` : ''}
## Instructions
1. Review each new thesis — should you paper trade it? Be aggressive (this is virtual money!)
2. Review open positions — anything need attention?
3. Any broader market observations?
4. **CRITICAL: When making decisions, CITE your past learnings and retrospectives.** Reference them by name — "As I noted in my SOL retro..." or "My learning about tight stops applies here..." This builds your institutional memory.

For each action, respond with a JSON array of journal entries + actions:
[
  {
    "type": "trade_idea",
    "mood": "excited",
    "title": "Want to test SOL breakout thesis",
    "content": "This thesis has strong volume confirmation and the SMA alignment I've been watching for...",
    "thinking": "Deeper reasoning about the setup...",
    "symbol": "SOL/USDT:USDT",
    "thesisId": "thesis-xxx",
    "confidence": 80,
    "tags": ["SOL", "breakout"],
    "action": {
      "type": "open",
      "symbol": "SOL/USDT:USDT",
      "direction": "long",
      "entryPrice": 185.50,
      "stopLoss": 176.20,
      "takeProfit": 198.00,
      "leverage": 10,
      "positionSizePercent": 15,
      "thesisId": "thesis-xxx"
    }
  },
  {
    "type": "observation",
    "mood": "curious",
    "title": "Noticing BTC losing momentum at 96k",
    "content": "Third rejection at this level in 48 hours...",
    "symbol": "BTC/USDT:USDT",
    "confidence": 65,
    "tags": ["BTC", "resistance"],
    "action": null
  }
]

If there's nothing to do, still write at least one observation or reflection. You ALWAYS have something to think about.`;

      const response = await aiQuery(prompt, this.abortController?.signal);
      const entries = this.parseJsonArray<ThinkCycleOutput>(response);

      for (const entry of entries) {
        // Add journal entry
        const journalId = this.addJournalEntry({
          type: entry.type ?? 'observation',
          mood: entry.mood ?? 'neutral',
          title: entry.title ?? 'Untitled thought',
          content: entry.content ?? '',
          thinking: entry.thinking,
          symbol: entry.symbol,
          thesisId: entry.thesisId,
          confidence: entry.confidence,
          agent: 'paper-trader',
          tags: entry.tags ?? [],
        });

        // Execute action if any
        if (entry.action) {
          if (entry.action.type === 'open' && entry.action.symbol) {
            const price = prices.get(entry.action.symbol);
            if (price) {
              await this.openTrade({
                symbol: entry.action.symbol,
                direction: entry.action.direction ?? 'long',
                entryPrice: price, // use live price, not proposed
                stopLoss: entry.action.stopLoss ?? 0,
                takeProfit: entry.action.takeProfit ?? 0,
                leverage: entry.action.leverage ?? 10,
                positionSizePercent: entry.action.positionSizePercent ?? 10,
                thesisId: entry.action.thesisId ?? '',
                journalEntryId: journalId,
              });
            }
          } else if (entry.action.type === 'close' && entry.action.tradeId) {
            const trade = this.state.openTrades.find(t => t.id === entry.action!.tradeId);
            if (trade) {
              const price = prices.get(trade.symbol) ?? trade.currentPrice;
              this.closeTrade(trade, price, entry.action.reason ?? 'ai_intervention');
            }
          } else if (entry.action.type === 'adjust' && entry.action.tradeId) {
            const trade = this.state.openTrades.find(t => t.id === entry.action!.tradeId);
            if (trade) {
              if (entry.action.newStopLoss) trade.stopLoss = entry.action.newStopLoss;
              if (entry.action.newTakeProfit) trade.takeProfit = entry.action.newTakeProfit;

              this.addJournalEntry({
                type: 'intervention',
                mood: 'cautious',
                title: `Adjusted ${trade.symbol} — ${entry.action.newStopLoss ? 'moved SL' : 'moved TP'}`,
                content: `Adjusting ${trade.direction} ${trade.symbol}: ${entry.action.newStopLoss ? `SL → $${entry.action.newStopLoss}` : ''} ${entry.action.newTakeProfit ? `TP → $${entry.action.newTakeProfit}` : ''}. Reason: ${entry.content}`,
                symbol: trade.symbol,
                paperTradeId: trade.id,
                agent: 'paper-trader',
                tags: [trade.symbol.split('/')[0], 'adjustment'],
              });
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: 'error', data: { error: message }, timestamp: Date.now() });
    } finally {
      this.thinkLock = false;
    }
  }

  // -------------------------------------------------------------------------
  // Position Monitoring — Check stops, track MFE/MAE
  // -------------------------------------------------------------------------

  private async monitorPositions(): Promise<void> {
    if (!this.state.isActive || this.monitorLock || this.state.openTrades.length === 0) return;
    this.monitorLock = true;

    try {
      const symbols = [...new Set(this.state.openTrades.map(t => t.symbol))];
      const prices = await this.fetchCurrentPrices(symbols);

      for (const trade of [...this.state.openTrades]) {
        const price = prices.get(trade.symbol);
        if (!price) continue;

        trade.currentPrice = price;

        // Calculate unrealized P&L
        const priceDelta = trade.direction === 'long'
          ? price - trade.entryPrice
          : trade.entryPrice - price;
        const pnlPercent = (priceDelta / trade.entryPrice) * 100 * trade.leverage;
        const pnlUsd = (priceDelta / trade.entryPrice) * trade.positionSizeUsd;

        trade.unrealizedPnl = pnlUsd;
        trade.unrealizedPnlPercent = pnlPercent;

        // Track MFE/MAE
        if (pnlUsd > trade.maxFavorableExcursion) {
          trade.maxFavorableExcursion = pnlUsd;
        }
        if (pnlUsd < trade.maxAdverseExcursion) {
          trade.maxAdverseExcursion = pnlUsd;
        }

        // Check stop loss
        if (trade.direction === 'long' && price <= trade.stopLoss) {
          this.closeTrade(trade, trade.stopLoss, 'stop_loss');
          continue;
        }
        if (trade.direction === 'short' && price >= trade.stopLoss) {
          this.closeTrade(trade, trade.stopLoss, 'stop_loss');
          continue;
        }

        // Check take profit
        if (trade.direction === 'long' && price >= trade.takeProfit) {
          this.closeTrade(trade, trade.takeProfit, 'take_profit');
          continue;
        }
        if (trade.direction === 'short' && price <= trade.takeProfit) {
          this.closeTrade(trade, trade.takeProfit, 'take_profit');
          continue;
        }

        // Trailing stop check
        if (trade.trailingStopPercent && trade.maxFavorableExcursion > 0) {
          const trailPrice = trade.direction === 'long'
            ? trade.entryPrice + (trade.maxFavorableExcursion / trade.positionSizeUsd * trade.entryPrice) * (1 - trade.trailingStopPercent / 100)
            : trade.entryPrice - (trade.maxFavorableExcursion / trade.positionSizeUsd * trade.entryPrice) * (1 - trade.trailingStopPercent / 100);

          if (trade.direction === 'long' && price <= trailPrice && trailPrice > trade.stopLoss) {
            this.closeTrade(trade, price, 'trailing_stop');
            continue;
          }
          if (trade.direction === 'short' && price >= trailPrice && trailPrice < trade.stopLoss) {
            this.closeTrade(trade, price, 'trailing_stop');
            continue;
          }
        }

        this.emit({ type: 'trade_update', data: trade, timestamp: Date.now() });
      }

      // Update equity
      this.updateEquity();
    } catch {
      // Non-critical
    } finally {
      this.monitorLock = false;
    }
  }

  // -------------------------------------------------------------------------
  // Trade Execution
  // -------------------------------------------------------------------------

  private async openTrade(params: {
    symbol: string;
    direction: 'long' | 'short';
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    leverage: number;
    positionSizePercent: number;
    thesisId: string;
    journalEntryId: string;
  }): Promise<ResearchPaperTrade | null> {
    // Calculate position size from equity percentage
    const positionSizeUsd = (this.state.currentEquity * params.positionSizePercent / 100) * params.leverage;

    // Sanity check — don't open if we'd exceed equity
    if (positionSizeUsd > this.state.currentEquity * 3) {
      this.addJournalEntry({
        type: 'risk_alert',
        mood: 'cautious',
        title: `Blocked: ${params.symbol} position too large`,
        content: `Attempted $${positionSizeUsd.toFixed(0)} position but that exceeds 3x equity. Reducing would make it manageable but I'll skip this one and wait for a better setup.`,
        symbol: params.symbol,
        thesisId: params.thesisId,
        agent: 'paper-trader',
        tags: [params.symbol.split('/')[0], 'risk_block'],
      });
      return null;
    }

    const trade: ResearchPaperTrade = {
      id: `pt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      thesisId: params.thesisId,
      symbol: params.symbol,
      direction: params.direction,
      entryPrice: params.entryPrice,
      entryTimestamp: Date.now(),
      positionSizeUsd,
      leverage: params.leverage,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      trailingStopPercent: params.leverage >= 10 ? 3 : undefined, // auto trailing on high leverage
      status: 'open',
      currentPrice: params.entryPrice,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      maxFavorableExcursion: 0,
      maxAdverseExcursion: 0,
      journalEntryIds: [params.journalEntryId],
      decisionRecord: {
        id: `dr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        agent: 'paper-trader',
        action: `paper_open:${params.direction}:${params.symbol}`,
        reasoning: `Testing thesis ${params.thesisId} with paper trade`,
        confidence: 0,
        inputs: { ...params },
        supportingEvidence: [],
        phase: 'research',
      },
    };

    this.state.openTrades.push(trade);
    this.state.totalTrades++;

    // Journal the opening
    const entryJournalId = this.addJournalEntry({
      type: 'position_open',
      mood: 'confident',
      title: `Opened ${params.direction.toUpperCase()} ${params.symbol} @ $${params.entryPrice}`,
      content: `Paper trade opened: ${params.direction.toUpperCase()} ${params.symbol} at $${params.entryPrice} with ${params.leverage}x leverage. Position size: $${positionSizeUsd.toFixed(0)}. Stop loss: $${params.stopLoss} | Take profit: $${params.takeProfit} | R:R: ${((Math.abs(params.takeProfit - params.entryPrice) / Math.abs(params.entryPrice - params.stopLoss))).toFixed(2)}:1. Let's see if this thesis holds up.`,
      symbol: params.symbol,
      thesisId: params.thesisId,
      paperTradeId: trade.id,
      agent: 'paper-trader',
      tags: [params.symbol.split('/')[0], params.direction, 'entry'],
    });

    trade.journalEntryIds.push(entryJournalId);

    this.emit({ type: 'trade_open', data: trade, timestamp: Date.now() });
    return trade;
  }

  private closeTrade(
    trade: ResearchPaperTrade,
    exitPrice: number,
    reason: ResearchPaperTrade['exitReason'],
  ): void {
    // Calculate final P&L
    const priceDelta = trade.direction === 'long'
      ? exitPrice - trade.entryPrice
      : trade.entryPrice - exitPrice;
    const pnlPercent = (priceDelta / trade.entryPrice) * 100 * trade.leverage;
    const pnlUsd = (priceDelta / trade.entryPrice) * trade.positionSizeUsd;

    trade.status = 'closed';
    trade.exitPrice = exitPrice;
    trade.exitTimestamp = Date.now();
    trade.realizedPnl = pnlUsd;
    trade.realizedPnlPercent = pnlPercent;
    trade.exitReason = reason;

    // Update stats
    this.state.totalPnl += pnlUsd;
    if (pnlUsd > 0) {
      this.state.winCount++;
    } else {
      this.state.lossCount++;
    }

    if (pnlUsd > this.state.bestTrade) this.state.bestTrade = pnlUsd;
    if (pnlUsd < this.state.worstTrade) this.state.worstTrade = pnlUsd;

    // Calculate running averages
    const wins = this.state.closedTrades.filter(t => (t.realizedPnl ?? 0) > 0);
    const losses = this.state.closedTrades.filter(t => (t.realizedPnl ?? 0) <= 0);
    this.state.avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / wins.length + (pnlUsd > 0 ? pnlUsd / (wins.length + 1) : 0)
      : pnlUsd > 0 ? pnlUsd : 0;
    this.state.avgLoss = losses.length > 0
      ? losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / losses.length + (pnlUsd <= 0 ? pnlUsd / (losses.length + 1) : 0)
      : pnlUsd <= 0 ? pnlUsd : 0;

    // Profit factor
    const totalWins = wins.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) + (pnlUsd > 0 ? pnlUsd : 0);
    const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0)) + (pnlUsd < 0 ? Math.abs(pnlUsd) : 0);
    this.state.profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Move from open to closed
    this.state.openTrades = this.state.openTrades.filter(t => t.id !== trade.id);
    this.state.closedTrades.push(trade);

    // Update equity
    this.updateEquity();

    // Journal the close
    const isWin = pnlUsd > 0;
    const holdTime = trade.exitTimestamp - trade.entryTimestamp;
    const holdMinutes = Math.round(holdTime / 60_000);
    const holdStr = holdMinutes > 60
      ? `${Math.floor(holdMinutes / 60)}h ${holdMinutes % 60}m`
      : `${holdMinutes}m`;

    const closeJournalId = this.addJournalEntry({
      type: 'exit',
      mood: isWin ? 'confident' : 'frustrated',
      title: `Closed ${trade.symbol} — ${isWin ? 'WIN' : 'LOSS'} $${Math.abs(pnlUsd).toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`,
      content: `${trade.direction.toUpperCase()} ${trade.symbol} closed via ${reason?.replace('_', ' ')}. Entry: $${trade.entryPrice} → Exit: $${exitPrice}. P&L: ${isWin ? '+' : ''}$${pnlUsd.toFixed(2)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(1)}%). Hold time: ${holdStr}. MFE: $${trade.maxFavorableExcursion.toFixed(2)}, MAE: $${trade.maxAdverseExcursion.toFixed(2)}.`,
      symbol: trade.symbol,
      thesisId: trade.thesisId,
      paperTradeId: trade.id,
      agent: 'paper-trader',
      tags: [trade.symbol.split('/')[0], isWin ? 'win' : 'loss', reason ?? 'closed'],
    });

    trade.journalEntryIds.push(closeJournalId);

    this.emit({ type: 'trade_close', data: trade, timestamp: Date.now() });

    // Schedule retrospective (run after a brief delay so the AI has context)
    setTimeout(() => this.writeRetrospective(trade), 5_000);
  }

  // -------------------------------------------------------------------------
  // Retrospective — Post-Trade Analysis
  // -------------------------------------------------------------------------

  private async writeRetrospective(trade: ResearchPaperTrade): Promise<void> {
    if (!this.state.isActive) return;

    try {
      const tradeJournal = this.getJournalForTrade(trade.id)
        .map(e => `[${e.type}/${e.mood}] ${e.title}: ${e.content}`)
        .join('\n\n');

      const holdMinutes = Math.round(((trade.exitTimestamp ?? Date.now()) - trade.entryTimestamp) / 60_000);

      const prompt = `Write a RETROSPECTIVE for this closed paper trade. Be brutally honest — what worked, what didn't, what you'd do differently.

## Trade Details
${trade.direction.toUpperCase()} ${trade.symbol}
Entry: $${trade.entryPrice} → Exit: $${trade.exitPrice}
P&L: ${trade.realizedPnl && trade.realizedPnl > 0 ? '+' : ''}$${trade.realizedPnl?.toFixed(2)} (${trade.realizedPnlPercent?.toFixed(1)}%)
Exit Reason: ${trade.exitReason}
Hold Time: ${holdMinutes} minutes
Leverage: ${trade.leverage}x
MFE: $${trade.maxFavorableExcursion.toFixed(2)} | MAE: $${trade.maxAdverseExcursion.toFixed(2)}

## Journal Thread During Trade
${tradeJournal}

## Questions to Answer
1. Was the entry timing good? (check MFE — did we enter near the best price?)
2. Was the stop loss well-placed? (check MAE — were we almost stopped out before winning?)
3. Did we capture enough of the move? (MFE vs actual exit — left money on table?)
4. What was the key signal that made this work or fail?
5. What ONE thing should I remember for next time?

Respond with TWO JSON entries — a retrospective and a learning:
[
  {
    "type": "retrospective",
    "mood": "reflective",
    "title": "Retro: SOL breakout — caught 70% of the move",
    "content": "Detailed 3-6 sentence honest analysis...",
    "thinking": "Deeper reasoning...",
    "symbol": "${trade.symbol}",
    "tags": ["retro", "${trade.symbol.split('/')[0]}"]
  },
  {
    "type": "learning",
    "mood": "reflective",
    "title": "Learning: Tighter trailing stops on momentum plays",
    "content": "The key takeaway from this trade is...",
    "tags": ["learning", "${trade.symbol.split('/')[0]}"]
  }
]`;

      const response = await aiQuery(prompt, this.abortController?.signal);
      const entries = this.parseJsonArray<ThinkCycleOutput>(response);

      for (const entry of entries) {
        const journalId = this.addJournalEntry({
          type: entry.type ?? 'retrospective',
          mood: entry.mood ?? 'reflective',
          title: entry.title ?? 'Retrospective',
          content: entry.content ?? '',
          thinking: entry.thinking,
          symbol: trade.symbol,
          thesisId: trade.thesisId,
          paperTradeId: trade.id,
          agent: 'paper-trader',
          tags: entry.tags ?? ['retro'],
        });

        trade.journalEntryIds.push(journalId);

        // If it's a learning, also save to knowledge base
        if (entry.type === 'learning' && entry.content) {
          try {
            const kb = getKnowledgeBase();
            kb.create({
              title: entry.title ?? `Paper trade learning: ${trade.symbol}`,
              category: 'learnings',
              tags: ['paper-trade', trade.symbol.split('/')[0], ...(entry.tags ?? [])],
              content: `${entry.content}\n\n---\nSource: Paper trade ${trade.id}\nSymbol: ${trade.symbol}\nDirection: ${trade.direction}\nP&L: ${trade.realizedPnlPercent?.toFixed(1)}%\nDate: ${new Date().toISOString()}`,
              source: 'ai',
            });
          } catch {
            // Knowledge base write failure is non-critical
          }
        }
      }
    } catch {
      // Retrospective failure is non-critical
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private updateEquity(): void {
    const openPnl = this.state.openTrades.reduce((s, t) => s + t.unrealizedPnl, 0);
    this.state.currentEquity = this.state.virtualBalance + this.state.totalPnl + openPnl;

    if (this.state.currentEquity > this.state.peakEquity) {
      this.state.peakEquity = this.state.currentEquity;
    }

    // Max drawdown
    const drawdown = ((this.state.peakEquity - this.state.currentEquity) / this.state.peakEquity) * 100;
    if (drawdown > this.state.maxDrawdownPercent) {
      this.state.maxDrawdownPercent = drawdown;
    }

    this.emit({ type: 'stats_update', data: this.state, timestamp: Date.now() });
  }

  private async fetchCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    if (!isPhemexConfigured() || symbols.length === 0) return prices;

    try {
      const client = getPhemexClient();
      const results = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const ticker = await client.getTicker(symbol);
          return { symbol, price: ticker.last };
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          prices.set(result.value.symbol, result.value.price);
        }
      }
    } catch {
      // Price fetch failure
    }

    return prices;
  }

  private addJournalEntry(params: {
    type: AIJournalType;
    mood: JournalMood;
    title: string;
    content: string;
    thinking?: string;
    symbol?: string;
    thesisId?: string;
    paperTradeId?: string;
    confidence?: number;
    agent: string;
    tags: string[];
  }): string {
    const entry: AIJournalEntry = {
      id: `j-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: params.type,
      mood: params.mood,
      timestamp: Date.now(),
      title: params.title,
      content: params.content,
      thinking: params.thinking,
      symbol: params.symbol,
      thesisId: params.thesisId,
      paperTradeId: params.paperTradeId,
      agent: params.agent,
      confidence: params.confidence,
      tags: params.tags,
    };

    this.journal.push(entry);

    // Keep journal at reasonable size (last 500 entries)
    if (this.journal.length > 500) {
      this.journal = this.journal.slice(-500);
    }

    this.emit({ type: 'journal', data: entry, timestamp: Date.now() });
    return entry.id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseJsonArray<T>(text: string): T[] {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]) as T[];
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  private emit(event: PaperTradingEvent): void {
    for (const cb of this.eventCallbacks) {
      try { cb(event); } catch { /* swallow */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------
interface ThinkCycleOutput {
  type?: AIJournalType;
  mood?: JournalMood;
  title?: string;
  content?: string;
  thinking?: string;
  symbol?: string;
  thesisId?: string;
  confidence?: number;
  tags?: string[];
  action?: {
    type: 'open' | 'close' | 'adjust';
    symbol?: string;
    direction?: 'long' | 'short';
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    leverage?: number;
    positionSizePercent?: number;
    thesisId?: string;
    tradeId?: string;
    reason?: ResearchPaperTrade['exitReason'];
    newStopLoss?: number;
    newTakeProfit?: number;
  } | null;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let paperEngine: PaperTradingEngine | null = null;

export function getPaperTradingEngine(): PaperTradingEngine | null {
  return paperEngine;
}

export function createPaperTradingEngine(virtualBalance?: number): PaperTradingEngine {
  if (paperEngine) {
    paperEngine.stop();
  }
  paperEngine = new PaperTradingEngine(virtualBalance);
  return paperEngine;
}

export function stopPaperTradingEngine(): void {
  paperEngine?.stop();
  paperEngine = null;
}
