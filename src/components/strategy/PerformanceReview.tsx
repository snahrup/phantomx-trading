'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTradingStore } from '@/store/trading-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Brain, AlertTriangle, TrendingUp, TrendingDown, CheckCircle2,
  XCircle, Loader2, BookOpen, Shield, Zap, Target,
  ChevronDown, ChevronRight, BarChart3, Activity,
} from 'lucide-react';

const GLASS = 'rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm';

interface TradeReview {
  tradeId: string;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  thesisCorrect: boolean;
  entryQuality: number;
  exitQuality: number;
  ruleCompliance: boolean;
  errorType: string | null;
  explanation: string;
  lessonLearned: string;
}

interface DetectedPattern {
  pattern: string;
  frequency: number;
  impact: 'positive' | 'negative' | 'neutral';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedTrades: string[];
  suggestedAction: string;
}

interface Improvement {
  type: 'lesson' | 'constraint' | 'adjustment';
  title: string;
  description: string;
  evidence: string;
  priority: number;
  suggestedChange?: { field: string; from: string; to: string };
}

interface ReviewResult {
  tradesReviewed: number;
  tradeReviews: TradeReview[];
  patterns: DetectedPattern[];
  improvements: Improvement[];
  overallGrade: string;
}

type ReviewPhase = 'idle' | 'trade_analysis' | 'pattern_detection' | 'improvements' | 'complete';

export default function PerformanceReview() {
  const closedTrades = useTradingStore(s => s.autopilotClosedTrades);
  const decisionLog = useTradingStore(s => s.decisionLog);
  const activeStrategy = useTradingStore(s => s.activeStrategy);

  const [phase, setPhase] = useState<ReviewPhase>('idle');
  const [streamContent, setStreamContent] = useState('');
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runReview = useCallback(async () => {
    if (closedTrades.length === 0) return;

    setPhase('trade_analysis');
    setStreamContent('');
    setResult(null);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_performance',
          closedTrades: closedTrades,
          decisionLog: decisionLog,
          strategyConfig: activeStrategy,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setError(`API error: ${res.status}`);
        setPhase('idle');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: ReviewResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'phase') {
              if (event.status === 'running') {
                setPhase(event.phase);
                setStreamContent('');
              }
            } else if (event.type === 'stream') {
              setStreamContent(prev => prev + event.content);
            } else if (event.type === 'review_complete') {
              finalResult = event.summary;
            } else if (event.type === 'error') {
              setError(event.error);
            }
          } catch { /* skip bad lines */ }
        }
      }

      if (finalResult) {
        setResult(finalResult);
        setPhase('complete');
      } else {
        setPhase('idle');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(String(err));
        setPhase('idle');
      }
    }
  }, [closedTrades, decisionLog, activeStrategy]);

  const stopReview = useCallback(() => {
    abortRef.current?.abort();
    setPhase('idle');
  }, []);

  if (closedTrades.length === 0 && !result) {
    return (
      <div className={cn(GLASS, 'p-12 text-center')}>
        <Brain className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">No Trades to Review</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Once your strategy starts trading, the performance review engine will analyze every decision,
          find patterns, and generate improvements.
        </p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Header + Controls */}
      <div className={cn(GLASS, 'p-4')}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className={cn('w-4 h-4', phase !== 'idle' && phase !== 'complete' ? 'text-primary animate-pulse' : 'text-primary')} />
            <h3 className="text-sm font-semibold text-foreground">Performance Review</h3>
          </div>
          {result && (
            <Badge className={cn('text-[10px]',
              result.overallGrade === 'A' ? 'bg-emerald-500/20 text-emerald-500' :
              result.overallGrade === 'B' ? 'bg-blue-500/20 text-blue-500' :
              result.overallGrade === 'C' ? 'bg-yellow-500/20 text-yellow-500' :
              'bg-red-500/20 text-red-500',
            )}>
              Overall: {result.overallGrade}
            </Badge>
          )}
        </div>

        {/* Phase progress */}
        {phase !== 'idle' && phase !== 'complete' && (
          <div className="space-y-2 mb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              {phase === 'trade_analysis' && 'Analyzing individual trades...'}
              {phase === 'pattern_detection' && 'Detecting error patterns...'}
              {phase === 'improvements' && 'Generating improvements...'}
            </div>
            <Progress value={
              phase === 'trade_analysis' ? 33 :
              phase === 'pattern_detection' ? 66 :
              phase === 'improvements' ? 90 : 0
            } className="h-1.5" />
          </div>
        )}

        {/* Streaming content */}
        {streamContent && phase !== 'complete' && (
          <div className="relative max-h-32 overflow-hidden mb-3">
            <div className="text-[11px] text-muted-foreground/70 font-mono whitespace-pre-wrap leading-relaxed">
              {streamContent.slice(-500)}
              <span className="inline-block w-1.5 h-3 bg-primary/60 ml-0.5 animate-pulse" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card/80 to-transparent" />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {phase === 'idle' || phase === 'complete' ? (
            <Button
              onClick={runReview}
              size="sm"
              className="gap-2"
              disabled={closedTrades.length === 0}
            >
              <Brain className="w-3.5 h-3.5" />
              {result ? 'Re-run Review' : 'Run Performance Review'}
            </Button>
          ) : (
            <Button onClick={stopReview} variant="destructive" size="sm" className="gap-2">
              <XCircle className="w-3.5 h-3.5" /> Stop
            </Button>
          )}
          {result && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {result.tradesReviewed} trades reviewed
            </Badge>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className={cn(GLASS, 'p-3 border-red-500/30')}>
          <div className="flex items-center gap-2 text-xs text-red-500">
            <AlertTriangle className="w-3 h-3" />
            {error}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <Tabs defaultValue="grades" className="space-y-3">
          <TabsList className="w-full">
            <TabsTrigger value="grades" className="flex-1 gap-1.5 text-xs">
              <Target className="w-3 h-3" /> Grades
            </TabsTrigger>
            <TabsTrigger value="patterns" className="flex-1 gap-1.5 text-xs">
              <Activity className="w-3 h-3" /> Patterns
            </TabsTrigger>
            <TabsTrigger value="improvements" className="flex-1 gap-1.5 text-xs">
              <Zap className="w-3 h-3" /> Improvements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="grades">
            <TradeGrades reviews={result.tradeReviews} />
          </TabsContent>

          <TabsContent value="patterns">
            <PatternCards patterns={result.patterns} />
          </TabsContent>

          <TabsContent value="improvements">
            <ImprovementCards improvements={result.improvements} />
          </TabsContent>
        </Tabs>
      )}
    </motion.div>
  );
}

