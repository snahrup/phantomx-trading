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

export interface FundingRate {
  symbol: string;
  fundingRate: number;
  fundingTimestamp: number;
  nextFundingTimestamp?: number;
  markPrice?: number;
  indexPrice?: number;
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
  | 'ICHIMOKU' | 'SUPERTREND'
  | 'DONCHIAN' | 'ATR_BANDS' | 'EMA_RIBBON' | 'PIVOT'
  | 'EMA_CROSS' | 'RSI_DIVERGENCE' | 'CANDLE_PATTERNS' | 'SWING_POINTS'
  | 'MACD_HIST_FLIP' | 'RSI_REVERSAL' | 'VOLUME_PROFILE'
  | 'VOLUME_SMA';

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

export type PriceLineSource = 'ai_analysis' | 'ai_chat' | 'manual' | 'execution_engine' | 'open_orders' | 'positions' | 'agent_analysis';

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
// Trading Pipeline — Execution Signal Types
// ---------------------------------------------------------------------------

export type TradingSignalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'closed' | 'expired';
export type TradeDirection = 'long' | 'short';

export interface TradingSignal {
  id: string;
  asset: string;                    // e.g. 'BTC/USDT:USDT'
  direction: TradeDirection;
  strategy: string;                 // strategy name (human-readable)
  strategyId?: string;              // unique strategy identifier (e.g. 'strat-ema-ribbon-v2.0')
  source?: string;                  // scanner/system that generated the signal (e.g. 'regime-scanner', 'manual')
  regime?: string;                  // market regime at signal time (e.g. 'trending', 'ranging', 'risk-off')
  triggerDetails?: string;          // what triggered entry (e.g. 'EMA8 crossed above EMA21, ADX > 25')
  entry: number;                    // target entry price
  stop: number;                     // stop-loss price
  targets: number[];                // take-profit levels
  confidence: number;               // 0-100
  status: TradingSignalStatus;
  rejectionReason?: string;
  executionId?: string;             // linked execution log entry
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;                // auto-expire stale signals
}

export interface RiskCheckResult {
  approved: boolean;
  reason: string;
  checks: {
    positionCount: { passed: boolean; current: number; max: number };
    dailyPnl: { passed: boolean; currentPercent: number; limitPercent: number };
    exposure: { passed: boolean; currentPercent: number; maxPercent: number };
    killSwitch: { passed: boolean; active: boolean };
    signalQuality: { passed: boolean; confidence: number; minRequired: number };
  };
}

export interface ExecutionRecord {
  id: string;
  signalId: string;
  asset: string;
  direction: TradeDirection;
  mode: 'paper' | 'live';
  entryPrice: number;
  fillPrice?: number;
  size: number;                     // position size in contracts/units
  sizeUsdt: number;                 // notional value in USDT
  stopLoss: number;
  takeProfit?: number;
  leverage: number;
  status: 'pending' | 'filled' | 'partial' | 'failed' | 'closed';
  exitPrice?: number;
  realizedPnl?: number;
  fees?: number;
  slippage?: number;                // entry vs fill difference
  orderId?: string;                 // exchange order ID (live mode only)
  error?: string;
  createdAt: number;
  closedAt?: number;
  // --- Attribution fields (PAP-22) ---
  strategyId?: string;              // unique strategy identifier
  strategyName?: string;            // human-readable strategy name
  confidence?: number;              // signal confidence at entry (0-100)
  source?: string;                  // scanner/system that generated the signal
  regime?: string;                  // market regime at entry
  triggerDetails?: string;          // what triggered the entry
  exitRationale?: string;           // why the position was closed
  holdTimeMs?: number;              // how long position was held (closedAt - createdAt)
  entryContext?: Record<string, unknown>;  // market context snapshot at entry
  exitContext?: Record<string, unknown>;   // market context snapshot at exit
}

export interface PipelineConfig {
  mode: 'paper' | 'live';
  minConfidence: number;            // minimum signal confidence to accept (0-100)
  maxOpenPositions: number;
  maxDailyLossPercent: number;
  maxExposurePercent: number;       // max % of equity in positions
  defaultLeverage: number;
  positionSizePercent: number;      // % of equity per trade
  signalTtlMs: number;             // how long a signal is valid
  requireStopLoss: boolean;
  minHoldTimeMs?: number;           // minimum hold time — closes below this are flagged as whipsaw (PAP-23)
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

// ============================================================================
// Strategy Lifecycle Engine — Types
// ============================================================================

// --- Decision Audit Trail ---

export interface DecisionRecord {
  id: string;
  timestamp: number;
  agent: string;                    // which agent/module made the decision
  action: string;                   // what was decided
  reasoning: string;                // WHY — mandatory, never empty
  confidence: number;               // 0-100
  inputs: Record<string, unknown>;  // what data informed the decision
  supportingEvidence: string[];     // specific data points backing the decision
  contraEvidence?: string[];        // what argued against (shows thoroughness)
  outcome?: {
    result: string;
    wasCorrect: boolean;
    actualPnl?: number;
  };
  parentDecisionId?: string;        // links to the decision this stems from
  phase: 'research' | 'backtest' | 'optimization' | 'live' | 'supervision';
}

// --- Strategy Goals ---

export interface StrategyGoals {
  minWinRate: number;               // e.g., 0.55 = 55%
  minProfitFactor: number;          // e.g., 1.5
  maxDrawdownPercent: number;       // e.g., 15
  minSharpeRatio: number;           // e.g., 1.0
  duration: 'scalp' | 'day' | 'swing' | 'position';
  maxOptimizationIterations: number; // default 10
  questions: string[];              // focus areas for deep research
}

// --- Backtesting ---

export interface BacktestConfig {
  strategy: StrategyConfig;
  ohlcv: OHLCV[];
  initialCapital: number;
  fees: number;                     // 0.001 = 0.1% per trade
  slippage: number;                 // 0.0005 = 0.05%
}

export interface BacktestTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  exitReason: 'signal' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'end_of_data';
  fees: number;
  decision?: DecisionRecord;
}

export interface BacktestMetrics {
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  avgWin: number;
  avgLoss: number;
  avgHoldTime: number;              // ms
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  buyAndHoldReturn: number;
  buyAndHoldReturnPercent: number;
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  config: BacktestConfig;
  trades: BacktestTrade[];
  equityCurve: { time: number; equity: number }[];
  metrics: BacktestMetrics;
  duration: number;                 // ms to compute
  timestamp: number;
}

// --- Walk-Forward Validation ---

export interface WalkForwardWindow {
  inSampleStart: number;            // index into OHLCV array
  inSampleEnd: number;
  outOfSampleStart: number;
  outOfSampleEnd: number;
}

export interface WalkForwardResult {
  windows: {
    window: WalkForwardWindow;
    inSampleMetrics: BacktestMetrics;
    outOfSampleMetrics: BacktestMetrics;
    trades: BacktestTrade[];
  }[];
  aggregateOutOfSample: BacktestMetrics;
  overfitRatio: number;             // in-sample Sharpe / out-of-sample Sharpe (>2 = likely overfit)
  totalResult: BacktestResult;
}

// --- Research Pipeline ---

export type ResearchPhaseId =
  | 'market_structure'
  | 'technical_confluence'
  | 'agent_consensus'
  | 'pattern_matching'
  | 'risk_reward'
  | 'scenario_analysis'
  | 'knowledge_integration'
  | 'strategy_synthesis';

export interface ResearchPhaseStatus {
  phase: ResearchPhaseId;
  status: 'pending' | 'running' | 'complete' | 'error';
  startedAt?: number;
  completedAt?: number;
  streamingContent?: string;        // live AI thinking text
  error?: string;
}

export interface ResearchBrief {
  phase: ResearchPhaseId;
  title: string;
  summary: string;                  // 2-3 sentence overview
  findings: string;                 // full detailed analysis
  confidence: number;               // 0-100
  keyDataPoints: string[];          // specific evidence
  decisionRecord: DecisionRecord;
  timestamp: number;
}

// --- Optimization ---

export interface OptimizationIteration {
  iteration: number;
  strategyConfig: StrategyConfig;
  backtestResult: BacktestResult;
  changes: {
    field: string;
    oldValue: string | number;
    newValue: string | number;
    reasoning: string;
  }[];
  metricsVsGoals: {
    metric: string;
    value: number;
    goal: number;
    met: boolean;
  }[];
  decisionRecord: DecisionRecord;
  timestamp: number;
}

// --- AI Supervisor & Anomaly Detection ---

export interface MarketAnomaly {
  id: string;
  type: 'volume_spike' | 'whale_move' | 'social_surge' | 'news_shock' | 'price_deviation' | 'exchange_flow';
  severity: 'low' | 'medium' | 'high' | 'critical';
  symbol: string;
  summary: string;
  data: Record<string, unknown>;
  timestamp: number;
  suggestedAction?: string;
  decisionRecord: DecisionRecord;
}

export interface SupervisorIntervention {
  id: string;
  timestamp: number;
  anomalyId?: string;               // which anomaly triggered this
  action: 'ignore' | 'alert_user' | 'tighten_stops' | 'reduce_position' | 'pause_entries' | 'emergency_exit';
  reasoning: string;
  confidence: number;
  strategyAdjustments?: {
    field: string;
    oldValue: string | number;
    newValue: string | number;
  }[];
  decisionRecord: DecisionRecord;
  outcome?: {
    wasCorrect: boolean;
    pnlImpact?: number;
  };
}

// ============================================================================
// Market Data Service
// ============================================================================

export interface DataBufferConfig {
  symbol: string;
  timeframe: string;
  maxBars: number;               // rolling buffer size (e.g., 1000)
}

export interface DataBuffer {
  symbol: string;
  timeframe: string;
  bars: OHLCV[];
  lastUpdate: number;
  isLive: boolean;               // receiving WebSocket updates
}

// ============================================================================
// Market Regime Classifier
// ============================================================================

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'unknown';

export interface RegimeClassification {
  regime: MarketRegime;
  confidence: number;            // 0-1
  adx: number;                   // ADX value (>30 = trending)
  volatilityPercentile: number;  // 0-100 percentile vs recent history
  trendStrength: number;         // -1 to 1 (neg = down, pos = up)
  atrPercent: number;            // ATR as % of price
  timestamp: number;
}

// ============================================================================
// HFT / Rule-Based Execution Engine
// ============================================================================

export type HFTEngineState = 'idle' | 'running' | 'paused' | 'cooldown' | 'stopped' | 'error';

export interface HFTConfig {
  strategy: StrategyConfig;
  mode: 'live' | 'paper';
  maxTradesPerMinute: number;    // rate limiter
  minTimeBetweenTradesMs: number; // cooldown between trades
  maxConcurrentPositions: number;
  positionSizeMode: 'fixed_usd' | 'percent_equity' | 'kelly';
  fixedSizeUsd?: number;
  percentEquity?: number;
  kellyFraction?: number;        // fractional Kelly (0.25 = quarter Kelly)
}

export interface HFTSignal {
  type: 'entry' | 'exit';
  side: 'long' | 'short';
  price: number;
  timestamp: number;
  conditionsMet: string[];       // which conditions triggered
  strength: number;              // 0-1 signal strength
}

export interface HFTTradeRecord {
  id: string;
  strategyId: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice?: number;
  size: number;
  leverage: number;
  pnl?: number;
  pnlPercent?: number;
  fees: number;
  slippage: number;
  entrySignal: HFTSignal;
  exitSignal?: HFTSignal;
  entryTime: number;
  exitTime?: number;
  exitReason?: 'signal' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'max_hold_time' | 'kill_switch';
  latencyMs: number;             // signal → order submission time
}

// ============================================================================
// Paper Trading Engine
// ============================================================================

export interface PaperAccount {
  equity: number;
  initialEquity: number;
  availableMargin: number;
  positions: PaperPosition[];
  closedTrades: PaperTrade[];
  peakEquity: number;
  currentDrawdownPercent: number;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  leverage: number;
  openedAt: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  unrealizedPnl: number;
  markPrice: number;
}

export interface PaperTrade {
  id: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  size: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  slippage: number;
  openedAt: number;
  closedAt: number;
  reason: string;
  holdDurationMs: number;
}

// ============================================================================
// Multi-Strategy Portfolio Manager
// ============================================================================

export interface StrategyAllocation {
  strategyId: string;
  strategyName: string;
  allocationPercent: number;     // % of total portfolio
  capitalUsd: number;
  currentPnl: number;
  currentPnlPercent: number;
  isActive: boolean;
  regime: MarketRegime;          // strategy's target regime
  maxDrawdownPercent: number;
  currentDrawdownPercent: number;
}

export interface PortfolioRiskState {
  totalEquity: number;
  totalDrawdownPercent: number;
  peakEquity: number;
  strategyAllocations: StrategyAllocation[];
  circuitBreakerTriggered: boolean;
  circuitBreakerReason?: string;
  portfolioHeatPercent: number;  // total exposure as % of equity
  correlationWarnings: string[]; // e.g., "BTC/USDT and ETH/USDT are 95% correlated"
}

// ============================================================================
// Notification System
// ============================================================================

export type NotificationType =
  | 'trade_executed'
  | 'kill_switch'
  | 'supervisor_intervention'
  | 'drawdown_alert'
  | 'goal_reached'
  | 'strategy_deployed'
  | 'regime_change'
  | 'error';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export type NotificationChannel = 'console' | 'webhook' | 'store';

export interface NotificationConfig {
  channels: NotificationChannel[];
  webhookUrl?: string;           // Slack / Discord / custom webhook
  minSeverity: NotificationSeverity;
  muteUntil?: number;            // timestamp — suppress notifications until
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: number;
  strategyId?: string;
  symbol?: string;
  read: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Drawdown Recovery Protocol
// ============================================================================

export type RecoveryPhase = 'normal' | 'caution' | 'reduced' | 'minimal' | 'halted';

export interface DrawdownRecoveryConfig {
  cautionThresholdPercent: number;   // e.g., 5% → scale to 75%
  reducedThresholdPercent: number;   // e.g., 10% → scale to 50%
  minimalThresholdPercent: number;   // e.g., 15% → scale to 25%
  haltedThresholdPercent: number;    // e.g., 20% → stop trading
  consecutiveLossLimit: number;      // e.g., 5 consecutive losses → pause
  cooldownMs: number;                // pause duration after hitting limit
  recoveryStepPercent: number;       // how much drawdown must recover before scaling back up
}

export interface DrawdownRecoveryState {
  phase: RecoveryPhase;
  currentDrawdownPercent: number;
  peakEquity: number;
  positionSizeMultiplier: number;   // 1.0 = normal, 0.5 = half size, etc.
  consecutiveLosses: number;
  cooldownUntil?: number;
  lastPhaseChange: number;
  recoveryHistory: {
    timestamp: number;
    fromPhase: RecoveryPhase;
    toPhase: RecoveryPhase;
    drawdownPercent: number;
    reason: string;
  }[];
}

// ============================================================================
// Exchange-Specific Model (Phemex)
// ============================================================================

export interface ExchangeModel {
  exchange: Exchange;
  fundingRateIntervalMs: number;    // 8h = 28800000 for Phemex
  currentFundingRate: number;
  nextFundingTime: number;
  makerFeePercent: number;
  takerFeePercent: number;
  minOrderSizes: Record<string, number>;  // symbol → min size
  maxLeverage: Record<string, number>;    // symbol → max leverage
  adlEnabled: boolean;
  liquidationFeePercent: number;
  maintenanceMarginPercent: number;
}

export interface FundingRateSnapshot {
  symbol: string;
  rate: number;                     // positive = longs pay shorts
  predictedRate: number;
  nextFundingTime: number;
  timestamp: number;
}

// ============================================================================
// Dynamic Slippage Model
// ============================================================================

export interface SlippageEstimate {
  baseSlippage: number;             // % — from exchange model
  volumeAdjustment: number;         // % — increases for large orders
  volatilityAdjustment: number;     // % — increases in volatile conditions
  depthAdjustment: number;          // % — increases when book is thin
  totalSlippage: number;            // sum of above
  confidence: number;               // 0-1
}

// ============================================================================
// Scanner → Strategy Pipeline
// ============================================================================

export interface ScannerOpportunity {
  symbol: string;
  score: number;                    // composite score from scanner
  regime: MarketRegime;
  suggestedStrategies: string[];    // strategy template IDs that fit
  volatility: number;
  volume24h: number;
  changePercent24h: number;
  fundingRate?: number;
  timestamp: number;
}

// ============================================================================
// Background Research Engine
// ============================================================================

export type ResearchCycleType = 'quick_scan' | 'deep_dive' | 'thesis_generation';

export interface ResearchEngineConfig {
  quickScanIntervalMs: number;       // default: 10 min — market overview, top movers
  deepDiveIntervalMs: number;        // default: 30 min — full analysis on top opportunities
  thesisIntervalMs: number;          // default: 60 min — synthesize into trading theses
  maxTheses: number;                 // max theses to accumulate (default: 50)
  maxFindings: number;               // max findings to keep (default: 200)
  maxEvents: number;                 // max upcoming events (default: 100)
  watchlistSymbols: string[];        // symbols to focus on (empty = auto-discover)
  riskProfile: RiskLevel;            // influences thesis risk parameters
  focusAreas: string[];              // e.g., 'memecoins', 'layer2', 'defi', 'macro'
}

export type ResearchEngineState = 'idle' | 'running' | 'paused' | 'error' | 'stopped';

export interface ResearchEngineStatus {
  state: ResearchEngineState;
  currentCycle: ResearchCycleType | number | null;
  lastCycleAt: string | number | null;
  nextCycleAt: string | number | null;
  activeSymbols: string[];
  findingsCount: number;
  thesesCount: number;
  startedAt?: number | null;
  lastQuickScan?: number | null;
  lastDeepDive?: number | null;
  lastThesisGen?: number | null;
  totalQuickScans?: number;
  totalDeepDives?: number;
  totalThesesGenerated?: number;
  totalFindings?: number;
  error?: string | null;
}

export interface ResearchFinding {
  id: string;
  cycle: ResearchCycleType;
  category: 'technical_setup' | 'momentum_shift' | 'volume_anomaly' | 'sentiment_change'
    | 'macro_event' | 'whale_activity' | 'funding_rate' | 'correlation_break'
    | 'new_listing' | 'social_trend' | 'regime_change' | 'divergence';
  symbol: string;
  title: string;
  summary: string;
  evidence: string[];                // specific data points
  confidence: number;                // 0-100
  urgency: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  expiresAt: number;                 // findings become stale
  data: Record<string, unknown>;     // raw data backing this finding
}

export interface TradingThesis {
  id: string;
  title: string;                     // e.g., "SOL breakout above $185 resistance"
  symbol: string;
  direction: 'long' | 'short' | 'neutral';
  timeHorizon: 'scalp' | 'day' | 'swing' | 'position';
  confidence: number;                // 0-100

