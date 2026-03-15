'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import AgentTeamPanel from '@/components/agents/AgentTeamPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AgentsPage() {
  return (
    <AppLayout
      title="Agents"
      subtitle="Axon Agent Network — Team Management"
    >
      <PageTransition>
        <ErrorBoundary fallback="agents">
          <AgentTeamPanel />
        </ErrorBoundary>
      </PageTransition>
    </AppLayout>
  );
}
