// ============================================================================
// PhantomX — Shared Formatting Utilities
// ============================================================================

/**
 * Smart price formatting — auto-detect decimal places based on price magnitude.
 * Handles everything from BTC ($67,351.70) to micro-cap tokens ($0.000001234).
 */
export function formatPrice(price: number): string {
  if (price == null || !isFinite(price)) return '$0';
  if (price === 0) return '$0';
  const abs = Math.abs(price);
  let decimals: number;
  if (abs >= 1000) decimals = 2;        // BTC: $67,351.70
  else if (abs >= 1) decimals = 4;      // ETH: $3,456.1234
  else if (abs >= 0.01) decimals = 5;   // GUN: $0.02777
  else if (abs >= 0.0001) decimals = 6; // Small tokens
  else decimals = 8;                     // Micro tokens
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Format a raw price number (no $ prefix) for use in labels etc.
 */
export function formatPriceRaw(price: number): string {
  if (price == null || !isFinite(price)) return '0';
  if (price === 0) return '0';
  const abs = Math.abs(price);
  let decimals: number;
  if (abs >= 1000) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 5;
  else if (abs >= 0.0001) decimals = 6;
  else decimals = 8;
  return price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Format USD amounts (balances, PnL) — always 2 decimal places.
 */
export function formatUsd(n: number): string {
  if (n == null || !isFinite(n)) return '0.00';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
