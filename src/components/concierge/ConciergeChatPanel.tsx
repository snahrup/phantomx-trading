'use client';

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  memo,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  RotateCcw,
  Loader2,
  Wifi,
  WifiOff,
  Bot,
  User,
  MessageSquarePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import ToolCallBlock, { type ToolCallStatus } from './ToolCallBlock';
import {
  streamConciergeChat,
  loadChatHistory,
  resetConciergeChat,
  checkAxonHealth,
} from '@/lib/axon/concierge-stream';

// ===========================================================================
// Types
// ===========================================================================

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
}

// ===========================================================================
// Markdown renderer (matches existing AIChatPanel styling)
// ===========================================================================

const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="text-foreground" style={{ fontWeight: 600 }}>
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em
            className="text-muted-foreground"
            style={{ fontWeight: 100, fontStyle: 'italic' }}
          >
            {children}
          </em>
        ),
        h1: ({ children }) => (
          <h1
            className="text-[13px] text-foreground mb-1.5 mt-2 first:mt-0"
            style={{ fontWeight: 900 }}
          >
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2
            className="text-[12px] text-foreground mb-1 mt-2 first:mt-0"
            style={{ fontWeight: 600 }}
          >
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3
            className="text-[12px] text-foreground mb-1 mt-1.5 first:mt-0"
            style={{ fontWeight: 600 }}
          >
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-inside mb-1.5 space-y-0.5">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside mb-1.5 space-y-0.5">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-muted-foreground">{children}</li>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px] text-foreground">
                {children}
              </code>
            );
          }
          return (
            <code className="block p-2 rounded bg-muted font-mono text-[11px] text-foreground overflow-x-auto whitespace-pre">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-1.5 rounded-md overflow-hidden">{children}</pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-3 my-1.5 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-1.5">
            <table className="min-w-full text-[11px] border border-border">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="px-2 py-1 text-left border-b border-border bg-muted/50 font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-2 py-1 border-b border-border/50">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

// ===========================================================================
// Connection status indicator
// ===========================================================================

function ConnectionStatus({ connected }: { connected: boolean | null }) {
  if (connected === null) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Checking...</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 text-[10px] ${
        connected
          ? 'text-emerald-400/80'
          : 'text-red-400/80'
      }`}
    >
      {connected ? (
        <Wifi className="w-3 h-3" />
      ) : (
        <WifiOff className="w-3 h-3" />
      )}
      <span>{connected ? 'Axon Online' : 'Axon Offline'}</span>
    </div>
  );
}

// ===========================================================================
// Empty state
// ===========================================================================

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex flex-col items-center justify-center h-full px-8 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Bot className="w-7 h-7 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1.5">
        Phantom Trading Co. Concierge
      </h3>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
        Chat with the concierge — your AI proxy to the 22-agent team.
        Ask about agents, positions, strategies, or give direct orders.
      </p>
    </motion.div>
  );
}

// ===========================================================================
// Main component
// ===========================================================================

export default function ConciergeChatPanel() {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toolCallCounter = useRef(0);

  // Fix #6: RAF-batched streaming text accumulator
  const pendingTextRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  // -----------------------------------------------------------------------
  // Auto-scroll — Fix #7: use sentinel div with scrollIntoView
  // -----------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollSentinelRef.current?.scrollIntoView({ behavior: 'instant', block: 'end' });
    });
  }, []);

  // -----------------------------------------------------------------------
  // Health check on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    checkAxonHealth().then(setConnected);
    const interval = setInterval(() => {
      checkAxonHealth().then(setConnected);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // -----------------------------------------------------------------------
  // Load chat history on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (historyLoaded) return;
    loadChatHistory().then((history) => {
      if (history.length > 0) {
        setMessages(
          history.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
        );
      }
      setHistoryLoaded(true);
    });
  }, [historyLoaded, scrollToBottom]);

  // Fix #8: Scroll after history is painted (replaces fragile setTimeout)
  useLayoutEffect(() => {
    if (historyLoaded && messages.length > 0) {
      scrollToBottom();
    }
  }, [historyLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue('');
    setIsStreaming(true);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    // Add placeholder assistant message for streaming
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    scrollToBottom();

    // Track active tool call for pairing tool_result with tool_use
    let activeToolCallId: string | null = null;

    const abort = new AbortController();
    abortRef.current = abort;

    await streamConciergeChat(
      text,
      {
        onText: (chunk) => {
          // Fix #6: Batch text chunks with requestAnimationFrame
          pendingTextRef.current += chunk;
          if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(() => {
              const pending = pendingTextRef.current;
              pendingTextRef.current = '';
              rafIdRef.current = null;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + pending }
                    : m,
                ),
              );
              scrollToBottom();
            });
          }
        },

        onToolUse: (name, input) => {
          const toolId = `tool-${++toolCallCounter.current}`;
          activeToolCallId = toolId;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls ?? []),
                      { id: toolId, name, input, status: 'running' as const },
                    ],
                  }
                : m,
            ),
          );
          scrollToBottom();
        },

        onToolResult: (content) => {
          const finishedId = activeToolCallId;
          activeToolCallId = null;
          if (!finishedId) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    toolCalls: m.toolCalls?.map((tc) =>
                      tc.id === finishedId
                        ? { ...tc, result: content, status: 'completed' as const }
                        : tc,
                    ),
                  }
                : m,
            ),
          );
          scrollToBottom();
        },

        onDone: () => {
          // Flush any pending RAF-batched text
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
          const remaining = pendingTextRef.current;
          pendingTextRef.current = '';

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: m.content + remaining,
                    streaming: false,
                    // Mark any still-running tool calls as completed
                    toolCalls: m.toolCalls?.map((tc) =>
                      tc.status === 'running'
                        ? { ...tc, status: 'completed' as const }
                        : tc,
                    ),
                  }
                : m,
            ),
          );
          setIsStreaming(false);
          abortRef.current = null;
          scrollToBottom();
        },

        onError: (error) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: m.content || `Error: ${error}`,
                    streaming: false,
                    toolCalls: m.toolCalls?.map((tc) =>
                      tc.status === 'running'
                        ? { ...tc, status: 'error' as const }
                        : tc,
                    ),
                  }
                : m,
            ),
          );
          setIsStreaming(false);
          abortRef.current = null;
        },
      },
      abort.signal,
    );
  }, [inputValue, isStreaming, scrollToBottom]);

  // -----------------------------------------------------------------------
  // Stop streaming
  // -----------------------------------------------------------------------

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming
          ? {
              ...m,
              streaming: false,
              content: m.content || '(Cancelled)',
              toolCalls: m.toolCalls?.map((tc) =>
                tc.status === 'running'
                  ? { ...tc, status: 'error' as const }
                  : tc,
              ),
            }
          : m,
      ),
    );
  }, []);

  // -----------------------------------------------------------------------
  // Reset conversation
  // -----------------------------------------------------------------------

  const resetConversation = useCallback(async () => {
    if (isStreaming) stopStreaming();
    const ok = await resetConciergeChat();
    if (ok) {
      setMessages([]);
    }
  }, [isStreaming, stopStreaming]);

  // -----------------------------------------------------------------------
  // Form submit & key handling
  // -----------------------------------------------------------------------

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <span className="text-xs font-semibold text-foreground">
              Concierge
            </span>
            <span className="text-[10px] text-muted-foreground ml-1.5">
              Phantom Trading Co.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ConnectionStatus connected={connected} />

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={resetConversation}
            disabled={isStreaming}
            title="Reset conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Message list */}
      <ScrollArea ref={scrollRef} className="flex-1 overflow-hidden">
        <div className="px-4 py-3 space-y-3">
          {messages.length === 0 && !isStreaming && <EmptyState />}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* Avatar for assistant */}
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-foreground'
                  }`}
                >
                  {/* Tool calls (assistant only) */}
                  {msg.role === 'assistant' &&
                    msg.toolCalls &&
                    msg.toolCalls.length > 0 && (
                      <div className="mb-1.5">
                        {msg.toolCalls.map((tc) => (
                          <ToolCallBlock
                            key={tc.id}
                            name={tc.name}
                            input={tc.input}
                            result={tc.result}
                            status={tc.status}
                          />
                        ))}
                      </div>
                    )}

                  {/* Message content */}
                  {msg.content ? (
                    msg.role === 'assistant' ? (
                      <Markdown content={msg.content} />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )
                  ) : (
                    msg.streaming && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-[11px]">Thinking...</span>
                      </div>
                    )
                  )}
                </div>

                {/* Avatar for user */}
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center ml-2 mt-0.5 shrink-0">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Fix #7: Sentinel div for reliable scrollIntoView */}
          <div ref={scrollSentinelRef} aria-hidden="true" />
        </div>
      </ScrollArea>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-border shrink-0"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message the concierge..."
            rows={1}
            disabled={!connected}
            className="flex-1 resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{ minHeight: '36px', maxHeight: '120px' }}
          />

          {isStreaming ? (
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              onClick={stopStreaming}
              title="Stop"
            >
              <div className="w-2.5 h-2.5 rounded-sm bg-white" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              disabled={!inputValue.trim() || !connected}
              title="Send"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {!connected && connected !== null && (
          <p className="text-[10px] text-red-400/80 mt-1.5">
            Cannot reach Axon daemon at localhost:8400. Make sure it is running.
          </p>
        )}
      </form>
    </div>
  );
}
