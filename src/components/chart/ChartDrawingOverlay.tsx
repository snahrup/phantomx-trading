'use client';

import { useEffect, useRef, useCallback, useState, type RefObject } from 'react';
import type { IChartApi, Time } from 'lightweight-charts';
import { useTradingStore } from '@/store/trading-store';
import type { ChartDrawing, DrawingPoint } from '@/types/trading';

// Cache CSS variable reads to avoid getComputedStyle on every render (HIGH-13)
const cssVarCache: Record<string, { value: string; time: number }> = {};
const CSS_CACHE_TTL = 5000; // Refresh every 5s (covers theme changes)

function getCssVar(name: string): string {
  if (typeof window === 'undefined') return '';
  const now = Date.now();
  const cached = cssVarCache[name];
  if (cached && now - cached.time < CSS_CACHE_TTL) return cached.value;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  cssVarCache[name] = { value, time: now };
  return value;
}

interface Props {
  chartRef: RefObject<IChartApi | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candleSeriesRef: RefObject<any>;
  containerRef: RefObject<HTMLDivElement | null>;
}

// Fibonacci default levels
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function getFibColors(): Record<number, string> {
  return {
    0: getCssVar('--cl-error'), 0.236: '#f97316', 0.382: getCssVar('--cl-warning'),
    0.5: getCssVar('--cl-text-faint'), 0.618: getCssVar('--cl-success'), 0.786: getCssVar('--cl-info'), 1: '#a855f7',
  };
}

