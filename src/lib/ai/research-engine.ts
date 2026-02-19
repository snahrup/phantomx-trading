// ============================================================================
// PhantomX — Background Research Engine
// ============================================================================
// Continuously running AI intelligence engine that accumulates market
// research, trading theses, and event analysis in the background.
// When the user is ready to trade, there's a deep bench of pre-researched,
// evidence-backed strategies waiting — no last-minute scrambling.
//
// Three research cycles run on staggered intervals:
//   Quick Scan  (10 min) — Market overview, top movers, news pulse
//   Deep Dive   (30 min) — Full technical + fundamental on top opportunities
//   Thesis Gen  (60 min) — Synthesize everything into concrete trading theses
// ============================================================================

import { queuedQuery } from './query-queue';
import { getPhantomXMcpServer } from './phantomx-mcp-tools';
import { getOrchestrator } from '@/lib/agents/agent-orchestrator';
import { getKnowledgeBase } from '@/lib/agents/knowledge-base';
import { getSignalBus } from '@/lib/agents/signal-bus';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';
import type {
  ResearchEngineConfig,
  ResearchEngineStatus,
  ResearchEngineState,
  ResearchCycleType,
  ResearchFinding,
  TradingThesis,
  UpcomingMarketEvent,
  TopOpportunity,
  DecisionRecord,
  RiskLevel,
  OHLCV,
  Ticker,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG: ResearchEngineConfig = {
  quickScanIntervalMs: 10 * 60_000,      // 10 minutes
  deepDiveIntervalMs: 30 * 60_000,       // 30 minutes
  thesisIntervalMs: 60 * 60_000,         // 60 minutes
  maxTheses: 50,
  maxFindings: 200,
  maxEvents: 100,
  watchlistSymbols: [],
  riskProfile: 'aggressive',
  focusAreas: [],
};

// ---------------------------------------------------------------------------
// Event System
// ---------------------------------------------------------------------------
export interface ResearchEngineEvent {
  type: 'cycle_start' | 'cycle_complete' | 'finding' | 'thesis' | 'event'
    | 'status_change' | 'error';
  cycle?: ResearchCycleType;
  data: unknown;
  timestamp: number;
}

type EventCallback = (event: ResearchEngineEvent) => void;

// ---------------------------------------------------------------------------
// AI Query Helpers — MCP-equipped, multi-turn, cycle-specific
// ---------------------------------------------------------------------------

/** Quick scan: fast screening — Sonnet is fine here, saves Opus for decisions */
async function aiQueryQuickScan(prompt: string, signal?: AbortSignal): Promise<string> {
  return queuedQuery(prompt, RESEARCH_SYSTEM_PROMPT, {
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 3,
    thinking: { type: 'adaptive' },
    effort: 'high',
    priority: 'normal',
    label: 'research-quick-scan',
    mcpServers: { 'phantomx-trading': getPhantomXMcpServer() },
  }, signal);
}

/** Deep dive: thorough, 5 turns with tools for full multi-timeframe analysis */
async function aiQueryDeepDive(prompt: string, signal?: AbortSignal): Promise<string> {
  return queuedQuery(prompt, RESEARCH_SYSTEM_PROMPT, {
    model: 'claude-opus-4-6',
    fallbackModel: 'claude-sonnet-4-5-20250929',
    maxTurns: 5,
    thinking: { type: 'adaptive' },
    effort: 'max',
    priority: 'normal',
    label: 'research-deep-dive',
    mcpServers: { 'phantomx-trading': getPhantomXMcpServer() },
  }, signal);
}

/** Thesis generation: synthesis, 3 turns with tools for validation */
async function aiQueryThesis(prompt: string, signal?: AbortSignal): Promise<string> {
  return queuedQuery(prompt, RESEARCH_SYSTEM_PROMPT, {
    model: 'claude-opus-4-6',
    fallbackModel: 'claude-sonnet-4-5-20250929',
    maxTurns: 3,
    thinking: { type: 'adaptive' },
    effort: 'max',
    priority: 'normal',
    label: 'research-thesis-gen',
    mcpServers: { 'phantomx-trading': getPhantomXMcpServer() },
  }, signal);
}

// ---------------------------------------------------------------------------
// Research System Prompt
// ---------------------------------------------------------------------------
const RESEARCH_SYSTEM_PROMPT = `You are PhantomX Research — an institutional-grade autonomous intelligence engine for aggressive crypto trading on Phemex perpetual futures.

## Your Role
You are NOT chatting with anyone. You are an autonomous research agent running 24/7, hunting for alpha. Your findings and theses will be automatically fed to a paper trading engine for validation, then promoted to live trading. The quality of your analysis directly determines whether real money is made or lost.

## YOU HAVE TOOLS — USE THEM
You have access to PhantomX MCP tools. DO NOT GUESS AT DATA. You MUST call tools to get real-time information:
- **get_ticker** — Current price, 24h change, volume for any symbol
- **get_ohlcv** — OHLCV candles at any timeframe (1m, 5m, 15m, 1h, 4h, 1d)
- **get_order_book** — Live bid/ask depth, walls, imbalances
- **get_technical_analysis** — Full indicator suite (RSI, MACD, BBands, Stoch, ADX, ATR, OBV, SuperTrend, SMA/EMA crossovers)
- **get_market_sentiment** — Fear & Greed Index, trending coins, social momentum
- **get_agent_signals** — PhantomX's internal agent consensus signals
- **classify_market_regime** — ADX-based regime classification (trending/ranging/volatile)
- **query_knowledge** — Search the knowledge base for historical patterns and hard-won lessons
- **get_hard_constraints** — Trading rules that MUST NOT be violated
- **get_anti_patterns** — Known losing setups to avoid

If you produce analysis without calling tools for real data, your output is worthless speculation. ALWAYS ground your analysis in tool-fetched data.

## Quality Bar — Institutional Grade
- **NO GENERIC OBSERVATIONS.** "BTC is at a key level" is garbage. Every finding must be specific enough to trade: exact price, exact indicator value, exact timeframe, exact confluence.
- **MULTI-TIMEFRAME MANDATORY.** Never analyze a single timeframe. Check 1h + 4h + 1d minimum. Cross-timeframe confluence is what separates noise from signal.
- **QUANTIFY EVERYTHING.** Not "volume is high" — "volume 247% above 20-period average on 4h." Not "RSI is elevated" — "RSI 73.4 on 4h, 61.2 on 1d, diverging from price."
- **INDICATOR CONFLUENCE.** Single-indicator signals are weak. Require 3+ confirming indicators before any finding gets above 70% confidence.
- **CONTRARIAN ANALYSIS REQUIRED.** For every finding, identify what would invalidate it. If you can't, your finding is probably confirmation bias.
- **CONFIDENCE MUST BE EARNED.** 80%+ confidence requires: multi-timeframe alignment, 3+ indicator confluence, volume confirmation, favorable regime, no major contra-signals. Default to 55-65% unless evidence is overwhelming.

## Edge Patterns (User's Proven Alpha)
- **SMA Crossover Recovery**: New token dumps post-launch → slow recovery → 4h SMA 20/50 golden cross → confirmed by 1d crossover = high-probability moonshot. This is the #1 pattern.
- **Volume-Confirmed Breakouts**: Price breaks key level + volume 2x+ average = genuine move. Without volume = trap.
- **S/R Flips**: Previous resistance becoming support with retest = one of the strongest long signals.
- **Funding Rate Divergence**: Negative funding + rising price = shorts trapped = squeeze incoming.
- **ADX Regime Transitions**: ADX crossing above 25 from below = new trend starting. ADX > 40 = strong trend, don't fade it.

## Output
- Always respond with valid JSON (no markdown fences)
- Every finding must include tool-verified evidence
- Every thesis must be specific enough for immediate execution (exact entry, SL, TP)`;

// ---------------------------------------------------------------------------
// Research Engine Class
// ---------------------------------------------------------------------------
export class ResearchEngine {
  private config: ResearchEngineConfig;
  private state: ResearchEngineState = 'idle';
  private startedAt: number | null = null;
  private abortController: AbortController | null = null;

  // Timers
  private quickScanTimer: ReturnType<typeof setInterval> | null = null;
  private deepDiveTimer: ReturnType<typeof setInterval> | null = null;
  private thesisTimer: ReturnType<typeof setInterval> | null = null;

  // Accumulated research
  private findings: ResearchFinding[] = [];
  private theses: TradingThesis[] = [];
  private events: UpcomingMarketEvent[] = [];

  // Stats
  private totalQuickScans = 0;
  private totalDeepDives = 0;
  private totalThesesGenerated = 0;
  private lastQuickScan: number | null = null;
  private lastDeepDive: number | null = null;
  private lastThesisGen: number | null = null;
  private currentCycle: ResearchCycleType | null = null;
  private lastError: string | null = null;

  // Processing locks
  private quickScanLock = false;
  private deepDiveLock = false;
  private thesisLock = false;

  // Event callbacks
  private eventCallbacks: EventCallback[] = [];

  constructor(config?: Partial<ResearchEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.state === 'running') return;

    this.state = 'running';
    this.startedAt = Date.now();
    this.lastError = null;
    this.abortController = new AbortController();

    this.emit({ type: 'status_change', data: { state: 'running' }, timestamp: Date.now() });

    // Run first quick scan immediately
    this.runQuickScan();

    // Schedule staggered cycles
    this.quickScanTimer = setInterval(
      () => this.runQuickScan(),
      this.config.quickScanIntervalMs,
    );

    // Deep dive starts after 5 min (let quick scan populate first)
    setTimeout(() => {
      if (this.state !== 'running') return;
      this.runDeepDive();
      this.deepDiveTimer = setInterval(
        () => this.runDeepDive(),
        this.config.deepDiveIntervalMs,
      );
    }, 5 * 60_000);

    // Thesis generation starts after 15 min (need findings from scans first)
    setTimeout(() => {
      if (this.state !== 'running') return;
      this.runThesisGeneration();
      this.thesisTimer = setInterval(
        () => this.runThesisGeneration(),
        this.config.thesisIntervalMs,
      );
    }, 15 * 60_000);
  }

  stop(): void {
    this.state = 'idle';
    this.abortController?.abort();
    this.abortController = null;

    if (this.quickScanTimer) { clearInterval(this.quickScanTimer); this.quickScanTimer = null; }
    if (this.deepDiveTimer) { clearInterval(this.deepDiveTimer); this.deepDiveTimer = null; }
    if (this.thesisTimer) { clearInterval(this.thesisTimer); this.thesisTimer = null; }

    this.currentCycle = null;
    this.quickScanLock = false;
    this.deepDiveLock = false;
    this.thesisLock = false;

    this.emit({ type: 'status_change', data: { state: 'idle' }, timestamp: Date.now() });
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.emit({ type: 'status_change', data: { state: 'paused' }, timestamp: Date.now() });
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.emit({ type: 'status_change', data: { state: 'running' }, timestamp: Date.now() });
  }

  // -------------------------------------------------------------------------
  // Status & Data Access
  // -------------------------------------------------------------------------

  getStatus(): ResearchEngineStatus {
    return {
      state: this.state,
      startedAt: this.startedAt,
      lastQuickScan: this.lastQuickScan,
      lastDeepDive: this.lastDeepDive,
      lastThesisGen: this.lastThesisGen,
      totalQuickScans: this.totalQuickScans,
      totalDeepDives: this.totalDeepDives,
      totalThesesGenerated: this.totalThesesGenerated,
      totalFindings: this.findings.length,
      currentCycle: this.currentCycle,
      error: this.lastError,
    };
  }

  getFindings(): ResearchFinding[] {
    this.pruneExpired();
    return [...this.findings];
  }

  getTheses(): TradingThesis[] {
    this.pruneExpiredTheses();
    return [...this.theses];
  }

  getReadyTheses(): TradingThesis[] {
    return this.getTheses().filter(t => t.status === 'ready');
  }

  getEvents(): UpcomingMarketEvent[] {
    return [...this.events];
  }

  /**
   * Get the Top 10 Opportunities Board — constantly re-ranked from all
   * accumulated findings and theses. This is the "quick hits" view.
   */
  getTopOpportunities(count = 10): TopOpportunity[] {
    this.pruneExpired();
    this.pruneExpiredTheses();

    // Score each symbol across all findings and theses
    const symbolScores = new Map<string, {
      score: number;
      findingCount: number;
      highestConfidence: number;
      bestThesis: TradingThesis | null;
      tags: Set<string>;
      urgencyBoost: number;
    }>();

    // Score from findings
    for (const f of this.findings) {
      if (f.symbol === 'MARKET') continue;
      const entry = symbolScores.get(f.symbol) ?? {
        score: 0, findingCount: 0, highestConfidence: 0,
        bestThesis: null, tags: new Set(), urgencyBoost: 0,
      };

      entry.findingCount++;
      entry.score += f.confidence * 0.5; // findings contribute base score
      entry.tags.add(f.category);

      // Urgency multiplier
      const urgencyMult = f.urgency === 'critical' ? 4 : f.urgency === 'high' ? 2.5 : f.urgency === 'medium' ? 1.5 : 1;
      entry.urgencyBoost += urgencyMult;

      // Recency bonus (newer findings score higher)
      const ageMinutes = (Date.now() - f.timestamp) / 60_000;
      const recencyBonus = Math.max(0, 1 - ageMinutes / 120); // decays over 2 hours
      entry.score += recencyBonus * 20;

      if (f.confidence > entry.highestConfidence) {
        entry.highestConfidence = f.confidence;
      }

      symbolScores.set(f.symbol, entry);
    }

    // Boost from theses (theses carry much more weight — they're synthesized)
    for (const t of this.theses) {
      if (t.status !== 'ready') continue;
      const entry = symbolScores.get(t.symbol) ?? {
        score: 0, findingCount: 0, highestConfidence: 0,
        bestThesis: null, tags: new Set(), urgencyBoost: 0,
      };

      entry.score += t.confidence * 2; // thesis confidence worth 2x
      entry.score += t.riskRewardRatio * 20; // good R:R boosts ranking
      entry.score += t.supportingEvidence.length * 5; // more evidence = higher rank

      // Penalty for high contra evidence relative to supporting
      if (t.contraEvidence.length > t.supportingEvidence.length) {
        entry.score -= 15;
      }

      if (!entry.bestThesis || t.confidence > entry.bestThesis.confidence) {
        entry.bestThesis = t;
      }

      if (t.confidence > entry.highestConfidence) {
        entry.highestConfidence = t.confidence;
      }

      symbolScores.set(t.symbol, entry);
    }

    // Apply urgency boost
    for (const [, entry] of symbolScores) {
      entry.score += entry.urgencyBoost * 5;
    }

    // Sort by score and build top N
    const ranked = Array.from(symbolScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, count);

    return ranked.map(([symbol, data], idx): TopOpportunity => {
      const thesis = data.bestThesis;
      return {
        rank: idx + 1,
        symbol,
        score: Math.round(Math.min(100, data.score / 5)), // normalize to 0-100
        direction: thesis?.direction ?? 'neutral',
        headline: thesis?.title ?? `${symbol} — ${data.findingCount} active findings`,
        topReason: thesis?.thesis ?? `${data.findingCount} research findings point to opportunity`,
        riskRewardRatio: thesis?.riskRewardRatio ?? 0,
        confidence: data.highestConfidence,
        timeHorizon: thesis?.timeHorizon ?? 'day',
        proposedEntry: thesis?.proposedEntry ?? 0,
        proposedStopLoss: thesis?.proposedStopLoss ?? 0,
        proposedTakeProfit: thesis?.proposedTakeProfit ?? 0,
        findingCount: data.findingCount,
        thesisId: thesis?.id ?? null,
        lastUpdated: Date.now(),
        tags: Array.from(data.tags),
      };
    });
  }

  /** Get a prompt-ready summary of all accumulated research for the AI chat. */
  getResearchSummary(): string {
    const activeFindings = this.getFindings();
    const activeTheses = this.getReadyTheses();
    const upcomingEvents = this.events.filter(
      e => new Date(e.expectedDate).getTime() > Date.now()
    );

    if (activeFindings.length === 0 && activeTheses.length === 0) {
      return '  Research engine has not accumulated findings yet.';
    }

    const lines: string[] = [
      `  Research Engine Status: ${this.state} | ${activeFindings.length} findings | ${activeTheses.length} ready theses`,
      '',
    ];

    // Top theses
    if (activeTheses.length > 0) {
      lines.push('  === READY TRADING THESES ===');
      for (const thesis of activeTheses.slice(0, 5)) {
        lines.push(`  [${thesis.confidence}% conf] ${thesis.direction.toUpperCase()} ${thesis.symbol} — ${thesis.title}`);
        lines.push(`    ${thesis.thesis}`);
        lines.push(`    Entry: $${thesis.proposedEntry} | SL: $${thesis.proposedStopLoss} | TP: $${thesis.proposedTakeProfit} | R:R ${thesis.riskRewardRatio}:1`);
        lines.push(`    Evidence: ${thesis.supportingEvidence.slice(0, 3).join('; ')}`);
        lines.push(`    Against: ${thesis.contraEvidence.slice(0, 2).join('; ') || 'None identified'}`);
        lines.push('');
      }
    }

    // Top findings by urgency
    const urgentFindings = activeFindings
      .filter(f => f.urgency === 'high' || f.urgency === 'critical')
      .slice(0, 5);
    if (urgentFindings.length > 0) {
      lines.push('  === HIGH-PRIORITY FINDINGS ===');
      for (const f of urgentFindings) {
        lines.push(`  [${f.urgency.toUpperCase()}] ${f.symbol} — ${f.title}`);
        lines.push(`    ${f.summary}`);
        lines.push('');
      }
    }

    // Upcoming events
    if (upcomingEvents.length > 0) {
      lines.push('  === UPCOMING EVENTS ===');
      for (const evt of upcomingEvents.slice(0, 5)) {
        lines.push(`  [${evt.expectedImpact.toUpperCase()}] ${evt.expectedDate} — ${evt.title}`);
        lines.push(`    Impact: ${evt.impactAssessment}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  onEvent(callback: EventCallback): void {
    this.eventCallbacks.push(callback);
  }

  updateConfig(partial: Partial<ResearchEngineConfig>): void {
    Object.assign(this.config, partial);
  }

  // -------------------------------------------------------------------------
  // Quick Scan — Market Overview (runs every 10 min)
  // -------------------------------------------------------------------------

  private async runQuickScan(): Promise<void> {
    if (this.state !== 'running' || this.quickScanLock) return;
    this.quickScanLock = true;
    this.currentCycle = 'quick_scan';

    this.emit({ type: 'cycle_start', cycle: 'quick_scan', data: {}, timestamp: Date.now() });

    try {
      // Gather market data
      const marketData = await this.gatherMarketSnapshot();

      // Get agent signals
      const orchestrator = getOrchestrator();
      const signalIntel = orchestrator?.getSignalIntelligence() ?? 'No agent signals available.';

      // Build prompt — aggressive, tool-driven quick scan
      const prompt = `QUICK MARKET SCAN — Hunt for alpha across the crypto market RIGHT NOW.

## Pre-Fetched Snapshot (may be stale — USE TOOLS to verify anything interesting)
${marketData}

## Agent Intelligence
${signalIntel}

## MANDATORY TOOL CALLS
Before producing findings, you MUST:
1. Call **get_market_sentiment** to get the current Fear & Greed reading and trending coins
2. For ANY symbol showing > 3% move or unusual volume, call **get_technical_analysis** on the 4h timeframe
3. Call **classify_market_regime** for BTC to understand the macro regime

## What Makes a Finding WORTH REPORTING
- **Volume anomaly**: Volume > 200% of 20-period average on 4h = something is happening
- **Regime change**: ADX crossing 25 in either direction = new trend starting or ending
- **Multi-timeframe divergence**: Price making new high but RSI declining on 4h AND 1d = warning
- **SMA crossover**: 20/50 SMA cross on 4h confirmed by 1d alignment = high-priority setup
- **Funding rate extreme**: Funding rate > 0.1% or < -0.05% = crowded trade, potential squeeze
- **Correlation break**: Alt moving independently of BTC during a BTC range = alpha opportunity
- **Order book imbalance**: 3:1+ bid/ask ratio at key level = institutional interest

## What is NOT a Finding
- "BTC is consolidating" — that's a description, not a finding
- Anything that was true yesterday and will be true tomorrow
- Any observation without a specific number attached
- Any finding below 55% confidence — if you're not at least slightly confident, it's noise

Respond with a JSON array of 3-10 findings:
[
  {
    "category": "technical_setup|momentum_shift|volume_anomaly|sentiment_change|macro_event|whale_activity|funding_rate|correlation_break|regime_change|divergence",
    "symbol": "BTC/USDT:USDT",
    "title": "Specific, number-laden title (e.g. 'SOL volume 340% above avg as 4h RSI hits 72 — breakout imminent')",
    "summary": "3-4 sentence analysis with EXACT numbers from tool calls. What's happening, why it matters, what to watch.",
    "evidence": ["Tool-verified data point 1 with number", "Tool-verified data point 2 with number", "Indicator reading from get_technical_analysis"],
    "confidence": 68,
    "urgency": "low|medium|high|critical",
    "ttlMinutes": 60
  }
]

CONFIDENCE GUIDE: 55-64 = interesting signal worth watching, 65-74 = actionable setup forming, 75-84 = high-conviction setup, 85+ = rare, requires overwhelming multi-TF confluence.`;

      const response = await aiQueryQuickScan(prompt, this.abortController?.signal);
      const parsed = this.parseJsonArray<QuickScanFinding>(response);

      for (const item of parsed) {
        const finding: ResearchFinding = {
          id: `rf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          cycle: 'quick_scan',
          category: item.category ?? 'momentum_shift',
          symbol: item.symbol ?? 'MARKET',
          title: item.title ?? 'Untitled finding',
          summary: item.summary ?? '',
          evidence: item.evidence ?? [],
          confidence: Math.min(100, Math.max(0, item.confidence ?? 55)),
          urgency: item.urgency ?? 'medium',
          timestamp: Date.now(),
          expiresAt: Date.now() + (item.ttlMinutes ?? 60) * 60_000,
          data: { ...item } as Record<string, unknown>,
        };

        // Floor: reject garbage-tier findings below 55% confidence
        if (finding.confidence < 55) continue;

        this.addFinding(finding);
      }

      this.totalQuickScans++;
      this.lastQuickScan = Date.now();

      this.emit({
        type: 'cycle_complete',
        cycle: 'quick_scan',
        data: { findingsCount: parsed.length },
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleError('quick_scan', err);
    } finally {
      this.quickScanLock = false;
      this.currentCycle = null;
    }
  }

  // -------------------------------------------------------------------------
  // Deep Dive — Detailed Analysis (runs every 30 min)
  // -------------------------------------------------------------------------

  private async runDeepDive(): Promise<void> {
    if (this.state !== 'running' || this.deepDiveLock) return;
    this.deepDiveLock = true;
    this.currentCycle = 'deep_dive';

    this.emit({ type: 'cycle_start', cycle: 'deep_dive', data: {}, timestamp: Date.now() });

    try {
      // Get top symbols to analyze from recent findings + watchlist
      const symbolsToAnalyze = this.getTopSymbolsForDeepDive();

      if (symbolsToAnalyze.length === 0) {
        this.deepDiveLock = false;
        this.currentCycle = null;
        return;
      }

      // Gather detailed data for each symbol
      const symbolData = await this.gatherSymbolDetails(symbolsToAnalyze);

      // Get knowledge base context
      const kb = getKnowledgeBase();
      const kbSummary = kb.getPromptSummary(5);

      // Get recent findings as context
      const recentFindings = this.findings
        .slice(-10)
        .map(f => `[${f.category}] ${f.symbol}: ${f.title} (${f.confidence}% conf)`)
        .join('\n');

      const prompt = `DEEP ANALYSIS — Full institutional-grade breakdown of these symbols. You have pre-fetched data below but you MUST use tools for deeper analysis.

## Pre-Fetched Data (starting point — dig deeper with tools)
${symbolData}

## Recent Quick Scan Findings (context from previous scans)
${recentFindings || 'No recent findings yet.'}

## Knowledge Base Context
${kbSummary}

## MANDATORY TOOL CALLS FOR EACH SYMBOL
For EVERY symbol in the analysis, you MUST:
1. **get_technical_analysis** on BOTH 4h AND 1d timeframes — get the full indicator suite
2. **get_ohlcv** on 1h timeframe (last 24 candles) — check intraday structure
3. **get_order_book** — check bid/ask imbalance, major walls, depth
4. **classify_market_regime** — is this trending, ranging, or volatile?
5. **query_knowledge** with the symbol — check for historical patterns and lessons

## Analysis Depth Required — Per Symbol
1. **Multi-Timeframe Structure**: What's the trend on 1h? 4h? 1d? Are they aligned or diverging? Divergence between timeframes is critical intel.
2. **Full Indicator Confluence Table**: Every indicator from get_technical_analysis — RSI, MACD, BBands, Stochastic, ADX, ATR, OBV, SuperTrend, SMA crossovers. Which agree? Which disagree? Count the confirming vs conflicting signals.
3. **Volume Intelligence**: Is volume expanding or contracting? Where are the volume spikes? OBV direction? Volume-price divergences?
4. **Order Book Structure**: Major bid walls (support). Major ask walls (resistance). Bid/ask ratio. Spoofing indicators (walls that keep moving).
5. **Regime Context**: Trending (ADX > 25) = trade with trend. Ranging (ADX < 20) = fade extremes. Volatile (ATR spike) = widen stops. What regime are we in and what does that mean for entries?
6. **Historical Pattern Match**: Does this setup match any pattern in the knowledge base? What happened last time?
7. **Precise Trade Setup**: If the analysis suggests a trade, specify EXACT levels: entry price, stop loss (with rationale), take profit (with rationale), R:R ratio.
8. **Invalidation**: What specific price level or event would destroy this thesis? Be exact.

Respond with a JSON array:
[
  {
    "category": "technical_setup|momentum_shift|volume_anomaly|divergence|regime_change|correlation_break",
    "symbol": "SOL/USDT:USDT",
    "title": "SOL 4h/1d SMA alignment with ADX 32 trend confirmation — breakout above $186 wall targets $198",
    "summary": "5-8 sentence deep analysis citing EXACT indicator values from tool calls. Multi-timeframe, multi-indicator, order book, regime. What makes THIS setup different from generic noise.",
    "evidence": [
      "4h RSI 64.2 rising, 1d RSI 58.7 — aligned bullish, not overbought",
      "4h MACD histogram expanding positive, signal line cross 2 bars ago",
      "ADX 32.4 on 4h = confirmed trend, +DI > -DI by 12 points",
      "Order book: 2.3M bid wall at $183.50 vs 800K ask wall at $186.20 — 2.9:1 bid/ask ratio",
      "OBV making new highs ahead of price — accumulation confirmed",
      "ATR 3.42 on 4h = expect $3.40 range per candle, stop at 1.5x ATR = $5.13 below entry"
    ],
    "confidence": 78,
    "urgency": "high",
    "ttlMinutes": 180,
    "keyLevels": { "support": 183.50, "resistance": 186.20, "entry": 184.80, "stopLoss": 179.67, "takeProfit": 198.00 },
    "indicators": {
      "rsi4h": 64.2, "rsi1d": 58.7,
      "macdSignal": "bullish_expanding",
      "adx": 32.4, "atr": 3.42,
      "superTrend": "bullish",
      "smaAlignment": "bullish_20_above_50",
      "obvTrend": "accumulation",
      "bbPosition": "upper_half",
      "stochastic": "neutral_rising",
      "regime": "trending_bullish"
    }
  }
]

CONFIDENCE: Base at 60. Add +5 for each confirming signal (multi-TF alignment, indicator confluence, volume confirm, favorable regime, order book support, knowledge base pattern match). Subtract -5 for each conflict. Cap at 92 — crypto is never a sure thing.`;

      const response = await aiQueryDeepDive(prompt, this.abortController?.signal);
      const parsed = this.parseJsonArray<DeepDiveFinding>(response);

      for (const item of parsed) {
        const finding: ResearchFinding = {
          id: `rf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          cycle: 'deep_dive',
          category: item.category ?? 'technical_setup',
          symbol: item.symbol ?? 'UNKNOWN',
          title: item.title ?? 'Untitled',
          summary: item.summary ?? '',
          evidence: item.evidence ?? [],
          confidence: Math.min(100, Math.max(0, item.confidence ?? 60)),
          urgency: item.urgency ?? 'medium',
          timestamp: Date.now(),
          expiresAt: Date.now() + (item.ttlMinutes ?? 180) * 60_000,
          data: { ...item } as Record<string, unknown>,
        };

        // Floor: deep dive findings must be >= 55% confidence
        if (finding.confidence < 55) continue;

        this.addFinding(finding);
      }

      this.totalDeepDives++;
      this.lastDeepDive = Date.now();

      this.emit({
        type: 'cycle_complete',
        cycle: 'deep_dive',
        data: { findingsCount: parsed.length, symbolsAnalyzed: symbolsToAnalyze },
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleError('deep_dive', err);
    } finally {
      this.deepDiveLock = false;
      this.currentCycle = null;
    }
  }

  // -------------------------------------------------------------------------
  // Thesis Generation — Synthesize Everything (runs every 60 min)
  // -------------------------------------------------------------------------

  private async runThesisGeneration(): Promise<void> {
    if (this.state !== 'running' || this.thesisLock) return;
    this.thesisLock = true;
    this.currentCycle = 'thesis_generation';

    this.emit({ type: 'cycle_start', cycle: 'thesis_generation', data: {}, timestamp: Date.now() });

    try {
      const activeFindings = this.getFindings();
      if (activeFindings.length < 3) {
        // Not enough data yet — skip this cycle
        this.thesisLock = false;
        this.currentCycle = null;
        return;
      }

      // Group findings by symbol
      const bySymbol = new Map<string, ResearchFinding[]>();
      for (const f of activeFindings) {
        const existing = bySymbol.get(f.symbol) ?? [];
        existing.push(f);
        bySymbol.set(f.symbol, existing);
      }

      // Build findings summary for the AI
      const findingsSummary = activeFindings
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 30)
        .map(f => `[${f.cycle}/${f.category}] ${f.symbol} — ${f.title} (${f.confidence}% conf, ${f.urgency}):\n  ${f.summary}\n  Evidence: ${f.evidence.join('; ')}`)
        .join('\n\n');

      // Get existing theses to avoid duplicates
      const existingTheses = this.theses
        .filter(t => t.status === 'ready')
        .map(t => `${t.direction} ${t.symbol}: ${t.title}`)
        .join('\n');

      // Get upcoming events for context
      const futureEvents = this.events
        .filter(e => new Date(e.expectedDate).getTime() > Date.now())
        .slice(0, 10)
        .map(e => `[${e.expectedImpact}] ${e.expectedDate} — ${e.title}: ${e.impactAssessment}`)
        .join('\n');

      // Get knowledge base learnings
      const kb = getKnowledgeBase();
      const learnings = kb.getLearningsPromptBlock(5);

      // Risk profile context
      const riskCtx = `Risk profile: ${this.config.riskProfile}. ${
        this.config.riskProfile === 'degen' ? 'High leverage, aggressive entries, wider stops.'
        : this.config.riskProfile === 'aggressive' ? 'Medium-high leverage, momentum-based entries.'
        : this.config.riskProfile === 'moderate' ? 'Conservative leverage, confirmed setups only.'
        : 'Low leverage, strict risk management, only A+ setups.'
      }`;

      const prompt = `THESIS SYNTHESIS — Convert accumulated intelligence into EXECUTABLE trading theses that a paper trading engine will immediately begin testing.

## Accumulated Research Findings (your raw intelligence)
${findingsSummary}

## Existing Active Theses (DO NOT duplicate — update or supersede if conditions changed)
${existingTheses || 'None yet.'}

## Upcoming Events
${futureEvents || 'No known upcoming events.'}

## Behavioral Learnings (hard-won lessons — DO NOT violate these)
${learnings}

## Risk Context
${riskCtx}

## MANDATORY TOOL CALLS
Before generating theses, you MUST:
1. For each symbol you're considering a thesis on, call **get_technical_analysis** on the 4h timeframe to get CURRENT indicator values (the findings may be slightly stale)
2. Call **get_hard_constraints** to ensure no thesis violates trading rules
3. Call **get_anti_patterns** to check if any thesis matches a known losing pattern
4. Call **get_ticker** for current price of each thesis symbol (entry levels must be current)

## Thesis Quality Requirements
Each thesis is a COMPLETE trade plan that will be auto-executed by paper trading. Quality requirements:

1. **Conviction Required**: Minimum 65% confidence. If you can't get to 65%, the setup isn't ready. Don't pad confidence — the paper trading engine will expose weak theses through actual P&L.
2. **Precise Levels**: Entry, stop loss, and take profit must be based on CURRENT price data from tools. Stop loss must be at a STRUCTURAL level (below support, below SMA, below recent swing low) — not an arbitrary percentage.
3. **R:R Minimum 1.5:1**: If risk/reward is below 1.5, the thesis is not worth trading. Find a better entry or a wider target.
4. **Indicator Confluence**: Cite at least 3 technical indicators that support the direction. If you can't find 3, the thesis is weak.
5. **Invalidation Criteria**: Every thesis must specify the EXACT condition that kills it (specific price below X, RSI dropping below Y, volume failing to confirm by Z time).
6. **Contra Evidence Mandatory**: Every thesis must have at least 1 genuine contra argument. If you can't find one, you're not looking hard enough and the thesis is probably overfit.
7. **Position Sizing**: Size suggestions must account for leverage, stop distance, and maximum acceptable loss per trade (2-5% of account for aggressive, 1-2% for moderate).

Generate 1-5 NEW trading theses. Respond with a JSON array:
[
  {
    "title": "Precise, data-laden title — not generic (e.g. 'LONG SOL — 4h SMA cross + ADX 34 trend + 3:1 bid wall at $183')",
    "symbol": "SOL/USDT:USDT",
    "direction": "long",
    "timeHorizon": "swing",
    "confidence": 78,
    "thesis": "Multi-sentence thesis grounded in CURRENT tool data. Explain the setup, the edge, and why NOW is the right time. Reference specific indicator values from get_technical_analysis.",
    "supportingEvidence": ["Tool-verified: 4h RSI 64.2 rising with bullish MACD crossover", "ADX 34 confirms trend strength, +DI leading", "Order book shows 2.3M bid wall at $183.50 — institutional support", "OBV making new highs — smart money accumulating"],
    "contraEvidence": ["BTC 1d RSI 71.8 — potentially overbought, alt drag risk", "Stochastic 84 on 4h — approaching overbought zone"],
    "catalysts": ["Break above $186.20 ask wall triggers liquidation cascade of $4.2M in short stops", "Funding rate -0.012% suggests shorts overexposed"],
    "proposedEntry": 184.80,
    "proposedStopLoss": 179.67,
    "proposedTakeProfit": 198.00,
    "riskRewardRatio": 2.57,
    "suggestedPositionSizePercent": 5,
    "suggestedLeverage": 5,
    "ttlHours": 72,
    "findingIds": ["rf-xxx", "rf-yyy"]
  }
]

DO NOT produce theses below 65% confidence. If all findings are weak, produce 0 theses and explain why in a single thesis with direction "neutral".`;

      const response = await aiQueryThesis(prompt, this.abortController?.signal);
      const parsed = this.parseJsonArray<ThesisGenResult>(response);

      for (const item of parsed) {
        if (!item.symbol || !item.title) continue;
        // Hard floor: theses below 65% confidence don't get promoted to paper trading
        if ((item.confidence ?? 0) < 65) continue;
        // Hard floor: R:R below 1.5 is not worth the risk
        if ((item.riskRewardRatio ?? 0) < 1.2) continue;

        const thesis: TradingThesis = {
          id: `thesis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: item.title,
          symbol: item.symbol,
          direction: item.direction ?? 'long',
          timeHorizon: item.timeHorizon ?? 'day',
          confidence: Math.min(100, Math.max(0, item.confidence ?? 50)),
          thesis: item.thesis ?? '',
          supportingEvidence: item.supportingEvidence ?? [],
          contraEvidence: item.contraEvidence ?? [],
          catalysts: item.catalysts ?? [],
          proposedEntry: item.proposedEntry ?? 0,
          proposedStopLoss: item.proposedStopLoss ?? 0,
          proposedTakeProfit: item.proposedTakeProfit ?? 0,
          riskRewardRatio: item.riskRewardRatio ?? 0,
          suggestedPositionSizePercent: item.suggestedPositionSizePercent ?? 5,
          suggestedLeverage: item.suggestedLeverage ?? 3,
          status: 'ready',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: Date.now() + (item.ttlHours ?? 48) * 3600_000,
          findingIds: item.findingIds ?? [],
          decisionRecord: {
            id: `dr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            agent: 'research-engine',
            action: `generate_thesis:${item.direction}:${item.symbol}`,
            reasoning: item.thesis ?? 'No reasoning provided',
            confidence: item.confidence ?? 50,
            inputs: { findingsCount: activeFindings.length, symbol: item.symbol },
            supportingEvidence: item.supportingEvidence ?? [],
            contraEvidence: item.contraEvidence ?? [],
            phase: 'research',
          },
        };

        this.addThesis(thesis);
      }

      this.totalThesesGenerated += parsed.length;
      this.lastThesisGen = Date.now();

      // Also try to identify upcoming events
      await this.scanForEvents();

      this.emit({
        type: 'cycle_complete',
        cycle: 'thesis_generation',
        data: { thesesCount: parsed.length },
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleError('thesis_generation', err);
    } finally {
      this.thesisLock = false;
      this.currentCycle = null;
    }
  }

  // -------------------------------------------------------------------------
  // Event Scanner (runs as part of thesis generation)
  // -------------------------------------------------------------------------

  private async scanForEvents(): Promise<void> {
    try {
      const prompt = `Identify upcoming events in the next 7 days that could impact crypto markets. Consider:
- FOMC meetings, CPI/PPI releases, jobs data
- Crypto-specific: token unlocks, major protocol upgrades, ETF decisions
- Regulatory: SEC actions, congressional hearings, international regulation
- Exchange: major listings, delistings, fee changes

Respond with a JSON array:
[
  {
    "title": "FOMC Rate Decision",
    "category": "macro",
    "expectedDate": "2026-02-19T19:00:00Z",
    "impactAssessment": "Market expects hold. Hawkish surprise would pressure risk assets 3-5%. Dovish surprise could fuel 5-8% rally.",
    "affectedSymbols": ["BTC/USDT:USDT", "ETH/USDT:USDT"],
    "expectedImpact": "high",
    "direction": "uncertain",
    "confidence": 85,
    "source": "Federal Reserve schedule"
  }
]

Only include events you're reasonably confident about (>60% confidence). Include the specific date/time.`;

      const response = await aiQueryThesis(prompt, this.abortController?.signal);
      const parsed = this.parseJsonArray<EventScanResult>(response);

      for (const item of parsed) {
        if (!item.title || !item.expectedDate) continue;

        // Check for duplicate events
        const isDuplicate = this.events.some(
          e => e.title === item.title && e.expectedDate === item.expectedDate
        );
        if (isDuplicate) continue;

        const event: UpcomingMarketEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title: item.title,
          category: item.category ?? 'macro',
          expectedDate: item.expectedDate,
          impactAssessment: item.impactAssessment ?? '',
          affectedSymbols: item.affectedSymbols ?? [],
          expectedImpact: item.expectedImpact ?? 'medium',
          direction: item.direction ?? 'uncertain',
          confidence: Math.min(100, Math.max(0, item.confidence ?? 50)),
          source: item.source ?? 'AI analysis',
          timestamp: Date.now(),
        };

        this.events.push(event);
        this.emit({ type: 'event', data: event, timestamp: Date.now() });
      }

      // Trim events list
      if (this.events.length > this.config.maxEvents) {
        this.events = this.events.slice(-this.config.maxEvents);
      }

      // Remove past events
      this.events = this.events.filter(
        e => new Date(e.expectedDate).getTime() > Date.now() - 24 * 3600_000
      );
    } catch {
      // Non-critical — event scanning failure doesn't stop the engine
    }
  }

  // -------------------------------------------------------------------------
  // Data Gathering
  // -------------------------------------------------------------------------

  private async gatherMarketSnapshot(): Promise<string> {
    const lines: string[] = [];

    try {
      if (!isPhemexConfigured()) {
        lines.push('Exchange: Not connected. Using agent signals only.');
        return lines.join('\n');
      }

      const client = getPhemexClient();

      // Get top symbols by volume
      const symbols = this.config.watchlistSymbols.length > 0
        ? this.config.watchlistSymbols
        : ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'DOGE/USDT:USDT',
           'XRP/USDT:USDT', 'PEPE/USDT:USDT', 'WIF/USDT:USDT', 'BONK/USDT:USDT',
           'AVAX/USDT:USDT', 'LINK/USDT:USDT', 'ADA/USDT:USDT', 'MATIC/USDT:USDT'];

      // Fetch tickers in parallel
      const tickerPromises = symbols.map(async (symbol) => {
        try {
          const ticker = await client.getTicker(symbol);
          return ticker;
        } catch {
          return null;
        }
      });

      const tickers = (await Promise.allSettled(tickerPromises))
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter(Boolean) as Ticker[];

      if (tickers.length > 0) {
        lines.push('## Tickers (sorted by 24h change)');
        const sorted = [...tickers].sort((a, b) =>
          Math.abs(b.changePercent24h) - Math.abs(a.changePercent24h)
        );
        for (const t of sorted) {
          lines.push(`  ${t.symbol}: $${t.last} | 24h: ${t.changePercent24h > 0 ? '+' : ''}${t.changePercent24h.toFixed(2)}% | Vol: ${t.volume.toFixed(0)}`);
        }
      }
    } catch (err) {
      lines.push(`Exchange data error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return lines.join('\n');
  }

  private async gatherSymbolDetails(symbols: string[]): Promise<string> {
    const sections: string[] = [];

    try {
      if (!isPhemexConfigured()) return 'Exchange not connected.';
      const client = getPhemexClient();

      for (const symbol of symbols.slice(0, 5)) {
        try {
          const [ticker, ohlcv4h, ohlcv1d] = await Promise.allSettled([
            client.getTicker(symbol),
            client.getOHLCV(symbol, '4h', 50),
            client.getOHLCV(symbol, '1d', 30),
          ]);

          const t = ticker.status === 'fulfilled' ? ticker.value : null;
          const candles4h = ohlcv4h.status === 'fulfilled' ? ohlcv4h.value : [];
          const candles1d = ohlcv1d.status === 'fulfilled' ? ohlcv1d.value : [];

          const section: string[] = [`\n### ${symbol}`];

          if (t) {
            section.push(`Price: $${t.last} | 24h: ${t.changePercent24h > 0 ? '+' : ''}${t.changePercent24h.toFixed(2)}% | Volume: ${t.volume.toFixed(0)}`);
          }

          // Quick SMA calculations from OHLCV
          if (candles4h.length >= 20) {
            const closes = candles4h.map(c => c.close);
            const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
            const sma50 = closes.length >= 50
              ? closes.slice(-50).reduce((s, v) => s + v, 0) / 50
              : null;
            const rsi = this.computeRSI(closes, 14);
            const avgVol = candles4h.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
            const latestVol = candles4h[candles4h.length - 1]?.volume ?? 0;
            const volRatio = avgVol > 0 ? ((latestVol / avgVol) * 100).toFixed(0) : 'N/A';

            section.push(`4h Indicators: SMA20=$${sma20.toFixed(2)} | ${sma50 ? `SMA50=$${sma50.toFixed(2)}` : 'SMA50=N/A'} | RSI14=${rsi.toFixed(1)} | Vol=${volRatio}% of avg`);

            if (sma50 && t) {
              const crossover = t.last > sma20 && sma20 > sma50 ? 'BULLISH ALIGNMENT' :
                               t.last < sma20 && sma20 < sma50 ? 'BEARISH ALIGNMENT' : 'MIXED';
              section.push(`  SMA Signal: ${crossover}`);
            }
          }

          if (candles1d.length >= 10) {
            const closes = candles1d.map(c => c.close);
            const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((s, v) => s + v, 0) / 20 : null;
            const high5d = Math.max(...candles1d.slice(-5).map(c => c.high));
            const low5d = Math.min(...candles1d.slice(-5).map(c => c.low));
            section.push(`1d Context: ${sma20 ? `SMA20=$${sma20.toFixed(2)}` : ''} | 5d Range: $${low5d.toFixed(2)} - $${high5d.toFixed(2)}`);
          }

          // Last 5 candles (4h) for recent price action
          if (candles4h.length >= 5) {
            section.push('  Recent 4h candles:');
            for (const c of candles4h.slice(-5)) {
              const dir = c.close >= c.open ? 'G' : 'R';  // Green or Red
              section.push(`    ${new Date(c.timestamp).toISOString().slice(5, 16)} [${dir}] O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)} V=${c.volume.toFixed(0)}`);
            }
          }

          sections.push(section.join('\n'));
        } catch {
          sections.push(`\n### ${symbol}\n  Error fetching data.`);
        }
      }
    } catch {
      return 'Error gathering symbol details.';
    }

    return sections.join('\n');
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private getTopSymbolsForDeepDive(): string[] {
    const symbolScores = new Map<string, number>();

    // Score from recent findings
    for (const f of this.findings) {
      if (f.symbol === 'MARKET') continue;
      const current = symbolScores.get(f.symbol) ?? 0;
      const score = f.confidence * (f.urgency === 'critical' ? 4 : f.urgency === 'high' ? 3 : f.urgency === 'medium' ? 2 : 1);
      symbolScores.set(f.symbol, current + score);
    }

    // Include watchlist symbols
    for (const s of this.config.watchlistSymbols) {
      const current = symbolScores.get(s) ?? 0;
      symbolScores.set(s, current + 50); // baseline score for watchlist
    }

    // Always include BTC and ETH for context
    symbolScores.set('BTC/USDT:USDT', (symbolScores.get('BTC/USDT:USDT') ?? 0) + 30);
    symbolScores.set('ETH/USDT:USDT', (symbolScores.get('ETH/USDT:USDT') ?? 0) + 20);

    return Array.from(symbolScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([symbol]) => symbol);
  }

  private computeRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      const change = closes[closes.length - period - 1 + i] - closes[closes.length - period - 1 + i - 1];
      if (change > 0) avgGain += change;
      else avgLoss += Math.abs(change);
    }

    avgGain /= period;
    avgLoss /= period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private addFinding(finding: ResearchFinding): void {
    this.findings.push(finding);

    // Trim to max
    if (this.findings.length > this.config.maxFindings) {
      this.findings = this.findings.slice(-this.config.maxFindings);
    }

    this.emit({ type: 'finding', data: finding, timestamp: Date.now() });
  }

  private addThesis(thesis: TradingThesis): void {
    // Check for similar existing thesis on same symbol+direction
    const existing = this.theses.find(
      t => t.symbol === thesis.symbol && t.direction === thesis.direction && t.status === 'ready'
    );

    if (existing) {
      // Update the existing thesis if new one has higher confidence
      if (thesis.confidence > existing.confidence) {
        existing.title = thesis.title;
        existing.thesis = thesis.thesis;
        existing.confidence = thesis.confidence;
        existing.supportingEvidence = thesis.supportingEvidence;
        existing.contraEvidence = thesis.contraEvidence;
        existing.catalysts = thesis.catalysts;
        existing.proposedEntry = thesis.proposedEntry;
        existing.proposedStopLoss = thesis.proposedStopLoss;
        existing.proposedTakeProfit = thesis.proposedTakeProfit;
        existing.riskRewardRatio = thesis.riskRewardRatio;
        existing.updatedAt = Date.now();
        existing.decisionRecord = thesis.decisionRecord;

        this.emit({ type: 'thesis', data: existing, timestamp: Date.now() });
      }
      return;
    }

    this.theses.push(thesis);

    // Trim to max
    if (this.theses.length > this.config.maxTheses) {
      // Remove oldest expired/invalidated first, then oldest ready
      const expired = this.theses.filter(t => t.status === 'expired' || t.status === 'invalidated');
      if (expired.length > 0) {
        this.theses = this.theses.filter(t => t.status !== 'expired' && t.status !== 'invalidated');
      } else {
        this.theses = this.theses.slice(-this.config.maxTheses);
      }
    }

    this.emit({ type: 'thesis', data: thesis, timestamp: Date.now() });
  }

  private pruneExpired(): void {
    const now = Date.now();
    this.findings = this.findings.filter(f => f.expiresAt > now);
  }

  private pruneExpiredTheses(): void {
    const now = Date.now();
    for (const t of this.theses) {
      if (t.status === 'ready' && t.expiresAt < now) {
        t.status = 'expired';
      }
    }
  }

  private handleError(cycle: ResearchCycleType, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.lastError = `${cycle}: ${message}`;

    this.emit({
      type: 'error',
      cycle,
      data: { error: message },
      timestamp: Date.now(),
    });
  }

  private emit(event: ResearchEngineEvent): void {
    for (const cb of this.eventCallbacks) {
      try { cb(event); } catch { /* swallow */ }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseJsonArray<T>(text: string): T[] {
    try {
      // Try to extract JSON array from response
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]) as T[];
      }
      // Try parsing the whole thing
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Internal AI output types (not exported — just for parsing)
// ---------------------------------------------------------------------------

interface QuickScanFinding {
  category?: ResearchFinding['category'];
  symbol?: string;
  title?: string;
  summary?: string;
  evidence?: string[];
  confidence?: number;
  urgency?: ResearchFinding['urgency'];
  ttlMinutes?: number;
}

interface DeepDiveFinding extends QuickScanFinding {
  keyLevels?: Record<string, number>;
  indicators?: Record<string, unknown>;
}

interface ThesisGenResult {
  title?: string;
  symbol?: string;
  direction?: TradingThesis['direction'];
  timeHorizon?: TradingThesis['timeHorizon'];
  confidence?: number;
  thesis?: string;
  supportingEvidence?: string[];
  contraEvidence?: string[];
  catalysts?: string[];
  proposedEntry?: number;
  proposedStopLoss?: number;
  proposedTakeProfit?: number;
  riskRewardRatio?: number;
  suggestedPositionSizePercent?: number;
  suggestedLeverage?: number;
  ttlHours?: number;
  findingIds?: string[];
}

interface EventScanResult {
  title?: string;
  category?: UpcomingMarketEvent['category'];
  expectedDate?: string;
  impactAssessment?: string;
  affectedSymbols?: string[];
  expectedImpact?: UpcomingMarketEvent['expectedImpact'];
  direction?: UpcomingMarketEvent['direction'];
  confidence?: number;
  source?: string;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let engine: ResearchEngine | null = null;

export function getResearchEngine(): ResearchEngine | null {
  return engine;
}

export function createResearchEngine(config?: Partial<ResearchEngineConfig>): ResearchEngine {
  if (engine) {
    engine.stop();
  }
  engine = new ResearchEngine(config);
  return engine;
}

export function stopResearchEngine(): void {
  engine?.stop();
  engine = null;
}