// ---------- Trade Grades ----------

function TradeGrades({ reviews }: { reviews: TradeReview[] }) {
  if (reviews.length === 0) {
    return (
      <div className={cn(GLASS, 'p-6 text-center')}>
        <p className="text-xs text-muted-foreground">No trade reviews available</p>
      </div>
    );
  }

  // Grade distribution
  const dist: Record<string, number> = {};
  reviews.forEach(r => { dist[r.grade] = (dist[r.grade] || 0) + 1; });
  const avgEntry = reviews.reduce((s, r) => s + r.entryQuality, 0) / reviews.length;
  const avgExit = reviews.reduce((s, r) => s + r.exitQuality, 0) / reviews.length;

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className={cn(GLASS, 'p-3')}>
        <div className="grid grid-cols-4 gap-3 text-center">
          {['A', 'B', 'C', 'D', 'F'].filter(g => dist[g]).map(g => (
            <div key={g}>
              <div className={cn('text-lg font-bold',
                g === 'A' ? 'text-emerald-500' :
                g === 'B' ? 'text-blue-500' :
                g === 'C' ? 'text-yellow-500' :
                'text-red-500',
              )}>{dist[g]}</div>
              <div className="text-[10px] text-muted-foreground">Grade {g}</div>
            </div>
          ))}
          <div>
            <div className="text-lg font-bold text-foreground">{avgEntry.toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground">Avg Entry Q</div>
          </div>
          <div>
            <div className="text-lg font-bold text-foreground">{avgExit.toFixed(0)}</div>
            <div className="text-[10px] text-muted-foreground">Avg Exit Q</div>
          </div>
        </div>
      </div>

      {/* Individual trade reviews */}
      {reviews.map((r, i) => (
        <TradeReviewCard key={r.tradeId || i} review={r} />
      ))}
    </div>
  );
}

