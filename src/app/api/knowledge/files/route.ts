// ============================================================================
// PhantomX — Knowledge Base File Browser API
// ============================================================================
// Reads from the Paperclip knowledge directory on disk.
// GET /api/knowledge/files           — list all files/directories
// GET /api/knowledge/files?path=...  — read a specific file
// GET /api/knowledge/files?key=...   — shortcut keys for known JSON files
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || 'C:/Users/snahrup/CascadeProjects/paperclip/knowledge';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Shortcut keys for commonly accessed files
const SHORTCUT_KEYS: Record<string, string> = {
  'trading-mode': 'trading-mode.json',
  'company-status': 'company-status.json',
  'bubble-score': 'risk-management/bubble-score.json',
  'risk-params': 'risk-management/risk-params.json',
  'scan-results': 'patterns/scan-results-latest.md',
};

interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: string;
  children?: FileEntry[];
}

async function buildTree(dirPath: string, relativeTo: string): Promise<FileEntry[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const results: FileEntry[] = [];

    // Sort: directories first, then files, alphabetical within each
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of sorted) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

      // Skip hidden files, binary images, PDFs
      if (entry.name.startsWith('.')) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.ico', '.svg'].includes(ext)) continue;

      try {
        const stat = await fs.stat(fullPath);

        if (entry.isDirectory()) {
          const children = await buildTree(fullPath, relativeTo);
          results.push({
            path: relPath,
            name: entry.name,
            type: 'dir',
            size: 0,
            modified: stat.mtime.toISOString(),
            children,
          });
        } else {
          results.push({
            path: relPath,
            name: entry.name,
            type: 'file',
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      } catch {
        // Skip files we can't stat
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filePath = url.searchParams.get('path');
    const key = url.searchParams.get('key');

    // Shortcut key → read specific known file
    if (key) {
      const shortcut = SHORTCUT_KEYS[key];
      if (!shortcut) {
        return NextResponse.json(
          { error: `Unknown shortcut key: ${key}. Valid keys: ${Object.keys(SHORTCUT_KEYS).join(', ')}` },
          { status: 400 }
        );
      }
      const fullPath = path.resolve(KNOWLEDGE_DIR, shortcut);
      if (!fullPath.startsWith(path.resolve(KNOWLEDGE_DIR))) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }
      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > MAX_FILE_SIZE) {
          return NextResponse.json({ error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB` }, { status: 413 });
        }
        const content = await fs.readFile(fullPath, 'utf-8');
        return NextResponse.json({ content, path: shortcut, modified: stat.mtime.toISOString() });
      } catch {
        return NextResponse.json({ error: `File not found: ${shortcut}` }, { status: 404 });
      }
    }

    // Read specific file
    if (filePath) {
      // Prevent path traversal
      const normalized = path.normalize(filePath).replace(/\\/g, '/');
      const fullPath = path.resolve(KNOWLEDGE_DIR, normalized);
      if (!fullPath.startsWith(path.resolve(KNOWLEDGE_DIR))) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > MAX_FILE_SIZE) {
          return NextResponse.json({ error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max: 10MB` }, { status: 413 });
        }
        const content = await fs.readFile(fullPath, 'utf-8');
        return NextResponse.json({ content, path: normalized, modified: stat.mtime.toISOString() });
      } catch {
        return NextResponse.json({ error: `File not found: ${normalized}` }, { status: 404 });
      }
    }

    // List all files/directories
    const files = await buildTree(KNOWLEDGE_DIR, KNOWLEDGE_DIR);
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
