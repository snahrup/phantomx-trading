// ============================================================================
// PhantomX — Knowledge Base API
// ============================================================================
// CRUD operations for the file-backed knowledge base.
// GET: list all or search by query/category
// POST: create or update an entry
// DELETE: remove an entry by ID
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getKnowledgeBase } from '@/lib/agents/knowledge-base';
import type { KnowledgeEntry } from '@/types/trading';

// GET — List / Search
export async function GET(req: NextRequest) {
  try {
    const kb = getKnowledgeBase();
    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const category = url.searchParams.get('category') as KnowledgeEntry['category'] | null;
    const id = url.searchParams.get('id');

    if (id) {
      const entry = kb.get(id);
      if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(entry);
    }

    if (query) {
      return NextResponse.json({ entries: kb.search(query), count: kb.count() });
    }

    if (category) {
      return NextResponse.json({ entries: kb.getByCategory(category), count: kb.count() });
    }

    return NextResponse.json({ entries: kb.getAll(), count: kb.count() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — Create or Update
export async function POST(req: NextRequest) {
  try {
    const kb = getKnowledgeBase();
    const body = await req.json();

    // Update existing
    if (body.id) {
      const updated = kb.update(body.id, {
        title: body.title,
        category: body.category,
        tags: body.tags,
        content: body.content,
      });
      if (!updated) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      return NextResponse.json({ success: true, entry: updated });
    }

    // Create new
    if (!body.title || !body.content) {
      return NextResponse.json({ error: 'title and content required' }, { status: 400 });
    }

    const entry = kb.create({
      title: body.title,
      category: body.category ?? 'custom',
      tags: body.tags ?? [],
      content: body.content,
      source: body.source ?? 'user',
    });

    return NextResponse.json({ success: true, entry });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE — Remove by ID
export async function DELETE(req: NextRequest) {
  try {
    const kb = getKnowledgeBase();
    const url = new URL(req.url);
    const id = url.searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const deleted = kb.delete(id);
    if (!deleted) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
