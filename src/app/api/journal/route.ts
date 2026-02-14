// ============================================================================
// PhantomX — Trading Journal API (Screenshot Save + Day Summary)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getTradingAssistant } from '@/lib/ai/trading-assistant';
import type { JournalEntry } from '@/types/trading';

const SNAPSHOT_DIR = path.join(process.cwd(), 'public', 'journal-snapshots');

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // Save a chart screenshot to disk and return the public path
      case 'save_snapshot': {
        const { imageBase64, entryId } = body;
        if (!imageBase64 || !entryId) {
          return NextResponse.json({ error: 'imageBase64 and entryId required' }, { status: 400 });
        }

        // Ensure directory exists
        if (!existsSync(SNAPSHOT_DIR)) {
          await mkdir(SNAPSHOT_DIR, { recursive: true });
        }

        const filename = `${entryId}.png`;
        const filePath = path.join(SNAPSHOT_DIR, filename);
        const buffer = Buffer.from(imageBase64, 'base64');
        await writeFile(filePath, buffer);

        const publicPath = `/journal-snapshots/${filename}`;
        return NextResponse.json({ success: true, path: publicPath });
      }

      // Generate an AI narrative summary of the day's journal entries
      case 'generate_summary': {
        const entries: JournalEntry[] = body.entries ?? [];
        if (entries.length === 0) {
          return NextResponse.json({ error: 'No journal entries to summarize' }, { status: 400 });
        }

        const assistant = getTradingAssistant();

        // Build a condensed timeline for Claude
        const timeline = entries.map((e) => {
          const time = new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          const parts = [`[${time}] Tick #${e.tick} — ${e.type.toUpperCase()}`];
          if (e.symbol) parts.push(`Symbol: ${e.symbol}`);
          if (e.action) parts.push(`Action: ${e.action}`);
          parts.push(`Reason: ${e.reason}`);
          if (e.confidence) parts.push(`Confidence: ${e.confidence}%`);
          if (e.price) parts.push(`Price: $${e.price}`);
          if (e.pnl !== undefined) parts.push(`P&L: $${e.pnl.toFixed(2)} (${(e.pnlPercent ?? 0).toFixed(1)}%)`);
          parts.push(`Portfolio: $${e.portfolioState.equity.toFixed(2)} | ${e.portfolioState.cashPercent.toFixed(0)}% cash | ${e.portfolioState.positionCount} positions | Day P&L: $${e.portfolioState.dailyPnl.toFixed(2)}`);
          if (e.indicators && Object.keys(e.indicators).length > 0) {
            parts.push(`Indicators: ${Object.entries(e.indicators).map(([k, v]) => `${k}=${v}`).join(', ')}`);
          }
          return parts.join(' | ');
        }).join('\n\n');

        const firstEntry = entries[0];
        const lastEntry = entries[entries.length - 1];
        const trades = entries.filter(e => e.type === 'trade' || e.type === 'close');
        const wins = entries.filter(e => e.type === 'close' && (e.pnl ?? 0) > 0);
        const losses = entries.filter(e => e.type === 'close' && (e.pnl ?? 0) < 0);
        const totalPnl = entries
          .filter(e => e.type === 'close' && e.pnl !== undefined)
          .reduce((sum, e) => sum + (e.pnl ?? 0), 0);

        const summaryPrompt = `You are writing a trading journal summary for a crypto scalper/swing trader. Write a narrative play-by-play of the trading day — what happened, why decisions were made, what worked, what didn't, and lessons learned.

## Day Stats
- Session: ${new Date(firstEntry.timestamp).toLocaleTimeString()} → ${new Date(lastEntry.timestamp).toLocaleTimeString()}
- Starting equity: $${firstEntry.portfolioState.equity.toFixed(2)}
- Ending equity: $${lastEntry.portfolioState.equity.toFixed(2)}
- Total realized P&L: $${totalPnl.toFixed(2)}
- Trades executed: ${trades.length}
- Wins: ${wins.length} | Losses: ${losses.length}
- Win rate: ${trades.length > 0 ? ((wins.length / Math.max(1, wins.length + losses.length)) * 100).toFixed(0) : 0}%

## Full Timeline
${timeline}

## Requirements
- Write in first person ("We opened a long on SOL because...")
- Be specific about WHY each decision was made (indicators, patterns, price action)
- Call out what worked and what didn't
- Note any patterns in the decision-making (good or bad habits)
- End with 2-3 concrete takeaways / lessons for tomorrow
- Keep it conversational and insightful, not robotic
- Use markdown formatting (bold for key numbers, bullet points for takeaways)`;

        const response = await assistant.chat(summaryPrompt);
        return NextResponse.json({ success: true, summary: response.content });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[PhantomX Journal] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
