#!/usr/bin/env python3
"""
Strategy Scanner — heartbeat-compatible CLI wrapper.
Fetches OHLCV + funding data from Phemex API, computes indicators,
and evaluates all 4 strategy detection criteria (EFR, FRC, EMA Ribbon, LSR).

Usage: python scripts/strategy_scan.py [--symbols BTC,ETH] [--json] [--save]
"""
import json, time, subprocess, sys, os, math
from datetime import datetime, timezone
from typing import Optional

API = 'http://localhost:3100/api/phemex'
DELAY = 2.5  # Phemex rate limit safe margin

DEFAULT_PAIRS = [
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'XRP/USDT:USDT',
    'SUI/USDT:USDT', 'DOGE/USDT:USDT', 'LINK/USDT:USDT', 'AVAX/USDT:USDT',
    'NEAR/USDT:USDT', 'HYPE/USDT:USDT', 'TAO/USDT:USDT', 'WIF/USDT:USDT',
    'ONDO/USDT:USDT', 'ARB/USDT:USDT', 'OP/USDT:USDT', 'APT/USDT:USDT',
    'SEI/USDT:USDT', 'INJ/USDT:USDT', 'BNB/USDT:USDT', 'DOT/USDT:USDT',
]

# Strategy symbol restrictions
EFR_SYMBOLS = {'BTC/USDT:USDT', 'ETH/USDT:USDT'}
FRC_SYMBOLS = set(DEFAULT_PAIRS)  # All pairs checked for funding
EMA_SYMBOLS = {'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'}
LSR_SYMBOLS = {'BTC/USDT:USDT', 'SOL/USDT:USDT'}


def fetch(action, **kwargs):
    payload = json.dumps({"action": action, **kwargs})
    r = subprocess.run(
        ['curl', '-s', API, '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload],
        capture_output=True, text=True, timeout=15
    )
    return json.loads(r.stdout)


# ── Indicator computation ──

def compute_ema(closes, period):
    if len(closes) < period:
        return [float('nan')] * len(closes)
    result = [float('nan')] * (period - 1)
    k = 2.0 / (period + 1)
    ema = sum(closes[:period]) / period
    result.append(ema)
    for i in range(period, len(closes)):
        ema = closes[i] * k + ema * (1 - k)
        result.append(ema)
    return result


def compute_rsi(closes, period=14):
    if len(closes) < period + 1:
        return [float('nan')] * len(closes)
    result = [float('nan')] * period
    gains = []
    losses = []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    if avg_loss == 0:
        result.append(100.0)
    else:
        rs = avg_gain / avg_loss
        result.append(100 - 100 / (1 + rs))

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            result.append(100.0)
        else:
            rs = avg_gain / avg_loss
            result.append(100 - 100 / (1 + rs))
    return result


def compute_macd(closes, fast=12, slow=26, signal=9):
    fast_ema = compute_ema(closes, fast)
    slow_ema = compute_ema(closes, slow)
    macd_line = []
    for f, s in zip(fast_ema, slow_ema):
        if math.isnan(f) or math.isnan(s):
            macd_line.append(float('nan'))
        else:
            macd_line.append(f - s)

    # Signal line = EMA of MACD line (only valid values)
    valid_macd = [v for v in macd_line if not math.isnan(v)]
    if len(valid_macd) < signal:
        signal_line = [float('nan')] * len(macd_line)
        histogram = [float('nan')] * len(macd_line)
        return macd_line, signal_line, histogram

    k = 2.0 / (signal + 1)
    sig = sum(valid_macd[:signal]) / signal
    signal_line = [float('nan')] * len(macd_line)
    histogram = [float('nan')] * len(macd_line)

    # Find where valid MACD values start
    start = next(i for i, v in enumerate(macd_line) if not math.isnan(v))
    sig_start = start + signal - 1
    signal_line[sig_start] = sig
    histogram[sig_start] = macd_line[sig_start] - sig

    for i in range(sig_start + 1, len(macd_line)):
        if math.isnan(macd_line[i]):
            continue
        sig = macd_line[i] * k + sig * (1 - k)
        signal_line[i] = sig
        histogram[i] = macd_line[i] - sig

    return macd_line, signal_line, histogram


def compute_bb(closes, period=20, std_dev=2):
    result_upper = [float('nan')] * len(closes)
    result_middle = [float('nan')] * len(closes)
    result_lower = [float('nan')] * len(closes)
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1:i + 1]
        mean = sum(window) / period
        variance = sum((x - mean) ** 2 for x in window) / period
        std = variance ** 0.5
        result_middle[i] = mean
        result_upper[i] = mean + std_dev * std
        result_lower[i] = mean - std_dev * std
    return result_upper, result_middle, result_lower


