'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAxonClient } from '@/lib/axon/client';
import { useAxonStore } from '@/store/axon-store';
import type { AxonActivity } from '@/lib/axon/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Activity, Brain, Zap, AlertTriangle, CheckCircle2,
  RefreshCw, Clock, DollarSign,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Action type styling
// ---------------------------------------------------------------------------

const ACTION_STYLE: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  agent_decision:       { icon: Brain,          color: 'text-violet-400',  label: 'Decision' },
  heartbeat_completed:  { icon: CheckCircle2,   color: 'text-emerald-400', label: 'Heartbeat' },
  heartbeat_started:    { icon: Zap,            color: 'text-blue-400',    label: 'Wake' },
  heartbeat_failed:     { icon: AlertTriangle,  color: 'text-red-400',     label: 'Failed' },
  heartbeat_skipped:    { icon: Clock,          color: 'text-zinc-500',    label: 'Skipped' },
  issue_started:        { icon: Activity,       color: 'text-amber-400',   label: 'Issue Started' },
  issue_completed:      { icon: CheckCircle2,   color: 'text-emerald-400', label: 'Issue Done' },
  trading_pipeline_complete: { icon: Zap,       color: 'text-primary',     label: 'Pipeline Done' },
  manual_wakeup:        { icon: Zap,            color: 'text-sky-400',     label: 'Manual Wake' },
  bulk_pause:           { icon: AlertTriangle,  color: 'text-amber-400',   label: 'Paused All' },
  bulk_resume:          { icon: CheckCircle2,   color: 'text-emerald-400', label: 'Resumed All' },
  kill_switch:          { icon: AlertTriangle,  color: 'text-red-500',     label: 'Kill Switch' },
};

const DEFAULT_STYLE = { icon: Activity, color: 'text-muted-foreground', label: 'Activity' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByDate(entries: AxonActivity[]): Map<string, AxonActivity[]> {
  const groups = new Map<string, AxonActivity[]>();
  for (const entry of entries) {
    // Axon timestamps may be ISO "2026-03-15T17:45:26" or SQLite "2026-03-15 17:45:26"
    const date = entry.timestamp.slice(0, 10); // Always "YYYY-MM-DD"
    const existing = groups.get(date);
    if (existing) existing.push(entry);
    else groups.set(date, [entry]);
  }
  return groups;
}

function formatTime(ts: string): string {
  try {
    // Normalize SQLite "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SS"
    const normalized = ts.includes('T') ? ts : ts.replace(' ', 'T');
    return new Date(normalized).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString([], {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AxonJournalPanel() {
  const [entries, setEntries] = useState<AxonActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const daemonOnline = useAxonStore((s) => s.daemonOnline);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    const result = await getAxonClient().getActivityLog(200);
    if (result.ok) {
      // Normalize: API returns detail_json (string) + SQLite timestamps
      const normalized: AxonActivity[] = result.data.map((row: any) => {
        let detail: Record<string, unknown> = {};
        if (typeof row.detail_json === 'string') {
          try { detail = JSON.parse(row.detail_json); } catch { detail = {}; }
        } else if (row.detail && typeof row.detail === 'object') {
          detail = row.detail;
        }
        const ts = typeof row.timestamp === 'string' && !row.timestamp.includes('T')
          ? row.timestamp.replace(' ', 'T')
          : row.timestamp;
        return { ...row, detail, timestamp: ts };
      });
      // Newest first
      setEntries(normalized.reverse());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  // Also refresh when SSE pushes new agent events
  const eventCount = useAxonStore((s) => s.agentEvents.length);
  useEffect(() => {
    if (eventCount > 0) fetchLog();
  }, [eventCount, fetchLog]);

  if (!daemonOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Activity className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">Axon daemon offline</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Start the daemon to see activity</p>
      </div>
    );
  }

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const grouped = groupByDate(entries);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Activity Journal</span>
        <button onClick={fetchLog} className="text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <Activity className="w-8 h-8 text-muted-foreground/20 mb-2" strokeWidth={1} />
            <p className="text-xs text-muted-foreground">No activity yet</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 px-3 py-1.5 bg-muted/80 backdrop-blur-sm border-b border-border">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{formatDate(date)}</span>
              </div>
              {items.map((entry) => {
                const style = ACTION_STYLE[entry.action] ?? DEFAULT_STYLE;
                const Icon = style.icon;
                const detail = entry.detail ?? {};
                const agentName = (detail as Record<string, unknown>).agent_name as string | undefined;
                const summary = (detail as Record<string, unknown>).summary as string | undefined;
                const decisionTitle = (detail as Record<string, unknown>).decision_title as string | undefined;
                const costUsd = (detail as Record<string, unknown>).cost_usd as number | undefined;
                const issueTitle = (detail as Record<string, unknown>).issue_title as string | undefined;

                return (
                  <div key={entry.id} className="px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-2">
                      <Icon className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', style.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {style.label}
                          </Badge>
                          {agentName && (
                            <span className="text-[10px] font-medium text-foreground truncate">{agentName}</span>
                          )}
                          <span className="text-[9px] text-muted-foreground ml-auto flex-shrink-0">{formatTime(entry.timestamp)}</span>
                        </div>
                        {(decisionTitle || summary || issueTitle) && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                            {decisionTitle || summary || issueTitle}
                          </p>
                        )}
                        {costUsd != null && costUsd > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <DollarSign className="w-2.5 h-2.5 text-amber-400" />
                            <span className="text-[9px] text-amber-400">${costUsd.toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
