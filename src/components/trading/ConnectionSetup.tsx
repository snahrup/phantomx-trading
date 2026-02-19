'use client';

import { useState, useEffect } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Zap, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { FadeIn, PulseIndicator } from '@/components/motion';

type ConnectionStep = 'detect' | 'configure' | 'connecting' | 'verifying' | 'preview' | 'error';

interface EnvInfo {
  hasEnv: boolean;
  maskedKey?: string;
  envNetwork?: string;
}

interface VerifyResult {
  success: boolean;
  error?: string;
  network?: string;
  account?: { balances: Array<{ currency: string; total: number; free: number }>; totalUsdValue: number };
  positionCount?: number;
  positions?: Array<{ symbol: string; side: string; size: number; unrealizedPnl: number }>;
  ticker?: { symbol: string; last: number; changePercent24h: number };
}

export default function ConnectionSetup() {
  const { isConnected, setConnection, setConnected, setBalances, setAccountValue, setPositions } = useTradingStore();

  const [step, setStep] = useState<ConnectionStep>('detect');
  const [envInfo, setEnvInfo] = useState<EnvInfo | null>(null);
  const [useEnv, setUseEnv] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [testnet, setTestnet] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  // Step 1: Detect env credentials on mount
  useEffect(() => {
    if (isConnected) return;
    (async () => {
      try {
        setStatusMsg('Checking for saved credentials...');
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_env' }),
        });
        const data = await res.json();
        setEnvInfo(data);
        if (data.hasEnv) {
          setTestnet(data.envNetwork === 'testnet');
        }
        setStep('configure');
        setStatusMsg('');
      } catch {
        setEnvInfo({ hasEnv: false });
        setStep('configure');
        setStatusMsg('');
      }
    })();
  }, [isConnected]);

  if (isConnected) return null;

  const handleConnect = async () => {
    setStep('connecting');
    setError('');
    setStatusMsg('Initializing Phemex client...');

    try {
      await new Promise(r => setTimeout(r, 400));
      setStatusMsg('Verifying credentials with Phemex...');
      setStep('verifying');

      const res = await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'connect_and_verify',
          useEnv,
          apiKey: useEnv ? undefined : apiKey,
          secret: useEnv ? undefined : apiSecret,
          testnet,
          marketType: 'swap',
        }),
      });

      const data: VerifyResult = await res.json();

      if (data.success) {
        setStatusMsg('Connection verified! Loading account data...');
        setVerifyResult(data);
        setStep('preview');
      } else {
        setError(data.error ?? 'Connection failed — unknown error');
        setStep('error');
        setStatusMsg('');
      }
    } catch (err) {
      setError(`Network error: ${String(err)}`);
      setStep('error');
      setStatusMsg('');
    }
  };

  const handleAccept = () => {
    if (!verifyResult) return;
    setConnection('', '', testnet);
    setConnected(true);
    if (verifyResult.account) {
      setBalances(verifyResult.account.balances.map(b => ({
        currency: b.currency,
        total: b.total,
        free: b.free,
        used: b.total - b.free,
      })));
      setAccountValue(verifyResult.account.totalUsdValue);
    }
    if (verifyResult.positions) {
      setPositions(verifyResult.positions as Parameters<typeof setPositions>[0]);
    }

    // Auto-start agents on connect so users see them working immediately
    const { watchlist } = useTradingStore.getState();
    fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', watchlist }),
    }).catch(() => { /* non-critical */ });
  };

  const handleRetry = () => {
    setStep('configure');
    setError('');
    setStatusMsg('');
    setVerifyResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-sidebar to-background" />
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(hsl(var(--muted)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--muted)) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative z-10 w-[480px] glass-card p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">PhantomX</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Phemex Trading</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {['Configure', 'Verify', 'Preview'].map((label, i) => {
            const stepIdx = step === 'detect' ? -1 : step === 'configure' ? 0 : step === 'connecting' || step === 'verifying' ? 1 : step === 'error' ? 1 : 2;
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-px ${isDone ? 'bg-claude-green' : 'bg-border'}`} />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  isActive ? 'bg-primary/10 text-primary border border-primary/30'
                  : isDone ? 'bg-claude-green/10 text-claude-green border border-claude-green/30'
                  : 'bg-muted text-muted-foreground border border-border'
                }`}>
                  {isDone ? (
                    <CheckCircle className="w-2.5 h-2.5" />
                  ) : (
                    <span className="w-3 text-center">{i + 1}</span>
                  )}
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status message bar */}
        {statusMsg && (
          <FadeIn>
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-blue-400/5 border border-blue-400/30">
              <div className="flex gap-1">
                <PulseIndicator active color="bg-blue-400" size="w-1.5 h-1.5" />
                <PulseIndicator active color="bg-blue-400" size="w-1.5 h-1.5" />
                <PulseIndicator active color="bg-blue-400" size="w-1.5 h-1.5" />
              </div>
              <span className="text-xs text-blue-400">{statusMsg}</span>
            </div>
          </FadeIn>
        )}

        {/* Error display */}
        {step === 'error' && error && (
          <FadeIn>
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-destructive" />
                <div>
                  <p className="text-xs font-medium text-destructive mb-1">Connection Failed</p>
                  <p className="text-[11px] text-muted-foreground">{error}</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleRetry}
                className="mt-3 w-full"
                size="sm"
              >
                Try Again
              </Button>
            </div>
          </FadeIn>
        )}

        {/* STEP: Configure */}
        {(step === 'configure' || step === 'detect') && (
          <FadeIn>
            <div className="space-y-4">
              {envInfo?.hasEnv && (
                <div className="p-3 rounded-lg bg-claude-green/5 border border-claude-green/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-claude-green">Saved Credentials Detected</span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {envInfo.envNetwork ?? 'configured'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setUseEnv(true)}
                      className={`flex-1 text-xs font-medium ${
                        useEnv
                          ? 'bg-claude-green/10 border-claude-green/30 text-claude-green hover:bg-claude-green/15'
                          : 'bg-muted border-border text-muted-foreground hover:bg-accent'
                      }`}
                      size="sm"
                    >
                      Use Saved Keys
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setUseEnv(false)}
                      className={`flex-1 text-xs font-medium ${
                        !useEnv
                          ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15'
                          : 'bg-muted border-border text-muted-foreground hover:bg-accent'
                      }`}
                      size="sm"
                    >
                      Enter Manually
                    </Button>
                  </div>
                </div>
              )}

              {(!envInfo?.hasEnv || !useEnv) && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-foreground mb-1">API Key</Label>
                    <Input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Your Phemex API Key"
                      className="bg-muted"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-foreground mb-1">API Secret</Label>
                    <Input
                      type="password"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="Your Phemex API Secret"
                      className="bg-muted"
                    />
                  </div>
                </div>
              )}

              {/* Network selection */}
              <div>
                <Label className="text-xs text-foreground mb-2">Network</Label>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setTestnet(false)}
                    className={`flex-1 py-3 h-auto text-sm font-medium ${
                      !testnet
                        ? 'bg-destructive/10 border-destructive/30 text-destructive shadow-sm hover:bg-destructive/15'
                        : 'bg-muted border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <div className="text-center">
                      <div className="font-semibold">Mainnet</div>
                      <div className="text-[10px] mt-0.5 opacity-70">Real funds</div>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setTestnet(true)}
                    className={`flex-1 py-3 h-auto text-sm font-medium ${
                      testnet
                        ? 'bg-claude-green/10 border-claude-green/30 text-claude-green shadow-sm hover:bg-claude-green/15'
                        : 'bg-muted border-border text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    <div className="text-center">
                      <div className="font-semibold">Testnet</div>
                      <div className="text-[10px] mt-0.5 opacity-70">Paper trading</div>
                    </div>
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleConnect}
                disabled={!useEnv && (!apiKey || !apiSecret)}
                className="w-full py-3 h-auto rounded-lg"
              >
                Connect to Phemex {testnet ? '(Testnet)' : '(Mainnet)'}
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                {useEnv && envInfo?.hasEnv
                  ? 'Using credentials from .env.local — never exposed to the browser.'
                  : 'Your API keys are stored locally and never sent to third parties.'}
              </p>
            </div>
          </FadeIn>
        )}

        {/* STEP: Connecting / Verifying */}
        {(step === 'connecting' || step === 'verifying') && (
          <FadeIn>
            <div className="py-8 flex flex-col items-center gap-4">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-border" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {step === 'connecting' ? 'Connecting...' : 'Verifying credentials...'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {step === 'connecting' ? 'Initializing exchange client' : 'Fetching account data from Phemex'}
                </p>
              </div>
            </div>
          </FadeIn>
        )}

        {/* STEP: Preview */}
        {step === 'preview' && verifyResult && (
          <FadeIn>
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-claude-green/10 border border-claude-green/30 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-claude-green" />
                <span className="text-xs font-medium text-claude-green">
                  Connected to Phemex {verifyResult.network === 'testnet' ? 'Testnet' : 'Mainnet'}
                </span>
              </div>

              <Card className="border-border py-0">
                <CardContent className="p-4">
                  <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Account Summary</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground">Balance</div>
                      <div className="text-lg font-mono font-semibold text-foreground">
                        ${formatUsd(verifyResult.account?.totalUsdValue ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">Positions</div>
                      <div className="text-lg font-mono font-semibold text-foreground">
                        {verifyResult.positionCount ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground">BTC Price</div>
                      <div className="text-lg font-mono font-semibold text-foreground">
                        {verifyResult.ticker?.last ? formatPrice(verifyResult.ticker.last) : '—'}
                      </div>
                    </div>
                  </div>

                  {verifyResult.account?.balances && verifyResult.account.balances.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-[10px] text-muted-foreground mb-1.5">Holdings</div>
                      <div className="space-y-1">
                        {verifyResult.account.balances.slice(0, 5).map(b => (
                          <div key={b.currency} className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{b.currency}</span>
                            <span className="font-mono text-foreground">{b.total.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {verifyResult.positions && verifyResult.positions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-[10px] text-muted-foreground mb-1.5">Open Positions</div>
                      <div className="space-y-1">
                        {verifyResult.positions.map((p, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{p.symbol}</span>
                            <span className={`font-mono ${p.side === 'long' ? 'text-claude-green' : 'text-destructive'}`}>
                              {p.side.toUpperCase()} {p.size}
                            </span>
                            <span className={`font-mono ${p.unrealizedPnl >= 0 ? 'text-claude-green' : 'text-destructive'}`}>
                              {p.unrealizedPnl >= 0 ? '+' : ''}${formatUsd(p.unrealizedPnl)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                onClick={handleAccept}
                className="w-full py-3 h-auto rounded-lg bg-claude-green text-white hover:bg-claude-green/90"
              >
                Start Trading
              </Button>

              <Button
                variant="ghost"
                onClick={handleRetry}
                className="w-full py-2 h-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Back to settings
              </Button>
            </div>
          </FadeIn>
        )}
      </div>
    </div>
  );
}
