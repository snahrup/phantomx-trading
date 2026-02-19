'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import ResearchDashboard from '@/components/strategy/ResearchDashboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ResearchPage() {
  return (
    <AppLayout
      title="Research Engine"
      subtitle="AI background intelligence — continuously scanning, analyzing, and preparing trading strategies"
    >
      <PageTransition>
        <ErrorBoundary fallback="research">
          <ResearchDashboard />
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}
