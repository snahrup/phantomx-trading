import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const strategyId = req.nextUrl.searchParams.get('strategyId');
  if (!strategyId) return NextResponse.json({ error: 'strategyId required' }, { status: 400 });
  return NextResponse.json(db.backtests.getForStrategy(strategyId));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = db.backtests.save(body);
  return NextResponse.json({ id });
}
