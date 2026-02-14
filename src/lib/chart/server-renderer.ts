// ============================================================================
// PhantomX — Server-Side Candlestick Chart Renderer
// Generates PNG chart images for Claude vision analysis
// Uses node-canvas (no browser required)
// ============================================================================

import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';

export interface CandleData {
  time: string;          // ISO timestamp or label
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorOverlay {
  sma7?: number[];
  sma20?: number[];
  sma50?: number[];
  rsi14?: number;        // single latest value — drawn as badge
}

interface ChartConfig {
  width: number;
  height: number;
  candles: CandleData[];
  indicators?: IndicatorOverlay;
  symbol: string;
  timeframe?: string;
}

// ---------------------------------------------------------------------------
// Colors (dark theme matching PhantomX UI)
// ---------------------------------------------------------------------------
const COLORS = {
  background: '#0d0d1a',
  grid: 'rgba(255,255,255,0.04)',
  gridLabel: 'rgba(255,255,255,0.3)',
  bullCandle: '#00d26a',
  bearCandle: '#dc3545',
  bullWick: '#00d26a',
  bearWick: '#dc3545',
  sma7: '#ffc107',
  sma20: '#3b82f6',
  sma50: '#a855f7',
  volumeBull: 'rgba(0,210,106,0.15)',
  volumeBear: 'rgba(220,53,69,0.15)',
  text: 'rgba(255,255,255,0.6)',
  labelBg: 'rgba(255,255,255,0.08)',
  rsiBg: 'rgba(174,86,48,0.2)',
  rsiText: '#AE5630',
};

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------
export function renderCandlestickChart(config: ChartConfig): string {
  const { width, height, candles, indicators, symbol, timeframe } = config;

  if (candles.length === 0) return '';

  const canvas: Canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  // Layout regions
  const PADDING = { top: 32, right: 60, bottom: 40, left: 12 };
  const VOLUME_HEIGHT = Math.round(height * 0.15);
  const chartLeft = PADDING.left;
  const chartRight = width - PADDING.right;
  const chartTop = PADDING.top;
  const chartBottom = height - PADDING.bottom - VOLUME_HEIGHT;
  const volumeBottom = height - PADDING.bottom;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  // Price range
  const prices = candles.flatMap(c => [c.high, c.low]);
  let priceMin = Math.min(...prices);
  let priceMax = Math.max(...prices);
  const priceRange = priceMax - priceMin;
  priceMin -= priceRange * 0.05;
  priceMax += priceRange * 0.05;

  // Volume range
  const volumes = candles.map(c => c.volume);
  const volMax = Math.max(...volumes) || 1;

  // Price → Y
  const priceToY = (price: number): number =>
    chartTop + (1 - (price - priceMin) / (priceMax - priceMin)) * chartHeight;

  // Volume → Y
  const volToY = (vol: number): number =>
    volumeBottom - (vol / volMax) * VOLUME_HEIGHT;

  // Candle geometry
  const candleCount = candles.length;
  const candleSlotWidth = chartWidth / candleCount;
  const candleBodyWidth = Math.max(2, Math.floor(candleSlotWidth * 0.65));

  // --- Grid lines (horizontal) ---
  const gridLines = 5;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.font = '10px monospace';
  ctx.fillStyle = COLORS.gridLabel;
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const price = priceMin + (priceMax - priceMin) * (i / gridLines);
    const y = priceToY(price);
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartRight, y);
    ctx.stroke();
    ctx.fillText(formatPrice(price), width - 4, y + 3);
  }

  // --- Volume bars ---
  for (let i = 0; i < candleCount; i++) {
    const c = candles[i];
    const x = chartLeft + i * candleSlotWidth + candleSlotWidth / 2;
    const isBull = c.close >= c.open;
    ctx.fillStyle = isBull ? COLORS.volumeBull : COLORS.volumeBear;
    const vTop = volToY(c.volume);
    ctx.fillRect(x - candleBodyWidth / 2, vTop, candleBodyWidth, volumeBottom - vTop);
  }

  // --- Candlesticks ---
  for (let i = 0; i < candleCount; i++) {
    const c = candles[i];
    const x = chartLeft + i * candleSlotWidth + candleSlotWidth / 2;
    const isBull = c.close >= c.open;

    // Wick
    ctx.strokeStyle = isBull ? COLORS.bullWick : COLORS.bearWick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, priceToY(c.high));
    ctx.lineTo(x, priceToY(c.low));
    ctx.stroke();

    // Body
    const bodyTop = priceToY(Math.max(c.open, c.close));
    const bodyBot = priceToY(Math.min(c.open, c.close));
    const bodyHeight = Math.max(1, bodyBot - bodyTop);

    ctx.fillStyle = isBull ? COLORS.bullCandle : COLORS.bearCandle;
    ctx.fillRect(x - candleBodyWidth / 2, bodyTop, candleBodyWidth, bodyHeight);
  }

  // --- SMA overlays ---
  if (indicators) {
    drawSMA(ctx, indicators.sma7, candles, candleSlotWidth, chartLeft, priceToY, COLORS.sma7, candleCount);
    drawSMA(ctx, indicators.sma20, candles, candleSlotWidth, chartLeft, priceToY, COLORS.sma20, candleCount);
    drawSMA(ctx, indicators.sma50, candles, candleSlotWidth, chartLeft, priceToY, COLORS.sma50, candleCount);
  }

  // --- Time labels (bottom) ---
  ctx.fillStyle = COLORS.gridLabel;
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const labelEvery = Math.max(1, Math.floor(candleCount / 6));
  for (let i = 0; i < candleCount; i += labelEvery) {
    const x = chartLeft + i * candleSlotWidth + candleSlotWidth / 2;
    ctx.fillText(candles[i].time, x, height - 4);
  }

  // --- Title / symbol badge ---
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  const title = `${symbol}${timeframe ? ` · ${timeframe}` : ''}`;
  ctx.fillText(title, chartLeft + 4, 18);

  // --- Last price badge ---
  const lastCandle = candles[candleCount - 1];
  const lastY = priceToY(lastCandle.close);
  const isBull = lastCandle.close >= lastCandle.open;
  ctx.fillStyle = isBull ? COLORS.bullCandle : COLORS.bearCandle;
  ctx.fillRect(chartRight + 2, lastY - 8, PADDING.right - 4, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(formatPrice(lastCandle.close), chartRight + PADDING.right / 2, lastY + 4);

  // --- RSI badge (if present) ---
  if (indicators?.rsi14 !== undefined && indicators.rsi14 !== null) {
    const rsi = indicators.rsi14;
    const rsiColor = rsi > 70 ? COLORS.bearCandle : rsi < 30 ? COLORS.bullCandle : COLORS.rsiText;
    const rsiLabel = `RSI ${rsi.toFixed(0)}`;
    ctx.font = 'bold 10px monospace';
    const rsiWidth = ctx.measureText(rsiLabel).width + 12;
    ctx.fillStyle = COLORS.rsiBg;
    ctx.fillRect(chartRight - rsiWidth - 4, 6, rsiWidth, 18);
    ctx.fillStyle = rsiColor;
    ctx.textAlign = 'left';
    ctx.fillText(rsiLabel, chartRight - rsiWidth + 2, 19);
  }

  // --- SMA legend ---
  if (indicators) {
    let legendX = chartLeft + ctx.measureText(title).width + 16;
    const legendY = 18;
    ctx.font = '9px monospace';

    if (indicators.sma7?.length) {
      ctx.fillStyle = COLORS.sma7;
      ctx.fillText(`SMA7`, legendX, legendY);
      legendX += 36;
    }
    if (indicators.sma20?.length) {
      ctx.fillStyle = COLORS.sma20;
      ctx.fillText(`SMA20`, legendX, legendY);
      legendX += 42;
    }
    if (indicators.sma50?.length) {
      ctx.fillStyle = COLORS.sma50;
      ctx.fillText(`SMA50`, legendX, legendY);
    }
  }

  // Export as PNG base64
  return canvas.toBuffer('image/png').toString('base64');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawSMA(
  ctx: CanvasRenderingContext2D,
  values: number[] | undefined,
  candles: CandleData[],
  slotWidth: number,
  chartLeft: number,
  priceToY: (p: number) => number,
  color: string,
  candleCount: number,
) {
  if (!values || values.length === 0) return;

  // SMA array is aligned to the END of the candles array
  const offset = candleCount - values.length;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  let started = false;

  for (let i = 0; i < values.length; i++) {
    const ci = offset + i;
    if (ci < 0 || ci >= candleCount || values[i] == null) continue;

    const x = chartLeft + ci * slotWidth + slotWidth / 2;
    const y = priceToY(values[i]);

    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(0);
  if (price >= 1) return price.toFixed(2);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

// ---------------------------------------------------------------------------
// Convenience: Build chart from OHLCV arrays (used by heartbeat engines)
// ---------------------------------------------------------------------------
export interface OHLCVRow {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function renderChartFromOHLCV(
  ohlcv: OHLCVRow[],
  symbol: string,
  timeframe: string,
  indicators?: IndicatorOverlay,
): string {
  const candles: CandleData[] = ohlcv.map(c => ({
    time: new Date(c.timestamp).toISOString().slice(11, 16),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));

  return renderCandlestickChart({
    width: 800,
    height: 400,
    candles,
    indicators,
    symbol: symbol.replace('/USDT:USDT', ''),
    timeframe,
  });
}
