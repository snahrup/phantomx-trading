// ============================================================================
// PhantomX — Global Trading Store (Zustand)
// ============================================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Ticker, OHLCV, OrderBook, Position, Order, Trade,
  Balance, StrategyConfig, RiskParameters, RiskLevel,
  AIMessage, ChartAnnotation, ChartAnalysis, DashboardStats,
  ChartPriceLine, ChartDrawing, DrawingTool,
  AutopilotClosedTrade, JournalEntry,
  AgentSignal, AgentStatus, AgentEvent, SignalSummary,
  EquitySnapshot,
  // Strategy lifecycle
  StrategyGoals, BacktestResult, ResearchBrief, ResearchPhaseStatus,
  OptimizationIteration, MarketAnomaly, SupervisorIntervention, DecisionRecord,
  // Research engine
  ResearchEngineStatus, ResearchFinding, TradingThesis,
  UpcomingMarketEvent, TopOpportunity,
  // Paper trading + AI journal
  PaperTradingState, ResearchPaperTrade, AIJournalEntry,
  // Orchestrator
  OrchestratorState, OrchestratorEvent, WorkflowId,
} from '@/types/trading';
import type { MissionControlConfig } from '@/types/mission-control';
import { DEFAULT_MISSION_CONFIG } from '@/types/mission-control';

// --- Risk Presets ---

export const RISK_PRESETS: Record<RiskLevel, RiskParameters> = {
  conservative: {
    level: 'conservative',
    maxPositionSizePercent: 2,
    maxDrawdownPercent: 5,
    stopLossPercent: 1,
    takeProfitPercent: 2,
    maxOpenPositions: 2,
    maxDailyLossPercent: 3,
    trailingStopPercent: 0.5,
    allowLossOfEntireAmount: false,
  },
  moderate: {
    level: 'moderate',
    maxPositionSizePercent: 5,
    maxDrawdownPercent: 10,
    stopLossPercent: 2,
    takeProfitPercent: 4,
    maxOpenPositions: 3,
    maxDailyLossPercent: 5,
    trailingStopPercent: 1,
    allowLossOfEntireAmount: false,
  },
  aggressive: {
    level: 'aggressive',
    maxPositionSizePercent: 10,
    maxDrawdownPercent: 20,
    stopLossPercent: 3,
    takeProfitPercent: 8,
    maxOpenPositions: 5,
    maxDailyLossPercent: 10,
    trailingStopPercent: 2,
    allowLossOfEntireAmount: false,
  },
  degen: {
    level: 'degen',
    maxPositionSizePercent: 25,
    maxDrawdownPercent: 50,
    stopLossPercent: 5,
    takeProfitPercent: 20,
    maxOpenPositions: 10,
    maxDailyLossPercent: 25,
    trailingStopPercent: 3,
    allowLossOfEntireAmount: true,
  },
};

// --- Pipeline State Types (shared with PipelineShowcase) ---

export interface PipelineAnalystState {
  status: 'pending' | 'running' | 'complete' | 'error';
  report: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  toolResults: Array<{ tool: string; preview: string }>;
  duration: number;
  error?: string;
}

export interface PipelineDebateTurn {
  speaker: string;
  round: number;
  content: string;
}

export interface PipelineJudgeDecision {
  decision: string;
  content: string;
  confidence: number;
}

export interface PipelineStateShape {
  stage: 'idle' | 'analysts' | 'debate' | 'risk' | 'strategy' | 'backtest' | 'done' | 'error';
  analysts: Record<string, PipelineAnalystState>;
  debate: { turns: PipelineDebateTurn[]; judge: PipelineJudgeDecision | null };
  risk: { turns: PipelineDebateTurn[]; judge: PipelineJudgeDecision | null; finalSize: string };
  strategy: { streaming: string; config: unknown | null };
  backtest: { running: boolean; metrics: unknown | null; error: string | null };
  memory: { stored: number };
  finalDecision: string | null;
  finalConfidence: number | null;
  totalDuration: number | null;
  error: string | null;
}

export function initialPipelineState(): PipelineStateShape {
  return {
    stage: 'idle',
    analysts: {
      market_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
      sentiment_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
      news_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
      fundamentals_analyst: { status: 'pending', report: '', toolCalls: [], toolResults: [], duration: 0 },
    },
    debate: { turns: [], judge: null },
    risk: { turns: [], judge: null, finalSize: '' },
    strategy: { streaming: '', config: null },
    backtest: { running: false, metrics: null, error: null },
    memory: { stored: 0 },
    finalDecision: null,
    finalConfidence: null,
    totalDuration: null,
    error: null,
  };
}

// --- Store Types ---

interface TradingState {
  // Connection
  isConnected: boolean;
  isTestnet: boolean;
  apiKey: string;
  apiSecret: string;

  // Market data
  selectedSymbol: string;
  selectedTimeframe: string;
  ticker: Ticker | null;
  ohlcv: OHLCV[];
  orderBook: OrderBook | null;

  // Account
  balances: Balance[];
  positions: Position[];
  openOrders: Order[];
  recentTrades: Trade[];
  accountValue: number;

  // Strategy
  activeStrategy: StrategyConfig | null;
  strategies: StrategyConfig[];
  riskParameters: RiskParameters;
  isExecuting: boolean;
  isPaused: boolean;
  isKilled: boolean;
  killReason: string | null;

  // AI
  aiMessages: AIMessage[];
  aiIsThinking: boolean;
  aiStreamingText: string;
  lastChartAnalysis: ChartAnalysis | null;

