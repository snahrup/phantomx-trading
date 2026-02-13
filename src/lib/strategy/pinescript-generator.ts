// ============================================================================
// PhantomX — PineScript Strategy Generator
// ============================================================================

import type { StrategyConfig, RiskParameters, IndicatorConfig, ConditionGroup } from '@/types/trading';

// Sanitize user input for PineScript string embedding (prevent injection)
function sanitizePine(input: string): string {
  return input.replace(/[\\"\n\r\t]/g, '').replace(/[^\x20-\x7E]/g, '').slice(0, 100);
}

export function generatePineScript(config: StrategyConfig): string {
  const lines: string[] = [];
  const safeName = sanitizePine(config.name);
  const safeSymbol = sanitizePine(config.symbol);

  // Header
  lines.push(`//@version=5`);
  lines.push(`// ============================================================================`);
  lines.push(`// PhantomX Auto-Generated Strategy: ${safeName}`);
  lines.push(`// Symbol: ${safeSymbol} | Timeframe: ${config.timeframe}`);
  lines.push(`// Risk Level: ${config.risk.level}`);
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push(`// ============================================================================`);
  lines.push('');

  // Strategy declaration
  lines.push(`strategy("${safeName}", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=${config.risk.maxPositionSizePercent}, commission_type=strategy.commission.percent, commission_value=0.075, slippage=2, calc_on_every_tick=true)`);
  lines.push('');

  // Input parameters
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`// INPUTS`);
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`riskLevel = input.string("${config.risk.level}", "Risk Level", options=["conservative", "moderate", "aggressive", "degen"])`);
  lines.push(`stopLossPct = input.float(${config.risk.stopLossPercent}, "Stop Loss %", minval=0.1, step=0.1)`);
  lines.push(`takeProfitPct = input.float(${config.risk.takeProfitPercent}, "Take Profit %", minval=0.1, step=0.1)`);
  lines.push(`maxDrawdownPct = input.float(${config.risk.maxDrawdownPercent}, "Max Drawdown %", minval=1, step=1)`);
  lines.push(`dailyLossLimitPct = input.float(${config.risk.maxDailyLossPercent}, "Daily Loss Limit %", minval=1, step=1)`);
  if (config.risk.trailingStopPercent) {
    lines.push(`trailingStopPct = input.float(${config.risk.trailingStopPercent}, "Trailing Stop %", minval=0.1, step=0.1)`);
  }
  if (config.risk.hardFloorUsd) {
    lines.push(`hardFloorUsd = input.float(${config.risk.hardFloorUsd}, "Hard Floor (USD)")`);
  }
  if (config.risk.hardCeilingUsd) {
    lines.push(`hardCeilingUsd = input.float(${config.risk.hardCeilingUsd}, "Hard Ceiling (USD)")`);
  }
  lines.push('');

  // Generate indicator declarations
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`// INDICATORS`);
  lines.push(`// ═══════════════════════════════════════════`);
  const indicatorVars = generateIndicators(config.indicators, lines);
  lines.push('');

  // Kill switch logic
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`// KILL SWITCH — Safety Controls`);
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`var float peakEquity = strategy.initial_capital`);
  lines.push(`var float dailyStartEquity = strategy.initial_capital`);
  lines.push(`var int lastDay = dayofweek`);
  lines.push('');
  lines.push(`// Reset daily tracking`);
  lines.push(`if dayofweek != lastDay`);
  lines.push(`    dailyStartEquity := strategy.equity`);
  lines.push(`    lastDay := dayofweek`);
  lines.push('');
  lines.push(`// Track peak equity for drawdown calculation`);
  lines.push(`peakEquity := math.max(peakEquity, strategy.equity)`);
  lines.push('');
  lines.push(`// Calculate current drawdown and daily loss`);
  lines.push(`currentDrawdown = (peakEquity - strategy.equity) / peakEquity * 100`);
  lines.push(`dailyLoss = (dailyStartEquity - strategy.equity) / dailyStartEquity * 100`);
  lines.push('');
  lines.push(`// Kill conditions`);
  lines.push(`drawdownKill = currentDrawdown >= maxDrawdownPct`);
  lines.push(`dailyLossKill = dailyLoss >= dailyLossLimitPct`);
  if (config.risk.hardFloorUsd) {
    lines.push(`hardFloorKill = strategy.equity <= hardFloorUsd`);
  }
  if (config.risk.hardCeilingUsd) {
    lines.push(`hardCeilingHit = strategy.equity >= hardCeilingUsd`);
  }
  lines.push('');
  lines.push(`killSwitch = drawdownKill or dailyLossKill${config.risk.hardFloorUsd ? ' or hardFloorKill' : ''}${config.risk.hardCeilingUsd ? ' or hardCeilingHit' : ''}`);
  lines.push('');
  lines.push(`// Close all positions if kill switch triggers`);
  lines.push(`if killSwitch`);
  lines.push(`    strategy.close_all("KILL SWITCH")`);
  lines.push(`    alert("{\\"action\\":\\"kill\\",\\"reason\\":\\"" + (drawdownKill ? "max_drawdown" : dailyLossKill ? "daily_loss_limit" : "hard_limit") + "\\",\\"equity\\":" + str.tostring(strategy.equity) + "}", alert.freq_once_per_bar)`);
  lines.push('');

  // Entry/Exit conditions
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`// ENTRY & EXIT CONDITIONS`);
  lines.push(`// ═══════════════════════════════════════════`);
  const { entryLong, entryShort } = generateConditions(config.entryConditions, indicatorVars);
  const { exitLong, exitShort } = generateExitConditions(config.exitConditions, indicatorVars);

  lines.push(`longCondition = ${entryLong} and not killSwitch`);
  lines.push(`shortCondition = ${entryShort} and not killSwitch`);
  lines.push(`exitLongCondition = ${exitLong}`);
  lines.push(`exitShortCondition = ${exitShort}`);
  lines.push('');

  // Strategy entries with stop-loss and take-profit
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`// TRADE EXECUTION`);
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`if longCondition`);
  lines.push(`    strategy.entry("Long", strategy.long)`);
  lines.push(`    strategy.exit("Long TP/SL", "Long", profit=close * takeProfitPct / 100 / syminfo.mintick, loss=close * stopLossPct / 100 / syminfo.mintick${config.risk.trailingStopPercent ? ', trail_points=close * trailingStopPct / 100 / syminfo.mintick, trail_offset=close * trailingStopPct / 200 / syminfo.mintick' : ''})`);
  lines.push(`    alert("{\\"action\\":\\"buy\\",\\"symbol\\":\\"${safeSymbol}\\",\\"price\\":" + str.tostring(close) + ",\\"sl\\":" + str.tostring(close * (1 - stopLossPct/100)) + ",\\"tp\\":" + str.tostring(close * (1 + takeProfitPct/100)) + "}", alert.freq_once_per_bar)`);
  lines.push('');
  lines.push(`if shortCondition`);
  lines.push(`    strategy.entry("Short", strategy.short)`);
  lines.push(`    strategy.exit("Short TP/SL", "Short", profit=close * takeProfitPct / 100 / syminfo.mintick, loss=close * stopLossPct / 100 / syminfo.mintick${config.risk.trailingStopPercent ? ', trail_points=close * trailingStopPct / 100 / syminfo.mintick, trail_offset=close * trailingStopPct / 200 / syminfo.mintick' : ''})`);
  lines.push(`    alert("{\\"action\\":\\"sell\\",\\"symbol\\":\\"${safeSymbol}\\",\\"price\\":" + str.tostring(close) + ",\\"sl\\":" + str.tostring(close * (1 + stopLossPct/100)) + ",\\"tp\\":" + str.tostring(close * (1 - takeProfitPct/100)) + "}", alert.freq_once_per_bar)`);
  lines.push('');
  lines.push(`if exitLongCondition`);
  lines.push(`    strategy.close("Long", comment="Exit Signal")`);
  lines.push(`    alert("{\\"action\\":\\"close\\",\\"symbol\\":\\"${safeSymbol}\\",\\"side\\":\\"long\\",\\"price\\":" + str.tostring(close) + "}", alert.freq_once_per_bar)`);
  lines.push('');
  lines.push(`if exitShortCondition`);
  lines.push(`    strategy.close("Short", comment="Exit Signal")`);
  lines.push(`    alert("{\\"action\\":\\"close\\",\\"symbol\\":\\"${safeSymbol}\\",\\"side\\":\\"short\\",\\"price\\":" + str.tostring(close) + "}", alert.freq_once_per_bar)`);
  lines.push('');

  // Visual markers
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`// VISUAL MARKERS`);
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`plotshape(longCondition, style=shape.triangleup, location=location.belowbar, color=color.new(color.green, 0), size=size.small, title="Long Entry")`);
  lines.push(`plotshape(shortCondition, style=shape.triangledown, location=location.abovebar, color=color.new(color.red, 0), size=size.small, title="Short Entry")`);
  lines.push(`plotshape(exitLongCondition, style=shape.xcross, location=location.abovebar, color=color.new(color.orange, 0), size=size.tiny, title="Exit Long")`);
  lines.push(`plotshape(exitShortCondition, style=shape.xcross, location=location.belowbar, color=color.new(color.orange, 0), size=size.tiny, title="Exit Short")`);
  lines.push('');
  lines.push(`// Kill switch background`);
  lines.push(`bgcolor(killSwitch ? color.new(color.red, 85) : na, title="Kill Switch Active")`);
  lines.push('');

  // Info table
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`// INFO TABLE`);
  lines.push(`// ═══════════════════════════════════════════`);
  lines.push(`var table infoTable = table.new(position.top_right, 2, 6, bgcolor=color.new(color.black, 80), border_width=1)`);
  lines.push(`if barstate.islast`);
  lines.push(`    table.cell(infoTable, 0, 0, "Equity", text_color=color.white, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 1, 0, "$" + str.tostring(strategy.equity, "#.##"), text_color=color.green, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 0, 1, "Drawdown", text_color=color.white, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 1, 1, str.tostring(currentDrawdown, "#.##") + "%", text_color=currentDrawdown > maxDrawdownPct/2 ? color.orange : color.green, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 0, 2, "Daily PnL", text_color=color.white, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 1, 2, str.tostring(-dailyLoss, "#.##") + "%", text_color=dailyLoss > 0 ? color.red : color.green, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 0, 3, "Kill Switch", text_color=color.white, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 1, 3, killSwitch ? "ACTIVE" : "OK", text_color=killSwitch ? color.red : color.green, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 0, 4, "Open PnL", text_color=color.white, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 1, 4, "$" + str.tostring(strategy.openprofit, "#.##"), text_color=strategy.openprofit >= 0 ? color.green : color.red, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 0, 5, "Win Rate", text_color=color.white, text_size=size.small)`);
  lines.push(`    table.cell(infoTable, 1, 5, str.tostring(strategy.wintrades / math.max(strategy.closedtrades, 1) * 100, "#.#") + "%", text_color=color.white, text_size=size.small)`);

  return lines.join('\n');
}

