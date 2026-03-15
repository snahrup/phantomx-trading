// ============================================================================
// PhantomX — Axon Daemon REST Client
// Typed fetch wrapper for the Axon API (FastAPI on :8400)
//
// IMPORTANT: Agent-scoped endpoints (/agents/{id}/...) are NOT company-scoped.
// Company-scoped endpoints (/companies/{id}/...) are for issues, chat, status.
// The /health endpoint is at the app root (not under /api).
// ============================================================================

import type {
  AxonAgent,
  AxonAgentSchedule,
  AxonAgentPersona,
  AxonHeartbeatRun,
  AxonCostEntry,
  AxonIssue,
  AxonIssueComment,
  AxonActivity,
  AxonChatMessage,
  AxonHealthResponse,
  AxonCompanyStatus,
  AxonResult,
  AxonIssueType,
  AxonPriority,
  AxonDeleteResult,
  AxonRestartResult,
  AxonBulkDeleteResult,
  AxonStaleIssuesResponse,
  AxonPipelineStatusResponse,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Phantom Trading Co. company ID in the Axon database */
export const PHANTOM_COMPANY_ID = '8fc360f2-31bc-4ab2-a441-e69b2d260126';

const DEFAULT_BASE_URL = 'http://localhost:8400/api';

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class AxonClient {
  private baseUrl: string;
  private companyId: string;
  /** Root URL without /api suffix — used for endpoints registered on the app root */
  private rootUrl: string;

  constructor(opts?: { baseUrl?: string; companyId?: string }) {
    this.baseUrl = (opts?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.companyId = opts?.companyId ?? PHANTOM_COMPANY_ID;
    // Derive root URL: strip /api suffix if present
    this.rootUrl = this.baseUrl.replace(/\/api$/, '');
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    path: string,
    init?: RequestInit,
    useRootUrl = false,
  ): Promise<AxonResult<T>> {
    try {
      const base = useRootUrl ? this.rootUrl : this.baseUrl;
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      });

      if (!res.ok) {
        const body = await res.text();
        let detail: string;
        try {
          detail = (JSON.parse(body) as { detail?: string }).detail ?? body;
        } catch {
          detail = body;
        }
        return { ok: false, error: detail, status: res.status };
      }

      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, status: 0 };
    }
  }

  private get<T>(path: string, useRootUrl = false): Promise<AxonResult<T>> {
    return this.request<T>(path, undefined, useRootUrl);
  }

  private post<T>(path: string, body?: unknown): Promise<AxonResult<T>> {
    return this.request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private patch<T>(path: string, body: unknown): Promise<AxonResult<T>> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  private del<T>(path: string): Promise<AxonResult<T>> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  /** Shorthand for company-scoped paths */
  private co(suffix: string): string {
    return `/companies/${this.companyId}${suffix}`;
  }

  // -------------------------------------------------------------------------
  // Health — registered on app root, NOT under /api
  // -------------------------------------------------------------------------

  health(): Promise<AxonResult<AxonHealthResponse>> {
    return this.get('/health', true);
  }

  // -------------------------------------------------------------------------
  // Agents — NOT company-scoped (registered at /api/agents/...)
  // -------------------------------------------------------------------------

  listAgents(): Promise<AxonResult<AxonAgent[]>> {
    return this.get(this.co('/agents'));
  }

  /** Enriched agent list with schedule data: last run, next due, assigned issues. */
  getAgentSchedule(): Promise<AxonResult<AxonAgentSchedule[]>> {
    return this.get(this.co('/agent-schedule'));
  }

  getAgent(agentId: string): Promise<AxonResult<AxonAgent>> {
    return this.get(`/agents/${agentId}/summary`);
  }

  /** Update agent fields (status, config, heartbeat_interval_s). */
  updateAgent(agentId: string, updates: { status?: string; config?: Record<string, unknown>; heartbeat_interval_s?: number }): Promise<AxonResult<AxonAgent>> {
    // Agent PATCH is NOT company-scoped — route is /api/agents/{id}
    return this.patch(`/agents/${agentId}`, updates);
  }

  getAgentPersona(agentId: string): Promise<AxonResult<AxonAgentPersona>> {
    return this.get(`/agents/${agentId}/persona`);
  }

  getAgentHeartbeats(
    agentId: string,
    limit = 20,
  ): Promise<AxonResult<AxonHeartbeatRun[]>> {
    return this.get(`/agents/${agentId}/heartbeats?limit=${limit}`);
  }

  getAgentCosts(agentId: string): Promise<AxonResult<AxonCostEntry[]>> {
    return this.get(`/agents/${agentId}/costs`);
  }

  wakeupAgent(agentId: string): Promise<AxonResult<{ status: string }>> {
    return this.post(`/agents/${agentId}/wakeup`);
  }

  pauseAgent(agentId: string): Promise<AxonResult<{ status: string }>> {
    return this.post(`/agents/${agentId}/pause`);
  }

  resumeAgent(agentId: string): Promise<AxonResult<{ status: string }>> {
    return this.post(`/agents/${agentId}/resume`);
  }

  // -------------------------------------------------------------------------
  // Issues — company-scoped
  // -------------------------------------------------------------------------

  listIssues(params?: {
    status?: string;
    assigned_agent_id?: string;
    issue_type?: AxonIssueType;
  }): Promise<AxonResult<AxonIssue[]>> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.assigned_agent_id) qs.set('assigned_agent_id', params.assigned_agent_id);
    if (params?.issue_type) qs.set('issue_type', params.issue_type);
    const query = qs.toString();
    return this.get(this.co(`/issues${query ? `?${query}` : ''}`));
  }

  getIssue(issueId: string): Promise<AxonResult<AxonIssue>> {
    return this.get(this.co(`/issues/${issueId}`));
  }

  getIssueComments(issueId: string): Promise<AxonResult<AxonIssueComment[]>> {
    return this.get(this.co(`/issues/${issueId}/comments`));
  }

  getSubIssues(issueId: string): Promise<AxonResult<AxonIssue[]>> {
    return this.get(this.co(`/issues/${issueId}/sub-issues`));
  }

  addComment(
    issueId: string,
    content: string,
    opts?: { agent_id?: string; wave?: number; comment_type?: string },
  ): Promise<AxonResult<AxonIssueComment>> {
    return this.post(this.co(`/issues/${issueId}/comments`), {
      content,
      ...opts,
    });
  }

  createIssue(issue: {
    title: string;
    description: string;
    issue_type: AxonIssueType;
    priority: AxonPriority;
    assigned_agent_id?: string;
    parent_issue_id?: string;
  }): Promise<AxonResult<AxonIssue>> {
    return this.post(this.co('/issues'), issue);
  }

  updateIssue(
    issueId: string,
    updates: Partial<
      Pick<AxonIssue, 'title' | 'description' | 'status' | 'priority' | 'assigned_agent_id'>
    >,
  ): Promise<AxonResult<AxonIssue>> {
    return this.patch(this.co(`/issues/${issueId}`), updates);
  }

  /** Delete an issue with cascade (sub-issues, comments, trade executions). */
  deleteIssue(issueId: string): Promise<AxonResult<AxonDeleteResult>> {
    return this.del(`/issues/${issueId}`);
  }

  /** Restart a trading pipeline — cancels original, creates fresh clone at wave 0. */
  restartPipeline(issueId: string): Promise<AxonResult<AxonRestartResult>> {
    return this.post(`/issues/${issueId}/restart-pipeline`);
  }

  /** Get full pipeline status — wave progress, sub-issues per wave, trade execution. */
  getPipelineStatus(issueId: string): Promise<AxonResult<AxonPipelineStatusResponse>> {
    return this.get(`/issues/${issueId}/pipeline-status`);
  }

  // -------------------------------------------------------------------------
  // Bulk Issue Operations — company-scoped
  // -------------------------------------------------------------------------

  bulkDeleteIssues(issueIds: string[]): Promise<AxonResult<AxonBulkDeleteResult>> {
    return this.post(this.co('/issues/bulk-delete'), { issue_ids: issueIds });
  }

  bulkUpdateIssueStatus(
    issueIds: string[],
    status: string,
  ): Promise<AxonResult<{ action: string; updated_count: number; new_status: string }>> {
    return this.post(this.co('/issues/bulk-status'), { issue_ids: issueIds, status });
  }

  getStaleIssues(hours = 6): Promise<AxonResult<AxonStaleIssuesResponse>> {
    return this.get(this.co(`/issues/stale?hours=${hours}`));
  }

  cleanStaleIssues(
    hours = 6,
    action: 'cancel' | 'delete' = 'cancel',
  ): Promise<AxonResult<{ action: string; cleaned: number; issues: string[] }>> {
    return this.post(this.co(`/issues/clean-stale?hours=${hours}&action=${action}`));
  }

  // -------------------------------------------------------------------------
  // Company Status (dashboard aggregate) — company-scoped
  // -------------------------------------------------------------------------

  getCompanyStatus(): Promise<AxonResult<AxonCompanyStatus>> {
    return this.get(this.co('/status'));
  }

  // -------------------------------------------------------------------------
  // Chat — company-scoped, correct backend paths
  // -------------------------------------------------------------------------

  getChatHistory(limit = 50): Promise<AxonResult<AxonChatMessage[]>> {
    return this.get(this.co(`/chat-history?limit=${limit}`));
  }

  sendChatMessage(content: string): Promise<AxonResult<AxonChatMessage>> {
    return this.post(this.co('/chat-messages'), { content });
  }

  // -------------------------------------------------------------------------
  // Global Controls — company-scoped, under /agents/ sub-path
  // -------------------------------------------------------------------------

  pauseAll(): Promise<AxonResult<{ status: string }>> {
    return this.post(this.co('/agents/pause-all'));
  }

  resumeAll(): Promise<AxonResult<{ status: string }>> {
    return this.post(this.co('/agents/resume-all'));
  }

  /** Wake ALL agents — reset error/paused agents, trigger immediate heartbeats. */
  wakeAll(): Promise<AxonResult<{ action: string; reset_count: number; woken_count: number }>> {
    return this.post(this.co('/agents/wake-all'));
  }

  killAll(): Promise<AxonResult<{ status: string }>> {
    return this.post(this.co('/agents/kill'));
  }

  // -------------------------------------------------------------------------
  // Activity Log — company-scoped
  // -------------------------------------------------------------------------

  getActivityLog(limit = 50): Promise<AxonResult<AxonActivity[]>> {
    return this.get(this.co(`/activity?limit=${limit}`));
  }

  // -------------------------------------------------------------------------
  // SSE Stream URL — company-scoped
  // -------------------------------------------------------------------------

  getStreamUrl(): string {
    return `${this.baseUrl}${this.co('/stream')}`;
  }
}

// ---------------------------------------------------------------------------
// Singleton — survives Next.js hot reloads via globalThis
// ---------------------------------------------------------------------------

const globalForAxon = globalThis as unknown as { __axonClient?: AxonClient };

export function getAxonClient(opts?: {
  baseUrl?: string;
  companyId?: string;
}): AxonClient {
  if (opts) {
    globalForAxon.__axonClient = new AxonClient(opts);
  }
  if (!globalForAxon.__axonClient) {
    globalForAxon.__axonClient = new AxonClient();
  }
  return globalForAxon.__axonClient;
}

export function resetAxonClient(): void {
  globalForAxon.__axonClient = undefined;
}
