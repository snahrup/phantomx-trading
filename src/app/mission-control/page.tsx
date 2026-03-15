'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import MissionControlPanel from '@/components/mission-control/MissionControlPanel';

export default function MissionControlPage() {
  return (
    <AppLayout>
      <PageTransition className="h-full">
        <ErrorBoundary fallback="mission-control">
          <MissionControlPanel />
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}
