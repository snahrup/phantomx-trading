'use client';

import { useEffect, useRef } from 'react';
import { useAxonStore } from '@/store/axon-store';
import { useTradingStore } from '@/store/trading-store';
import type { AxonActivity } from '@/lib/axon/types';
import type { ChartAnnotation, ChartPriceLine } from '@/types/trading';

// ---------------------------------------------------------------------------
// Color palette for agent overlays
// ---------------------------------------------------------------------------
const COLORS = {
  entryLong: '#22c55e',   // green
  entryShort: '#ef4444',  // red
  stopLoss: '#f97316',    // orange
  takeProfit: '#3b82f6',  // blue
  signal: '#a855f7',      // purple
  support: '#5FB87A',
  resistance: '#E05555',
  neutral: '#D4A84A',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a numeric price from various possible detail shapes */
function extractPrice(val: unknown): number | null {
  if (typeof val === 'number' && val > 0) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/[,$]/g, ''));
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

/** Extract a timestamp (ms) from detail, defaulting to activity timestamp */
function extractTimestamp(detail: Record<string, unknown>, fallback: string): number {
  const ts = detail.timestamp ?? detail.time ?? detail.executed_at;
  if (typeof ts === 'number') return ts > 1e12 ? ts : ts * 1000; // handle seconds
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return new Date(fallback).getTime();
}

/** Detect direction from detail text */
function detectDirection(detail: Record<string, unknown>): 'buy' | 'sell' | null {
  const dir = detail.direction ?? detail.side ?? detail.signal_direction;
  if (typeof dir === 'string') {
    const d = dir.toLowerCase();
    if (d === 'long' || d === 'buy') return 'buy';
    if (d === 'short' || d === 'sell') return 'sell';
  }
  // Check in content strings
  for (const key of ['content', 'comment_content', 'recommendation', 'text']) {
    const val = detail[key];
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (/\blong\b|\bbuy\b/.test(lower)) return 'buy';
      if (/\bshort\b|\bsell\b/.test(lower)) return 'sell';
    }
  }
  return null;
}

/** Extract price targets from text via regex */
function extractPriceTargets(text: string): number[] {
  const prices: number[] = [];
  // Match $1,234.56 or $1234 patterns
  const dollarPattern = /\$[\d,]+\.?\d*/g;
  let match;
  while ((match = dollarPattern.exec(text)) !== null) {
    const n = parseFloat(match[0].replace(/[$,]/g, ''));
    if (!isNaN(n) && n > 0) prices.push(n);
  }
  // Match "target 1234.5" or "entry 1234.5" patterns
  const namedPattern = /(?:target|entry|stop|tp|sl|support|resistance)\s*:?\s*([\d,]+\.?\d*)/gi;
  while ((match = namedPattern.exec(text)) !== null) {
    const n = parseFloat(match[1].replace(/,/g, ''));
    if (!isNaN(n) && n > 0 && !prices.includes(n)) prices.push(n);
  }
  return prices;
}

// ---------------------------------------------------------------------------
// Hook: useAgentChartOverlays
// ---------------------------------------------------------------------------

/**
 * Converts Axon agent events into TradingChart overlays (annotations, price
 * lines). Runs as a side-effect: subscribes to agentEvents changes and
 * processes new events into the trading store's chart overlay system.
 *
 * Uses a ref to track processed event IDs to prevent duplicates.
 */
