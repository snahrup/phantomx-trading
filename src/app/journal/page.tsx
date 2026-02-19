'use client';

import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import TradingJournal from '@/components/ai/TradingJournal';
import PaperTradingDashboard from '@/components/strategy/PaperTradingDashboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const TABS = [
  { id: 'paper' as const, label: 'Paper Trading', desc: 'AI paper trades, equity curve, thesis performance' },
  { id: 'live' as const, label: 'Live Journal', desc: 'AI-generated trade analysis and daily summaries' },
];

export default function JournalPage() {
  const [tab, setTab] = useState<'paper' | 'live'>('paper');

  return (
    <AppLayout
      title="Trading Journal"
      subtitle={tab === 'paper'
        ? 'Paper trading results, equity curve, trade history, and thesis performance'
        : 'AI-generated trade analysis and daily summaries'}
    >
      <PageTransition>
        <div className="h-full flex flex-col">
          {/* Tab selector */}
          <div className="flex gap-1 px-4 pt-2 pb-0 border-b border-white/5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                  tab === t.id
                    ? 'text-[#AE5630] bg-[#AE5630]/10 border-b-2 border-[#AE5630]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 p-4">
            <ErrorBoundary fallback="journal">
              {tab === 'paper' ? (
                <PaperTradingDashboard />
              ) : (
                <TradingJournal />
              )}
            </ErrorBoundary>
          </div>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
