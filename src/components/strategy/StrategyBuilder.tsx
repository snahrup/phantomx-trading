'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTradingStore, RISK_PRESETS } from '@/store/trading-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { StrategyConfig, StrategyGoals, RiskLevel, RiskParameters, Condition, ConditionGroup } from '@/types/trading';
import {
  Rocket, Plus, X, Sparkles, Shield, Target, Brain,
  TrendingUp, ChevronDown, AlertTriangle, Loader2, Zap,
} from 'lucide-react';

// ---------- Constants ----------

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
const DURATIONS = ['scalp', 'day', 'swing', 'position'] as const;
const RISK_LEVELS: RiskLevel[] = ['conservative', 'moderate', 'aggressive', 'degen'];

const INDICATORS = [
  'CLOSE', 'OPEN', 'HIGH', 'LOW', 'VOLUME',
  'SMA_20', 'SMA_50', 'SMA_200', 'EMA_9', 'EMA_21', 'EMA_55',
  'RSI', 'MACD_LINE', 'MACD_SIGNAL', 'MACD_HISTOGRAM',
  'BB_UPPER', 'BB_MIDDLE', 'BB_LOWER',
  'VWAP', 'ATR',
];

const OPERATORS: { value: Condition['operator']; label: string }[] = [
  { value: 'crosses_above', label: 'Crosses Above' },
  { value: 'crosses_below', label: 'Crosses Below' },
  { value: 'above', label: 'Is Above' },
  { value: 'below', label: 'Is Below' },
  { value: 'equals', label: 'Equals' },
];

const SUGGESTED_TOPICS = [
  'Volume profile', 'Whale accumulation', 'On-chain signals',
  'Macro correlation', 'Liquidation levels', 'Social sentiment',
  'Exchange flows', 'Funding rate analysis',
];

const STAGGER = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const ITEM = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };
const GLASS = 'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5';

// ---------- Helpers ----------

function emptyCondition(): Condition {
  return { indicator: 'RSI', operator: 'crosses_above', target: 30 };
}

// ---------- Component ----------

interface StrategyBuilderProps {
  onStartResearch: (config: StrategyConfig, goals: StrategyGoals) => void;
}

