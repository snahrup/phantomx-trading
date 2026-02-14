// ============================================================================
// PhantomX Trading Platform — Core Type Definitions
// ============================================================================

// --- Exchange & Market Types ---

export type Exchange = 'phemex';
export type MarketType = 'spot' | 'contract' | 'perpetual';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'take_profit' | 'trailing_stop';
export type OrderStatus = 'open' | 'closed' | 'canceled' | 'expired' | 'rejected';
export type PositionSide = 'long' | 'short';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'PostOnly';

export interface Ticker {
  symbol: string;
  last: number;
  bid: number;
  ask: number;
  high: number;
  low: number;
  volume: number;
  change24h: number;
  changePercent24h: number;
  timestamp: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

// --- Account Types ---

export interface Balance {
  currency: string;
  total: number;
  free: number;
  used: number;
  usdValue?: number;
}

export interface AccountInfo {
  balances: Balance[];
  totalUsdValue: number;
  marginLevel?: number;
  unrealizedPnl?: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice?: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  marginType: 'cross' | 'isolated';
  timestamp: number;
}

// --- Order Types ---

export interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price?: number;
  stopPrice?: number;
  amount: number;
  filled: number;
  remaining: number;
  cost: number;
  fee?: { cost: number; currency: string };
  timestamp: number;
  trades?: Trade[];
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  amount: number;
  cost: number;
  fee: { cost: number; currency: string };
  timestamp: number;
}

// --- Strategy Types ---

export type StrategyStatus = 'draft' | 'backtesting' | 'paper' | 'live' | 'paused' | 'stopped';

export type RiskLevel = 'conservative' | 'moderate' | 'aggressive' | 'degen';

export interface RiskParameters {
  level: RiskLevel;
  maxPositionSizePercent: number;    // % of account to use per trade
  maxDrawdownPercent: number;        // stop everything if drawdown exceeds this
  stopLossPercent: number;           // per-trade stop loss
  takeProfitPercent: number;         // per-trade take profit
  maxOpenPositions: number;          // max simultaneous positions
  maxDailyLossPercent: number;       // daily loss limit
  trailingStopPercent?: number;      // trailing stop distance
  allowLossOfEntireAmount: boolean;  // user explicitly okayed losing it all
  hardFloorUsd?: number;             // stop if account drops below this USD value
  hardCeilingUsd?: number;           // take profit if account hits this USD value
}

export interface StrategyConfig {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;                 // '1m', '5m', '15m', '1h', '4h', '1d'
  status: StrategyStatus;
  risk: RiskParameters;
  indicators: IndicatorConfig[];
  entryConditions: ConditionGroup;
  exitConditions: ConditionGroup;
  pineScript?: string;              // generated PineScript code
  createdAt: number;
  updatedAt: number;
}

export interface IndicatorConfig {
  type: IndicatorType;
  params: Record<string, number>;
  label?: string;
}

export type IndicatorType =
  | 'SMA' | 'EMA' | 'WMA' | 'DEMA' | 'TEMA'
  | 'RSI' | 'MACD' | 'BB'  // Bollinger Bands
  | 'ATR' | 'ADX' | 'CCI'
  | 'STOCH' | 'STOCHRSI'
  | 'VWAP' | 'OBV'
  | 'ICHIMOKU' | 'SUPERTREND';

export interface Condition {
  indicator: string;
  operator: 'crosses_above' | 'crosses_below' | 'above' | 'below' | 'equals';
  target: string | number;  // another indicator name or a value
}

export interface ConditionGroup {
  logic: 'AND' | 'OR';
  conditions: (Condition | ConditionGroup)[];
}

// --- AI Assistant Types ---

export type AIMessageRole = 'user' | 'assistant' | 'system';

