'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useTradingStore } from '@/store/trading-store';
import TradingChart from '@/components/chart/TradingChart';
import AIChatPanel from '@/components/ai/AIChatPanel';
import AgentNetworkPanel from '@/components/agents/AgentNetworkPanel';
// HeartbeatPanel removed — autopilot controls now live in AIChatPanel toolbar
import TradingJournal from '@/components/ai/TradingJournal';
import ControlPanel from '@/components/trading/ControlPanel';
import PineScriptModal from '@/components/trading/PineScriptModal';
import ConnectionSetup from '@/components/trading/ConnectionSetup';
import SymbolSelector from '@/components/trading/SymbolSelector';
import GemScanner from '@/components/trading/GemScanner';
import PortfolioBar from '@/components/trading/PortfolioBar';
import AutopilotActivityBar from '@/components/trading/AutopilotActivityBar';
import TradeAnalytics from '@/components/trading/TradeAnalytics';
import DashboardAnalytics from '@/components/trading/DashboardAnalytics';
import IntelligenceView from '@/components/trading/IntelligenceView';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { formatPrice } from '@/lib/format';

export default function Dashboard() {
  const {
    isConnected, selectedSymbol, selectedTimeframe,
    setTicker, setOHLCV, setPositions, setOpenOrders, setBalances, setAccountValue, setRecentTrades,
    sidePanel, setSidePanel,
    sidebarMode, setSidebarMode, sidebarWidth, setSidebarWidth,
    isExecuting, isPaused, isKilled,
    openOrders, positions, clearPriceLines, addPriceLine,
    agentStatuses,
    viewMode, setViewMode, addEquitySnapshot,
  } = useTradingStore();

  // --- Drag-to-resize sidebar ---
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(380);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = useTradingStore.getState().sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX.current - ev.clientX; // dragging left = wider
      setSidebarWidth(startWidth.current + delta);
    };
    const handleUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [setSidebarWidth]);

  // --- Floating panel drag ---
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 });
  const [floatSize, setFloatSize] = useState({ w: 420, h: 500 });
  const floatInitialized = useRef(false);

  // Initialize float position on first pop-out
  useEffect(() => {
    if (sidebarMode === 'floating' && !floatInitialized.current && typeof window !== 'undefined') {
      setFloatPos({ x: window.innerWidth - 440, y: 80 });
      floatInitialized.current = true;
    }
    if (sidebarMode === 'docked') {
      floatInitialized.current = false;
    }
  }, [sidebarMode]);

  const handleFloatDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const offsetX = e.clientX - floatPos.x;
    const offsetY = e.clientY - floatPos.y;
    const handleMove = (ev: MouseEvent) => {
      setFloatPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, ev.clientX - offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - offsetY)),
      });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [floatPos]);

  const handleFloatResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = floatSize.w;
    const sh = floatSize.h;
    const handleMove = (ev: MouseEvent) => {
      setFloatSize({
        w: Math.max(320, sw + (ev.clientX - sx)),
        h: Math.max(300, sh + (ev.clientY - sy)),
      });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [floatSize]);

  // Migrate away from removed 'autopilot' tab if still persisted
  useEffect(() => {
    if (sidePanel === 'autopilot') setSidePanel('ai');
  }, [sidePanel, setSidePanel]);

  const fetchMarketData = useCallback(async () => {
    if (!isConnected) return;
    try {
      const ohlcvRes = await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ohlcv', symbol: selectedSymbol, timeframe: selectedTimeframe, limit: 500 }),
      });
      const ohlcvData = await ohlcvRes.json();
      if (ohlcvData.ohlcv) setOHLCV(ohlcvData.ohlcv);

      const tickerRes = await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ticker', symbol: selectedSymbol }),
      });
      const tickerData = await tickerRes.json();
      if (tickerData.ticker) setTicker(tickerData.ticker);
    } catch (err) {
      console.error('Market data fetch error:', err);
    }
  }, [isConnected, selectedSymbol, selectedTimeframe, setOHLCV, setTicker]);

  const fetchAccountData = useCallback(async () => {
    if (!isConnected) return;
    try {
      // Fetch account + ALL positions (unfiltered for portfolio), plus symbol-specific orders/trades
      const [accountRes, allPosRes, ordersRes, tradesRes] = await Promise.all([
        fetch('/api/phemex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'account' }) }),
        fetch('/api/phemex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'positions' }) }),
        fetch('/api/phemex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open_orders', symbol: selectedSymbol }) }),
        fetch('/api/phemex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'trades', symbol: selectedSymbol, limit: 20 }) }),
      ]);
      const [account, allPos, orders, trades] = await Promise.all([
        accountRes.json(), allPosRes.json(), ordersRes.json(), tradesRes.json(),
      ]);
      if (account.account) {
        setBalances(account.account.balances);
        // Calculate equity = wallet balance + unrealized PnL from ALL positions
        const unrealizedPnl = (allPos.positions ?? []).reduce((sum: number, p: { unrealizedPnl: number }) => sum + (p.unrealizedPnl ?? 0), 0);
        const equity = account.account.totalUsdValue + unrealizedPnl;
        setAccountValue(equity);
        // Record equity snapshot for dashboard analytics (throttled to 60s in store)
        addEquitySnapshot({
          timestamp: Date.now(),
          equity,
          unrealizedPnl,
          positionCount: (allPos.positions ?? []).length,
        });
      }
      if (allPos.positions) setPositions(allPos.positions);
      if (orders.orders) setOpenOrders(orders.orders);
      if (trades.trades) setRecentTrades(trades.trades);
    } catch (err) {
      console.error('Account data fetch error:', err);
    }
  }, [isConnected, selectedSymbol, setBalances, setAccountValue, setPositions, setOpenOrders, setRecentTrades, addEquitySnapshot]);

  // Keep refs to latest callbacks so setInterval never gets stale closures
  const fetchMarketDataRef = useRef(fetchMarketData);
  const fetchAccountDataRef = useRef(fetchAccountData);
  fetchMarketDataRef.current = fetchMarketData;
  fetchAccountDataRef.current = fetchAccountData;

  // Fetch immediately on connect or symbol/timeframe change
  useEffect(() => {
    if (isConnected) { fetchMarketData(); fetchAccountData(); }
  }, [isConnected, selectedSymbol, selectedTimeframe, fetchMarketData, fetchAccountData]);

  // Polling intervals — only recreate when isConnected or selectedSymbol changes
  useEffect(() => {
    if (!isConnected) return;
    const tickerInterval = setInterval(async () => {
      try {
        const sym = useTradingStore.getState().selectedSymbol;
        const res = await fetch('/api/phemex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ticker', symbol: sym }) });
        const data = await res.json();
        if (data.ticker) useTradingStore.getState().setTicker(data.ticker);
      } catch {}
    }, 3000);
    const accountInterval = setInterval(() => fetchAccountDataRef.current(), 10000);
    const ohlcvInterval = setInterval(() => fetchMarketDataRef.current(), 30000);
    return () => { clearInterval(tickerInterval); clearInterval(accountInterval); clearInterval(ohlcvInterval); };
  }, [isConnected]);

  // Sync open orders + positions → chart price lines
  useEffect(() => {
    if (!isConnected) return;
    const store = useTradingStore.getState();

    // Clear existing order/position lines
    store.clearPriceLines('open_orders');
    store.clearPriceLines('positions');

    // Helper: get CSS var value
    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

    // --- Open orders → price lines ---
    for (const order of openOrders) {
      const price = order.stopPrice ?? order.price;
      if (!price || !isFinite(price)) continue;

      // Determine line type and styling
      const isStop = order.type === 'stop' || order.type === 'stop_limit';
      const isTp = order.type === 'take_profit';
      const isBuy = order.side === 'buy';

      let color: string;
      let lineType: 'stop_loss' | 'take_profit' | 'limit_order';
      let label: string;

      if (isStop) {
        color = css('--cl-error');
        lineType = 'stop_loss';
        label = `SL ${order.side.toUpperCase()} ${order.amount}`;
      } else if (isTp) {
        color = css('--cl-success');
        lineType = 'take_profit';
        label = `TP ${order.side.toUpperCase()} ${order.amount}`;
      } else {
        color = isBuy ? css('--cl-success') : css('--cl-error');
        lineType = 'limit_order';
        label = `${order.type.toUpperCase()} ${order.side.toUpperCase()} ${order.amount} @ ${formatPrice(price)}`;
      }

      store.addPriceLine({
        id: `order-${order.id}`,
        price,
        color,
        lineWidth: 1,
        lineStyle: isStop ? 'dotted' : isTp ? 'dashed' : 'dashed',
        label,
        source: 'open_orders',
        type: lineType,
        axisLabelVisible: true,
        timestamp: Date.now(),
      });
    }

    // --- Positions → entry + liquidation price lines ---
    for (const pos of positions) {
      // Only show lines for positions matching the current symbol
      if (pos.symbol !== selectedSymbol) continue;

      // Entry price line
      if (pos.entryPrice && isFinite(pos.entryPrice)) {
        store.addPriceLine({
          id: `pos-entry-${pos.id}`,
          price: pos.entryPrice,
          color: pos.side === 'long' ? css('--cl-success') : css('--cl-error'),
          lineWidth: 2,
          lineStyle: 'solid',
          label: `${pos.side.toUpperCase()} Entry @ ${formatPrice(pos.entryPrice)}`,
          source: 'positions',
          type: 'entry',
          axisLabelVisible: true,
          timestamp: Date.now(),
        });
      }

      // Liquidation price line
      if (pos.liquidationPrice && isFinite(pos.liquidationPrice)) {
        store.addPriceLine({
          id: `pos-liq-${pos.id}`,
          price: pos.liquidationPrice,
          color: '#FF0000',
          lineWidth: 1,
          lineStyle: 'dotted',
          label: `LIQ ${formatPrice(pos.liquidationPrice)}`,
          source: 'positions',
          type: 'liquidation',
          axisLabelVisible: true,
          timestamp: Date.now(),
        });
      }
    }
  }, [isConnected, openOrders, positions, selectedSymbol, clearPriceLines, addPriceLine]);

  useEffect(() => {
    if (!isConnected || !isExecuting) return;
    const webhookSource = new EventSource('/api/webhook');
    webhookSource.onmessage = (event) => {
      try {
        const webhook = JSON.parse(event.data);
        fetch('/api/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'webhook', signal: webhook }) }).catch(console.error);
      } catch {}
    };
    const engineSource = new EventSource('/api/execute');
    engineSource.onmessage = (event) => {
      try {
        const engineEvent = JSON.parse(event.data);
        const store = useTradingStore.getState();
        if (engineEvent.type === 'kill_switch') { store.setKilled(true, engineEvent.data.reasonText || engineEvent.data.reason); store.setExecuting(false); }
        else if (engineEvent.type === 'trade_executed') {
          if (engineEvent.data.annotation) store.addAnnotation(engineEvent.data.annotation);
          const trade = engineEvent.data.trade || engineEvent.data;
          if (trade?.entryPrice && trade?.stopLoss) store.addPriceLine({ id: `sl-${Date.now()}`, price: Number(trade.stopLoss), color: getComputedStyle(document.documentElement).getPropertyValue('--cl-error').trim(), lineWidth: 1, lineStyle: 'dotted', label: `SL ${formatPrice(Number(trade.stopLoss))}`, source: 'execution_engine', type: 'stop_loss', axisLabelVisible: true, timestamp: Date.now() });
          if (trade?.entryPrice && trade?.takeProfit) store.addPriceLine({ id: `tp-${Date.now()}`, price: Number(trade.takeProfit), color: getComputedStyle(document.documentElement).getPropertyValue('--cl-success').trim(), lineWidth: 1, lineStyle: 'dotted', label: `TP ${formatPrice(Number(trade.takeProfit))}`, source: 'execution_engine', type: 'take_profit', axisLabelVisible: true, timestamp: Date.now() });
        }
        else if (engineEvent.type === 'stats_update') { if (engineEvent.data.stats) store.setStats(engineEvent.data.stats); if (engineEvent.data.state?.isKilled) { store.setKilled(true, engineEvent.data.state.killReason); store.setExecuting(false); } }
        else if (engineEvent.type === 'status_update') { if (engineEvent.data.status === 'stopped') store.setExecuting(false); }
      } catch {}
    };
    return () => { webhookSource.close(); engineSource.close(); };
  }, [isConnected, isExecuting]);

  return (
    <>
      <ConnectionSetup />
      <PineScriptModal />

      <div className="h-screen w-screen flex flex-col overflow-hidden">
        {/* Header — warm sidebar bg */}
        <header className="h-12 flex items-center justify-between px-4 border-b border-[var(--cl-border)] bg-[var(--cl-bg-sidebar)] flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[var(--cl-accent)] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-[var(--cl-text-primary)]">PhantomX</span>
            </div>
            {/* View Mode Toggle */}
            {isConnected && (
              <div className="flex items-center rounded-lg border border-[var(--cl-border)] overflow-hidden">
                <button
                  onClick={() => setViewMode('trading')}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    viewMode === 'trading'
                      ? 'bg-[var(--cl-fill-accent-subtle)] text-[var(--cl-accent)]'
                      : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-control)]'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-1 -mt-0.5">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Trading
                </button>
                <div className="w-px h-5 bg-[var(--cl-border)]" />
                <button
                  onClick={() => setViewMode('dashboard')}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    viewMode === 'dashboard'
                      ? 'bg-[var(--cl-fill-accent-subtle)] text-[var(--cl-accent)]'
                      : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-control)]'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-1 -mt-0.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                  Dashboard
                </button>
                <div className="w-px h-5 bg-[var(--cl-border)]" />
                <button
                  onClick={() => setViewMode('intelligence')}
                  className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                    viewMode === 'intelligence'
                      ? 'bg-[var(--cl-fill-accent-subtle)] text-[var(--cl-accent)]'
                      : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-control)]'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-1 -mt-0.5">
                    <path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 4 7.5l1 1.5h4l1-1.5c2-2 4-4.5 4-7.5a7 7 0 0 0-7-7z" /><line x1="9" y1="21" x2="15" y2="21" /><line x1="10" y1="24" x2="14" y2="24" />
                  </svg>
                  Intelligence
                </button>
              </div>
            )}
            {isConnected && <SymbolSelector />}
          </div>

          <div className="flex items-center gap-3">
            {isConnected && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--cl-bg-surface)] border border-[var(--cl-border)]">
                <span className={`status-dot ${isKilled ? 'killed' : isExecuting ? (isPaused ? 'paused' : 'live') : 'disconnected'}`} />
                <span className="text-[11px] text-[var(--cl-text-secondary)]">
                  {isKilled ? 'KILLED' : isExecuting ? (isPaused ? 'PAUSED' : 'AUTO-TRADING') : 'MANUAL'}
                </span>
              </div>
            )}
            {/* Agent status dots — always visible */}
            {agentStatuses.length > 0 && (
              <button
                onClick={() => setSidePanel('agents')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] hover:border-[var(--cl-accent-border)] transition-colors"
                title="Agent Intelligence — click to view"
              >
                {agentStatuses.map(a => (
                  <span key={a.id} className="w-2 h-2 rounded-full" style={{
                    backgroundColor: a.state === 'running' ? 'var(--cl-success)' :
                      a.state === 'error' ? 'var(--cl-error)' :
                      a.state === 'idle' ? 'var(--cl-warning)' : 'var(--cl-text-secondary)',
                  }} title={`${a.name}: ${a.state}`} />
                ))}
                <span className="text-[9px] text-[var(--cl-text-secondary)] ml-0.5">AGENTS</span>
              </button>
            )}
            <div className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${
              isConnected
                ? useTradingStore.getState().isTestnet
                  ? 'bg-[var(--cl-fill-success)] text-[var(--cl-success)] border border-[var(--cl-success-border)]'
                  : 'bg-[var(--cl-fill-error)] text-[var(--cl-error)] border border-[var(--cl-error-border)]'
                : 'bg-[var(--cl-fill-hover)] text-[var(--cl-text-secondary)]'
            }`}>
              {isConnected ? (useTradingStore.getState().isTestnet ? 'TESTNET' : 'MAINNET') : 'DISCONNECTED'}
            </div>
          </div>
        </header>

        <PortfolioBar />
        <AutopilotActivityBar />

        <div className="flex-1 flex overflow-hidden">
          {/* Main Content — Trading View, Dashboard, or Intelligence */}
          <div className="flex-1 flex flex-col min-w-0">
            {viewMode === 'intelligence' ? (
              <ErrorBoundary fallback="chart"><IntelligenceView /></ErrorBoundary>
            ) : viewMode === 'dashboard' ? (
              <ErrorBoundary fallback="chart"><DashboardAnalytics /></ErrorBoundary>
            ) : (
              <>
                <div className="flex-1 relative">
                  {isConnected ? (
                    <ErrorBoundary fallback="chart"><TradingChart /></ErrorBoundary>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center opacity-30">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#AE5630" strokeWidth="1" className="mx-auto mb-4">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        <p className="text-sm text-[var(--cl-text-secondary)]">Connect to Phemex to start trading</p>
                      </div>
                    </div>
                  )}
                </div>
                {isConnected && (
                  <div className="h-8 flex items-center px-4 border-t border-[var(--cl-border)] text-[10px] text-[var(--cl-text-secondary)] gap-4 flex-shrink-0 bg-[var(--cl-bg-sidebar)]">
                    <span>Phemex Perpetual</span>
                    <span className="text-[var(--cl-text-faint)]">{selectedSymbol}</span>
                    <span>{selectedTimeframe}</span>
                    <div className="flex-1" />
                    <span>Webhook: {isExecuting ? 'Active' : 'Inactive'}</span>
                    <span className="text-[var(--cl-border-hover)]">|</span>
                    <span>Auto-trade: {isExecuting ? (isPaused ? 'Paused' : 'Running') : 'Off'}</span>
                  </div>
                )}
                {isConnected && (
                  <ErrorBoundary fallback="chart"><TradeAnalytics /></ErrorBoundary>
                )}
              </>
            )}
          </div>

          {/* Sidebar — Docked mode */}
          {sidebarMode === 'docked' && (
            <div className="relative flex flex-col border-l border-[var(--cl-border)] flex-shrink-0 bg-[var(--cl-bg-sidebar)]" style={{ width: sidebarWidth }}>
              {/* Drag resize handle */}
              <div
                onMouseDown={handleResizeStart}
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-[var(--cl-accent)] active:bg-[var(--cl-accent)] transition-colors z-10"
              />
              <SidebarTabs sidePanel={sidePanel} setSidePanel={setSidePanel} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />
              <SidebarContent sidePanel={sidePanel} />
            </div>
          )}
        </div>

        {/* Floating panel */}
        {sidebarMode === 'floating' && (
          <div
            className="fixed z-50 flex flex-col rounded-xl border border-[var(--cl-border)] bg-[var(--cl-bg-sidebar)] shadow-2xl overflow-hidden"
            style={{ left: floatPos.x, top: floatPos.y, width: floatSize.w, height: floatSize.h }}
          >
            {/* Draggable title bar */}
            <div
              onMouseDown={handleFloatDragStart}
              className="flex items-center justify-between px-3 py-1.5 bg-[var(--cl-bg-surface)] border-b border-[var(--cl-border)] cursor-move select-none flex-shrink-0"
            >
              <span className="text-[10px] font-medium text-[var(--cl-text-secondary)] uppercase tracking-wider">PhantomX Panel</span>
              <div className="flex items-center gap-1">
                {/* Minimize */}
                <button
                  onClick={() => setSidebarMode('minimized')}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--cl-fill-hover)] text-[var(--cl-text-secondary)] hover:text-[var(--cl-warning)] transition-colors"
                  title="Minimize"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                {/* Dock back */}
                <button
                  onClick={() => setSidebarMode('docked')}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--cl-fill-hover)] text-[var(--cl-text-secondary)] hover:text-[var(--cl-accent)] transition-colors"
                  title="Dock to side"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                </button>
              </div>
            </div>
            <SidebarTabs sidePanel={sidePanel} setSidePanel={setSidePanel} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />
            <SidebarContent sidePanel={sidePanel} />
            {/* Resize handle (bottom-right corner) */}
            <div
              onMouseDown={handleFloatResizeStart}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
              style={{ background: 'linear-gradient(135deg, transparent 50%, var(--cl-text-secondary) 50%, var(--cl-text-secondary) 60%, transparent 60%, transparent 70%, var(--cl-text-secondary) 70%, var(--cl-text-secondary) 80%, transparent 80%)' }}
            />
          </div>
        )}

        {/* Minimized tab — bottom right */}
        {sidebarMode === 'minimized' && (
          <button
            onClick={() => setSidebarMode('floating')}
            className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--cl-bg-sidebar)] border border-[var(--cl-border)] shadow-lg hover:border-[var(--cl-accent-border)] hover:shadow-xl transition-all cursor-pointer group"
            title="Expand panel"
          >
            <div className="w-6 h-6 rounded-md bg-[var(--cl-accent)] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-[var(--cl-text-secondary)] group-hover:text-[var(--cl-text-primary)] transition-colors">Panel</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--cl-text-secondary)]">
              <polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}

// --- Sidebar sub-components (shared between docked & floating modes) ---

type SidebarTabsProps = {
  sidePanel: string;
  setSidePanel: (panel: 'ai' | 'strategy' | 'risk' | 'autopilot' | 'settings' | 'journal' | 'agents') => void;
  sidebarMode: 'docked' | 'floating' | 'minimized';
  setSidebarMode: (mode: 'docked' | 'floating' | 'minimized') => void;
};

function SidebarTabs({ sidePanel, setSidePanel, sidebarMode, setSidebarMode }: SidebarTabsProps) {
  const tabs = [
    { key: 'ai' as const, label: 'AI Chat' },
    { key: 'agents' as const, label: 'Intel' },
    { key: 'journal' as const, label: 'Journal' },
    { key: 'strategy' as const, label: 'Strategy' },
    { key: 'risk' as const, label: 'Controls' },
    { key: 'settings' as const, label: 'Settings' },
  ] as const;

  return (
    <div className="flex border-b border-[var(--cl-border)] flex-shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => setSidePanel(tab.key)}
          className={`flex-1 py-2.5 text-[11px] font-medium transition-colors duration-200 ${
            sidePanel === tab.key
              ? 'text-[var(--cl-accent)] border-b-2 border-[var(--cl-accent)] bg-[var(--cl-fill-accent-subtle)]'
              : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-control)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
      {/* Pop out / Dock button */}
      <button
        onClick={() => setSidebarMode(sidebarMode === 'docked' ? 'floating' : 'docked')}
        className="px-2 py-2.5 text-[var(--cl-text-secondary)] hover:text-[var(--cl-accent)] hover:bg-[var(--cl-fill-control)] transition-colors"
        title={sidebarMode === 'docked' ? 'Pop out panel' : 'Dock panel'}
      >
        {sidebarMode === 'docked' ? (
          // Pop-out icon (external window)
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        ) : (
          // Dock icon (panel layout)
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        )}
      </button>
    </div>
  );
}

