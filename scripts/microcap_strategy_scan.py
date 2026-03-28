#!/usr/bin/env python3
"""Strategy Architect micro-cap scan — EFR + FRC candidate identification.
Scans all priority micro-caps for RSI extremes and funding rate opportunities."""
import json, time, subprocess, sys
from datetime import datetime, timezone

API = 'http://localhost:3100/api/phemex'
DELAY = 2.0

# Priority micro-caps from mandatory-scan-list.json
MICRO_CAPS = [
    "GUN/USDT:USDT", "PHA/USDT:USDT", "HOOK/USDT:USDT", "ACH/USDT:USDT",
    "JASMY/USDT:USDT", "MAGIC/USDT:USDT", "SPELL/USDT:USDT", "TURBO/USDT:USDT",
    "POPCAT/USDT:USDT", "MEW/USDT:USDT", "BOME/USDT:USDT", "PNUT/USDT:USDT",
    "ACT/USDT:USDT", "GOAT/USDT:USDT", "MOODENG/USDT:USDT", "FARTCOIN/USDT:USDT",
    "AIXBT/USDT:USDT", "TRUMP/USDT:USDT", "ANIME/USDT:USDT", "MUBARAK/USDT:USDT",
    "PARTI/USDT:USDT", "STO/USDT:USDT", "1000PEPE/USDT:USDT", "1000FLOKI/USDT:USDT",
    "1000BONK/USDT:USDT", "1000SHIB/USDT:USDT", "SPX/USDT:USDT", "DRIFT/USDT:USDT",
    "BAN/USDT:USDT", "RED/USDT:USDT", "KAITO/USDT:USDT", "FORM/USDT:USDT",
    "EPIC/USDT:USDT", "LAYER/USDT:USDT", "IP/USDT:USDT", "SUPER/USDT:USDT",
    "BIGTIME/USDT:USDT", "MEME/USDT:USDT", "RSR/USDT:USDT", "MTL/USDT:USDT",
    "SKL/USDT:USDT", "AGLD/USDT:USDT", "ANKR/USDT:USDT", "PEOPLE/USDT:USDT",
    "HIGH/USDT:USDT", "LQTY/USDT:USDT", "TRU/USDT:USDT", "CHILLGUY/USDT:USDT",
    "PIPPIN/USDT:USDT", "GRIFFAIN/USDT:USDT", "ZEREBRO/USDT:USDT", "SWARMS/USDT:USDT",
    "COOKIE/USDT:USDT", "1000CAT/USDT:USDT", "1000CHEEMS/USDT:USDT",
    "1000WHY/USDT:USDT", "SHELL/USDT:USDT", "GPS/USDT:USDT",
]

def fetch(action, **kwargs):
    payload = json.dumps({"action": action, **kwargs})
    try:
        r = subprocess.run(
            ['curl', '-s', API, '-X', 'POST', '-H', 'Content-Type: application/json', '-d', payload],
            capture_output=True, text=True, timeout=15
        )
        return json.loads(r.stdout)
    except Exception as e:
        return {"error": str(e)}

def compute_rsi(closes, period=14):
    if len(closes) < period + 1:
        return None, None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i-1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    ag = sum(gains[:period]) / period
    al = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        ag = (ag * (period - 1) + gains[i]) / period
        al = (al * (period - 1) + losses[i]) / period
    rsi = 100 - 100 / (1 + ag / (al if al > 0 else 0.0001))
    # Prev RSI
    ag2 = sum(gains[:period]) / period
    al2 = sum(losses[:period]) / period
    for i in range(period, len(gains) - 1):
        ag2 = (ag2 * (period - 1) + gains[i]) / period
        al2 = (al2 * (period - 1) + losses[i]) / period
    prev_rsi = 100 - 100 / (1 + ag2 / (al2 if al2 > 0 else 0.0001))
    return rsi, prev_rsi

def compute_ema(data, period):
    k = 2 / (period + 1)
    v = data[0]
    for x in data[1:]:
        v = x * k + v * (1 - k)
    return v