def compute_atr(candles, period=14):
    result = [float('nan')] * len(candles)
    if len(candles) < period + 1:
        return result
    trs = []
    for i in range(1, len(candles)):
        tr = max(
            candles[i]['high'] - candles[i]['low'],
            abs(candles[i]['high'] - candles[i - 1]['close']),
            abs(candles[i]['low'] - candles[i - 1]['close']),
        )
        trs.append(tr)
    atr = sum(trs[:period]) / period
    result[period] = atr
    for i in range(period, len(trs)):
        atr = (atr * (period - 1) + trs[i]) / period
        result[i + 1] = atr
    return result


def compute_adx(candles, period=14):
    """Simplified ADX computation."""
    n = len(candles)
    result = [float('nan')] * n
    if n < period * 2 + 1:
        return result

    plus_dm = []
    minus_dm = []
    tr_list = []
    for i in range(1, n):
        high_diff = candles[i]['high'] - candles[i - 1]['high']
        low_diff = candles[i - 1]['low'] - candles[i]['low']
        plus_dm.append(max(high_diff, 0) if high_diff > low_diff else 0)
        minus_dm.append(max(low_diff, 0) if low_diff > high_diff else 0)
        tr = max(
            candles[i]['high'] - candles[i]['low'],
            abs(candles[i]['high'] - candles[i - 1]['close']),
            abs(candles[i]['low'] - candles[i - 1]['close']),
        )
        tr_list.append(tr)

    # Smoothed averages
    sm_plus = sum(plus_dm[:period])
    sm_minus = sum(minus_dm[:period])
    sm_tr = sum(tr_list[:period])

    dx_values = []
    for i in range(period, len(plus_dm)):
        sm_plus = sm_plus - sm_plus / period + plus_dm[i]
        sm_minus = sm_minus - sm_minus / period + minus_dm[i]
        sm_tr = sm_tr - sm_tr / period + tr_list[i]
        if sm_tr == 0:
            dx_values.append(0)
            continue
        di_plus = 100 * sm_plus / sm_tr
        di_minus = 100 * sm_minus / sm_tr
        di_sum = di_plus + di_minus
        dx = 100 * abs(di_plus - di_minus) / di_sum if di_sum > 0 else 0
        dx_values.append(dx)

    if len(dx_values) < period:
        return result

    adx = sum(dx_values[:period]) / period
    adx_start = period * 2
    if adx_start < n:
        result[adx_start] = adx
    for i in range(period, len(dx_values)):
        adx = (adx * (period - 1) + dx_values[i]) / period
        idx = period + i + 1
        if idx < n:
            result[idx] = adx
    return result


# ── Strategy Scanners ──

