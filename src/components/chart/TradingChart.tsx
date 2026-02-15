'use client';

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import ChartDrawingOverlay from './ChartDrawingOverlay';
import DrawingToolbar from './DrawingToolbar';
import { createPatternDrawings } from '@/lib/chart/pattern-visualizer';
import {
  computeSMA,
  computeEMA,
  computeBollingerBands,
  computeVWAP,
  DEFAULT_INDICATORS,
  type IndicatorKey,
} from '@/lib/chart/indicators';

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Indicator series color map
const INDICATOR_COLORS: Record<string, string> = {
  sma7: '#f59e0b',
  sma20: '#3b82f6',
  sma50: '#a855f7',
  ema21: '#06b6d4',
  bb_upper: '#6366f1',
  bb_middle: '#6366f1',
  bb_lower: '#6366f1',
  vwap: '#ec4899',
};

export default function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLinesRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indicatorSeriesRef = useRef<Record<string, ISeriesApi<'Line'>>>({});
  const autoPatternTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [patternDetecting, setPatternDetecting] = useState(false);
  const [patternOverlayPos, setPatternOverlayPos] = useState({ x: 56, y: 120 });
  const [patternOverlayDismissed, setPatternOverlayDismissed] = useState(false);

  const {
    ohlcv, annotations, priceLines, selectedSymbol, selectedTimeframe,
    ticker, theme, accountValue, positions, autopilotClosedTrades, isConnected,
    enabledIndicators, autoPatternDetection, lastChartAnalysis,
    toggleIndicator, setAutoPatternDetection,
  } = useTradingStore();

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
      indicatorSeriesRef.current = {};
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

  // --- Indicator Overlays ---
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || ohlcv.length < 10) return;

    // Remove existing indicator series
    for (const [key, series] of Object.entries(indicatorSeriesRef.current)) {
      try { chart.removeSeries(series); } catch { /* already removed */ }
      delete indicatorSeriesRef.current[key];
    }

    // SMA 7
    if (enabledIndicators.sma7) {
      const data = computeSMA(ohlcv, 7);
      if (data.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.sma7,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(data);
        indicatorSeriesRef.current.sma7 = series;
      }
    }

    // SMA 20
    if (enabledIndicators.sma20) {
      const data = computeSMA(ohlcv, 20);
      if (data.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.sma20,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(data);
        indicatorSeriesRef.current.sma20 = series;
      }
    }

    // SMA 50
    if (enabledIndicators.sma50) {
      const data = computeSMA(ohlcv, 50);
      if (data.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.sma50,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(data);
        indicatorSeriesRef.current.sma50 = series;
      }
    }

    // EMA 21
    if (enabledIndicators.ema21) {
      const data = computeEMA(ohlcv, 21);
      if (data.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.ema21,
          lineWidth: 1,
          lineStyle: 2, // dashed
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(data);
        indicatorSeriesRef.current.ema21 = series;
      }
    }

    // Bollinger Bands
    if (enabledIndicators.bb) {
      const bb = computeBollingerBands(ohlcv, 20, 2);
      if (bb.upper.length > 0) {
        const upperSeries = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.bb_upper,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        upperSeries.setData(bb.upper);
        indicatorSeriesRef.current.bb_upper = upperSeries;

        const middleSeries = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.bb_middle,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        middleSeries.setData(bb.middle);
        indicatorSeriesRef.current.bb_middle = middleSeries;

        const lowerSeries = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.bb_lower,
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        lowerSeries.setData(bb.lower);
        indicatorSeriesRef.current.bb_lower = lowerSeries;
      }
    }

    // VWAP
    if (enabledIndicators.vwap) {
      const data = computeVWAP(ohlcv);
      if (data.length > 0) {
        const series = chart.addSeries(LineSeries, {
          color: INDICATOR_COLORS.vwap,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        series.setData(data);
        indicatorSeriesRef.current.vwap = series;
      }
    }
  }, [ohlcv, enabledIndicators]);

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
      if (!price || !isFinite(price)) continue;
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
      console.warn('[PhantomX] Chart capture failed (cross-origin canvas)');
      return null;
    }
  }, []);

  // Run AI chart analysis (shared between manual + auto)
  const runChartAnalysis = useCallback(() => {
    const img = captureChart();
    if (!img) return;

    const store = useTradingStore.getState();
    setPatternDetecting(true);

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
          store.setLastAutoPatternTime(Date.now());
          setPatternOverlayDismissed(false); // Show overlay with new results
        }
      })
      .catch(err => {
        console.error('[PhantomX] Auto pattern detection error:', err);
      })
      .finally(() => setPatternDetecting(false));
  }, [captureChart, selectedSymbol, selectedTimeframe]);

  // Manual AI Vision click
  const handleAIVision = useCallback(() => {
    const img = captureChart();
    if (!img) return;

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
          store.setLastAutoPatternTime(Date.now());
          setPatternOverlayDismissed(false); // Show overlay with new results
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
  }, [captureChart, selectedSymbol, selectedTimeframe]);

  // --- Auto Pattern Detection ---
  // Runs once when chart data loads, then every 5 minutes
  useEffect(() => {
    if (!autoPatternDetection || ohlcv.length < 20) return;

    const store = useTradingStore.getState();
    const timeSinceLastDetection = Date.now() - store.lastAutoPatternTime;
    const AUTO_INTERVAL = 5 * 60 * 1000; // 5 minutes

    // Run immediately if never ran or > 5 min ago
    if (timeSinceLastDetection > AUTO_INTERVAL) {
      // Small delay to let chart render first
      const timeout = setTimeout(() => {
        runChartAnalysis();
      }, 2000);

      return () => clearTimeout(timeout);
    }

    // Schedule next run
    const nextRun = AUTO_INTERVAL - timeSinceLastDetection;
    autoPatternTimerRef.current = setTimeout(() => {
      runChartAnalysis();
    }, nextRun);

    return () => {
      if (autoPatternTimerRef.current) clearTimeout(autoPatternTimerRef.current);
    };
  }, [autoPatternDetection, ohlcv.length, selectedSymbol, runChartAnalysis]);

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

  // Active indicator count for badge
  const activeIndicatorCount = Object.values(enabledIndicators).filter(Boolean).length;

  return (
    <div className="relative h-full w-full">
      {/* Chart Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex flex-col bg-gradient-to-b from-[var(--cl-bg-page)] via-[var(--cl-bg-page)] to-transparent">
        {/* Row 1: Symbol / Price / Controls */}
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

        <div className="flex items-center gap-2">
          {/* Indicators toggle */}
          <button
            onClick={() => setShowIndicatorPanel(p => !p)}
            className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              showIndicatorPanel
                ? 'bg-[var(--cl-fill-accent)] border-[var(--cl-accent-border)] text-[var(--cl-accent)]'
                : 'bg-[var(--cl-fill-control)] border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)]'
            }`}
            title="Toggle technical indicators"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            TA
            {activeIndicatorCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--cl-accent)] text-white text-[8px] flex items-center justify-center font-bold">
                {activeIndicatorCount}
              </span>
            )}
          </button>

          {/* Auto Pattern Detection toggle */}
          <button
            onClick={() => setAutoPatternDetection(!autoPatternDetection)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              autoPatternDetection
                ? 'bg-[var(--cl-fill-success-active)] border-[var(--cl-success-border)] text-[var(--cl-success)]'
                : 'bg-[var(--cl-fill-control)] border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)]'
            }`}
            title={autoPatternDetection ? 'Auto pattern detection ON' : 'Auto pattern detection OFF'}
          >
            {patternDetecting ? (
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
                <path d="M11 8v6" />
                <path d="M8 11h6" />
              </svg>
            )}
            Auto
          </button>

          {/* AI Vision (manual) */}
          <button
            onClick={handleAIVision}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--cl-fill-accent)] border border-[var(--cl-accent-border)] text-[var(--cl-accent)] text-xs font-medium hover:bg-[var(--cl-fill-accent-hover)] transition-colors"
            title="Capture chart and send to AI for analysis"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            AI Vision
          </button>
        </div>
        </div>{/* end Row 1 */}

        {/* Row 2: Portfolio Metrics */}
        {isConnected && (
          <div className="flex items-center gap-4 px-4 pb-2 text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Bal</span>
              <span className="text-[var(--cl-text-primary)] font-semibold">${formatUsd(metrics.liveBalance)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">uPnL</span>
              <span className={metrics.totalUnrealizedPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.totalUnrealizedPnl >= 0 ? '+' : ''}${formatUsd(metrics.totalUnrealizedPnl)}
              </span>
            </div>
            <span className="text-[var(--cl-border)] select-none">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Day</span>
              <span className={metrics.dayPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.dayPnl >= 0 ? '+' : ''}${formatUsd(metrics.dayPnl)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Week</span>
              <span className={metrics.weekPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.weekPnl >= 0 ? '+' : ''}${formatUsd(metrics.weekPnl)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cl-text-faint)] uppercase tracking-wide text-[9px]">Month</span>
              <span className={metrics.monthPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
                {metrics.monthPnl >= 0 ? '+' : ''}${formatUsd(metrics.monthPnl)}
              </span>
            </div>
          </div>
        )}
      </div>{/* end Chart Header */}

      {/* Indicator Toggle Panel */}
      {showIndicatorPanel && (
        <div className="absolute top-[70px] right-4 z-20 glass-card p-2 rounded-xl border border-[var(--cl-border)] min-w-[180px]">
          <div className="text-[10px] font-semibold text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2 px-1">
            Technical Indicators
          </div>
          <div className="space-y-1">
            {DEFAULT_INDICATORS.map(ind => (
              <button
                key={ind.key}
                onClick={() => toggleIndicator(ind.key)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                  enabledIndicators[ind.key]
                    ? 'bg-[var(--cl-fill-hover)] text-[var(--cl-text-primary)]'
                    : 'text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)]'
                }`}
              >
                <span
                  className="w-3 h-0.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: enabledIndicators[ind.key] ? ind.color : 'var(--cl-border)' }}
                />
                <span className="flex-1 text-left">{ind.label}</span>
                {enabledIndicators[ind.key] && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Pattern Detection Overlay — draggable floating card */}
      {lastChartAnalysis && !patternOverlayDismissed && (
        <div
          className="absolute z-30 glass-card rounded-xl border border-[var(--cl-border)] w-[280px] select-none"
          style={{ top: patternOverlayPos.y, left: patternOverlayPos.x }}
        >
          {/* Drag handle + dismiss */}
          <div
            className="flex items-center justify-between px-2.5 pt-2 pb-1 cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX - patternOverlayPos.x;
              const startY = e.clientY - patternOverlayPos.y;
              const onMove = (ev: MouseEvent) => setPatternOverlayPos({ x: ev.clientX - startX, y: ev.clientY - startY });
              const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
              document.addEventListener('mousemove', onMove);
              document.addEventListener('mouseup', onUp);
            }}
          >
            <div className="flex items-center gap-2">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--cl-text-faint)]">
                <circle cx="12" cy="12" r="3" /><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              </svg>
              <span className="text-[9px] font-semibold text-[var(--cl-text-faint)] uppercase tracking-wider">AI Pattern</span>
            </div>
            <button
              onClick={() => setPatternOverlayDismissed(true)}
              className="text-[var(--cl-text-faint)] hover:text-[var(--cl-text-primary)] transition-colors p-0.5"
              title="Dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="px-2.5 pb-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                lastChartAnalysis.sentiment === 'bullish' ? 'bg-[var(--cl-success)]' :
                lastChartAnalysis.sentiment === 'bearish' ? 'bg-[var(--cl-error)]' :
                'bg-[var(--cl-warning)]'
              }`} />
              <span className="text-[11px] font-semibold text-[var(--cl-text-primary)]">
                {lastChartAnalysis.pattern}
              </span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md ${
                lastChartAnalysis.sentiment === 'bullish'
                  ? 'bg-[rgba(0,210,106,0.1)] text-[var(--cl-success)]'
                  : lastChartAnalysis.sentiment === 'bearish'
                    ? 'bg-[rgba(224,85,85,0.1)] text-[var(--cl-error)]'
                    : 'bg-[rgba(255,193,7,0.1)] text-[var(--cl-warning)]'
              }`}>
                {lastChartAnalysis.sentiment}
              </span>
            </div>

            {/* Confidence bar */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] text-[var(--cl-text-faint)]">Confidence</span>
              <div className="flex-1 h-1 rounded-full bg-[var(--cl-fill-control)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    lastChartAnalysis.confidence >= 0.7 ? 'bg-[var(--cl-success)]' :
                    lastChartAnalysis.confidence >= 0.4 ? 'bg-[var(--cl-warning)]' :
                    'bg-[var(--cl-error)]'
                  }`}
                  style={{ width: `${lastChartAnalysis.confidence * 100}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-[var(--cl-text-faint)]">
                {(lastChartAnalysis.confidence * 100).toFixed(0)}%
              </span>
            </div>

            {/* Key levels */}
            {lastChartAnalysis.keyLevels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lastChartAnalysis.keyLevels.slice(0, 4).map((level, i) => (
                  <span
                    key={i}
                    className={`text-[8px] font-mono px-1.5 py-0.5 rounded-md border ${
                      level.type === 'support'
                        ? 'border-[var(--cl-success-border)] text-[var(--cl-success)] bg-[rgba(0,210,106,0.05)]'
                        : level.type === 'resistance'
                          ? 'border-[var(--cl-error-border)] text-[var(--cl-error)] bg-[rgba(224,85,85,0.05)]'
                          : 'border-[var(--cl-border)] text-[var(--cl-text-faint)]'
                    }`}
                  >
                    {level.type === 'support' ? 'S' : level.type === 'resistance' ? 'R' : level.type.charAt(0).toUpperCase()}: ${formatPrice(level.price)}
                  </span>
                ))}
              </div>
            )}

            {/* Recommendation */}
            <div className="mt-1.5 text-[9px] text-[var(--cl-text-faint)] leading-tight line-clamp-3">
              {lastChartAnalysis.recommendation}
            </div>

            {patternDetecting && (
              <div className="mt-1 flex items-center gap-1 text-[8px] text-[var(--cl-accent)]">
                <span className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
                Updating...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawing Toolbar */}
      <DrawingToolbar />

      {/* Indicator Legend (active indicators shown as small colored labels) */}
      {activeIndicatorCount > 0 && (
        <div className="absolute top-[68px] left-4 z-10 flex items-center gap-1.5">
          {DEFAULT_INDICATORS.filter(ind => enabledIndicators[ind.key as IndicatorKey]).map(ind => (
            <span
              key={ind.key}
              className="text-[8px] font-mono px-1.5 py-0.5 rounded-md bg-[rgba(0,0,0,0.4)] backdrop-blur-sm"
              style={{ color: ind.color }}
            >
              {ind.label}
            </span>
          ))}
        </div>
      )}

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