function SidebarContent({ sidePanel }: { sidePanel: string }) {
  return (
    <div className="flex-1 overflow-hidden">
      {/* AIChatPanel always mounted — keeps SSE connection alive for agent events */}
      <div style={{ display: sidePanel === 'ai' ? undefined : 'none' }} className="h-full">
        <ErrorBoundary fallback="chat"><AIChatPanel /></ErrorBoundary>
      </div>
      {sidePanel === 'agents' && <ErrorBoundary fallback="chat"><AgentNetworkPanel /></ErrorBoundary>}
      {sidePanel === 'journal' && <ErrorBoundary fallback="chat"><TradingJournal /></ErrorBoundary>}
      {sidePanel === 'risk' && <ErrorBoundary fallback="chat"><ControlPanel /></ErrorBoundary>}
      {sidePanel === 'strategy' && <ErrorBoundary fallback="chat"><StrategyPanel /></ErrorBoundary>}
      {sidePanel === 'settings' && <ErrorBoundary fallback="chat"><SettingsPanel /></ErrorBoundary>}
    </div>
  );
}

function StrategyPanel() {
  const { strategies, generatedPineScript, setShowPineScriptModal } = useTradingStore();
  return (
    <div className="flex flex-col h-full">
      <div className="panel-header"><span>Strategy Manager</span></div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <GemScanner />
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-[var(--cl-border)]" />
          <span className="text-[9px] text-[var(--cl-text-secondary)] uppercase tracking-widest">PineScript</span>
          <div className="flex-1 h-px bg-[var(--cl-border)]" />
        </div>
        <button onClick={() => setShowPineScriptModal(true)} className="w-full py-3 rounded-lg bg-[var(--cl-fill-accent)] border border-[var(--cl-accent-border)] text-[var(--cl-accent)] text-sm font-medium hover:bg-[var(--cl-fill-accent-hover)] transition-colors flex items-center justify-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
          New PineScript Strategy
        </button>
        {generatedPineScript && (
          <div className="glass-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--cl-accent)]">Latest Generated Strategy</span>
              <button onClick={() => navigator.clipboard.writeText(generatedPineScript)} className="text-[10px] text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)]">Copy</button>
            </div>
            <pre className="text-[10px] font-mono text-[var(--cl-text-secondary)] max-h-40 overflow-y-auto whitespace-pre">{generatedPineScript.slice(0, 500)}...</pre>
          </div>
        )}
        {strategies.length === 0 && !generatedPineScript && (
          <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--cl-text-secondary)" strokeWidth="1"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            <p className="text-xs text-[var(--cl-text-secondary)] mt-2">No strategies yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { isConnected, isTestnet, theme, toggleTheme, setConnected } = useTradingStore();
  return (
    <div className="flex flex-col h-full">
      <div className="panel-header"><span>Settings</span></div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="glass-card p-3">
          <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">Theme</h3>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border)] hover:bg-[var(--cl-fill-hover)] transition-colors"
          >
            <div className="flex items-center gap-2">
              {theme === 'light' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cl-warning)" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cl-info)" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
              <span className="text-xs text-[var(--cl-text-primary)]">{theme === 'light' ? 'Light' : 'Dark'} Theme</span>
            </div>
            <span className="text-[10px] text-[var(--cl-text-secondary)]">Click to toggle</span>
          </button>
        </div>
        <div className="glass-card p-3">
          <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">Connection</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-[var(--cl-text-faint)]">Status</span><span className={isConnected ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>{isConnected ? 'Connected' : 'Disconnected'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--cl-text-faint)]">Network</span><span className={isTestnet ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>{isTestnet ? 'Testnet' : 'Mainnet'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--cl-text-faint)]">Credentials</span><span className="text-[var(--cl-text-secondary)] font-mono text-[10px]">{isConnected ? 'ENV (.env.local)' : 'Not connected'}</span></div>
          </div>
          {isConnected && (
            <button onClick={() => setConnected(false)} className="mt-3 w-full py-1.5 rounded-lg text-xs bg-[var(--cl-fill-error)] border border-[var(--cl-error-border)] text-[var(--cl-error)] hover:bg-[var(--cl-fill-error-hover)] transition-colors">Disconnect</button>
          )}
        </div>
        <div className="glass-card p-3">
          <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">Webhook</h3>
          <div className="space-y-2 text-xs">
            <div><span className="text-[var(--cl-text-faint)] block mb-1">Webhook URL</span><code className="block p-2 rounded-lg bg-[var(--cl-bg-surface)] text-[10px] font-mono text-[var(--cl-accent)] border border-[var(--cl-border)]">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/webhook</code></div>
            <p className="text-[10px] text-[var(--cl-text-secondary)]">Set this URL in TradingView alert webhooks to auto-execute trades.</p>
          </div>
        </div>
        <div className="glass-card p-3">
          <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">AI Model</h3>
          <div className="text-xs text-[var(--cl-text-faint)]"><p>Claude Opus 4.6 with Extended Thinking</p><p className="text-[10px] text-[var(--cl-text-secondary)] mt-1">Most powerful model — vision-capable, adaptive reasoning</p></div>
        </div>
        <div className="glass-card p-3">
          <h3 className="text-[11px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">About</h3>
          <div className="text-xs text-[var(--cl-text-secondary)] space-y-1"><p><span className="text-[var(--cl-text-faint)]">PhantomX</span> v1.0.0</p><p>AI-Powered Phemex Trading Platform</p><p>Built with Next.js, CCXT, Claude Agent SDK</p></div>
        </div>
      </div>
    </div>
  );
}
