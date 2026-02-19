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
import { getKnowledgeForPhase, getHardConstraints, getOptimizationDirectives, getAntiPatterns, queryKnowledge, getPerformanceReviewKnowledge, getHFTStrategies } from '@/lib/strategy/knowledge-base';
import { runBacktest, runWalkForward } from '@/lib/strategy/backtest-engine';
import type { AutopilotClosedTrade, JournalEntry, StrategyConfig, StrategyGoals, ResearchPhaseId, BacktestConfig, BacktestMetrics, DecisionRecord } from '@/types/trading';

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

interface SystemCommand {
  action: 'start_research' | 'stop_research' | 'pause_research' | 'resume_research'
    | 'configure_research' | 'start_paper_trading' | 'stop_paper_trading'
    | 'get_research_status' | 'get_paper_trading_status';
  config?: Record<string, unknown>;
  virtualBalance?: number;
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

function parseCommands(text: string): { trades: TradeCommand[]; draws: DrawCommand | null; system: SystemCommand[] } {
  const trades: TradeCommand[] = [];
  const system: SystemCommand[] = [];
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

  // Parse system commands (research engine, paper trading, etc.)
  const systemMatch = text.match(/```phantomx_system\s*\n([\s\S]*?)```/);
  if (systemMatch) {
    try {
      const parsed = JSON.parse(systemMatch[1]);
      if (parsed.commands && Array.isArray(parsed.commands)) {
        system.push(...parsed.commands);
      } else if (parsed.action) {
        system.push(parsed);
      }
    } catch (e) {
      console.error('[PhantomX] Failed to parse system commands:', e);
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

  return { trades, draws, system };
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
// System command executor — research engine, paper trading, etc.
// ---------------------------------------------------------------------------
async function executeSystemCommands(commands: SystemCommand[]): Promise<Array<{ command: SystemCommand; success: boolean; result: string }>> {
  const results: Array<{ command: SystemCommand; success: boolean; result: string }> = [];

  for (const cmd of commands) {
    try {
      switch (cmd.action) {
        case 'start_research': {
          const { createResearchEngine } = await import('@/lib/ai/research-engine');
          const { createPaperTradingEngine } = await import('@/lib/ai/paper-trading-engine');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const engine = createResearchEngine(cmd.config as any);
          await engine.start();
          const paperEngine = createPaperTradingEngine(cmd.virtualBalance ?? 100_000);
          await paperEngine.start();
          const status = engine.getStatus();
          results.push({ command: cmd, success: true, result: `Research engine started. State: ${status.state}. Paper trading active with $${(cmd.virtualBalance ?? 100_000).toLocaleString()} virtual balance.` });
          break;
        }

        case 'stop_research': {
          const { stopResearchEngine } = await import('@/lib/ai/research-engine');
          const { stopPaperTradingEngine } = await import('@/lib/ai/paper-trading-engine');
          stopResearchEngine();
          stopPaperTradingEngine();
          results.push({ command: cmd, success: true, result: 'Research engine and paper trading stopped.' });
          break;
        }

        case 'pause_research': {
          const { getResearchEngine } = await import('@/lib/ai/research-engine');
          const engine = getResearchEngine();
          if (!engine) { results.push({ command: cmd, success: false, result: 'Research engine not running.' }); break; }
          engine.pause();
          results.push({ command: cmd, success: true, result: 'Research engine paused.' });
          break;
        }

        case 'resume_research': {
          const { getResearchEngine } = await import('@/lib/ai/research-engine');
          const engine = getResearchEngine();
          if (!engine) { results.push({ command: cmd, success: false, result: 'Research engine not running.' }); break; }
          engine.resume();
          results.push({ command: cmd, success: true, result: 'Research engine resumed.' });
          break;
        }

        case 'configure_research': {
          const { getResearchEngine } = await import('@/lib/ai/research-engine');
          const engine = getResearchEngine();
          if (!engine) { results.push({ command: cmd, success: false, result: 'Research engine not running. Start it first.' }); break; }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (cmd.config) engine.updateConfig(cmd.config as any);
          results.push({ command: cmd, success: true, result: `Research config updated: ${JSON.stringify(cmd.config)}` });
          break;
        }

        case 'start_paper_trading': {
          const { createPaperTradingEngine } = await import('@/lib/ai/paper-trading-engine');
          const paperEngine = createPaperTradingEngine(cmd.virtualBalance ?? 100_000);
          await paperEngine.start();
          results.push({ command: cmd, success: true, result: `Paper trading started with $${(cmd.virtualBalance ?? 100_000).toLocaleString()} virtual balance.` });
          break;
        }

        case 'stop_paper_trading': {
          const { stopPaperTradingEngine } = await import('@/lib/ai/paper-trading-engine');
          stopPaperTradingEngine();
          results.push({ command: cmd, success: true, result: 'Paper trading stopped.' });
          break;
        }

        case 'get_research_status': {
          const { getResearchEngine } = await import('@/lib/ai/research-engine');
          const engine = getResearchEngine();
          if (!engine) { results.push({ command: cmd, success: true, result: 'Research engine is not running.' }); break; }
          const status = engine.getStatus();
          const summary = engine.getResearchSummary();
          const topOps = engine.getTopOpportunities(5);
          const topOpsSummary = topOps.map(o => `#${o.rank} ${o.symbol.replace('/USDT:USDT', '')} (score: ${o.score}, ${o.direction}) — ${o.headline}`).join('\n');
          results.push({ command: cmd, success: true, result: `Research Engine: ${status.state}\nScans: ${status.totalQuickScans} | Deep Dives: ${status.totalDeepDives} | Theses: ${status.totalThesesGenerated}\nFindings: ${status.totalFindings}\n\nTop 5 Opportunities:\n${topOpsSummary || 'None yet.'}\n\n${summary}` });
          break;
        }

        case 'get_paper_trading_status': {
          const { getPaperTradingEngine } = await import('@/lib/ai/paper-trading-engine');
          const engine = getPaperTradingEngine();
          if (!engine) { results.push({ command: cmd, success: true, result: 'Paper trading engine is not running.' }); break; }
          const state = engine.getState();
          const openSummary = state.openTrades.map(t => `${t.direction} ${t.symbol.replace('/USDT:USDT', '')} @ $${t.entryPrice} → P&L: ${t.unrealizedPnl >= 0 ? '+' : ''}$${t.unrealizedPnl.toFixed(2)}`).join('\n');
          results.push({ command: cmd, success: true, result: `Paper Trading: ${state.isActive ? 'Active' : 'Inactive'}\nEquity: $${state.currentEquity.toLocaleString()} | P&L: ${state.totalPnl >= 0 ? '+' : ''}$${state.totalPnl.toFixed(2)}\nTrades: ${state.totalTrades} (${state.winCount}W/${state.lossCount}L) | Win Rate: ${state.totalTrades > 0 ? ((state.winCount / state.totalTrades) * 100).toFixed(1) : '0'}%\nProfit Factor: ${state.profitFactor.toFixed(2)} | Max DD: ${state.maxDrawdownPercent.toFixed(1)}%\n\nOpen Positions (${state.openTrades.length}):\n${openSummary || 'None'}` });
          break;
        }

        default:
          results.push({ command: cmd, success: false, result: `Unknown system action: ${cmd.action}` });
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
    const { action, message, chartImage, symbol, timeframe, thesis, risk, balance, ohlcv, positions, currentPrice, viewMode, closedTrades, journalEntries, strategyConfig, strategyGoals } = body;

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
                },
                {
                  onToolUse: (toolName, input) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'tool_use', tool: toolName, input })}\n\n`)
                    );
                  },
                  onToolResult: (toolName, preview) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', tool: toolName, preview })}\n\n`)
                    );
                  },
                  onThinking: (chunk) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'thinking', content: chunk })}\n\n`)
                    );
                  },
                },
              );

              // Use the complete response text
              fullResponseText = response.content || fullResponseText;

              // Parse commands from the AI's response
              const { trades, draws, system } = parseCommands(fullResponseText);

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

              // Execute system commands (research engine, paper trading)
              if (system.length > 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'executing', message: `Executing ${system.length} system command(s)...` })}\n\n`)
                );

                const systemResults = await executeSystemCommands(system);

                for (const r of systemResults) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: 'system_result',
                      success: r.success,
                      action: r.command.action,
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

      case 'generate_pinescript': {
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

      // -----------------------------------------------------------------------
      // Deep Research — Multi-Agent TradingAgents Pipeline
      // 4 analysts → Bull/Bear debate → Judge → Risk debate → Final decision
      // -----------------------------------------------------------------------
      case 'deep_research': {
        if (!strategyConfig || !strategyGoals) {
          return NextResponse.json({ error: 'strategyConfig and strategyGoals required' }, { status: 400 });
        }

        const config = strategyConfig as StrategyConfig;
        const goals = strategyGoals as StrategyGoals;
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const emit = (data: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                // Stream may be closed
              }
            };

            try {
              const { runTradingAgentsPipeline } = await import('@/lib/ai/trading-agents');

              const result = await runTradingAgentsPipeline(
                {
                  symbol: config.symbol ?? symbol,
                  timeframe: config.timeframe ?? '1h',
                  strategyConfig: config,
                  strategyGoals: goals,
                  ohlcv: ohlcv ?? undefined,
                  balance: balance ?? 10000,
                  debateRounds: 2,
                  riskDebateRounds: 1,
                },
                emit,
              );

              // Emit legacy-compatible done event with full result
              emit({
                type: 'done',
                result: {
                  decision: result.decision,
                  confidence: result.confidence,
                  durationMs: result.durationMs,
                  memoriesStored: result.memoriesStored,
                },
              });
              controller.close();
            } catch (err) {
              emit({ type: 'pipeline_error', error: String(err) });
              emit({ type: 'done' });
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });
      }

      // -----------------------------------------------------------------------
      // Optimize Strategy — Self-improvement loop
      // -----------------------------------------------------------------------
      case 'optimize_strategy': {
        if (!strategyConfig || !strategyGoals || !ohlcv) {
          return NextResponse.json({ error: 'strategyConfig, strategyGoals, and ohlcv required' }, { status: 400 });
        }

        const config = strategyConfig as StrategyConfig;
        const goals = strategyGoals as StrategyGoals;
        const maxIterations = goals.maxOptimizationIterations || 10;
        const encoder = new TextEncoder();
        const directives = getOptimizationDirectives();

        const stream = new ReadableStream({
          async start(controller) {
            const emit = (data: unknown) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
              let currentConfig = { ...config };
              let iterationNum = 0;

              for (let i = 0; i < maxIterations; i++) {
                iterationNum = i + 1;
                emit({ type: 'iteration_start', iteration: iterationNum });

                // Run walk-forward backtest on current config
                const backtestConfig: BacktestConfig = {
                  strategy: currentConfig,
                  ohlcv,
                  initialCapital: balance ?? 10000,
                  fees: 0.0006,
                  slippage: 0.001,
                };

                let btResult;
                try {
                  const wf = runWalkForward(backtestConfig);
                  btResult = wf.totalResult;
                } catch {
                  const simple = runBacktest(backtestConfig);
                  btResult = simple;
                }

                // Check goals
                const metricsVsGoals = [
                  { metric: 'Win Rate', value: btResult.metrics.winRate, goal: goals.minWinRate, met: btResult.metrics.winRate >= goals.minWinRate },
                  { metric: 'Profit Factor', value: btResult.metrics.profitFactor, goal: goals.minProfitFactor, met: btResult.metrics.profitFactor >= goals.minProfitFactor },
                  { metric: 'Max Drawdown', value: btResult.metrics.maxDrawdownPercent, goal: goals.maxDrawdownPercent, met: btResult.metrics.maxDrawdownPercent <= goals.maxDrawdownPercent },
                  { metric: 'Sharpe Ratio', value: btResult.metrics.sharpeRatio, goal: goals.minSharpeRatio, met: btResult.metrics.sharpeRatio >= goals.minSharpeRatio },
                ];

                const allGoalsMet = metricsVsGoals.every(m => m.met);

                if (allGoalsMet) {
                  emit({
                    type: 'iteration_complete',
                    iteration: iterationNum,
                    backtestResult: btResult,
                    metricsVsGoals,
                    changes: [],
                    config: currentConfig,
                    converged: true,
                  });
                  break;
                }

                // Ask Claude to suggest improvements
                const optimizationPrompt = buildOptimizationPrompt(
                  currentConfig, btResult.metrics, metricsVsGoals, goals,
                  directives.map(d => `[P${d.priority}] ${d.directive}: ${d.details}`).join('\n'),
                  iterationNum,
                );

                let aiResponse = '';
                try {
                  const response = await assistant.chat(
                    optimizationPrompt,
                    undefined,
                    (chunk) => {
                      aiResponse += chunk;
                      emit({ type: 'optimization_stream', iteration: iterationNum, content: chunk });
                    }
                  );
                  aiResponse = response.content || aiResponse;
                } catch (aiErr) {
                  emit({ type: 'iteration_error', iteration: iterationNum, error: String(aiErr) });
                  continue;
                }

                // Parse AI's suggested changes
                const changes = parseOptimizationChanges(aiResponse);

                // Apply changes to config
                const updatedConfig = applyOptimizationChanges(currentConfig, changes);

                emit({
                  type: 'iteration_complete',
                  iteration: iterationNum,
                  backtestResult: btResult,
                  metricsVsGoals,
                  changes,
                  config: updatedConfig,
                  converged: false,
                });

                currentConfig = updatedConfig;
              }

              emit({ type: 'done', finalConfig: currentConfig, totalIterations: iterationNum });
              controller.close();
            } catch (err) {
              emit({ type: 'error', error: String(err) });
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });
      }

      // ================================================================
      // Generate Strategy — Natural Language → Full Config
      // ================================================================
      case 'generate_strategy': {
        if (!message) {
          return NextResponse.json({ error: 'message (natural language prompt) required' }, { status: 400 });
        }

        const hftStrategies = getHFTStrategies();
        const constraints = getHardConstraints();
        const stratTemplates = queryKnowledge({ domain: 'strategy_patterns' });

        const generatePrompt = `You are PhantomX's strategy generator. Convert the user's natural language description into a complete, deployable strategy configuration.

== USER REQUEST ==
${message}

== AVAILABLE HFT STRATEGIES (use if relevant) ==
${hftStrategies.map(s => `- ${s.title}: ${s.principle}\n  Details: ${s.details}`).join('\n\n')}

== STRATEGY TEMPLATES ==
${stratTemplates.map(s => `- ${s.title}: ${s.principle}`).join('\n')}

== HARD CONSTRAINTS (these MUST be respected) ==
${constraints.map(c => `- ${c.rule}: ${c.enforcement}`).join('\n')}

== TASK ==
Generate a complete strategy configuration in this EXACT JSON format:

\`\`\`phantomx_strategy
{
  "config": {
    "name": "Descriptive strategy name",
    "symbol": "BTCUSDT",
    "timeframe": "1m",
    "risk": {
      "maxPositionSizePercent": 5,
      "stopLossPercent": 1,
      "takeProfitPercent": 3,
      "maxDrawdownPercent": 15,
      "trailingStopPercent": 0.5,
      "maxDailyLossPercent": 5,
      "riskRewardMinimum": 2,
      "allowLossOfEntireAmount": false
    },
    "entryConditions": {
      "logic": "AND",
      "conditions": [
        {"indicator": "RSI", "operator": "crosses_above", "target": 30}
      ]
    },
    "exitConditions": {
      "logic": "OR",
      "conditions": [
        {"indicator": "RSI", "operator": "crosses_below", "target": 70}
      ]
    }
  },
  "goals": {
    "minWinRate": 0.55,
    "minProfitFactor": 1.5,
    "maxDrawdownPercent": 15,
    "minSharpeRatio": 1.0,
    "duration": "scalp",
    "maxOptimizationIterations": 10,
    "questions": ["Relevant research questions"]
  },
  "reasoning": "Explain why this configuration matches the user's request and why these specific parameters were chosen"
}
\`\`\`

Rules:
- Match the user's intent precisely (HFT/scalp/swing/etc)
- If they mention leverage, reflect it in position sizing and risk params
- If they mention a starting capital and target, set aggressive but survivable goals
- For HFT: use 1m or 5m timeframes, tight stops, scalp duration, high win rate goals
- For swing: use 4h or 1D, wider stops, higher R:R
- Always respect hard constraints (max drawdown circuit breaker, stops required, etc.)
- Available indicators: CLOSE, OPEN, HIGH, LOW, VOLUME, SMA_20, SMA_50, SMA_200, EMA_9, EMA_21, EMA_55, RSI, MACD_LINE, MACD_SIGNAL, MACD_HISTOGRAM, BB_UPPER, BB_MIDDLE, BB_LOWER, VWAP, ATR
- Available operators: crosses_above, crosses_below, above, below, equals
- Available timeframes: 1m, 5m, 15m, 1h, 4h, 1D
- Available durations: scalp, day, swing, position`;

        let aiResponse = '';
        try {
          const response = await assistant.chat(
            generatePrompt,
            undefined,
            (chunk) => { aiResponse += chunk; }
          );
          aiResponse = response.content || aiResponse;
        } catch (aiErr) {
          return NextResponse.json({ error: `AI error: ${aiErr}` }, { status: 500 });
        }

        // Parse the generated strategy — try multiple formats for robustness
        // The AI may use ```phantomx_strategy, ```json, or just embed JSON directly
        let parsedStrategy: { config?: Record<string, unknown>; goals?: Record<string, unknown>; reasoning?: string } | null = null;

        // Try 1: Exact ```phantomx_strategy fence
        const stratMatch = aiResponse.match(/```phantomx_strategy\s*\n([\s\S]*?)```/);
        if (stratMatch) {
          try { parsedStrategy = JSON.parse(stratMatch[1]); } catch { /* try next */ }
        }

        // Try 2: Any code-fenced JSON containing "config" key
        if (!parsedStrategy) {
          const codeFenceMatch = aiResponse.match(/```(?:json|javascript|typescript|ts|js)?\s*\n([\s\S]*?)```/);
          if (codeFenceMatch) {
            try {
              const candidate = JSON.parse(codeFenceMatch[1]);
              if (candidate.config) parsedStrategy = candidate;
            } catch { /* try next */ }
          }
        }

        // Try 3: Bare JSON object with "config" key anywhere in response
        if (!parsedStrategy) {
          const jsonMatches = aiResponse.match(/\{[\s\S]*?"config"[\s\S]*?\}/g);
          if (jsonMatches) {
            for (const jsonStr of jsonMatches) {
              try {
                // Find the largest valid JSON object containing "config"
                let depth = 0;
                let end = -1;
                for (let i = 0; i < jsonStr.length; i++) {
                  if (jsonStr[i] === '{') depth++;
                  if (jsonStr[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
                }
                if (end > 0) {
                  const candidate = JSON.parse(jsonStr.slice(0, end + 1));
                  if (candidate.config) { parsedStrategy = candidate; break; }
                }
              } catch { /* try next match */ }
            }
          }
        }

        // Try 4: The response itself might be the config (no wrapper object)
        if (!parsedStrategy) {
          try {
            const directParse = JSON.parse(aiResponse.trim());
            if (directParse.config || directParse.name) {
              parsedStrategy = directParse.config
                ? directParse
                : { config: directParse, goals: {}, reasoning: '' };
            }
          } catch { /* give up */ }
        }

        if (parsedStrategy?.config) {
          return NextResponse.json({
            config: {
              id: crypto.randomUUID(),
              status: 'draft',
              indicators: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ...parsedStrategy.config,
            },
            goals: parsedStrategy.goals ?? {
              minWinRate: 0.55, minProfitFactor: 1.5, maxDrawdownPercent: 15,
              minSharpeRatio: 1.0, duration: 'scalp', maxOptimizationIterations: 10, questions: [],
            },
            reasoning: parsedStrategy.reasoning ?? 'Strategy generated from AI analysis.',
          });
        }

        console.error('[generate_strategy] AI response did not contain parseable strategy. Raw:', aiResponse.slice(0, 500));
        return NextResponse.json({ error: 'AI did not produce valid strategy config', raw: aiResponse.slice(0, 1000) }, { status: 500 });
      }

      // ================================================================
      // Performance Review — Continuous Learning Engine
      // ================================================================
      case 'review_performance': {
        const trades = (closedTrades || []) as AutopilotClosedTrade[];
        const decisions = (body.decisionLog || []) as DecisionRecord[];
        const config = strategyConfig as StrategyConfig | null;

        if (trades.length === 0) {
          return NextResponse.json({ error: 'closedTrades required for performance review' }, { status: 400 });
        }

        const reviewKnowledge = getPerformanceReviewKnowledge();
        const antiPatterns = getAntiPatterns();
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            const emit = (data: unknown) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
              emit({ type: 'review_start', tradeCount: trades.length });

              // Phase 1: Individual trade analysis
              emit({ type: 'phase', phase: 'trade_analysis', status: 'running' });

              const tradeAnalysisPrompt = buildTradeAnalysisPrompt(trades, config, decisions, reviewKnowledge);
              let tradeAnalysis = '';
              try {
                const response = await assistant.chat(
                  tradeAnalysisPrompt,
                  undefined,
                  (chunk) => {
                    tradeAnalysis += chunk;
                    emit({ type: 'stream', phase: 'trade_analysis', content: chunk });
                  }
                );
                tradeAnalysis = response.content || tradeAnalysis;
              } catch (aiErr) {
                emit({ type: 'phase_error', phase: 'trade_analysis', error: String(aiErr) });
              }

              const tradeReviews = parsePerformanceReviews(tradeAnalysis);
              emit({ type: 'phase', phase: 'trade_analysis', status: 'complete', data: tradeReviews });

              // Phase 2: Pattern detection across all trades
              emit({ type: 'phase', phase: 'pattern_detection', status: 'running' });

              const patternPrompt = buildPatternDetectionPrompt(trades, tradeReviews, antiPatterns);
              let patternAnalysis = '';
              try {
                const response = await assistant.chat(
                  patternPrompt,
                  undefined,
                  (chunk) => {
                    patternAnalysis += chunk;
                    emit({ type: 'stream', phase: 'pattern_detection', content: chunk });
                  }
                );
                patternAnalysis = response.content || patternAnalysis;
              } catch (aiErr) {
                emit({ type: 'phase_error', phase: 'pattern_detection', error: String(aiErr) });
              }

              const patterns = parsePatterns(patternAnalysis);
              emit({ type: 'phase', phase: 'pattern_detection', status: 'complete', data: patterns });

              // Phase 3: Generate actionable improvements
              emit({ type: 'phase', phase: 'improvements', status: 'running' });

              const improvementPrompt = buildImprovementPrompt(trades, tradeReviews, patterns, config);
              let improvementAnalysis = '';
              try {
                const response = await assistant.chat(
                  improvementPrompt,
                  undefined,
                  (chunk) => {
                    improvementAnalysis += chunk;
                    emit({ type: 'stream', phase: 'improvements', content: chunk });
                  }
                );
                improvementAnalysis = response.content || improvementAnalysis;
              } catch (aiErr) {
                emit({ type: 'phase_error', phase: 'improvements', error: String(aiErr) });
              }

              const improvements = parseImprovements(improvementAnalysis);
              emit({ type: 'phase', phase: 'improvements', status: 'complete', data: improvements });

              // Compile final review
              emit({
                type: 'review_complete',
                summary: {
                  tradesReviewed: trades.length,
                  tradeReviews,
                  patterns,
                  improvements,
                  overallGrade: computeOverallGrade(trades),
                },
              });

              controller.close();
            } catch (err) {
              emit({ type: 'error', error: String(err) });
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[PhantomX AI] Error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ============================================================================
// Research & Optimization Prompt Builders
// ============================================================================

const PHASE_INSTRUCTIONS: Record<ResearchPhaseId, string> = {
  market_structure: `Analyze the current market structure for the given symbol. Determine:
- Current trend direction (bullish/bearish/ranging)
- Key support and resistance levels with specific prices
- Market regime classification (ADX-based: trending/ranging/volatile)
- Volume profile analysis
- Higher timeframe context (is the larger trend aligned?)`,

  technical_confluence: `Compute and analyze technical indicators for confluence. Check:
- Moving average alignment (SMA 20/50/200, EMA 9/21/55)
- RSI reading and divergences
- MACD cross status and histogram direction
- Bollinger Band position and squeeze status
- VWAP deviation
- Which indicators agree? Where is there confluent signal?`,

  agent_consensus: `Integrate signals from multiple analysis perspectives:
- Trend-following perspective (what would a momentum trader do?)
- Mean-reversion perspective (what would a contrarian trader do?)
- Risk-focused perspective (what would a conservative risk manager say?)
- Macro perspective (what does the broader market context suggest?)
Synthesize into a consensus view with confidence level.`,

  pattern_matching: `Search for historical pattern matches:
- Are there similar setups in the past 6-12 months for this asset?
- What was the typical outcome of similar setups?
- Are there any chart patterns forming (double bottom, head/shoulders, flag, wedge)?
- How do current volume patterns compare to historical breakout/breakdown patterns?`,

  risk_reward: `Compute the optimal risk/reward model:
- Specific entry price range
- Stop loss placement (below which level does the thesis break?)
- Take profit targets (multiple levels)
- Position size calculation based on account risk %
- Risk:Reward ratio assessment
- Expected value calculation: (win_prob × avg_win) - (loss_prob × avg_loss)`,

  scenario_analysis: `Model if/then scenarios with probabilities:
- Bull case: what happens if the thesis plays out? Target price, probability estimate
- Bear case: what triggers invalidation? Target, probability
- Base case: most likely scenario if no catalyst?
- Black swan: what external event could drastically change the picture?
Assign probability estimates to each scenario.`,

  knowledge_integration: `Pull relevant learnings and behavioral patterns:
- What does the knowledge base say about this type of setup?
- Are there behavioral warnings (e.g., FOMO risk at all-time highs)?
- What do the anti-patterns say to watch out for?
- What historical lessons apply to current conditions?
- What hard constraints must be respected?`,

  strategy_synthesis: `Combine ALL previous findings into an optimized strategy:
- Synthesize the 7 previous research briefs into a coherent strategy
- Define specific entry conditions (indicators + values)
- Define specific exit conditions (take profit levels, stop loss, trailing stop)
- Set position sizing based on risk model
- Identify the key risk factors and how to monitor them
- Output a clear, actionable strategy that respects all hard constraints`,
};

function buildResearchPhasePrompt(
  phase: ResearchPhaseId,
  config: StrategyConfig,
  goals: StrategyGoals,
  knowledgeSummary: string,
  constraints: string,
  previousBriefs: unknown[],
): string {
  const prevBriefText = previousBriefs.length > 0
    ? `\n\n== PREVIOUS RESEARCH BRIEFS ==\n${JSON.stringify(previousBriefs, null, 2)}`
    : '';

  return `You are running phase "${phase}" of the PhantomX deep research pipeline.

== STRATEGY CONFIG ==
Name: ${config.name}
Symbol: ${config.symbol}
Timeframe: ${config.timeframe}
Risk Level: ${config.risk.level}
Entry Conditions: ${JSON.stringify(config.entryConditions)}
Exit Conditions: ${JSON.stringify(config.exitConditions)}

== GOALS ==
Min Win Rate: ${goals.minWinRate * 100}%
Min Profit Factor: ${goals.minProfitFactor}
Max Drawdown: ${goals.maxDrawdownPercent}%
Min Sharpe Ratio: ${goals.minSharpeRatio}
Duration: ${goals.duration}
User Questions: ${goals.questions.join(', ') || 'None'}

== PHASE INSTRUCTIONS ==
${PHASE_INSTRUCTIONS[phase]}

== RELEVANT KNOWLEDGE ==
${knowledgeSummary || 'No specific knowledge entries for this phase.'}

== HARD CONSTRAINTS (NON-NEGOTIABLE) ==
${constraints}
${prevBriefText}

IMPORTANT: Output your findings in this EXACT JSON format wrapped in \`\`\`phantomx_brief markers:

\`\`\`phantomx_brief
{
  "title": "Brief title for this phase",
  "summary": "2-3 sentence summary of key findings",
  "findings": "Detailed multi-paragraph analysis",
  "confidence": 0.85,
  "keyDataPoints": ["data point 1", "data point 2", "data point 3"],
  "reasoning": "Why these conclusions were reached"
}
\`\`\`

Also provide your natural language analysis before the JSON block.`;
}

function parseResearchBrief(text: string, phase: ResearchPhaseId): Record<string, unknown> {
  const match = text.match(/```phantomx_brief\s*\n([\s\S]*?)```/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      return { phase, ...parsed, timestamp: Date.now() };
    } catch { /* fall through */ }
  }

  // Fallback: extract what we can from the text
  return {
    phase,
    title: `${phase} analysis`,
    summary: text.slice(0, 200),
    findings: text,
    confidence: 0.5,
    keyDataPoints: [],
    reasoning: 'Auto-extracted from unstructured response',
    timestamp: Date.now(),
  };
}

function buildOptimizationPrompt(
  config: StrategyConfig,
  metrics: BacktestMetrics,
  metricsVsGoals: Array<{ metric: string; value: number; goal: number; met: boolean }>,
  goals: StrategyGoals,
  directives: string,
  iteration: number,
): string {
  const unmetGoals = metricsVsGoals.filter(m => !m.met);
  const metGoals = metricsVsGoals.filter(m => m.met);

  return `You are the PhantomX strategy optimizer. Iteration #${iteration}.

== CURRENT STRATEGY ==
${JSON.stringify(config, null, 2)}

== CURRENT METRICS ==
${JSON.stringify(metrics, null, 2)}

== GOAL STATUS ==
Met: ${metGoals.map(m => `${m.metric}: ${m.value.toFixed(3)} (goal: ${m.goal})`).join(', ')}
NOT Met: ${unmetGoals.map(m => `${m.metric}: ${m.value.toFixed(3)} (goal: ${m.goal})`).join(', ')}

== OPTIMIZATION DIRECTIVES (by priority) ==
${directives}

== TASK ==
Suggest specific, measurable changes to improve the strategy. Focus on the unmet goals following directive priority order.

Output your changes in this EXACT JSON format:

\`\`\`phantomx_changes
[
  {"field": "risk.stopLossPercent", "oldValue": 2, "newValue": 1.5, "reasoning": "Tighter stop loss to reduce max drawdown"},
  {"field": "risk.takeProfitPercent", "oldValue": 4, "newValue": 6, "reasoning": "Wider take profit to improve profit factor"}
]
\`\`\`

Rules:
- Only suggest 1-3 changes per iteration (avoid over-fitting)
- Each change must have clear reasoning tied to a specific unmet goal
- Never violate hard constraints (max drawdown circuit breaker, stop losses always required, etc.)
- Prefer parameter adjustments over structural changes
- If metrics are very close to goals, make small adjustments only`;
}

function parseOptimizationChanges(text: string): Array<{ field: string; oldValue: string | number; newValue: string | number; reasoning: string }> {
  const match = text.match(/```phantomx_changes\s*\n([\s\S]*?)```/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch { /* fall through */ }
  }
  return [];
}

function applyOptimizationChanges(
  config: StrategyConfig,
  changes: Array<{ field: string; oldValue: string | number; newValue: string | number; reasoning: string }>,
): StrategyConfig {
  const updated = JSON.parse(JSON.stringify(config)) as StrategyConfig;

  for (const change of changes) {
    const parts = change.field.split('.');
    let target: Record<string, unknown> = updated as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] && typeof target[parts[i]] === 'object') {
        target = target[parts[i]] as Record<string, unknown>;
      }
    }

    const finalKey = parts[parts.length - 1];
    if (finalKey in target) {
      target[finalKey] = change.newValue;
    }
  }

  updated.updatedAt = Date.now();
  return updated;
}

