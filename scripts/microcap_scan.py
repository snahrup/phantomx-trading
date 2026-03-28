#!/usr/bin/env python3
"""Strategy Architect — Micro-Cap Universe Scanner
Board directive: micro-caps are PRIMARY focus for strategy development.
Scans all 57 micro-cap 50x perps for EFR + FRC opportunities.
"""
import urllib.request, json, time, sys

API = "http://localhost:3100/api/phemex"

def api_call(action, params={}):
    data = json.dumps({"action": action, **params}).encode()
    req = urllib.request.Request(API, data=data, headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

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

def adx_calc(highs, lows, closes, period=14):
    plus_dm, minus_dm, trs = [], [], []
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
    for i in range(period, len(trs)):
        sm_tr = sm_tr - sm_tr / period + trs[i]
        sm_plus = sm_plus - sm_plus / period + plus_dm[i]
        sm_minus = sm_minus - sm_minus / period + minus_dm[i]
        pdi = 100 * sm_plus / sm_tr if sm_tr > 0 else 0
        mdi = 100 * sm_minus / sm_tr if sm_tr > 0 else 0
        dx = 100 * abs(pdi - mdi) / (pdi + mdi) if (pdi + mdi) > 0 else 0
        dx_vals.append(dx)
    if len(dx_vals) < period:
        return 0
    adx_v = sum(dx_vals[:period]) / period
    for i in range(period, len(dx_vals)):
        adx_v = (adx_v * (period - 1) + dx_vals[i]) / period
    return adx_v

def bb_lower(data, period=20, std_mult=2):
    sma = sum(data[-period:]) / period
    variance = sum((x - sma) ** 2 for x in data[-period:]) / period
    return sma - std_mult * (variance ** 0.5)

MICRO_CAPS = [
    ("GUN/USDT:USDT", "GUN"), ("PHA/USDT:USDT", "PHA"), ("HOOK/USDT:USDT", "HOOK"),
    ("ACH/USDT:USDT", "ACH"), ("JASMY/USDT:USDT", "JASMY"), ("RSR/USDT:USDT", "RSR"),
    ("MTL/USDT:USDT", "MTL"), ("MAGIC/USDT:USDT", "MAGIC"), ("SPELL/USDT:USDT", "SPELL"),
    ("SKL/USDT:USDT", "SKL"), ("AGLD/USDT:USDT", "AGLD"), ("ANKR/USDT:USDT", "ANKR"),
    ("PEOPLE/USDT:USDT", "PEOPLE"), ("HIGH/USDT:USDT", "HIGH"), ("LQTY/USDT:USDT", "LQTY"),
    ("TRU/USDT:USDT", "TRU"), ("SUPER/USDT:USDT", "SUPER"), ("BIGTIME/USDT:USDT", "BIGTIME"),
    ("MEME/USDT:USDT", "MEME"), ("TURBO/USDT:USDT", "TURBO"),
    ("1000PEPE/USDT:USDT", "PEPE"), ("1000FLOKI/USDT:USDT", "FLOKI"),
    ("1000BONK/USDT:USDT", "BONK"), ("1000SHIB/USDT:USDT", "SHIB"),
    ("POPCAT/USDT:USDT", "POPCAT"), ("MEW/USDT:USDT", "MEW"), ("BOME/USDT:USDT", "BOME"),
    ("PNUT/USDT:USDT", "PNUT"), ("ACT/USDT:USDT", "ACT"), ("GOAT/USDT:USDT", "GOAT"),
    ("MOODENG/USDT:USDT", "MOODENG"), ("FARTCOIN/USDT:USDT", "FARTCOIN"),
    ("AIXBT/USDT:USDT", "AIXBT"), ("TRUMP/USDT:USDT", "TRUMP"), ("ANIME/USDT:USDT", "ANIME"),
    ("CHILLGUY/USDT:USDT", "CHILLGUY"), ("PIPPIN/USDT:USDT", "PIPPIN"),
    ("GRIFFAIN/USDT:USDT", "GRIFFAIN"), ("ZEREBRO/USDT:USDT", "ZEREBRO"),
    ("SWARMS/USDT:USDT", "SWARMS"), ("COOKIE/USDT:USDT", "COOKIE"),
    ("MUBARAK/USDT:USDT", "MUBARAK"), ("PARTI/USDT:USDT", "PARTI"),
    ("STO/USDT:USDT", "STO"), ("1000CAT/USDT:USDT", "CAT"),
    ("1000CHEEMS/USDT:USDT", "CHEEMS"), ("1000WHY/USDT:USDT", "WHY"),
    ("1000000BABYDOGE/USDT:USDT", "BABYDOGE"), ("1000000MOG/USDT:USDT", "MOG"),
    ("SPX/USDT:USDT", "SPX"), ("DRIFT/USDT:USDT", "DRIFT"), ("BAN/USDT:USDT", "BAN"),
    ("RED/USDT:USDT", "RED"), ("KAITO/USDT:USDT", "KAITO"), ("FORM/USDT:USDT", "FORM"),
    ("EPIC/USDT:USDT", "EPIC"), ("LAYER/USDT:USDT", "LAYER"), ("IP/USDT:USDT", "IP"),
    ("SHELL/USDT:USDT", "SHELL"), ("GPS/USDT:USDT", "GPS"),
]

def analyze(symbol, name):
    try:
        d = api_call("ohlcv", {"symbol": symbol, "timeframe": "4h", "limit": 100})
        candles = d.get("ohlcv", [])
        if len(candles) < 60:
            return None

        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]

        ema8 = ema(closes, 8)
        ema21 = ema(closes, 21)
        ema55 = ema(closes, 55)
        rsi_vals = rsi(closes, 14)
        adx_val = adx_calc(highs, lows, closes, 14)
        bbl = bb_lower(closes, 20, 2)

        ema12 = ema(closes, 12)
        ema26 = ema(closes, 26)
        macd_line = [ema12[i] - ema26[i] for i in range(len(closes))]
        macd_signal = ema(macd_line, 9)
        macd_hist = [macd_line[i] - macd_signal[i] for i in range(len(closes))]

        last = closes[-1]
        rsi_now = rsi_vals[-1]
        rsi_prev = rsi_vals[-2]
        rsi_rising = rsi_now > rsi_prev
        ema55_dist = (last - ema55[-1]) / ema55[-1] * 100

        bullish = ema8[-1] > ema21[-1] > ema55[-1]
        bearish = ema55[-1] > ema21[-1] > ema8[-1]
        ribbon = "BULL" if bullish else "BEAR" if bearish else "MIXED"

        # EFR scoring
        efr_rsi_low = rsi_now < 35
        efr_rsi_rising = rsi_rising
        efr_near_bb = abs(last - bbl) / last < 0.02
        efr_macd_imp = macd_hist[-1] > macd_hist[-2]
        efr_ema_approach = abs(ema8[-1] - ema21[-1]) / ema21[-1] < 0.01 and ema8[-1] < ema21[-1]
        efr_score = sum([efr_rsi_low, efr_rsi_rising, efr_near_bb, efr_macd_imp, efr_ema_approach])

        # EFR trigger
        efr_trigger = (rsi_now > 30 and rsi_prev <= 30 and
                       macd_hist[-1] > 0 and macd_hist[-2] <= 0 and
                       ema8[-1] > ema21[-1] and ema8[-2] <= ema21[-2])

        # Regime
        if adx_val > 25 and (bullish or bearish):
            regime = "TRENDING"
        elif rsi_now < 30:
            regime = "EXTREME_FEAR"
        elif rsi_now < 35 and rsi_rising:
            regime = "EFR_SETUP"
        elif adx_val < 20:
            regime = "RANGING"
        else:
            regime = "TRANSITION"

        # Range position
        recent_high = max(highs[-20:])
        recent_low = min(lows[-20:])
        range_pos = (last - recent_low) / (recent_high - recent_low) * 100 if recent_high != recent_low else 50

        return {
            "name": name, "symbol": symbol, "price": last,
            "rsi": rsi_now, "rsi_rising": rsi_rising, "adx": adx_val,
            "ribbon": ribbon, "regime": regime,
            "efr_score": efr_score, "efr_trigger": efr_trigger,
            "macd_hist": macd_hist[-1], "macd_imp": macd_hist[-1] > macd_hist[-2],
            "ema55_dist": ema55_dist, "range_pos": range_pos,
            "bb_dist": abs(last - bbl) / last * 100,
        }
    except Exception as e:
        return {"name": name, "symbol": symbol, "error": str(e)}

