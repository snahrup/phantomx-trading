#!/usr/bin/env python3
"""Full universe scanner — all mandatory symbols with RSI, EMA, MACD, ADX, volume."""
import json, time, subprocess, sys, math
from datetime import datetime, timezone

API = 'http://localhost:3100/api/phemex'
DELAY = 2.0  # Rate limit between calls

MICRO_CAPS = [
    "GUN/USDT:USDT", "PHA/USDT:USDT", "FLOW/USDT:USDT", "HOOK/USDT:USDT",
    "ACH/USDT:USDT", "JASMY/USDT:USDT", "MAGIC/USDT:USDT", "SPELL/USDT:USDT",
    "TURBO/USDT:USDT", "POPCAT/USDT:USDT", "MEW/USDT:USDT", "BOME/USDT:USDT",
    "PNUT/USDT:USDT", "ACT/USDT:USDT", "GOAT/USDT:USDT", "MOODENG/USDT:USDT",
    "FARTCOIN/USDT:USDT", "AIXBT/USDT:USDT", "TRUMP/USDT:USDT", "ANIME/USDT:USDT",
    "MUBARAK/USDT:USDT", "PARTI/USDT:USDT", "STO/USDT:USDT", "PIPPIN/USDT:USDT",
    "GRIFFAIN/USDT:USDT", "ZEREBRO/USDT:USDT", "SWARMS/USDT:USDT", "COOKIE/USDT:USDT",
    "1000PEPE/USDT:USDT", "1000FLOKI/USDT:USDT", "1000BONK/USDT:USDT",
    "1000SHIB/USDT:USDT", "SPX/USDT:USDT", "DRIFT/USDT:USDT", "BAN/USDT:USDT",
    "RED/USDT:USDT", "KAITO/USDT:USDT", "FORM/USDT:USDT", "EPIC/USDT:USDT",
    "LAYER/USDT:USDT", "IP/USDT:USDT", "SHELL/USDT:USDT", "GPS/USDT:USDT",
    "RSR/USDT:USDT", "MTL/USDT:USDT", "SKL/USDT:USDT", "AGLD/USDT:USDT",
    "ANKR/USDT:USDT", "PEOPLE/USDT:USDT", "HIGH/USDT:USDT", "LQTY/USDT:USDT",
    "TRU/USDT:USDT", "SUPER/USDT:USDT", "BIGTIME/USDT:USDT", "MEME/USDT:USDT",
    "CHILLGUY/USDT:USDT", "1000CAT/USDT:USDT", "1000CHEEMS/USDT:USDT",
    "1000WHY/USDT:USDT", "1000000BABYDOGE/USDT:USDT", "1000000MOG/USDT:USDT"
]

MID_CAPS = [
    "WIF/USDT:USDT", "DYDX/USDT:USDT", "GMX/USDT:USDT", "RUNE/USDT:USDT",
    "LDO/USDT:USDT", "CRV/USDT:USDT", "COMP/USDT:USDT", "GALA/USDT:USDT",
    "SAND/USDT:USDT", "MANA/USDT:USDT", "AXS/USDT:USDT", "THETA/USDT:USDT",
    "GRT/USDT:USDT", "AR/USDT:USDT", "PYTH/USDT:USDT", "TIA/USDT:USDT",
    "ORDI/USDT:USDT", "MASK/USDT:USDT", "BLUR/USDT:USDT", "ENJ/USDT:USDT",
    "SUSHI/USDT:USDT", "KAS/USDT:USDT", "STRK/USDT:USDT", "ETHFI/USDT:USDT",
    "ENA/USDT:USDT", "WLD/USDT:USDT", "BEAM/USDT:USDT", "EIGEN/USDT:USDT",
    "GRASS/USDT:USDT", "HYPE/USDT:USDT", "VIRTUAL/USDT:USDT", "PENGU/USDT:USDT",
    "BERA/USDT:USDT", "SONIC/USDT:USDT"
]

