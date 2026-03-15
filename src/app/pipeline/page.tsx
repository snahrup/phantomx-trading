'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { PageTransition, StaggerList, StaggerItem, SkeletonList } from '@/components/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import PipelineCard, { type PipelineIssue } from '@/components/pipeline/PipelineCard';
import WaveProgressBar, { type WaveStatus } from '@/components/pipeline/WaveProgressBar';
import WaveDetail, { type AgentComment } from '@/components/pipeline/WaveDetail';
import { Badge } from '@/components/ui/badge';
import { Activity, RefreshCcw, ChevronLeft, AlertCircle, Users, Zap, AlertTriangle, Play, Trash2, RotateCcw, Sparkles } from 'lucide-react';
import { getAxonClient } from '@/lib/axon/client';
import { useAxonAgentSummary } from '@/store/axon-store';

// ----- Constants -----

const POLL_INTERVAL = 15_000;

const WAVE_NAMES = ['Research', 'Debate', 'Risk Assessment', 'Approval', 'Execution'];

// ----- Types -----
// Extend canonical Axon types with fields the backend actually returns but
// the base interfaces don't declare (e.g. `wave` on sub-issues, `agent_name`
// on comments). This keeps the pipeline page in sync with @/lib/axon/types
// while surfacing the extra fields it relies on.

import type { AxonIssue, AxonIssueComment } from '@/lib/axon/types';

interface PipelineSubIssue extends Pick<AxonIssue, 'id' | 'title' | 'status'> {
  /** Wave number assigned by the backend (not on canonical AxonIssue) */
  wave?: number;
}

interface PipelineComment extends Omit<AxonIssueComment, 'issue_id' | 'agent_id' | 'wave' | 'comment_type'> {
  /** Backend hydrates agent_name for display (not on canonical AxonIssueComment) */
  agent_name: string;
  wave: number;
  comment_type: string;
}

// ----- Helpers -----

function deriveWaveStatuses(
  subIssues: PipelineSubIssue[],
  comments: PipelineComment[],
  issueStatus: string,
): { statuses: WaveStatus[]; currentWave: number } {
  const statuses: WaveStatus[] = Array.from({ length: 5 }, () => 'pending' as WaveStatus);
  let currentWave = 1;

  // Check sub-issues for wave statuses
  for (let w = 1; w <= 5; w++) {
    const waveSubs = subIssues.filter(s => s.wave === w || s.title?.toLowerCase().includes(WAVE_NAMES[w - 1].toLowerCase()));
    const waveComments = comments.filter(c => c.wave === w);

    if (waveSubs.some(s => s.status === 'done') || waveComments.length > 0) {
      // Check if ALL sub-issues for this wave are done
      const allDone = waveSubs.length > 0 && waveSubs.every(s => s.status === 'done');
      if (allDone) {
        statuses[w - 1] = 'completed';
      } else if (waveSubs.length > 0 || waveComments.length > 0) {
        statuses[w - 1] = 'active';
        currentWave = w;
      }
    }
  }

  // Only default wave 1 to active if the issue is actually in_progress.
  // Backlog issues = all waves stay pending (nothing has started).
  const allPending = !statuses.some(s => s !== 'pending');
  if (allPending && issueStatus === 'in_progress') {
    statuses[0] = 'active';
    currentWave = 1;
  }

  // Make sure everything before currentWave is completed
  for (let i = 0; i < currentWave - 1; i++) {
    if (statuses[i] === 'pending') statuses[i] = 'completed';
  }

  return { statuses: statuses as WaveStatus[], currentWave };
}

// ----- Page Component -----

