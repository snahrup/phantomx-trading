---
id: funding-rate-standard-v1
title: "Funding Rate Terminology Standard"
category: standards
tags: ["funding-rate", "disambiguation", "frc", "data-integrity", "autonomous-blocker"]
source: head-of-trading
created: 2026-03-08T15:00:00Z
---

# Funding Rate Terminology Standard v1

**Purpose**: Eliminate the predicted vs settled funding rate confusion that caused the NEAR FRC data conflict on March 8, 2026. This is autonomous mode blocker #6.

## The Problem

On March 8, 2026, two agents reported contradictory NEAR funding data:

| Agent | Reported | Reality |
|-------|----------|---------|
| Strategy Architect | "NEAR funding -41% ann, JUST FLIPPED negative" | This was the **predicted** next rate |
| Head of Trading | "ALL 6 settled rates POSITIVE (+11% ann)" | This was the **settled** historical rates |

Both were factually correct. The confusion was that "funding rate" was used without specifying which type. In autonomous mode, this could cause a false FRC entry.

## Definitions — MANDATORY for All Agents

### Predicted Funding Rate

- **What it is**: The estimated rate for the NEXT funding settlement
- **Source**: `fetchFundingRate()` → `fundingRate` field
- **API**: POST /api/phemex `{action: "funding_rate", symbol: "..."}`
- **Updates**: Continuously. Changes every block/second based on mark-index price delta
- **Use case**: Directional indicator — shows what the market EXPECTS to pay
- **Pipeline authority**: INFORMATIONAL ONLY. Never triggers entries.
- **Label**: Always write `predicted funding rate` or `next funding rate`

### Settled (Last) Funding Rate

- **What it is**: The actual funding payment that was executed at the last settlement
- **Source**: `fetchFundingRateHistory()` → most recent entry
- **API**: POST /api/phemex `{action: "funding_rate_history", symbol: "...", limit: 10}`
- **Updates**: Every 8 hours (Phemex: 00:00, 08:00, 16:00 UTC)
- **Use case**: Confirms actual payments. Required for FRC gating.
- **Pipeline authority**: AUTHORITATIVE. FRC entries require 3 consecutive settled negatives.
- **Label**: Always write `settled funding rate` or `last funding rate`

### Annualized Funding Rate

- **Formula**: `rate_per_8h * 3 * 365 * 100` (for percentage)
- **Always specify which rate was annualized**: "settled -39% ann" vs "predicted -39% ann"
- **These can diverge significantly**: Predicted may be -39% ann while settled is +11% ann

## Agent Reporting Rules

### In Scan Outputs / Heartbeats

```
CORRECT:
  NEAR funding: predicted -0.036%/8h (-39% ann), settled +0.010%/8h (+11% ann, 10/10 positive)

WRONG:
  NEAR funding: -0.036%/8h (-39% ann)          ← which type?
  NEAR funding: -41% ann, just flipped negative  ← misleading, this is predicted not settled
```

### In Signal Schema

The signal-schema.json `fundingRate` object requires:
```json
{
  "fundingRate": {
    "value": -0.00036,
    "type": "settled",
    "annualized": -39.4,
    "consecutiveNegativeSettled": 3
  }
}
```

The `type` field is REQUIRED. Signals with `type: "predicted"` are informational. Only `type: "settled"` counts for FRC gating.

### In Strategy Playbook

When documenting FRC status for any pair, ALWAYS include BOTH rates:

```
| Pair | Predicted/8h | Predicted Ann | Settled/8h | Settled Ann | Consecutive Neg | FRC Gate |
|------|-------------|--------------|-----------|------------|-----------------|----------|
| NEAR | -0.036%     | -39%         | +0.010%   | +11%       | 0/3             | BLOCKED  |
```

## FRC v1.0 Gating — Definitive Rules

1. **Gate 1 — Price**: `close > EMA(55)` on 4H chart
2. **Gate 2 — Settled funding**: Last 3 consecutive SETTLED rates must be negative
3. **Gate 3 — Magnitude**: Annualized settled rate < -5% (meaningful carry)
4. **Gate 4 — RSI**: RSI(14) < 65 (not overbought)

**Gate 2 uses SETTLED rates ONLY.** A predicted rate of -100% ann does not satisfy this gate. The market can predict extreme rates that never settle.

## How to Check Settled Rates

```bash
# Via PhantomX API
curl -s http://localhost:3100/api/phemex -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":"funding_rate_history","symbol":"NEAR/USDT:USDT","limit":10}'

# Returns array of historical settlements with timestamps
# Count consecutive negatives from most recent backward
```

## Validation Checklist (for Pipeline Coordinator)

Before approving any FRC signal:
- [ ] Signal's `fundingRate.type` is `"settled"` (not `"predicted"`)
- [ ] `consecutiveNegativeSettled` >= 3
- [ ] Verified by checking `funding_rate_history` API, not just agent report
- [ ] Price gate (close > EMA55) confirmed on the SAME candle
- [ ] RSI gate confirmed

## References

- Signal schema: `knowledge/signal-schema.json` (fundingRate object definition)
- FRC strategy: `knowledge/strategies/funding-rate-carry-v1.md`
- Active playbook: `knowledge/strategies/active-strategy-playbook.md`
- NEAR conflict: `knowledge/meta-strategy/11-heartbeat-9-system-assessment.md` §3
