// ============================================================================
// PhantomX — AI Chat & Analysis API (Claude Agent SDK)
// Uses Claude Max OAuth — NO API billing
// Now with TRADE EXECUTION — the AI can act, not just talk
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getTradingAssistant } from '@/lib/ai/trading-assistant';
import { getPhemexClient } from '@/lib/phemex/client';

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

          const order = await client.createOrder(cmd.symbol, 'market', side, amount);
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
// API Route
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, message, chartImage, symbol, timeframe, thesis, risk, balance, ohlcv, positions, currentPrice } = body;

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

        const stream = new ReadableStream({
          async start(controller) {
            try {
              const response = await assistant.chat(
                message,
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
