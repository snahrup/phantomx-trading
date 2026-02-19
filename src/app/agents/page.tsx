'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import PipelineShowcase from '@/components/agents/PipelineShowcase';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AgentsPage() {
  return (
    <AppLayout
      title="Agents"
      subtitle="5-Wave Trading Intelligence Pipeline"
    >
      <PageTransition>
        <ErrorBoundary fallback="agents">
          <PipelineShowcase />
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}