if __name__ == "__main__":
    print("=" * 80)
    print("  STRATEGY ARCHITECT — MICRO-CAP UNIVERSE SCAN")
    print(f"  Time: {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
    print(f"  Symbols: {len(MICRO_CAPS)} micro-cap 50x perps")
    print("=" * 80)

    results = []
    errors = []
    for i, (sym, name) in enumerate(MICRO_CAPS):
        sys.stdout.write(f"\r  Scanning {i+1}/{len(MICRO_CAPS)}: {name:<12}")
        sys.stdout.flush()
        r = analyze(sym, name)
        if r and "error" not in r:
            results.append(r)
        elif r:
            errors.append(r)
        time.sleep(2)  # Phemex rate limit

    print(f"\r  Scanned {len(MICRO_CAPS)} symbols. {len(results)} OK, {len(errors)} errors.")

    # Sort by EFR score desc, then RSI asc (most oversold first)
    results.sort(key=lambda x: (-x["efr_score"], x["rsi"]))

    # EFR Candidates (score >= 2 or RSI < 35)
    efr_candidates = [r for r in results if r["efr_score"] >= 2 or r["rsi"] < 35]
    print(f"\n{'='*80}")
    print(f"  EFR CANDIDATES (score>=2 or RSI<35) — {len(efr_candidates)} found")
    print(f"{'='*80}")
    print(f"  {'Name':<10} {'Price':>10} {'RSI':>6} {'Dir':>5} {'MACD':>5} {'EFR':>4} {'Ribbon':<6} {'EMA55%':>7} {'BB%':>6} {'Regime':<13}")
    print(f"  {'-'*75}")
    for r in efr_candidates:
        rdir = "UP" if r["rsi_rising"] else "DN"
        mdir = "UP" if r["macd_imp"] else "DN"
        trig = " ***TRIGGER***" if r["efr_trigger"] else ""
        print(f"  {r['name']:<10} ${r['price']:>9,.4f} {r['rsi']:6.1f} {rdir:>5} {mdir:>5} {r['efr_score']}/5  {r['ribbon']:<6} {r['ema55_dist']:>+7.1f}% {r['bb_dist']:>5.1f}% {r['regime']:<13}{trig}")

    # Extreme fear (RSI < 30)
    extreme = [r for r in results if r["rsi"] < 30]
    if extreme:
        print(f"\n{'='*80}")
        print(f"  EXTREME FEAR (RSI < 30) — {len(extreme)} symbols")
        print(f"{'='*80}")
        for r in extreme:
            rdir = "RISING" if r["rsi_rising"] else "FALLING"
            action = "SETUP FORMING" if r["rsi_rising"] else "CAPITULATING — DO NOT ENTER"
            print(f"  {r['name']:<10} RSI {r['rsi']:.1f} ({rdir}) — {action}")

    # EFR Triggers
    triggers = [r for r in results if r["efr_trigger"]]
    if triggers:
        print(f"\n  *** EFR ENTRY SIGNALS TRIGGERED: {len(triggers)} ***")
        for r in triggers:
            print(f"  >>> {r['name']} — RSI crossed above 30, MACD crossed positive, EMA(8) crossed EMA(21)")

    # Trending (potential EMA Ribbon)
    trending = [r for r in results if r["regime"] == "TRENDING"]
    if trending:
        print(f"\n{'='*80}")
        print(f"  TRENDING (ADX>25 + ribbon aligned) — {len(trending)} symbols")
        print(f"{'='*80}")
        for r in trending:
            print(f"  {r['name']:<10} ADX {r['adx']:.1f} Ribbon {r['ribbon']} RSI {r['rsi']:.1f} Range% {r['range_pos']:.0f}")

    # FRC candidates (price above EMA55)
    frc_cands = [r for r in results if r["ema55_dist"] > 0]
    if frc_cands:
        print(f"\n{'='*80}")
        print(f"  FRC CANDIDATES (price > EMA55) — {len(frc_cands)} symbols")
        print(f"  (Funding rates need separate fetch)")
        print(f"{'='*80}")
        for r in frc_cands:
            print(f"  {r['name']:<10} EMA55 dist: +{r['ema55_dist']:.1f}% RSI {r['rsi']:.1f} Ribbon {r['ribbon']}")

    # Full table sorted by RSI
    results.sort(key=lambda x: x["rsi"])
    print(f"\n{'='*80}")
    print(f"  FULL UNIVERSE RANKED BY RSI (most oversold first)")
    print(f"{'='*80}")
    print(f"  {'#':>3} {'Name':<10} {'Price':>10} {'RSI':>6} {'Dir':>5} {'ADX':>5} {'Ribbon':<6} {'EMA55%':>7} {'EFR':>4} {'Regime':<13}")
    print(f"  {'-'*75}")
    for i, r in enumerate(results):
        rdir = "UP" if r["rsi_rising"] else "DN"
        print(f"  {i+1:>3} {r['name']:<10} ${r['price']:>9,.4f} {r['rsi']:6.1f} {rdir:>5} {r['adx']:5.1f} {r['ribbon']:<6} {r['ema55_dist']:>+7.1f}% {r['efr_score']}/5  {r['regime']:<13}")

    if errors:
        print(f"\n  ERRORS ({len(errors)}):")
        for e in errors:
            print(f"  {e['name']}: {e['error']}")

    # Output JSON for downstream consumption
    output = {
        "scanTime": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        "totalScanned": len(results),
        "errors": len(errors),
        "efrCandidates": [{"name": r["name"], "symbol": r["symbol"], "rsi": r["rsi"],
                           "rsi_rising": r["rsi_rising"], "efr_score": r["efr_score"],
                           "efr_trigger": r["efr_trigger"], "ema55_dist": r["ema55_dist"],
                           "regime": r["regime"]} for r in efr_candidates],
        "extremeFear": [{"name": r["name"], "rsi": r["rsi"], "rsi_rising": r["rsi_rising"]}
                        for r in extreme],
        "frcCandidates": [{"name": r["name"], "symbol": r["symbol"], "ema55_dist": r["ema55_dist"]}
                          for r in frc_cands],
        "trending": [{"name": r["name"], "adx": r["adx"], "ribbon": r["ribbon"]}
                     for r in trending],
    }
    with open("knowledge/patterns/microcap-scan-latest.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Results saved to knowledge/patterns/microcap-scan-latest.json")