export function useAgentChartOverlays() {
  const processedRef = useRef<Set<string>>(new Set());
  const prevFocusedRef = useRef<string | null>(null);

  const agentEvents = useAxonStore((s) => s.agentEvents);
  const agents = useAxonStore((s) => s.agents);
  const focusedSymbol = useTradingStore((s) => s.focusedPositionSymbol);

  // --- Process agent events into chart overlays ---
  useEffect(() => {
    const store = useTradingStore.getState();
    const processed = processedRef.current;

    for (const event of agentEvents) {
      if (processed.has(event.id)) continue;
      processed.add(event.id);

      const detail = event.detail;
      if (!detail || typeof detail !== 'object') continue;

      // Resolve agent name for labels
      const agent = agents.find((a) => a.id === event.agent_id);
      const agentLabel = (detail.agent_name as string) || agent?.name || 'Agent';

      // ----- Trade execution events -----
      if (
        detail.action === 'trade_executed' ||
        detail.trade ||
        event.action === 'trade_executed'
      ) {
        const trade = (detail.trade as Record<string, unknown>) ?? detail;
        const price = extractPrice(trade.price ?? trade.entry_price ?? trade.executed_price);
        const ts = extractTimestamp(trade, event.timestamp);
        const dir = detectDirection(trade);

        if (price) {
          const annotation: ChartAnnotation = {
            id: `agent-trade-${event.id}`,
            type: 'trade_entry',
            timestamp: ts,
            price,
            text: `${agentLabel}: ${dir === 'sell' ? 'SHORT' : 'LONG'} @ $${price.toLocaleString()}`,
            color: dir === 'sell' ? COLORS.entryShort : COLORS.entryLong,
            side: dir ?? 'buy',
          };
          store.addAnnotation(annotation);

          // Stop loss price line
          const sl = extractPrice(trade.stop_loss ?? trade.stopLoss ?? trade.sl);
          if (sl) {
            const line: ChartPriceLine = {
              id: `agent-sl-${event.id}`,
              price: sl,
              color: COLORS.stopLoss,
              lineWidth: 1,
              lineStyle: 'dashed',
              label: `SL $${sl.toLocaleString()} (${agentLabel})`,
              source: 'agent_analysis',
              type: 'stop_loss',
              axisLabelVisible: true,
              timestamp: ts,
              expiresAt: ts + 24 * 60 * 60 * 1000, // 24h expiry
            };
            store.addPriceLine(line);
          }

          // Take profit price line
          const tp = extractPrice(trade.take_profit ?? trade.takeProfit ?? trade.tp);
          if (tp) {
            const line: ChartPriceLine = {
              id: `agent-tp-${event.id}`,
              price: tp,
              color: COLORS.takeProfit,
              lineWidth: 1,
              lineStyle: 'dashed',
              label: `TP $${tp.toLocaleString()} (${agentLabel})`,
              source: 'agent_analysis',
              type: 'take_profit',
              axisLabelVisible: true,
              timestamp: ts,
              expiresAt: ts + 24 * 60 * 60 * 1000,
            };
            store.addPriceLine(line);
          }
        }
        continue;
      }

      // ----- Signal events -----
      if (detail.signal || detail.direction || event.action === 'signal') {
        const sig = (detail.signal as Record<string, unknown>) ?? detail;
        const price = extractPrice(sig.price ?? sig.entry ?? sig.level);
        const ts = extractTimestamp(sig, event.timestamp);
        const dir = detectDirection(sig);

        if (price) {
          const annotation: ChartAnnotation = {
            id: `agent-signal-${event.id}`,
            type: 'signal',
            timestamp: ts,
            price,
            text: `${agentLabel}: ${dir === 'sell' ? 'SELL' : dir === 'buy' ? 'BUY' : 'SIGNAL'} signal`,
            color: COLORS.signal,
            side: dir ?? undefined,
          };
          store.addAnnotation(annotation);
        }
        continue;
      }

      // ----- Key levels identified -----
      const keyLevels = (detail.keyLevels ?? detail.key_levels ?? detail.levels) as
        | Array<{ type?: string; price: number | string; label?: string }>
        | undefined;

      if (Array.isArray(keyLevels) && keyLevels.length > 0) {
        for (let i = 0; i < keyLevels.length; i++) {
          const level = keyLevels[i];
          const price = extractPrice(level.price);
          if (!price) continue;

          const levelType = (level.type?.toLowerCase() ?? '') as string;
          const isSupport = levelType.includes('support');
          const isResistance = levelType.includes('resistance');

          const line: ChartPriceLine = {
            id: `agent-level-${event.id}-${i}`,
            price,
            color: isSupport ? COLORS.support : isResistance ? COLORS.resistance : COLORS.neutral,
            lineWidth: 1,
            lineStyle: 'dotted',
            label: level.label || `${isSupport ? 'S' : isResistance ? 'R' : 'Level'} $${price.toLocaleString()} (${agentLabel})`,
            source: 'agent_analysis',
            type: isSupport ? 'support' : isResistance ? 'resistance' : 'support',
            axisLabelVisible: true,
            timestamp: new Date(event.timestamp).getTime(),
            expiresAt: new Date(event.timestamp).getTime() + 12 * 60 * 60 * 1000, // 12h expiry
          };
          store.addPriceLine(line);
        }
        continue;
      }

      // ----- Pattern identified → setPriceLinesFromAnalysis -----
      const pattern = detail.pattern ?? detail.chart_pattern;
      if (pattern && typeof pattern === 'string') {
        // Build a partial ChartAnalysis if we have enough data
        const patternLevels = (detail.keyLevels ?? detail.key_levels ?? []) as
          | Array<{ type: string; price: number }>
          | undefined;

        if (Array.isArray(patternLevels) && patternLevels.length > 0) {
          store.setPriceLinesFromAnalysis({
            pattern,
            sentiment: (detail.sentiment as 'bullish' | 'bearish' | 'neutral') ?? 'neutral',
            confidence: (detail.confidence as number) ?? 0.5,
            keyLevels: patternLevels,
            recommendation: (detail.recommendation as string) ?? '',
            timeframe: (detail.timeframe as string) ?? '',
          });
        }
        continue;
      }

      // ----- Comment-based: recommendation / ruling with price data -----
      const commentType = detail.comment_type as string | undefined;
      if (commentType === 'recommendation' || commentType === 'ruling') {
        const content = (detail.comment_content ?? detail.content ?? '') as string;
        if (!content) continue;

        const prices = extractPriceTargets(content);
        const dir = detectDirection(detail);
        const ts = new Date(event.timestamp).getTime();

        // Add annotation for the recommendation itself
        if (prices.length > 0) {
          const annotation: ChartAnnotation = {
            id: `agent-rec-${event.id}`,
            type: 'signal',
            timestamp: ts,
            price: prices[0],
            text: `${agentLabel} ${commentType}: ${dir === 'sell' ? 'SHORT' : dir === 'buy' ? 'LONG' : 'TARGET'} $${prices[0].toLocaleString()}`,
            color: COLORS.signal,
            side: dir ?? undefined,
          };
          store.addAnnotation(annotation);
        }

        // Add remaining prices as key levels
        for (let i = 1; i < prices.length && i < 5; i++) {
          const line: ChartPriceLine = {
            id: `agent-rec-level-${event.id}-${i}`,
            price: prices[i],
            color: COLORS.neutral,
            lineWidth: 1,
            lineStyle: 'dotted',
            label: `${commentType} $${prices[i].toLocaleString()} (${agentLabel})`,
            source: 'agent_analysis',
            type: 'support', // generic
            axisLabelVisible: true,
            timestamp: ts,
            expiresAt: ts + 12 * 60 * 60 * 1000,
          };
          store.addPriceLine(line);
        }
      }
    }

    // Cap the processed set to avoid unbounded growth (keep last 500)
    if (processed.size > 500) {
      const arr = Array.from(processed);
      const toRemove = arr.slice(0, arr.length - 500);
      for (const id of toRemove) processed.delete(id);
    }
  }, [agentEvents, agents]);

  // --- Reset auto-pattern detection when focused symbol changes ---
  useEffect(() => {
    if (focusedSymbol && focusedSymbol !== prevFocusedRef.current) {
      prevFocusedRef.current = focusedSymbol;

      // Clear old agent_analysis price lines when switching symbols
      useTradingStore.getState().clearPriceLines('agent_analysis');

      // Reset auto-pattern timer so pattern detection re-runs for new symbol
      useTradingStore.getState().setLastAutoPatternTime(0);
    }
  }, [focusedSymbol]);
}
