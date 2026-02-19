// ============================================================================
// PhantomX — Pipeline Runner (Module-Level)
// ============================================================================
// Runs the 5-wave trading agents pipeline via SSE and writes events directly
// to the Zustand store. Because the AbortController and fetch live at module
// scope (not inside a React component), the pipeline survives page navigation.
// ============================================================================

import { consumeSSE } from '@/lib/utils/consume-sse';
import { useTradingStore, initialPipelineState } from '@/store/trading-store';
import type { PipelineStateShape } from '@/store/trading-store';
import type { StrategyConfig, StrategyGoals } from '@/types/trading';

// Module-level abort controller — survives component unmount/remount
let activeController: AbortController | null = null;

/**
 * Process a single SSE event and return the updated pipeline state.
 * Pure function — no side effects.
 */
function processEvent(prev: PipelineStateShape, data: Record<string, unknown>): PipelineStateShape {
  const next = { ...prev };
  const type = data.type as string;

  switch (type) {
    case 'pipeline_start':
      next.stage = 'analysts';
      next.analysts = { ...initialPipelineState().analysts };
      break;

    // --- Wave 1: Analysts ---
    case 'analyst_start': {
      const agent = data.agent as string;
      if (next.analysts[agent]) {
        next.analysts = { ...next.analysts, [agent]: { ...next.analysts[agent], status: 'running' } };
      }
      next.stage = 'analysts';
      break;
    }
    case 'analyst_tool_call': {
      const agent = data.agent as string;
      if (next.analysts[agent]) {
        const a = { ...next.analysts[agent] };
        a.toolCalls = [...a.toolCalls, { tool: data.tool as string, input: data.input }];
        next.analysts = { ...next.analysts, [agent]: a };
      }
      break;
    }
    case 'analyst_tool_result': {
      const agent = data.agent as string;
      if (next.analysts[agent]) {
        const a = { ...next.analysts[agent] };
        a.toolResults = [...a.toolResults, { tool: data.tool as string, preview: data.preview as string }];
        next.analysts = { ...next.analysts, [agent]: a };
      }
      break;
    }
    case 'analyst_stream': {
      const agent = data.agent as string;
      if (next.analysts[agent]) {
        const a = { ...next.analysts[agent] };
        a.report += data.content as string;
        next.analysts = { ...next.analysts, [agent]: a };
      }
      break;
    }
    case 'analyst_complete': {
      const agent = data.agent as string;
      if (next.analysts[agent]) {
        next.analysts = {
          ...next.analysts,
          [agent]: {
            ...next.analysts[agent],
            status: 'complete',
            report: data.report as string,
            duration: data.duration as number,
          },
        };
      }
      break;
    }
    case 'analyst_error': {
      const agent = data.agent as string;
      if (next.analysts[agent]) {
        next.analysts = {
          ...next.analysts,
          [agent]: { ...next.analysts[agent], status: 'error', error: data.error as string },
        };
      }
      break;
    }

    // --- Wave 2: Investment Debate ---
    case 'debate_start':
      next.stage = 'debate';
      next.debate = { turns: [], judge: null };
      break;
    case 'debate_turn':
      next.debate = {
        ...next.debate,
        turns: [...next.debate.turns, {
          speaker: data.speaker as string,
          round: data.round as number,
          content: data.content as string,
        }],
      };
      break;
    case 'debate_stream': {
      const turns = [...next.debate.turns];
      const speaker = data.speaker as string;
      const round = data.round as number;
      const existing = turns.findIndex(t => t.speaker === speaker && t.round === round);
      if (existing >= 0) {
        turns[existing] = { ...turns[existing], content: turns[existing].content + (data.content as string) };
      } else {
        turns.push({ speaker, round, content: data.content as string });
      }
      next.debate = { ...next.debate, turns };
      break;
    }
    case 'debate_judge':
      next.debate = {
        ...next.debate,
        judge: {
          decision: data.decision as string,
          content: data.plan as string,
          confidence: data.confidence as number,
        },
      };
      break;
    case 'debate_judge_stream': {
      const judge = next.debate.judge
        ? { ...next.debate.judge, content: next.debate.judge.content + (data.content as string) }
        : { decision: '', content: data.content as string, confidence: 0 };
      next.debate = { ...next.debate, judge };
      break;
    }

    // --- Wave 3: Risk Debate ---
    case 'risk_debate_start':
      next.stage = 'risk';
      next.risk = { turns: [], judge: null, finalSize: '' };
      break;
    case 'risk_turn':
      next.risk = {
        ...next.risk,
        turns: [...next.risk.turns, {
          speaker: data.speaker as string,
          round: 1,
          content: data.content as string,
        }],
      };
      break;
    case 'risk_stream': {
      const turns = [...next.risk.turns];
      const speaker = data.speaker as string;
      const existing = turns.findIndex(t => t.speaker === speaker);
      if (existing >= 0) {
        turns[existing] = { ...turns[existing], content: turns[existing].content + (data.content as string) };
      } else {
        turns.push({ speaker, round: 1, content: data.content as string });
      }
      next.risk = { ...next.risk, turns };
      break;
    }
    case 'risk_judge':
      next.risk = {
        ...next.risk,
        judge: {
          decision: data.decision as string,
          content: data.adjustments as string,
          confidence: 0,
        },
        finalSize: data.finalSize as string,
      };
      break;
    case 'risk_judge_stream': {
      const judge = next.risk.judge
        ? { ...next.risk.judge, content: next.risk.judge.content + (data.content as string) }
        : { decision: '', content: data.content as string, confidence: 0 };
      next.risk = { ...next.risk, judge };
      break;
    }

    // --- Wave 4: Strategy ---
    case 'strategy_start':
      next.stage = 'strategy';
      break;
    case 'strategy_stream':
      next.strategy = { ...next.strategy, streaming: next.strategy.streaming + (data.content as string) };
      break;
    case 'strategy_complete':
      next.strategy = { ...next.strategy, config: data.config };
      break;

    // --- Wave 5: Backtest + Memory ---
    case 'backtest_start':
      next.stage = 'backtest';
      next.backtest = { running: true, metrics: null, error: null };
      break;
    case 'backtest_complete':
      next.backtest = { running: false, metrics: data.metrics, error: null };
      break;
    case 'backtest_error':
      next.backtest = { running: false, metrics: null, error: data.error as string };
      break;
    case 'memory_stored':
      next.memory = { stored: data.count as number };
      break;

    // --- Final ---
    case 'pipeline_complete':
      next.stage = 'done';
      next.finalDecision = data.decision as string;
      next.finalConfidence = data.confidence as number;
      next.totalDuration = data.duration as number;
      break;
    case 'pipeline_error':
      next.stage = 'error';
      next.error = data.error as string;
      break;
    case 'done':
      next.stage = 'done';
      break;
  }

  return next;
}