// ============================================================================
// Performance Review Prompt Builders & Parsers
// ============================================================================

interface TradeReview {
  tradeId: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  thesisCorrect: boolean;
  entryQuality: number;   // 0-100
  exitQuality: number;    // 0-100
  ruleCompliance: boolean;
  errorType: string | null;
  explanation: string;
  lessonLearned: string;
}

interface DetectedPattern {
  pattern: string;
  frequency: number;
  impact: 'positive' | 'negative' | 'neutral';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedTrades: string[];
  suggestedAction: string;
}

interface Improvement {
  type: 'lesson' | 'constraint' | 'adjustment';
  title: string;
  description: string;
  evidence: string;
  priority: number;
  suggestedChange?: { field: string; from: string; to: string };
}

function buildTradeAnalysisPrompt(
  trades: AutopilotClosedTrade[],
  config: StrategyConfig | null,
  decisions: DecisionRecord[],
  reviewKnowledge: Array<{ title: string; principle: string; details: string }>,
): string {
  const tradeSummaries = trades.slice(-50).map((t, i) => {
    const openedAt = t.closedAt - t.holdDuration;
    const decision = decisions.find(d => d.id === t.id || d.timestamp === openedAt);
    return `Trade #${i + 1} [${t.id?.slice(0, 8) || i}]:
  Side: ${t.side} | Entry: ${t.entryPrice} | Exit: ${t.exitPrice} | PnL: ${t.realizedPnl.toFixed(2)} (${t.realizedPnlPercent.toFixed(2)}%)
  Leverage: ${t.leverage}x | Size: ${t.size}
  Opened: ${new Date(openedAt).toISOString()} | Closed: ${new Date(t.closedAt).toISOString()} | Duration: ${Math.round(t.holdDuration / 60000)}min
  Exit Reason: ${t.reason || 'unknown'}${decision ? `\n  Original Thesis: ${decision.reasoning}` : ''}`;
  }).join('\n\n');

  const knowledgeContext = reviewKnowledge.map(k =>
    `- ${k.title}: ${k.principle}`
  ).join('\n');

  return `You are PhantomX's performance review agent. Analyze each trade individually.

== REVIEW FRAMEWORK ==
${knowledgeContext}

== STRATEGY CONTEXT ==
${config ? `Name: ${config.name} | Symbol: ${config.symbol} | Timeframe: ${config.timeframe}` : 'No strategy config available'}

== TRADES TO REVIEW ==
${tradeSummaries}

== TASK ==
For each trade, assess:
1. Was the thesis correct? (Did price move as expected?)
2. Entry quality (0-100): Was timing good relative to the move?
3. Exit quality (0-100): Was the exit optimal or premature/late?
4. Rule compliance: Were all entry conditions met?
5. Error type (if any): ENTRY_PREMATURE, ENTRY_LATE, EXIT_PREMATURE, EXIT_LATE, STOP_TOO_TIGHT, STOP_TOO_WIDE, SIZE_TOO_LARGE, WRONG_DIRECTION, IGNORED_SIGNALS, REGIME_MISMATCH, or null
6. Grade: A (excellent execution), B (good), C (acceptable), D (poor), F (serious error)
7. Key lesson from this trade

Output in this EXACT format:

\`\`\`phantomx_reviews
[
  {
    "tradeId": "trade_id_or_index",
    "grade": "B",
    "thesisCorrect": true,
    "entryQuality": 75,
    "exitQuality": 60,
    "ruleCompliance": true,
    "errorType": "EXIT_PREMATURE",
    "explanation": "Entry was well-timed at support, but exited too early...",
    "lessonLearned": "Let winners run when momentum confirms direction..."
  }
]
\`\`\`

Be brutally honest. Every trade gets reviewed. No mercy, no excuses — only lessons.`;
}

