'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { PageTransition, SkeletonList } from '@/components/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import KnowledgeFileTree, { type FileNode } from '@/components/knowledge/KnowledgeFileTree';
import KnowledgeViewer from '@/components/knowledge/KnowledgeViewer';
import KnowledgeQuickAccess from '@/components/knowledge/KnowledgeQuickAccess';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, RefreshCcw, BookOpen,
  FileText, Shield, Gauge, Crosshair, ScanLine, Building2,
  PanelLeftClose, PanelLeft,
} from 'lucide-react';

// ----- Quick access shortcuts -----

const QUICK_ACCESS = [
  { label: 'Strategies', path: 'strategies/active-strategy-playbook.md', icon: Crosshair },
  { label: 'Risk Params', path: 'risk-management/risk-params.json', icon: Shield },
  { label: 'Bubble Score', path: 'risk-management/bubble-score.json', icon: Gauge },
  { label: 'Trading Mode', path: 'trading-mode.json', icon: FileText },
  { label: 'Scan Results', path: 'patterns/scan-results-latest.md', icon: ScanLine },
  { label: 'Company', path: 'company-status.json', icon: Building2 },
];

// ----- Page -----

export default function KnowledgePage() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [modified, setModified] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [treeLoading, setTreeLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [treePanelOpen, setTreePanelOpen] = useState(true);

  // Fetch file tree
  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge/files');
      if (!res.ok) return;
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
      // Silent fail
    } finally {
      setTreeLoading(false);
    }
  }, []);

  // Fetch file content
  const fetchFile = useCallback(async (path: string) => {
    setContentLoading(true);
    setSelectedPath(path);
    try {
      const res = await fetch(`/api/knowledge/files?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        setContent('Error loading file');
        setModified(null);
        return;
      }
      const data = await res.json();
      setContent(data.content ?? '');
      setModified(data.modified ?? null);
    } catch {
      setContent('Error loading file');
      setModified(null);
    } finally {
      setContentLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Count total files
  const totalFiles = countAllFiles(files);

  return (
    <AppLayout
      title="Knowledge Base"
      subtitle="Paperclip trading knowledge — strategies, risk params, market analysis"
      actions={
        <div className="flex items-center gap-2">
          {totalFiles > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] border-[var(--cl-border)] text-[var(--cl-text-muted)]"
            >
              <BookOpen className="w-3 h-3 mr-1" />
              {totalFiles} files
            </Badge>
          )}
          <button
            onClick={() => { setTreeLoading(true); fetchTree(); }}
            className="p-1.5 rounded-md hover:bg-[var(--cl-fill-hover)] text-[var(--cl-text-muted)] hover:text-[var(--cl-text-primary)] transition-colors"
            title="Refresh"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <PageTransition className="h-full flex flex-col gap-4">
        <ErrorBoundary fallback="knowledge">
          {/* Quick access cards */}
          <KnowledgeQuickAccess onNavigate={fetchFile} />

          {/* Main split: file tree | viewer */}
          <div className="flex-1 flex gap-0 rounded-xl border border-[var(--cl-border)] bg-[var(--cl-bg-surface)] shadow-[var(--cl-shadow-card)] overflow-hidden min-h-0">
            {/* Left: file tree */}
            {treePanelOpen && (
              <div className="w-72 shrink-0 flex flex-col border-r border-[var(--cl-border)] bg-[var(--cl-bg-base)]">
                {/* Search bar */}
                <div className="p-2 border-b border-[var(--cl-border)]">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--cl-text-faint)]" />
                    <Input
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                      placeholder="Filter files..."
                      className="h-7 text-xs pl-8 bg-[var(--cl-bg-surface)] border-[var(--cl-border)]"
                    />
                  </div>
                </div>

                {/* Quick nav buttons */}
                <div className="px-2 py-1.5 border-b border-[var(--cl-border)] flex flex-wrap gap-1">
                  {QUICK_ACCESS.map(qa => (
                    <button
                      key={qa.path}
                      onClick={() => fetchFile(qa.path)}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                        selectedPath === qa.path
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-[var(--cl-text-muted)] hover:text-[var(--cl-text-primary)] hover:bg-[var(--cl-fill-hover)]'
                      }`}
                      title={qa.path}
                    >
                      <qa.icon className="w-3 h-3" />
                      {qa.label}
                    </button>
                  ))}
                </div>

                {/* File tree */}
                <ScrollArea className="flex-1">
                  {treeLoading ? (
                    <div className="p-3">
                      <SkeletonList count={4} />
                    </div>
                  ) : (
                    <KnowledgeFileTree
                      files={files}
                      selectedPath={selectedPath}
                      onSelect={fetchFile}
                      filter={filter}
                    />
                  )}
                </ScrollArea>
              </div>
            )}

            {/* Collapse/expand toggle */}
            <button
              onClick={() => setTreePanelOpen(!treePanelOpen)}
              className="w-5 shrink-0 flex items-center justify-center border-r border-[var(--cl-border)] bg-[var(--cl-bg-muted)] hover:bg-[var(--cl-fill-hover)] text-[var(--cl-text-faint)] hover:text-[var(--cl-text-primary)] transition-colors"
              title={treePanelOpen ? 'Collapse file tree' : 'Expand file tree'}
            >
              {treePanelOpen ? (
                <PanelLeftClose className="w-3 h-3" />
              ) : (
                <PanelLeft className="w-3 h-3" />
              )}
            </button>

            {/* Right: file viewer */}
            <div className="flex-1 min-w-0 flex flex-col">
              <KnowledgeViewer
                content={content}
                filePath={selectedPath}
                modified={modified}
                loading={contentLoading}
              />
            </div>
          </div>
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}

// ----- Helpers -----

function countAllFiles(nodes: FileNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.type === 'file') return sum + 1;
    return sum + countAllFiles(node.children ?? []);
  }, 0);
}
