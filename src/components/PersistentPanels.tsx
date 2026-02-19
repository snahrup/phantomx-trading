'use client';

import { useTradingStore } from '@/store/trading-store';
import AIChatPanel from '@/components/ai/AIChatPanel';
import ConnectionSetup from '@/components/trading/ConnectionSetup';
import PineScriptModal from '@/components/trading/PineScriptModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * PersistentPanels — Always-mounted components that must survive page navigations.
 *
 * - AIChatPanel: Maintains SSE connection for agent events. Mounted at layout level,
 *   visibility controlled by aiPanelMode in Zustand store.
 * - ConnectionSetup: Modal for Phemex connection setup (triggered from any page).
 * - PineScriptModal: Modal for PineScript generation (triggered from strategy page).
 */
export default function PersistentPanels() {
  const aiPanelMode = useTradingStore(s => s.aiPanelMode);

  return (
    <>
      <ConnectionSetup />
      <PineScriptModal />

      {/* AI Chat — always mounted, visibility toggled by store state.
          When on /ai route, parent page sets aiPanelMode='fullpage'.
          Otherwise it can be 'floating' (slide-out) or 'hidden'. */}
      <div
        className={
          aiPanelMode === 'fullpage'
            ? 'hidden' // The /ai page renders its own full-width version; hide this one
            : aiPanelMode === 'floating'
            ? 'fixed bottom-4 right-4 z-40 w-[400px] h-[500px] rounded-xl border border-border bg-card shadow-lg overflow-hidden flex flex-col'
            : 'hidden'
        }
      >
        {aiPanelMode === 'floating' && (
          <ErrorBoundary fallback="chat">
            <AIChatPanel />
          </ErrorBoundary>
        )}
      </div>

      {/* AIChatPanel always mounted in hidden DOM for SSE connection persistence */}
      {aiPanelMode === 'hidden' && (
        <div className="hidden">
          <AIChatPanel />
        </div>
      )}
    </>
  );
}