def scan_efr(symbol, closes, rsi, macd_hist, ema8, ema21, bb_lower, idx):
    """Extreme Fear Reversal v1.0"""
    if symbol not in EFR_SYMBOLS:
        return []
    alerts = []
    r = rsi[idx]
    r_prev = rsi[idx - 1] if idx > 0 else float('nan')
    c = closes[idx]
    bbl = bb_lower[idx]
    mh = macd_hist[idx]
    mh_prev = macd_hist[idx - 1] if idx > 0 else float('nan')
    e8, e21 = ema8[idx], ema21[idx]
    e8p = ema8[idx - 1] if idx > 0 else float('nan')
    e21p = ema21[idx - 1] if idx > 0 else float('nan')

    if any(math.isnan(v) for v in [r, c, bbl, mh, e8, e21]):
        return []

    short = symbol.split('/')[0]

    if r > 72:
        return [{'strategy': 'EFR-v1.0', 'level': 'FOMO_BLOCK', 'dir': None,
                 'msg': f'[EFR-v1.0] FOMO_BLOCK — {short} RSI={r:.1f} > 72'}]

    # Setup conditions
    rsi_recovery = r < 35 and not math.isnan(r_prev) and r > r_prev
    bb_prox = c <= bbl * 1.02
    macd_improving = mh < 0 and not math.isnan(mh_prev) and mh > mh_prev
    ema_approaching = e8 < e21 and not math.isnan(e8p) and not math.isnan(e21p) and (e21 - e8) < (e21p - e8p)
    setup_count = sum([rsi_recovery, bb_prox, macd_improving, ema_approaching])

    # Entry signal
    rsi_cross_30 = not math.isnan(r_prev) and r_prev <= 30 and r > 30
    macd_cross_0 = not math.isnan(mh_prev) and mh_prev <= 0 and mh > 0
    ema_bull_cross = not math.isnan(e8p) and not math.isnan(e21p) and e8p <= e21p and e8 > e21

    if rsi_cross_30 and macd_cross_0 and ema_bull_cross:
        alerts.append({'strategy': 'EFR-v1.0', 'level': 'ENTRY_SIGNAL', 'dir': 'long',
                       'msg': f'[EFR-v1.0] ENTRY_SIGNAL — {short} RSI={r:.1f} MACD_H={mh:.4f} EMA8/21=ALIGNED',
                       'confidence': 0.85, 'rsi': r, 'macd_hist': mh})
    elif setup_count >= 2:
        alerts.append({'strategy': 'EFR-v1.0', 'level': 'SETUP_FORMING', 'dir': 'long',
                       'msg': f'[EFR-v1.0] SETUP_FORMING — {short} RSI={r:.1f} MACD_H={mh:.4f} ({setup_count}/4)',
                       'confidence': setup_count * 0.2, 'rsi': r, 'macd_hist': mh})
    return alerts


def scan_frc(symbol, closes, rsi, ema55, funding_rate, funding_history, idx):
    """Funding Rate Carry v1.0"""
    if funding_rate is None:
        return []
    alerts = []
    c = closes[idx]
    r = rsi[idx]
    e55 = ema55[idx]
    short = symbol.split('/')[0]

    if any(math.isnan(v) for v in [c, r, e55]):
        return []

    ann = funding_rate * 3 * 365 * 100

    # Exit signal
    if funding_history and len(funding_history) >= 2:
        if funding_history[0] > 0 and funding_history[1] > 0:
            return [{'strategy': 'FRC-v1.0', 'level': 'EXIT', 'dir': None,
                     'msg': f'[FRC-v1.0] EXIT — {short} funding={funding_rate * 100:.4f}% positive 2x consec'}]

    # Opportunity: funding < -0.01%
    if funding_rate < -0.0001:
        above_ema55 = c > e55
        rsi_ok = r < 65
        consec_neg = all(h < 0 for h in (funding_history or [])[:3]) if funding_history and len(funding_history) >= 3 else False
        ann_attractive = abs(ann) > 5

        if above_ema55 and rsi_ok and consec_neg and ann_attractive:
            alerts.append({'strategy': 'FRC-v1.0', 'level': 'ENTRY_SIGNAL', 'dir': 'long',
                           'msg': f'[FRC-v1.0] ENTRY_SIGNAL — {short} funding={funding_rate * 100:.4f}% ann={ann:.1f}% RSI={r:.1f}',
                           'confidence': 0.8, 'funding': funding_rate * 100, 'annualized': ann})
        else:
            blockers = []
            if not above_ema55: blockers.append('price<EMA55')
            if not rsi_ok: blockers.append('RSI>65')
            if not consec_neg: blockers.append('not 3x neg')
            if not ann_attractive: blockers.append('ann<5%')
            alerts.append({'strategy': 'FRC-v1.0', 'level': 'OPPORTUNITY', 'dir': 'long',
                           'msg': f'[FRC-v1.0] OPPORTUNITY — {short} funding={funding_rate * 100:.4f}% ann={ann:.1f}%. Blocked: {", ".join(blockers)}',
                           'confidence': 0.4, 'funding': funding_rate * 100, 'annualized': ann})
    return alerts


