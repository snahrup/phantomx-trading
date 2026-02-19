'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice } from '@/lib/format';
import FloatingChat from '@/components/FloatingChat';

/**
 * DataProvider — Layout-level data fetching orchestration.
 * Extracted from page.tsx so that market data, account polling, price line sync,
 * and SSE event sources persist across page navigations.
 *
 * Renders no UI — only side effects.
 */
export default function DataProvider({ children }: { children: React.ReactNode }) {
  const {
    isConnected, selectedSymbol, selectedTimeframe,
    setTicker, setOHLCV, setPositions, setOpenOrders, setBalances, setAccountValue, setRecentTrades,
    isExecuting,
    openOrders, positions, clearPriceLines, addPriceLine,
    addEquitySnapshot,
  } = useTradingStore();

  // --- Market data fetch ---
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

  // --- Account data fetch ---
  const fetchAccountData = useCallback(async () => {
    if (!isConnected) return;
    try {
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
        const unrealizedPnl = (allPos.positions ?? []).reduce((sum: number, p: { unrealizedPnl: number }) => sum + (p.unrealizedPnl ?? 0), 0);
        const equity = account.account.totalUsdValue + unrealizedPnl;
        setAccountValue(equity);
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

  // Polling intervals
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

    store.clearPriceLines('open_orders');
    store.clearPriceLines('positions');

    const css = (v: string) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      if (!raw) return '#000000';
      if (raw.startsWith('#')) return raw;
      const rgbMatch = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (rgbMatch) {
        return '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
          .map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
      }
      const el = document.createElement('div');
      el.style.color = raw;
      document.body.appendChild(el);
      const resolved = getComputedStyle(el).color;
      el.remove();
      const m = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
      return '#000000';
    };

    // Open orders → price lines
    for (const order of openOrders) {
      const price = order.stopPrice ?? order.price;
      if (!price || !isFinite(price)) continue;

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

    // Positions → entry + liquidation price lines
    for (const pos of positions) {
      if (pos.symbol !== selectedSymbol) continue;

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

  // Webhook + execution engine SSE
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
        if (engineEvent.type === 'kill_switch') {
          store.setKilled(true, engineEvent.data.reasonText || engineEvent.data.reason);
          store.setExecuting(false);
        } else if (engineEvent.type === 'trade_executed') {
          if (engineEvent.data.annotation) store.addAnnotation(engineEvent.data.annotation);
          const trade = engineEvent.data.trade || engineEvent.data;
          if (trade?.entryPrice && trade?.stopLoss) {
            const slRaw = getComputedStyle(document.documentElement).getPropertyValue('--cl-error').trim();
            const slEl = document.createElement('div'); slEl.style.color = slRaw; document.body.appendChild(slEl);
            const slColor = (() => { const c = getComputedStyle(slEl).color; slEl.remove(); const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('') : '#dc3545'; })();
            store.addPriceLine({ id: `sl-${Date.now()}`, price: Number(trade.stopLoss), color: slColor, lineWidth: 1, lineStyle: 'dotted', label: `SL ${formatPrice(Number(trade.stopLoss))}`, source: 'execution_engine', type: 'stop_loss', axisLabelVisible: true, timestamp: Date.now() });
          }
          if (trade?.entryPrice && trade?.takeProfit) {
            const tpRaw = getComputedStyle(document.documentElement).getPropertyValue('--cl-success').trim();
            const tpEl = document.createElement('div'); tpEl.style.color = tpRaw; document.body.appendChild(tpEl);
            const tpColor = (() => { const c = getComputedStyle(tpEl).color; tpEl.remove(); const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('') : '#00d26a'; })();
            store.addPriceLine({ id: `tp-${Date.now()}`, price: Number(trade.takeProfit), color: tpColor, lineWidth: 1, lineStyle: 'dotted', label: `TP ${formatPrice(Number(trade.takeProfit))}`, source: 'execution_engine', type: 'take_profit', axisLabelVisible: true, timestamp: Date.now() });
          }
        } else if (engineEvent.type === 'stats_update') {
          if (engineEvent.data.stats) store.setStats(engineEvent.data.stats);
          if (engineEvent.data.state?.isKilled) { store.setKilled(true, engineEvent.data.state.killReason); store.setExecuting(false); }
        } else if (engineEvent.type === 'status_update') {
          if (engineEvent.data.status === 'stopped') store.setExecuting(false);
        }
      } catch {}
    };
    return () => { webhookSource.close(); engineSource.close(); };
  }, [isConnected, isExecuting]);

  return (
    <>
      {children}
      <FloatingChat />
    </>
  );
}