export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: number;
  metadata?: {
    strategyGenerated?: string;     // strategy ID if one was generated
    tradeExecuted?: string;         // trade ID if one was executed
    chartAnalysis?: ChartAnalysis;  // vision analysis result
    thinkingContent?: string;       // extended thinking
    imageBase64?: string;           // attached image (pasted screenshot)
    isProactive?: boolean;          // AI-initiated message from autopilot
    source?: 'user' | 'autopilot' | 'voice' | 'agent'; // message origin
  };
}

export interface ChartAnalysis {
  pattern: string;                   // e.g., "bullish flag", "double bottom"
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;               // 0-1
  keyLevels: { type: string; price: number }[];
  recommendation: string;
  timeframe: string;
}

export interface TradingContext {
  symbol: string;
  currentPrice: number;
  accountBalance: number;
  openPositions: Position[];
  recentTrades: Trade[];
  activeStrategies: StrategyConfig[];
  riskProfile: RiskParameters;
  marketData: {
    ohlcv: OHLCV[];
    ticker: Ticker;
    orderBook: OrderBook;
  };
}

// --- Chart Annotation Types ---

export interface ChartAnnotation {
  id: string;
  type: 'trade_entry' | 'trade_exit' | 'stop_loss' | 'take_profit' | 'ai_note' | 'signal';
  timestamp: number;
  price: number;
  text: string;
  color: string;
  side?: OrderSide;
  pnl?: number;
  pnlPercent?: number;
}

// --- Chart Price Line Types (AI-driven S/R levels, entry/exit plans) ---

export type PriceLineSource = 'ai_analysis' | 'ai_chat' | 'manual' | 'execution_engine' | 'open_orders' | 'positions';

export interface ChartPriceLine {
  id: string;
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  label: string;
  source: PriceLineSource;
  type: 'support' | 'resistance' | 'entry' | 'exit' | 'stop_loss' | 'take_profit' | 'liquidation' | 'limit_order';
  axisLabelVisible: boolean;
  timestamp: number;        // when it was created
  expiresAt?: number;       // auto-remove after this time (optional)
}

// --- Chart Drawing Types (trendlines, fibonacci, zones) ---

export type DrawingTool = 'select' | 'trendline' | 'horizontal' | 'fibonacci' | 'rectangle' | 'ray';

export interface DrawingPoint {
  time: number;   // unix seconds (chart time)
  price: number;
}

export interface ChartDrawing {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];   // 1 point for horizontal, 2 for trendline/fib/rect/ray
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  label?: string;
  source: 'manual' | 'ai';
  locked: boolean;
  visible: boolean;
  // Fibonacci-specific
  fibLevels?: number[];     // e.g. [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
  // AI pattern-specific
  patternName?: string;     // e.g. "bull_flag", "double_bottom"
  confidence?: number;      // 0-1
  timestamp: number;
}

// --- WebSocket Event Types ---

export type WSEventType =
  | 'ticker'
  | 'kline'
  | 'orderbook'
  | 'trade'
  | 'position_update'
  | 'order_update'
  | 'balance_update'
  | 'strategy_signal'
  | 'ai_message';

export interface WSEvent<T = unknown> {
  type: WSEventType;
  symbol?: string;
  data: T;
  timestamp: number;
}

// --- Dashboard Types ---

export interface DashboardStats {
  totalPnl: number;
  totalPnlPercent: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  accountValue: number;
}

export interface TradeHistoryEntry extends Trade {
  strategy?: string;
  pnl: number;
  pnlPercent: number;
  holdDuration: number;   // ms
  annotation?: string;    // AI-generated context
}

// --- TradingView Webhook Types ---

export interface TradingViewWebhook {
  strategy: string;
  action: 'buy' | 'sell' | 'close';
  symbol: string;
  price: number;
  quantity?: number;
  timestamp: string;
  message?: string;
}

// --- Portfolio Autopilot Types ---

