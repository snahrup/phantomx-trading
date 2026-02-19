'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import GemScanner from '@/components/trading/GemScanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ScannerPage() {
  return (
    <AppLayout
      title="Gem Scanner"
      subtitle="AI-powered market opportunity detection"
    >
      <PageTransition>
        <ErrorBoundary fallback="scanner">
          <GemScanner />
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}
