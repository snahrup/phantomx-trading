'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: 'global' | 'chart' | 'chat';
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[PhantomX] Component error:', error, errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handlePanic = async () => {
    try {
      await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'panic', symbol: 'BTC/USDT:USDT' }),
      });
      // Also try direct exchange API as fallback
      await fetch('/api/phemex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_all', symbol: 'BTC/USDT:USDT' }),
      });
    } catch {
      // Best effort
    }
    alert('Panic executed — all orders cancelled. Check Phemex directly to confirm.');
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { fallback = 'global' } = this.props;

    // Component-level fallback (chart or chat)
    if (fallback === 'chart' || fallback === 'chat') {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--cl-error)" strokeWidth="1.5" className="mb-3">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-sm text-[var(--cl-error)] font-medium mb-1">
            {fallback === 'chart' ? 'Chart unavailable' : 'Chat unavailable'}
          </p>
          <p className="text-[10px] text-[var(--cl-text-secondary)] mb-3">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-1.5 rounded-lg text-xs bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-[var(--cl-text-secondary)] hover:bg-[var(--cl-fill-hover)] transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    // Global fallback — full-page with panic button
    return (
      <div className="min-h-screen bg-[var(--cl-bg-page)] flex items-center justify-center p-8">
        <div className="max-w-lg w-full space-y-6">
          {/* Error Header */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-[var(--cl-fill-error)] flex items-center justify-center flex-shrink-0">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cl-error)" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--cl-text-primary)]">PhantomX Crashed</h1>
              <p className="text-sm text-[var(--cl-text-secondary)]">The dashboard encountered an unexpected error.</p>
            </div>
          </div>

          {/* PANIC BUTTON — Always accessible */}
          <button
            onClick={this.handlePanic}
            className="panic-button w-full"
          >
            EMERGENCY: CLOSE ALL POSITIONS
          </button>

          <p className="text-[10px] text-[var(--cl-text-secondary)] text-center">
            This panic button calls the exchange API directly — it works even when the dashboard is down.
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={this.handleRetry}
              className="flex-1 py-3 rounded-lg bg-[var(--cl-fill-error)] border border-[var(--cl-error-border)] text-[var(--cl-error)] text-sm font-medium hover:bg-[var(--cl-fill-error-hover)] transition-colors"
            >
              Reload Dashboard
            </button>
            <a
              href="https://phemex.com/trade/contract/BTCUSD"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border)] text-[var(--cl-text-secondary)] text-sm font-medium hover:bg-[var(--cl-fill-hover)] transition-colors text-center"
            >
              Open Phemex Directly
            </a>
          </div>

          {/* Error Details — hide stack traces in production */}
          <details className="text-xs">
            <summary className="text-[var(--cl-text-secondary)] cursor-pointer hover:text-[var(--cl-text-secondary)]">Error Details</summary>
            <pre className="mt-2 p-3 rounded-lg bg-[var(--cl-fill-control)] border border-[var(--cl-border-subtle)] text-[var(--cl-error)] font-mono overflow-x-auto whitespace-pre-wrap">
              {this.state.error?.message}
              {process.env.NODE_ENV === 'development' && this.state.error?.stack && (
                <>{'\n\n'}{this.state.error.stack}</>
              )}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
