#!/usr/bin/env python3
"""Strategy Architect — Full Micro-Cap Universe Scan
Scans ALL mandatory micro-cap symbols for EFR, FRC, momentum, and regime signals.
Board directive: micro-caps are PRIMARY focus."""

import urllib.request, urllib.parse, json, time, sys

API_URL = "http://localhost:3100/api/phemex"

def api_call(action, params={}):
    data = json.dumps({"action": action, **params}).encode()
    req = urllib.request.Request(API_URL, data=data, headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read())
    except Exception as e:
        return {"error": str(e)}

def ema(data, period):
    result = [data[0]]
    k = 2 / (period + 1)
    for i in range(1, len(data)):
        result.append(data[i] * k + result[-1] * (1 - k))
    return result

def rsi(data, period=14):
    if len(data) < period + 2:
        return [50]
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
    return result if result else [50]

def adx_calc(highs, lows, closes, period=14):
    if len(closes) < period * 3:
        return 0, 0, 0
    plus_dm, minus_dm, trs = [], [], []
    for i in range(1, len(closes)):
        up = highs[i] - highs[i-1]
        down = lows[i-1] - lows[i]
        plus_dm.append(up if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        trs.append(tr)
    if len(trs) < period:
        return 0, 0, 0
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
        return 0, pdi_last, mdi_last
    adx_v = sum(dx_vals[:period]) / period
    for i in range(period, len(dx_vals)):
        adx_v = (adx_v * (period - 1) + dx_vals[i]) / period
    return adx_v, pdi_last, mdi_last

def bb_calc(data, period=20, std_mult=2):
    if len(data) < period:
        return data[-1], data[-1] * 1.02, data[-1] * 0.98
    sma = sum(data[-period:]) / period
    variance = sum((x - sma) ** 2 for x in data[-period:]) / period
    std = variance ** 0.5
    return sma, sma + std_mult * std, sma - std_mult * std

def analyze_symbol(symbol):
    """Analyze a single symbol. Returns dict with all indicators or None on error."""
    d = api_call("ohlcv", {"symbol": symbol, "timeframe": "4h", "limit": 100})
    if "error" in d or not d.get("ohlcv"):
        return None

    candles = d["ohlcv"]
    if len(candles) < 30:
        return None

    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]

    ema8 = ema(closes, 8)
    ema21 = ema(closes, 21)
    ema55 = ema(closes, 55)
    rsi_vals = rsi(closes, 14)
    adx_val, plus_di, minus_di = adx_calc(highs, lows, closes, 14)

    bb_mid, bb_upper, bb_lower = bb_calc(closes, 20, 2)

    ema12 = ema(closes, 12)
    ema26 = ema(closes, 26)
    macd_line = [ema12[i] - ema26[i] for i in range(len(closes))]
    macd_signal = ema(macd_line, 9)
    macd_hist = [macd_line[i] - macd_signal[i] for i in range(len(closes))]

    last = closes[-1]
    bullish_ribbon = ema8[-1] > ema21[-1] > ema55[-1]
    bearish_ribbon = ema55[-1] > ema21[-1] > ema8[-1]
    ribbon = "BULL" if bullish_ribbon else "BEAR" if bearish_ribbon else "MIXED"

    rsi_now = rsi_vals[-1] if rsi_vals else 50
    rsi_prev = rsi_vals[-2] if len(rsi_vals) > 1 else rsi_now
    rsi_rising = rsi_now > rsi_prev

    ema55_dist = (last - ema55[-1]) / ema55[-1] * 100

    # EFR scoring
    efr_rsi_low = rsi_now < 35
    efr_rsi_rising = rsi_rising
    efr_near_bb = abs(last - bb_lower) / last < 0.02
    efr_macd_imp = macd_hist[-1] > macd_hist[-2] if len(macd_hist) > 1 else False
    efr_ema_approach = abs(ema8[-1] - ema21[-1]) / ema21[-1] < 0.01 and ema8[-1] < ema21[-1]
    efr_score = sum([efr_rsi_low, efr_rsi_rising, efr_near_bb, efr_macd_imp, efr_ema_approach])

    # EFR trigger
    efr_trigger = False
    if len(rsi_vals) > 1 and len(macd_hist) > 1:
        efr_trigger = (rsi_now > 30 and rsi_prev <= 30 and
                       macd_hist[-1] > 0 and macd_hist[-2] <= 0 and
                       ema8[-1] > ema21[-1] and ema8[-2] <= ema21[-2])

    # Regime classification
    if adx_val > 25 and (bullish_ribbon or bearish_ribbon):
        regime = "TRENDING"
    elif rsi_now < 30:
        regime = "EXTREME_FEAR"
    elif adx_val < 20:
        regime = "RANGING"
    else:
        regime = "TRANSITION"

    # 24h price change approximation (6 candles of 4h)
    if len(closes) >= 7:
        pct_24h = (closes[-1] - closes[-7]) / closes[-7] * 100
    else:
        pct_24h = 0

    # Momentum flag
    momentum = abs(pct_24h) > 10

    return {
        "symbol": symbol,
        "price": last,
        "rsi": round(rsi_now, 1),
        "rsi_dir": "RISING" if rsi_rising else "FALLING",
        "adx": round(adx_val, 1),
        "ribbon": ribbon,
        "regime": regime,
        "ema55_dist": round(ema55_dist, 1),
        "macd_hist": round(macd_hist[-1], 6),
        "macd_improving": efr_macd_imp,
        "bb_lower_dist": round(abs(last - bb_lower) / last * 100, 2),
        "efr_score": efr_score,
        "efr_trigger": efr_trigger,
        "pct_24h": round(pct_24h, 1),
        "momentum": momentum,
        "above_ema55": ema55_dist > 0,
    }

