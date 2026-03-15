// ============================================================================
// PhantomX — Axon Integration Module
// ============================================================================

// Types
export type {
  AxonAgent,
  AxonAgentStatus,
  AxonAgentPersona,
  AxonIssue,
  AxonIssueStatus,
  AxonIssueType,
  AxonPriority,
  AxonIssueComment,
  AxonCommentType,
  AxonHeartbeatRun,
  AxonActivity,
  AxonChatMessage,
  AxonCostEntry,
  AxonHealthResponse,
  AxonCompanyStatus,
  AxonSSEEvent,
  AxonSSEEventType,
  AxonTradingPipeline,
  ConciergeStreamEvent,
  AxonApiError,
  AxonResult,
} from './types';

// Client
export {
  AxonClient,
  PHANTOM_COMPANY_ID,
  getAxonClient,
  resetAxonClient,
} from './client';

// Recommendation Parser
export { parseRecommendation } from './recommendation-parser';
export type { TradeRecommendation, TakeProfitTarget } from './recommendation-parser';

// SSE Event Source
export {
  AxonEventSource,
  getAxonEventSource,
} from './event-source';
export type { AxonEventHandler, AxonTypedHandler } from './event-source';

// SSE → Store Bridge
export { bridgeAxonSSEToStore, disconnectAxonBridge } from './store-bridge';