export default function ChartDrawingOverlay({ chartRef, candleSeriesRef, containerRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<DrawingPoint | null>(null);
  const [currentPoint, setCurrentPoint] = useState<DrawingPoint | null>(null);

  const {
    drawings, activeDrawingTool, drawingColor, drawingLineWidth,
    addDrawing,
  } = useTradingStore();

  // Convert pixel coordinates to chart price/time
  const pixelToPoint = useCallback((x: number, y: number): DrawingPoint | null => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;

    const timeScale = chart.timeScale();
    const time = timeScale.coordinateToTime(x);
    const price = series.coordinateToPrice(y);

    if (time === null || price === null) return null;
    return { time: time as number, price };
  }, [chartRef, candleSeriesRef]);

  // Convert chart price/time to pixel coordinates
  const pointToPixel = useCallback((point: DrawingPoint): { x: number; y: number } | null => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return null;

    const timeScale = chart.timeScale();
    const x = timeScale.timeToCoordinate(point.time as unknown as Time);
    const y = series.priceToCoordinate(point.price);

    if (x === null || y === null) return null;
    return { x, y };
  }, [chartRef, candleSeriesRef]);

  // Render a single drawing — declared BEFORE render() which depends on it
  const renderDrawing = useCallback((ctx: CanvasRenderingContext2D, drawing: ChartDrawing, canvasWidth: number) => {
    if (drawing.points.length === 0) return;

    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = drawing.lineWidth;
    ctx.fillStyle = drawing.color;
    ctx.font = '11px monospace';

    // Set line dash
    if (drawing.lineStyle === 'dashed') ctx.setLineDash([8, 4]);
    else if (drawing.lineStyle === 'dotted') ctx.setLineDash([2, 4]);
    else ctx.setLineDash([]);

    switch (drawing.tool) {
      case 'horizontal': {
        const p = pointToPixel(drawing.points[0]);
        if (!p) break;
        ctx.beginPath();
        ctx.moveTo(0, p.y);
        ctx.lineTo(canvasWidth, p.y);
        ctx.stroke();
        if (drawing.label) {
          ctx.fillStyle = `${drawing.color}cc`;
          ctx.fillText(drawing.label, 8, p.y - 4);
        }
        break;
      }

      case 'trendline': {
        if (drawing.points.length < 2) break;
        const p1 = pointToPixel(drawing.points[0]);
        const p2 = pointToPixel(drawing.points[1]);
        if (!p1 || !p2) break;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        if (drawing.label) {
          ctx.fillStyle = `${drawing.color}cc`;
          ctx.fillText(drawing.label, p2.x + 4, p2.y - 4);
        }
        break;
      }

      case 'ray': {
        if (drawing.points.length < 2) break;
        const p1 = pointToPixel(drawing.points[0]);
        const p2 = pointToPixel(drawing.points[1]);
        if (!p1 || !p2) break;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const extendFactor = canvasWidth / Math.max(Math.abs(dx), 1);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + dx * extendFactor, p1.y + dy * extendFactor);
        ctx.stroke();
        break;
      }

      case 'fibonacci': {
        if (drawing.points.length < 2) break;
        const p1 = pointToPixel(drawing.points[0]);
        const p2 = pointToPixel(drawing.points[1]);
        if (!p1 || !p2) break;

        const levels = drawing.fibLevels || FIB_LEVELS;
        const priceRange = drawing.points[1].price - drawing.points[0].price;
        const fibColors = getFibColors();

        for (const level of levels) {
          const price = drawing.points[0].price + priceRange * (1 - level);
          const point = pointToPixel({ time: drawing.points[0].time, price });
          if (!point) continue;

          const levelColor = fibColors[level] || drawing.color;
          ctx.strokeStyle = levelColor;
          ctx.lineWidth = level === 0 || level === 1 ? drawing.lineWidth : 1;
          ctx.setLineDash(level === 0.5 ? [4, 4] : []);

          ctx.beginPath();
          ctx.moveTo(Math.min(p1.x, p2.x), point.y);
          ctx.lineTo(Math.max(p1.x, p2.x, canvasWidth * 0.9), point.y);
          ctx.stroke();

          // Level label
          ctx.fillStyle = `${levelColor}cc`;
          ctx.fillText(
            `${(level * 100).toFixed(1)}% — $${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
            Math.max(p1.x, p2.x) + 8,
            point.y - 3,
          );
        }

        // Shaded zone between 0.618 and 0.382 (golden pocket)
        const p618 = pointToPixel({ time: drawing.points[0].time, price: drawing.points[0].price + priceRange * (1 - 0.618) });
        const p382 = pointToPixel({ time: drawing.points[0].time, price: drawing.points[0].price + priceRange * (1 - 0.382) });
        if (p618 && p382) {
          ctx.fillStyle = getCssVar('--cl-fill-success-subtle');
          ctx.fillRect(0, Math.min(p618.y, p382.y), canvasWidth, Math.abs(p618.y - p382.y));
        }

        // Reset
        ctx.strokeStyle = drawing.color;
        ctx.lineWidth = drawing.lineWidth;
        ctx.setLineDash([]);
        break;
      }

      case 'rectangle': {
        if (drawing.points.length < 2) break;
        const p1 = pointToPixel(drawing.points[0]);
        const p2 = pointToPixel(drawing.points[1]);
        if (!p1 || !p2) break;

        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);

        ctx.fillStyle = `${drawing.color}15`;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        if (drawing.label || drawing.patternName) {
          ctx.fillStyle = `${drawing.color}cc`;
          ctx.fillText(drawing.patternName || drawing.label || '', x + 4, y - 4);
        }
        break;
      }
    }

    ctx.setLineDash([]);
  }, [pointToPixel]);

  // Render all drawings on canvas
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw all saved drawings
    for (const drawing of drawings) {
      if (!drawing.visible) continue;
      renderDrawing(ctx, drawing, rect.width);
    }

    // Draw current in-progress drawing
    if (isDrawing && startPoint && currentPoint) {
      renderDrawing(ctx, {
        id: 'in-progress',
        tool: activeDrawingTool,
        points: [startPoint, currentPoint],
        color: drawingColor,
        lineWidth: drawingLineWidth,
        lineStyle: 'solid',
        source: 'manual',
        locked: false,
        visible: true,
        fibLevels: FIB_LEVELS,
        timestamp: Date.now(),
      }, rect.width);
    }
  }, [drawings, isDrawing, startPoint, currentPoint, activeDrawingTool, drawingColor, drawingLineWidth, containerRef, renderDrawing]);

  // Mouse handlers for drawing
  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (activeDrawingTool === 'select') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const point = pixelToPoint(x, y);
    if (!point) return;

    setIsDrawing(true);
    setStartPoint(point);
    setCurrentPoint(point);
  }, [activeDrawingTool, pixelToPoint]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const point = pixelToPoint(x, y);
    if (point) setCurrentPoint(point);
  }, [isDrawing, pixelToPoint]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !startPoint || !currentPoint) {
      setIsDrawing(false);
      return;
    }

    // For horizontal lines, only need one point
    const points = activeDrawingTool === 'horizontal'
      ? [currentPoint]
      : [startPoint, currentPoint];

    // Don't create tiny accidental drawings
    if (activeDrawingTool !== 'horizontal') {
      const p1 = pointToPixel(startPoint);
      const p2 = pointToPixel(currentPoint);
      if (p1 && p2) {
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (dist < 5) {
          setIsDrawing(false);
          setStartPoint(null);
          setCurrentPoint(null);
          return;
        }
      }
    }

    addDrawing({
      id: `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: activeDrawingTool,
      points,
      color: drawingColor,
      lineWidth: drawingLineWidth,
      lineStyle: 'solid',
      source: 'manual',
      locked: false,
      visible: true,
      fibLevels: activeDrawingTool === 'fibonacci' ? FIB_LEVELS : undefined,
      timestamp: Date.now(),
    });

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [isDrawing, startPoint, currentPoint, activeDrawingTool, drawingColor, drawingLineWidth, addDrawing, pointToPixel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        useTradingStore.getState().undoDrawing();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        useTradingStore.getState().redoDrawing();
      } else if (e.key === 'Escape') {
        useTradingStore.getState().setActiveDrawingTool('select');
        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPoint(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Attach mouse handlers to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseDown, handleMouseMove, handleMouseUp]);

  // Re-render when drawings/state change or chart viewport moves
  // CRIT-8 fix: Event-driven instead of 60fps RAF loop
  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const handler = () => {
      // Debounce: single RAF per scroll event, not continuous loop
      requestAnimationFrame(() => render());
    };
    ts.subscribeVisibleLogicalRangeChange(handler);
    return () => ts.unsubscribeVisibleLogicalRangeChange(handler);
  }, [chartRef, render]);

  const cursor = activeDrawingTool === 'select' ? 'default' : 'crosshair';

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10"
      style={{
        cursor,
        pointerEvents: activeDrawingTool === 'select' ? 'none' : 'auto',
      }}
    />
  );
}
