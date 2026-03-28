#!/usr/bin/env python3
"""
EMA Ribbon v2.0 — Signal Exit Parameter Sensitivity Analysis

The backtest showed 1.36:1 R:R vs the 2:1 target. Hypothesis: the signal_exit rule
(EMA8 crosses EMA21 against position) is triggering prematurely, closing trades
before they reach 2R. This script tests 4 variants:

1. BASELINE: Current behavior (signal exit closes at market immediately)
2. TIGHTEN_ONLY: Signal exit tightens stop to breakeven instead of closing
3. MIN_R_THRESHOLD: Only signal exit if position is at < 0.5R profit
4. NO_SIGNAL_EXIT: Rely entirely on stop/TP/time exit
"""

import json
import math
import urllib.request
from datetime import datetime
from dataclasses import dataclass, field

LEVERAGE = 50
FEE_RATE = 0.0006

def fetch_ohlcv(symbol="BTC/USDT:USDT", timeframe="4h", limit=500):
    url = "http://localhost:3100/api/phemex"
    payload = json.dumps({"action": "ohlcv", "symbol": symbol, "timeframe": timeframe, "limit": limit}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["ohlcv"]

def compute_ema(closes, period):
    if len(closes) < period:
        return [float('nan')] * len(closes)
    k = 2.0 / (period + 1)
    ema = [float('nan')] * (period - 1)
    sma = sum(closes[:period]) / period
    ema.append(sma)
    for i in range(period, len(closes)):
        ema.append(closes[i] * k + ema[-1] * (1 - k))
    return ema

def compute_rsi(closes, period=14):
    if len(closes) < period + 1:
        return [float('nan')] * len(closes)
    rsi = [float('nan')] * period
    gains, losses = [], []
    for i in range(1, period + 1):
        change = closes[i] - closes[i-1]
        gains.append(max(0, change))
        losses.append(max(0, -change))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        rsi.append(100.0)
    else:
        rsi.append(100.0 - (100.0 / (1.0 + avg_gain / avg_loss)))
    for i in range(period + 1, len(closes)):
        change = closes[i] - closes[i-1]
        avg_gain = (avg_gain * (period - 1) + max(0, change)) / period
        avg_loss = (avg_loss * (period - 1) + max(0, -change)) / period
        if avg_loss == 0:
            rsi.append(100.0)
        else:
            rsi.append(100.0 - (100.0 / (1.0 + avg_gain / avg_loss)))
    return rsi

def size_position(equity, risk_pct, stop_dist, max_notional_pct=1.0):
    if stop_dist <= 0 or equity <= 50:
        return 0, 0
    risk_amount = equity * risk_pct
    notional = risk_amount / stop_dist
    max_notional = equity * max_notional_pct
    notional = min(notional, max_notional)
    margin = notional / LEVERAGE
    max_margin = equity * 0.70
    if margin > max_margin:
        margin = max_margin
        notional = margin * LEVERAGE
    return notional, margin

def calc_pnl(notional, entry_price, exit_price, side):
    if side == 'long':
        pnl_pct = (exit_price - entry_price) / entry_price
    else:
        pnl_pct = (entry_price - exit_price) / entry_price
    gross_pnl = notional * pnl_pct
    fee = notional * FEE_RATE
    return gross_pnl - fee, pnl_pct

@dataclass
class Trade:
    entry_time: int = 0
    exit_time: int = 0
    side: str = "long"
    entry_price: float = 0.0
    exit_price: float = 0.0
    notional: float = 0.0
    stop_loss: float = 0.0
    pnl: float = 0.0
    pnl_pct: float = 0.0
    equity_impact_pct: float = 0.0
    exit_reason: str = ""
    r_multiple: float = 0.0
    candles_held: int = 0


def backtest_ema_ribbon_variant(candles, variant="baseline", initial_capital=200.0):
    """
    Variants:
    - baseline: signal exit closes immediately (current v2.0 behavior)
    - tighten_only: signal exit moves stop to breakeven, doesn't close
    - min_r: only signal exit if < 0.5R profit
    - no_signal: remove signal exit entirely
    """
    closes = [c['close'] for c in candles]
    ema8 = compute_ema(closes, 8)
    ema21 = compute_ema(closes, 21)
    ema55 = compute_ema(closes, 55)
    rsi = compute_rsi(closes, 14)

    trades = []
    equity = initial_capital
    equity_curve = [equity]
    position = None
    risk_per_trade = 0.02
    cooldown_until = -1
    warmup = 55
    exit_reason_counts = {}

    for i in range(warmup, len(candles)):
        c = candles[i]
        close = c['close']

        if any(math.isnan(v) for v in [ema8[i], ema21[i], ema55[i], rsi[i]]):
            equity_curve.append(equity)
            continue

        # --- Exit logic ---
        if position is not None:
            exit_price = None
            exit_reason = None

            # Stop loss
            if position['side'] == 'long' and c['low'] <= position['stop_loss']:
                exit_price = position['stop_loss']
                exit_reason = 'stop_loss'
            elif position['side'] == 'short' and c['high'] >= position['stop_loss']:
                exit_price = position['stop_loss']
                exit_reason = 'stop_loss'

            # TP1 (2R)
            if exit_price is None and position.get('tp1'):
                if position['side'] == 'long' and c['high'] >= position['tp1']:
                    exit_price = position['tp1']
                    exit_reason = 'take_profit'
                elif position['side'] == 'short' and c['low'] <= position['tp1']:
                    exit_price = position['tp1']
                    exit_reason = 'take_profit'

            # Signal exit (VARIANT-DEPENDENT)
            if exit_price is None:
                signal_fired = False
                if position['side'] == 'long' and i > 0:
                    if ema8[i] < ema21[i] and ema8[i-1] >= ema21[i-1]:
                        signal_fired = True
                elif position['side'] == 'short' and i > 0:
                    if ema8[i] > ema21[i] and ema8[i-1] <= ema21[i-1]:
                        signal_fired = True

                if signal_fired:
                    if variant == "baseline":
                        exit_price = close
                        exit_reason = 'signal_exit'

                    elif variant == "tighten_only":
                        # Instead of closing, move stop to breakeven (+ fee coverage)
                        be_price = position['entry_price'] * (1 + FEE_RATE * 2) if position['side'] == 'long' else position['entry_price'] * (1 - FEE_RATE * 2)
                        if position['side'] == 'long' and position['stop_loss'] < be_price:
                            position['stop_loss'] = be_price
                        elif position['side'] == 'short' and position['stop_loss'] > be_price:
                            position['stop_loss'] = be_price

                    elif variant == "min_r":
                        # Only exit on signal if trade is at less than 0.5R profit
                        stop_dist = abs(position['entry_price'] - position['original_stop']) / position['entry_price']
                        if position['side'] == 'long':
                            current_r = (close - position['entry_price']) / position['entry_price'] / stop_dist
                        else:
                            current_r = (position['entry_price'] - close) / position['entry_price'] / stop_dist
                        if current_r < 0.5:
                            exit_price = close
                            exit_reason = 'signal_exit'
                        else:
                            # At >= 0.5R, tighten to breakeven instead
                            be_price = position['entry_price'] * (1 + FEE_RATE * 2) if position['side'] == 'long' else position['entry_price'] * (1 - FEE_RATE * 2)
                            if position['side'] == 'long' and position['stop_loss'] < be_price:
                                position['stop_loss'] = be_price
                            elif position['side'] == 'short' and position['stop_loss'] > be_price:
                                position['stop_loss'] = be_price

                    elif variant == "no_signal":
                        pass  # Ignore signal entirely

            # Time exit: 12 candles (48h) no progress
            if exit_price is None and (i - position['entry_idx']) >= 12:
                entry_p = position['entry_price']
                if position['side'] == 'long' and close <= entry_p * 1.005:
                    exit_price = close
                    exit_reason = 'time_exit'
                elif position['side'] == 'short' and close >= entry_p * 0.995:
                    exit_price = close
                    exit_reason = 'time_exit'

            # Extended time exit: 24 candles (96h) forced close for non-baseline variants
            if exit_price is None and variant != "baseline" and (i - position['entry_idx']) >= 24:
                exit_price = close
                exit_reason = 'max_time_exit'

            if exit_price is not None:
                pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], exit_price, position['side'])
                stop_dist = abs(position['entry_price'] - position.get('original_stop', position['stop_loss'])) / position['entry_price']
                r_mult = pnl_pct / stop_dist if stop_dist > 0 else 0

                if equity + pnl < 50:
                    pnl = -(equity - 50)

                trade = Trade(
                    entry_time=candles[position['entry_idx']]['timestamp'],
                    exit_time=c['timestamp'],
                    side=position['side'],
                    entry_price=position['entry_price'],
                    exit_price=exit_price,
                    notional=position['notional'],
                    stop_loss=position.get('original_stop', position['stop_loss']),
                    pnl=pnl,
                    pnl_pct=pnl_pct * 100,
                    equity_impact_pct=(pnl / equity) * 100,
                    exit_reason=exit_reason,
                    r_multiple=r_mult,
                    candles_held=i - position['entry_idx'],
                )
                trades.append(trade)
                equity += pnl
                position = None
                exit_reason_counts[exit_reason] = exit_reason_counts.get(exit_reason, 0) + 1
                if exit_reason == 'stop_loss':
                    cooldown_until = i + 2

        # --- Entry logic ---
        if position is None and i > cooldown_until:
            if rsi[i] > 72:
                equity_curve.append(equity)
                continue

            # LONG
            if (ema8[i] > ema21[i] > ema55[i] and
                40 <= rsi[i] <= 60 and
                i > 0 and closes[i] > ema21[i] and closes[i-1] <= ema21[i-1]):

                stop_dist = abs(close - ema55[i]) / close
                stop_dist = max(stop_dist, 0.004)
                if stop_dist > 0.018:
                    equity_curve.append(equity)
                    continue

                notional, margin = size_position(equity, risk_per_trade, stop_dist, max_notional_pct=1.5)
                if notional > 0:
                    position = {
                        'side': 'long',
                        'entry_price': close,
                        'stop_loss': close * (1 - stop_dist),
                        'original_stop': close * (1 - stop_dist),
                        'tp1': close * (1 + stop_dist * 2),
                        'notional': notional,
                        'margin': margin,
                        'entry_idx': i,
                    }

            # SHORT
            elif (ema55[i] > ema21[i] > ema8[i] and
                  40 <= rsi[i] <= 60 and
                  i > 0 and closes[i] < ema21[i] and closes[i-1] >= ema21[i-1]):

                stop_dist = abs(ema55[i] - close) / close
                stop_dist = max(stop_dist, 0.004)
                if stop_dist > 0.018:
                    equity_curve.append(equity)
                    continue

                notional, margin = size_position(equity, risk_per_trade, stop_dist, max_notional_pct=1.5)
                if notional > 0:
                    position = {
                        'side': 'short',
                        'entry_price': close,
                        'stop_loss': close * (1 + stop_dist),
                        'original_stop': close * (1 + stop_dist),
                        'tp1': close * (1 - stop_dist * 2),
                        'notional': notional,
                        'margin': margin,
                        'entry_idx': i,
                    }

        equity_curve.append(equity)

    # Close remaining
    if position is not None:
        close = candles[-1]['close']
        pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], close, position['side'])
        if equity + pnl < 50:
            pnl = -(equity - 50)
        stop_dist = abs(position['entry_price'] - position.get('original_stop', position['stop_loss'])) / position['entry_price']
        r_mult = pnl_pct / stop_dist if stop_dist > 0 else 0
        trade = Trade(
            entry_time=candles[position['entry_idx']]['timestamp'],
            exit_time=candles[-1]['timestamp'], side=position['side'],
            entry_price=position['entry_price'], exit_price=close,
            notional=position['notional'],
            pnl=pnl, pnl_pct=pnl_pct*100, equity_impact_pct=(pnl/equity)*100,
            exit_reason='end_of_data', r_multiple=r_mult,
            candles_held=len(candles)-1-position['entry_idx'])
        trades.append(trade)
        equity += pnl
        exit_reason_counts['end_of_data'] = exit_reason_counts.get('end_of_data', 0) + 1

    return trades, equity, equity_curve, exit_reason_counts