export interface PortfolioHeartbeatConfig {
  symbols: string[];
  scanMode: 'watchlist' | 'full_scan';
  intervalMs: number;
  riskLevel: RiskLevel;
  enableAutoTrade: boolean;
  maxDailyLossPercent: number;
  stopAfterKill: boolean;
  maxPerTokenAllocationPercent: number;
  maxTotalExposurePercent: number;
  maxOpenPositions: number;
  minCashReservePercent: number;
  fullScanTopN: number;
  fullScanFilterMinVolume: number;
}

export interface PortfolioSnapshot {
  totalEquity: number;
  availableCash: number;
  cashPercent: number;
  positions: PortfolioPosition[];
  totalUnrealizedPnl: number;
  dailyStartEquity: number;
  dailyPnlPercent: number;
}

export interface PortfolioPosition {
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  markPrice: number;
  notionalValue: number;
  allocationPercent: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice?: number;
}

export type PortfolioHeartbeatEventType =
  | 'tick_start'
  | 'scanning'
  | 'ranking'
  | 'analysis'
  | 'thinking'
  | 'sizing'
  | 'portfolio_update'
  | 'action'
  | 'trade_executed'
  | 'trade_skipped'
  | 'error'
  | 'kill_triggered'
  | 'status';

export interface PortfolioHeartbeatEvent {
  type: PortfolioHeartbeatEventType;
  tick: number;
  phase?: 'scan' | 'rank' | 'analyze' | 'decide' | 'execute' | 'update';
  data: Record<string, unknown>;
  timestamp: number;
}

export interface PortfolioTradeAction {
  action: 'buy' | 'sell' | 'close' | 'hold' | 'adjust_sl' | 'adjust_tp' | 'rotate';
  symbol: string;
  reason: string;
  confidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  allocationPercent?: number;
  leverage?: number;
  urgency: 'immediate' | 'wait_for_confirmation' | 'low';
  closeSymbol?: string;
  // Behavioral intervention fields
  intervention_matched?: boolean;
  intervention_override?: boolean;
  intervention_learning_id?: string;
  intervention_note?: string;
}

export interface AutopilotClosedTrade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  realizedPnlPercent: number;
  leverage: number;
  holdDuration: number;      // ms
  closedAt: number;          // timestamp
  reason: string;            // AI's reason for closing
  tick: number;              // which tick closed it
}

export interface AutopilotPnlSummary {
  cumulativeRealizedPnl: number;
  closedTradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: AutopilotClosedTrade | null;
  worstTrade: AutopilotClosedTrade | null;
  sessionStartEquity: number;
  currentEquity: number;
  totalReturnPercent: number;
}

// ---------------------------------------------------------------------------
// Trading Journal — Play-by-play decision log
// ---------------------------------------------------------------------------

export type JournalEntryType =
  | 'scan'          // Watchlist scanned, top opportunities ranked
  | 'analysis'      // AI analyzed market and formed thesis
  | 'decision'      // AI decided to act (buy/sell/close/rotate)
  | 'trade'         // Order executed on exchange
  | 'close'         // Position closed (realized P&L)
  | 'skip'          // Trade skipped (constraint violation)
  | 'kill'          // Kill switch triggered
  | 'session_start' // Autopilot session started
  | 'session_end'   // Autopilot session stopped
  | 'summary';      // AI-generated day summary

export interface JournalEntry {
  id: string;
  timestamp: number;
  tick: number;
  type: JournalEntryType;
  symbol?: string;
  action?: string;              // buy/sell/hold/close/rotate
  reason: string;               // AI reasoning or description
  confidence?: number;          // 0-100
  price?: number;               // price at time of event
  pnl?: number;                 // realized P&L (for close events)
  pnlPercent?: number;          // realized P&L % (for close events)
  chartSnapshotPath?: string;   // file path to saved screenshot
  indicators?: Record<string, number | string>; // RSI, SMA, ATR, trend, etc.
  portfolioState: {
    equity: number;
    cashPercent: number;
    positionCount: number;
    dailyPnl: number;
    dailyPnlPercent: number;
  };
  metadata?: Record<string, unknown>; // extra event-specific data
}

