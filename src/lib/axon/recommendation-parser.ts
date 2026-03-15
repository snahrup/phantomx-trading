// ============================================================================
// PhantomX — Axon Trade Recommendation Parser
// ============================================================================
// Extracts structured trade parameters from Wave 5 recommendation comments
// produced by the Execution Trader agent. Handles natural-language variations
// agents might use for price levels, position sizing, etc.
// ============================================================================

import type { AxonIssueComment, AxonIssue } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TakeProfitTarget {
  price: number;
  closePercent: number;
}

export interface TradeRecommendation {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfitTargets: TakeProfitTarget[];
  positionSizeNotional: number;
  positionSizeMargin: number;
  leverage: number;
  riskRewardRatio: number;
  strategy: string;
  confidence: string;       // HIGH, MEDIUM, LOW
  approvedBy: string[];     // Agent names that approved
  rawComment: string;
  issueId: string;
  issueTitle: string;
  commentId: string;
}

// ---------------------------------------------------------------------------
// Number extraction helpers
// ---------------------------------------------------------------------------

/** Strip dollar signs, commas, and whitespace from a numeric string */
function cleanNum(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const val = parseFloat(cleaned);
  return isFinite(val) ? val : 0;
}

/**
 * Extract first number from a line. Handles formats:
 *   "$73,200"  "73200"  "73,200.50"  "0.05 BTC"
 */
function extractNumber(text: string): number {
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (!match) return 0;
  return cleanNum(match[1]);
}

/**
 * Extract a number from a line matching a pattern.
 * Searches for lines matching the regex, then pulls the first number.
 */
