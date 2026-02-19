// ============================================================================
// PhantomX — Scanner → Strategy Pipeline
// Converts GemScanner results into deployable strategy configurations
// ============================================================================

import { classifyRegime, isStrategyCompatibleWithRegime } from '@/lib/market/regime-classifier';
import type {
  OHLCV, StrategyConfig, StrategyGoals, ScannerOpportunity,
  MarketRegime, RiskParameters, ConditionGroup, IndicatorConfig,
} from '@/types/trading';

// --- Scanner Result (matches GemScanner's ScanResult) ---

interface ScanResult {
  symbol: string;
  price: number;
  change24h: number;
  volumeUsdApprox: number;
  maxLeverage: number | null;
  distFromATL: number;
  distFromATH: number;
  smaSignal: string;
  volumeTrend: number;
}

// --- Strategy Templates ---

interface StrategyTemplate {
  id: string;
  name: string;
  type: string;
  timeframe: string;
  indicators: IndicatorConfig[];
  entryConditions: ConditionGroup;
  exitConditions: ConditionGroup;
  riskOverrides: Partial<RiskParameters>;
  targetRegimes: MarketRegime[];
  minLeverage: number;
  description: string;
}

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    id: 'tpl_hft_scalp',
    name: 'HFT Scalp Bot',
    type: 'hft_scalp',
    timeframe: '1m',
    indicators: [
      { type: 'RSI', params: { period: 7 } },
      { type: 'BB', params: { period: 14, stdDev: 2 } },
      { type: 'EMA', params: { period: 9 } },
      { type: 'EMA', params: { period: 21 } },
    ],
    entryConditions: {
      logic: 'OR',
      conditions: [
        { indicator: 'CLOSE', operator: 'crosses_below', target: 'BB_14_LOWER' },
        { indicator: 'RSI_7', operator: 'below', target: 25 },
      ],
    },
    exitConditions: {
      logic: 'OR',
      conditions: [
        { indicator: 'CLOSE', operator: 'crosses_above', target: 'BB_14_UPPER' },
        { indicator: 'RSI_7', operator: 'above', target: 75 },
      ],
    },
    riskOverrides: { stopLossPercent: 0.5, takeProfitPercent: 1.0, maxOpenPositions: 3 },
    targetRegimes: ['volatile', 'ranging'],
    minLeverage: 10,
    description: 'Fast scalps on BB bounces and RSI extremes',
  },
  {
    id: 'tpl_momentum',
    name: 'Momentum Rider',
    type: 'momentum',
    timeframe: '5m',
    indicators: [
      { type: 'EMA', params: { period: 9 } },
      { type: 'EMA', params: { period: 21 } },
      { type: 'RSI', params: { period: 14 } },
      { type: 'MACD', params: { fast: 12, slow: 26, signal: 9 } },
      { type: 'ATR', params: { period: 14 } },
    ],
    entryConditions: {
      logic: 'AND',
      conditions: [
        { indicator: 'EMA_9', operator: 'crosses_above', target: 'EMA_21' },
        { indicator: 'RSI_14', operator: 'above', target: 50 },
        { indicator: 'MACD_12_26_9_HIST', operator: 'above', target: 0 },
      ],
    },
    exitConditions: {
      logic: 'OR',
      conditions: [
        { indicator: 'EMA_9', operator: 'crosses_below', target: 'EMA_21' },
        { indicator: 'RSI_14', operator: 'above', target: 80 },
      ],
    },
    riskOverrides: { stopLossPercent: 1.5, takeProfitPercent: 3.0, maxOpenPositions: 2 },
    targetRegimes: ['trending_up', 'trending_down', 'volatile'],
    minLeverage: 5,
    description: 'EMA crossover with MACD confirmation for momentum trades',
  },
  {
    id: 'tpl_mean_reversion',
    name: 'Mean Reversion Bouncer',
    type: 'mean_reversion',
    timeframe: '5m',
    indicators: [
      { type: 'BB', params: { period: 20, stdDev: 2.5 } },
      { type: 'RSI', params: { period: 14 } },
      { type: 'SMA', params: { period: 20 } },
    ],
    entryConditions: {
      logic: 'AND',
      conditions: [
        { indicator: 'CLOSE', operator: 'below', target: 'BB_20_LOWER' },
        { indicator: 'RSI_14', operator: 'below', target: 30 },
      ],
    },
    exitConditions: {
      logic: 'OR',
      conditions: [
        { indicator: 'CLOSE', operator: 'above', target: 'SMA_20' },
        { indicator: 'RSI_14', operator: 'above', target: 60 },
      ],
    },
    riskOverrides: { stopLossPercent: 2.0, takeProfitPercent: 2.0, maxOpenPositions: 3 },
    targetRegimes: ['ranging', 'volatile'],
    minLeverage: 5,
    description: 'Buy BB lower band oversold bounces, exit at mean',
  },
  {
    id: 'tpl_grid',
    name: 'Grid Bot',
    type: 'grid',
    timeframe: '15m',
    indicators: [
      { type: 'ATR', params: { period: 14 } },
      { type: 'BB', params: { period: 20, stdDev: 2 } },
      { type: 'RSI', params: { period: 14 } },
    ],
    entryConditions: {
      logic: 'OR',
      conditions: [
        { indicator: 'RSI_14', operator: 'below', target: 35 },
        { indicator: 'RSI_14', operator: 'above', target: 65 },
      ],
    },
    exitConditions: {
      logic: 'AND',
      conditions: [
        { indicator: 'RSI_14', operator: 'above', target: 40 },
        { indicator: 'RSI_14', operator: 'below', target: 60 },
      ],
    },
    riskOverrides: { stopLossPercent: 3.0, takeProfitPercent: 1.5, maxOpenPositions: 5 },
    targetRegimes: ['ranging', 'volatile'],
    minLeverage: 3,
    description: 'Grid entries at RSI extremes, exits at mean reversion',
  },
];

