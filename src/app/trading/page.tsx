'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import TradingChart from '@/components/chart/TradingChart';
import SymbolSelector from '@/components/trading/SymbolSelector';
import TradeAnalytics from '@/components/trading/TradeAnalytics';
import DrawingToolbar from '@/components/chart/DrawingToolbar';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function TradingPage() {
  return (
    <AppLayout
      title="Trading"
      subtitle="Chart analysis and order execution"
      actions={<SymbolSelector />}
    >
      <PageTransition className="h-full flex flex-col gap-4">
        {/* Chart area */}
        <div className="flex-1 min-h-[400px] relative rounded-lg border border-border overflow-hidden bg-card">
          <ErrorBoundary fallback="chart">
            <DrawingToolbar />
            <TradingChart />
          </ErrorBoundary>
        </div>

        {/* Trade analytics below chart */}
        <div className="shrink-0">
          <ErrorBoundary fallback="analytics">
            <TradeAnalytics />
          </ErrorBoundary>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
