// ============================================================================
// PhantomX — Phemex API Proxy Routes
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getPhemexClient } from '@/lib/phemex/client';
import { isKillSwitchActive, getKillState } from '@/lib/kill-switch';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { ensureOAuthEnv, getClaudeCodePath } from '@/lib/ai/credentials';
import type { OrderSide, OrderType } from '@/types/trading';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // Check if env credentials exist (no secrets exposed)
    if (action === 'check_env') {
      const apiKey = process.env.PHEMEX_API_KEY;
      const secret = process.env.PHEMEX_API_SECRET;
      const envTestnet = process.env.PHEMEX_TESTNET === 'true';
      if (!apiKey || !secret) {
        return NextResponse.json({ hasEnv: false });
      }
      return NextResponse.json({ hasEnv: true, envNetwork: envTestnet ? 'testnet' : 'mainnet' });
    }

    // Initialize client with user-provided credentials
    if (action === 'connect') {
      const { apiKey, secret, testnet, marketType } = body;
      getPhemexClient({ apiKey, secret, testnet, marketType });
      return NextResponse.json({ success: true, message: 'Connected to Phemex' });
    }

    // Auto-connect using server-side env credentials (no secrets sent from client)
    if (action === 'connect_env') {
      const apiKey = process.env.PHEMEX_API_KEY;
      const secret = process.env.PHEMEX_API_SECRET;
      if (!apiKey || !secret) {
        return NextResponse.json({ success: false, message: 'No env credentials configured' });
      }
      const testnet = body.testnet ?? (process.env.PHEMEX_TESTNET === 'true');
      getPhemexClient({ apiKey, secret, testnet, marketType: body.marketType ?? 'swap' });
      return NextResponse.json({ success: true, message: 'Connected via env credentials' });
    }

    // Connect AND verify — initializes client, then actually calls Phemex to prove creds work
    if (action === 'connect_and_verify') {
      const useEnv = body.useEnv ?? false;
      let apiKey: string, secret: string;

      if (useEnv) {
        apiKey = process.env.PHEMEX_API_KEY ?? '';
        secret = process.env.PHEMEX_API_SECRET ?? '';
        if (!apiKey || !secret) {
          return NextResponse.json({ success: false, error: 'No env credentials configured' });
        }
      } else {
        apiKey = body.apiKey;
        secret = body.secret;
        if (!apiKey || !secret) {
          return NextResponse.json({ success: false, error: 'API Key and Secret are required' });
        }
      }

      const testnet = body.testnet ?? (useEnv ? process.env.PHEMEX_TESTNET === 'true' : false);
      const marketType = body.marketType ?? 'swap';

      try {
        // Step 1: Initialize client
        const client = getPhemexClient({ apiKey, secret, testnet, marketType });

        // Step 2: Explicitly sync time before any authenticated call
        const offset = await client.syncTime();
        console.log(`[PhantomX] connect_and_verify: time offset = ${offset}ms`);

        // Step 3: Verify credentials by fetching balance (authenticated endpoint)
        const balance = await client.getAccountInfo();

        // Step 4: Fetch positions
        const positions = await client.getPositions();

        // Step 5: Fetch a ticker to confirm market data works
        const ticker = await client.getTicker(body.symbol ?? 'BTC/USDT:USDT');

        return NextResponse.json({
          success: true,
          network: testnet ? 'testnet' : 'mainnet',
          account: {
            balances: balance.balances,
            totalUsdValue: balance.totalUsdValue,
          },
          positionCount: positions.length,
          positions: positions.slice(0, 5), // First 5 for preview
          ticker: {
            symbol: ticker.symbol,
            last: ticker.last,
            changePercent24h: ticker.changePercent24h,
          },
        });
      } catch (err) {
        const msg = String(err);
        console.error('[PhantomX] connect_and_verify error:', msg);
        // Parse common CCXT errors into user-friendly messages
        if (msg.includes('Request Expired')) {
          return NextResponse.json({ success: false, error: 'Clock sync failed — your system clock is too far off. Try restarting the server.' });
        }
        if (msg.includes('401') || msg.includes('Unauthorized')) {
          return NextResponse.json({ success: false, error: 'Invalid API credentials — check your key and secret' });
        }
        if (msg.includes('IP')) {
          return NextResponse.json({ success: false, error: 'IP not whitelisted on Phemex — add your IP in API settings' });
        }
        if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
          return NextResponse.json({ success: false, error: 'Cannot reach Phemex — check your internet connection' });
        }
        return NextResponse.json({ success: false, error: `Connection failed: ${msg.slice(0, 200)}` });
      }
    }

    const client = getPhemexClient();

    switch (action) {
      case 'ticker': {
        const ticker = await client.getTicker(body.symbol);
        return NextResponse.json({ ticker });
      }

      case 'ohlcv': {
        const ohlcv = await client.getOHLCV(body.symbol, body.timeframe, body.limit);
        return NextResponse.json({ ohlcv });
      }

      case 'orderbook': {
        const orderBook = await client.getOrderBook(body.symbol, body.limit);
        return NextResponse.json({ orderBook });
      }

      case 'account': {
        const account = await client.getAccountInfo();
        return NextResponse.json({ account });
      }

      case 'positions': {
        const positions = await client.getPositions(body.symbol);
        return NextResponse.json({ positions });
      }

      case 'open_orders': {
        const orders = await client.getOpenOrders(body.symbol);
        return NextResponse.json({ orders });
      }

      case 'create_order': {
        // CRIT-5: Global kill switch check — no orders when kill is active
        if (isKillSwitchActive()) {
          const ks = getKillState();
          return NextResponse.json(
            { error: `Kill switch is active: ${ks.reason}. Reset kill switch before placing orders.` },
            { status: 403 }
          );
        }
        // CRIT-4: Basic validation on order parameters
        if (!body.symbol || typeof body.symbol !== 'string') {
          return NextResponse.json({ error: 'Missing or invalid symbol' }, { status: 400 });
        }
        if (!['buy', 'sell'].includes(body.side)) {
          return NextResponse.json({ error: 'Side must be "buy" or "sell"' }, { status: 400 });
        }
        if (typeof body.amount !== 'number' || !isFinite(body.amount) || body.amount <= 0) {
          return NextResponse.json({ error: 'Amount must be a positive finite number' }, { status: 400 });
        }
        if (body.price != null && (typeof body.price !== 'number' || !isFinite(body.price) || body.price <= 0)) {
          return NextResponse.json({ error: 'Price must be a positive finite number' }, { status: 400 });
        }
        const order = await client.createOrder(
          body.symbol,
          body.orderType as OrderType,
          body.side as OrderSide,
          body.amount,
          body.price,
          body.params
        );
        return NextResponse.json({ order });
      }

      case 'cancel_order': {
        await client.cancelOrder(body.orderId, body.symbol);
        return NextResponse.json({ success: true });
      }

      case 'cancel_all': {
        await client.cancelAllOrders(body.symbol);
        return NextResponse.json({ success: true });
      }

      case 'trades': {
        const trades = await client.getMyTrades(body.symbol, body.limit);
        return NextResponse.json({ trades });
      }

      case 'symbols': {
        const symbols = await client.getAvailableSymbols();
        return NextResponse.json({ symbols });
      }

      case 'markets': {
        const markets = await client.getMarkets();
        const marketList = Object.entries(markets)
          .filter(([, m]) => m && m.swap && m.active && m.quote === 'USDT')
          .map(([symbol, m]) => ({
            symbol,
            base: m!.base ?? symbol.split('/')[0],
            maxLeverage: (m!.limits?.leverage?.max as number) ?? (m as unknown as Record<string, unknown>)?.maxLeverage ?? null,
            contractSize: m!.contractSize ?? 1,
          }))
          .sort((a, b) => (a.base ?? '').localeCompare(b.base ?? ''));
        return NextResponse.json({ markets: marketList });
      }

      case 'set_leverage': {
        await client.setLeverage(body.symbol, body.leverage);
        return NextResponse.json({ success: true });
      }

      case 'closed_orders': {
        const closedOrders = await client.getClosedOrders(body.symbol, body.since, body.limit);
        return NextResponse.json({ orders: closedOrders });
      }

      case 'close_position': {
        const order = await client.closePosition(
          body.symbol, body.side, body.size, body.type ?? 'market', body.price
        );
        return NextResponse.json({ order, success: true });
      }

      case 'ai_close': {
        // Gather market data for AI analysis
        const [orderbook, aiTicker, recentOhlcv] = await Promise.all([
          client.getOrderBook(body.symbol, 20),
          client.getTicker(body.symbol),
          client.getOHLCV(body.symbol, '5m', 30),
        ]);

        const { side, size, entryPrice } = body;
        const uPnl = side === 'long'
          ? (aiTicker.last - entryPrice) * size
          : (entryPrice - aiTicker.last) * size;

        // Build prompt for Claude
        const aiPrompt = `You are an expert crypto trader determining the optimal LIMIT price to close a position.

Position: ${side.toUpperCase()} ${size} contracts on ${body.symbol}
Entry price: $${entryPrice}
Current price: $${aiTicker.last}
Unrealized PnL: $${uPnl.toFixed(2)}

Orderbook (top 10):
BIDS: ${orderbook.bids.slice(0, 10).map((b: { price: number; amount: number }) => `$${b.price} (${b.amount})`).join(' | ')}
ASKS: ${orderbook.asks.slice(0, 10).map((a: { price: number; amount: number }) => `$${a.price} (${a.amount})`).join(' | ')}

Recent 5m candles (last 15):
${recentOhlcv.slice(-15).map((c: { open: number; high: number; low: number; close: number; volume: number }) => `O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume.toFixed(0)}`).join('\n')}

24h stats: High $${aiTicker.high} | Low $${aiTicker.low} | Change ${aiTicker.changePercent24h.toFixed(2)}%

Determine the optimal LIMIT price to close this ${side} position. Consider:
- Orderbook depth, wall detection, and liquidity clusters
- Recent price momentum and micro-trend direction
- Spread analysis — maximize fill probability while minimizing slippage
- If position is in profit, try to capture a bit more; if in loss, prioritize fast fill

Respond with ONLY a valid JSON object (no markdown, no code fences):
{"price": <number>, "reasoning": "<one sentence explanation>"}`;

        ensureOAuthEnv();
        const claudeCodePath = getClaudeCodePath();

        let aiText = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const message of query({
          prompt: aiPrompt,
          options: {
            pathToClaudeCodeExecutable: claudeCodePath,
            model: 'claude-sonnet-4-5-20250929',
            maxTurns: 1,
            systemPrompt: 'You are a crypto trading AI. Respond only with the requested JSON.',
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = message as any;
          if (msg.type === 'assistant') {
            const content = msg.message?.content || msg.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) aiText = block.text;
              }
            }
          } else if (msg.type === 'stream_event') {
            const event = msg.event;
            if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              aiText += event.delta.text;
            }
          }
        }

        // Parse AI response
        const jsonMatch = aiText.match(/\{[\s\S]*"price"[\s\S]*\}/);
        if (!jsonMatch) {
          return NextResponse.json({ success: false, error: 'AI could not determine optimal price', raw: aiText });
        }
        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.price || !isFinite(parsed.price)) {
          return NextResponse.json({ success: false, error: 'Invalid price from AI', raw: aiText });
        }

        // Execute the limit close
        const aiOrder = await client.closePosition(body.symbol, side, size, 'limit', parsed.price);

        return NextResponse.json({
          success: true,
          order: aiOrder,
          aiPrice: parsed.price,
          aiReasoning: parsed.reasoning,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error('[PhantomX Phemex] Error:', err);
    const msg = process.env.NODE_ENV === 'production' ? 'Internal server error' : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