// ============================================================================
// Convert Scanner Results to Opportunities
// ============================================================================

export function rankOpportunities(
  scanResults: ScanResult[],
  ohlcvBySymbol: Record<string, OHLCV[]>,
): ScannerOpportunity[] {
  return scanResults.map(result => {
    const bars = ohlcvBySymbol[result.symbol] ?? [];
    const regime = bars.length >= 50 ? classifyRegime(bars) : null;

    // Score: composite of momentum, volume, leverage, proximity to ATL
    const momentumScore = Math.min(1, Math.abs(result.change24h) / 10); // up to 10% = perfect
    const volumeScore = Math.min(1, result.volumeUsdApprox / 5_000_000); // up to $5M = perfect
    const leverageScore = result.maxLeverage ? Math.min(1, result.maxLeverage / 50) : 0.3;
    const atlProximity = Math.min(1, 1 - result.distFromATL / 500); // closer to ATL = better for recovery plays

    const score = (
      momentumScore * 0.3 +
      volumeScore * 0.25 +
      leverageScore * 0.2 +
      atlProximity * 0.15 +
      (result.volumeTrend > 0 ? 0.1 : 0) // bonus for increasing volume
    );

    // Match strategy templates
    const suggestedStrategies = STRATEGY_TEMPLATES
      .filter(t => {
        if (!regime) return true; // no regime data → suggest all
        if (!isStrategyCompatibleWithRegime(t.type, regime.regime)) return false;
        if (result.maxLeverage && result.maxLeverage < t.minLeverage) return false;
        return true;
      })
      .map(t => t.id);

    return {
      symbol: result.symbol,
      score,
      regime: regime?.regime ?? 'unknown',
      suggestedStrategies,
      volatility: bars.length > 0 ? regime?.atrPercent ?? 0 : 0,
      volume24h: result.volumeUsdApprox,
      changePercent24h: result.change24h,
      fundingRate: undefined, // would come from exchange model
      timestamp: Date.now(),
    };
  }).sort((a, b) => b.score - a.score);
}

// ============================================================================
// Generate Strategy Config from Template + Opportunity
// ============================================================================