def fetch_funding(symbol):
    """Fetch current funding rate for a symbol."""
    d = api_call("funding_rate", {"symbol": symbol})
    if "error" in d:
        return None
    fr = d.get("fundingRate")
    if fr is None:
        return None
    return fr

if __name__ == "__main__":
    # Full mandatory micro-cap list
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
        "1000WHY/USDT:USDT", "1000000BABYDOGE/USDT:USDT", "1000000MOG/USDT:USDT",
    ]

    # Also scan key mid/large caps for context
    CONTEXT_PAIRS = [
        "BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT",
        "WIF/USDT:USDT", "INJ/USDT:USDT", "NEAR/USDT:USDT", "TAO/USDT:USDT",
    ]

    all_symbols = CONTEXT_PAIRS + MICRO_CAPS

    print("=" * 80)
    print("  STRATEGY ARCHITECT — FULL UNIVERSE SCAN (MICRO-CAP PRIORITY)")
    print(f"  Time: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
    print(f"  Symbols: {len(all_symbols)} ({len(MICRO_CAPS)} micro-caps + {len(CONTEXT_PAIRS)} context)")
    print("=" * 80)

    results = []
    errors = []
    funding_data = {}

    for i, sym in enumerate(all_symbols):
        name = sym.split("/")[0]
        try:
            r = analyze_symbol(sym)
            if r:
                results.append(r)
                # Fetch funding for symbols with EFR setup or extreme oversold
                if r["rsi"] < 35 or r["efr_score"] >= 2 or r["above_ema55"]:
                    time.sleep(1)
                    fr = fetch_funding(sym)
                    if fr is not None:
                        funding_data[sym] = fr
                        r["funding_rate"] = fr
                        r["funding_ann"] = round(fr * 3 * 365 * 100, 1)
                sys.stdout.write(f"\r  Scanned {i+1}/{len(all_symbols)}: {name:<12} RSI={r['rsi']:5.1f} {r['regime']:<14}")
                sys.stdout.flush()
            else:
                errors.append(sym)
                sys.stdout.write(f"\r  Scanned {i+1}/{len(all_symbols)}: {name:<12} (no data)              ")
                sys.stdout.flush()
        except Exception as e:
            errors.append(sym)
            sys.stdout.write(f"\r  Scanned {i+1}/{len(all_symbols)}: {name:<12} ERROR                   ")
            sys.stdout.flush()

        time.sleep(2)  # Rate limit — Phemex is strict

    print(f"\n\n{'='*80}")
    print(f"  SCAN COMPLETE — {len(results)} symbols analyzed, {len(errors)} errors")
    print(f"{'='*80}")

    # === SUMMARY TABLE ===
    print(f"\n  {'Symbol':<16} {'Price':>12} {'RSI':>5} {'Dir':<7} {'ADX':>5} {'Ribbon':<6} {'Regime':<14} {'EFR':>4} {'24h%':>6} {'EMA55%':>7}")
    print(f"  {'-'*90}")
    for r in sorted(results, key=lambda x: x["rsi"]):
        flag = ""
        if r["efr_trigger"]:
            flag = " *** TRIGGER ***"
        elif r["efr_score"] >= 3:
            flag = " >> SETUP"
        elif r["rsi"] < 25:
            flag = " !! EXTREME"
        elif r["momentum"]:
            flag = " ~ MOMENTUM"

        print(f"  {r['symbol'].split('/')[0]:<16} ${r['price']:>11,.6f} {r['rsi']:5.1f} {r['rsi_dir']:<7} {r['adx']:5.1f} {r['ribbon']:<6} {r['regime']:<14} {r['efr_score']}/5 {r['pct_24h']:>+5.1f}% {r['ema55_dist']:>+6.1f}%{flag}")

    # === EFR CANDIDATES (RSI < 35) ===
    efr_candidates = [r for r in results if r["rsi"] < 35]
    print(f"\n{'='*80}")
    print(f"  EFR CANDIDATES (RSI < 35): {len(efr_candidates)} symbols")
    print(f"{'='*80}")
    if efr_candidates:
        for r in sorted(efr_candidates, key=lambda x: x["rsi"]):
            fr_str = ""
            if "funding_ann" in r:
                fr_str = f" | Funding: {r['funding_ann']:>+6.1f}% ann"
            print(f"  {r['symbol'].split('/')[0]:<12} RSI={r['rsi']:5.1f} {r['rsi_dir']:<7} EFR={r['efr_score']}/5 MACD={'UP' if r['macd_improving'] else 'DN'} BB_dist={r['bb_lower_dist']:.1f}% EMA55={r['ema55_dist']:>+.1f}%{fr_str}")
    else:
        print("  None found.")

    # === EFR TRIGGERS ===
    triggers = [r for r in results if r["efr_trigger"]]
    if triggers:
        print(f"\n{'='*80}")
        print(f"  *** EFR ENTRY SIGNALS TRIGGERED: {len(triggers)} ***")
        print(f"{'='*80}")
        for r in triggers:
            print(f"  *** {r['symbol']} — RSI={r['rsi']} MACD improving, EMA cross confirmed ***")

    # === FRC CANDIDATES (above EMA55 with funding data) ===
    frc_candidates = [r for r in results if r.get("above_ema55") and r.get("funding_rate") and r["funding_rate"] < -0.0001]
    print(f"\n{'='*80}")
    print(f"  FRC CANDIDATES (above EMA55 + negative funding): {len(frc_candidates)} symbols")
    print(f"{'='*80}")
    if frc_candidates:
        for r in sorted(frc_candidates, key=lambda x: x.get("funding_ann", 0)):
            print(f"  {r['symbol'].split('/')[0]:<12} Funding={r['funding_ann']:>+6.1f}% ann | Price above EMA55 by {r['ema55_dist']:>+.1f}% | RSI={r['rsi']} {r['rsi_dir']}")
    else:
        print("  None found.")

    # === MOMENTUM MOVERS ===
    movers = [r for r in results if r["momentum"]]
    if movers:
        print(f"\n{'='*80}")
        print(f"  MOMENTUM MOVERS (|24h| > 10%): {len(movers)} symbols")
        print(f"{'='*80}")
        for r in sorted(movers, key=lambda x: x["pct_24h"], reverse=True):
            print(f"  {r['symbol'].split('/')[0]:<12} {r['pct_24h']:>+5.1f}% | RSI={r['rsi']} | Regime={r['regime']}")

    # === EXTREME FEAR ===
    extreme = [r for r in results if r["rsi"] < 25]
    if extreme:
        print(f"\n{'='*80}")
        print(f"  EXTREME OVERSOLD (RSI < 25): {len(extreme)} symbols — CAPITULATION WATCH")
        print(f"{'='*80}")
        for r in sorted(extreme, key=lambda x: x["rsi"]):
            fr_str = f" | Funding: {r['funding_ann']:>+6.1f}% ann" if "funding_ann" in r else ""
            print(f"  {r['symbol'].split('/')[0]:<12} RSI={r['rsi']:5.1f} {r['rsi_dir']:<7}{fr_str}")
        print(f"\n  WARNING: RSI < 25 = CAPITULATION. Do NOT enter. Wait for reversal (RSI rising + MACD cross).")

    # === OUTPUT JSON for downstream agents ===
    output = {
        "scan_time": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "total_scanned": len(results),
        "errors": len(errors),
        "error_symbols": [s.split("/")[0] for s in errors],
        "efr_candidates": [{k: v for k, v in r.items()} for r in sorted(efr_candidates, key=lambda x: x["rsi"])],
        "efr_triggers": [{k: v for k, v in r.items()} for r in triggers],
        "frc_candidates": [{k: v for k, v in r.items()} for r in frc_candidates],
        "extreme_oversold": [{k: v for k, v in r.items()} for r in sorted(extreme, key=lambda x: x["rsi"])],
        "momentum_movers": [{k: v for k, v in r.items()} for r in movers],
    }

    with open("knowledge/patterns/microcap-full-scan-latest.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Results saved to knowledge/patterns/microcap-full-scan-latest.json")

    if errors:
        print(f"\n  ERRORS ({len(errors)} symbols): {', '.join(s.split('/')[0] for s in errors)}")

    print(f"\n{'='*80}")
    print(f"  SCAN COMPLETE")
    print(f"{'='*80}")
