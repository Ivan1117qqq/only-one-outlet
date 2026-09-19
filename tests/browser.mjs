import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const server = await createServer({ server: { host: '127.0.0.1', port: 5183, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-01-01T00:00:00') });
  await page.goto('http://127.0.0.1:5183/?seed=42');
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10'));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/encore-start.png', fullPage: true });
  await page.locator('#primary').click();
  const seed = await page.locator('#seed-label').innerText();
  await page.clock.runFor(1100);
  assert.equal(await page.locator('.terms:visible').count(), 0);
  await page.locator('[data-action="receive"]').first().click();
  await page.clock.runFor(1000);
  const progress = await page.locator('[data-field="progress"]').first().innerText();
  await page.keyboard.press('3');
  await page.clock.runFor(1000);
  assert.match(progress, /電腦 [1-9]/);
  assert.equal(await page.locator('[data-field="work-fill"]').first().evaluate(el => el.style.width), '12.5%');
  await page.keyboard.press('1');
  await page.locator('#pause').click();
  const pausedTime = await page.locator('#timer').innerText();
  await page.clock.fastForward(5000);
  assert.equal(await page.locator('#timer').innerText(), pausedTime);
  await page.locator('#primary').click();

  async function drive(seconds, terms) {
    for (let i = 0; i < seconds; i++) {
      if (await page.locator('#overlay').isVisible()) break;
      const battery = parseInt(await page.locator('#battery').innerText()) || 0;
      const temperature = parseFloat(await page.locator('#temperature').innerText());
      await page.keyboard.press(battery < 18 ? '3' : temperature > 31 ? '2' : '1');
      if (terms) {
        for (const action of ['brief', 'extend']) {
          const buttons = page.locator(`[data-action="${action}"]:visible:enabled`);
          if (await buttons.count()) await buttons.first().click();
        }
      }
      const receives = page.locator('[data-action="receive"]:visible:enabled');
      while (await receives.count()) await receives.first().click();
      const upload = page.locator('[data-action="upload"]:visible:enabled');
      if (await upload.count()) await upload.first().click();
      const select = page.locator('[data-action="select"]:visible:enabled');
      if (!(await page.locator('.task-card.chosen [data-action="select"]:visible').count()) && await select.count()) await select.first().click();
      await page.clock.runFor(1000);
    }
  }
  await drive(100, false);
  assert.match(await page.locator('#dialog-title').innerText(), /不必照單全收/);
  assert.equal(await page.locator('.memory-list li').count(), 6);
  assert.equal(await page.locator('.memory-details').evaluate(node => node.open), false);
  await page.locator('.memory-details summary').click();
  assert.equal(await page.locator('.memory-list').isVisible(), true);
  await page.locator('.memory-details summary').click();
  await page.screenshot({ path: 'test-results/encore-memory.png', fullPage: true });
  await page.locator('#primary').click();
  assert.equal(await page.locator('#seed-label').innerText(), seed);
  assert.equal(await page.locator('#timer').innerText(), '01:40');
  assert.equal(await page.locator('#battery').innerText(), '32%');
  assert.equal(await page.locator('#score').innerText(), '0');
  assert.equal(await page.locator('#history-list li').count(), 0);
  await page.clock.runFor(1100);
  assert.match(await page.locator('[data-action="receive"]').first().innerText(), /80 分／8 秒/);
  assert.match(await page.locator('[data-action="brief"]:visible').innerText(), /55 分／5 秒/);
  await page.locator('.task-more summary').first().click();
  assert.match(await page.locator('[data-field="previous"]').first().innerText(), /上次：/);
  await page.locator('.task-more summary').first().click();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/encore-options-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.locator('[data-action="brief"]:visible').click();
  assert.match(await page.locator('[data-field="reward"]').first().innerText(), /55/);
  await page.clock.runFor(5500);
  assert.equal(await page.locator('[data-field="progress"]').first().isVisible(), false);
  assert.match(await page.locator('#phone-queue').innerText(), /待上傳 1 件 · 55 分/);
  await page.locator('[data-action="upload"]:visible').click();
  await page.clock.runFor(3100);
  assert.equal(await page.locator('#score').innerText(), '55');
  await drive(29, false);
  const extension = page.locator('[data-action="extend"]:visible');
  assert.ok(await extension.count());
  await extension.first().click();
  assert.match(await page.locator('#phone-status').innerText(), /通話中/);
  await page.screenshot({ path: 'test-results/encore-call.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'test-results/encore-mobile.png', fullPage: true });
  await page.locator('#phone-hangup').click();
  await extension.first().click();
  await page.locator('#phone-charge').click();
  await page.clock.runFor(4100);
  assert.match(await page.locator('.terms:visible').first().innerText(), /已協調延期/);
  await page.setViewportSize({ width: 1200, height: 1000 });
  await drive(100, true);
  assert.match(await page.locator('#dialog-title').innerText(), /改變了什麼/);
  assert.match(await page.locator('.results').innerText(), /第一輪/);
  assert.equal(await page.locator('.round-comparison tbody tr').count(), 6);
  assert.match(await page.locator('.round-comparison').innerText(), /重點版 · 已交件 \+55 分/);
  await page.screenshot({ path: 'test-results/encore-result.png', fullPage: true });
  console.log(await page.locator('.results').innerText());
  await page.locator('#primary').click();
  assert.match(await page.locator('#session-label').innerText(), /第 1 輪/);
  assert.equal(await page.locator('#score').innerText(), '0');
  assert.equal(await page.locator('#history-list li').count(), 0);
  await page.locator('#mute').click();
  await page.reload();
  assert.equal(await page.locator('#mute').innerText(), '音效：關');
  assert.deepEqual(errors, []);
  console.log('PASS Chrome: 完整兩輪、回覆、重點版交件、通話與掛斷、暫停、重開、手機版面、無執行錯誤');
} finally {
  await browser?.close();
  await server.close();
}
