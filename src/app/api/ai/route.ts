// ============================================================================
// PhantomX — AI Chat & Analysis API (Claude Agent SDK)
// Uses Claude Max OAuth — NO API billing
// Now with TRADE EXECUTION — the AI can act, not just talk
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getTradingAssistant } from '@/lib/ai/trading-assistant';
import { getPhemexClient } from '@/lib/phemex/client';
import { getKnowledgeBase } from '@/lib/agents/knowledge-base';
import { getInterventionLogs, getInterventionStats } from '@/lib/ai/intervention-logger';
import type { AutopilotClosedTrade, JournalEntry } from '@/types/trading';

// ---------------------------------------------------------------------------
// Command parser — extracts phantomx_command blocks from AI responses
// ---------------------------------------------------------------------------
interface TradeCommand {
  action: 'close_position' | 'open_long' | 'open_short' | 'set_stop_loss' | 'set_take_profit' | 'cancel_orders';
  symbol: string;
  size_usdt?: number;
  leverage?: number;
  stop_loss?: number;
  take_profit?: number;
  price?: number;
}

interface DrawCommand {
  lines: Array<{
    price: number;
    label: string;
    type: string;
    color?: string;
    style?: string;
  }>;
}

function parseCommands(text: string): { trades: TradeCommand[]; draws: DrawCommand | null } {
  const trades: TradeCommand[] = [];
  let draws: DrawCommand | null = null;

  // Parse trade commands
  const tradeMatch = text.match(/```phantomx_command\s*\n([\s\S]*?)```/);
  if (tradeMatch) {
    try {
      const parsed = JSON.parse(tradeMatch[1]);
      if (parsed.commands && Array.isArray(parsed.commands)) {
        trades.push(...parsed.commands);
      }
    } catch (e) {
      console.error('[PhantomX] Failed to parse trade commands:', e);
    }
  }

  // Parse draw commands
  const drawMatch = text.match(/```phantomx_draw\s*\n([\s\S]*?)```/);
  if (drawMatch) {
    try {
      draws = JSON.parse(drawMatch[1]);
    } catch (e) {
      console.error('[PhantomX] Failed to parse draw commands:', e);
    }
  }

  return { trades, draws };
}

