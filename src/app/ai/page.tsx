'use client';

import { useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { PageTransition } from '@/components/motion';
import AIChatPanel from '@/components/ai/AIChatPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTradingStore } from '@/store/trading-store';

export default function AIChatPage() {
  const setAiPanelMode = useTradingStore(s => s.setAiPanelMode);

  // Tell PersistentPanels to hide its version — this page renders its own full-width AIChatPanel
  useEffect(() => {
    setAiPanelMode('fullpage');
    return () => setAiPanelMode('hidden');
  }, [setAiPanelMode]);

  return (
    <AppLayout
      title="AI Chat"
      subtitle="Claude-powered trading intelligence"
    >
      <PageTransition className="h-full">
        <div className="h-full rounded-lg border border-border overflow-hidden bg-card flex flex-col">
          <ErrorBoundary fallback="chat">
            <AIChatPanel />
          </ErrorBoundary>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
