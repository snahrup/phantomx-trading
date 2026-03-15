'use client';

// ============================================================================
// PhantomX — Knowledge Highlights
// ============================================================================
// Compact card component that surfaces key knowledge base data inline in
// other panels (dashboard sidebar, header areas). Auto-refreshes on a
// 60-second interval. Falls back to "Knowledge offline" on API failure.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Activity, Gauge, Building2,
  AlertTriangle, CheckCircle, Pause, WifiOff,
} from 'lucide-react';

// ----- Types -----

interface HighlightData {
  tradingMode: { mode: string; setBy: string } | null;
  bubbleScore: { totalScore: number; maxScore: number; regime: string } | null;
  companyStatus: { status: string; reason: string } | null;
  riskParams: {
    maxPositionSize: number;
    maxLeverage: number;
    maxRiskPerTrade: number;
    maxSimultaneous: number;
    killSwitchDrawdown: number;
  } | null;
}

interface KnowledgeHighlightsProps {
  /** Compact mode — 2-column grid for tighter spaces */
  compact?: boolean;
  className?: string;
}

// ----- Constants -----

const POLL_INTERVAL = 60_000;

// ----- Component -----

export default function KnowledgeHighlights({ compact, className }: KnowledgeHighlightsProps) {
  const [data, setData] = useState<HighlightData>({
    tradingMode: null,
    bubbleScore: null,
    companyStatus: null,
    riskParams: null,
  });
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [tmRes, bsRes, csRes, rpRes] = await Promise.all([
        fetch('/api/knowledge/files?key=trading-mode'),
        fetch('/api/knowledge/files?key=bubble-score'),
        fetch('/api/knowledge/files?key=company-status'),
        fetch('/api/knowledge/files?key=risk-params'),
      ]);

      const [tmData, bsData, csData, rpData] = await Promise.all([
        tmRes.ok ? tmRes.json() : null,
        bsRes.ok ? bsRes.json() : null,
        csRes.ok ? csRes.json() : null,
        rpRes.ok ? rpRes.json() : null,
      ]);

      // Parse risk params for key limits
      let riskParams = null;
      if (rpData?.content) {
        try {
          const parsed = JSON.parse(rpData.content);
          riskParams = {
            maxPositionSize: parsed.positionSizing?.maxPositionSize?.value ?? 0,
            maxLeverage: parsed.exposureLimits?.maxLeveragePerPosition?.value ?? 0,
            maxRiskPerTrade: parsed.positionSizing?.maxRiskPerTrade?.value ?? 0,
            maxSimultaneous: parsed.exposureLimits?.maxSimultaneousPositions?.value ?? 0,
            killSwitchDrawdown: parsed.lossLimits?.killSwitch?.maxDrawdown ?? 0,
          };
        } catch {
          // Failed to parse — leave null
        }
      }

      // Parse each JSON field independently so one corrupt file doesn't
      // take down all four knowledge cards.
      let tradingMode: HighlightData['tradingMode'] = null;
      let bubbleScore: HighlightData['bubbleScore'] = null;
      let companyStatus: HighlightData['companyStatus'] = null;

      if (tmData?.content) {
        try { tradingMode = JSON.parse(tmData.content); } catch { /* malformed — leave null */ }
      }
      if (bsData?.content) {
        try { bubbleScore = JSON.parse(bsData.content); } catch { /* malformed — leave null */ }
      }
      if (csData?.content) {
        try { companyStatus = JSON.parse(csData.content); } catch { /* malformed — leave null */ }
      }

      setData({ tradingMode, bubbleScore, companyStatus, riskParams });
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Offline state
  if (offline && !loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-muted-foreground text-xs ${className || ''}`}>
        <WifiOff className="w-3.5 h-3.5 text-destructive" />
        <span>Knowledge offline</span>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className={`grid ${compact ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-2'} ${className || ''}`}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5 animate-pulse">
            <div className="h-2.5 w-14 bg-muted rounded mb-1.5" />
            <div className="h-4 w-10 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const items = [
    {
      label: 'Mode',
      value: data.tradingMode?.mode?.toUpperCase() ?? 'UNKNOWN',
      icon: data.tradingMode?.mode === 'autonomous' ? Activity : Shield,
      color: data.tradingMode?.mode === 'autonomous' ? 'text-[#2D8547]' : 'text-[#B8860B]',
      bg: data.tradingMode?.mode === 'autonomous' ? 'bg-[#2D8547]/10' : 'bg-[#B8860B]/10',
    },
    {
      label: 'Bubble',
      value: data.bubbleScore
        ? `${data.bubbleScore.totalScore}/${data.bubbleScore.maxScore}`
        : '--',
      icon: Gauge,
      color: !data.bubbleScore ? 'text-muted-foreground'
        : data.bubbleScore.totalScore <= 4 ? 'text-[#2D8547]'
        : data.bubbleScore.totalScore <= 8 ? 'text-[#B8860B]'
        : 'text-destructive',
      bg: !data.bubbleScore ? 'bg-muted'
        : data.bubbleScore.totalScore <= 4 ? 'bg-[#2D8547]/10'
        : data.bubbleScore.totalScore <= 8 ? 'bg-[#B8860B]/10'
        : 'bg-destructive/10',
      sub: data.bubbleScore?.regime ?? undefined,
    },
    {
      label: 'Status',
      value: data.companyStatus?.status?.toUpperCase() ?? 'UNKNOWN',
      icon: data.companyStatus?.status === 'active' ? CheckCircle
        : data.companyStatus?.status === 'paused' ? Pause
        : AlertTriangle,
      color: data.companyStatus?.status === 'active' ? 'text-[#2D8547]' : 'text-[#B8860B]',
      bg: data.companyStatus?.status === 'active' ? 'bg-[#2D8547]/10' : 'bg-[#B8860B]/10',
    },
    {
      label: 'Risk Limits',
      value: data.riskParams
        ? `${(data.riskParams.maxPositionSize * 100).toFixed(0)}% / ${data.riskParams.maxLeverage}x`
        : '--',
      icon: Shield,
      color: 'text-primary',
      bg: 'bg-primary/10',
      sub: data.riskParams
        ? `${(data.riskParams.maxRiskPerTrade * 100).toFixed(0)}% risk, ${data.riskParams.maxSimultaneous} pos max`
        : undefined,
    },
  ];

  return (
    <div className={`grid ${compact ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-2'} ${className || ''}`}>
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="rounded-lg border border-border bg-card p-2.5 group"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`w-4 h-4 rounded flex items-center justify-center ${item.bg}`}>
              <item.icon className={`w-2.5 h-2.5 ${item.color}`} />
            </div>
            <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
              {item.label}
            </span>
          </div>
          <div className={`text-sm font-semibold ${item.color} font-mono tabular-nums leading-tight`}>
            {item.value}
          </div>
          {item.sub && (
            <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-1">{item.sub}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