  // The thesis narrative
  thesis: string;                    // 2-4 sentence core argument
  supportingEvidence: string[];      // specific data points that support
  contraEvidence: string[];          // what argues against (shows thoroughness)
  catalysts: string[];               // what could trigger the move

  // Concrete trade plan
  proposedEntry: number;
  proposedStopLoss: number;
  proposedTakeProfit: number;
  riskRewardRatio: number;
  suggestedPositionSizePercent: number;
  suggestedLeverage: number;

  // Status tracking
  status: 'draft' | 'ready' | 'deployed' | 'expired' | 'invalidated';
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  deployedStrategyId?: string;       // if the user deploys this thesis

  // Supporting research
  findingIds: string[];              // which findings contributed to this thesis
  decisionRecord: DecisionRecord;
  backtestSummary?: {                // optional backtest of the thesis conditions
    winRate: number;
    profitFactor: number;
    sampleSize: number;
    sharpeRatio: number;
  };
}

export interface UpcomingMarketEvent {
  id: string;
  title: string;                     // e.g., "FOMC Rate Decision"
  category: 'macro' | 'crypto_specific' | 'token_unlock' | 'airdrop'
    | 'hard_fork' | 'earnings' | 'regulatory' | 'exchange_listing';
  expectedDate: string;              // ISO date string
  impactAssessment: string;          // AI's assessment of market impact
  affectedSymbols: string[];         // which symbols this impacts
  expectedImpact: 'low' | 'medium' | 'high' | 'critical';
  direction: 'bullish' | 'bearish' | 'uncertain';
  confidence: number;                // 0-100
  source: string;                    // where this info came from
  timestamp: number;
}

export interface TopOpportunity {
  rank: number;
  symbol: string;
  score: number;                     // composite score 0-100
  direction: 'long' | 'short' | 'neutral';
  thesisId: string | null;           // link to full thesis if exists
  reasoning?: string;                // Axon-era: issue description
  suggestedEntry?: number;           // Axon-era: suggested entry price
  suggestedStop?: number;            // Axon-era: suggested stop loss
  suggestedTarget?: number;          // Axon-era: suggested target
  riskReward?: number;               // Axon-era: risk/reward ratio
  timeframe?: string;                // Axon-era: timeframe string
  catalysts?: string[];              // Axon-era: catalyst tags
  headline?: string;                 // one-liner why it's ranked here
  topReason?: string;                // the #1 reason to trade this
  riskRewardRatio?: number;
  confidence?: number;               // 0-100
  timeHorizon?: 'scalp' | 'day' | 'swing' | 'position';
  proposedEntry?: number;
  proposedStopLoss?: number;
  proposedTakeProfit?: number;
  findingCount?: number;             // how many findings support this
  lastUpdated?: number;
  tags?: string[];                   // e.g., ['momentum', 'SMA_crossover', 'volume_spike']
}

// --- Paper Trading (Thesis Validation) ---

export type ResearchPaperTradeStatus = 'pending' | 'open' | 'closed' | 'cancelled';

export interface ResearchPaperTrade {
  id: string;
  thesisId: string;                  // which thesis this is testing
  symbol: string;
  direction: 'long' | 'short';

