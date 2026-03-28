#!/usr/bin/env python3
"""Full indicator scan for strategy evaluation. Uses 50+ candles for proper RSI, MACD, BB, EMA."""
import json, time, subprocess, sys, math
from datetime import datetime, timezone

API = 'http://localhost:3100/api/phemex'
DELAY = 2.5

def fetch(action, **kwargs):
    payload = json.dumps({"action": action, **kwargs})
    r = subprocess.run(
        ['curl', '-s', API, '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload],
        capture_output=True, text=True, timeout=15
    )
    return json.loads(r.stdout)

def ema(data, period):
    if len(data) < period:
        return None
    k = 2 / (period + 1)
    result = sum(data[:period]) / period
    for val in data[period:]:
        result = val * k + result * (1 - k)
    return result

def ema_series(data, period):
    if len(data) < period:
        return []
    k = 2 / (period + 1)
    result = sum(data[:period]) / period
    series = [None] * (period - 1) + [result]
    for val in data[period:]:
        result = val * k + result * (1 - k)
        series.append(result)
    return series

def rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i-1]
        gains.append(max(0, diff))
        losses.append(max(0, -diff))
    # Wilder smoothed RSI
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def rsi_series(closes, period=14):
    if len(closes) < period + 1:
        return []
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i-1]
        gains.append(max(0, diff))
        losses.append(max(0, -diff))
    series = [None] * period
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    if avg_loss == 0:
        series.append(100)
    else:
        rs = avg_gain / avg_loss
        series.append(100 - (100 / (1 + rs)))
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            series.append(100)
        else:
            rs = avg_gain / avg_loss
            series.append(100 - (100 / (1 + rs)))
    return series

def macd(closes, fast=12, slow=26, signal=9):
    ema_fast = ema_series(closes, fast)
    ema_slow = ema_series(closes, slow)
    if not ema_fast or not ema_slow:
        return None, None, None
    macd_line = []
    for f, s in zip(ema_fast, ema_slow):
        if f is not None and s is not None:
            macd_line.append(f - s)
        else:
            macd_line.append(None)
    valid = [v for v in macd_line if v is not None]
    if len(valid) < signal:
        return None, None, None
    sig = ema(valid, signal)
    hist = valid[-1] - sig if sig is not None else None
    return valid[-1], sig, hist

def bollinger_bands(closes, period=20, std_dev=2):
    if len(closes) < period:
        return None, None, None
    sma = sum(closes[-period:]) / period
    variance = sum((c - sma) ** 2 for c in closes[-period:]) / period
    std = math.sqrt(variance)
    return sma, sma + std_dev * std, sma - std_dev * std

