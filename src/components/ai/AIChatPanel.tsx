'use client';

import { useState, useRef, useEffect, useCallback, memo, useMemo, lazy, Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTradingStore } from '@/store/trading-store';
import type { AIMessage, ChartPriceLine, JournalEntry, JournalEntryType } from '@/types/trading';
import { createPatternDrawings } from '@/lib/chart/pattern-visualizer';

const VoicePanel = lazy(() => import('./VoicePanel'));

// Markdown renderer with trading-friendly styling
const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="text-[var(--cl-text-primary)]" style={{ fontWeight: 600 }}>{children}</strong>,
        em: ({ children }) => <em className="text-[var(--cl-text-faint)]" style={{ fontWeight: 100, fontStyle: 'italic' }}>{children}</em>,
        h1: ({ children }) => <h1 className="text-[13px] text-[var(--cl-text-primary)] mb-1.5 mt-2 first:mt-0" style={{ fontWeight: 900 }}>{children}</h1>,
        h2: ({ children }) => <h2 className="text-[12px] text-[var(--cl-text-primary)] mb-1 mt-2 first:mt-0" style={{ fontWeight: 600 }}>{children}</h2>,
        h3: ({ children }) => <h3 className="text-[12px] text-[var(--cl-text-faint)] mb-1 mt-1.5 first:mt-0" style={{ fontWeight: 600 }}>{children}</h3>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-[var(--cl-text-faint)]">{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes('language-');
          return isBlock ? (
            <pre className="bg-[var(--cl-bg-page)] rounded-md p-2 my-1.5 overflow-x-auto text-[10px] font-mono border border-[var(--cl-border-subtle)]">
              <code>{children}</code>
            </pre>
          ) : (
            <code className="bg-[var(--cl-fill-control)] text-[var(--cl-accent)] px-1 py-0.5 rounded text-[11px] font-mono">{children}</code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--cl-accent-border)] pl-2 my-1.5 text-[var(--cl-text-secondary)] italic">{children}</blockquote>,
        table: ({ children }) => <div className="overflow-x-auto my-1.5"><table className="text-[10px] border-collapse">{children}</table></div>,
        th: ({ children }) => <th className="border border-[var(--cl-border-subtle)] px-1.5 py-0.5 bg-[var(--cl-fill-control)] text-left" style={{ fontWeight: 600 }}>{children}</th>,
        td: ({ children }) => <td className="border border-[var(--cl-border-subtle)] px-1.5 py-0.5">{children}</td>,
        hr: () => <hr className="border-[var(--cl-border-subtle)] my-3" />,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--cl-accent)] underline">{children}</a>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

function extractPriceLinesFromText(text: string): Omit<ChartPriceLine, 'id' | 'timestamp'>[] {
  const lines: Omit<ChartPriceLine, 'id' | 'timestamp'>[] = [];
  const patterns = [
    { regex: /(?:entry|enter|buy)\s*(?:at|@|:)\s*\$?([\d,]+\.?\d*)/gi, type: 'entry' as const, color: 'var(--cl-info)' },
    { regex: /(?:exit|sell|target|tp|take.?profit)\s*(?:at|@|:)\s*\$?([\d,]+\.?\d*)/gi, type: 'take_profit' as const, color: 'var(--cl-success)' },
    { regex: /(?:stop.?loss|sl|stop)\s*(?:at|@|:)\s*\$?([\d,]+\.?\d*)/gi, type: 'stop_loss' as const, color: 'var(--cl-error)' },
    { regex: /(?:support)\s*(?:at|@|:|\s)\s*\$?([\d,]+\.?\d*)/gi, type: 'support' as const, color: 'var(--cl-success)' },
    { regex: /(?:resistance)\s*(?:at|@|:|\s)\s*\$?([\d,]+\.?\d*)/gi, type: 'resistance' as const, color: 'var(--cl-error)' },
  ];
  for (const p of patterns) {
    let match;
    while ((match = p.regex.exec(text)) !== null) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (price > 0 && !lines.some(l => Math.abs(l.price - price) < price * 0.001)) {
        lines.push({ price, color: p.color, lineWidth: p.type === 'entry' ? 2 : 1, lineStyle: p.type === 'entry' ? 'solid' : 'dashed', label: `${p.type.replace('_', ' ').toUpperCase()} $${price.toLocaleString()}`, source: 'ai_chat', type: p.type, axisLabelVisible: true });
      }
    }
  }
  return lines;
}

function shortSym(symbol: string): string {
  return symbol.replace('/USDT:USDT', '').replace('/USDT', '');
}

const INTERVAL_OPTIONS = [
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: '2m', value: 120000 },
  { label: '5m', value: 300000 },
];