// ---------------------------------------------------------------------------
// Trade executor — runs parsed commands against Phemex
// ---------------------------------------------------------------------------
async function executeTradeCommands(commands: TradeCommand[]): Promise<Array<{ command: TradeCommand; success: boolean; result: string; order?: unknown }>> {
  const client = getPhemexClient();
  if (!client) {
    return commands.map(c => ({ command: c, success: false, result: 'Phemex not connected' }));
  }

  const results: Array<{ command: TradeCommand; success: boolean; result: string; order?: unknown }> = [];

  for (const cmd of commands) {
    try {
      switch (cmd.action) {
        case 'close_position': {
          const positions = await client.getPositions(cmd.symbol);
          const pos = positions.find(p => p.symbol === cmd.symbol);
          if (!pos) {
            results.push({ command: cmd, success: false, result: `No open position for ${cmd.symbol}` });
            break;
          }
          const order = await client.closePosition(cmd.symbol, pos.side, pos.size);
          results.push({ command: cmd, success: true, result: `Closed ${pos.side} ${pos.size} ${cmd.symbol} @ market`, order });
          break;
        }

        case 'open_long':
        case 'open_short': {
          const side = cmd.action === 'open_long' ? 'buy' : 'sell';
          const leverage = cmd.leverage ?? 5;

          // Set leverage first
          try { await client.setLeverage(cmd.symbol, leverage); } catch { /* may already be set */ }

          // Get current price to calculate size
          const ticker = await client.getTicker(cmd.symbol);
          const currentPrice = ticker.last;
          const sizeUsdt = cmd.size_usdt ?? 10;
          const amount = sizeUsdt / currentPrice;

          // Try without posSide first, fall back to hedge mode
          let order;
          try {
            order = await client.createOrder(cmd.symbol, 'market', side, amount);
          } catch (openErr) {
            const openMsg = String(openErr);
            if (openMsg.includes('INCONSISTENT_POS_MODE') || openMsg.includes('20004')) {
              const posSide = cmd.action === 'open_long' ? 'Long' : 'Short';
              order = await client.createOrder(cmd.symbol, 'market', side, amount, undefined, { posSide });
            } else {
              throw openErr;
            }
          }
          results.push({ command: cmd, success: true, result: `Opened ${side} ${amount.toFixed(4)} ${cmd.symbol} @ ~$${currentPrice} (${leverage}x)`, order });

          // Set SL/TP if provided
          if (cmd.stop_loss) {
            try {
              const slSide = side === 'buy' ? 'sell' : 'buy';
              await client.createOrder(cmd.symbol, 'stop', slSide, amount, undefined, { stopPrice: cmd.stop_loss, reduceOnly: true });
              results.push({ command: { ...cmd, action: 'set_stop_loss', price: cmd.stop_loss }, success: true, result: `Stop loss set @ $${cmd.stop_loss}` });
            } catch (e) {
              results.push({ command: { ...cmd, action: 'set_stop_loss', price: cmd.stop_loss }, success: false, result: `SL failed: ${e}` });
            }
          }
          if (cmd.take_profit) {
            try {
              const tpSide = side === 'buy' ? 'sell' : 'buy';
              await client.createOrder(cmd.symbol, 'limit', tpSide, amount, cmd.take_profit, { reduceOnly: true });
              results.push({ command: { ...cmd, action: 'set_take_profit', price: cmd.take_profit }, success: true, result: `Take profit set @ $${cmd.take_profit}` });
            } catch (e) {
              results.push({ command: { ...cmd, action: 'set_take_profit', price: cmd.take_profit }, success: false, result: `TP failed: ${e}` });
            }
          }
          break;
        }

        case 'set_stop_loss': {
          const positions = await client.getPositions(cmd.symbol);
          const pos = positions.find(p => p.symbol === cmd.symbol);
          if (!pos || !cmd.price) {
            results.push({ command: cmd, success: false, result: `No position or no price for SL` });
            break;
          }
          // Cancel existing stop orders first
          try { await client.cancelAllOrders(cmd.symbol); } catch { /* best effort */ }
          const slSide = pos.side === 'long' ? 'sell' : 'buy';
          await client.createOrder(cmd.symbol, 'stop', slSide, pos.size, undefined, { stopPrice: cmd.price, reduceOnly: true });
          results.push({ command: cmd, success: true, result: `Stop loss set @ $${cmd.price} for ${pos.side} ${cmd.symbol}` });
          break;
        }

        case 'set_take_profit': {
          const positions = await client.getPositions(cmd.symbol);
          const pos = positions.find(p => p.symbol === cmd.symbol);
          if (!pos || !cmd.price) {
            results.push({ command: cmd, success: false, result: `No position or no price for TP` });
            break;
          }
          const tpSide = pos.side === 'long' ? 'sell' : 'buy';
          await client.createOrder(cmd.symbol, 'limit', tpSide, pos.size, cmd.price, { reduceOnly: true });
          results.push({ command: cmd, success: true, result: `Take profit set @ $${cmd.price} for ${pos.side} ${cmd.symbol}` });
          break;
        }

        case 'cancel_orders': {
          await client.cancelAllOrders(cmd.symbol);
          results.push({ command: cmd, success: true, result: `All orders cancelled for ${cmd.symbol}` });
          break;
        }

        default:
          results.push({ command: cmd, success: false, result: `Unknown action: ${cmd.action}` });
      }
    } catch (err) {
      results.push({ command: cmd, success: false, result: `Error: ${String(err)}` });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Dashboard context builder — trade history + stats for AI analytics mode
// ---------------------------------------------------------------------------

function buildTradeHistoryBlock(
  closedTrades: AutopilotClosedTrade[],
  journalEntries: JournalEntry[]
): string {
  if (closedTrades.length === 0 && journalEntries.length === 0) {
    return '== TRADE HISTORY ==\nNo closed trades or journal entries yet.\n';
  }

  const lines: string[] = ['== TRADE HISTORY =='];

  // Overall stats
  if (closedTrades.length > 0) {
    const totalPnl = closedTrades.reduce((s, t) => s + t.realizedPnl, 0);
    const wins = closedTrades.filter(t => t.realizedPnl > 0);
    const losses = closedTrades.filter(t => t.realizedPnl <= 0);
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length * 100).toFixed(1) : '0';
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.realizedPnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.realizedPnl, 0) / losses.length : 0;
    const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length / (avgLoss * losses.length)) : 0;

    lines.push(`\nSummary: ${closedTrades.length} trades | PnL: $${totalPnl.toFixed(2)} | Win Rate: ${winRate}% | Profit Factor: ${profitFactor.toFixed(2)}`);
    lines.push(`Wins: ${wins.length} (avg $${avgWin.toFixed(2)}) | Losses: ${losses.length} (avg $${avgLoss.toFixed(2)})`);

    // Per-symbol breakdown
    const bySymbol = new Map<string, { count: number; pnl: number; wins: number }>();
    for (const t of closedTrades) {
      const existing = bySymbol.get(t.symbol) ?? { count: 0, pnl: 0, wins: 0 };
      existing.count++;
      existing.pnl += t.realizedPnl;
      if (t.realizedPnl > 0) existing.wins++;
      bySymbol.set(t.symbol, existing);
    }

    lines.push('\nBy Symbol:');
    for (const [sym, stats] of [...bySymbol.entries()].sort((a, b) => b[1].pnl - a[1].pnl)) {
      const wr = (stats.wins / stats.count * 100).toFixed(0);
      lines.push(`  ${sym}: ${stats.count} trades, $${stats.pnl.toFixed(2)} PnL, ${wr}% win rate`);
    }

    // Last 30 individual trades
    const recent = closedTrades.slice(-30);
    lines.push(`\nLast ${recent.length} Trades:`);
    for (const t of recent) {
      const dur = t.holdDuration > 3600000
        ? `${(t.holdDuration / 3600000).toFixed(1)}h`
        : `${Math.round(t.holdDuration / 60000)}m`;
      const pnlStr = t.realizedPnl >= 0 ? `+$${t.realizedPnl.toFixed(2)}` : `-$${Math.abs(t.realizedPnl).toFixed(2)}`;
      lines.push(`  ${new Date(t.closedAt).toLocaleDateString()} ${t.side.toUpperCase()} ${t.symbol} ${pnlStr} (${t.realizedPnlPercent.toFixed(1)}%) held ${dur} — ${t.reason}`);
    }
  }

  // Journal entries (last 20)
  if (journalEntries.length > 0) {
    const recent = journalEntries.slice(-20);
    lines.push(`\n== JOURNAL (last ${recent.length} entries) ==`);
    for (const j of recent) {
      const prefix = j.symbol ? `[${j.symbol}]` : `[${j.type}]`;
      const pnlStr = j.pnl != null ? ` PnL: $${j.pnl.toFixed(2)}` : '';
      lines.push(`  ${new Date(j.timestamp).toLocaleString()} ${prefix} ${j.reason.slice(0, 150)}${pnlStr}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Learning parser — extracts phantomx_learning blocks from AI response
// ---------------------------------------------------------------------------

interface ParsedLearning {
  title: string;
  pattern: string;
  evidence: string;
  impact: string;
  recommendation: string;
  tags: string[];
}

function parseLearnings(text: string): ParsedLearning[] {
  const learnings: ParsedLearning[] = [];
  const regex = /```phantomx_learning\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.title && parsed.pattern) {
        learnings.push({
          title: parsed.title,
          pattern: parsed.pattern,
          evidence: parsed.evidence ?? '',
          impact: parsed.impact ?? '',
          recommendation: parsed.recommendation ?? '',
          tags: parsed.tags ?? [parsed.pattern],
        });
      }
    } catch {
      // Malformed JSON — skip
    }
  }

  return learnings;
}

