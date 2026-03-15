'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { getAxonClient } from '@/lib/axon/client';
import { useAxonStore } from '@/store/axon-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type {
  TopOpportunity,
  TradingThesis,
  ResearchFinding,
  UpcomingMarketEvent,
  ResearchEngineStatus,
  ResearchEngineConfig,
  RiskLevel,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// Common Symbols — Phemex perpetual futures
// ---------------------------------------------------------------------------
const COMMON_SYMBOLS = [
  'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'DOGE/USDT:USDT',
  'XRP/USDT:USDT', 'PEPE/USDT:USDT', 'WIF/USDT:USDT', 'BONK/USDT:USDT',
  'AVAX/USDT:USDT', 'LINK/USDT:USDT', 'ADA/USDT:USDT', 'MATIC/USDT:USDT',
  'ARB/USDT:USDT', 'OP/USDT:USDT', 'SUI/USDT:USDT', 'APT/USDT:USDT',
  'INJ/USDT:USDT', 'TIA/USDT:USDT', 'SEI/USDT:USDT', 'NEAR/USDT:USDT',
  'FTM/USDT:USDT', 'ATOM/USDT:USDT', 'DOT/USDT:USDT', 'UNI/USDT:USDT',
  'AAVE/USDT:USDT', 'MKR/USDT:USDT', 'LDO/USDT:USDT', 'RUNE/USDT:USDT',
  'FET/USDT:USDT', 'RENDER/USDT:USDT', 'TAO/USDT:USDT', 'JUP/USDT:USDT',
];

const FOCUS_AREA_OPTIONS = [
  'memecoins', 'layer2', 'defi', 'ai_tokens', 'gaming', 'rwa',
  'macro', 'whale_activity', 'funding_rates', 'liquidations',
  'new_listings', 'volume_spikes', 'on_chain', 'nft',
];