def scan_ema_ribbon(symbol, closes, ema8, ema21, ema55, rsi, adx, idx):
    """EMA Ribbon v2.1"""
    if symbol not in EMA_SYMBOLS:
        return []
    alerts = []
    c = closes[idx]
    e8, e21, e55 = ema8[idx], ema21[idx], ema55[idx]
    r = rsi[idx]
    a = adx[idx]
    short = symbol.split('/')[0]

    if any(math.isnan(v) for v in [c, e8, e21, e55, r, a]):
        return []

    if r > 72:
        return [{'strategy': 'EMA-v2.1', 'level': 'FOMO_BLOCK', 'dir': None,
                 'msg': f'[EMA-v2.1] FOMO_BLOCK — {short} RSI={r:.1f} > 72'}]

    if a < 20:
        return [{'strategy': 'EMA-v2.1', 'level': 'PAUSED', 'dir': None,
                 'msg': f'[EMA-v2.1] PAUSED — {short} ADX={a:.1f} < 20'}]

    long_aligned = e8 > e21 > e55
    short_aligned = e55 > e21 > e8
    alignment = 'LONG' if long_aligned else ('SHORT' if short_aligned else 'MIXED')

    if alignment == 'MIXED':
        gap = abs(e8 - e21) / e21 * 100
        if gap < 0.5:
            d = 'long' if e8 > e21 else 'short'
            alerts.append({'strategy': 'EMA-v2.1', 'level': 'TREND_FORMING', 'dir': d,
                           'msg': f'[EMA-v2.1] TREND_FORMING — {short} EMA=COMPRESSING({gap:.2f}%) ADX={a:.1f} RSI={r:.1f}'})
        return alerts

    direction = 'long' if alignment == 'LONG' else 'short'
    dist_21 = abs(c - e21) / e21 * 100
    pullback = dist_21 < 0.5
    rsi_zone = (40 <= r <= 55) if direction == 'long' else (45 <= r <= 60)
    trend_confirmed = a > 25

    if pullback and rsi_zone and trend_confirmed:
        alerts.append({'strategy': 'EMA-v2.1', 'level': 'ENTRY_SIGNAL', 'dir': direction,
                       'msg': f'[EMA-v2.1] ENTRY_SIGNAL — {short} EMA={alignment} ADX={a:.1f} RSI={r:.1f} pullback={dist_21:.2f}%',
                       'confidence': 0.8, 'adx': a, 'rsi': r})
    elif long_aligned or short_aligned:
        missing = []
        if not pullback: missing.append(f'pullback={dist_21:.2f}%>0.5%')
        if not rsi_zone: missing.append(f'RSI={r:.1f} out of zone')
        if not trend_confirmed: missing.append(f'ADX={a:.1f}<25')
        alerts.append({'strategy': 'EMA-v2.1', 'level': 'SETUP', 'dir': direction,
                       'msg': f'[EMA-v2.1] SETUP — {short} EMA={alignment} ADX={a:.1f} RSI={r:.1f}. Missing: {", ".join(missing)}',
                       'confidence': 0.5, 'adx': a, 'rsi': r})
    return alerts


