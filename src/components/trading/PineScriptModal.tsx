'use client';

import { useState } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { generateSMACrossoverStrategy } from '@/lib/strategy/pinescript-generator';

export default function PineScriptModal() {
  const {
    showPineScriptModal, setShowPineScriptModal,
    generatedPineScript, setGeneratedPineScript,
    selectedSymbol, riskParameters, accountValue, ohlcv,
  } = useTradingStore();

  const [thesis, setThesis] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'quick' | 'ai'>('ai');

  if (!showPineScriptModal) return null;

  // Quick Generate: deterministic PineScript from risk params (instant, no AI)
  const quickGenerate = () => {
    const script = generateSMACrossoverStrategy(selectedSymbol, riskParameters);
    setGeneratedPineScript(script);
  };

  // AI Generate: uses deterministic base + Claude refinement based on thesis
  const aiGenerate = async () => {
    if (!thesis.trim()) return;
    setIsGenerating(true);

    try {
      const baseScript = generateSMACrossoverStrategy(selectedSymbol, riskParameters);

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_strategy',
          symbol: selectedSymbol,
          thesis: `Here is a base PineScript v5 strategy generated from my risk parameters:\n\n${baseScript}\n\nMy thesis: ${thesis}\n\nRefine this strategy to incorporate my thesis while preserving the kill switch logic, risk parameters, position sizing, and alert JSON format. Modify indicators and entry/exit conditions to match my thesis.`,
          risk: riskParameters,
          balance: accountValue,
          ohlcv: ohlcv.slice(-50),
        }),
      });

      const data = await response.json();
      if (data.pineScript) {
        setGeneratedPineScript(data.pineScript);
      }
    } catch (err) {
      console.error('Strategy generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedPineScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[900px] max-h-[85vh] bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] rounded-2xl overflow-hidden flex flex-col" style={{ boxShadow: 'var(--cl-shadow-modal)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cl-border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--cl-accent-soft)] flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#AE5630" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--cl-text-primary)]">PineScript Strategy Generator</h2>
              <p className="text-xs text-[var(--cl-text-secondary)]">{selectedSymbol} | Risk: <span className={`risk-badge ${riskParameters.level} inline`}>{riskParameters.level}</span></p>
            </div>
          </div>
          <button
            onClick={() => setShowPineScriptModal(false)}
            className="w-8 h-8 rounded-lg bg-[var(--cl-fill-control)] hover:bg-[var(--cl-fill-active)] flex items-center justify-center transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('quick')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'quick'
                  ? 'bg-[var(--cl-fill-success)] border border-[var(--cl-success-border)] text-[var(--cl-success)]'
                  : 'bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
              }`}
            >
              Quick Generate (Instant)
            </button>
            <button
              onClick={() => setMode('ai')}
              className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'ai'
                  ? 'bg-[var(--cl-accent-soft)] border border-[var(--cl-accent-border-focus)] text-[var(--cl-accent)]'
                  : 'bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
              }`}
            >
              AI Refine (Claude)
            </button>
          </div>

          {/* Thesis Input (AI mode only) */}
          {mode === 'ai' && (
            <div>
              <label className="block text-xs text-[var(--cl-text-faint)] uppercase tracking-wider mb-2">Your Trading Thesis</label>
              <textarea
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="e.g., 'I think this coin just hit its bottom. The 4h SMA crossover is about to happen, volume is picking up, and the order book shows strong buy walls. I want to ride this back up with 3:1 R:R targets.'"
                className="w-full bg-[var(--cl-fill-control)] border border-[var(--cl-border)] rounded-lg px-4 py-3 text-sm text-[var(--cl-text-primary)] placeholder-[var(--cl-text-secondary)] resize-none focus:outline-none focus:border-[var(--cl-accent-border-focus)] focus:ring-2 focus:ring-[var(--cl-accent-focus-ring)]"
                rows={4}
              />
            </div>
          )}

          {/* Quick mode description */}
          {mode === 'quick' && (
            <div className="glass-card p-4">
              <p className="text-xs text-[var(--cl-text-faint)]">
                Generates a complete SMA crossover strategy (9/21/50 periods) with RSI and ATR filters, using your current risk parameters. Includes kill switch logic, position sizing, and TradingView alert JSON. No AI call needed — instant result.
              </p>
            </div>
          )}

          {/* Risk Summary */}
          <div className="glass-card p-4">
            <h3 className="text-xs text-[var(--cl-text-secondary)] uppercase tracking-wider mb-2">Strategy Parameters</h3>
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[var(--cl-text-secondary)]">Position Size:</span>
                <span className="ml-1 font-mono text-[var(--cl-text-primary)]">{riskParameters.maxPositionSizePercent}%</span>
              </div>
              <div>
                <span className="text-[var(--cl-text-secondary)]">Stop Loss:</span>
                <span className="ml-1 font-mono text-[var(--cl-error)]">{riskParameters.stopLossPercent}%</span>
              </div>
              <div>
                <span className="text-[var(--cl-text-secondary)]">Take Profit:</span>
                <span className="ml-1 font-mono text-[var(--cl-success)]">{riskParameters.takeProfitPercent}%</span>
              </div>
              <div>
                <span className="text-[var(--cl-text-secondary)]">Max Drawdown:</span>
                <span className="ml-1 font-mono text-[var(--cl-warning)]">{riskParameters.maxDrawdownPercent}%</span>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          {mode === 'quick' ? (
            <button
              onClick={quickGenerate}
              className="w-full py-3 rounded-lg bg-[var(--cl-success)] text-[var(--cl-text-inverse)] font-medium hover:bg-[var(--cl-success-hover)] transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Quick Generate (SMA Crossover)
            </button>
          ) : (
            <button
              onClick={aiGenerate}
              disabled={!thesis.trim() || isGenerating}
              className="w-full py-3 rounded-lg bg-[var(--cl-accent)] text-white font-medium hover:bg-[var(--cl-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="ai-thinking">
                    <span /><span /><span />
                  </div>
                  AI Refining Strategy...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Generate with AI Refinement
                </>
              )}
            </button>
          )}

          {/* Generated PineScript */}
          {generatedPineScript && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs text-[var(--cl-text-faint)] uppercase tracking-wider">Generated PineScript v5</h3>
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="px-3 py-1 rounded text-xs bg-[var(--cl-fill-hover)] hover:bg-[var(--cl-fill-active)] text-[var(--cl-text-faint)] transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
                  <a
                    href="https://www.tradingview.com/pine-editor/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 rounded text-xs bg-[var(--cl-fill-accent)] border border-[var(--cl-accent-border)] text-[var(--cl-accent)] hover:bg-[var(--cl-fill-accent-hover)] transition-colors"
                  >
                    Open TradingView Pine Editor
                  </a>
                </div>
              </div>
              <pre className="bg-[var(--cl-bg-page)] border border-[var(--cl-border-subtle)] rounded-lg p-4 text-xs font-mono text-[var(--cl-text-faint)] overflow-x-auto max-h-96 overflow-y-auto whitespace-pre">
                {generatedPineScript}
              </pre>

              {/* Webhook Setup Instructions */}
              <div className="glass-card p-4 mt-3">
                <h4 className="text-xs text-[var(--cl-accent)] font-medium mb-2">Webhook Setup (for auto-execution)</h4>
                <ol className="text-xs text-[var(--cl-text-faint)] space-y-1.5 list-decimal list-inside">
                  <li>Paste this PineScript into TradingView&apos;s Pine Editor</li>
                  <li>Add to chart and configure inputs</li>
                  <li>Create Alert → select this strategy</li>
                  <li>Set Webhook URL to: <code className="text-[var(--cl-accent)] bg-[var(--cl-fill-accent)] px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/webhook</code></li>
                  <li>Alerts will auto-execute trades on Phemex via PhantomX</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
