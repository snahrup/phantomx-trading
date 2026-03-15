// ============================================================================
// PhantomX — Axon Daemon Type Definitions
// Types matching the Axon API data model (FastAPI backend on :8400)
// ============================================================================

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export type AxonAgentStatus = 'idle' | 'working' | 'sleeping' | 'error' | 'paused';

export interface AxonAgent {
  id: string;
  company_id: string;
  name: string;
  role: string;
  title: string;
  reports_to: string | null;
  adapter: 'sdk' | 'subprocess';
  instructions_path: string | null;
  heartbeat_interval_s: number;
  status: AxonAgentStatus;
  monthly_budget_usd: number | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Agent Persona (loaded from disk instruction files)
// ---------------------------------------------------------------------------

export interface AxonAgentPersona {
  soul: string;
  heartbeat: string;
  tools: string;
  agents: string;
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export type AxonIssueStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled' | 'blocked';
export type AxonIssueType = 'operational' | 'coding' | 'triage' | 'trading';
export type AxonPriority = 'critical' | 'high' | 'medium' | 'low';

export interface AxonIssue {
  id: string;
  company_id: string;
  title: string;
  description: string;
  status: AxonIssueStatus;
  priority: AxonPriority;
  assigned_agent_id: string | null;
  issue_type: AxonIssueType;
  parent_issue_id: string | null;
  current_wave: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Issue Comments (agent-to-agent debate)
// ---------------------------------------------------------------------------

export type AxonCommentType =
  | 'finding'
  | 'argument'
  | 'ruling'
  | 'recommendation'
  | 'disagreement_detected';

export interface AxonIssueComment {
  id: string;
  issue_id: string;
  agent_id: string | null;
  content: string;
  wave: number | null;
  comment_type: AxonCommentType | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Heartbeat Runs
// ---------------------------------------------------------------------------

export interface AxonHeartbeatRun {
  id: string;
  agent_id: string;
  started_at: string;
  ended_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'skipped' | 'error';
  trigger: 'scheduled' | 'manual' | 'trading_wave';
  issue_id: string | null;
  tokens_used: number;
  cost_usd: number;
  log_text: string;
  thinking_text: string;
  decisions_json: string;
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

export interface AxonActivity {
  id: string;
  company_id: string;
  agent_id: string | null;
  issue_id: string | null;
  action: string;
  detail: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface AxonChatMessage {
  id: string;
  company_id: string;
  agent_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Cost Tracking
// ---------------------------------------------------------------------------

export interface AxonCostEntry {
  id: string;
  agent_id: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export interface AxonHealthResponse {
  status: 'ok' | 'error';
  scheduler_running: boolean;
  company_filter: string | null;
}

// ---------------------------------------------------------------------------
// Company Status Dashboard
// ---------------------------------------------------------------------------

export interface AxonCompanyStatus {
  agents: AxonAgent[];
  issues: AxonIssue[];
  monthly_costs: {
    total: number;
    by_agent: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// SSE Events
// ---------------------------------------------------------------------------

export type AxonSSEEventType =
  | 'agent_status'
  | 'heartbeat_log'
  | 'heartbeat_decision'
  | 'issue_update'
  | 'activity'
  | 'connection';

export interface AxonSSEEvent {
  type: AxonSSEEventType;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Trading Pipeline View
// ---------------------------------------------------------------------------

export interface AxonTradingPipeline {
  issue: AxonIssue;
  currentWave: number;
  subIssues: AxonIssue[];
  comments: AxonIssueComment[];
  waveStatus: Record<number, 'pending' | 'active' | 'completed'>;
}

// ---------------------------------------------------------------------------
// Concierge SSE Events (streaming chat)
// ---------------------------------------------------------------------------

export interface ConciergeStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'done' | 'error';
  content?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Agent Schedule View (enriched agent data for schedule visibility)
// ---------------------------------------------------------------------------

export interface AxonScheduleIssue {
  id: string;
  title: string;
  priority: AxonPriority;
  status: AxonIssueStatus;
  issue_type: AxonIssueType;
  current_wave: number;
  created_at: string;
}

export interface AxonLastRun {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'skipped' | 'error';
  trigger: string;
  tokens_used: number;
  cost_usd: number;
  log_preview: string;
}

export interface AxonAgentSchedule extends AxonAgent {
  last_heartbeat_at: string | null;
  next_due_at: string | null;
  time_until_due_s: number | null;
  is_overdue: boolean;
  last_run: AxonLastRun | null;
  assigned_issues: AxonScheduleIssue[];
  runs_24h: number;
}

// ---------------------------------------------------------------------------
// API Response Wrappers
// ---------------------------------------------------------------------------

export interface AxonApiError {
  detail: string;
}

/** Discriminated union for typed API results */
export type AxonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

// ---------------------------------------------------------------------------
// Issue Management Responses
// ---------------------------------------------------------------------------

export interface AxonDeleteResult {
  status: string;
  issue_id: string;
  sub_issues: number;
  comments: number;
  trade_executions: number;
}

export interface AxonRestartResult {
  status: string;
  original_issue_id: string;
  new_issue: AxonIssue | null;
}

export interface AxonBulkDeleteResult {
  action: string;
  deleted: number;
  sub_issues: number;
  comments: number;
  trade_executions: number;
}

export interface AxonStaleIssuesResponse {
  stale_count: number;
  stale_hours: number;
  issues: AxonIssue[];
}

export interface AxonPipelineWaveDetail {
  wave: number;
  sub_issues: AxonIssue[];
  status_counts: Record<string, number>;
}

export interface AxonPipelineStatusResponse {
  issue_id: string;
  title: string;
  status: string;
  current_wave: number;
  waves: Record<number, AxonPipelineWaveDetail>;
  comments_by_wave: Record<number, AxonIssueComment[]>;
  total_sub_issues: number;
  total_comments: number;
  trade_execution: Record<string, unknown> | null;
}
