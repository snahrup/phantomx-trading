'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import WaveProgressBar, { type WaveStatus } from './WaveProgressBar';
import { TrendingUp, TrendingDown, Clock, Inbox, Trash2, RotateCcw, MoreVertical, X } from 'lucide-react';

// ----- Types -----

export interface PipelineIssue {
  id: string;
  title: string;
  status: string;
  priority: string;
  issue_type: string;
  created_at: string;
  /** Current wave (1-5) derived from sub-issues */
  currentWave: number;
  /** Statuses for each wave */
  waveStatuses: WaveStatus[];
  /** Total comments across all waves */
  totalComments: number;
}

interface PipelineCardProps {
  issue: PipelineIssue;
  isSelected: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
  onRestart?: (id: string) => void;
}

// ----- Helpers -----

function parseDirection(title: string): 'long' | 'short' | null {
  const upper = title.toUpperCase();
  if (upper.includes('LONG')) return 'long';
  if (upper.includes('SHORT')) return 'short';
  return null;
}

function priorityBadge(priority: string): { className: string; label: string } {
  switch (priority.toLowerCase()) {
    case 'critical':
      return {
        className: 'bg-destructive/10 text-destructive border-destructive/30',
        label: 'CRITICAL',
      };
    case 'high':
      return {
        className: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
        label: 'HIGH',
      };
    case 'medium':
      return {
        className: 'bg-blue-400/10 text-blue-400 border-blue-400/30',
        label: 'MEDIUM',
      };
    default:
      return {
        className: 'bg-muted text-muted-foreground border-border',
        label: priority.toUpperCase(),
      };
  }
}

function statusBadge(status: string): { className: string; label: string } {
  switch (status) {
    case 'in_progress':
      return {
        className: 'bg-claude-green/10 text-claude-green border-claude-green/30',
        label: 'IN PROGRESS',
      };
    case 'backlog':
      return {
        className: 'bg-amber-400/10 text-amber-400 border-amber-400/30',
        label: 'QUEUED',
      };
    case 'done':
      return {
        className: 'bg-muted text-muted-foreground border-border',
        label: 'DONE',
      };
    default:
      return {
        className: 'bg-muted text-muted-foreground border-border',
        label: status.toUpperCase().replace(/_/g, ' '),
      };
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return '';
  }
}

// ----- Component -----

export default function PipelineCard({ issue, isSelected, onClick, onDelete, onRestart }: PipelineCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'delete' | 'restart' | null>(null);
  const direction = parseDirection(issue.title);
  const prio = priorityBadge(issue.priority);
  const stat = statusBadge(issue.status);
  const isQueued = issue.status === 'backlog';

  const handleAction = (action: 'delete' | 'restart', e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setConfirmAction(action);
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmAction === 'delete') onDelete?.(issue.id);
    if (confirmAction === 'restart') onRestart?.(issue.id);
    setConfirmAction(null);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmAction(null);
  };

  return (
    <motion.div
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.995 }}
      className={cn(
        'w-full text-left rounded-xl border transition-colors duration-200 p-4 relative group cursor-pointer',
        'bg-card hover:border-border/80',
        isSelected
          ? 'border-claude-green/40 shadow-md'
          : 'border-border shadow-sm',
        isQueued && 'opacity-75',
      )}
      onClick={onClick}
    >
      {/* Confirmation overlay */}
      {confirmAction && (
        <div
          className="absolute inset-0 z-10 rounded-xl bg-card/95 backdrop-blur-sm border border-border flex flex-col items-center justify-center gap-2 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-medium text-foreground text-center">
            {confirmAction === 'delete' ? 'Delete this pipeline?' : 'Restart from wave 1?'}
          </p>
          <p className="text-[10px] text-muted-foreground text-center">
            {confirmAction === 'delete'
              ? 'Sub-issues, comments, and executions will be removed.'
              : 'Current pipeline will be cancelled and a new one created.'}
          </p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleCancel}
              className="px-3 py-1 rounded-md text-[10px] font-medium bg-muted text-muted-foreground hover:bg-accent border border-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className={cn(
                'px-3 py-1 rounded-md text-[10px] font-semibold transition-colors',
                confirmAction === 'delete'
                  ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30'
                  : 'bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 border border-amber-400/30',
              )}
            >
              {confirmAction === 'delete' ? 'Delete' : 'Restart'}
            </button>
          </div>
        </div>
      )}

      {/* Action menu toggle */}
      {(onDelete || onRestart) && !confirmAction && (
        <div className="absolute top-2 right-2 z-10">
          {menuOpen ? (
            <div
              className="flex items-center gap-0.5 bg-card border border-border rounded-lg shadow-lg p-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {onRestart && (
                <button
                  onClick={(e) => handleAction('restart', e)}
                  className="p-1.5 rounded-md hover:bg-amber-400/10 text-muted-foreground hover:text-amber-400 transition-colors"
                  title="Restart pipeline"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={(e) => handleAction('delete', e)}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete pipeline"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
              title="Actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Top row: title + direction */}
      <div className="flex items-start gap-2 mb-3">
        {direction && (
          <div
            className={cn(
              'mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0',
              direction === 'long'
                ? 'bg-claude-green/10 text-claude-green'
                : 'bg-destructive/10 text-destructive',
            )}
          >
            {direction === 'long' ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
          </div>
        )}
        {!direction && isQueued && (
          <div className="mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-amber-400/10 text-amber-400">
            <Inbox className="w-3.5 h-3.5" />
          </div>
        )}
        <h3 className="text-sm font-semibold text-foreground leading-tight flex-1 line-clamp-2 pr-6">
          {issue.title}
        </h3>
      </div>

      {/* Wave progress */}
      <div className="mb-3">
        <WaveProgressBar statuses={issue.waveStatuses} />
      </div>

      {/* Bottom row: badges + timestamp */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn('text-[9px] border', prio.className)}>
          {prio.label}
        </Badge>
        <Badge variant="outline" className={cn('text-[9px] border', stat.className)}>
          {stat.label}
        </Badge>
        <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-1 font-mono">
          <Clock className="w-3 h-3" />
          {timeAgo(issue.created_at)}
        </span>
      </div>
    </motion.div>
  );
}
