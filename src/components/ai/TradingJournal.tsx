'use client';

import { useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTradingStore } from '@/store/trading-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FadeIn, StaggerList, StaggerItem, Collapse } from '@/components/motion';
import type { JournalEntry } from '@/types/trading';

// --- Helpers ---

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatUsd(n: number): string {
  return Math.abs(n) >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(2);
}

const TYPE_META: Record<string, { icon: string; textColor: string; borderColor: string; bgColor: string; label: string }> = {
  session_start: { icon: '🚀', textColor: 'text-primary',          borderColor: 'border-primary',          bgColor: 'bg-primary',          label: 'Session Start' },
  session_end:   { icon: '🏁', textColor: 'text-muted-foreground', borderColor: 'border-muted-foreground', bgColor: 'bg-muted-foreground', label: 'Session End' },
  scan:          { icon: '🔍', textColor: 'text-blue-400',         borderColor: 'border-blue-400',         bgColor: 'bg-blue-400',         label: 'Scan' },
  analysis:      { icon: '🧠', textColor: 'text-primary',          borderColor: 'border-primary',          bgColor: 'bg-primary',          label: 'Analysis' },
  decision:      { icon: '⚖️', textColor: 'text-yellow-500',       borderColor: 'border-yellow-500',       bgColor: 'bg-yellow-500',       label: 'Decision' },
  trade:         { icon: '⚡', textColor: 'text-claude-green',     borderColor: 'border-claude-green',     bgColor: 'bg-claude-green',     label: 'Trade Executed' },
  close:         { icon: '💰', textColor: 'text-claude-green',     borderColor: 'border-claude-green',     bgColor: 'bg-claude-green',     label: 'Position Closed' },
  skip:          { icon: '⏭️', textColor: 'text-muted-foreground', borderColor: 'border-muted-foreground', bgColor: 'bg-muted-foreground', label: 'Skipped' },
  kill:          { icon: '🛑', textColor: 'text-destructive',      borderColor: 'border-destructive',      bgColor: 'bg-destructive',      label: 'Kill Switch' },
  summary:       { icon: '📋', textColor: 'text-primary',          borderColor: 'border-primary',          bgColor: 'bg-primary',          label: 'Day Summary' },
};

const DEFAULT_META = { icon: '📌', textColor: 'text-foreground', borderColor: 'border-foreground', bgColor: 'bg-foreground', label: '' };

// --- Journal Entry Card ---