// ---------------------------------------------------------------------------
// Dashboard system instructions
// ---------------------------------------------------------------------------

const DASHBOARD_INSTRUCTIONS = `
You are now in DASHBOARD ANALYTICS mode. The user is reviewing their trading history.
You have access to their complete trade history, journal entries, and behavioral learnings.

Your role:
1. Answer data-driven questions about their trading performance (win rates, PnL by symbol, patterns, etc.)
2. Identify behavioral patterns (revenge trading, FOMO, cutting winners, overtrading, etc.)
3. Generate actionable learnings when the user asks for analysis or review

When you identify a behavioral pattern worth documenting, output a learning block:
\`\`\`phantomx_learning
{
  "title": "Short descriptive title",
  "pattern": "pattern-tag (e.g. revenge-trading, fomo, cutting-winners)",
  "evidence": "Specific trades/dates that demonstrate this pattern",
  "impact": "Estimated dollar impact or percentage impact on portfolio",
  "recommendation": "What to do differently next time",
  "tags": ["pattern-tag", "symbol-if-relevant"]
}
\`\`\`

You can output multiple learning blocks in a single response.
Always reference specific trades and data when making observations.
Be direct and actionable — this is coaching, not cheerleading.
`;

// ---------------------------------------------------------------------------
// Intelligence system instructions
// ---------------------------------------------------------------------------

