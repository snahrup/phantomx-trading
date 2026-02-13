// ============================================================================
// PhantomX — TradingView Webhook Receiver (Secured)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import type { TradingViewWebhook } from '@/types/trading';

// In-memory queue for webhook signals (consumed by the execution engine)
const webhookQueue: TradingViewWebhook[] = [];
const MAX_QUEUE_SIZE = 100;

// Rate limiting: max 10 requests per minute per IP
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;
const MAX_TRACKED_IPS = 1000;
let lastCleanup = Date.now();

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  // Periodic cleanup: evict stale entries every 5 minutes to prevent unbounded growth
  if (now - lastCleanup > 300_000) {
    for (const [key, timestamps] of rateLimitMap) {
      const valid = timestamps.filter(t => now - t < RATE_WINDOW);
      if (valid.length === 0) rateLimitMap.delete(key);
      else rateLimitMap.set(key, valid);
    }
    lastCleanup = now;
  }

  // Cap max tracked IPs to prevent memory exhaustion from distributed attacks
  if (rateLimitMap.size > MAX_TRACKED_IPS && !rateLimitMap.has(ip)) {
    return true; // Over capacity — reject unknown IPs
  }

  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Webhook secret is MANDATORY
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.error('[PhantomX] WEBHOOK_SECRET not configured — rejecting all webhook requests');
      return NextResponse.json(
        { error: 'Webhook secret not configured on server' },
        { status: 503 }
      );
    }

    const secret = req.headers.get('x-webhook-secret');
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Parse TradingView webhook payload
    const webhook: TradingViewWebhook = {
      strategy: body.strategy ?? 'unknown',
      action: body.action ?? body.order_action,
      symbol: body.symbol ?? body.ticker,
      price: parseFloat(body.price ?? body.close ?? '0'),
      quantity: body.quantity ? parseFloat(body.quantity) : undefined,
      timestamp: body.timestamp ?? new Date().toISOString(),
      message: body.message ?? body.comment,
    };

    // Validate required fields
    if (!webhook.action || !['buy', 'sell', 'close'].includes(webhook.action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be buy, sell, or close.' },
        { status: 400 }
      );
    }

    // Add to queue
    webhookQueue.push(webhook);
    if (webhookQueue.length > MAX_QUEUE_SIZE) {
      webhookQueue.shift();
    }

    console.log(`[PhantomX] Webhook received: ${webhook.action} ${webhook.symbol} @ $${webhook.price}`);

    return NextResponse.json({
      success: true,
      received: webhook,
      queueSize: webhookQueue.length,
    });
  } catch (err) {
    console.error('[PhantomX] Webhook error:', err);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
}

// SSE endpoint to stream webhook signals to the frontend
export async function GET() {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send pending webhooks
      const interval = setInterval(() => {
        while (webhookQueue.length > 0) {
          const webhook = webhookQueue.shift();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(webhook)}\n\n`)
          );
        }
      }, 100);

      // Keep alive
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 15000);

      const maxLifetime = setTimeout(() => {
        clearInterval(interval);
        clearInterval(keepAlive);
        controller.close();
      }, 3600000); // 1 hour max

      cleanup = () => {
        clearInterval(interval);
        clearInterval(keepAlive);
        clearTimeout(maxLifetime);
      };
    },
    cancel() {
      cleanup?.();
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