  // Entry
  entryPrice: number;               // price when opened (from live market)
  entryTimestamp: number;
  positionSizeUsd: number;           // virtual position size
  leverage: number;

  // Exit targets
  stopLoss: number;
  takeProfit: number;
  trailingStopPercent?: number;

  // Current state
  status: ResearchPaperTradeStatus;
  currentPrice: number;              // last tracked price
  unrealizedPnl: number;            // current floating P&L (USD)
  unrealizedPnlPercent: number;     // current floating P&L (%)
  maxFavorableExcursion: number;    // best it ever was (MFE)
  maxAdverseExcursion: number;      // worst it ever was (MAE)

  // Exit (filled on close)
  exitPrice?: number;
  exitTimestamp?: number;
  realizedPnl?: number;
  realizedPnlPercent?: number;
  exitReason?: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'thesis_invalidated'
    | 'time_expired' | 'manual' | 'ai_intervention';

  // Journal thread
  journalEntryIds: string[];         // linked journal entries about this trade
  decisionRecord: DecisionRecord;
}

export interface PaperTradingState {
  isActive: boolean;
  virtualBalance: number;            // starting virtual balance
  currentEquity: number;             // current virtual equity
  peakEquity: number;                // highest equity reached
  totalTrades: number;
  winCount: number;
  lossCount: number;
  totalPnl: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  openTrades: ResearchPaperTrade[];
  closedTrades: ResearchPaperTrade[];
  startedAt: number | null;
}

// --- AI Internal Journal ---

export type AIJournalType =
  | 'observation'     // noticed something in the market
  | 'hypothesis'      // forming a theory
  | 'trade_idea'      // specific trade idea being considered
  | 'position_open'   // opened a paper trade — why
  | 'position_monitor'// monitoring a live position — current thinking
  | 'intervention'    // considering or taking action on a position
  | 'exit'            // closing a position — reasoning
  | 'retrospective'   // post-trade analysis — what happened and why
  | 'learning'        // distilled lesson from experience
  | 'agent_discussion'// discussion between research sub-agents
  | 'market_shift'    // noticed a regime change or macro shift
  | 'risk_alert';     // flagging a risk concern

export type JournalMood =
  | 'confident'   // strong conviction
  | 'cautious'    // proceeding carefully
  | 'curious'     // exploring an idea
  | 'concerned'   // something doesn't look right
  | 'excited'     // found something promising
  | 'frustrated'  // thesis being challenged
  | 'reflective'  // thinking about past actions
  | 'neutral';    // routine observation

export interface AIJournalEntry {
  id: string;
  type: AIJournalType;
  mood: JournalMood;
  timestamp: number;

