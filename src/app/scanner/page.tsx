'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import AxonScannerPanel from '@/components/axon/AxonScannerPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ScannerPage() {
  return (
    <AppLayout
      title="Gem Scanner"
      subtitle="AI-powered market opportunity detection"
    >
      <PageTransition>
        <ErrorBoundary fallback="scanner">
          <AxonScannerPanel />
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}
