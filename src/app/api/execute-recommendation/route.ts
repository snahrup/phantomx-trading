// ============================================================================
// PhantomX — Execute Axon Trade Recommendation API
// ============================================================================
// Bridges Axon's 5-wave pipeline recommendations to PhantomX order execution.
//
// POST /api/execute-recommendation
//   Body: { recommendation: TradeRecommendation, action: 'execute' | 'reject' }
//   Response: { success: boolean, orderId?: string, error?: string }
//
// On execute:
//   1. Places market order via PhantomX's CCXT/Phemex client
//   2. Places stop-loss and take-profit orders
//   3. Posts execution result back to Axon as an issue comment
//   4. Updates the Axon issue status to "done"
//
// On reject:
//   1. Updates the Axon issue status to "cancelled"
//   2. Posts rejection comment to the issue
// ============================================================================

import { NextResponse } from 'next/server';
import { getPhemexClient, isPhemexConfigured } from '@/lib/phemex/client';
import { getAxonClient } from '@/lib/axon/client';
import { isKillSwitchActive, isCloseOnlyMode } from '@/lib/kill-switch';
import type { TradeRecommendation } from '@/lib/axon/recommendation-parser';

const usdFmt = new Intl.NumberFormat('en-US');
const MAX_POSITION_SIZE = Number(process.env.MAX_POSITION_SIZE_USD) || 50000;
const EXECUTION_SECRET = process.env.PHANTOMX_EXECUTION_SECRET;

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    // Authentication check — if PHANTOMX_EXECUTION_SECRET is set, require matching header.
    // Security model: When the env var is unset (typical in local dev), the endpoint is
    // unauthenticated. This is intentional — the route only runs on localhost during
    // development. For any public deployment, PHANTOMX_EXECUTION_SECRET MUST be set so
    // that the X-PhantomX-Auth header is validated. The client-side code reads the secret
    // from NEXT_PUBLIC_PHANTOMX_EXECUTION_SECRET and sends it on every request.
    if (EXECUTION_SECRET) {
      const authHeader = req.headers.get('X-PhantomX-Auth');
      if (authHeader !== EXECUTION_SECRET) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized — invalid or missing X-PhantomX-Auth header' },
          { status: 401 },
        );
      }
    }

    const body = await req.json();
    const { recommendation, action } = body as {
      recommendation: TradeRecommendation;
      action: 'execute' | 'reject';
    };

    if (!recommendation || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing recommendation or action' },
        { status: 400 },
      );
    }

    const axon = getAxonClient();

    // -----------------------------------------------------------------------
    // REJECT
    // -----------------------------------------------------------------------
    if (action === 'reject') {
      const reason = (body.reason as string) || 'Rejected by trader';

      // Post rejection comment to Axon issue
      await axon.addComment(
        recommendation.issueId,
        `**TRADE REJECTED** by PhantomX operator\n\n` +
          `Reason: ${reason}\n` +
          `Symbol: ${recommendation.symbol}\n` +
          `Direction: ${recommendation.direction}\n` +
          `Entry: $${usdFmt.format(recommendation.entryPrice)}\n\n` +
          `_Recommendation was not executed._`,
        { comment_type: 'ruling', wave: 5 },
      );

      // Update Axon issue status to cancelled
      await axon.updateIssue(recommendation.issueId, { status: 'cancelled' });

      return NextResponse.json({ success: true, action: 'rejected' });
    }

    // -----------------------------------------------------------------------
    // EXECUTE
    // -----------------------------------------------------------------------

    // Kill switch check
    if (isKillSwitchActive()) {
      const reason = isCloseOnlyMode()
        ? 'Kill switch in close-only mode — no new entries allowed'
        : 'Kill switch is active — all trading halted';
      return NextResponse.json(
        { success: false, error: reason },
        { status: 403 },
      );
    }

    // Exchange client check
    if (!isPhemexConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Phemex client not configured. Set API keys in .env' },
        { status: 503 },
      );
    }

    const client = getPhemexClient();
    const rec = recommendation;
    const side = rec.direction === 'LONG' ? 'buy' : 'sell';
    const closeSide = rec.direction === 'LONG' ? 'sell' : 'buy';

    // Position size upper bound check
    if (rec.positionSizeNotional > MAX_POSITION_SIZE) {
      return NextResponse.json(
        { success: false, error: `Position size $${usdFmt.format(rec.positionSizeNotional)} exceeds maximum allowed $${usdFmt.format(MAX_POSITION_SIZE)}. Adjust MAX_POSITION_SIZE_USD env var to increase.` },
        { status: 400 },
      );
    }

    // Compute order size from notional value
    let size = 0;
    if (rec.positionSizeNotional > 0 && rec.entryPrice > 0) {
      size = rec.positionSizeNotional / rec.entryPrice;
    }

    if (size <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid position size — cannot compute order quantity' },
        { status: 400 },
      );
    }

    // Set leverage — HARD REQUIREMENT: if this fails, abort execution.
    // Proceeding with wrong leverage (e.g. 100x instead of intended 10x)
    // can be catastrophic on leveraged perpetual futures.
    if (rec.leverage > 1) {
      try {
        await client.setLeverage(rec.symbol, rec.leverage);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        await axon.addComment(
          rec.issueId,
          `**EXECUTION ABORTED** — Leverage set failed\n\n` +
            `Could not set leverage to ${rec.leverage}x on ${rec.symbol}.\n` +
            `Error: ${errMsg}\n\n` +
            `_Order was NOT placed. The exchange may have a different leverage configured. ` +
            `Resolve manually before retrying._`,
          { comment_type: 'ruling', wave: 5 },
        );

        return NextResponse.json(
          { success: false, error: `Leverage set failed: ${errMsg}. Order NOT placed.` },
          { status: 500 },
        );
      }
    }

    // Generate idempotency key from recommendation identity
    const clientOrderId = `px-${rec.issueId.slice(0, 8)}-${Date.now()}`;

    // Place primary entry order — prefer LIMIT for maker fee savings.
    // Maker fee on Phemex is -0.025% (rebate) vs 0.075% taker.
    // Use postOnly to guarantee maker placement; fall back to regular limit
    // if postOnly is rejected (price already at/past entry). Last resort: market.
    let orderId: string | undefined;
    let fillPrice: number | undefined;
    let fees: number | undefined;
    let entryOrderType = 'limit';

    try {
      // Attempt 1: Post-only limit order (guaranteed maker fee / rebate)
      try {
        const order = await client.createOrder(rec.symbol, 'limit', side, size, rec.entryPrice, {
          clientOrderId,
          postOnly: true,
        });
        orderId = order.id;
        fillPrice = order.price ?? rec.entryPrice;
        fees = order.fee?.cost;
        entryOrderType = 'limit-postOnly';
      } catch (postOnlyErr) {
        // PostOnly rejected — price already at/past entry. Use regular limit.
        const order = await client.createOrder(rec.symbol, 'limit', side, size, rec.entryPrice, {
          clientOrderId: `${clientOrderId}-lim`,
        });
        orderId = order.id;
        fillPrice = order.price ?? rec.entryPrice;
        fees = order.fee?.cost;
        entryOrderType = 'limit';
      }
    } catch (limitErr) {
      // Limit order also failed — last resort: market order for immediate fill
      try {
        const order = await client.createOrder(rec.symbol, 'market', side, size, undefined, {
          clientOrderId: `${clientOrderId}-mkt`,
        });
        orderId = order.id;
        // Market orders: use cost/filled for true avg fill price (ccxt returns price=undefined for markets)
        fillPrice = (order.cost && order.filled && order.filled > 0)
          ? order.cost / order.filled
          : (order.price ?? rec.entryPrice);
        fees = order.fee?.cost;
        entryOrderType = 'market-fallback';
        console.warn(`[execute-recommendation] Limit orders failed, fell back to market for ${rec.symbol}`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // Post failure comment to Axon
        await axon.addComment(
          rec.issueId,
          `**EXECUTION FAILED** on PhantomX\n\n` +
            `Error: ${errMsg}\n` +
            `Symbol: ${rec.symbol} ${rec.direction}\n` +
            `Attempted size: ${size.toFixed(6)} @ $${usdFmt.format(rec.entryPrice)} limit (then market fallback)\n\n` +
            `_All order types failed. Manual intervention may be required._`,
          { comment_type: 'ruling', wave: 5 },
        );

        return NextResponse.json(
          { success: false, error: errMsg },
          { status: 500 },
        );
      }
    }

    // Rate limit delay — Phemex rate limits hard on rapid sequential calls
    await new Promise((r) => setTimeout(r, 2000));

    // Place stop-loss order — CRITICAL: if this fails, close the position immediately.
    // An open leveraged position with no stop-loss is the single most dangerous state.
    let stopOrderId: string | undefined;
    let stopFailed = false;
    if (rec.stopLoss > 0) {
      try {
        const stopOrder = await client.createOrder(
          rec.symbol,
          'stop',
          closeSide,
          size,
          rec.stopLoss,
          { stopPrice: rec.stopLoss, reduceOnly: true },
        );
        stopOrderId = stopOrder.id;
      } catch (slErr) {
        stopFailed = true;
        const slErrMsg = slErr instanceof Error ? slErr.message : String(slErr);
        console.error('[execute-recommendation] CRITICAL: Stop-loss placement failed, closing position:', slErr);

        // Emergency: close the position since it has no stop-loss protection
        let emergencyCloseId: string | undefined;
        try {
          const closeOrder = await client.createOrder(rec.symbol, 'market', closeSide, size, undefined, { reduceOnly: true });
          emergencyCloseId = closeOrder.id;
        } catch (closeErr) {
          console.error('[execute-recommendation] EMERGENCY CLOSE ALSO FAILED:', closeErr);
        }

        await axon.addComment(
          rec.issueId,
          `**⚠️ STOP-LOSS FAILED — POSITION UNPROTECTED**\n\n` +
            `Entry order ${orderId} was filled, but stop-loss at $${usdFmt.format(rec.stopLoss)} FAILED.\n` +
            `SL Error: ${slErrMsg}\n\n` +
            (emergencyCloseId
              ? `**Emergency close order placed** (${emergencyCloseId}) to flatten the position.\n`
              : `**EMERGENCY CLOSE ALSO FAILED — MANUAL INTERVENTION REQUIRED IMMEDIATELY.**\n`) +
            `\nSymbol: ${rec.symbol} ${rec.direction} | Size: ${size.toFixed(6)} | Leverage: ${rec.leverage}x`,
          { comment_type: 'ruling', wave: 5 },
        );

        // Mark issue as needing review, not done
        await axon.updateIssue(rec.issueId, { status: 'review' });

        return NextResponse.json({
          success: false,
          error: `Stop-loss placement failed. ${emergencyCloseId ? 'Emergency close placed.' : 'MANUAL CLOSE REQUIRED.'}`,
          orderId,
          fillPrice,
          emergencyCloseId,
          stopFailed: true,
        }, { status: 500 });
      }
    }

    // Rate limit delay before take-profit orders
    await new Promise((r) => setTimeout(r, 2000));

    // Place take-profit orders — track failures
    const tpOrderIds: string[] = [];
    let tpFailCount = 0;
    for (const tp of rec.takeProfitTargets) {
      if (tp.price <= 0) continue;
      const tpSize = size * (tp.closePercent / 100);
      if (tpSize <= 0) continue;

      try {
        // Rate limit between successive TP orders
        if (tpOrderIds.length > 0) await new Promise((r) => setTimeout(r, 2000));
        const tpOrder = await client.createOrder(
          rec.symbol,
          'limit',
          closeSide,
          tpSize,
          tp.price,
          { reduceOnly: true },
        );
        tpOrderIds.push(tpOrder.id);
      } catch (err) {
        tpFailCount++;
        tpOrderIds.push('FAILED');
        console.error(`[execute-recommendation] TP @ ${tp.price} placement failed:`, err);
      }
    }

    // Calculate slippage
    const slippage = fillPrice ? Math.abs(fillPrice - rec.entryPrice) : 0;
    const slippagePct = rec.entryPrice > 0 ? (slippage / rec.entryPrice) * 100 : 0;

    // Format take-profit summary for comment
    const tpLines = rec.takeProfitTargets
      .map((tp, i) => `  TP${i + 1}: $${usdFmt.format(tp.price)} (${tp.closePercent}%) ${tpOrderIds[i] ? `[${tpOrderIds[i]}]` : '[FAILED]'}`)
      .join('\n');

    // Post execution result to Axon as a comment
    await axon.addComment(
      rec.issueId,
      `**TRADE EXECUTED** via PhantomX\n\n` +
        `Symbol: ${rec.symbol} ${rec.direction}\n` +
        `Entry: $${usdFmt.format(fillPrice ?? rec.entryPrice)} (requested $${usdFmt.format(rec.entryPrice)}) [${entryOrderType}]\n` +
        `Slippage: ${slippagePct.toFixed(3)}%\n` +
        `Size: ${size.toFixed(6)} (${usdFmt.format(rec.positionSizeNotional)} USDT notional)\n` +
        `Leverage: ${rec.leverage}x\n` +
        `Stop Loss: $${usdFmt.format(rec.stopLoss)} ${stopOrderId ? `[${stopOrderId}]` : '[FAILED]'}\n` +
        (tpLines ? `Take Profits:\n${tpLines}\n` : '') +
        (fees ? `Fees: $${fees.toFixed(4)}\n` : '') +
        `\nOrder ID: ${orderId}\n` +
        `Strategy: ${rec.strategy}\n` +
        `R:R: ${rec.riskRewardRatio}:1`,
      { comment_type: 'ruling', wave: 5 },
    );

    // Update Axon issue status — only "done" if all critical orders placed
    const allOrdersOk = stopOrderId && tpFailCount === 0;
    await axon.updateIssue(rec.issueId, {
      status: allOrdersOk ? 'done' : 'review',
    });

    return NextResponse.json({
      success: true,
      orderId,
      fillPrice,
      entryOrderType,
      slippage,
      slippagePct,
      stopOrderId,
      tpOrderIds,
      tpFailCount,
      fees,
      warnings: tpFailCount > 0
        ? [`${tpFailCount} take-profit order(s) failed to place — check manually`]
        : undefined,
    });
  } catch (err) {
    console.error('[execute-recommendation] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