  // Content
  title: string;                     // short headline: "Watching SOL flag formation..."
  content: string;                   // full thought — 1-4 paragraphs, conversational
  thinking?: string;                 // optional chain-of-thought (collapsed in UI)

  // Context links
  symbol?: string;                   // which symbol this relates to
  thesisId?: string;                 // linked thesis
  paperTradeId?: string;             // linked paper trade
  relatedEntryIds?: string[];        // previous journal entries this references

  // Agent attribution
  agent: string;                     // which agent/module wrote this (e.g., 'research-engine', 'sentinel', 'macro')
  replyTo?: string;                  // if this is a reply to another agent's entry

  // Metadata
  confidence?: number;               // 0-100 if applicable
  tags: string[];                    // e.g., ['SOL', 'breakout', 'volume']
  data?: Record<string, unknown>;    // any structured data backing this entry
}

// ============================================================================
// Autopilot Orchestrator Types
// ============================================================================

export type WorkflowId = 'research' | 'paper' | 'live';
export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'error';

export type OrchestratorEventType =
  | 'objective_update'
  | 'reasoning_step'
  | 'finding'
  | 'decision'
  | 'action'
  | 'progress'
  | 'workflow_status'
  | 'promotion'
  | 'error';

export interface OrchestratorEvent {
  id: string;
  type: OrchestratorEventType;
  workflow: WorkflowId;
  timestamp: number;
  data: {
    title: string;
    detail: string;
    symbol?: string;
    thesisId?: string;
    confidence?: number;
    stage?: string;
    progress?: number;
    severity?: 'info' | 'warning' | 'critical';
    [key: string]: unknown;
  };
}

export interface WorkflowState {
  enabled: boolean;
  status: WorkflowStatus;
  currentObjective: string;
  currentStage: string;
  lastActivityAt: number | null;
  recentEvents: OrchestratorEvent[];
  error: string | null;
}

export interface ResearchWorkflowMetrics {
  totalScans: number;
  totalDeepDives: number;
  totalThesesGenerated: number;
  activeFindings: number;
  readyTheses: number;
  currentCycle: string | null;
}

export interface PaperWorkflowMetrics {
  totalTrades: number;
  openTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  currentEquity: number;
  thesesTested: number;
  thesesValidated: number;
}

export interface LiveWorkflowMetrics {
  mode: 'single' | 'portfolio' | null;
  isAutoTrading: boolean;
  tickCount: number;
  openPositions: number;
  dailyPnlPercent: number;
  strategiesDeployed: number;
  isKilled: boolean;
}

export interface ThesisValidationRecord {
  id: string;
  thesisId: string;
  symbol: string;
  direction: 'long' | 'short';
  paperTradeIds: string[];
  totalTrades: number;
  winCount: number;
  winRate: number;
  profitFactor: number;
  avgPnlPercent: number;
  maxDrawdownPercent: number;
  status: 'testing' | 'validated' | 'rejected' | 'promoted';
  promotedAt?: number;
  rejectedReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromotionCriteria {
  minTrades: number;
  minWinRate: number;
  minProfitFactor: number;
  maxDrawdownPercent: number;
  requireUserApproval: boolean;
}

export interface TradingOrchestratorConfig {
  research: {
    enabled: boolean;
    quickScanIntervalMs?: number;
    deepDiveIntervalMs?: number;
    thesisIntervalMs?: number;
    agentPipelineEnabled: boolean;
  };
  paper: {
    enabled: boolean;
    virtualBalance: number;
    maxConcurrentTrades: number;
    promotionCriteria: PromotionCriteria;
  };
  live: {
    enabled: boolean;
    mode: 'single' | 'portfolio';
    onlyValidatedStrategies: boolean;
    requireUserApproval: boolean;
    heartbeatIntervalMs?: number;
    confidenceThreshold?: number;
  };
}

export interface OrchestratorState {
  isRunning: boolean;
  startedAt: number | null;
  research: WorkflowState & { metrics: ResearchWorkflowMetrics };
  paper: WorkflowState & { metrics: PaperWorkflowMetrics };
  live: WorkflowState & { metrics: LiveWorkflowMetrics };
  validationRecords: ThesisValidationRecord[];
  config: TradingOrchestratorConfig;
}
