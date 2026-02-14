// ============================================================================
// PhantomX — Shared SSE Broadcast (used by heartbeat + agents APIs)
// ============================================================================

const sseClients = new Set<ReadableStreamDefaultController>();

export function addSSEClient(controller: ReadableStreamDefaultController): void {
  sseClients.add(controller);
}

export function removeSSEClient(controller: ReadableStreamDefaultController): void {
  sseClients.delete(controller);
}

export function broadcastSSE(event: unknown): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoded = new TextEncoder().encode(data);
  for (const controller of sseClients) {
    try {
      controller.enqueue(encoded);
    } catch {
      sseClients.delete(controller);
    }
  }
}
