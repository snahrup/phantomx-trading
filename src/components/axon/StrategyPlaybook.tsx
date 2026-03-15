'use client';

// ============================================================================
// PhantomX — Strategy Playbook Panel
// ============================================================================
// Fetches and displays strategies/active-strategy-playbook.md from the
// Paperclip knowledge directory. Renders as formatted markdown with a
// last-modified timestamp and manual refresh button.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { RefreshCcw, BookOpen, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ----- Types -----

interface StrategyPlaybookProps {
  /** Optional className for the outer container */
  className?: string;
}

// ----- Constants -----

const PLAYBOOK_PATH = 'strategies/active-strategy-playbook.md';

// ----- Helpers -----

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ----- Component -----

export default function StrategyPlaybook({ className }: StrategyPlaybookProps) {
  const [content, setContent] = useState<string | null>(null);
  const [modified, setModified] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchPlaybook = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/knowledge/files?path=${encodeURIComponent(PLAYBOOK_PATH)}`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = await res.json();
      setContent(data.content ?? '');
      setModified(data.modified ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaybook();
  }, [fetchPlaybook]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'rounded-xl border border-border bg-card overflow-hidden flex flex-col',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-3 h-3 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">Active Playbook</span>
        </div>
        <div className="flex items-center gap-2">
          {modified && (
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <Clock className="w-2.5 h-2.5" />
              {formatDate(modified)}
            </span>
          )}
          <button
            onClick={fetchPlaybook}
            disabled={loading}
            className={cn(
              'p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
              loading && 'animate-spin',
            )}
            title="Refresh playbook"
          >
            <RefreshCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && !content && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-3 bg-muted rounded animate-pulse" style={{ width: `${80 - i * 10}%` }} />
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertTriangle className="w-6 h-6 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Failed to load playbook</p>
            <button
              onClick={fetchPlaybook}
              className="mt-2 text-[10px] text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {content && !error && (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-a:text-primary prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-table:text-xs prose-th:text-foreground prose-td:text-muted-foreground prose-hr:border-border prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-p:text-xs prose-li:text-xs">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </motion.div>
  );
}
