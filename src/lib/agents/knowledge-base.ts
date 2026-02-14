// ============================================================================
// PhantomX — Knowledge Base (File-Backed Learning System)
// ============================================================================
// Stores trading knowledge as markdown files with YAML frontmatter in
// the /knowledge/ directory. Supports CRUD operations, search by tags/
// category, and generates a prompt-ready summary for the Commander.
// ============================================================================

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { KnowledgeEntry } from '@/types/trading';

const KNOWLEDGE_DIR = join(process.cwd(), 'knowledge');

// Ensure knowledge directory and subdirectories exist
function ensureDirs(): void {
  const dirs = [
    KNOWLEDGE_DIR,
    join(KNOWLEDGE_DIR, 'strategies'),
    join(KNOWLEDGE_DIR, 'patterns'),
    join(KNOWLEDGE_DIR, 'market-analysis'),
    join(KNOWLEDGE_DIR, 'risk-management'),
    join(KNOWLEDGE_DIR, 'custom'),
    join(KNOWLEDGE_DIR, 'learnings'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/** Generate a slug-based filename from a title. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/** Parse a knowledge file (markdown with YAML frontmatter). */
function parseKnowledgeFile(filePath: string): KnowledgeEntry | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) return null;

    const frontmatter = fmMatch[1];
    const content = fmMatch[2].trim();

    // Simple YAML parser for our known fields
    const meta: Record<string, string> = {};
    for (const line of frontmatter.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        meta[key] = val;
      }
    }

    // Parse tags (comma-separated in YAML)
    const tags = (meta.tags ?? '')
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);

    return {
      id: meta.id ?? '',
      title: meta.title ?? '',
      category: (meta.category as KnowledgeEntry['category']) ?? 'custom',
      tags,
      content,
      source: (meta.source as KnowledgeEntry['source']) ?? 'user',
      created: meta.created ?? new Date().toISOString(),
      updated: meta.updated ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Serialize a knowledge entry to markdown with YAML frontmatter. */
function serializeEntry(entry: KnowledgeEntry): string {
  return `---
id: ${entry.id}
title: ${entry.title}
category: ${entry.category}
tags: [${entry.tags.map(t => `"${t}"`).join(', ')}]
source: ${entry.source}
created: ${entry.created}
updated: ${entry.updated}
---
${entry.content}
`;
}

export class KnowledgeBase {
  constructor() {
    ensureDirs();
  }

  /** Get all knowledge entries. */
  getAll(): KnowledgeEntry[] {
    const entries: KnowledgeEntry[] = [];
    const categories = ['strategies', 'patterns', 'market-analysis', 'risk-management', 'custom', 'learnings'];

    for (const cat of categories) {
      const dir = join(KNOWLEDGE_DIR, cat);
      if (!existsSync(dir)) continue;

      for (const file of readdirSync(dir)) {
        if (!file.endsWith('.md')) continue;
        const entry = parseKnowledgeFile(join(dir, file));
        if (entry) entries.push(entry);
      }
    }

    return entries.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
  }

  /** Get entries by category. */
  getByCategory(category: KnowledgeEntry['category']): KnowledgeEntry[] {
    return this.getAll().filter(e => e.category === category);
  }

  /** Search entries by tags or text content. */
  search(query: string): KnowledgeEntry[] {
    const q = query.toLowerCase();
    return this.getAll().filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  /** Get a single entry by ID. */
  get(id: string): KnowledgeEntry | null {
    return this.getAll().find(e => e.id === id) ?? null;
  }

  /** Create a new knowledge entry. Returns the created entry. */
  create(input: {
    title: string;
    category: KnowledgeEntry['category'];
    tags: string[];
    content: string;
    source: KnowledgeEntry['source'];
  }): KnowledgeEntry {
    ensureDirs();

    const id = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const entry: KnowledgeEntry = {
      id,
      title: input.title,
      category: input.category,
      tags: input.tags,
      content: input.content,
      source: input.source,
      created: now,
      updated: now,
    };

    const filename = `${slugify(entry.title)}.md`;
    const filePath = join(KNOWLEDGE_DIR, entry.category, filename);
    writeFileSync(filePath, serializeEntry(entry), 'utf-8');

    return entry;
  }

  /** Update an existing entry. */
  update(id: string, updates: Partial<Pick<KnowledgeEntry, 'title' | 'category' | 'tags' | 'content'>>): KnowledgeEntry | null {
    const existing = this.get(id);
    if (!existing) return null;

    // Delete old file
    this.deleteFile(existing);

    const updated: KnowledgeEntry = {
      ...existing,
      ...updates,
      updated: new Date().toISOString(),
    };

    const filename = `${slugify(updated.title)}.md`;
    const filePath = join(KNOWLEDGE_DIR, updated.category, filename);
    writeFileSync(filePath, serializeEntry(updated), 'utf-8');

    return updated;
  }

  /** Delete an entry by ID. */
  delete(id: string): boolean {
    const entry = this.get(id);
    if (!entry) return false;
    return this.deleteFile(entry);
  }

  /** Get a prompt-ready summary of all knowledge for the Commander. */
  getPromptSummary(maxEntries = 10): string {
    const entries = this.getAll().slice(0, maxEntries);

    if (entries.length === 0) {
      return '  No knowledge entries yet. Use "learn:" in chat to teach me.';
    }

    const lines: string[] = [
      `  ${entries.length} knowledge entries loaded:`,
      '',
    ];

    for (const entry of entries) {
      const snippet = entry.content.slice(0, 200).replace(/\n/g, ' ');
      lines.push(`  [${entry.category}] ${entry.title}`);
      lines.push(`    Tags: ${entry.tags.join(', ') || 'none'}`);
      lines.push(`    ${snippet}${entry.content.length > 200 ? '...' : ''}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /** Get a prompt-ready block of behavioral learnings for heartbeat injection. */
  getLearningsPromptBlock(maxEntries = 15): string {
    const learnings = this.getByCategory('learnings').slice(0, maxEntries);

    if (learnings.length === 0) {
      return '  No behavioral learnings documented yet.';
    }

    const lines: string[] = [
      `  ${learnings.length} behavioral learnings on file:`,
      '',
    ];

    for (const entry of learnings) {
      // Extract first line as the core insight, rest as detail
      const firstLine = entry.content.split('\n')[0].trim();
      lines.push(`  - [${entry.tags[0] ?? 'general'}] ${entry.title}`);
      lines.push(`    ${firstLine}`);
      if (entry.tags.length > 1) {
        lines.push(`    Tags: ${entry.tags.join(', ')}`);
      }
      lines.push('');
    }

    lines.push('  INSTRUCTION: Before every trade decision, check if your proposed action');
    lines.push('  matches any documented pattern above. If it does, explicitly reference the');
    lines.push('  learning and either back off (hold) or override with clear justification.');

    return lines.join('\n');
  }

  /** Get total count. */
  count(): number {
    return this.getAll().length;
  }

  private deleteFile(entry: KnowledgeEntry): boolean {
    const dir = join(KNOWLEDGE_DIR, entry.category);
    if (!existsSync(dir)) return false;

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const parsed = parseKnowledgeFile(join(dir, file));
      if (parsed?.id === entry.id) {
        unlinkSync(join(dir, file));
        return true;
      }
    }
    return false;
  }
}

// Singleton
let knowledgeBase: KnowledgeBase | null = null;

export function getKnowledgeBase(): KnowledgeBase {
  if (!knowledgeBase) {
    knowledgeBase = new KnowledgeBase();
  }
  return knowledgeBase;
}
