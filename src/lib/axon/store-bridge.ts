// ============================================================================
// PhantomX — Axon SSE → Zustand Store Bridge
// Connects the AxonEventSource singleton to the Axon Zustand store so that
// real-time SSE events automatically update UI state.
// ============================================================================

import { getAxonEventSource } from './event-source';
import { useAxonStore } from '@/store/axon-store';

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

let _cleanup: (() => void) | null = null;

/** Debounce timer for issue list refresh after SSE updates */
let _issueFetchTimer: ReturnType<typeof setTimeout> | null = null;
const ISSUE_FETCH_DEBOUNCE_MS = 2_000;

/**
 * Wire the Axon SSE event source to the Zustand store.
 * Call once on app mount. Returns a cleanup function.
 *
 * The bridge:
 * 1. Subscribes to typed SSE events and routes them to store handlers
 * 2. Handles connection/disconnection state
 * 3. Falls back to polling when SSE is unavailable
 * 4. Runs a daemon health monitor that auto-reconnects SSE when daemon
 *    comes back online after being down
 */
export function bridgeAxonSSEToStore(): () => void {
  // Prevent double-wiring
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }

  const eventSource = getAxonEventSource();

  /** Reconnect SSE and refresh stale data */
  const reconnectSSE = () => {
    // Disconnect any stale SSE before reconnecting
    eventSource.disconnect();
    eventSource.connect();
    const s = useAxonStore.getState();
    s.fetchAgents();
    s.fetchIssues();
    s.checkHealth();
  };

  // Register the callback so the daemon monitor can trigger SSE reconnection
  useAxonStore.setState({ _onDaemonBackOnline: reconnectSSE });

  // --- Connection state ---
  const offConnection = eventSource.on<{ connected: boolean }>(
    'connection',
    (data) => {
      const connected = !!data.connected;
      useAxonStore.getState().setConnected(connected);

      if (connected) {
        // On reconnect, refresh stale data
        const s = useAxonStore.getState();
        s.fetchAgents();
        s.fetchIssues();
        s.checkHealth();
      }
    },
  );

  // --- Agent status changes ---
  const offAgentStatus = eventSource.on('agent_status', (data) => {
    useAxonStore.getState().handleAgentStatus(data);
  });

  // --- Heartbeat logs ---
  const offHeartbeat = eventSource.on('heartbeat_log', (data) => {
    useAxonStore.getState().handleHeartbeatLog(data);
  });

  // --- Issue updates ---
  const offIssueUpdate = eventSource.on('issue_update', (data) => {
    useAxonStore.getState().handleIssueUpdate(data);
    // Debounce full issue list refresh — SSE bursts can fire many events
    if (_issueFetchTimer) clearTimeout(_issueFetchTimer);
    _issueFetchTimer = setTimeout(() => {
      _issueFetchTimer = null;
      useAxonStore.getState().fetchIssues();
    }, ISSUE_FETCH_DEBOUNCE_MS);
  });

  // --- Activity feed ---
  const offActivity = eventSource.on('activity', (data) => {
    useAxonStore.getState().handleActivity(data);
  });

  // --- Start connection ---
  eventSource.connect();

  // Do an initial data fetch (always use fresh getState)
  const s = useAxonStore.getState();
  s.checkHealth();
  s.fetchAgents();
  s.fetchIssues();
  s.fetchActivity(50);

  // --- Start daemon health monitor ---
  // This runs independently of SSE and handles auto-reconnection
  useAxonStore.getState()._startDaemonMonitor();

  // --- Cleanup ---
  const cleanup = () => {
    offConnection();
    offAgentStatus();
    offHeartbeat();
    offIssueUpdate();
    offActivity();
    eventSource.disconnect();
    if (_issueFetchTimer) {
      clearTimeout(_issueFetchTimer);
      _issueFetchTimer = null;
    }
    useAxonStore.getState()._stopPolling();
    useAxonStore.getState()._stopDaemonMonitor();
    useAxonStore.setState({ _onDaemonBackOnline: null });
  };

  _cleanup = cleanup;
  return cleanup;
}

/**
 * Disconnect the bridge. Safe to call multiple times.
 */
export function disconnectAxonBridge(): void {
  if (_cleanup) {
    _cleanup();
    _cleanup = null;
  }
}
