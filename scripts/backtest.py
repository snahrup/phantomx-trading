#!/usr/bin/env python3
"""
PhantomX Strategy Backtester v2
Tests EFR v1.0, EMA Ribbon v2.0, and Combined regime-switched strategy.
Fixed position sizing: notional = risk_amount / stop_distance (margin = notional / leverage).
"""

import json
import sys
import math
import urllib.request
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional

LEVERAGE = 50
FEE_RATE = 0.0006  # 0.06% round trip (taker)

# ============================================================================
# Data Fetching
# ============================================================================

def fetch_ohlcv(symbol="BTC/USDT:USDT", timeframe="4h", limit=500):
    url = "http://localhost:3100/api/phemex"
    payload = json.dumps({"action": "ohlcv", "symbol": symbol, "timeframe": timeframe, "limit": limit}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["ohlcv"]

# ============================================================================
# Indicators
# ============================================================================

def compute_ema(closes, period):
    if len(closes) < period:
        return [float('nan')] * len(closes)
    k = 2.0 / (period + 1)
    ema = [float('nan')] * (period - 1)
    sma = sum(closes[:period]) / period
    ema.append(sma)
    for i in range(period, len(closes)):
        ema.append(closes[i] * k + ema[-1] * (1 - k))
    return ema

def compute_rsi(closes, period=14):
    if len(closes) < period + 1:
        return [float('nan')] * len(closes)
    rsi = [float('nan')] * period
    gains, losses = [], []
    for i in range(1, period + 1):
        change = closes[i] - closes[i-1]
        gains.append(max(0, change))
        losses.append(max(0, -change))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        rsi.append(100.0)
    else:
        rsi.append(100.0 - (100.0 / (1.0 + avg_gain / avg_loss)))
    for i in range(period + 1, len(closes)):
        change = closes[i] - closes[i-1]
        avg_gain = (avg_gain * (period - 1) + max(0, change)) / period
        avg_loss = (avg_loss * (period - 1) + max(0, -change)) / period
        if avg_loss == 0:
            rsi.append(100.0)
        else:
            rsi.append(100.0 - (100.0 / (1.0 + avg_gain / avg_loss)))
    return rsi

def compute_macd(closes, fast=12, slow=26, signal=9):
    fast_ema = compute_ema(closes, fast)
    slow_ema = compute_ema(closes, slow)
    macd_line = [float('nan')] * len(closes)
    for i in range(slow - 1, len(closes)):
        if not math.isnan(fast_ema[i]) and not math.isnan(slow_ema[i]):
            macd_line[i] = fast_ema[i] - slow_ema[i]
    macd_vals = [v for v in macd_line if not math.isnan(v)]
    signal_ema = compute_ema(macd_vals, signal)
    signal_line = [float('nan')] * len(closes)
    hist = [float('nan')] * len(closes)
    macd_start = next(i for i, v in enumerate(macd_line) if not math.isnan(v))
    for j, v in enumerate(signal_ema):
        idx = macd_start + j
        if idx < len(closes) and not math.isnan(v):
            signal_line[idx] = v
            hist[idx] = macd_line[idx] - v
    return macd_line, signal_line, hist

def compute_bb(closes, period=20, std_dev=2):
    upper = [float('nan')] * len(closes)
    middle = [float('nan')] * len(closes)
    lower = [float('nan')] * len(closes)
    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1:i + 1]
        sma = sum(window) / period
        variance = sum((x - sma) ** 2 for x in window) / period
        sd = math.sqrt(variance)
        middle[i] = sma
        upper[i] = sma + std_dev * sd
        lower[i] = sma - std_dev * sd
    return upper, middle, lower

def compute_atr(candles, period=14):
    atr = [float('nan')] * len(candles)
    if len(candles) < period + 1:
        return atr
    trs = []
    for i in range(1, len(candles)):
        tr = max(
            candles[i]['high'] - candles[i]['low'],
            abs(candles[i]['high'] - candles[i-1]['close']),
            abs(candles[i]['low'] - candles[i-1]['close'])
        )
        trs.append(tr)
    atr_val = sum(trs[:period]) / period
    atr[period] = atr_val
    for i in range(period, len(trs)):
        atr_val = (atr_val * (period - 1) + trs[i]) / period
        atr[i + 1] = atr_val
    return atr

# ============================================================================
# Position Sizing — CORRECTED
# ============================================================================