  // Chart
  annotations: ChartAnnotation[];
  priceLines: ChartPriceLine[];
  drawings: ChartDrawing[];
  drawingUndoStack: ChartDrawing[];

  // Drawing tool state
  activeDrawingTool: DrawingTool;
  drawingColor: string;
  drawingLineWidth: number;

  // Indicator overlays
  enabledIndicators: Record<string, boolean>;
  indicatorParams: Record<string, Record<string, number>>;
  indicatorSignals: { type: string; direction: string; strength: number; description: string }[];
  autoPatternDetection: boolean;
  lastAutoPatternTime: number;

  // Stats
  stats: DashboardStats | null;

  // Portfolio Autopilot
  autopilotMode: 'single' | 'portfolio';
  watchlist: string[];
  autopilotScanMode: 'watchlist' | 'full_scan';
  autopilotInterval: number;
  autopilotAutoTrade: boolean;
  autopilotClosedTrades: AutopilotClosedTrade[];
  autopilotCumulativePnl: number;
  autopilotSessionStartEquity: number;
  autopilotStatusMessage: string;

  // Trading Journal
  journalEntries: JournalEntry[];
  journalDaySummary: string | null;

  // Multi-Agent Intelligence
  agentSignals: AgentSignal[];
  agentStatuses: AgentStatus[];
  signalConsensus: SignalSummary | null;
  agentEvents: AgentEvent[];
  knowledgeCount: number;

  // Dashboard Analytics
  equitySnapshots: EquitySnapshot[];
  lastSnapshotTime: number;

  // Strategy Lifecycle
  researchPhase: 'idle' | 'defining' | 'researching' | 'backtesting' | 'optimizing' | 'ready' | 'deployed';
  researchBriefs: ResearchBrief[];
  researchPhaseStatuses: ResearchPhaseStatus[];
  currentBacktestResult: BacktestResult | null;
  backtestHistory: BacktestResult[];
  optimizationIterations: OptimizationIteration[];
  strategyGoals: StrategyGoals | null;
  deployedStrategy: StrategyConfig | null;

  // AI Supervisor
  supervisorActive: boolean;
  supervisorInterventions: SupervisorIntervention[];
  marketAnomalies: MarketAnomaly[];
  strategyHealthScore: number;

  // Decision Audit Trail
  decisionLog: DecisionRecord[];

  // Background Research Engine
  researchEngineStatus: ResearchEngineStatus | null;
  researchFindings: ResearchFinding[];
  tradingTheses: TradingThesis[];
  upcomingEvents: UpcomingMarketEvent[];
  topOpportunities: TopOpportunity[];
  selectedThesisId: string | null;

  // Paper Trading + AI Journal
  paperTradingState: PaperTradingState | null;
  paperTrades: ResearchPaperTrade[];
  aiJournal: AIJournalEntry[];
  selectedJournalEntryId: string | null;

  // Orchestrator
  orchestratorState: OrchestratorState | null;
  orchestratorEvents: OrchestratorEvent[];
  workflowToggles: { research: boolean; paper: boolean; live: boolean };

  // Agents Pipeline (NOT persisted — transient streaming state)
  pipelineState: PipelineStateShape;
  pipelineRunning: boolean;
  pipelineSymbol: string | null;

  // UI
  theme: 'light' | 'dark';
  activePanelTab: 'chart' | 'orders' | 'positions' | 'history';
  viewMode: 'trading' | 'dashboard' | 'intelligence';
  sidePanel: 'ai' | 'strategy' | 'risk' | 'settings' | 'journal' | 'agents' | 'signals';
  sidebarMode: 'docked' | 'floating' | 'minimized';
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  aiPanelMode: 'hidden' | 'floating' | 'fullpage';
  showPineScriptModal: boolean;
  generatedPineScript: string;

  // Mission Control
  missionControlConfig: MissionControlConfig;
  focusedPositionSymbol: string | null;
  isFeedCollapsed: boolean;
  setMissionControlConfig: (config: Partial<MissionControlConfig>) => void;
  setFocusedPositionSymbol: (symbol: string | null) => void;
  setIsFeedCollapsed: (collapsed: boolean) => void;

  // Actions
  setConnection: (apiKey: string, apiSecret: string, testnet: boolean) => void;
  setConnected: (connected: boolean) => void;
  setSymbol: (symbol: string) => void;
  setTimeframe: (tf: string) => void;
  setTicker: (ticker: Ticker) => void;
  setOHLCV: (data: OHLCV[]) => void;
  appendOHLCV: (candle: OHLCV) => void;
  setOrderBook: (ob: OrderBook) => void;
  setBalances: (balances: Balance[]) => void;
  setPositions: (positions: Position[]) => void;
  setOpenOrders: (orders: Order[]) => void;
  setRecentTrades: (trades: Trade[]) => void;
  setAccountValue: (value: number) => void;

  setActiveStrategy: (strategy: StrategyConfig | null) => void;
  addStrategy: (strategy: StrategyConfig) => void;
  removeStrategy: (id: string) => void;
  setRiskParameters: (risk: RiskParameters) => void;
  setRiskLevel: (level: RiskLevel) => void;
  setExecuting: (executing: boolean) => void;
  setPaused: (paused: boolean) => void;
  setKilled: (killed: boolean, reason?: string) => void;

