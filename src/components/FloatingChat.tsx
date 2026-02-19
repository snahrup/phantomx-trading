'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Minus, Maximize2, Minimize2 } from 'lucide-react';
import AIChatPanel from '@/components/ai/AIChatPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';

type ChatMode = 'hidden' | 'minimized' | 'floating' | 'expanded';

const DEFAULT_SIZE = { w: 420, h: 520 };
const EXPANDED_SIZE = { w: 560, h: 680 };

export default function FloatingChat() {
  const [mode, setMode] = useState<ChatMode>('minimized');
  const [position, setPosition] = useState({ x: -1, y: -1 });
  const [size, setSize] = useState(DEFAULT_SIZE);
  const posInitialized = useRef(false);

  // Initialize position on first open
  useEffect(() => {
    if ((mode === 'floating' || mode === 'expanded') && !posInitialized.current && typeof window !== 'undefined') {
      setPosition({
        x: window.innerWidth - size.w - 20,
        y: window.innerHeight - size.h - 20,
      });
      posInitialized.current = true;
    }
  }, [mode, size.w, size.h]);

  // Drag handling
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const offsetX = e.clientX - position.x;
    const offsetY = e.clientY - position.y;
    const handleMove = (ev: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 200, ev.clientX - offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - 80, ev.clientY - offsetY)),
      });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [position]);

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = size.w;
    const sh = size.h;
    const handleMove = (ev: MouseEvent) => {
      setSize({
        w: Math.max(340, Math.min(800, sw + (ev.clientX - sx))),
        h: Math.max(360, Math.min(900, sh + (ev.clientY - sy))),
      });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [size]);

  const toggleExpanded = () => {
    if (mode === 'expanded') {
      setSize(DEFAULT_SIZE);
      setMode('floating');
    } else {
      setSize(EXPANDED_SIZE);
      setMode('expanded');
    }
  };

  const isOpen = mode === 'floating' || mode === 'expanded';

  return (
    <>
      {/* Floating Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed z-[60] flex flex-col rounded-xl border overflow-hidden"
            style={{
              left: position.x >= 0 ? position.x : undefined,
              right: position.x < 0 ? 20 : undefined,
              top: position.y >= 0 ? position.y : undefined,
              bottom: position.y < 0 ? 20 : undefined,
              width: size.w,
              height: size.h,
              borderColor: 'var(--cl-border)',
              background: 'var(--cl-bg-surface)',
              boxShadow: 'var(--cl-shadow-modal)',
            }}
          >
            {/* Title bar — draggable */}
            <div
              onMouseDown={handleDragStart}
              className="flex items-center justify-between px-3 py-2 border-b cursor-move select-none shrink-0"
              style={{
                borderColor: 'var(--cl-border)',
                background: 'var(--cl-bg-sidebar)',
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'var(--cl-fill-accent)' }}>
                  <MessageSquare className="w-3 h-3 text-primary" />
                </div>
                <span className="text-[11px] font-semibold text-foreground">AI Chat</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={toggleExpanded}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--cl-fill-hover)] text-muted-foreground hover:text-foreground transition-colors"
                  title={mode === 'expanded' ? 'Shrink' : 'Expand'}
                >
                  {mode === 'expanded' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => setMode('minimized')}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--cl-fill-hover)] text-muted-foreground hover:text-foreground transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setMode('hidden')}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--cl-fill-error)] text-muted-foreground hover:text-[var(--cl-error)] transition-colors"
                  title="Close"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Chat content */}
            <div className="flex-1 overflow-hidden">
              <ErrorBoundary fallback="chat">
                <AIChatPanel />
              </ErrorBoundary>
            </div>

            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-30 hover:opacity-60 transition-opacity"
              style={{
                background: 'linear-gradient(135deg, transparent 50%, currentColor 50%, currentColor 60%, transparent 60%, transparent 70%, currentColor 70%, currentColor 80%, transparent 80%)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized Bubble — bottom right */}
      <AnimatePresence>
        {(mode === 'minimized' || mode === 'hidden') && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              posInitialized.current = false;
              setMode('floating');
            }}
            className="fixed z-[60] bottom-5 right-5 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95 group"
            style={{
              background: 'var(--primary)',
              boxShadow: '0 4px 20px color-mix(in oklch, var(--primary), transparent 60%)',
            }}
            title="Open AI Chat"
          >
            <MessageSquare className="w-5 h-5 text-primary-foreground" />
            {/* Pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: '2px solid var(--primary)' }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