export interface JournalDay {
  date: string;                  // YYYY-MM-DD
  entries: JournalEntry[];
  summary?: string;              // AI-generated narrative summary
  startEquity: number;
  endEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

export interface PortfolioTickSummary {
  tick: number;
  timestamp: number;
  scannedCount: number;
  rankings: Array<{ symbol: string; score: number; changePercent: number }>;
  analysis: string;
  reasoning: string;
  portfolioBefore: { equity: number; cashPercent: number; positions: Array<{ symbol: string; allocationPercent: number; side: string }> };
  portfolioAfter: { equity: number; cashPercent: number; positions: Array<{ symbol: string; allocationPercent: number; side: string }> };
  actions: Array<{ action: string; symbol: string; confidence: number; result: string }>;
  thinking?: string;
}

// ---------------------------------------------------------------------------
// Multi-Agent Intelligence System
// ---------------------------------------------------------------------------

export type AgentId = 'sentinel' | 'macro' | 'technical' | 'news';

export type AgentSentiment = 'bullish' | 'bearish' | 'neutral';

export interface AgentSignal {
  agentId: AgentId;
  agentName: string;
  timestamp: number;
  expiresAt: number;
  confidence: number;       // 0-100
  sentiment: AgentSentiment;
  summary: string;          // 1-2 sentence human-readable summary
  data: Record<string, unknown>;
  symbols?: string[];       // which symbols this applies to (empty = market-wide)
}

export type AgentRunState = 'idle' | 'running' | 'error' | 'stopped';

export interface AgentStatus {
  id: AgentId;
  name: string;
  state: AgentRunState;
  intervalMs: number;
  lastTick: number | null;
  lastError: string | null;
  tickCount: number;
  latestSignal: AgentSignal | null;
}

export type AgentEventType =
  | 'agent_started'
  | 'agent_stopped'
  | 'agent_tick'
  | 'agent_signal'
  | 'agent_error'
  | 'orchestrator_status';

export interface AgentEvent {
  type: AgentEventType;
  agentId: AgentId | 'orchestrator';
  data: Record<string, unknown>;
  timestamp: number;
}

export interface OrchestratorConfig {
  enableSentinel: boolean;
  enableMacro: boolean;
  enableNews: boolean;
  enableTechnical: boolean;
  sentinelIntervalMs: number;
  macroIntervalMs: number;
  newsIntervalMs: number;
  technicalIntervalMs: number;
  signalTtlMs: number;         // how long signals live before expiry
}

export interface SignalSummary {
  totalSignals: number;
  byAgent: Record<string, { count: number; latestSentiment: AgentSentiment; latestConfidence: number }>;
  consensusSentiment: AgentSentiment;
  consensusConfidence: number;
}

// ---------------------------------------------------------------------------
// Dashboard Analytics — Equity Tracking
// ---------------------------------------------------------------------------

export interface EquitySnapshot {
  timestamp: number;
  equity: number;
  unrealizedPnl: number;
  positionCount: number;
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: 'strategies' | 'patterns' | 'market-analysis' | 'risk-management' | 'custom' | 'learnings';
  tags: string[];
  content: string;
  source: 'user' | 'ai' | 'system';
  created: string;           // ISO date string
  updated: string;           // ISO date string
}

// ---------------------------------------------------------------------------
// Chart Replay System
// ---------------------------------------------------------------------------

export type ReplayEventType =
  | 'entry'
  | 'exit'
  | 'ai_recommendation'
  | 'intervention'
  | 'override'
  | 'stop_loss'
  | 'take_profit'
  | 'kill_switch'
  | 'pattern_detected'
  | 'signal_consensus';

export interface ReplayEvent {
  timestamp: number;
  type: ReplayEventType;
  symbol: string;
  side?: OrderSide;
  price?: number;
  quantity?: number;
  reasoning?: string;
  confidence?: number;
  data?: Record<string, unknown>;
}

export type ReplayAnnotationType =
  | 'price_line'
  | 'zone'
  | 'trendline'
  | 'marker'
  | 'ghost_line'       // idealized path (what should have happened)
  | 'text_label';

export interface ReplayAnnotation {
  type: ReplayAnnotationType;
  fromTimestamp: number;
  toTimestamp?: number;
  price: number;
  endPrice?: number;
  label: string;
  color: string;               // CSS variable reference or hex
  style: 'solid' | 'dashed';
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface ReplaySession {
  id: string;
  symbol: string;
  timeframe: string;
  startTime: number;
  endTime: number;
  ohlcv: OHLCV[];
  events: ReplayEvent[];
  annotations: ReplayAnnotation[];
  profile: {
    riskLevel: string;
    activePatterns: string[];    // behavioral patterns active during this session
    portfolioValue: number;
  };
  summary: string;              // AI-generated narrative synthesis
  lesson: string;               // key takeaway
  tags: string[];
  createdAt: string;            // ISO date
}

// ---------------------------------------------------------------------------
// Trader Profile Synthesis
// ---------------------------------------------------------------------------

export type TraderArchetype =
  | 'momentum_scalper'
  | 'swing_hunter'
  | 'fomo_chaser'
  | 'revenge_trader'
  | 'overthinker'
  | 'degen'
  | 'disciplined_executor'
  | 'evolving_trader';

export interface ProfileDimension {
  name: string;
  score: number;                // 0-100
  label: string;                // human-readable position on spectrum
  trend: 'improving' | 'stable' | 'regressing';
  trendDelta: number;           // change over measurement period
  evidence: string[];           // specific trade/event IDs backing this score
}

export interface TraderProfile {
  id: string;
  generatedAt: string;          // ISO date
  periodStart: string;          // ISO date — start of measurement window
  periodEnd: string;            // ISO date — end of measurement window
  tradeCount: number;
  totalPnl: number;
  winRate: number;