  addAIMessage: (message: AIMessage) => void;
  setAIThinking: (thinking: boolean) => void;
  setAIStreamingText: (text: string) => void;
  appendAIStreamingText: (chunk: string) => void;
  setChartAnalysis: (analysis: ChartAnalysis) => void;

  addAnnotation: (annotation: ChartAnnotation) => void;
  clearAnnotations: () => void;
  setStats: (stats: DashboardStats) => void;

  // Price lines (AI-driven S/R levels)
  addPriceLine: (line: ChartPriceLine) => void;
  removePriceLine: (id: string) => void;
  clearPriceLines: (source?: ChartPriceLine['source']) => void;
  setPriceLinesFromAnalysis: (analysis: ChartAnalysis) => void;

  // Drawings (trendlines, fibonacci, etc.)
  addDrawing: (drawing: ChartDrawing) => void;
  updateDrawing: (id: string, updates: Partial<ChartDrawing>) => void;
  removeDrawing: (id: string) => void;
  clearDrawings: (source?: 'manual' | 'ai') => void;
  undoDrawing: () => void;
  redoDrawing: () => void;

  // Drawing tool state
  setActiveDrawingTool: (tool: DrawingTool) => void;
  setDrawingColor: (color: string) => void;
  setDrawingLineWidth: (width: number) => void;

  // Indicator overlays
  toggleIndicator: (key: string) => void;
  setIndicatorParam: (indicatorKey: string, paramName: string, value: number) => void;
  setIndicatorSignals: (signals: { type: string; direction: string; strength: number; description: string }[]) => void;
  setAutoPatternDetection: (enabled: boolean) => void;
  setLastAutoPatternTime: (time: number) => void;

  setAutopilotMode: (mode: 'single' | 'portfolio') => void;
  setWatchlist: (symbols: string[]) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  setAutopilotScanMode: (mode: 'watchlist' | 'full_scan') => void;
  setAutopilotInterval: (ms: number) => void;
  setAutopilotAutoTrade: (enabled: boolean) => void;
  addAutopilotClosedTrade: (trade: AutopilotClosedTrade) => void;
  setAutopilotPnl: (pnl: number) => void;
  setAutopilotSessionStartEquity: (equity: number) => void;
  setAutopilotStatusMessage: (message: string) => void;
  resetAutopilotPnl: () => void;

  // Journal
  addJournalEntry: (entry: JournalEntry) => void;
  setJournalDaySummary: (summary: string) => void;
  clearJournalEntries: () => void;

  // Multi-Agent Intelligence
  setAgentSignals: (signals: AgentSignal[]) => void;
  setAgentStatuses: (statuses: AgentStatus[]) => void;
  setSignalConsensus: (consensus: SignalSummary | null) => void;
  addAgentEvent: (event: AgentEvent) => void;
  setKnowledgeCount: (count: number) => void;

  addEquitySnapshot: (snapshot: EquitySnapshot) => void;

  // Strategy Lifecycle
  setResearchPhase: (phase: TradingState['researchPhase']) => void;
  addResearchBrief: (brief: ResearchBrief) => void;
  clearResearchBriefs: () => void;
  setResearchPhaseStatuses: (statuses: ResearchPhaseStatus[]) => void;
  updateResearchPhaseStatus: (phase: ResearchPhaseStatus['phase'], updates: Partial<ResearchPhaseStatus>) => void;
  setCurrentBacktestResult: (result: BacktestResult | null) => void;
  addBacktestToHistory: (result: BacktestResult) => void;
  clearBacktestHistory: () => void;
  addOptimizationIteration: (iteration: OptimizationIteration) => void;
  clearOptimizationIterations: () => void;
  setStrategyGoals: (goals: StrategyGoals | null) => void;
  setDeployedStrategy: (strategy: StrategyConfig | null) => void;

  // AI Supervisor
  setSupervisorActive: (active: boolean) => void;
  addSupervisorIntervention: (intervention: SupervisorIntervention) => void;
  addMarketAnomaly: (anomaly: MarketAnomaly) => void;
  clearMarketAnomalies: () => void;
  setStrategyHealthScore: (score: number) => void;

  // Decision Audit Trail
  addDecisionRecord: (record: DecisionRecord) => void;
  clearDecisionLog: () => void;

  // Background Research Engine
  setResearchEngineStatus: (status: ResearchEngineStatus | null) => void;
  setResearchFindings: (findings: ResearchFinding[]) => void;
  addResearchFinding: (finding: ResearchFinding) => void;
  setTradingTheses: (theses: TradingThesis[]) => void;
  addTradingThesis: (thesis: TradingThesis) => void;
  setUpcomingEvents: (events: UpcomingMarketEvent[]) => void;
  setTopOpportunities: (opportunities: TopOpportunity[]) => void;
  setSelectedThesisId: (id: string | null) => void;

  // Paper Trading + AI Journal
  setPaperTradingState: (state: PaperTradingState | null) => void;
  setPaperTrades: (trades: ResearchPaperTrade[]) => void;
  addPaperTrade: (trade: ResearchPaperTrade) => void;
  updatePaperTrade: (id: string, updates: Partial<ResearchPaperTrade>) => void;
  setAIJournal: (entries: AIJournalEntry[]) => void;
  addAIJournalEntry: (entry: AIJournalEntry) => void;
  setSelectedJournalEntryId: (id: string | null) => void;

