'use client';

// ============================================================================
// PhantomX — Trade Recommendation Card (Trading Page version)
// ============================================================================
// Full-page trade recommendation card with editable parameters and 2-step
// confirmation flow. Used by TradeRecommendationList on the /trading page.
// The sidebar version lives at components/axon/TradeRecommendationCard.tsx —
// it has a simpler interface with external state management via the store.
// ============================================================================

import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowUpRight,
  ArrowDownRight,
  Check,
  X,
  Pencil,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import type { TradeRecommendation } from '@/lib/axon/recommendation-parser';

// ---------------------------------------------------------------------------
// Auth header for the execute-recommendation API route
// ---------------------------------------------------------------------------

const EXECUTION_AUTH_HEADERS: HeadersInit = (() => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.NEXT_PUBLIC_PHANTOMX_EXECUTION_SECRET;
  if (secret) headers['X-PhantomX-Auth'] = secret;
  return headers;
})();

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TradeRecommendationCardProps {
  recommendation: TradeRecommendation;
  onExecuted?: (orderId: string) => void;
  onRejected?: () => void;
  isNew?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pctFromEntry(entry: number, price: number): string {
  if (!entry) return '';
  const pct = ((price - entry) / entry) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type CardState = 'idle' | 'editing' | 'confirming' | 'executing' | 'success' | 'error' | 'rejected';

export default function TradeRecommendationCard({
  recommendation: rec,
  onExecuted,
  onRejected,
  isNew = false,
}: TradeRecommendationCardProps) {
  const [state, setState] = useState<CardState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Editable fields
  const [editEntry, setEditEntry] = useState(rec.entryPrice);
  const [editStop, setEditStop] = useState(rec.stopLoss);
  const [editTargets, setEditTargets] = useState(rec.takeProfitTargets);
  const [editSize, setEditSize] = useState(rec.positionSizeNotional);
  const [editLeverage, setEditLeverage] = useState(rec.leverage);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const executingRef = useRef(false); // double-click guard

  const isLong = rec.direction === 'LONG';
  const dirColor = isLong ? 'text-claude-green' : 'text-destructive';
  const dirBg = isLong ? 'bg-claude-green/10' : 'bg-destructive/10';
  const dirBorder = isLong ? 'border-claude-green/30' : 'border-destructive/30';

  // Validate edited parameters — returns list of error strings (empty = valid)
  const validateEdits = useCallback((): string[] => {
    const errs: string[] = [];
    if (editEntry <= 0) errs.push('Entry price must be greater than 0');
    if (editStop <= 0) errs.push('Stop loss must be greater than 0');
    if (editLeverage < 1 || editLeverage > 100) errs.push('Leverage must be between 1 and 100');
    if (editSize <= 0) errs.push('Position size must be greater than 0');
    return errs;
  }, [editEntry, editStop, editLeverage, editSize]);

  // Build the recommendation payload (with edits if applicable)
  const buildPayload = useCallback((): TradeRecommendation => {
    if (state !== 'editing' && state !== 'confirming') return rec;

    // Recalculate R:R from edited entry/stop/first TP
    let riskRewardRatio = rec.riskRewardRatio;
    if (editTargets.length > 0) {
      const risk = Math.abs(editEntry - editStop);
      const reward = Math.abs(editTargets[0].price - editEntry);
      riskRewardRatio = risk > 0 ? Math.round((reward / risk) * 10) / 10 : 0;
    }

    return {
      ...rec,
      entryPrice: editEntry,
      stopLoss: editStop,
      takeProfitTargets: editTargets,
      positionSizeNotional: editSize,
      positionSizeMargin: editLeverage > 1 ? editSize / editLeverage : editSize,
      leverage: editLeverage,
      riskRewardRatio,
    };
  }, [state, rec, editEntry, editStop, editTargets, editSize, editLeverage]);

  // Step 1: Show confirmation — user must click again to actually execute
  const handleRequestExecute = useCallback(() => {
    if (state === 'editing') {
      const errs = validateEdits();
      if (errs.length > 0) {
        setValidationErrors(errs);
        return;
      }
      setValidationErrors([]);
    }
    setState('confirming');
  }, [state, validateEdits]);

  // Step 2: Actually execute (guarded against double-click)
  const handleConfirmExecute = useCallback(async () => {
    if (executingRef.current) return; // synchronous guard
    executingRef.current = true;
    setState('executing');
    setError(null);

    try {
      const res = await fetch('/api/execute-recommendation', {
        method: 'POST',
        headers: EXECUTION_AUTH_HEADERS,
        body: JSON.stringify({
          recommendation: buildPayload(),
          action: 'execute',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setState('error');
        setError(data.error || 'Execution failed');
        return;
      }

      setState('success');
      setOrderId(data.orderId);
      onExecuted?.(data.orderId);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      executingRef.current = false;
    }
  }, [buildPayload, onExecuted]);

  // Reject
  const handleReject = useCallback(async () => {
    setState('executing');
    setError(null);

    try {
      await fetch('/api/execute-recommendation', {
        method: 'POST',
        headers: EXECUTION_AUTH_HEADERS,
        body: JSON.stringify({
          recommendation: rec,
          action: 'reject',
          reason: 'Rejected by trader',
        }),
      });

      setState('rejected');
      onRejected?.();
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [rec, onRejected]);

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (state === 'success') {
    return (
      <Card className={`glass-card border-0 py-0 gap-0 ${dirBorder} border animate-in fade-in duration-300`}>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 text-claude-green">
            <CheckCircle2 className="size-6" />
            <div>
              <p className="font-semibold text-sm">Order Placed Successfully</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rec.symbol} {rec.direction} — Order ID: {orderId}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state === 'rejected') {
    return (
      <Card className="glass-card border-0 py-0 gap-0 border-border/50 opacity-60">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 text-muted-foreground">
            <XCircle className="size-6" />
            <div>
              <p className="font-semibold text-sm">Recommendation Rejected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {rec.symbol} {rec.direction} — Issue updated in Axon
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Main card
  // -------------------------------------------------------------------------

  return (
    <Card
      className={`glass-card border-0 py-0 gap-0 ${dirBorder} border transition-all duration-300 ${
        isNew ? 'animate-in slide-in-from-top-3 fade-in duration-500 ring-1 ring-primary/20' : ''
      }`}
    >
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Trade Recommendation
            </span>
            {isNew && (
              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] px-1.5 py-0">
                NEW
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] ${
              rec.confidence === 'HIGH'
                ? 'border-claude-green/40 text-claude-green'
                : rec.confidence === 'MEDIUM'
                  ? 'border-yellow-500/40 text-yellow-500'
                  : 'border-muted-foreground/40 text-muted-foreground'
            }`}
          >
            {rec.confidence}
          </Badge>
        </div>

        {/* Symbol & Direction */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${dirBg}`}>
              {isLong ? (
                <ArrowUpRight className={`size-5 ${dirColor}`} />
              ) : (
                <ArrowDownRight className={`size-5 ${dirColor}`} />
              )}
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">{rec.symbol}</span>
              <span className={`ml-2 text-lg font-bold ${dirColor}`}>{rec.direction}</span>
            </div>
          </div>
        </div>

        {/* Trade Parameters */}
        <div className="px-5 pb-3 space-y-1.5">
          {state === 'editing' ? (
            <EditableParams
              entry={editEntry}
              stop={editStop}
              targets={editTargets}
              size={editSize}
              leverage={editLeverage}
              onEntryChange={setEditEntry}
              onStopChange={setEditStop}
              onTargetsChange={setEditTargets}
              onSizeChange={setEditSize}
              onLeverageChange={setEditLeverage}
            />
          ) : (
            <>
              <ParamRow
                label="Entry"
                value={`${formatPrice(rec.entryPrice)} (limit)`}
              />
              <ParamRow
                label="Stop"
                value={`${formatPrice(rec.stopLoss)}`}
                suffix={pctFromEntry(rec.entryPrice, rec.stopLoss)}
                suffixClass="text-destructive"
              />
              {rec.takeProfitTargets.map((tp, i) => (
                <ParamRow
                  key={i}
                  label={`TP${i + 1}`}
                  value={`${formatPrice(tp.price)}`}
                  suffix={`${pctFromEntry(rec.entryPrice, tp.price)} → ${tp.closePercent}%`}
                  suffixClass="text-claude-green"
                />
              ))}
              <ParamRow
                label="Size"
                value={`$${rec.positionSizeNotional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                suffix={rec.positionSizeMargin ? `($${rec.positionSizeMargin.toFixed(2)} margin)` : undefined}
                suffixClass="text-muted-foreground"
              />
              {rec.leverage > 1 && (
                <ParamRow label="Leverage" value={`${rec.leverage}x`} />
              )}
              {rec.riskRewardRatio > 0 && (
                <ParamRow label="R:R" value={`${rec.riskRewardRatio}:1`} />
              )}
              <ParamRow label="Strategy" value={rec.strategy} />
            </>
          )}
        </div>

        {/* Approval Chain */}
        {rec.approvedBy.length > 0 && (
          <div className="px-5 pb-3 flex flex-wrap items-center gap-2">
            {rec.approvedBy.map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-[11px] text-claude-green"
              >
                <ShieldCheck className="size-3.5" />
                <span>{name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            {validationErrors.map((err, i) => (
              <p key={i} className="text-xs text-amber-500">{err}</p>
            ))}
          </div>
        )}

        {/* Error Banner */}
        {state === 'error' && error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 pb-4 flex flex-col gap-2">
          {state === 'executing' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Placing order...</span>
            </div>
          ) : state === 'confirming' ? (
            /* Confirmation step — user must explicitly confirm the real-money order */
            <div className="space-y-2">
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-xs font-semibold text-amber-500 mb-1">Confirm Live Order</p>
                <p className="text-[11px] text-muted-foreground">
                  You are about to place a <span className="font-semibold text-foreground">{rec.symbol} {rec.direction}</span> market
                  order for <span className="font-semibold text-foreground">${(state === 'confirming' ? editSize : rec.positionSizeNotional).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span> at{' '}
                  <span className="font-semibold text-foreground">{(state === 'confirming' ? editLeverage : rec.leverage)}x leverage</span>.
                  This will use real funds.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleConfirmExecute}
                  size="sm"
                  className={`flex-1 ${isLong ? 'bg-claude-green hover:bg-claude-green/90' : 'bg-destructive hover:bg-destructive/90'} text-white`}
                >
                  <Check className="size-3.5 mr-1" />
                  Confirm — Place Order
                </Button>
                <Button
                  onClick={() => setState('idle')}
                  variant="outline"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRequestExecute}
                size="sm"
                className={`flex-1 ${isLong ? 'bg-claude-green hover:bg-claude-green/90' : 'bg-destructive hover:bg-destructive/90'} text-white`}
              >
                <Check className="size-3.5 mr-1" />
                {state === 'editing' ? 'Execute Edited' : 'Approve & Execute'}
              </Button>

              <Button
                onClick={handleReject}
                variant="outline"
                size="sm"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <X className="size-3.5 mr-1" />
                Reject
              </Button>

              <Button
                onClick={() => { setValidationErrors([]); setState(state === 'editing' ? 'idle' : 'editing'); }}
                variant="outline"
                size="sm"
              >
                <Pencil className="size-3.5 mr-1" />
                {state === 'editing' ? 'Cancel' : 'Edit'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ParamRow({
  label,
  value,
  suffix,
  suffixClass = '',
}: {
  label: string;
  value: string;
  suffix?: string;
  suffixClass?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground text-xs w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-2 font-mono text-foreground">
        <span>{value}</span>
        {suffix && <span className={`text-xs ${suffixClass}`}>{suffix}</span>}
      </div>
    </div>
  );
}

function EditableParams({
  entry,
  stop,
  targets,
  size,
  leverage,
  onEntryChange,
  onStopChange,
  onTargetsChange,
  onSizeChange,
  onLeverageChange,
}: {
  entry: number;
  stop: number;
  targets: { price: number; closePercent: number }[];
  size: number;
  leverage: number;
  onEntryChange: (v: number) => void;
  onStopChange: (v: number) => void;
  onTargetsChange: (v: { price: number; closePercent: number }[]) => void;
  onSizeChange: (v: number) => void;
  onLeverageChange: (v: number) => void;
}) {
  const inputClass =
    'w-28 bg-muted border border-border rounded px-2 py-0.5 text-xs text-foreground font-mono focus:outline-none focus:border-ring text-right';

  return (
    <div className="space-y-1.5">
      <EditRow label="Entry">
        <input
          type="number"
          value={entry}
          onChange={(e) => onEntryChange(Number(e.target.value))}
          className={inputClass}
          step="any"
        />
      </EditRow>
      <EditRow label="Stop">
        <input
          type="number"
          value={stop}
          onChange={(e) => onStopChange(Number(e.target.value))}
          className={inputClass}
          step="any"
        />
      </EditRow>
      {targets.map((tp, i) => (
        <EditRow key={i} label={`TP${i + 1}`}>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={tp.price}
              onChange={(e) => {
                const updated = [...targets];
                updated[i] = { ...updated[i], price: Number(e.target.value) };
                onTargetsChange(updated);
              }}
              className={inputClass}
              step="any"
            />
            <span className="text-xs text-muted-foreground">/</span>
            <input
              type="number"
              value={tp.closePercent}
              onChange={(e) => {
                const updated = [...targets];
                updated[i] = { ...updated[i], closePercent: Number(e.target.value) };
                onTargetsChange(updated);
              }}
              className="w-14 bg-muted border border-border rounded px-2 py-0.5 text-xs text-foreground font-mono focus:outline-none focus:border-ring text-right"
              step="1"
              min="0"
              max="100"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </EditRow>
      ))}
      <EditRow label="Size ($)">
        <input
          type="number"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          className={inputClass}
          step="any"
          min="0"
        />
      </EditRow>
      <EditRow label="Leverage">
        <input
          type="number"
          value={leverage}
          onChange={(e) => onLeverageChange(Number(e.target.value))}
          className="w-16 bg-muted border border-border rounded px-2 py-0.5 text-xs text-foreground font-mono focus:outline-none focus:border-ring text-right"
          step="1"
          min="1"
          max="200"
        />
      </EditRow>
    </div>
  );
}

function EditRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground text-xs w-16 shrink-0">{label}</span>
      {children}
    </div>
  );
}