def size_position(equity, risk_pct, stop_dist, max_notional_pct=1.0):
    """
    Calculate position notional and margin.

    risk_pct: fraction of equity willing to lose (e.g., 0.02 = 2%)
    stop_dist: fractional distance to stop loss (e.g., 0.012 = 1.2%)
    max_notional_pct: max notional as multiple of equity (e.g., 1.0 = 100% of equity)

    Returns (notional, margin) or (0, 0) if invalid.
    """
    if stop_dist <= 0 or equity <= 50:
        return 0, 0

    risk_amount = equity * risk_pct  # $ willing to lose
    notional = risk_amount / stop_dist  # Position size in USD

    # Cap notional (risk params: max 3x equity total, ~1x per position)
    max_notional = equity * max_notional_pct
    notional = min(notional, max_notional)

    margin = notional / LEVERAGE

    # Ensure margin doesn't exceed 70% of equity (margin utilization limit)
    max_margin = equity * 0.70
    if margin > max_margin:
        margin = max_margin
        notional = margin * LEVERAGE

    return notional, margin


def calc_pnl(notional, entry_price, exit_price, side):
    """Calculate P&L on a position."""
    if side == 'long':
        pnl_pct = (exit_price - entry_price) / entry_price
    else:
        pnl_pct = (entry_price - exit_price) / entry_price
    gross_pnl = notional * pnl_pct
    fee = notional * FEE_RATE
    return gross_pnl - fee, pnl_pct

# ============================================================================
# Trade Tracking
# ============================================================================

@dataclass
class Trade:
    entry_time: int
    exit_time: int = 0
    side: str = "long"
    entry_price: float = 0.0
    exit_price: float = 0.0
    notional: float = 0.0
    margin: float = 0.0
    stop_loss: float = 0.0
    pnl: float = 0.0
    pnl_pct: float = 0.0  # price change %
    equity_impact_pct: float = 0.0  # P&L as % of equity at entry
    exit_reason: str = ""
    r_multiple: float = 0.0
    strategy: str = ""

@dataclass
class BacktestResult:
    strategy_name: str = ""
    symbol: str = ""
    timeframe: str = ""
    period: str = ""
    initial_capital: float = 200.0
    final_equity: float = 200.0
    total_pnl: float = 0.0
    total_pnl_pct: float = 0.0
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    win_rate: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    avg_rr: float = 0.0
    profit_factor: float = 0.0
    max_drawdown_pct: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    buy_hold_pct: float = 0.0
    trades: list = field(default_factory=list)
    equity_curve: list = field(default_factory=list)
    avg_notional: float = 0.0
    avg_margin_util: float = 0.0


def compute_backtest_metrics(trades, equity_curve, initial_capital, first_price, last_price):
    result = BacktestResult()
    result.initial_capital = initial_capital
    result.trades = trades
    result.equity_curve = equity_curve

    if not trades:
        result.final_equity = initial_capital
        return result

    wins = [t for t in trades if t.pnl > 0]
    losses = [t for t in trades if t.pnl <= 0]
    result.total_trades = len(trades)
    result.wins = len(wins)
    result.losses = len(losses)
    result.win_rate = len(wins) / len(trades) if trades else 0
    result.total_pnl = sum(t.pnl for t in trades)
    result.final_equity = initial_capital + result.total_pnl
    result.total_pnl_pct = (result.total_pnl / initial_capital) * 100
    result.avg_win = (sum(t.pnl for t in wins) / len(wins)) if wins else 0
    result.avg_loss = (sum(abs(t.pnl) for t in losses) / len(losses)) if losses else 0
    total_gross_profit = sum(t.pnl for t in wins)
    total_gross_loss = sum(abs(t.pnl) for t in losses)
    result.profit_factor = (total_gross_profit / total_gross_loss) if total_gross_loss > 0 else float('inf')
    result.avg_rr = (result.avg_win / result.avg_loss) if result.avg_loss > 0 else float('inf')
    result.buy_hold_pct = ((last_price - first_price) / first_price) * 100
    result.avg_notional = sum(t.notional for t in trades) / len(trades)
    result.avg_margin_util = sum(t.margin for t in trades) / len(trades) / initial_capital * 100

    # Max drawdown
    peak = initial_capital
    max_dd = 0
    for eq in equity_curve:
        if eq > peak:
            peak = eq
        dd = (peak - eq) / peak
        if dd > max_dd:
            max_dd = dd
    result.max_drawdown_pct = max_dd * 100

    # Sharpe & Sortino from trade returns
    if len(trades) > 1:
        returns = [t.equity_impact_pct / 100 for t in trades]
        avg_ret = sum(returns) / len(returns)
        std = math.sqrt(sum((r - avg_ret) ** 2 for r in returns) / (len(returns) - 1))
        # Annualize assuming trading days span
        days_span = max(1, (trades[-1].exit_time - trades[0].entry_time) / 86400000)
        trades_per_year = len(trades) / days_span * 365
        ann_factor = math.sqrt(trades_per_year)
        result.sharpe_ratio = (avg_ret / std * ann_factor) if std > 0 else 0
        downside = [r for r in returns if r < 0]
        dd_std = math.sqrt(sum(r ** 2 for r in downside) / max(len(downside) - 1, 1)) if downside else 0
        result.sortino_ratio = (avg_ret / dd_std * ann_factor) if dd_std > 0 else 0

    return result


