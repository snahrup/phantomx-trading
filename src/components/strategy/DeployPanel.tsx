'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTradingStore } from '@/store/trading-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { StrategyConfig, SupervisorIntervention, MarketAnomaly } from '@/types/trading';
import {
  Rocket, Square, Eye, Shield, AlertTriangle, Activity,
  Bell, Wifi, WifiOff, CheckCircle2, Clock, Zap,
  TrendingUp, TrendingDown, Skull,
} from 'lucide-react';

const GLASS = 'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm';
const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { maximumFractionDigits: d });
const fmtPct = (n: number) => `${fmt(n, 1)}%`;

// ============================================================
// Deploy Panel — Launch & Control the Live Strategy
// ============================================================

interface DeployPanelProps {
  strategy: StrategyConfig | null;
  onDeploy: () => void;
  onStop: () => void;
}

export function DeployPanel({ strategy, onDeploy, onStop }: DeployPanelProps) {
  const deployedStrategy = useTradingStore(s => s.deployedStrategy);
  const isDeployed = !!deployedStrategy;
  const healthScore = useTradingStore(s => s.strategyHealthScore);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn(GLASS, 'p-4')}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Live Deployment</h3>
        </div>
        {isDeployed ? (
          <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px] animate-pulse">
            <Activity className="w-3 h-3 mr-1" /> LIVE
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Offline</Badge>
        )}
      </div>

      {isDeployed && deployedStrategy ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Strategy:</span>
              <span className="ml-1 text-foreground font-medium">{deployedStrategy.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Symbol:</span>
              <span className="ml-1 text-foreground font-mono">{deployedStrategy.symbol}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Timeframe:</span>
              <span className="ml-1 text-foreground">{deployedStrategy.timeframe}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Health:</span>
              <span className={cn('ml-1 font-medium',
                healthScore >= 80 ? 'text-emerald-500' :
                healthScore >= 50 ? 'text-yellow-500' : 'text-red-500',
              )}>
                {healthScore}%
              </span>
            </div>
          </div>

          {/* Health bar */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all',
                healthScore >= 80 ? 'bg-emerald-500' :
                healthScore >= 50 ? 'bg-yellow-500' : 'bg-red-500',
              )}
              style={{ width: `${healthScore}%` }}
            />
          </div>

          <Button
            onClick={onStop}
            variant="destructive"
            size="sm"
            className="w-full gap-2"
          >
            <Square className="w-3 h-3" /> Stop Strategy
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {strategy
              ? `Ready to deploy "${strategy.name}" on ${strategy.symbol} ${strategy.timeframe}`
              : 'Complete research and optimization to deploy a strategy'
            }
          </p>
          <Button
            onClick={onDeploy}
            disabled={!strategy}
            className="w-full gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
          >
            <Rocket className="w-3.5 h-3.5" /> Deploy Strategy
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================
// Supervisor Panel — 24/7 AI Monitoring Dashboard
// ============================================================

export function SupervisorPanel() {
  const supervisorActive = useTradingStore(s => s.supervisorActive);
  const setSupervisorActive = useTradingStore(s => s.setSupervisorActive);
  const interventions = useTradingStore(s => s.supervisorInterventions);
  const anomalies = useTradingStore(s => s.marketAnomalies);
  const healthScore = useTradingStore(s => s.strategyHealthScore);

  const recentInterventions = interventions.slice(-5).reverse();
  const recentAnomalies = anomalies.slice(-5).reverse();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Supervisor Status */}
      <div className={cn(GLASS, 'p-4')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">AI Supervisor</h3>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={supervisorActive}
              onCheckedChange={setSupervisorActive}
            />
            {supervisorActive ? (
              <Badge className="bg-emerald-500/20 text-emerald-500 text-[10px]">
                <Wifi className="w-3 h-3 mr-1" /> Active
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                <WifiOff className="w-3 h-3 mr-1" /> Inactive
              </Badge>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {supervisorActive
            ? 'Monitoring markets 24/7. Watching for anomalies, whale moves, social surges, and price deviations. Will intervene when necessary.'
            : 'Enable to start autonomous market monitoring with automatic intervention capabilities.'
          }
        </p>

        {/* Monitoring channels */}
        {supervisorActive && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {['Whale Alerts', 'Volume Spikes', 'Funding Rate', 'Social Sentiment', 'Exchange Flows', 'Price Deviation'].map(ch => (
              <Badge key={ch} variant="outline" className="text-[10px] text-emerald-500/70 border-emerald-500/20">
                <Activity className="w-2.5 h-2.5 mr-0.5" /> {ch}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Recent Anomalies */}
      {recentAnomalies.length > 0 && (
        <div className={cn(GLASS, 'p-4')}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <h3 className="text-xs font-semibold text-foreground">Recent Anomalies</h3>
          </div>
          <div className="space-y-2">
            {recentAnomalies.map(a => (
              <div key={a.id} className="text-xs border-l-2 pl-2 py-1" style={{
                borderColor: a.severity === 'critical' ? '#ef4444' : a.severity === 'high' ? '#f59e0b' : a.severity === 'medium' ? '#3b82f6' : '#6b7280',
              }}>
                <div className="flex items-center gap-1.5">
                  <AnomalyIcon type={a.type} />
                  <span className="font-medium text-foreground">{a.summary}</span>
                  <Badge variant="outline" className={cn('text-[9px] ml-auto',
                    a.severity === 'critical' ? 'text-red-500 border-red-500/30' :
                    a.severity === 'high' ? 'text-yellow-500 border-yellow-500/30' :
                    'text-muted-foreground',
                  )}>
                    {a.severity}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(a.timestamp).toLocaleTimeString()} • {a.symbol}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Interventions */}
      {recentInterventions.length > 0 && (
        <div className={cn(GLASS, 'p-4')}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">Interventions</h3>
          </div>
          <div className="space-y-2">
            {recentInterventions.map(iv => (
              <div key={iv.id} className="text-xs border-l-2 border-primary/30 pl-2 py-1">
                <div className="flex items-center gap-1.5">
                  <InterventionIcon action={iv.action} />
                  <span className="font-medium text-foreground">{actionLabel(iv.action)}</span>
                  <Badge variant="outline" className="text-[9px] ml-auto text-muted-foreground">
                    {(iv.confidence * 100).toFixed(0)}% confidence
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{iv.reasoning}</p>
                <span className="text-[10px] text-muted-foreground/60">
                  {new Date(iv.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {supervisorActive && recentAnomalies.length === 0 && recentInterventions.length === 0 && (
        <div className={cn(GLASS, 'p-6 text-center')}>
          <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">All quiet. Monitoring markets...</p>
        </div>
      )}
    </motion.div>
  );
}

// ---------- Sub-components ----------

function AnomalyIcon({ type }: { type: MarketAnomaly['type'] }) {
  switch (type) {
    case 'volume_spike': return <TrendingUp className="w-3 h-3 text-blue-500" />;
    case 'whale_move': return <Zap className="w-3 h-3 text-purple-500" />;
    case 'social_surge': return <Bell className="w-3 h-3 text-yellow-500" />;
    case 'news_shock': return <AlertTriangle className="w-3 h-3 text-red-500" />;
    case 'price_deviation': return <TrendingDown className="w-3 h-3 text-orange-500" />;
    case 'exchange_flow': return <Activity className="w-3 h-3 text-cyan-500" />;
    default: return <Activity className="w-3 h-3" />;
  }
}

function InterventionIcon({ action }: { action: SupervisorIntervention['action'] }) {
  switch (action) {
    case 'emergency_exit': return <Skull className="w-3 h-3 text-red-500" />;
    case 'reduce_position': return <TrendingDown className="w-3 h-3 text-yellow-500" />;
    case 'tighten_stops': return <Shield className="w-3 h-3 text-blue-500" />;
    case 'pause_entries': return <Clock className="w-3 h-3 text-orange-500" />;
    case 'alert_user': return <Bell className="w-3 h-3 text-purple-500" />;
    default: return <CheckCircle2 className="w-3 h-3 text-muted-foreground" />;
  }
}

function actionLabel(action: SupervisorIntervention['action']): string {
  const labels: Record<string, string> = {
    ignore: 'Ignored',
    alert_user: 'Alert Sent',
    tighten_stops: 'Stops Tightened',
    reduce_position: 'Position Reduced',
    pause_entries: 'Entries Paused',
    emergency_exit: 'Emergency Exit',
  };
  return labels[action] || action;
}
