'use client';

import { useState, useMemo } from 'react';
import { useTradingStore } from '@/store/trading-store';
import { indicatorRegistry, CATEGORY_META, type IndicatorCategory } from '@/lib/chart/indicator-registry';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface IndicatorSelectorProps {
  onClose: () => void;
}

const CATEGORY_ORDER: IndicatorCategory[] = [
  'trend', 'momentum', 'volume', 'support_resistance', 'signals', 'patterns',
];

export default function IndicatorSelector({ onClose }: IndicatorSelectorProps) {
  const { enabledIndicators, toggleIndicator, indicatorParams, setIndicatorParam } = useTradingStore();
  const [expandedCategory, setExpandedCategory] = useState<IndicatorCategory | null>('trend');
  const [editingParams, setEditingParams] = useState<string | null>(null);

  const allIndicators = useMemo(() => indicatorRegistry.getAll(), []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of CATEGORY_ORDER) {
      counts[cat] = indicatorRegistry.getByCategory(cat).filter(ind => enabledIndicators[ind.key]).length;
    }
    return counts;
  }, [enabledIndicators]);

  const totalActive = Object.values(enabledIndicators).filter(Boolean).length;

  return (
    <Card className="absolute top-[70px] right-4 z-20 w-[280px] gap-0 py-0 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Indicators
          </span>
          {totalActive > 0 && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono">
              {totalActive}
            </Badge>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Categories */}
      <ScrollArea className="max-h-[450px]">
        <div className="py-1">
          {CATEGORY_ORDER.map(cat => {
            const meta = CATEGORY_META[cat];
            const indicators = indicatorRegistry.getByCategory(cat);
            const isExpanded = expandedCategory === cat;
            const activeCount = categoryCounts[cat] || 0;

            return (
              <div key={cat}>
                {/* Category header */}
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors"
                >
                  <svg
                    width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    className={`text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground flex-1 text-left">
                    {meta.label}
                  </span>
                  {activeCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[8px] px-1 py-0 h-3.5 font-mono"
                      style={{ borderColor: `${meta.color}40`, color: meta.color }}
                    >
                      {activeCount}
                    </Badge>
                  )}
                </button>

                {/* Indicator list */}
                {isExpanded && (
                  <div className="pb-1">
                    {indicators.map(ind => {
                      const isEnabled = !!enabledIndicators[ind.key];
                      const isEditingThis = editingParams === ind.key;

                      return (
                        <div key={ind.key}>
                          <div
                            className={`flex items-center gap-2 px-3 py-1 ml-4 rounded-md transition-colors cursor-pointer ${
                              isEnabled ? 'bg-muted/60' : 'hover:bg-muted/30'
                            }`}
                            onClick={() => toggleIndicator(ind.key)}
                          >
                            {/* Color swatch */}
                            <span
                              className="w-3 h-0.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: isEnabled ? ind.color : 'var(--border)' }}
                            />

                            {/* Name */}
                            <span className={`text-[11px] flex-1 text-left ${
                              isEnabled ? 'text-foreground' : 'text-muted-foreground'
                            }`}>
                              {ind.label}
                            </span>

                            {/* Pane badge */}
                            {ind.pane === 'sub_pane' && (
                              <span className="text-[7px] text-muted-foreground bg-muted/50 px-1 py-0.5 rounded uppercase">
                                panel
                              </span>
                            )}

                            {/* Settings gear (if has params) */}
                            {ind.params.length > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingParams(isEditingThis ? null : ind.key);
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="3" />
                                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06c.5.5 1.2.67 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.5.5-.67 1.2-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                              </button>
                            )}

                            {/* Toggle check */}
                            {isEnabled && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>

                          {/* Description tooltip */}
                          {isEnabled && !isEditingThis && (
                            <div className="ml-9 mr-3 mb-1 text-[9px] text-muted-foreground leading-tight line-clamp-2">
                              {ind.description}
                            </div>
                          )}

                          {/* Parameter editor */}
                          {isEditingThis && ind.params.length > 0 && (
                            <div className="ml-9 mr-3 mb-1 space-y-1">
                              {ind.params.map(param => {
                                const currentValue = indicatorParams[ind.key]?.[param.name] ?? param.default;
                                return (
                                  <div key={param.name} className="flex items-center gap-2">
                                    <span className="text-[9px] text-muted-foreground w-14 truncate">
                                      {param.label}
                                    </span>
                                    <input
                                      type="range"
                                      min={param.min}
                                      max={param.max}
                                      step={param.step}
                                      value={currentValue}
                                      onChange={(e) => setIndicatorParam(ind.key, param.name, Number(e.target.value))}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 h-1 accent-current"
                                      style={{ accentColor: ind.color }}
                                    />
                                    <span className="text-[9px] font-mono text-muted-foreground w-8 text-right">
                                      {currentValue}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
