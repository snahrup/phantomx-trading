'use client';

import { useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import ConciergeChatPanel from '@/components/concierge/ConciergeChatPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTradingStore } from '@/store/trading-store';

export default function AIChatPage() {
  const setAiPanelMode = useTradingStore(s => s.setAiPanelMode);

  // Tell PersistentPanels to hide its version — this page renders its own full-width panel
  useEffect(() => {
    setAiPanelMode('fullpage');
    return () => setAiPanelMode('hidden');
  }, [setAiPanelMode]);

  return (
    <AppLayout
      title="Concierge"
      subtitle="Phantom Trading Co. — 22-agent team proxy"
    >
      <PageTransition className="h-full">
        <div className="h-full rounded-lg border border-border overflow-hidden bg-card flex flex-col">
          <ErrorBoundary fallback="chat">
            <ConciergeChatPanel />
          </ErrorBoundary>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
