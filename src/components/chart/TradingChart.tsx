'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type CandlestickData,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import ChartDrawingOverlay from './ChartDrawingOverlay';
import DrawingToolbar from './DrawingToolbar';
import { createPatternDrawings } from '@/lib/chart/pattern-visualizer';

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLinesRef = useRef<any[]>([]);

  const { ohlcv, annotations, priceLines, selectedSymbol, selectedTimeframe, ticker, theme, accountValue, positions, autopilotClosedTrades, isConnected } = useTradingStore();

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: getCssVar('--cl-bg-page') },
        textColor: getCssVar('--cl-text-secondary'),
        fontSize: 12,
      },
      grid: {
        vertLines: { color: getCssVar('--cl-border-subtle') },
        horzLines: { color: getCssVar('--cl-border-subtle') },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: getCssVar('--cl-accent-border-focus'),
          labelBackgroundColor: getCssVar('--cl-accent'),
        },
        horzLine: {
          color: getCssVar('--cl-accent-border-focus'),
          labelBackgroundColor: getCssVar('--cl-accent'),
        },
      },
      rightPriceScale: {
        borderColor: getCssVar('--cl-border'),
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: getCssVar('--cl-border'),
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: getCssVar('--cl-success'),
      downColor: getCssVar('--cl-error'),
      borderDownColor: getCssVar('--cl-error'),
      borderUpColor: getCssVar('--cl-success'),
      wickDownColor: getCssVar('--cl-error'),
      wickUpColor: getCssVar('--cl-success'),
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [theme]);

  // Update candlestick data
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || ohlcv.length === 0) return;

    const candleData: CandlestickData<Time>[] = ohlcv.map(c => ({
      time: (c.timestamp / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = ohlcv.map(c => ({
      time: (c.timestamp / 1000) as Time,
      value: c.volume,
      color: c.close >= c.open
        ? getCssVar('--cl-fill-success-active')
        : getCssVar('--cl-fill-error-active'),
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
  }, [ohlcv]);

  // Add trade markers / annotations
  useEffect(() => {
    if (!candleSeriesRef.current || annotations.length === 0) return;

    const markers: SeriesMarker<Time>[] = annotations
      .filter(a => a.type === 'trade_entry' || a.type === 'trade_exit' || a.type === 'signal')
      .map(a => ({
        time: (a.timestamp / 1000) as Time,
        position: a.side === 'buy' || a.type === 'trade_entry'
          ? 'belowBar' as const
          : 'aboveBar' as const,
        color: a.color,
        shape: a.type === 'trade_entry'
          ? (a.side === 'buy' ? 'arrowUp' as const : 'arrowDown' as const)
          : a.type === 'trade_exit'
            ? 'circle' as const
            : 'square' as const,
        text: a.text,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    candleSeriesRef.current.setMarkers(markers);
  }, [annotations]);

  // Render price lines from AI analysis / execution engine
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Remove existing price lines
    for (const pl of priceLinesRef.current) {
      try { candleSeriesRef.current.removePriceLine(pl); } catch { /* ok */ }
    }
    priceLinesRef.current = [];

    // Create new price lines
    for (const line of priceLines) {
      const price = Number(line.price);
      if (!price || !isFinite(price)) continue; // skip invalid prices
      const pl = candleSeriesRef.current.createPriceLine({
        price,
        color: line.color,
        lineWidth: line.lineWidth,
        lineStyle: line.lineStyle === 'dashed' ? 1 : line.lineStyle === 'dotted' ? 2 : 0,
        axisLabelVisible: line.axisLabelVisible,
        title: line.label,
      });
      priceLinesRef.current.push(pl);
    }
  }, [priceLines]);

  // Capture chart for AI vision
  const captureChart = useCallback((): string | null => {
    if (!chartContainerRef.current) return null;

    const canvas = chartContainerRef.current.querySelector('canvas');
    if (!canvas) return null;

    try {
      return canvas.toDataURL('image/png').split(',')[1];
    } catch {
      // toDataURL throws on tainted/cross-origin canvas
      console.warn('[PhantomX] Chart capture failed (cross-origin canvas)');
      return null;
    }
  }, []);

  // Expose capture function globally for AI assistant
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__phantomx_captureChart = captureChart;
    return () => {
      delete (window as unknown as Record<string, unknown>).__phantomx_captureChart;
    };
  }, [captureChart]);

  // --- Portfolio Metrics ---
  const metrics = useMemo(() => {
    const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0);
    const liveBalance = accountValue;

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const dayStart = startOfDay.getTime();
    const weekStart = dayStart - 6 * 86400000;
    const monthStart = dayStart - 29 * 86400000;

    const dayPnl = autopilotClosedTrades
      .filter(t => t.closedAt >= dayStart)
      .reduce((sum, t) => sum + t.realizedPnl, 0);
    const weekPnl = autopilotClosedTrades
      .filter(t => t.closedAt >= weekStart)
      .reduce((sum, t) => sum + t.realizedPnl, 0);
    const monthPnl = autopilotClosedTrades
      .filter(t => t.closedAt >= monthStart)
      .reduce((sum, t) => sum + t.realizedPnl, 0);

    return { liveBalance, totalUnrealizedPnl, dayPnl, weekPnl, monthPnl };
  }, [accountValue, positions, autopilotClosedTrades]);

  return (
    <div className="relative h-full w-full">
      {/* Chart Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex flex-col bg-gradient-to-b from-[var(--cl-bg-page)] via-[var(--cl-bg-page)] to-transparent">
        {/* Row 1: Symbol / Price */}
        <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-[var(--cl-text-primary)]">{selectedSymbol}</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[var(--cl-fill-hover)] text-[var(--cl-text-faint)]">
            {selectedTimeframe}
          </span>
          {ticker && (
            <>
              <span className={`text-lg font-mono font-semibold ${
                (ticker.changePercent24h ?? 0) >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'
              }`}>
                {ticker.last ? formatPrice(ticker.last) : '—'}
              </span>
              <span className={`text-xs font-mono ${
                (ticker.changePercent24h ?? 0) >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'
              }`}>
                {(ticker.changePercent24h ?? 0) >= 0 ? '+' : ''}{ticker.changePercent24h?.toFixed(2) ?? '0'}%
              </span>
            </>
          )}
        </div>

        <button
          onClick={() => {
            const img = captureChart();
            if (img) {
              const store = useTradingStore.getState();
              store.addAIMessage({
                id: crypto.randomUUID(),
                role: 'user',
                content: `Analyze this ${selectedSymbol} chart (${selectedTimeframe}).`,
                timestamp: Date.now(),
                metadata: { imageBase64: img },
              });
              store.setAIThinking(true);
              fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'analyze_chart',
                  chartImage: img,
                  symbol: selectedSymbol,
                  timeframe: selectedTimeframe,
                }),
              })
                .then(r => r.json())
                .then(data => {
                  if (data.analysis) {
                    store.setChartAnalysis(data.analysis);
                    store.setPriceLinesFromAnalysis(data.analysis);
                    store.clearDrawings('ai');
                    const patternDrawings = createPatternDrawings(data.analysis, store.ohlcv);
                    for (const d of patternDrawings) store.addDrawing(d);
                    store.addAIMessage({
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      content: `**Chart Analysis — ${selectedSymbol} (${selectedTimeframe})**\n\n**Pattern:** ${data.analysis.pattern}\n**Sentiment:** ${data.analysis.sentiment} (${(data.analysis.confidence * 100).toFixed(0)}% confidence)\n\n**Key Levels:**\n${data.analysis.keyLevels.map((l: { type: string; price: number }) => `- ${l.type}: $${l.price}`).join('\n')}\n\n**Recommendation:** ${data.analysis.recommendation}`,
                      timestamp: Date.now(),
                      metadata: { chartAnalysis: data.analysis },
                    });
                  } else if (data.error) {
                    store.addAIMessage({ id: crypto.randomUUID(), role: 'assistant', content: `Chart analysis failed: ${data.error}`, timestamp: Date.now() });
                  }
                })
                .catch((err) => {
                  store.addAIMessage({ id: crypto.randomUUID(), role: 'assistant', content: `Chart analysis error: ${String(err)}`, timestamp: Date.now() });
                })
                .finally(() => store.setAIThinking(false));
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--cl-fill-accent)] border border-[var(--cl-accent-border)] text-[var(--cl-accent)] text-xs font-medium hover:bg-[var(--cl-fill-accent-hover)] transition-colors"
          title="Capture chart and send to AI for analysis"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          AI Vision
        </button>
        </div>{/* end Row 1 */}

        {/* Row 2: Portfolio Metrics */}
        {isConnected && (
          <div className="flex items-center gap-4 px-4 pb-2 text-[11px] font-mono">
            {/* Live Balance */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Bal</span>
              <span className="text-[var(--cl-text-primary)] font-semibold">${formatUsd(metrics.liveBalance)}</span>
            </div>

            {/* Unrealized P&L */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">uPnL</span>
              <span className={metrics.totalUnrealizedPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.totalUnrealizedPnl >= 0 ? '+' : ''}${formatUsd(metrics.totalUnrealizedPnl)}
              </span>
            </div>

            <span className="text-[var(--cl-border)] select-none">|</span>

            {/* Day P&L */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Day</span>
              <span className={metrics.dayPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.dayPnl >= 0 ? '+' : ''}${formatUsd(metrics.dayPnl)}
              </span>
            </div>

            {/* Week P&L */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Week</span>
              <span className={metrics.weekPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.weekPnl >= 0 ? '+' : ''}${formatUsd(metrics.weekPnl)}
              </span>
            </div>

            {/* Month P&L */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Month</span>
              <span className={metrics.monthPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.monthPnl >= 0 ? '+' : ''}${formatUsd(metrics.monthPnl)}
              </span>
            </div>
          </div>
        )}
      </div>{/* end Chart Header */}

      {/* Drawing Toolbar */}
      <DrawingToolbar />

      {/* Chart */}
      <div ref={chartContainerRef} className="chart-container w-full h-full" />

      {/* Drawing Overlay (trendlines, fibonacci, etc.) */}
      <ChartDrawingOverlay chartRef={chartRef} candleSeriesRef={candleSeriesRef} containerRef={chartContainerRef} />

      {/* Annotations overlay */}
      {annotations.filter(a => a.pnl !== undefined).map(a => (
        <div
          key={a.id}
          className="absolute z-20 pointer-events-none"
          style={{ bottom: '20%', right: '10%' }}
        >
          <div className={`glass-card px-2 py-1 text-xs font-mono ${
            (a.pnl ?? 0) >= 0 ? 'text-[var(--cl-success)] border-[var(--cl-success-border)]' : 'text-[var(--cl-error)] border-[var(--cl-error-border)]'
          }`}>
            {(a.pnl ?? 0) >= 0 ? '+' : ''}{a.pnl?.toFixed(2)} ({a.pnlPercent?.toFixed(1)}%)
          </div>
        </div>
      ))}
    </div>
  );
}
