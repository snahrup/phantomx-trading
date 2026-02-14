'use client';

import { useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTradingStore } from '@/store/trading-store';
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

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  session_start: { icon: '🚀', color: 'var(--cl-accent)', label: 'Session Start' },
  session_end:   { icon: '🏁', color: 'var(--cl-text-secondary)', label: 'Session End' },
  scan:          { icon: '🔍', color: 'var(--cl-info)', label: 'Scan' },
  analysis:      { icon: '🧠', color: 'var(--cl-accent)', label: 'Analysis' },
  decision:      { icon: '⚖️', color: 'var(--cl-warning)', label: 'Decision' },
  trade:         { icon: '⚡', color: 'var(--cl-success)', label: 'Trade Executed' },
  close:         { icon: '💰', color: 'var(--cl-success)', label: 'Position Closed' },
  skip:          { icon: '⏭️', color: 'var(--cl-text-secondary)', label: 'Skipped' },
  kill:          { icon: '🛑', color: 'var(--cl-error)', label: 'Kill Switch' },
  summary:       { icon: '📋', color: 'var(--cl-accent)', label: 'Day Summary' },
};

// --- Journal Entry Card ---

function JournalEntryCard({ entry, isExpanded, onToggle }: {
  entry: JournalEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const meta = TYPE_META[entry.type] ?? { icon: '📌', color: 'var(--cl-text-faint)', label: entry.type };
  const hasPnl = entry.pnl !== undefined && entry.pnl !== 0;
  const pnlPositive = (entry.pnl ?? 0) >= 0;

  return (
    <div className="relative">
      {/* Timeline connector */}
      <div className="absolute left-[15px] top-0 bottom-0 w-px bg-[var(--cl-border-subtle)]" />

      <button
        onClick={onToggle}
        className="relative w-full text-left pl-10 pr-3 py-2 hover:bg-[var(--cl-fill-hover)] transition-colors rounded-r-lg"
      >
        {/* Timeline dot */}
        <div
          className="absolute left-[10px] top-[12px] w-[11px] h-[11px] rounded-full border-2 z-10"
          style={{ borderColor: meta.color, backgroundColor: isExpanded ? meta.color : 'var(--cl-bg-surface)' }}
        />

        {/* Header row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px]">{meta.icon}</span>
          <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
          {entry.symbol && (
            <span className="text-[10px] font-mono text-[var(--cl-text-faint)] bg-[var(--cl-fill-control)] px-1 rounded">
              {entry.symbol.replace('/USDT:USDT', '')}
            </span>
          )}
          {entry.action && entry.action !== 'hold' && (
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
              entry.action === 'buy' ? 'bg-[rgba(0,210,106,0.15)] text-[var(--cl-success)]' :
              entry.action === 'sell' || entry.action === 'close' ? 'bg-[rgba(220,53,69,0.15)] text-[var(--cl-error)]' :
              'bg-[var(--cl-fill-control)] text-[var(--cl-text-faint)]'
            }`}>
              {entry.action}
            </span>
          )}
          {entry.confidence !== undefined && entry.confidence > 0 && (
            <span className={`text-[9px] font-mono ${
              entry.confidence >= 70 ? 'text-[var(--cl-success)]' :
              entry.confidence >= 40 ? 'text-[var(--cl-warning)]' :
              'text-[var(--cl-error)]'
            }`}>
              {entry.confidence}%
            </span>
          )}
          {hasPnl && (
            <span className={`text-[10px] font-semibold font-mono ml-auto ${pnlPositive ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
              {pnlPositive ? '+' : ''}${formatUsd(entry.pnl!)}
            </span>
          )}
          <span className="text-[9px] text-[var(--cl-text-secondary)] ml-auto font-mono">{formatTime(entry.timestamp)}</span>
        </div>

        {/* Compact reason (always shown) */}
        <p className="text-[11px] text-[var(--cl-text-faint)] mt-0.5 line-clamp-1">{entry.reason}</p>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="pl-10 pr-3 pb-3 space-y-2">
          {/* Full reasoning */}
          <div className="glass-card p-2 text-[11px] text-[var(--cl-text-faint)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-[var(--cl-text-primary)]">{children}</strong>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>,
                li: ({ children }) => <li>{children}</li>,
                code: ({ children }) => <code className="bg-[var(--cl-fill-control)] text-[var(--cl-accent)] px-1 rounded text-[10px] font-mono">{children}</code>,
              }}
            >
              {entry.reason}
            </ReactMarkdown>
          </div>

          {/* Chart snapshot */}
          {entry.chartSnapshotPath && (
            <div className="rounded-lg overflow-hidden border border-[var(--cl-border-subtle)]">
              <img
                src={entry.chartSnapshotPath}
                alt={`Chart at ${formatTime(entry.timestamp)}`}
                className="w-full max-h-40 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Portfolio state bar */}
          <div className="flex items-center gap-3 text-[10px] font-mono bg-[var(--cl-fill-control)] rounded-md px-2.5 py-1.5">
            <div>
              <span className="text-[var(--cl-text-secondary)]">Equity </span>
              <span className="text-[var(--cl-text-primary)] font-semibold">${formatUsd(entry.portfolioState.equity)}</span>
            </div>
            <div>
              <span className="text-[var(--cl-text-secondary)]">Cash </span>
              <span className="text-[var(--cl-text-faint)]">{entry.portfolioState.cashPercent.toFixed(0)}%</span>
            </div>
            <div>
              <span className="text-[var(--cl-text-secondary)]">Pos </span>
              <span className="text-[var(--cl-text-faint)]">{entry.portfolioState.positionCount}</span>
            </div>
            <div className={entry.portfolioState.dailyPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
              <span className="text-[var(--cl-text-secondary)]">Day </span>
              {entry.portfolioState.dailyPnl >= 0 ? '+' : ''}${formatUsd(entry.portfolioState.dailyPnl)}
              <span className="text-[9px] ml-0.5">({entry.portfolioState.dailyPnlPercent >= 0 ? '+' : ''}{entry.portfolioState.dailyPnlPercent.toFixed(1)}%)</span>
            </div>
          </div>

          {/* Indicators */}
          {entry.indicators && Object.keys(entry.indicators).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(entry.indicators).map(([key, val]) => (
                <span key={key} className="text-[9px] font-mono bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)] rounded px-1.5 py-0.5">
                  <span className="text-[var(--cl-text-secondary)]">{key}</span>{' '}
                  <span className="text-[var(--cl-text-faint)]">{val}</span>
                </span>
              ))}
            </div>
          )}

          {/* Price at event */}
          {entry.price !== undefined && (
            <div className="text-[10px] font-mono text-[var(--cl-text-secondary)]">
              Price: <span className="text-[var(--cl-text-faint)]">${entry.price}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Day Summary Section ---

function DaySummary({ summary }: { summary: string }) {
  return (
    <div className="glass-card p-3 mx-3 mb-3 border-l-2 border-l-[var(--cl-accent)]">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px]">📋</span>
        <span className="text-[11px] font-semibold text-[var(--cl-accent)]">Day Summary</span>
      </div>
      <div className="text-[12px] text-[var(--cl-text-faint)] cl-serif">
        <ReactMarkdown remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
            strong: ({ children }) => <strong className="font-semibold text-[var(--cl-text-primary)]">{children}</strong>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
            li: ({ children }) => <li>{children}</li>,
            h2: ({ children }) => <h2 className="text-sm font-bold text-[var(--cl-text-primary)] mb-1 mt-3 first:mt-0">{children}</h2>,
            h3: ({ children }) => <h3 className="text-[12px] font-semibold text-[var(--cl-text-faint)] mb-1 mt-2 first:mt-0">{children}</h3>,
            blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--cl-accent-border)] pl-2 my-1.5 text-[var(--cl-text-secondary)] italic">{children}</blockquote>,
            code: ({ children }) => <code className="bg-[var(--cl-fill-control)] text-[var(--cl-accent)] px-1 rounded text-[11px] font-mono">{children}</code>,
          }}
        >
          {summary}
        </ReactMarkdown>
      </div>
    </div>
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
    <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-mono border-b border-[var(--cl-border-subtle)] bg-[var(--cl-fill-control)]">
      <div>
        <span className="text-[var(--cl-text-secondary)]">Trades </span>
        <span className="text-[var(--cl-text-faint)] font-semibold">{stats.trades}</span>
      </div>
      <div>
        <span className="text-[var(--cl-text-secondary)]">W/L </span>
        <span className="text-[var(--cl-success)]">{stats.wins}</span>
        <span className="text-[var(--cl-text-secondary)]">/</span>
        <span className="text-[var(--cl-error)]">{stats.losses}</span>
      </div>
      <div className={stats.totalPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
        <span className="text-[var(--cl-text-secondary)]">P&L </span>
        <span className="font-semibold">{stats.totalPnl >= 0 ? '+' : ''}${formatUsd(stats.totalPnl)}</span>
      </div>
      <div className={stats.returnPct >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}>
        <span className="font-semibold">{stats.returnPct >= 0 ? '+' : ''}{stats.returnPct.toFixed(2)}%</span>
      </div>
      <div className="ml-auto text-[var(--cl-text-secondary)]">
        {entries.length} events
      </div>
    </div>
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
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--cl-fill-control)] text-[var(--cl-text-faint)] font-mono">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {todayEntries.length > 0 && (
            <>
              <button
                onClick={handleGenerateSummary}
                disabled={generatingSummary}
                className="px-2 py-1 rounded text-[9px] font-medium bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)] hover:bg-[var(--cl-fill-accent)] transition-colors disabled:opacity-50"
              >
                {generatingSummary ? 'Generating...' : 'Day Summary'}
              </button>
              <button
                onClick={clearJournalEntries}
                className="px-2 py-1 rounded text-[9px] text-[var(--cl-text-secondary)] hover:text-[var(--cl-error)] transition-colors"
                title="Clear journal"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar entries={todayEntries} />

      {/* Filters */}
      {todayEntries.length > 0 && (
        <div className="flex gap-1 px-3 py-1.5 border-b border-[var(--cl-border-subtle)]">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                filter === opt.key
                  ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                  : 'text-[var(--cl-text-secondary)] border border-transparent hover:text-[var(--cl-text-faint)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Day summary */}
      {journalDaySummary && <DaySummary summary={journalDaySummary} />}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50 px-6">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--cl-accent)" strokeWidth="1.5" className="mb-3 opacity-30">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p className="text-sm text-[var(--cl-text-faint)]">No journal entries yet</p>
            <p className="text-xs text-[var(--cl-text-secondary)] mt-1">Start the Autopilot to record decisions</p>
          </div>
        ) : (
          <div className="py-2">
            {filteredEntries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                isExpanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
