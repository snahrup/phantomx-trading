// ============================================================================
// PhantomX — Interventions API
// ============================================================================
// GET: Returns behavioral intervention logs + summary stats.
// In-memory ring buffer (max 200) — session-scoped, not persisted.
// ============================================================================

import { NextResponse } from 'next/server';
import { getInterventionLogs, getInterventionStats } from '@/lib/ai/intervention-logger';

export async function GET() {
  try {
    return NextResponse.json({
      logs: getInterventionLogs(),
      stats: getInterventionStats(),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
