// ============================================================================
// PhantomX — Notification Service
// Console, webhook (Slack/Discord), and store-based notifications
// ============================================================================

import type {
  AppNotification, NotificationConfig, NotificationType,
  NotificationSeverity, NotificationChannel,
} from '@/types/trading';

type NotificationEventCallback = (notification: AppNotification) => void;

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export class NotificationService {
  private config: NotificationConfig;
  private notifications: AppNotification[] = [];
  private listeners: Set<NotificationEventCallback> = new Set();
  private maxStoredNotifications = 500;

  constructor(config?: Partial<NotificationConfig>) {
    this.config = {
      channels: config?.channels ?? ['console', 'store'],
      webhookUrl: config?.webhookUrl,
      minSeverity: config?.minSeverity ?? 'info',
      muteUntil: config?.muteUntil,
    };
  }

  // --- Send Notification ---

  async notify(
    type: NotificationType,
    severity: NotificationSeverity,
    title: string,
    message: string,
    opts?: {
      strategyId?: string;
      symbol?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    // Check mute
    if (this.config.muteUntil && Date.now() < this.config.muteUntil) return;

    // Check minimum severity
    if (SEVERITY_ORDER[severity] < SEVERITY_ORDER[this.config.minSeverity]) return;

    const notification: AppNotification = {
      id: crypto.randomUUID(),
      type,
      severity,
      title,
      message,
      timestamp: Date.now(),
      strategyId: opts?.strategyId,
      symbol: opts?.symbol,
      read: false,
      metadata: opts?.metadata,
    };

    // Route to channels
    for (const channel of this.config.channels) {
      switch (channel) {
        case 'console':
          this.sendConsole(notification);
          break;
        case 'webhook':
          if (this.config.webhookUrl) {
            this.sendWebhook(notification, this.config.webhookUrl);
          }
          break;
        case 'store':
          this.storeNotification(notification);
          break;
      }
    }

    // Notify listeners
    this.listeners.forEach(cb => {
      try { cb(notification); } catch { /* listener error */ }
    });
  }

  // --- Console ---

  private sendConsole(n: AppNotification): void {
    const prefix = n.severity === 'critical' ? '🚨' : n.severity === 'warning' ? '⚠️' : 'ℹ️';
    const label = `[PhantomX ${n.type}]`;
    console.log(`${prefix} ${label} ${n.title}: ${n.message}`);
  }

  // --- Webhook (Slack/Discord compatible) ---

  private async sendWebhook(n: AppNotification, url: string): Promise<void> {
    const color = n.severity === 'critical' ? '#dc3545'
      : n.severity === 'warning' ? '#ffc107'
      : '#00d26a';

    // Slack-compatible payload
    const payload = {
      text: `*${n.title}*`,
      attachments: [{
        color,
        fields: [
          { title: 'Type', value: n.type, short: true },
          { title: 'Severity', value: n.severity.toUpperCase(), short: true },
          { title: 'Details', value: n.message, short: false },
          ...(n.symbol ? [{ title: 'Symbol', value: n.symbol, short: true }] : []),
          ...(n.strategyId ? [{ title: 'Strategy', value: n.strategyId, short: true }] : []),
        ],
        ts: Math.floor(n.timestamp / 1000),
      }],
    };

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('[NotificationService] Webhook failed:', err);
    }
  }

  // --- Store ---

  private storeNotification(n: AppNotification): void {
    this.notifications.push(n);

    // Trim old notifications
    if (this.notifications.length > this.maxStoredNotifications) {
      this.notifications = this.notifications.slice(-this.maxStoredNotifications);
    }
  }

  // --- Convenience Methods ---

  async tradeExecuted(
    symbol: string,
    side: string,
    price: number,
    pnl?: number,
    strategyId?: string,
  ): Promise<void> {
    const pnlStr = pnl !== undefined ? ` | PnL: $${pnl.toFixed(2)}` : '';
    await this.notify(
      'trade_executed', 'info',
      `Trade: ${side.toUpperCase()} ${symbol}`,
      `${side.toUpperCase()} @ $${price.toFixed(2)}${pnlStr}`,
      { symbol, strategyId },
    );
  }

  async killSwitch(reason: string, equity: number, strategyId?: string): Promise<void> {
    await this.notify(
      'kill_switch', 'critical',
      'KILL SWITCH TRIGGERED',
      `${reason} | Equity: $${equity.toFixed(2)}`,
      { strategyId },
    );
  }

  async drawdownAlert(drawdownPercent: number, limit: number, strategyId?: string): Promise<void> {
    await this.notify(
      'drawdown_alert', drawdownPercent >= limit * 0.8 ? 'critical' : 'warning',
      'Drawdown Alert',
      `Current drawdown: ${drawdownPercent.toFixed(1)}% (limit: ${limit}%)`,
      { strategyId },
    );
  }

  async regimeChange(symbol: string, from: string, to: string): Promise<void> {
    await this.notify(
      'regime_change', 'warning',
      'Market Regime Changed',
      `${symbol}: ${from} → ${to}`,
      { symbol },
    );
  }

  async supervisorIntervention(
    action: string,
    reasoning: string,
    strategyId?: string,
  ): Promise<void> {
    await this.notify(
      'supervisor_intervention', 'warning',
      `Supervisor: ${action}`,
      reasoning,
      { strategyId },
    );
  }

  async error(message: string, strategyId?: string): Promise<void> {
    await this.notify(
      'error', 'critical',
      'Error',
      message,
      { strategyId },
    );
  }

  // --- Query ---

  getAll(): AppNotification[] { return [...this.notifications]; }
  getUnread(): AppNotification[] { return this.notifications.filter(n => !n.read); }
  getByType(type: NotificationType): AppNotification[] {
    return this.notifications.filter(n => n.type === type);
  }
  getBySeverity(severity: NotificationSeverity): AppNotification[] {
    return this.notifications.filter(n => n.severity === severity);
  }

  markRead(id: string): void {
    const n = this.notifications.find(n => n.id === id);
    if (n) n.read = true;
  }

  markAllRead(): void {
    this.notifications.forEach(n => n.read = true);
  }

  clear(): void {
    this.notifications = [];
  }

  // --- Config ---

  updateConfig(update: Partial<NotificationConfig>): void {
    Object.assign(this.config, update);
  }

  mute(durationMs: number): void {
    this.config.muteUntil = Date.now() + durationMs;
  }

  unmute(): void {
    this.config.muteUntil = undefined;
  }

  // --- Events ---

  onNotification(callback: NotificationEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
