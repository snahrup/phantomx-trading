// src/types/mission-control.ts

export type RiskLevel = 'conservative' | 'moderate' | 'aggressive' | 'degen';

export interface MissionControlConfig {
  riskLevel: RiskLevel;
  selectedPairs: string[];
  pairFilter: string | null;
  maxConcurrentPositions: 1 | 2 | 3 | 5;
  profitGoal: number | null;
}

export const DEFAULT_MISSION_CONFIG: MissionControlConfig = {
  riskLevel: 'aggressive',
  selectedPairs: ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'],
  pairFilter: null,
  maxConcurrentPositions: 3,
  profitGoal: null,
};

export type AgentRole = 'scanner' | 'strategy' | 'risk' | 'execution' | 'research' | 'user' | 'system';

export interface FeedMessage {
  id: string;
  timestamp: Date;
  agentName: string;
  agentRole: AgentRole;
  content: string;
  isUser?: boolean;
  commentType?: 'finding' | 'argument' | 'ruling' | 'recommendation' | 'disagreement_detected';
  wave?: number;
}

export interface TradeCloseEvent {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  leverage: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  isWin: boolean;
  duration: string;
  rrAchieved: number;
  strategy: string;
  closedAt: Date;
}

export const AGENT_ROLE_COLORS: Record<AgentRole, string> = {
  scanner: 'text-blue-400',
  research: 'text-blue-400',
  strategy: 'text-amber-400',
  risk: 'text-orange-400',
  execution: 'text-emerald-400',
  user: 'text-purple-400',
  system: 'text-zinc-500',
};
