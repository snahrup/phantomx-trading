// ============================================================================
// PhantomX — Concurrent AI Query Pool with Priority + Retry
// ============================================================================
// Manages concurrent Claude Code Agent SDK query() calls across all engines.
// Runs up to MAX_CONCURRENT queries in parallel with priority scheduling.
// Auto-retries on "exit code 1" errors with exponential backoff.
//
// Priority levels (highest first):
//   'critical' — Live trading heartbeat (never waits behind scans)
//   'high'     — Paper trading execution, 5-wave pipeline
//   'normal'   — Research scans, general queries
//   'low'      — Background tasks, non-urgent analysis
//
// Usage:
//   import { queuedQuery } from './query-queue';
//   const text = await queuedQuery(prompt, systemPrompt, { priority: 'critical' });
//
// Or for streaming:
//   import { queuedQueryStream } from './query-queue';
//   for await (const msg of queuedQueryStream(queryInput, { priority: 'high' })) { ... }
// ============================================================================

import { query } from '@anthropic-ai/claude-agent-sdk';
import { ensureOAuthEnv, getClaudeCodePath, getNextOAuthToken, getTokenCount } from './credentials';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Max queries running at the same time. 3 = Claude Max can handle it with stagger. */
const MAX_CONCURRENT = parseInt(process.env.PHANTOMX_MAX_CONCURRENT_QUERIES || '3', 10);

/** Minimum delay (ms) between launching queries to avoid burst-hitting rate limits */
const LAUNCH_STAGGER_MS = 1500;

/** Max retries for transient errors (exit code 1, rate limits) */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 3000;

// ---------------------------------------------------------------------------
// Priority System
// ---------------------------------------------------------------------------

export type QueryPriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_RANK: Record<QueryPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Token Rotation — round-robin across multiple Claude Max subscriptions
// ---------------------------------------------------------------------------

/**
 * Set the next OAuth token in process.env before each query launch.
 * With 2 subscriptions, this alternates between them, doubling effective rate limits.
 */
function rotateToken(): void {
  const token = getNextOAuthToken();
  if (token) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
  }
}

// ---------------------------------------------------------------------------
// Error Classification
// ---------------------------------------------------------------------------

/** Check if an error is transient and worth retrying */
function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('exited with') ||
    msg.includes('exit code') ||
    msg.includes('code 1') ||
    msg.includes('rate_limit') ||
    msg.includes('overloaded') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('spawn') ||
    msg.includes('429')
  );
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Pool Implementation
// ---------------------------------------------------------------------------

interface PoolEntry {
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
  priority: QueryPriority;
  label?: string;
  enqueuedAt: number;
}

const pendingQueue: PoolEntry[] = [];
let activeCount = 0;
const activeLabels: Set<string> = new Set();
let lastLaunchTime = 0;

/** Sort: highest priority first, then FIFO within same priority */
function sortQueue(): void {
  pendingQueue.sort((a, b) => {
    const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.enqueuedAt - b.enqueuedAt;
  });
}

async function tryLaunchNext(): Promise<void> {
  if (activeCount >= MAX_CONCURRENT || pendingQueue.length === 0) return;

  // Stagger launches to avoid burst
  const now = Date.now();
  const timeSinceLast = now - lastLaunchTime;
  if (timeSinceLast < LAUNCH_STAGGER_MS && activeCount > 0) {
    setTimeout(() => tryLaunchNext(), LAUNCH_STAGGER_MS - timeSinceLast);
    return;
  }

  sortQueue();
  const entry = pendingQueue.shift()!;
  activeCount++;
  lastLaunchTime = Date.now();
  const label = entry.label ?? 'unnamed';
  activeLabels.add(label);

  console.log(`[QueryPool] START "${label}" (priority: ${entry.priority}) | active: ${activeCount}/${MAX_CONCURRENT} | queued: ${pendingQueue.length}`);

  // Run the query — don't await here, let it resolve independently
  entry.execute()
    .then(() => entry.resolve())
    .catch((err) => entry.reject(err))
    .finally(() => {
      activeCount--;
      activeLabels.delete(label);
      console.log(`[QueryPool] DONE "${label}" | active: ${activeCount}/${MAX_CONCURRENT} | queued: ${pendingQueue.length}`);
      // Launch next waiting entry
      tryLaunchNext();
    });

  // If there's still room, launch more
  if (activeCount < MAX_CONCURRENT && pendingQueue.length > 0) {
    // Small delay for stagger
    setTimeout(() => tryLaunchNext(), LAUNCH_STAGGER_MS);
  }
}

function enqueue(
  execute: () => Promise<void>,
  priority: QueryPriority = 'normal',
  label?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    pendingQueue.push({
      execute,
      resolve,
      reject,
      priority,
      label,
      enqueuedAt: Date.now(),
    });
    tryLaunchNext();
  });
}

// ---------------------------------------------------------------------------
// Pool Slot — Hold a slot while running arbitrary async work (live streaming)
// ---------------------------------------------------------------------------

/**
 * Acquire a pool slot, run your function, release the slot when done.
 * Unlike queuedQueryStream which buffers, this lets you stream in real-time
 * while holding the slot. Use this for interactive chat where the user is
 * watching the stream live.
 */
