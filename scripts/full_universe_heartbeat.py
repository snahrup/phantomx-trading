#!/usr/bin/env python3
"""Full universe heartbeat scan — computes RSI(14), EMA(8/21/55), MACD, funding for ALL mandatory symbols."""
import json, time, subprocess, sys, math
from datetime import datetime, timezone

API = 'http://localhost:3100/api/phemex'
DELAY = 2.0  # Rate limit spacing
OHLCV_LIMIT = 100  # Enough for RSI(14), EMA(55), MACD(26)

# Load mandatory scan list
try:
    with open('knowledge/mandatory-scan-list.json') as f:
        scan_list = json.load(f)
    MICRO = scan_list['priority_micro_caps']['symbols']
    MID = scan_list['mid_caps']['symbols']
    LARGE = scan_list['large_caps']['symbols']
except Exception as e:
    print(f"ERROR loading scan list: {e}")
    sys.exit(1)

def fetch(action, **kwargs):
    payload = json.dumps({"action": action, **kwargs})
    try:
        r = subprocess.run(
            ['curl', '-s', API, '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload],
            capture_output=True, text=True, timeout=20
        )
        return json.loads(r.stdout)
    except Exception as e:
        return {"error": str(e)}

def ema(closes, period):
    if len(closes) < period:
        return None
    k = 2 / (period + 1)
    val = sum(closes[:period]) / period
    for c in closes[period:]:
        val = c * k + val * (1 - k)
    return val

def rsi(closes, period=14):
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i-1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    # Wilder's smoothed RSI
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def macd(closes, fast=12, slow=26, signal=9):
    if len(closes) < slow + signal:
        return None, None, None
    ema_fast = None
    ema_slow = None
    k_fast = 2 / (fast + 1)
    k_slow = 2 / (slow + 1)
    macd_line = []
    for i, c in enumerate(closes):
        if i == 0:
            ema_fast = c
            ema_slow = c
        else:
            ema_fast = c * k_fast + ema_fast * (1 - k_fast)
            ema_slow = c * k_slow + ema_slow * (1 - k_slow)
        if i >= slow - 1:
            macd_line.append(ema_fast - ema_slow)
    if len(macd_line) < signal:
        return None, None, None
    k_sig = 2 / (signal + 1)
    sig_val = sum(macd_line[:signal]) / signal
    for m in macd_line[signal:]:
        sig_val = m * k_sig + sig_val * (1 - k_sig)
    hist = macd_line[-1] - sig_val
    # Check if histogram is improving (compare last 2 values if possible)
    if len(macd_line) >= 2:
        prev_hist = macd_line[-2] - (sig_val)  # approximation
        hist_dir = 'IMPROVING' if hist > prev_hist else 'WORSENING'
    else:
        hist_dir = 'N/A'
    return macd_line[-1], sig_val, hist

def analyze_pair(pair):
    data = fetch('ohlcv', symbol=pair, timeframe='4h', limit=OHLCV_LIMIT)
    candles = data.get('ohlcv', [])
    if not candles or len(candles) < 30:
        return None

    closes = [c['close'] for c in candles]
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    vols = [c['volume'] for c in candles]

    price = closes[-1]
    pct_24h = ((closes[-1] - closes[-7]) / closes[-7]) * 100 if len(closes) >= 7 else 0  # ~24h on 4h candles

    # RSI(14)
    rsi_val = rsi(closes, 14)

    # EMAs
    ema8 = ema(closes, 8)
    ema21 = ema(closes, 21)
    ema55 = ema(closes, 55)

    # EMA structure
    if ema8 and ema21 and ema55:
        if ema8 > ema21 > ema55:
            ema_struct = 'BULL'
        elif ema8 < ema21 < ema55:
            ema_struct = 'BEAR'
        else:
            ema_struct = 'MIXED'
        price_vs_ema55 = ((price - ema55) / ema55) * 100
    else:
        ema_struct = 'N/A'
        price_vs_ema55 = None

    # MACD
    macd_val, macd_sig, macd_hist = macd(closes)

    # MACD histogram direction (last 3 candles)
    if len(closes) >= 30:
        # Compute MACD for last few points to get histogram direction
        m1, s1, h1 = macd(closes[:-1])
        if h1 is not None and macd_hist is not None:
            macd_dir = 'IMPROVING' if macd_hist > h1 else 'WORSENING'
        else:
            macd_dir = 'N/A'
    else:
        macd_dir = 'N/A'

    # Volume
    avg_vol = sum(vols[-20:]) / min(len(vols), 20)
    latest_vol = vols[-1]
    vol_ratio = latest_vol / avg_vol if avg_vol > 0 else 0

    # Flags
    flags = []
    if rsi_val and rsi_val < 30: flags.append('RSI_EXTREME')
    if rsi_val and rsi_val < 35: flags.append('RSI_LOW')
    if vol_ratio > 2.0: flags.append('VOL_SPIKE')
    if ema_struct == 'BULL': flags.append('EMA_BULL')
    if price_vs_ema55 and price_vs_ema55 > 0: flags.append('ABOVE_EMA55')
    if macd_dir == 'IMPROVING': flags.append('MACD_IMPROVING')
    if abs(pct_24h) > 8: flags.append('BIG_MOVE')

    return {
        'pair': pair,
        'sym': pair.split('/')[0],
        'price': price,
        'pct_24h': round(pct_24h, 2),
        'rsi14': round(rsi_val, 1) if rsi_val else None,
        'ema8': round(ema8, 8) if ema8 else None,
        'ema21': round(ema21, 8) if ema21 else None,
        'ema55': round(ema55, 8) if ema55 else None,
        'ema_struct': ema_struct,
        'price_vs_ema55': round(price_vs_ema55, 2) if price_vs_ema55 else None,
        'macd_hist': round(macd_hist, 8) if macd_hist else None,
        'macd_dir': macd_dir,
        'vol_ratio': round(vol_ratio, 2),
        'flags': flags,
    }

def get_funding(pair):
    try:
        data = fetch('funding_rate', symbol=pair)
        if 'error' not in data and 'fundingRate' in data:
            rate = data['fundingRate']
            ann = rate * 3 * 365 * 100  # 8h periods -> annual %
            return round(rate * 100, 4), round(ann, 1)
        return None, None
    except:
        return None, None

def scan_batch(symbols, label):
    now = datetime.now(timezone.utc).strftime('%H:%M UTC')
    print(f'\n{"="*80}')
    print(f'  {label} SCAN — {len(symbols)} symbols — {now}')
    print(f'{"="*80}')
    print(f'{"SYM":>12} | {"PRICE":>12} | {"24h":>7} | {"RSI14":>5} | {"EMA":>5} | {"vs55":>7} | {"MACD":>8} | {"VOL":>5} | FLAGS')
    print('-' * 100)

    results = []
    for pair in symbols:
        sym = pair.split('/')[0]
        try:
            r = analyze_pair(pair)
            if r is None:
                print(f'{sym:>12} | {"NO DATA":>12} |')
                time.sleep(DELAY)
                continue

            rsi_str = f'{r["rsi14"]:5.1f}' if r['rsi14'] else '  N/A'
            vs55_str = f'{r["price_vs_ema55"]:+6.1f}%' if r['price_vs_ema55'] is not None else '    N/A'
            macd_str = r['macd_dir'][:4] if r['macd_dir'] != 'N/A' else 'N/A '
            flag_str = ' '.join(r['flags']) if r['flags'] else ''

            # Highlight extreme RSI
            rsi_marker = '!!' if r['rsi14'] and r['rsi14'] < 30 else ('! ' if r['rsi14'] and r['rsi14'] < 35 else '  ')

            print(f'{sym:>12} | {r["price"]:>12.6g} | {r["pct_24h"]:+6.1f}% | {rsi_str}{rsi_marker}| {r["ema_struct"]:>5} | {vs55_str} | {macd_str:>8} | {r["vol_ratio"]:4.1f}x | {flag_str}')
            results.append(r)
        except Exception as e:
            print(f'{sym:>12} | ERROR: {e}')
        time.sleep(DELAY)

    return results

def scan_funding_batch(results):
    """Fetch funding for flagged symbols only (rate limit conservation)."""
    # Only fetch funding for symbols with RSI < 40 or MACD improving
    candidates = [r for r in results if (r.get('rsi14') and r['rsi14'] < 40) or 'MACD_IMPROVING' in r.get('flags', [])]
    if not candidates:
        return {}

    print(f'\n--- Funding rates for {len(candidates)} candidates ---')
    funding_data = {}
    for r in candidates:
        rate_pct, ann_pct = get_funding(r['pair'])
        if rate_pct is not None:
            funding_data[r['sym']] = {'rate_8h': rate_pct, 'annualized': ann_pct}
            neg_marker = ' ** NEGATIVE **' if rate_pct < 0 else ''
            print(f'  {r["sym"]:>12}: {rate_pct:+.4f}%/8h ({ann_pct:+.1f}% ann){neg_marker}')
        time.sleep(DELAY)
    return funding_data

def main():
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    print(f'{"="*56}')
    print(f'  PHANTOM TRADING CO -- FULL UNIVERSE HEARTBEAT SCAN')
    print(f'  {now}')
    print(f'  Mode: MANUAL | Symbols: {len(MICRO)+len(MID)+len(LARGE)}')
    print(f'{"="*56}')

    all_results = []
    all_funding = {}

    # PRIORITY 1: Micro-caps
    micro_results = scan_batch(MICRO, f'MICRO-CAP (PRIORITY 1)')
    all_results.extend(micro_results)
    micro_funding = scan_funding_batch(micro_results)
    all_funding.update(micro_funding)

    # PRIORITY 2: Mid-caps
    mid_results = scan_batch(MID, f'MID-CAP')
    all_results.extend(mid_results)
    mid_funding = scan_funding_batch(mid_results)
    all_funding.update(mid_funding)

    # PRIORITY 3: Large-caps
    large_results = scan_batch(LARGE, f'LARGE-CAP')
    all_results.extend(large_results)
    large_funding = scan_funding_batch(large_results)
    all_funding.update(large_funding)

    # Summary
    print(f'\n{"="*80}')
    print(f'  SCAN SUMMARY — {now}')
    print(f'{"="*80}')
    print(f'  Total scanned: {len(all_results)}/{len(MICRO)+len(MID)+len(LARGE)}')

    # RSI extremes
    rsi_extreme = [r for r in all_results if r.get('rsi14') and r['rsi14'] < 30]
    rsi_low = [r for r in all_results if r.get('rsi14') and 30 <= r['rsi14'] < 35]
    macd_improving = [r for r in all_results if 'MACD_IMPROVING' in r.get('flags', [])]
    above_ema55 = [r for r in all_results if 'ABOVE_EMA55' in r.get('flags', [])]
    vol_spikes = [r for r in all_results if 'VOL_SPIKE' in r.get('flags', [])]
    ema_bull = [r for r in all_results if r.get('ema_struct') == 'BULL']
    big_moves = [r for r in all_results if 'BIG_MOVE' in r.get('flags', [])]
    neg_funding = {k: v for k, v in all_funding.items() if v['rate_8h'] < 0}

    print(f'\n  RSI < 30 (EXTREME):  {len(rsi_extreme)}')
    for r in sorted(rsi_extreme, key=lambda x: x['rsi14']):
        fund = all_funding.get(r['sym'], {})
        fund_str = f" | Funding: {fund.get('rate_8h', 'N/A')}%/8h" if fund else ""
        print(f'    {r["sym"]:>12}: RSI {r["rsi14"]:5.1f} | {r["pct_24h"]:+6.1f}% | {r["ema_struct"]} | vs EMA55: {r.get("price_vs_ema55","N/A")}%{fund_str}')

    print(f'\n  RSI 30-35 (LOW):     {len(rsi_low)}')
    for r in sorted(rsi_low, key=lambda x: x['rsi14']):
        fund = all_funding.get(r['sym'], {})
        fund_str = f" | Funding: {fund.get('rate_8h', 'N/A')}%/8h" if fund else ""
        print(f'    {r["sym"]:>12}: RSI {r["rsi14"]:5.1f} | {r["pct_24h"]:+6.1f}% | {r["ema_struct"]} | vs EMA55: {r.get("price_vs_ema55","N/A")}%{fund_str}')

    print(f'\n  MACD Improving:      {len(macd_improving)}')
    for r in macd_improving:
        print(f'    {r["sym"]:>12}: RSI {r.get("rsi14","N/A")} | {r["pct_24h"]:+6.1f}% | {r["ema_struct"]}')

    print(f'\n  Above EMA(55):       {len(above_ema55)}')
    for r in above_ema55:
        print(f'    {r["sym"]:>12}: {r["price_vs_ema55"]:+.1f}% above | {r["ema_struct"]}')

    print(f'\n  Volume Spikes (>2x): {len(vol_spikes)}')
    for r in vol_spikes:
        print(f'    {r["sym"]:>12}: {r["vol_ratio"]:.1f}x avg vol | {r["pct_24h"]:+6.1f}%')

    print(f'\n  EMA Bullish:         {len(ema_bull)}')
    print(f'  Negative Funding:    {len(neg_funding)}')
    for sym, fund in sorted(neg_funding.items(), key=lambda x: x[1]['annualized']):
        print(f'    {sym:>12}: {fund["rate_8h"]:+.4f}%/8h ({fund["annualized"]:+.1f}% ann)')

    print(f'\n  Big Moves (>8%):     {len(big_moves)}')
    for r in big_moves:
        print(f'    {r["sym"]:>12}: {r["pct_24h"]:+6.1f}% | RSI {r.get("rsi14","N/A")}')

    # EFR candidates (RSI < 35 + negative funding)
    efr_candidates = []
    for r in all_results:
        if r.get('rsi14') and r['rsi14'] < 35:
            fund = all_funding.get(r['sym'], {})
            if fund and fund.get('rate_8h', 0) < 0:
                efr_candidates.append({**r, 'funding': fund})

    if efr_candidates:
        print(f'\n  *** EFR CANDIDATES (RSI < 35 + Negative Funding): {len(efr_candidates)} ***')
        for r in sorted(efr_candidates, key=lambda x: x['rsi14']):
            print(f'    {r["sym"]:>12}: RSI {r["rsi14"]:5.1f} | Funding {r["funding"]["rate_8h"]:+.4f}%/8h ({r["funding"]["annualized"]:+.1f}% ann) | {r["ema_struct"]} | vs55: {r.get("price_vs_ema55","N/A")}%')

    # JSON output
    output = {
        'timestamp': now,
        'mode': 'manual',
        'total_scanned': len(all_results),
        'total_universe': len(MICRO) + len(MID) + len(LARGE),
        'summary': {
            'rsi_extreme_count': len(rsi_extreme),
            'rsi_low_count': len(rsi_low),
            'macd_improving_count': len(macd_improving),
            'above_ema55_count': len(above_ema55),
            'vol_spikes_count': len(vol_spikes),
            'ema_bull_count': len(ema_bull),
            'neg_funding_count': len(neg_funding),
            'efr_candidates_count': len(efr_candidates),
        },
        'rsi_extreme': [{'sym': r['sym'], 'rsi': r['rsi14'], 'pct_24h': r['pct_24h'], 'ema_struct': r['ema_struct']} for r in rsi_extreme],
        'efr_candidates': [{'sym': r['sym'], 'rsi': r['rsi14'], 'funding_8h': r['funding']['rate_8h'], 'funding_ann': r['funding']['annualized']} for r in efr_candidates],
        'funding': all_funding,
        'results': all_results,
    }

    print('\n---SCAN_JSON---')
    print(json.dumps(output))

if __name__ == '__main__':
    main()