  // Core behavioral dimensions
  dimensions: {
    riskTolerance: ProfileDimension;      // conservative ←→ degen
    decisionSpeed: ProfileDimension;       // deliberate ←→ impulsive
    lossResponse: ProfileDimension;        // disciplined exit ←→ revenge trading
    winResponse: ProfileDimension;         // disciplined TP ←→ greed/overhold
    aiTrustLevel: ProfileDimension;        // follows AI ←→ consistently overrides
    consistency: ProfileDimension;         // follows own rules ←→ erratic
    emotionalControl: ProfileDimension;    // calm under pressure ←→ reactive
  };

  // AI-assigned archetypes (can be multiple, weighted)
  archetypes: Array<{
    type: TraderArchetype;
    confidence: number;         // 0-100 how strongly this archetype fits
    description: string;        // AI-generated 1-2 sentence explanation
  }>;

  // Stated vs actual comparison
  statedRiskLevel: string;      // what the user set in risk config
  actualRiskLevel: string;      // what behavior shows
  perceptionGap: number;        // 0-100, 0 = accurate self-assessment

  // Temporal patterns
  bestTimeOfDay?: string;       // e.g., "9-11am EST"
  worstTimeOfDay?: string;
  bestMarketCondition?: string; // e.g., "high volatility BTC-correlated"
  worstMarketCondition?: string;

  // Evolution tracking
  overallScore: number;         // 0-100 composite "Trading IQ"
  previousScore?: number;       // from prior period
  scoreDelta?: number;          // change
  streakDays: number;           // consecutive days of trading
  milestones: string[];         // achieved milestones ("First 50 trades", "Override rate below 30%")

  // AI synthesis
  narrative: string;            // comprehensive AI-written profile paragraph
  topStrength: string;          // "Your best quality as a trader is..."
  topWeakness: string;          // "Your biggest area for improvement is..."
  actionableAdvice: string[];   // 3-5 specific strategies for improvement
}
