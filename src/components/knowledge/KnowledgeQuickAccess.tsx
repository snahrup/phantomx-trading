'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Activity, Gauge, BookOpen,
  AlertTriangle, CheckCircle, Pause,
} from 'lucide-react';

// ----- Types -----

interface QuickData {
  tradingMode: { mode: string; setBy: string } | null;
  bubbleScore: { totalScore: number; maxScore: number; regime: string } | null;
  companyStatus: { status: string; reason: string } | null;
  strategyCount: number;
}

interface KnowledgeQuickAccessProps {
  /** Callback when user clicks a quick-access item — navigates to that file */
  onNavigate?: (path: string) => void;
  /** Compact mode for embedding in sidebars */
  compact?: boolean;
}

// ----- Constants -----

const POLL_INTERVAL = 60_000;

// ----- Component -----

export default function KnowledgeQuickAccess({ onNavigate, compact }: KnowledgeQuickAccessProps) {
  const [data, setData] = useState<QuickData>({
    tradingMode: null,
    bubbleScore: null,
    companyStatus: null,
    strategyCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [tmRes, bsRes, csRes, treeRes] = await Promise.all([
        fetch('/api/knowledge/files?key=trading-mode'),
        fetch('/api/knowledge/files?key=bubble-score'),
        fetch('/api/knowledge/files?key=company-status'),
        fetch('/api/knowledge/files'),
      ]);

      const [tmData, bsData, csData, treeData] = await Promise.all([
        tmRes.ok ? tmRes.json() : null,
        bsRes.ok ? bsRes.json() : null,
        csRes.ok ? csRes.json() : null,
        treeRes.ok ? treeRes.json() : null,
      ]);

      // Count strategy files
      let strategyCount = 0;
      if (treeData?.files) {
        const strategiesDir = treeData.files.find((f: { name: string }) => f.name === 'strategies');
        if (strategiesDir?.children) {
          strategyCount = strategiesDir.children.filter((f: { type: string }) => f.type === 'file').length;
        }
      }

      setData({
        tradingMode: tmData?.content ? JSON.parse(tmData.content) : null,
        bubbleScore: bsData?.content ? JSON.parse(bsData.content) : null,
        companyStatus: csData?.content ? JSON.parse(csData.content) : null,
        strategyCount,
      });
    } catch {
      // Silently fail — widget is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className={`grid ${compact ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-3'}`}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg-surface)] p-3 animate-pulse">
            <div className="h-3 w-16 bg-[var(--cl-fill-control)] rounded mb-2" />
            <div className="h-5 w-12 bg-[var(--cl-fill-control)] rounded" />
          </div>
        ))}
      </div>
    );
  }

  const items = [
    {
      label: 'Trading Mode',
      value: data.tradingMode?.mode?.toUpperCase() ?? 'UNKNOWN',
      icon: data.tradingMode?.mode === 'autonomous' ? Activity : Shield,
      color: data.tradingMode?.mode === 'autonomous'
        ? 'text-[var(--cl-success)]'
        : 'text-[var(--cl-warning)]',
      bgColor: data.tradingMode?.mode === 'autonomous'
        ? 'bg-[var(--cl-fill-success-subtle)]'
        : 'bg-[var(--cl-fill-warning-subtle)]',
      sub: `Set by: ${data.tradingMode?.setBy ?? '—'}`,
      path: 'trading-mode.json',
    },
    {
      label: 'Bubble Score',
      value: data.bubbleScore
        ? `${data.bubbleScore.totalScore}/${data.bubbleScore.maxScore}`
        : '—',
      icon: Gauge,
      color: !data.bubbleScore ? 'text-[var(--cl-text-muted)]'
        : data.bubbleScore.totalScore <= 4 ? 'text-[var(--cl-success)]'
        : data.bubbleScore.totalScore <= 8 ? 'text-[var(--cl-warning)]'
        : 'text-[var(--cl-error)]',
      bgColor: !data.bubbleScore ? 'bg-[var(--cl-fill-control)]'
        : data.bubbleScore.totalScore <= 4 ? 'bg-[var(--cl-fill-success-subtle)]'
        : data.bubbleScore.totalScore <= 8 ? 'bg-[var(--cl-fill-warning-subtle)]'
        : 'bg-[var(--cl-fill-error-subtle)]',
      sub: data.bubbleScore?.regime ?? '—',
      path: 'risk-management/bubble-score.json',
    },
    {
      label: 'Company',
      value: data.companyStatus?.status?.toUpperCase() ?? 'UNKNOWN',
      icon: data.companyStatus?.status === 'active' ? CheckCircle
        : data.companyStatus?.status === 'paused' ? Pause
        : AlertTriangle,
      color: data.companyStatus?.status === 'active'
        ? 'text-[var(--cl-success)]'
        : 'text-[var(--cl-warning)]',
      bgColor: data.companyStatus?.status === 'active'
        ? 'bg-[var(--cl-fill-success-subtle)]'
        : 'bg-[var(--cl-fill-warning-subtle)]',
      sub: truncate(data.companyStatus?.reason ?? '—', 40),
      path: 'company-status.json',
    },
    {
      label: 'Strategies',
      value: String(data.strategyCount),
      icon: BookOpen,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      sub: 'Active playbooks',
      path: 'strategies/active-strategy-playbook.md',
    },
  ];

  return (
    <div className={`grid ${compact ? 'grid-cols-2 gap-2' : 'grid-cols-4 gap-3'}`}>
      {items.map((item, i) => (
        <motion.button
          key={item.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          onClick={() => onNavigate?.(item.path)}
          className="rounded-lg border border-[var(--cl-border)] bg-[var(--cl-bg-surface)] p-3 text-left hover:border-[var(--cl-border-hover)] hover:shadow-[var(--cl-shadow-card)] transition-all group"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-5 h-5 rounded flex items-center justify-center ${item.bgColor}`}>
              <item.icon className={`w-3 h-3 ${item.color}`} />
            </div>
            <span className="text-[10px] font-medium text-[var(--cl-text-muted)] uppercase tracking-wider">
              {item.label}
            </span>
          </div>
          <div className={`text-base font-semibold ${item.color} font-mono tabular-nums`}>
            {item.value}
          </div>
          {!compact && (
            <p className="text-[10px] text-[var(--cl-text-faint)] mt-0.5 line-clamp-1">
              {item.sub}
            </p>
          )}
        </motion.button>
      ))}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '...' : s;
}
