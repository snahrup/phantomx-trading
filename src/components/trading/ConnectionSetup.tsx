'use client';

import { useState, useEffect } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { formatPrice, formatUsd } from '@/lib/format';

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
  };

  const handleRetry = () => {
    setStep('configure');
    setError('');
    setStatusMsg('');
    setVerifyResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cl-bg-page)]">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--cl-bg-page)] via-[var(--cl-bg-sidebar)] to-[var(--cl-bg-page)]" />
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'linear-gradient(var(--cl-fill-control) 1px, transparent 1px), linear-gradient(90deg, var(--cl-fill-control) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div className="relative z-10 w-[480px] glass-card p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[var(--cl-accent)] flex items-center justify-center shadow-lg shadow-[var(--cl-accent-border)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--cl-text-primary)]">PhantomX</h1>
            <p className="text-xs text-[var(--cl-text-secondary)]">AI-Powered Phemex Trading</p>
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
                {i > 0 && <div className={`w-8 h-px ${isDone ? 'bg-[var(--cl-success)]' : 'bg-[var(--cl-border)]'}`} />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  isActive ? 'bg-[var(--cl-fill-accent)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                  : isDone ? 'bg-[var(--cl-fill-success)] text-[var(--cl-success)] border border-[var(--cl-success-border)]'
                  : 'bg-[var(--cl-fill-control)] text-[var(--cl-text-secondary)] border border-[var(--cl-border)]'
                }`}>
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
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
          <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-[var(--cl-fill-info-subtle)] border border-[var(--cl-info-border)]">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-info)] animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-info)] animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--cl-info)] animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            <span className="text-xs text-[var(--cl-info)]">{statusMsg}</span>
          </div>
        )}

        {/* Error display */}
        {step === 'error' && error && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--cl-fill-error)] border border-[var(--cl-error-border)]">
            <div className="flex items-start gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cl-error)" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <p className="text-xs font-medium text-[var(--cl-error)] mb-1">Connection Failed</p>
                <p className="text-[11px] text-[var(--cl-text-secondary)]">{error}</p>
              </div>
            </div>
            <button
              onClick={handleRetry}
              className="mt-3 w-full py-2 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-xs font-medium text-[var(--cl-text-primary)] hover:bg-[var(--cl-fill-hover)] transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* STEP: Configure */}
        {(step === 'configure' || step === 'detect') && (
          <div className="space-y-4">
            {envInfo?.hasEnv && (
              <div className="p-3 rounded-lg bg-[var(--cl-fill-success-subtle)] border border-[var(--cl-success-border)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[var(--cl-success)]">Saved Credentials Detected</span>
                  <span className="text-[10px] font-mono text-[var(--cl-text-secondary)] bg-[var(--cl-fill-control)] px-2 py-0.5 rounded">{envInfo.envNetwork ?? 'configured'}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUseEnv(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                      useEnv
                        ? 'bg-[var(--cl-fill-success)] border-[var(--cl-success-border)] text-[var(--cl-success)]'
                        : 'bg-[var(--cl-fill-control)] border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)]'
                    }`}
                  >
                    Use Saved Keys
                  </button>
                  <button
                    onClick={() => setUseEnv(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                      !useEnv
                        ? 'bg-[var(--cl-fill-accent)] border-[var(--cl-accent-border)] text-[var(--cl-accent)]'
                        : 'bg-[var(--cl-fill-control)] border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)]'
                    }`}
                  >
                    Enter Manually
                  </button>
                </div>
              </div>
            )}

            {(!envInfo?.hasEnv || !useEnv) && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[var(--cl-text-faint)] mb-1">API Key</label>
                  <input
                    type="text"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Your Phemex API Key"
                    className="w-full bg-[var(--cl-fill-control)] border border-[var(--cl-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--cl-text-primary)] placeholder-[var(--cl-text-secondary)] focus:outline-none focus:border-[var(--cl-accent-border-focus)] focus:ring-2 focus:ring-[var(--cl-accent-focus-ring)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--cl-text-faint)] mb-1">API Secret</label>
                  <input
                    type="password"
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="Your Phemex API Secret"
                    className="w-full bg-[var(--cl-fill-control)] border border-[var(--cl-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--cl-text-primary)] placeholder-[var(--cl-text-secondary)] focus:outline-none focus:border-[var(--cl-accent-border-focus)] focus:ring-2 focus:ring-[var(--cl-accent-focus-ring)]"
                  />
                </div>
              </div>
            )}

            {/* Network selection */}
            <div>
              <label className="block text-xs text-[var(--cl-text-faint)] mb-2">Network</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setTestnet(false)}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all border ${
                    !testnet
                      ? 'bg-[var(--cl-fill-error)] border-[var(--cl-error-border)] text-[var(--cl-error)] shadow-sm'
                      : 'bg-[var(--cl-fill-control)] border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)]'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-semibold">Mainnet</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Real funds</div>
                  </div>
                </button>
                <button
                  onClick={() => setTestnet(true)}
                  className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all border ${
                    testnet
                      ? 'bg-[var(--cl-fill-success)] border-[var(--cl-success-border)] text-[var(--cl-success)] shadow-sm'
                      : 'bg-[var(--cl-fill-control)] border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)]'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-semibold">Testnet</div>
                    <div className="text-[10px] mt-0.5 opacity-70">Paper trading</div>
                  </div>
                </button>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={!useEnv && (!apiKey || !apiSecret)}
              className="w-full py-3 rounded-lg bg-[var(--cl-accent)] text-white font-medium hover:bg-[var(--cl-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Connect to Phemex {testnet ? '(Testnet)' : '(Mainnet)'}
            </button>

            <p className="text-[10px] text-[var(--cl-text-secondary)] text-center">
              {useEnv && envInfo?.hasEnv
                ? 'Using credentials from .env.local — never exposed to the browser.'
                : 'Your API keys are stored locally and never sent to third parties.'}
            </p>
          </div>
        )}

        {/* STEP: Connecting / Verifying */}
        {(step === 'connecting' || step === 'verifying') && (
          <div className="py-8 flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-[var(--cl-border)]" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--cl-accent)] animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--cl-text-primary)]">
                {step === 'connecting' ? 'Connecting...' : 'Verifying credentials...'}
              </p>
              <p className="text-xs text-[var(--cl-text-secondary)] mt-1">
                {step === 'connecting' ? 'Initializing exchange client' : 'Fetching account data from Phemex'}
              </p>
            </div>
          </div>
        )}

        {/* STEP: Preview */}
        {step === 'preview' && verifyResult && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--cl-fill-success)] border border-[var(--cl-success-border)] flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cl-success)" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="text-xs font-medium text-[var(--cl-success)]">
                Connected to Phemex {verifyResult.network === 'testnet' ? 'Testnet' : 'Mainnet'}
              </span>
            </div>

            <div className="p-4 rounded-lg bg-[var(--cl-bg-surface)] border border-[var(--cl-border)]">
              <h3 className="text-[10px] text-[var(--cl-text-secondary)] uppercase tracking-wider mb-3">Account Summary</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] text-[var(--cl-text-secondary)]">Balance</div>
                  <div className="text-lg font-mono font-semibold text-[var(--cl-text-primary)]">
                    ${formatUsd(verifyResult.account?.totalUsdValue ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--cl-text-secondary)]">Positions</div>
                  <div className="text-lg font-mono font-semibold text-[var(--cl-text-primary)]">
                    {verifyResult.positionCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--cl-text-secondary)]">BTC Price</div>
                  <div className="text-lg font-mono font-semibold text-[var(--cl-text-primary)]">
                    {verifyResult.ticker?.last ? formatPrice(verifyResult.ticker.last) : '—'}
                  </div>
                </div>
              </div>

              {verifyResult.account?.balances && verifyResult.account.balances.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--cl-border)]">
                  <div className="text-[10px] text-[var(--cl-text-secondary)] mb-1.5">Holdings</div>
                  <div className="space-y-1">
                    {verifyResult.account.balances.slice(0, 5).map(b => (
                      <div key={b.currency} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--cl-text-primary)]">{b.currency}</span>
                        <span className="font-mono text-[var(--cl-text-faint)]">{b.total.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {verifyResult.positions && verifyResult.positions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--cl-border)]">
                  <div className="text-[10px] text-[var(--cl-text-secondary)] mb-1.5">Open Positions</div>
                  <div className="space-y-1">
                    {verifyResult.positions.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--cl-text-primary)]">{p.symbol}</span>
                        <span className={`font-mono ${p.side === 'long' ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                          {p.side.toUpperCase()} {p.size}
                        </span>
                        <span className={`font-mono ${p.unrealizedPnl >= 0 ? 'text-[var(--cl-success)]' : 'text-[var(--cl-error)]'}`}>
                          {p.unrealizedPnl >= 0 ? '+' : ''}${formatUsd(p.unrealizedPnl)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleAccept}
              className="w-full py-3 rounded-lg bg-[var(--cl-success)] text-white font-medium hover:bg-[var(--cl-success-hover)] transition-colors"
            >
              Start Trading
            </button>

            <button
              onClick={handleRetry}
              className="w-full py-2 text-xs text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)] transition-colors"
            >
              Back to settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
