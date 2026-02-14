// ============================================================================
// PhantomX — Base Agent (Abstract Class for All Sub-Agents)
// ============================================================================
// All sub-agents (Sentinel, Macro, News, Technical) extend this class.
// Provides: interval-based tick loop, signal publishing, event emission,
// status tracking, and graceful start/stop lifecycle.
// ============================================================================

import type { AgentId, AgentSignal, AgentStatus, AgentEvent, AgentRunState } from '@/types/trading';
import { getSignalBus } from './signal-bus';

export abstract class BaseAgent {
  abstract readonly id: AgentId;
  abstract readonly name: string;
  abstract readonly defaultIntervalMs: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private _state: AgentRunState = 'idle';
  private _tickCount = 0;
  private _lastTick: number | null = null;
  private _lastError: string | null = null;
  private _latestSignal: AgentSignal | null = null;
  private _intervalMs: number = 0;
  private _signalTtlMs: number = 600_000; // 10 minutes default
  private eventCallbacks: Array<(event: AgentEvent) => void> = [];

  /** Subclass implements: fetch data, compute signal, publish. */
  protected abstract tick(): Promise<void>;

  async start(intervalMs?: number, signalTtlMs?: number): Promise<void> {
    if (this._state === 'running') return;

    this._intervalMs = intervalMs ?? this.defaultIntervalMs;
    if (signalTtlMs) this._signalTtlMs = signalTtlMs;
    this._state = 'running';
    this._tickCount = 0;
    this._lastError = null;

    this.emit({
      type: 'agent_started',
      agentId: this.id,
      data: { intervalMs: this._intervalMs },
      timestamp: Date.now(),
    });

    // First tick immediately
    await this.runTick();

    // Then on interval
    this.timer = setInterval(() => this.runTick(), this._intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._state = 'stopped';

    this.emit({
      type: 'agent_stopped',
      agentId: this.id,
      data: { tickCount: this._tickCount },
      timestamp: Date.now(),
    });
  }

  isActive(): boolean {
    return this._state === 'running';
  }

  getStatus(): AgentStatus {
    return {
      id: this.id,
      name: this.name,
      state: this._state,
      intervalMs: this._intervalMs || this.defaultIntervalMs,
      lastTick: this._lastTick,
      lastError: this._lastError,
      tickCount: this._tickCount,
      latestSignal: this._latestSignal,
    };
  }

  onEvent(callback: (event: AgentEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  /** Publish a signal to the shared SignalBus. */
  protected publish(signal: Omit<AgentSignal, 'agentId' | 'agentName' | 'timestamp' | 'expiresAt'>): void {
    const full: AgentSignal = {
      ...signal,
      agentId: this.id,
      agentName: this.name,
      timestamp: Date.now(),
      expiresAt: Date.now() + this._signalTtlMs,
    };
    getSignalBus().publish(full);
    this._latestSignal = full;

    this.emit({
      type: 'agent_signal',
      agentId: this.id,
      data: { signal: full },
      timestamp: Date.now(),
    });
  }

  /** Emit an event (routed to SSE via orchestrator). */
  protected emit(event: AgentEvent): void {
    for (const cb of this.eventCallbacks) {
      try { cb(event); } catch { /* swallow */ }
    }
  }

  private async runTick(): Promise<void> {
    if (this._state !== 'running') return;

    this._tickCount++;
    this._lastTick = Date.now();

    this.emit({
      type: 'agent_tick',
      agentId: this.id,
      data: { tick: this._tickCount },
      timestamp: Date.now(),
    });

    try {
      await this.tick();
      this._lastError = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._lastError = message;
      this._state = 'error';
      console.error(`[${this.name}] Tick error:`, message);

      this.emit({
        type: 'agent_error',
        agentId: this.id,
        data: { error: message, tick: this._tickCount },
        timestamp: Date.now(),
      });

      // Auto-recover: go back to running state after error
      // The next interval tick will retry
      this._state = 'running';
    }
  }
}
