// ============================================================================
// PhantomX — Portfolio Heartbeat Engine
// Multi-symbol autonomous AI portfolio manager
// Scans watchlist, ranks opportunities, manages full portfolio allocation
// ============================================================================

import { query } from '@anthropic-ai/claude-agent-sdk';
import { ensureOAuthEnv, getClaudeCodePath } from './credentials';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';
import { triggerKillSwitch } from '@/lib/kill-switch';
import { renderChartFromOHLCV, type OHLCVRow } from '@/lib/chart/server-renderer';
import { getOrchestrator } from '@/lib/agents/agent-orchestrator';
import { getKnowledgeBase } from '@/lib/agents/knowledge-base';
import { logIntervention, getInterventionSummary } from './intervention-logger';
import type {
  PortfolioHeartbeatConfig,
  PortfolioHeartbeatEvent,
  PortfolioHeartbeatEventType,
  PortfolioSnapshot,
  PortfolioPosition,
  PortfolioTradeAction,
  AutopilotClosedTrade,
  AutopilotPnlSummary,
  OrderSide,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// System Prompt — Portfolio Manager Persona
// ---------------------------------------------------------------------------
const PORTFOLIO_SYSTEM_PROMPT = `You are PhantomX — the AI brain powering an autonomous crypto trading platform on Phemex. Right now you are running in autonomous portfolio mode on a heartbeat timer. Every decision you make here is YOUR decision — you own it. When the user asks you about positions in chat, these are YOUR positions that YOU opened. First person always.

## Your Mandate
You manage the ENTIRE portfolio. Your sole objective is to grow total portfolio value over time.
You have NO allegiance to any particular token — every tick, you evaluate the full landscape and decide:
- Which positions to hold, grow, trim, or close
- Which new opportunities warrant capital allocation
- How to balance risk across the portfolio
- When to sit in cash and wait

## Portfolio Management Principles
1. **Diversification** — Don't concentrate too much in any single position unless conviction is extremely high
2. **Opportunity cost** — Always ask "is there something better?" before holding a losing position
3. **Cash is a position** — Sitting in USDT is a deliberate, valid choice when no good setups exist
4. **Relative strength** — Prefer tokens showing relative strength vs the market
5. **Rotation** — If a token is underperforming, consider rotating capital into a stronger setup
6. **Close losers fast, let winners run** — Asymmetric risk management

## Decision Framework
Each tick you receive:
- **Candlestick chart images** for the top-ranked symbols (you can SEE the charts visually — look for patterns, support/resistance, trend structure, candlestick formations)
- Watchlist ticker data with quick indicators (all symbols)
- Detailed OHLCV + technical indicators for the top-ranked symbols
- Current portfolio: all positions with allocation %, PnL, entry prices
- Account balance, available cash, daily PnL
- Risk parameters and portfolio constraints

## Chart Analysis — USE YOUR VISION
You receive real candlestick chart images. ALWAYS analyze them visually:
- Identify chart patterns (double bottoms, head & shoulders, flags, wedges, cup & handle)
- Spot support/resistance levels from price action
- Read SMA crossovers and trend direction from the overlay lines
- Assess momentum from candlestick body sizes and wick patterns
- Note volume patterns (increasing/decreasing, spikes)
- Reference what you see in the charts in your analysis — "I can see a bull flag forming on SOL" etc.

## Response Format — CRITICAL
Respond with a JSON block wrapped in \`\`\`json ... \`\`\`:

\`\`\`json
{
  "analysis": "1-2 sentence overall market read",
  "portfolioAssessment": "Current portfolio health / balance assessment",
  "reasoning": "Detailed reasoning for your decisions (2-4 sentences). Explain what you looked at, why, and what drove your conclusion.",
  "confidence": 75,
  "actions": [
    {
      "action": "buy|sell|close|hold|adjust_sl|adjust_tp|rotate",
      "symbol": "SOL/USDT:USDT",
      "reason": "Why this specific action on this specific token",
      "confidence": 85,
      "allocationPercent": 15,
      "entryPrice": 178.50,
      "stopLoss": 174.20,
      "takeProfit": 189.00,
      "leverage": 5,
      "urgency": "immediate|wait_for_confirmation|low",
      "closeSymbol": "DOGE/USDT:USDT"
    }
  ]
}
\`\`\`

## Action Types
- **hold** — No action. Most ticks should be hold.
- **buy** — Open a long position. Must include stopLoss, allocationPercent.
- **sell** — Open a short position. Must include stopLoss, allocationPercent.
- **close** — Close an existing position entirely.
- **adjust_sl** / **adjust_tp** — Move stop-loss or take-profit on existing position.
- **rotate** — Close one position (closeSymbol) and open a new one (symbol) in a single decision.

## Rules
1. "hold" is the safe default — only trade on clear setups with proper risk management
2. Think in allocation % not dollar amounts — "put 15% in SOL" not "$500 in SOL"
3. Never violate portfolio constraints (max allocation per token, max total exposure, min cash reserve)
4. Always include stopLoss on new entries
5. Consider correlation — avoid overweighting correlated assets (e.g., BTC + ETH = ~same trade)
6. If daily loss limit is approaching, get conservative or go full cash
7. Be explicit in your reasoning — explain what indicators, patterns, or price action drove each decision`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type EventCallback = (event: PortfolioHeartbeatEvent) => void;

interface Phase1Result {
  tickers: Record<string, {
    symbol: string;
    last: number;
    changePercent24h: number;
    volume24h: number;
    bid: number;
    ask: number;
    high24h: number;
    low24h: number;
  }>;
  quickIndicators: Record<string, {
    momentum: number;
    volatility: number;
    volumeScore: number;
    compositeScore: number;
  }>;
  rankings: Array<{ symbol: string; score: number; changePercent: number }>;
}

interface Phase2Result {
  detailedSymbols: Record<string, {
    candles: Array<{ time: string; o: number; h: number; l: number; c: number; v: number }>;
    rawOhlcv: OHLCVRow[];
    sma7Array: number[];
    sma20Array: number[];
    sma50Array: number[];
    rsi14: number | null;
    sma7: number | null;
    sma20: number | null;
    sma50: number | null;
    volumeTrend: number;
    atr14: number | null;
    smaSignal: string;
  }>;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
export class PortfolioHeartbeatEngine {
  private config: PortfolioHeartbeatConfig;
  private listeners: Set<EventCallback> = new Set();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private tickLock: Promise<void> = Promise.resolve();
  private tickCount = 0;
  private dailyStartEquity = 0;
  private isKilled = false;
  private lastPortfolio: PortfolioSnapshot | null = null;
  private actionHistory: Array<{ action: string; symbol: string; timestamp: number; result: string }> = [];
  private closedTrades: AutopilotClosedTrade[] = [];
  private cumulativeRealizedPnl = 0;
  private sessionStartEquity = 0;

  constructor(config: PortfolioHeartbeatConfig) {
    this.config = config;
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    if (this.isRunning) return;

    if (!isPhemexConfigured()) {
      throw new Error('PhemexClient not initialized. Connect to Phemex first.');
    }

    ensureOAuthEnv();
    this.isRunning = true;
    this.isKilled = false;
    this.tickCount = 0;
    this.actionHistory = [];
    this.closedTrades = [];
    this.cumulativeRealizedPnl = 0;

    try {
      const client = getPhemexClient();
      const account = await client.getAccountInfo();
      this.dailyStartEquity = account.totalUsdValue;
      this.sessionStartEquity = account.totalUsdValue;
    } catch {
      this.dailyStartEquity = 0;
      this.sessionStartEquity = 0;
    }

    this.emit({
      type: 'status',
      tick: 0,
      data: {
        status: 'started',
        mode: 'portfolio',
        interval: this.config.intervalMs,
        symbols: this.config.symbols,
        scanMode: this.config.scanMode,
      },
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
      tick: this.tickCount,
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
      portfolio: this.lastPortfolio,
      actionHistory: this.actionHistory.slice(-20),
      pnlSummary: this.getPnlSummary(),
      config: this.config,
    };
  }

  getPnlSummary(): AutopilotPnlSummary {
    const wins = this.closedTrades.filter(t => t.realizedPnl > 0);
    const losses = this.closedTrades.filter(t => t.realizedPnl <= 0);
    const currentEquity = this.lastPortfolio?.totalEquity ?? this.sessionStartEquity;

    return {
      cumulativeRealizedPnl: this.cumulativeRealizedPnl,
      closedTradeCount: this.closedTrades.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate: this.closedTrades.length > 0 ? (wins.length / this.closedTrades.length) * 100 : 0,
      avgWin: wins.length > 0 ? wins.reduce((s, t) => s + t.realizedPnl, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? losses.reduce((s, t) => s + t.realizedPnl, 0) / losses.length : 0,
      bestTrade: this.closedTrades.length > 0 ? this.closedTrades.reduce((best, t) => t.realizedPnl > best.realizedPnl ? t : best) : null,
      worstTrade: this.closedTrades.length > 0 ? this.closedTrades.reduce((worst, t) => t.realizedPnl < worst.realizedPnl ? t : worst) : null,
      sessionStartEquity: this.sessionStartEquity,
      currentEquity,
      totalReturnPercent: this.sessionStartEquity > 0 ? ((currentEquity - this.sessionStartEquity) / this.sessionStartEquity) * 100 : 0,
    };
  }

  getClosedTrades(): AutopilotClosedTrade[] {
    return [...this.closedTrades];
  }

  updateConfig(partial: Partial<PortfolioHeartbeatConfig>): void {
    Object.assign(this.config, partial);
    if (partial.intervalMs && this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = setInterval(() => this.tick(), this.config.intervalMs);
    }
  }

  // --- Events ---

  onEvent(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emit(event: PortfolioHeartbeatEvent): void {
    this.listeners.forEach(cb => {
      try { cb(event); } catch { /* listener error shouldn't crash engine */ }
    });
  }

  /** Emit a human-readable status message so the UI always knows what the engine is doing. */
  private emitStatus(message: string): void {
    this.emit({
      type: 'status' as PortfolioHeartbeatEventType,
      tick: this.tickCount,
      phase: 'scan',
      data: { status: 'working', message },
      timestamp: Date.now(),
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
        tick: this.tickCount,
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
      tick: this.tickCount,
      phase: 'scan',
      data: { tick: this.tickCount },
      timestamp: Date.now(),
    });

    try {
      // ── Step 1: Resolve watchlist ──
      this.emitStatus(`Resolving watchlist (${this.config.scanMode} mode)...`);
      const symbols = await this.resolveWatchlist();
      if (symbols.length === 0) {
        this.emit({ type: 'error', tick: this.tickCount, data: { error: 'Empty watchlist' }, timestamp: Date.now() });
        releaseLock!();
        return;
      }
      const shortSyms = symbols.map(s => s.replace('/USDT:USDT', ''));
      this.emitStatus(`Scanning ${symbols.length} symbols: ${shortSyms.slice(0, 8).join(', ')}${symbols.length > 8 ? '...' : ''}`);

      // ── Step 2: Phase 1 — fast scan + rank ──
      this.emitStatus(`Fetching tickers and ranking opportunities across ${symbols.length} markets...`);
      const phase1 = await this.phase1Scan(symbols);
      if (phase1.rankings.length > 0) {
        const top3 = phase1.rankings.slice(0, 3).map((r, i) =>
          `#${i + 1} ${r.symbol.replace('/USDT:USDT', '')} (score: ${r.score?.toFixed(0) ?? '?'})`
        ).join(', ');
        this.emitStatus(`Rankings: ${top3}. Evaluating top candidates...`);
      }

      // ── Step 3: Portfolio snapshot ──
      this.emitStatus('Building portfolio snapshot — checking positions, balances, allocation...');
      const portfolio = await this.buildPortfolioSnapshot();
      this.lastPortfolio = portfolio;

      const posLabels = portfolio.positions.length > 0
        ? portfolio.positions.map(p => `${p.side.toUpperCase()} ${p.symbol.replace('/USDT:USDT', '')} (${p.allocationPercent.toFixed(0)}%)`).join(', ')
        : 'No open positions';
      this.emitStatus(`Portfolio: $${portfolio.totalEquity.toFixed(2)} equity | ${portfolio.cashPercent.toFixed(0)}% cash | ${posLabels}`);

      // ── Step 4: Kill switch check ──
      this.emitStatus('Checking kill switch conditions (daily loss limit, drawdown)...');
      if (this.checkKillConditions(portfolio)) {
        releaseLock!();
        return;
      }
      this.emitStatus(`Kill switch clear — drawdown ${portfolio.dailyPnlPercent.toFixed(1)}% (limit: ${this.config.maxDailyLossPercent}%)`);

      // Emit portfolio state
      this.emit({
        type: 'portfolio_update',
        tick: this.tickCount,
        phase: 'scan',
        data: {
          totalEquity: portfolio.totalEquity,
          cashPercent: portfolio.cashPercent,
          dailyPnlPercent: portfolio.dailyPnlPercent,
          cumulativeRealizedPnl: this.cumulativeRealizedPnl,
          closedTradeCount: this.closedTrades.length,
          winRate: this.closedTrades.length > 0 ? (this.closedTrades.filter(t => t.realizedPnl > 0).length / this.closedTrades.length) * 100 : 0,
          sessionStartEquity: this.sessionStartEquity,
          positions: portfolio.positions.map(p => ({
            symbol: p.symbol,
            side: p.side,
            allocationPercent: p.allocationPercent,
            unrealizedPnl: p.unrealizedPnl,
          })),
        },
        timestamp: Date.now(),
      });

      // Push portfolio value to Nexus (best effort, non-blocking)
      this.pushToNexus(portfolio);

      // ── Step 5: Phase 2 — deep analysis on top candidates ──
      const topSymbols = phase1.rankings.slice(0, 3).map(r => r.symbol);
      const topShort = topSymbols.map(s => s.replace('/USDT:USDT', ''));
      this.emitStatus(`Generating 4H charts for ${topShort.join(', ')} — running technical analysis...`);
      const phase2 = await this.phase2Analyze(topSymbols);
      this.emitStatus(`Charts analyzed. Consulting knowledge base (${getKnowledgeBase().count()} entries, behavioral learnings)...`);

      // ── Step 6: AI reasoning ──
      this.emitStatus('Querying Claude — sending portfolio context, charts, learnings, and agent signals...');
      const { decision, thinking } = await this.queryAI(phase1, phase2, portfolio);

      if (thinking) {
        this.emit({
          type: 'thinking',
          tick: this.tickCount,
          phase: 'analyze',
          data: { thinking },
          timestamp: Date.now(),
        });
      }

      // ── Step 7: Analysis result ──
      const actionSummary = decision.actions.length > 0
        ? decision.actions.map(a => `${a.action.toUpperCase()} ${(a.symbol ?? '').replace('/USDT:USDT', '')}`).join(', ')
        : 'HOLD';
      this.emitStatus(`Decision: ${actionSummary} (${decision.confidence}% confidence). ${decision.actions.length === 0 || decision.actions.every(a => a.action === 'hold') ? 'No trades this tick.' : 'Executing...'}`);

      this.emit({
        type: 'analysis',
        tick: this.tickCount,
        phase: 'analyze',
        data: {
          analysis: decision.analysis,
          portfolioAssessment: decision.portfolioAssessment,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          actionsCount: decision.actions.length,
        },
        timestamp: Date.now(),
      });

      // ── Step 8: Execute actions ──
      for (const action of decision.actions) {
        if (action.action !== 'hold') {
          this.emitStatus(`Executing: ${action.action.toUpperCase()} ${(action.symbol ?? '').replace('/USDT:USDT', '')} — ${action.reason ?? 'AI decision'}`);
        }
        await this.executeAction(action, portfolio);
      }

      // 9. Final portfolio update after execution
      if (decision.actions.some(a => a.action !== 'hold')) {
        try {
          const updatedPortfolio = await this.buildPortfolioSnapshot();
          this.lastPortfolio = updatedPortfolio;
          this.emit({
            type: 'portfolio_update',
            tick: this.tickCount,
            phase: 'update',
            data: {
              totalEquity: updatedPortfolio.totalEquity,
              cashPercent: updatedPortfolio.cashPercent,
              dailyPnlPercent: updatedPortfolio.dailyPnlPercent,
              cumulativeRealizedPnl: this.cumulativeRealizedPnl,
              closedTradeCount: this.closedTrades.length,
              winRate: this.closedTrades.length > 0 ? (this.closedTrades.filter(t => t.realizedPnl > 0).length / this.closedTrades.length) * 100 : 0,
              sessionStartEquity: this.sessionStartEquity,
              totalReturnPercent: this.sessionStartEquity > 0 ? ((updatedPortfolio.totalEquity - this.sessionStartEquity) / this.sessionStartEquity) * 100 : 0,
              recentClosedTrades: this.closedTrades.slice(-5).map(t => ({
                symbol: t.symbol.replace('/USDT:USDT', ''),
                side: t.side,
                realizedPnl: t.realizedPnl,
                realizedPnlPercent: t.realizedPnlPercent,
              })),
              positions: updatedPortfolio.positions.map(p => ({
                symbol: p.symbol,
                side: p.side,
                allocationPercent: p.allocationPercent,
                unrealizedPnl: p.unrealizedPnl,
              })),
            },
            timestamp: Date.now(),
          });
        } catch { /* best effort */ }
      }

    } catch (err) {
      this.emit({
        type: 'error',
        tick: this.tickCount,
        data: { tick: this.tickCount, error: String(err) },
        timestamp: Date.now(),
      });
    } finally {
      releaseLock!();
    }
  }

  // --- Watchlist Resolution ---

  private async resolveWatchlist(): Promise<string[]> {
    if (this.config.scanMode === 'watchlist') {
      return this.config.symbols;
    }

    // Full scan mode: discover symbols dynamically
    return await this.discoverSymbols();
  }

  private async discoverSymbols(): Promise<string[]> {
    const client = getPhemexClient();
    const exchange = client.getExchange();
    const markets = await exchange.loadMarkets();

    const swapSymbols = Object.values(markets)
      .filter(m => m && m.swap && m.active && m.quote === 'USDT')
      .map(m => m!.symbol);

    // Batch fetch all tickers
    const allTickers = await exchange.fetchTickers(swapSymbols);

    // Filter by volume and activity
    const candidates = swapSymbols
      .map(sym => {
        const t = allTickers[sym];
        if (!t || !t.last || t.last <= 0) return null;
        const vol24h = (t.quoteVolume ?? 0) as number;
        return { symbol: sym, volume: vol24h, change: Math.abs(t.percentage ?? 0) };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.volume >= this.config.fullScanFilterMinVolume)
      .sort((a, b) => (b.volume * b.change) - (a.volume * a.change))
      .slice(0, this.config.fullScanTopN)
      .map(c => c.symbol);

    this.emit({
      type: 'scanning',
      tick: this.tickCount,
      phase: 'scan',
      data: {
        mode: 'full_scan',
        totalMarkets: swapSymbols.length,
        afterFilter: candidates.length,
        symbols: candidates,
      },
      timestamp: Date.now(),
    });

    return candidates;
  }

  // --- Phase 1: Fast Scan ---

  private async phase1Scan(symbols: string[]): Promise<Phase1Result> {
    const client = getPhemexClient();
    const exchange = client.getExchange();

    // Single batch call for all tickers
    const rawTickers = await exchange.fetchTickers(symbols);

    const tickers: Phase1Result['tickers'] = {};
    const quickIndicators: Phase1Result['quickIndicators'] = {};

    for (const sym of symbols) {
      const t = rawTickers[sym];
      if (!t || !t.last) continue;

      tickers[sym] = {
        symbol: sym,
        last: t.last,
        changePercent24h: t.percentage ?? 0,
        volume24h: (t.quoteVolume ?? 0) as number,
        bid: t.bid ?? t.last,
        ask: t.ask ?? t.last,
        high24h: t.high ?? t.last,
        low24h: t.low ?? t.last,
      };

      // Quick indicators from ticker data only (no OHLCV needed)
      const change = Math.abs(t.percentage ?? 0);
      const vol = (t.quoteVolume ?? 0) as number;
      const range = t.high && t.low ? ((t.high - t.low) / t.low) * 100 : 0;

      quickIndicators[sym] = {
        momentum: t.percentage ?? 0,
        volatility: range,
        volumeScore: Math.log10(Math.max(vol, 1)),
        compositeScore: change * Math.log10(Math.max(vol, 1)) * (range > 0 ? range : 1),
      };
    }

    // Rank by composite score
    const rankings = Object.entries(quickIndicators)
      .sort(([, a], [, b]) => b.compositeScore - a.compositeScore)
      .map(([sym, ind]) => ({
        symbol: sym,
        score: Math.round(ind.compositeScore * 100) / 100,
        changePercent: tickers[sym]?.changePercent24h ?? 0,
      }));

    this.emit({
      type: 'scanning',
      tick: this.tickCount,
      phase: 'scan',
      data: {
        mode: this.config.scanMode,
        scannedCount: symbols.length,
        tickers: Object.values(tickers).map(t => ({
          symbol: t.symbol.replace('/USDT:USDT', ''),
          price: t.last,
          change: t.changePercent24h,
          vol24h: t.volume24h,
        })),
      },
      timestamp: Date.now(),
    });

    this.emit({
      type: 'ranking',
      tick: this.tickCount,
      phase: 'rank',
      data: {
        rankings: rankings.slice(0, 10),
        topPicks: rankings.slice(0, 3).map(r => r.symbol.replace('/USDT:USDT', '')),
      },
      timestamp: Date.now(),
    });

    return { tickers, quickIndicators, rankings };
  }

  // --- Phase 2: Detailed Analysis ---

  private async phase2Analyze(symbols: string[]): Promise<Phase2Result> {
    const client = getPhemexClient();
    const detailedSymbols: Phase2Result['detailedSymbols'] = {};

    // Parallel OHLCV fetch for top symbols
    const results = await Promise.all(
      symbols.map(async (sym) => {
        try {
          const ohlcv = await client.getOHLCV(sym, '1h', 50);
          return { sym, ohlcv };
        } catch {
          return { sym, ohlcv: [] };
        }
      })
    );

    for (const { sym, ohlcv } of results) {
      if (ohlcv.length === 0) continue;

      const closes = ohlcv.map(c => c.close);
      const highs = ohlcv.map(c => c.high);
      const lows = ohlcv.map(c => c.low);

      const sma7 = closes.length >= 7 ? closes.slice(-7).reduce((s, p) => s + p, 0) / 7 : null;
      const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((s, p) => s + p, 0) / 20 : null;
      const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((s, p) => s + p, 0) / 50 : null;
      const rsi14 = this.calculateRSI(closes, 14);
      const atr14 = this.calculateATR(highs, lows, closes, 14);

      const recentVol = ohlcv.slice(-3).reduce((s, c) => s + c.volume, 0);
      const priorVol = ohlcv.slice(-6, -3).reduce((s, c) => s + c.volume, 0);
      const volumeTrend = priorVol > 0 ? ((recentVol - priorVol) / priorVol) * 100 : 0;

      let smaSignal = 'neutral';
      if (sma7 && sma20) smaSignal = sma7 > sma20 ? 'bullish' : 'bearish';

      // Compute full SMA arrays for chart overlay
      const sma7Arr = this.computeSMAArray(closes, 7);
      const sma20Arr = this.computeSMAArray(closes, 20);
      const sma50Arr = this.computeSMAArray(closes, 50);

      detailedSymbols[sym] = {
        candles: ohlcv.slice(-10).map(c => ({
          time: new Date(c.timestamp).toISOString().slice(11, 16),
          o: c.open, h: c.high, l: c.low, c: c.close, v: Math.round(c.volume),
        })),
        rawOhlcv: ohlcv.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        sma7Array: sma7Arr,
        sma20Array: sma20Arr,
        sma50Array: sma50Arr,
        rsi14, sma7, sma20, sma50, volumeTrend, atr14, smaSignal,
      };
    }

    return { detailedSymbols };
  }

  // --- Portfolio Snapshot ---

  private async buildPortfolioSnapshot(): Promise<PortfolioSnapshot> {
    const client = getPhemexClient();
    const [account, positions] = await Promise.all([
      client.getAccountInfo(),
      client.getPositions(), // No symbol = ALL positions
    ]);

    const totalEquity = account.totalUsdValue;
    const positionNotional = positions.reduce((sum, p) => sum + (p.size * p.markPrice), 0);
    const availableCash = Math.max(0, totalEquity - positionNotional);
    const dailyPnlPercent = this.dailyStartEquity > 0
      ? ((totalEquity - this.dailyStartEquity) / this.dailyStartEquity) * 100
      : 0;

    const portfolioPositions: PortfolioPosition[] = positions.map(p => ({
      symbol: p.symbol,
      side: p.side,
      size: p.size,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      notionalValue: p.size * p.markPrice,
      allocationPercent: totalEquity > 0 ? ((p.size * p.markPrice) / totalEquity) * 100 : 0,
      unrealizedPnl: p.unrealizedPnl,
      leverage: p.leverage,
      liquidationPrice: p.liquidationPrice,
    }));

    return {
      totalEquity,
      availableCash,
      cashPercent: totalEquity > 0 ? (availableCash / totalEquity) * 100 : 100,
      positions: portfolioPositions,
      totalUnrealizedPnl: positions.reduce((sum, p) => sum + p.unrealizedPnl, 0),
      dailyStartEquity: this.dailyStartEquity,
      dailyPnlPercent,
    };
  }

  // --- AI Query ---

  private async queryAI(
    phase1: Phase1Result,
    phase2: Phase2Result,
    portfolio: PortfolioSnapshot,
  ): Promise<{ decision: { analysis: string; portfolioAssessment: string; reasoning: string; confidence: number; actions: PortfolioTradeAction[] }; thinking: string }> {
    const prompt = this.buildPrompt(phase1, phase2, portfolio);
    const claudeCodePath = getClaudeCodePath();

    const queryOptions: Record<string, unknown> = {
      pathToClaudeCodeExecutable: claudeCodePath,
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 1,
      maxThinkingTokens: 16000,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: PORTFOLIO_SYSTEM_PROMPT,
      },
    };

    // Render candlestick chart images for top symbols (vision input)
    const chartImages: Array<{ symbol: string; base64: string }> = [];
    try {
      for (const [sym, data] of Object.entries(phase2.detailedSymbols)) {
        if (data.rawOhlcv.length >= 10) {
          const base64 = renderChartFromOHLCV(
            data.rawOhlcv,
            sym,
            '1h',
            {
              sma7: data.sma7Array,
              sma20: data.sma20Array,
              sma50: data.sma50Array,
              rsi14: data.rsi14 ?? undefined,
            },
          );
          if (base64) chartImages.push({ symbol: sym, base64 });
        }
      }
    } catch (err) {
      console.warn('[PhantomX] Chart rendering failed:', err);
    }

    // Build query input — multimodal (images + text) if charts available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryInput: any;

    if (chartImages.length > 0) {
      // Build content blocks: chart images first, then text prompt
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contentBlocks: any[] = [];
      for (const chart of chartImages) {
        contentBlocks.push({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: chart.base64,
          },
        });
      }
      contentBlocks.push({ type: 'text' as const, text: prompt });

      queryInput = {
        prompt: (async function* () {
          yield {
            type: 'user' as const,
            message: {
              role: 'user' as const,
              content: contentBlocks,
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
    for await (const message of query(queryInput as any)) {
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

    const decision = this.parseResponse(fullText);
    return { decision, thinking: thinkingText };
  }

  // --- Prompt Builder ---

  private buildPrompt(phase1: Phase1Result, phase2: Phase2Result, portfolio: PortfolioSnapshot): string {
    // Watchlist ticker summary (compact)
    const tickerTable = phase1.rankings.map(r => {
      const t = phase1.tickers[r.symbol];
      if (!t) return '';
      const shortSym = t.symbol.replace('/USDT:USDT', '');
      return `  ${shortSym.padEnd(8)} $${t.last.toPrecision(6).padEnd(12)} ${t.changePercent24h >= 0 ? '+' : ''}${t.changePercent24h.toFixed(2)}%  Vol: $${Math.round(t.volume24h).toLocaleString()}  Score: ${r.score}`;
    }).filter(Boolean).join('\n');

    // Detailed analysis for top symbols
    const detailedBlocks = Object.entries(phase2.detailedSymbols).map(([sym, data]) => {
      const shortSym = sym.replace('/USDT:USDT', '');
      const candleBlock = data.candles.map(c =>
        `    ${c.time} O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v}`
      ).join('\n');
      return `  --- ${shortSym} (Detailed) ---
  SMA7: ${data.sma7?.toFixed(4) ?? 'N/A'} | SMA20: ${data.sma20?.toFixed(4) ?? 'N/A'} | SMA50: ${data.sma50?.toFixed(4) ?? 'N/A'}
  Signal: ${data.smaSignal.toUpperCase()} | RSI(14): ${data.rsi14?.toFixed(1) ?? 'N/A'} | ATR(14): ${data.atr14?.toFixed(4) ?? 'N/A'}
  Volume Trend: ${data.volumeTrend > 0 ? '+' : ''}${data.volumeTrend.toFixed(1)}%
  Recent Candles (1h):
${candleBlock}`;
    }).join('\n\n');

    // Portfolio state
    const posBlock = portfolio.positions.length > 0
      ? portfolio.positions.map(p => {
          const shortSym = p.symbol.replace('/USDT:USDT', '');
          return `  ${p.side.toUpperCase().padEnd(6)} ${shortSym.padEnd(8)} ${p.allocationPercent.toFixed(1)}% alloc | ${p.size} @ $${p.entryPrice} → $${p.markPrice} | PnL: $${p.unrealizedPnl.toFixed(2)} | ${p.leverage}x`;
        }).join('\n')
      : '  No open positions';

    // Recent actions
    const recentActionsBlock = this.actionHistory.length > 0
      ? this.actionHistory.slice(-5).map(a =>
          `  [${new Date(a.timestamp).toISOString().slice(11, 16)}] ${a.action} ${a.symbol.replace('/USDT:USDT', '')}: ${a.result}`
        ).join('\n')
      : '  None yet';

    return `[PORTFOLIO HEARTBEAT TICK #${this.tickCount}] — ${new Date().toISOString()}
Mode: ${this.config.scanMode} | Risk: ${this.config.riskLevel} | Auto-trade: ${this.config.enableAutoTrade ? 'ON' : 'ADVISE ONLY'}

== PORTFOLIO CONSTRAINTS ==
Max per-token: ${this.config.maxPerTokenAllocationPercent}% | Max exposure: ${this.config.maxTotalExposurePercent}% | Min cash: ${this.config.minCashReservePercent}% | Max positions: ${this.config.maxOpenPositions}

== WATCHLIST SCAN (${Object.keys(phase1.tickers).length} tokens) ==
${tickerTable}

== TOP PICKS — DETAILED ANALYSIS ==
${detailedBlocks}

== CURRENT PORTFOLIO ==
Equity: $${portfolio.totalEquity.toFixed(2)} | Cash: $${portfolio.availableCash.toFixed(2)} (${portfolio.cashPercent.toFixed(1)}%)
Daily start: $${portfolio.dailyStartEquity.toFixed(2)} | Daily PnL: ${portfolio.dailyPnlPercent >= 0 ? '+' : ''}${portfolio.dailyPnlPercent.toFixed(2)}%
Unrealized PnL: $${portfolio.totalUnrealizedPnl.toFixed(2)}
Daily loss limit: ${this.config.maxDailyLossPercent}%

Positions:
${posBlock}

== MY TRACK RECORD (this session) ==
${this.closedTrades.length > 0
  ? `Closed trades: ${this.closedTrades.length} | Wins: ${this.closedTrades.filter(t => t.realizedPnl > 0).length} | Losses: ${this.closedTrades.filter(t => t.realizedPnl <= 0).length}
Cumulative realized PnL: $${this.cumulativeRealizedPnl.toFixed(2)}
Session start equity: $${this.sessionStartEquity.toFixed(2)} | Total return: ${this.sessionStartEquity > 0 ? (((portfolio.totalEquity - this.sessionStartEquity) / this.sessionStartEquity) * 100).toFixed(2) : '0.00'}%
Recent closes:
${this.closedTrades.slice(-5).map(t => `  ${t.symbol.replace('/USDT:USDT', '')} ${t.side} | PnL: $${t.realizedPnl.toFixed(2)} (${t.realizedPnlPercent >= 0 ? '+' : ''}${t.realizedPnlPercent.toFixed(2)}%) | ${t.reason}`).join('\n')}`
  : 'No closed trades yet this session. Session start equity: $' + this.sessionStartEquity.toFixed(2)}

== MY RECENT ACTIONS ==
${recentActionsBlock}

== SIGNAL INTELLIGENCE (Multi-Agent System) ==
${this.getSignalIntelligenceBlock()}

== KNOWLEDGE BASE ==
${this.getKnowledgeBlock()}

== BEHAVIORAL LEARNINGS ==
${this.getBehavioralLearningsBlock()}

== INTERVENTION TRACK RECORD ==
${getInterventionSummary()}

Analyze the full portfolio and market landscape. Consider the signal intelligence from all agents — their consensus, individual readings, and any divergence. What is your decision for this tick?
If your proposed action matches a documented behavioral pattern above, you MUST set intervention_matched=true in your response and either back off (hold) or override with explicit justification (intervention_override=true, intervention_learning_id, intervention_note).`;
  }

  // --- Signal Intelligence & Knowledge Helpers ---

  private getSignalIntelligenceBlock(): string {
    try {
      const orchestrator = getOrchestrator();
      if (!orchestrator || !orchestrator.isActive()) {
        return '  Agent system not running. Decisions based on market data only.';
      }
      return orchestrator.getSignalIntelligence();
    } catch {
      return '  Agent system unavailable.';
    }
  }

  private getKnowledgeBlock(): string {
    try {
      const kb = getKnowledgeBase();
      return kb.getPromptSummary(8);
    } catch {
      return '  Knowledge base unavailable.';
    }
  }

  private getBehavioralLearningsBlock(): string {
    try {
      const kb = getKnowledgeBase();
      return kb.getLearningsPromptBlock(10);
    } catch {
      return '  Learnings system unavailable.';
    }
  }

  // --- Response Parser ---

  private parseResponse(text: string): {
    analysis: string;
    portfolioAssessment: string;
    reasoning: string;
    confidence: number;
    actions: PortfolioTradeAction[];
  } {
    const defaultResult = {
      analysis: text.slice(0, 200),
      portfolioAssessment: '',
      reasoning: '',
      confidence: 0,
      actions: [{ action: 'hold' as const, symbol: '', reason: 'Could not parse response', confidence: 0, urgency: 'low' as const }],
    };

    // Extract JSON block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text.match(/\{[\s\S]*"actions"[\s\S]*\}/)?.[0];

    if (!jsonStr) return defaultResult;

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        analysis: parsed.analysis || text.slice(0, 200),
        portfolioAssessment: parsed.portfolioAssessment || '',
        reasoning: parsed.reasoning || '',
        confidence: parsed.confidence ?? 0,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      };
    } catch {
      return defaultResult;
    }
  }

  // --- Action Executor ---

  private async executeAction(action: PortfolioTradeAction, portfolio: PortfolioSnapshot): Promise<void> {
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
        symbol: action.symbol,
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
        tick: this.tickCount,
        phase: 'decide',
        data: { action: 'hold', symbol: action.symbol, reason: action.reason, confidence: action.confidence, interventionMatched: action.intervention_matched },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: 'hold',
        symbol: action.symbol || 'portfolio',
        timestamp: Date.now(),
        result: action.reason,
      });
      return;
    }

    // Confidence gate
    if (action.confidence < confidenceThreshold) {
      this.emit({
        type: 'trade_skipped',
        tick: this.tickCount,
        phase: 'decide',
        data: {
          action: action.action,
          symbol: action.symbol,
          reason: `Confidence ${action.confidence}% < threshold ${confidenceThreshold}% (${this.config.riskLevel})`,
          originalReason: action.reason,
        },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: `skip_${action.action}`,
        symbol: action.symbol,
        timestamp: Date.now(),
        result: `Confidence ${action.confidence}% too low`,
      });
      return;
    }

    // Portfolio constraint checks
    if (action.action === 'buy' || action.action === 'sell') {
      const targetAlloc = action.allocationPercent ?? this.config.maxPerTokenAllocationPercent;

      // Check max per-token allocation
      if (targetAlloc > this.config.maxPerTokenAllocationPercent) {
        this.emit({
          type: 'trade_skipped',
          tick: this.tickCount,
          phase: 'decide',
          data: {
            action: action.action,
            symbol: action.symbol,
            reason: `Allocation ${targetAlloc}% exceeds max ${this.config.maxPerTokenAllocationPercent}%`,
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Check max total exposure
      const currentExposure = 100 - portfolio.cashPercent;
      if (currentExposure + targetAlloc > this.config.maxTotalExposurePercent) {
        this.emit({
          type: 'trade_skipped',
          tick: this.tickCount,
          phase: 'decide',
          data: {
            action: action.action,
            symbol: action.symbol,
            reason: `Would exceed max exposure (${(currentExposure + targetAlloc).toFixed(1)}% > ${this.config.maxTotalExposurePercent}%)`,
          },
          timestamp: Date.now(),
        });
        return;
      }

      // Check max open positions
      if (portfolio.positions.length >= this.config.maxOpenPositions) {
        const existingPos = portfolio.positions.find(p => p.symbol === action.symbol);
        if (!existingPos) {
          this.emit({
            type: 'trade_skipped',
            tick: this.tickCount,
            phase: 'decide',
            data: {
              action: action.action,
              symbol: action.symbol,
              reason: `Max positions reached (${portfolio.positions.length}/${this.config.maxOpenPositions})`,
            },
            timestamp: Date.now(),
          });
          return;
        }
      }

      // Check min cash reserve
      if (portfolio.cashPercent - targetAlloc < this.config.minCashReservePercent) {
        this.emit({
          type: 'trade_skipped',
          tick: this.tickCount,
          phase: 'decide',
          data: {
            action: action.action,
            symbol: action.symbol,
            reason: `Would breach min cash reserve (${(portfolio.cashPercent - targetAlloc).toFixed(1)}% < ${this.config.minCashReservePercent}%)`,
          },
          timestamp: Date.now(),
        });
        return;
      }
    }

    // Urgency gate
    if (action.urgency === 'wait_for_confirmation' && ['conservative', 'moderate'].includes(this.config.riskLevel)) {
      this.emit({
        type: 'trade_skipped',
        tick: this.tickCount,
        phase: 'decide',
        data: { action: action.action, symbol: action.symbol, reason: 'Waiting for confirmation (non-aggressive mode)' },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: `wait_${action.action}`,
        symbol: action.symbol,
        timestamp: Date.now(),
        result: 'Waiting for confirmation',
      });
      return;
    }

    // Advise-only mode
    if (!this.config.enableAutoTrade) {
      this.emit({
        type: 'action',
        tick: this.tickCount,
        phase: 'decide',
        data: {
          action: action.action,
          symbol: action.symbol,
          reason: action.reason,
          confidence: action.confidence,
          allocationPercent: action.allocationPercent,
          stopLoss: action.stopLoss,
          takeProfit: action.takeProfit,
          autoTradeDisabled: true,
        },
        timestamp: Date.now(),
      });

      // Emit sizing details even in advise mode
      this.emit({
        type: 'sizing',
        tick: this.tickCount,
        phase: 'decide',
        data: {
          symbol: action.symbol,
          allocationPercent: action.allocationPercent,
          estimatedUsd: portfolio.totalEquity * ((action.allocationPercent ?? 0) / 100),
          stopLoss: action.stopLoss,
          takeProfit: action.takeProfit,
          leverage: action.leverage,
          adviseOnly: true,
        },
        timestamp: Date.now(),
      });

      this.actionHistory.push({
        action: `advise_${action.action}`,
        symbol: action.symbol,
        timestamp: Date.now(),
        result: `${action.reason} (advise only)`,
      });
      return;
    }

    // --- EXECUTE TRADE ---
    try {
      const client = getPhemexClient();

      if (action.action === 'rotate' && action.closeSymbol) {
        // Close the old position first
        const closePos = portfolio.positions.find(p => p.symbol === action.closeSymbol);
        if (closePos) {
          const closeSide: OrderSide = closePos.side === 'long' ? 'sell' : 'buy';
          await client.createOrder(action.closeSymbol, 'market', closeSide, closePos.size);

          // Record closed trade PnL
          this.recordClosedTrade(closePos, `Rotating into ${action.symbol}`);

          this.emit({
            type: 'trade_executed',
            tick: this.tickCount,
            phase: 'execute',
            data: {
              action: 'close_for_rotate',
              symbol: action.closeSymbol,
              size: closePos.size,
              reason: `Rotating into ${action.symbol}`,
              realizedPnl: closePos.unrealizedPnl,
              cumulativePnl: this.cumulativeRealizedPnl,
            },
            timestamp: Date.now(),
          });
        }
      }

      if (action.action === 'buy' || action.action === 'sell' || action.action === 'rotate') {
        const side: OrderSide = (action.action === 'sell') ? 'sell' : 'buy';
        const allocPercent = Math.min(action.allocationPercent ?? 10, this.config.maxPerTokenAllocationPercent);
        const positionUsd = portfolio.totalEquity * (allocPercent / 100);

        // Need current price for sizing
        const ticker = await client.getTicker(action.symbol);
        const price = ticker.last;
        const amount = positionUsd / price;

        // Set leverage
        if (action.leverage) {
          await client.setLeverage(action.symbol, action.leverage).catch(() => {});
        }

        // Main order
        const order = await client.createOrder(action.symbol, 'market', side, amount);

        // Stop loss
        if (action.stopLoss) {
          await client.createOrder(
            action.symbol, 'stop', side === 'buy' ? 'sell' : 'buy', amount,
            undefined, { stopPrice: action.stopLoss, reduceOnly: true }
          ).catch(err => {
            this.emit({ type: 'error', tick: this.tickCount, data: { error: `SL failed: ${err}` }, timestamp: Date.now() });
          });
        }

        // Take profit
        if (action.takeProfit) {
          await client.createOrder(
            action.symbol, 'limit', side === 'buy' ? 'sell' : 'buy', amount,
            action.takeProfit, { reduceOnly: true }
          ).catch(err => {
            this.emit({ type: 'error', tick: this.tickCount, data: { error: `TP failed: ${err}` }, timestamp: Date.now() });
          });
        }

        this.emit({
          type: 'trade_executed',
          tick: this.tickCount,
          phase: 'execute',
          data: {
            action: action.action,
            symbol: action.symbol,
            side,
            amount,
            price,
            allocationPercent: allocPercent,
            orderId: order.id,
            stopLoss: action.stopLoss,
            takeProfit: action.takeProfit,
            leverage: action.leverage,
            confidence: action.confidence,
            reason: action.reason,
          },
          timestamp: Date.now(),
        });

        this.emit({
          type: 'sizing',
          tick: this.tickCount,
          phase: 'execute',
          data: {
            symbol: action.symbol,
            allocationPercent: allocPercent,
            positionUsd,
            amount,
            price,
            leverage: action.leverage,
          },
          timestamp: Date.now(),
        });

        this.actionHistory.push({
          action: action.action,
          symbol: action.symbol,
          timestamp: Date.now(),
          result: `${side.toUpperCase()} ${amount.toFixed(4)} @ $${price} (${allocPercent}% alloc)`,
        });

      } else if (action.action === 'close') {
        const pos = portfolio.positions.find(p => p.symbol === action.symbol);
        if (!pos) {
          this.emit({
            type: 'trade_skipped',
            tick: this.tickCount,
            phase: 'execute',
            data: { action: 'close', symbol: action.symbol, reason: 'No position found' },
            timestamp: Date.now(),
          });
          return;
        }

        const closeSide: OrderSide = pos.side === 'long' ? 'sell' : 'buy';
        const order = await client.createOrder(action.symbol, 'market', closeSide, pos.size);

        // Record closed trade PnL
        this.recordClosedTrade(pos, action.reason);

        this.emit({
          type: 'trade_executed',
          tick: this.tickCount,
          phase: 'execute',
          data: {
            action: 'close',
            symbol: action.symbol,
            side: closeSide,
            amount: pos.size,
            realizedPnl: pos.unrealizedPnl,
            realizedPnlPercent: pos.entryPrice > 0 ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'long' ? 1 : -1) : 0,
            cumulativePnl: this.cumulativeRealizedPnl,
            orderId: order.id,
            reason: action.reason,
          },
          timestamp: Date.now(),
        });

        this.actionHistory.push({
          action: 'close',
          symbol: action.symbol,
          timestamp: Date.now(),
          result: `Closed ${pos.side} ${pos.size} | PnL: $${pos.unrealizedPnl.toFixed(2)} | Cumul: $${this.cumulativeRealizedPnl.toFixed(2)}`,
        });

      } else if (action.action === 'adjust_sl' || action.action === 'adjust_tp') {
        const pos = portfolio.positions.find(p => p.symbol === action.symbol);
        if (!pos) return;

        await client.cancelAllOrders(action.symbol).catch(() => {});
        const closeSide: OrderSide = pos.side === 'long' ? 'sell' : 'buy';

        if (action.action === 'adjust_sl' && action.stopLoss) {
          await client.createOrder(action.symbol, 'stop', closeSide, pos.size, undefined, { stopPrice: action.stopLoss, reduceOnly: true });
        }
        if (action.action === 'adjust_tp' && action.takeProfit) {
          await client.createOrder(action.symbol, 'limit', closeSide, pos.size, action.takeProfit, { reduceOnly: true });
        }

        this.emit({
          type: 'trade_executed',
          tick: this.tickCount,
          phase: 'execute',
          data: { action: action.action, symbol: action.symbol, stopLoss: action.stopLoss, takeProfit: action.takeProfit, reason: action.reason },
          timestamp: Date.now(),
        });

        this.actionHistory.push({
          action: action.action,
          symbol: action.symbol,
          timestamp: Date.now(),
          result: `Adjusted to SL:$${action.stopLoss ?? 'N/A'} TP:$${action.takeProfit ?? 'N/A'}`,
        });
      }

    } catch (err) {
      this.emit({
        type: 'error',
        tick: this.tickCount,
        data: { action: action.action, symbol: action.symbol, error: String(err) },
        timestamp: Date.now(),
      });
      this.actionHistory.push({
        action: `error_${action.action}`,
        symbol: action.symbol,
        timestamp: Date.now(),
        result: String(err),
      });
    }
  }

  // --- Nexus Integration ---

  private async pushToNexus(portfolio: PortfolioSnapshot): Promise<void> {
    try {
      await fetch('http://localhost:3777/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'context',
          key: 'phantomx-portfolio-value',
          value: JSON.stringify({
            value: portfolio.totalEquity,
            availableCash: portfolio.availableCash,
            cashPercent: portfolio.cashPercent,
            unrealizedPnl: portfolio.totalUnrealizedPnl,
            dailyPnlPercent: portfolio.dailyPnlPercent,
            realizedPnl: this.cumulativeRealizedPnl,
            closedTrades: this.closedTrades.length,
            winRate: this.closedTrades.length > 0 ? (this.closedTrades.filter(t => t.realizedPnl > 0).length / this.closedTrades.length) * 100 : 0,
            positions: portfolio.positions.map(p => ({
              symbol: p.symbol.replace('/USDT:USDT', ''),
              side: p.side,
              allocationPercent: p.allocationPercent,
              unrealizedPnl: p.unrealizedPnl,
            })),
            tick: this.tickCount,
            autopilotRunning: this.isRunning,
            timestamp: Date.now(),
          }),
          sourceProject: 'PhantomX',
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Nexus not running — silently ignore
    }
  }

  // --- PnL Tracking ---

  private recordClosedTrade(pos: PortfolioPosition, reason: string): void {
    const leverage = pos.leverage || 1;
    const pnlPercent = pos.entryPrice > 0
      ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * leverage * (pos.side === 'long' ? 1 : -1)
      : 0;

    const closedTrade: AutopilotClosedTrade = {
      id: `ct-${Date.now()}-${this.closedTrades.length}`,
      symbol: pos.symbol,
      side: pos.side,
      size: pos.size,
      entryPrice: pos.entryPrice,
      exitPrice: pos.markPrice,
      realizedPnl: pos.unrealizedPnl,
      realizedPnlPercent: pnlPercent,
      leverage: pos.leverage,
      holdDuration: 0, // not tracked at position level
      closedAt: Date.now(),
      reason,
      tick: this.tickCount,
    };

    this.closedTrades.push(closedTrade);
    this.cumulativeRealizedPnl += pos.unrealizedPnl;
  }

  // --- Kill Switch ---

  private checkKillConditions(portfolio: PortfolioSnapshot): boolean {
    if (this.dailyStartEquity <= 0) return false;

    const dailyLossPercent = ((this.dailyStartEquity - portfolio.totalEquity) / this.dailyStartEquity) * 100;

    if (dailyLossPercent >= this.config.maxDailyLossPercent) {
      this.isKilled = true;
      // CRIT-11: Persist kill switch globally so it survives restarts
      triggerKillSwitch(`daily_loss_limit: ${dailyLossPercent.toFixed(2)}% (limit: ${this.config.maxDailyLossPercent}%)`);
      this.emit({
        type: 'kill_triggered',
        tick: this.tickCount,
        data: {
          reason: 'daily_loss_limit',
          dailyLossPercent: dailyLossPercent.toFixed(2),
          limit: this.config.maxDailyLossPercent,
          equity: portfolio.totalEquity,
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

  // --- Technical Indicators ---

  private calculateRSI(prices: number[], period: number): number | null {
    if (prices.length < period + 1) return null;

    const changes = prices.slice(-(period + 1)).map((p, i, arr) =>
      i > 0 ? p - arr[i - 1] : 0
    ).slice(1);

    const gains = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));

    const avgGain = gains.length > 0 ? gains.reduce((s, g) => s + g, 0) / period : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, l) => s + l, 0) / period : 0;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateATR(highs: number[], lows: number[], closes: number[], period: number): number | null {
    if (highs.length < period + 1) return null;

    const trueRanges: number[] = [];
    for (let i = highs.length - period; i < highs.length; i++) {
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(hl, hc, lc));
    }

    return trueRanges.reduce((s, tr) => s + tr, 0) / period;
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
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let portfolioEngine: PortfolioHeartbeatEngine | null = null;

export function getPortfolioHeartbeatEngine(): PortfolioHeartbeatEngine | null {
  return portfolioEngine;
}

export function createPortfolioHeartbeatEngine(config: PortfolioHeartbeatConfig): PortfolioHeartbeatEngine {
  if (portfolioEngine?.isActive()) {
    portfolioEngine.stop();
  }
  portfolioEngine = new PortfolioHeartbeatEngine(config);
  return portfolioEngine;
}

export function stopPortfolioHeartbeatEngine(): void {
  portfolioEngine?.stop();
  portfolioEngine = null;
}
