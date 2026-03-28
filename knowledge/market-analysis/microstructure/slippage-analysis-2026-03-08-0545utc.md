# Microstructure Analysis - March 8, 2026 05:45 UTC

## Order Book Depth Analysis

**Data Source**: Phemex mainnet order books
**Analysis Time**: 2026-03-08 05:45 UTC
**Position Size**: $97 notional (typical trade at current risk params)

### Major Pairs Microstructure

| Symbol | Spread (bps) | Bid Depth ($) | Ask Depth ($) | Imbalance | Liquidity Grade |
|--------|--------------|---------------|---------------|-----------|----------------|
| BTC/USDT | 0.15 | 69,731 | 27,452 | 2.54:1 ↗️ | **EXCELLENT** |
| ETH/USDT | 0.05 | 13,471 | 16,212 | 0.83:1 ↘️ | **EXCELLENT** |
| SOL/USDT | 1.21 | 14,234 | 5,179 | 2.75:1 ↗️ | **GOOD** |

### Extreme Fear Alts (High RSI Reversal Candidates)

| Symbol | Price | Spread (bps) | Bid Depth ($) | Ask Depth ($) | Imbalance | Risk Assessment |
|--------|-------|--------------|---------------|---------------|-----------|----------------|
| WIF | $0.1792 | **16.74** | 20,544 | 21,466 | 0.96:1 | ⚠️ **HIGH SPREAD RISK** |
| INJ | $2.847 | 7.02 | 33,502 | 33,071 | 1.01:1 | ✅ **ACCEPTABLE** |

## Slippage Modeling ($97 Position Size)

### Expected Slippage by Pair

For $97 notional market orders at 50x leverage:

**Major Pairs (Excellent Liquidity)**:
- BTC/USDT: **0.15 bps** (top of book sufficient)
- ETH/USDT: **0.05 bps** (top of book sufficient)
- SOL/USDT: **1.21 bps** (top of book sufficient)

**Extreme Fear Alts**:
- WIF: **16.74 bps** ⚠️ (exceeds 5 bps threshold)
- INJ: **7.02 bps** ⚠️ (exceeds 5 bps threshold)

### Execution Recommendations

**✅ MARKET ORDERS APPROVED** (slippage <0.05% at 50x):
- BTC/USDT, ETH/USDT, SOL/USDT

**⚠️ LIMIT ORDERS REQUIRED** (spread >5 bps):
- WIF, INJ - Use limit orders with 1-2 tick buffer

**🔴 AVOID** (insufficient liquidity analysis):
- Requires deeper book analysis for micro-caps

## Market Bias Signals

**Bullish Pressure Pairs**:
- SOL: 2.75:1 bid/ask imbalance (strong bullish)
- BTC: 2.54:1 bid/ask imbalance (bullish)

**Neutral/Bearish Pairs**:
- ETH: 0.83:1 slight ask-heavy (bearish lean)
- WIF, INJ: ~1:1 balanced (no directional bias)

## Risk Warnings

1. **WIF spread concern**: 16.74 bps spread = 0.84% P&L impact at 50x
2. **Book depth timestamps**: Data snapshot only, rapid changes expected
3. **Liquidation clusters**: Analysis pending (requires OI data)

---
*Analysis by Market Microstructure Agent - amber-falcon*
*Next update: Order book monitoring every 15min during volatile sessions*