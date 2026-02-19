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
import { DEFAULT_INDICATORS, type IndicatorKey } from '@/lib/chart/indicators';
import { indicatorRegistry, signalToMarker, type IndicatorOutput } from '@/lib/chart/indicator-registry';
import { registerAllIndicators } from '@/lib/chart/indicator-definitions';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import IndicatorSelector from './IndicatorSelector';

// Initialize indicator registry once
registerAllIndicators();

/**
 * Reads the computed value of a CSS custom property from :root and converts
 * it to a hex color string that lightweight-charts can parse.
 *
 * The design system uses OKLCH tokens which browsers resolve to lab() —
 * lightweight-charts only understands hex/rgb/rgba/named colors.
 * We force resolution by setting a temp element's color and reading computed style,
 * which always returns rgb()/rgba().
 */
function resolveToHex(raw: string): string {
  if (!raw) return '#000000';
  // Already hex — pass through
  if (raw.startsWith('#')) return raw;
  // Already rgb/rgba — convert to hex
  const rgbMatch = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
      .map(n => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  }
  // lab/oklch/hsl/etc — use DOM to resolve to rgb
  const el = document.createElement('div');
  el.style.color = raw;
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color;
  el.remove();
  const m = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return '#' + [m[1], m[2], m[3]]
      .map(n => parseInt(n).toString(16).padStart(2, '0'))
      .join('');
  }
  return '#000000'; // ultimate fallback
}

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '#000000';
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return resolveToHex(raw);
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

// Trading chart color palette — pro dark trading aesthetic
// Light theme uses muted versions, dark theme uses vivid versions
const CHART = {
  light: {
    bg: '#F5F5F0',
    text: '#6B6A68',
    grid: 'rgba(0, 0, 0, 0.04)',
    border: 'rgba(0, 0, 0, 0.08)',
    crosshair: '#8A8984',
    crosshairLabel: '#E8E7E2',
    candleUp: '#2D8547',
    candleDown: '#D4183D',
    volUp: 'rgba(45, 133, 71, 0.15)',
    volDown: 'rgba(212, 24, 61, 0.15)',
  },
  dark: {
    bg: '#1A1A1F',
    text: '#8A8984',
    grid: 'rgba(255, 255, 255, 0.03)',
    border: 'rgba(255, 255, 255, 0.06)',
    crosshair: '#6B6A68',
    crosshairLabel: '#2B2A27',
    candleUp: '#5FB87A',
    candleDown: '#E05555',
    volUp: 'rgba(95, 184, 122, 0.25)',
    volDown: 'rgba(224, 85, 85, 0.25)',
  },
};

/**
 * Detect whether we're in dark mode by checking the data-theme attribute.
 */
