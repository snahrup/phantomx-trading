// ============================================================================
// PhantomX — AI Pattern Visualizer
// Converts Claude's chart analysis into drawable chart objects
// ============================================================================

import type { ChartDrawing, ChartAnalysis, OHLCV } from '@/types/trading';

// Pattern-to-drawing converter
// Uses the OHLCV data + analysis to create visual overlays
export function createPatternDrawings(
  analysis: ChartAnalysis,
  ohlcv: OHLCV[],
): ChartDrawing[] {
  if (ohlcv.length < 10) return [];

  const drawings: ChartDrawing[] = [];
  const pattern = analysis.pattern.toLowerCase();
  const now = Date.now();
  const recent = ohlcv.slice(-50);
  const sentiment = analysis.sentiment;

  // Find local highs and lows for pattern visualization
  const highs: { time: number; price: number }[] = [];
  const lows: { time: number; price: number }[] = [];

  for (let i = 2; i < recent.length - 2; i++) {
    const candle = recent[i];
    if (candle.high > recent[i - 1].high && candle.high > recent[i - 2].high &&
        candle.high > recent[i + 1].high && candle.high > recent[i + 2].high) {
      highs.push({ time: candle.timestamp / 1000, price: candle.high });
    }
    if (candle.low < recent[i - 1].low && candle.low < recent[i - 2].low &&
        candle.low < recent[i + 1].low && candle.low < recent[i + 2].low) {
      lows.push({ time: candle.timestamp / 1000, price: candle.low });
    }
  }

  // Bull/Bear Flag — draw the flag pole + channel
  if (pattern.includes('flag') || pattern.includes('pennant')) {
    const color = sentiment === 'bullish' ? '#00d26a' : '#dc3545';

    if (highs.length >= 2 && lows.length >= 2) {
      // Upper trendline (connecting recent highs)
      const h1 = highs[highs.length - 2];
      const h2 = highs[highs.length - 1];
      drawings.push({
        id: `ai-pattern-upper-${now}`,
        tool: 'trendline',
        points: [
          { time: h1.time, price: h1.price },
          { time: h2.time, price: h2.price },
        ],
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        label: `${analysis.pattern} — upper`,
        source: 'ai',
        locked: true,
        visible: true,
        patternName: analysis.pattern,
        confidence: analysis.confidence,
        timestamp: now,
      });

      // Lower trendline
      const l1 = lows[lows.length - 2];
      const l2 = lows[lows.length - 1];
      drawings.push({
        id: `ai-pattern-lower-${now}`,
        tool: 'trendline',
        points: [
          { time: l1.time, price: l1.price },
          { time: l2.time, price: l2.price },
        ],
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        source: 'ai',
        locked: true,
        visible: true,
        timestamp: now,
      });
    }
  }

  // Double Bottom / Double Top — draw rectangles around the two bottoms/tops
  if (pattern.includes('double bottom') || pattern.includes('double top')) {
    const isBottom = pattern.includes('bottom');
    const points = isBottom ? lows : highs;
    const color = isBottom ? '#00d26a' : '#dc3545';

    if (points.length >= 2) {
      const p1 = points[points.length - 2];
      const p2 = points[points.length - 1];

      // Zone rectangle around the pattern
      const minPrice = Math.min(p1.price, p2.price) * 0.998;
      const maxPrice = Math.max(p1.price, p2.price) * 1.002;

      drawings.push({
        id: `ai-pattern-zone-${now}`,
        tool: 'rectangle',
        points: [
          { time: p1.time, price: maxPrice },
          { time: p2.time, price: minPrice },
        ],
        color,
        lineWidth: 2,
        lineStyle: 'dashed',
        label: analysis.pattern,
        source: 'ai',
        locked: true,
        visible: true,
        patternName: analysis.pattern,
        confidence: analysis.confidence,
        timestamp: now,
      });
    }
  }

  // Head and Shoulders — trendline across neckline
  if (pattern.includes('head') && pattern.includes('shoulder')) {
    if (lows.length >= 2) {
      const l1 = lows[lows.length - 2];
      const l2 = lows[lows.length - 1];

      drawings.push({
        id: `ai-pattern-neckline-${now}`,
        tool: 'ray',
        points: [
          { time: l1.time, price: l1.price },
          { time: l2.time, price: l2.price },
        ],
        color: '#ffc107',
        lineWidth: 2,
        lineStyle: 'dashed',
        label: 'Neckline',
        source: 'ai',
        locked: true,
        visible: true,
        patternName: analysis.pattern,
        confidence: analysis.confidence,
        timestamp: now,
      });
    }
  }

  // Wedge / Triangle — converging trendlines
  if (pattern.includes('wedge') || pattern.includes('triangle') || pattern.includes('ascending') || pattern.includes('descending')) {
    const color = sentiment === 'bullish' ? '#00d26a' : sentiment === 'bearish' ? '#dc3545' : '#ffc107';

    if (highs.length >= 2 && lows.length >= 2) {
      drawings.push({
        id: `ai-pattern-upper-${now}`,
        tool: 'trendline',
        points: [
          { time: highs[highs.length - 2].time, price: highs[highs.length - 2].price },
          { time: highs[highs.length - 1].time, price: highs[highs.length - 1].price },
        ],
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        source: 'ai',
        locked: true,
        visible: true,
        patternName: analysis.pattern,
        confidence: analysis.confidence,
        timestamp: now,
      });

      drawings.push({
        id: `ai-pattern-lower-${now}`,
        tool: 'trendline',
        points: [
          { time: lows[lows.length - 2].time, price: lows[lows.length - 2].price },
          { time: lows[lows.length - 1].time, price: lows[lows.length - 1].price },
        ],
        color,
        lineWidth: 2,
        lineStyle: 'solid',
        source: 'ai',
        locked: true,
        visible: true,
        timestamp: now,
      });
    }
  }

  // SMA Crossover — add a fibonacci retracement for the recovery zone
  if (pattern.includes('crossover') || pattern.includes('cross over') || pattern.includes('sma')) {
    if (recent.length >= 20) {
      // Use the recent low-to-high range for fib
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      let minTime = 0;
      let maxTime = 0;

      for (const c of recent.slice(-20)) {
        if (c.low < minPrice) { minPrice = c.low; minTime = c.timestamp / 1000; }
        if (c.high > maxPrice) { maxPrice = c.high; maxTime = c.timestamp / 1000; }
      }

      if (minTime < maxTime) {
        drawings.push({
          id: `ai-pattern-fib-${now}`,
          tool: 'fibonacci',
          points: [
            { time: minTime, price: minPrice },
            { time: maxTime, price: maxPrice },
          ],
          color: '#a855f7',
          lineWidth: 1,
          lineStyle: 'dashed',
          label: 'SMA Crossover Recovery',
          source: 'ai',
          locked: true,
          visible: true,
          fibLevels: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],
          patternName: analysis.pattern,
          confidence: analysis.confidence,
          timestamp: now,
        });
      }
    }
  }

  // Cup and Handle — rectangle zone for the cup
  if (pattern.includes('cup')) {
    if (lows.length >= 1 && highs.length >= 2) {
      const cupBottom = lows[lows.length - 1];
      const rimLeft = highs.length >= 2 ? highs[highs.length - 2] : highs[highs.length - 1];
      const rimRight = highs[highs.length - 1];

      drawings.push({
        id: `ai-pattern-cup-${now}`,
        tool: 'rectangle',
        points: [
          { time: rimLeft.time, price: Math.max(rimLeft.price, rimRight.price) },
          { time: rimRight.time, price: cupBottom.price },
        ],
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 'dashed',
        label: analysis.pattern,
        source: 'ai',
        locked: true,
        visible: true,
        patternName: analysis.pattern,
        confidence: analysis.confidence,
        timestamp: now,
      });
    }
  }

  // Generic fallback: if no specific pattern matched but we have key levels,
  // draw horizontal lines for the two most extreme levels as a zone
  if (drawings.length === 0 && analysis.keyLevels.length >= 2) {
    const sorted = [...analysis.keyLevels].sort((a, b) => a.price - b.price);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    const lastCandle = recent[recent.length - 1];
    const firstCandle = recent[Math.max(0, recent.length - 30)];

    drawings.push({
      id: `ai-pattern-zone-${now}`,
      tool: 'rectangle',
      points: [
        { time: firstCandle.timestamp / 1000, price: highest.price },
        { time: lastCandle.timestamp / 1000, price: lowest.price },
      ],
      color: sentiment === 'bullish' ? '#00d26a' : sentiment === 'bearish' ? '#dc3545' : '#ffc107',
      lineWidth: 1,
      lineStyle: 'dashed',
      label: `${analysis.pattern} (${(analysis.confidence * 100).toFixed(0)}%)`,
      source: 'ai',
      locked: true,
      visible: true,
      patternName: analysis.pattern,
      confidence: analysis.confidence,
      timestamp: now,
    });
  }

  return drawings;
}