/**
 * Start the 5-wave pipeline. Runs at module level — survives navigation.
 */
export async function runPipeline(symbol: string): Promise<void> {
  // Abort any existing run
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  const store = useTradingStore.getState();

  // Reset and mark running
  store.setPipelineState(initialPipelineState());
  store.setPipelineRunning(true);
  store.setPipelineSymbol(symbol);

  const strategyConfig: StrategyConfig = {
    id: `pipeline-${Date.now()}`,
    name: `${symbol} Analysis`,
    symbol,
    timeframe: '1h',
    status: 'paper' as const,
    indicators: [],
    entryConditions: { logic: 'AND', conditions: [] },
    exitConditions: { logic: 'AND', conditions: [] },
    risk: {
      level: 'aggressive' as const,
      maxPositionSizePercent: 5,
      stopLossPercent: 3,
      takeProfitPercent: 8,
      maxDrawdownPercent: 15,
      maxOpenPositions: 5,
      maxDailyLossPercent: 10,
      trailingStopPercent: 0,
      allowLossOfEntireAmount: false,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const strategyGoals: StrategyGoals = {
    minWinRate: 0.55,
    minProfitFactor: 1.3,
    maxDrawdownPercent: 15,
    minSharpeRatio: 1.0,
    duration: 'day',
    maxOptimizationIterations: 5,
    questions: [
      `Full 5-wave pipeline analysis for ${symbol}`,
      'Optimal entry/exit with exact price levels',
      'Risk-adjusted position sizing',
    ],
  };

  try {
    await consumeSSE('/api/ai', {
      action: 'deep_research',
      strategyConfig,
      strategyGoals,
      symbol,
      ohlcv: store.ohlcv ?? [],
      ticker: store.ticker ?? null,
      balance: store.accountValue ?? 10000,
      positions: store.positions ?? [],
      orderBook: store.orderBook ?? null,
      currentPrice: store.ticker?.last ?? 0,
    }, (data) => {
      // Update store with each event
      const current = useTradingStore.getState().pipelineState;
      const updated = processEvent(current, data);
      useTradingStore.getState().setPipelineState(updated);
    }, controller.signal);
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('[PipelineRunner] Stream error:', err);
      useTradingStore.getState().updatePipelineState(prev => ({
        ...prev,
        stage: 'error',
        error: String(err),
      }));
    }
  } finally {
    useTradingStore.getState().setPipelineRunning(false);
    if (activeController === controller) {
      activeController = null;
    }
  }
}

/**
 * Stop a running pipeline.
 */
export function stopPipeline(): void {
  activeController?.abort();
  activeController = null;
  useTradingStore.getState().setPipelineRunning(false);
}

/**
 * Check if a pipeline is currently running.
 */
export function isPipelineRunning(): boolean {
  return activeController !== null && !activeController.signal.aborted;
}
