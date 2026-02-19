'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Zap, Pause, Play, OctagonX, Wifi, WifiOff,
  Bot, TrendingUp, TrendingDown, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTradingStore } from '@/store/trading-store';

type TradingStatus = 'auto' | 'manual' | 'paused' | 'killed';

const statusLabels: Record<TradingStatus, string> = {
  auto: 'Auto-Trading', manual: 'Manual', paused: 'Paused', killed: 'KILLED',
};

const statusColors: Record<TradingStatus, string> = {
  auto: 'bg-claude-green', manual: 'bg-muted-foreground', paused: 'bg-amber-500', killed: 'bg-destructive',
};

function getTradingStatus(isKilled: boolean, isPaused: boolean, isExecuting: boolean): TradingStatus {
  if (isKilled) return 'killed';
  if (isPaused) return 'paused';
  if (isExecuting) return 'auto';
  return 'manual';
}

export default function LiveAvatar() {
  const [expanded, setExpanded] = useState(false);

  const isConnected = useTradingStore(s => s.isConnected);
  const isTestnet = useTradingStore(s => s.isTestnet);
  const isExecuting = useTradingStore(s => s.isExecuting);
  const isPaused = useTradingStore(s => s.isPaused);
  const isKilled = useTradingStore(s => s.isKilled);
  const killReason = useTradingStore(s => s.killReason);
  const positions = useTradingStore(s => s.positions);
  const accountValue = useTradingStore(s => s.accountValue);
  const agentStatuses = useTradingStore(s => s.agentStatuses);
  const signalConsensus = useTradingStore(s => s.signalConsensus);
  const selectedSymbol = useTradingStore(s => s.selectedSymbol);
  const ticker = useTradingStore(s => s.ticker);

  const setExecuting = useTradingStore(s => s.setExecuting);
  const setPaused = useTradingStore(s => s.setPaused);
  const setKilled = useTradingStore(s => s.setKilled);
  const setAiPanelMode = useTradingStore(s => s.setAiPanelMode);

  const status = getTradingStatus(isKilled, isPaused, isExecuting);
  const activeAgents = agentStatuses.filter(a => a.state === 'running').length;
  const totalAgents = agentStatuses.length;
  const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl || 0), 0);
  const lastPrice = ticker?.last ?? 0;

  return (
    <div className="border-b border-border bg-card">
      {/* Compact bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors duration-150"
      >
        {/* Status dot with animated ring */}
        <div className="relative">
          <motion.div
            className={`w-2 h-2 rounded-full ${statusColors[status]}`}
            animate={status === 'auto' ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          {status === 'auto' && (
            <motion.div
              className="absolute inset-[-3px] rounded-full border border-claude-green"
              animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.5, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </div>

        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <motion.span
              key={status}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-medium text-foreground"
            >
              {statusLabels[status]}
            </motion.span>
            <span className="text-xs text-muted-foreground truncate">
              &middot; {selectedSymbol.replace('/USDT:USDT', '')} {lastPrice > 0 ? `$${lastPrice.toLocaleString()}` : ''}
            </span>
          </div>
        </div>

        {/* Connection + Agent dots */}
        <div className="flex items-center gap-1.5 mr-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-claude-green' : 'bg-destructive'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
          {activeAgents > 0 && (
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-claude-blue"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              title={`${activeAgents} agents active`}
            />
          )}
          {positions.length > 0 && (
            <div className={`w-1.5 h-1.5 rounded-full ${unrealizedPnl >= 0 ? 'bg-claude-green' : 'bg-destructive'}`} title={`${positions.length} open positions`} />
          )}
        </div>

        {/* Account value */}
        {accountValue > 0 && (
          <span className="text-[10px] font-mono text-muted-foreground">
            ${accountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}

        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </motion.div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-3">
              {/* Status grid */}
              <div className="grid grid-cols-3 gap-3 text-xs">
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                  <p className="text-muted-foreground mb-0.5">Connection</p>
                  <p className="text-foreground flex items-center gap-1">
                    {isConnected ? <Wifi className="w-3 h-3 text-claude-green" /> : <WifiOff className="w-3 h-3 text-destructive" />}
                    {isConnected ? (isTestnet ? 'Testnet' : 'Mainnet') : 'Disconnected'}
                  </p>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <p className="text-muted-foreground mb-0.5">Positions</p>
                  <p className="text-foreground flex items-center gap-1">
                    {unrealizedPnl >= 0 ? <TrendingUp className="w-3 h-3 text-claude-green" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                    {positions.length} open ({unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)})
                  </p>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                  <p className="text-muted-foreground mb-0.5">Agents</p>
                  <p className="text-foreground flex items-center gap-1">
                    <Bot className="w-3 h-3 text-claude-blue" />
                    {activeAgents}/{totalAgents} active
                  </p>
                </motion.div>
              </div>

              {/* Kill reason banner */}
              {isKilled && killReason && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-3 py-2 rounded-md bg-destructive/10 text-destructive text-xs border border-destructive/20"
                >
                  <strong>Kill Reason:</strong> {killReason}
                </motion.div>
              )}

              {/* Signal consensus */}
              {signalConsensus && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Signal Consensus</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-medium ${signalConsensus.consensusSentiment === 'bullish' ? 'text-claude-green' : signalConsensus.consensusSentiment === 'bearish' ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {signalConsensus.consensusSentiment.toUpperCase()}
                    </span>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${signalConsensus.consensusConfidence * 100}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {Math.round(signalConsensus.consensusConfidence * 100)}%
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Quick actions */}
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex items-center gap-1.5 flex-wrap"
              >
                {!isKilled && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 bg-transparent"
                      onClick={(e) => { e.stopPropagation(); setExecuting(!isExecuting); }}
                    >
                      {isExecuting ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      {isExecuting ? 'Stop Auto' : 'Start Auto'}
                    </Button>
                    {isExecuting && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 bg-transparent"
                        onClick={(e) => { e.stopPropagation(); setPaused(!isPaused); }}
                      >
                        <Pause className="w-3 h-3" />
                        {isPaused ? 'Resume' : 'Pause'}
                      </Button>
                    )}
                  </>
                )}
                <Button
                  variant={isKilled ? 'outline' : 'destructive'}
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={(e) => { e.stopPropagation(); setKilled(!isKilled, isKilled ? undefined : 'Manual kill from LiveAvatar'); }}
                >
                  <OctagonX className="w-3 h-3" />
                  {isKilled ? 'Reset Kill' : 'Kill Switch'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 bg-transparent"
                  onClick={(e) => { e.stopPropagation(); setAiPanelMode('floating'); }}
                >
                  <MessageSquare className="w-3 h-3" />
                  AI Chat
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
