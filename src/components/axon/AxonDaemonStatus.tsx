'use client';

import { useAxonStore } from '@/store/axon-store';
import { cn } from '@/lib/utils';
import { Loader2, CheckCircle2, WifiOff } from 'lucide-react';

/**
 * AxonDaemonStatus — Persistent connection status indicator.
 * Renders in the root layout so it's visible on ALL pages.
 *
 * States:
 *  - Daemon offline / reconnecting: amber banner with pulse, shows retry count
 *  - Just reconnected: brief green flash that fades out after 3s
 *  - Daemon online & stable: renders nothing
 */
export default function AxonDaemonStatus() {
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const reconnecting = useAxonStore((s) => s.reconnecting);
  const justReconnected = useAxonStore((s) => s.justReconnected);
  const failedAttempts = useAxonStore((s) => s.failedAttempts);

  // Nothing to show when stable
  if (daemonOnline && !justReconnected) return null;

  // Brief "connected" flash
  if (daemonOnline && justReconnected) {
    return (
      <div
        className={cn(
          'fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]',
          'flex items-center gap-2 px-4 py-2 rounded-lg',
          'bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-sm',
          'text-emerald-500 text-xs font-medium',
          'shadow-lg shadow-emerald-500/10',
          'animate-in fade-in slide-in-from-bottom-2 duration-300',
        )}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Axon daemon connected</span>
      </div>
    );
  }

  // Offline / reconnecting
  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-[100]',
        'flex items-center gap-2 px-4 py-2 rounded-lg',
        'bg-amber-500/10 border border-amber-500/30 backdrop-blur-sm',
        'text-amber-500 text-xs font-medium',
        'shadow-lg shadow-amber-500/10',
      )}
    >
      {reconnecting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <WifiOff className="w-3.5 h-3.5" />
      )}
      <span>
        Axon daemon offline — reconnecting
        {failedAttempts > 1 && (
          <span className="text-amber-500/60 ml-1">
            ({failedAttempts} attempts)
          </span>
        )}
      </span>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
    </div>
  );
}
