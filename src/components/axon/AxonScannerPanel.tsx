'use client';

import { useState, useCallback } from 'react';
import { getAxonClient } from '@/lib/axon/client';
import { useAxonStore } from '@/store/axon-store';
import type { AxonIssue } from '@/lib/axon/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Search, Zap, Loader2, CheckCircle2, Clock,
  AlertTriangle, ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Wave progress labels
// ---------------------------------------------------------------------------

const WAVE_LABELS: Record<number, string> = {
  0: 'Queued',
  1: 'Research (4 analysts)',
  2: 'Debate (bull/bear/ruling)',
  3: 'Risk Assessment',
  4: 'Approval (HoT + CEO)',
  5: 'Execution Recommendation',
};

function waveColor(wave: number): string {
  if (wave >= 5) return 'text-emerald-400';
  if (wave >= 4) return 'text-amber-400';
  if (wave >= 3) return 'text-orange-400';
  if (wave >= 2) return 'text-violet-400';
  if (wave >= 1) return 'text-blue-400';
  return 'text-muted-foreground';
}

function statusIcon(status: string) {
  switch (status) {
    case 'done': return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
    case 'in_progress': return <Loader2 className="w-3 h-3 text-primary animate-spin" />;
    case 'blocked': return <AlertTriangle className="w-3 h-3 text-red-400" />;
    default: return <Clock className="w-3 h-3 text-muted-foreground" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AxonScannerPanel() {
  const [creating, setCreating] = useState(false);
  const [symbol, setSymbol] = useState('');
  const issues = useAxonStore((s) => s.issues);
  const daemonOnline = useAxonStore((s) => s.daemonOnline);
  const fetchIssues = useAxonStore((s) => s.fetchIssues);

  // Filter to trading issues only
  const tradingIssues = issues
    .filter((i) => i.issue_type === 'trading')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  const activeScans = tradingIssues.filter((i) => i.status === 'in_progress' || i.status === 'todo');
  const completedScans = tradingIssues.filter((i) => i.status === 'done' || i.status === 'blocked');

  const handleCreateScan = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const scanSymbol = symbol.trim() || 'BTC/USDT';
      await getAxonClient().createIssue({
        title: `Market Scan: ${scanSymbol}`,
        description: `Comprehensive market analysis for ${scanSymbol}. Run full 5-wave trading pipeline: research → debate → risk assessment → approval → execution recommendation.`,
        issue_type: 'trading',
        priority: 'high',
      });
      setSymbol('');
      await fetchIssues();
    } catch (err) {
      console.error('Failed to create scan:', err);
    } finally {
      setCreating(false);
    }
  }, [creating, symbol, fetchIssues]);

  if (!daemonOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Search className="w-8 h-8 text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">Axon daemon offline</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">Start the daemon to scan markets</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Market Scanner</span>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Powered by 22-agent trading team — 5-wave debate pipeline
        </p>
      </div>

      {/* New Scan Form */}
      <div className="px-3 py-3 border-b border-border space-y-2">
        <div className="flex gap-2">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Symbol (e.g. BTC/USDT)"
            className="flex-1 px-2.5 py-1.5 rounded-md text-xs bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateScan()}
          />
          <button
            onClick={handleCreateScan}
            disabled={creating}
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            Scan
          </button>
        </div>
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto">
        {/* Active Scans */}
        {activeScans.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-muted/50 border-b border-border">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
                Active ({activeScans.length})
              </span>
            </div>
            {activeScans.map((issue) => (
              <ScanRow key={issue.id} issue={issue} />
            ))}
          </div>
        )}

        {/* Completed Scans */}
        {completedScans.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-muted/50 border-b border-border">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Completed ({completedScans.length})
              </span>
            </div>
            {completedScans.map((issue) => (
              <ScanRow key={issue.id} issue={issue} />
            ))}
          </div>
        )}

        {tradingIssues.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="w-8 h-8 text-muted-foreground/20 mb-2" strokeWidth={1} />
            <p className="text-xs text-muted-foreground">No scans yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Create a scan to start the pipeline</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan Row
// ---------------------------------------------------------------------------

function ScanRow({ issue }: { issue: AxonIssue }) {
  const wave = issue.current_wave ?? 0;
  const isActive = issue.status === 'in_progress' || issue.status === 'todo';
  const isRejected = issue.status === 'blocked';

  return (
    <div className="px-3 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer group">
      <div className="flex items-center gap-2">
        {statusIcon(issue.status)}
        <span className="text-xs font-medium text-foreground flex-1 truncate">{issue.title}</span>
        <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex items-center gap-2 mt-1 ml-5">
        <span className={cn('text-[10px] font-medium', waveColor(wave))}>
          {isRejected ? 'Rejected at Wave ' + wave : WAVE_LABELS[wave] ?? `Wave ${wave}`}
        </span>
        {isActive && (
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((w) => (
              <div
                key={w}
                className={cn(
                  'w-3 h-1 rounded-full',
                  w <= wave ? 'bg-primary' : 'bg-muted-foreground/20',
                  w === wave && isActive && 'animate-pulse',
                )}
              />
            ))}
          </div>
        )}
        {issue.status === 'done' && (
          <Badge variant="outline" className="text-[8px] text-emerald-400 border-emerald-400/30 px-1 py-0">
            Complete
          </Badge>
        )}
      </div>
    </div>
  );
}
