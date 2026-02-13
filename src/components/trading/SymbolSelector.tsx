'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTradingStore } from '@/store/trading-store';

const POPULAR_SYMBOLS = [
  'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'DOGE/USDT:USDT',
  'WIF/USDT:USDT', 'PEPE/USDT:USDT', 'BONK/USDT:USDT', 'FLOKI/USDT:USDT',
  'SHIB/USDT:USDT', 'AVAX/USDT:USDT', 'LINK/USDT:USDT', 'SUI/USDT:USDT',
  'XRP/USDT:USDT', 'ADA/USDT:USDT', 'MATIC/USDT:USDT', 'ARB/USDT:USDT',
  'OP/USDT:USDT', 'NEAR/USDT:USDT', 'FTM/USDT:USDT', 'APT/USDT:USDT',
];

const QUICK_PICKS = [
  'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'DOGE/USDT:USDT',
  'PEPE/USDT:USDT', 'WIF/USDT:USDT', 'BONK/USDT:USDT',
];

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w'];

type SymbolTab = 'popular' | 'all';

export default function SymbolSelector() {
  const {
    selectedSymbol, selectedTimeframe, setSymbol, setTimeframe, isConnected,
    autopilotMode, watchlist, addToWatchlist, removeFromWatchlist,
  } = useTradingStore();
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [tab, setTab] = useState<SymbolTab>('popular');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch all symbols from Phemex when connected
  const fetchSymbols = useCallback(async () => {
    if (fetched || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'symbols' }),
      });
      const data = await res.json();
      if (data.symbols?.length) {
        // Only show USDT pairs — filter out USDC
        setAllSymbols(
          (data.symbols as string[])
            .filter(s => s.includes('/USDT') && !s.includes('USDC'))
            .sort()
        );
        setFetched(true);
      }
    } catch {
      // Silently fail — will use popular list as fallback
    } finally {
      setLoading(false);
    }
  }, [fetched, loading]);

  // Fetch symbols when connected
  useEffect(() => {
    if (isConnected && !fetched) fetchSymbols();
  }, [isConnected, fetched, fetchSymbols]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus search on dropdown open
  useEffect(() => {
    if (showDropdown && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showDropdown]);

  // Keyboard navigation
  useEffect(() => {
    if (!showDropdown) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setSearch('');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showDropdown]);

  const displaySymbol = (s: string) => s.replace('/USDT:USDT', '').replace('/USD:USD', '');

  // Determine which list to show
  const sourceList = tab === 'popular' || !fetched ? POPULAR_SYMBOLS : allSymbols;

  // Filter symbols by search query
  const filteredSymbols = useMemo(() => {
    if (!search) return sourceList;
    const q = search.toLowerCase().replace(/[/: ]/g, '');
    return sourceList.filter(s => {
      const normalized = s.toLowerCase().replace(/[/: ]/g, '');
      const base = displaySymbol(s).toLowerCase();
      return normalized.includes(q) || base.includes(q);
    });
  }, [search, sourceList]);

  // When searching in "popular" tab with no results, auto-switch to "all"
  const showAllHint = tab === 'popular' && search && filteredSymbols.length === 0 && fetched;

  const symbolCount = fetched ? allSymbols.length : null;

  return (
    <div className="flex items-center gap-2">
      {/* Symbol Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => {
            setShowDropdown(!showDropdown);
            if (!showDropdown && !fetched && isConnected) fetchSymbols();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] hover:border-[var(--cl-border-hover)] transition-colors"
        >
          <span className="text-sm font-semibold text-[var(--cl-text-primary)]">{displaySymbol(selectedSymbol)}</span>
          <span className="text-[9px] text-[var(--cl-text-secondary)]">PERP</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--cl-text-secondary)]">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showDropdown && (
          <div
            className="absolute top-full left-0 mt-1 w-72 bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] rounded-xl z-50 overflow-hidden"
            style={{ boxShadow: 'var(--cl-shadow-modal)' }}
          >
            {/* Search input */}
            <div className="p-2 pb-0">
              <div className="relative">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--cl-text-secondary)]">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search futures symbols..."
                  className="w-full bg-[var(--cl-bg-page)] border border-[var(--cl-border)] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[var(--cl-text-primary)] placeholder-[var(--cl-text-secondary)] focus:outline-none focus:border-[var(--cl-accent-border-focus)] focus:ring-1 focus:ring-[var(--cl-accent-focus-ring)]"
                />
              </div>
            </div>

            {/* Tabs: Popular / All */}
            <div className="flex gap-1 px-2 pt-2">
              <button
                onClick={() => setTab('popular')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  tab === 'popular'
                    ? 'bg-[var(--cl-fill-accent)] text-[var(--cl-accent)]'
                    : 'text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)] hover:text-[var(--cl-text-faint)]'
                }`}
              >
                Popular
              </button>
              <button
                onClick={() => { setTab('all'); if (!fetched && isConnected) fetchSymbols(); }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  tab === 'all'
                    ? 'bg-[var(--cl-fill-accent)] text-[var(--cl-accent)]'
                    : 'text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)] hover:text-[var(--cl-text-faint)]'
                }`}
              >
                All Futures {symbolCount !== null && <span className="ml-1 opacity-60">({symbolCount})</span>}
              </button>
              {loading && (
                <div className="flex items-center gap-1 ml-auto text-[10px] text-[var(--cl-text-secondary)]">
                  <div className="w-2.5 h-2.5 border border-[var(--cl-border)] border-t-[var(--cl-accent)] rounded-full animate-spin" />
                  Loading...
                </div>
              )}
            </div>

            {/* Symbol list */}
            <div className="max-h-72 overflow-y-auto mt-1 px-1 pb-1">
              {filteredSymbols.map(s => {
                const inWatchlist = watchlist.includes(s);
                const showStar = autopilotMode === 'portfolio';
                return (
                  <div key={s} className="flex items-center gap-0.5">
                    <button
                      onClick={() => { setSymbol(s); setShowDropdown(false); setSearch(''); }}
                      className={`flex-1 text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                        s === selectedSymbol
                          ? 'bg-[var(--cl-fill-accent)] text-[var(--cl-accent)] font-medium'
                          : 'text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-hover)] hover:text-[var(--cl-text-primary)]'
                      }`}
                    >
                      <span className="font-medium">{displaySymbol(s)}</span>
                      <span className="text-[10px] text-[var(--cl-text-secondary)] opacity-60">PERP</span>
                    </button>
                    {showStar && (
                      <button
                        onClick={(e) => { e.stopPropagation(); inWatchlist ? removeFromWatchlist(s) : addToWatchlist(s); }}
                        className={`p-1 rounded transition-colors ${
                          inWatchlist
                            ? 'text-[var(--cl-warning)] hover:text-[var(--cl-warning)]'
                            : 'text-[var(--cl-text-secondary)] opacity-40 hover:opacity-80 hover:text-[var(--cl-warning)]'
                        }`}
                        title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={inWatchlist ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}

              {/* No results in popular — prompt to search all */}
              {showAllHint && (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-[var(--cl-text-secondary)] mb-2">
                    Not found in popular symbols
                  </p>
                  <button
                    onClick={() => setTab('all')}
                    className="text-xs font-medium text-[var(--cl-accent)] hover:underline"
                  >
                    Search all {symbolCount ?? ''} futures symbols
                  </button>
                </div>
              )}

              {/* No results at all */}
              {filteredSymbols.length === 0 && !showAllHint && (
                <div className="px-3 py-4 text-center text-xs text-[var(--cl-text-secondary)]">
                  {loading ? 'Loading symbols...' : 'No symbols found'}
                </div>
              )}
            </div>

            {/* Footer */}
            {!isConnected && (
              <div className="px-3 py-2 border-t border-[var(--cl-border)] bg-[var(--cl-fill-warning-subtle)]">
                <p className="text-[10px] text-[var(--cl-warning)]">
                  Connect to Phemex to see all available futures symbols
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Pick Symbols */}
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {QUICK_PICKS.map(s => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap transition-colors ${
              s === selectedSymbol
                ? 'bg-[var(--cl-fill-accent)] text-[var(--cl-accent)]'
                : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-hover)]'
            }`}
          >
            {displaySymbol(s)}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-[var(--cl-border)]" />

      {/* Timeframe Selector */}
      <div className="flex gap-0.5 bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] rounded-lg p-0.5">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              selectedTimeframe === tf
                ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)]'
                : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}