// --- Default SMA Crossover Strategy ---

export function generateSMACrossoverStrategy(
  symbol: string,
  risk: RiskParameters,
  fastPeriod: number = 9,
  slowPeriod: number = 21,
  signalPeriod: number = 50
): string {
  const config: StrategyConfig = {
    id: crypto.randomUUID(),
    name: `SMA Crossover ${symbol}`,
    symbol,
    timeframe: '4h',
    status: 'draft',
    risk,
    indicators: [
      { type: 'SMA', params: { period: fastPeriod }, label: 'fastSMA' },
      { type: 'SMA', params: { period: slowPeriod }, label: 'slowSMA' },
      { type: 'SMA', params: { period: signalPeriod }, label: 'signalSMA' },
      { type: 'RSI', params: { period: 14 }, label: 'rsi' },
      { type: 'ATR', params: { period: 14 }, label: 'atr' },
    ],
    entryConditions: {
      logic: 'AND',
      conditions: [
        { indicator: 'fastSMA', operator: 'crosses_above', target: 'slowSMA' },
        { indicator: 'close', operator: 'above', target: 'signalSMA' },
        { indicator: 'rsi', operator: 'above', target: 30 },
        { indicator: 'rsi', operator: 'below', target: 70 },
      ],
    },
    exitConditions: {
      logic: 'OR',
      conditions: [
        { indicator: 'fastSMA', operator: 'crosses_below', target: 'slowSMA' },
        { indicator: 'rsi', operator: 'above', target: 80 },
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return generatePineScript(config);
}

// --- Indicator Generator Helpers ---

function generateIndicators(indicators: IndicatorConfig[], lines: string[]): Map<string, string> {
  const vars = new Map<string, string>();

  for (const ind of indicators) {
    const label = ind.label ?? `${ind.type.toLowerCase()}_${ind.params.period ?? 0}`;
    const varName = label.replace(/[^a-zA-Z0-9_]/g, '_');

    switch (ind.type) {
      case 'SMA':
        lines.push(`${varName} = ta.sma(close, ${ind.params.period ?? 20})`);
        lines.push(`plot(${varName}, "${label}", color=color.blue, linewidth=1)`);
        break;
      case 'EMA':
        lines.push(`${varName} = ta.ema(close, ${ind.params.period ?? 20})`);
        lines.push(`plot(${varName}, "${label}", color=color.orange, linewidth=1)`);
        break;
      case 'RSI':
        lines.push(`${varName} = ta.rsi(close, ${ind.params.period ?? 14})`);
        break;
      case 'MACD': {
        lines.push(`[${varName}_line, ${varName}_signal, ${varName}_hist] = ta.macd(close, ${ind.params.fast ?? 12}, ${ind.params.slow ?? 26}, ${ind.params.signal ?? 9})`);
        vars.set(`${label}_line`, `${varName}_line`);
        vars.set(`${label}_signal`, `${varName}_signal`);
        vars.set(`${label}_hist`, `${varName}_hist`);
        break;
      }
      case 'BB': {
        lines.push(`[${varName}_mid, ${varName}_upper, ${varName}_lower] = ta.bb(close, ${ind.params.period ?? 20}, ${ind.params.stddev ?? 2})`);
        lines.push(`plot(${varName}_upper, "${label} Upper", color=color.gray)`);
        lines.push(`plot(${varName}_lower, "${label} Lower", color=color.gray)`);
        vars.set(`${label}_mid`, `${varName}_mid`);
        vars.set(`${label}_upper`, `${varName}_upper`);
        vars.set(`${label}_lower`, `${varName}_lower`);
        break;
      }
      case 'ATR':
        lines.push(`${varName} = ta.atr(${ind.params.period ?? 14})`);
        break;
      case 'STOCH': {
        lines.push(`[${varName}_k, ${varName}_d] = ta.stoch(close, high, low, ${ind.params.period ?? 14}, ${ind.params.smooth ?? 3}, ${ind.params.signal ?? 3})`);
        vars.set(`${label}_k`, `${varName}_k`);
        vars.set(`${label}_d`, `${varName}_d`);
        break;
      }
      case 'ADX':
        lines.push(`[${varName}_plus, ${varName}_minus, ${varName}_val] = ta.dmi(${ind.params.period ?? 14}, ${ind.params.smooth ?? 14})`);
        vars.set(`${label}_plus`, `${varName}_plus`);
        vars.set(`${label}_minus`, `${varName}_minus`);
        vars.set(`${label}_val`, `${varName}_val`);
        break;
      case 'VWAP':
        lines.push(`${varName} = ta.vwap`);
        lines.push(`plot(${varName}, "${label}", color=color.purple, linewidth=2)`);
        break;
      default:
        lines.push(`// Unsupported indicator: ${ind.type}`);
    }

    vars.set(label, varName);
  }

  return vars;
}

function generateConditions(
  group: ConditionGroup,
  indicatorVars: Map<string, string>
): { entryLong: string; entryShort: string } {
  const longParts: string[] = [];
  const shortParts: string[] = [];

  for (const cond of group.conditions) {
    if ('logic' in cond) {
      const nested = generateConditions(cond as ConditionGroup, indicatorVars);
      longParts.push(`(${nested.entryLong})`);
      shortParts.push(`(${nested.entryShort})`);
    } else {
      const c = cond;
      const indVar = indicatorVars.get(c.indicator) ?? c.indicator;
      const targetVar = typeof c.target === 'string'
        ? (indicatorVars.get(c.target) ?? c.target)
        : c.target.toString();

      switch (c.operator) {
        case 'crosses_above':
          longParts.push(`ta.crossover(${indVar}, ${targetVar})`);
          shortParts.push(`ta.crossunder(${indVar}, ${targetVar})`);
          break;
        case 'crosses_below':
          longParts.push(`ta.crossunder(${indVar}, ${targetVar})`);
          shortParts.push(`ta.crossover(${indVar}, ${targetVar})`);
          break;
        case 'above':
          longParts.push(`${indVar} > ${targetVar}`);
          shortParts.push(`${indVar} < ${targetVar}`);
          break;
        case 'below':
          longParts.push(`${indVar} < ${targetVar}`);
          shortParts.push(`${indVar} > ${targetVar}`);
          break;
        case 'equals':
          longParts.push(`${indVar} == ${targetVar}`);
          shortParts.push(`${indVar} == ${targetVar}`);
          break;
      }
    }
  }

  const joiner = group.logic === 'AND' ? ' and ' : ' or ';
  return {
    entryLong: longParts.join(joiner) || 'false',
    entryShort: shortParts.join(joiner) || 'false',
  };
}

function generateExitConditions(
  group: ConditionGroup,
  indicatorVars: Map<string, string>
): { exitLong: string; exitShort: string } {
  const { entryLong, entryShort } = generateConditions(group, indicatorVars);
  return { exitLong: entryLong, exitShort: entryShort };
}
