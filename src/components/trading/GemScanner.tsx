'use client';

import { useState, useCallback } from 'react';
import { useTradingStore } from '@/store/trading-store';

interface ScanResult {
  symbol: string;
  price: number;
  change24h: number;
  volumeUsdApprox: number;
  maxLeverage: number | null;
  distFromATL: number;
  distFromATH: number;
  smaSignal: string;
  volumeTrend: number;
}

interface ScanResponse {
  results: ScanResult[];
  aiAnalysis: string;
  aiThinking?: string;
  scanned: number;
  filtered: number;
  timestamp: number;
  error?: string;
  message?: string;
}

export default function GemScanner() {
  const { isConnected, setSymbol, setSidePanel } = useTradingStore();
  const [scanning, setScanning] = useState(false);
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const [progress, setProgress] = useState('');

  const runScan = useCallback(async () => {
    if (!isConnected) return;
    setScanning(true);
    setError(null);
    setScanData(null);
    setProgress('Loading all Phemex futures markets...');

    try {
      const progressSteps = [
        'Fetching ticker data for all pairs...',
        'Filtering by price, volume, leverage...',
        'Pulling 30-day OHLCV for candidates...',
        'Computing SMA crossovers & volume trends...',
        'AI analyzing top candidates...',
      ];
      let step = 0;
      const progressInterval = setInterval(() => {
        if (step < progressSteps.length) {
          setProgress(progressSteps[step]!);
          step++;
        }
      }, 3000);

      const res = await fetch('/api/scanner', { method: 'POST' });
      clearInterval(progressInterval);

      if (!res.ok) {
        throw new Error(`Scanner returned ${res.status}`);
      }
      const data: ScanResponse = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setScanData(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed — check connection and try again');
    } finally {
      setScanning(false);
      setProgress('');
    }
  }, [isConnected]);

  const handleSelectToken = (symbol: string) => {
    setSymbol(symbol);
    setSidePanel('ai');
  };

  const smaColor = (signal: string) => {
    if (signal === 'bullish_cross') return 'text-[var(--cl-success)]';
    if (signal === 'bearish') return 'text-[var(--cl-error)]';
    return 'text-[var(--cl-text-faint)]';
  };

  const smaLabel = (signal: string) => {
    if (signal === 'bullish_cross') return 'BULLISH';
    if (signal === 'bearish') return 'BEARISH';
    if (signal === 'neutral') return 'FLAT';
    return '—';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Scan Button */}
      <button
        onClick={runScan}
        disabled={!isConnected || scanning}
        className={`w-full py-3.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
          scanning
            ? 'bg-[var(--cl-accent-soft)] border border-[var(--cl-accent-border)] text-[var(--cl-accent)] cursor-wait'
            : isConnected
              ? 'bg-[var(--cl-accent)] text-white hover:bg-[var(--cl-accent-hover)] shadow-lg shadow-[var(--cl-accent-border)]'
              : 'bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)] text-[var(--cl-text-secondary)] cursor-not-allowed'
        }`}
      >
        {scanning ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Scanning...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            Deep Scan — Find Gems
          </>
        )}
      </button>

      {/* Progress */}
      {scanning && progress && (
        <div className="glass-card p-3">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-accent)] animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-accent)] animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-accent)] animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <span className="text-[11px] text-[var(--cl-text-faint)]">{progress}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass-card p-3 border border-[var(--cl-error-border)]">
          <span className="text-xs text-[var(--cl-error)]">{error}</span>
        </div>
      )}

      {/* Results */}
      {scanData && (
        <div className="space-y-3">
          {/* Stats Bar */}
          <div className="flex items-center justify-between text-[10px] text-[var(--cl-text-secondary)] px-1">
            <span>{scanData.scanned} markets scanned</span>
            <span>{scanData.filtered} matched filters</span>
            <span>{new Date(scanData.timestamp).toLocaleTimeString()}</span>
          </div>

          {/* AI Analysis */}
          {scanData.aiAnalysis && (
            <div className="glass-card p-3 border border-[var(--cl-accent-border)]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-[var(--cl-accent)] flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-[var(--cl-accent)]">AI Top Picks</span>
                </div>
                {scanData.aiThinking && (
                  <button
                    onClick={() => setShowThinking(!showThinking)}
                    className="text-[10px] text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]"
                  >
                    {showThinking ? 'Hide' : 'Show'} reasoning
                  </button>
                )}
              </div>

              {/* Thinking (collapsible) */}
              {showThinking && scanData.aiThinking && (
                <div className="mb-3 p-2 rounded bg-[var(--cl-fill-accent-subtle)] border border-[var(--cl-accent-border)] max-h-40 overflow-y-auto">
                  <pre className="text-[10px] text-[var(--cl-text-faint)] whitespace-pre-wrap font-mono">{scanData.aiThinking}</pre>
                </div>
              )}

              {/* AI Analysis text */}
              <div className="text-xs text-[var(--cl-text-primary)] leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto ai-analysis-text">
                {scanData.aiAnalysis}
              </div>
            </div>
          )}

          {/* Token Cards */}
          <div className="space-y-2">
            <span className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider px-1">All Candidates</span>
            {scanData.results.map((token) => (
              <button
                key={token.symbol}
                onClick={() => handleSelectToken(token.symbol)}
                className="w-full glass-card p-3 hover:border-[var(--cl-accent-border)] transition-colors text-left group"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-[var(--cl-text-primary)] group-hover:text-[var(--cl-accent)] transition-colors">
                    {token.symbol.replace('/USDT:USDT', '')}
                  </span>
                  <span className={`text-[10px] font-mono ${token.change24h >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                    {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span className="text-[var(--cl-text-secondary)] block">Price</span>
                    <span className="text-[var(--cl-text-faint)] font-mono">${token.price.toFixed(6)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--cl-text-secondary)] block">Leverage</span>
                    <span className="text-[var(--cl-warning)] font-mono">{token.maxLeverage ?? '—'}x</span>
                  </div>
                  <div>
                    <span className="text-[var(--cl-text-secondary)] block">SMA</span>
                    <span className={`font-mono ${smaColor(token.smaSignal)}`}>{smaLabel(token.smaSignal)}</span>
                  </div>
                  <div>
                    <span className="text-[var(--cl-text-secondary)] block">From ATL</span>
                    <span className="text-[var(--cl-text-faint)] font-mono">+{token.distFromATL.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-[var(--cl-text-secondary)] block">From ATH</span>
                    <span className="text-[var(--cl-error)] font-mono">-{token.distFromATH.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-[var(--cl-text-secondary)] block">Vol 24h</span>
                    <span className="text-[var(--cl-text-faint)] font-mono">
                      ${token.volumeUsdApprox >= 1000000
                        ? (token.volumeUsdApprox / 1000000).toFixed(1) + 'M'
                        : token.volumeUsdApprox >= 1000
                          ? (token.volumeUsdApprox / 1000).toFixed(0) + 'K'
                          : token.volumeUsdApprox.toFixed(0)}
                    </span>
                  </div>
                </div>
                {token.volumeTrend !== 0 && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <span className="text-[9px] text-[var(--cl-text-secondary)]">Vol trend (3d):</span>
                    <span className={`text-[9px] font-mono ${token.volumeTrend > 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                      {token.volumeTrend > 0 ? '+' : ''}{token.volumeTrend.toFixed(0)}%
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!scanning && !scanData && !error && (
        <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M8 11h6" />
            <path d="M11 8v6" />
          </svg>
          <p className="text-xs text-[var(--cl-text-secondary)] mt-3">Scan Phemex futures for gems</p>
          <p className="text-[10px] text-[var(--cl-text-secondary)]">Low price, high leverage, near ATL</p>
        </div>
      )}
    </div>
  );
}