function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indicatorSeriesRef = useRef<Record<string, ISeriesApi<any>>>({});
  const autoPatternTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [patternDetecting, setPatternDetecting] = useState(false);
  const [patternOverlayPos, setPatternOverlayPos] = useState({ x: 56, y: 120 });
  const [patternOverlayDismissed, setPatternOverlayDismissed] = useState(false);

  const {
    ohlcv, annotations, priceLines, selectedSymbol, selectedTimeframe,
    ticker, theme, accountValue, positions, autopilotClosedTrades, isConnected,
    enabledIndicators, indicatorParams, autoPatternDetection, lastChartAnalysis,
    toggleIndicator, setIndicatorSignals, setAutoPatternDetection,
  } = useTradingStore();

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const dark = isDarkMode();
    const t = dark ? CHART.dark : CHART.light;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: t.bg },
        textColor: t.text,
        fontSize: 12,
      },
      grid: {
        vertLines: { color: t.grid },
        horzLines: { color: t.grid },
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: t.crosshair,
          labelBackgroundColor: t.crosshairLabel,
        },
        horzLine: {
          color: t.crosshair,
          labelBackgroundColor: t.crosshairLabel,
        },
      },
      rightPriceScale: {
        borderColor: t.border,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: t.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: t.candleUp,
      downColor: t.candleDown,
      borderDownColor: t.candleDown,
      borderUpColor: t.candleUp,
      wickDownColor: t.candleDown,
      wickUpColor: t.candleUp,
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

    const t = isDarkMode() ? CHART.dark : CHART.light;

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
      color: c.close >= c.open ? t.volUp : t.volDown,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
  }, [ohlcv]);

  // --- Indicator Overlays (Registry-Driven) ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indicatorPriceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || ohlcv.length < 10) return;

    // Remove existing indicator series
    for (const [key, series] of Object.entries(indicatorSeriesRef.current)) {
      try { chart.removeSeries(series); } catch { /* already removed */ }
      delete indicatorSeriesRef.current[key];
    }

    // Remove existing indicator price lines
    for (const pl of indicatorPriceLinesRef.current) {
      try { candleSeriesRef.current?.removePriceLine(pl); } catch { /* ok */ }
    }
    indicatorPriceLinesRef.current = [];

    // Compute all enabled indicators via the registry
    const result = indicatorRegistry.computeAll(enabledIndicators, ohlcv, indicatorParams);

    // Collect all markers from indicators
    const allMarkers: SeriesMarker<Time>[] = [];

    // Set up sub-pane price scales for panel indicators
    const subPaneScales = new Set<string>();

    for (const output of result.outputs) {
      switch (output.type) {
        case 'line': {
          // Set up sub-pane scale if needed
          if (output.pane === 'sub_pane' && output.priceScaleId && !subPaneScales.has(output.priceScaleId)) {
            chart.priceScale(output.priceScaleId).applyOptions({
              scaleMargins: { top: 0.75, bottom: 0.02 },
            });
            subPaneScales.add(output.priceScaleId);
          }

          const series = chart.addSeries(LineSeries, {
            color: output.color,
            lineWidth: output.lineWidth as 1 | 2 | 3 | 4,
            lineStyle: output.lineStyle ?? 0,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            ...(output.priceScaleId ? { priceScaleId: output.priceScaleId } : {}),
          });
          series.setData(output.data);
          indicatorSeriesRef.current[output.key] = series;
          break;
        }
        case 'histogram': {
          if (output.pane === 'sub_pane' && output.priceScaleId && !subPaneScales.has(output.priceScaleId)) {
            chart.priceScale(output.priceScaleId).applyOptions({
              scaleMargins: { top: 0.75, bottom: 0.02 },
            });
            subPaneScales.add(output.priceScaleId);
          }

          const series = chart.addSeries(HistogramSeries, {
            priceLineVisible: false,
            lastValueVisible: false,
            ...(output.priceScaleId ? { priceScaleId: output.priceScaleId } : {}),
          });
          series.setData(output.data);
          indicatorSeriesRef.current[output.key] = series;
          break;
        }
        case 'markers': {
          allMarkers.push(...output.data);
          break;
        }
        case 'price_line': {
          if (candleSeriesRef.current) {
            const pl = candleSeriesRef.current.createPriceLine({
              price: output.price,
              color: output.color,
              lineWidth: output.lineWidth as 1 | 2 | 3 | 4,
              lineStyle: output.lineStyle,
              axisLabelVisible: output.axisLabelVisible,
              title: output.label,
            });
            indicatorPriceLinesRef.current.push(pl);
          }
          break;
        }
      }
    }

    // Convert signals to markers and merge
    for (const signal of result.signals) {
      allMarkers.push(signalToMarker(signal));
    }

    // Apply merged markers to candle series (sorted by time)
    if (allMarkers.length > 0 && candleSeriesRef.current) {
      const sorted = allMarkers.sort((a, b) => {
        const ta = typeof a.time === 'number' ? a.time : 0;
        const tb = typeof b.time === 'number' ? b.time : 0;
        return ta - tb;
      });
      try { candleSeriesRef.current.setMarkers(sorted); } catch { /* ok */ }
    }

    // Update signals in store for AI context
    setIndicatorSignals(result.signals.map(s => ({
      type: s.type, direction: s.direction, strength: s.strength, description: s.description,
    })));

  }, [ohlcv, enabledIndicators, indicatorParams, setIndicatorSignals]);

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
      <div className="absolute top-0 left-0 right-0 z-10 flex flex-col bg-gradient-to-b from-[#F5F5F0] via-[#F5F5F0] to-transparent dark:from-[#1A1A1F] dark:via-[#1A1A1F]">
        {/* Row 1: Symbol / Price / Controls */}
        <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-foreground">{selectedSymbol}</span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted/80 text-muted-foreground">
            {selectedTimeframe}
          </span>
          {ticker && (
            <>
              <span className={`text-lg font-mono font-semibold ${
                (ticker.changePercent24h ?? 0) >= 0 ? 'text-[#2D8547] dark:text-[#5FB87A]' : 'text-[#D4183D] dark:text-[#E05555]'
              }`}>
                {ticker.last ? formatPrice(ticker.last) : '\u2014'}
              </span>
              <span className={`text-xs font-mono ${
                (ticker.changePercent24h ?? 0) >= 0 ? 'text-[#2D8547] dark:text-[#5FB87A]' : 'text-[#D4183D] dark:text-[#E05555]'
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
                ? 'bg-primary/5 border-primary/20 text-primary'
                : 'bg-muted border-border text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle technical indicators"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            TA
            {activeIndicatorCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] flex items-center justify-center font-bold">
                {activeIndicatorCount}
              </span>
            )}
          </button>

          {/* Auto Pattern Detection toggle */}
          <button
            onClick={() => setAutoPatternDetection(!autoPatternDetection)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              autoPatternDetection
                ? 'bg-[#2D8547]/20 border-[#2D8547]/20 text-[#2D8547]'
                : 'bg-muted border-border text-muted-foreground hover:text-foreground'
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
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
              <span className="text-muted-foreground uppercase tracking-wide text-[9px]">Bal</span>
              <span className="text-foreground font-semibold">${formatUsd(metrics.liveBalance)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase tracking-wide text-[9px]">uPnL</span>
              <span className={metrics.totalUnrealizedPnl >= 0 ? 'text-[#2D8547] dark:text-[#5FB87A]' : 'text-[#D4183D] dark:text-[#E05555]'}>
                {metrics.totalUnrealizedPnl >= 0 ? '+' : ''}${formatUsd(metrics.totalUnrealizedPnl)}
              </span>
            </div>
            <span className="text-border select-none">|</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase tracking-wide text-[9px]">Day</span>
              <span className={metrics.dayPnl >= 0 ? 'text-[#2D8547] dark:text-[#5FB87A]' : 'text-[#D4183D] dark:text-[#E05555]'}>
                {metrics.dayPnl >= 0 ? '+' : ''}${formatUsd(metrics.dayPnl)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase tracking-wide text-[9px]">Week</span>
              <span className={metrics.weekPnl >= 0 ? 'text-[#2D8547] dark:text-[#5FB87A]' : 'text-[#D4183D] dark:text-[#E05555]'}>
                {metrics.weekPnl >= 0 ? '+' : ''}${formatUsd(metrics.weekPnl)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground uppercase tracking-wide text-[9px]">Month</span>
              <span className={metrics.monthPnl >= 0 ? 'text-[#2D8547] dark:text-[#5FB87A]' : 'text-[#D4183D] dark:text-[#E05555]'}>
                {metrics.monthPnl >= 0 ? '+' : ''}${formatUsd(metrics.monthPnl)}
              </span>
            </div>
          </div>
        )}
      </div>{/* end Chart Header */}

      {/* Indicator Selector Panel */}
      {showIndicatorPanel && (
        <IndicatorSelector onClose={() => setShowIndicatorPanel(false)} />
      )}

      {/* AI Pattern Detection Overlay — draggable floating card */}
      {lastChartAnalysis && !patternOverlayDismissed && (
        <Card
          className="absolute z-30 rounded-xl w-[280px] select-none gap-0 py-0 shadow-md"
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
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                <circle cx="12" cy="12" r="3" /><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              </svg>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">AI Pattern</span>
            </div>
            <button
              onClick={() => setPatternOverlayDismissed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
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
                lastChartAnalysis.sentiment === 'bullish' ? 'bg-[#2D8547]' :
                lastChartAnalysis.sentiment === 'bearish' ? 'bg-destructive' :
                'bg-[#B8860B]'
              }`} />
              <span className="text-[11px] font-semibold text-foreground">
                {lastChartAnalysis.pattern}
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] font-mono px-1.5 py-0.5 ${
                  lastChartAnalysis.sentiment === 'bullish'
                    ? 'bg-[rgba(0,210,106,0.1)] text-[#2D8547] border-[#2D8547]/20'
                    : lastChartAnalysis.sentiment === 'bearish'
                      ? 'bg-[rgba(224,85,85,0.1)] text-destructive border-destructive/20'
                      : 'bg-[rgba(255,193,7,0.1)] text-[#B8860B] border-[#B8860B]/20'
                }`}
              >
                {lastChartAnalysis.sentiment}
              </Badge>
            </div>

            {/* Confidence bar */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] text-muted-foreground">Confidence</span>
              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    lastChartAnalysis.confidence >= 0.7 ? 'bg-[#2D8547]' :
                    lastChartAnalysis.confidence >= 0.4 ? 'bg-[#B8860B]' :
                    'bg-destructive'
                  }`}
                  style={{ width: `${lastChartAnalysis.confidence * 100}%` }}
                />
              </div>
              <span className="text-[9px] font-mono text-muted-foreground">
                {(lastChartAnalysis.confidence * 100).toFixed(0)}%
              </span>
            </div>

            {/* Key levels */}
            {lastChartAnalysis.keyLevels?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {lastChartAnalysis.keyLevels.slice(0, 4).map((level, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className={`text-[8px] font-mono px-1.5 py-0.5 ${
                      level.type === 'support'
                        ? 'border-[#2D8547]/20 text-[#2D8547] bg-[rgba(45,133,71,0.05)]'
                        : level.type === 'resistance'
                          ? 'border-destructive/20 text-destructive bg-[rgba(212,24,61,0.05)]'
                          : 'border-border text-muted-foreground'
                    }`}
                  >
                    {level.type === 'support' ? 'S' : level.type === 'resistance' ? 'R' : level.type.charAt(0).toUpperCase()}: ${formatPrice(level.price)}
                  </Badge>
                ))}
              </div>
            )}

            {/* Recommendation */}
            <div className="mt-1.5 text-[9px] text-muted-foreground leading-tight line-clamp-3">
              {lastChartAnalysis.recommendation}
            </div>

            {patternDetecting && (
              <div className="mt-1 flex items-center gap-1 text-[8px] text-primary">
                <span className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
                Updating...
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Drawing Toolbar */}
      <DrawingToolbar />

      {/* Indicator Legend (active indicators shown as small colored labels) */}
      {activeIndicatorCount > 0 && (
        <div className="absolute top-[68px] left-4 z-10 flex flex-wrap items-center gap-1.5 max-w-[60%]">
          {indicatorRegistry.getEnabled(enabledIndicators).map(ind => (
            <span
              key={ind.key}
              className="text-[8px] font-mono px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-sm"
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
          <Card className={`px-2 py-1 text-xs font-mono gap-0 shadow-sm ${
            (a.pnl ?? 0) >= 0 ? 'text-[#2D8547] border-[#2D8547]/20' : 'text-destructive border-destructive/20'
          }`}>
            {(a.pnl ?? 0) >= 0 ? '+' : ''}{a.pnl?.toFixed(2)} ({a.pnlPercent?.toFixed(1)}%)
          </Card>
        </div>
      ))}
    </div>
  );
}
