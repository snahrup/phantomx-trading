'use client';

import { useState } from 'react';
import { Activity, Copy, ExternalLink, Zap } from 'lucide-react';
import { useTradingStore } from '@/store/trading-store';
import { generateSMACrossoverStrategy } from '@/lib/strategy/pinescript-generator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

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
          action: 'generate_pinescript',
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
    <Dialog open={showPineScriptModal} onOpenChange={setShowPineScriptModal}>
      <DialogContent className="max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="flex flex-row items-center gap-3 px-6 py-4 border-b border-border space-y-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Activity className="size-[18px] text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle>PineScript Strategy Generator</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              {selectedSymbol} | Risk:{' '}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {riskParameters.level}
              </Badge>
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'quick' ? 'default' : 'outline'}
              onClick={() => setMode('quick')}
              className={`flex-1 text-xs ${
                mode === 'quick'
                  ? 'bg-claude-green/10 border border-claude-green/30 text-claude-green hover:bg-claude-green/15'
                  : ''
              }`}
            >
              Quick Generate (Instant)
            </Button>
            <Button
              variant={mode === 'ai' ? 'default' : 'outline'}
              onClick={() => setMode('ai')}
              className={`flex-1 text-xs ${
                mode === 'ai'
                  ? 'bg-primary/10 border border-ring text-primary hover:bg-primary/15'
                  : ''
              }`}
            >
              AI Refine (Claude)
            </Button>
          </div>

          {/* Thesis Input (AI mode only) */}
          {mode === 'ai' && (
            <div className="space-y-2">
              <Label className="text-xs text-foreground uppercase tracking-wider">
                Your Trading Thesis
              </Label>
              <textarea
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="e.g., 'I think this coin just hit its bottom. The 4h SMA crossover is about to happen, volume is picking up, and the order book shows strong buy walls. I want to ride this back up with 3:1 R:R targets.'"
                className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                rows={4}
              />
            </div>
          )}

          {/* Quick mode description */}
          {mode === 'quick' && (
            <div className="glass-card p-4">
              <p className="text-xs text-foreground">
                Generates a complete SMA crossover strategy (9/21/50 periods) with RSI and ATR filters, using your current risk parameters. Includes kill switch logic, position sizing, and TradingView alert JSON. No AI call needed — instant result.
              </p>
            </div>
          )}

          {/* Risk Summary */}
          <Card className="py-0 gap-0">
            <CardContent className="p-4">
              <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Strategy Parameters</h3>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Position Size:</span>
                  <span className="ml-1 font-mono text-foreground">{riskParameters.maxPositionSizePercent}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Stop Loss:</span>
                  <span className="ml-1 font-mono text-destructive">{riskParameters.stopLossPercent}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Take Profit:</span>
                  <span className="ml-1 font-mono text-claude-green">{riskParameters.takeProfitPercent}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Drawdown:</span>
                  <span className="ml-1 font-mono text-yellow-500">{riskParameters.maxDrawdownPercent}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generate Button */}
          {mode === 'quick' ? (
            <Button
              onClick={quickGenerate}
              className="w-full py-3 h-auto bg-claude-green text-primary-foreground font-medium hover:bg-claude-green/90"
            >
              <Zap className="size-4" />
              Quick Generate (SMA Crossover)
            </Button>
          ) : (
            <Button
              onClick={aiGenerate}
              disabled={!thesis.trim() || isGenerating}
              className="w-full py-3 h-auto font-medium"
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
                  <Zap className="size-4" />
                  Generate with AI Refinement
                </>
              )}
            </Button>
          )}

          {/* Generated PineScript */}
          {generatedPineScript && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs text-foreground uppercase tracking-wider">Generated PineScript v5</h3>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyToClipboard}
                    className="text-xs"
                  >
                    <Copy className="size-3.5" />
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="text-xs text-primary"
                  >
                    <a
                      href="https://www.tradingview.com/pine-editor/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-3.5" />
                      Open TradingView Pine Editor
                    </a>
                  </Button>
                </div>
              </div>
              <pre className="bg-background border border-border rounded-lg p-4 text-xs font-mono text-foreground overflow-x-auto max-h-96 overflow-y-auto whitespace-pre">
                {generatedPineScript}
              </pre>

              {/* Webhook Setup Instructions */}
              <Card className="mt-3 py-0 gap-0">
                <CardContent className="p-4">
                  <h4 className="text-xs text-primary font-medium mb-2">Webhook Setup (for auto-execution)</h4>
                  <ol className="text-xs text-foreground space-y-1.5 list-decimal list-inside">
                    <li>Paste this PineScript into TradingView&apos;s Pine Editor</li>
                    <li>Add to chart and configure inputs</li>
                    <li>Create Alert &rarr; select this strategy</li>
                    <li>Set Webhook URL to: <code className="text-primary bg-primary/10 px-1 rounded">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/webhook</code></li>
                    <li>Alerts will auto-execute trades on Phemex via PhantomX</li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