export default function PipelinePage() {
  const [issues, setIssues] = useState<PipelineIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comments, setComments] = useState<AgentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [selectedWave, setSelectedWave] = useState(0);
  const [waking, setWaking] = useState(false);
  const [wakeResult, setWakeResult] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // Fix #1: Use ref for selectedId to avoid stale closure in fetchIssues
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;

  // Fix #3: Use ref for issues to avoid re-triggering comment fetch on every poll
  const issuesRef = useRef<PipelineIssue[]>(issues);
  issuesRef.current = issues;

  const axon = getAxonClient();

  // Fetch all trading issues — no state dependencies in the closure
  const fetchIssues = useCallback(async () => {
    const result = await axon.listIssues();

    // Fix #4: Surface error state to user
    if (!result.ok) {
      setError(result.error ?? 'Failed to connect to Axon');
      setLoading(false);
      return;
    }

    setError(null);
    const data = result.data;

    const tradingIssues = data.filter(
      (i) => i.issue_type === 'trading' && (showDone || i.status !== 'done')
    );

    // Fix #5: Only fetch sub-issues/comments for the selected issue (or first).
    // For non-selected issues, reuse previously-fetched wave data if available.
    const currentSelectedId = selectedIdRef.current;
    const prevIssues = issuesRef.current;

    const enriched: PipelineIssue[] = await Promise.all(
      tradingIssues.map(async (issue) => {
        const isSelected = issue.id === currentSelectedId;
        const isOnlyCandidate = !currentSelectedId && tradingIssues.indexOf(issue) === 0;

        if (isSelected || isOnlyCandidate) {
          // Fetch full details for selected (or auto-select candidate)
          const [subsResult, cmntsResult] = await Promise.all([
            axon.getSubIssues(issue.id),
            axon.getIssueComments(issue.id),
          ]);
          const subs = subsResult.ok ? (subsResult.data as unknown as PipelineSubIssue[]) : [];
          const cmnts = cmntsResult.ok ? (cmntsResult.data as unknown as PipelineComment[]) : [];
          const { statuses, currentWave } = deriveWaveStatuses(subs, cmnts, issue.status);
          return { ...issue, currentWave, waveStatuses: statuses, totalComments: cmnts.length };
        }

        // Reuse previous wave data for non-selected issues
        const prev = prevIssues.find((p) => p.id === issue.id);
        if (prev) {
          return { ...issue, currentWave: prev.currentWave, waveStatuses: prev.waveStatuses, totalComments: prev.totalComments };
        }

        // Fallback: minimal fetch for new issues
        const subsResult = await axon.getSubIssues(issue.id);
        const subs = subsResult.ok ? (subsResult.data as unknown as PipelineSubIssue[]) : [];
        const { statuses, currentWave } = deriveWaveStatuses(subs, [], issue.status);
        return { ...issue, currentWave, waveStatuses: statuses, totalComments: 0 };
      })
    );

    setIssues(enriched);
    setLoading(false);

    // Auto-select first if nothing selected (uses ref, not state)
    if (!selectedIdRef.current && enriched.length > 0) {
      setSelectedId(enriched[0].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch comments for selected issue (uses company-scoped client)
  const fetchComments = useCallback(async (issueId: string) => {
    setCommentsLoading(true);
    const result = await axon.getIssueComments(issueId);
    const data = result.ok ? (result.data as unknown as PipelineComment[]) : [];
    setComments(
      data.map((c) => ({
        ...c,
        comment_type: c.comment_type || 'finding',
      }))
    );
    setCommentsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial fetch + polling (stable callback, no re-creates)
  useEffect(() => {
    fetchIssues();
    const interval = setInterval(fetchIssues, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchIssues]);

  // Fetch comments when selection changes (uses ref for issues to avoid re-trigger)
  useEffect(() => {
    if (selectedId) {
      fetchComments(selectedId);
      // Reset selected wave to current active wave
      const issue = issuesRef.current.find((i) => i.id === selectedId);
      if (issue) {
        setSelectedWave(issue.currentWave - 1);
      }
    }
  }, [selectedId, fetchComments]);

  const selectedIssue = issues.find((i) => i.id === selectedId);

  const handleWakeAll = useCallback(async () => {
    setWaking(true);
    setWakeResult(null);
    const result = await axon.wakeAll();
    setWaking(false);
    if (result.ok) {
      const { reset_count, woken_count } = result.data;
      setWakeResult(`Reset ${reset_count} agents, woke ${woken_count}`);
      // Refresh after a short delay so the backend has time to process
      setTimeout(() => { fetchIssues(); setWakeResult(null); }, 3000);
    } else {
      setWakeResult('Failed to wake agents');
      setTimeout(() => setWakeResult(null), 4000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Issue management actions ---

  const handleDelete = useCallback(async (issueId: string) => {
    const result = await axon.deleteIssue(issueId);
    if (result.ok) {
      setActionFeedback(`Deleted pipeline (${result.data.sub_issues} sub-issues, ${result.data.comments} comments)`);
      if (selectedIdRef.current === issueId) setSelectedId(null);
      fetchIssues();
    } else {
      setActionFeedback(`Delete failed: ${result.error}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestart = useCallback(async (issueId: string) => {
    const result = await axon.restartPipeline(issueId);
    if (result.ok) {
      setActionFeedback('Pipeline restarted — new issue created at wave 1');
      if (result.data.new_issue) {
        setSelectedId(result.data.new_issue.id);
      }
      fetchIssues();
    } else {
      setActionFeedback(`Restart failed: ${result.error}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCleanStale = useCallback(async () => {
    const result = await axon.cleanStaleIssues(6, 'cancel');
    if (result.ok) {
      const { cleaned, issues: titles } = result.data;
      setActionFeedback(cleaned > 0 ? `Cancelled ${cleaned} stale pipeline${cleaned !== 1 ? 's' : ''}` : 'No stale pipelines found');
      if (cleaned > 0) fetchIssues();
    } else {
      setActionFeedback(`Clean failed: ${result.error}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelAll = useCallback(async () => {
    const ids = issues.filter(i => i.status !== 'done' && i.status !== 'cancelled').map(i => i.id);
    if (ids.length === 0) return;
    const result = await axon.bulkUpdateIssueStatus(ids, 'cancelled');
    if (result.ok) {
      setActionFeedback(`Cancelled ${result.data.updated_count} pipelines`);
      fetchIssues();
    } else {
      setActionFeedback(`Cancel failed: ${result.error}`);
    }
    setTimeout(() => setActionFeedback(null), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues]);

  return (
    <AppLayout
      title="Trading Pipeline"
      subtitle="Live 5-wave trading debates from the agent team"
      actions={
        <div className="flex items-center gap-2">
          {(wakeResult || actionFeedback) && (
            <span className="text-[10px] text-claude-green font-medium animate-in fade-in max-w-[200px] truncate">
              {wakeResult || actionFeedback}
            </span>
          )}
          {issues.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] border-claude-green/30 text-claude-green bg-claude-green/5"
            >
              <Activity className="w-3 h-3 mr-1" />
              {issues.length} {issues.length === 1 ? 'pipeline' : 'pipelines'}
            </Badge>
          )}
          <button
            onClick={handleCleanStale}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium bg-amber-400/5 text-amber-400 hover:bg-amber-400/10 border border-amber-400/20 transition-colors"
            title="Cancel pipelines stale for 6+ hours"
          >
            <Sparkles className="w-3 h-3" />
            Clean Stale
          </button>
          <button
            onClick={handleWakeAll}
            disabled={waking}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              waking
                ? 'bg-claude-green/20 text-claude-green cursor-wait'
                : 'bg-claude-green/10 text-claude-green hover:bg-claude-green/20 active:bg-claude-green/30'
            }`}
            title="Wake all agents — reset errors and trigger heartbeats"
          >
            <Play className={`w-3.5 h-3.5 ${waking ? 'animate-pulse' : ''}`} />
            {waking ? 'Waking...' : 'Wake Agents'}
          </button>
          <button
            onClick={() => { setLoading(true); fetchIssues(); }}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <PageTransition className="h-full">
        <ErrorBoundary fallback="agents">
          {loading ? (
            <SkeletonList count={3} />
          ) : error ? (
            <ErrorState message={error} onRetry={() => { setLoading(true); setError(null); fetchIssues(); }} />
          ) : issues.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex gap-5 h-full">
              {/* Left column: issue list */}
              <div className="w-80 shrink-0 space-y-3 overflow-y-auto pr-1">
                <StaggerList className="space-y-3">
                  {issues.map((issue) => (
                    <StaggerItem key={issue.id}>
                      <PipelineCard
                        issue={issue}
                        isSelected={issue.id === selectedId}
                        onClick={() => setSelectedId(issue.id)}
                        onDelete={handleDelete}
                        onRestart={handleRestart}
                      />
                    </StaggerItem>
                  ))}
                </StaggerList>
              </div>

              {/* Right column: detail view */}
              <div className="flex-1 min-w-0 overflow-y-auto space-y-4">
                {selectedIssue ? (
                  <DetailView
                    issue={selectedIssue}
                    comments={comments}
                    commentsLoading={commentsLoading}
                    selectedWave={selectedWave}
                    onWaveSelect={setSelectedWave}
                    onBack={() => setSelectedId(null)}
                    onDelete={handleDelete}
                    onRestart={handleRestart}
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    Select a pipeline to view debate details
                  </div>
                )}
              </div>
            </div>
          )}
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}

// ----- Detail View -----

function DetailView({
  issue,
  comments,
  commentsLoading,
  selectedWave,
  onWaveSelect,
  onBack,
  onDelete,
  onRestart,
}: {
  issue: PipelineIssue;
  comments: AgentComment[];
  commentsLoading: boolean;
  selectedWave: number;
  onWaveSelect: (i: number) => void;
  onBack: () => void;
  onDelete?: (id: string) => void;
  onRestart?: (id: string) => void;
}) {
  const waveComments = comments.filter((c) => c.wave === selectedWave + 1);
  const { working, idle, error: errCount } = useAxonAgentSummary();
  const isQueued = issue.status === 'backlog';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="lg:hidden p-1.5 rounded-md hover:bg-accent text-muted-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-semibold text-foreground flex-1 line-clamp-1">
          {issue.title}
        </h2>
        <div className="flex items-center gap-1.5">
          {onRestart && (
            <button
              onClick={() => onRestart(issue.id)}
              className="p-1.5 rounded-md hover:bg-amber-400/10 text-muted-foreground hover:text-amber-400 transition-colors"
              title="Restart pipeline from wave 1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(issue.id)}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete this pipeline"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] border ${
              isQueued
                ? 'border-amber-400/30 text-amber-400 bg-amber-400/5'
                : 'border-claude-green/30 text-claude-green bg-claude-green/5'
            }`}
          >
            {isQueued ? 'QUEUED' : issue.status.toUpperCase().replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>

      {/* Agent activity summary bar */}
      <div className="flex items-center gap-4 px-3 py-2 rounded-lg bg-muted/50 border border-border/50 text-[11px]">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Team:</span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-claude-green" />
          <span className="font-mono text-foreground">{working}</span>
          <span className="text-muted-foreground">working</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
          <span className="font-mono text-muted-foreground">{idle}</span>
          <span className="text-muted-foreground">idle</span>
        </div>
        {errCount > 0 && (
          <div className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-destructive" />
            <span className="font-mono text-destructive">{errCount}</span>
            <span className="text-muted-foreground">error</span>
          </div>
        )}
        {comments.length > 0 && (
          <>
            <div className="w-px h-3 bg-border" />
            <span className="text-muted-foreground">
              <span className="font-mono text-foreground">{comments.length}</span> finding{comments.length !== 1 ? 's' : ''} posted
            </span>
          </>
        )}
      </div>

      {/* Wave progress */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <WaveProgressBar
          statuses={issue.waveStatuses}
          activeIndex={selectedWave}
          onWaveClick={onWaveSelect}
        />
      </div>

      {/* Wave detail */}
      {commentsLoading ? (
        <SkeletonList count={2} />
      ) : (
        <WaveDetail
          waveNumber={selectedWave + 1}
          waveName={WAVE_NAMES[selectedWave]}
          status={issue.waveStatuses[selectedWave]}
          comments={waveComments}
          issueStatus={issue.status}
        />
      )}

      {/* All other waves (collapsed summary) */}
      <div className="space-y-2">
        {WAVE_NAMES.map((name, i) => {
          if (i === selectedWave) return null;
          const status = issue.waveStatuses[i];
          const count = comments.filter((c) => c.wave === i + 1).length;
          if (status === 'pending' && count === 0) return null;

          return (
            <button
              key={i}
              onClick={() => onWaveSelect(i)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-border/80 transition-colors text-left"
            >
              <span className="font-mono text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                W{i + 1}
              </span>
              <span className="text-xs font-medium text-foreground flex-1">{name}</span>
              {count > 0 && (
                <span className="text-[10px] text-muted-foreground/60">
                  {count} comment{count !== 1 ? 's' : ''}
                </span>
              )}
              <div
                className={`w-2 h-2 rounded-full ${
                  status === 'completed'
                    ? 'bg-claude-green'
                    : status === 'active'
                    ? 'bg-amber-500'
                    : 'bg-border'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ----- Error State -----

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-80 text-center">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">Unable to reach Axon</h3>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mb-4">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-accent border border-border transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ----- Empty State -----

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-80 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Activity className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">No active trading pipelines</h3>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
        Create a trading issue in the Axon Control Room to trigger the 5-wave debate pipeline.
        The agent team will research, debate, assess risk, approve, and execute.
      </p>
    </div>
  );
}
