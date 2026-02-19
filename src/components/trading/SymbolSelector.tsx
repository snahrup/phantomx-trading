'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, ChevronDown, Star, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">{displaySymbol(selectedSymbol)}</span>
          <Badge variant="secondary" className="text-[9px] px-1 py-0">PERP</Badge>
          <ChevronDown className="size-2.5 text-muted-foreground" />
        </button>

        {showDropdown && (
          <div
            className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-xl z-50 overflow-hidden shadow-lg"
          >
            {/* Search input */}
            <div className="p-2 pb-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search futures symbols..."
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                />
              </div>
            </div>

            {/* Tabs: Popular / All */}
            <div className="flex gap-1 px-2 pt-2">
              <button
                onClick={() => setTab('popular')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  tab === 'popular'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                Popular
              </button>
              <button
                onClick={() => { setTab('all'); if (!fetched && isConnected) fetchSymbols(); }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  tab === 'all'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                All Futures {symbolCount !== null && <span className="ml-1 opacity-60">({symbolCount})</span>}
              </button>
              {loading && (
                <div className="flex items-center gap-1 ml-auto text-[10px] text-muted-foreground">
                  <Loader2 className="size-2.5 animate-spin text-primary" />
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
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <span className="font-medium">{displaySymbol(s)}</span>
                      <Badge variant="secondary" className="text-[10px] opacity-60 px-1 py-0">PERP</Badge>
                    </button>
                    {showStar && (
                      <button
                        onClick={(e) => { e.stopPropagation(); inWatchlist ? removeFromWatchlist(s) : addToWatchlist(s); }}
                        className={`p-1 rounded transition-colors ${
                          inWatchlist
                            ? 'text-yellow-500 hover:text-yellow-500'
                            : 'text-muted-foreground opacity-40 hover:opacity-80 hover:text-yellow-500'
                        }`}
                        title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                      >
                        <Star className="size-3" fill={inWatchlist ? 'currentColor' : 'none'} />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* No results in popular — prompt to search all */}
              {showAllHint && (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground mb-2">
                    Not found in popular symbols
                  </p>
                  <button
                    onClick={() => setTab('all')}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Search all {symbolCount ?? ''} futures symbols
                  </button>
                </div>
              )}

              {/* No results at all */}
              {filteredSymbols.length === 0 && !showAllHint && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {loading ? 'Loading symbols...' : 'No symbols found'}
                </div>
              )}
            </div>

            {/* Footer */}
            {!isConnected && (
              <div className="px-3 py-2 border-t border-border bg-yellow-500/5">
                <p className="text-[10px] text-yellow-500">
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
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            {displaySymbol(s)}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Timeframe Selector */}
      <div className="flex gap-0.5 bg-card border border-border rounded-lg p-0.5">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
              selectedTimeframe === tf
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}
