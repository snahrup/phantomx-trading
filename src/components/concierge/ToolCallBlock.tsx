'use client';

import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Wrench, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolCallStatus = 'running' | 'completed' | 'error';

export interface ToolCallBlockProps {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  status: ToolCallStatus;
}

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'running':
      return (
        <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
      );
    case 'completed':
      return <Check className="w-3 h-3 text-emerald-400" />;
    case 'error':
      return <X className="w-3 h-3 text-red-400" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ToolCallBlock = memo(function ToolCallBlock({
  name,
  input,
  result,
  status,
}: ToolCallBlockProps) {
  const [open, setOpen] = useState(false);

  const hasContent = Object.keys(input).length > 0 || !!result;

  return (
    <div className="my-1.5 rounded-md border border-border/50 bg-muted/30 overflow-hidden text-xs">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => hasContent && setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors',
          hasContent && 'hover:bg-muted/50 cursor-pointer',
          !hasContent && 'cursor-default',
        )}
      >
        {/* Expand chevron */}
        {hasContent && (
          <motion.div
            initial={false}
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </motion.div>
        )}

        <Wrench className="w-3 h-3 text-muted-foreground shrink-0" />

        <span className="font-mono text-muted-foreground truncate">
          {name}
        </span>

        <span className="ml-auto shrink-0">
          <StatusIcon status={status} />
        </span>
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {open && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-2 border-t border-border/30">
              {/* Input */}
              {Object.keys(input).length > 0 && (
                <div className="pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Input
                  </span>
                  <pre className="mt-1 p-2 rounded bg-background/60 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {JSON.stringify(input, null, 2)}
                  </pre>
                </div>
              )}

              {/* Result */}
              {result && (
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Result
                  </span>
                  <pre className="mt-1 p-2 rounded bg-background/60 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ToolCallBlock;