# ============================================================================
# Strategy: EMA Ribbon v2.0
# ============================================================================

def backtest_ema_ribbon_v2(candles, initial_capital=200.0):
    closes = [c['close'] for c in candles]
    ema8 = compute_ema(closes, 8)
    ema21 = compute_ema(closes, 21)
    ema55 = compute_ema(closes, 55)
    rsi = compute_rsi(closes, 14)
    atr = compute_atr(candles, 14)

    trades = []
    equity = initial_capital
    equity_curve = [equity]
    position = None
    risk_per_trade = 0.02
    cooldown_until = -1
    warmup = 55

    for i in range(warmup, len(candles)):
        c = candles[i]
        close = c['close']

        if any(math.isnan(v) for v in [ema8[i], ema21[i], ema55[i], rsi[i]]):
            equity_curve.append(equity)
            continue

        # --- Exit logic ---
        if position is not None:
            exit_price = None
            exit_reason = None

            # Stop loss
            if position['side'] == 'long' and c['low'] <= position['stop_loss']:
                exit_price = position['stop_loss']
                exit_reason = 'stop_loss'
            elif position['side'] == 'short' and c['high'] >= position['stop_loss']:
                exit_price = position['stop_loss']
                exit_reason = 'stop_loss'

            # TP1 (2R)
            if exit_price is None and position.get('tp1'):
                if position['side'] == 'long' and c['high'] >= position['tp1']:
                    exit_price = position['tp1']
                    exit_reason = 'take_profit'
                elif position['side'] == 'short' and c['low'] <= position['tp1']:
                    exit_price = position['tp1']
                    exit_reason = 'take_profit'

            # Signal exit: EMA cross
            if exit_price is None and position['side'] == 'long':
                if i > 0 and ema8[i] < ema21[i] and ema8[i-1] >= ema21[i-1]:
                    exit_price = close
                    exit_reason = 'signal_exit'
            elif exit_price is None and position['side'] == 'short':
                if i > 0 and ema8[i] > ema21[i] and ema8[i-1] <= ema21[i-1]:
                    exit_price = close
                    exit_reason = 'signal_exit'

            # Time exit: 12 candles (48h) no progress
            if exit_price is None and (i - position['entry_idx']) >= 12:
                entry_p = position['entry_price']
                if position['side'] == 'long' and close <= entry_p * 1.005:
                    exit_price = close
                    exit_reason = 'time_exit'
                elif position['side'] == 'short' and close >= entry_p * 0.995:
                    exit_price = close
                    exit_reason = 'time_exit'

            if exit_price is not None:
                pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], exit_price, position['side'])
                stop_dist = abs(position['entry_price'] - position['stop_loss']) / position['entry_price']
                r_mult = pnl_pct / stop_dist if stop_dist > 0 else 0

                # Prevent equity going below floor
                if equity + pnl < 50:
                    pnl = -(equity - 50)

                trade = Trade(
                    entry_time=candles[position['entry_idx']]['timestamp'],
                    exit_time=c['timestamp'],
                    side=position['side'],
                    entry_price=position['entry_price'],
                    exit_price=exit_price,
                    notional=position['notional'],
                    margin=position['margin'],
                    stop_loss=position['stop_loss'],
                    pnl=pnl,
                    pnl_pct=pnl_pct * 100,
                    equity_impact_pct=(pnl / equity) * 100,
                    exit_reason=exit_reason,
                    r_multiple=r_mult,
                    strategy='EMA-v2',
                )
                trades.append(trade)
                equity += pnl
                position = None
                if exit_reason == 'stop_loss':
                    cooldown_until = i + 2

        # --- Entry logic ---
        if position is None and i > cooldown_until:
            if rsi[i] > 72:
                equity_curve.append(equity)
                continue

            # LONG
            if (ema8[i] > ema21[i] > ema55[i] and
                40 <= rsi[i] <= 60 and
                i > 0 and closes[i] > ema21[i] and closes[i-1] <= ema21[i-1]):

                stop_dist = abs(close - ema55[i]) / close
                stop_dist = max(stop_dist, 0.004)  # Min 0.4% stop
                if stop_dist > 0.018:
                    equity_curve.append(equity)
                    continue

                notional, margin = size_position(equity, risk_per_trade, stop_dist, max_notional_pct=1.5)
                if notional > 0:
                    position = {
                        'side': 'long',
                        'entry_price': close,
                        'stop_loss': close * (1 - stop_dist),
                        'tp1': close * (1 + stop_dist * 2),
                        'notional': notional,
                        'margin': margin,
                        'entry_idx': i,
                    }

            # SHORT
            elif (ema55[i] > ema21[i] > ema8[i] and
                  40 <= rsi[i] <= 60 and
                  i > 0 and closes[i] < ema21[i] and closes[i-1] >= ema21[i-1]):

                stop_dist = abs(ema55[i] - close) / close
                stop_dist = max(stop_dist, 0.004)
                if stop_dist > 0.018:
                    equity_curve.append(equity)
                    continue

                notional, margin = size_position(equity, risk_per_trade, stop_dist, max_notional_pct=1.5)
                if notional > 0:
                    position = {
                        'side': 'short',
                        'entry_price': close,
                        'stop_loss': close * (1 + stop_dist),
                        'tp1': close * (1 - stop_dist * 2),
                        'notional': notional,
                        'margin': margin,
                        'entry_idx': i,
                    }

        equity_curve.append(equity)

    # Close remaining at EOD
    if position is not None:
        close = candles[-1]['close']
        pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], close, position['side'])
        if equity + pnl < 50:
            pnl = -(equity - 50)
        trade = Trade(entry_time=candles[position['entry_idx']]['timestamp'],
                      exit_time=candles[-1]['timestamp'], side=position['side'],
                      entry_price=position['entry_price'], exit_price=close,
                      notional=position['notional'], margin=position['margin'],
                      pnl=pnl, pnl_pct=pnl_pct*100, equity_impact_pct=(pnl/equity)*100,
                      exit_reason='end_of_data', strategy='EMA-v2')
        trades.append(trade)
        equity += pnl

    result = compute_backtest_metrics(trades, equity_curve, initial_capital, closes[0], closes[-1])
    result.strategy_name = "EMA Ribbon v2.0"
    result.symbol = "BTC/USDT:USDT"
    result.timeframe = "4H"
    result.period = f"{datetime.fromtimestamp(candles[0]['timestamp']/1000).strftime('%Y-%m-%d')} to {datetime.fromtimestamp(candles[-1]['timestamp']/1000).strftime('%Y-%m-%d')}"
    return result


