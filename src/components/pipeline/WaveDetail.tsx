'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Microscope, Swords, Gavel, Crosshair,
  Clock, CheckCircle2, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ----- Types -----

export interface AgentComment {
  id: string;
  agent_name: string;
  content: string;
  comment_type: 'finding' | 'argument' | 'ruling' | 'recommendation' | string;
  wave: number;
  created_at: string;
}

interface WaveDetailProps {
  waveNumber: number;
  waveName: string;
  status: 'pending' | 'active' | 'completed';
  comments: AgentComment[];
  /** The parent issue status (backlog, in_progress, etc.) */
  issueStatus?: string;
  className?: string;
}

// ----- Styling maps -----

const COMMENT_STYLE: Record<string, {
  border: string;
  badgeBorder: string;
  bg: string;
  iconColor: string;
  icon: typeof Microscope;
  label: string;
}> = {
  finding: {
    border: 'border-l-blue-400',
    badgeBorder: 'border-blue-400/50',
    bg: 'bg-blue-400/5',
    iconColor: 'text-blue-400',
    icon: Microscope,
    label: 'Finding',
  },
  argument: {
    border: 'border-l-amber-400',
    badgeBorder: 'border-amber-400/50',
    bg: 'bg-amber-400/5',
    iconColor: 'text-amber-400',
    icon: Swords,
    label: 'Argument',
  },
  ruling: {
    border: 'border-l-amber-400',
    badgeBorder: 'border-amber-400',
    bg: 'bg-amber-400/5',
    iconColor: 'text-amber-400',
    icon: Gavel,
    label: 'Ruling',
  },
  recommendation: {
    border: 'border-l-claude-green',
    badgeBorder: 'border-claude-green/50',
    bg: 'bg-claude-green/5',
    iconColor: 'text-claude-green',
    icon: Crosshair,
    label: 'Recommendation',
  },
};

const STATUS_BADGE: Record<string, { className: string; icon: typeof Clock; label: string }> = {
  pending: {
    className: 'bg-muted text-muted-foreground border-border',
    icon: Clock,
    label: 'Pending',
  },
  active: {
    className: 'bg-claude-green/10 text-claude-green border-claude-green/30',
    icon: Loader2,
    label: 'Active',
  },
  completed: {
    className: 'bg-claude-green/10 text-claude-green border-claude-green/30',
    icon: CheckCircle2,
    label: 'Completed',
  },
};

// ----- Helpers -----

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getAgentInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Hash-based color for agent avatars so each agent gets a consistent hue
function agentHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

// ----- Component -----

export default function WaveDetail({ waveNumber, waveName, status, comments, issueStatus, className }: WaveDetailProps) {
  const statusInfo = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
  const StatusIcon = statusInfo.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn('rounded-xl border border-border bg-card overflow-hidden', className)}
    >
      {/* Wave header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
            W{waveNumber}
          </span>
          <span className="text-sm font-semibold text-foreground">{waveName}</span>
          <span className="text-[10px] text-muted-foreground">
            {comments.length} comment{comments.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn('text-[10px] gap-1 border', statusInfo.className)}
        >
          <StatusIcon className={cn('w-3 h-3', status === 'active' && 'animate-spin')} />
          {statusInfo.label}
        </Badge>
      </div>

      {/* Comments */}
      <div className="divide-y divide-border">
        {status === 'pending' && issueStatus === 'backlog' && (
          <div className="px-4 py-8 text-center">
            <Clock className="w-5 h-5 mx-auto text-amber-400 mb-2 opacity-60" />
            <p className="text-xs font-medium text-foreground mb-1">Pipeline queued</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
              This pipeline is waiting to be picked up by the agent team.
              Agents will start the {waveName} wave when the scheduler assigns it.
            </p>
          </div>
        )}

        {status === 'pending' && issueStatus !== 'backlog' && (
          <div className="px-4 py-8 text-center">
            <Clock className="w-5 h-5 mx-auto text-muted-foreground mb-2 opacity-40" />
            <p className="text-xs text-muted-foreground">Waiting for previous wave to complete</p>
          </div>
        )}

        {comments.length === 0 && status === 'active' && (
          <div className="px-4 py-8 text-center">
            <div className="ai-thinking mx-auto mb-2 justify-center">
              <span /><span /><span />
            </div>
            <p className="text-xs font-medium text-foreground mb-1">
              {waveName} wave in progress
            </p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed">
              Agents are analyzing and will post findings here as they work.
              This view refreshes automatically every 15 seconds.
            </p>
          </div>
        )}

        {comments.map((comment, i) => {
          const style = COMMENT_STYLE[comment.comment_type] ?? COMMENT_STYLE.finding;
          const CommentIcon = style.icon;
          const hue = agentHue(comment.agent_name);

          return (
            <motion.div
              key={comment.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className={cn(
                'px-4 py-3 border-l-2',
                style.border,
                style.bg,
              )}
            >
              <div className="flex items-start gap-3">
                {/* Agent avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                  style={{ backgroundColor: `oklch(0.55 0.12 ${hue})` }}
                >
                  {getAgentInitials(comment.agent_name)}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Meta row */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-foreground">
                      {comment.agent_name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] py-0 px-1.5 gap-0.5 border',
                        style.badgeBorder,
                      )}
                    >
                      <CommentIcon className={cn('w-2.5 h-2.5', style.iconColor)} />
                      {style.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground/60 ml-auto font-mono">
                      {formatTimestamp(comment.created_at)}
                    </span>
                  </div>

                  {/* Content */}
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