def analyze_results(variant, trades, equity, equity_curve, exit_reason_counts, initial_capital):
    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    total_pnl = sum(t.pnl for t in trades)
    win_rate = len(wins) / len(trades) if trades else 0
    avg_win = sum(t.pnl for t in wins) / len(wins) if wins else 0
    avg_loss = sum(abs(t.pnl) for t in losses) / len(losses) if losses else 0
    avg_rr = avg_win / avg_loss if avg_loss > 0 else 0
    total_gross_profit = sum(t.pnl for t in wins)
    total_gross_loss = sum(abs(t.pnl) for t in losses)
    pf = total_gross_profit / total_gross_loss if total_gross_loss > 0 else float('inf')
    avg_r = sum(t.r_multiple for t in trades) / len(trades) if trades else 0
    avg_hold = sum(t.candles_held for t in trades) / len(trades) if trades else 0

    # Max drawdown
    peak = initial_capital
    max_dd = 0
    for eq in equity_curve:
        if eq > peak: peak = eq
        dd = (peak - eq) / peak
        if dd > max_dd: max_dd = dd

    # Sharpe
    sharpe = 0
    if len(trades) > 1:
        returns = [t.equity_impact_pct / 100 for t in trades]
        avg_ret = sum(returns) / len(returns)
        std = math.sqrt(sum((r - avg_ret) ** 2 for r in returns) / (len(returns) - 1))
        days_span = max(1, (trades[-1].exit_time - trades[0].entry_time) / 86400000)
        trades_per_year = len(trades) / days_span * 365
        ann_factor = math.sqrt(trades_per_year)
        sharpe = (avg_ret / std * ann_factor) if std > 0 else 0

    return {
        'variant': variant,
        'trades': len(trades),
        'wins': len(wins),
        'losses': len(losses),
        'win_rate': win_rate,
        'total_pnl': total_pnl,
        'total_pnl_pct': (total_pnl / initial_capital) * 100,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'avg_rr': avg_rr,
        'avg_r_multiple': avg_r,
        'profit_factor': pf,
        'max_dd': max_dd * 100,
        'sharpe': sharpe,
        'avg_hold_candles': avg_hold,
        'exit_reasons': exit_reason_counts,
    }