# ============================================================================
# Strategy: Extreme Fear Reversal v1.0
# ============================================================================

def backtest_efr_v1(candles, initial_capital=200.0):
    closes = [c['close'] for c in candles]
    ema8 = compute_ema(closes, 8)
    ema21 = compute_ema(closes, 21)
    rsi = compute_rsi(closes, 14)
    _, _, hist = compute_macd(closes)
    _, bb_middle, bb_lower = compute_bb(closes, 20, 2)
    atr = compute_atr(candles, 14)

    trades = []
    equity = initial_capital
    equity_curve = [equity]
    position = None
    risk_per_trade = 0.015  # 1.5%
    stop_pct = 0.012  # 1.2%
    tp_pct = 0.024  # 2.4%
    cooldown_until = -1
    warmup = 35

    for i in range(warmup, len(candles)):
        c = candles[i]
        close = c['close']

        if any(math.isnan(v) for v in [ema8[i], ema21[i], rsi[i], bb_lower[i]]):
            equity_curve.append(equity)
            continue
        if math.isnan(hist[i]) or (i > 0 and math.isnan(hist[i-1])):
            equity_curve.append(equity)
            continue

        # --- Exit logic ---
        if position is not None:
            exit_price = None
            exit_reason = None

            if c['low'] <= position['stop_loss']:
                exit_price = position['stop_loss']
                exit_reason = 'stop_loss'

            if exit_price is None and c['high'] >= position['tp1']:
                exit_price = position['tp1']
                exit_reason = 'take_profit'

            # Waterfall exit: 3 consecutive bearish candles
            if exit_price is None and i >= position['entry_idx'] + 3:
                if all(candles[j]['close'] < candles[j]['open'] for j in range(i-2, i+1)):
                    exit_price = close
                    exit_reason = 'waterfall_exit'

            # Time exit: 72h = 18 candles
            if exit_price is None and (i - position['entry_idx']) >= 18:
                pnl_check = (close - position['entry_price']) / position['entry_price']
                if pnl_check < tp_pct:
                    exit_price = close
                    exit_reason = 'time_exit'

            if exit_price is not None:
                pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], exit_price, 'long')
                r_mult = pnl_pct / stop_pct if stop_pct > 0 else 0
                if equity + pnl < 50:
                    pnl = -(equity - 50)

                trade = Trade(
                    entry_time=candles[position['entry_idx']]['timestamp'],
                    exit_time=c['timestamp'], side='long',
                    entry_price=position['entry_price'], exit_price=exit_price,
                    notional=position['notional'], margin=position['margin'],
                    stop_loss=position['stop_loss'], pnl=pnl, pnl_pct=pnl_pct*100,
                    equity_impact_pct=(pnl/equity)*100,
                    exit_reason=exit_reason, r_multiple=r_mult, strategy='EFR-v1',
                )
                trades.append(trade)
                equity += pnl
                position = None
                if exit_reason == 'stop_loss':
                    cooldown_until = i + 2

        # --- Entry logic (LONG only) ---
        if position is None and i > cooldown_until:
            if rsi[i] > 72:
                equity_curve.append(equity)
                continue

            # Strict: all 4 conditions
            rsi_cross_30 = (i > 0 and rsi[i-1] <= 30 and rsi[i] > 30)
            above_bb_lower = (close > bb_lower[i])
            macd_cross_0 = (i > 0 and hist[i-1] <= 0 and hist[i] > 0)
            ema8_cross_21 = (i > 0 and ema8[i-1] <= ema21[i-1] and ema8[i] > ema21[i])

            strict_entry = rsi_cross_30 and above_bb_lower and macd_cross_0 and ema8_cross_21

            # Relaxed: RSI recovering from oversold + MACD improving + near BB lower
            relaxed_entry = (rsi[i] < 35 and i > 0 and rsi[i] > rsi[i-1] and
                           hist[i] > hist[i-1] and close > bb_lower[i] and close < bb_middle[i] and
                           not math.isnan(atr[i]) and atr[i] > 0)

            if strict_entry or relaxed_entry:
                entry_price = close * 1.001  # 0.1% slippage
                notional, margin = size_position(equity, risk_per_trade, stop_pct, max_notional_pct=1.0)

                if notional > 0:
                    position = {
                        'entry_price': entry_price,
                        'stop_loss': entry_price * (1 - stop_pct),
                        'tp1': entry_price * (1 + tp_pct),
                        'notional': notional,
                        'margin': margin,
                        'entry_idx': i,
                    }

        equity_curve.append(equity)

    if position is not None:
        close = candles[-1]['close']
        pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], close, 'long')
        if equity + pnl < 50:
            pnl = -(equity - 50)
        trade = Trade(entry_time=candles[position['entry_idx']]['timestamp'],
                      exit_time=candles[-1]['timestamp'], side='long',
                      entry_price=position['entry_price'], exit_price=close,
                      notional=position['notional'], margin=position['margin'],
                      pnl=pnl, pnl_pct=pnl_pct*100, equity_impact_pct=(pnl/equity)*100,
                      exit_reason='end_of_data', strategy='EFR-v1')
        trades.append(trade)
        equity += pnl

    result = compute_backtest_metrics(trades, equity_curve, initial_capital, closes[0], closes[-1])
    result.strategy_name = "Extreme Fear Reversal v1.0"
    result.symbol = "BTC/USDT:USDT"
    result.timeframe = "4H"
    result.period = f"{datetime.fromtimestamp(candles[0]['timestamp']/1000).strftime('%Y-%m-%d')} to {datetime.fromtimestamp(candles[-1]['timestamp']/1000).strftime('%Y-%m-%d')}"
    return result