  // Orchestrator
  setOrchestratorState: (state: OrchestratorState | null) => void;
  addOrchestratorEvent: (event: OrchestratorEvent) => void;
  setOrchestratorEvents: (events: OrchestratorEvent[]) => void;
  setWorkflowToggle: (workflow: WorkflowId, enabled: boolean) => void;

  // Agents Pipeline
  setPipelineState: (state: PipelineStateShape) => void;
  updatePipelineState: (updater: (prev: PipelineStateShape) => PipelineStateShape) => void;
  setPipelineRunning: (running: boolean) => void;
  setPipelineSymbol: (symbol: string | null) => void;
  resetPipeline: () => void;

  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setActivePanelTab: (tab: TradingState['activePanelTab']) => void;
  setViewMode: (mode: TradingState['viewMode']) => void;
  setSidePanel: (panel: TradingState['sidePanel']) => void;
  setSidebarMode: (mode: TradingState['sidebarMode']) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setAiPanelMode: (mode: TradingState['aiPanelMode']) => void;
  setShowPineScriptModal: (show: boolean) => void;
  setGeneratedPineScript: (code: string) => void;
}

export const useTradingStore = create<TradingState>()(
  persist(
    (set) => ({
  // Connection
  isConnected: false,
  isTestnet: true,
  apiKey: '',
  apiSecret: '',

  // Market data
  selectedSymbol: 'BTC/USDT:USDT',
  selectedTimeframe: '4h',
  ticker: null,
  ohlcv: [],
  orderBook: null,

  // Account
  balances: [],
  positions: [],
  openOrders: [],
  recentTrades: [],
  accountValue: 0,

  // Strategy
  activeStrategy: null,
  strategies: [],
  riskParameters: RISK_PRESETS.aggressive,
  isExecuting: false,
  isPaused: false,
  isKilled: false,
  killReason: null,

  // AI
  aiMessages: [],
  aiIsThinking: false,
  aiStreamingText: '',
  lastChartAnalysis: null,

  // Chart
  annotations: [],
  priceLines: [],
  drawings: [],
  drawingUndoStack: [],

  // Drawing tool state
  activeDrawingTool: 'select',
  drawingColor: '#AE5630',
  drawingLineWidth: 2,

  // Indicator overlays
  enabledIndicators: { sma20: true, sma50: true },
  indicatorParams: {},
  indicatorSignals: [],
  autoPatternDetection: true,
  lastAutoPatternTime: 0,

  // Stats
  stats: null,

  // Portfolio Autopilot
  autopilotMode: 'portfolio',
  watchlist: ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'],
  autopilotScanMode: 'watchlist',
  autopilotInterval: 60000,
  autopilotAutoTrade: false,
  autopilotClosedTrades: [],
  autopilotCumulativePnl: 0,
  autopilotSessionStartEquity: 0,
  autopilotStatusMessage: '',

  // Trading Journal
  journalEntries: [],
  journalDaySummary: null,

  // Dashboard Analytics
  equitySnapshots: [],
  lastSnapshotTime: 0,

  // Strategy Lifecycle
  researchPhase: 'idle',
  researchBriefs: [],
  researchPhaseStatuses: [],
  currentBacktestResult: null,
  backtestHistory: [],
  optimizationIterations: [],
  strategyGoals: null,
  deployedStrategy: null,

  // AI Supervisor
  supervisorActive: false,
  supervisorInterventions: [],
  marketAnomalies: [],
  strategyHealthScore: 100,

  // Decision Audit Trail
  decisionLog: [],

  // Background Research Engine
  researchEngineStatus: null,
  researchFindings: [],
  tradingTheses: [],
  upcomingEvents: [],
  topOpportunities: [],
  selectedThesisId: null,

  // Paper Trading + AI Journal
  paperTradingState: null,
  paperTrades: [],
  aiJournal: [],
  selectedJournalEntryId: null,

  // Orchestrator
  orchestratorState: null,
  orchestratorEvents: [],
  workflowToggles: { research: true, paper: true, live: true },

  // Agents Pipeline (transient — not persisted)
  pipelineState: initialPipelineState(),
  pipelineRunning: false,
  pipelineSymbol: null,

  // UI
  theme: 'light',
  activePanelTab: 'chart',
  viewMode: 'trading' as const,
  sidePanel: 'ai' as const,
  sidebarMode: 'docked' as const,
  sidebarWidth: 380,
  sidebarCollapsed: false,
  aiPanelMode: 'hidden' as const,
  showPineScriptModal: false,
  generatedPineScript: '',

  // Mission Control
  missionControlConfig: DEFAULT_MISSION_CONFIG,
  focusedPositionSymbol: null,
  isFeedCollapsed: false,
  setMissionControlConfig: (config) => set((state) => ({
    missionControlConfig: { ...state.missionControlConfig, ...config },
  })),
  setFocusedPositionSymbol: (symbol) => set({ focusedPositionSymbol: symbol }),
  setIsFeedCollapsed: (collapsed) => set({ isFeedCollapsed: collapsed }),

  // Actions
  setConnection: (apiKey, apiSecret, testnet) => set({ apiKey, apiSecret, isTestnet: testnet }),
  setConnected: (isConnected) => set({ isConnected }),
  setSymbol: (selectedSymbol) => set({ selectedSymbol, ohlcv: [], annotations: [] }),
  setTimeframe: (selectedTimeframe) => set({ selectedTimeframe, ohlcv: [] }),
  setTicker: (ticker) => set({ ticker }),
  setOHLCV: (ohlcv) => set({ ohlcv }),
  appendOHLCV: (candle) => set((s) => {
    const len = s.ohlcv.length;
    if (len > 0 && s.ohlcv[len - 1].timestamp === candle.timestamp) {
      // Update last candle in-place without copying entire array
      const updated = s.ohlcv.slice();
      updated[len - 1] = candle;
      return { ohlcv: updated };
    }
    // Append and cap at 500 to prevent unbounded growth
    const trimmed = len >= 500 ? s.ohlcv.slice(-499) : s.ohlcv;
    return { ohlcv: [...trimmed, candle] };
  }),
  setOrderBook: (orderBook) => set({ orderBook }),
  setBalances: (balances) => set({ balances }),
  setPositions: (positions) => set({ positions }),
  setOpenOrders: (openOrders) => set({ openOrders }),
  setRecentTrades: (recentTrades) => set({ recentTrades }),
  setAccountValue: (accountValue) => set({ accountValue }),

  setActiveStrategy: (activeStrategy) => set({ activeStrategy }),
  addStrategy: (strategy) => set((s) => ({ strategies: [...s.strategies, strategy] })),
  removeStrategy: (id) => set((s) => ({ strategies: s.strategies.filter(st => st.id !== id) })),
  setRiskParameters: (riskParameters) => set({ riskParameters }),
  setRiskLevel: (level) => set({ riskParameters: RISK_PRESETS[level] }),
  setExecuting: (isExecuting) => set({ isExecuting }),
  setPaused: (isPaused) => set({ isPaused }),
  setKilled: (isKilled, killReason) => set({ isKilled, killReason: killReason ?? null }),

  addAIMessage: (message) => set((s) => ({
    aiMessages: [...s.aiMessages.slice(-199), message],
  })),
  setAIThinking: (aiIsThinking) => set({ aiIsThinking }),
  setAIStreamingText: (aiStreamingText) => set({ aiStreamingText }),
  appendAIStreamingText: (chunk) => set((s) => ({ aiStreamingText: s.aiStreamingText + chunk })),
  setChartAnalysis: (lastChartAnalysis) => set({ lastChartAnalysis }),

  addAnnotation: (annotation) => set((s) => ({ annotations: [...s.annotations.slice(-99), annotation] })),
  clearAnnotations: () => set({ annotations: [] }),
  setStats: (stats) => set({ stats }),

  // Price lines
  addPriceLine: (line) => set((s) => ({ priceLines: [...s.priceLines.slice(-49), line] })),
  removePriceLine: (id) => set((s) => ({ priceLines: s.priceLines.filter(l => l.id !== id) })),
  clearPriceLines: (source) => set((s) => ({
    priceLines: source ? s.priceLines.filter(l => l.source !== source) : [],
  })),
  setPriceLinesFromAnalysis: (analysis) => set((s) => {
    // Remove old AI analysis lines, keep manual + engine lines
    const kept = s.priceLines.filter(l => l.source !== 'ai_analysis');
    const newLines: ChartPriceLine[] = (analysis.keyLevels ?? []).map((level, i) => ({
      id: `ai-analysis-${Date.now()}-${i}`,
      price: Number(level.price),
      color: level.type === 'support' ? '#5FB87A' : level.type === 'resistance' ? '#E05555' : '#D4A84A',
      lineWidth: 2,
      lineStyle: 'dashed' as const,
      label: `${level.type.charAt(0).toUpperCase() + level.type.slice(1)} $${level.price.toLocaleString()}`,
      source: 'ai_analysis' as const,
      type: level.type as ChartPriceLine['type'],
      axisLabelVisible: true,
      timestamp: Date.now(),
    }));
    return { priceLines: [...kept, ...newLines] };
  }),

  // Drawings
  addDrawing: (drawing) => set((s) => ({ drawings: [...s.drawings, drawing], drawingUndoStack: [] })),
  updateDrawing: (id, updates) => set((s) => ({
    drawings: s.drawings.map(d => d.id === id ? { ...d, ...updates } : d),
  })),
  removeDrawing: (id) => set((s) => {
    const removed = s.drawings.find(d => d.id === id);
    return {
      drawings: s.drawings.filter(d => d.id !== id),
      drawingUndoStack: removed ? [...s.drawingUndoStack, removed] : s.drawingUndoStack,
    };
  }),
  clearDrawings: (source) => set((s) => ({
    drawings: source ? s.drawings.filter(d => d.source !== source) : [],
    drawingUndoStack: [],
  })),
  undoDrawing: () => set((s) => {
    if (s.drawings.length === 0) return s;
    const last = s.drawings[s.drawings.length - 1];
    return {
      drawings: s.drawings.slice(0, -1),
      drawingUndoStack: [...s.drawingUndoStack, last],
    };
  }),
  redoDrawing: () => set((s) => {
    if (s.drawingUndoStack.length === 0) return s;
    const last = s.drawingUndoStack[s.drawingUndoStack.length - 1];
    return {
      drawings: [...s.drawings, last],
      drawingUndoStack: s.drawingUndoStack.slice(0, -1),
    };
  }),

  // Drawing tool state
  setActiveDrawingTool: (activeDrawingTool) => set({ activeDrawingTool }),
  setDrawingColor: (drawingColor) => set({ drawingColor }),
  setDrawingLineWidth: (drawingLineWidth) => set({ drawingLineWidth }),

  // Indicator overlays
  toggleIndicator: (key) => set((s) => ({
    enabledIndicators: { ...s.enabledIndicators, [key]: !s.enabledIndicators[key] },
  })),
  setIndicatorParam: (indicatorKey, paramName, value) => set((s) => ({
    indicatorParams: {
      ...s.indicatorParams,
      [indicatorKey]: { ...s.indicatorParams[indicatorKey], [paramName]: value },
    },
  })),
  setIndicatorSignals: (indicatorSignals) => set({ indicatorSignals }),
  setAutoPatternDetection: (autoPatternDetection) => set({ autoPatternDetection }),
  setLastAutoPatternTime: (lastAutoPatternTime) => set({ lastAutoPatternTime }),

  setAutopilotMode: (autopilotMode) => set({ autopilotMode }),
  setWatchlist: (watchlist) => set({ watchlist }),
  addToWatchlist: (symbol) => set((s) => ({
    watchlist: s.watchlist.includes(symbol) ? s.watchlist : [...s.watchlist, symbol],
  })),
  removeFromWatchlist: (symbol) => set((s) => ({
    watchlist: s.watchlist.filter(s2 => s2 !== symbol),
  })),
  setAutopilotScanMode: (autopilotScanMode) => set({ autopilotScanMode }),
  setAutopilotInterval: (autopilotInterval) => set({ autopilotInterval }),
  setAutopilotAutoTrade: (autopilotAutoTrade) => set({ autopilotAutoTrade }),
  addAutopilotClosedTrade: (trade) => set((s) => ({
    autopilotClosedTrades: [...s.autopilotClosedTrades.slice(-499), trade],
    autopilotCumulativePnl: s.autopilotCumulativePnl + trade.realizedPnl,
  })),
  setAutopilotPnl: (autopilotCumulativePnl) => set({ autopilotCumulativePnl }),
  setAutopilotSessionStartEquity: (autopilotSessionStartEquity) => set({ autopilotSessionStartEquity }),
  setAutopilotStatusMessage: (autopilotStatusMessage: string) => set({ autopilotStatusMessage }),
  resetAutopilotPnl: () => set({ autopilotClosedTrades: [], autopilotCumulativePnl: 0, autopilotSessionStartEquity: 0 }),

  // Multi-Agent Intelligence
  agentSignals: [],
  agentStatuses: [],
  signalConsensus: null,
  agentEvents: [],
  knowledgeCount: 0,
  setAgentSignals: (agentSignals) => set({ agentSignals }),
  setAgentStatuses: (agentStatuses) => set({ agentStatuses }),
  setSignalConsensus: (signalConsensus) => set({ signalConsensus }),
  addAgentEvent: (event) => set((s) => ({
    agentEvents: [...s.agentEvents.slice(-49), event],
  })),
  setKnowledgeCount: (knowledgeCount) => set({ knowledgeCount }),

  // Journal
  addJournalEntry: (entry) => set((s) => ({ journalEntries: [...s.journalEntries.slice(-199), entry] })),
  setJournalDaySummary: (journalDaySummary) => set({ journalDaySummary }),
  clearJournalEntries: () => set({ journalEntries: [], journalDaySummary: null }),

  addEquitySnapshot: (snapshot) => set((s) => {
    // Throttle: only record every 60s min
    if (snapshot.timestamp - s.lastSnapshotTime < 60000) return s;
    return {
      equitySnapshots: [...s.equitySnapshots.slice(-499), snapshot],
      lastSnapshotTime: snapshot.timestamp,
    };
  }),

  // Strategy Lifecycle
  setResearchPhase: (researchPhase) => set({ researchPhase }),
  addResearchBrief: (brief) => set((s) => ({ researchBriefs: [...s.researchBriefs, brief] })),
  clearResearchBriefs: () => set({ researchBriefs: [], researchPhaseStatuses: [] }),
  setResearchPhaseStatuses: (researchPhaseStatuses) => set({ researchPhaseStatuses }),
  updateResearchPhaseStatus: (phase, updates) => set((s) => ({
    researchPhaseStatuses: s.researchPhaseStatuses.map(p =>
      p.phase === phase ? { ...p, ...updates } : p
    ),
  })),
  setCurrentBacktestResult: (currentBacktestResult) => set({ currentBacktestResult }),
  addBacktestToHistory: (result) => set((s) => ({
    backtestHistory: [...s.backtestHistory.slice(-19), result],
    currentBacktestResult: result,
  })),
  clearBacktestHistory: () => set({ backtestHistory: [], currentBacktestResult: null }),
  addOptimizationIteration: (iteration) => set((s) => ({
    optimizationIterations: [...s.optimizationIterations, iteration],
  })),
  clearOptimizationIterations: () => set({ optimizationIterations: [] }),
  setStrategyGoals: (strategyGoals) => set({ strategyGoals }),
  setDeployedStrategy: (deployedStrategy) => set({ deployedStrategy }),

  // AI Supervisor
  setSupervisorActive: (supervisorActive) => set({ supervisorActive }),
  addSupervisorIntervention: (intervention) => set((s) => ({
    supervisorInterventions: [...s.supervisorInterventions.slice(-99), intervention],
  })),
  addMarketAnomaly: (anomaly) => set((s) => ({
    marketAnomalies: [...s.marketAnomalies.slice(-99), anomaly],
  })),
  clearMarketAnomalies: () => set({ marketAnomalies: [] }),
  setStrategyHealthScore: (strategyHealthScore) => set({ strategyHealthScore }),

  // Decision Audit Trail
  addDecisionRecord: (record) => set((s) => ({
    decisionLog: [...s.decisionLog.slice(-499), record],
  })),
  clearDecisionLog: () => set({ decisionLog: [] }),

  // Background Research Engine
  setResearchEngineStatus: (researchEngineStatus) => set({ researchEngineStatus }),
  setResearchFindings: (researchFindings) => set({ researchFindings: researchFindings.slice(-200) }),
  addResearchFinding: (finding) => set((s) => ({
    researchFindings: [...s.researchFindings.slice(-199), finding],
  })),
  setTradingTheses: (tradingTheses) => set({ tradingTheses: tradingTheses.slice(-50) }),
  addTradingThesis: (thesis) => set((s) => ({
    tradingTheses: [...s.tradingTheses.slice(-49), thesis],
  })),
  setUpcomingEvents: (upcomingEvents) => set({ upcomingEvents: upcomingEvents.slice(-100) }),
  setTopOpportunities: (topOpportunities) => set({ topOpportunities }),
  setSelectedThesisId: (selectedThesisId) => set({ selectedThesisId }),

  // Paper Trading + AI Journal
  setPaperTradingState: (paperTradingState) => set({ paperTradingState }),
  setPaperTrades: (paperTrades) => set({ paperTrades: paperTrades.slice(-200) }),
  addPaperTrade: (trade) => set((s) => ({
    paperTrades: [...s.paperTrades.slice(-199), trade],
  })),
  updatePaperTrade: (id, updates) => set((s) => ({
    paperTrades: s.paperTrades.map(t => t.id === id ? { ...t, ...updates } : t),
  })),
  setAIJournal: (aiJournal) => set({ aiJournal: aiJournal.slice(-300) }),
  addAIJournalEntry: (entry) => set((s) => ({
    aiJournal: [...s.aiJournal.slice(-299), entry],
  })),
  setSelectedJournalEntryId: (selectedJournalEntryId) => set({ selectedJournalEntryId }),

  // Orchestrator
  setOrchestratorState: (orchestratorState) => set({ orchestratorState }),
  addOrchestratorEvent: (event) => set((s) => ({
    orchestratorEvents: [...s.orchestratorEvents.slice(-99), event],
  })),
  setOrchestratorEvents: (orchestratorEvents) => set({ orchestratorEvents: orchestratorEvents.slice(-100) }),
  setWorkflowToggle: (workflow, enabled) => set((s) => ({
    workflowToggles: { ...s.workflowToggles, [workflow]: enabled },
  })),

  // Agents Pipeline
  setPipelineState: (pipelineState) => set({ pipelineState }),
  updatePipelineState: (updater) => set((s) => ({ pipelineState: updater(s.pipelineState) })),
  setPipelineRunning: (pipelineRunning) => set({ pipelineRunning }),
  setPipelineSymbol: (pipelineSymbol) => set({ pipelineSymbol }),
  resetPipeline: () => set({ pipelineState: initialPipelineState(), pipelineRunning: false, pipelineSymbol: null }),

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setActivePanelTab: (activePanelTab) => set({ activePanelTab }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSidePanel: (sidePanel) => set({ sidePanel }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(280, Math.min(700, width)) }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setAiPanelMode: (aiPanelMode) => set({ aiPanelMode }),
  setShowPineScriptModal: (showPineScriptModal) => set({ showPineScriptModal }),
  setGeneratedPineScript: (generatedPineScript) => set({ generatedPineScript }),
}),
    {
      name: 'phantomx-trading-store',
      version: 15, // v15: Orchestrator workflow toggles
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // NOTE: apiKey/apiSecret intentionally NOT persisted — stored in .env.local
        // Persist theme preference
        theme: state.theme,
        // Persist network preference only
        isTestnet: state.isTestnet,
        // Persist risk configuration
        riskParameters: state.riskParameters,
        // Persist selected symbol/timeframe
        selectedSymbol: state.selectedSymbol,
        selectedTimeframe: state.selectedTimeframe,
        // Persist AI conversation
        aiMessages: state.aiMessages,
        // Persist kill switch state (CRITICAL — cannot be circumvented by F5)
        isKilled: state.isKilled,
        killReason: state.killReason,
        // Persist chart annotations
        annotations: state.annotations,
        // Persist price lines and drawings
        priceLines: state.priceLines,
        drawings: state.drawings,
        // Persist generated PineScript
        generatedPineScript: state.generatedPineScript,
        // Persist indicator preferences
        enabledIndicators: state.enabledIndicators,
        indicatorParams: state.indicatorParams,
        autoPatternDetection: state.autoPatternDetection,
        // Persist portfolio autopilot preferences
        autopilotMode: state.autopilotMode,
        watchlist: state.watchlist,
        autopilotScanMode: state.autopilotScanMode,
        autopilotInterval: state.autopilotInterval,
        autopilotAutoTrade: state.autopilotAutoTrade,
        // Persist autopilot PnL tracking
        autopilotClosedTrades: state.autopilotClosedTrades,
        autopilotCumulativePnl: state.autopilotCumulativePnl,
        autopilotSessionStartEquity: state.autopilotSessionStartEquity,
        // Persist trading journal
        journalEntries: state.journalEntries,
        journalDaySummary: state.journalDaySummary,
        // Persist equity history for dashboard
        equitySnapshots: state.equitySnapshots,
        lastSnapshotTime: state.lastSnapshotTime,
        // Persist sidebar + AI panel preferences
        viewMode: state.viewMode,
        sidePanel: state.sidePanel,
        sidebarMode: state.sidebarMode,
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        aiPanelMode: state.aiPanelMode,
        // Persist strategy lifecycle
        researchPhase: state.researchPhase,
        researchBriefs: state.researchBriefs,
        currentBacktestResult: state.currentBacktestResult,
        backtestHistory: state.backtestHistory,
        optimizationIterations: state.optimizationIterations,
        strategyGoals: state.strategyGoals,
        deployedStrategy: state.deployedStrategy,
        // Persist supervisor state
        supervisorInterventions: state.supervisorInterventions,
        // Persist decision audit trail
        decisionLog: state.decisionLog,
        // Persist research engine data (theses survive page refresh)
        tradingTheses: state.tradingTheses,
        topOpportunities: state.topOpportunities,
        upcomingEvents: state.upcomingEvents,
        // NOTE: researchFindings NOT persisted — they're transient and expire
        // Persist paper trading results + AI journal
        paperTradingState: state.paperTradingState,
        paperTrades: state.paperTrades,
        aiJournal: state.aiJournal,
        // Persist orchestrator workflow toggles
        workflowToggles: state.workflowToggles,
      }),
      migrate: (persistedState, version) => {
        // v2: Clear stale apiKey/apiSecret that leaked into localStorage
        if (version < 2) {
          const s = persistedState as Record<string, unknown>;
          delete s.apiKey;
          delete s.apiSecret;
        }
        // v6: Add trading journal
        if (version < 6) {
          const s = persistedState as Record<string, unknown>;
          if (!s.journalEntries) s.journalEntries = [];
          if (!s.journalDaySummary) s.journalDaySummary = null;
        }
        // v7: Autopilot settings in chat, remove autopilot tab
        if (version < 7) {
          const s = persistedState as Record<string, unknown>;
          if (!s.autopilotInterval) s.autopilotInterval = 60000;
          if (s.autopilotAutoTrade === undefined) s.autopilotAutoTrade = false;
          // Migrate sidePanel away from removed 'autopilot' tab
          if (s.sidePanel === 'autopilot') s.sidePanel = 'ai';
        }
        // v8: Multi-agent intelligence system
        if (version < 8) {
          const s = persistedState as Record<string, unknown>;
          if (!s.agentSignals) s.agentSignals = [];
          if (!s.knowledgeCount) s.knowledgeCount = 0;
        }
        // v9: Dashboard analytics + equity tracking
        if (version < 9) {
          const s = persistedState as Record<string, unknown>;
          if (!s.equitySnapshots) s.equitySnapshots = [];
          if (!s.lastSnapshotTime) s.lastSnapshotTime = 0;
        }
        // v10: Multi-page UI rebuild — remove old sidebar state, add new
        if (version < 10) {
          const s = persistedState as Record<string, unknown>;
          delete s.viewMode;
          delete s.sidePanel;
          delete s.sidebarMode;
          delete s.sidebarWidth;
          if (s.sidebarCollapsed === undefined) s.sidebarCollapsed = false;
          if (!s.aiPanelMode) s.aiPanelMode = 'hidden';
        }
        // v11: Restore integrated command center — bring back sidebar/view state
        if (version < 11) {
          const s = persistedState as Record<string, unknown>;
          if (!s.viewMode) s.viewMode = 'trading';
          if (!s.sidePanel) s.sidePanel = 'ai';
          if (!s.sidebarMode) s.sidebarMode = 'docked';
          if (!s.sidebarWidth) s.sidebarWidth = 380;
        }
        // v12: Strategy lifecycle engine + AI supervisor + decision audit trail
        if (version < 12) {
          const s = persistedState as Record<string, unknown>;
          if (!s.researchPhase) s.researchPhase = 'idle';
          if (!s.researchBriefs) s.researchBriefs = [];
          if (!s.researchPhaseStatuses) s.researchPhaseStatuses = [];
          if (!s.currentBacktestResult) s.currentBacktestResult = null;
          if (!s.backtestHistory) s.backtestHistory = [];
          if (!s.optimizationIterations) s.optimizationIterations = [];
          if (!s.strategyGoals) s.strategyGoals = null;
          if (!s.deployedStrategy) s.deployedStrategy = null;
          if (s.supervisorActive === undefined) s.supervisorActive = false;
          if (!s.supervisorInterventions) s.supervisorInterventions = [];
          if (!s.marketAnomalies) s.marketAnomalies = [];
          if (!s.strategyHealthScore) s.strategyHealthScore = 100;
          if (!s.decisionLog) s.decisionLog = [];
        }
        // v14: Paper trading engine + AI journal
        if (version < 14) {
          const s = persistedState as Record<string, unknown>;
          if (!s.paperTradingState) s.paperTradingState = null;
          if (!s.paperTrades) s.paperTrades = [];
          if (!s.aiJournal) s.aiJournal = [];
          if (!s.selectedJournalEntryId) s.selectedJournalEntryId = null;
        }
        // v15: Orchestrator workflow toggles
        if (version < 15) {
          const s = persistedState as Record<string, unknown>;
          if (!s.workflowToggles) s.workflowToggles = { research: true, paper: true, live: true };
          if (!s.orchestratorState) s.orchestratorState = null;
          if (!s.orchestratorEvents) s.orchestratorEvents = [];
        }
        return persistedState as TradingState;
      },
      // No auto-connect — ConnectionSetup handles the full flow with proper UX feedback
    }
  )
);
