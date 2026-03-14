'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAxonStore } from '@/store/axon-store';
import { useTradingStore } from '@/store/trading-store';
import { getAxonClient } from '@/lib/axon/client';
import TradeCloseCard from './TradeCloseCard';
import type { FeedMessage, AgentRole, TradeCloseEvent } from '@/types/mission-control';
import { AGENT_ROLE_COLORS } from '@/types/mission-control';

interface AgentFeedPanelProps {
  tradeCloseEvents: TradeCloseEvent[];
  onDismissClose: (id: string) => void;
}

function classifyRole(agentName: string): AgentRole {
  const lower = agentName.toLowerCase();
  if (lower.includes('scanner') || lower.includes('research') || lower.includes('on-chain') || lower.includes('sentiment')) return 'research';
  if (lower.includes('strategy') || lower.includes('meta')) return 'strategy';
  if (lower.includes('risk')) return 'risk';
  if (lower.includes('exec') || lower.includes('trader')) return 'execution';
  return 'research';
}

export default function AgentFeedPanel({ tradeCloseEvents, onDismissClose }: AgentFeedPanelProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isFeedCollapsed = useTradingStore(s => s.isFeedCollapsed);
  const setIsFeedCollapsed = useTradingStore(s => s.setIsFeedCollapsed);

  const activity = useAxonStore(s => s.agentEvents);
  const reconnecting = useAxonStore(s => s.reconnecting);

  const [localMessages, setLocalMessages] = useState<FeedMessage[]>([]);

  // Convert axon activity to feed messages
  useEffect(() => {
    const messages: FeedMessage[] = activity.map((a: any) => ({
      id: a.id || crypto.randomUUID(),
      timestamp: new Date(a.timestamp || a.created_at),
      agentName: a.agent_name || a.agentName || 'System',
      agentRole: classifyRole(a.agent_name || a.agentName || ''),
      content: a.message || a.content || a.description || JSON.stringify(a),
    }));
    setLocalMessages(messages);
  }, [activity]);

  // Auto-scroll
  useEffect(() => {
    if (!userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [localMessages, userScrolled]);

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
        <button
          onClick={() => setIsFeedCollapsed(true)}
          className="p-1 rounded hover:bg-muted cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
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

        {localMessages.map(msg => (
          <div
            key={msg.id}
            className={msg.isUser
              ? 'bg-purple-500/10 border-l-2 border-purple-400 px-2 py-1 rounded-r'
              : ''
            }
          >
            <span className="text-zinc-600 text-[10px] mr-1.5">{formatTime(msg.timestamp)}</span>
            <span className={`font-medium mr-1 ${AGENT_ROLE_COLORS[msg.agentRole]}`}>
              {msg.agentName}:
            </span>
            <span className="text-foreground/80">{msg.content}</span>
          </div>
        ))}
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