def compute_macd_hist(closes):
    if len(closes) < 27:
        return None, None
    e12 = closes[0]; e26 = closes[0]
    macd_vals = []
    for c in closes:
        e12 = c * 2/13 + e12 * 11/13
        e26 = c * 2/27 + e26 * 25/27
        macd_vals.append(e12 - e26)
    signal = compute_ema(macd_vals, 9)
    hist = macd_vals[-1] - signal
    # Prev
    prev_macd = macd_vals[:-1]
    prev_signal = compute_ema(prev_macd, 9)
    prev_hist = prev_macd[-1] - prev_signal
    return hist, prev_hist

def analyze_symbol(symbol):
    """Get OHLCV + funding rate, compute indicators."""
    result = {"symbol": symbol, "short": symbol.split("/")[0]}

    # Get OHLCV
    data = fetch("ohlcv", symbol=symbol, timeframe="4h", limit=60)
    candles = data.get("ohlcv", [])
    if not candles or len(candles) < 20:
        result["error"] = "insufficient_data"
        return result

    closes = [c["close"] for c in candles]
    result["price"] = closes[-1]

    # RSI
    rsi, prev_rsi = compute_rsi(closes)
    if rsi is not None:
        result["rsi"] = round(rsi, 1)
        result["rsi_prev"] = round(prev_rsi, 1)
        result["rsi_dir"] = "RISING" if rsi > prev_rsi else "FALLING"

    # EMA(8), EMA(21), EMA(55)
    if len(closes) >= 55:
        e8 = compute_ema(closes, 8)
        e21 = compute_ema(closes, 21)
        e55 = compute_ema(closes, 55)
        result["ema8"] = e8
        result["ema21"] = e21
        result["ema55"] = e55
        result["ema55_dist"] = round((closes[-1] - e55) / e55 * 100, 2)
        result["ribbon"] = "BULL" if e8 > e21 > e55 else ("BEAR" if e55 > e21 > e8 else "MIXED")
        result["ema8_above_21"] = e8 > e21

    # MACD histogram
    hist, prev_hist = compute_macd_hist(closes)
    if hist is not None:
        result["macd_hist"] = hist
        result["macd_hist_prev"] = prev_hist
        result["macd_improving"] = hist > prev_hist
        result["macd_hist_positive"] = hist > 0

    time.sleep(DELAY)

    # Funding rate
    try:
        fr_data = fetch("funding_rate", symbol=symbol)
        fr = fr_data.get("fundingRate", {})
        rate = fr.get("fundingRate", 0)
        result["funding_rate"] = rate
        result["funding_ann"] = round(rate * 3 * 365 * 100, 1)
    except:
        result["funding_rate"] = None

    # Strategy assessments
    rsi_val = result.get("rsi")
    rsi_rising = result.get("rsi_dir") == "RISING"
    macd_imp = result.get("macd_improving", False)

    # EFR assessment
    if rsi_val is not None:
        if rsi_val < 25 and rsi_rising:
            result["efr_status"] = "STRONG_SETUP"
        elif rsi_val < 30 and rsi_rising:
            result["efr_status"] = "SETUP_FORMING"
        elif rsi_val < 35 and rsi_rising:
            result["efr_status"] = "WATCH"
        elif rsi_val < 25:
            result["efr_status"] = "CAPITULATION"
        elif rsi_val < 35:
            result["efr_status"] = "WEAK_WATCH"
        else:
            result["efr_status"] = "NONE"

    # FRC assessment
    fr_ann = result.get("funding_ann", 0)
    ema55_dist = result.get("ema55_dist", -999)
    if fr_ann and fr_ann < -10:
        if ema55_dist > 0:
            result["frc_status"] = "GATE_CLEARED"
        else:
            result["frc_status"] = "BLOCKED_PRICE"
    else:
        result["frc_status"] = "NO_CARRY"

    return result

