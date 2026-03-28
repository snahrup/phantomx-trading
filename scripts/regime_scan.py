#!/usr/bin/env python3
"""Strategy Architect — Regime Scanner & Signal Checker"""
import urllib.request, urllib.parse, json, time, sys

def api_call(action, params={}):
    data = json.dumps({"action": action, **params}).encode()
    req = urllib.request.Request("http://localhost:3100/api/phemex",
        data=data, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def ema(data, period):
    result = [data[0]]
    k = 2 / (period + 1)
    for i in range(1, len(data)):
        result.append(data[i] * k + result[-1] * (1 - k))
    return result

def rsi(data, period=14):
    deltas = [data[i] - data[i-1] for i in range(1, len(data))]
    gains = [max(d, 0) for d in deltas]
    losses = [abs(min(d, 0)) for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    result = []
    for i in range(period, len(deltas)):
        if avg_loss == 0:
            result.append(100)
        else:
            rs = avg_gain / avg_loss
            result.append(100 - (100 / (1 + rs)))
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    return result

def atr_calc(highs, lows, closes, period=14):
    trs = []
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        trs.append(tr)
    result = [sum(trs[:period]) / period]
    for i in range(period, len(trs)):
        result.append((result[-1] * (period - 1) + trs[i]) / period)
    return result

def adx_calc(highs, lows, closes, period=14):
    plus_dm = []
    minus_dm = []
    trs = []
    for i in range(1, len(closes)):
        up = highs[i] - highs[i-1]
        down = lows[i-1] - lows[i]
        plus_dm.append(up if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        trs.append(tr)
    sm_tr = sum(trs[:period])
    sm_plus = sum(plus_dm[:period])
    sm_minus = sum(minus_dm[:period])
    dx_vals = []
    pdi_last = mdi_last = 0
    for i in range(period, len(trs)):
        sm_tr = sm_tr - sm_tr / period + trs[i]
        sm_plus = sm_plus - sm_plus / period + plus_dm[i]
        sm_minus = sm_minus - sm_minus / period + minus_dm[i]
        pdi_last = 100 * sm_plus / sm_tr if sm_tr > 0 else 0
        mdi_last = 100 * sm_minus / sm_tr if sm_tr > 0 else 0
        if pdi_last + mdi_last > 0:
            dx = 100 * abs(pdi_last - mdi_last) / (pdi_last + mdi_last)
        else:
            dx = 0
        dx_vals.append(dx)
    if len(dx_vals) < period:
        return 0, 0, 0
    adx_v = sum(dx_vals[:period]) / period
    for i in range(period, len(dx_vals)):
        adx_v = (adx_v * (period - 1) + dx_vals[i]) / period
    return adx_v, pdi_last, mdi_last

def bb_calc(data, period=20, std_mult=2):
    sma = sum(data[-period:]) / period
    variance = sum((x - sma) ** 2 for x in data[-period:]) / period
    std = variance ** 0.5
    return sma, sma + std_mult * std, sma - std_mult * std

def fetch_regime(symbol):
    """Fetch canonical regime from API (matches regime router)"""
    try:
        url = f"http://localhost:3100/api/market/regime?symbol={urllib.parse.quote(symbol)}&timeframe=4h&limit=100"
        req = urllib.request.Request(url)
        data = json.loads(urllib.request.urlopen(req, timeout=10).read())
        r = data.get("regime", {})
        return r.get("adx", 0), r.get("regime", "unknown")
    except Exception:
        return None, None

def analyze_symbol(symbol, name):
    d = api_call("ohlcv", {"symbol": symbol, "timeframe": "4h", "limit": 100})
    candles = d.get("ohlcv", [])

    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    volumes = [c["volume"] for c in candles]

    ema8 = ema(closes, 8)
    ema21 = ema(closes, 21)
    ema55 = ema(closes, 55)
    rsi_vals = rsi(closes, 14)
    atr_vals = atr_calc(highs, lows, closes, 14)
    adx_local, plus_di, minus_di = adx_calc(highs, lows, closes, 14)
    bb_mid, bb_upper, bb_lower = bb_calc(closes, 20, 2)

    # Use canonical ADX/regime from API when available, fall back to local
    api_adx, api_regime = fetch_regime(symbol)
    adx_val = api_adx if api_adx is not None else adx_local

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd_line = [ema12[i] - ema26[i] for i in range(len(closes))]
    macd_signal = ema(macd_line, 9)
    macd_hist = [macd_line[i] - macd_signal[i] for i in range(len(closes))]

    last = closes[-1]
    bullish_ribbon = ema8[-1] > ema21[-1] > ema55[-1]
    bearish_ribbon = ema55[-1] > ema21[-1] > ema8[-1]

    # Regime — prefer canonical API regime, fall back to local classification
    if api_regime and api_regime != "unknown":
        regime_map = {"trending_up": "TRENDING", "trending_down": "TRENDING",
                      "ranging": "RANGING", "volatile": "VOLATILE"}
        regime = regime_map.get(api_regime, api_regime.upper())
    elif adx_val > 25 and (bullish_ribbon or bearish_ribbon):
        regime = "TRENDING"
    elif rsi_vals[-1] < 30:
        regime = "EXTREME FEAR"
    elif adx_val < 20:
        regime = "RANGING"
    else:
        regime = "TRANSITION"

    # EFR checks
    efr_rsi_low = rsi_vals[-1] < 35
    efr_rsi_rising = rsi_vals[-1] > rsi_vals[-2]
    efr_near_bb = abs(last - bb_lower) / last < 0.02
    efr_macd_imp = macd_hist[-1] > macd_hist[-2]
    efr_ema_approach = abs(ema8[-1] - ema21[-1]) / ema21[-1] < 0.01 and ema8[-1] < ema21[-1]
    efr_score = sum([efr_rsi_low, efr_rsi_rising, efr_near_bb, efr_macd_imp, efr_ema_approach])

    efr_trigger = (rsi_vals[-1] > 30 and rsi_vals[-2] <= 30 and
                   macd_hist[-1] > 0 and macd_hist[-2] <= 0 and
                   ema8[-1] > ema21[-1] and ema8[-2] <= ema21[-2])

    # EMA checks
    ema_aligned = "BULL" if bullish_ribbon else "BEAR" if bearish_ribbon else "MIXED"
    ema_pullback = abs(last - ema21[-1]) / ema21[-1] < 0.005
    ema_rsi_zone = 40 <= rsi_vals[-1] <= 55
    ema_adx_ok = adx_val > 25

    recent_high = max(highs[-20:])
    recent_low = min(lows[-20:])
    range_pct = (recent_high - recent_low) / recent_low * 100
    range_pos = (last - recent_low) / (recent_high - recent_low) * 100 if recent_high != recent_low else 50

    print(f"\n{'='*60}")
    print(f"  {name} ({symbol})")
    print(f"{'='*60}")
    print(f"  Price:   ${last:,.2f}")
    print(f"  EMA:     8=${ema8[-1]:,.2f}  21=${ema21[-1]:,.2f}  55=${ema55[-1]:,.2f}")
    print(f"  Ribbon:  {ema_aligned}")
    print(f"  RSI:     {rsi_vals[-1]:.1f} ({'RISING' if rsi_vals[-1] > rsi_vals[-2] else 'FALLING'})")
    print(f"  MACD:    hist={macd_hist[-1]:.2f} ({'IMPROVING' if macd_hist[-1] > macd_hist[-2] else 'DETERIORATING'})")
    adx_src = "API" if api_adx is not None else "local"
    print(f"  ADX:     {adx_val:.1f} ({adx_src}) (+DI:{plus_di:.1f} -DI:{minus_di:.1f})")
    print(f"  ATR:     ${atr_vals[-1]:,.2f} ({atr_vals[-1]/last*100:.2f}%)")
    print(f"  BB:      U=${bb_upper:,.2f} M=${bb_mid:,.2f} L=${bb_lower:,.2f}")
    print(f"  Range:   ${recent_low:,.0f}-${recent_high:,.0f} ({range_pct:.1f}%) pos:{range_pos:.0f}%")
    print(f"  REGIME:  {regime}")
    print(f"  ---")
    print(f"  EFR Score: {efr_score}/5 | Trigger: {'*** YES ***' if efr_trigger else 'no'}")
    print(f"  EMA Signal: ribbon={ema_aligned} pullback={'Y' if ema_pullback else 'N'} rsi_zone={'Y' if ema_rsi_zone else 'N'} adx={'Y' if ema_adx_ok else 'N'}")

    return {
        "name": name, "symbol": symbol, "price": last, "regime": regime,
        "rsi": rsi_vals[-1], "adx": adx_val, "atr_pct": atr_vals[-1]/last*100,
        "ribbon": ema_aligned, "efr_score": efr_score, "efr_trigger": efr_trigger,
        "macd_hist": macd_hist[-1], "macd_improving": macd_hist[-1] > macd_hist[-2],
        "bb_lower_dist": abs(last - bb_lower) / last * 100,
        "range_pos": range_pos,
    }

if __name__ == "__main__":
    symbols = [
        ("BTC/USDT:USDT", "BTC"),
        ("ETH/USDT:USDT", "ETH"),
        ("SOL/USDT:USDT", "SOL"),
    ]

    print("=" * 60)
    print("  STRATEGY ARCHITECT — REGIME & SIGNAL SCAN")
    print(f"  Time: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
    print("=" * 60)

    results = []
    for sym, name in symbols:
        try:
            r = analyze_symbol(sym, name)
            results.append(r)
            time.sleep(2)  # Rate limit
        except Exception as e:
            print(f"\n  {name}: ERROR - {e}")

    # Summary
    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"{'='*60}")
    print(f"  {'Asset':<6} {'Price':>10} {'Regime':<12} {'RSI':>5} {'ADX':>5} {'Ribbon':<6} {'EFR':>4} {'MACD':<5}")
    print(f"  {'-'*55}")
    for r in results:
        macd_dir = "UP" if r["macd_improving"] else "DN"
        print(f"  {r['name']:<6} ${r['price']:>9,.2f} {r['regime']:<12} {r['rsi']:5.1f} {r['adx']:5.1f} {r['ribbon']:<6} {r['efr_score']}/5  {macd_dir}")

    # Active strategy recommendations
    print(f"\n  STRATEGY RECOMMENDATIONS:")
    for r in results:
        if r["efr_trigger"]:
            print(f"  *** {r['name']}: EFR v1.0 ENTRY SIGNAL TRIGGERED ***")
        elif r["efr_score"] >= 3:
            print(f"  >> {r['name']}: EFR v1.0 setup forming ({r['efr_score']}/5)")
        if r["regime"] == "TRENDING" and r["ribbon"] != "MIXED":
            print(f"  >> {r['name']}: EMA Ribbon v2.0 active (trending, ribbon aligned)")
        if r["regime"] == "RANGING":
            print(f"  >> {r['name']}: LSR v1.0 candidate (ranging market)")
        if r["regime"] == "TRANSITION":
            print(f"  -- {r['name']}: Transition zone — monitor, no entries")

    print(f"\n  Kill switch: Check manually (CEO order: do not reset)")
    print(f"  Trading mode: MANUAL (board directive)")