function TradeReviewCard({ review }: { review: TradeReview }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn(GLASS, 'p-3')}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          <span className="text-xs font-mono text-muted-foreground">{review.tradeId}</span>
          <Badge className={cn('text-[9px]',
            review.grade === 'A' ? 'bg-emerald-500/20 text-emerald-500' :
            review.grade === 'B' ? 'bg-blue-500/20 text-blue-500' :
            review.grade === 'C' ? 'bg-yellow-500/20 text-yellow-500' :
            'bg-red-500/20 text-red-500',
          )}>{review.grade}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {review.thesisCorrect ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ) : (
            <XCircle className="w-3 h-3 text-red-500" />
          )}
          {review.errorType && (
            <Badge variant="outline" className="text-[9px] text-yellow-500 border-yellow-500/30">
              {review.errorType}
            </Badge>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-border/30 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Entry Quality: </span>
                  <span className={cn('font-medium',
                    review.entryQuality >= 70 ? 'text-emerald-500' :
                    review.entryQuality >= 40 ? 'text-yellow-500' : 'text-red-500',
                  )}>{review.entryQuality}/100</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Exit Quality: </span>
                  <span className={cn('font-medium',
                    review.exitQuality >= 70 ? 'text-emerald-500' :
                    review.exitQuality >= 40 ? 'text-yellow-500' : 'text-red-500',
                  )}>{review.exitQuality}/100</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Rules Followed: </span>
                  <span className={review.ruleCompliance ? 'text-emerald-500' : 'text-red-500'}>
                    {review.ruleCompliance ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Thesis Correct: </span>
                  <span className={review.thesisCorrect ? 'text-emerald-500' : 'text-red-500'}>
                    {review.thesisCorrect ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-foreground/80">{review.explanation}</p>
              <div className="flex items-start gap-1.5 text-[11px]">
                <BookOpen className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                <span className="text-primary/80 italic">{review.lessonLearned}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Pattern Cards ----------

function PatternCards({ patterns }: { patterns: DetectedPattern[] }) {
  if (patterns.length === 0) {
    return (
      <div className={cn(GLASS, 'p-6 text-center')}>
        <p className="text-xs text-muted-foreground">No patterns detected</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {patterns.map((p, i) => (
        <div key={i} className={cn(GLASS, 'p-3')}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {p.impact === 'positive' ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              ) : p.impact === 'negative' ? (
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              ) : (
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-xs font-semibold text-foreground">{p.pattern}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                {p.frequency}x
              </Badge>
              <Badge variant="outline" className={cn('text-[9px]',
                p.severity === 'critical' ? 'text-red-500 border-red-500/30' :
                p.severity === 'high' ? 'text-yellow-500 border-yellow-500/30' :
                p.severity === 'medium' ? 'text-blue-500 border-blue-500/30' :
                'text-muted-foreground',
              )}>
                {p.severity}
              </Badge>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">{p.description}</p>
          <div className="flex items-start gap-1.5 text-[11px]">
            <Shield className="w-3 h-3 text-primary mt-0.5 shrink-0" />
            <span className="text-primary/80">{p.suggestedAction}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Improvement Cards ----------

function ImprovementCards({ improvements }: { improvements: Improvement[] }) {
  if (improvements.length === 0) {
    return (
      <div className={cn(GLASS, 'p-6 text-center')}>
        <p className="text-xs text-muted-foreground">No improvements generated</p>
      </div>
    );
  }

  const sorted = [...improvements].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-3">
      {sorted.map((imp, i) => (
        <div key={i} className={cn(GLASS, 'p-3')}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {imp.type === 'lesson' ? (
                <BookOpen className="w-3.5 h-3.5 text-blue-500" />
              ) : imp.type === 'constraint' ? (
                <Shield className="w-3.5 h-3.5 text-red-500" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-yellow-500" />
              )}
              <span className="text-xs font-semibold text-foreground">{imp.title}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn('text-[9px]',
                imp.type === 'lesson' ? 'text-blue-500 border-blue-500/30' :
                imp.type === 'constraint' ? 'text-red-500 border-red-500/30' :
                'text-yellow-500 border-yellow-500/30',
              )}>
                {imp.type}
              </Badge>
              <Badge variant="outline" className="text-[9px] text-muted-foreground">
                P{imp.priority}
              </Badge>
            </div>
          </div>
          <p className="text-[11px] text-foreground/80 mb-1.5">{imp.description}</p>
          <p className="text-[10px] text-muted-foreground/70 italic">{imp.evidence}</p>
          {imp.suggestedChange && (
            <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2 text-[11px] font-mono">
              <Badge variant="secondary" className="text-[9px]">{imp.suggestedChange.field}</Badge>
              <span className="text-muted-foreground">{imp.suggestedChange.from}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-foreground font-medium">{imp.suggestedChange.to}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
