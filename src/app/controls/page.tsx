'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import ControlPanel from '@/components/trading/ControlPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function ControlsPage() {
  return (
    <AppLayout
      title="Controls"
      subtitle="Risk management and kill switch"
    >
      <PageTransition>
        <ErrorBoundary fallback="controls">
          <ControlPanel />
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}
