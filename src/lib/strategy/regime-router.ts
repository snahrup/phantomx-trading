// ============================================================================
// PhantomX — Strategy Regime Router
// Determines which strategies should be active based on current market regime.
// Used by the portfolio manager and scanner to activate/deactivate strategies.
// ============================================================================

import type { MarketRegime, RegimeClassification } from '@/types/trading';

export interface StrategyRegimeMapping {
  strategyId: string;
  strategyName: string;
  regimes: MarketRegime[];
  additionalConditions?: RegimeCondition[];
}

export interface RegimeCondition {
  type: 'rsi_below' | 'rsi_above' | 'funding_negative' | 'adx_above' | 'adx_below' | 'atr_above_avg';
  threshold: number;
  description: string;
}

export interface RegimeRouterResult {
  activeStrategies: string[];
  pausedStrategies: string[];
  reasoning: string[];
}

// Strategy-to-regime mapping — the source of truth for what runs when
const STRATEGY_REGIME_MAP: StrategyRegimeMapping[] = [
  {
    strategyId: 'strat-ema-ribbon-v2.0',
    strategyName: 'EMA Ribbon Trend Following v2.0',
    regimes: ['trending_up', 'trending_down'],
    additionalConditions: [
      { type: 'adx_above', threshold: 25, description: 'ADX > 25 confirms trend strength' },
    ],
  },
  {
    strategyId: 'strat-efr-v1.0',
    strategyName: 'Extreme Fear Reversal v1.0',
    regimes: ['volatile'],
    additionalConditions: [
      { type: 'rsi_below', threshold: 35, description: 'RSI(14) < 35 as extreme fear proxy' },
      { type: 'atr_above_avg', threshold: 1.5, description: 'ATR > 1.5x average (high vol environment)' },
    ],
  },
  {
    strategyId: 'strat-frc-v1.0',
    strategyName: 'Funding Rate Carry v1.0',
    regimes: ['volatile', 'ranging', 'trending_up'],
    additionalConditions: [
      { type: 'funding_negative', threshold: -0.01, description: 'Funding rate < -0.01% per 8h' },
    ],
  },
  {
    strategyId: 'strat-liquidity-sweep-v1.0',
    strategyName: 'Liquidity Sweep Reversal v1.0',
    regimes: ['ranging', 'volatile'],
    additionalConditions: [
      { type: 'adx_below', threshold: 25, description: 'ADX < 25 = not strongly trending (range-bound)' },
    ],
  },
];

/**
 * Given a regime classification and optional market data, determine which strategies
 * should be active and which should be paused.
 */
export function routeStrategies(
  regime: RegimeClassification,
  marketData?: {
    rsi14?: number;
    fundingRate?: number;
    atrRatio?: number; // current ATR / 20-period ATR average
  },
): RegimeRouterResult {
  const active: string[] = [];
  const paused: string[] = [];
  const reasoning: string[] = [];

  for (const mapping of STRATEGY_REGIME_MAP) {
    // Check regime match
    if (!mapping.regimes.includes(regime.regime)) {
      paused.push(mapping.strategyId);
      reasoning.push(
        `PAUSE ${mapping.strategyName}: regime '${regime.regime}' not in [${mapping.regimes.join(', ')}]`,
      );
      continue;
    }

    // Check additional conditions if market data provided
    let conditionsMet = true;
    if (mapping.additionalConditions && marketData) {
      for (const cond of mapping.additionalConditions) {
        switch (cond.type) {
          case 'rsi_below':
            if (marketData.rsi14 !== undefined && marketData.rsi14 >= cond.threshold) {
              conditionsMet = false;
              reasoning.push(
                `PAUSE ${mapping.strategyName}: RSI(14) ${marketData.rsi14.toFixed(1)} >= ${cond.threshold} (${cond.description})`,
              );
            }
            break;
          case 'rsi_above':
            if (marketData.rsi14 !== undefined && marketData.rsi14 <= cond.threshold) {
              conditionsMet = false;
              reasoning.push(
                `PAUSE ${mapping.strategyName}: RSI(14) ${marketData.rsi14.toFixed(1)} <= ${cond.threshold} (${cond.description})`,
              );
            }
            break;
          case 'funding_negative':
            if (marketData.fundingRate !== undefined && marketData.fundingRate >= cond.threshold) {
              conditionsMet = false;
              reasoning.push(
                `PAUSE ${mapping.strategyName}: funding ${(marketData.fundingRate * 100).toFixed(4)}% >= ${cond.threshold}% (${cond.description})`,
              );
            }
            break;
          case 'adx_above':
            if (regime.adx !== undefined && regime.adx < cond.threshold) {
              conditionsMet = false;
              reasoning.push(
                `PAUSE ${mapping.strategyName}: ADX ${regime.adx.toFixed(1)} < ${cond.threshold} (${cond.description})`,
              );
            }
            break;
          case 'adx_below':
            if (regime.adx !== undefined && regime.adx > cond.threshold) {
              conditionsMet = false;
              reasoning.push(
                `PAUSE ${mapping.strategyName}: ADX ${regime.adx.toFixed(1)} > ${cond.threshold} (${cond.description})`,
              );
            }
            break;
          case 'atr_above_avg':
            if (marketData.atrRatio !== undefined && marketData.atrRatio < cond.threshold) {
              conditionsMet = false;
              reasoning.push(
                `PAUSE ${mapping.strategyName}: ATR ratio ${marketData.atrRatio.toFixed(2)}x < ${cond.threshold}x (${cond.description})`,
              );
            }
            break;
        }
      }
    }

    if (conditionsMet) {
      active.push(mapping.strategyId);
      reasoning.push(`ACTIVE ${mapping.strategyName}: regime '${regime.regime}' matches, conditions met`);
    } else {
      paused.push(mapping.strategyId);
    }
  }

  return { activeStrategies: active, pausedStrategies: paused, reasoning };
}

/**
 * Get the strategy mapping for a specific strategy ID.
 */
export function getStrategyMapping(strategyId: string): StrategyRegimeMapping | undefined {
  return STRATEGY_REGIME_MAP.find(m => m.strategyId === strategyId);
}

/**
 * Get all registered strategy IDs.
 */
export function getAllStrategyIds(): string[] {
  return STRATEGY_REGIME_MAP.map(m => m.strategyId);
}