export async function withPoolSlot<T>(
  fn: () => Promise<T>,
  priority: QueryPriority = 'normal',
  label?: string
): Promise<T> {
  ensureOAuthEnv();
  let result!: T;
  await enqueue(async () => {
    result = await fn();
  }, priority, label);
  return result;
}

// ---------------------------------------------------------------------------
// Status / Debugging
// ---------------------------------------------------------------------------

export function getQueueStatus() {
  return {
    activeCount,
    maxConcurrent: MAX_CONCURRENT,
    queueLength: pendingQueue.length,
    activeQueries: [...activeLabels],
    pendingByPriority: {
      critical: pendingQueue.filter(e => e.priority === 'critical').length,
      high: pendingQueue.filter(e => e.priority === 'high').length,
      normal: pendingQueue.filter(e => e.priority === 'normal').length,
      low: pendingQueue.filter(e => e.priority === 'low').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Queued AI Query — Simple text response with retry
// ---------------------------------------------------------------------------

export interface QueuedQueryOptions {
  model?: string;
  fallbackModel?: string;
  maxTurns?: number;
  systemPrompt?: string;
  effort?: string;
  thinking?: { type: string };
  priority?: QueryPriority;
  label?: string;
  // MCP tool support — enables multi-turn tool-using queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpServers?: Record<string, any>;
  permissionMode?: string;
  allowDangerouslySkipPermissions?: boolean;
}

/**
 * Concurrent-pool version of aiQuery with automatic retry.
 * Runs when a slot is available (up to MAX_CONCURRENT).
 * Higher-priority queries jump ahead in the queue.
 * Retries up to MAX_RETRIES times on transient errors (exit code 1, rate limits).
 */
export async function queuedQuery(
  prompt: string,
  systemPromptText: string,
  options: QueuedQueryOptions = {},
  signal?: AbortSignal
): Promise<string> {
  ensureOAuthEnv();
  const claudeCodePath = getClaudeCodePath();
  const priority = options.priority ?? 'normal';
  const label = options.label ?? `text-${priority}`;

  let result = '';

  await enqueue(async () => {
    if (signal?.aborted) return;

    const model = options.model ?? 'claude-sonnet-4-5-20250929';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryOptions: Record<string, any> = {
      pathToClaudeCodeExecutable: claudeCodePath,
      model,
      fallbackModel: options.fallbackModel ?? (model.includes('opus') ? 'claude-sonnet-4-5-20250929' : undefined),
      maxTurns: options.maxTurns ?? 1,
      thinking: options.thinking ?? { type: 'adaptive' },
      effort: options.effort ?? 'high',
      systemPrompt: {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append: systemPromptText,
      },
    };

    // Attach MCP servers for tool-using queries (multi-turn research, deep analysis)
    if (options.mcpServers) {
      queryOptions.mcpServers = options.mcpServers;
      queryOptions.permissionMode = options.permissionMode ?? 'bypassPermissions';
      queryOptions.allowDangerouslySkipPermissions = options.allowDangerouslySkipPermissions ?? true;
      queryOptions.includePartialMessages = true;
    }

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) return;

      try {
        result = '';
        rotateToken();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const message of query({ prompt, options: queryOptions } as any)) {
          if (signal?.aborted) break;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = message as any;
          if (msg.type === 'stream_event') {
            const delta = msg.event?.delta;
            if (delta?.type === 'text_delta' && delta.text) {
              result += delta.text;
            }
          } else if (msg.type === 'assistant') {
            const content = msg.message?.content || msg.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text && !result) {
                  result = block.text;
                }
              }
            }
          }
        }

        // If we got a result, we're done — no need to retry
        if (result.length > 0) break;

        // Empty result but no error — might be transient, retry if we have attempts left
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[QueryPool] EMPTY result for "${label}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      } catch (err) {
        if (signal?.aborted) return;

        if (isRetryableError(err) && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[QueryPool] RETRY "${label}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}) after error: ${err instanceof Error ? err.message : String(err)}. Waiting ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        // Final attempt failed — throw
        throw err;
      }
    }
  }, priority, label);

  return result;
}

// ---------------------------------------------------------------------------
// Queued Query Stream — For engines that need streaming events (with retry)
// ---------------------------------------------------------------------------

export interface QueuedStreamOptions {
  priority?: QueryPriority;
  label?: string;
}

/**
 * Concurrent-pool version of query() that yields messages in order.
 * The pool slot is held for the entire duration of the streaming query.
 * Retries on transient errors (exit code 1).
 */
export async function* queuedQueryStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryInput: any,
  options?: QueuedStreamOptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): AsyncGenerator<any, void, undefined> {
  ensureOAuthEnv();

  const priority = options?.priority ?? 'normal';
  const label = options?.label ?? `stream-${priority}`;

  // Collect all messages while holding the pool slot, then yield them
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [];

  await enqueue(async () => {
    // Retry loop for stream queries
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        messages.length = 0; // reset on retry
        rotateToken();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const message of query(queryInput as any)) {
          messages.push(message);
        }
        // Success — break retry loop
        if (messages.length > 0) break;

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[QueryPool] EMPTY stream for "${label}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      } catch (err) {
        if (isRetryableError(err) && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[QueryPool] RETRY stream "${label}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}) after error: ${err instanceof Error ? err.message : String(err)}. Waiting ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        throw err;
      }
    }
  }, priority, label);

  // Now yield them outside the pool (slot already released)
  for (const msg of messages) {
    yield msg;
  }
}