export default function StrategyBuilder({ onStartResearch }: StrategyBuilderProps) {
  const selectedSymbol = useTradingStore(s => s.selectedSymbol);
  const selectedTimeframe = useTradingStore(s => s.selectedTimeframe);

  // Quick Launch state
  const [quickPrompt, setQuickPrompt] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickReasoning, setQuickReasoning] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState(selectedSymbol);
  const [timeframe, setTimeframe] = useState(selectedTimeframe);
  const [thesis, setThesis] = useState('');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('aggressive');
  const [risk, setRisk] = useState<RiskParameters>(RISK_PRESETS.aggressive);
  const [entryLogic, setEntryLogic] = useState<'AND' | 'OR'>('AND');
  const [entryConditions, setEntryConditions] = useState<Condition[]>([
    { indicator: 'RSI', operator: 'crosses_above', target: 30 },
  ]);
  const [exitLogic, setExitLogic] = useState<'AND' | 'OR'>('AND');
  const [exitConditions, setExitConditions] = useState<Condition[]>([
    { indicator: 'RSI', operator: 'crosses_below', target: 70 },
  ]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionInput, setQuestionInput] = useState('');

  // Goals
  const [minWinRate, setMinWinRate] = useState(55);
  const [minProfitFactor, setMinProfitFactor] = useState(1.5);
  const [maxDrawdown, setMaxDrawdown] = useState(15);
  const [minSharpe, setMinSharpe] = useState(1.0);
  const [duration, setDuration] = useState<StrategyGoals['duration']>('swing');
  const [maxIterations, setMaxIterations] = useState(10);

  const handleRiskLevelChange = useCallback((level: RiskLevel) => {
    setRiskLevel(level);
    setRisk(RISK_PRESETS[level]);
  }, []);

  // Quick Launch — natural language → auto-configure → auto-launch
  const handleQuickLaunch = useCallback(async () => {
    if (!quickPrompt.trim() || quickLoading) return;
    setQuickLoading(true);
    setQuickError(null);
    setQuickReasoning(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_strategy', message: quickPrompt }),
      });

      if (!res.ok) {
        const err = await res.json();
        setQuickError(err.error || `API error: ${res.status}`);
        setQuickLoading(false);
        return;
      }

      const data = await res.json();
      const config = data.config as StrategyConfig;
      const goals = data.goals as StrategyGoals;

      // Show what AI decided
      setQuickReasoning(data.reasoning || 'Strategy generated.');

      // Populate form fields for visibility
      setName(config.name || '');
      if (config.symbol) setSymbol(config.symbol);
      if (config.timeframe) setTimeframe(config.timeframe);
      if (config.risk) {
        setRisk(config.risk);
        // Determine closest risk level
        if (config.risk.maxPositionSizePercent >= 15) setRiskLevel('degen');
        else if (config.risk.maxPositionSizePercent >= 8) setRiskLevel('aggressive');
        else if (config.risk.maxPositionSizePercent >= 5) setRiskLevel('moderate');
        else setRiskLevel('conservative');
      }
      if (config.entryConditions?.conditions) {
        setEntryConditions(config.entryConditions.conditions as Condition[]);
        setEntryLogic(config.entryConditions.logic || 'AND');
      }
      if (config.exitConditions?.conditions) {
        setExitConditions(config.exitConditions.conditions as Condition[]);
        setExitLogic(config.exitConditions.logic || 'AND');
      }
      if (goals.minWinRate) setMinWinRate(Math.round(goals.minWinRate * 100));
      if (goals.minProfitFactor) setMinProfitFactor(goals.minProfitFactor);
      if (goals.maxDrawdownPercent) setMaxDrawdown(goals.maxDrawdownPercent);
      if (goals.minSharpeRatio) setMinSharpe(goals.minSharpeRatio);
      if (goals.duration) setDuration(goals.duration);
      if (goals.maxOptimizationIterations) setMaxIterations(goals.maxOptimizationIterations);
      if (goals.questions) setQuestions(goals.questions);

      // Auto-launch research
      onStartResearch(config, goals);
    } catch (err) {
      setQuickError(String(err));
    } finally {
      setQuickLoading(false);
    }
  }, [quickPrompt, quickLoading, onStartResearch, setSymbol, setTimeframe]);

  const updateCondition = (
    list: Condition[], setList: (c: Condition[]) => void,
    idx: number, field: keyof Condition, value: string | number,
  ) => {
    const next = [...list];
    next[idx] = { ...next[idx], [field]: value };
    setList(next);
  };

  const addQuestion = (q: string) => {
    const trimmed = q.trim();
    if (trimmed && !questions.includes(trimmed)) {
      setQuestions(prev => [...prev, trimmed]);
    }
    setQuestionInput('');
  };

  const handleLaunch = () => {
    const config: StrategyConfig = {
      id: crypto.randomUUID(),
      name: name || 'Untitled Strategy',
      symbol,
      timeframe,
      status: 'draft',
      risk,
      indicators: [],
      entryConditions: { logic: entryLogic, conditions: entryConditions } as ConditionGroup,
      exitConditions: { logic: exitLogic, conditions: exitConditions } as ConditionGroup,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const goals: StrategyGoals = {
      minWinRate: minWinRate / 100,
      minProfitFactor,
      maxDrawdownPercent: maxDrawdown,
      minSharpeRatio: minSharpe,
      duration,
      maxOptimizationIterations: maxIterations,
      questions,
    };
    onStartResearch(config, goals);
  };

  const [showManualConfig, setShowManualConfig] = useState(false);

  return (
    <motion.div
      variants={STAGGER}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {/* Quick Launch — Natural Language */}
      <motion.div variants={ITEM} className={cn(GLASS, 'border-primary/30')}>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Quick Launch</h3>
          <Badge variant="outline" className="text-[10px] text-primary border-primary/30 ml-auto">
            AI-Powered
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Describe what you want in plain English. The AI will configure everything, run research, and deploy.
        </p>
        <textarea
          rows={3}
          value={quickPrompt}
          onChange={e => setQuickPrompt(e.target.value)}
          placeholder="e.g. Build an HFT scalp bot for 50x leverage tokens, both long and short, starting with $100, goal is $1,000 as fast as possible. Focus on mean reversion and momentum ignition on 1m charts."
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs dark:bg-input/30 resize-none focus:border-primary focus:ring-primary/50 focus:ring-[3px] outline-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleQuickLaunch();
            }
          }}
        />

        {quickReasoning && (
          <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs text-foreground/80">
            <div className="flex items-center gap-1.5 mb-1 text-primary font-medium">
              <Brain className="w-3 h-3" /> AI Reasoning
            </div>
            {quickReasoning}
          </div>
        )}

        {quickError && (
          <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> {quickError}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <Button
            onClick={handleQuickLaunch}
            disabled={!quickPrompt.trim() || quickLoading}
            className="flex-1 gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 font-semibold"
          >
            {quickLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating Strategy...
              </>
            ) : (
              <>
                <Rocket className="w-4 h-4" /> Generate & Launch
              </>
            )}
          </Button>
          <span className="text-[10px] text-muted-foreground hidden sm:block">Ctrl+Enter</span>
        </div>

        {/* Quick presets */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {[
            { label: 'HFT Scalp Bot', prompt: 'Build a high-frequency scalp bot using mean reversion on 1m Bollinger Bands and momentum ignition. Both long and short. Aggressive risk, 50x leverage tokens. Starting with $100, target $1,000.' },
            { label: 'Swing Trend', prompt: 'Build a swing trading strategy that catches major trends using EMA crossovers and RSI confirmation on 4h charts. Moderate risk. Focus on BTC and ETH.' },
            { label: 'Funding Rate Arb', prompt: 'Build a strategy that exploits extreme funding rates on crypto perps. Short when funding is very positive, long when very negative. Scalp duration, moderate leverage.' },
            { label: 'Grid Bot (Range)', prompt: 'Build a grid trading bot for range-bound markets. Auto-detect support/resistance, place grid orders within the range. Low risk, consistent small gains.' },
          ].map(preset => (
            <button
              key={preset.label}
              onClick={() => setQuickPrompt(preset.prompt)}
              className="text-[10px] px-2 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Toggle manual config */}
      <motion.div variants={ITEM}>
        <button
          onClick={() => setShowManualConfig(!showManualConfig)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <Separator className="flex-1" />
          <span className="flex items-center gap-1">
            {showManualConfig ? <ChevronDown className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 -rotate-90" />}
            {showManualConfig ? 'Hide' : 'Show'} Manual Configuration
          </span>
          <Separator className="flex-1" />
        </button>
      </motion.div>

      {showManualConfig && (<>
      {/* 1. Name + Symbol + Timeframe */}
      <motion.div variants={ITEM} className={GLASS}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Strategy Identity</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <Label className="text-xs text-muted-foreground mb-1 block">Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Golden Cross Breakout..."
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Symbol</Label>
            <Input value={symbol} onChange={e => setSymbol(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Timeframe</Label>
            <select
              value={timeframe}
              onChange={e => setTimeframe(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs dark:bg-input/30"
            >
              {TIMEFRAMES.map(tf => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </div>
        </div>
      </motion.div>

      {/* 2. Thesis */}
      <motion.div variants={ITEM} className={GLASS}>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Trading Thesis</h3>
        </div>
        <textarea
          rows={4}
          value={thesis}
          onChange={e => setThesis(e.target.value)}
          placeholder="Describe your thesis... e.g. 'I believe BTC is entering an accumulation phase based on decreasing exchange reserves and RSI divergence on the weekly. I want to catch the breakout above the 200 EMA with confirmation from volume and funding rate normalization.'"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs dark:bg-input/30 resize-none focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          The AI uses this to guide deep research, pattern matching, and strategy synthesis
        </p>
      </motion.div>

      {/* 3. Risk Profile */}
      <motion.div variants={ITEM} className={GLASS}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Risk Profile</h3>
        </div>
        <div className="flex gap-2 mb-4">
          {RISK_LEVELS.map(level => (
            <button
              key={level}
              onClick={() => handleRiskLevelChange(level)}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                riskLevel === level
                  ? level === 'degen'
                    ? 'bg-destructive/20 border-destructive text-destructive'
                    : 'bg-primary/20 border-primary text-primary'
                  : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {level === 'degen' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Position Size %', value: risk.maxPositionSizePercent, key: 'maxPositionSizePercent' },
            { label: 'Stop Loss %', value: risk.stopLossPercent, key: 'stopLossPercent' },
            { label: 'Take Profit %', value: risk.takeProfitPercent, key: 'takeProfitPercent' },
            { label: 'Max Drawdown %', value: risk.maxDrawdownPercent, key: 'maxDrawdownPercent' },
            { label: 'Trailing Stop %', value: risk.trailingStopPercent ?? 0, key: 'trailingStopPercent' },
            { label: 'Max Daily Loss %', value: risk.maxDailyLossPercent, key: 'maxDailyLossPercent' },
          ].map(param => (
            <div key={param.key}>
              <Label className="text-xs text-muted-foreground mb-1 block">{param.label}</Label>
              <Input
                type="number"
                step="0.5"
                value={param.value}
                onChange={e => setRisk(prev => ({ ...prev, [param.key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Switch
            checked={risk.allowLossOfEntireAmount}
            onCheckedChange={v => setRisk(prev => ({ ...prev, allowLossOfEntireAmount: v }))}
          />
          <Label className="text-xs text-muted-foreground">Allow loss of entire amount</Label>
          {risk.allowLossOfEntireAmount && (
            <Badge variant="destructive" className="text-[10px] ml-auto">Extreme risk</Badge>
          )}
        </div>
      </motion.div>

      {/* 4. Entry Conditions */}
      <motion.div variants={ITEM} className={GLASS}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-foreground">Entry Conditions</h3>
          </div>
          <button
            onClick={() => setEntryLogic(l => l === 'AND' ? 'OR' : 'AND')}
            className="text-[10px] font-bold px-2 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground"
          >
            {entryLogic}
          </button>
        </div>
        <div className="space-y-2">
          {entryConditions.map((c, i) => (
            <ConditionRow
              key={i}
              condition={c}
              onChange={(field, val) => updateCondition(entryConditions, setEntryConditions, i, field, val)}
              onRemove={entryConditions.length > 1 ? () => setEntryConditions(p => p.filter((_, j) => j !== i)) : undefined}
            />
          ))}
        </div>
        <button
          onClick={() => setEntryConditions(p => [...p, emptyCondition()])}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add condition
        </button>
      </motion.div>

      {/* 5. Exit Conditions */}
      <motion.div variants={ITEM} className={GLASS}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ChevronDown className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-foreground">Exit Conditions</h3>
          </div>
          <button
            onClick={() => setExitLogic(l => l === 'AND' ? 'OR' : 'AND')}
            className="text-[10px] font-bold px-2 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground"
          >
            {exitLogic}
          </button>
        </div>
        <div className="space-y-2">
          {exitConditions.map((c, i) => (
            <ConditionRow
              key={i}
              condition={c}
              onChange={(field, val) => updateCondition(exitConditions, setExitConditions, i, field, val)}
              onRemove={exitConditions.length > 1 ? () => setExitConditions(p => p.filter((_, j) => j !== i)) : undefined}
            />
          ))}
        </div>
        <button
          onClick={() => setExitConditions(p => [...p, emptyCondition()])}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add condition
        </button>
      </motion.div>

      {/* 6. Questions & Focus Areas */}
      <motion.div variants={ITEM} className={GLASS}>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Research Focus Areas</h3>
        </div>
        <div className="flex gap-2 mb-2">
          <Input
            value={questionInput}
            onChange={e => setQuestionInput(e.target.value)}
            placeholder="Type a question or topic and press Enter..."
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addQuestion(questionInput); } }}
          />
          <Button size="sm" variant="outline" onClick={() => addQuestion(questionInput)}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        {questions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {questions.map(q => (
              <Badge key={q} variant="secondary" className="text-xs gap-1 pr-1">
                {q}
                <button onClick={() => setQuestions(p => p.filter(x => x !== q))} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Separator className="my-2" />
        <p className="text-xs text-muted-foreground mb-1.5">Suggested:</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_TOPICS.filter(t => !questions.includes(t)).map(t => (
            <button
              key={t}
              onClick={() => addQuestion(t)}
              className="text-[11px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              + {t}
            </button>
          ))}
        </div>
      </motion.div>

      {/* 7. Goals */}
      <motion.div variants={ITEM} className={GLASS}>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Performance Goals</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Min Win Rate %</Label>
            <Input type="number" value={minWinRate} onChange={e => setMinWinRate(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Min Profit Factor</Label>
            <Input type="number" step="0.1" value={minProfitFactor} onChange={e => setMinProfitFactor(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Max Drawdown %</Label>
            <Input type="number" value={maxDrawdown} onChange={e => setMaxDrawdown(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Min Sharpe Ratio</Label>
            <Input type="number" step="0.1" value={minSharpe} onChange={e => setMinSharpe(Number(e.target.value))} />
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <Label className="text-xs text-muted-foreground">Duration:</Label>
          <div className="flex gap-1.5">
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                  duration === d
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'border-border/50 text-muted-foreground hover:text-foreground',
                )}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Max Optimization Iterations:</Label>
          <Input
            type="number"
            min={3}
            max={25}
            value={maxIterations}
            onChange={e => setMaxIterations(Math.min(25, Math.max(3, Number(e.target.value))))}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">(3–25)</span>
        </div>
      </motion.div>

      {/* 8. Launch */}
      <motion.div variants={ITEM}>
        <Button
          size="lg"
          onClick={handleLaunch}
          className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 font-semibold"
        >
          <Rocket className="w-4 h-4" />
          Launch Deep Research
        </Button>
      </motion.div>
      </>)}
    </motion.div>
  );
}

// ---------- Condition Row ----------

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (field: keyof Condition, value: string | number) => void;
  onRemove?: () => void;
}) {
  const selectClass = 'h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs dark:bg-input/30 focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none';

  return (
    <div className="flex items-center gap-2">
      <select
        value={condition.indicator}
        onChange={e => onChange('indicator', e.target.value)}
        className={cn(selectClass, 'flex-1')}
      >
        {INDICATORS.map(ind => <option key={ind} value={ind}>{ind}</option>)}
      </select>
      <select
        value={condition.operator}
        onChange={e => onChange('operator', e.target.value)}
        className={cn(selectClass, 'flex-1')}
      >
        {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>
      <input
        value={condition.target}
        onChange={e => {
          const num = Number(e.target.value);
          onChange('target', isNaN(num) ? e.target.value : num);
        }}
        placeholder="value or indicator"
        className="h-8 w-28 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs dark:bg-input/30 focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none"
      />
      {onRemove && (
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
