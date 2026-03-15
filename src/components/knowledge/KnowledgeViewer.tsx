'use client';

import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import {
  Copy, Check, Clock, FileText, FileJson, File,
  ChevronRight,
} from 'lucide-react';
import { Skeleton } from '@/components/motion';

// ----- Types -----

interface KnowledgeViewerProps {
  content: string | null;
  filePath: string | null;
  modified: string | null;
  loading: boolean;
}

// ----- Helpers -----

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

function isJson(path: string): boolean {
  return path.endsWith('.json');
}

function isMarkdown(path: string): boolean {
  return path.endsWith('.md');
}

// ----- JSON Viewer -----

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function JsonViewer({ content }: { content: string }) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }, [content]);

  return (
    <pre className="text-xs font-mono leading-relaxed text-[var(--cl-text-secondary)] whitespace-pre-wrap break-words p-4 rounded-lg bg-[var(--cl-bg-muted)] border border-[var(--cl-border)] overflow-x-auto">
      {formatted.split('\n').map((line, i) => {
        // HTML-escape FIRST to prevent XSS, then apply syntax highlighting
        const safe = escapeHtml(line);
        const highlighted = safe
          .replace(/&quot;([^&]*)&quot;:/g, '<key>&quot;$1&quot;</key>:')
          .replace(/: &quot;([^&]*)&quot;/g, ': <str>&quot;$1&quot;</str>')
          .replace(/: (-?\d+\.?\d*)/g, ': <num>$1</num>')
          .replace(/: (true|false|null)/g, ': <bool>$1</bool>');

        return (
          <div key={i} className="flex">
            <span className="inline-block w-8 text-right mr-3 text-[var(--cl-text-faint)] select-none tabular-nums">
              {i + 1}
            </span>
            <span
              dangerouslySetInnerHTML={{
                __html: highlighted
                  .replace(/<key>/g, '<span style="color: var(--cl-info)">')
                  .replace(/<\/key>/g, '</span>')
                  .replace(/<str>/g, '<span style="color: var(--cl-success)">')
                  .replace(/<\/str>/g, '</span>')
                  .replace(/<num>/g, '<span style="color: var(--cl-warning)">')
                  .replace(/<\/num>/g, '</span>')
                  .replace(/<bool>/g, '<span style="color: var(--cl-accent)">')
                  .replace(/<\/bool>/g, '</span>'),
              }}
            />
          </div>
        );
      })}
    </pre>
  );
}

// ----- Markdown Viewer -----

function MarkdownViewer({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-[var(--cl-text-primary)] prose-p:text-[var(--cl-text-secondary)] prose-strong:text-[var(--cl-text-primary)] prose-a:text-primary prose-code:text-primary prose-code:bg-[var(--cl-bg-muted)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-[var(--cl-bg-muted)] prose-pre:border prose-pre:border-[var(--cl-border)] prose-table:text-xs prose-th:text-[var(--cl-text-primary)] prose-td:text-[var(--cl-text-secondary)] prose-hr:border-[var(--cl-border)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ----- Main Component -----

export default function KnowledgeViewer({ content, filePath, modified, loading }: KnowledgeViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Empty state
  if (!filePath && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-[var(--cl-fill-control)] flex items-center justify-center mb-4">
          <FileText className="w-6 h-6 text-[var(--cl-text-muted)]" strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-semibold text-[var(--cl-text-primary)] mb-1">Select a file</h3>
        <p className="text-xs text-[var(--cl-text-muted)] max-w-xs leading-relaxed">
          Browse the file tree or use the quick-access buttons to view knowledge base files.
        </p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Skeleton height="20px" width="60%" />
        </div>
        <Skeleton height="12px" width="40%" />
        <div className="space-y-2 mt-6">
          <Skeleton height="12px" width="100%" />
          <Skeleton height="12px" width="90%" />
          <Skeleton height="12px" width="95%" />
          <Skeleton height="12px" width="80%" />
          <Skeleton height="12px" width="85%" />
          <Skeleton height="12px" width="70%" />
        </div>
      </div>
    );
  }

  // Breadcrumb segments
  const segments = filePath?.split('/') ?? [];

  return (
    <motion.div
      key={filePath}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--cl-border)] shrink-0">
        <div className="flex items-center gap-1 text-xs text-[var(--cl-text-muted)] min-w-0 overflow-hidden">
          {/* Breadcrumb */}
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-[var(--cl-text-faint)]" />}
              <span className={i === segments.length - 1 ? 'text-[var(--cl-text-primary)] font-medium truncate' : 'truncate'}>
                {seg}
              </span>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-3">
          {/* Modified timestamp */}
          {modified && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--cl-text-faint)]">
              <Clock className="w-3 h-3" />
              {formatDate(modified)}
            </span>
          )}

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--cl-text-muted)] hover:text-[var(--cl-text-primary)] hover:bg-[var(--cl-fill-hover)] transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <><Check className="w-3 h-3 text-[var(--cl-success)]" /><span className="text-[var(--cl-success)]">Copied</span></>
            ) : (
              <><Copy className="w-3 h-3" /><span>Copy</span></>
            )}
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4">
        {content && filePath && isJson(filePath) && <JsonViewer content={content} />}
        {content && filePath && isMarkdown(filePath) && <MarkdownViewer content={content} />}
        {content && filePath && !isJson(filePath) && !isMarkdown(filePath) && (
          <pre className="text-xs font-mono text-[var(--cl-text-secondary)] whitespace-pre-wrap break-words">
            {content}
          </pre>
        )}
      </div>
    </motion.div>
  );
}
