// ============================================================================
// PhantomX — API Error Sanitizer (HIGH-5)
// Returns generic error to client, logs full details server-side.
// ============================================================================

import { NextResponse } from 'next/server';

/**
 * Create a safe error response that doesn't leak internal details in production.
 * In development, the full error message is returned for debugging convenience.
 */
export function safeErrorResponse(err: unknown, context: string, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[PhantomX ${context}] Error:`, err);

  const clientMessage = process.env.NODE_ENV === 'production'
    ? 'An internal error occurred. Check server logs.'
    : message;

  return NextResponse.json({ error: clientMessage }, { status });
}
