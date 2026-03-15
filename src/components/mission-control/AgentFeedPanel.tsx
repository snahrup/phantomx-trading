'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAxonStore } from '@/store/axon-store';
import { useTradingStore } from '@/store/trading-store';
import { getAxonClient } from '@/lib/axon/client';
import TradeCloseCard from './TradeCloseCard';
import type { FeedMessage, AgentRole, TradeCloseEvent } from '@/types/mission-control';
import type { AxonIssueComment } from '@/lib/axon/types';
import { AGENT_ROLE_COLORS } from '@/types/mission-control';

interface AgentFeedPanelProps {
  tradeCloseEvents: TradeCloseEvent[];
  onDismissClose: (id: string) => void;
}

function formatAction(action: string): string {
  return (action || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function classifyRole(agentName: string): AgentRole {
  const lower = agentName.toLowerCase();
  if (lower.includes('scanner') || lower.includes('research') || lower.includes('on-chain') || lower.includes('sentiment')) return 'research';
  if (lower.includes('strategy') || lower.includes('meta')) return 'strategy';
  if (lower.includes('risk')) return 'risk';
  if (lower.includes('exec') || lower.includes('trader')) return 'execution';
  return 'research';
}

/** Extract rich content from an activity detail object, with priority ordering. */
function extractRichContent(detail: Record<string, unknown>, action: string): string {
  // 1. Issue comment content (actual debate text)
  const commentContent = (detail.content || detail.comment_content) as string | undefined;
  if (commentContent && typeof commentContent === 'string') {
    return commentContent.length > 300 ? commentContent.slice(0, 300) + '...' : commentContent;
  }

  // 2. Heartbeat log text (agent thoughts — truncate)
  const logText = detail.log_text as string | undefined;
  if (logText && typeof logText === 'string') {
    return logText.length > 200 ? logText.slice(0, 200) + '...' : logText;
  }

  // 3. Recommendation
  const recommendation = detail.recommendation as string | undefined;
  if (recommendation && typeof recommendation === 'string') {
    return recommendation.length > 300 ? recommendation.slice(0, 300) + '...' : recommendation;
  }

  // 4. Thinking text
  const thinking = detail.thinking_text as string | undefined;
  if (thinking && typeof thinking === 'string') {
    return thinking.length > 200 ? thinking.slice(0, 200) + '...' : thinking;
  }

  // 5. Findings array
  const findings = detail.findings as string[] | undefined;
  if (Array.isArray(findings) && findings.length > 0) {
    return findings.slice(0, 3).join(' | ');
  }

  // 6. Decisions JSON
  const decisions = detail.decisions_json as string | undefined;
  if (decisions && typeof decisions === 'string') {
    try {
      const parsed = JSON.parse(decisions);
      if (Array.isArray(parsed)) return parsed.slice(0, 2).map((d: any) => d.summary || d.decision || JSON.stringify(d)).join(' | ');
      if (parsed.summary) return parsed.summary;
    } catch { /* ignore */ }
  }

  // 7. Summary/message/description fallback
  const summary = (detail.summary || detail.message || detail.description) as string | undefined;
  if (summary && typeof summary === 'string') {
    return summary.length > 300 ? summary.slice(0, 300) + '...' : summary;
  }

  // 8. Final fallback: formatted action label
  return formatAction(action);
}

/** Map wave number to label */
const WAVE_LABELS: Record<number, string> = {
  1: 'Research',
  2: 'Debate',
  3: 'Risk',
  4: 'Strategy',
  5: 'Execution',
};

// Actions that are just lifecycle noise — suppress from the feed
const SUPPRESSED_ACTIONS = new Set([
  'heartbeat_started', 'heartbeat_failed', 'heartbeat_skipped',
  'agent_paused', 'agent_resumed', 'wake_all',
]);

/** Border color class for comment_type */
const COMMENT_TYPE_STYLES: Record<string, string> = {
  finding: 'border-l-2 border-blue-400 pl-2',
  argument: 'border-l-2 border-amber-400 pl-2',
  ruling: 'border-l-2 border-emerald-400 pl-2 font-medium',
  recommendation: 'border-l-2 border-purple-400 pl-2',
  disagreement_detected: 'border-l-2 border-red-400 pl-2',
};

export default function AgentFeedPanel({ tradeCloseEvents, onDismissClose }: AgentFeedPanelProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [feedFilter, setFeedFilter] = useState<'all' | 'focused'>('focused');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isFeedCollapsed = useTradingStore(s => s.isFeedCollapsed);
  const setIsFeedCollapsed = useTradingStore(s => s.setIsFeedCollapsed);
  const activeMissionIssueId = useTradingStore(s => s.activeMissionIssueId);
  const focusedSymbol = useTradingStore(s => s.focusedPositionSymbol);

  const activity = useAxonStore(s => s.agentEvents);
  const agents = useAxonStore(s => s.agents);
  const reconnecting = useAxonStore(s => s.reconnecting);
  const fetchActivity = useAxonStore(s => s.fetchActivity);

  const [localMessages, setLocalMessages] = useState<FeedMessage[]>([]);
  const [commentMessages, setCommentMessages] = useState<FeedMessage[]>([]);

  // Build agent ID → name lookup
  const agentNameMap = useCallback(() => {
    const map: Record<string, string> = {};
    for (const a of agents) {
      map[a.id] = a.name;
    }
    return map;
  }, [agents]);

  // Fetch historical activity on mount
  useEffect(() => {
    fetchActivity(50);
  }, [fetchActivity]);

  // Poll issue comments for active mission
  useEffect(() => {
    if (!activeMissionIssueId) {
      setCommentMessages([]);
      return;
    }

    let cancelled = false;

    const fetchComments = async () => {
      try {
        const axon = getAxonClient();
        const result = await axon.getIssueComments(activeMissionIssueId);
        if (cancelled || !result.ok) return;

        const nameMap = agentNameMap();
        const msgs: FeedMessage[] = result.data.map((c: AxonIssueComment) => {
          const agentName = c.agent_id ? (nameMap[c.agent_id] || 'Agent') : 'System';
          return {
            id: `comment-${c.id}`,
            timestamp: new Date(c.created_at),
            agentName,
            agentRole: classifyRole(agentName),
            content: c.content.length > 300 ? c.content.slice(0, 300) + '...' : c.content,
            commentType: c.comment_type ?? undefined,
            wave: c.wave ?? undefined,
          };
        });
        setCommentMessages(msgs);
      } catch {
        // Silently ignore fetch errors
      }
    };

    fetchComments();
    const interval = setInterval(fetchComments, 5_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeMissionIssueId, agentNameMap]);

  // Convert axon activity to feed messages
  useEffect(() => {
    const nameMap = agentNameMap();
    const messages: FeedMessage[] = activity
      .filter((a: any) => !SUPPRESSED_ACTIONS.has(a.action))
      .map((a: any) => {
      // Extract agent name from detail (parsed detail_json), then fall back
      // to agent_id lookup so we always show a real name instead of "System".
      const detail = a.detail || {};
      const agentName = detail.agent_name || detail.analyst_name
        || (a.agent_id && nameMap[a.agent_id])
        || 'System';

      // Extract rich content from detail with priority ordering
      const issueTitle = detail.issue_title ? `[${detail.issue_title}] ` : '';
      const richContent = extractRichContent(detail, a.action);
      const content = `${issueTitle}${richContent}`;

      return {
        id: a.id || crypto.randomUUID(),
        timestamp: new Date(a.timestamp || a.created_at),
        agentName,
        agentRole: classifyRole(agentName),
        content,
        commentType: detail.comment_type as FeedMessage['commentType'],
        wave: typeof detail.wave === 'number' ? detail.wave : undefined,
      };
    });
    setLocalMessages(messages);
  }, [activity, agentNameMap]);

  // Merge activity messages and comment messages, sorted by time, deduped
  const allMessages = useMemo(() => {
    const seen = new Set<string>();
    const merged: FeedMessage[] = [];
    for (const msg of [...localMessages, ...commentMessages]) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
      merged.push(msg);
    }
    merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return merged;
  }, [localMessages, commentMessages]);

  // Filter messages by focused symbol (purely client-side — agents are NOT affected)
  const visibleMessages = useMemo(() => {
    if (feedFilter === 'all' || !focusedSymbol) return allMessages;

    // Build matching tokens from the focused symbol, e.g. "BTC/USDT:USDT" → ["BTC", "BTC/USDT", "BTCUSDT"]
    const base = focusedSymbol.split('/')[0]; // "BTC"
    const tokens = [
      focusedSymbol,                                    // BTC/USDT:USDT
      focusedSymbol.replace(':USDT', ''),               // BTC/USDT
      base,                                             // BTC
      base + 'USDT',                                    // BTCUSDT
      base.toLowerCase(),                               // btc
    ];

    return allMessages.filter(msg => {
      // Always show user messages and system-wide events (rulings, kill switch, etc.)
      if (msg.isUser) return true;
      if (msg.commentType === 'ruling') return true;

      // Match symbol in content
      const content = msg.content.toUpperCase();
      return tokens.some(t => content.includes(t.toUpperCase()));
    });
  }, [allMessages, feedFilter, focusedSymbol]);

  // Auto-scroll when visible message count changes (not on every re-render)
  useEffect(() => {
    if (!userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleMessages.length, userScrolled]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setUserScrolled(scrollHeight - scrollTop - clientHeight > 50);
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const msg = input.trim();
    setInput('');
    setSending(true);

    // Add user message locally
    setLocalMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      agentName: 'You',
      agentRole: 'user' as AgentRole,
      content: msg,
      isUser: true,
    }]);

    try {
      const axon = getAxonClient();
      await axon.sendChatMessage(msg);
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  if (isFeedCollapsed) {
    return (
      <button
        onClick={() => setIsFeedCollapsed(false)}
        className="w-8 bg-card border border-border rounded-lg flex items-center justify-center hover:bg-muted cursor-pointer transition-colors"
      >
        <ChevronLeft className="w-4 h-4 text-muted-foreground" />
      </button>
    );
  }

  const formatTime = (d: Date) => {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col bg-card border border-border rounded-lg min-w-[240px] w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          Agent Feed
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {reconnecting && <span className="text-xs text-amber-400 ml-1">reconnecting...</span>}
        </span>
        <div className="flex items-center gap-1">
          {focusedSymbol && (
            <button
              onClick={() => setFeedFilter(f => f === 'all' ? 'focused' : 'all')}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                feedFilter === 'focused'
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'bg-muted text-muted-foreground border border-transparent hover:bg-muted/80'
              }`}
              title={feedFilter === 'focused' ? `Showing ${focusedSymbol.split('/')[0]} only` : 'Showing all tokens'}
            >
              <Filter className="w-3 h-3" />
              {feedFilter === 'focused' ? focusedSymbol.split('/')[0] : 'ALL'}
            </button>
          )}
          <button
            onClick={() => setIsFeedCollapsed(true)}
          className="p-1 rounded hover:bg-muted cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-xs"
      >
        {/* Pinned trade close cards */}
        <AnimatePresence>
          {tradeCloseEvents.map(ev => (
            <TradeCloseCard key={ev.id} event={ev} onDismiss={() => onDismissClose(ev.id)} />
          ))}
        </AnimatePresence>

        {visibleMessages.map(msg => {
          const typeStyle = msg.commentType && COMMENT_TYPE_STYLES[msg.commentType]
            ? COMMENT_TYPE_STYLES[msg.commentType]
            : '';
          const userStyle = msg.isUser
            ? 'bg-purple-500/10 border-l-2 border-purple-400 px-2 py-1 rounded-r'
            : '';
          const baseStyle = typeStyle && !msg.isUser ? `${typeStyle} py-0.5 rounded-r` : '';

          return (
            <div key={msg.id} className={`${userStyle} ${baseStyle}`}>
              <span className="text-zinc-600 text-[10px] mr-1.5">{formatTime(msg.timestamp)}</span>
              {msg.wave != null && (
                <span className="inline-block text-[9px] font-mono bg-zinc-700/60 text-zinc-300 px-1 rounded mr-1" title={WAVE_LABELS[msg.wave] || `Wave ${msg.wave}`}>
                  W{msg.wave}
                </span>
              )}
              <span className={`font-medium mr-1 ${AGENT_ROLE_COLORS[msg.agentRole]}`}>
                {msg.agentName}:
              </span>
              <span className="text-foreground/80">{msg.content}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="px-3 py-2 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message agents..."
            className="flex-1 bg-muted px-3 py-1.5 rounded text-sm text-foreground placeholder:text-muted-foreground border-0 outline-none"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