def main():
    print("=" * 80)
    print("  EMA Ribbon v2.0 — Signal Exit Parameter Sensitivity Analysis")
    print("=" * 80)
    print("\nFetching BTC/USDT:USDT 4H data...")

    candles = fetch_ohlcv("BTC/USDT:USDT", "4h", 500)
    print(f"Loaded {len(candles)} candles")
    print(f"Range: {datetime.fromtimestamp(candles[0]['timestamp']/1000).strftime('%Y-%m-%d')} to {datetime.fromtimestamp(candles[-1]['timestamp']/1000).strftime('%Y-%m-%d')}")
    print(f"Price: ${candles[0]['close']:.0f} -> ${candles[-1]['close']:.0f}")

    variants = ["baseline", "tighten_only", "min_r", "no_signal"]
    results = []

    for v in variants:
        trades, equity, eq_curve, exit_counts = backtest_ema_ribbon_variant(candles, variant=v)
        r = analyze_results(v, trades, equity, eq_curve, exit_counts, 200.0)
        results.append(r)

    # Print comparison
    print(f"\n{'='*80}")
    print(f"  VARIANT COMPARISON")
    print(f"{'='*80}")
    print(f"  {'Variant':<16} {'Trades':>6} {'WR':>6} {'R:R':>6} {'AvgR':>6} {'P&L':>9} {'PF':>6} {'DD':>7} {'Sharpe':>7} {'Hold':>6}")
    print(f"  {'-'*16} {'-'*6} {'-'*6} {'-'*6} {'-'*6} {'-'*9} {'-'*6} {'-'*7} {'-'*7} {'-'*6}")
    for r in results:
        pf_str = f"{r['profit_factor']:.1f}" if r['profit_factor'] < 100 else "inf"
        print(f"  {r['variant']:<16} {r['trades']:>6} {r['win_rate']*100:>5.0f}% {r['avg_rr']:>5.2f} {r['avg_r_multiple']:>+5.2f} ${r['total_pnl']:>+7.2f} {pf_str:>5} {r['max_dd']:>6.1f}% {r['sharpe']:>6.2f} {r['avg_hold_candles']:>5.1f}")

    # Exit reason breakdown
    print(f"\n{'='*80}")
    print(f"  EXIT REASON BREAKDOWN")
    print(f"{'='*80}")
    all_reasons = set()
    for r in results:
        all_reasons.update(r['exit_reasons'].keys())
    all_reasons = sorted(all_reasons)

    header = f"  {'Variant':<16}"
    for reason in all_reasons:
        header += f" {reason:>15}"
    print(header)
    for r in results:
        line = f"  {r['variant']:<16}"
        for reason in all_reasons:
            line += f" {r['exit_reasons'].get(reason, 0):>15}"
        print(line)

    # Per-trade detail for baseline
    print(f"\n{'='*80}")
    print(f"  BASELINE TRADE DETAIL")
    print(f"{'='*80}")
    baseline_trades, _, _, _ = backtest_ema_ribbon_variant(candles, "baseline")
    print(f"  {'#':>3} {'Side':>5} {'Entry':>10} {'Exit':>10} {'P&L':>9} {'R':>6} {'Hold':>5} {'Reason':>15}")
    for j, t in enumerate(baseline_trades, 1):
        print(f"  {j:>3} {t.side:>5} ${t.entry_price:>9.1f} ${t.exit_price:>9.1f} ${t.pnl:>+8.2f} {t.r_multiple:>+5.2f} {t.candles_held:>4}c {t.exit_reason:>15}")

    # Best variant analysis
    print(f"\n{'='*80}")
    print(f"  RECOMMENDATION")
    print(f"{'='*80}")
    best = max(results, key=lambda r: r['total_pnl'])
    print(f"  Best P&L:    {best['variant']} (${best['total_pnl']:+.2f}, {best['total_pnl_pct']:+.1f}%)")
    best_rr = max(results, key=lambda r: r['avg_rr'])
    print(f"  Best R:R:    {best_rr['variant']} ({best_rr['avg_rr']:.2f}:1)")
    best_sharpe = max(results, key=lambda r: r['sharpe'])
    print(f"  Best Sharpe: {best_sharpe['variant']} ({best_sharpe['sharpe']:.2f})")
    best_pf = max(results, key=lambda r: r['profit_factor'] if r['profit_factor'] < 100 else 0)
    print(f"  Best PF:     {best_pf['variant']} ({best_pf['profit_factor']:.2f})")

    # Save analysis
    output = {
        "analysisDate": datetime.now().isoformat(),
        "purpose": "Signal exit parameter sensitivity for EMA Ribbon v2.0",
        "candles": len(candles),
        "variants": [
            {k: v for k, v in r.items() if k != 'exit_reasons'}
            for r in results
        ],
        "exitReasonBreakdown": {r['variant']: r['exit_reasons'] for r in results},
        "recommendation": best['variant'],
    }
    with open("knowledge/strategies/signal-exit-analysis.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Results saved to knowledge/strategies/signal-exit-analysis.json")


if __name__ == "__main__":
    main()