# ============================================================================
# Strategy: Combined Regime-Switched
# ============================================================================

def backtest_combined(candles, initial_capital=200.0):
    closes = [c['close'] for c in candles]
    ema8 = compute_ema(closes, 8)
    ema21 = compute_ema(closes, 21)
    ema55 = compute_ema(closes, 55)
    rsi = compute_rsi(closes, 14)
    _, _, hist = compute_macd(closes)
    _, bb_middle, bb_lower = compute_bb(closes, 20, 2)
    atr = compute_atr(candles, 14)

    trades = []
    equity = initial_capital
    equity_curve = [equity]
    position = None
    cooldown_until = -1
    warmup = 55

    for i in range(warmup, len(candles)):
        c = candles[i]
        close = c['close']

        if any(math.isnan(v) for v in [ema8[i], ema21[i], ema55[i], rsi[i]]):
            equity_curve.append(equity)
            continue
        if math.isnan(hist[i]) or math.isnan(bb_lower[i]):
            equity_curve.append(equity)
            continue

        is_fear_regime = rsi[i] < 40 and hist[i] < 0

        # --- Exit logic ---
        if position is not None:
            exit_price = None
            exit_reason = None

            if position['side'] == 'long' and c['low'] <= position['stop_loss']:
                exit_price = position['stop_loss']
                exit_reason = 'stop_loss'
            elif position['side'] == 'short' and c['high'] >= position['stop_loss']:
                exit_price = position['stop_loss']
                exit_reason = 'stop_loss'

            if exit_price is None and position.get('tp1'):
                if position['side'] == 'long' and c['high'] >= position['tp1']:
                    exit_price = position['tp1']
                    exit_reason = 'take_profit'
                elif position['side'] == 'short' and c['low'] <= position['tp1']:
                    exit_price = position['tp1']
                    exit_reason = 'take_profit'

            if exit_price is None and position['side'] == 'long':
                if ema8[i] < ema21[i] and i > 0 and ema8[i-1] >= ema21[i-1]:
                    exit_price = close
                    exit_reason = 'signal_exit'
            elif exit_price is None and position['side'] == 'short':
                if ema8[i] > ema21[i] and i > 0 and ema8[i-1] <= ema21[i-1]:
                    exit_price = close
                    exit_reason = 'signal_exit'

            # Waterfall: 3 consecutive adverse candles
            if exit_price is None and i >= position['entry_idx'] + 3:
                if position['side'] == 'long':
                    if all(candles[j]['close'] < candles[j]['open'] for j in range(i-2, i+1)):
                        exit_price = close
                        exit_reason = 'waterfall_exit'
                else:
                    if all(candles[j]['close'] > candles[j]['open'] for j in range(i-2, i+1)):
                        exit_price = close
                        exit_reason = 'waterfall_exit'

            if exit_price is None and (i - position['entry_idx']) >= 18:
                exit_price = close
                exit_reason = 'time_exit'

            if exit_price is not None:
                pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], exit_price, position['side'])
                stop_dist = abs(position['entry_price'] - position['stop_loss']) / position['entry_price']
                r_mult = pnl_pct / stop_dist if stop_dist > 0 else 0
                if equity + pnl < 50:
                    pnl = -(equity - 50)

                trade = Trade(
                    entry_time=candles[position['entry_idx']]['timestamp'],
                    exit_time=c['timestamp'], side=position['side'],
                    entry_price=position['entry_price'], exit_price=exit_price,
                    notional=position['notional'], margin=position['margin'],
                    stop_loss=position['stop_loss'], pnl=pnl, pnl_pct=pnl_pct*100,
                    equity_impact_pct=(pnl/equity)*100,
                    exit_reason=exit_reason, r_multiple=r_mult,
                    strategy=position.get('strategy', 'Combined'),
                )
                trades.append(trade)
                equity += pnl
                position = None
                if exit_reason == 'stop_loss':
                    cooldown_until = i + 2

        # --- Entry logic ---
        if position is None and i > cooldown_until and equity > 50:
            if rsi[i] > 72:
                equity_curve.append(equity)
                continue

            entered = False

            # EFR entry (fear regime)
            if is_fear_regime and not entered:
                rsi_recovering = (rsi[i] < 35 and i > 0 and rsi[i] > rsi[i-1])
                macd_improving = (i > 0 and hist[i] > hist[i-1])
                near_bb_lower = (close > bb_lower[i])

                if rsi_recovering and macd_improving and near_bb_lower:
                    stop_pct = 0.012
                    tp_pct = 0.024
                    notional, margin = size_position(equity, 0.015, stop_pct, max_notional_pct=1.0)
                    if notional > 0:
                        position = {
                            'side': 'long',
                            'entry_price': close,
                            'stop_loss': close * (1 - stop_pct),
                            'tp1': close * (1 + tp_pct),
                            'notional': notional,
                            'margin': margin,
                            'entry_idx': i,
                            'strategy': 'EFR',
                        }
                        entered = True

            # EMA Ribbon entry (trending)
            if not entered:
                if (ema8[i] > ema21[i] > ema55[i] and 40 <= rsi[i] <= 60 and
                    i > 0 and closes[i] > ema21[i] and closes[i-1] <= ema21[i-1]):
                    stop_dist = max(abs(close - ema55[i]) / close, 0.004)
                    if stop_dist <= 0.018:
                        notional, margin = size_position(equity, 0.02, stop_dist, max_notional_pct=1.5)
                        if notional > 0:
                            position = {
                                'side': 'long', 'entry_price': close,
                                'stop_loss': close * (1 - stop_dist),
                                'tp1': close * (1 + stop_dist * 2),
                                'notional': notional, 'margin': margin,
                                'entry_idx': i, 'strategy': 'EMA',
                            }
                            entered = True

                elif (ema55[i] > ema21[i] > ema8[i] and 40 <= rsi[i] <= 60 and
                      i > 0 and closes[i] < ema21[i] and closes[i-1] >= ema21[i-1]):
                    stop_dist = max(abs(ema55[i] - close) / close, 0.004)
                    if stop_dist <= 0.018:
                        notional, margin = size_position(equity, 0.02, stop_dist, max_notional_pct=1.5)
                        if notional > 0:
                            position = {
                                'side': 'short', 'entry_price': close,
                                'stop_loss': close * (1 + stop_dist),
                                'tp1': close * (1 - stop_dist * 2),
                                'notional': notional, 'margin': margin,
                                'entry_idx': i, 'strategy': 'EMA',
                            }
                            entered = True

        equity_curve.append(equity)

    if position is not None:
        close = candles[-1]['close']
        pnl, pnl_pct = calc_pnl(position['notional'], position['entry_price'], close, position['side'])
        if equity + pnl < 50:
            pnl = -(equity - 50)
        trade = Trade(entry_time=candles[position['entry_idx']]['timestamp'],
                      exit_time=candles[-1]['timestamp'], side=position['side'],
                      entry_price=position['entry_price'], exit_price=close,
                      notional=position['notional'], margin=position['margin'],
                      pnl=pnl, pnl_pct=pnl_pct*100, equity_impact_pct=(pnl/equity)*100,
                      exit_reason='end_of_data', strategy=position.get('strategy', ''))
        trades.append(trade)
        equity += pnl

    result = compute_backtest_metrics(trades, equity_curve, initial_capital, closes[0], closes[-1])
    result.strategy_name = "Combined (Regime-Switched)"
    result.symbol = "BTC/USDT:USDT"
    result.timeframe = "4H"
    result.period = f"{datetime.fromtimestamp(candles[0]['timestamp']/1000).strftime('%Y-%m-%d')} to {datetime.fromtimestamp(candles[-1]['timestamp']/1000).strftime('%Y-%m-%d')}"
    return result