const INTELLIGENCE_INSTRUCTIONS = `
You are now in INTELLIGENCE mode. The user is exploring their knowledge base, behavioral learnings, and intervention track record.
You have access to their full knowledge base entries (strategies, patterns, market analysis, learnings, etc.) and intervention data.

Your role:
1. Answer questions about their knowledge base: what patterns are documented, what strategies exist, how many entries per category, etc.
2. Analyze behavioral learnings: which patterns are most frequently triggered, intervention accuracy, correlations between patterns
3. Identify gaps: compare what's documented vs what's likely happening based on the data
4. Provide recommendations for improving the knowledge base and intervention system
5. Generate new learnings when the user asks for deeper analysis

When you identify a behavioral pattern worth documenting, output a learning block:
\`\`\`phantomx_learning
{
  "title": "Short descriptive title",
  "pattern": "pattern-tag (e.g. revenge-trading, fomo, cutting-winners)",
  "evidence": "Specific evidence from the knowledge base or interventions",
  "impact": "How this pattern affects trading decisions",
  "recommendation": "What to do differently",
  "tags": ["pattern-tag"]
}
\`\`\`

Reference specific knowledge entries and intervention data in your answers.
Be analytical and precise — this is the intelligence layer, not general chat.
`;

function buildKnowledgeContextBlock(): string {
  const kb = getKnowledgeBase();
  const all = kb.getAll();

  if (all.length === 0) return '== KNOWLEDGE BASE ==\nNo knowledge entries yet.\n';

  const lines: string[] = ['== KNOWLEDGE BASE =='];

  // Category summary
  const byCat: Record<string, number> = {};
  for (const e of all) byCat[e.category] = (byCat[e.category] ?? 0) + 1;
  lines.push(`\nTotal: ${all.length} entries`);
  for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${cat}: ${count}`);
  }

  // All entries grouped by category
  const categories = [...new Set(all.map(e => e.category))];
  for (const cat of categories) {
    const entries = all.filter(e => e.category === cat);
    lines.push(`\n--- ${cat.toUpperCase()} (${entries.length}) ---`);
    for (const e of entries.slice(0, 20)) {
      const snippet = e.content.split('\n')[0].slice(0, 150);
      lines.push(`  [${e.id}] ${e.title}`);
      lines.push(`    Tags: ${e.tags.join(', ') || 'none'} | Source: ${e.source} | Updated: ${e.updated}`);
      lines.push(`    ${snippet}`);
    }
    if (entries.length > 20) lines.push(`  ... and ${entries.length - 20} more`);
  }

  return lines.join('\n');
}

function buildInterventionContextBlock(): string {
  const stats = getInterventionStats();
  const logs = getInterventionLogs();

  if (stats.totalInterventions === 0) return '== INTERVENTIONS ==\nNo interventions recorded this session.\n';

  const lines: string[] = ['== INTERVENTIONS =='];
  lines.push(`Total: ${stats.totalInterventions} | Prevented: ${stats.totalPrevented} | Overridden: ${stats.totalOverridden}`);

  if (stats.outcomeTracked > 0) {
    lines.push(`Accuracy: ${stats.accuracy}% (${stats.correctInterventions}/${stats.outcomeTracked} correct)`);
  }

  if (stats.topPatterns.length > 0) {
    lines.push('\nTop Patterns:');
    for (const p of stats.topPatterns) {
      lines.push(`  ${p.tag}: ${p.count}x (${p.preventedCount} prevented)`);
    }
  }

  if (logs.length > 0) {
    lines.push(`\nRecent (last ${Math.min(logs.length, 15)}):`);
    for (const log of logs.slice(0, 15)) {
      const outcome = log.outcome ? ` → ${log.outcome.wasCorrect ? 'CORRECT' : 'WRONG'}` : '';
      lines.push(`  ${log.patternTag} on ${log.symbol}: ${log.originalAction} → ${log.finalAction} (${log.confidence}% conf)${outcome}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// API Route
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, message, chartImage, symbol, timeframe, thesis, risk, balance, ohlcv, positions, currentPrice, viewMode, closedTrades, journalEntries } = body;

    const assistant = getTradingAssistant();

    // Inject live trading context so Claude knows the account state
    if (symbol || balance || positions) {
      assistant.setTradingContext({
        symbol: symbol ?? '',
        currentPrice: body.currentPrice ?? 0,
        accountBalance: balance ?? 0,
        openPositions: positions ?? [],
        recentTrades: [],
        activeStrategies: [],
        riskProfile: risk ?? { level: 'moderate', maxPositionSizePercent: 5, maxDrawdownPercent: 10, stopLossPercent: 2, takeProfitPercent: 4, maxOpenPositions: 3, maxDailyLossPercent: 5, trailingStopPercent: 1, allowLossOfEntireAmount: false },
        marketData: { ohlcv: ohlcv ?? [], ticker: body.ticker ?? { symbol: symbol ?? '', last: 0, bid: 0, ask: 0, high: 0, low: 0, volume: 0, change24h: 0, changePercent24h: 0, timestamp: Date.now() }, orderBook: { symbol: symbol ?? '', bids: [], asks: [], timestamp: Date.now() } },
      });
    }

    switch (action) {
      case 'chat': {
        const encoder = new TextEncoder();
        let fullResponseText = '';

        // Build context-aware message based on view mode
        let enrichedMessage = message;
        if (viewMode === 'dashboard') {
          const kb = getKnowledgeBase();
          const tradeHistoryBlock = buildTradeHistoryBlock(
            (closedTrades as AutopilotClosedTrade[]) ?? [],
            (journalEntries as JournalEntry[]) ?? []
          );
          const learningsBlock = kb.getLearningsPromptBlock(15);

          enrichedMessage = [
            DASHBOARD_INSTRUCTIONS,
            '',
            tradeHistoryBlock,
            '',
            '== BEHAVIORAL LEARNINGS ==',
            learningsBlock,
            '',
            '== USER QUESTION ==',
            message,
          ].join('\n');
        } else if (viewMode === 'intelligence') {
          enrichedMessage = [
            INTELLIGENCE_INSTRUCTIONS,
            '',
            buildKnowledgeContextBlock(),
            '',
            buildInterventionContextBlock(),
            '',
            '== USER QUESTION ==',
            message,
          ].join('\n');
        }

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const response = await assistant.chat(
                enrichedMessage,
                chartImage,
                (chunk) => {
                  fullResponseText += chunk;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`)
                  );
                }
              );

              // Use the complete response text
              fullResponseText = response.content || fullResponseText;

              // Parse commands from the AI's response
              const { trades, draws } = parseCommands(fullResponseText);

              // Execute trade commands server-side
              if (trades.length > 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'executing', message: `Executing ${trades.length} trade command(s)...` })}\n\n`)
                );

                const results = await executeTradeCommands(trades);

                for (const r of results) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: 'execution_result',
                      success: r.success,
                      action: r.command.action,
                      symbol: r.command.symbol,
                      result: r.result,
                    })}\n\n`)
                  );
                }
              }

              // Pass draw commands through for the frontend
              if (draws) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'draw_commands', draws })}\n\n`)
                );
              }

              // Parse and save behavioral learnings from AI response
              const learnings = parseLearnings(fullResponseText);
              if (learnings.length > 0) {
                const kb = getKnowledgeBase();
                const savedIds: string[] = [];
                for (const learning of learnings) {
                  const content = [
                    `**Pattern:** ${learning.pattern}`,
                    '',
                    learning.evidence ? `**Evidence:** ${learning.evidence}` : '',
                    learning.impact ? `**Impact:** ${learning.impact}` : '',
                    learning.recommendation ? `**Recommendation:** ${learning.recommendation}` : '',
                  ].filter(Boolean).join('\n');

                  const entry = kb.create({
                    title: learning.title,
                    category: 'learnings',
                    tags: learning.tags,
                    content,
                    source: 'ai',
                  });
                  savedIds.push(entry.id);
                }

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'learnings_saved',
                    count: learnings.length,
                    ids: savedIds,
                    titles: learnings.map(l => l.title),
                  })}\n\n`)
                );
              }

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'done', message: response })}\n\n`)
              );
              controller.close();
            } catch (err) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`)
              );
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      }

      case 'analyze_chart': {
        if (!chartImage) {
          return NextResponse.json({ error: 'chartImage required' }, { status: 400 });
        }
        const analysis = await assistant.analyzeChart(chartImage, symbol, timeframe);
        return NextResponse.json({ analysis });
      }

      case 'generate_strategy': {
        if (!thesis || !risk || !balance) {
          return NextResponse.json({ error: 'thesis, risk, and balance required' }, { status: 400 });
        }
        const pineScript = await assistant.generateStrategy(
          symbol, thesis, risk, balance, ohlcv ?? []
        );
        return NextResponse.json({ pineScript });
      }

      case 'generate_plan': {
        if (!thesis || !risk || !balance) {
          return NextResponse.json({ error: 'thesis, risk, and balance required' }, { status: 400 });
        }
        const plan = await assistant.generateTradingPlan(
          symbol, thesis, risk, balance, currentPrice ?? 0, positions ?? []
        );
        return NextResponse.json({ plan });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[PhantomX AI] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
