'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, FolderOpen, FileText, FileJson, File,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ----- Types -----

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: string;
  children?: FileNode[];
}

interface KnowledgeFileTreeProps {
  files: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  filter: string;
}

// ----- Helpers -----

function getFileIcon(name: string, isOpen?: boolean) {
  if (name.endsWith('.json')) return <FileJson className="w-3.5 h-3.5 text-[var(--cl-warning)] shrink-0" />;
  if (name.endsWith('.md')) return <FileText className="w-3.5 h-3.5 text-[var(--cl-info)] shrink-0" />;
  return <File className="w-3.5 h-3.5 text-[var(--cl-text-muted)] shrink-0" />;
}

function countFiles(node: FileNode): number {
  if (node.type === 'file') return 1;
  return (node.children ?? []).reduce((sum, child) => sum + countFiles(child), 0);
}

function matchesFilter(node: FileNode, filter: string): boolean {
  const lower = filter.toLowerCase();
  if (node.name.toLowerCase().includes(lower)) return true;
  if (node.type === 'dir') {
    return (node.children ?? []).some(child => matchesFilter(child, lower));
  }
  return false;
}

function filterTree(nodes: FileNode[], filter: string): FileNode[] {
  if (!filter) return nodes;
  return nodes
    .filter(node => matchesFilter(node, filter))
    .map(node => {
      if (node.type === 'dir' && node.children) {
        return { ...node, children: filterTree(node.children, filter) };
      }
      return node;
    });
}

// ----- Components -----

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  defaultOpen,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? depth < 1);
  const isSelected = selectedPath === node.path;
  const fileCount = node.type === 'dir' ? countFiles(node) : 0;

  if (node.type === 'dir') {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full flex items-center gap-1.5 py-1 px-2 rounded-md text-left transition-colors text-xs',
            'hover:bg-[var(--cl-fill-hover)]',
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {isOpen ? (
            <ChevronDown className="w-3 h-3 text-[var(--cl-text-muted)] shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-[var(--cl-text-muted)] shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="w-3.5 h-3.5 text-[var(--cl-warning)] shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-[var(--cl-warning)] shrink-0" />
          )}
          <span className="font-medium text-[var(--cl-text-primary)] truncate">{node.name}</span>
          <span className="ml-auto text-[10px] text-[var(--cl-text-faint)] tabular-nums shrink-0">
            {fileCount}
          </span>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="overflow-hidden"
            >
              {node.children.map(child => (
                <TreeNode
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // File node
  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        'w-full flex items-center gap-1.5 py-1 px-2 rounded-md text-left transition-colors text-xs',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)] hover:text-[var(--cl-text-primary)]',
      )}
      style={{ paddingLeft: `${depth * 14 + 22}px` }}
    >
      {getFileIcon(node.name)}
      <span className={cn('truncate font-mono text-[11px]', isSelected && 'font-medium')}>
        {node.name}
      </span>
    </button>
  );
}

// ----- Main Component -----

export default function KnowledgeFileTree({ files, selectedPath, onSelect, filter }: KnowledgeFileTreeProps) {
  const filtered = useMemo(() => filterTree(files, filter), [files, filter]);

  if (filtered.length === 0 && filter) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-8 h-8 text-[var(--cl-text-faint)] mb-2" strokeWidth={1.5} />
        <p className="text-xs text-[var(--cl-text-muted)]">No files matching &quot;{filter}&quot;</p>
      </div>
    );
  }

  return (
    <div className="py-1 space-y-px">
      {filtered.map(node => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          defaultOpen={!!filter}
        />
      ))}
    </div>
  );
}