// Convert SSE heartbeat events to journal entries for the trading journal
function sseEventToJournal(event: { type: string; tick?: number; data: Record<string, unknown>; timestamp: number }): JournalEntry | null {
  const store = useTradingStore.getState();
  const tick = (event.tick ?? (event.data.tick as number)) ?? 0;
  const d = event.data;

  const equity = store.accountValue || 0;
  const pos = store.positions || [];
  const totalNotional = pos.reduce((s, p) => s + Math.abs(p.size * p.markPrice), 0);
  const cashPercent = equity > 0 ? Math.max(0, ((equity - totalNotional) / equity) * 100) : 100;
  const dailyPnl = store.autopilotCumulativePnl || 0;
  const startEquity = store.autopilotSessionStartEquity || equity;
  const dailyPnlPercent = startEquity > 0 ? (dailyPnl / startEquity) * 100 : 0;
  const portfolioState = { equity, cashPercent, positionCount: pos.length, dailyPnl, dailyPnlPercent };

  let type: JournalEntryType | null = null;
  let symbol = (d.symbol as string) ?? undefined;
  const action = (d.action as string) ?? undefined;
  let reason = '';
  let confidence: number | undefined;
  let price: number | undefined;
  let pnl: number | undefined;
  let pnlPercent: number | undefined;

  switch (event.type) {
    case 'analysis':
      type = 'analysis';
      reason = String(d.analysis ?? d.reasoning ?? 'Market analyzed');
      confidence = (d.confidence as number) ?? undefined;
      break;
    case 'action':
      if (d.action === 'hold') return null;
      type = 'decision';
      reason = String(d.reason ?? d.reasoning ?? `Decided to ${d.action}`);
      confidence = (d.confidence as number) ?? undefined;
      price = (d.entryPrice as number) ?? (d.price as number) ?? undefined;
      break;
    case 'trade_executed':
      type = 'trade';
      reason = String(d.reason ?? `Executed ${d.side ?? d.action} ${shortSym(symbol ?? '')} @ $${d.price}`);
      price = (d.price as number) ?? (d.fillPrice as number) ?? undefined;
      confidence = (d.confidence as number) ?? undefined;
      break;
    case 'trade_skipped':
      type = 'skip';
      reason = String(d.reason ?? 'Trade skipped due to constraints');
      confidence = (d.confidence as number) ?? undefined;
      break;
    case 'kill_triggered':
      type = 'kill';
      reason = String(d.reason ?? `Kill switch: ${d.dailyLossPercent ?? '?'}% daily loss`);
      break;
    case 'portfolio_update': {
      const recentCloses = (d.recentClosedTrades as Array<Record<string, unknown>>) ?? [];
      if (recentCloses.length > 0) {
        const latest = recentCloses[recentCloses.length - 1];
        type = 'close';
        symbol = (latest.symbol as string) ?? symbol;
        pnl = (latest.realizedPnl as number) ?? 0;
        pnlPercent = (latest.realizedPnlPercent as number) ?? 0;
        reason = String(latest.reason ?? `Closed ${shortSym(symbol ?? '')} for $${pnl.toFixed(2)}`);
        price = (latest.exitPrice as number) ?? undefined;
        break;
      }
      return null;
    }
    default:
      return null;
  }

  if (!type) return null;

  return {
    id: `j-${tick}-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    timestamp: event.timestamp || Date.now(),
    tick,
    type,
    symbol,
    action,
    reason,
    confidence,
    price,
    pnl,
    pnlPercent,
    indicators: undefined,
    portfolioState,
  };
}

export default function AIChatPanel() {
  const [input, setInput] = useState('');
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    aiMessages, aiIsThinking, aiStreamingText,
    addAIMessage, setAIThinking, setAIStreamingText, appendAIStreamingText,
    selectedSymbol, selectedTimeframe, riskParameters, accountValue, positions, ticker,
    isExecuting, setExecuting, setRiskLevel,
    isConnected,
    autopilotMode, setAutopilotMode,
    watchlist, addToWatchlist, removeFromWatchlist,
    autopilotScanMode, setAutopilotScanMode,
    autopilotInterval, setAutopilotInterval,
    autopilotAutoTrade, setAutopilotAutoTrade,
    viewMode, setViewMode, autopilotClosedTrades, journalEntries,
  } = useTradingStore();

  const [showRiskMenu, setShowRiskMenu] = useState(false);
  const [showAutopilotPanel, setShowAutopilotPanel] = useState(false);
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [watchlistInput, setWatchlistInput] = useState('');
  const [allMarkets, setAllMarkets] = useState<{ symbol: string; base: string }[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, aiStreamingText]);

  // Check autopilot engine status on mount (survives page refresh for 24/7 operation)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        });
        const data = await res.json();
        if (data.isRunning) setExecuting(true);
      } catch { /* ignore */ }
    })();
  }, [setExecuting]);

  // Fetch markets for watchlist picker when panel opens
  useEffect(() => {
    if (!showAutopilotPanel || allMarkets.length > 0 || marketsLoading) return;
    setMarketsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/phemex', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'markets' }),
        });
        const data = await res.json();
        if (data.markets) {
          // Only USDT perpetual futures — filter out USDC pairs
          setAllMarkets(
            (data.markets as { symbol: string; base: string }[])
              .filter((m: { symbol: string }) => m.symbol.includes('/USDT') && !m.symbol.includes('USDC'))
          );
        }
      } catch { /* ignore */ }
      setMarketsLoading(false);
    })();
  }, [showAutopilotPanel, allMarkets.length, marketsLoading]);

  // Filtered markets for watchlist picker
  const filteredMarkets = useMemo(() => {
    if (!watchlistInput.trim()) return [];
    const q = watchlistInput.trim().toUpperCase();
    return allMarkets
      .filter(m => !watchlist.includes(m.symbol))
      .filter(m => m.base.toUpperCase().includes(q) || m.symbol.toUpperCase().includes(q))
      .slice(0, 20);
  }, [allMarkets, watchlist, watchlistInput]);

  // --- Listen for proactive autopilot insights via SSE (with auto-reconnect) ---
  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    function connect() {
      if (!alive) return;
      try {
        sse = new EventSource('/api/heartbeat');
        sse.onmessage = (ev) => {
          try {
            const event = JSON.parse(ev.data);
            const store = useTradingStore.getState();

            // === Agent events — always update store (even while AI is thinking) ===
            if (event.type === 'orchestrator_status') {
              if (event.data?.agents) store.setAgentStatuses(event.data.agents);
              if (event.data?.signalSummary) store.setSignalConsensus(event.data.signalSummary);
              store.addAgentEvent(event);
            }
            if (event.type === 'agent_signal' && event.data?.signal) {
              const signal = event.data.signal;
              store.setAgentSignals([
                ...store.agentSignals.filter((s: { agentId: string }) => s.agentId !== signal.agentId),
                signal,
              ]);
              store.addAgentEvent(event);

              // Surface agent signals in chat so users SEE them working
              if (!store.aiIsThinking) {
                const sentimentIcon = signal.sentiment === 'bullish' ? '+' : signal.sentiment === 'bearish' ? '-' : '~';
                store.addAIMessage({
                  id: `agent-signal-${signal.agentId}-${Date.now()}`,
                  role: 'assistant',
                  content: `**[${String(signal.agentName).toUpperCase()} — ${String(signal.sentiment).toUpperCase()} ${sentimentIcon}${signal.confidence}%]**\n\n${signal.summary}`,
                  timestamp: Date.now(),
                  metadata: { isProactive: true, source: 'agent' },
                });
              }
            }
            if (event.type === 'agent_tick' || event.type === 'agent_started' || event.type === 'agent_stopped' || event.type === 'agent_error') {
              store.addAgentEvent(event);
            }

            // Capture status messages for the activity bar (always, even while chatting)
            if (event.type === 'status' && event.data?.message) {
              store.setAutopilotStatusMessage(String(event.data.message));
            }

            // Don't inject chat messages while user is actively chatting
            if (store.aiIsThinking) return;

            let content: string | null = null;
            let label = 'AUTOPILOT';

            if (event.type === 'analysis' && event.data?.analysis) {
              label = 'ANALYSIS';
              const parts = [String(event.data.analysis)];
              if (event.data.reasoning) parts.push(`\n\n**Reasoning:** ${event.data.reasoning}`);
              if (event.data.confidence) parts.push(`\n**Confidence:** ${event.data.confidence}%`);
              content = parts.join('');
            } else if (event.type === 'trade_executed') {
              label = 'TRADE EXECUTED';
              const d = event.data;
              const sym = String(d.symbol ?? '').replace('/USDT:USDT', '');
              const pnl = d.realizedPnl !== undefined ? ` | PnL: ${(d.realizedPnl as number) >= 0 ? '+' : ''}$${Number(d.realizedPnl).toFixed(2)}` : '';
              content = `**${String(d.action).toUpperCase()} ${sym}** — ${d.amount ? Number(d.amount).toFixed(4) : '?'} @ $${d.price ?? '?'}${pnl}\n${d.reason ?? ''}`;
            } else if (event.type === 'action' && event.data?.action !== 'hold') {
              label = 'DECISION';
              const d = event.data;
              const sym = String(d.symbol ?? '').replace('/USDT:USDT', '');
              content = `**${String(d.action).toUpperCase()} ${sym}** (${d.confidence ?? '?'}% confidence)\n${d.reason ?? ''}`;
            } else if (event.type === 'kill_triggered') {
              label = 'KILL SWITCH';
              content = `**Autopilot stopped** — ${event.data.reason ?? 'Daily loss limit hit'} (${event.data.dailyLossPercent ?? '?'}% loss)`;
            } else if (event.type === 'portfolio_update' && event.data?.totalEquity) {
              // Only inject portfolio updates if there's meaningful content (e.g. after a trade)
              if (event.data.cumulativeRealizedPnl && Number(event.data.cumulativeRealizedPnl) !== 0) {
                label = 'PORTFOLIO';
                content = `Equity: $${Number(event.data.totalEquity).toFixed(2)} | Cash: ${Number(event.data.cashPercent).toFixed(0)}% | Realized PnL: ${Number(event.data.cumulativeRealizedPnl) >= 0 ? '+' : ''}$${Number(event.data.cumulativeRealizedPnl).toFixed(2)}`;
              }
            } else if (event.type === 'agent_error' && event.data?.error) {
              label = 'AGENT ERROR';
              content = `**${String(event.agentId ?? 'Agent').toUpperCase()} Error** — ${event.data.error}`;
            }

            if (content) {
              store.addAIMessage({
                id: `autopilot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                role: 'assistant',
                content: `**[${label} — Tick #${event.data?.tick ?? event.tick ?? '?'}]**\n\n${content}`,
                timestamp: Date.now(),
                metadata: { isProactive: true, source: 'autopilot' },
              });
            }

            // Journal capture — persist significant events
            const journalEntry = sseEventToJournal(event);
            if (journalEntry) {
              store.addJournalEntry(journalEntry);
              // Chart snapshot for trades/closes/kills
              if (journalEntry.type === 'trade' || journalEntry.type === 'close' || journalEntry.type === 'kill') {
                const captureChart = (window as unknown as Record<string, unknown>).__phantomx_captureChart as (() => string | null) | undefined;
                if (captureChart) {
                  const img = captureChart();
                  if (img) {
                    fetch('/api/journal', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'save_snapshot', imageBase64: img, entryId: journalEntry.id }),
                    })
                      .then(r => r.json())
                      .then(data => {
                        if (data.path) {
                          const s = useTradingStore.getState();
                          const updated = s.journalEntries.map(e =>
                            e.id === journalEntry.id ? { ...e, chartSnapshotPath: data.path } : e
                          );
                          useTradingStore.setState({ journalEntries: updated });
                        }
                      })
                      .catch(() => {});
                  }
                }
              }
            }

            // Track engine stop
            if (event.type === 'status' && event.data.status === 'stopped') {
              store.setExecuting(false);
            }
          } catch { /* ignore parse errors */ }
        };
        sse.onerror = () => {
          sse?.close();
          sse = null;
          // Auto-reconnect after 3s
          if (alive) reconnectTimer = setTimeout(connect, 3000);
        };
      } catch { /* SSE not available */ }
    }

    connect();
    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      sse?.close();
    };
  }, []);

  // --- Clipboard paste handler (images) ---
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          if (base64) setPastedImage(base64);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  // --- File input handler ---
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (base64) setPastedImage(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  // --- Learn command: "learn: <content>" saves to knowledge base ---
  const handleLearnCommand = async (content: string): Promise<boolean> => {
    // Parse learn command: "learn: Title | Content" or "learn: Content"
    const learnMatch = content.match(/^learn:\s*(.+)/i);
    if (!learnMatch) return false;

    const raw = learnMatch[1].trim();
    let title: string;
    let body: string;
    const pipeIdx = raw.indexOf('|');
    if (pipeIdx > 0) {
      title = raw.slice(0, pipeIdx).trim();
      body = raw.slice(pipeIdx + 1).trim();
    } else {
      title = raw.slice(0, 60).replace(/\n/g, ' ');
      body = raw;
    }

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: body,
          category: 'custom',
          tags: ['user-learned'],
          source: 'user',
        }),
      });
      const data = await res.json();
      if (data.success) {
        addAIMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Learned and stored: **${title}**\n\nThis knowledge will be included in my analysis on every future tick.`,
          timestamp: Date.now(),
        });
      } else {
        addAIMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Failed to store knowledge: ${data.error}`,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      addAIMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error saving to knowledge base: ${err}`,
        timestamp: Date.now(),
      });
    }
    return true;
  };

  // --- Send message ---
  const sendMessage = async () => {
    const message = input.trim();
    if ((!message && !pastedImage) || aiIsThinking) return;

    // Check for learn: command
    if (message.toLowerCase().startsWith('learn:')) {
      const userMsg: AIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      setInput('');
      addAIMessage(userMsg);
      await handleLearnCommand(message);
      return;
    }

    const currentImage = pastedImage;
    setInput('');
    setPastedImage(null);
    setAIThinking(true);
    setAIStreamingText('');

    const userMsg: AIMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message || (currentImage ? 'Analyze this image' : ''),
      timestamp: Date.now(),
      metadata: currentImage ? { imageBase64: currentImage } : undefined,
    };
    addAIMessage(userMsg);

    // Use pasted image, or auto-capture from chart widget
    let chartImage: string | undefined = currentImage ?? undefined;
    if (!chartImage) {
      const captureChart = (window as unknown as Record<string, unknown>).__phantomx_captureChart as (() => string | null) | undefined;
      if (captureChart && (message.toLowerCase().includes('chart') || message.toLowerCase().includes('look') || message.toLowerCase().includes('see') || message.toLowerCase().includes('thoughts'))) {
        chartImage = captureChart() ?? undefined;
      }
    }

    try {
      // Build request body — include dashboard context when in dashboard mode
      const requestBody: Record<string, unknown> = {
        action: 'chat',
        message: message || 'Analyze this chart/image.',
        chartImage,
        symbol: selectedSymbol,
        timeframe: selectedTimeframe,
        risk: riskParameters,
        balance: accountValue,
        positions,
        currentPrice: ticker?.last ?? 0,
        ticker,
      };
      if (viewMode === 'dashboard') {
        requestBody.viewMode = 'dashboard';
        requestBody.closedTrades = autopilotClosedTrades.slice(-100);
        requestBody.journalEntries = journalEntries.slice(-100);
      } else if (viewMode === 'intelligence') {
        requestBody.viewMode = 'intelligence';
      }

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'text') { fullText += data.content; appendAIStreamingText(data.content); }
              else if (data.type === 'executing') {
                // Show execution status inline in streaming
                appendAIStreamingText(`\n\n---\n**Executing:** ${data.message}\n`);
              }
              else if (data.type === 'execution_result') {
                const icon = data.success ? '**FILLED**' : '**FAILED**';
                appendAIStreamingText(`${icon} \`${data.action}\` ${data.symbol} — ${data.result}\n`);
                fullText += `\n${icon} \`${data.action}\` ${data.symbol} — ${data.result}`;
                // Refresh positions after execution
                if (data.success) {
                  fetch('/api/phemex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'account' }) })
                    .then(r => r.json())
                    .then(d => { if (d.account) { const s = useTradingStore.getState(); s.setBalances(d.account.balances); s.setAccountValue(d.account.totalUsdValue); } })
                    .catch(() => {});
                  fetch('/api/phemex', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'positions' }) })
                    .then(r => r.json())
                    .then(d => { if (d.positions) useTradingStore.getState().setPositions(d.positions); })
                    .catch(() => {});
                }
              }
              else if (data.type === 'draw_commands' && data.draws?.lines) {
                const store = useTradingStore.getState();
                store.clearPriceLines('ai_chat');
                const drawnLines: string[] = [];
                for (const ln of data.draws.lines) {
                  store.addPriceLine({
                    id: `ai-draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    price: ln.price,
                    color: ln.color || 'var(--cl-accent)',
                    lineWidth: ln.type === 'entry' ? 2 : 1,
                    lineStyle: (ln.style as 'solid' | 'dashed' | 'dotted') || 'dashed',
                    label: ln.label || `$${ln.price}`,
                    source: 'ai_chat',
                    type: ln.type || 'support',
                    axisLabelVisible: true,
                    timestamp: Date.now(),
                  });
                  drawnLines.push(`\`${ln.label || ln.type}\` @ $${ln.price}`);
                }
                // Show inline notification of what was drawn
                appendAIStreamingText(`\n\n---\n**Chart updated** — ${drawnLines.length} level${drawnLines.length > 1 ? 's' : ''} drawn:\n${drawnLines.map(l => `  ${l}`).join('\n')}\n`);
                fullText += `\n\nChart updated — ${drawnLines.length} level${drawnLines.length > 1 ? 's' : ''} drawn: ${drawnLines.join(', ')}`;
              }
              else if (data.type === 'learnings_saved') {
                const titles = (data.titles as string[]) ?? [];
                appendAIStreamingText(`\n\n---\n**Learnings saved** (${data.count}):\n${titles.map((t: string) => `  - ${t}`).join('\n')}\n`);
                fullText += `\n\nLearnings saved: ${titles.join(', ')}`;
              }
              else if (data.type === 'done') {
                // Strip command blocks from displayed text
                const cleanText = fullText
                  .replace(/```phantomx_command\s*\n[\s\S]*?```/g, '')
                  .replace(/```phantomx_draw\s*\n[\s\S]*?```/g, '')
                  .replace(/```phantomx_learning\s*\n[\s\S]*?```/g, '')
                  .trim();
                addAIMessage({ id: crypto.randomUUID(), role: 'assistant', content: cleanText, timestamp: Date.now(), metadata: data.message?.metadata });
                setAIStreamingText('');
                const extracted = extractPriceLinesFromText(cleanText);
                if (extracted.length > 0) {
                  const store = useTradingStore.getState();
                  store.clearPriceLines('ai_chat');
                  for (const line of extracted) store.addPriceLine({ ...line, id: `ai-chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() });
                }
                if (data.message?.metadata?.chartAnalysis) {
                  const store = useTradingStore.getState();
                  store.setPriceLinesFromAnalysis(data.message.metadata.chartAnalysis);
                  store.clearDrawings('ai');
                  const patternDrawings = createPatternDrawings(data.message.metadata.chartAnalysis, store.ohlcv);
                  for (const d of patternDrawings) store.addDrawing(d);
                }
              } else if (data.type === 'error') {
                addAIMessage({ id: crypto.randomUUID(), role: 'assistant', content: `Error: ${data.error}`, timestamp: Date.now() });
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      addAIMessage({ id: crypto.randomUUID(), role: 'assistant', content: `Connection error: ${err}`, timestamp: Date.now() });
    } finally {
      setAIThinking(false);
      setAIStreamingText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const tradingQuickActions = [
    { label: 'Thoughts?', message: 'thoughts?' },
    { label: 'Analyze Chart', message: 'Analyze the current chart. What patterns do you see?' },
    { label: 'Generate Strategy', message: `Generate a PineScript strategy for ${selectedSymbol} based on your analysis of the current market conditions.` },
    { label: 'Risk Check', message: 'Given my current positions and risk parameters, how am I looking? Any concerns?' },
  ];

  const dashboardQuickActions = [
    { label: 'Review Trades', message: 'Review my recent trading activity. What patterns do you see in my wins and losses?' },
    { label: 'Win Rate', message: 'Break down my win rate by symbol. Which tokens am I best at trading and which should I avoid?' },
    { label: 'Behavioral Check', message: 'Analyze my trading behavior. Am I revenge trading, FOMO buying, cutting winners too early, or showing any other behavioral patterns?' },
    { label: 'Generate Learnings', message: 'Based on all my trade history and journal entries, generate behavioral learnings that I should remember for future trading.' },
  ];

  const intelligenceQuickActions = [
    { label: 'Knowledge Summary', message: 'Summarize everything in my knowledge base. What are the key themes and how many entries do I have in each category?' },
    { label: 'Pattern Analysis', message: 'What behavioral patterns have you documented? Which ones have the most interventions and which are most impactful?' },
    { label: 'Intervention Report', message: 'How accurate have your behavioral interventions been? Show me the full track record with details.' },
    { label: 'Learning Gaps', message: 'Based on my trading history vs my documented learnings, what behavioral patterns am I missing? Where are the blind spots?' },
  ];

  const quickActions = viewMode === 'intelligence' ? intelligenceQuickActions : viewMode === 'dashboard' ? dashboardQuickActions : tradingQuickActions;

  // Voice panel overlay
  if (showVoicePanel) {
    return (
      <Suspense fallback={
        <div className="flex flex-col h-full items-center justify-center">
          <div className="ai-thinking"><span /><span /><span /></div>
          <span className="text-xs text-[var(--cl-text-secondary)] mt-2">Loading Onyx...</span>
        </div>
      }>
        <VoicePanel onClose={() => setShowVoicePanel(false)} />
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[var(--cl-accent)] flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span>PhantomX AI</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={`status-dot ${aiIsThinking ? 'live' : 'disconnected'}`} />
          <span className="text-[10px]">{aiIsThinking ? 'Thinking...' : 'Ready'}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {aiMessages.length === 0 && !aiStreamingText && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--cl-accent)" strokeWidth="1.5" className="mb-3 opacity-30">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <p className="text-[12px] text-[var(--cl-text-faint)]">Ask me anything about the market</p>
            <p className="text-[10px] text-[var(--cl-text-secondary)] mt-1">Paste screenshots (Ctrl+V) or say &quot;thoughts?&quot;</p>
          </div>
        )}

        {aiMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming response */}
        {aiStreamingText && (
          <div className="flex gap-1.5">
            <div className="w-5 h-5 rounded-full bg-[var(--cl-accent-soft)] flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[8px] text-[var(--cl-accent)] font-semibold">AI</span>
            </div>
            <div className="glass-card p-2 max-w-[85%] text-[12px] cl-serif">
              <Markdown content={aiStreamingText} />
              <span className="inline-block w-1.5 h-4 bg-[var(--cl-accent)] ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {/* Thinking */}
        {aiIsThinking && !aiStreamingText && (
          <div className="flex gap-1.5 items-center">
            <div className="w-5 h-5 rounded-full bg-[var(--cl-accent-soft)] flex items-center justify-center flex-shrink-0">
              <span className="text-[8px] text-[var(--cl-accent)] font-semibold">AI</span>
            </div>
            <div className="ai-thinking"><span /><span /><span /></div>
            <span className="text-[10px] text-[var(--cl-text-secondary)]">Analyzing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <div className="px-3 py-2 flex gap-1.5 flex-wrap border-t border-[var(--cl-border)]">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => { setInput(action.message); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-[var(--cl-text-faint)] hover:text-[var(--cl-text-primary)] hover:border-[var(--cl-accent-border)] hover:bg-[var(--cl-fill-accent)] transition-colors"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Image Preview */}
      {pastedImage && (
        <div className="px-3 py-2 border-t border-[var(--cl-border)] bg-[var(--cl-bg-surface)]">
          <div className="relative inline-block">
            <img
              src={`data:image/png;base64,${pastedImage}`}
              alt="Pasted screenshot"
              className="max-h-24 rounded-lg border border-[var(--cl-border)] opacity-90"
            />
            <button
              onClick={() => setPastedImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--cl-error)] text-white flex items-center justify-center text-[10px] font-bold hover:scale-110 transition-transform"
            >
              x
            </button>
            <span className="text-[9px] text-[var(--cl-text-secondary)] block mt-1">Screenshot attached</span>
          </div>
        </div>
      )}

      {/* Autopilot Settings Panel — inline collapsible */}
      {showAutopilotPanel && (
        <div className="border-t border-[var(--cl-border)] bg-[var(--cl-bg-surface)] px-3 py-2.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cl-accent)" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span className="text-[11px] font-semibold text-[var(--cl-text-primary)] uppercase tracking-wider">Autopilot Settings</span>
            </div>
            <button onClick={() => setShowAutopilotPanel(false)} className="text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)] transition-colors p-0.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)]">
            <button
              onClick={() => setAutopilotMode('single')}
              disabled={isExecuting}
              className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all ${
                autopilotMode === 'single'
                  ? 'bg-[var(--cl-bg-surface)] text-[var(--cl-text-primary)] shadow-sm'
                  : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
              } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Single Symbol
            </button>
            <button
              onClick={() => setAutopilotMode('portfolio')}
              disabled={isExecuting}
              className={`flex-1 py-1 rounded-md text-[10px] font-medium transition-all ${
                autopilotMode === 'portfolio'
                  ? 'bg-[var(--cl-bg-surface)] text-[var(--cl-accent)] shadow-sm'
                  : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)]'
              } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Portfolio Manager
            </button>
          </div>

          {/* Portfolio-specific: Watchlist + Scan mode */}
          {autopilotMode === 'portfolio' && (
            <>
              {/* Scan mode */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--cl-text-secondary)]">Scan mode</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setAutopilotScanMode('watchlist')}
                    disabled={isExecuting}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      autopilotScanMode === 'watchlist'
                        ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                        : 'text-[var(--cl-text-secondary)] border border-transparent'
                    }`}
                  >
                    Watchlist
                  </button>
                  <button
                    onClick={() => setAutopilotScanMode('full_scan')}
                    disabled={isExecuting}
                    className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                      autopilotScanMode === 'full_scan'
                        ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                        : 'text-[var(--cl-text-secondary)] border border-transparent'
                    }`}
                  >
                    Full Scan
                  </button>
                </div>
              </div>

              {/* Watchlist chips */}
              {autopilotScanMode === 'watchlist' && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {watchlist.map(sym => (
                      <span key={sym} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)] text-[var(--cl-text-faint)]">
                        {shortSym(sym)}
                        {!isExecuting && (
                          <button
                            onClick={() => removeFromWatchlist(sym)}
                            className="text-[var(--cl-text-secondary)] hover:text-[var(--cl-error)] transition-colors ml-0.5"
                          >
                            x
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {!isExecuting && (
                    <div className="relative">
                      <input
                        type="text"
                        value={watchlistInput}
                        onChange={e => setWatchlistInput(e.target.value)}
                        placeholder="Search tokens to add..."
                        className="w-full px-2 py-1 rounded text-[10px] bg-[var(--cl-bg-page)] border border-[var(--cl-border-subtle)] text-[var(--cl-text-primary)] placeholder:text-[var(--cl-text-secondary)] outline-none focus:border-[var(--cl-accent-border)]"
                      />
                      {marketsLoading && (
                        <span className="absolute right-2 top-1 text-[9px] text-[var(--cl-text-secondary)]">Loading...</span>
                      )}
                      {filteredMarkets.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-0.5 bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] rounded shadow-lg max-h-32 overflow-y-auto z-50">
                          {filteredMarkets.map(m => (
                            <button
                              key={m.symbol}
                              onClick={() => { addToWatchlist(m.symbol); setWatchlistInput(''); }}
                              className="w-full flex items-center justify-between px-2 py-1 text-[10px] hover:bg-[var(--cl-fill-hover)] transition-colors"
                            >
                              <span className="text-[var(--cl-text-faint)] font-medium">{m.base}</span>
                              <span className="text-[8px] text-[var(--cl-text-secondary)] font-mono">{m.symbol}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Heartbeat interval */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--cl-text-secondary)]">Heartbeat</span>
            <div className="flex gap-1">
              {INTERVAL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setAutopilotInterval(opt.value)}
                  disabled={isExecuting}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    autopilotInterval === opt.value
                      ? 'bg-[var(--cl-accent-soft)] text-[var(--cl-accent)] border border-[var(--cl-accent-border)]'
                      : 'text-[var(--cl-text-secondary)] border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-trade toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] text-[var(--cl-text-secondary)] block">
                {autopilotAutoTrade ? 'Live Trading' : 'Advise Only'}
              </span>
              <span className="text-[9px] text-[var(--cl-text-secondary)]">
                {autopilotAutoTrade ? 'Will place real orders' : 'Analysis only — no orders'}
              </span>
            </div>
            <button
              onClick={() => setAutopilotAutoTrade(!autopilotAutoTrade)}
              disabled={isExecuting}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                autopilotAutoTrade ? 'bg-[var(--cl-accent)]' : 'bg-[var(--cl-border)]'
              } ${isExecuting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${
                autopilotAutoTrade ? 'translate-x-[22px]' : 'translate-x-[3px]'
              }`} />
            </button>
          </div>

          {autopilotAutoTrade && !isExecuting && (
            <div className="p-1.5 rounded bg-[var(--cl-fill-error)] border border-[var(--cl-error-border)] text-[9px] text-[var(--cl-error)]">
              Live trading ON — Claude will execute real trades on your Phemex account
            </div>
          )}

          {/* Start / Stop button */}
          <button
            onClick={async () => {
              if (isExecuting) {
                try {
                  await fetch('/api/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
                  setExecuting(false);
                } catch (err) {
                  console.error('[Autopilot] Stop failed:', err);
                }
              } else {
                const store = useTradingStore.getState();
                const riskLevel = store.riskParameters.level;
                const payload: Record<string, unknown> = {
                  action: 'start',
                  intervalMs: store.autopilotInterval,
                  riskLevel,
                  enableAutoTrade: store.autopilotAutoTrade,
                  maxDailyLossPercent: riskLevel === 'degen' ? 15 : riskLevel === 'aggressive' ? 10 : 5,
                  stopAfterKill: true,
                };
                if (store.autopilotMode === 'portfolio') {
                  payload.mode = 'portfolio';
                  payload.symbols = store.watchlist;
                  payload.scanMode = store.autopilotScanMode;
                  payload.maxPerTokenAllocation = riskLevel === 'degen' ? 40 : riskLevel === 'aggressive' ? 25 : 15;
                  payload.maxTotalExposure = riskLevel === 'degen' ? 90 : riskLevel === 'aggressive' ? 80 : 60;
                  payload.maxOpenPositions = riskLevel === 'degen' ? 8 : riskLevel === 'aggressive' ? 5 : 3;
                  payload.minCashReserve = riskLevel === 'degen' ? 10 : riskLevel === 'aggressive' ? 20 : 40;
                } else {
                  payload.mode = 'single';
                  payload.symbol = store.selectedSymbol;
                  payload.maxPositionPercent = riskLevel === 'degen' ? 15 : riskLevel === 'aggressive' ? 10 : 5;
                }
                try {
                  const res = await fetch('/api/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setExecuting(true);
                    setShowAutopilotPanel(false);
                    // Auto-switch to dashboard so user immediately sees agents working
                    setViewMode('dashboard');
                    addAIMessage({
                      id: `autopilot-start-${Date.now()}`,
                      role: 'assistant',
                      content: `**Autopilot is live.** Switched to Dashboard — you'll see trades, agent signals, and equity updates in real time. The Intelligence tab shows deeper agent analysis.`,
                      timestamp: Date.now(),
                      metadata: { isProactive: true, source: 'autopilot' },
                    });
                  } else if (data.error) {
                    addAIMessage({ id: `autopilot-err-${Date.now()}`, role: 'assistant', content: `**Autopilot failed to start:** ${data.error}`, timestamp: Date.now() });
                  }
                } catch (err) {
                  addAIMessage({ id: `autopilot-err-${Date.now()}`, role: 'assistant', content: `**Autopilot failed to start:** ${String(err)}`, timestamp: Date.now() });
                }
              }
            }}
            disabled={!isConnected}
            className={`w-full py-2 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-2 ${
              isExecuting
                ? 'bg-[var(--cl-fill-error-hover)] border border-[var(--cl-error-border)] text-[var(--cl-error)]'
                : isConnected
                  ? 'bg-[var(--cl-success)] text-[var(--cl-text-inverse)] hover:bg-[var(--cl-success-hover)] shadow-lg'
                  : 'bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)] text-[var(--cl-text-secondary)] cursor-not-allowed'
            }`}
          >
            {isExecuting ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
                Stop Autopilot
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                {autopilotMode === 'portfolio' ? 'Start Portfolio Autopilot' : 'Start Autopilot'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Composer — Claude-style unified input with inline controls */}
      <div className="p-3 border-t border-[var(--cl-border)]">
        <div className="relative bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] rounded-xl focus-within:border-[var(--cl-accent-border-focus)] focus-within:ring-2 focus-within:ring-[var(--cl-accent-focus-ring)] transition-all" style={{ boxShadow: 'var(--cl-shadow-composer)' }}>
          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={pastedImage ? 'Add a message about this image...' : 'Ask PhantomX... (Ctrl+V to paste screenshots)'}
            className="w-full bg-transparent px-3 pt-2.5 pb-1 text-[12px] text-[var(--cl-text-primary)] placeholder-[var(--cl-text-secondary)] resize-none focus:outline-none"
            rows={2}
            disabled={aiIsThinking}
          />

          {/* Bottom toolbar — Claude-style */}
          <div className="flex items-center justify-between px-2 pb-1.5">
            <div className="flex items-center gap-1">
              {/* Image upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={aiIsThinking}
                className="p-1.5 rounded-md text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-primary)] hover:bg-[var(--cl-fill-hover)] disabled:opacity-30 transition-colors"
                title="Attach image (Ctrl+V)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>

              {/* Divider */}
              <div className="w-px h-4 bg-[var(--cl-border)] mx-0.5" />

              {/* Risk Level Selector — Claude model-selector style */}
              <div className="relative">
                <button
                  onClick={() => setShowRiskMenu(!showRiskMenu)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-hover)] transition-colors"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    riskParameters.level === 'conservative' ? 'bg-[var(--cl-info)]' :
                    riskParameters.level === 'moderate' ? 'bg-[var(--cl-success)]' :
                    riskParameters.level === 'aggressive' ? 'bg-[var(--cl-warning)]' :
                    'bg-[var(--cl-error)]'
                  }`} />
                  {riskParameters.level.charAt(0).toUpperCase() + riskParameters.level.slice(1)}
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showRiskMenu && (
                  <div className="absolute bottom-full left-0 mb-1 bg-[var(--cl-bg-surface)] border border-[var(--cl-border)] rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                    {([
                      { level: 'conservative', label: 'Conservative', desc: 'Tight stops, small positions', color: 'var(--cl-info)' },
                      { level: 'moderate', label: 'Moderate', desc: 'Balanced risk/reward', color: 'var(--cl-success)' },
                      { level: 'aggressive', label: 'Aggressive', desc: 'Bigger positions, wider stops', color: 'var(--cl-warning)' },
                      { level: 'degen', label: 'Degen', desc: 'Full send, max leverage', color: 'var(--cl-error)' },
                    ] as const).map(opt => (
                      <button
                        key={opt.level}
                        onClick={() => { setRiskLevel(opt.level); setShowRiskMenu(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--cl-fill-hover)] transition-colors ${
                          riskParameters.level === opt.level ? 'bg-[var(--cl-fill-active)]' : ''
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
                        <div>
                          <div className="text-[11px] font-medium text-[var(--cl-text-primary)]">{opt.label}</div>
                          <div className="text-[9px] text-[var(--cl-text-secondary)]">{opt.desc}</div>
                        </div>
                        {riskParameters.level === opt.level && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--cl-accent)" strokeWidth="3" className="ml-auto">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="w-px h-4 bg-[var(--cl-border)] mx-0.5" />

              {/* Autopilot Toggle (on/off) */}
              <button
                onClick={async () => {
                  if (isExecuting) {
                    try {
                      await fetch('/api/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) });
                      setExecuting(false);
                    } catch { /* */ }
                  } else {
                    // If panel isn't open, open it so user can configure before starting
                    setShowAutopilotPanel(true);
                  }
                }}
                className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  isExecuting
                    ? 'text-[var(--cl-success)] bg-[rgba(0,210,106,0.1)] hover:bg-[rgba(0,210,106,0.15)]'
                    : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-hover)]'
                }`}
                title={isExecuting ? 'Stop Autopilot' : 'Open Autopilot Settings'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {isExecuting ? 'ON' : 'Auto'}
              </button>

              {/* Autopilot Settings Gear */}
              <button
                onClick={() => setShowAutopilotPanel(!showAutopilotPanel)}
                className={`p-1 rounded-md transition-colors ${
                  showAutopilotPanel
                    ? 'text-[var(--cl-accent)] bg-[var(--cl-fill-accent)]'
                    : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-hover)]'
                }`}
                title="Autopilot settings"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              {/* Divider */}
              <div className="w-px h-4 bg-[var(--cl-border)] mx-0.5" />

              {/* Voice (Onyx) */}
              <button
                onClick={() => setShowVoicePanel(!showVoicePanel)}
                className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                  showVoicePanel
                    ? 'text-[var(--cl-accent)] bg-[var(--cl-fill-accent)]'
                    : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-hover)]'
                }`}
                title="Onyx Voice Agent"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                Voice
              </button>
            </div>

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && !pastedImage) || aiIsThinking}
              className="p-1.5 rounded-lg bg-[var(--cl-accent)] text-white hover:bg-[var(--cl-accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AIMessage }) {
  const isUser = message.role === 'user';
  const isProactive = message.metadata?.isProactive;
  const [showThinking, setShowThinking] = useState(false);

  return (
    <div className={`flex gap-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUser ? 'bg-[var(--cl-fill-active)]' : isProactive ? 'bg-[rgba(255,193,7,0.15)]' : 'bg-[var(--cl-accent-soft)]'
      }`}>
        <span className={`text-[8px] font-semibold ${
          isUser ? 'text-[var(--cl-text-faint)]' : isProactive ? 'text-[var(--cl-warning)]' : 'text-[var(--cl-accent)]'
        }`}>
          {isUser ? 'U' : isProactive ? 'AP' : 'AI'}
        </span>
      </div>

      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {isProactive && (
          <span className="text-[9px] text-[var(--cl-warning)] font-medium uppercase tracking-wider block mb-0.5">Autopilot Insight</span>
        )}

        {message.metadata?.thinkingContent && (
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="text-[10px] text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] mb-1 flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transform transition-transform ${showThinking ? 'rotate-90' : ''}`}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Reasoning
          </button>
        )}

        {showThinking && message.metadata?.thinkingContent && (
          <div className="glass-card p-1.5 mb-1.5 text-[10px] text-[var(--cl-text-secondary)] italic max-h-28 overflow-y-auto">
            {message.metadata.thinkingContent}
          </div>
        )}

        {/* Attached image */}
        {message.metadata?.imageBase64 && (
          <div className="mb-2">
            <img
              src={`data:image/png;base64,${message.metadata.imageBase64}`}
              alt="Attached screenshot"
              className="max-w-full max-h-48 rounded-lg border border-[var(--cl-border)] opacity-90"
            />
          </div>
        )}

        <div className={`glass-card p-2 text-[12px] cl-serif ${
          isUser ? 'bg-[var(--cl-bg-hover)] border-[var(--cl-border)] whitespace-pre-wrap' :
          isProactive ? 'border-l-2 border-l-[var(--cl-warning)]' : ''
        }`}>
          {isUser ? message.content : <Markdown content={message.content} />}
        </div>

        <span className="text-[9px] text-[var(--cl-text-secondary)] mt-0.5 block">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