const RISK_PROFILES: { value: RiskLevel; label: string; desc: string }[] = [
  { value: 'conservative', label: 'Conservative', desc: 'Low leverage, only A+ setups' },
  { value: 'moderate', label: 'Moderate', desc: 'Confirmed setups, controlled risk' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Momentum entries, medium-high leverage' },
  { value: 'degen', label: 'Degen', desc: 'High leverage, wide stops, max exposure' },
];

const INTERVAL_PRESETS = [
  { label: 'Fast (5/15/30 min)', quick: 5, deep: 15, thesis: 30 },
  { label: 'Normal (10/30/60 min)', quick: 10, deep: 30, thesis: 60 },
  { label: 'Slow (30/60/120 min)', quick: 30, deep: 60, thesis: 120 },
];

// ---------------------------------------------------------------------------
// Research Configuration Panel
// ---------------------------------------------------------------------------
function ResearchConfigPanel({
  config,
  onChange,
  isRunning,
}: {
  config: Partial<ResearchEngineConfig> & { virtualBalance: number };
  onChange: (config: Partial<ResearchEngineConfig> & { virtualBalance: number }) => void;
  isRunning: boolean;
}) {
  const [customSymbol, setCustomSymbol] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleSymbol = (symbol: string) => {
    const current = config.watchlistSymbols ?? [];
    const next = current.includes(symbol)
      ? current.filter(s => s !== symbol)
      : [...current, symbol];
    onChange({ ...config, watchlistSymbols: next });
  };

  const addCustomSymbol = () => {
    const sym = customSymbol.trim().toUpperCase();
    if (!sym) return;
    // Normalize to Phemex perpetual format
    const normalized = sym.includes('/') ? sym : `${sym}/USDT:USDT`;
    const current = config.watchlistSymbols ?? [];
    if (!current.includes(normalized)) {
      onChange({ ...config, watchlistSymbols: [...current, normalized] });
    }
    setCustomSymbol('');
  };

  const toggleFocusArea = (area: string) => {
    const current = config.focusAreas ?? [];
    const next = current.includes(area)
      ? current.filter(a => a !== area)
      : [...current, area];
    onChange({ ...config, focusAreas: next });
  };

  const selectedSymbols = config.watchlistSymbols ?? [];
  const selectedFocusAreas = config.focusAreas ?? [];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-200">
              Research Configuration
            </span>
            {selectedSymbols.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-[#AE5630]/30 text-[#AE5630]">
                {selectedSymbols.length} symbols
              </Badge>
            )}
            {selectedSymbols.length === 0 && (
              <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-500">
                All symbols (auto)
              </Badge>
            )}
          </div>
          <span className="text-zinc-500 text-xs">{isExpanded ? '▾' : '▸'}</span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        <Card className="bg-white/[0.02] border-white/10">
          <CardContent className="p-4 space-y-5">
            {/* Symbol Selector */}
            <div>
              <Label className="text-xs font-medium text-zinc-400 uppercase mb-2 block">
                Watchlist Symbols
                <span className="text-zinc-600 font-normal normal-case ml-2">
                  (empty = scan everything)
                </span>
              </Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_SYMBOLS.map(sym => {
                  const short = sym.replace('/USDT:USDT', '');
                  const isSelected = selectedSymbols.includes(sym);
                  return (
                    <button
                      key={sym}
                      onClick={() => toggleSymbol(sym)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                        isSelected
                          ? 'bg-[#AE5630]/20 border-[#AE5630]/40 text-[#AE5630]'
                          : 'bg-white/[0.02] border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                      }`}
                    >
                      {short}
                    </button>
                  );
                })}
              </div>
              {/* Custom symbol input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom symbol (e.g. TRUMP)"
                  value={customSymbol}
                  onChange={e => setCustomSymbol(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomSymbol()}
                  className="h-8 text-xs bg-white/[0.03] border-white/10"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addCustomSymbol}
                  className="h-8 text-xs border-white/20"
                >
                  Add
                </Button>
              </div>
              {/* Show custom symbols not in the common list */}
              {selectedSymbols.filter(s => !COMMON_SYMBOLS.includes(s)).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selectedSymbols.filter(s => !COMMON_SYMBOLS.includes(s)).map(sym => (
                    <button
                      key={sym}
                      onClick={() => toggleSymbol(sym)}
                      className="text-xs px-2 py-1 rounded-md border bg-[#AE5630]/20 border-[#AE5630]/40 text-[#AE5630] flex items-center gap-1"
                    >
                      {sym.replace('/USDT:USDT', '')}
                      <span className="text-[10px] opacity-60">×</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Quick actions */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onChange({ ...config, watchlistSymbols: [...COMMON_SYMBOLS.slice(0, 12)] })}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
                >
                  Top 12
                </button>
                <button
                  onClick={() => onChange({ ...config, watchlistSymbols: COMMON_SYMBOLS.filter(s =>
                    ['PEPE', 'WIF', 'BONK', 'DOGE'].some(m => s.startsWith(m))
                  )})}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
                >
                  Memes Only
                </button>
                <button
                  onClick={() => onChange({ ...config, watchlistSymbols: COMMON_SYMBOLS.filter(s =>
                    ['ARB', 'OP', 'SUI', 'APT', 'SEI'].some(m => s.startsWith(m))
                  )})}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
                >
                  L2s
                </button>
                <button
                  onClick={() => onChange({ ...config, watchlistSymbols: COMMON_SYMBOLS.filter(s =>
                    ['FET', 'RENDER', 'TAO'].some(m => s.startsWith(m))
                  )})}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
                >
                  AI Tokens
                </button>
                <button
                  onClick={() => onChange({ ...config, watchlistSymbols: [] })}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
                >
                  Clear All
                </button>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Risk Profile + Focus Areas row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Risk Profile */}
              <div>
                <Label className="text-xs font-medium text-zinc-400 uppercase mb-2 block">
                  Risk Profile
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {RISK_PROFILES.map(rp => (
                    <button
                      key={rp.value}
                      onClick={() => onChange({ ...config, riskProfile: rp.value })}
                      className={`text-left p-2 rounded-md border transition-colors ${
                        config.riskProfile === rp.value
                          ? 'bg-[#AE5630]/20 border-[#AE5630]/40'
                          : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                      }`}
                    >
                      <span className={`text-xs font-medium ${
                        config.riskProfile === rp.value ? 'text-[#AE5630]' : 'text-zinc-300'
                      }`}>
                        {rp.label}
                      </span>
                      <p className="text-[10px] text-zinc-500 mt-0.5">{rp.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Focus Areas */}
              <div>
                <Label className="text-xs font-medium text-zinc-400 uppercase mb-2 block">
                  Focus Areas
                  <span className="text-zinc-600 font-normal normal-case ml-2">
                    (optional)
                  </span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {FOCUS_AREA_OPTIONS.map(area => {
                    const isSelected = selectedFocusAreas.includes(area);
                    return (
                      <button
                        key={area}
                        onClick={() => toggleFocusArea(area)}
                        className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                          isSelected
                            ? 'bg-[#AE5630]/20 border-[#AE5630]/40 text-[#AE5630]'
                            : 'bg-white/[0.02] border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20'
                        }`}
                      >
                        {area.replace(/_/g, ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Scan Intervals + Virtual Balance row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Scan Intervals */}
              <div>
                <Label className="text-xs font-medium text-zinc-400 uppercase mb-2 block">
                  Scan Speed
                </Label>
                <div className="space-y-1.5">
                  {INTERVAL_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => onChange({
                        ...config,
                        quickScanIntervalMs: preset.quick * 60_000,
                        deepDiveIntervalMs: preset.deep * 60_000,
                        thesisIntervalMs: preset.thesis * 60_000,
                      })}
                      className={`w-full text-left p-2 rounded-md border transition-colors text-xs ${
                        config.quickScanIntervalMs === preset.quick * 60_000
                          ? 'bg-[#AE5630]/20 border-[#AE5630]/40 text-[#AE5630]'
                          : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:border-white/20'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1.5">
                  Faster = more API calls. Normal recommended for most use.
                </p>
              </div>

              {/* Virtual Balance */}
              <div>
                <Label className="text-xs font-medium text-zinc-400 uppercase mb-2 block">
                  Paper Trading Balance
                </Label>
                <div className="space-y-1.5">
                  {[10_000, 50_000, 100_000, 500_000].map(amount => (
                    <button
                      key={amount}
                      onClick={() => onChange({ ...config, virtualBalance: amount })}
                      className={`w-full text-left p-2 rounded-md border transition-colors text-xs ${
                        config.virtualBalance === amount
                          ? 'bg-[#AE5630]/20 border-[#AE5630]/40 text-[#AE5630]'
                          : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:border-white/20'
                      }`}
                    >
                      ${amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Top 10 Opportunity Card
// ---------------------------------------------------------------------------
function OpportunityCard({
  opp,
  isSelected,
  onClick,
}: {
  opp: TopOpportunity;
  isSelected: boolean;
  onClick: () => void;
}) {
  const directionColor =
    opp.direction === 'long' ? 'text-emerald-400' :
    opp.direction === 'short' ? 'text-red-400' : 'text-amber-400';

  const directionBg =
    opp.direction === 'long' ? 'bg-emerald-500/10 border-emerald-500/30' :
    opp.direction === 'short' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30';

  const scoreColor =
    opp.score >= 80 ? 'text-emerald-400' :
    opp.score >= 60 ? 'text-amber-400' :
    opp.score >= 40 ? 'text-orange-400' : 'text-zinc-400';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left transition-all duration-200 rounded-lg border p-3 hover:bg-white/5 ${
        isSelected
          ? 'border-[#AE5630]/60 bg-[#AE5630]/10 shadow-lg shadow-[#AE5630]/5'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Rank badge */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-lg font-bold tabular-nums ${
            opp.rank <= 3 ? 'text-[#AE5630]' : 'text-zinc-500'
          }`}>
            #{opp.rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-zinc-100 truncate">
                {opp.symbol.replace('/USDT:USDT', '')}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 uppercase ${directionBg} ${directionColor} border`}
              >
                {opp.direction}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{opp.headline ?? opp.reasoning?.slice(0, 80) ?? ''}</p>
          </div>
        </div>

        {/* Score */}
        <div className="text-right shrink-0">
          <span className={`text-lg font-bold tabular-nums ${scoreColor}`}>
            {opp.score}
          </span>
          <p className="text-[10px] text-zinc-500 uppercase">score</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-500">
        {(opp.riskRewardRatio ?? 0) > 0 && (
          <span>R:R <span className="text-zinc-300">{opp.riskRewardRatio!.toFixed(1)}:1</span></span>
        )}
        {opp.confidence != null && <span>Conf <span className="text-zinc-300">{opp.confidence}%</span></span>}
        {(opp.findingCount ?? 0) > 0 && <span>{opp.findingCount} findings</span>}
        {opp.timeHorizon && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/10">
            {opp.timeHorizon}
          </Badge>
        )}
      </div>

      {/* Tags */}
      {(opp.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {opp.tags!.slice(0, 4).map(tag => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0 rounded bg-white/5 text-zinc-500"
            >
              {tag.replace('_', ' ')}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Thesis Detail Panel
// ---------------------------------------------------------------------------
function ThesisDetail({ thesis, findings }: { thesis: TradingThesis; findings: ResearchFinding[] }) {
  const relatedFindings = findings.filter(
    f => thesis.findingIds.includes(f.id) || f.symbol === thesis.symbol
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge
            variant="outline"
            className={`uppercase ${
              thesis.direction === 'long' ? 'border-emerald-500/30 text-emerald-400' :
              thesis.direction === 'short' ? 'border-red-500/30 text-red-400' :
              'border-amber-500/30 text-amber-400'
            }`}
          >
            {thesis.direction}
          </Badge>
          <Badge variant="outline" className="border-white/10 text-zinc-400">
            {thesis.timeHorizon}
          </Badge>
          <Badge variant="outline" className="border-white/10 text-zinc-400">
            {thesis.confidence}% confidence
          </Badge>
        </div>
        <h3 className="text-lg font-semibold text-zinc-100">{thesis.title}</h3>
        <p className="text-sm text-zinc-300 mt-2 leading-relaxed">{thesis.thesis}</p>
      </div>

      {/* Trade Plan */}
      <Card className="bg-white/[0.03] border-white/10">
        <CardContent className="p-3">
          <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Trade Plan</h4>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-zinc-500 text-xs">Entry</span>
              <p className="text-zinc-100 font-mono font-medium">${thesis.proposedEntry.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-zinc-500 text-xs">Stop Loss</span>
              <p className="text-red-400 font-mono font-medium">${thesis.proposedStopLoss.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-zinc-500 text-xs">Take Profit</span>
              <p className="text-emerald-400 font-mono font-medium">${thesis.proposedTakeProfit.toLocaleString()}</p>
            </div>
          </div>
          <Separator className="my-2 bg-white/5" />
          <div className="flex gap-4 text-xs">
            <span className="text-zinc-500">R:R <span className="text-zinc-300 font-medium">{thesis.riskRewardRatio.toFixed(2)}:1</span></span>
            <span className="text-zinc-500">Size <span className="text-zinc-300 font-medium">{thesis.suggestedPositionSizePercent}%</span></span>
            <span className="text-zinc-500">Leverage <span className="text-zinc-300 font-medium">{thesis.suggestedLeverage}x</span></span>
          </div>
        </CardContent>
      </Card>

      {/* Evidence */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <h4 className="text-xs font-medium text-emerald-400 uppercase mb-1.5">Supporting Evidence</h4>
          <ul className="space-y-1">
            {thesis.supportingEvidence.map((e, i) => (
              <li key={i} className="text-xs text-zinc-300 flex gap-1.5">
                <span className="text-emerald-500 shrink-0">+</span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-medium text-red-400 uppercase mb-1.5">Contra Evidence</h4>
          <ul className="space-y-1">
            {thesis.contraEvidence.length > 0 ? thesis.contraEvidence.map((e, i) => (
              <li key={i} className="text-xs text-zinc-300 flex gap-1.5">
                <span className="text-red-500 shrink-0">-</span>
                <span>{e}</span>
              </li>
            )) : (
              <li className="text-xs text-zinc-500 italic">None identified</li>
            )}
          </ul>
        </div>
      </div>

      {/* Catalysts */}
      {thesis.catalysts.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-amber-400 uppercase mb-1.5">Catalysts</h4>
          <ul className="space-y-1">
            {thesis.catalysts.map((c, i) => (
              <li key={i} className="text-xs text-zinc-300 flex gap-1.5">
                <span className="text-amber-500 shrink-0">⚡</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Backtest results if available */}
      {thesis.backtestSummary && (
        <Card className="bg-white/[0.03] border-white/10">
          <CardContent className="p-3">
            <h4 className="text-xs font-medium text-zinc-400 uppercase mb-2">Paper Trade Results</h4>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-zinc-500">Win Rate</span>
                <p className={`font-medium ${thesis.backtestSummary.winRate >= 55 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {thesis.backtestSummary.winRate.toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Profit Factor</span>
                <p className={`font-medium ${thesis.backtestSummary.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {thesis.backtestSummary.profitFactor.toFixed(2)}
                </p>
              </div>
              <div>
                <span className="text-zinc-500">Sharpe</span>
                <p className="font-medium text-zinc-300">{thesis.backtestSummary.sharpeRatio.toFixed(2)}</p>
              </div>
              <div>
                <span className="text-zinc-500">Samples</span>
                <p className="font-medium text-zinc-300">{thesis.backtestSummary.sampleSize}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related findings */}
      {relatedFindings.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="text-xs font-medium text-zinc-400 hover:text-zinc-300 uppercase">
            ▸ {relatedFindings.length} Supporting Findings
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {relatedFindings.slice(0, 10).map(f => (
              <div key={f.id} className="text-xs p-2 rounded bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] px-1 py-0 border-white/10">
                    {f.category.replace('_', ' ')}
                  </Badge>
                  <span className="text-zinc-300 font-medium">{f.title}</span>
                </div>
                <p className="text-zinc-500 mt-0.5">{f.summary}</p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engine Status Bar
// ---------------------------------------------------------------------------
function EngineStatusBar({
  status,
  onStart,
  onStop,
  onPause,
  onResume,
  configSummary,
}: {
  status: ResearchEngineStatus | null;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  configSummary?: string;
}) {
  const isRunning = status?.state === 'running';
  const isPaused = status?.state === 'paused';

  const formatAgo = (ts: number | null) => {
    if (!ts) return 'never';
    const mins = Math.round((Date.now() - ts) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  };

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className={`w-2.5 h-2.5 rounded-full ${
          isRunning ? 'bg-emerald-400 animate-pulse' :
          isPaused ? 'bg-amber-400' :
          'bg-zinc-600'
        }`} />
        <div>
          <span className="text-sm font-medium text-zinc-200">
            Research Engine {isRunning ? 'Running' : isPaused ? 'Paused' : 'Idle'}
          </span>
          {status && (
            <p className="text-[11px] text-zinc-500">
              {status.findingsCount ?? status.totalFindings ?? 0} findings · {status.thesesCount ?? status.totalThesesGenerated ?? 0} theses
              {status.currentCycle && typeof status.currentCycle === 'string' && (
                <span className="text-amber-400 ml-2">● {status.currentCycle.replace('_', ' ')}</span>
              )}
              {configSummary && !status.currentCycle && (
                <span className="text-zinc-600 ml-2">· {configSummary}</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status && (
          <div className="text-[10px] text-zinc-500 text-right mr-2 hidden sm:block">
            {status.lastCycleAt && <div>Last: {formatAgo(typeof status.lastCycleAt === 'string' ? new Date(status.lastCycleAt).getTime() : status.lastCycleAt)}</div>}
            {status.activeSymbols?.length > 0 && <div>{status.activeSymbols.length} symbols</div>}
            <div>{status.findingsCount ?? 0} findings</div>
          </div>
        )}
        {!isRunning && !isPaused && (
          <Button size="sm" onClick={onStart} className="bg-[#AE5630] hover:bg-[#8B4526] text-white">
            Start Research
          </Button>
        )}
        {isRunning && (
          <>
            <Button size="sm" variant="outline" onClick={onPause} className="border-white/20">
              Pause
            </Button>
            <Button size="sm" variant="outline" onClick={onStop} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
              Stop
            </Button>
          </>
        )}
        {isPaused && (
          <>
            <Button size="sm" onClick={onResume} className="bg-[#AE5630] hover:bg-[#8B4526] text-white">
              Resume
            </Button>
            <Button size="sm" variant="outline" onClick={onStop} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
              Stop
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events Timeline
// ---------------------------------------------------------------------------
function EventsTimeline({ events }: { events: UpcomingMarketEvent[] }) {
  const futureEvents = events
    .filter(e => new Date(e.expectedDate).getTime() > Date.now())
    .sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime());

  if (futureEvents.length === 0) {
    return <p className="text-xs text-zinc-500 italic">No upcoming events tracked yet.</p>;
  }

  return (
    <div className="space-y-2">
      {futureEvents.slice(0, 8).map(evt => {
        const impactColor =
          evt.expectedImpact === 'critical' ? 'text-red-400 border-red-500/30' :
          evt.expectedImpact === 'high' ? 'text-amber-400 border-amber-500/30' :
          evt.expectedImpact === 'medium' ? 'text-zinc-300 border-white/10' :
          'text-zinc-500 border-white/5';

        return (
          <div key={evt.id} className={`text-xs p-2 rounded border ${impactColor.split(' ')[1]} bg-white/[0.02]`}>
            <div className="flex items-center justify-between">
              <span className={`font-medium ${impactColor.split(' ')[0]}`}>{evt.title}</span>
              <span className="text-zinc-500">
                {new Date(evt.expectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <p className="text-zinc-500 mt-0.5">{evt.impactAssessment}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Research Dashboard
// ---------------------------------------------------------------------------
export default function ResearchDashboard() {
  const {
    researchEngineStatus,
    researchFindings,
    tradingTheses,
    upcomingEvents,
    topOpportunities,
    selectedThesisId,
    setResearchEngineStatus,
    setResearchFindings,
    setTradingTheses,
    setUpcomingEvents,
    setTopOpportunities,
    setSelectedThesisId,
  } = useTradingStore();

  const [isLoading, setIsLoading] = useState(false);

  // Axon store — SSE events arrive automatically via the store-bridge
  const axonIssues = useAxonStore((s) => s.issues);
  const axonAgentEvents = useAxonStore((s) => s.agentEvents);

  // Research config state — defaults to "scan everything"
  const [researchConfig, setResearchConfig] = useState<
    Partial<ResearchEngineConfig> & { virtualBalance: number }
  >({
    watchlistSymbols: [],
    riskProfile: 'aggressive',
    focusAreas: [],
    quickScanIntervalMs: 10 * 60_000,
    deepDiveIntervalMs: 30 * 60_000,
    thesisIntervalMs: 60 * 60_000,
    virtualBalance: 100_000,
  });

  // Derive top opportunities from Axon trading issues (replaces SSE EventSource)
  useEffect(() => {
    const tradingIssues = axonIssues.filter((i) => i.issue_type === 'trading');
    if (tradingIssues.length > 0) {
      const opportunities: TopOpportunity[] = tradingIssues.map((issue, idx) => ({
        rank: idx + 1,
        symbol: issue.title.split(' ')[0] || 'UNKNOWN',
        direction: (issue.description?.toLowerCase().includes('short') ? 'short' : 'long') as 'long' | 'short',
        score: issue.priority === 'critical' ? 95 : issue.priority === 'high' ? 80 : issue.priority === 'medium' ? 65 : 50,
        thesisId: issue.id,
        reasoning: issue.description || '',
        suggestedEntry: 0,
        suggestedStop: 0,
        suggestedTarget: 0,
        riskReward: 0,
        timeframe: '4h',
        catalysts: [],
      }));
      setTopOpportunities(opportunities);
    }

    // Map agent events to research engine status
    const latestEvent = axonAgentEvents[axonAgentEvents.length - 1];
    if (latestEvent) {
      setResearchEngineStatus({
        state: 'running',
        currentCycle: 0,
        lastCycleAt: latestEvent.timestamp,
        nextCycleAt: null,
        activeSymbols: [],
        findingsCount: axonAgentEvents.filter((e) => e.action === 'finding').length,
        thesesCount: tradingIssues.length,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axonIssues, axonAgentEvents]);

  const fetchFullState = useCallback(async () => {
    // Fetch trading issues from Axon as the source of truth for opportunities
    const client = getAxonClient();
    const result = await client.listIssues({ issue_type: 'trading' });
    if (result.ok) {
      const opportunities: TopOpportunity[] = result.data.map((issue, idx) => ({
        rank: idx + 1,
        symbol: issue.title.split(' ')[0] || 'UNKNOWN',
        direction: (issue.description?.toLowerCase().includes('short') ? 'short' : 'long') as 'long' | 'short',
        score: issue.priority === 'critical' ? 95 : issue.priority === 'high' ? 80 : issue.priority === 'medium' ? 65 : 50,
        thesisId: issue.id,
        reasoning: issue.description || '',
        suggestedEntry: 0,
        suggestedStop: 0,
        suggestedTarget: 0,
        riskReward: 0,
        timeframe: '4h',
        catalysts: [],
      }));
      setTopOpportunities(opportunities);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch initial state on mount (replaces SSE initial_state event)
  useEffect(() => {
    fetchFullState();
  }, [fetchFullState]);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      // Create a trading issue in Axon to kick off research
      const { virtualBalance, ...engineConfig } = researchConfig;
      const client = getAxonClient();
      await client.createIssue({
        title: `Research Scan — ${(engineConfig.watchlistSymbols ?? []).join(', ') || 'All Symbols'}`,
        description: JSON.stringify({ config: engineConfig, virtualBalance }),
        issue_type: 'trading',
        priority: 'medium',
      });
      setResearchEngineStatus({
        state: 'running',
        currentCycle: 0,
        lastCycleAt: new Date().toISOString(),
        nextCycleAt: null,
        activeSymbols: engineConfig.watchlistSymbols ?? [],
        findingsCount: 0,
        thesesCount: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    const client = getAxonClient();
    await client.killAll();
    setResearchEngineStatus({
      state: 'stopped',
      currentCycle: 0,
      lastCycleAt: new Date().toISOString(),
      nextCycleAt: null,
      activeSymbols: [],
      findingsCount: 0,
      thesesCount: 0,
    });
  };

  const handlePause = async () => {
    const client = getAxonClient();
    await client.pauseAll();
    if (researchEngineStatus) {
      setResearchEngineStatus({ ...researchEngineStatus, state: 'paused' });
    }
  };

  const handleResume = async () => {
    const client = getAxonClient();
    await client.resumeAll();
    if (researchEngineStatus) {
      setResearchEngineStatus({ ...researchEngineStatus, state: 'running' });
    }
  };

  const handleConfigChange = async (
    newConfig: Partial<ResearchEngineConfig> & { virtualBalance: number }
  ) => {
    setResearchConfig(newConfig);
    // If engine is already running, push config update as a new trading issue
    const isRunning = researchEngineStatus?.state === 'running' || researchEngineStatus?.state === 'paused';
    if (isRunning) {
      const { virtualBalance: _vb, ...engineConfig } = newConfig;
      try {
        const client = getAxonClient();
        await client.createIssue({
          title: `Config Update — ${(engineConfig.watchlistSymbols ?? []).join(', ') || 'All Symbols'}`,
          description: JSON.stringify({ action: 'configure', config: engineConfig }),
          issue_type: 'trading',
          priority: 'low',
        });
      } catch { /* ignore — best-effort live update */ }
    }
  };

  const selectedThesis = tradingTheses.find(t => t.id === selectedThesisId);
  const selectedOpp = topOpportunities.find(o => o.thesisId === selectedThesisId);
  const isEngineActive = researchEngineStatus?.state === 'running' || researchEngineStatus?.state === 'paused';

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Research Configuration — collapsed by default, expandable */}
      <ResearchConfigPanel
        config={researchConfig}
        onChange={handleConfigChange}
        isRunning={isEngineActive}
      />

      {/* Engine Status Bar */}
      <EngineStatusBar
        status={researchEngineStatus}
        onStart={handleStart}
        onStop={handleStop}
        onPause={handlePause}
        onResume={handleResume}
        configSummary={
          (researchConfig.watchlistSymbols ?? []).length > 0
            ? `${researchConfig.watchlistSymbols!.length} symbols · ${researchConfig.riskProfile}`
            : `All symbols · ${researchConfig.riskProfile}`
        }
      />

      {/* Main content: Top 10 Board + Detail panel */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(320px,400px)_1fr] gap-4 min-h-0">
        {/* Left: Top 10 Board */}
        <Card className="bg-white/[0.02] border-white/10 flex flex-col min-h-0">
          <CardHeader className="pb-2 pt-3 px-3 shrink-0">
            <CardTitle className="text-sm font-semibold text-zinc-200 flex items-center justify-between">
              <span>Top Opportunities</span>
              <Badge variant="outline" className="border-[#AE5630]/30 text-[#AE5630] text-[10px]">
                LIVE
              </Badge>
            </CardTitle>
            <p className="text-[11px] text-zinc-500">
              Ranked by research score · Click for details
            </p>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 px-2 pb-2">
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-2">
                {topOpportunities.length > 0 ? (
                  topOpportunities.map(opp => (
                    <OpportunityCard
                      key={`${opp.symbol}-${opp.rank}`}
                      opp={opp}
                      isSelected={selectedThesisId === opp.thesisId}
                      onClick={() => setSelectedThesisId(opp.thesisId)}
                    />
                  ))
                ) : (
                  <div className="text-center py-12">
                    <p className="text-zinc-500 text-sm">No opportunities yet</p>
                    <p className="text-zinc-600 text-xs mt-1">
                      Start the research engine to begin scanning
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Detail panel + Events */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Thesis detail */}
          <Card className="flex-1 bg-white/[0.02] border-white/10 min-h-0">
            <CardContent className="p-4 h-full">
              <ScrollArea className="h-full">
                {selectedThesis ? (
                  <ThesisDetail thesis={selectedThesis} findings={researchFindings} />
                ) : selectedOpp ? (
                  <div className="text-center py-12">
                    <p className="text-zinc-400 text-sm">
                      {selectedOpp.symbol.replace('/USDT:USDT', '')} has findings but no synthesized thesis yet.
                    </p>
                    <p className="text-zinc-500 text-xs mt-1">
                      A thesis will be generated on the next thesis cycle.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-zinc-500 text-sm">Select an opportunity to see the full analysis</p>
                    <p className="text-zinc-600 text-xs mt-1">
                      Each thesis includes entry/SL/TP, evidence, and risk assessment
                    </p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Bottom row: Events + Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
            {/* Upcoming Events */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold text-zinc-400 uppercase">
                  Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 max-h-48 overflow-auto">
                <EventsTimeline events={upcomingEvents} />
              </CardContent>
            </Card>

            {/* Research Stats */}
            <Card className="bg-white/[0.02] border-white/10">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold text-zinc-400 uppercase">
                  Research Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Active Findings</span>
                    <span className="text-zinc-300 font-medium">{researchFindings.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ready Theses</span>
                    <span className="text-zinc-300 font-medium">
                      {tradingTheses.filter(t => t.status === 'ready').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Tracked Events</span>
                    <span className="text-zinc-300 font-medium">{upcomingEvents.length}</span>
                  </div>
                  <Separator className="bg-white/5" />
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Avg Thesis Confidence</span>
                    <span className="text-zinc-300 font-medium">
                      {tradingTheses.length > 0
                        ? (tradingTheses.reduce((s, t) => s + t.confidence, 0) / tradingTheses.length).toFixed(0)
                        : '—'}%
                    </span>
                  </div>
                  {researchEngineStatus?.startedAt && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Running Since</span>
                      <span className="text-zinc-300 font-medium">
                        {new Date(researchEngineStatus.startedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