LARGE_CAPS = [
    "BTC/USDT:USDT", "ETH/USDT:USDT", "XRP/USDT:USDT", "SOL/USDT:USDT",
    "BNB/USDT:USDT", "ADA/USDT:USDT", "DOGE/USDT:USDT", "LINK/USDT:USDT",
    "DOT/USDT:USDT", "AVAX/USDT:USDT", "TON/USDT:USDT", "TRX/USDT:USDT",
    "NEAR/USDT:USDT", "UNI/USDT:USDT", "ATOM/USDT:USDT", "LTC/USDT:USDT",
    "BCH/USDT:USDT", "HBAR/USDT:USDT", "SUI/USDT:USDT", "FIL/USDT:USDT",
    "ICP/USDT:USDT", "AAVE/USDT:USDT", "ARB/USDT:USDT", "OP/USDT:USDT",
    "INJ/USDT:USDT", "STX/USDT:USDT", "RENDER/USDT:USDT", "FET/USDT:USDT",
    "SEI/USDT:USDT", "APT/USDT:USDT", "TAO/USDT:USDT", "ONDO/USDT:USDT",
    "JUP/USDT:USDT"
]


def fetch(action, **kwargs):
    payload = json.dumps({"action": action, **kwargs})
    r = subprocess.run(
        ['curl', '-s', API, '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload],
        capture_output=True, text=True, timeout=15
    )
    return json.loads(r.stdout)


def ema_val(data, period):
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


def rsi_calc(closes, period=14):
    if len(closes) < period + 1:
        return None, None
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(0, diff))
        losses.append(max(0, -diff))
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    prev_rsi = None
    current_rsi = None
    for i in range(period, len(gains)):
        if avg_loss == 0:
            current_rsi = 100
        else:
            rs = avg_gain / avg_loss
            current_rsi = 100 - (100 / (1 + rs))
        if i == len(gains) - 1:
            prev_rsi = current_rsi  # will be overwritten
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    # Compute final
    if avg_loss == 0:
        final_rsi = 100
    else:
        rs = avg_gain / avg_loss
        final_rsi = 100 - (100 / (1 + rs))
    return final_rsi, current_rsi  # current, previous


def macd_calc(closes, fast=12, slow=26, signal=9):
    ema_f = ema_series(closes, fast)
    ema_s = ema_series(closes, slow)
    if not ema_f or not ema_s:
        return None, None
    macd_line = []
    for f, s in zip(ema_f, ema_s):
        if f is not None and s is not None:
            macd_line.append(f - s)
    if len(macd_line) < signal:
        return None, None
    sig = ema_val(macd_line, signal)
    hist = macd_line[-1] - sig if sig is not None else None
    # Previous hist
    prev_valid = macd_line[:-1]
    prev_sig = ema_val(prev_valid, signal) if len(prev_valid) >= signal else None
    prev_hist = prev_valid[-1] - prev_sig if prev_sig is not None else None
    return hist, prev_hist


