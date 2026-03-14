// src/components/mission-control/TokenSelector.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface PhemexSymbol {
  symbol: string;
  maxLeverage: number;
  price: number;
}

interface TokenSelectorProps {
  selected: string[];
  onChange: (pairs: string[]) => void;
  onFilterChange: (filter: string | null) => void;
  activeFilter: string | null;
}

const QUICK_FILTERS = [
  { id: '50x', label: 'All 50x Leverage', color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
  { id: 'top10', label: 'Top 10 Volume', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { id: 'all', label: 'All Perps', color: 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10' },
  { id: 'trending', label: 'Trending', color: 'text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10' },
];

export default function TokenSelector({ selected, onChange, onFilterChange, activeFilter }: TokenSelectorProps) {
  const [search, setSearch] = useState('');
  const [symbols, setSymbols] = useState<PhemexSymbol[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'symbols' }),
        });
        const data = await res.json();
        if (data.symbols) {
          setSymbols(data.symbols.map((s: any) => ({
            symbol: s.id || s.symbol,
            maxLeverage: s.limits?.leverage?.max ?? 50,
            price: s.last ?? 0,
          })));
        }
      } catch {
        // Silently fail — symbols are optional enhancement
      }
    };
    fetchSymbols();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return symbols.slice(0, 20);
    const q = search.toUpperCase();
    return symbols.filter(s => s.symbol.toUpperCase().includes(q)).slice(0, 20);
  }, [search, symbols]);

  const handleQuickFilter = useCallback((filterId: string) => {
    if (activeFilter === filterId) {
      onFilterChange(null);
      onChange([]);
      return;
    }
    onFilterChange(filterId);
    let pairs: string[];
    switch (filterId) {
      case '50x':
        pairs = symbols.filter(s => s.maxLeverage >= 50).map(s => s.symbol);
        break;
      case 'top10':
        pairs = symbols.slice(0, 10).map(s => s.symbol);
        break;
      case 'all':
        pairs = symbols.map(s => s.symbol);
        break;
      case 'trending':
        pairs = symbols.slice(0, 15).map(s => s.symbol);
        break;
      default:
        pairs = [];
    }
    onChange(pairs);
  }, [activeFilter, symbols, onChange, onFilterChange]);

  const addPair = useCallback((symbol: string) => {
    if (!selected.includes(symbol)) {
      onChange([...selected, symbol]);
    }
    setSearch('');
    setDropdownOpen(false);
  }, [selected, onChange]);

  const removePair = useCallback((symbol: string) => {
    onChange(selected.filter(s => s !== symbol));
    onFilterChange(null);
  }, [selected, onChange, onFilterChange]);

  const displayName = (symbol: string) => symbol.replace('/USDT:USDT', '').replace('/USDT', '');

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase text-muted-foreground tracking-wider">Scan Pairs</label>

      {/* Quick filters */}
      <div className="flex gap-1.5 flex-wrap">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => handleQuickFilter(f.id)}
            className={`px-2 py-1 rounded text-xs border cursor-pointer transition-colors ${
              activeFilter === f.id ? f.color : 'text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search tokens..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
            onFocus={() => setDropdownOpen(true)}
            className="pl-8 text-sm"
          />
        </div>

        {/* Dropdown */}
        {dropdownOpen && search.trim() && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-auto">
            {filtered.map(s => (
              <button
                key={s.symbol}
                onClick={() => addPair(s.symbol)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted cursor-pointer border-b border-border last:border-0"
              >
                <span className="text-foreground font-medium">{displayName(s.symbol)}</span>
                <span className="flex items-center gap-2">
                  <span className={`text-xs ${s.maxLeverage >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {s.maxLeverage}x
                  </span>
                  <span className="text-xs text-muted-foreground">${s.price.toFixed(s.price < 1 ? 6 : 2)}</span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
            )}
          </div>
        )}
      </div>

      {/* Selected tags */}
      <div className="flex gap-1.5 flex-wrap">
        {(activeFilter && selected.length > 5
          ? selected.slice(0, 4)
          : selected
        ).map(symbol => (
          <Badge
            key={symbol}
            variant="outline"
            className="rounded-full px-2 py-0.5 text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30 cursor-pointer"
          >
            {displayName(symbol)}
            <X className="w-3 h-3 ml-1 hover:text-foreground" onClick={() => removePair(symbol)} />
          </Badge>
        ))}
        {activeFilter && selected.length > 5 && (
          <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs text-fuchsia-400 border-fuchsia-500/30 italic">
            + {selected.length - 4} more ({QUICK_FILTERS.find(f => f.id === activeFilter)?.label})
          </Badge>
        )}
      </div>
    </div>
  );
}
