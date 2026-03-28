#!/usr/bin/env python3
"""Scanner heartbeat - scan Phemex USDT perps for setups."""
import json, time, subprocess, sys
from datetime import datetime, timezone

PAIRS = [
    'BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'XRP/USDT:USDT',
    'SUI/USDT:USDT', 'DOGE/USDT:USDT', 'LINK/USDT:USDT', 'AVAX/USDT:USDT',
    'NEAR/USDT:USDT', 'HYPE/USDT:USDT', 'TAO/USDT:USDT', 'WIF/USDT:USDT',
    'ONDO/USDT:USDT', 'ARB/USDT:USDT', 'OP/USDT:USDT', 'APT/USDT:USDT',
    'SEI/USDT:USDT', 'INJ/USDT:USDT', 'BNB/USDT:USDT', 'DOT/USDT:USDT',
]

API = 'http://localhost:3100/api/phemex'
DELAY = 2.5  # Phemex rate limit safe margin
OHLCV_LIMIT = 50  # No server cap — use 50 for proper indicator calc

def fetch(action, **kwargs):
    payload = json.dumps({"action": action, **kwargs})
    r = subprocess.run(
        ['curl', '-s', API, '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload],
        capture_output=True, text=True, timeout=15
    )
    return json.loads(r.stdout)

def analyze_pair(pair):
    # Use 4h candles for broader context (10 candles = 40h)
    data = fetch('ohlcv', symbol=pair, timeframe='4h', limit=OHLCV_LIMIT)
    candles = data.get('ohlcv', [])
    if not candles or len(candles) < 4:
        return None

    close = candles[-1]['close']
    open_period = candles[0]['open']
    pct_change = ((close - open_period) / open_period) * 100

    vols = [c['volume'] for c in candles]
    avg_vol = sum(vols) / len(vols)
    latest_vol = candles[-1]['volume']
    vol_ratio = latest_vol / avg_vol if avg_vol > 0 else 0

    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    high_period = max(highs)
    low_period = min(lows)
    range_pct = ((high_period - low_period) / low_period) * 100

    # Recent momentum (last 2 candles = 8h)
    two_ago = candles[-2]['close']
    momentum = ((close - two_ago) / two_ago) * 100

    # Position in range
    near_high_pct = (high_period - close) / (high_period - low_period) * 100 if high_period != low_period else 50

    # Trend direction (comparing first half avg to second half avg)
    mid = len(candles) // 2
    first_half_avg = sum(c['close'] for c in candles[:mid]) / mid
    second_half_avg = sum(c['close'] for c in candles[mid:]) / (len(candles) - mid)
    trend = 'UP' if second_half_avg > first_half_avg * 1.01 else ('DOWN' if second_half_avg < first_half_avg * 0.99 else 'RANGE')

    # Volume trend
    first_half_vol = sum(c['volume'] for c in candles[:mid]) / mid
    second_half_vol = sum(c['volume'] for c in candles[mid:]) / (len(candles) - mid)
    vol_trend = 'INCREASING' if second_half_vol > first_half_vol * 1.3 else ('DECREASING' if second_half_vol < first_half_vol * 0.7 else 'STEADY')

    flags = []
    if abs(pct_change) > 5: flags.append('BIG_MOVE')
    if vol_ratio > 2: flags.append('VOL_SPIKE')
    if abs(momentum) > 2: flags.append('MOMENTUM')
    if range_pct > 8: flags.append('HIGH_RANGE')
    if near_high_pct < 5: flags.append('NEAR_HIGH')
    if near_high_pct > 95: flags.append('NEAR_LOW')
    if trend == 'DOWN' and vol_trend == 'INCREASING': flags.append('SELL_PRESSURE')
    if trend == 'UP' and vol_trend == 'INCREASING': flags.append('BUY_PRESSURE')

    return {
        'pair': pair,
        'short': pair.split('/')[0],
        'close': close,
        'open_period': open_period,
        'pct_change': pct_change,
        'high_period': high_period,
        'low_period': low_period,
        'range_pct': range_pct,
        'vol_ratio': vol_ratio,
        'latest_vol': latest_vol,
        'avg_vol': avg_vol,
        'momentum': momentum,
        'near_high_pct': near_high_pct,
        'trend': trend,
        'vol_trend': vol_trend,
        'flags': flags,
        'candle_count': len(candles),
    }

def main():
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    print(f'=== SCANNER HEARTBEAT: {now} ===')
    print(f'Scanning {len(PAIRS)} USDT perps | 4h candles x {OHLCV_LIMIT} (40h window)')
    print()
    print(f'{"PAIR":>8} | {"PRICE":>12} | {"40h":>7} | {"RNG":>6} | {"VOL":>5} | {"MOM8h":>6} | {"TREND":>5} | FLAGS')
    print('-' * 90)

    results = []
    alerts = []

    for pair in PAIRS:
        try:
            r = analyze_pair(pair)
            if r is None:
                print(f'{pair.split("/")[0]:>8} | {"NO DATA":>12} |')
                time.sleep(DELAY)
                continue
            flag_str = f' {", ".join(r["flags"])}' if r['flags'] else ''
            print(f'{r["short"]:>8} | {r["close"]:>12.6g} | {r["pct_change"]:+6.2f}% | {r["range_pct"]:5.2f}% | {r["vol_ratio"]:.2f}x | {r["momentum"]:+5.2f}% | {r["trend"]:>5} |{flag_str}')
            results.append(r)
            if r['flags']:
                alerts.append(r)
        except Exception as e:
            print(f'{pair}: ERROR - {e}')
        time.sleep(DELAY)

    print(f'\n=== RESULTS: {len(results)}/{len(PAIRS)} scanned, {len(alerts)} flagged ===')

    if alerts:
        print('\nFLAGGED SETUPS:')
        for a in alerts:
            print(f'  [{a["trend"]}] {a["short"]}: {", ".join(a["flags"])}')
            print(f'    Price: {a["close"]:.6g} | 40h: {a["pct_change"]:+.2f}% | Range: {a["range_pct"]:.2f}% | Vol: {a["vol_ratio"]:.2f}x')
    else:
        print('\nNo setups flagged.')

    # JSON output for logging
    print('\n---SCAN_JSON---')
    print(json.dumps({'timestamp': now, 'pairs_scanned': len(results), 'alerts_count': len(alerts), 'results': results, 'alerts': alerts}))

if __name__ == '__main__':
    main()