def main():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"=== STRATEGY ARCHITECT MICRO-CAP SCAN: {now} ===")
    print(f"Scanning {len(MICRO_CAPS)} micro-cap symbols for EFR + FRC setups")
    print()

    results = []
    efr_candidates = []
    frc_candidates = []
    errors = []

    for i, symbol in enumerate(MICRO_CAPS):
        short = symbol.split("/")[0]
        print(f"[{i+1}/{len(MICRO_CAPS)}] {short}...", end=" ", flush=True)

        try:
            r = analyze_symbol(symbol)
            if "error" in r:
                print(f"SKIP ({r['error']})")
                errors.append(r)
            else:
                rsi = r.get("rsi", "N/A")
                rsi_d = r.get("rsi_dir", "?")
                fr = r.get("funding_ann", "N/A")
                efr = r.get("efr_status", "?")
                frc = r.get("frc_status", "?")
                print(f"RSI:{rsi} {rsi_d} | FR:{fr}% ann | EFR:{efr} | FRC:{frc}")
                results.append(r)

                if efr in ["STRONG_SETUP", "SETUP_FORMING", "CAPITULATION", "WATCH"]:
                    efr_candidates.append(r)
                if frc in ["GATE_CLEARED"]:
                    frc_candidates.append(r)
        except Exception as e:
            print(f"ERROR: {e}")
            errors.append({"symbol": symbol, "error": str(e)})

        time.sleep(DELAY)

    # Summary
    print(f"\n{'='*80}")
    print(f"SCAN COMPLETE: {len(results)}/{len(MICRO_CAPS)} scanned, {len(errors)} errors")
    print(f"EFR candidates: {len(efr_candidates)}")
    print(f"FRC candidates: {len(frc_candidates)}")

    if efr_candidates:
        print(f"\n--- EFR CANDIDATES (sorted by RSI, lowest first) ---")
        efr_sorted = sorted(efr_candidates, key=lambda x: x.get("rsi", 100))
        for r in efr_sorted:
            print(f"  {r['short']:>10} | RSI:{r.get('rsi','?'):>5} {r.get('rsi_dir','?'):>7} | "
                  f"FR:{r.get('funding_ann','?'):>7}% | EMA55:{r.get('ema55_dist','?'):>6}% | "
                  f"MACD imp:{r.get('macd_improving','?')} | Status:{r.get('efr_status','?')}")

    if frc_candidates:
        print(f"\n--- FRC CANDIDATES (price above EMA55 + negative funding) ---")
        frc_sorted = sorted(frc_candidates, key=lambda x: x.get("funding_ann", 0))
        for r in frc_sorted:
            print(f"  {r['short']:>10} | FR:{r.get('funding_ann','?'):>7}% ann | "
                  f"EMA55:{r.get('ema55_dist','?'):>6}% | RSI:{r.get('rsi','?'):>5} | "
                  f"Status:{r.get('frc_status','?')}")

    # Top movers (most extreme RSI in either direction)
    by_rsi = sorted([r for r in results if r.get("rsi")], key=lambda x: x["rsi"])
    print(f"\n--- MOST OVERSOLD (RSI < 40) ---")
    for r in by_rsi:
        if r["rsi"] >= 40:
            break
        print(f"  {r['short']:>10} | RSI:{r['rsi']:>5} {r.get('rsi_dir','?'):>7} | "
              f"Price:{r['price']:.6g} | FR:{r.get('funding_ann','N/A'):>7}% | "
              f"EMA55:{r.get('ema55_dist','?'):>6}%")

    # Extreme funding
    by_funding = sorted([r for r in results if r.get("funding_ann")], key=lambda x: x["funding_ann"])
    print(f"\n--- MOST EXTREME FUNDING (< -20% ann) ---")
    for r in by_funding:
        if r["funding_ann"] >= -20:
            break
        print(f"  {r['short']:>10} | FR:{r['funding_ann']:>7}% ann | "
              f"RSI:{r.get('rsi','?'):>5} | Price:{r['price']:.6g} | "
              f"EMA55:{r.get('ema55_dist','?'):>6}%")

    # JSON output
    print("\n---SCAN_JSON---")
    output = {
        "timestamp": now,
        "scanned": len(results),
        "errors": len(errors),
        "efr_candidates": [{k:v for k,v in r.items() if k not in ['ema8','ema21','ema55','macd_hist','macd_hist_prev']} for r in efr_candidates],
        "frc_candidates": [{k:v for k,v in r.items() if k not in ['ema8','ema21','ema55','macd_hist','macd_hist_prev']} for r in frc_candidates],
        "all_results": [{k:v for k,v in r.items() if k not in ['ema8','ema21','ema55','macd_hist','macd_hist_prev']} for r in results],
    }
    print(json.dumps(output))

if __name__ == "__main__":
    main()
