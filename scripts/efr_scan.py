#!/usr/bin/env python3
"""EFR v1.1 + FRC detailed scan for alt targets."""
import json, subprocess, time, sys
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

def compute_rsi(closes, period=14):
    if len(closes) < period + 2:
        return None, None
    # Current RSI (Wilder smoothing approximation using SMA for seed)
    diffs = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains = [max(d, 0) for d in diffs]
    losses = [max(-d, 0) for d in diffs]

    # Wilder smoothing
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        rsi = 100
    else:
        rsi = 100 - (100 / (1 + avg_gain / avg_loss))

    # Previous RSI
    avg_gain_p = sum(gains[:period]) / period
    avg_loss_p = sum(losses[:period]) / period
    for i in range(period, len(gains) - 1):
        avg_gain_p = (avg_gain_p * (period - 1) + gains[i]) / period
        avg_loss_p = (avg_loss_p * (period - 1) + losses[i]) / period

    if avg_loss_p == 0:
        rsi_prev = 100
    else:
        rsi_prev = 100 - (100 / (1 + avg_gain_p / avg_loss_p))

    return rsi, rsi_prev

def ema(data, period):
    if len(data) < period:
        return None
    mult = 2 / (period + 1)
    val = sum(data[:period]) / period
    for p in data[period:]:
        val = (p - val) * mult + val
    return val

def compute_macd(closes):
    if len(closes) < 35:
        return None, None, None, None
    # MACD values for enough points to get signal line
    macd_vals = []
    for i in range(26, len(closes) + 1):
        subset = closes[:i]
        e12 = ema(subset, 12)
        e26 = ema(subset, 26)
        if e12 is not None and e26 is not None:
            macd_vals.append(e12 - e26)

    if len(macd_vals) >= 9:
        signal = ema(macd_vals, 9)
        hist = macd_vals[-1] - signal
        # Prev hist
        prev_signal = ema(macd_vals[:-1], 9)
        prev_hist = macd_vals[-2] - prev_signal if prev_signal else hist
        return macd_vals[-1], signal, hist, prev_hist
    return None, None, None, None

def bb(closes, period=20, std_mult=2):
    if len(closes) < period:
        return None, None, None
    recent = closes[-period:]
    sma = sum(recent) / period
    std = (sum((x - sma) ** 2 for x in recent) / period) ** 0.5
    return sma + std_mult * std, sma, sma - std_mult * std

def adx(candles, period=14):
    """Compute ADX from candle data."""
    if len(candles) < period * 2:
        return None
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    closes = [c['close'] for c in candles]

    # True Range, +DM, -DM
    tr_list, pdm_list, ndm_list = [], [], []
    for i in range(1, len(candles)):
        h, l, pc = highs[i], lows[i], closes[i-1]
        tr = max(h - l, abs(h - pc), abs(l - pc))
        up = highs[i] - highs[i-1]
        down = lows[i-1] - lows[i]
        pdm = up if up > down and up > 0 else 0
        ndm = down if down > up and down > 0 else 0
        tr_list.append(tr)
        pdm_list.append(pdm)
        ndm_list.append(ndm)

    # Wilder smoothing
    atr = sum(tr_list[:period]) / period
    apdm = sum(pdm_list[:period]) / period
    andm = sum(ndm_list[:period]) / period

    dx_list = []
    for i in range(period, len(tr_list)):
        atr = (atr * (period - 1) + tr_list[i]) / period
        apdm = (apdm * (period - 1) + pdm_list[i]) / period
        andm = (andm * (period - 1) + ndm_list[i]) / period

        pdi = (apdm / atr * 100) if atr > 0 else 0
        ndi = (andm / atr * 100) if atr > 0 else 0
        dx = abs(pdi - ndi) / (pdi + ndi) * 100 if (pdi + ndi) > 0 else 0
        dx_list.append(dx)

    if len(dx_list) < period:
        return None

    adx_val = sum(dx_list[:period]) / period
    for i in range(period, len(dx_list)):
        adx_val = (adx_val * (period - 1) + dx_list[i]) / period

    return adx_val


# Symbols to scan
symbols = [
    ('WIF/USDT:USDT', 'WIF', 'small'),
    ('INJ/USDT:USDT', 'INJ', 'small'),
    ('OP/USDT:USDT', 'OP', 'mid'),
    ('DOT/USDT:USDT', 'DOT', 'mid'),
    ('LINK/USDT:USDT', 'LINK', 'mid'),
    ('SEI/USDT:USDT', 'SEI', 'small'),
    ('DOGE/USDT:USDT', 'DOGE', 'mid'),
    ('NEAR/USDT:USDT', 'NEAR', 'mid'),
    ('TAO/USDT:USDT', 'TAO', 'mid'),
    ('SUI/USDT:USDT', 'SUI', 'mid'),
    ('AVAX/USDT:USDT', 'AVAX', 'mid'),
    ('ARB/USDT:USDT', 'ARB', 'mid'),
    ('APT/USDT:USDT', 'APT', 'mid'),
    ('ONDO/USDT:USDT', 'ONDO', 'mid'),
]

now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
print('=' * 80)
print(f'  EFR v1.1 + FRC v1.0 DETAILED ALT SCAN — {now}')
print('=' * 80)

results = []