def adx(candles, period=14):
    if len(candles) < period * 2:
        return None
    plus_dm, minus_dm, tr_list = [], [], []
    for i in range(1, len(candles)):
        high = candles[i]['high']
        low = candles[i]['low']
        prev_high = candles[i-1]['high']
        prev_low = candles[i-1]['low']
        prev_close = candles[i-1]['close']
        up = high - prev_high
        down = prev_low - low
        plus_dm.append(up if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        tr_list.append(tr)
    # Wilder smoothing
    atr = sum(tr_list[:period]) / period
    plus_di_smooth = sum(plus_dm[:period]) / period
    minus_di_smooth = sum(minus_dm[:period]) / period
    for i in range(period, len(tr_list)):
        atr = (atr * (period - 1) + tr_list[i]) / period
        plus_di_smooth = (plus_di_smooth * (period - 1) + plus_dm[i]) / period
        minus_di_smooth = (minus_di_smooth * (period - 1) + minus_dm[i]) / period
    plus_di = (plus_di_smooth / atr * 100) if atr > 0 else 0
    minus_di = (minus_di_smooth / atr * 100) if atr > 0 else 0
    dx = abs(plus_di - minus_di) / (plus_di + minus_di) * 100 if (plus_di + minus_di) > 0 else 0
    return dx  # Approximate ADX (single-pass DX, not smoothed ADX)

def analyze_pair(pair, timeframe='4h', limit=50):
    data = fetch('ohlcv', symbol=pair, timeframe=timeframe, limit=limit)
    candles = data.get('ohlcv', [])
    if not candles or len(candles) < 30:
        return None

    closes = [c['close'] for c in candles]
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    vols = [c['volume'] for c in candles]

    # Core indicators
    rsi_val = rsi(closes, 14)
    rsi_prev = rsi(closes[:-1], 14)
    rsi_rising = rsi_val > rsi_prev if rsi_val and rsi_prev else None

    macd_line, macd_sig, macd_hist = macd(closes)
    macd_hist_prev = None
    if len(closes) > 1:
        _, _, macd_hist_prev = macd(closes[:-1])

    bb_mid, bb_upper, bb_lower = bollinger_bands(closes)

    ema8 = ema(closes, 8)
    ema21 = ema(closes, 21)
    ema55 = ema(closes, 55) if len(closes) >= 55 else None

    adx_val = adx(candles)

    # Volume
    avg_vol = sum(vols) / len(vols)
    latest_vol = vols[-1]
    vol_ratio = latest_vol / avg_vol if avg_vol > 0 else 0

    # Price context
    close = closes[-1]
    high_period = max(highs)
    low_period = min(lows)
    range_pct = ((high_period - low_period) / low_period) * 100
    pct_change = ((close - closes[0]) / closes[0]) * 100

    # BB proximity
    bb_proximity = None
    if bb_lower:
        bb_proximity = ((close - bb_lower) / close) * 100

    return {
        'pair': pair,
        'short': pair.split('/')[0],
        'close': close,
        'pct_change': pct_change,
        'range_pct': range_pct,
        'high': high_period,
        'low': low_period,
        'rsi': rsi_val,
        'rsi_prev': rsi_prev,
        'rsi_rising': rsi_rising,
        'macd_line': macd_line,
        'macd_signal': macd_sig,
        'macd_hist': macd_hist,
        'macd_hist_prev': macd_hist_prev,
        'bb_mid': bb_mid,
        'bb_upper': bb_upper,
        'bb_lower': bb_lower,
        'bb_proximity': bb_proximity,
        'ema8': ema8,
        'ema21': ema21,
        'ema55': ema55,
        'adx': adx_val,
        'vol_ratio': vol_ratio,
        'candle_count': len(candles),
    }

def evaluate_efr(r):
    """Evaluate Extreme Fear Reversal v1.0 conditions."""
    checks = {}
    if r['rsi'] is not None:
        checks['rsi_below_35'] = r['rsi'] < 35
        checks['rsi_rising'] = r['rsi_rising']
        checks['rsi_value'] = r['rsi']
    if r['bb_lower'] is not None:
        checks['near_bb_lower'] = r['bb_proximity'] is not None and abs(r['bb_proximity']) < 2
        checks['bb_proximity'] = r['bb_proximity']
    if r['macd_hist'] is not None:
        checks['macd_hist_negative'] = r['macd_hist'] < 0
        checks['macd_hist_improving'] = r['macd_hist_prev'] is not None and r['macd_hist'] > r['macd_hist_prev']
        checks['macd_hist_value'] = r['macd_hist']
    if r['ema8'] is not None and r['ema21'] is not None:
        checks['ema8_approaching_21'] = r['ema8'] < r['ema21'] and abs(r['ema8'] - r['ema21']) / r['ema21'] < 0.02
        checks['ema8_above_21'] = r['ema8'] > r['ema21']

    # Trigger: RSI crosses_above 30 + MACD_HIST crosses_above 0 + EMA(8) crosses_above EMA(21)
    trigger = (
        checks.get('rsi_value', 100) > 30 and checks.get('rsi_rising', False) and
        r['macd_hist'] is not None and r['macd_hist'] > 0 and
        checks.get('ema8_above_21', False)
    )
    checks['trigger'] = trigger

    # FOMO block
    checks['fomo_block'] = r['rsi'] is not None and r['rsi'] > 72

    # Setup forming
    setup_forming = checks.get('rsi_below_35', False) and checks.get('rsi_rising', False)

    if checks.get('fomo_block'):
        status = 'FOMO_BLOCK'
    elif trigger:
        status = 'ENTRY_SIGNAL'
    elif setup_forming:
        status = 'SETUP_FORMING'
    elif checks.get('rsi_below_35'):
        status = 'RSI_OVERSOLD'
    else:
        status = 'INACTIVE'

    return status, checks

def evaluate_ema_ribbon(r):
    """Evaluate EMA Ribbon v2.0 conditions."""
    if r['ema8'] is None or r['ema21'] is None:
        return 'NO_DATA', {}
    checks = {}
    checks['ema8'] = r['ema8']
    checks['ema21'] = r['ema21']
    checks['ema55'] = r['ema55']
    checks['adx'] = r['adx']

    if r['ema55'] is not None:
        long_aligned = r['ema8'] > r['ema21'] > r['ema55']
        short_aligned = r['ema55'] > r['ema21'] > r['ema8']
        checks['long_aligned'] = long_aligned
        checks['short_aligned'] = short_aligned
    else:
        long_aligned = short_aligned = False

    adx_strong = r['adx'] is not None and r['adx'] > 25
    checks['adx_strong'] = adx_strong

    # Pullback to EMA21
    pullback = abs(r['close'] - r['ema21']) / r['ema21'] < 0.005
    checks['pullback_to_21'] = pullback

    # RSI in zone
    rsi_long_zone = r['rsi'] is not None and 40 <= r['rsi'] <= 55
    rsi_short_zone = r['rsi'] is not None and 45 <= r['rsi'] <= 60
    checks['rsi_long_zone'] = rsi_long_zone
    checks['rsi_short_zone'] = rsi_short_zone

    if not adx_strong:
        status = 'PAUSED'
    elif long_aligned or short_aligned:
        if pullback:
            status = 'SETUP_FORMING'
        else:
            status = 'TREND_FORMING'
    else:
        status = 'INACTIVE'

    return status, checks


def main():
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    print(f'=== FULL INDICATOR SCAN: {now} ===')
    print(f'50 candles, 4h timeframe, proper RSI(14)/MACD/BB/EMA/ADX')
    print()

    # EFR targets: BTC, ETH
    # EMA targets: BTC, ETH, SOL
    pairs = [
        ('BTC/USDT:USDT', ['EFR', 'EMA']),
        ('ETH/USDT:USDT', ['EFR', 'EMA']),
        ('SOL/USDT:USDT', ['EMA']),
    ]

    all_results = []
    for pair, strategies in pairs:
        print(f'--- {pair} ---')
        r = analyze_pair(pair, '4h', 50)
        if r is None:
            print(f'  Insufficient data')
            time.sleep(DELAY)
            continue

        all_results.append(r)

        # Print indicators
        print(f'  Close: {r["close"]:.2f} | Chg: {r["pct_change"]:+.2f}% | Range: {r["range_pct"]:.2f}%')
        print(f'  RSI(14): {r["rsi"]:.1f} (prev: {r["rsi_prev"]:.1f}, {"rising" if r["rsi_rising"] else "falling"})')
        print(f'  MACD: line={r["macd_line"]:.4f} sig={r["macd_signal"]:.4f} hist={r["macd_hist"]:.4f}' + (f' (prev_hist: {r["macd_hist_prev"]:.4f})' if r["macd_hist_prev"] else ''))
        if r['bb_lower']:
            print(f'  BB(20,2): upper={r["bb_upper"]:.2f} mid={r["bb_mid"]:.2f} lower={r["bb_lower"]:.2f} | proximity: {r["bb_proximity"]:+.2f}%')
        print(f'  EMA: 8={r["ema8"]:.2f} 21={r["ema21"]:.2f}' + (f' 55={r["ema55"]:.2f}' if r["ema55"] else ' 55=N/A'))
        if r['adx'] is not None:
            print(f'  ADX(~14): {r["adx"]:.1f} ({"trending" if r["adx"] > 25 else "ranging"})')
        print(f'  Vol ratio: {r["vol_ratio"]:.2f}x')

        # Strategy evaluations
        for strat in strategies:
            if strat == 'EFR':
                status, checks = evaluate_efr(r)
                print(f'\n  [EFR-v1.0] Status: {status}')
                if 'rsi_below_35' in checks:
                    print(f'    RSI < 35: {"YES" if checks["rsi_below_35"] else "NO"} ({checks["rsi_value"]:.1f})')
                if 'rsi_rising' in checks:
                    print(f'    RSI rising: {"YES" if checks["rsi_rising"] else "NO"}')
                if 'near_bb_lower' in checks:
                    print(f'    Near BB lower: {"YES" if checks["near_bb_lower"] else "NO"} ({checks.get("bb_proximity","?"):.2f}%)')
                if 'macd_hist_negative' in checks:
                    print(f'    MACD hist negative: {"YES" if checks["macd_hist_negative"] else "NO"} ({checks["macd_hist_value"]:.4f})')
                if 'macd_hist_improving' in checks:
                    print(f'    MACD hist improving: {"YES" if checks["macd_hist_improving"] else "NO"}')
                if 'ema8_approaching_21' in checks:
                    print(f'    EMA8 approaching 21: {"YES" if checks["ema8_approaching_21"] else "NO"}')
                print(f'    Trigger: {"FIRED" if checks.get("trigger") else "not met"}')

            elif strat == 'EMA':
                status, checks = evaluate_ema_ribbon(r)
                print(f'\n  [EMA-v2.0] Status: {status}')
                if 'long_aligned' in checks:
                    print(f'    Long aligned (8>21>55): {"YES" if checks["long_aligned"] else "NO"}')
                    print(f'    Short aligned (55>21>8): {"YES" if checks["short_aligned"] else "NO"}')
                if 'adx_strong' in checks:
                    print(f'    ADX > 25: {"YES" if checks["adx_strong"] else "NO"} ({checks.get("adx","?"):.1f})')

        print()
        time.sleep(DELAY)

    # Summary
    print('=== STRATEGY SUMMARY ===')
    for r in all_results:
        efr_status, _ = evaluate_efr(r)
        ema_status, _ = evaluate_ema_ribbon(r)
        print(f'{r["short"]:>4}: RSI={r["rsi"]:.1f} MACD_H={r["macd_hist"]:.4f} ADX={r["adx"]:.1f} | EFR={efr_status} | EMA={ema_status}')

    # JSON output
    print('\n---INDICATOR_JSON---')
    output = {
        'timestamp': now,
        'results': []
    }
    for r in all_results:
        efr_status, efr_checks = evaluate_efr(r)
        ema_status, ema_checks = evaluate_ema_ribbon(r)
        r['efr_status'] = efr_status
        r['ema_status'] = ema_status
        output['results'].append(r)
    print(json.dumps(output))

if __name__ == '__main__':
    main()