function buildPatternDetectionPrompt(
  trades: AutopilotClosedTrade[],
  reviews: TradeReview[],
  antiPatterns: Array<{ title: string; principle: string; details: string }>,
): string {
  const reviewSummary = reviews.map(r =>
    `${r.tradeId}: Grade=${r.grade}, Error=${r.errorType || 'none'}, EntryQ=${r.entryQuality}, ExitQ=${r.exitQuality}`
  ).join('\n');

  const antiPatternContext = antiPatterns.map(a =>
    `- ${a.title}: ${a.principle}`
  ).join('\n');

  // Compute aggregate stats
  const winners = trades.filter(t => t.realizedPnl > 0);
  const losers = trades.filter(t => t.realizedPnl <= 0);
  const errorCounts: Record<string, number> = {};
  reviews.forEach(r => {
    if (r.errorType) errorCounts[r.errorType] = (errorCounts[r.errorType] || 0) + 1;
  });

  return `You are PhantomX's pattern detection agent. Look for recurring patterns across all trades.

== TRADE REVIEWS ==
${reviewSummary}

== AGGREGATE STATS ==
Total: ${trades.length} | Winners: ${winners.length} (${(winners.length / trades.length * 100).toFixed(1)}%) | Losers: ${losers.length}
Avg Win: ${winners.length > 0 ? (winners.reduce((s, t) => s + t.realizedPnl, 0) / winners.length).toFixed(2) : 'N/A'}
Avg Loss: ${losers.length > 0 ? (losers.reduce((s, t) => s + t.realizedPnl, 0) / losers.length).toFixed(2) : 'N/A'}
Error Distribution: ${Object.entries(errorCounts).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'}

== KNOWN ANTI-PATTERNS ==
${antiPatternContext}

== TASK ==
Identify recurring patterns (both positive and negative):
- Error patterns: same mistake happening repeatedly
- Time patterns: specific hours/sessions where performance differs
- Sequence patterns: losses clustering together
- Size patterns: position sizing issues
- Behavioral patterns: matching known anti-patterns above

Output in this EXACT format:

\`\`\`phantomx_patterns
[
  {
    "pattern": "Consecutive Loss Spiral",
    "frequency": 3,
    "impact": "negative",
    "severity": "high",
    "description": "After 2 consecutive losses, the next 3 trades are also losses...",
    "affectedTrades": ["trade_1", "trade_5", "trade_8"],
    "suggestedAction": "Implement exponential backoff after 2 consecutive losses"
  }
]
\`\`\`

Find at least 2-5 patterns. Include POSITIVE patterns too (what's working well).`;
}

