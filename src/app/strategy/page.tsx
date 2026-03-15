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
import StrategyPlaybook from '@/components/axon/StrategyPlaybook';
import type { StrategyConfig, StrategyGoals } from '@/types/trading';
import {
  FlaskConical, Search, BarChart3, RotateCcw, Rocket, Brain,
} from 'lucide-react';
import { getAxonClient } from '@/lib/axon/client';

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

    // Create a trading issue in Axon — the 5-wave pipeline runs automatically
    getAxonClient().createIssue({
      title: `Deep Research: ${config.symbol} ${config.name || 'Strategy'}`,
      description: JSON.stringify({
        action: 'deep_research',
        strategyConfig: config,
        strategyGoals: goals,
        symbol: config.symbol,
        ohlcv: liveOhlcv.slice(0, 100), // Limit payload size
        ticker: liveTicker,
        balance: liveBalance,
        currentPrice: liveTicker?.last ?? 0,
      }),
      issue_type: 'trading',
      priority: 'high',
    }).then((result) => {
      if (result.ok) {
        // Pipeline will progress via heartbeat scheduler
        // UI updates come through SSE events (agent_status, issue_update)
        console.log('[Strategy] Trading issue created:', result.data.id);
        // Move to research phase — user can track via pipeline page
        setResearchPhase('researching');
      } else {
        console.error('[Strategy] Failed to create trading issue:', result.error);
      }
    }).catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        console.error('[Strategy] Research error:', err);
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

    // Create an optimization issue in Axon
    getAxonClient().createIssue({
      title: `Optimize Strategy: ${config.symbol} ${config.name || 'Strategy'}`,
      description: JSON.stringify({
        action: 'optimize_strategy',
        strategyConfig: config,
        strategyGoals: goals,
      }),
      issue_type: 'trading',
      priority: 'high',
    }).then((result) => {
      if (result.ok) {
        console.log('[Strategy] Optimization issue created:', result.data.id);
        // Pipeline handles optimization via 5-wave debate
      } else {
        console.error('[Strategy] Failed to create optimization issue:', result.error);
        setResearchPhase('backtesting');
      }
    }).catch((err) => {
      if ((err as Error).name !== 'AbortError') {
        console.error('[Strategy] Optimization error:', err);
        setResearchPhase('backtesting');
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
              <div className="space-y-4">
                <PerformanceReview />
                <StrategyPlaybook className="max-h-[500px]" />
              </div>
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
