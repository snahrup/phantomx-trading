import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// PhantomX — UI Validation Screenshot Suite
// Captures full-page and component screenshots for visual regression tracking.
// Screenshots are saved to tests/screenshots/ for QA review.
// ============================================================================

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

test.beforeAll(() => {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
});

// --------------------------------------------------------------------------
// Shared mock setup (replicates the main test helper)
// --------------------------------------------------------------------------

async function connectAndSetup(page: Page) {
  await page.route('**/api/phemex', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'check_env') {
      await route.fulfill({ json: { hasEnv: true, maskedKey: '****1234', envNetwork: 'testnet' } });
    } else if (body.action === 'connect_and_verify') {
      await route.fulfill({
        json: {
          success: true, network: 'testnet',
          account: { balances: [{ currency: 'USDT', total: 10000, free: 9500 }], totalUsdValue: 10000 },
          positionCount: 1,
          positions: [{ symbol: 'BTC/USDT:USDT', side: 'long', size: 0.01, unrealizedPnl: 50.25, id: 'pos-1', entryPrice: 94000, liquidationPrice: 80000, leverage: 10, markPrice: 95000 }],
          ticker: { symbol: 'BTC/USDT:USDT', last: 95000, changePercent24h: 2.5 },
        },
      });
    } else if (body.action === 'ticker') {
      await route.fulfill({ json: { ticker: { symbol: body.symbol, last: 95000, bid: 94999, ask: 95001, volume: 50000, changePercent24h: 2.5 } } });
    } else if (body.action === 'ohlcv') {
      const ohlcv = Array.from({ length: 100 }, (_, i) => ({
        timestamp: Date.now() - (100 - i) * 60000,
        open: 94000 + Math.random() * 2000,
        high: 95000 + Math.random() * 1000,
        low: 93000 + Math.random() * 1000,
        close: 94500 + Math.random() * 1000,
        volume: 1000 + Math.random() * 5000,
      }));
      await route.fulfill({ json: { ohlcv } });
    } else if (body.action === 'account') {
      await route.fulfill({ json: { account: { balances: [{ currency: 'USDT', total: 10000, free: 9500 }], totalUsdValue: 10000 } } });
    } else if (body.action === 'positions') {
      await route.fulfill({
        json: {
          positions: [{ symbol: 'BTC/USDT:USDT', side: 'long', size: 0.01, unrealizedPnl: 50.25, id: 'pos-1', entryPrice: 94000, liquidationPrice: 80000, leverage: 10, markPrice: 95000 }],
        },
      });
    } else if (body.action === 'open_orders') {
      await route.fulfill({ json: { orders: [] } });
    } else if (body.action === 'trades') {
      await route.fulfill({ json: { trades: [] } });
    } else if (body.action === 'symbols') {
      await route.fulfill({
        json: { symbols: ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT', 'DOGE/USDT:USDT', 'XRP/USDT:USDT'] },
      });
    } else if (body.action === 'markets') {
      await route.fulfill({
        json: {
          markets: [
            { symbol: 'BTC/USDT:USDT', maxLeverage: 100 },
            { symbol: 'ETH/USDT:USDT', maxLeverage: 100 },
            { symbol: 'SOL/USDT:USDT', maxLeverage: 75 },
          ],
        },
      });
    } else {
      await route.fulfill({ json: {} });
    }
  });

  await page.route('**/api/ai', async (route) => {
    await route.fulfill({
      headers: { 'Content-Type': 'text/event-stream' },
      body: 'data: {"type":"text","content":"Mock AI response with **bold** and `code`."}\ndata: {"type":"done","message":{"metadata":{}}}\n\n',
    });
  });

  await page.route('**/api/execute', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ headers: { 'Content-Type': 'text/event-stream' }, body: '' });
    } else {
      await route.fulfill({ json: { success: true } });
    }
  });

  await page.route('**/api/heartbeat', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ headers: { 'Content-Type': 'text/event-stream' }, body: '' });
    } else {
      const body = route.request().postDataJSON();
      if (body.action === 'status') {
        await route.fulfill({ json: { isRunning: false } });
      } else {
        await route.fulfill({ json: { success: true } });
      }
    }
  });

  await page.route('**/api/scanner', async (route) => {
    await route.fulfill({
      json: {
        results: [
          { symbol: 'PEPE/USDT:USDT', price: 0.00001234, change24h: 15.5, volumeUsdApprox: 500000, maxLeverage: 50, distFromATL: 25.3, distFromATH: 80.1, smaSignal: 'bullish_cross', volumeTrend: 45 },
          { symbol: 'FLOKI/USDT:USDT', price: 0.0001456, change24h: -3.2, volumeUsdApprox: 200000, maxLeverage: 25, distFromATL: 10.5, distFromATH: 65.3, smaSignal: 'neutral', volumeTrend: -12 },
        ],
        aiAnalysis: 'PEPE showing strong bullish momentum.',
        scanned: 200, filtered: 2, timestamp: Date.now(),
      },
    });
  });

  await page.route('**/api/webhook', async (route) => {
    await route.fulfill({ json: { success: true } });
  });

  await page.route('**/api/journal', async (route) => {
    await route.fulfill({ json: { summary: 'Mock day summary.' } });
  });

  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Connect to Phemex/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /Start Trading/i }).click();
  await page.waitForTimeout(2000);
}

// --------------------------------------------------------------------------
// Screenshot helper
// --------------------------------------------------------------------------