function extractFromPattern(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  if (!match) return 0;
  return extractNumber(match[0]);
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function parseSymbol(text: string, issueTitle: string): string {
  // Try issue title first — "TRADE: BTC/USDT LONG" or "BTC/USDT SHORT"
  const titleMatch = issueTitle.match(/([A-Z]{2,10}\/[A-Z]{2,10})/);
  if (titleMatch) return titleMatch[1];

  // Try comment body — "Symbol: BTC/USDT" or just "BTC/USDT" standalone
  const bodySymbol = text.match(/(?:symbol|pair|market)\s*[:=]\s*([A-Z]{2,10}\/[A-Z]{2,10})/i);
  if (bodySymbol) return bodySymbol[1].toUpperCase();

  // Freestanding pair
  const freestanding = text.match(/\b([A-Z]{2,10}\/[A-Z]{2,10})\b/);
  if (freestanding) return freestanding[1];

  return 'UNKNOWN/USDT';
}

function parseDirection(text: string, issueTitle: string): 'LONG' | 'SHORT' {
  const combined = `${issueTitle}\n${text}`;

  // Explicit direction labels
  if (/\bSHORT\b/i.test(combined)) return 'SHORT';
  if (/\bLONG\b/i.test(combined)) return 'LONG';

  // Direction from "sell" / "buy"
  if (/\b(direction|side)\s*[:=]\s*sell\b/i.test(combined)) return 'SHORT';
  if (/\b(direction|side)\s*[:=]\s*buy\b/i.test(combined)) return 'LONG';

  return 'LONG'; // default
}

function parseEntry(text: string): number {
  // "Entry: $73,200" or "Entry zone: 73200-73400" (take midpoint) or "Entry Price: 73200"
  const zoneMatch = text.match(/entry\s*(?:zone|range)?\s*[:=]\s*\$?([\d,]+\.?\d*)\s*[-–]\s*\$?([\d,]+\.?\d*)/i);
  if (zoneMatch) {
    const low = cleanNum(zoneMatch[1]);
    const high = cleanNum(zoneMatch[2]);
    return (low + high) / 2;
  }

  return extractFromPattern(text, /entry\s*(?:price)?\s*[:=]\s*\$?[\d,]+\.?\d*/i);
}

function parseStopLoss(text: string): number {
  // "Stop: $72,100" or "SL: 72100" or "Stop Loss: $72,100"
  return extractFromPattern(
    text,
    /(?:stop\s*(?:loss)?|sl)\s*[:=]\s*\$?[\d,]+\.?\d*/i,
  );
}

function parseTakeProfitTargets(text: string): TakeProfitTarget[] {
  const targets: TakeProfitTarget[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // "TP1: $75,400 (close 50%)" or "Target 1: 75400 → 50%" or "TP2: $77,000 (25%)"
    const tpMatch = line.match(
      /(?:tp\s*\d*|target\s*\d*|take\s*profit\s*\d*)\s*[:=]\s*\$?([\d,]+\.?\d*).*?(\d+)\s*%/i,
    );
    if (tpMatch) {
      targets.push({
        price: cleanNum(tpMatch[1]),
        closePercent: parseInt(tpMatch[2], 10),
      });
      continue;
    }

    // "TP1: $75,400" without percentage — assume equal split later
    const tpNoPctMatch = line.match(
      /(?:tp\s*\d*|target\s*\d*|take\s*profit\s*\d*)\s*[:=]\s*\$?([\d,]+\.?\d*)/i,
    );
    if (tpNoPctMatch) {
      targets.push({
        price: cleanNum(tpNoPctMatch[1]),
        closePercent: 0, // will be normalized later
      });
    }
  }

  // Normalize percentages if they were missing
  if (targets.length > 0) {
    const hasPercentages = targets.some((t) => t.closePercent > 0);
    if (!hasPercentages) {
      // Equal split
      const pct = Math.floor(100 / targets.length);
      targets.forEach((t, i) => {
        t.closePercent = i === targets.length - 1 ? 100 - pct * (targets.length - 1) : pct;
      });
    }
  }

  return targets;
}

function parsePositionSize(text: string): { notional: number; margin: number } {
  let notional = 0;
  let margin = 0;

  // "Size: $29.06 notional" or "Position Size: $29.06"
  const notionalMatch = text.match(
    /(?:size|position\s*size|notional)\s*[:=]\s*\$?([\d,]+\.?\d*)\s*(?:notional|usd)?/i,
  );
  if (notionalMatch) notional = cleanNum(notionalMatch[1]);

  // "Margin: $0.58" or "$0.58 margin"
  const marginMatch = text.match(
    /(?:margin|collateral)\s*[:=]\s*\$?([\d,]+\.?\d*)/i,
  );
  if (marginMatch) margin = cleanNum(marginMatch[1]);

  // Fallback: "$29.06 ($0.58 margin)"
  if (!margin && notional) {
    const parenMatch = text.match(/\(\$?([\d,]+\.?\d*)\s*margin\)/i);
    if (parenMatch) margin = cleanNum(parenMatch[1]);
  }

  return { notional, margin };
}

function parseLeverage(text: string): number {
  // "Leverage: 50x" or "50x leverage" or "Lev: 50"
  const match = text.match(/(?:leverage|lev)\s*[:=]\s*(\d+)\s*x?/i);
  if (match) return parseInt(match[1], 10);

  // "50x leverage" or "leverage 50x" — require "leverage" context to avoid matching "10x returns"
  const standaloneMatch = text.match(/(?:\b(\d+)\s*x\s+leverage\b|\bleverage\s+(\d+)\s*x?\b)/i);
  if (standaloneMatch) return parseInt(standaloneMatch[1] || standaloneMatch[2], 10);

  return 1;
}

function parseRiskReward(text: string): number {
  // "R:R: 2:1" or "R/R: 2.5:1" or "Risk/Reward: 2:1" or "Risk:Reward: 2.5"
  const match = text.match(
    /(?:r\s*[:/]\s*r|risk\s*[:/]\s*reward)\s*[:=]\s*([\d.]+)\s*(?::?\s*1)?/i,
  );
  if (match) return parseFloat(match[1]);
  return 0;
}

function parseStrategy(text: string): string {
  // "Strategy: EFR v1.1" or "Strategy Name: Mean Reversion"
  const match = text.match(/strategy\s*(?:name)?\s*[:=]\s*(.+)/i);
  if (match) return match[1].trim();
  return 'Unknown';
}

function parseConfidence(text: string): string {
  // "Confidence: HIGH" or "Signal Confidence: Medium"
  const match = text.match(/confidence\s*[:=]\s*(high|medium|low)/i);
  if (match) return match[1].toUpperCase() as string;

  // Infer from percentage — "Confidence: 85%"
  const pctMatch = text.match(/confidence\s*[:=]\s*(\d+)\s*%?/i);
  if (pctMatch) {
    const pct = parseInt(pctMatch[1], 10);
    if (pct >= 75) return 'HIGH';
    if (pct >= 50) return 'MEDIUM';
    return 'LOW';
  }

  return 'MEDIUM';
}

function parseApprovedBy(text: string): string[] {
  const approvers: string[] = [];

  // Look for check marks: "✅ CEO" or "[x] Head of Trading" or "✓ Risk Manager"
  const checkMatches = text.matchAll(/(?:[✅✓☑]|\[x\])\s+([^\n✅✓☑\[]+)/gi);
  for (const m of checkMatches) {
    const name = m[1].trim().replace(/\s*[✅✓☑].*$/, '');
    if (name) approvers.push(name);
  }

  // Fallback: "Approved by: CEO, Head of Trading, Risk Manager"
  if (approvers.length === 0) {
    const approvedMatch = text.match(/approved\s*(?:by)?\s*[:=]\s*(.+)/i);
    if (approvedMatch) {
      approvedMatch[1].split(/[,;&]/).forEach((s) => {
        const trimmed = s.trim();
        if (trimmed) approvers.push(trimmed);
      });
    }
  }

  return approvers;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a Wave 5 recommendation comment into a structured TradeRecommendation.
 * Returns null if the comment doesn't contain enough data to form a valid recommendation.
 */
export function parseRecommendation(
  comment: AxonIssueComment,
  issue: AxonIssue,
): TradeRecommendation | null {
  const text = comment.content;

  const symbol = parseSymbol(text, issue.title);
  const direction = parseDirection(text, issue.title);
  const entryPrice = parseEntry(text);
  const stopLoss = parseStopLoss(text);
  const takeProfitTargets = parseTakeProfitTargets(text);
  const { notional, margin } = parsePositionSize(text);
  const leverage = parseLeverage(text);
  const riskRewardRatio = parseRiskReward(text);
  const strategy = parseStrategy(text);
  const confidence = parseConfidence(text);
  const approvedBy = parseApprovedBy(text);

  // Reject if symbol couldn't be determined
  if (symbol === 'UNKNOWN/USDT') return null;

  // Reject if no directional keywords found — defaulting to LONG is dangerous
  // for leveraged orders when direction is truly ambiguous
  const combined = `${issue.title}\n${text}`;
  if (!/\b(long|short|buy|sell|bullish|bearish)\b/i.test(combined)) return null;

  // Minimum viable recommendation: need entry and stop
  if (!entryPrice || !stopLoss) return null;

  // If R:R wasn't explicitly stated, compute it from entry/stop/first TP
  let computedRR = riskRewardRatio;
  if (!computedRR && takeProfitTargets.length > 0) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfitTargets[0].price - entryPrice);
    computedRR = risk > 0 ? Math.round((reward / risk) * 10) / 10 : 0;
  }

  // Compute margin from notional and leverage if missing
  let computedMargin = margin;
  if (!computedMargin && notional && leverage > 1) {
    computedMargin = notional / leverage;
  }

  return {
    symbol,
    direction,
    entryPrice,
    stopLoss,
    takeProfitTargets,
    positionSizeNotional: notional,
    positionSizeMargin: computedMargin,
    leverage,
    riskRewardRatio: computedRR,
    strategy,
    confidence,
    approvedBy,
    rawComment: text,
    issueId: issue.id,
    issueTitle: issue.title,
    commentId: comment.id,
  };
}
