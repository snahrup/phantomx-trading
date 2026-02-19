import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  return NextResponse.json(db.strategies.getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = db.strategies.save(body);
  return NextResponse.json({ id });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  db.strategies.delete(id);
  return NextResponse.json({ ok: true });
}