# ── Main Scanner Pipeline ──

def scan_pair(pair):
    """Fetch data and run all 4 strategy scanners for a single pair."""
    short = pair.split('/')[0]

    # Fetch 4H OHLCV (100 candles)
    data = fetch('ohlcv', symbol=pair, timeframe='4h', limit=100)
    candles = data.get('ohlcv', [])
    if not candles or len(candles) < 56:
        return {'pair': pair, 'short': short, 'status': 'INSUFFICIENT_DATA',
                'candles': len(candles) if candles else 0, 'alerts': []}
    time.sleep(DELAY)

    closes = [c['close'] for c in candles]
    idx = len(candles) - 1

    # Compute indicators
    ema8 = compute_ema(closes, 8)
    ema21 = compute_ema(closes, 21)
    ema55 = compute_ema(closes, 55)
    rsi = compute_rsi(closes, 14)
    macd_line, macd_signal, macd_hist = compute_macd(closes, 12, 26, 9)
    bb_upper, bb_middle, bb_lower = compute_bb(closes, 20, 2)
    atr = compute_atr(candles, 14)
    adx = compute_adx(candles, 14)

    # Fetch funding rate
    funding_rate = None
    funding_history = None
    try:
        fr_data = fetch('funding_rate', symbol=pair)
        funding_rate = fr_data.get('fundingRate', {}).get('fundingRate')
        time.sleep(DELAY)
    except Exception:
        pass

    # Collect alerts from all strategies
    alerts = []
    alerts.extend(scan_efr(pair, closes, rsi, macd_hist, ema8, ema21, bb_lower, idx))
    alerts.extend(scan_frc(pair, closes, rsi, ema55, funding_rate, funding_history, idx))
    alerts.extend(scan_ema_ribbon(pair, closes, ema8, ema21, ema55, rsi, adx, idx))
    # LSR skipped in Python scanner for now (swing detection complex, use TS version)

    # Regime info
    adx_val = adx[idx] if not math.isnan(adx[idx]) else 0
    rsi_val = rsi[idx] if not math.isnan(rsi[idx]) else 0
    atr_val = atr[idx] if not math.isnan(atr[idx]) else 0
    regime = 'TRENDING' if adx_val > 30 else ('TRANSITION' if adx_val > 20 else 'RANGING')

    return {
        'pair': pair,
        'short': short,
        'status': 'OK',
        'candles': len(candles),
        'close': closes[-1],
        'rsi': rsi_val,
        'adx': adx_val,
        'atr': atr_val,
        'ema8': ema8[-1] if not math.isnan(ema8[-1]) else None,
        'ema21': ema21[-1] if not math.isnan(ema21[-1]) else None,
        'ema55': ema55[-1] if not math.isnan(ema55[-1]) else None,
        'regime': regime,
        'funding': funding_rate,
        'alerts': alerts,
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description='PhantomX Strategy Scanner')
    parser.add_argument('--symbols', type=str, help='Comma-separated symbols (e.g. BTC,ETH,SOL)')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.add_argument('--save', action='store_true', help='Save report to knowledge/patterns/')
    args = parser.parse_args()

    pairs = DEFAULT_PAIRS
    if args.symbols:
        pairs = [f'{s.upper()}/USDT:USDT' for s in args.symbols.split(',')]

    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    print(f'=== STRATEGY SCANNER: {now} ===')
    print(f'Scanning {len(pairs)} pairs | 4H x 100 candles | EFR + FRC + EMA Ribbon')
    print()

    results = []
    all_alerts = []

    for pair in pairs:
        try:
            r = scan_pair(pair)
            results.append(r)
            all_alerts.extend(r.get('alerts', []))

            # Print summary line
            if r['status'] == 'OK':
                alert_str = ''
                if r['alerts']:
                    alert_str = ' | ' + '; '.join(a['msg'] for a in r['alerts'])
                regime_str = r['regime']
                funding_str = f" FR={r['funding'] * 100:.4f}%" if r['funding'] is not None else ''
                print(f"  {r['short']:>6} | ${r['close']:>12.6g} | RSI={r['rsi']:5.1f} | ADX={r['adx']:5.1f} | {regime_str:>10}{funding_str}{alert_str}")
            else:
                print(f"  {r['short']:>6} | {r['status']} ({r.get('candles', 0)} candles)")
        except Exception as e:
            print(f"  {pair.split('/')[0]:>6} | ERROR: {e}")
            time.sleep(DELAY)

    # Summary
    entry_signals = [a for a in all_alerts if a.get('level') == 'ENTRY_SIGNAL']
    setups = [a for a in all_alerts if a.get('level') in ('SETUP_FORMING', 'SETUP')]
    opportunities = [a for a in all_alerts if a.get('level') == 'OPPORTUNITY']
    paused = [a for a in all_alerts if a.get('level') == 'PAUSED']

    print(f'\n=== SUMMARY: {len(results)} scanned, {len(all_alerts)} alerts ===')
    print(f'  Entry signals: {len(entry_signals)}')
    print(f'  Setups forming: {len(setups)}')
    print(f'  Opportunities: {len(opportunities)}')
    print(f'  Paused: {len(paused)}')

    if entry_signals:
        print('\n*** ENTRY SIGNALS ***')
        for a in entry_signals:
            print(f'  {a["msg"]}')

    if setups:
        print('\nSETUPS:')
        for a in setups:
            print(f'  {a["msg"]}')

    if opportunities:
        print('\nOPPORTUNITIES:')
        for a in opportunities:
            print(f'  {a["msg"]}')

    if args.json:
        print('\n---SCAN_JSON---')
        print(json.dumps({
            'timestamp': now,
            'pairs_scanned': len(results),
            'alerts': all_alerts,
            'entry_signals': entry_signals,
            'setups': setups,
            'opportunities': opportunities,
            'results': results,
        }, default=str))

    if args.save:
        ts = datetime.now(timezone.utc).strftime('%Y-%m-%d-%H%Mutc')
        filename = f'knowledge/patterns/{ts}-strategy-scan.md'
        with open(filename, 'w') as f:
            f.write(f'# Strategy Scan — {now}\n\n')
            f.write(f'## Summary\n')
            f.write(f'- Pairs: {len(results)} | Alerts: {len(all_alerts)}\n')
            f.write(f'- Entry signals: {len(entry_signals)}\n')
            f.write(f'- Setups: {len(setups)} | Opportunities: {len(opportunities)}\n\n')
            if entry_signals:
                f.write('## Entry Signals\n\n')
                for a in entry_signals:
                    f.write(f'- **{a["msg"]}**\n')
                f.write('\n')
            if setups:
                f.write('## Setups Forming\n\n')
                for a in setups:
                    f.write(f'- {a["msg"]}\n')
                f.write('\n')
            if opportunities:
                f.write('## Opportunities\n\n')
                for a in opportunities:
                    f.write(f'- {a["msg"]}\n')
                f.write('\n')
            f.write('## Regime by Symbol\n\n')
            f.write('| Symbol | Price | RSI | ADX | Regime | Funding |\n')
            f.write('|--------|-------|-----|-----|--------|--------|\n')
            for r in results:
                if r['status'] == 'OK':
                    fr = f"{r['funding'] * 100:.4f}%" if r['funding'] else 'N/A'
                    f.write(f"| {r['short']} | {r['close']:.6g} | {r['rsi']:.1f} | {r['adx']:.1f} | {r['regime']} | {fr} |\n")
            f.write('\n')
        print(f'\nSaved to {filename}')


if __name__ == '__main__':
    main()