# ============================================================================
# Output
# ============================================================================

def print_result(r: BacktestResult):
    print(f"\n{'='*78}")
    print(f"  {r.strategy_name}")
    print(f"  {r.symbol} | {r.timeframe} | {r.period}")
    print(f"{'='*78}")
    print(f"  Initial Capital:   ${r.initial_capital:.2f}")
    print(f"  Final Equity:      ${r.final_equity:.2f}")
    print(f"  Total P&L:         ${r.total_pnl:.2f} ({r.total_pnl_pct:+.1f}%)")
    print(f"  Buy & Hold:        {r.buy_hold_pct:+.1f}%")
    print(f"  ---")
    print(f"  Total Trades:      {r.total_trades}")
    print(f"  Wins:              {r.wins} ({r.win_rate*100:.0f}%)")
    print(f"  Losses:            {r.losses}")
    print(f"  Avg Win:           ${r.avg_win:.2f}")
    print(f"  Avg Loss:          ${r.avg_loss:.2f}")
    print(f"  Avg R:R:           {r.avg_rr:.2f}:1")
    print(f"  Profit Factor:     {r.profit_factor:.2f}")
    print(f"  ---")
    print(f"  Max Drawdown:      {r.max_drawdown_pct:.1f}%")
    print(f"  Sharpe Ratio:      {r.sharpe_ratio:.2f}")
    print(f"  Sortino Ratio:     {r.sortino_ratio:.2f}")
    print(f"  Avg Notional:      ${r.avg_notional:.0f}")
    print(f"  Avg Margin Util:   {r.avg_margin_util:.1f}%")

    if r.trades:
        print(f"\n  {'#':>3} {'Strat':>5} {'Side':>5} {'Entry':>10} {'Exit':>10} {'Notional':>9} {'P&L':>10} {'Eq%':>7} {'R':>6} {'Reason':>15}")
        for j, t in enumerate(r.trades, 1):
            print(f"  {j:>3} {t.strategy:>5} {t.side:>5} ${t.entry_price:>9.1f} ${t.exit_price:>9.1f} ${t.notional:>8.0f} ${t.pnl:>+9.2f} {t.equity_impact_pct:>+6.1f}% {t.r_multiple:>+5.1f}R {t.exit_reason:>15}")