def adx_approx(candles, period=14):
    if len(candles) < period * 2:
        return None
    plus_dm, minus_dm, tr_list = [], [], []
    for i in range(1, len(candles)):
        h, l = candles[i]['high'], candles[i]['low']
        ph, pl, pc = candles[i-1]['high'], candles[i-1]['low'], candles[i-1]['close']
        up = h - ph
        down = pl - l
        plus_dm.append(up if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        tr = max(h - l, abs(h - pc), abs(l - pc))
        tr_list.append(tr)
    atr = sum(tr_list[:period]) / period
    sp = sum(plus_dm[:period]) / period
    sm = sum(minus_dm[:period]) / period
    for i in range(period, len(tr_list)):
        atr = (atr * (period - 1) + tr_list[i]) / period
        sp = (sp * (period - 1) + plus_dm[i]) / period
        sm = (sm * (period - 1) + minus_dm[i]) / period
    pdi = (sp / atr * 100) if atr > 0 else 0
    mdi = (sm / atr * 100) if atr > 0 else 0
    dx = abs(pdi - mdi) / (pdi + mdi) * 100 if (pdi + mdi) > 0 else 0
    return dx


def analyze(symbol):
    data = fetch('ohlcv', symbol=symbol, timeframe='4h', limit=60)
    candles = data.get('ohlcv', [])
    if not candles or len(candles) < 20:
        return None

    closes = [c['close'] for c in candles]
    highs = [c['high'] for c in candles]
    lows = [c['low'] for c in candles]
    vols = [c['volume'] for c in candles]

    close = closes[-1]
    e8 = ema_val(closes, 8)
    e21 = ema_val(closes, 21)
    e55 = ema_val(closes, 55) if len(closes) >= 55 else None

    rsi_now, rsi_prev = rsi_calc(closes, 14)
    macd_hist, macd_prev_hist = macd_calc(closes)
    adx_val = adx_approx(candles)

    avg_vol = sum(vols) / len(vols) if vols else 0
    vol_ratio = vols[-1] / avg_vol if avg_vol > 0 else 0

    # Period change
    pct_change = ((close - closes[0]) / closes[0]) * 100

    # Ribbon
    if e8 and e21 and e55:
        if e8 > e21 > e55:
            ribbon = "BULL"
        elif e55 > e21 > e8:
            ribbon = "BEAR"
        else:
            ribbon = "MIXED"
    elif e8 and e21:
        if e8 > e21:
            ribbon = "BULL*"
        elif e21 > e8:
            ribbon = "BEAR*"
        else:
            ribbon = "FLAT"
    else:
        ribbon = "N/A"

    # RSI direction
    rsi_dir = None
    if rsi_now is not None and rsi_prev is not None:
        rsi_dir = "RISING" if rsi_now > rsi_prev else "FALLING"

    # MACD direction
    macd_dir = None
    if macd_hist is not None and macd_prev_hist is not None:
        macd_dir = "IMPROVING" if macd_hist > macd_prev_hist else "WORSENING"

    # Price vs EMA55
    ema55_dist = None
    if e55 and e55 > 0:
        ema55_dist = ((close - e55) / e55) * 100

    # Flags
    flags = []
    if rsi_now is not None and rsi_now < 30:
        flags.append("RSI<30")
    elif rsi_now is not None and rsi_now < 35:
        flags.append("RSI<35")
    if rsi_now is not None and rsi_now > 70:
        flags.append("RSI>70")
    if vol_ratio > 2.0:
        flags.append("VOL>2x")
    if ribbon == "BULL" and adx_val and adx_val > 25:
        flags.append("TREND_UP")
    if ribbon == "BEAR" and adx_val and adx_val > 25:
        flags.append("TREND_DN")
    if macd_hist is not None and macd_prev_hist is not None:
        if macd_hist > 0 and macd_prev_hist <= 0:
            flags.append("MACD_CROSS_UP")
        elif macd_hist < 0 and macd_prev_hist >= 0:
            flags.append("MACD_CROSS_DN")
    if rsi_now is not None and rsi_prev is not None:
        if rsi_now > 30 and rsi_prev <= 30:
            flags.append("RSI_CROSS_30")

    # EFR setup check (expanded to all symbols per v1.1)
    efr_setup = False
    efr_trigger = False
    if rsi_now is not None and rsi_now < 35 and rsi_dir == "RISING":
        efr_setup = True
    if (rsi_now is not None and rsi_prev is not None and
        rsi_now > 30 and rsi_prev <= 30 and
        macd_hist is not None and macd_hist > 0 and
        e8 is not None and e21 is not None and e8 > e21):
        efr_trigger = True
        flags.append("EFR_TRIGGER")
    elif efr_setup:
        flags.append("EFR_SETUP")

    return {
        'symbol': symbol,
        'short': symbol.split('/')[0],
        'close': close,
        'pct_change': round(pct_change, 2),
        'rsi': round(rsi_now, 1) if rsi_now else None,
        'rsi_dir': rsi_dir,
        'macd_hist': round(macd_hist, 6) if macd_hist else None,
        'macd_dir': macd_dir,
        'adx': round(adx_val, 1) if adx_val else None,
        'ribbon': ribbon,
        'ema55_dist': round(ema55_dist, 2) if ema55_dist else None,
        'vol_ratio': round(vol_ratio, 2),
        'flags': flags,
        'efr_setup': efr_setup,
        'efr_trigger': efr_trigger,
    }


def scan_batch(symbols, label):
    print(f"\n{'='*80}")
    print(f"  {label} ({len(symbols)} symbols)")
    print(f"{'='*80}")
    print(f"{'SYM':>12} | {'PRICE':>12} | {'CHG':>7} | {'RSI':>6} {'DIR':>5} | {'MACD':>6} | {'ADX':>5} | {'RIBBON':>6} | {'VOL':>5} | FLAGS")
    print(f"{'-'*100}")

    results = []
    errors = []
    for sym in symbols:
        short = sym.split('/')[0]
        try:
            r = analyze(sym)
            if r is None:
                print(f"{short:>12} | {'NO DATA':>12} |")
                errors.append(short)
                time.sleep(DELAY)
                continue
            rsi_str = f"{r['rsi']:.1f}" if r['rsi'] else "N/A"
            rsi_d = (r['rsi_dir'] or "?")[:3]
            macd_d = (r['macd_dir'] or "?")[:3]
            adx_str = f"{r['adx']:.0f}" if r['adx'] else "N/A"
            flag_str = " ".join(r['flags']) if r['flags'] else ""
            print(f"{r['short']:>12} | {r['close']:>12.6g} | {r['pct_change']:+6.1f}% | {rsi_str:>6} {rsi_d:>5} | {macd_d:>6} | {adx_str:>5} | {r['ribbon']:>6} | {r['vol_ratio']:.1f}x | {flag_str}")
            results.append(r)
        except Exception as e:
            print(f"{short:>12} | ERROR: {e}")
            errors.append(short)
        time.sleep(DELAY)

    return results, errors


def main():
    now = datetime.now(timezone.utc)
    ts = now.strftime('%Y-%m-%d %H:%M UTC')
    print(f"{'='*80}")
    print(f"  PHANTOM TRADING CO. — FULL UNIVERSE SCAN")
    print(f"  Scanner/Monitor Heartbeat | {ts}")
    print(f"  Mode: MANUAL | Account: $154.93 | Positions: FLAT")
    print(f"{'='*80}")

    all_results = []
    all_errors = []

    # Tier 1: Micro-caps (PRIORITY)
    r, e = scan_batch(MICRO_CAPS, "TIER 1: MICRO-CAPS (Steve's Focus)")
    all_results.extend(r)
    all_errors.extend(e)

    # Tier 2: Mid-caps
    r, e = scan_batch(MID_CAPS, "TIER 2: MID-CAPS")
    all_results.extend(r)
    all_errors.extend(e)

    # Tier 3: Large-caps
    r, e = scan_batch(LARGE_CAPS, "TIER 3: LARGE-CAPS")
    all_results.extend(r)
    all_errors.extend(e)

    # Summary
    print(f"\n{'='*80}")
    print(f"  SCAN SUMMARY")
    print(f"{'='*80}")
    print(f"  Scanned: {len(all_results)}/{len(MICRO_CAPS) + len(MID_CAPS) + len(LARGE_CAPS)}")
    print(f"  Errors: {len(all_errors)} ({', '.join(all_errors) if all_errors else 'none'})")

    # Flagged symbols
    flagged = [r for r in all_results if r['flags']]
    oversold = [r for r in all_results if r['rsi'] is not None and r['rsi'] < 35]
    overbought = [r for r in all_results if r['rsi'] is not None and r['rsi'] > 70]
    efr_setups = [r for r in all_results if r['efr_setup']]
    efr_triggers = [r for r in all_results if r['efr_trigger']]
    vol_spikes = [r for r in all_results if r['vol_ratio'] > 2.0]
    trending_up = [r for r in all_results if 'TREND_UP' in r['flags']]
    trending_dn = [r for r in all_results if 'TREND_DN' in r['flags']]

    print(f"\n  OVERSOLD (RSI < 35): {len(oversold)}")
    for r in sorted(oversold, key=lambda x: x['rsi']):
        print(f"    {r['short']:>12}: RSI {r['rsi']:.1f} {r['rsi_dir']} | {r['ribbon']} | {r['pct_change']:+.1f}%")

    print(f"\n  OVERBOUGHT (RSI > 70): {len(overbought)}")
    for r in sorted(overbought, key=lambda x: -x['rsi']):
        print(f"    {r['short']:>12}: RSI {r['rsi']:.1f} {r['rsi_dir']} | {r['ribbon']} | {r['pct_change']:+.1f}%")

    print(f"\n  EFR SETUPS FORMING: {len(efr_setups)}")
    for r in efr_setups:
        print(f"    {r['short']:>12}: RSI {r['rsi']:.1f} {r['rsi_dir']} | MACD {r['macd_dir']} | {r['ribbon']}")

    print(f"\n  EFR TRIGGERS: {len(efr_triggers)}")
    for r in efr_triggers:
        print(f"    *** {r['short']:>12}: RSI {r['rsi']:.1f} | MACD hist > 0 | EMA8 > EMA21 ***")

    print(f"\n  VOLUME SPIKES (>2x): {len(vol_spikes)}")
    for r in vol_spikes:
        print(f"    {r['short']:>12}: {r['vol_ratio']:.1f}x avg | {r['pct_change']:+.1f}% | {r['ribbon']}")

    print(f"\n  TRENDING UP (ADX>25, BULL ribbon): {len(trending_up)}")
    for r in trending_up:
        print(f"    {r['short']:>12}: ADX {r['adx']:.0f} | RSI {r['rsi']:.1f} | {r['pct_change']:+.1f}%")

    print(f"\n  TRENDING DOWN (ADX>25, BEAR ribbon): {len(trending_dn)}")
    for r in trending_dn:
        print(f"    {r['short']:>12}: ADX {r['adx']:.0f} | RSI {r['rsi']:.1f} | {r['pct_change']:+.1f}%")

    # JSON output
    print("\n---SCAN_JSON---")
    output = {
        'timestamp': ts,
        'total_scanned': len(all_results),
        'total_errors': len(all_errors),
        'errors': all_errors,
        'oversold_count': len(oversold),
        'overbought_count': len(overbought),
        'efr_setups_count': len(efr_setups),
        'efr_triggers_count': len(efr_triggers),
        'vol_spikes_count': len(vol_spikes),
        'trending_up_count': len(trending_up),
        'trending_dn_count': len(trending_dn),
        'oversold': [{'s': r['short'], 'rsi': r['rsi'], 'dir': r['rsi_dir'], 'chg': r['pct_change']} for r in sorted(oversold, key=lambda x: x['rsi'])],
        'efr_setups': [{'s': r['short'], 'rsi': r['rsi'], 'dir': r['rsi_dir'], 'macd': r['macd_dir']} for r in efr_setups],
        'efr_triggers': [{'s': r['short'], 'rsi': r['rsi']} for r in efr_triggers],
        'vol_spikes': [{'s': r['short'], 'vol': r['vol_ratio'], 'chg': r['pct_change']} for r in vol_spikes],
        'results': all_results,
    }
    print(json.dumps(output))


if __name__ == '__main__':
    main()