async function saveScreenshot(page: Page, name: string) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  📸 Saved: tests/screenshots/${name}.png`);
}

// ============================================================================
// Screenshot Capture Tests
// ============================================================================

test.describe('UI Validation Screenshots', () => {

  // --- 1. Connection Setup Screen ---

  test('01-connection-setup', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '01-connection-setup');
  });

  // --- 2. Connection Preview (after connecting) ---

  test('02-connection-preview', async ({ page }) => {
    await page.route('**/api/phemex', async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === 'check_env') {
        await route.fulfill({ json: { hasEnv: true, maskedKey: '****1234', envNetwork: 'testnet' } });
      } else if (body.action === 'connect_and_verify') {
        await route.fulfill({
          json: {
            success: true, network: 'testnet',
            account: { balances: [{ currency: 'USDT', total: 10000, free: 9500 }], totalUsdValue: 10000 },
            positionCount: 1,
            positions: [{ symbol: 'BTC/USDT:USDT', side: 'long', size: 0.01, unrealizedPnl: 50.25, id: 'pos-1', entryPrice: 94000, liquidationPrice: 80000, leverage: 10, markPrice: 95000 }],
            ticker: { symbol: 'BTC/USDT:USDT', last: 95000, changePercent24h: 2.5 },
          },
        });
      } else {
        await route.fulfill({ json: {} });
      }
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Connect to Phemex/i }).click();
    await page.waitForTimeout(3000);
    await saveScreenshot(page, '02-connection-preview');
  });

  // --- 3. Main Dashboard (full view) ---

  test('03-main-dashboard', async ({ page }) => {
    await connectAndSetup(page);
    await page.waitForTimeout(1000);
    await saveScreenshot(page, '03-main-dashboard');
  });

  // --- 4. AI Chat Panel ---

  test('04-ai-chat-panel', async ({ page }) => {
    await connectAndSetup(page);
    // AI Chat should be default tab
    await page.waitForTimeout(500);
    await saveScreenshot(page, '04-ai-chat-panel');
  });

  // --- 5. AI Chat with response ---

  test('05-ai-chat-with-response', async ({ page }) => {
    await connectAndSetup(page);
    // Send a message to get AI response
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible()) {
      await textarea.fill('Analyze BTC/USDT');
      await textarea.press('Enter');
      await page.waitForTimeout(2000);
    }
    await saveScreenshot(page, '05-ai-chat-with-response');
  });

  // --- 6. Journal Tab ---

  test('06-journal-tab', async ({ page }) => {
    await connectAndSetup(page);
    // Click Journal tab
    const journalBtn = page.getByRole('button', { name: /Journal/i }).first();
    if (await journalBtn.isVisible()) {
      await journalBtn.click();
      await page.waitForTimeout(500);
    }
    await saveScreenshot(page, '06-journal-tab');
  });

  // --- 7. Controls Panel ---

  test('07-controls-panel', async ({ page }) => {
    await connectAndSetup(page);
    const controlsBtn = page.getByRole('button', { name: /Controls/i }).first();
    if (await controlsBtn.isVisible()) {
      await controlsBtn.click();
      await page.waitForTimeout(500);
    }
    await saveScreenshot(page, '07-controls-panel');
  });

  // --- 8. Settings Panel ---

  test('08-settings-panel', async ({ page }) => {
    await connectAndSetup(page);
    const settingsBtn = page.getByRole('button', { name: 'Settings', exact: true }).first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
    }
    await saveScreenshot(page, '08-settings-panel');
  });

  // --- 9. Autopilot Settings Panel ---

  test('09-autopilot-settings', async ({ page }) => {
    await connectAndSetup(page);
    const gearBtn = page.getByTitle('Autopilot settings').first();
    if (await gearBtn.isVisible().catch(() => false)) {
      await gearBtn.click();
      await page.waitForTimeout(500);
    }
    await saveScreenshot(page, '09-autopilot-settings');
  });

  // --- 10. Strategy Page ---

  test('10-strategy-page', async ({ page }) => {
    await connectAndSetup(page);
    // Navigate to strategy page via sidebar
    const strategyBtn = page.getByRole('button', { name: /Strategy/i }).first();
    if (await strategyBtn.isVisible()) {
      await strategyBtn.click();
      await page.waitForTimeout(1000);
    }
    await saveScreenshot(page, '10-strategy-panel');
  });

  // --- 11. Strategy Page (dedicated /strategy route) ---

  test('11-strategy-page-route', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/strategy');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '11-strategy-page-route');
  });

  // --- 12. Scanner Page ---

  test('12-scanner-page', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/scanner');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '12-scanner-page');
  });

  // --- 13. Agents Page ---

  test('13-agents-page', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/agents');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '13-agents-page');
  });

  // --- 14. AI Chat Page (dedicated route) ---

  test('14-ai-chat-page', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/ai');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '14-ai-chat-page');
  });

  // --- 15. Journal Page (dedicated route) ---

  test('15-journal-page', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/journal');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '15-journal-page');
  });

  // --- 16. Controls Page ---

  test('16-controls-page', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/controls');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '16-controls-page');
  });

  // --- 17. Settings Page ---

  test('17-settings-page', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '17-settings-page');
  });

  // --- 18. Trading Page ---

  test('18-trading-page', async ({ page }) => {
    await page.route('**/api/**', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.goto('/trading');
    await page.waitForTimeout(2000);
    await saveScreenshot(page, '18-trading-page');
  });
});