def main():
    print("PhantomX Strategy Backtester v2 (corrected position sizing)")
    print("Fetching BTC/USDT:USDT 4H data from Phemex...")

    try:
        candles = fetch_ohlcv("BTC/USDT:USDT", "4h", 500)
    except Exception as e:
        print(f"Error fetching data: {e}")
        sys.exit(1)

    print(f"Loaded {len(candles)} candles")
    print(f"Range: {datetime.fromtimestamp(candles[0]['timestamp']/1000)} to {datetime.fromtimestamp(candles[-1]['timestamp']/1000)}")
    print(f"Price: ${candles[0]['close']:.0f} -> ${candles[-1]['close']:.0f}")

    r1 = backtest_ema_ribbon_v2(candles)
    print_result(r1)

    r2 = backtest_efr_v1(candles)
    print_result(r2)

    r3 = backtest_combined(candles)
    print_result(r3)

    # Summary
    print(f"\n{'='*78}")
    print(f"  STRATEGY COMPARISON")
    print(f"{'='*78}")
    print(f"  {'Strategy':<30} {'P&L':>10} {'WR':>6} {'R:R':>6} {'PF':>6} {'DD':>7} {'Sharpe':>7} {'Avg Not':>9}")
    for r in [r1, r2, r3]:
        pf_str = f"{r.profit_factor:.1f}" if r.profit_factor < 100 else "inf"
        print(f"  {r.strategy_name:<30} ${r.total_pnl:>+8.2f} {r.win_rate*100:>5.0f}% {r.avg_rr:>5.1f}x {pf_str:>5} {r.max_drawdown_pct:>6.1f}% {r.sharpe_ratio:>6.2f} ${r.avg_notional:>7.0f}")
    print(f"  {'Buy & Hold':<30} {r1.buy_hold_pct:>+9.1f}%")

    # Compound growth projection
    print(f"\n  GROWTH PROJECTION ($200 -> $20,000)")
    for r in [r1, r2, r3]:
        if r.total_trades > 0 and r.total_pnl > 0:
            avg_return_per_trade = r.total_pnl / r.total_trades / r.initial_capital
            days_span = (candles[-1]['timestamp'] - candles[0]['timestamp']) / 86400000
            trades_per_year = r.total_trades / days_span * 365
            # Compound: how many trades to 100x
            if avg_return_per_trade > 0:
                trades_to_100x = math.log(100) / math.log(1 + avg_return_per_trade)
                years = trades_to_100x / trades_per_year
                print(f"  {r.strategy_name:<30}: {avg_return_per_trade*100:+.2f}% per trade, {trades_per_year:.0f} trades/yr, 100x in {years:.1f} years ({trades_to_100x:.0f} trades)")

    # Save results
    results = {
        "backtestDate": datetime.now().isoformat(),
        "backtesterVersion": "2.0",
        "dataRange": f"{datetime.fromtimestamp(candles[0]['timestamp']/1000).strftime('%Y-%m-%d')} to {datetime.fromtimestamp(candles[-1]['timestamp']/1000).strftime('%Y-%m-%d')}",
        "candles": len(candles),
        "leverage": LEVERAGE,
        "strategies": []
    }
    for r in [r1, r2, r3]:
        results["strategies"].append({
            "name": r.strategy_name,
            "initialCapital": r.initial_capital,
            "finalEquity": round(r.final_equity, 2),
            "totalPnl": round(r.total_pnl, 2),
            "totalPnlPct": round(r.total_pnl_pct, 1),
            "totalTrades": r.total_trades,
            "winRate": round(r.win_rate, 3),
            "avgRR": round(r.avg_rr, 2),
            "profitFactor": round(min(r.profit_factor, 999), 2),
            "maxDrawdownPct": round(r.max_drawdown_pct, 1),
            "sharpeRatio": round(r.sharpe_ratio, 2),
            "sortinoRatio": round(r.sortino_ratio, 2),
            "avgNotional": round(r.avg_notional, 0),
        })
    results["buyHoldPct"] = round(r1.buy_hold_pct, 1)

    with open("knowledge/strategies/backtest-results-2026-03-07.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to knowledge/strategies/backtest-results-2026-03-07.json")


if __name__ == "__main__":
    main()
