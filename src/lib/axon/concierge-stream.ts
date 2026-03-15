// ============================================================================
// PhantomX — Axon Concierge Streaming Client
// Sends a message to the concierge POST endpoint and reads the SSE response
// as an async stream, dispatching typed events via callbacks.
// ============================================================================

import { PHANTOM_COMPANY_ID, getAxonClient } from './client';
import type { ConciergeStreamEvent, AxonChatMessage } from './types';

// ---------------------------------------------------------------------------
// Public callback interface
// ---------------------------------------------------------------------------

export interface ConciergeCallbacks {
  onText: (text: string) => void;
  onToolUse: (name: string, input: Record<string, unknown>) => void;
  onToolResult: (content: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'http://localhost:8400/api';

// ---------------------------------------------------------------------------
// SSE line parser
// ---------------------------------------------------------------------------

function parseSSELine(line: string): ConciergeStreamEvent | null {
  // SSE protocol: lines starting with "data:" contain the payload
  if (!line.startsWith('data:')) return null;

  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;

  try {
    return JSON.parse(payload) as ConciergeStreamEvent;
  } catch {
    // Malformed JSON — skip
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main streaming function
// ---------------------------------------------------------------------------

/**
 * Sends a message to the Axon concierge chat endpoint and streams the
 * SSE response, dispatching typed events via the provided callbacks.
 *
 * Supports cancellation via an optional AbortSignal.
 */
export async function streamConciergeChat(
  message: string,
  callbacks: ConciergeCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  // Use the AxonClient's stream URL base to respect any custom baseUrl config
  const streamUrl = getAxonClient().getStreamUrl();
  // Derive the API base from the stream URL (strip /companies/.../stream)
  const baseUrl = streamUrl.replace(/\/companies\/.*$/, '') || DEFAULT_BASE_URL;
  const url = `${baseUrl}/companies/${PHANTOM_COMPANY_ID}/concierge/chat`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onError(`Connection failed: ${msg}`);
    return;
  }

  if (!response.ok) {
    let detail: string;
    try {
      const body = await response.text();
      detail = (JSON.parse(body) as { detail?: string }).detail ?? body;
    } catch {
      detail = `HTTP ${response.status}`;
    }
    callbacks.onError(detail);
    return;
  }

  const body = response.body;
  if (!body) {
    callbacks.onError('Response body is empty');
    return;
  }

  // Read the stream as text
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines; individual data lines by single newlines
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue; // blank line (event separator)

        const event = parseSSELine(trimmed);
        if (!event) continue;

        switch (event.type) {
          case 'text':
            if (event.content) callbacks.onText(event.content);
            break;
          case 'tool_use':
            callbacks.onToolUse(
              event.tool_name ?? 'unknown_tool',
              event.tool_input ?? {},
            );
            break;
          case 'tool_result':
            callbacks.onToolResult(event.tool_result ?? event.content ?? '');
            break;
          case 'done':
            callbacks.onDone();
            return;
          case 'error':
            callbacks.onError(event.error ?? 'Unknown stream error');
            return;
        }
      }
    }

    // Stream ended without a "done" event — still notify
    callbacks.onDone();
  } catch (err) {
    if (signal?.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onError(`Stream error: ${msg}`);
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Chat history loader
// ---------------------------------------------------------------------------

/** @deprecated Use AxonChatMessage from './types' instead */
export type ChatHistoryMessage = AxonChatMessage;

/**
 * Loads conversation history from the Axon concierge.
 * Delegates to the AxonClient for consistent URL handling.
 */
export async function loadChatHistory(
  limit = 50,
): Promise<AxonChatMessage[]> {
  const client = getAxonClient();
  const result = await client.getChatHistory(limit);
  return result.ok ? result.data : [];
}

// ---------------------------------------------------------------------------
// Conversation reset
// ---------------------------------------------------------------------------

/**
 * Resets the concierge conversation history.
 */
export async function resetConciergeChat(): Promise<boolean> {
  const streamUrl = getAxonClient().getStreamUrl();
  const baseUrl = streamUrl.replace(/\/companies\/.*$/, '') || DEFAULT_BASE_URL;
  const url = `${baseUrl}/companies/${PHANTOM_COMPANY_ID}/concierge/reset`;

  try {
    const res = await fetch(url, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Checks if the Axon daemon is reachable.
 * Delegates to the AxonClient which knows the correct root URL.
 */
export async function checkAxonHealth(): Promise<boolean> {
  const result = await getAxonClient().health();
  return result.ok;
}