for sym, short, tier in symbols:
    try:
        data = fetch('ohlcv', symbol=sym, timeframe='4h', limit=100)
        candles = data.get('ohlcv', [])
        if not candles or len(candles) < 30:
            print(f'\n  {short}: INSUFFICIENT DATA ({len(candles) if candles else 0} candles)')
            continue

        closes = [c['close'] for c in candles]
        price = closes[-1]

        rsi, rsi_prev = compute_rsi(closes)
        e8 = ema(closes, 8)
        e21 = ema(closes, 21)
        e55 = ema(closes, 55)
        macd_line, signal, hist, prev_hist = compute_macd(closes)
        bb_upper, bb_mid, bb_lower = bb(closes)
        adx_val = adx(candles)

        rising = 'RISING' if (rsi and rsi_prev and rsi > rsi_prev) else 'FALLING'

        if e8 and e21 and e55:
            if e8 > e21 > e55:
                ribbon = 'BULL'
            elif e55 > e21 > e8:
                ribbon = 'BEAR'
            else:
                ribbon = 'MIXED'
            pct_below_55 = ((price - e55) / e55) * 100
        else:
            ribbon = 'N/A'
            pct_below_55 = 0

        # EFR score (5 conditions)
        efr_score = 0
        efr_details = []

        # 1. RSI < 35 and rising
        if rsi and rsi < 35 and rising == 'RISING':
            efr_score += 1
            efr_details.append(f'RSI<35+rising({rsi:.1f})')

        # 2. Price near BB lower (within 2%)
        if bb_lower and price < bb_lower * 1.02:
            efr_score += 1
            efr_details.append('Near BB lower')

        # 3. MACD hist negative but improving
        if hist is not None and prev_hist is not None and hist < 0 and hist > prev_hist:
            efr_score += 1
            efr_details.append('MACD improving')

        # 4. RSI crosses above 30 (entry trigger)
        if rsi and rsi_prev and rsi > 30 and rsi_prev <= 30:
            efr_score += 1
            efr_details.append('RSI CROSS >30!')

        # 5. EMA(8) crosses above EMA(21)
        if e8 and e21 and e8 > e21:
            efr_score += 1
            efr_details.append('EMA(8)>EMA(21)')

        # FRC check
        frc_gate = 'PASS' if (e55 and price > e55) else 'BLOCKED'

        # Strategy assessment
        if rsi and rsi < 30:
            status = '*** EXTREME ZONE (RSI<30) ***'
        elif rsi and rsi < 35 and rising == 'RISING':
            status = 'SETUP FORMING (RSI<35, rising)'
        elif rsi and rsi < 35:
            status = 'APPROACHING (RSI<35, not rising)'
        elif rsi and rsi < 40:
            status = 'MONITOR (RSI 35-40)'
        else:
            status = 'NOT TRIGGERED'

        result = {
            'symbol': short, 'tier': tier, 'price': price,
            'rsi': rsi, 'rsi_prev': rsi_prev, 'rising': rising,
            'adx': adx_val, 'ribbon': ribbon, 'pct_ema55': pct_below_55,
            'efr_score': efr_score, 'frc_gate': frc_gate, 'status': status,
        }
        results.append(result)

        print(f'\n  {short} ({tier}) — ${price}')
        print(f'    RSI(14):  {rsi:.1f} ({rising}, prev: {rsi_prev:.1f})')
        print(f'    ADX(14):  {adx_val:.1f}' if adx_val else '    ADX: N/A')
        print(f'    EMA:      8={e8:.6f}  21={e21:.6f}  55={e55:.6f}')
        print(f'    Ribbon:   {ribbon} | Price vs EMA(55): {pct_below_55:+.2f}%')
        if hist is not None:
            improving = 'IMPROVING' if (prev_hist is not None and hist > prev_hist) else 'WORSENING'
            print(f'    MACD:     hist={hist:.6f} ({improving})')
        if bb_lower:
            bb_dist = ((price - bb_lower) / bb_lower) * 100
            print(f'    BB(20,2): L={bb_lower:.6f} | Price vs Lower: {bb_dist:+.2f}%')
        print(f'    EFR:      {efr_score}/5 [{", ".join(efr_details) if efr_details else "none"}]')
        print(f'    FRC Gate: {frc_gate} (price {">" if frc_gate == "PASS" else "<"} EMA55)')
        print(f'    >>> {status}')

    except Exception as e:
        print(f'\n  {short}: ERROR — {e}')

    time.sleep(DELAY)

# Summary table
print('\n' + '=' * 80)
print('  SUMMARY TABLE')
print('=' * 80)
print(f'  {"Symbol":<8} {"Tier":<8} {"Price":>10} {"RSI":>6} {"Dir":>8} {"ADX":>6} {"Ribbon":<6} {"EFR":>5} {"FRC":<8} {"Status"}')
print('  ' + '-' * 90)
for r in sorted(results, key=lambda x: x.get('rsi', 100) or 100):
    rsi_str = f"{r['rsi']:.1f}" if r['rsi'] else 'N/A'
    adx_str = f"{r.get('adx', 0):.1f}" if r.get('adx') else 'N/A'
    print(f"  {r['symbol']:<8} {r['tier']:<8} {r['price']:>10.4f} {rsi_str:>6} {r['rising']:>8} {adx_str:>6} {r['ribbon']:<6} {r['efr_score']:>3}/5 {r['frc_gate']:<8} {r['status']}")

print('\n  SCAN COMPLETE')
