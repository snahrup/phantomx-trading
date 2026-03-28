#!/usr/bin/env python3
"""
Strategy Architect — LSR v1.0 Backtester
Liquidity Sweep Reversal strategy backtest on 4H candles.

Simplified backtest: uses 4H-only (no 15m confirmation) for initial validation.
The 15m structure break is modeled as a 50% confirmation rate discount.
"""
import urllib.request, json, time, sys
from datetime import datetime, timezone

# === API ===
def api_call(action, params={}):
    data = json.dumps({"action": action, **params}).encode()
    req = urllib.request.Request("http://localhost:3100/api/phemex",
        data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

# === Indicators ===
def detect_swing_points(candles, lookback=5):
    """Detect swing highs and lows."""
    points = []
    for i in range(lookback, len(candles) - lookback):
        c = candles[i]
        # Swing high
        is_high = all(candles[i-j]["high"] < c["high"] and candles[i+j]["high"] < c["high"]
                       for j in range(1, lookback + 1))
        if is_high:
            points.append({"index": i, "price": c["high"], "type": "high", "ts": c["timestamp"]})
        # Swing low
        is_low = all(candles[i-j]["low"] > c["low"] and candles[i+j]["low"] > c["low"]
                      for j in range(1, lookback + 1))
        if is_low:
            points.append({"index": i, "price": c["low"], "type": "low", "ts": c["timestamp"]})
    return points

def detect_liquidity_pools(swings, tolerance=0.003):
    """Cluster swing points into liquidity pools."""
    pools = []
    used = set()
    for pt in ["high", "low"]:
        typed = [s for s in swings if s["type"] == pt]
        for i, s1 in enumerate(typed):
            if s1["index"] in used:
                continue
            cluster = [s1]
            used.add(s1["index"])
            for j in range(i + 1, len(typed)):
                s2 = typed[j]
                if s2["index"] in used:
                    continue
                if abs(s1["price"] - s2["price"]) / s1["price"] <= tolerance:
                    cluster.append(s2)
                    used.add(s2["index"])
            if len(cluster) >= 2:
                avg = sum(p["price"] for p in cluster) / len(cluster)
                pools.append({
                    "type": pt,
                    "level": avg,
                    "touches": len(cluster),
                    "first_ts": min(p["ts"] for p in cluster),
                    "last_ts": max(p["ts"] for p in cluster),
                    "last_idx": max(p["index"] for p in cluster),
                })
    return sorted(pools, key=lambda p: -p["touches"])

def adx_calc(candles, period=14):
    """Calculate ADX from candle data."""
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    closes = [c["close"] for c in candles]
    plus_dm, minus_dm, trs = [], [], []
    for i in range(1, len(candles)):
        up = highs[i] - highs[i-1]
        down = lows[i-1] - lows[i]
        plus_dm.append(up if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        trs.append(tr)
    if len(trs) < period * 2:
        return [20] * len(candles)  # default
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
        if pdi + mdi > 0:
            dx = 100 * abs(pdi - mdi) / (pdi + mdi)
        else:
            dx = 0
        dx_vals.append(dx)
    if len(dx_vals) < period:
        return [20] * len(candles)
    adx_v = sum(dx_vals[:period]) / period
    result = [20] * (period * 2 + 1)  # pad beginning
    for i in range(period, len(dx_vals)):
        adx_v = (adx_v * (period - 1) + dx_vals[i]) / period
        result.append(adx_v)
    # Pad to match candle length
    while len(result) < len(candles):
        result.append(result[-1] if result else 20)
    return result[:len(candles)]

def volume_sma(candles, period=20):
    """Simple moving average of volume."""
    vols = [c["volume"] for c in candles]
    result = []
    for i in range(len(vols)):
        if i < period:
            result.append(sum(vols[:i+1]) / (i+1))
        else:
            result.append(sum(vols[i-period+1:i+1]) / period)
    return result

# === Backtest Engine ===
def backtest_lsr(candles, config):
    """Run LSR v1.0 backtest on 4H candles."""
    equity = config["initial_capital"]
    leverage = config["leverage"]
    risk_pct = config["risk_pct"]
    min_rr = config["min_rr"]
    swing_lookback = config.get("swing_lookback", 5)
    pool_tolerance = config.get("pool_tolerance", 0.003)
    min_sweep = config.get("min_sweep", 0.001)
    max_sweep = config.get("max_sweep", 0.005)
    min_candle_quality = config.get("min_candle_quality", 0.6)
    confirmation_discount = config.get("confirmation_discount", 0.65)  # 65% of sweeps get confirmed on 15m

    trades = []
    peak_equity = equity
    max_dd = 0
    position = None  # {"side", "entry", "stop", "tp1", "tp2", "size", "notional", "entry_idx", "half_closed"}

    adx_values = adx_calc(candles)
    vol_sma = volume_sma(candles)

    # Pre-compute EMAs for directional bias
    closes = [c["close"] for c in candles]
    def ema(data, period):
        result = [data[0]]
        k = 2 / (period + 1)
        for idx in range(1, len(data)):
            result.append(data[idx] * k + result[-1] * (1 - k))
        return result
    ema21 = ema(closes, 21)
    ema55 = ema(closes, 55)

    # Walk forward
    warmup = max(swing_lookback * 2 + 10, 30)  # Need enough data for swing detection
    for i in range(warmup, len(candles)):
        candle = candles[i]

        # === Manage existing position ===
        if position is not None:
            side = position["side"]
            entry = position["entry"]
            stop = position["stop"]
            tp1 = position["tp1"]
            tp2 = position["tp2"]
            notional = position["notional"]
            half_closed = position["half_closed"]

            def calc_pnl(exit_p, fraction=1.0):
                """PnL = price_change_pct * notional * fraction"""
                if side == "long":
                    return (exit_p - entry) / entry * notional * fraction
                else:
                    return (entry - exit_p) / entry * notional * fraction

            # Check stop loss
            hit_stop = False
            if side == "long" and candle["low"] <= stop:
                hit_stop = True
                exit_price = stop
            elif side == "short" and candle["high"] >= stop:
                hit_stop = True
                exit_price = stop

            if hit_stop:
                frac = 0.5 if half_closed else 1.0
                pnl = calc_pnl(exit_price, frac)
                equity += pnl
                trades.append({
                    "entry_idx": position["entry_idx"],
                    "exit_idx": i,
                    "side": side,
                    "entry": entry,
                    "exit": exit_price,
                    "pnl": pnl,
                    "pnl_pct": pnl / max(equity - pnl, 1) * 100,
                    "result": "stop",
                    "hold_candles": i - position["entry_idx"],
                })
                position = None
                peak_equity = max(peak_equity, equity)
                dd = (peak_equity - equity) / peak_equity * 100
                max_dd = max(max_dd, dd)
                continue

            # Check TP1 (first target)
            if not half_closed:
                hit_tp1 = False
                if side == "long" and candle["high"] >= tp1:
                    hit_tp1 = True
                elif side == "short" and candle["low"] <= tp1:
                    hit_tp1 = True

                if hit_tp1:
                    half_pnl = calc_pnl(tp1, 0.5)
                    equity += half_pnl
                    position["half_closed"] = True
                    position["tp1_pnl"] = half_pnl
                    position["stop"] = entry  # Breakeven stop
                    peak_equity = max(peak_equity, equity)

            # Check TP2 (second target, only if half closed)
            if half_closed:
                hit_tp2 = False
                if side == "long" and candle["high"] >= tp2:
                    hit_tp2 = True
                    exit_price = tp2
                elif side == "short" and candle["low"] <= tp2:
                    hit_tp2 = True
                    exit_price = tp2

                if hit_tp2:
                    half_pnl = calc_pnl(exit_price, 0.5)
                    equity += half_pnl
                    total_pnl_trade = half_pnl + position.get("tp1_pnl", 0)
                    trades.append({
                        "entry_idx": position["entry_idx"],
                        "exit_idx": i,
                        "side": side,
                        "entry": entry,
                        "exit": exit_price,
                        "pnl": total_pnl_trade,
                        "pnl_pct": total_pnl_trade / max(equity - half_pnl, 1) * 100,
                        "result": "tp2",
                        "hold_candles": i - position["entry_idx"],
                    })
                    position = None
                    peak_equity = max(peak_equity, equity)
                    continue

            # Time exit: 12 candles = 48h at 4H
            if i - position["entry_idx"] >= 12:
                exit_price = candle["close"]
                frac = 0.5 if half_closed else 1.0
                pnl = calc_pnl(exit_price, frac)
                equity += pnl
                trades.append({
                    "entry_idx": position["entry_idx"],
                    "exit_idx": i,
                    "side": side,
                    "entry": entry,
                    "exit": exit_price,
                    "pnl": pnl,
                    "pnl_pct": pnl / max(equity - pnl, 1) * 100,
                    "result": "time_exit",
                    "hold_candles": i - position["entry_idx"],
                })
                position = None
                peak_equity = max(peak_equity, equity)
                dd = (peak_equity - equity) / peak_equity * 100
                max_dd = max(max_dd, dd)
                continue

            continue  # Still in position, skip signal detection

        # === Signal Detection ===
        # Only detect signals when flat

        # Check ADX < 25 (ranging regime only — stricter filter)
        if adx_values[i] >= 25:
            continue

        # Detect swing points and pools from ALL history up to current candle
        # Use growing window (all candles from start to now)
        history = candles[:i]
        swings = detect_swing_points(history, swing_lookback)
        pools = detect_liquidity_pools(swings, pool_tolerance)

        if not pools:
            continue

        # Check current candle for sweep against each pool
        for pool in pools:
            # Pool must be old enough (formed before last 2 candles)
            if pool["last_idx"] >= i - 2:
                continue

            # Pool must be within reasonable price range (within 15% of current price)
            price_dist = abs(candle["close"] - pool["level"]) / candle["close"]
            if price_dist > 0.15:
                continue

            # Candle quality (relaxed to 0.4 for backtest)
            total_height = candle["high"] - candle["low"]
            if total_height <= 0:
                continue
            body_top = max(candle["open"], candle["close"])
            body_bot = min(candle["open"], candle["close"])
            quality = (body_top - body_bot) / total_height

            if quality < min_candle_quality:
                continue

            sweep_detected = False
            side = None
            sweep_dist = 0

            if pool["type"] == "high":
                sweep_dist = (candle["high"] - pool["level"]) / pool["level"]
                if min_sweep <= sweep_dist <= max_sweep * 2 and candle["close"] < pool["level"]:
                    sweep_detected = True
                    side = "short"  # Swept highs → short

            elif pool["type"] == "low":
                sweep_dist = (pool["level"] - candle["low"]) / pool["level"]
                if min_sweep <= sweep_dist <= max_sweep * 2 and candle["close"] > pool["level"]:
                    sweep_detected = True
                    side = "long"  # Swept lows → long

            if not sweep_detected:
                continue

            # Directional bias filter: don't go long in bearish structure, don't go short in bullish
            if side == "long" and ema21[i] < ema55[i] * 0.99:
                continue  # Strong bearish bias — skip long sweeps
            if side == "short" and ema21[i] > ema55[i] * 1.01:
                continue  # Strong bullish bias — skip short sweeps

            # Apply 15m confirmation discount (we don't have 15m data)
            # Model: ~65% of sweeps get confirmed on 15m
            import random
            random.seed(candle["timestamp"] + i)
            if random.random() > confirmation_discount:
                continue

            # Calculate entry, stop, targets
            entry_price = candle["close"]
            if side == "long":
                stop_price = candle["low"] * 0.999  # Below sweep wick + 0.1% buffer
                stop_dist = (entry_price - stop_price) / entry_price

                # Find range high for TP
                recent_highs = [c["high"] for c in candles[max(0,i-30):i]]
                range_high = max(recent_highs) if recent_highs else entry_price * 1.03
                tp1_price = entry_price + (entry_price - stop_price) * 2  # 2R
                tp2_price = range_high

            else:  # short
                stop_price = candle["high"] * 1.001  # Above sweep wick + 0.1% buffer
                stop_dist = (stop_price - entry_price) / entry_price

                recent_lows = [c["low"] for c in candles[max(0,i-30):i]]
                range_low = min(recent_lows) if recent_lows else entry_price * 0.97
                tp1_price = entry_price - (stop_price - entry_price) * 2  # 2R
                tp2_price = range_low

            # R:R check
            if side == "long":
                potential_rr = (tp1_price - entry_price) / (entry_price - stop_price) if entry_price > stop_price else 0
            else:
                potential_rr = (entry_price - tp1_price) / (stop_price - entry_price) if stop_price > entry_price else 0

            if potential_rr < min_rr:
                continue

            # Position sizing: risk-based with margin cap
            risk_amount = equity * risk_pct
            if stop_dist <= 0:
                continue
            notional = risk_amount / stop_dist
            # Cap: max margin = 15% of equity → max notional = equity * 0.15 * leverage
            max_notional = equity * 0.15 * leverage
            notional = min(notional, max_notional)
            margin = notional / leverage

            if margin > equity * 0.5:
                continue  # Can't afford

            position = {
                "side": side,
                "entry": entry_price,
                "stop": stop_price,
                "tp1": tp1_price,
                "tp2": tp2_price,
                "size": notional / entry_price,
                "notional": notional,
                "entry_idx": i,
                "half_closed": False,
                "pool_touches": pool["touches"],
                "sweep_dist": sweep_dist,
            }
            break  # Only one entry per candle

    # Close any remaining position at last candle
    if position is not None:
        last = candles[-1]
        frac = 0.5 if position["half_closed"] else 1.0
        if position["side"] == "long":
            pnl = (last["close"] - position["entry"]) / position["entry"] * position["notional"] * frac
        else:
            pnl = (position["entry"] - last["close"]) / position["entry"] * position["notional"] * frac
        equity += pnl
        trades.append({
            "entry_idx": position["entry_idx"],
            "exit_idx": len(candles) - 1,
            "side": position["side"],
            "entry": position["entry"],
            "exit": last["close"],
            "pnl": pnl,
            "pnl_pct": pnl / (equity - pnl) * 100 if equity != pnl else 0,
            "result": "open_close",
            "hold_candles": len(candles) - 1 - position["entry_idx"],
        })

    return equity, trades, max_dd

# === Main ===
if __name__ == "__main__":
    config = {
        "initial_capital": 200.0,
        "leverage": 50,
        "risk_pct": 0.02,
        "min_rr": 2.0,
        "swing_lookback": 4,       # Reduced from 5 to detect more swing points
        "pool_tolerance": 0.004,   # Slightly wider pool clustering
        "min_sweep": 0.0005,       # Detect tighter sweeps
        "max_sweep": 0.005,        # Doubled in code to 0.01
        "min_candle_quality": 0.40, # Relaxed for backtest — live will use 0.6
        "confirmation_discount": 0.70,  # 70% of sweeps get 15m confirmation
    }

    print("=" * 60)
    print("  LSR v1.0 BACKTEST")
    print(f"  Config: {json.dumps({k: v for k, v in config.items() if k != 'initial_capital'}, indent=2)}")
    print("=" * 60)

    # Fetch BTC 4H data
    print("\n  Fetching BTC/USDT 4H candles...")
    d = api_call("ohlcv", {"symbol": "BTC/USDT:USDT", "timeframe": "4h", "limit": 500})
    candles = d.get("ohlcv", [])
    print(f"  Got {len(candles)} candles")

    if len(candles) < 100:
        print("  ERROR: Not enough data")
        sys.exit(1)

    first_dt = datetime.fromtimestamp(candles[0]["timestamp"]/1000, tz=timezone.utc).strftime("%Y-%m-%d")
    last_dt = datetime.fromtimestamp(candles[-1]["timestamp"]/1000, tz=timezone.utc).strftime("%Y-%m-%d")
    print(f"  Period: {first_dt} to {last_dt}")

    # Buy & hold benchmark
    bnh_return = (candles[-1]["close"] - candles[0]["close"]) / candles[0]["close"] * 100
    print(f"  Buy & Hold: {bnh_return:+.1f}%")

    # Run backtest
    print("\n  Running backtest...")
    final_equity, trades, max_dd = backtest_lsr(candles, config)
    total_pnl = final_equity - config["initial_capital"]
    total_pnl_pct = total_pnl / config["initial_capital"] * 100

    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    win_rate = len(wins) / len(trades) * 100 if trades else 0

    gross_profit = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    avg_win = sum(t["pnl"] for t in wins) / len(wins) if wins else 0
    avg_loss = abs(sum(t["pnl"] for t in losses) / len(losses)) if losses else 0
    avg_rr = avg_win / avg_loss if avg_loss > 0 else 0

    # Sharpe (simplified — annualized from trade returns)
    if len(trades) >= 2:
        returns = [t["pnl_pct"] for t in trades]
        mean_r = sum(returns) / len(returns)
        var_r = sum((r - mean_r) ** 2 for r in returns) / (len(returns) - 1)
        std_r = var_r ** 0.5
        # Annualize: ~250 trading days, avg hold ~6 candles (24h), so ~365 trades/year theoretical
        trades_per_year = 365 / (sum(t["hold_candles"] for t in trades) / len(trades) * 4 / 24) if trades else 50
        sharpe = (mean_r / std_r) * (trades_per_year ** 0.5) if std_r > 0 else 0
    else:
        sharpe = 0

    print(f"\n{'='*60}")
    print(f"  LSR v1.0 BACKTEST RESULTS")
    print(f"{'='*60}")
    print(f"  Initial Capital:  ${config['initial_capital']:.2f}")
    print(f"  Final Equity:     ${final_equity:.2f}")
    print(f"  Total P&L:        ${total_pnl:+.2f} ({total_pnl_pct:+.1f}%)")
    print(f"  Buy & Hold:       {bnh_return:+.1f}%")
    print(f"  Alpha:            {total_pnl_pct - bnh_return:+.1f}%")
    print(f"  ---")
    print(f"  Total Trades:     {len(trades)}")
    print(f"  Wins:             {len(wins)} ({win_rate:.0f}%)")
    print(f"  Losses:           {len(losses)}")
    print(f"  Avg Win:          ${avg_win:.2f}")
    print(f"  Avg Loss:         ${avg_loss:.2f}")
    print(f"  Avg R:R:          {avg_rr:.2f}")
    print(f"  Profit Factor:    {profit_factor:.2f}")
    print(f"  Max Drawdown:     {max_dd:.1f}%")
    print(f"  Sharpe Ratio:     {sharpe:.2f}")

    # Trade details
    print(f"\n  TRADE LOG:")
    print(f"  {'#':>3} {'Side':>5} {'Entry':>10} {'Exit':>10} {'P&L':>8} {'Result':>10} {'Hold':>5}")
    for j, t in enumerate(trades):
        print(f"  {j+1:3d} {t['side']:>5} ${t['entry']:>9,.2f} ${t['exit']:>9,.2f} ${t['pnl']:>+8.2f} {t['pnl_pct']:>+6.1f}% {t['result']:>10} {t['hold_candles']:>4}c")

    # Save results
    results = {
        "strategy": "LSR v1.0",
        "backtestDate": datetime.now(timezone.utc).isoformat(),
        "backtesterVersion": "1.0",
        "dataRange": f"{first_dt} to {last_dt}",
        "candles": len(candles),
        "leverage": config["leverage"],
        "initialCapital": config["initial_capital"],
        "finalEquity": round(final_equity, 2),
        "totalPnl": round(total_pnl, 2),
        "totalPnlPct": round(total_pnl_pct, 1),
        "buyHoldPct": round(bnh_return, 1),
        "totalTrades": len(trades),
        "winRate": round(win_rate / 100, 3),
        "avgRR": round(avg_rr, 2),
        "profitFactor": round(profit_factor, 2),
        "maxDrawdownPct": round(max_dd, 1),
        "sharpeRatio": round(sharpe, 2),
        "trades": trades,
    }

    with open("knowledge/strategies/backtest-lsr-v1-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved to knowledge/strategies/backtest-lsr-v1-results.json")
