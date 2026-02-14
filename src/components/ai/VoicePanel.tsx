'use client';

import { useConversation } from '@elevenlabs/react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useTradingStore } from '@/store/trading-store';

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
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[var(--cl-accent)] flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <span>Onyx Voice</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className={`status-dot ${isConnected ? 'live' : isConnecting ? 'live' : 'disconnected'}`} />
            <span className="text-[10px]">
              {isConnected ? (conversation.isSpeaking ? 'Speaking...' : 'Listening...') : isConnecting ? 'Connecting...' : 'Ready'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)] transition-colors p-0.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Voice visualizer */}
      <div className="flex-shrink-0 flex items-center justify-center py-6 px-4">
        <div className="relative">
          {/* Outer ring — pulses when speaking */}
          <div className={`w-28 h-28 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
            isConnected
              ? conversation.isSpeaking
                ? 'border-[var(--cl-accent)] shadow-[0_0_30px_rgba(174,86,48,0.4)] scale-110'
                : 'border-[var(--cl-success)] shadow-[0_0_20px_rgba(0,210,106,0.2)]'
              : 'border-[var(--cl-border)]'
          }`}>
            {/* Inner circle */}
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
              isConnected
                ? conversation.isSpeaking
                  ? 'bg-[var(--cl-accent-soft)] animate-pulse'
                  : 'bg-[rgba(0,210,106,0.1)]'
                : 'bg-[var(--cl-fill-control)]'
            }`}>
              {isConnecting ? (
                <div className="ai-thinking"><span /><span /><span /></div>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                  stroke={isConnected ? (conversation.isSpeaking ? 'var(--cl-accent)' : 'var(--cl-success)') : 'var(--cl-text-secondary)'}
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
          <p className="text-center text-[11px] text-[var(--cl-text-secondary)] mt-3">
            {isConnected
              ? conversation.isSpeaking ? 'Onyx is speaking' : 'Listening to you...'
              : isConnecting ? 'Connecting to Onyx...' : 'Tap to start voice session'
            }
          </p>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2">
        {transcript.length === 0 && !isConnected && (
          <div className="text-center text-[var(--cl-text-secondary)] text-[11px] py-4 opacity-60">
            Start a voice session to talk with Onyx.<br />
            Conversation transcript appears here.
          </div>
        )}
        {transcript.map((t, i) => (
          <div key={i} className={`flex gap-2 ${t.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              t.role === 'user' ? 'bg-[var(--cl-fill-active)]' : 'bg-[var(--cl-accent-soft)]'
            }`}>
              <span className={`text-[8px] font-semibold ${
                t.role === 'user' ? 'text-[var(--cl-text-faint)]' : 'text-[var(--cl-accent)]'
              }`}>
                {t.role === 'user' ? 'U' : 'O'}
              </span>
            </div>
            <div className={`glass-card p-2 text-[12px] max-w-[80%] ${
              t.role === 'user' ? 'bg-[var(--cl-bg-hover)]' : ''
            }`}>
              {t.text}
            </div>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-3 mb-2 p-2 rounded-lg bg-[var(--cl-fill-error)] border border-[var(--cl-error-border)] text-[11px] text-[var(--cl-error)]">
          {error}
        </div>
      )}

      {/* Voice ID Override */}
      {!isConnected && (
        <div className="px-3 pb-1">
          <button
            onClick={() => setShowVoiceInput(v => !v)}
            className="text-[9px] text-[var(--cl-text-secondary)] hover:text-[var(--cl-accent)] transition-colors flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${showVoiceInput ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Custom Voice ID
          </button>
          {showVoiceInput && (
            <div className="mt-1.5 flex gap-1.5">
              <input
                type="text"
                value={customVoiceId}
                onChange={e => setCustomVoiceId(e.target.value)}
                placeholder="Paste ElevenLabs voice ID..."
                className="flex-1 px-2 py-1.5 rounded-lg text-[11px] bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-[var(--cl-text-primary)] placeholder:text-[var(--cl-text-secondary)] focus:border-[var(--cl-accent)] focus:outline-none font-mono"
              />
              {customVoiceId && (
                <button
                  onClick={() => setCustomVoiceId('')}
                  className="text-[9px] px-2 py-1 rounded-md border border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:text-[var(--cl-error)] hover:border-[var(--cl-error)] transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {customVoiceId && (
            <div className="mt-1 text-[8px] text-[var(--cl-accent)] font-mono truncate">
              Voice override: {customVoiceId}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="p-3 border-t border-[var(--cl-border)] flex items-center gap-2">
        {isConnected ? (
          <>
            <button
              onClick={endSession}
              className="flex-1 py-2.5 rounded-xl text-[12px] font-medium bg-[var(--cl-fill-error-hover)] border border-[var(--cl-error-border)] text-[var(--cl-error)] hover:bg-[var(--cl-error)] hover:text-white transition-all flex items-center justify-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
              </svg>
              End Session
            </button>
          </>
        ) : (
          <button
            onClick={startSession}
            disabled={isConnecting}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-medium bg-[var(--cl-accent)] text-white hover:bg-[var(--cl-accent-hover)] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {isConnecting ? 'Connecting...' : 'Start Voice Session'}
          </button>
        )}
      </div>
    </div>
  );
}