export function generateStrategyFromTemplate(
  templateId: string,
  opportunity: ScannerOpportunity,
  riskLevel: 'conservative' | 'moderate' | 'aggressive' | 'degen' = 'moderate',
  capitalUsd = 100,
): { config: StrategyConfig; goals: StrategyGoals } | null {
  const template = STRATEGY_TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;

  // Risk parameters by level
  const riskProfiles: Record<string, RiskParameters> = {
    conservative: {
      level: 'conservative',
      maxPositionSizePercent: 10,
      maxDrawdownPercent: 5,
      stopLossPercent: template.riskOverrides.stopLossPercent ?? 1,
      takeProfitPercent: template.riskOverrides.takeProfitPercent ?? 2,
      maxOpenPositions: template.riskOverrides.maxOpenPositions ?? 1,
      maxDailyLossPercent: 3,
      allowLossOfEntireAmount: false,
    },
    moderate: {
      level: 'moderate',
      maxPositionSizePercent: 20,
      maxDrawdownPercent: 10,
      stopLossPercent: template.riskOverrides.stopLossPercent ?? 1.5,
      takeProfitPercent: template.riskOverrides.takeProfitPercent ?? 3,
      maxOpenPositions: template.riskOverrides.maxOpenPositions ?? 2,
      maxDailyLossPercent: 5,
      allowLossOfEntireAmount: false,
    },
    aggressive: {
      level: 'aggressive',
      maxPositionSizePercent: 40,
      maxDrawdownPercent: 20,
      stopLossPercent: template.riskOverrides.stopLossPercent ?? 2,
      takeProfitPercent: template.riskOverrides.takeProfitPercent ?? 5,
      maxOpenPositions: template.riskOverrides.maxOpenPositions ?? 3,
      maxDailyLossPercent: 10,
      allowLossOfEntireAmount: false,
    },
    degen: {
      level: 'degen',
      maxPositionSizePercent: 80,
      maxDrawdownPercent: 50,
      stopLossPercent: template.riskOverrides.stopLossPercent ?? 3,
      takeProfitPercent: template.riskOverrides.takeProfitPercent ?? 10,
      maxOpenPositions: template.riskOverrides.maxOpenPositions ?? 5,
      maxDailyLossPercent: 25,
      allowLossOfEntireAmount: true,
    },
  };

  const risk = riskProfiles[riskLevel] ?? riskProfiles.moderate;

  const config: StrategyConfig = {
    id: crypto.randomUUID(),
    name: `${template.name} — ${opportunity.symbol.replace('/USDT:USDT', '')}`,
    symbol: opportunity.symbol,
    timeframe: template.timeframe,
    status: 'draft',
    risk,
    indicators: template.indicators,
    entryConditions: template.entryConditions,
    exitConditions: template.exitConditions,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const goals: StrategyGoals = {
    minWinRate: riskLevel === 'degen' ? 0.4 : 0.5,
    minProfitFactor: riskLevel === 'degen' ? 1.2 : 1.5,
    maxDrawdownPercent: risk.maxDrawdownPercent,
    minSharpeRatio: riskLevel === 'conservative' ? 1.5 : 1.0,
    duration: template.timeframe === '1m' ? 'scalp' : template.timeframe === '5m' ? 'day' : 'swing',
    maxOptimizationIterations: 5,
    questions: [
      `What is the optimal ${template.type} configuration for ${opportunity.symbol}?`,
      `Current regime: ${opportunity.regime}. How to adapt?`,
    ],
  };

  return { config, goals };
}

// ============================================================================
// Auto-Pipeline: Scanner → Rank → Configure → Ready to Deploy
// ============================================================================

export function autoPipeline(
  scanResults: ScanResult[],
  ohlcvBySymbol: Record<string, OHLCV[]>,
  riskLevel: 'conservative' | 'moderate' | 'aggressive' | 'degen' = 'moderate',
  maxStrategies = 3,
  capitalUsd = 100,
): Array<{ opportunity: ScannerOpportunity; config: StrategyConfig; goals: StrategyGoals }> {
  const opportunities = rankOpportunities(scanResults, ohlcvBySymbol);

  const results: Array<{ opportunity: ScannerOpportunity; config: StrategyConfig; goals: StrategyGoals }> = [];

  for (const opp of opportunities.slice(0, maxStrategies)) {
    if (opp.suggestedStrategies.length === 0) continue;

    // Pick the best-matching template
    const templateId = opp.suggestedStrategies[0];
    const generated = generateStrategyFromTemplate(templateId, opp, riskLevel, capitalUsd);

    if (generated) {
      results.push({ opportunity: opp, ...generated });
    }
  }

  return results;
}

// --- Export templates for UI ---
export function getStrategyTemplates(): StrategyTemplate[] {
  return [...STRATEGY_TEMPLATES];
}
