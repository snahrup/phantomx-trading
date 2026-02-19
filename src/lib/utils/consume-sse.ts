// ============================================================================
// PhantomX — Shared SSE Consumer Utility
// ============================================================================
// Consumes a POST-based SSE stream and dispatches parsed events to a callback.
// Used by both the Strategy page and the Agents pipeline showcase.
// ============================================================================

/**
 * POST a JSON body to an SSE endpoint and process the streamed events.
 * Each `data: {...}\n\n` chunk is parsed and forwarded to `onEvent`.
 */
export async function consumeSSE(
  url: string,
  body: Record<string, unknown>,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) throw new Error(`API error: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch { /* skip bad lines */ }
    }
  }
}