function JournalEntryCard({ entry, isExpanded, onToggle }: {
  entry: JournalEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const rawMeta = TYPE_META[entry.type];
  const meta = rawMeta
    ? rawMeta
    : { ...DEFAULT_META, label: entry.type };
  const hasPnl = entry.pnl !== undefined && entry.pnl !== 0;
  const pnlPositive = (entry.pnl ?? 0) >= 0;

  return (
    <StaggerItem>
      <div className="relative">
        {/* Timeline connector */}
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />

        <button
          onClick={onToggle}
          className="relative w-full text-left pl-10 pr-3 py-2 hover:bg-accent transition-colors rounded-r-lg"
        >
          {/* Timeline dot */}
          <div
            className={`absolute left-[10px] top-[12px] w-[11px] h-[11px] rounded-full border-2 z-10 ${meta.borderColor} ${isExpanded ? meta.bgColor : 'bg-card'}`}
          />

          {/* Header row */}
          <div className="flex items-center gap-2">
            <span className="text-[10px]">{meta.icon}</span>
            <span className={`text-[10px] font-semibold ${meta.textColor}`}>{meta.label}</span>
            {entry.symbol && (
              <span className="text-[10px] font-mono text-foreground bg-muted px-1 rounded">
                {entry.symbol.replace('/USDT:USDT', '')}
              </span>
            )}
            {entry.action && entry.action !== 'hold' && (
              <Badge
                variant="outline"
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 ${
                  entry.action === 'buy' ? 'bg-claude-green/10 text-claude-green border-claude-green/30' :
                  entry.action === 'sell' || entry.action === 'close' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                  'bg-muted text-foreground border-border'
                }`}
              >
                {entry.action}
              </Badge>
            )}
            {entry.confidence !== undefined && entry.confidence > 0 && (
              <span className={`text-[9px] font-mono ${
                entry.confidence >= 70 ? 'text-claude-green' :
                entry.confidence >= 40 ? 'text-yellow-500' :
                'text-destructive'
              }`}>
                {entry.confidence}%
              </span>
            )}
            {hasPnl && (
              <span className={`text-[10px] font-semibold font-mono ml-auto ${pnlPositive ? 'text-claude-green' : 'text-destructive'}`}>
                {pnlPositive ? '+' : ''}${formatUsd(entry.pnl!)}
              </span>
            )}
            <span className="text-[9px] text-muted-foreground ml-auto font-mono">{formatTime(entry.timestamp)}</span>
          </div>

          {/* Compact reason (always shown) */}
          <p className="text-[11px] text-foreground mt-0.5 line-clamp-1">{entry.reason}</p>
        </button>

        {/* Expanded details */}
        <Collapse open={isExpanded}>
          <div className="pl-10 pr-3 pb-3 space-y-2">
            {/* Full reasoning */}
            <Card className="py-2 gap-0 rounded-lg">
              <CardContent className="px-2 py-0 text-[11px] text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>,
                    li: ({ children }) => <li>{children}</li>,
                    code: ({ children }) => <code className="bg-muted text-primary px-1 rounded text-[10px] font-mono">{children}</code>,
                  }}
                >
                  {entry.reason}
                </ReactMarkdown>
              </CardContent>
            </Card>

            {/* Chart snapshot */}
            {entry.chartSnapshotPath && (
              <div className="rounded-lg overflow-hidden border border-border">
                <img
                  src={entry.chartSnapshotPath}
                  alt={`Chart at ${formatTime(entry.timestamp)}`}
                  className="w-full max-h-40 object-cover"
                  loading="lazy"
                />
              </div>
            )}

            {/* Portfolio state bar */}
            <div className="flex items-center gap-3 text-[10px] font-mono bg-muted rounded-md px-2.5 py-1.5">
              <div>
                <span className="text-muted-foreground">Equity </span>
                <span className="text-foreground font-semibold">${formatUsd(entry.portfolioState.equity)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cash </span>
                <span className="text-foreground">{entry.portfolioState.cashPercent.toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Pos </span>
                <span className="text-foreground">{entry.portfolioState.positionCount}</span>
              </div>
              <div className={entry.portfolioState.dailyPnl >= 0 ? 'text-claude-green' : 'text-destructive'}>
                <span className="text-muted-foreground">Day </span>
                {entry.portfolioState.dailyPnl >= 0 ? '+' : ''}${formatUsd(entry.portfolioState.dailyPnl)}
                <span className="text-[9px] ml-0.5">({entry.portfolioState.dailyPnlPercent >= 0 ? '+' : ''}{entry.portfolioState.dailyPnlPercent.toFixed(1)}%)</span>
              </div>
            </div>

            {/* Indicators */}
            {entry.indicators && Object.keys(entry.indicators).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(entry.indicators).map(([key, val]) => (
                  <Badge key={key} variant="outline" className="text-[9px] font-mono bg-muted border-border rounded px-1.5 py-0.5">
                    <span className="text-muted-foreground">{key}</span>{' '}
                    <span className="text-foreground">{val}</span>
                  </Badge>
                ))}
              </div>
            )}

            {/* Price at event */}
            {entry.price !== undefined && (
              <div className="text-[10px] font-mono text-muted-foreground">
                Price: <span className="text-foreground">${entry.price}</span>
              </div>
            )}
          </div>
        </Collapse>
      </div>
    </StaggerItem>
  );
}

// --- Day Summary Section ---

function DaySummary({ summary }: { summary: string }) {
  return (
    <FadeIn>
      <Card className="mx-3 mb-3 py-3 gap-0 rounded-lg border-l-2 border-l-primary">
        <CardContent className="px-3 py-0">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px]">📋</span>
            <span className="text-[11px] font-semibold text-primary">Day Summary</span>
          </div>
          <div className="text-[12px] text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                h2: ({ children }) => <h2 className="text-sm font-bold text-foreground mb-1 mt-3 first:mt-0">{children}</h2>,
                h3: ({ children }) => <h3 className="text-[12px] font-semibold text-foreground mb-1 mt-2 first:mt-0">{children}</h3>,
                blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/30 pl-2 my-1.5 text-muted-foreground italic">{children}</blockquote>,
                code: ({ children }) => <code className="bg-muted text-primary px-1 rounded text-[11px] font-mono">{children}</code>,
              }}
            >
              {summary}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </FadeIn>
  );
}

// --- Stats Bar ---

function StatsBar({ entries }: { entries: JournalEntry[] }) {
  const stats = useMemo(() => {
    const trades = entries.filter(e => e.type === 'trade');
    const closes = entries.filter(e => e.type === 'close');
    const wins = closes.filter(e => (e.pnl ?? 0) > 0);
    const losses = closes.filter(e => (e.pnl ?? 0) < 0);
    const totalPnl = closes.reduce((s, e) => s + (e.pnl ?? 0), 0);
    const first = entries[0];
    const last = entries[entries.length - 1];
    const startEquity = first?.portfolioState.equity ?? 0;
    const endEquity = last?.portfolioState.equity ?? startEquity;
    const returnPct = startEquity > 0 ? ((endEquity - startEquity) / startEquity) * 100 : 0;
    return { trades: trades.length, closes: closes.length, wins: wins.length, losses: losses.length, totalPnl, startEquity, endEquity, returnPct };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <FadeIn>
      <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-mono border-b border-border bg-muted">
        <div>
          <span className="text-muted-foreground">Trades </span>
          <span className="text-foreground font-semibold">{stats.trades}</span>
        </div>
        <div>
          <span className="text-muted-foreground">W/L </span>
          <span className="text-claude-green">{stats.wins}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-destructive">{stats.losses}</span>
        </div>
        <div className={stats.totalPnl >= 0 ? 'text-claude-green' : 'text-destructive'}>
          <span className="text-muted-foreground">P&L </span>
          <span className="font-semibold">{stats.totalPnl >= 0 ? '+' : ''}${formatUsd(stats.totalPnl)}</span>
        </div>
        <div className={stats.returnPct >= 0 ? 'text-claude-green' : 'text-destructive'}>
          <span className="font-semibold">{stats.returnPct >= 0 ? '+' : ''}{stats.returnPct.toFixed(2)}%</span>
        </div>
        <div className="ml-auto text-muted-foreground">
          {entries.length} events
        </div>
      </div>
    </FadeIn>
  );
}

// --- Filter Buttons ---

const FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trades', label: 'Trades' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'analysis', label: 'Analysis' },
];

// --- Main Component ---

export default function TradingJournal() {
  const { journalEntries, journalDaySummary, clearJournalEntries, setJournalDaySummary } = useTradingStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Filter to today's entries
  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const todayEntries = useMemo(() => {
    return journalEntries.filter(e => e.timestamp >= todayStart);
  }, [journalEntries, todayStart]);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return todayEntries;
    if (filter === 'trades') return todayEntries.filter(e => e.type === 'trade' || e.type === 'close');
    if (filter === 'decisions') return todayEntries.filter(e => e.type === 'decision' || e.type === 'trade' || e.type === 'close' || e.type === 'skip');
    if (filter === 'analysis') return todayEntries.filter(e => e.type === 'analysis' || e.type === 'scan');
    return todayEntries;
  }, [todayEntries, filter]);

  const handleGenerateSummary = useCallback(async () => {
    if (todayEntries.length === 0) return;
    setGeneratingSummary(true);
    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_summary', entries: todayEntries }),
      });
      const data = await res.json();
      if (data.summary) {
        setJournalDaySummary(data.summary);
      }
    } catch (err) {
      console.error('[Journal] Summary generation failed:', err);
    }
    setGeneratingSummary(false);
  }, [todayEntries, setJournalDaySummary]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Journal</span>
          {todayEntries.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-mono">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {todayEntries.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
                disabled={generatingSummary}
                className="h-auto px-2 py-1 text-[9px] font-medium bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
              >
                {generatingSummary ? 'Generating...' : 'Day Summary'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearJournalEntries}
                className="h-auto px-2 py-1 text-[9px] text-muted-foreground hover:text-destructive"
                title="Clear journal"
              >
                Clear
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar entries={todayEntries} />

      {/* Filters */}
      {todayEntries.length > 0 && (
        <div className="flex gap-1 px-3 py-1.5 border-b border-border">
          {FILTER_OPTIONS.map(opt => (
            <Button
              key={opt.key}
              variant={filter === opt.key ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setFilter(opt.key)}
              className={`h-auto px-2 py-0.5 text-[9px] font-medium ${
                filter === opt.key
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              }`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {/* Day summary */}
      {journalDaySummary && <DaySummary summary={journalDaySummary} />}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <FadeIn className="flex flex-col items-center justify-center h-full text-center opacity-50 px-6">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-30 text-primary">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p className="text-sm text-foreground">No journal entries yet</p>
            <p className="text-xs text-muted-foreground mt-1">Start the Autopilot to record decisions</p>
          </FadeIn>
        ) : (
          <StaggerList className="py-2">
            {filteredEntries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                isExpanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              />
            ))}
          </StaggerList>
        )}
      </div>
    </div>
  );
}
