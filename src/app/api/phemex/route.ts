// ============================================================================
// PhantomX — Phemex API Proxy Routes
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getPhemexClient, getConfiguredNetwork, hasTestnetCredentials, resetPhemexClient } from '@/lib/phemex/client';
import { isKillSwitchActive, isCloseOnlyMode, isFullyKilled, getKillState } from '@/lib/kill-switch';
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

    // Network info — check current network and testnet key availability
    if (action === 'network') {
      return NextResponse.json({
        configured: getConfiguredNetwork(),
        hasTestnetKeys: hasTestnetCredentials(),
        hasMainnetKeys: !!(process.env.PHEMEX_API_KEY && process.env.PHEMEX_API_SECRET),
      });
    }

    // Switch network at runtime — reinitializes the client
    if (action === 'switch_network') {
      const { network } = body;
      if (!['testnet', 'mainnet'].includes(network)) {
        return NextResponse.json({ error: 'network must be "testnet" or "mainnet"' }, { status: 400 });
      }
      const isTestnet = network === 'testnet';
      const apiKey = isTestnet
        ? (process.env.PHEMEX_TESTNET_API_KEY || process.env.PHEMEX_API_KEY)
        : process.env.PHEMEX_API_KEY;
      const secret = isTestnet
        ? (process.env.PHEMEX_TESTNET_API_SECRET || process.env.PHEMEX_API_SECRET)
        : process.env.PHEMEX_API_SECRET;
      if (!apiKey || !secret) {
        return NextResponse.json({ error: `No API credentials available for ${network}` }, { status: 400 });
      }
      resetPhemexClient();
      getPhemexClient({ apiKey, secret, testnet: isTestnet, marketType: body.marketType ?? 'swap' });
      return NextResponse.json({ success: true, network, message: `Switched to ${network}` });
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
        // CRIT-5: Global kill switch check
        if (isKillSwitchActive()) {
          const ks = getKillState();
          const isReduceOnly = body.params?.reduceOnly === true;

          // close_only mode: allow reduce-only orders (stop-loss, take-profit)
          if (isCloseOnlyMode() && isReduceOnly) {
            console.log(`[PhantomX] close_only mode: allowing reduce-only order on ${body.symbol}`);
          } else {
            const modeLabel = ks.mode === 'close_only'
              ? 'Kill switch is in close-only mode — only reduceOnly orders allowed'
              : `Kill switch is active: ${ks.reason}`;
            return NextResponse.json(
              { error: `${modeLabel}. Reset kill switch before placing new orders.`, mode: ks.mode },
              { status: 403 }
            );
          }
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
        if (!body.symbol) {
          return NextResponse.json({ error: 'symbol is required for cancel_all (Phemex requires it)' }, { status: 400 });
        }
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

      case 'funding_rate': {
        // Use underlying CCXT exchange directly (avoids singleton cache issues)
        const exchange = client.getExchange();
        const fr = await exchange.fetchFundingRate(body.symbol);
        return NextResponse.json({
          fundingRate: {
            symbol: fr.symbol ?? body.symbol,
            fundingRate: fr.fundingRate ?? 0,
            fundingTimestamp: fr.fundingDatetime ? new Date(fr.fundingDatetime).getTime() : (fr.timestamp ?? Date.now()),
            nextFundingTimestamp: fr.nextFundingDatetime ? new Date(fr.nextFundingDatetime).getTime() : undefined,
            markPrice: fr.markPrice ?? null,
            indexPrice: fr.indexPrice ?? null,
          },
        });
      }

      case 'funding_rate_history': {
        const exchange = client.getExchange();
        const history = await exchange.fetchFundingRateHistory(body.symbol, body.since, body.limit);
        return NextResponse.json({
          history: history.map((fr) => ({
            symbol: fr.symbol ?? body.symbol,
            fundingRate: fr.fundingRate ?? 0,
            fundingTimestamp: fr.timestamp ?? Date.now(),
          })),
        });
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
        if (!body.symbol) {
          return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
        }
        if (!body.side || !['long', 'short'].includes(body.side)) {
          return NextResponse.json({ error: 'side must be "long" or "short"' }, { status: 400 });
        }
        if (typeof body.size !== 'number' || !isFinite(body.size) || body.size <= 0) {
          return NextResponse.json({ error: 'size must be a positive finite number' }, { status: 400 });
        }
        const order = await client.closePosition(
          body.symbol, body.side, body.size, body.type ?? 'market', body.price
        );
        return NextResponse.json({ order, success: true });
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
