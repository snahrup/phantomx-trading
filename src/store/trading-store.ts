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
} from '@/types/trading';

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

  // Trading Journal
  journalEntries: JournalEntry[];
  journalDaySummary: string | null;

  // Multi-Agent Intelligence
  agentSignals: AgentSignal[];
  agentStatuses: AgentStatus[];
  signalConsensus: SignalSummary | null;
  agentEvents: AgentEvent[];
  knowledgeCount: number;

  // UI
  theme: 'light' | 'dark';
  activePanelTab: 'chart' | 'orders' | 'positions' | 'history';
  sidePanel: 'ai' | 'strategy' | 'risk' | 'autopilot' | 'settings' | 'journal' | 'agents';
  showPineScriptModal: boolean;
  generatedPineScript: string;

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

  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setActivePanelTab: (tab: TradingState['activePanelTab']) => void;
  setSidePanel: (panel: TradingState['sidePanel']) => void;
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

  // Trading Journal
  journalEntries: [],
  journalDaySummary: null,

  // UI
  theme: 'light',
  activePanelTab: 'chart',
  sidePanel: 'ai',
  showPineScriptModal: false,
  generatedPineScript: '',

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
    const newLines: ChartPriceLine[] = analysis.keyLevels.map((level, i) => ({
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

  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  setActivePanelTab: (activePanelTab) => set({ activePanelTab }),
  setSidePanel: (sidePanel) => set({ sidePanel }),
  setShowPineScriptModal: (showPineScriptModal) => set({ showPineScriptModal }),
  setGeneratedPineScript: (generatedPineScript) => set({ generatedPineScript }),
}),
    {
      name: 'phantomx-trading-store',
      version: 8, // v8: Multi-agent intelligence system
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
        return persistedState as TradingState;
      },
      // No auto-connect — ConnectionSetup handles the full flow with proper UX feedback
    }
  )
);
