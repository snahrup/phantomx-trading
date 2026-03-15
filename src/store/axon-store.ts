// ============================================================================
// PhantomX — Axon Daemon Store (Zustand)
// Manages connection, agents, issues, chat, and SSE state for the Axon
// multi-agent daemon running at localhost:8400.
// ============================================================================

import { create } from 'zustand';
import type {
  AxonAgent,
  AxonAgentStatus,
  AxonActivity,
  AxonIssue,
  AxonChatMessage,
  AxonTradingPipeline,
  AxonCompanyStatus,
} from '@/lib/axon/types';
import { getAxonClient } from '@/lib/axon/client';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AxonState {
  // Connection
  connected: boolean;
  daemonOnline: boolean;
  lastHealthCheck: Date | null;
  schedulerRunning: boolean;

  // Daemon reconnection tracking
  reconnecting: boolean;
  failedAttempts: number;
  /** Brief flash: daemon just came back online */
  justReconnected: boolean;

  // Agents
  agents: AxonAgent[];
  agentEvents: AxonActivity[];

  // Issues & Pipeline
  issues: AxonIssue[];
  tradingPipelines: AxonTradingPipeline[];

  // Concierge Chat
  chatMessages: AxonChatMessage[];
  chatStreaming: boolean;

  // Company-level
  tradingMode: 'manual' | 'autonomous';
  companyStatus: AxonCompanyStatus | null;

  // Cost tracking (aggregated from companyStatus)
  todayCostUsd: number;
  monthlyCostUsd: number;

  // Polling fallback
  _pollTimer: ReturnType<typeof setInterval> | null;
  // Daemon health monitor
  _healthMonitorTimer: ReturnType<typeof setInterval> | null;
  _reconnectedTimer: ReturnType<typeof setTimeout> | null;

  // Actions — API
  checkHealth: () => Promise<boolean>;
  fetchAgents: () => Promise<void>;
  fetchIssues: (filters?: { issueType?: string; status?: string }) => Promise<void>;
  fetchCompanyStatus: () => Promise<void>;
  fetchChatHistory: () => Promise<void>;
  fetchActivity: (limit?: number) => Promise<void>;
  killAll: () => Promise<boolean>;

  // Actions — local state
  addChatMessage: (role: 'user' | 'assistant', content: string) => void;
  setChatStreaming: (streaming: boolean) => void;
  updateAgent: (agentId: string, updates: Partial<AxonAgent>) => void;
  setConnected: (connected: boolean) => void;
  clearActivity: () => void;

  // SSE lifecycle
  connectSSE: () => void;
  disconnectSSE: () => void;

  // SSE event handlers (called by store-bridge)
  handleAgentStatus: (data: Record<string, unknown>) => void;
  handleHeartbeatLog: (data: Record<string, unknown>) => void;
  handleIssueUpdate: (data: Record<string, unknown>) => void;
  handleActivity: (data: Record<string, unknown>) => void;

  // Polling fallback (when SSE disconnects)
  _startPolling: () => void;
  _stopPolling: () => void;

  // Daemon health monitor (reconnection logic)
  _startDaemonMonitor: () => void;
  _stopDaemonMonitor: () => void;
  /** Callback set by store-bridge to reconnect SSE when daemon comes back */
  _onDaemonBackOnline: (() => void) | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentSummary(agents: AxonAgent[]): { working: number; idle: number; error: number } {
  let working = 0;
  let idle = 0;
  let error = 0;
  for (const a of agents) {
    if (a.status === 'working') working++;
    else if (a.status === 'error') error++;
    else idle++;
  }
  return { working, idle, error };
}

/** Cap arrays to avoid unbounded growth */
function cap<T>(arr: T[], max: number): T[] {
  return arr.length > max ? arr.slice(-max) : arr;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAxonStore = create<AxonState>()((set, get) => ({
  // Initial state
  connected: false,
  daemonOnline: false,
  lastHealthCheck: null,
  schedulerRunning: false,

  reconnecting: false,
  failedAttempts: 0,
  justReconnected: false,

  agents: [],
  agentEvents: [],

  issues: [],
  tradingPipelines: [],

  chatMessages: [],
  chatStreaming: false,

  tradingMode: 'manual',
  companyStatus: null,

  todayCostUsd: 0,
  monthlyCostUsd: 0,

  _pollTimer: null,
  _healthMonitorTimer: null,
  _reconnectedTimer: null,
  _onDaemonBackOnline: null,

  // -------------------------------------------------------------------------
  // API actions
  // -------------------------------------------------------------------------

  checkHealth: async () => {
    const client = getAxonClient();
    const result = await client.health();
    const wasOffline = !get().daemonOnline;

    if (result.ok && result.data.status === 'ok') {
      const updates: Partial<AxonState> = {
        daemonOnline: true,
        schedulerRunning: result.data.scheduler_running,
        lastHealthCheck: new Date(),
        reconnecting: false,
        failedAttempts: 0,
      };

      // Flash "just reconnected" if we were previously offline
      if (wasOffline) {
        updates.justReconnected = true;
        // Clear any existing reconnected timer
        const prevTimer = get()._reconnectedTimer;
        if (prevTimer) clearTimeout(prevTimer);
        const timer = setTimeout(() => {
          set({ justReconnected: false, _reconnectedTimer: null });
        }, 3_000);
        updates._reconnectedTimer = timer;
      }

      set(updates);
      return true;
    }

    const attempts = get().failedAttempts + 1;
    set({
      daemonOnline: false,
      lastHealthCheck: new Date(),
      reconnecting: true,
      failedAttempts: attempts,
    });
    return false;
  },

  fetchAgents: async () => {
    const client = getAxonClient();
    const result = await client.listAgents();
    if (result.ok) {
      set({ agents: result.data });
    }
  },

  fetchIssues: async (filters) => {
    const client = getAxonClient();
    const result = await client.listIssues(
      filters
        ? {
            status: filters.status,
            issue_type: filters.issueType as AxonIssue['issue_type'] | undefined,
          }
        : undefined,
    );
    if (result.ok) {
      set({ issues: result.data });
    }
  },

  fetchCompanyStatus: async () => {
    const client = getAxonClient();
    const result = await client.getCompanyStatus();
    if (result.ok) {
      set({
        companyStatus: result.data,
        agents: result.data.agents,
        issues: result.data.issues,
        monthlyCostUsd: result.data.monthly_costs.total,
      });
    }
  },

  fetchChatHistory: async () => {
    const client = getAxonClient();
    const result = await client.getChatHistory(50);
    if (result.ok) {
      set({ chatMessages: result.data });
    }
  },

  fetchActivity: async (limit = 50) => {
    const client = getAxonClient();
    const result = await client.getActivityLog(limit);
    if (result.ok) {
      // Parse detail_json from REST API responses into detail objects
      const parsed: AxonActivity[] = result.data.map((row: any) => {
        let detail: Record<string, unknown> = {};
        if (typeof row.detail_json === 'string') {
          try { detail = JSON.parse(row.detail_json); } catch { detail = {}; }
        } else if (row.detail && typeof row.detail === 'object') {
          detail = row.detail;
        }
        return {
          id: row.id,
          company_id: row.company_id,
          agent_id: row.agent_id,
          issue_id: row.issue_id,
          action: row.action,
          detail,
          timestamp: row.timestamp,
        };
      });

      // Merge: REST data is authoritative, but preserve any recent SSE-only
      // events (they may not be in the DB yet). This prevents the flash-
      // disappear effect where SSE events show, poll overwrites them away,
      // then they reappear on the next poll.
      const restIds = new Set(parsed.map((a) => a.id));
      const existing = get().agentEvents;
      const sseOnly = existing.filter(
        (e) => !restIds.has(e.id) && !e.id.startsWith('hb-') && !e.id.startsWith('act-'),
      );
      // For synthetic IDs (hb-*, act-*) from SSE, keep them only if they're
      // newer than the oldest REST event (they haven't been indexed yet).
      const oldestRestTs = parsed.length > 0
        ? Math.min(...parsed.map((a) => new Date(a.timestamp).getTime()))
        : 0;
      const recentSynthetic = existing.filter(
        (e) =>
          (e.id.startsWith('hb-') || e.id.startsWith('act-')) &&
          new Date(e.timestamp).getTime() > oldestRestTs,
      );
      const merged = cap(
        [...parsed, ...sseOnly, ...recentSynthetic].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        ),
        100,
      );
      set({ agentEvents: merged });
    }
  },

  killAll: async () => {
    const client = getAxonClient();
    const result = await client.killAll();
    if (result.ok) {
      // Refresh agents to reflect killed state
      await get().fetchAgents();
      return true;
    }
    return false;
  },

  // -------------------------------------------------------------------------
  // Local state mutations
  // -------------------------------------------------------------------------

  addChatMessage: (role, content) =>
    set((s) => ({
      chatMessages: cap(
        [
          ...s.chatMessages,
          {
            id: `local-${Date.now()}`,
            company_id: '',
            agent_id: null,
            role,
            content,
            created_at: new Date().toISOString(),
          },
        ],
        200,
      ),
    })),

  setChatStreaming: (chatStreaming) => set({ chatStreaming }),

  updateAgent: (agentId, updates) =>
    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, ...updates } : a,
      ),
    })),

  setConnected: (connected) => {
    set({ connected });
    if (!connected) {
      get()._startPolling();
    } else {
      get()._stopPolling();
    }
  },

  clearActivity: () => set({ agentEvents: [] }),

  // -------------------------------------------------------------------------
  // SSE lifecycle
  // -------------------------------------------------------------------------

  connectSSE: () => {
    // Actual SSE connection is handled by store-bridge.ts.
    // Don't blindly set connected — the 'connection' SSE event will
    // call setConnected(true) when the EventSource actually opens.
    get()._stopPolling();
  },

  disconnectSSE: () => {
    set({ connected: false });
    get()._startPolling();
  },

  // -------------------------------------------------------------------------
  // SSE event handlers
  // -------------------------------------------------------------------------

  handleAgentStatus: (data) => {
    // Backend sends full agent object with "id", not "agent_id"
    const agentId = (data.id ?? data.agent_id) as string;
    const newStatus = data.status as AxonAgentStatus;
    if (!agentId || !newStatus) return;

    set((s) => ({
      agents: s.agents.map((a) =>
        a.id === agentId ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a,
      ),
    }));
  },

  handleHeartbeatLog: (data) => {
    // Parse detail_json if it's a string (comes from SSE as raw DB row)
    let detail: Record<string, unknown> = {};
    if (typeof data.detail_json === 'string') {
      try { detail = JSON.parse(data.detail_json as string); } catch { detail = {}; }
    } else if (data.detail && typeof data.detail === 'object') {
      detail = data.detail as Record<string, unknown>;
    } else {
      detail = data;
    }

    // Resolve agent_id → agent_name so the feed can display real names
    const agentId = (data.agent_id as string) || null;
    if (agentId && !detail.agent_name) {
      const agent = get().agents.find((a) => a.id === agentId);
      if (agent) detail.agent_name = agent.name;
    }

    // Promote heartbeat fields (log_text, thinking_text, decisions_json) into
    // the detail object so AgentFeedPanel's extractRichContent can find them.
    if (data.log_text && !detail.log_text) detail.log_text = data.log_text;
    if (data.thinking_text && !detail.thinking_text) detail.thinking_text = data.thinking_text;
    if (data.decisions_json && !detail.decisions_json) detail.decisions_json = data.decisions_json;

    const activity: AxonActivity = {
      id: (data.id as string) || (data.heartbeat_id as string) || `hb-${Date.now()}`,
      company_id: (data.company_id as string) || '',
      agent_id: agentId,
      issue_id: (data.issue_id as string) || null,
      action: (data.action as string) || 'heartbeat',
      detail,
      timestamp: (data.timestamp as string) || new Date().toISOString(),
    };

    set((s) => ({
      agentEvents: cap([...s.agentEvents, activity], 100),
    }));

    // Track cost if present
    if (typeof data.cost_usd === 'number') {
      set((s) => ({
        todayCostUsd: s.todayCostUsd + (data.cost_usd as number),
      }));
    }
  },

  handleIssueUpdate: (data) => {
    const issueId = data.issue_id as string;
    if (!issueId) return;

    set((s) => ({
      issues: s.issues.map((issue) =>
        issue.id === issueId
          ? {
              ...issue,
              ...(data.status ? { status: data.status as AxonIssue['status'] } : {}),
              ...(data.priority ? { priority: data.priority as AxonIssue['priority'] } : {}),
              ...(data.assigned_agent_id !== undefined
                ? { assigned_agent_id: data.assigned_agent_id as string | null }
                : {}),
              updated_at: new Date().toISOString(),
            }
          : issue,
      ),
    }));
  },

  handleActivity: (data) => {
    // Parse detail_json if it's a string (comes from SSE as raw DB row)
    let detail: Record<string, unknown> = {};
    if (typeof data.detail_json === 'string') {
      try { detail = JSON.parse(data.detail_json as string); } catch { detail = {}; }
    } else if (data.detail && typeof data.detail === 'object') {
      detail = data.detail as Record<string, unknown>;
    } else {
      detail = data;
    }

    // Resolve agent_id → agent_name so the feed can display real names
    const agentId = (data.agent_id as string) || null;
    if (agentId && !detail.agent_name) {
      const agent = get().agents.find((a) => a.id === agentId);
      if (agent) detail.agent_name = agent.name;
    }

    // Promote comment fields into detail so AgentFeedPanel can render them
    if (data.content && !detail.content) detail.content = data.content;
    if (data.comment_content && !detail.comment_content) detail.comment_content = data.comment_content;
    if (data.comment_type && !detail.comment_type) detail.comment_type = data.comment_type;
    if (data.wave != null && detail.wave == null) detail.wave = data.wave;
    if (data.issue_title && !detail.issue_title) detail.issue_title = data.issue_title;

    const activity: AxonActivity = {
      id: (data.id as string) || `act-${Date.now()}`,
      company_id: (data.company_id as string) || '',
      agent_id: agentId,
      issue_id: (data.issue_id as string) || null,
      action: (data.action as string) || 'unknown',
      detail,
      timestamp: (data.timestamp as string) || new Date().toISOString(),
    };

    set((s) => ({
      agentEvents: cap([...s.agentEvents, activity], 100),
    }));
  },

  // -------------------------------------------------------------------------
  // Polling fallback (when SSE is disconnected)
  // -------------------------------------------------------------------------

  _startPolling: () => {
    const existing = get()._pollTimer;
    if (existing) return; // Already polling

    const timer = setInterval(async () => {
      await get().checkHealth();
      // Re-read state after the await — the snapshot from before checkHealth()
      // is stale since checkHealth() calls set() internally.
      if (get().daemonOnline) {
        await get().fetchAgents();
        // Also poll activity and issues so Mission Control stays alive
        // when SSE is disconnected
        await get().fetchActivity(50);
        await get().fetchIssues();
      }
    }, 15_000);

    set({ _pollTimer: timer });
  },

  _stopPolling: () => {
    const timer = get()._pollTimer;
    if (timer) {
      clearInterval(timer);
      set({ _pollTimer: null });
    }
  },

  // -------------------------------------------------------------------------
  // Daemon health monitor
  // Polls /health to detect daemon going offline or coming back online.
  // When offline: 5s interval, backs off to 15s after 5 failed attempts.
  // When online: 30s interval to detect daemon going down.
  // -------------------------------------------------------------------------

  _startDaemonMonitor: () => {
    // Don't double-start
    if (get()._healthMonitorTimer) return;

    const schedule = () => {
      const store = get();
      // Dynamic interval: 5s when offline, 15s after 5+ failures, 30s when healthy
      const interval = store.daemonOnline
        ? 30_000
        : store.failedAttempts >= 5
          ? 15_000
          : 5_000;

      const timerId = setTimeout(async () => {
        const s = get();
        const wasOnline = s.daemonOnline;
        const online = await s.checkHealth();

        // If daemon just came back online, fire the callback so SSE reconnects
        if (online && !wasOnline) {
          const cb = get()._onDaemonBackOnline;
          if (cb) cb();
        }

        // Reschedule if monitor is still active
        if (get()._healthMonitorTimer !== null) {
          schedule();
        }
      }, interval);

      set({ _healthMonitorTimer: timerId });
    };

    // Run first check immediately, then start the schedule loop
    const s = get();
    s.checkHealth().then(() => schedule());

    // Set a sentinel so we know the monitor is starting
    set({ _healthMonitorTimer: -1 as unknown as ReturnType<typeof setTimeout> });
  },

  _stopDaemonMonitor: () => {
    const timer = get()._healthMonitorTimer;
    if (timer) {
      clearTimeout(timer);
      set({ _healthMonitorTimer: null });
    }
    const reconnectedTimer = get()._reconnectedTimer;
    if (reconnectedTimer) {
      clearTimeout(reconnectedTimer);
      set({ _reconnectedTimer: null, justReconnected: false });
    }
  },
}));

// ---------------------------------------------------------------------------
// Derived selectors (for components to consume)
// ---------------------------------------------------------------------------

export function useAxonAgentSummary() {
  const agents = useAxonStore((s) => s.agents);
  return agentSummary(agents);
}

export function useAxonLastHeartbeat(): { agentName: string; timeAgo: string } | null {
  const events = useAxonStore((s) => s.agentEvents);
  const agents = useAxonStore((s) => s.agents);

  const lastHb = [...events]
    .filter((e) => e.action === 'heartbeat')
    .pop();

  if (!lastHb) return null;

  const agent = agents.find((a) => a.id === lastHb.agent_id);
  const agentName = agent?.name || 'Unknown';
  const elapsed = Date.now() - new Date(lastHb.timestamp).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  const timeAgo = minutes < 1 ? 'just now' : `${minutes}m ago`;

  return { agentName, timeAgo };
}

export function useAxonActivePipelines(): number {
  const issues = useAxonStore((s) => s.issues);
  return issues.filter(
    (i) => i.issue_type === 'trading' && (i.status === 'in_progress' || i.status === 'review'),
  ).length;
}
