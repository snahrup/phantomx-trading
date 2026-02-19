'use client';

import { useConversation } from '@elevenlabs/react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FadeIn, Collapse } from '@/components/motion';
import { cn } from '@/lib/utils';

export default function VoicePanel({ onClose }: { onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [customVoiceId, setCustomVoiceId] = useState('');
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    selectedSymbol, positions, accountValue, ticker,
    riskParameters, isExecuting, autopilotMode,
    addAIMessage,
  } = useTradingStore();

  const conversation = useConversation({
    onConnect: () => {
      setError(null);
    },
    onDisconnect: () => {
      // noop — status updates via conversation.status
    },
    onMessage: (message) => {
      setTranscript(prev => [...prev.slice(-49), {
        role: message.source === 'user' ? 'user' : 'ai',
        text: message.message,
      }]);
      // Also persist AI messages to the main chat store
      if (message.source === 'ai') {
        addAIMessage({
          id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: message.message,
          timestamp: Date.now(),
          metadata: { source: 'voice' },
        });
      }
    },
    onError: (err) => {
      console.error('[Onyx Voice] Error:', err);
      setError(typeof err === 'string' ? err : 'Connection error');
    },
  });

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Send trading context when conversation connects
  useEffect(() => {
    if (conversation.status === 'connected') {
      const positionSummary = positions.length > 0
        ? positions.map(p => `${p.side} ${p.symbol.replace('/USDT:USDT', '')} ${p.size} @ $${p.entryPrice} (PnL: $${p.unrealizedPnl?.toFixed(2) ?? '?'})`).join(', ')
        : 'No open positions';

      const context = [
        `Trading context update:`,
        `Account value: $${accountValue.toFixed(2)}`,
        `Current symbol: ${selectedSymbol.replace('/USDT:USDT', '')}`,
        `Price: $${ticker?.last ?? 'unknown'}`,
        `Risk level: ${riskParameters.level}`,
        `Positions: ${positionSummary}`,
        `Autopilot: ${isExecuting ? `ON (${autopilotMode} mode)` : 'OFF'}`,
      ].join('\n');

      conversation.sendContextualUpdate(context);
    }
  }, [conversation.status, positions, accountValue, selectedSymbol, ticker, riskParameters.level, isExecuting, autopilotMode, conversation]);

  const startSession = useCallback(async () => {
    setError(null);
    setTranscript([]);

    try {
      // Request mic permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get signed URL from our secure API route
      const res = await fetch('/api/elevenlabs');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `API error ${res.status}`);
      }
      const { signedUrl } = await res.json();

      // Build session options with optional voice override
      const sessionOpts: Parameters<typeof conversation.startSession>[0] = { signedUrl };
      if (customVoiceId.trim()) {
        sessionOpts.overrides = {
          tts: { voiceId: customVoiceId.trim() },
        };
      }

      await conversation.startSession(sessionOpts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission denied') || msg.includes('NotAllowedError')) {
        setError('Microphone access denied. Enable it in browser settings.');
      } else {
        setError(msg);
      }
    }
  }, [conversation, customVoiceId]);

  const endSession = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isConnected = conversation.status === 'connected';
  const isConnecting = conversation.status === 'connecting';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <span className="text-sm font-medium text-foreground">Onyx Voice</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className={cn(
              'inline-block w-1.5 h-1.5 rounded-full',
              isConnected ? 'bg-claude-green animate-pulse' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-muted-foreground/40'
            )} />
            <span className="text-[10px] text-muted-foreground">
              {isConnected ? (conversation.isSpeaking ? 'Speaking...' : 'Listening...') : isConnecting ? 'Connecting...' : 'Ready'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Voice visualizer */}
      <FadeIn className="flex-shrink-0 flex items-center justify-center py-6 px-4">
        <div className="relative">
          {/* Outer ring -- pulses when speaking */}
          <div className={cn(
            'w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-300',
            isConnected
              ? conversation.isSpeaking
                ? 'border-primary shadow-[0_0_30px_hsl(var(--primary)/0.4)] scale-110'
                : 'border-claude-green shadow-[0_0_20px_oklch(0.58_0.1_145/0.2)]'
              : 'border-border'
          )}>
            {/* Inner circle */}
            <div className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300',
              isConnected
                ? conversation.isSpeaking
                  ? 'bg-primary/10 animate-pulse'
                  : 'bg-claude-green/10'
                : 'bg-muted'
            )}>
              {isConnecting ? (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                </div>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                  className={cn(
                    isConnected
                      ? conversation.isSpeaking ? 'text-primary' : 'text-claude-green'
                      : 'text-muted-foreground'
                  )}
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </div>
          </div>

          {/* Status label under the orb */}
          <p className="text-center text-[11px] text-muted-foreground mt-3">
            {isConnected
              ? conversation.isSpeaking ? 'Onyx is speaking' : 'Listening to you...'
              : isConnecting ? 'Connecting to Onyx...' : 'Tap to start voice session'
            }
          </p>
        </div>
      </FadeIn>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
        {transcript.length === 0 && !isConnected && (
          <FadeIn className="text-center text-muted-foreground text-[11px] py-4 opacity-60">
            Start a voice session to talk with Onyx.<br />
            Conversation transcript appears here.
          </FadeIn>
        )}
        {transcript.map((t, i) => (
          <FadeIn key={i} delay={0.05} className={`flex gap-2 ${t.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              t.role === 'user' ? 'bg-muted' : 'bg-primary/10'
            )}>
              <span className={cn(
                'text-[8px] font-semibold',
                t.role === 'user' ? 'text-foreground' : 'text-primary'
              )}>
                {t.role === 'user' ? 'U' : 'O'}
              </span>
            </div>
            <Card className={cn(
              'py-0 gap-0 max-w-[80%] shadow-none',
              t.role === 'user' ? 'bg-accent' : 'bg-card'
            )}>
              <CardContent className="p-2 text-[12px] text-card-foreground">
                {t.text}
              </CardContent>
            </Card>
          </FadeIn>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <FadeIn className="mx-3 mb-2">
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-[11px]">
              {error}
            </AlertDescription>
          </Alert>
        </FadeIn>
      )}

      {/* Voice ID Override */}
      {!isConnected && (
        <FadeIn className="px-3 pb-1">
          <button
            onClick={() => setShowVoiceInput(v => !v)}
            className="text-[9px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${showVoiceInput ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Custom Voice ID
          </button>
          <Collapse open={showVoiceInput}>
            <div className="mt-1.5 flex gap-1.5">
              <Input
                type="text"
                value={customVoiceId}
                onChange={e => setCustomVoiceId(e.target.value)}
                placeholder="Paste ElevenLabs voice ID..."
                className="flex-1 h-7 px-2 py-1.5 text-[11px] font-mono"
              />
              {customVoiceId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomVoiceId('')}
                  className="text-[9px] h-7 px-2 hover:text-destructive hover:border-destructive"
                >
                  Clear
                </Button>
              )}
            </div>
          </Collapse>
          {customVoiceId && (
            <div className="mt-1 text-[8px] text-primary font-mono truncate">
              Voice override: {customVoiceId}
            </div>
          )}
        </FadeIn>
      )}

      {/* Controls */}
      <div className="p-3 border-t border-border flex items-center gap-2">
        {isConnected ? (
          <Button
            variant="destructive"
            onClick={endSession}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-medium"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
            </svg>
            End Session
          </Button>
        ) : (
          <Button
            onClick={startSession}
            disabled={isConnecting}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-medium shadow-lg"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {isConnecting ? 'Connecting...' : 'Start Voice Session'}
          </Button>
        )}
      </div>
    </div>
  );
}
