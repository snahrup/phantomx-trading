'use client';

import { useState, useCallback } from 'react';
import { Loader2, Search, Zap } from 'lucide-react';
import { useTradingStore } from '@/store/trading-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FadeIn, PulseIndicator } from '@/components/motion';

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
  const { isConnected, setSymbol } = useTradingStore();
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
  };

  const smaColor = (signal: string) => {
    if (signal === 'bullish_cross') return 'text-claude-green';
    if (signal === 'bearish') return 'text-destructive';
    return 'text-foreground';
  };

  const smaLabel = (signal: string) => {
    if (signal === 'bullish_cross') return 'BULLISH';
    if (signal === 'bearish') return 'BEARISH';
    if (signal === 'neutral') return 'FLAT';
    return '—';
  };

  const smaBadgeVariant = (signal: string): 'default' | 'destructive' | 'secondary' | 'outline' => {
    if (signal === 'bullish_cross') return 'default';
    if (signal === 'bearish') return 'destructive';
    return 'outline';
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Scan Button */}
      <Button
        onClick={runScan}
        disabled={!isConnected || scanning}
        variant={scanning ? 'outline' : isConnected ? 'default' : 'secondary'}
        className={`w-full py-3.5 h-auto text-sm font-medium ${
          scanning
            ? 'border-primary/30 text-primary cursor-wait bg-primary/10'
            : isConnected
              ? 'shadow-lg shadow-primary/20'
              : 'cursor-not-allowed'
        }`}
      >
        {scanning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning...
          </>
        ) : (
          <>
            <Search className="h-4 w-4" />
            Deep Scan — Find Gems
          </>
        )}
      </Button>

      {/* Progress */}
      {scanning && progress && (
        <Card className="py-0 gap-0">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <PulseIndicator active={true} color="bg-primary" size="w-1.5 h-1.5" />
                <PulseIndicator active={true} color="bg-primary" size="w-1.5 h-1.5" />
                <PulseIndicator active={true} color="bg-primary" size="w-1.5 h-1.5" />
              </div>
              <span className="text-[11px] text-foreground">{progress}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="py-0 gap-0 border-destructive/30">
          <CardContent className="p-3">
            <span className="text-xs text-destructive">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {scanData && (
        <FadeIn>
          <div className="space-y-3">
            {/* Stats Bar */}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span>{scanData.scanned} markets scanned</span>
              <span>{scanData.filtered} matched filters</span>
              <span>{new Date(scanData.timestamp).toLocaleTimeString()}</span>
            </div>

            {/* AI Analysis */}
            {scanData.aiAnalysis && (
              <Card className="py-0 gap-0 border-primary/30">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
                        <Zap className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                      <span className="text-xs font-medium text-primary">AI Top Picks</span>
                    </div>
                    {scanData.aiThinking && (
                      <button
                        onClick={() => setShowThinking(!showThinking)}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showThinking ? 'Hide' : 'Show'} reasoning
                      </button>
                    )}
                  </div>

                  {/* Thinking (collapsible) */}
                  {showThinking && scanData.aiThinking && (
                    <div className="mb-3 p-2 rounded bg-primary/5 border border-primary/30 max-h-40 overflow-y-auto">
                      <pre className="text-[10px] text-foreground whitespace-pre-wrap font-mono">{scanData.aiThinking}</pre>
                    </div>
                  )}

                  {/* AI Analysis text */}
                  <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto ai-analysis-text">
                    {scanData.aiAnalysis}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Token Cards */}
            <div className="space-y-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">All Candidates</span>
              {scanData.results.map((token, i) => (
                <FadeIn key={token.symbol} delay={i * 0.05}>
                  <Card
                    className="py-0 gap-0 cursor-pointer hover:border-primary/30 transition-colors group"
                    onClick={() => handleSelectToken(token.symbol)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                          {token.symbol.replace('/USDT:USDT', '')}
                        </span>
                        <Badge
                          variant={token.change24h >= 0 ? 'default' : 'destructive'}
                          className={`text-[10px] font-mono ${
                            token.change24h >= 0
                              ? 'bg-claude-green/15 text-claude-green border-claude-green/30 hover:bg-claude-green/15'
                              : ''
                          }`}
                        >
                          {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}%
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div>
                          <span className="text-muted-foreground block">Price</span>
                          <span className="text-foreground font-mono">${token.price.toFixed(6)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Leverage</span>
                          <span className="text-yellow-500 font-mono">{token.maxLeverage ?? '—'}x</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">SMA</span>
                          <Badge variant={smaBadgeVariant(token.smaSignal)} className="text-[9px] px-1 py-0">
                            {smaLabel(token.smaSignal)}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">From ATL</span>
                          <span className="text-foreground font-mono">+{token.distFromATL.toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">From ATH</span>
                          <span className="text-destructive font-mono">-{token.distFromATH.toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Vol 24h</span>
                          <span className="text-foreground font-mono">
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
                          <span className="text-[9px] text-muted-foreground">Vol trend (3d):</span>
                          <span className={`text-[9px] font-mono ${token.volumeTrend > 0 ? 'text-claude-green' : 'text-destructive'}`}>
                            {token.volumeTrend > 0 ? '+' : ''}{token.volumeTrend.toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </FadeIn>
              ))}
            </div>
          </div>
        </FadeIn>
      )}

      {/* Empty state */}
      {!scanning && !scanData && !error && (
        <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
          <Search className="w-9 h-9 text-muted-foreground" strokeWidth={1} />
          <p className="text-xs text-muted-foreground mt-3">Scan Phemex futures for gems</p>
          <p className="text-[10px] text-muted-foreground">Low price, high leverage, near ATL</p>
        </div>
      )}
    </div>
  );
}
