// ============================================================================
// PhantomX — Indicator Registry
// Data-driven indicator system replacing hardcoded if-blocks
// ============================================================================

import type { OHLCV } from '@/types/trading';
import type { Time, SeriesMarker } from 'lightweight-charts';

// ---- Categories ----
export type IndicatorCategory =
  | 'trend'
  | 'momentum'
  | 'volume'
  | 'support_resistance'
  | 'signals'
  | 'patterns';

export const CATEGORY_META: Record<IndicatorCategory, { label: string; color: string; icon: string }> = {
  trend:              { label: 'Trend',         color: '#3b82f6', icon: 'TrendingUp' },
  momentum:           { label: 'Momentum',      color: '#f59e0b', icon: 'Zap' },
  volume:             { label: 'Volume',         color: '#8b5cf6', icon: 'BarChart3' },
  support_resistance: { label: 'S/R',           color: '#06b6d4', icon: 'Layers' },
  signals:            { label: 'Signals',        color: '#10b981', icon: 'Bell' },
  patterns:           { label: 'Patterns',       color: '#ec4899', icon: 'Shapes' },
};

// ---- Pane location ----
export type IndicatorPane = 'overlay' | 'sub_pane';

// ---- Computed output types ----

export interface IndicatorLineOutput {
  type: 'line';
  key: string;
  data: { time: Time; value: number }[];
  color: string;
  lineWidth: number;
  lineStyle?: number; // 0=solid, 2=dashed, 1=dotted
  pane: IndicatorPane;
  priceScaleId?: string;
}

export interface IndicatorHistogramOutput {
  type: 'histogram';
  key: string;
  data: { time: Time; value: number; color?: string }[];
  pane: IndicatorPane;
  priceScaleId?: string;
}

export interface IndicatorMarkerOutput {
  type: 'markers';
  key: string;
  data: SeriesMarker<Time>[];
}

export interface IndicatorPriceLineOutput {
  type: 'price_line';
  key: string;
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: number; // 0=solid, 2=dashed
  label: string;
  axisLabelVisible: boolean;
}

export type IndicatorOutput =
  | IndicatorLineOutput
  | IndicatorHistogramOutput
  | IndicatorMarkerOutput
  | IndicatorPriceLineOutput;

// ---- Signals (buy/sell/warning events) ----

export interface IndicatorSignal {
  type: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  time: Time;
  price: number;
  description: string;
}

// ---- Compute result ----

export interface IndicatorComputeResult {
  outputs: IndicatorOutput[];
  signals: IndicatorSignal[];
  aiContext: string; // text summary for AI prompt injection
}

// ---- Parameter definition ----

export interface IndicatorParam {
  name: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

// ---- Registry entry ----

export interface IndicatorRegistryEntry {
  key: string;
  label: string;
  category: IndicatorCategory;
  description: string;
  pane: IndicatorPane;
  defaultEnabled: boolean;
  color: string; // primary display color
  params: IndicatorParam[];
  compute: (ohlcv: OHLCV[], params: Record<string, number>) => IndicatorComputeResult;
}

// ---- Registry class ----

class IndicatorRegistry {
  private entries = new Map<string, IndicatorRegistryEntry>();

  register(entry: IndicatorRegistryEntry): void {
    this.entries.set(entry.key, entry);
  }

  get(key: string): IndicatorRegistryEntry | undefined {
    return this.entries.get(key);
  }

  getAll(): IndicatorRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  getByCategory(category: IndicatorCategory): IndicatorRegistryEntry[] {
    return this.getAll().filter(e => e.category === category);
  }

  getCategories(): IndicatorCategory[] {
    const cats = new Set(this.getAll().map(e => e.category));
    return Array.from(cats);
  }

  getEnabled(enabledKeys: Record<string, boolean>): IndicatorRegistryEntry[] {
    return this.getAll().filter(e => enabledKeys[e.key]);
  }

  computeAll(
    enabledKeys: Record<string, boolean>,
    ohlcv: OHLCV[],
    paramOverrides?: Record<string, Record<string, number>>,
  ): { outputs: IndicatorOutput[]; signals: IndicatorSignal[]; aiContext: string } {
    const allOutputs: IndicatorOutput[] = [];
    const allSignals: IndicatorSignal[] = [];
    const aiParts: string[] = [];

    for (const entry of this.getEnabled(enabledKeys)) {
      const params: Record<string, number> = {};
      for (const p of entry.params) {
        params[p.name] = paramOverrides?.[entry.key]?.[p.name] ?? p.default;
      }
      try {
        const result = entry.compute(ohlcv, params);
        allOutputs.push(...result.outputs);
        allSignals.push(...result.signals);
        if (result.aiContext) aiParts.push(result.aiContext);
      } catch {
        // Skip failed indicators silently — don't crash chart
      }
    }

    return {
      outputs: allOutputs,
      signals: allSignals,
      aiContext: aiParts.join('\n'),
    };
  }
}

// Singleton
export const indicatorRegistry = new IndicatorRegistry();

// ---- Helper: convert signal to chart marker ----

export function signalToMarker(signal: IndicatorSignal): SeriesMarker<Time> {
  return {
    time: signal.time,
    position: signal.direction === 'bullish' ? 'belowBar' : 'aboveBar',
    color: signal.direction === 'bullish' ? '#5FB87A' : signal.direction === 'bearish' ? '#E05555' : '#B8860B',
    shape: signal.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
    text: signal.description,
  };
}
