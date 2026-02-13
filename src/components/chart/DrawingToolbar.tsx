'use client';

import { useTradingStore } from '@/store/trading-store';
import type { DrawingTool } from '@/types/trading';

const TOOLS: { key: DrawingTool; label: string; icon: string }[] = [
  { key: 'select', label: 'Select', icon: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' },
  { key: 'horizontal', label: 'Horizontal', icon: 'M4 12h16' },
  { key: 'trendline', label: 'Trendline', icon: 'M4 20L20 4' },
  { key: 'ray', label: 'Ray', icon: 'M4 16l8-8m0 0l8-8' },
  { key: 'fibonacci', label: 'Fib', icon: 'M4 4h16M4 9h16M4 13h12M4 17h8M4 20h4' },
  { key: 'rectangle', label: 'Zone', icon: 'M3 3h18v18H3z' },
];

const COLORS = ['#AE5630', '#5FB87A', '#5A9ED4', '#D4A84A', '#a855f7', '#f97316', '#EEEEEE'];

export default function DrawingToolbar() {
  const {
    activeDrawingTool, setActiveDrawingTool,
    drawingColor, setDrawingColor,
    drawingLineWidth, setDrawingLineWidth,
    undoDrawing, redoDrawing,
    clearDrawings, clearPriceLines,
    drawings, drawingUndoStack,
  } = useTradingStore();

  return (
    <div className="absolute top-12 left-3 z-20 flex flex-col gap-1">
      {/* Drawing Tools */}
      <div className="glass-card p-1 flex flex-col gap-0.5">
        {TOOLS.map(tool => (
          <button
            key={tool.key}
            onClick={() => setActiveDrawingTool(tool.key)}
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
              activeDrawingTool === tool.key
                ? 'bg-[var(--cl-fill-accent-active)] text-[var(--cl-accent)]'
                : 'text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] hover:bg-[var(--cl-fill-hover)]'
            }`}
            title={tool.label}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={tool.icon} />
            </svg>
          </button>
        ))}
      </div>

      {/* Color Picker — only show when a drawing tool is active */}
      {activeDrawingTool !== 'select' && (
        <div className="glass-card p-1.5 flex flex-col gap-1">
          {/* Colors */}
          <div className="flex flex-wrap gap-0.5 max-w-[40px]">
            {COLORS.map(color => (
              <button
                key={color}
                onClick={() => setDrawingColor(color)}
                className={`w-4 h-4 rounded-sm border transition-transform ${
                  drawingColor === color ? 'border-white scale-125' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Line Width */}
          <div className="flex flex-col gap-0.5 mt-1">
            {[1, 2, 3].map(w => (
              <button
                key={w}
                onClick={() => setDrawingLineWidth(w)}
                className={`w-full h-4 flex items-center justify-center rounded ${
                  drawingLineWidth === w ? 'bg-[var(--cl-fill-accent-hover)]' : 'hover:bg-[var(--cl-fill-hover)]'
                }`}
              >
                <div
                  className="rounded-full"
                  style={{ width: '16px', height: `${w}px`, backgroundColor: drawingColor }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Undo / Redo / Clear */}
      <div className="glass-card p-1 flex flex-col gap-0.5">
        <button
          onClick={undoDrawing}
          disabled={drawings.length === 0}
          className="w-8 h-8 rounded flex items-center justify-center text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] disabled:opacity-20 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          onClick={redoDrawing}
          disabled={drawingUndoStack.length === 0}
          className="w-8 h-8 rounded flex items-center justify-center text-[var(--cl-text-secondary)] hover:text-[var(--cl-text-faint)] disabled:opacity-20 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Y)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
          </svg>
        </button>
        <button
          onClick={() => { clearDrawings(); clearPriceLines(); }}
          className="w-8 h-8 rounded flex items-center justify-center text-[var(--cl-text-secondary)] hover:text-[var(--cl-error)]"
          title="Clear All"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