function buildImprovementPrompt(
  trades: AutopilotClosedTrade[],
  reviews: TradeReview[],
  patterns: DetectedPattern[],
  config: StrategyConfig | null,
): string {
  const patternSummary = patterns.map(p =>
    `[${p.severity.toUpperCase()}] ${p.pattern} (${p.impact}): ${p.description} → ${p.suggestedAction}`
  ).join('\n');

  const gradeDist: Record<string, number> = {};
  reviews.forEach(r => { gradeDist[r.grade] = (gradeDist[r.grade] || 0) + 1; });

  const avgEntry = reviews.length > 0 ? reviews.reduce((s, r) => s + r.entryQuality, 0) / reviews.length : 0;
  const avgExit = reviews.length > 0 ? reviews.reduce((s, r) => s + r.exitQuality, 0) / reviews.length : 0;

  return `You are PhantomX's continuous improvement agent. Generate actionable improvements.

== GRADE DISTRIBUTION ==
${Object.entries(gradeDist).sort(([a], [b]) => a.localeCompare(b)).map(([g, c]) => `${g}: ${c}`).join(' | ')}

== QUALITY SCORES ==
Avg Entry Quality: ${avgEntry.toFixed(0)}/100
Avg Exit Quality: ${avgExit.toFixed(0)}/100

== DETECTED PATTERNS ==
${patternSummary}

== CURRENT STRATEGY ==
${config ? JSON.stringify({ name: config.name, symbol: config.symbol, timeframe: config.timeframe, risk: config.risk }, null, 2) : 'No config'}

== TASK ==
Generate 3 categories of improvements:

1. LESSONS — New knowledge to add to the knowledge base
2. CONSTRAINTS — New rules to enforce (based on repeated errors)
3. ADJUSTMENTS — Specific parameter changes to test

Output in this EXACT format:

\`\`\`phantomx_improvements
[
  {
    "type": "lesson",
    "title": "RSI divergence signals are reliable on 5m BTC",
    "description": "72% win rate when RSI divergence confirms entry...",
    "evidence": "Based on 18 trades with RSI divergence signal...",
    "priority": 1
  },
  {
    "type": "constraint",
    "title": "No entries during funding rate settlement",
    "description": "4/5 trades within 5 minutes of funding settlement were losers...",
    "evidence": "Trades #3, #7, #12, #15, #19 all entered near settlement...",
    "priority": 2,
    "suggestedChange": {"field": "risk.fundingBlackout", "from": "0", "to": "5"}
  },
  {
    "type": "adjustment",
    "title": "Tighten RSI entry threshold",
    "description": "Entry quality improves when RSI is more extreme...",
    "evidence": "Trades with RSI < 25 had 80% win rate vs 55% for RSI < 30...",
    "priority": 3,
    "suggestedChange": {"field": "entryConditions.rsiThreshold", "from": "30", "to": "25"}
  }
]
\`\`\`

Prioritize by impact. Be specific — vague improvements are useless.`;
}

function parsePerformanceReviews(text: string): TradeReview[] {
  const match = text.match(/```phantomx_reviews\s*\n([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { /* fall through */ }
  }
  return [];
}

function parsePatterns(text: string): DetectedPattern[] {
  const match = text.match(/```phantomx_patterns\s*\n([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { /* fall through */ }
  }
  return [];
}

function parseImprovements(text: string): Improvement[] {
  const match = text.match(/```phantomx_improvements\s*\n([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1]); } catch { /* fall through */ }
  }
  return [];
}

function computeOverallGrade(trades: AutopilotClosedTrade[]): string {
  if (trades.length === 0) return 'N/A';
  const totalPnl = trades.reduce((s, t) => s + t.realizedPnl, 0);
  const winRate = trades.filter(t => t.realizedPnl > 0).length / trades.length;
  const avgPnl = totalPnl / trades.length;

  if (winRate >= 0.65 && avgPnl > 0) return 'A';
  if (winRate >= 0.55 && avgPnl > 0) return 'B';
  if (winRate >= 0.45 && totalPnl > 0) return 'C';
  if (totalPnl > 0) return 'D';
  return 'F';
}
