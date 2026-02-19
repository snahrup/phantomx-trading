'use client';

import { useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useTradingStore } from '@/store/trading-store';
import StrategyBuilder from '@/components/strategy/StrategyBuilder';
import BacktestResults from '@/components/strategy/BacktestResults';
import ResearchPipeline, { type ResearchPipelineHandle } from '@/components/strategy/ResearchPipeline';
import OptimizationLoop from '@/components/strategy/OptimizationLoop';
import { DeployPanel, SupervisorPanel } from '@/components/strategy/DeployPanel';
import PerformanceReview from '@/components/strategy/PerformanceReview';
import type { StrategyConfig, StrategyGoals } from '@/types/trading';
import {
  FlaskConical, Search, BarChart3, RotateCcw, Rocket, Brain,
} from 'lucide-react';
import { consumeSSE } from '@/lib/utils/consume-sse';

// ---------------------------------------------------------------------------
// Strategy Page
// ---------------------------------------------------------------------------

export default function StrategyPage() {
  const researchPhase = useTradingStore(s => s.researchPhase);
  const setResearchPhase = useTradingStore(s => s.setResearchPhase);
  const setActiveStrategy = useTradingStore(s => s.setActiveStrategy);
  const setStrategyGoals = useTradingStore(s => s.setStrategyGoals);
  const addStrategy = useTradingStore(s => s.addStrategy);
  // Legacy phase status methods (kept for backward compat but pipeline now uses its own state)
  // const setResearchPhaseStatuses = useTradingStore(s => s.setResearchPhaseStatuses);
  // const updateResearchPhaseStatus = useTradingStore(s => s.updateResearchPhaseStatus);
  // const addResearchBrief = useTradingStore(s => s.addResearchBrief);
  const setCurrentBacktestResult = useTradingStore(s => s.setCurrentBacktestResult);
  const addOptimizationIteration = useTradingStore(s => s.addOptimizationIteration);
  const currentBacktestResult = useTradingStore(s => s.currentBacktestResult);
  const strategyGoals = useTradingStore(s => s.strategyGoals);
  const deployedStrategy = useTradingStore(s => s.deployedStrategy);
  const setDeployedStrategy = useTradingStore(s => s.setDeployedStrategy);
  const activeStrategy = useTradingStore(s => s.activeStrategy);

  // Abort controllers for in-flight SSE streams
  const researchAbort = useRef<AbortController | null>(null);
  const optimizeAbort = useRef<AbortController | null>(null);
  const pipelineHandleRef = useRef<ResearchPipelineHandle | null>(null);

  // Determine active tab from lifecycle phase
  const activeTab = useMemo(() => {
    switch (researchPhase) {
      case 'idle':
      case 'defining': return 'build';
      case 'researching': return 'research';
      case 'backtesting': return 'backtest';
      case 'optimizing': return 'optimize';
      case 'ready':
      case 'deployed': return 'deploy';
      default: return 'build';
    }
  }, [researchPhase]);

  // ------- Start Research -------
  const handleStartResearch = useCallback((config: StrategyConfig, goals: StrategyGoals) => {
    // Cancel any in-flight research
    researchAbort.current?.abort();
    const controller = new AbortController();
    researchAbort.current = controller;

    setActiveStrategy(config);
    addStrategy(config);
    setStrategyGoals(goals);
    setResearchPhase('researching');

    // Reset the pipeline UI
    pipelineHandleRef.current?.reset();

    // Pull live market data from store to feed the research pipeline
    const storeState = useTradingStore.getState();
    const liveOhlcv = storeState.ohlcv ?? [];
    const liveTicker = storeState.ticker ?? null;
    const liveBalance = storeState.accountValue ?? 0;
    const livePositions = storeState.positions ?? [];
    const liveOrderBook = storeState.orderBook ?? null;

    // Fire and forget — consume the SSE stream from the multi-agent pipeline
    consumeSSE('/api/ai', {
      action: 'deep_research',
      strategyConfig: config,
      strategyGoals: goals,
      symbol: config.symbol,
      ohlcv: liveOhlcv,
      ticker: liveTicker,
      balance: liveBalance,
      positions: livePositions,
      orderBook: liveOrderBook,
      currentPrice: liveTicker?.last ?? 0,
    }, (event) => {
      const type = event.type as string;

      // Forward ALL events to the ResearchPipeline component (new multi-agent UI)
      pipelineHandleRef.current?.handleEvent(event);

      // Handle key lifecycle transitions
      switch (type) {
        case 'backtest_complete':
          if (event.metrics) {
            setCurrentBacktestResult(event.metrics as Parameters<typeof setCurrentBacktestResult>[0]);
          }
          break;

        case 'pipeline_complete':
        case 'done':
          setResearchPhase('backtesting');
          break;

        case 'pipeline_error':
          console.error('[Strategy] Pipeline error:', event.error);
          break;
      }
    }, controller.signal).catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        console.error('[Strategy] Research stream error:', err);
      }
    });
  }, [setActiveStrategy, addStrategy, setStrategyGoals, setResearchPhase,
      setCurrentBacktestResult]);

  // ------- Research Complete → ready for optimization -------
  const handleResearchComplete = useCallback(() => {
    setResearchPhase('backtesting');
  }, [setResearchPhase]);

  // ------- Start Optimization -------
  const handleStartOptimization = useCallback(() => {
    const config = useTradingStore.getState().activeStrategy;
    const goals = useTradingStore.getState().strategyGoals;
    if (!config || !goals) return;

    // Cancel any in-flight optimization
    optimizeAbort.current?.abort();
    const controller = new AbortController();
    optimizeAbort.current = controller;

    setResearchPhase('optimizing');

    consumeSSE('/api/ai', {
      action: 'optimize_strategy',
      strategyConfig: config,
      strategyGoals: goals,
      // TODO: Pass ohlcv data when available from scanner/chart
      ohlcv: [],
    }, (event) => {
      const type = event.type as string;

      switch (type) {
        case 'iteration_complete': {
          const changes = (event.changes || []) as Array<{
            field: string; oldValue: string | number; newValue: string | number; reasoning: string;
          }>;
          addOptimizationIteration({
            iteration: event.iteration as number,
            timestamp: Date.now(),
            strategyConfig: (event.config || config) as StrategyConfig,
            backtestResult: (event.backtestResult || null) as import('@/types/trading').BacktestResult,
            changes,
            metricsVsGoals: (event.metricsVsGoals || []) as Array<{
              metric: string; value: number; goal: number; met: boolean;
            }>,
            decisionRecord: {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              agent: 'optimization-loop',
              action: `iteration ${event.iteration}`,
              reasoning: changes.map(c => c.reasoning).join('; ') || 'No changes',
              confidence: 0.8,
              inputs: {},
              supportingEvidence: changes.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`),
              phase: 'optimization' as const,
            },
          });

          if (event.converged) {
            setActiveStrategy((event.config || config) as StrategyConfig);
            setResearchPhase('ready');
          }
          break;
        }

        case 'done':
          if (event.finalConfig) {
            setActiveStrategy(event.finalConfig as StrategyConfig);
          }
          setResearchPhase('ready');
          break;
      }
    }, controller.signal).catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        console.error('[Strategy] Optimization stream error:', err);
        setResearchPhase('backtesting'); // Fall back
      }
    });
  }, [setResearchPhase, setActiveStrategy, addOptimizationIteration]);

  // ------- Optimization Complete -------
  const handleOptimizationComplete = useCallback((finalConfig: StrategyConfig) => {
    setActiveStrategy(finalConfig);
    setResearchPhase('ready');
  }, [setActiveStrategy, setResearchPhase]);

  // ------- Deploy -------
  const handleDeploy = useCallback(() => {
    if (activeStrategy) {
      setDeployedStrategy({ ...activeStrategy, status: 'live', updatedAt: Date.now() });
      setResearchPhase('deployed');
    }
  }, [activeStrategy, setDeployedStrategy, setResearchPhase]);

  // ------- Stop -------
  const handleStop = useCallback(() => {
    setDeployedStrategy(null);
    setResearchPhase('ready');
  }, [setDeployedStrategy, setResearchPhase]);

  const phaseLabel = useMemo(() => {
    const labels: Record<string, string> = {
      idle: 'Strategy Lab',
      defining: 'Defining Strategy',
      researching: 'Deep Research',
      backtesting: 'Backtesting',
      optimizing: 'Optimizing',
      ready: 'Ready to Deploy',
      deployed: 'Live',
    };
    return labels[researchPhase] || 'Strategy Lab';
  }, [researchPhase]);

  return (
    <AppLayout
      title="Strategy Lab"
      subtitle="Build, research, backtest, optimize, and deploy"
      actions={
        <Badge
          variant="outline"
          className={
            researchPhase === 'deployed' ? 'text-emerald-500 border-emerald-500/30 animate-pulse' :
            researchPhase === 'idle' ? 'text-muted-foreground' :
            'text-primary border-primary/30'
          }
        >
          {phaseLabel}
        </Badge>
      }
    >
      <PageTransition>
        <ErrorBoundary fallback="strategy">
          <Tabs value={activeTab} onValueChange={(v) => {
            const phaseMap: Record<string, typeof researchPhase> = {
              build: 'defining', research: 'researching', backtest: 'backtesting',
              optimize: 'optimizing', deploy: deployedStrategy ? 'deployed' : 'ready',
            };
            if (v === 'build') setResearchPhase('idle');
            else if (v === 'review') { /* review tab doesn't change lifecycle phase */ }
            else if (phaseMap[v]) setResearchPhase(phaseMap[v]);
          }}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="build" className="flex-1 gap-1.5 text-xs">
                <FlaskConical className="w-3 h-3" /> Build
              </TabsTrigger>
              <TabsTrigger value="research" className="flex-1 gap-1.5 text-xs">
                <Search className="w-3 h-3" /> Research
              </TabsTrigger>
              <TabsTrigger value="backtest" className="flex-1 gap-1.5 text-xs">
                <BarChart3 className="w-3 h-3" /> Backtest
              </TabsTrigger>
              <TabsTrigger value="optimize" className="flex-1 gap-1.5 text-xs">
                <RotateCcw className="w-3 h-3" /> Optimize
              </TabsTrigger>
              <TabsTrigger value="deploy" className="flex-1 gap-1.5 text-xs">
                <Rocket className="w-3 h-3" /> Deploy
              </TabsTrigger>
              <TabsTrigger value="review" className="flex-1 gap-1.5 text-xs">
                <Brain className="w-3 h-3" /> Review
              </TabsTrigger>
            </TabsList>

            <TabsContent value="build">
              <StrategyBuilder onStartResearch={handleStartResearch} />
            </TabsContent>

            <TabsContent value="research">
              <ResearchPipeline onRegister={(h) => { pipelineHandleRef.current = h; }} onComplete={handleResearchComplete} />
            </TabsContent>

            <TabsContent value="backtest">
              {currentBacktestResult ? (
                <BacktestResults
                  result={currentBacktestResult}
                  goals={strategyGoals}
                  onOptimize={handleStartOptimization}
                />
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="No Backtest Results"
                  description="Complete the research pipeline to auto-run your first backtest, or switch to the Build tab to define a strategy."
                />
              )}
            </TabsContent>

            <TabsContent value="optimize">
              <OptimizationLoop
                isRunning={researchPhase === 'optimizing'}
                onComplete={handleOptimizationComplete}
              />
            </TabsContent>

            <TabsContent value="deploy">
              <div className="space-y-4">
                <DeployPanel
                  strategy={activeStrategy}
                  onDeploy={handleDeploy}
                  onStop={handleStop}
                />
                <SupervisorPanel />
              </div>
            </TabsContent>

            <TabsContent value="review">
              <PerformanceReview />
            </TabsContent>
          </Tabs>
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}

// ---------- Empty State ----------

function EmptyState({ icon: Icon, title, description }: { icon: typeof BarChart3; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-12 text-center">
      <Icon className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{description}</p>
    </div>
  );
}
